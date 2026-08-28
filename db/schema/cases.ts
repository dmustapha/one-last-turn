import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { bytea, principals, tenants } from "./identity";

const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    fixtureKey: text("fixture_key").notNull(),
    title: text("title").notNull(),
    status: text("status").default("draft").notNull(),
    returningPrincipalId: uuid("returning_principal_id").notNull(),
    affectedPrincipalId: uuid("affected_principal_id"),
    createdBy: uuid("created_by").notNull(),
    retentionUntil: utcTimestamp("retention_until").notNull(),
    closedAt: utcTimestamp("closed_at"),
    closeReason: text("close_reason"),
    stateVersion: integer("state_version").default(1).notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cases_fixture_key_unique").on(table.tenantId, table.fixtureKey),
    uniqueIndex("cases_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("cases_tenant_returning_unique")
      .on(table.tenantId, table.id, table.returningPrincipalId),
    check("cases_status_valid", sql`${table.status} in ('draft', 'active', 'closed', 'purged')`),
    check("cases_state_version_valid", sql`${table.stateVersion} > 0`),
    foreignKey({
      columns: [table.tenantId, table.returningPrincipalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "cases_returning_principal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.affectedPrincipalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "cases_affected_principal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.createdBy],
      foreignColumns: [principals.tenantId, principals.id],
      name: "cases_created_by_fk",
    }).onDelete("restrict"),
  ],
);

export const reentryTerms = pgTable(
  "reentry_terms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    version: integer("version").notNull(),
    termsCiphertext: bytea("terms_ciphertext").notNull(),
    termsDigest: bytea("terms_digest").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    supersededAt: utcTimestamp("superseded_at"),
  },
  (table) => [
    uniqueIndex("reentry_terms_case_version_unique").on(table.caseId, table.version),
    uniqueIndex("reentry_terms_tenant_id_unique").on(table.tenantId, table.id),
    check("reentry_terms_version_valid", sql`${table.version} > 0`),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "reentry_terms_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.createdBy],
      foreignColumns: [principals.tenantId, principals.id],
      name: "reentry_terms_created_by_fk",
    }).onDelete("restrict"),
  ],
);
