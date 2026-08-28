import type { DatabaseClient, DatabaseSql } from "@/infrastructure/db/client";
import { parseRequestDigest } from "@/domain/shared/request-digest";
import {
  createRepositories,
  type Lane,
  type Repositories,
} from "@/infrastructure/db/repositories";

type WorkflowLane = "access" | "contact";

interface IdempotencyInput {
  key: string;
  requestDigest: string;
}

interface OutboxInput<TType extends string, TLane extends Lane> {
  dedupeKey: string;
  id: string;
  payload: Record<string, unknown>;
  sourceLane: TLane;
  type: TType;
}

interface CommandBase {
  actorId: string;
  caseId: string;
  eventId: string;
  expectedVersion: number;
  idempotency: IdempotencyInput;
  requestId: string;
  tenantId: string;
}

export interface AccessTransitionCommand extends CommandBase {
  event: { type: "access_apply_requested" };
  outbox: OutboxInput<"apply_room_access", "access">;
}

export type ContactTransitionCommand = ContactMessageCommand | ContactAbortCommand;

interface ContactMessageCommand extends CommandBase {
  event: { type: "message_submitted" };
  outbox: OutboxInput<"evaluate_message", "contact">;
}

interface ContactAbortCommand extends CommandBase {
  event: { type: "aborted" };
  outbox: null;
}

interface AccessCommit {
  aggregateVersion: number;
  eventId: string;
  eventType: "access_applied";
  lane: "access";
}

export interface InvitationCommand extends CommandBase {
  accessCommit: AccessCommit;
  outbox: OutboxInput<"deliver_contact_invitation", "contact">;
}

export interface CommitResult {
  aggregateVersion: number;
  eventId: string;
  jobId: string | null;
  replayed: boolean;
}

export interface TransactionRunner {
  commitAccessTransition(command: AccessTransitionCommand): Promise<CommitResult>;
  commitContactInvitation(command: InvitationCommand): Promise<CommitResult>;
  commitContactTransition(command: ContactTransitionCommand): Promise<CommitResult>;
}

export class TransactionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TransactionError";
  }
}

export function createTransactionRunner(input: {
  database: DatabaseClient;
  repositories: Repositories;
}): TransactionRunner {
  void input.repositories;
  return {
    commitAccessTransition: (command) => commitTransition(input.database, "access", command),
    commitContactInvitation: (command) => commitInvitation(input.database, command),
    commitContactTransition: (command) => commitTransition(input.database, "contact", command),
  };
}

async function commitTransition(
  database: DatabaseClient,
  lane: WorkflowLane,
  command: AccessTransitionCommand | ContactTransitionCommand,
): Promise<CommitResult> {
  validateRequestDigest(command.idempotency.requestDigest);
  validateCommandContract(lane, command);
  const operation = `${lane}.transition`;

  return database.sql.begin(async (sql) => {
    const repositories = createRepositories(sql);
    const policy = lane === "access"
      ? "operator"
      : command.event.type === "message_submitted" ? "returning" : "case_participant";
    await assertActorAuthorized(repositories, policy, command);
    const replay = await findReplay(sql, repositories, operation, command);
    if (replay) return replay;

    const current = await lockWorkflow(sql, lane, command);
    const nextState = transitionState(lane, current.state, command.event.type);
    const isDominatingAbort = lane === "contact" && command.event.type === "aborted";
    if (!isDominatingAbort && current.version !== command.expectedVersion) {
      throw new TransactionError("VERSION_CONFLICT");
    }
    if (lane === "access" && current.eligibility_code !== "eligible") {
      throw new TransactionError("ACCESS_NOT_ELIGIBLE");
    }

    const nextVersion = current.version + 1;
    await updateWorkflow(sql, lane, command, nextState, nextVersion);
    await writeEventAndJob(repositories, lane, command, nextVersion);
    if (isDominatingAbort) {
      await repositories.outboxJobs.cancelPendingEvaluations({
        aggregateId: command.caseId,
        tenantId: command.tenantId,
      });
    }

    return saveResult(repositories, operation, command, nextVersion);
  });
}

async function commitInvitation(
  database: DatabaseClient,
  command: InvitationCommand,
): Promise<CommitResult> {
  validateRequestDigest(command.idempotency.requestDigest);
  validateInvitationContract(command);
  const operation = "contact.invitation";

  return database.sql.begin(async (sql) => {
    const repositories = createRepositories(sql);
    await assertActorAuthorized(repositories, "operator", command);
    await assertAccessCommit(repositories, command);
    const replay = await findReplay(sql, repositories, operation, command);
    if (replay) return replay;

    const current = await lockWorkflow(sql, "contact", command);
    if (current.version !== command.expectedVersion) {
      throw new TransactionError("VERSION_CONFLICT");
    }
    if (current.state !== "not_invited") {
      throw new TransactionError("CONTACT_INVALID_TRANSITION");
    }

    const nextVersion = current.version + 1;
    await updateWorkflow(sql, "contact", command, "invited", nextVersion);
    await writeEventAndJob(
      repositories,
      "contact",
      { ...command, event: { type: "invitation_requested", accessCommit: command.accessCommit } },
      nextVersion,
    );
    return saveResult(repositories, operation, command, nextVersion);
  });
}

async function findReplay(
  sql: DatabaseSql,
  repositories: Repositories,
  operation: string,
  command: CommandBase,
): Promise<CommitResult | null> {
  const lockKey = [command.tenantId, command.actorId, operation, command.idempotency.key].join(":");
  await sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const record = await repositories.idempotency.find({
    actorId: command.actorId,
    key: command.idempotency.key,
    operation,
    tenantId: command.tenantId,
  });
  if (!record) return null;
  if (!record.request_digest.equals(parseRequestDigest(command.idempotency.requestDigest))) {
    throw new TransactionError("IDEMPOTENCY_KEY_REUSED");
  }
  return { ...(record.response_body as unknown as CommitResult), replayed: true };
}

function validateRequestDigest(value: string) {
  try {
    parseRequestDigest(value);
  } catch {
    throw new TransactionError("INVALID_REQUEST_DIGEST");
  }
}

async function lockWorkflow(
  sql: DatabaseSql,
  lane: WorkflowLane,
  command: { caseId: string; tenantId: string },
) {
  const table = lane === "access" ? "access_workflows" : "contact_workflows";
  const stateColumn = lane === "access" ? "state" : "turn_state";
  const eligibilityColumn = lane === "access" ? "eligibility_code" : "null::text";
  const rows = await sql.unsafe<{
    eligibility_code: string | null;
    state: string;
    version: number;
  }[]>(
    `select ${stateColumn} as state, state_version as version,
        ${eligibilityColumn} as eligibility_code
       from ${table} where case_id = $1 and tenant_id = $2 for update`,
    [command.caseId, command.tenantId],
  );
  const current = rows[0];
  if (!current) throw new TransactionError("WORKFLOW_NOT_FOUND");
  return current;
}

async function updateWorkflow(
  sql: DatabaseSql,
  lane: WorkflowLane,
  command: { caseId: string; tenantId: string },
  state: string,
  version: number,
) {
  if (lane === "access") {
    await sql`update access_workflows set state = ${state}, state_version = ${version}, updated_at = now()
      where case_id = ${command.caseId} and tenant_id = ${command.tenantId}`;
    return;
  }
  await sql`update contact_workflows set turn_state = ${state}, state_version = ${version}, updated_at = now()
    where case_id = ${command.caseId} and tenant_id = ${command.tenantId}`;
}

async function writeEventAndJob(
  repositories: Repositories,
  lane: WorkflowLane,
  command: CommandBase & {
    event: { type: string; [key: string]: unknown };
    outbox: OutboxInput<string, Lane> | null;
  },
  version: number,
) {
  await repositories.domainEvents.insert({
    actorId: command.actorId,
    aggregateId: command.caseId,
    aggregateType: `${lane}_workflow`,
    aggregateVersion: version,
    eventId: command.eventId,
    eventType: command.event.type,
    lane,
    payload: command.event,
    requestId: command.requestId,
    tenantId: command.tenantId,
  });
  if (!command.outbox) return;
  await repositories.outboxJobs.insert({
    dedupeKey: command.outbox.dedupeKey,
    id: command.outbox.id,
    jobType: command.outbox.type,
    payload: command.outbox.payload,
    sourceEventId: command.eventId,
    sourceLane: command.outbox.sourceLane,
    tenantId: command.tenantId,
  });
}

async function saveResult(
  repositories: Repositories,
  operation: string,
  command: CommandBase & { outbox: { id: string } | null },
  aggregateVersion: number,
): Promise<CommitResult> {
  const result: CommitResult = {
    aggregateVersion,
    eventId: command.eventId,
    jobId: command.outbox?.id ?? null,
    replayed: false,
  };
  await repositories.idempotency.insert({
    actorId: command.actorId,
    key: command.idempotency.key,
    operation,
    requestDigest: command.idempotency.requestDigest,
    response: result,
    tenantId: command.tenantId,
  });
  return result;
}

async function assertAccessCommit(
  repositories: Repositories,
  command: InvitationCommand,
) {
  const reference = command.accessCommit;
  const validReference = reference.lane === "access"
    && reference.eventType === "access_applied"
    && Number.isInteger(reference.aggregateVersion)
    && reference.aggregateVersion > 0;
  if (!validReference) {
    throw new TransactionError("CONTACT_ELIGIBILITY_NOT_COMMITTED");
  }
  const workflow = await repositories.accessWorkflows.lockCommittedEvidence({
    caseId: command.caseId,
    tenantId: command.tenantId,
  });
  const validWorkflow = workflow
    && workflow.state === "access_applied"
    && workflow.eligibilityCode === "eligible"
    && workflow.stateVersion === reference.aggregateVersion
    && workflow.authorizationId !== null
    && workflow.accessEventId !== null
    && workflow.authorizationActive === true
    && workflow.authorizationRevokedAt === null
    && workflow.evidenceReversedAt === null
    && workflow.authorizationPrincipalId === workflow.returningPrincipalId
    && workflow.evidencePrincipalId === workflow.returningPrincipalId
    && workflow.authorizationRole === workflow.evidenceAfterRole;
  if (!validWorkflow) {
    throw new TransactionError("CONTACT_ELIGIBILITY_NOT_COMMITTED");
  }
  const event = await repositories.domainEvents.findById({
    eventId: reference.eventId,
    lock: true,
    tenantId: command.tenantId,
  });
  const valid = event
    && event.tenantId === command.tenantId
    && event.aggregateId === command.caseId
    && event.aggregateType === "access_workflow"
    && event.aggregateVersion === reference.aggregateVersion
    && event.eventType === "access_applied"
    && event.lane === "access";
  if (!valid) throw new TransactionError("CONTACT_ELIGIBILITY_NOT_COMMITTED");
}

function validateCommandContract(
  lane: WorkflowLane,
  command: AccessTransitionCommand | ContactTransitionCommand,
) {
  const eventType = command.event?.type;
  const outbox = command.outbox;
  const matches = lane === "access"
    ? eventType === "access_apply_requested"
      && outbox?.sourceLane === "access" && outbox.type === "apply_room_access"
    : eventType === "message_submitted"
      ? outbox?.sourceLane === "contact" && outbox.type === "evaluate_message"
      : eventType === "aborted" && outbox === null;
  if (!matches) throw new TransactionError("OUTBOX_EVENT_MISMATCH");
}

function validateInvitationContract(command: InvitationCommand) {
  const outbox = command.outbox;
  if (!outbox || outbox.sourceLane !== "contact" || outbox.type !== "deliver_contact_invitation") {
    throw new TransactionError("OUTBOX_EVENT_MISMATCH");
  }
}

function transitionState(lane: WorkflowLane, state: string, eventType: string) {
  if (lane === "access" && state === "brief_published" && eventType === "access_apply_requested") {
    return "access_apply_pending";
  }
  if (lane === "contact" && TERMINAL_CONTACT_STATES.has(state)) {
    throw new TransactionError("CONTACT_TERMINAL_STATE");
  }
  if (lane === "contact" && eventType === "aborted") return "aborted";
  if (lane === "contact" && state === "boundary_saved" && eventType === "message_submitted") {
    return "evaluating";
  }
  throw new TransactionError(lane === "access"
    ? "ACCESS_INVALID_TRANSITION"
    : "CONTACT_INVALID_TRANSITION");
}

async function assertActorAuthorized(
  repositories: Repositories,
  policy: "case_participant" | "operator" | "returning",
  command: { actorId: string; caseId: string; tenantId: string },
) {
  const tenantActive = await repositories.tenants.lockIsActive(command.tenantId);
  if (!tenantActive) throw new TransactionError("TENANT_NOT_ACTIVE");
  const principal = await repositories.principals.lockActiveInTenant({
    principalId: command.actorId,
    tenantId: command.tenantId,
  });
  const caseActors = await repositories.cases.lockActors({
    caseId: command.caseId,
    tenantId: command.tenantId,
  });
  if (!principal || !caseActors || caseActors.status !== "active") {
    throw new TransactionError("ACTOR_NOT_AUTHORIZED");
  }
  if (policy === "returning"
    && (command.actorId !== caseActors.returning_principal_id
      || principal.kind !== "returning_member")) {
    throw new TransactionError("ACTOR_NOT_AUTHORIZED");
  }
  if (policy === "case_participant") {
    const returning = command.actorId === caseActors.returning_principal_id
      && principal.kind === "returning_member";
    const affected = command.actorId === caseActors.affected_principal_id
      && principal.kind === "affected_member";
    if (!returning && !affected) throw new TransactionError("ACTOR_NOT_AUTHORIZED");
  }
  if (policy !== "operator") return;
  const membership = await repositories.tenantMemberships.lockIsActiveOperator({
      principalId: command.actorId,
      tenantId: command.tenantId,
  });
  if (principal.kind !== "operator" || !membership) {
    throw new TransactionError("ACTOR_NOT_AUTHORIZED");
  }
}

const TERMINAL_CONTACT_STATES = new Set([
  "aborted",
  "abstained",
  "completed",
  "declined",
  "expired",
  "no_contact",
  "reported",
]);
