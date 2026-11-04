// No accounts: a 256-bit capability links a reader's devices. Never send it in a URL.
export const syncPrefix = 'egybid:sync:v1:';
export const validToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
const validId = id => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id);
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validKind = kind => kind === 'read' || kind === 'bookmark';
const emptyCloud = token => ({token, revision: 0, items: {read: {}, bookmark: {}}});

export function parseSyncToken(value) {
  const input = String(value).trim();
  if (validToken(input)) return input;
  try {const url = new URL(input); const token = new URLSearchParams(url.hash.slice(1)).get('sync'); return validToken(token) ? token : null;} catch {return null;}
}
export function newSyncToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export class ReaderSync {
  constructor({storage, transport, snapshot, apply, onStatus = () => {}, lock = task => task(), uuid = () => crypto.randomUUID(), now = () => new Date().toISOString()}) {
    Object.assign(this, {storage, transport, snapshot, apply, onStatus, lock, uuid, now});
    this.running = null; this.lastError = null;
  }
  read(key, fallback) {const raw = this.storage.getItem(syncPrefix + key); return raw === null ? fallback : JSON.parse(raw);}
  write(key, value) {this.storage.setItem(syncPrefix + key, JSON.stringify(value));}
  token() {const token = this.read('connection', null)?.token; return validToken(token) ? token : null;}
  cloud(token) {
    const cloud = this.read('cloud', null);
    if (!cloud || cloud.token !== token) return emptyCloud(token);
    if (!Number.isSafeInteger(cloud.revision) || cloud.revision < 0 || !cloud.items?.read || !cloud.items?.bookmark) throw Error('storage');
    return cloud;
  }
  pending(token) {
    const prefix = syncPrefix + 'pending:' + token + ':';
    const result = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i); if (!key?.startsWith(prefix)) continue;
      const item = JSON.parse(this.storage.getItem(key));
      if (!item || !validKind(item.kind) || !validId(item.id) || typeof item.active !== 'boolean' || !validDate(item.date) || !/^[a-f0-9-]{36}$/.test(item.op)) throw Error('storage');
      result.push(item);
    }
    return result;
  }
  pendingKey(token, change) {return syncPrefix + 'pending:' + token + ':' + change.kind + ':' + change.id;}
  queue(token, kind, id, active, date) {
    if (!validKind(kind) || !validId(id) || typeof active !== 'boolean' || !validDate(date)) throw Error('change');
    const change = {kind, id, active, date, op: this.uuid()};
    this.storage.setItem(this.pendingKey(token, change), JSON.stringify(change));
  }
  capture(kind, id, active, date) {
    const token = this.token(); if (!token) return;
    this.queue(token, kind, id, active, date || this.now());
    this.onStatus({phase: 'pending'});
  }
  materialize(token) {
    if (this.token() !== token) return;
    const cloud = this.cloud(token), result = {read: {}, bookmark: {}};
    for (const kind of ['read', 'bookmark']) for (const [id, mark] of Object.entries(cloud.items[kind])) {
      if (validId(id) && Array.isArray(mark) && mark[0] === true && validDate(mark[1])) result[kind][id] = mark[1];
    }
    // Edits made while a request was in flight always overlay its reply.
    for (const item of this.pending(token)) item.active ? result[item.kind][item.id] = item.date : delete result[item.kind][item.id];
    this.apply(result);
  }
  response(result, previous) {
    if (!result || !Number.isSafeInteger(result.revision) || result.revision < previous.revision || !Array.isArray(result.rows) || result.rows.length > 10000) throw Error('response');
    const cloud = structuredClone(previous);
    for (const row of result.rows) {
      if (!Array.isArray(row) || !validKind(row[0]) || !validId(row[1]) || typeof row[2] !== 'boolean' || !validDate(row[3]) || !Number.isSafeInteger(row[4]) || row[4] <= previous.revision || row[4] > result.revision) throw Error('response');
      cloud.items[row[0]][row[1]] = [row[2], new Date(row[3]).toISOString()];
    }
    cloud.revision = result.revision;
    return cloud;
  }
  async connect(token, create = false) {
    if (!validToken(token)) throw Error('token');
    if (this.token()) throw Error('already-linked');
    const local = this.snapshot();
    if (create) await this.transport('library_sync_create', {p_token: token});
    const result = await this.transport('library_sync_exchange', {p_token: token, p_since: 0, p_changes: []});
    const cloud = this.response(result, emptyCloud(token));
    // A first link merges both devices' existing positive marks. Subsequent
    // removals are tombstones and propagate normally, including after offline use.
    const queued = [];
    try {
      for (const kind of ['read', 'bookmark']) for (const [id, date] of Object.entries(local[kind])) {
        if (validId(id) && validDate(date) && !cloud.items[kind][id]?.[0]) {
          this.queue(token, kind, id, true, date); queued.push({kind, id});
        }
      }
      this.write('cloud', cloud);
      this.write('connection', {token});
    } catch (error) {
      for (const item of queued) this.storage.removeItem(this.pendingKey(token, item));
      throw error;
    }
    this.materialize(token);
    if (this.running) await this.running.catch(() => {});
    return this.sync();
  }
  async sync() {
    if (this.running) return this.running;
    this.running = this.lock(async () => {
      const token = this.token(); if (!token) return;
      this.onStatus({phase: 'syncing'});
      try {
        for (let round = 0; round < 40; round++) {
          if (this.token() !== token) return;
          const cloud = this.cloud(token), batch = this.pending(token).slice(0, 256);
          const result = await this.transport('library_sync_exchange', {p_token: token, p_since: cloud.revision, p_changes: batch});
          if (this.token() !== token) return;
          const next = this.response(result, cloud);
          // Save the checkpoint before acknowledging the durable journal.
          this.write('cloud', next);
          for (const item of batch) {
            const key = this.pendingKey(token, item), raw = this.storage.getItem(key);
            if (raw && JSON.parse(raw).op === item.op) this.storage.removeItem(key);
          }
          this.materialize(token);
          if (!this.pending(token).length) break;
        }
        const lastSync = this.now(); this.write('last', {token, date: lastSync}); this.lastError = null;
        this.onStatus({phase: this.pending(token).length ? 'pending' : 'ready', date: lastSync});
      } catch (error) {this.lastError = error; this.onStatus({phase: 'error', error}); throw error;}
    }).finally(() => {this.running = null;});
    return this.running;
  }
  disconnect() {
    const token = this.token();
    // Keep the latest visible read/bookmark lists on this device.
    this.storage.removeItem(syncPrefix + 'connection');
    this.storage.removeItem(syncPrefix + 'cloud'); this.storage.removeItem(syncPrefix + 'last');
    for (const item of token ? this.pending(token) : []) this.storage.removeItem(this.pendingKey(token, item));
    this.onStatus({phase: 'disconnected'});
  }
}

export const validPosition = value => value?.version === 1 && validId(value.id) && Number.isInteger(value.anchor) && value.anchor >= -1 && value.anchor <= 100000 && Number.isFinite(value.offset) && value.offset >= 0 && value.offset <= 1 && Number.isFinite(value.progress) && value.progress >= 0 && value.progress <= 1;
const cleanPosition = value => ({version: 1, id: value.id, anchor: value.anchor, offset: value.offset, progress: value.progress});

// A single checkpoint per linked library. Revision checks keep an old offline
// device from overwriting reading that it has never seen on another device.
export class PositionSync {
  constructor({reader, position, uuid = () => crypto.randomUUID()}) {Object.assign(this, {reader, position, uuid});}
  cloud(token) {
    const saved = this.reader.read('position-cloud', null);
    if (saved?.token !== token) return {token, revision: 0, position: null};
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 0 || (saved.position !== null && !validPosition(saved.position))) throw Error('storage');
    return saved;
  }
  pendingKey(token) {return 'position-pending:' + token;}
  pending(token) {
    const value = this.reader.read(this.pendingKey(token), null);
    if (value !== null && (!validPosition(value.position) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !/^[a-f0-9-]{36}$/.test(value.op))) throw Error('storage');
    return value;
  }
  capture() {
    const token = this.reader.token(), position = this.position.get();
    if (!token || !validPosition(position)) return;
    const pending = this.pending(token), cloud = this.cloud(token);
    if (JSON.stringify(pending?.position ?? cloud.position) === JSON.stringify(position)) return;
    this.reader.write(this.pendingKey(token), {op: this.uuid(), revision: pending?.revision ?? cloud.revision, position: cleanPosition(position)});
  }
  async sync() {
    const token = this.reader.token(); if (!token) return;
    const cloud = this.cloud(token), pending = this.pending(token);
    const result = await this.reader.transport('library_sync_position', {p_token: token, p_change: pending});
    if (this.reader.token() !== token) return;
    if (!result || !Number.isSafeInteger(result.revision) || result.revision < cloud.revision || (result.position !== null && !validPosition(result.position)) || (result.operation !== null && !/^[a-f0-9-]{36}$/.test(result.operation))) throw Error('response');
    // Browsers without Web Locks can receive replies in the opposite order.
    if (this.cloud(token).revision > result.revision) return;
    const next = {token, revision: result.revision, position: result.position === null ? null : cleanPosition(result.position)};
    this.reader.write('position-cloud', next);
    const current = this.pending(token);
    if (pending && current?.op === pending.op) this.reader.storage.removeItem(syncPrefix + this.pendingKey(token));
    else if (pending && current && result.operation === pending.op) {
      // A new scroll happened during the request: it follows our acknowledged
      // checkpoint, rather than conflicting with our own previous request.
      this.reader.write(this.pendingKey(token), {...current, revision: result.revision});
    }
    if (this.pending(token)) return;
    if (next.position) this.position.applySync(next.position);
    else if (this.position.get()) this.capture(); // Seed legacy device positions only when cloud is empty.
  }
  disconnect(token) {
    this.reader.storage.removeItem(syncPrefix + 'position-cloud');
    if (token) this.reader.storage.removeItem(syncPrefix + this.pendingKey(token));
  }
}
