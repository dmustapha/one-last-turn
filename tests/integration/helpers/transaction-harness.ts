import { createHash } from "node:crypto";

import type postgres from "postgres";

import {
  createTransactionRunner,
  type TransactionRunner,
} from "@/application/transaction-runner";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "@/infrastructure/db/client";
import {
  createRepositories,
  type Repositories,
} from "@/infrastructure/db/repositories";
import {
  applyMigrations,
  discoverMigrations,
} from "./migration-harness";
import {
  startPostgreSql17,
  stopPostgreSql17,
  type PostgreSqlTestContext,
} from "./postgres-container";

export const IDS = {
  accessAuthorization: "05000000-0000-4000-8000-000000000001",
  accessEvent: "10000000-0000-4000-8000-000000000001",
  appliedRoomEvent: "15000000-0000-4000-8000-000000000001",
  accessJob: "20000000-0000-4000-8000-000000000001",
  actor: "30000000-0000-4000-8000-000000000001",
  affected: "30000000-0000-4000-8000-000000000003",
  case: "40000000-0000-4000-8000-000000000001",
  contactEvent: "50000000-0000-4000-8000-000000000001",
  contactJob: "60000000-0000-4000-8000-000000000001",
  request: "70000000-0000-4000-8000-000000000001",
  returning: "30000000-0000-4000-8000-000000000002",
  room: "80000000-0000-4000-8000-000000000001",
  tenant: "90000000-0000-4000-8000-000000000001",
} as const;

export function requestDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export interface TransactionTestHarness {
  container: PostgreSqlTestContext;
  database: DatabaseClient;
  repositories: Repositories;
  runner: TransactionRunner;
}

export async function startTransactionHarness(): Promise<TransactionTestHarness> {
  const migrations = await discoverMigrations();
  if (migrations.length === 0) {
    throw new Error("Task 3 migrations must exist before transaction tests can run.");
  }

  const container = await startPostgreSql17();
  await applyMigrations(container.sql, migrations);
  const database = createDatabaseClient({
    connectionString: connectionStringFor(container),
    max: 10,
  });
  const repositories = createRepositories(database);
  const runner = createTransactionRunner({ database, repositories });

  return { container, database, repositories, runner };
}

export async function stopTransactionHarness(
  harness: TransactionTestHarness | undefined,
): Promise<void> {
  if (!harness) return;
  await harness.database.close();
  await stopPostgreSql17(harness.container);
}

export async function resetTransactionDatabase(sql: postgres.Sql): Promise<void> {
  const tables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name <> '_olt_migrations'
  `;
  if (tables.length === 0) return;

  const names = tables.map(({ table_name }) => `"${safeIdentifier(table_name)}"`);
  await sql.unsafe(`truncate table ${names.join(", ")} restart identity cascade`);
}

export async function seedCase(
  repositories: Repositories,
  input: {
    accessState?: string;
    accessEligibility?: "eligible" | "ineligible" | null;
    accessVersion?: number;
    actorStatus?: "active" | "invited" | "revoked";
    caseId?: string;
    contactState?: string;
    contactVersion?: number;
    tenantId?: string;
    tenantStatus?: "active" | "suspended";
    withOperatorMembership?: boolean;
  } = {},
  sql?: postgres.Sql,
): Promise<void> {
  const tenantId = input.tenantId ?? IDS.tenant;
  const caseId = input.caseId ?? IDS.case;

  await repositories.tenants.insert({
    id: tenantId,
    name: "Test tenant",
    status: input.tenantStatus ?? "active",
  });
  await repositories.principals.insert({
    id: IDS.actor,
    kind: "operator",
    status: input.actorStatus ?? "active",
    tenantId,
  });
  if (input.withOperatorMembership ?? true) {
    await repositories.tenantMemberships.insert({
      principalId: IDS.actor,
      role: "operator",
      status: "active",
      tenantId,
    });
  }
  await repositories.principals.insert({
    id: IDS.returning,
    kind: "returning_member",
    status: "active",
    tenantId,
  });
  await repositories.principals.insert({
    id: IDS.affected,
    kind: "affected_member",
    status: "active",
    tenantId,
  });
  await repositories.cases.insert({
    affectedPrincipalId: IDS.affected,
    createdBy: IDS.actor,
    fixtureKey: `fixture-${caseId}`,
    id: caseId,
    returningPrincipalId: IDS.returning,
    stateVersion: 1,
    status: "active",
    tenantId,
    title: "Transaction fixture",
  });
  const accessState = input.accessState ?? "brief_published";
  const accessVersion = input.accessVersion ?? 2;
  if (accessState === "access_applied") {
    if (!sql) throw new Error("Applied access fixtures require the PostgreSQL test connection.");
    await seedAppliedAccessEvidence(sql, {
      authorizedBy: IDS.actor,
      caseId,
      principalId: IDS.returning,
      tenantId,
      version: accessVersion,
    });
  } else {
    await repositories.accessWorkflows.insert({
      caseId,
      eligibilityCode: input.accessEligibility === undefined
        ? "eligible"
        : input.accessEligibility,
      state: accessState,
      stateVersion: accessVersion,
      tenantId,
    });
  }
  await repositories.contactWorkflows.insert({
    caseId,
    state: input.contactState ?? "not_invited",
    stateVersion: input.contactVersion ?? 0,
    tenantId,
  });
}

export async function seedAccessEvidence(
  harness: TransactionTestHarness,
  input: { state?: string; stateVersion?: number; withEvidence?: boolean } = {},
): Promise<void> {
  const authorizationId = "11000000-0000-4000-8000-000000000001";
  const accessEvidenceId = "12000000-0000-4000-8000-000000000001";
  const operationId = "13000000-0000-4000-8000-000000000001";
  await harness.container.sql`insert into project_rooms
      (id, tenant_id, case_id, display_name)
    values (${IDS.room}, ${IDS.tenant}, ${IDS.case}, 'Evidence room')`;
  await harness.container.sql`insert into access_authorizations
      (id, tenant_id, case_id, principal_id, authorized_role, authorized_by, expires_at)
    values (${authorizationId}, ${IDS.tenant}, ${IDS.case}, ${IDS.returning},
      'speaker', ${IDS.actor}, now() + interval '1 day')`;
  await harness.container.sql`insert into access_events
      (id, tenant_id, case_id, room_id, principal_id, before_role, after_role,
       authorization_id, operation_id)
    values (${accessEvidenceId}, ${IDS.tenant}, ${IDS.case}, ${IDS.room},
      ${IDS.returning}, 'listener', 'speaker', ${authorizationId}, ${operationId})`;
  const evidence = input.withEvidence === false
    ? { authorizationId: null, eventId: null }
    : { authorizationId, eventId: accessEvidenceId };
  await harness.container.sql`update access_workflows set
      state = ${input.state ?? "access_applied"},
      eligibility_code = 'eligible',
      state_version = ${input.stateVersion ?? 7},
      authorization_id = ${evidence.authorizationId},
      access_event_id = ${evidence.eventId}
    where tenant_id = ${IDS.tenant} and case_id = ${IDS.case}`;
}

export async function seedAppliedAccessEvidence(
  sql: postgres.Sql,
  input: {
    authorizedBy: string;
    caseId: string;
    principalId: string;
    tenantId: string;
    version: number;
  },
): Promise<void> {
  await sql`insert into project_rooms (id, tenant_id, case_id, display_name)
    values (${IDS.room}, ${input.tenantId}, ${input.caseId}, 'Evidence-backed test room')`;
  await sql`insert into access_authorizations (
      id, tenant_id, case_id, principal_id, authorized_role, authorized_by, expires_at
    ) values (
      ${IDS.accessAuthorization}, ${input.tenantId}, ${input.caseId}, ${input.principalId},
      'speaker', ${input.authorizedBy}, now() + interval '1 hour'
    )`;
  await sql`insert into access_events (
      id, tenant_id, case_id, room_id, principal_id, before_role, after_role,
      authorization_id, operation_id
    ) values (
      ${IDS.appliedRoomEvent}, ${input.tenantId}, ${input.caseId}, ${IDS.room},
      ${input.principalId}, 'listener', 'speaker', ${IDS.accessAuthorization}, gen_random_uuid()
    )`;
  await sql`insert into access_workflows (
      case_id, tenant_id, state, eligibility_code, authorization_id,
      access_event_id, state_version
    ) values (
      ${input.caseId}, ${input.tenantId}, 'access_applied', 'eligible',
      ${IDS.accessAuthorization}, ${IDS.appliedRoomEvent}, ${input.version}
    )`;
}

export async function installOutboxFailureTrigger(
  sql: postgres.Sql,
  dedupeKey: string,
): Promise<void> {
  await sql.unsafe(`
    create or replace function reject_selected_outbox_job()
    returns trigger language plpgsql as $$
    begin
      if new.dedupe_key = '${safeLiteral(dedupeKey)}' then
        raise exception 'forced outbox failure';
      end if;
      return new;
    end;
    $$;
    create trigger reject_selected_outbox_job
      before insert on outbox_jobs
      for each row execute function reject_selected_outbox_job();
  `);
}

function connectionStringFor(context: PostgreSqlTestContext): string {
  return [
    "postgresql://one_last_turn:test_password@",
    context.container.getHost(),
    `:${context.container.getMappedPort(5432)}/one_last_turn_test`,
  ].join("");
}

function safeIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  }
  return value;
}

function safeLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
