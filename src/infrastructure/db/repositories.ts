import type postgres from "postgres";

import { parseRequestDigest } from "@/domain/shared/request-digest";

import type { DatabaseClient, DatabaseSql } from "./client";

export type Lane = "access" | "contact";

export interface WorkflowRecord {
  accessEventId?: string | null;
  authorizationId?: string | null;
  authorizationActive?: boolean;
  authorizationPrincipalId?: string | null;
  authorizationRole?: string | null;
  authorizationRevokedAt?: Date | null;
  caseId: string;
  eligibilityCode?: "eligible" | "ineligible" | null;
  evidenceReversedAt?: Date | null;
  evidenceAfterRole?: string | null;
  evidencePrincipalId?: string | null;
  returningPrincipalId?: string | null;
  state: string;
  stateVersion: number;
  tenantId: string;
}

export interface DomainEventRecord {
  actorId: string;
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
  eventId: string;
  eventType: string;
  lane: Lane;
  payload: Record<string, unknown>;
  requestId: string;
  tenantId: string;
}

export interface OutboxJobRecord {
  aggregateId?: string;
  id: string;
  jobType: string;
  sourceEventId: string;
  sourceLane: Lane;
  status: string;
  tenantId: string;
}

export interface Repositories {
  accessWorkflows: ReturnType<typeof accessWorkflowRepository>;
  cases: ReturnType<typeof caseRepository>;
  contactWorkflows: ReturnType<typeof contactWorkflowRepository>;
  domainEvents: ReturnType<typeof domainEventRepository>;
  idempotency: ReturnType<typeof idempotencyRepository>;
  outboxJobs: ReturnType<typeof outboxRepository>;
  principals: ReturnType<typeof principalRepository>;
  tenantMemberships: ReturnType<typeof tenantMembershipRepository>;
  tenants: ReturnType<typeof tenantRepository>;
}

export function createRepositories(
  database: DatabaseClient | DatabaseSql,
): Repositories {
  const sql = "sql" in database ? database.sql : database;
  return {
    accessWorkflows: accessWorkflowRepository(sql),
    cases: caseRepository(sql),
    contactWorkflows: contactWorkflowRepository(sql),
    domainEvents: domainEventRepository(sql),
    idempotency: idempotencyRepository(sql),
    outboxJobs: outboxRepository(sql),
    principals: principalRepository(sql),
    tenantMemberships: tenantMembershipRepository(sql),
    tenants: tenantRepository(sql),
  };
}

function tenantRepository(sql: DatabaseSql) {
  return {
    async insert(input: { id: string; name: string; status?: "active" | "suspended" }) {
      const slug = `tenant-${input.id.replaceAll("-", "")}`;
      await sql`insert into tenants (id, slug, display_name, status)
        values (${input.id}, ${slug}, ${input.name}, ${input.status ?? "active"})`;
    },
    async lockIsActive(tenantId: string) {
      const rows = await sql<{ status: string }[]>`select status from tenants
        where id = ${tenantId} for share`;
      return rows[0]?.status === "active";
    },
  };
}

function principalRepository(sql: DatabaseSql) {
  return {
    async insert(input: {
      id: string;
      kind: string;
      status?: "active" | "invited" | "revoked";
      tenantId: string;
    }) {
      await sql`insert into principals (id, tenant_id, kind, display_label, status)
        values (${input.id}, ${input.tenantId}, ${input.kind},
          ${`Principal ${input.id.slice(0, 8)}`}, ${input.status ?? "active"})`;
    },
    async lockActiveInTenant(input: { principalId: string; tenantId: string }) {
      const rows = await sql<{ kind: string }[]>`select kind from principals
        where id = ${input.principalId} and tenant_id = ${input.tenantId}
          and status = 'active' and deleted_at is null for share`;
      return rows[0] ?? null;
    },
  };
}

function tenantMembershipRepository(sql: DatabaseSql) {
  return {
    async insert(input: {
      principalId: string;
      role: "owner" | "operator";
      status: "active" | "suspended" | "revoked";
      tenantId: string;
    }) {
      await sql`insert into tenant_memberships (tenant_id, principal_id, role, status)
        values (${input.tenantId}, ${input.principalId}, ${input.role}, ${input.status})`;
    },
    async lockIsActiveOperator(input: { principalId: string; tenantId: string }) {
      const rows = await sql`select 1 from tenant_memberships
        where tenant_id = ${input.tenantId} and principal_id = ${input.principalId}
          and role in ('owner', 'operator') and status = 'active' for share`;
      return rows.length === 1;
    },
  };
}

function caseRepository(sql: DatabaseSql) {
  return {
    async insert(input: {
      affectedPrincipalId?: string | null;
      createdBy: string;
      fixtureKey: string;
      id: string;
      returningPrincipalId: string;
      stateVersion: number;
      status: string;
      tenantId: string;
      title: string;
    }) {
      await sql`insert into cases (
          id, tenant_id, fixture_key, title, status, returning_principal_id,
          affected_principal_id, created_by, retention_until, state_version
        ) values (
          ${input.id}, ${input.tenantId}, ${input.fixtureKey}, ${input.title},
          ${input.status}, ${input.returningPrincipalId},
          ${input.affectedPrincipalId ?? null}, ${input.createdBy},
          now() + interval '30 days', ${input.stateVersion}
        )`;
    },
    async lockActors(input: { caseId: string; tenantId: string }) {
      const rows = await sql<CaseActorsRow[]>`select returning_principal_id,
          affected_principal_id, status
        from cases where id = ${input.caseId} and tenant_id = ${input.tenantId}
        for share`;
      return rows[0] ?? null;
    },
  };
}

function accessWorkflowRepository(sql: DatabaseSql) {
  return {
    async findByCase(input: { caseId: string; lock?: boolean; tenantId: string }) {
      const lock = input.lock ? sql`for share` : sql``;
      const rows = await sql<WorkflowRow[]>`select case_id, tenant_id, state, state_version,
          eligibility_code, authorization_id, access_event_id
        from access_workflows where case_id = ${input.caseId} and tenant_id = ${input.tenantId}
        ${lock}`;
      return rows[0] ? toWorkflow(rows[0]) : null;
    },
    async lockCommittedEvidence(input: { caseId: string; tenantId: string }) {
      const rows = await sql<WorkflowRow[]>`select w.case_id,
          w.tenant_id, w.state, w.state_version, w.eligibility_code,
          w.authorization_id, w.access_event_id,
          a.expires_at > now() as authorization_active,
          a.principal_id as authorization_principal_id,
          a.authorized_role as authorization_role,
          a.revoked_at as authorization_revoked_at,
          e.principal_id as evidence_principal_id,
          e.after_role as evidence_after_role,
          e.reversed_at as evidence_reversed_at,
          c.returning_principal_id
        from access_workflows as w
        join access_authorizations as a
          on a.tenant_id = w.tenant_id
          and a.case_id = w.case_id
          and a.id = w.authorization_id
        join access_events as e
          on e.tenant_id = w.tenant_id
          and e.case_id = w.case_id
          and e.id = w.access_event_id
          and e.authorization_id = w.authorization_id
        join cases as c
          on c.tenant_id = w.tenant_id and c.id = w.case_id
        join project_rooms as r
          on r.tenant_id = w.tenant_id
          and r.case_id = w.case_id
          and r.id = e.room_id
        where w.case_id = ${input.caseId}
          and w.tenant_id = ${input.tenantId}
        for share of w, a, e, c, r`;
      return rows[0] ? toWorkflow(rows[0]) : null;
    },
    async insert(input: WorkflowRecord) {
      await sql`insert into access_workflows (
          case_id, tenant_id, state, state_version, eligibility_code
        ) values (
          ${input.caseId}, ${input.tenantId}, ${input.state}, ${input.stateVersion},
          ${input.eligibilityCode ?? null}
        )`;
    },
  };
}

function contactWorkflowRepository(sql: DatabaseSql) {
  return {
    async findByCase(input: { caseId: string; tenantId: string }) {
      const rows = await sql<WorkflowRow[]>`select case_id, tenant_id, turn_state as state, state_version
        from contact_workflows where case_id = ${input.caseId} and tenant_id = ${input.tenantId}`;
      return rows[0] ? toWorkflow(rows[0]) : null;
    },
    async insert(input: WorkflowRecord) {
      await sql`insert into contact_workflows (case_id, tenant_id, turn_state, state_version)
        values (${input.caseId}, ${input.tenantId}, ${input.state}, ${input.stateVersion})`;
    },
  };
}

function domainEventRepository(sql: DatabaseSql) {
  return {
    async findById(input: { eventId: string; lock?: boolean; tenantId: string }) {
      const lock = input.lock ? sql`for share` : sql``;
      const rows = await selectDomainEvents(sql, sql`and id = ${input.eventId}
        and tenant_id = ${input.tenantId} ${lock}`);
      return rows[0] ?? null;
    },
    async insert(input: DomainEventRecord) {
      await sql`insert into domain_events (
          id, tenant_id, aggregate_type, aggregate_id, aggregate_version, lane,
          event_type, actor_id, request_id, payload
        ) values (
          ${input.eventId}, ${input.tenantId}, ${input.aggregateType},
          ${input.aggregateId}, ${input.aggregateVersion}, ${input.lane},
          ${input.eventType}, ${input.actorId}, ${input.requestId}, ${sql.json(asJson(input.payload))}
        )`;
    },
    async listByAggregate(input: {
      aggregateId: string;
      aggregateType: string;
      tenantId: string;
    }) {
      return selectDomainEvents(sql, sql`and tenant_id = ${input.tenantId}
        and aggregate_id = ${input.aggregateId}
        and aggregate_type = ${input.aggregateType}
        order by aggregate_version`);
    },
  };
}

function outboxRepository(sql: DatabaseSql) {
  return {
    async cancelPendingEvaluations(input: { aggregateId: string; tenantId: string }) {
      await sql`update outbox_jobs as jobs set status = 'cancelled'
        from domain_events as events
        where jobs.source_event_id = events.id
          and jobs.tenant_id = ${input.tenantId}
          and events.tenant_id = jobs.tenant_id
          and events.aggregate_id = ${input.aggregateId}
          and jobs.source_lane = 'contact'
          and jobs.job_type = 'evaluate_message'
          and jobs.status = 'pending'`;
    },
    async insert(input: {
      dedupeKey: string;
      id: string;
      jobType: string;
      payload: Record<string, unknown>;
      sourceEventId: string;
      sourceLane: Lane;
      tenantId: string;
    }) {
      await sql`insert into outbox_jobs (
          id, tenant_id, source_event_id, source_lane, job_type, dedupe_key, payload
        ) values (
          ${input.id}, ${input.tenantId}, ${input.sourceEventId}, ${input.sourceLane},
          ${input.jobType}, ${input.dedupeKey}, ${sql.json(asJson(input.payload))}
        )`;
    },
    async listByEventIds(input: { eventIds: string[]; tenantId: string }) {
      if (input.eventIds.length === 0) return [];
      return selectOutboxJobs(sql, sql`and jobs.source_event_id in ${sql(input.eventIds)}
        and jobs.tenant_id = ${input.tenantId}
        and events.tenant_id = ${input.tenantId}`);
    },
    async listPending(input: {
      aggregateId: string;
      jobType: string;
      sourceLane: Lane;
      tenantId: string;
    }) {
      return selectOutboxJobs(sql, sql`and events.aggregate_id = ${input.aggregateId}
        and jobs.job_type = ${input.jobType}
        and jobs.source_lane = ${input.sourceLane}
        and jobs.tenant_id = ${input.tenantId}
        and jobs.status = 'pending'`);
    },
  };
}

function idempotencyRepository(sql: DatabaseSql) {
  return {
    async find(input: IdempotencyKey) {
      const rows = await sql<IdempotencyRow[]>`select request_digest, response_body
        from idempotency_records where tenant_id = ${input.tenantId}
          and actor_id = ${input.actorId} and operation = ${input.operation}
          and idempotency_key = ${input.key}`;
      return rows[0] ?? null;
    },
    async insert(input: IdempotencyKey & { requestDigest: string; response: object }) {
      await sql`insert into idempotency_records (
          tenant_id, actor_id, operation, idempotency_key, request_digest,
          status_code, response_body, expires_at
        ) values (
          ${input.tenantId}, ${input.actorId}, ${input.operation}, ${input.key},
          ${parseRequestDigest(input.requestDigest)}, 200, ${sql.json(asJson(input.response))},
          now() + interval '24 hours'
        )`;
    },
    async list(input: IdempotencyKey) {
      return sql`select * from idempotency_records where tenant_id = ${input.tenantId}
        and actor_id = ${input.actorId} and operation = ${input.operation}
        and idempotency_key = ${input.key}`;
    },
  };
}

interface WorkflowRow {
  access_event_id?: string | null;
  authorization_id?: string | null;
  authorization_active?: boolean;
  authorization_principal_id?: string | null;
  authorization_role?: string | null;
  authorization_revoked_at?: Date | null;
  case_id: string;
  state: string;
  state_version: number;
  tenant_id: string;
  eligibility_code?: "eligible" | "ineligible" | null;
  evidence_reversed_at?: Date | null;
  evidence_after_role?: string | null;
  evidence_principal_id?: string | null;
  returning_principal_id?: string | null;
}

interface CaseActorsRow {
  affected_principal_id: string | null;
  returning_principal_id: string;
  status: string;
}

interface IdempotencyKey {
  actorId: string;
  key: string;
  operation: string;
  tenantId: string;
}

interface IdempotencyRow {
  request_digest: Buffer;
  response_body: Record<string, unknown>;
}

function toWorkflow(row: WorkflowRow): WorkflowRecord {
  return {
    accessEventId: row.access_event_id ?? null,
    authorizationId: row.authorization_id ?? null,
    authorizationActive: row.authorization_active ?? false,
    authorizationPrincipalId: row.authorization_principal_id ?? null,
    authorizationRole: row.authorization_role ?? null,
    authorizationRevokedAt: row.authorization_revoked_at ?? null,
    caseId: row.case_id,
    eligibilityCode: row.eligibility_code ?? null,
    evidenceReversedAt: row.evidence_reversed_at ?? null,
    evidenceAfterRole: row.evidence_after_role ?? null,
    evidencePrincipalId: row.evidence_principal_id ?? null,
    returningPrincipalId: row.returning_principal_id ?? null,
    state: row.state,
    stateVersion: row.state_version,
    tenantId: row.tenant_id,
  };
}

async function selectDomainEvents(sql: DatabaseSql, filter: ReturnType<DatabaseSql>) {
  const rows = await sql<DomainEventRow[]>`select id, tenant_id, aggregate_type,
      aggregate_id, aggregate_version, lane, event_type, actor_id, request_id, payload
    from domain_events where true ${filter}`;
  return rows.map((row) => ({
    actorId: row.actor_id,
    aggregateId: row.aggregate_id,
    aggregateType: row.aggregate_type,
    aggregateVersion: row.aggregate_version,
    eventId: row.id,
    eventType: row.event_type,
    lane: row.lane,
    payload: row.payload,
    requestId: row.request_id,
    tenantId: row.tenant_id,
  }));
}

interface DomainEventRow {
  actor_id: string;
  aggregate_id: string;
  aggregate_type: string;
  aggregate_version: number;
  event_type: string;
  id: string;
  lane: Lane;
  payload: Record<string, unknown>;
  request_id: string;
  tenant_id: string;
}

async function selectOutboxJobs(sql: DatabaseSql, filter: ReturnType<DatabaseSql>) {
  const rows = await sql<OutboxRow[]>`select jobs.id, jobs.tenant_id,
      jobs.source_event_id, jobs.source_lane, jobs.job_type, jobs.status,
      events.aggregate_id
    from outbox_jobs as jobs
    join domain_events as events
      on events.id = jobs.source_event_id and events.tenant_id = jobs.tenant_id
    where true ${filter} order by jobs.created_at`;
  return rows.map((row) => ({
    aggregateId: row.aggregate_id,
    id: row.id,
    jobType: row.job_type,
    sourceEventId: row.source_event_id,
    sourceLane: row.source_lane,
    status: row.status,
    tenantId: row.tenant_id,
  }));
}

interface OutboxRow {
  aggregate_id: string;
  id: string;
  job_type: string;
  source_event_id: string;
  source_lane: Lane;
  status: string;
  tenant_id: string;
}

function asJson(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}
