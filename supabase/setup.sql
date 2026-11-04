-- Run once in the project's Supabase SQL Editor. Safe to run again.
-- Only the two capability-checked RPCs are public. No table grants or public reads.
begin;
create schema if not exists library_sync_private;
revoke all on schema library_sync_private from public, anon, authenticated;

create table if not exists library_sync_private.libraries (
  key_hash bytea primary key,
  revision bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists library_sync_private.marks (
  key_hash bytea not null references library_sync_private.libraries on delete cascade,
  kind text not null check (kind in ('read', 'bookmark')),
  article_id text not null check (article_id ~ '^[a-f0-9]{16}$'),
  active boolean not null,
  marked_at timestamptz not null,
  revision bigint not null,
  primary key (key_hash, kind, article_id)
);
create table if not exists library_sync_private.receipts (
  key_hash bytea not null references library_sync_private.libraries on delete cascade,
  operation_id uuid not null,
  primary key (key_hash, operation_id)
);
alter table library_sync_private.libraries enable row level security;
alter table library_sync_private.marks enable row level security;
alter table library_sync_private.receipts enable row level security;
revoke all on all tables in schema library_sync_private from public, anon, authenticated;

create or replace function public.library_sync_create(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key bytea;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid sync key' using errcode = '22023';
  end if;
  v_key := sha256(convert_to(p_token, 'UTF8'));
  -- Serialize registrations to enforce a bounded free-project footprint.
  perform pg_advisory_xact_lock(572617946);
  if not exists (select 1 from library_sync_private.libraries where key_hash = v_key)
     and (select count(*) from library_sync_private.libraries) >= 2000 then
    raise exception 'Sync capacity reached' using errcode = '54000';
  end if;
  insert into library_sync_private.libraries(key_hash) values (v_key) on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.library_sync_exchange(
  p_token text, p_since bigint default 0, p_changes jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key bytea; v_revision bigint; v_change jsonb; v_operation uuid;
  v_kind text; v_article text; v_active boolean; v_marked timestamptz;
  v_rows jsonb; v_inserted integer;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid sync key' using errcode = '22023';
  end if;
  if p_since is null or p_since < 0 or p_changes is null
     or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Invalid sync request' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 256 or octet_length(p_changes::text) > 100000 then
    raise exception 'Sync batch too large' using errcode = '22023';
  end if;
  v_key := sha256(convert_to(p_token, 'UTF8'));
  -- This lock also makes revisions reflect commit order for every linked device.
  select revision into v_revision from library_sync_private.libraries
    where key_hash = v_key for update;
  if not found then raise exception 'Unknown sync key' using errcode = '42501'; end if;
  if p_since > v_revision then
    raise exception 'Invalid sync revision' using errcode = '22023';
  end if;
  for v_change in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(v_change) <> 'object'
       or coalesce(v_change->>'kind', '') not in ('read', 'bookmark')
       or coalesce(v_change->>'id', '') !~ '^[a-f0-9]{16}$'
       or coalesce(v_change->>'op', '') !~ '^[a-f0-9-]{36}$'
       or jsonb_typeof(v_change->'active') is distinct from 'boolean'
       or jsonb_typeof(v_change->'date') is distinct from 'string' then
      raise exception 'Invalid sync change' using errcode = '22023';
    end if;
    v_operation := (v_change->>'op')::uuid;
    v_kind := v_change->>'kind'; v_article := v_change->>'id';
    v_active := (v_change->>'active')::boolean;
    v_marked := (v_change->>'date')::timestamptz;
    if not isfinite(v_marked) or v_marked < '2000-01-01'::timestamptz
       or v_marked > now() + interval '1 day' then v_marked := now(); end if;
    -- An interrupted request may have committed. Replaying it must never
    -- resurrect an old mark after another device removed it.
    insert into library_sync_private.receipts values (v_key, v_operation)
      on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then continue; end if;
    if v_revision >= 100000 then raise exception 'Sync capacity reached' using errcode = '54000'; end if;
    v_revision := v_revision + 1;
    insert into library_sync_private.marks values
      (v_key, v_kind, v_article, v_active, v_marked, v_revision)
    on conflict (key_hash, kind, article_id) do update set
      active = excluded.active, marked_at = excluded.marked_at, revision = excluded.revision;
  end loop;
  if (select count(*) from library_sync_private.marks where key_hash = v_key) > 10000 then
    raise exception 'Too many marks' using errcode = '54000';
  end if;
  update library_sync_private.libraries set revision = v_revision where key_hash = v_key;
  select coalesce(jsonb_agg(jsonb_build_array(kind, article_id, active, marked_at, revision)
    order by revision), '[]'::jsonb) into v_rows
    from library_sync_private.marks where key_hash = v_key and revision > p_since;
  return jsonb_build_object('revision', v_revision, 'rows', v_rows);
end;
$$;
revoke all on function public.library_sync_create(text) from public;
revoke all on function public.library_sync_exchange(text, bigint, jsonb) from public;
grant execute on function public.library_sync_create(text) to anon, authenticated;
grant execute on function public.library_sync_exchange(text, bigint, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;

-- Adds one private reading checkpoint per existing linked library.
-- Safe to run again; existing read/bookmark data is unchanged.
begin;
create table if not exists library_sync_private.positions (
  key_hash bytea primary key references library_sync_private.libraries on delete cascade,
  revision bigint not null,
  position jsonb not null,
  operation_id uuid not null
);
alter table library_sync_private.positions enable row level security;
revoke all on library_sync_private.positions from public, anon, authenticated;

create or replace function public.library_sync_position(p_token text, p_change jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key bytea; v_revision bigint := 0; v_position jsonb; v_operation uuid;
  v_base bigint; v_next jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid sync key' using errcode = '22023';
  end if;
  v_key := sha256(convert_to(p_token, 'UTF8'));
  perform 1 from library_sync_private.libraries where key_hash = v_key for update;
  if not found then raise exception 'Unknown sync key' using errcode = '42501'; end if;
  select revision, position, operation_id into v_revision, v_position, v_operation
    from library_sync_private.positions where key_hash = v_key;
  if not found then v_revision := 0; end if;

  if p_change is not null and p_change <> 'null'::jsonb then
    if jsonb_typeof(p_change) <> 'object' or octet_length(p_change::text) > 2048
       or coalesce(p_change->>'op', '') !~ '^[a-f0-9-]{36}$'
       or jsonb_typeof(p_change->'revision') is distinct from 'number'
       or coalesce(p_change->>'revision', '') !~ '^[0-9]{1,16}$'
       or jsonb_typeof(p_change->'position') is distinct from 'object' then
      raise exception 'Invalid reading checkpoint' using errcode = '22023';
    end if;
    v_base := (p_change->>'revision')::bigint;
    v_next := p_change->'position';
    if v_next->'version' is distinct from '1'::jsonb
       or coalesce(v_next->>'id', '') !~ '^[a-f0-9]{16}$'
       or jsonb_typeof(v_next->'id') is distinct from 'string'
       or jsonb_typeof(v_next->'anchor') is distinct from 'number'
       or coalesce(v_next->>'anchor', '') !~ '^(-1|[0-9]{1,6})$'
       or (v_next->>'anchor')::int > 100000
       or jsonb_typeof(v_next->'offset') is distinct from 'number'
       or jsonb_typeof(v_next->'progress') is distinct from 'number' then
      raise exception 'Invalid reading position' using errcode = '22023';
    end if;
    if (v_next->>'offset')::numeric not between 0 and 1
       or (v_next->>'progress')::numeric not between 0 and 1
       or v_base > 9007199254740991 then
      raise exception 'Invalid reading position' using errcode = '22023';
    end if;
    -- Compare-and-swap also makes retries idempotent without an unbounded log
    -- of scroll events. A checkpoint based on unseen old data cannot win.
    if v_base = v_revision and v_revision < 9007199254740991 then
      v_revision := v_revision + 1;
      v_operation := (p_change->>'op')::uuid;
      v_position := jsonb_build_object('version', 1, 'id', v_next->>'id',
        'anchor', (v_next->>'anchor')::int, 'offset', (v_next->>'offset')::numeric,
        'progress', (v_next->>'progress')::numeric);
      insert into library_sync_private.positions values (v_key, v_revision, v_position, v_operation)
        on conflict (key_hash) do update set revision = excluded.revision,
          position = excluded.position, operation_id = excluded.operation_id;
    end if;
  end if;
  return jsonb_build_object('revision', v_revision, 'position', v_position, 'operation', v_operation);
end;
$$;
revoke all on function public.library_sync_position(text, jsonb) from public;
grant execute on function public.library_sync_position(text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
