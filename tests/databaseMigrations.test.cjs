const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/sqlite.cjs');
const { migrations, migrateDatabase, readSchemaVersion } = require('../build/engine-tests/src/database/migrations.js');
const { createDatabaseOwner } = require('../build/engine-tests/src/database/databaseOwner.js');
const player = "INSERT INTO players(id,name,created_at) VALUES (?, ?, 'now')";
const match = "INSERT INTO x01_matches(id,start_score,status,created_at) VALUES (?,501,'IN_PROGRESS','now')";

async function initialized(t) {
  const f = fixture(t);
  const owner = createDatabaseOwner(async () => f.open());
  await owner.initialize();
  return { ...f, owner };
}

test('migration 001 creates exactly three tables and required indexes', { timeout: 5000 }, async t => {
  const { owner } = await initialized(t);
  const tables = await owner.query({ kind: 'all', sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" });
  assert.deepEqual(tables.map(row => row.name), ['players', 'x01_match_players', 'x01_matches']);
  assert.equal((await owner.query({ kind: 'first', sql: 'PRAGMA user_version' })).user_version, 1);
  const indexes = await owner.query({ kind: 'all', sql: "SELECT name FROM sqlite_master WHERE type='index'" });
  assert.ok(indexes.some(row => row.name === 'x01_match_players_player_id'));
  assert.ok(indexes.some(row => row.name === 'x01_matches_status_created_at'));
});

test('foreign keys reject missing players and matches; player deletion restricts and match deletion cascades', { timeout: 5000 }, async t => {
  const { owner } = await initialized(t);
  const membership = 'INSERT INTO x01_match_players VALUES (?, ?, ?)';
  await owner.transaction([
    { kind: 'run', sql: player, params: ['a', 'Alice'] },
    { kind: 'run', sql: match, params: ['m'] },
  ]);
  await assert.rejects(owner.transaction([{ kind: 'run', sql: membership, params: ['missing', 'a', 0] }]), /FOREIGN KEY/);
  await assert.rejects(owner.transaction([{ kind: 'run', sql: membership, params: ['m', 'missing', 0] }]), /FOREIGN KEY/);
  await owner.transaction([{ kind: 'run', sql: membership, params: ['m', 'a', 0] }]);
  await assert.rejects(owner.transaction([{ kind: 'run', sql: 'DELETE FROM players WHERE id=?', params: ['a'] }]), /FOREIGN KEY/);
  await owner.transaction([{ kind: 'run', sql: 'DELETE FROM x01_matches WHERE id=?', params: ['m'] }]);
  assert.equal((await owner.query({ kind: 'all', sql: 'SELECT * FROM x01_match_players' })).length, 0);
});

test('IDs, membership and order are unique; player names need not be unique', { timeout: 5000 }, async t => {
  const { owner } = await initialized(t);
  await owner.transaction([
    { kind: 'run', sql: player, params: ['a', 'Same'] },
    { kind: 'run', sql: player, params: ['b', 'Same'] },
    { kind: 'run', sql: match, params: ['m'] },
    { kind: 'run', sql: 'INSERT INTO x01_match_players VALUES (?, ?, ?)', params: ['m', 'a', 0] },
  ]);
  for (const [sql, params] of [[player, ['a', 'Other']], [match, ['m']],
    ['INSERT INTO x01_match_players VALUES (?, ?, ?)', ['m', 'a', 1]],
    ['INSERT INTO x01_match_players VALUES (?, ?, ?)', ['m', 'b', 0]]]) {
    await assert.rejects(owner.transaction([{ kind: 'run', sql: sql, params: params }]), /UNIQUE/);
  }
  await assert.rejects(owner.transaction([{ kind: 'run', sql: player, params: [null, 'Null'] }]), /NOT NULL/);
});

test('checks reject invalid flags, status, scores, formats and positions without imposing odd best-of values', { timeout: 5000 }, async t => {
  const { owner } = await initialized(t);
  await owner.transaction([{ kind: 'run', sql: player, params: ['a', 'A'] }, { kind: 'run', sql: match, params: ['m'] }]);
  for (const sql of ["UPDATE players SET is_hidden=2", "UPDATE x01_matches SET status='BAD'",
    'UPDATE x01_matches SET start_score=0', 'UPDATE x01_matches SET start_score=2.5',
    'UPDATE x01_matches SET best_of_legs=0', 'UPDATE x01_matches SET best_of_sets=1.5',
    "INSERT INTO x01_match_players VALUES ('m','a',-1)", "INSERT INTO x01_match_players VALUES ('m','a',0.5)"]) {
    await assert.rejects(owner.transaction([{ kind: 'run', sql: sql }]), /CHECK/);
  }
  await owner.transaction([{ kind: 'run', sql: 'UPDATE x01_matches SET start_score=40,best_of_legs=2' }]);
});

test('failed fresh migration rolls back schema and user_version together', { timeout: 5000 }, async t => {
  const f = fixture(t); const db = f.open();
  await db.execAsync('PRAGMA foreign_keys=ON');
  await assert.rejects(migrateDatabase(db, [...migrations, { version: 2, sql: 'CREATE TABLE partial(id); INVALID SQL;' }]), /syntax/);
  assert.equal(await readSchemaVersion(db), 0);
  assert.equal((await db.getAllAsync("SELECT * FROM sqlite_master WHERE type='table'")).length, 0);
});

test('failed upgrade preserves existing rows and version; corrected retry applies without deleting data', { timeout: 5000 }, async t => {
  const { owner, connections } = await initialized(t);
  await owner.transaction([{ kind: 'run', sql: player, params: ['a', 'Retained'] }]);
  const db = connections[0];
  await assert.rejects(migrateDatabase(db, [...migrations, { version: 2, sql: 'ALTER TABLE players ADD COLUMN temporary TEXT; INVALID SQL;' }]));
  assert.equal(await readSchemaVersion(db), 1);
  assert.equal((await db.getFirstAsync('SELECT name FROM players')).name, 'Retained');
  assert.equal((await db.getAllAsync('PRAGMA table_info(players)')).some(row => row.name === 'temporary'), false);
  await migrateDatabase(db, [...migrations, { version: 2, sql: 'CREATE TABLE upgrade_marker(id INTEGER);' }]);
  assert.equal(await readSchemaVersion(db), 2);
  assert.equal((await db.getFirstAsync('SELECT name FROM players')).name, 'Retained');
});

test('non-consecutive migration definitions are rejected without executing SQL', { timeout: 5000 }, async t => {
  const db = fixture(t).open();
  await assert.rejects(migrateDatabase(db, [{ version: 2, sql: 'CREATE TABLE bad(id)' }]), /consecutive/);
  assert.equal(await readSchemaVersion(db), 0);
});
