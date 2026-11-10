# SQLite foundation (Milestone 2.3)

SQLite is not called by startup, screens, Zustand or gameplay. AsyncStorage remains
our sole game-data authority. No player repositories, import or dual writes exist.
The only new dependency is Expo SDK 54's `expo-sqlite ~16.0.10`, installed with
`npx expo install expo-sqlite`. Expo also registered its standard config plugin.
Web support is deliberately deferred; native opening fails explicitly on web.

## Ownership and API

`database.ts` owns one lazy `darts-tracker.db` connection. Importing the module does
not open a file. `initializeDatabase()` shares initialization, configures and checks
foreign keys, WAL and a 3000 ms busy timeout, then migrates before allowing queries.
The connection uses SDK 54's `useNewConnection: true` so other Expo callers cannot
accidentally share its transaction. Do not open this filename elsewhere.

Use `queryDatabase(request)` for one statement and
`withDatabaseTransaction(requests)` for an ordered atomic batch. Both APIs share
one queue; the raw connection and transaction controls stay private. They accept
only data, never application callbacks or sessions, so application code cannot
reenter the queue from inside a running operation. Internal migration and owner
callbacks are private implementation details and never call public queue methods.
The connection lives until process exit, not until a component unmounts.

```ts
const player = await queryDatabase<{ id: string; name: string }>({
  kind: 'first',
  sql: 'SELECT id,name FROM players WHERE id=?',
  params: [playerId],
});
const players = await queryDatabase<{ id: string; name: string }>({
  kind: 'all', sql: 'SELECT id,name FROM players ORDER BY name',
});
const [insertResult, updateResult, firstRow, rows] = await withDatabaseTransaction([
  { kind: 'run', sql: 'INSERT INTO players(id,name,created_at) VALUES (?,?,?)',
    params: [playerId, name, new Date().toISOString()] },
  { kind: 'run', sql: 'UPDATE players SET nickname=? WHERE id=?', params: [nickname, playerId] },
  { kind: 'first', sql: 'SELECT id,name FROM players WHERE id=?', params: [playerId] },
  { kind: 'all', sql: 'SELECT id FROM players ORDER BY id' },
]);
```

`run` returns `{ changes, lastInsertRowId }`; `first` returns a row or null; `all`
returns a row array. Batches return one result per request, at the same index,
only after COMMIT succeeds. Tuple inputs retain their per-kind result types.
Single-query row types can be provided explicitly; batch rows default to
`Record<string, unknown>`. Type arguments describe rows; they do not validate SQL
or row shapes at runtime. SQL errors reject the operation; one failed batch
statement rolls back ALL earlier statements, with no partial success result.
An empty batch returns an empty array. Independent concurrent callers are queued,
not rejected, and cannot enter another request's transaction.

Legacy callbacks (including callback elements in batches) and malformed requests
throw TypeError synchronously, BEFORE queue entry, opening or BEGIN. Callback
bodies are never invoked. SQL text, parameter arrays and blobs are snapshotted
at submission so mutation while waiting does not change the queued operation.
Bind values as positional parameters: strings, finite numbers, null or Uint8Array.
Session objects no longer exist. Helpers should return plain statement objects.

Batches are fixed statements, not a framework for read/modify/write callbacks.
JavaScript branching on intermediate results, parameters derived from an earlier
result, nested transactions and arbitrary application exceptions inside a batch
are intentionally deferred to the repository milestone. Do not split a future
atomic read/modify/write operation into separate public calls without designing
its concurrency guarantees. Query requests may also contain a single `run` statement.

SQL remains trusted application code, not arbitrary user SQL. Do not submit
BEGIN/COMMIT/ROLLBACK, connection PRAGMAs or migration SQL from repositories. The
request API is not a SQL parser or security boundary; bind all user VALUES rather
than interpolating them into SQL.

SDK 54's installed `withTransactionAsync()` uses BEGIN/COMMIT/ROLLBACK on the same
connection and is not exclusive by itself. It is safe here only because every
consumer is serialized and initialization never exposes a half-migrated connection.
Do not substitute `withExclusiveTransactionAsync()` casually: SDK 54 opens a new
connection for it, and connection-specific foreign-key settings are not inherited.
Its callback starts after BEGIN, too late to enable foreign keys for that transaction.

## Schema and migrations

`migrations/001_initial.ts` is immutable SQL, shared by native and Node adapters.
`migrations.ts` validates consecutive versions and uses PRAGMA user_version.
All pending migrations, version changes and a foreign_key_check share a transaction.
Failures roll back schema/data/version. A newer version is rejected before any
connection configuration or migration writes. Initialization failure closes the
owned connection and clears the initialization promise for explicit retry. Closing
is best effort; we never delete, replace or recreate a database as error recovery.

Version 1 creates only:
- players: text IDs, non-unique names, optional nickname/flag, hidden boolean, timestamp.
- x01_matches: text IDs, positive integer starting score and optional best-of values,
  status, timestamps. Even best-of values and arbitrary positive starting scores
  remain supported; no new X01 scoring rules or timestamp coupling are introduced.
- x01_match_players: unique match/player and match/position pairs with nonnegative
  integer position. Match deletion cascades membership; referenced players restrict
  hard deletion. Indexes support status/date history and player membership lookup.

No legs, visits, dart observations or Around the Clock tables are created yet.
Future repository implementations belong in `src/database/repositories/` and must
use the scoped API; do not add a second connection or write to AsyncStorage too.
A later milestone must design active partial-turn/Undo persistence and a verified,
transactional import with a completion marker before switching authority. Retain
legacy AsyncStorage read-only after that cutover; do not implement fallback dual writes.

## Automated tests

`npm test` compiles production SQL/migrations/owner and runs Node's real `node:sqlite`
on temporary file-backed databases (WAL needs a file). Requires a Node version with
node:sqlite; tested with Node 25.6.1. Node may emit its experimental SQLite warning.
No extra test dependency is installed. The narrow adapter maps Node lastInsertRowid to Expo lastInsertRowId and preserves actual SQL,
foreign keys, DDL rollback, versioning and transaction behaviour. It starts with
foreign keys disabled, requiring initialization to enable them.

These are SQL-level and owner tests, NOT native Expo tests. The Expo adapter test
uses a module stub to verify lazy opening, filename/options and delegation only.
It cannot prove Android/iOS bridge behaviour, file permissions or process durability.
Native smoke verification remains required before using SQLite for gameplay.

## Android smoke procedure (temporary local harness only)

Use an SDK-54-compatible Expo Go or a development build. Do not wire this harness
into normal startup. On a local throwaway branch/worktree, temporarily run these
calls from a debug action after normal hydration; remove ALL harness imports/actions
before reviewing the production diff. Do not erase existing databases or AsyncStorage.

1. Call `initializeDatabase()` twice concurrently. Both must succeed with the same
   owned connection. Read through `queryDatabase` and record:
   - PRAGMA database_list: the main file ends in darts-tracker.db.
   - PRAGMA user_version: 1.
   - PRAGMA journal_mode: wal.
   - PRAGMA foreign_keys: 1.
   - PRAGMA busy_timeout: 3000.
   - SELECT name FROM sqlite_master WHERE type='table': the three expected tables.
2. Generate a unique smoke ID. Inside `withDatabaseTransaction`, insert one players
   row with bound ID/name/timestamp as the first run request, followed by a run
   request that violates a foreign key. Catch the constraint error. Query by ID
   with a first request and confirm no row exists.
3. In another transaction batch insert into x01_match_players using fresh nonexistent
   match/player IDs. Confirm a foreign-key error, then verify the connection still
   works and no membership row exists. Do not toggle foreign keys off.
4. Insert one clearly labelled smoke player and COMMIT. Fully stop and relaunch the
   process; explicitly initialize from the harness again. Verify version/settings
   and that the exact smoke row remains. This checks reopening without recreation.
5. Delete ONLY that bound smoke player ID in a transaction. Confirm no smoke rows
   remain, remove the temporary harness completely, and rerun tests/type checking.

No Android smoke run has been performed by the Node tests. Normal gameplay writes
still use AsyncStorage; this foundation is dormant until explicitly called.
