import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { cases } from "./cases";
import { principals, tenants } from "./identity";
import { projectRooms } from "./rooms";

const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const accessWorkflows = pgTable(
  "access_workflows",
  {
    caseId: uuid("case_id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    state: text("state").default("draft").notNull(),
    eligibilityCode: text("eligibility_code"),
    effectiveAt: utcTimestamp("effective_at"),
    termsVersion: integer("terms_version"),
    authorizationId: uuid("authorization_id"),
    accessEventId: uuid("access_event_id"),
    stateVersion: integer("state_version").default(1).notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "access_workflows_state_valid",
      sql`${table.state} in ('draft', 'eligibility_recorded', 'brief_published', 'access_apply_pending', 'access_applied', 'access_apply_failed')`,
    ),
    check("access_workflows_state_version_valid", sql`${table.stateVersion} > 0`),
    check(
      "access_workflows_evidence_pair",
      sql`(${table.authorizationId} is null) = (${table.accessEventId} is null)`,
    ),
    check(
      "access_workflows_applied_evidence",
      sql`${table.state} <> 'access_applied' or (${table.authorizationId} is not null and ${table.accessEventId} is not null)`,
    ),
    uniqueIndex("access_workflows_tenant_case_unique").on(table.tenantId, table.caseId),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "access_workflows_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.caseId, table.authorizationId],
      foreignColumns: [accessAuthorizations.tenantId, accessAuthorizations.caseId, accessAuthorizations.id],
      name: "access_workflows_authorization_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.caseId, table.accessEventId, table.authorizationId],
      foreignColumns: [accessEvents.tenantId, accessEvents.caseId, accessEvents.id, accessEvents.authorizationId],
      name: "access_workflows_event_fk",
    }).onDelete("restrict"),
  ],
);

export const accessAuthorizations = pgTable(
  "access_authorizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    principalId: uuid("principal_id").notNull(),
    authorizedRole: text("authorized_role").notNull(),
    authorizedBy: uuid("authorized_by").notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    revokedAt: utcTimestamp("revoked_at"),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check("access_authorizations_role_valid", sql`${table.authorizedRole} in ('listener', 'speaker')`),
    uniqueIndex("access_authorizations_tenant_case_id_unique").on(table.tenantId, table.caseId, table.id),
    uniqueIndex("access_authorizations_evidence_unique")
      .on(table.tenantId, table.caseId, table.id, table.principalId, table.authorizedRole),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "access_authorizations_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "access_authorizations_principal_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.caseId, table.principalId],
      foreignColumns: [cases.tenantId, cases.id, cases.returningPrincipalId],
      name: "access_authorizations_returning_member_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.authorizedBy],
      foreignColumns: [principals.tenantId, principals.id],
      name: "access_authorizations_authorizer_fk",
    }).onDelete("restrict"),
  ],
);

export const accessEvents = pgTable(
  "access_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    roomId: uuid("room_id").notNull(),
    principalId: uuid("principal_id").notNull(),
    beforeRole: text("before_role").notNull(),
    afterRole: text("after_role").notNull(),
    authorizationId: uuid("authorization_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    appliedAt: utcTimestamp("applied_at").defaultNow().notNull(),
    reversedAt: utcTimestamp("reversed_at"),
  },
  (table) => [
    uniqueIndex("access_events_operation_unique").on(table.operationId),
    uniqueIndex("access_events_tenant_case_evidence_unique")
      .on(table.tenantId, table.caseId, table.id, table.authorizationId),
    check("access_events_before_role_valid", sql`${table.beforeRole} in ('listener', 'speaker')`),
    check("access_events_after_role_valid", sql`${table.afterRole} in ('listener', 'speaker')`),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "access_events_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "access_events_principal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.tenantId,
        table.caseId,
        table.authorizationId,
        table.principalId,
        table.afterRole,
      ],
      foreignColumns: [
        accessAuthorizations.tenantId,
        accessAuthorizations.caseId,
        accessAuthorizations.id,
        accessAuthorizations.principalId,
        accessAuthorizations.authorizedRole,
      ],
      name: "access_events_authorization_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.caseId, table.roomId],
      foreignColumns: [projectRooms.tenantId, projectRooms.caseId, projectRooms.id],
      name: "access_events_room_fk",
    }).onDelete("restrict"),
  ],
);
