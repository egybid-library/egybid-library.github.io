import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {ReaderSync, PositionSync, newSyncToken, parseSyncToken, syncPrefix} from '../docs/sync-core.js';

const db = new PGlite();
await db.exec('create role anon; create role authenticated;');
const sql = fs.readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
await db.exec(sql); await db.exec(sql); // Re-running setup must preserve readers.
const rpc = async (name, args) => {
  await db.exec('set role anon');
  try {
    const query = name === 'library_sync_create' ? 'select public.library_sync_create($1) as data' : name === 'library_sync_position' ? 'select public.library_sync_position($1, $2::jsonb) as data' : 'select public.library_sync_exchange($1, $2, $3::jsonb) as data';
    const params = name === 'library_sync_create' ? [args.p_token] : name === 'library_sync_position' ? [args.p_token, JSON.stringify(args.p_change)] : [args.p_token, args.p_since, JSON.stringify(args.p_changes)];
    return (await db.query(query, params)).rows[0].data;
  } finally {await db.exec('reset role');}
};
const token = newSyncToken(), other = newSyncToken(), date = new Date().toISOString();
assert.equal(token.length, 43); assert.notEqual(token, other);
assert.equal(parseSyncToken('https://library.test/#sync=' + token), token);
assert.equal(parseSyncToken(' ' + token + ' '), token);
assert.equal(parseSyncToken('<script>alert(1)</script>'), null);
assert.equal(parseSyncToken('https://library.test/?sync=' + token), null);
await assert.rejects(rpc('library_sync_create', {p_token: ''}));
await assert.rejects(rpc('library_sync_exchange', {p_token: other, p_since: 0, p_changes: []}));
await rpc('library_sync_create', {p_token: token});
await rpc('library_sync_create', {p_token: token});
await rpc('library_sync_create', {p_token: other});
const id = '0123456789abcdef', id2 = 'aaaaaaaaaaaaaaaa', id3 = 'bbbbbbbbbbbbbbbb';
const op = (article = id, active = true, kind = 'read') => ({kind, id: article, active, date, op: randomUUID()});
const push = (changes, since = 0, key = token) => rpc('library_sync_exchange', {p_token: key, p_since: since, p_changes: changes});
const first = op(); let response = await push([first]);
assert.equal(response.rows[0][2], true); assert.equal(response.revision, 1);
await push([op(id, false)]);
response = await push([first]); assert.equal(response.revision, 2); assert.equal(response.rows[0][2], false, 'A retry cannot resurrect a removed mark');
assert.deepEqual((await push([], 2)).rows, []);
assert.deepEqual((await push([], 0, other)).rows, [], 'Readers are isolated');
await assert.rejects(push([op(id2), {...op(id3), id: 'invalid'}]));
assert.equal((await push([])).revision, 2, 'Invalid batches roll back all changes');
await assert.rejects(push([{...op(), active: 'false'}]));
await assert.rejects(push(Array.from({length: 257}, () => op())));
await assert.rejects(push([], 999));
await db.exec('set role anon');
for (const table of ['libraries', 'marks', 'receipts', 'positions']) await assert.rejects(db.query('select * from library_sync_private.' + table));
await db.exec('reset role');
assert.equal((await db.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='library_sync_private' and c.relkind='r' and c.relrowsecurity")).rows[0].n, 4);
assert.equal((await db.query('select encode(key_hash,\'hex\') as key from library_sync_private.libraries')).rows.some(row => row.key.includes(token)), false);

class Storage {
  constructor() {this.data = new Map();}
  get length() {return this.data.size;}
  key(i) {return [...this.data.keys()][i] ?? null;}
  getItem(k) {return this.data.get(k) ?? null;}
  setItem(k, v) {this.data.set(k, String(v));}
  removeItem(k) {this.data.delete(k);}
}
const make = (storage = new Storage(), initial = {read: {}, bookmark: {}}, transport = rpc) => {
  const device = {storage, visible: structuredClone(initial), statuses: []};
  device.engine = new ReaderSync({storage, transport, uuid: randomUUID, snapshot: () => structuredClone(device.visible), apply: marks => {device.visible = marks;}, onStatus: status => device.statuses.push(status.phase)});
  device.edit = (kind, article, active) => {active ? device.visible[kind][article] = date : delete device.visible[kind][article]; device.engine.capture(kind, article, active, date);};
  return device;
};
const key = newSyncToken(), a = make(undefined, {read: {[id]: date}, bookmark: {}});
await a.engine.connect(key, true); assert.equal(a.visible.read[id], date);
const b = make(undefined, {read: {[id2]: date}, bookmark: {[id3]: date}});
await b.engine.connect(key); await a.engine.sync();
assert.deepEqual(Object.keys(a.visible.read).sort(), [id, id2].sort());
assert.deepEqual(Object.keys(a.visible.bookmark), [id3]);
a.edit('read', id, false); a.edit('bookmark', id2, true); await a.engine.sync(); await b.engine.sync();
assert.equal(b.visible.read[id], undefined); assert.ok(b.visible.bookmark[id2]);
// Offline edits are durable; a fresh page can retry them.
b.engine.transport = async () => {throw Error('offline');};
b.edit('bookmark', id3, false); await assert.rejects(b.engine.sync());
const reloaded = make(b.storage, b.visible); await reloaded.engine.sync(); await a.engine.sync();
assert.equal(a.visible.bookmark[id3], undefined);
// Connection loss AFTER server commit plus another device's edit.
a.edit('read', id2, false);
a.engine.transport = async (name, args) => {await rpc(name, args); throw Error('reply lost');};
await assert.rejects(a.engine.sync());
reloaded.edit('read', id2, true); await reloaded.engine.sync();
a.engine.transport = rpc; await a.engine.sync(); assert.ok(a.visible.read[id2], 'Lost-reply retry cannot overwrite a newer accepted operation');
// A toggle during an in-flight request survives acknowledgment of its predecessor.
a.edit('read', id, true); let release, captured;
a.engine.transport = async (name, args) => {captured = args; await new Promise(resolve => release = resolve); return rpc(name, args);};
const inFlight = a.engine.sync(); await Promise.resolve();
a.edit('read', id, false); assert.equal(captured.p_changes.find(c => c.id === id).active, true);
a.engine.transport = rpc; release(); await inFlight;
await reloaded.engine.sync(); assert.equal(reloaded.visible.read[id], undefined);
// Device clocks do not determine merge order: the last accepted operation wins.
await push([{...op(id), date: '9999-01-01T00:00:00Z'}], 0, key);
assert.ok(Date.parse((await push([], 0, key)).rows.find(r => r[1] === id && r[0] === 'read')[3]) < Date.now() + 60000);
reloaded.edit('read', id, false); await reloaded.engine.sync(); await a.engine.sync(); assert.equal(a.visible.read[id], undefined);
// Disconnecting keeps the current visible lists and leaves other devices working.
const before = structuredClone(a.visible); a.engine.disconnect(); assert.deepEqual(a.visible, before); assert.equal(a.engine.token(), null);
await reloaded.engine.sync(); assert.ok(reloaded.engine.token());
// Storage failure prevents connecting and does not clear local marks.
const full = make(undefined, {read: {[id]: date}, bookmark: {}});
full.storage.setItem = () => {throw Error('full');};
await assert.rejects(full.engine.connect(newSyncToken(), true)); assert.equal(full.visible.read[id], date); assert.equal(full.engine.token(), null);
// Cross-tab acknowledgment must not remove a newly queued operation.
const shared = make(reloaded.storage, reloaded.visible); shared.edit('bookmark', id3, true);
await shared.engine.sync(); await reloaded.engine.sync(); assert.ok(reloaded.visible.bookmark[id3]);
// Invalid remote data never replaces a valid local checkpoint.
const savedCloud = shared.storage.getItem(syncPrefix + 'cloud');
shared.engine.transport = async () => ({revision: 999, rows: [['read', '<script>', true, date, 999]]});
await assert.rejects(shared.engine.sync()); assert.equal(shared.storage.getItem(syncPrefix + 'cloud'), savedCloud);
// Real state stores update controls/subscribers without emitting local toggles.
for (const [file, global] of [['reading-state.js', 'ReadingProgress'], ['bookmarks.js', 'ArticleBookmarks']]) {
  const storage = new Storage(), nodes = {createElement: () => ({setAttribute() {}}), body: {append() {}}, querySelectorAll: () => [], addEventListener() {}};
  const context = {window: {addEventListener() {}}, document: nodes, localStorage: storage, Date, Set, Object, JSON, Number, Error};
  vm.runInNewContext(fs.readFileSync(new URL('../docs/' + file, import.meta.url), 'utf8'), context);
  const api = context.window[global], events = []; api.subscribe(event => events.push(event.type));
  api.toggle(id); api.applySync({[id2]: date}); assert.equal(api.has(id), false); assert.equal(api.has(id2), true);
  api.applySync({[id2]: date}); assert.deepEqual(events, ['toggle', 'sync']);
}
// Reading position: real RPCs between independent device stores, without marks.
function attachPosition(device, value = null) {
  const slot = 'test:position';
  if (value) device.storage.setItem(slot, JSON.stringify(value));
  device.position = {get: () => JSON.parse(device.storage.getItem(slot)), applySync: next => device.storage.setItem(slot, JSON.stringify(next))};
  device.positions = new PositionSync({reader: device.engine, position: device.position, uuid: randomUUID});
  device.scroll = next => {device.storage.setItem(slot, JSON.stringify(next)); device.positions.capture();};
  device.positionRound = async () => {await device.positions.sync(); if (device.positions.pending(device.engine.token())) await device.positions.sync();};
  return device;
}
const at = (article = id, anchor = 6) => ({version: 1, id: article, anchor, offset: 0.25, progress: 0.4});
const positionKey = newSyncToken(), desktop = attachPosition(make(), at());
await desktop.engine.connect(positionKey, true); await desktop.positionRound();
const phone = attachPosition(make(), at(id3, 2));
await phone.engine.connect(positionKey); await phone.positionRound();
assert.deepEqual(phone.position.get(), at(), 'Joining device receives cloud checkpoint rather than replacing it with old local reading');
phone.scroll(at(id2, 12)); await phone.positionRound(); await desktop.positionRound();
assert.deepEqual(desktop.position.get(), at(id2, 12), 'Article and paragraph synchronize back to desktop');
assert.deepEqual(desktop.visible, {read: {}, bookmark: {}}, 'Continuing does not mark articles read or saved');
// Offline queue survives reload. If cloud is unchanged it uploads normally.
phone.scroll(at(id2, 13)); phone.engine.transport = async () => {throw Error('offline');};
await assert.rejects(phone.positions.sync());
const phoneReload = attachPosition(make(phone.storage));
await phoneReload.positionRound(); await desktop.positionRound(); assert.equal(desktop.position.get().anchor, 13);
// A stale offline queue cannot erase newer unseen reading from another device.
phoneReload.scroll(at(id2, 14));
desktop.scroll(at(id3, 20)); await desktop.positionRound(); await phoneReload.positionRound();
assert.deepEqual(phoneReload.position.get(), at(id3, 20));
// Lost reply and retry after newer reading stays idempotent.
desktop.scroll(at(id3, 21)); desktop.engine.transport = async (name, args) => {await rpc(name, args); throw Error('lost reply');};
await assert.rejects(desktop.positions.sync()); await phoneReload.positionRound();
phoneReload.scroll(at(id3, 22)); await phoneReload.positionRound();
desktop.engine.transport = rpc; await desktop.positionRound(); assert.equal(desktop.position.get().anchor, 22);
// A new scroll while a request is in flight follows our own accepted checkpoint.
desktop.scroll(at(id3, 23)); let releasePosition;
desktop.engine.transport = async (name, args) => {await new Promise(resolve => releasePosition = resolve); return rpc(name, args);};
const positionFlight = desktop.positions.sync(); await Promise.resolve(); desktop.scroll(at(id3, 24));
desktop.engine.transport = rpc; releasePosition(); await positionFlight; await desktop.positionRound();
await phoneReload.positionRound(); assert.equal(phoneReload.position.get().anchor, 24);
const isolated = attachPosition(make()); await isolated.engine.connect(newSyncToken(), true); await isolated.positionRound();
assert.equal(isolated.position.get(), null);
const positionCloud = desktop.storage.getItem(syncPrefix + 'position-cloud');
desktop.engine.transport = async () => ({revision: 999, operation: null, position: {...at(), offset: 2}});
await assert.rejects(desktop.positions.sync()); assert.equal(desktop.storage.getItem(syncPrefix + 'position-cloud'), positionCloud);
const checkpoint = await rpc('library_sync_position', {p_token: positionKey, p_change: null});
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261104-reading-position.sql', import.meta.url), 'utf8'));
assert.deepEqual(await rpc('library_sync_position', {p_token: positionKey, p_change: null}), checkpoint, 'Running the additive migration again preserves existing checkpoints');
for (const bad of [{...at(), anchor: -2}, {...at(), offset: 2}, {...at(), progress: -0.5}, {...at(), id: '<script>'}, {...at(), anchor: '6'}]) {
  await assert.rejects(rpc('library_sync_position', {p_token: positionKey, p_change: {op: randomUUID(), revision: checkpoint.revision, position: bad}}));
}
await assert.rejects(rpc('library_sync_position', {p_token: newSyncToken(), p_change: null}));
const savedPosition = phoneReload.position.get(); phoneReload.positions.disconnect(positionKey); phoneReload.engine.disconnect();
assert.deepEqual(phoneReload.position.get(), savedPosition); assert.equal(phoneReload.storage.getItem(syncPrefix + 'position-cloud'), null);
// Browser position store: old local checkpoints migrate intact, only local changes queue.
{
  const storage = new Storage(), handlers = {}, events = [];
  storage.setItem('egyptian-industrial-library:last-reading:v1', JSON.stringify(at()));
  const context = {window: {addEventListener: (name, listener) => handlers[name] = listener}, localStorage: storage, Set, JSON, Number, Error};
  vm.runInNewContext(fs.readFileSync(new URL('../docs/reading-position.js', import.meta.url), 'utf8'), context);
  const api = context.window.ReadingPosition; api.subscribe(change => events.push(change.type));
  assert.equal(api.get().anchor, 6); api.remember(at()); assert.equal(events.length, 0);
  api.remember(at(id2, 10)); api.applySync(at(id3, 20));
  assert.deepEqual(events, ['local', 'sync']); assert.equal(api.get().anchor, 20);
  assert.throws(() => api.remember({...at(), offset: Infinity})); assert.equal(api.get().anchor, 20);
}
await db.close();
console.log('Sync passed: real PostgreSQL RPCs, private tables, isolation, read/bookmark merge and removals, cross-device article/paragraph positions, durable offline edits, stale-device conflicts, idempotent lost-reply retry, in-flight scrolls, migration preservation, storage failure, and disconnect.');
