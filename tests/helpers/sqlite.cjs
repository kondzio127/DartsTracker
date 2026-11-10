// Real SQLite SQL/rollback semantics; not an Expo native-module emulator.
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'darts-sqlite-'));
  const path = join(directory, 'test.db');
  const connections = [];
  t.after(() => {
    for (const item of connections) if (!item.closed) item.closeAsync();
    rmSync(directory, { recursive: true, force: true });
  });
  function open() {
    const native = new DatabaseSync(path);
    native.exec('PRAGMA foreign_keys=OFF'); // Owner must enable it; do not rely on Node defaults.
    const adapter = {
      native, closed: false,
      execAsync: async sql => { native.exec(sql); },
      runAsync: async (sql, params = []) => {
        const result = native.prepare(sql).run(...params);
        // Node spells this lastInsertRowid; Expo's API uses lastInsertRowId.
        return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
      },
      getFirstAsync: async (sql, params = []) => native.prepare(sql).get(...params) ?? null,
      getAllAsync: async (sql, params = []) => native.prepare(sql).all(...params),
      withTransactionAsync: async task => {
        native.exec('BEGIN');
        try { await task(); native.exec('COMMIT'); }
        catch (error) { native.exec('ROLLBACK'); throw error; }
      },
      closeAsync: async () => { native.close(); adapter.closed = true; },
    };
    connections.push(adapter);
    return adapter;
  }
  return { open, connections, path };
}
module.exports = { fixture };
