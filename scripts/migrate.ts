// File: scripts/migrate.ts
import path from "node:path";

import { loadEnv } from "../src/config/env";
import { createDatabaseClient } from "../src/infrastructure/db/client";
import { applyMigrations } from "../src/infrastructure/db/migrations";

async function main(): Promise<void> {
  const config = loadEnv(process.env);
  if (!config.databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  const database = createDatabaseClient({ connectionString: config.databaseUrl, max: 1 });
  try {
    const applied = await applyMigrations(database, path.join(process.cwd(), "db", "migrations"));
    process.stdout.write(`MIGRATIONS_APPLIED=${applied.length}\n`);
  } finally { await database.close(); }
}

main().catch(() => { process.stderr.write("MIGRATIONS_FAILED\n"); process.exitCode = 1; });
