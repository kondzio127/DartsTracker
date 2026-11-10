const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/sqlite.cjs');
const { createDatabaseOwner, BUSY_TIMEOUT_MS } = require('../build/engine-tests/src/database/databaseOwner.js');
const { migrations } = require('../build/engine-tests/src/database/migrations.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const insert = "INSERT INTO players(id,name,created_at) VALUES (?,?,'now')";
const run = (sql, params = []) => ({ kind: 'run', sql, params });
const first = (sql, params = []) => ({ kind: 'first', sql, params });
const all = (sql, params = []) => ({ kind: 'all', sql, params });

test('concurrent initialization and queries share one fully initialized connection', { timeout: 5000 }, async t => {
  const f = fixture(t); let opens = 0; let release;
  const owner = createDatabaseOwner(async () => { opens++; await new Promise(resolve => { release = resolve; }); return f.open(); });
  const tasks = [owner.initialize(), owner.initialize(), owner.query(first('PRAGMA user_version'))];
  await tick();
  assert.equal(opens, 1); release();
  const results = await Promise.all(tasks);
  assert.equal(results[2].user_version, 1);
  await owner.initialize();
  assert.equal(opens, 1);
  assert.equal((await owner.query(first('PRAGMA foreign_keys'))).foreign_keys, 1);
  assert.equal((await owner.query(first('PRAGMA journal_mode'))).journal_mode, 'wal');
  assert.equal((await owner.query(first('PRAGMA busy_timeout'))).timeout, BUSY_TIMEOUT_MS);
});

test('reopening preserves rows, schema and IDs without rerunning migration 001', { timeout: 5000 }, async t => {
  const f = fixture(t);
  const owner = createDatabaseOwner(async () => f.open());
  await owner.transaction([run(insert, ['a', 'Alice'])]);
  await f.connections[0].closeAsync();
  const reopened = createDatabaseOwner(async () => f.open());
  await reopened.initialize();
  assert.equal((await reopened.query(first('SELECT name FROM players WHERE id=?', ['a']))).name, 'Alice');
  assert.equal((await reopened.query(first('PRAGMA user_version'))).user_version, 1);
});

test('legacy query/transaction callbacks and callback batch elements fail synchronously before queueing', { timeout: 5000 }, async t => {
  const f = fixture(t); let opens = 0; let invoked = false;
  const owner = createDatabaseOwner(async () => { opens++; return f.open(); });
  const callback = async () => { invoked = true; await owner.query(first('SELECT 1')); };
  assert.throws(() => owner.query(callback), /callbacks are not supported/);
  assert.throws(() => owner.transaction(callback), /callbacks are not supported/);
  assert.throws(() => owner.transaction([run(insert, ['a','A']), callback]), /callbacks are not supported/);
  assert.equal(opens, 0);
  assert.equal(invoked, false);
  assert.equal((await owner.query(first('SELECT 1 AS value'))).value, 1);
});

test('independent concurrent queries serialize while legacy callbacks still fail immediately', { timeout: 5000 }, async t => {
  const f = fixture(t); const db = f.open(); const get = db.getFirstAsync;
  let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const events = [];
  db.getFirstAsync = async (sql, params) => {
    if (sql === 'SELECT ? AS value') {
      events.push(params[0]);
      if (params[0] === 1) { entered(); await hold; }
    }
    return get(sql, params);
  };
  const owner = createDatabaseOwner(async () => db);
  await owner.initialize();
  const a = owner.query(first('SELECT ? AS value', [1]));
  await started;
  const b = owner.query(first('SELECT ? AS value', [2]));
  const c = owner.query(first('SELECT ? AS value', [3]));
  assert.throws(() => owner.query(async () => owner.query(first('SELECT 1'))), /callbacks/);
  assert.throws(() => owner.transaction(async () => owner.transaction([])), /callbacks/);
  await tick(); assert.deepEqual(events, [1]);
  release();
  assert.deepEqual((await Promise.all([a,b,c])).map(row => row.value), [1,2,3]);
  assert.deepEqual(events, [1,2,3]);
});

test('transaction statements run in order and return run, first and all results by index', { timeout: 5000 }, async t => {
  const f = fixture(t); const owner = createDatabaseOwner(async () => f.open());
  const results = await owner.transaction([
    run(insert, ['a', 'Before']),
    run('UPDATE players SET name=? WHERE id=?', ['After', 'a']),
    first('SELECT name FROM players WHERE id=?', ['a']),
    all('SELECT id,name FROM players ORDER BY id'),
  ]);
  assert.equal(results[0].changes, 1);
  assert.equal(typeof results[0].lastInsertRowId, 'number');
  assert.equal(results[1].changes, 1);
  assert.equal(results[2].name, 'After');
  assert.deepEqual(results[3].map(row => row.id), ['a']);
  assert.equal(await owner.query(first('SELECT * FROM players WHERE id=?', ['missing'])), null);
  assert.deepEqual(await owner.transaction([]), []);
});

test('failed batch rolls back every write and releases the queue for later requests', { timeout: 5000 }, async t => {
  const f = fixture(t); const owner = createDatabaseOwner(async () => f.open());
  await assert.rejects(owner.transaction([
    run(insert, ['a','A']), run(insert, ['b','B']),
    run("INSERT INTO x01_match_players VALUES ('missing','a',0)"),
  ]), /FOREIGN KEY/);
  assert.equal((await owner.query(all('SELECT * FROM players'))).length, 0);
  await owner.query(run(insert, ['c','C']));
  assert.equal((await owner.query(all('SELECT * FROM players'))).length, 1);
});

test('concurrent query never executes inside another request batch transaction', { timeout: 5000 }, async t => {
  const f = fixture(t); const db = f.open(); const execute = db.runAsync; const get = db.getAllAsync;
  let entered; let release;
  const started = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  let readStarted = false;
  db.runAsync = async (sql, params) => {
    const result = await execute(sql, params);
    if (sql === insert && params[0] === 'a') { entered(); await hold; }
    return result;
  };
  db.getAllAsync = async (sql, params) => {
    if (sql === 'SELECT * FROM players') {
      readStarted = true;
      assert.equal(db.native.isTransaction, false, 'query must start after COMMIT');
    }
    return get(sql, params);
  };
  const owner = createDatabaseOwner(async () => db);
  const batch = owner.transaction([run(insert, ['a','A']), run(insert, ['b','B'])]);
  await started;
  const read = owner.query(all('SELECT * FROM players'));
  const next = owner.transaction([run(insert, ['c','C'])]);
  await tick(); assert.equal(readStarted, false);
  release(); await batch;
  assert.equal((await read).length, 2);
  await next;
  assert.equal((await owner.query(all('SELECT * FROM players'))).length, 3);
});

test('binding preserves quoted text, numbers, null and blobs; queued inputs are snapshotted', { timeout: 5000 }, async t => {
  const f = fixture(t); const db = f.open(); const get = db.getFirstAsync;
  let entered; let release;
  const started = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  db.getFirstAsync = async (sql, params) => {
    if (sql === 'SELECT 1 AS hold') { entered(); await hold; }
    return get(sql, params);
  };
  const owner = createDatabaseOwner(async () => db);
  const held = owner.query(first('SELECT 1 AS hold'));
  await started;
  const name = "O'Reilly; DROP TABLE players; --";
  const request = run(insert, ['a', name]);
  const requests = [request];
  const batch = owner.transaction(requests);
  request.params[1] = 'changed'; request.sql = 'INVALID'; requests.length = 0;
  const blob = new Uint8Array([1,2,3]);
  const values = owner.query(first('SELECT ? AS text, ? AS n, ? AS absent, ? AS bytes', [name, 42, null, blob]));
  blob[0] = 99;
  release(); await held; await batch;
  assert.equal((await owner.query(first('SELECT name FROM players WHERE id=?', ['a']))).name, name);
  const row = await values;
  assert.equal(row.text, name); assert.equal(row.n, 42); assert.equal(row.absent, null);
  assert.deepEqual(Array.from(row.bytes), [1,2,3]);
});

test('invalid requests reject before opening or starting a transaction', { timeout: 5000 }, async t => {
  const f = fixture(t); let opens = 0;
  const owner = createDatabaseOwner(async () => { opens++; return f.open(); });
  for (const request of [null, {}, {kind:'bad',sql:'SELECT 1'}, first(''), first('SELECT ?', [undefined]), first('SELECT ?', [NaN])]) {
    assert.throws(() => owner.query(request), TypeError);
  }
  assert.throws(() => owner.transaction({}), /array/);
  assert.throws(() => owner.transaction([first('SELECT 1'), null]), TypeError);
  assert.equal(opens, 0);
});

test('newer database is rejected before configuration, with data and version untouched', { timeout: 5000 }, async t => {
  const f = fixture(t); const seed = f.open();
  await seed.execAsync("CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES ('keep'); PRAGMA user_version=99;");
  await seed.closeAsync();
  const owner = createDatabaseOwner(async () => {
    const db = f.open(); const exec = db.execAsync;
    db.execAsync = async sql => { assert.fail('Unsupported database must not execute configuration or migration SQL: ' + sql); return exec(sql); };
    return db;
  });
  await assert.rejects(owner.initialize(), /newer/);
  assert.equal(f.connections[1].closed, true);
  const verify = f.open();
  assert.equal((await verify.getFirstAsync('PRAGMA user_version')).user_version, 99);
  assert.equal((await verify.getFirstAsync('SELECT value FROM future_data')).value, 'keep');
});

test('open failure can be retried without a poisoned initialization promise', { timeout: 5000 }, async t => {
  const f = fixture(t); let attempts = 0;
  const owner = createDatabaseOwner(async () => { if (++attempts === 1) throw new Error('open failed'); return f.open(); });
  await assert.rejects(owner.initialize(), /open failed/);
  await owner.initialize(); assert.equal(attempts, 2);
});

test('migration failure closes connection and retry retains database file', { timeout: 5000 }, async t => {
  const f = fixture(t); let attempts = 0;
  const owner = createDatabaseOwner(async () => {
    const db = f.open();
    if (++attempts === 1) {
      const exec = db.execAsync;
      db.execAsync = async sql => { await exec(sql); if (sql === migrations[0].sql) throw new Error('simulated migration failure'); };
    }
    return db;
  });
  await assert.rejects(owner.initialize(), /simulated/);
  assert.equal(f.connections[0].closed, true);
  await owner.initialize();
  assert.equal(attempts, 2);
  assert.equal((await owner.query({ kind: 'first', sql: 'PRAGMA user_version' })).user_version, 1);
});

test('initialization verifies connection settings rather than assuming PRAGMA success', { timeout: 5000 }, async t => {
  for (const [pragma, value, message] of [
    ['PRAGMA foreign_keys', { foreign_keys: 0 }, /foreign keys/],
    ['PRAGMA busy_timeout', { timeout: 0 }, /busy timeout/],
    ['PRAGMA journal_mode = WAL', { journal_mode: 'delete' }, /WAL/],
  ]) {
    const f = fixture(t);
    const owner = createDatabaseOwner(async () => {
      const db = f.open(); const get = db.getFirstAsync;
      db.getFirstAsync = (sql, params) => sql === pragma ? Promise.resolve(value) : get(sql, params);
      return db;
    });
    await assert.rejects(owner.initialize(), message);
    assert.equal(f.connections[0].closed, true);
  }
});

test('production Expo adapter is lazy and uses the SDK 54 open options (not a native test)', { timeout: 5000 }, async t => {
  const Module = require('node:module'); const originalLoad = Module._load;
  const f = fixture(t); let opens = 0;
  try {
    Module._load = function(id, ...args) {
      if (id === 'expo-sqlite') return { openDatabaseAsync: async (name, options) => {
        opens++; assert.equal(name, 'darts-tracker.db'); assert.deepEqual(options, { useNewConnection: true }); return f.open();
      } };
      if (id === 'react-native') return { Platform: { OS: 'android' } };
      return originalLoad.call(this, id, ...args);
    };
    const api = require('../build/engine-tests/src/database/database.js');
    assert.equal(opens, 0);
    await Promise.all([api.initializeDatabase(), api.initializeDatabase()]);
    assert.equal(opens, 1);
    assert.equal((await api.queryDatabase({ kind: 'first', sql: 'PRAGMA foreign_keys' })).foreign_keys, 1);
    await api.withDatabaseTransaction([{ kind: 'run', sql: insert, params: ['a','A'] }]);
  } finally { Module._load = originalLoad; }
});
