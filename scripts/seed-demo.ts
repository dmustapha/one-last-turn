// File: scripts/seed-demo.ts
import { loadEnv } from "../src/config/env";
import { createDatabaseClient } from "../src/infrastructure/db/client";
import { createDemoCaseRepository } from "../src/infrastructure/db/demo-case-repository";

const SEED_CODE = "OLT-DEMO-0001";

async function main(): Promise<void> {
  const config = loadEnv(process.env);
  if (!config.databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  const database = createDatabaseClient({ connectionString: config.databaseUrl, max: 1 });
  try {
    const record = await database.sql.begin(async (sql) => {
      const repository = createDemoCaseRepository(sql);
      return await repository.findByCode(SEED_CODE) ?? repository.createDraft(SEED_CODE);
    });
    if (record.state !== "draft" || record.stateVersion !== 0 || record.strategyProvenance || record.responseProvenance) {
      throw new Error("SEED_CASE_NOT_DRAFT_ONLY");
    }
    process.stdout.write(`CASE_CODE=${record.publicCode}\n`);
  } finally { await database.close(); }
}

main().catch(() => { process.stderr.write("SEED_DEMO_FAILED\n"); process.exitCode = 1; });
