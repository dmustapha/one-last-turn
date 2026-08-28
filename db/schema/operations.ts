import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { cases } from "./cases";
import { bytea, principals, tenants } from "./identity";

const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    actorId: uuid("actor_id").notNull(),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestDigest: bytea("request_digest").notNull(),
    statusCode: integer("status_code").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    resourceId: uuid("resource_id"),
    expiresAt: utcTimestamp("expires_at").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.actorId, table.operation, table.idempotencyKey] }),
    check("idempotency_records_status_code_valid", sql`${table.statusCode} between 100 and 599`),
    foreignKey({
      columns: [table.tenantId, table.actorId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "idempotency_records_actor_fk",
    }).onDelete("cascade"),
  ],
);

export const domainEvents = pgTable(
  "domain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateVersion: integer("aggregate_version").notNull(),
    lane: text("lane").notNull(),
    eventType: text("event_type").notNull(),
    actorId: uuid("actor_id").notNull(),
    requestId: uuid("request_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: utcTimestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("domain_events_aggregate_sequence_unique")
      .on(table.aggregateType, table.aggregateId, table.aggregateVersion),
    uniqueIndex("domain_events_tenant_id_lane_unique").on(table.tenantId, table.id, table.lane),
    check("domain_events_aggregate_version_valid", sql`${table.aggregateVersion} > 0`),
    check(
      "domain_events_lane_matches_aggregate",
      sql`(${table.aggregateType} = 'access_workflow' and ${table.lane} = 'access') or (${table.aggregateType} = 'contact_workflow' and ${table.lane} = 'contact')`,
    ),
    foreignKey({
      columns: [table.tenantId, table.actorId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "domain_events_actor_fk",
    }).onDelete("restrict"),
  ],
);

export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    sourceEventId: uuid("source_event_id").notNull(),
    sourceLane: text("source_lane").notNull(),
    jobType: text("job_type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").default("pending").notNull(),
    availableAt: utcTimestamp("available_at").defaultNow().notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(8).notNull(),
    lockedBy: text("locked_by"),
    lockedUntil: utcTimestamp("locked_until"),
    lastErrorCode: text("last_error_code"),
    completedAt: utcTimestamp("completed_at"),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("outbox_jobs_tenant_job_dedupe_unique")
      .on(table.tenantId, table.jobType, table.dedupeKey),
    uniqueIndex("outbox_jobs_tenant_id_unique").on(table.tenantId, table.id),
    index("outbox_jobs_pending_available_idx")
      .on(table.availableAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    index("outbox_jobs_processing_lock_idx")
      .on(table.lockedUntil, table.id)
      .where(sql`${table.status} = 'processing' and ${table.lockedUntil} is not null`),
    check("outbox_jobs_source_lane_valid", sql`${table.sourceLane} in ('access', 'contact', 'system')`),
    check(
      "outbox_jobs_status_valid",
      sql`${table.status} in ('pending', 'processing', 'completed', 'failed', 'cancelled')`,
    ),
    check(
      "outbox_jobs_access_lane_only",
      sql`${table.jobType} <> 'apply_room_access' or ${table.sourceLane} = 'access'`,
    ),
    foreignKey({
      columns: [table.tenantId, table.sourceEventId, table.sourceLane],
      foreignColumns: [domainEvents.tenantId, domainEvents.id, domainEvents.lane],
      name: "outbox_jobs_event_provenance_fk",
    }).onDelete("cascade"),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    version: integer("version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    projection: jsonb("projection").$type<Record<string, unknown>>().notNull(),
    canonicalDigest: bytea("canonical_digest").notNull(),
    sealedAt: utcTimestamp("sealed_at").defaultNow().notNull(),
    supersedesReceiptId: uuid("supersedes_receipt_id"),
  },
  (table) => [
    uniqueIndex("receipts_case_version_unique").on(table.caseId, table.version),
    uniqueIndex("receipts_tenant_id_unique").on(table.tenantId, table.id),
    check("receipts_version_valid", sql`${table.version} > 0`),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "receipts_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.supersedesReceiptId],
      foreignColumns: [table.tenantId, table.id],
      name: "receipts_supersedes_fk",
    }).onDelete("restrict"),
  ],
);

export const retentionTombstones = pgTable(
  "retention_tombstones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    deletionReason: text("deletion_reason").notNull(),
    priorDigest: bytea("prior_digest").notNull(),
    purgedAt: utcTimestamp("purged_at").defaultNow().notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("retention_tombstones_resource_unique")
      .on(table.tenantId, table.resourceType, table.resourceId),
    check(
      "retention_tombstones_reason_valid",
      sql`${table.deletionReason} in ('retention_expired', 'consent_withdrawn', 'case_closed', 'operator_purge')`,
    ),
  ],
);
