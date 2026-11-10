import { initialSchema } from './migrations/001_initial';

export interface Migration { readonly version: number; readonly sql: string }
export const migrations: readonly Migration[] = Object.freeze([
    Object.freeze({ version: 1, sql: initialSchema }),
]);

/** Minimal adapter implemented by Expo in production and real SQLite in tests. */
export interface MigrationDatabase {
    execAsync(sql: string): Promise<void>;
    getFirstAsync<T>(sql: string): Promise<T | null>;
    getAllAsync<T>(sql: string): Promise<T[]>;
    withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export async function readSchemaVersion(db: MigrationDatabase): Promise<number> {
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!row || !Number.isInteger(row.user_version) || row.user_version < 0) throw new Error('Invalid SQLite schema version');
    return row.user_version;
}

export function supportedVersion(definitions: readonly Migration[]): number {
    definitions.forEach((migration, index) => {
        if (migration.version !== index + 1) throw new Error('Migrations must be consecutive starting at 1');
    });
    return definitions.length;
}

/** Caller owns the connection: no concurrent statements may enter this transaction. */
export async function migrateDatabase(db: MigrationDatabase, definitions = migrations): Promise<void> {
    const latest = supportedVersion(definitions);
    const current = await readSchemaVersion(db);
    if (current > latest) throw new Error(`Database version ${current} is newer than supported version ${latest}`);
    if (current === latest) return;
    await db.withTransactionAsync(async () => {
        for (const migration of definitions) {
            if (migration.version <= current) continue;
            await db.execAsync(migration.sql);
            // This value comes only from the validated, immutable migration list.
            await db.execAsync(`PRAGMA user_version = ${migration.version}`);
        }
        if ((await db.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('SQLite foreign key check failed');
    });
}
