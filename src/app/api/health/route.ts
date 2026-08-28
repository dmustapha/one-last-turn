// File: src/app/api/health/route.ts
import { loadEnv } from "../../../config/env";
import { createDatabaseClient } from "../../../infrastructure/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(): Promise<Response> {
  const config = loadEnv(process.env);
  if (!config.databaseUrl) return Response.json({ status: "not_ready", database: false }, { status: 503 });
  const database = createDatabaseClient({ connectionString: config.databaseUrl, max: 1 });
  try {
    const rows = await database.sql<{ ready: boolean }[]>`select
      to_regclass('public.demo_cases') is not null and
      to_regclass('public.demo_case_events') is not null as ready`;
    const ready = rows[0]?.ready === true;
    return Response.json({ status: ready ? "ready" : "not_ready", database: ready }, { status: ready ? 200 : 503 });
  } catch { return Response.json({ status: "not_ready", database: false }, { status: 503 }); }
  finally { await database.close(); }
}
