import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  interval,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { cases } from "./cases";
import { bytea, capabilityChallenges, principals, tenants } from "./identity";

const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const contactWorkflows = pgTable(
  "contact_workflows",
  {
    caseId: uuid("case_id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    consentState: text("consent_state").default("not_asked").notNull(),
    turnState: text("turn_state").default("not_invited").notNull(),
    boundaryVersion: integer("boundary_version").default(0).notNull(),
    messageAttemptCount: integer("message_attempt_count").default(0).notNull(),
    latestObservationId: uuid("latest_observation_id"),
    stateVersion: integer("state_version").default(0).notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "contact_workflows_consent_state_valid",
      sql`${table.consentState} in ('not_asked', 'granted', 'declined', 'withdrawn', 'no_contact')`,
    ),
    check(
      "contact_workflows_turn_state_valid",
      sql`${table.turnState} in ('not_invited', 'invited', 'boundary_saved', 'evaluating', 'revise', 'abstained', 'room_open', 'completed', 'aborted', 'reported', 'expired')`,
    ),
    check("contact_workflows_boundary_version_valid", sql`${table.boundaryVersion} >= 0`),
    check("contact_workflows_attempt_count_valid", sql`${table.messageAttemptCount} between 0 and 2`),
    check("contact_workflows_state_version_valid", sql`${table.stateVersion} >= 0`),
    uniqueIndex("contact_workflows_tenant_case_unique").on(table.tenantId, table.caseId),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "contact_workflows_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.latestObservationId],
      foreignColumns: [contactObservations.tenantId, contactObservations.id],
      name: "contact_workflows_observation_fk",
    }).onDelete("set null"),
  ],
);

export const consentEvents = pgTable(
  "consent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    principalId: uuid("principal_id").notNull(),
    scope: text("scope").notNull(),
    decision: text("decision").notNull(),
    disclosureVersion: text("disclosure_version").notNull(),
    privacyNoticeVersion: text("privacy_notice_version").notNull(),
    provider: text("provider").notNull(),
    dataCategories: text("data_categories").array().notNull(),
    projectionDigest: bytea("projection_digest"),
    recordedAt: utcTimestamp("recorded_at").defaultNow().notNull(),
    effectiveUntil: utcTimestamp("effective_until"),
    supersedesEventId: uuid("supersedes_event_id"),
  },
  (table) => [
    check(
      "consent_events_scope_valid",
      sql`${table.scope} in ('email_contact', 'persistent_processing', 'bounded_turn')`,
    ),
    check(
      "consent_events_decision_valid",
      sql`${table.decision} in ('granted', 'declined', 'withdrawn', 'no_contact')`,
    ),
    uniqueIndex("consent_events_tenant_id_unique").on(table.tenantId, table.id),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "consent_events_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "consent_events_principal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.supersedesEventId],
      foreignColumns: [table.tenantId, table.id],
      name: "consent_events_supersedes_fk",
    }).onDelete("restrict"),
  ],
);

export const contactBoundaries = pgTable(
  "contact_boundaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    version: integer("version").notNull(),
    sourceCiphertext: bytea("source_ciphertext").notNull(),
    projectionCiphertext: bytea("projection_ciphertext").notNull(),
    projectionDigest: bytea("projection_digest").notNull(),
    approvedBy: uuid("approved_by").notNull(),
    consentEventId: uuid("consent_event_id").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    purgedAt: utcTimestamp("purged_at"),
  },
  (table) => [
    uniqueIndex("contact_boundaries_case_version_unique").on(table.caseId, table.version),
    uniqueIndex("contact_boundaries_tenant_id_unique").on(table.tenantId, table.id),
    check("contact_boundaries_version_valid", sql`${table.version} > 0`),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "contact_boundaries_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.approvedBy],
      foreignColumns: [principals.tenantId, principals.id],
      name: "contact_boundaries_approved_by_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.consentEventId],
      foreignColumns: [consentEvents.tenantId, consentEvents.id],
      name: "contact_boundaries_consent_fk",
    }).onDelete("restrict"),
  ],
);

export const mindConversations = pgTable(
  "mind_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    lane: text("lane").default("contact").notNull(),
    stableAlias: text("stable_alias").notNull(),
    mindId: text("mind_id").notNull(),
    consentEventId: uuid("consent_event_id").notNull(),
    latestFingerprint: bytea("latest_fingerprint"),
    status: text("status").default("active").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    closedAt: utcTimestamp("closed_at"),
  },
  (table) => [
    uniqueIndex("mind_conversations_alias_unique").on(table.stableAlias),
    uniqueIndex("mind_conversations_case_lane_unique").on(table.caseId, table.lane),
    uniqueIndex("mind_conversations_tenant_id_unique").on(table.tenantId, table.id),
    check("mind_conversations_lane_contact_only", sql`${table.lane} = 'contact'`),
    check("mind_conversations_status_valid", sql`${table.status} in ('active', 'closed', 'failed')`),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "mind_conversations_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.consentEventId],
      foreignColumns: [consentEvents.tenantId, consentEvents.id],
      name: "mind_conversations_consent_fk",
    }).onDelete("restrict"),
  ],
);

export const mindExchanges = pgTable(
  "mind_exchanges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    conversationId: uuid("conversation_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    purpose: text("purpose").notNull(),
    inputDigest: bytea("input_digest").notNull(),
    messageId: text("message_id"),
    replyId: text("reply_id"),
    beforeFingerprint: bytea("before_fingerprint"),
    afterFingerprint: bytea("after_fingerprint"),
    decision: text("decision"),
    reasonCode: text("reason_code"),
    schemaVersion: text("schema_version").notNull(),
    cognitionBefore: bytea("cognition_before"),
    cognitionAfter: bytea("cognition_after"),
    startedAt: utcTimestamp("started_at").defaultNow().notNull(),
    completedAt: utcTimestamp("completed_at"),
    failureCode: text("failure_code"),
  },
  (table) => [
    uniqueIndex("mind_exchanges_operation_unique").on(table.operationId),
    uniqueIndex("mind_exchanges_reply_unique").on(table.replyId),
    uniqueIndex("mind_exchanges_tenant_id_unique").on(table.tenantId, table.id),
    check("mind_exchanges_purpose_valid", sql`${table.purpose} in ('open', 'revision', 'history_verification')`),
    check("mind_exchanges_decision_valid", sql`${table.decision} is null or ${table.decision} in ('open', 'revise', 'abstain')`),
    foreignKey({
      columns: [table.tenantId, table.conversationId],
      foreignColumns: [mindConversations.tenantId, mindConversations.id],
      name: "mind_exchanges_conversation_fk",
    }).onDelete("cascade"),
  ],
);

export const contactInvitations = pgTable(
  "contact_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    logicalInvitationId: uuid("logical_invitation_id").notNull(),
    caseId: uuid("case_id").notNull(),
    recipientPrincipalId: uuid("recipient_principal_id").notNull(),
    purpose: text("purpose").notNull(),
    capabilityChallengeId: uuid("capability_challenge_id").notNull(),
    status: text("status").default("queued").notNull(),
    deliveryDeadline: utcTimestamp("delivery_deadline").notNull(),
    verifiedSessionTtl: interval("verified_session_ttl").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    humanVerifiedAt: utcTimestamp("human_verified_at"),
    revokedAt: utcTimestamp("revoked_at"),
  },
  (table) => [
    uniqueIndex("contact_invitations_logical_id_unique")
      .on(table.tenantId, table.logicalInvitationId),
    uniqueIndex("contact_invitations_tenant_id_unique").on(table.tenantId, table.id),
    check(
      "contact_invitations_purpose_valid",
      sql`${table.purpose} in ('contact_choice', 'contact_turn', 'contact_response')`,
    ),
    check(
      "contact_invitations_status_valid",
      sql`${table.status} in ('queued', 'sent', 'delivered', 'verified', 'failed', 'expired', 'revoked')`,
    ),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "contact_invitations_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.recipientPrincipalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "contact_invitations_recipient_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.capabilityChallengeId],
      foreignColumns: [capabilityChallenges.tenantId, capabilityChallenges.id],
      name: "contact_invitations_capability_fk",
    }).onDelete("restrict"),
  ],
);

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    senderPrincipalId: uuid("sender_principal_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    contentCiphertext: bytea("content_ciphertext").notNull(),
    contentDigest: bytea("content_digest").notNull(),
    boundaryVersion: integer("boundary_version").notNull(),
    consentEventId: uuid("consent_event_id").notNull(),
    submittedAt: utcTimestamp("submitted_at").defaultNow().notNull(),
    purgedAt: utcTimestamp("purged_at"),
  },
  (table) => [
    uniqueIndex("contact_messages_attempt_unique")
      .on(table.caseId, table.senderPrincipalId, table.attemptNumber),
    uniqueIndex("contact_messages_tenant_id_unique").on(table.tenantId, table.id),
    check("contact_messages_attempt_valid", sql`${table.attemptNumber} in (1, 2)`),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "contact_messages_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.senderPrincipalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "contact_messages_sender_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.consentEventId],
      foreignColumns: [consentEvents.tenantId, consentEvents.id],
      name: "contact_messages_consent_fk",
    }).onDelete("restrict"),
  ],
);

export const contactObservations = pgTable(
  "contact_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    messageId: uuid("message_id").notNull(),
    mindExchangeId: uuid("mind_exchange_id").notNull(),
    result: text("result").notNull(),
    reasonCode: text("reason_code").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contact_observations_message_unique").on(table.messageId),
    uniqueIndex("contact_observations_tenant_id_unique").on(table.tenantId, table.id),
    check(
      "contact_observations_result_valid",
      sql`${table.result} in ('matches_scope', 'request_revision', 'abstain')`,
    ),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "contact_observations_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.messageId],
      foreignColumns: [contactMessages.tenantId, contactMessages.id],
      name: "contact_observations_message_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.mindExchangeId],
      foreignColumns: [mindExchanges.tenantId, mindExchanges.id],
      name: "contact_observations_exchange_fk",
    }).onDelete("restrict"),
  ],
);

export const turnResponses = pgTable(
  "turn_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull(),
    principalId: uuid("principal_id").notNull(),
    responseKind: text("response_kind").notNull(),
    contentCiphertext: bytea("content_ciphertext"),
    contentDigest: bytea("content_digest"),
    submittedAt: utcTimestamp("submitted_at").defaultNow().notNull(),
    purgedAt: utcTimestamp("purged_at"),
  },
  (table) => [
    uniqueIndex("turn_responses_actor_unique").on(table.caseId, table.principalId),
    uniqueIndex("turn_responses_tenant_id_unique").on(table.tenantId, table.id),
    check("turn_responses_kind_valid", sql`${table.responseKind} in ('message', 'close', 'report')`),
    foreignKey({
      columns: [table.tenantId, table.caseId],
      foreignColumns: [cases.tenantId, cases.id],
      name: "turn_responses_case_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.id],
      name: "turn_responses_principal_fk",
    }).onDelete("restrict"),
  ],
);

export const deliveryMessages = pgTable(
  "delivery_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    invitationId: uuid("invitation_id").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    templateVersion: text("template_version").notNull(),
    recipientHmac: bytea("recipient_hmac").notNull(),
    status: text("status").default("queued").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastFailureCode: text("last_failure_code"),
    sentAt: utcTimestamp("sent_at"),
    providerDeliveredAt: utcTimestamp("provider_delivered_at"),
    bouncedAt: utcTimestamp("bounced_at"),
  },
  (table) => [
    uniqueIndex("delivery_messages_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("delivery_messages_provider_message_unique")
      .on(table.provider, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    check("delivery_messages_provider_valid", sql`${table.provider} = 'resend'`),
    check(
      "delivery_messages_status_valid",
      sql`${table.status} in ('queued', 'sent', 'delivered', 'bounced', 'failed')`,
    ),
    foreignKey({
      columns: [table.tenantId, table.invitationId],
      foreignColumns: [contactInvitations.tenantId, contactInvitations.id],
      name: "delivery_messages_invitation_fk",
    }).onDelete("cascade"),
  ],
);

export const providerWebhookEvents = pgTable(
  "provider_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadDigest: bytea("payload_digest").notNull(),
    receivedAt: utcTimestamp("received_at").defaultNow().notNull(),
    processedAt: utcTimestamp("processed_at"),
    failureCode: text("failure_code"),
  },
  (table) => [
    uniqueIndex("provider_webhook_events_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("provider_webhook_events_provider_id_unique")
      .on(table.provider, table.providerEventId),
    index("provider_webhook_events_processing_idx").on(table.processedAt),
    check("provider_webhook_events_provider_valid", sql`${table.provider} = 'resend'`),
  ],
);
