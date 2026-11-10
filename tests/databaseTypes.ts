// Compile-only checks: this function is never executed and opens no database.
import { queryDatabase, withDatabaseTransaction, RunResult, SqlRow } from '../src/database/database';
export function checkDatabaseRequestTypes() {
    const run: Promise<RunResult> = queryDatabase({ kind: 'run', sql: 'INSERT ...', params: ['a'] });
    const first: Promise<{ id: string } | null> = queryDatabase<{ id: string }>({ kind: 'first', sql: 'SELECT id FROM players' });
    const all: Promise<{ id: string }[]> = queryDatabase<{ id: string }>({ kind: 'all', sql: 'SELECT id FROM players' });
    const batch: Promise<[RunResult, SqlRow | null, SqlRow[]]> = withDatabaseTransaction([
        { kind: 'run', sql: 'UPDATE ...' },
        { kind: 'first', sql: 'SELECT ...' },
        { kind: 'all', sql: 'SELECT ...' },
    ]);
    // @ts-expect-error Public query callbacks are no longer supported.
    queryDatabase(async () => null);
    // @ts-expect-error Public transaction callbacks are no longer supported.
    withDatabaseTransaction(async () => null);
    // @ts-expect-error Callback elements cannot be part of a statement batch.
    withDatabaseTransaction([async () => null]);
    // @ts-expect-error A first request returns one row or null, never a row array.
    const incorrect: Promise<SqlRow[]> = queryDatabase({ kind: 'first', sql: 'SELECT 1' });
    return { run, first, all, batch, incorrect };
}
