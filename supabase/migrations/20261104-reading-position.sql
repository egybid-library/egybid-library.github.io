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
