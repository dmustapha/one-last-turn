import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tenants_slug_unique").on(table.slug),
    check("tenants_slug_lowercase", sql`${table.slug} = lower(${table.slug})`),
    check("tenants_status_valid", sql`${table.status} in ('active', 'suspended', 'deleted')`),
  ],
);

export const principals = pgTable(
  "principals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clerkUserId: text("clerk_user_id"),
    kind: text("kind").notNull(),
    displayLabel: text("display_label").notNull(),
    emailCiphertext: bytea("email_ciphertext"),
    emailLookupHmac: bytea("email_lookup_hmac"),
    emailKeyVersion: integer("email_key_version"),
    status: text("status").default("invited").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    deletedAt: utcTimestamp("deleted_at"),
  },
  (table) => [
    index("principals_tenant_kind_status_idx").on(table.tenantId, table.kind, table.status),
    uniqueIndex("principals_active_email_kind_unique")
      .on(table.tenantId, table.emailLookupHmac, table.kind)
      .where(sql`${table.emailLookupHmac} is not null and ${table.deletedAt} is null`),
    uniqueIndex("principals_clerk_user_unique")
      .on(table.tenantId, table.clerkUserId)
      .where(sql`${table.clerkUserId} is not null and ${table.deletedAt} is null`),
    uniqueIndex("principals_tenant_id_unique").on(table.tenantId, table.id),
    check(
      "principals_kind_valid",
      sql`${table.kind} in ('operator', 'returning_member', 'affected_member')`,
    ),
    check("principals_status_valid", sql`${table.status} in ('invited', 'active', 'revoked', 'deleted')`),
  ],
);

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    principalId: uuid("principal_id").notNull(),
    role: text("role").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.principalId] }),
    check("tenant_memberships_role_valid", sql`${table.role} in ('owner', 'operator')`),
    check(
      "tenant_memberships_status_valid",
      sql`${table.status} in ('active', 'suspended', 'revoked')`,
    ),
    foreignKey({
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "tenant_memberships_principal_fk",
    }).onDelete("cascade"),
  ],
);

export const capabilityChallenges = pgTable(
  "capability_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    principalId: uuid("principal_id").notNull(),
    purpose: text("purpose").notNull(),
    tokenHash: bytea("token_hash").notNull(),
    boundaryVersion: integer("boundary_version").notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    presentedAt: utcTimestamp("presented_at"),
    exchangedAt: utcTimestamp("exchanged_at"),
    revokedAt: utcTimestamp("revoked_at"),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("capability_challenges_token_hash_unique").on(table.tokenHash),
    uniqueIndex("capability_challenges_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("capability_challenges_one_active_unique")
      .on(table.caseId, table.principalId, table.purpose, table.boundaryVersion)
      .where(sql`${table.exchangedAt} is null and ${table.revokedAt} is null`),
    check("capability_challenges_boundary_version_valid", sql`${table.boundaryVersion} >= 0`),
    foreignKey({
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "capability_challenges_principal_fk",
    }).onDelete("cascade"),
  ],
);

export const participantGrants = pgTable(
  "participant_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    principalId: uuid("principal_id").notNull(),
    clerkUserId: text("clerk_user_id").notNull(),
    role: text("role").notNull(),
    allowedActions: text("allowed_actions").array().notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    revokedAt: utcTimestamp("revoked_at"),
  },
  (table) => [
    index("participant_grants_authorization_idx")
      .on(table.tenantId, table.caseId, table.principalId, table.expiresAt)
      .where(sql`${table.revokedAt} is null`),
    check(
      "participant_grants_role_valid",
      sql`${table.role} in ('returning_member', 'affected_member')`,
    ),
    uniqueIndex("participant_grants_tenant_id_unique").on(table.tenantId, table.id),
    foreignKey({
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "participant_grants_principal_fk",
    }).onDelete("cascade"),
  ],
);
