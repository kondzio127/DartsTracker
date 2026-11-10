import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';
import { createDatabaseOwner, SqlParams } from './databaseOwner';
export type { StatementRequest, RunRequest, FirstRequest, AllRequest, RunResult, StatementResult, BatchResults, SqlRow, SqlParams, SqlValue } from './databaseOwner';

export const DATABASE_NAME = 'darts-tracker.db';
const owner = createDatabaseOwner(async () => {
    if (Platform.OS === 'web') throw new Error('SQLite foundation currently supports native platforms only');
    // Dedicated connection: no unrelated Expo caller may share the connection cache.
    const db = await openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
    return {
        execAsync: sql => db.execAsync(sql),
        runAsync: (sql, params) => db.runAsync(sql, params),
        getFirstAsync: <T>(sql: string, params: SqlParams = []) => db.getFirstAsync<T>(sql, params),
        getAllAsync: <T>(sql: string, params: SqlParams = []) => db.getAllAsync<T>(sql, params),
        withTransactionAsync: task => db.withTransactionAsync(task),
        closeAsync: () => db.closeAsync(),
    };
});

// Nothing opens on import. Gameplay and startup do not call these functions yet.
export const initializeDatabase = owner.initialize;
export const queryDatabase = owner.query;
export const withDatabaseTransaction = owner.transaction;
