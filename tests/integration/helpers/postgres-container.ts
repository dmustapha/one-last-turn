import postgres from "postgres";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

const POSTGRES_PORT = 5432;

export interface PostgreSqlTestContext {
  connectionString: string;
  container: StartedTestContainer;
  sql: postgres.Sql;
}

export async function startPostgreSql17(): Promise<PostgreSqlTestContext> {
  configureLocalContainerRuntime();
  const container = await new GenericContainer("postgres:17-alpine")
    .withEnvironment({
      POSTGRES_DB: "one_last_turn_test",
      POSTGRES_PASSWORD: "test_password",
      POSTGRES_USER: "one_last_turn",
    })
    .withExposedPorts(POSTGRES_PORT)
    .withHealthCheck({
      interval: 250,
      retries: 60,
      startPeriod: 1_000,
      test: ["CMD-SHELL", "pg_isready -U one_last_turn -d one_last_turn_test"],
      timeout: 1_000,
    })
    .withWaitStrategy(Wait.forAll([
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
      Wait.forHealthCheck(),
    ]))
    .withStartupTimeout(60_000)
    .start();

  const connectionString = `postgresql://one_last_turn:test_password@${container.getHost()}:${container.getMappedPort(POSTGRES_PORT)}/one_last_turn_test`;
  const sql = postgres(connectionString, { max: 1 });

  await waitForTargetDatabase(sql);
  return { connectionString, container, sql };
}

function configureLocalContainerRuntime(): void {
  if (process.env.DOCKER_HOST) return;
  const socket = `${homedir()}/.colima/default/docker.sock`;
  if (!existsSync(socket)) return;
  process.env.DOCKER_HOST = `unix://${socket}`;
  process.env.TESTCONTAINERS_RYUK_DISABLED ??= "true";
}

async function waitForTargetDatabase(sql: postgres.Sql): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await sql`select current_database() as database_name`;
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

export async function stopPostgreSql17(
  context: PostgreSqlTestContext | undefined,
): Promise<void> {
  if (!context) {
    return;
  }

  await context.sql.end({ timeout: 5 });
  await context.container.stop();
}
