// File: src/infrastructure/db/client.ts
import postgres from "postgres";

export type DatabaseSql = postgres.Sql | postgres.TransactionSql;
export interface DatabaseClient { close(): Promise<void>; sql: postgres.Sql; }

export function createDatabaseClient(input: { connectionString: string; max?: number }): DatabaseClient {
  const sql = postgres(input.connectionString, {
    max: input.max ?? 10,
    transform: { undefined: null },
  });
  return { close: async () => sql.end(), sql };
}
