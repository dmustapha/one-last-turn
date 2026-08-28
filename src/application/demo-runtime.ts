// File: src/application/demo-runtime.ts
import { loadEnv, type AppConfig } from "../config/env";
import { createDatabaseClient } from "../infrastructure/db/client";
import { createPostgresDemoCaseStore } from "../infrastructure/db/demo-case-repository";
import { createLiveMindTransport } from "../infrastructure/minds/minds-worker";
import { DemoCaseService } from "./demo-case-service";
import { DemoController } from "./demo-controller";

type CaseConfig = AppConfig & { databaseUrl: string };

function requireCaseConfig(source: NodeJS.ProcessEnv): CaseConfig {
  const config = loadEnv(source, { validationScope: "demo" });
  if (!config.features.demoCase) throw new Error("DEMO_CASE_DISABLED");
  if (!config.databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  return config as CaseConfig;
}

export function createCaseRuntime(source: NodeJS.ProcessEnv) {
  const config = requireCaseConfig(source);
  const database = createDatabaseClient({ connectionString: config.databaseUrl });
  const cases = new DemoCaseService(createPostgresDemoCaseStore(database));
  return { config, cases, controller: new DemoController(cases), close: () => database.close() };
}

export function createMindRuntime(source: NodeJS.ProcessEnv) {
  const config = requireCaseConfig(source);
  if (!config.features.mindsLive || !config.builderApiKey || !config.mindId) {
    throw new Error("MINDS_RUNTIME_DISABLED");
  }
  const builderApiKey = config.builderApiKey;
  const mindId = config.mindId;
  const database = createDatabaseClient({ connectionString: config.databaseUrl });
  const cases = new DemoCaseService(createPostgresDemoCaseStore(database));
  return { config, mindId, cases,
    minds: createLiveMindTransport(builderApiKey), close: () => database.close() };
}
