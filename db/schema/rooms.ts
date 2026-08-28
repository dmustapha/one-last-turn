import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { cases } from "./cases";
import { principals, tenants } from "./identity";

const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const projectRooms = pgTable(
  "project_rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("project_rooms_case_unique").on(table.caseId),
    uniqueIndex("project_rooms_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("project_rooms_tenant_case_id_unique").on(table.tenantId, table.caseId, table.id),
    check("project_rooms_status_valid", sql`${table.status} in ('active', 'archived')`),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "project_rooms_case_fk",
    }).onDelete("cascade"),
  ],
);

export const roomMemberships = pgTable(
  "room_memberships",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    roomId: uuid("room_id").notNull(),
    principalId: uuid("principal_id").notNull(),
    role: text("role").notNull(),
    version: integer("version").default(1).notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.principalId] }),
    uniqueIndex("room_memberships_tenant_key_unique")
      .on(table.tenantId, table.roomId, table.principalId),
    check("room_memberships_role_valid", sql`${table.role} in ('listener', 'speaker')`),
    check("room_memberships_version_valid", sql`${table.version} > 0`),
    foreignKey({
      columns: [table.tenantId, table.roomId],
      foreignColumns: [projectRooms.tenantId, projectRooms.id],
      name: "room_memberships_room_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "room_memberships_principal_fk",
    }).onDelete("cascade"),
  ],
);
