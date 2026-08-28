import { afterAll, describe, expect, it } from "vitest";

import {
  applyMigrations,
  discoverMigrations,
} from "../helpers/migration-harness";
import {
  startPostgreSql17,
  stopPostgreSql17,
  type PostgreSqlTestContext,
} from "../helpers/postgres-container";

const REQUIRED_TABLES = [
  "access_authorizations",
  "access_events",
  "access_workflows",
  "capability_challenges",
  "cases",
  "consent_events",
  "contact_boundaries",
  "contact_invitations",
  "contact_messages",
  "contact_observations",
  "contact_workflows",
  "delivery_messages",
  "domain_events",
  "idempotency_records",
  "mind_conversations",
  "mind_exchanges",
  "outbox_jobs",
  "participant_grants",
  "principals",
  "project_rooms",
  "provider_webhook_events",
  "receipts",
  "reentry_terms",
  "retention_tombstones",
  "room_memberships",
  "tenant_memberships",
  "tenants",
  "turn_responses",
] as const;

const REQUIRED_DEMO_TABLES = ["demo_cases", "demo_case_events", "demo_mind_send_attempts"] as const;

const REQUIRED_UNIQUE_INDEXES = [
  ["access_events", ["operation_id"]],
  ["capability_challenges", ["token_hash"]],
  ["contact_messages", ["case_id", "sender_principal_id", "attempt_number"]],
  ["domain_events", ["aggregate_type", "aggregate_id", "aggregate_version"]],
  ["idempotency_records", ["actor_id", "operation", "idempotency_key"]],
  ["mind_conversations", ["case_id", "lane"]],
  ["mind_conversations", ["stable_alias"]],
  ["mind_exchanges", ["operation_id"]],
  ["mind_exchanges", ["reply_id"]],
  ["outbox_jobs", ["tenant_id", "job_type", "dedupe_key"]],
  ["contact_invitations", ["tenant_id", "logical_invitation_id"]],
  ["provider_webhook_events", ["provider", "provider_event_id"]],
  ["receipts", ["case_id", "version"]],
  ["room_memberships", ["room_id", "principal_id"]],
  ["tenant_memberships", ["tenant_id", "principal_id"]],
] as const;

const TENANT_OWNED_TABLES = REQUIRED_TABLES.filter(
  (table) => table !== "tenants",
);

const REQUIRED_EVIDENCE_FOREIGN_KEYS = [
  {
    child: "access_authorizations",
    childColumns: ["tenant_id", "case_id", "principal_id"],
    parent: "cases",
    parentColumns: ["tenant_id", "id", "returning_principal_id"],
  },
  {
    child: "access_events",
    childColumns: ["tenant_id", "case_id", "authorization_id", "principal_id", "after_role"],
    parent: "access_authorizations",
    parentColumns: ["tenant_id", "case_id", "id", "principal_id", "authorized_role"],
  },
  {
    child: "access_events",
    childColumns: ["tenant_id", "case_id", "room_id"],
    parent: "project_rooms",
    parentColumns: ["tenant_id", "case_id", "id"],
  },
] as const;

describe("PostgreSQL migrations", () => {
  let database: PostgreSqlTestContext | undefined;

  afterAll(async () => {
    await stopPostgreSql17(database);
  });

  it("builds the complete schema from zero and records each migration once", async () => {
    const migrations = await discoverMigrations();

    expect(
      migrations,
      "No db/migrations/*.sql files were discovered; Task 3 migrations are not implemented yet.",
    ).not.toHaveLength(0);

    database = await startPostgreSql17();
    const sql = requireDatabase(database).sql;
    const firstRun = await applyMigrations(sql, migrations);
    const secondRun = await applyMigrations(sql, migrations);

    expect(firstRun).toEqual(migrations.map(({ name }) => name));
    expect(secondRun).toEqual([]);
    await expectTables(sql);
    await expectTenantColumns(sql);
    await expectCriticalUniqueIndexes(sql);
    await expectOutboxPartialIndexes(sql);
    await expectOutboxLaneConstraint(sql);
    await expectTenantForeignKeys(sql);
    await expectOutboxProvenance(sql);
    await expectLogicalInvitationIdentity(sql);
    await expectAccessEvidenceConstraint(sql);
    await expectEvidenceForeignKeys(sql);
    await expectEvidenceMismatchRejections(sql);
    await expectLaneSeparation(sql);

    const migrationCount = await sql<{ count: number }[]>`
      select count(*)::int as count from _olt_migrations
    `;
    expect(migrationCount[0]?.count).toBe(migrations.length);
  }, 60_000);
});

function requireDatabase(
  database: PostgreSqlTestContext | undefined,
): PostgreSqlTestContext {
  if (!database) {
    throw new Error("PostgreSQL test container did not start.");
  }
  return database;
}

async function expectEvidenceForeignKeys(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await readForeignKeyShapes(sql);

  for (const expected of REQUIRED_EVIDENCE_FOREIGN_KEYS) {
    expect(rows).toContainEqual({
      child_columns: [...expected.childColumns],
      child_table: expected.child,
      parent_columns: [...expected.parentColumns],
      parent_table: expected.parent,
    });
  }
}

async function expectEvidenceMismatchRejections(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  await seedEvidenceFixture(sql);
  await expect(insertAuthorization(sql, EVIDENCE_IDS.operator, EVIDENCE_IDS.badAuthorization))
    .rejects.toMatchObject({ code: "23503" });
  await insertAuthorization(sql, EVIDENCE_IDS.returning, EVIDENCE_IDS.authorization);
  await expect(insertAccessEvent(sql, EVIDENCE_IDS.operator, "speaker", EVIDENCE_IDS.room))
    .rejects.toMatchObject({ code: "23503" });
  await expect(insertAccessEvent(sql, EVIDENCE_IDS.returning, "listener", EVIDENCE_IDS.room))
    .rejects.toMatchObject({ code: "23503" });
  await expect(insertAccessEvent(sql, EVIDENCE_IDS.returning, "speaker", EVIDENCE_IDS.otherRoom))
    .rejects.toMatchObject({ code: "23503" });
  await expect(insertAccessEvent(sql, EVIDENCE_IDS.returning, "speaker", EVIDENCE_IDS.room))
    .resolves.toHaveLength(1);
}

async function readForeignKeyShapes(
  sql: PostgreSqlTestContext["sql"],
): Promise<RelationForeignKey[]> {
  return sql<RelationForeignKey[]>`
    select child_table.relname as child_table, parent_table.relname as parent_table,
      child_columns.columns as child_columns, parent_columns.columns as parent_columns
    from pg_constraint definition
    join pg_class child_table on child_table.oid = definition.conrelid
    join pg_class parent_table on parent_table.oid = definition.confrelid
    cross join lateral (select array_agg(a.attname order by k.n) columns
      from unnest(definition.conkey) with ordinality k(attnum, n)
      join pg_attribute a on a.attrelid = child_table.oid and a.attnum = k.attnum) child_columns
    cross join lateral (select array_agg(a.attname order by k.n) columns
      from unnest(definition.confkey) with ordinality k(attnum, n)
      join pg_attribute a on a.attrelid = parent_table.oid and a.attnum = k.attnum) parent_columns
    where definition.contype = 'f'
  `;
}

async function seedEvidenceFixture(sql: PostgreSqlTestContext["sql"]): Promise<void> {
  const id = EVIDENCE_IDS;
  await sql`insert into tenants (id, slug, display_name) values (${id.tenant}, 'evidence-fixture', 'Evidence fixture')`;
  await sql`insert into principals (id, tenant_id, kind, display_label, status) values
    (${id.operator}, ${id.tenant}, 'operator', 'Operator', 'active'),
    (${id.returning}, ${id.tenant}, 'returning_member', 'Returning', 'active')`;
  await sql`insert into cases (id, tenant_id, fixture_key, title, status, returning_principal_id,
    created_by, retention_until) values (${id.case}, ${id.tenant}, 'evidence-case', 'Evidence case',
    'active', ${id.returning}, ${id.operator}, now() + interval '1 day')`;
  await sql`insert into project_rooms (id, tenant_id, case_id, display_name)
    values (${id.room}, ${id.tenant}, ${id.case}, 'Case room')`;
  await sql`insert into cases (id, tenant_id, fixture_key, title, status, returning_principal_id,
    created_by, retention_until) values (${id.otherCase}, ${id.tenant}, 'other-case', 'Other case',
    'active', ${id.returning}, ${id.operator}, now() + interval '1 day')`;
  await sql`insert into project_rooms (id, tenant_id, case_id, display_name)
    values (${id.otherRoom}, ${id.tenant}, ${id.otherCase}, 'Other room')`;
}

function insertAuthorization(
  sql: PostgreSqlTestContext["sql"],
  principalId: string,
  authorizationId: string,
) {
  const id = EVIDENCE_IDS;
  return sql`insert into access_authorizations (id, tenant_id, case_id, principal_id,
    authorized_role, authorized_by, expires_at) values (${authorizationId}, ${id.tenant},
    ${id.case}, ${principalId}, 'speaker', ${id.operator}, now() + interval '1 hour') returning id`;
}

function insertAccessEvent(
  sql: PostgreSqlTestContext["sql"],
  principalId: string,
  afterRole: string,
  roomId: string,
) {
  const id = EVIDENCE_IDS;
  const beforeRole = afterRole === "listener" ? "speaker" : "listener";
  return sql`insert into access_events (tenant_id, case_id, room_id, principal_id, before_role,
    after_role, authorization_id, operation_id) values (${id.tenant}, ${id.case}, ${roomId},
    ${principalId}, ${beforeRole}, ${afterRole}, ${id.authorization}, gen_random_uuid()) returning id`;
}

async function expectTenantColumns(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'tenant_id'
      and is_nullable = 'NO'
  `;
  const tablesWithTenant = new Set(rows.map(({ table_name }) => table_name));

  for (const table of TENANT_OWNED_TABLES) {
    expect(tablesWithTenant.has(table), `${table} must own tenant_id`).toBe(true);
  }
}

async function expectTenantForeignKeys(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<TenantForeignKey[]>`
    select constraint_definition.conname as constraint_name,
      child_table.relname as child_table,
      parent_table.relname as parent_table,
      child_columns.columns as child_columns,
      parent_columns.columns as parent_columns
    from pg_constraint constraint_definition
    join pg_class child_table on child_table.oid = constraint_definition.conrelid
    join pg_class parent_table on parent_table.oid = constraint_definition.confrelid
    cross join lateral (
      select array_agg(attribute.attname order by key_column.ordinality) as columns
      from unnest(constraint_definition.conkey) with ordinality key_column(attnum, ordinality)
      join pg_attribute attribute on attribute.attrelid = child_table.oid
        and attribute.attnum = key_column.attnum
    ) child_columns
    cross join lateral (
      select array_agg(attribute.attname order by key_column.ordinality) as columns
      from unnest(constraint_definition.confkey) with ordinality key_column(attnum, ordinality)
      join pg_attribute attribute on attribute.attrelid = parent_table.oid
        and attribute.attnum = key_column.attnum
    ) parent_columns
    where constraint_definition.contype = 'f'
      and exists (select 1 from pg_attribute where attrelid = parent_table.oid and attname = 'tenant_id')
  `;

  for (const row of rows) {
    expect(row.child_columns, `${row.constraint_name} child tenant key`).toContain("tenant_id");
    expect(row.parent_columns, `${row.constraint_name} parent tenant key`).toContain("tenant_id");
  }
}

async function expectOutboxProvenance(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<ForeignKeyShape[]>`
    select child_columns.columns as child_columns,
      parent_columns.columns as parent_columns,
      parent_table.relname as parent_table
    from pg_constraint constraint_definition
    join pg_class child_table on child_table.oid = constraint_definition.conrelid
    join pg_class parent_table on parent_table.oid = constraint_definition.confrelid
    cross join lateral (
      select array_agg(attribute.attname order by key_column.ordinality) as columns
      from unnest(constraint_definition.conkey) with ordinality key_column(attnum, ordinality)
      join pg_attribute attribute on attribute.attrelid = child_table.oid
        and attribute.attnum = key_column.attnum
    ) child_columns
    cross join lateral (
      select array_agg(attribute.attname order by key_column.ordinality) as columns
      from unnest(constraint_definition.confkey) with ordinality key_column(attnum, ordinality)
      join pg_attribute attribute on attribute.attrelid = parent_table.oid
        and attribute.attnum = key_column.attnum
    ) parent_columns
    where constraint_definition.contype = 'f' and child_table.relname = 'outbox_jobs'
  `;
  const provenance = rows.find(({ parent_table }) => parent_table === "domain_events");

  expect(provenance?.child_columns).toEqual(expect.arrayContaining(["tenant_id", "source_event_id", "source_lane"]));
  expect(provenance?.parent_columns).toEqual(expect.arrayContaining(["tenant_id", "id", "lane"]));
}

async function expectLogicalInvitationIdentity(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<{ is_nullable: string }[]>`
    select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'contact_invitations'
      and column_name = 'logical_invitation_id'
  `;

  expect(rows).toEqual([{ is_nullable: "NO" }]);
}

async function expectAccessEvidenceConstraint(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<{ definition: string }[]>`
    select pg_get_constraintdef(oid) as definition from pg_constraint
    where conrelid = 'access_workflows'::regclass and contype = 'c'
  `;
  const definitions = rows.map(({ definition }) => definition.toLowerCase());

  expect(definitions.some((definition) =>
    definition.includes("access_applied")
      && definition.includes("authorization_id")
      && definition.includes("access_event_id"),
  )).toBe(true);
  expect(definitions.some((definition) =>
    definition.includes("authorization_id is null")
      && definition.includes("access_event_id is null"),
  )).toBe(true);
}

async function expectTables(sql: PostgreSqlTestContext["sql"]): Promise<void> {
  const rows = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;
  const actual = rows.map(({ table_name }) => table_name);

  expect(actual).toEqual(expect.arrayContaining([...REQUIRED_TABLES, ...REQUIRED_DEMO_TABLES]));
}

async function expectCriticalUniqueIndexes(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<{ columns: string[]; table_name: string }[]>`
    select
      table_relation.relname as table_name,
      array_agg(attribute.attname order by key_column.ordinality) as columns
    from pg_index index_definition
    join pg_class table_relation
      on table_relation.oid = index_definition.indrelid
    join pg_namespace schema_definition
      on schema_definition.oid = table_relation.relnamespace
    join lateral unnest(index_definition.indkey)
      with ordinality as key_column(attribute_number, ordinality) on true
    join pg_attribute attribute
      on attribute.attrelid = table_relation.oid
      and attribute.attnum = key_column.attribute_number
    where schema_definition.nspname = 'public'
      and index_definition.indisunique
    group by table_relation.relname, index_definition.indexrelid
  `;
  const signatures = new Set(
    rows.map(({ columns, table_name }) => `${table_name}(${columns.join(",")})`),
  );

  for (const [table, columns] of REQUIRED_UNIQUE_INDEXES) {
    const signature = `${table}(${columns.join(",")})`;
    expect(signatures.has(signature), `${signature} must be unique`).toBe(true);
  }
}

async function expectOutboxPartialIndexes(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<{ definition: string }[]>`
    select pg_get_indexdef(index_relation.oid) as definition
    from pg_index index_definition
    join pg_class table_relation
      on table_relation.oid = index_definition.indrelid
    join pg_class index_relation
      on index_relation.oid = index_definition.indexrelid
    join pg_namespace schema_definition
      on schema_definition.oid = table_relation.relnamespace
    where schema_definition.nspname = 'public'
      and table_relation.relname = 'outbox_jobs'
      and index_definition.indpred is not null
  `;
  const definitions = rows.map(({ definition }) => definition.toLowerCase());

  expect(definitions.some((definition) => definition.includes("available_at"))).toBe(true);
  expect(definitions.some((definition) => definition.includes("locked_until"))).toBe(true);
}

async function expectOutboxLaneConstraint(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<{ definition: string }[]>`
    select pg_get_constraintdef(constraint_definition.oid) as definition
    from pg_constraint constraint_definition
    join pg_class table_definition
      on table_definition.oid = constraint_definition.conrelid
    where table_definition.relname = 'outbox_jobs'
      and constraint_definition.contype = 'c'
  `;
  const definitions = rows.map(({ definition }) => definition.toLowerCase());

  expect(
    definitions.some((definition) =>
      definition.includes("source_lane")
      && definition.includes("apply_room_access")
      && definition.includes("job_type"),
    ),
  ).toBe(true);
}

async function expectLaneSeparation(
  sql: PostgreSqlTestContext["sql"],
): Promise<void> {
  const rows = await sql<{ column_name: string; table_name: string }[]>`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('access_workflows', 'contact_workflows')
  `;
  const accessColumns = rows
    .filter(({ table_name }) => table_name === "access_workflows")
    .map(({ column_name }) => column_name);
  const contactColumns = rows
    .filter(({ table_name }) => table_name === "contact_workflows")
    .map(({ column_name }) => column_name);

  expect(accessColumns).not.toContain("contact_workflow_id");
  expect(contactColumns).not.toContain("access_workflow_id");
  expect(contactColumns).not.toContain("room_role");
}

interface ForeignKeyShape {
  child_columns: string[];
  parent_columns: string[];
  parent_table: string;
}

interface TenantForeignKey extends ForeignKeyShape {
  child_table: string;
  constraint_name: string;
}

interface RelationForeignKey extends ForeignKeyShape {
  child_table: string;
}

const EVIDENCE_IDS = {
  authorization: "a1000000-0000-4000-8000-000000000001",
  badAuthorization: "a1000000-0000-4000-8000-000000000002",
  case: "c1000000-0000-4000-8000-000000000001",
  operator: "b1000000-0000-4000-8000-000000000001",
  otherCase: "c1000000-0000-4000-8000-000000000002",
  otherRoom: "d1000000-0000-4000-8000-000000000002",
  returning: "b1000000-0000-4000-8000-000000000002",
  room: "d1000000-0000-4000-8000-000000000001",
  tenant: "e1000000-0000-4000-8000-000000000001",
} as const;
