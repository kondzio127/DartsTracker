import { migrations, Migration, migrateDatabase, readSchemaVersion, supportedVersion } from './migrations';

export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[];
export type SqlRow = Record<string, unknown>;
export interface RunResult { changes: number; lastInsertRowId: number }
interface SqlStatement { readonly sql: string; readonly params?: readonly SqlValue[] }
export interface RunRequest extends SqlStatement { readonly kind: 'run' }
export interface FirstRequest extends SqlStatement { readonly kind: 'first' }
export interface AllRequest extends SqlStatement { readonly kind: 'all' }
export type StatementRequest = RunRequest | FirstRequest | AllRequest;
export type StatementResult<Request extends StatementRequest, Row = SqlRow> =
    Request extends RunRequest ? RunResult : Request extends FirstRequest ? Row | null : Row[];
export type BatchResults<Requests extends readonly StatementRequest[]> = {
    -readonly [Index in keyof Requests]: StatementResult<Requests[Index]>;
};
type QueryResult<Row> = RunResult | Row | null | Row[];

/** Validate and snapshot before queueing: callbacks are never invoked or queued. */
function snapshotRequest(request: StatementRequest): StatementRequest {
    if (typeof request === 'function') throw new TypeError('Database callbacks are not supported; pass a statement request');
    if (!request || typeof request !== 'object' || !['run', 'first', 'all'].includes(request.kind)
        || typeof request.sql !== 'string' || !request.sql.trim()) {
        throw new TypeError('Expected a run, first or all SQL statement request');
    }
    if (request.params !== undefined && !Array.isArray(request.params)) throw new TypeError('Statement params must be an array');
    const params = Array.from(request.params ?? [], value => {
        if (value instanceof Uint8Array) return value.slice();
        if (value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
        throw new TypeError('SQL parameters must be strings, finite numbers, null or Uint8Array');
    });
    return { kind: request.kind, sql: request.sql, params };
}

/** Internal adapter seam; production callers use database.ts, never the connection. */
export interface DatabaseConnection {
    execAsync(sql: string): Promise<void>;
    runAsync(sql: string, params: SqlParams): Promise<{ changes: number; lastInsertRowId: number }>;
    getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null>;
    getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]>;
    withTransactionAsync(task: () => Promise<void>): Promise<void>;
    closeAsync(): Promise<void>;
}

export const BUSY_TIMEOUT_MS = 3000;

/** One owner per file. No connection or transaction-control methods escape this closure. */
export function createDatabaseOwner(open: () => Promise<DatabaseConnection>, definitions: readonly Migration[] = migrations) {
    let initialization: Promise<DatabaseConnection> | undefined;
    let queue: Promise<unknown> = Promise.resolve();

    function connection(): Promise<DatabaseConnection> {
        if (!initialization) {
            initialization = (async () => {
                const db = await open();
                try {
                    // Inspect first: do not configure or migrate an unsupported newer database.
                    const latest = supportedVersion(definitions);
                    const version = await readSchemaVersion(db);
                    if (version > latest) throw new Error(`Database version ${version} is newer than supported version ${latest}`);
                    await db.execAsync(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
                    if ((await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys !== 1) {
                        throw new Error('SQLite foreign keys are not enabled');
                    }
                    if ((await db.getFirstAsync<{ timeout: number }>('PRAGMA busy_timeout'))?.timeout !== BUSY_TIMEOUT_MS) {
                        throw new Error('SQLite busy timeout was not configured');
                    }
                    const journal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode = WAL');
                    if (journal?.journal_mode.toLowerCase() !== 'wal') throw new Error('SQLite WAL mode is not enabled');
                    await migrateDatabase(db, definitions);
                    return db;
                } catch (error) {
                    // Preserve the original error; never delete or recreate the database file.
                    await db.closeAsync().catch(() => undefined);
                    throw error;
                }
            })().catch(error => { initialization = undefined; throw error; });
        }
        return initialization;
    }

    function enqueue<T>(task: () => Promise<T>): Promise<T> {
        const result = queue.then(task);
        queue = result.catch(() => undefined);
        return result;
    }

    function execute<Row>(db: DatabaseConnection, request: StatementRequest): Promise<QueryResult<Row>> {
        const params = Array.from(request.params ?? []);
        switch (request.kind) {
            case 'run': return db.runAsync(request.sql, params);
            case 'first': return db.getFirstAsync<Row>(request.sql, params);
            case 'all': return db.getAllAsync<Row>(request.sql, params);
        }
    }

    function query(request: RunRequest): Promise<RunResult>;
    function query<Row = SqlRow>(request: FirstRequest): Promise<Row | null>;
    function query<Row = SqlRow>(request: AllRequest): Promise<Row[]>;
    function query<Row = SqlRow>(request: StatementRequest): Promise<QueryResult<Row>>;
    function query<Row = SqlRow>(request: StatementRequest): Promise<QueryResult<Row>> {
        const statement = snapshotRequest(request);
        return enqueue(async () => execute<Row>(await connection(), statement));
    }

    function transaction<const Requests extends readonly StatementRequest[]>(requests: Requests): Promise<BatchResults<Requests>> {
        if (typeof requests === 'function') throw new TypeError('Database callbacks are not supported; pass an array of statement requests');
        if (!Array.isArray(requests)) throw new TypeError('Transaction requires an array of statement requests');
        // Validate the entire batch before opening a connection or starting a transaction.
        const statements = Array.from(requests, snapshotRequest);
        return enqueue(async () => {
            const db = await connection();
            const results: QueryResult<SqlRow>[] = [];
            await db.withTransactionAsync(async () => {
                for (const statement of statements) results.push(await execute<SqlRow>(db, statement));
            });
            // Each result has the same index and kind as its validated request.
            return results as BatchResults<Requests>;
        });
    }

    return {
        initialize: async (): Promise<void> => { await connection(); },
        query,
        transaction,
    };
}
