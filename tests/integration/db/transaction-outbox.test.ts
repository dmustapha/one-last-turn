import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  IDS,
  installOutboxFailureTrigger,
  requestDigest,
  resetTransactionDatabase,
  seedAccessEvidence,
  seedCase,
  startTransactionHarness,
  stopTransactionHarness,
  type TransactionTestHarness,
} from "../helpers/transaction-harness";

describe("transaction runner and outbox", () => {
  let harness: TransactionTestHarness | undefined;

  beforeAll(async () => {
    harness = await startTransactionHarness();
  }, 60_000);

  beforeEach(async () => {
    await resetTransactionDatabase(requireHarness().container.sql);
  });

  afterAll(async () => {
    await stopTransactionHarness(harness);
  });

  it("atomically writes aggregate state, one event, and one lane-safe outbox job", async () => {
    const current = requireHarness();
    await seedCase(current.repositories);

    const result = await current.runner.commitAccessTransition(accessCommand());

    expect(result).toMatchObject({
      aggregateVersion: 3,
      eventId: IDS.accessEvent,
      jobId: IDS.accessJob,
    });
    await expectAccessSnapshot(current, {
      eventCount: 1,
      jobCount: 1,
      state: "access_apply_pending",
      version: 3,
    });
  });

  it("rolls back aggregate and event writes when the outbox insert fails", async () => {
    const current = requireHarness();
    await seedCase(current.repositories);
    const command = accessCommand({ dedupeKey: "force-outbox-failure" });
    await installOutboxFailureTrigger(
      current.container.sql,
      command.outbox.dedupeKey,
    );

    await expect(current.runner.commitAccessTransition(command)).rejects.toThrow(
      /forced outbox failure/i,
    );
    await expectAccessSnapshot(current, {
      eventCount: 0,
      jobCount: 0,
      state: "brief_published",
      version: 2,
    });
  });

  it("rejects a contact event that attempts to authorize general room access", async () => {
    const current = requireHarness();
    await seedCase(current.repositories, {
      contactState: "boundary_saved",
      contactVersion: 4,
    });
    const unsafeJob = JSON.parse(JSON.stringify({
      dedupeKey: "contact-cannot-apply-access",
      id: IDS.contactJob,
      payload: { caseId: IDS.case, roomId: IDS.room },
      sourceLane: "contact",
      type: "apply_room_access",
    }));

    await expect(current.runner.commitContactTransition({
      actorId: IDS.returning,
      caseId: IDS.case,
      event: { type: "message_submitted" },
      eventId: IDS.contactEvent,
      expectedVersion: 4,
      idempotency: {
        key: "contact-illegal-access-job",
        requestDigest: requestDigest("contact-illegal-access-job"),
      },
      outbox: unsafeJob,
      requestId: IDS.request,
      tenantId: IDS.tenant,
    })).rejects.toMatchObject({ code: "OUTBOX_EVENT_MISMATCH" });

    await expectContactSnapshot(current, {
      eventCount: 0,
      jobCount: 0,
      state: "boundary_saved",
      version: 4,
    });
  });

  it.each([
    ["another tenant", { tenantId: "90000000-0000-4000-8000-000000000099" }],
    ["another case", { caseId: "40000000-0000-4000-8000-000000000099" }],
    ["another aggregate version", { aggregateVersion: 8 }],
    ["a non-access-applied event", { eventType: "access_apply_requested" }],
  ])("rejects an invitation referencing a committed event from %s", async (_label, change) => {
    const current = requireHarness();
    await seedCase(current.repositories, {
      accessState: "access_applied",
      accessVersion: 7,
    }, current.container.sql);
    await seedCommittedAccessEvent(current, change);

    await expect(current.runner.commitContactInvitation(invitationCommand())).rejects
      .toMatchObject({ code: "CONTACT_ELIGIBILITY_NOT_COMMITTED" });
    await expectContactSnapshot(current, {
      eventCount: 0,
      jobCount: 0,
      state: "not_invited",
      version: 0,
    });
  });

  it("creates an invitation only from the matching committed access event", async () => {
    const current = requireHarness();
    await seedCase(current.repositories, {
      accessState: "access_applied",
      accessVersion: 7,
    }, current.container.sql);
    await seedCommittedAccessEvent(current);

    const result = await current.runner.commitContactInvitation(invitationCommand());

    expect(result).toMatchObject({
      aggregateVersion: 1,
      eventId: IDS.contactEvent,
      jobId: IDS.contactJob,
    });
    await expectContactSnapshot(current, {
      eventCount: 1,
      jobCount: 1,
      state: "invited",
      version: 1,
    });
  });

  it.each([
    ["missing access job", () => ({ ...accessCommand(), outbox: null })],
    ["wrong access job", () => unsafeCommand(accessCommand(), { type: "evaluate_message" })],
  ])("rejects %s before writing", async (_label, command) => {
    const current = requireHarness();
    await seedCase(current.repositories);

    await expect(current.runner.commitAccessTransition(command())).rejects
      .toMatchObject({ code: "OUTBOX_EVENT_MISMATCH" });
    await expectAccessSnapshot(current, {
      eventCount: 0,
      jobCount: 0,
      state: "brief_published",
      version: 2,
    });
  });

  it.each([
    ["missing evaluation job", () => ({ ...messageCommand(), outbox: null })],
    ["wrong evaluation job", () => unsafeCommand(messageCommand(), { type: "deliver_contact_invitation" })],
    ["an abort with a job", () => unsafeCommand(abortCommand(), messageCommand().outbox)],
  ])("rejects %s for a contact transition", async (_label, command) => {
    const current = requireHarness();
    await seedCase(current.repositories, { contactState: "boundary_saved", contactVersion: 4 });

    await expect(current.runner.commitContactTransition(command())).rejects
      .toMatchObject({ code: "OUTBOX_EVENT_MISMATCH" });
  });

  it.each([
    ["missing invitation job", () => ({ ...invitationCommand(), outbox: null })],
    ["wrong invitation job", () => unsafeCommand(invitationCommand(), { type: "evaluate_message" })],
  ])("rejects %s", async (_label, command) => {
    const current = requireHarness();
    await seedCase(
      current.repositories,
      { accessState: "access_applied", accessVersion: 7 },
      current.container.sql,
    );
    await seedCommittedAccessEvent(current);

    await expect(current.runner.commitContactInvitation(command())).rejects
      .toMatchObject({ code: "OUTBOX_EVENT_MISMATCH" });
  });

  it("requires persisted eligible access state", async () => {
    const current = requireHarness();
    await seedCase(current.repositories, { accessEligibility: "ineligible" });

    await expect(current.runner.commitAccessTransition(accessCommand())).rejects
      .toMatchObject({ code: "ACCESS_NOT_ELIGIBLE" });
    await expectAccessSnapshot(current, {
      eventCount: 0,
      jobCount: 0,
      state: "brief_published",
      version: 2,
    });
  });

  it("rejects a malformed request digest before writing", async () => {
    const current = requireHarness();
    await seedCase(current.repositories);
    const command = accessCommand();

    await expect(current.runner.commitAccessTransition({
      ...command,
      idempotency: { ...command.idempotency, requestDigest: "sha256:not-a-digest" },
    })).rejects.toMatchObject({ code: "INVALID_REQUEST_DIGEST" });
    await expectAccessSnapshot(current, {
      eventCount: 0,
      jobCount: 0,
      state: "brief_published",
      version: 2,
    });
  });

  it.each([
    ["missing operator membership", { withOperatorMembership: false }],
    ["inactive principal", { actorStatus: "revoked" as const }],
  ])("rejects access from an actor with %s", async (_label, seed) => {
    const current = requireHarness();
    await seedCase(current.repositories, seed);

    await expect(current.runner.commitAccessTransition(accessCommand())).rejects
      .toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
  });

  it("requires an active operator membership to create contact invitations", async () => {
    const current = requireHarness();
    await seedCase(current.repositories, {
      accessState: "access_applied",
      accessVersion: 7,
      withOperatorMembership: false,
    }, current.container.sql);
    await seedCommittedAccessEvent(current);

    await expect(current.runner.commitContactInvitation(invitationCommand())).rejects
      .toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
  });

  it("allows the returning case participant to submit the bounded message", async () => {
    const current = requireHarness();
    await seedCase(current.repositories, { contactState: "boundary_saved", contactVersion: 4 });

    await expect(current.runner.commitContactTransition(messageCommand()))
      .resolves.toMatchObject({ aggregateVersion: 5 });
  });

  it.each([
    ["message", () => messageCommand({ actorId: IDS.actor })],
    ["message from the affected participant", () => messageCommand({ actorId: IDS.affected })],
    ["abort", () => abortCommand({ actorId: IDS.actor })],
  ])("rejects an unrelated case actor for %s", async (_label, command) => {
    const current = requireHarness();
    await seedCase(current.repositories, { contactState: "boundary_saved", contactVersion: 4 });

    await expect(current.runner.commitContactTransition(command())).rejects
      .toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
  });

  it("allows the affected case participant to abort", async () => {
    const current = requireHarness();
    await seedCase(current.repositories, { contactState: "boundary_saved", contactVersion: 4 });

    await expect(current.runner.commitContactTransition(abortCommand({ actorId: IDS.affected })))
      .resolves.toMatchObject({ aggregateVersion: 5 });
  });

  it.each(["access", "invitation", "message", "abort"])(
    "rejects %s commands for a suspended tenant",
    async (kind) => {
      const current = requireHarness();
      await seedCase(current.repositories, {
        accessState: kind === "invitation" ? "access_applied" : "brief_published",
        accessVersion: kind === "invitation" ? 7 : 2,
        contactState: "boundary_saved",
        contactVersion: 4,
        tenantStatus: "suspended",
      }, current.container.sql);
      if (kind === "invitation") await seedCommittedAccessEvent(current);

      const action = kind === "access"
        ? current.runner.commitAccessTransition(accessCommand())
        : kind === "invitation"
          ? current.runner.commitContactInvitation(invitationCommand())
          : current.runner.commitContactTransition(kind === "message" ? messageCommand() : abortCommand());
      await expect(action).rejects.toMatchObject({ code: "TENANT_NOT_ACTIVE" });
    },
  );

  it("requires operator principal kind in addition to active membership", async () => {
    const current = requireHarness();
    await seedCase(current.repositories);
    await current.container.sql`update principals set kind = 'affected_member'
      where tenant_id = ${IDS.tenant} and id = ${IDS.actor}`;

    await expect(current.runner.commitAccessTransition(accessCommand())).rejects
      .toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
  });

  it.each([
    ["returning action", IDS.returning, "affected_member", () => messageCommand()],
    ["affected abort", IDS.affected, "returning_member", () => abortCommand({ actorId: IDS.affected })],
  ])("requires the bound actor kind for %s", async (_label, principalId, kind, command) => {
    const current = requireHarness();
    await seedCase(current.repositories, { contactState: "boundary_saved", contactVersion: 4 });
    await current.container.sql`update principals set kind = ${kind}
      where tenant_id = ${IDS.tenant} and id = ${principalId}`;

    await expect(current.runner.commitContactTransition(command())).rejects
      .toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
  });

  it.each([
    ["stale", { state: "access_applied", stateVersion: 8, withEvidence: true }],
    ["non-applied", { state: "access_apply_pending", stateVersion: 7, withEvidence: true }],
    ["lacking current evidence", { state: "brief_published", stateVersion: 7, withEvidence: false }],
  ])("rejects invitation with %s access workflow provenance", async (_label, evidence) => {
    const current = requireHarness();
    await seedCase(current.repositories, { accessVersion: 7 });
    await seedAccessEvidence(current, evidence);
    await seedCommittedAccessEvent(current);

    await expect(current.runner.commitContactInvitation(invitationCommand())).rejects
      .toMatchObject({ code: "CONTACT_ELIGIBILITY_NOT_COMMITTED" });
  });

  it("rejects expired access authorization evidence", async () => {
    const current = requireHarness();
    await seedCase(
      current.repositories,
      { accessState: "access_applied", accessVersion: 7 },
      current.container.sql,
    );
    await current.container.sql`update access_authorizations
      set created_at = now() - interval '2 days',
          expires_at = now() - interval '1 day'
      where id = ${IDS.accessAuthorization}`;
    await seedCommittedAccessEvent(current);

    await expect(current.runner.commitContactInvitation(invitationCommand())).rejects
      .toMatchObject({ code: "CONTACT_ELIGIBILITY_NOT_COMMITTED" });
  });

  it.each([
    ["authorization principal", (current: TransactionTestHarness) => current.container.sql`
      update access_authorizations set principal_id = ${IDS.affected}
      where id = ${IDS.accessAuthorization}`],
    ["evidence principal", (current: TransactionTestHarness) => current.container.sql`
      update access_events set principal_id = ${IDS.affected}
      where id = ${IDS.appliedRoomEvent}`],
    ["authorization role", (current: TransactionTestHarness) => current.container.sql`
      update access_authorizations set authorized_role = 'listener'
      where id = ${IDS.accessAuthorization}`],
  ])("rejects mismatched %s evidence at DB or runtime", async (_label, mutate) => {
    const current = requireHarness();
    await seedCase(
      current.repositories,
      { accessState: "access_applied", accessVersion: 7 },
      current.container.sql,
    );

    try {
      await mutate(current);
    } catch (error) {
      expect(error).toMatchObject({ code: expect.stringMatching(/^23/) });
      return;
    }
    await seedCommittedAccessEvent(current);
    await expect(current.runner.commitContactInvitation(invitationCommand())).rejects
      .toMatchObject({ code: "CONTACT_ELIGIBILITY_NOT_COMMITTED" });
  });

  it("rejects evidence whose room is rebound to another case at DB or runtime", async () => {
    const current = requireHarness();
    await seedCase(
      current.repositories,
      { accessState: "access_applied", accessVersion: 7 },
      current.container.sql,
    );
    const otherCaseId = "40000000-0000-4000-8000-000000000099";
    await current.repositories.cases.insert({
      affectedPrincipalId: IDS.affected,
      createdBy: IDS.actor,
      fixtureKey: "other-room-case",
      id: otherCaseId,
      returningPrincipalId: IDS.returning,
      stateVersion: 1,
      status: "active",
      tenantId: IDS.tenant,
      title: "Other room case",
    });

    try {
      await current.container.sql`update project_rooms set case_id = ${otherCaseId}
        where id = ${IDS.room}`;
    } catch (error) {
      expect(error).toMatchObject({ code: expect.stringMatching(/^23/) });
      return;
    }
    await seedCommittedAccessEvent(current);
    await expect(current.runner.commitContactInvitation(invitationCommand())).rejects
      .toMatchObject({ code: "CONTACT_ELIGIBILITY_NOT_COMMITTED" });
  });

  it("tenant-scopes event and outbox lookup APIs", async () => {
    const current = requireHarness();
    await seedCase(current.repositories);
    await current.runner.commitAccessTransition(accessCommand());
    const wrongTenant = "90000000-0000-4000-8000-000000000099";

    await expect(current.repositories.domainEvents.findById({
      eventId: IDS.accessEvent,
      tenantId: wrongTenant,
    })).resolves.toBeNull();
    await expect(current.repositories.outboxJobs.listByEventIds({
      eventIds: [IDS.accessEvent],
      tenantId: wrongTenant,
    })).resolves.toEqual([]);
  });

  function requireHarness(): TransactionTestHarness {
    if (!harness) throw new Error("Transaction harness did not start.");
    return harness;
  }
});

function accessCommand(change: { dedupeKey?: string } = {}) {
  return {
    actorId: IDS.actor,
    caseId: IDS.case,
    event: { type: "access_apply_requested" as const },
    eventId: IDS.accessEvent,
    expectedVersion: 2,
    idempotency: {
      key: "apply-access-once",
      requestDigest: requestDigest("apply-access-once"),
    },
    outbox: {
      dedupeKey: change.dedupeKey ?? "apply-access-once",
      id: IDS.accessJob,
      payload: { caseId: IDS.case, roomId: IDS.room, role: "speaker" as const },
      sourceLane: "access" as const,
      type: "apply_room_access" as const,
    },
    requestId: IDS.request,
    tenantId: IDS.tenant,
  };
}

function invitationCommand() {
  return {
    accessCommit: {
      aggregateVersion: 7,
      eventId: IDS.accessEvent,
      eventType: "access_applied" as const,
      lane: "access" as const,
    },
    actorId: IDS.actor,
    caseId: IDS.case,
    eventId: IDS.contactEvent,
    expectedVersion: 0,
    idempotency: {
      key: "invite-contact-once",
      requestDigest: requestDigest("invite-contact-once"),
    },
    outbox: {
      dedupeKey: "invite-contact-once",
      id: IDS.contactJob,
      payload: { caseId: IDS.case },
      sourceLane: "contact" as const,
      type: "deliver_contact_invitation" as const,
    },
    requestId: IDS.request,
    tenantId: IDS.tenant,
  };
}

function messageCommand(change: { actorId?: string } = {}) {
  return {
    actorId: change.actorId ?? IDS.returning,
    caseId: IDS.case,
    event: { type: "message_submitted" as const },
    eventId: IDS.contactEvent,
    expectedVersion: 4,
    idempotency: { key: "message-once", requestDigest: requestDigest("message-once") },
    outbox: {
      dedupeKey: "evaluate-message-once",
      id: IDS.contactJob,
      payload: { caseId: IDS.case },
      sourceLane: "contact" as const,
      type: "evaluate_message" as const,
    },
    requestId: IDS.request,
    tenantId: IDS.tenant,
  };
}

function abortCommand(change: { actorId?: string } = {}) {
  return {
    ...messageCommand(change),
    event: { type: "aborted" as const },
    eventId: "50000000-0000-4000-8000-000000000099",
    idempotency: { key: "abort-once", requestDigest: requestDigest("abort-once") },
    outbox: null,
  };
}

function unsafeCommand<T extends object>(command: T, outbox: object) {
  return JSON.parse(JSON.stringify({ ...command, outbox }));
}

async function seedCommittedAccessEvent(
  harness: TransactionTestHarness,
  change: {
    aggregateVersion?: number;
    caseId?: string;
    eventType?: string;
    tenantId?: string;
  } = {},
): Promise<void> {
  let actorId: string = IDS.actor;
  if (change.tenantId && change.tenantId !== IDS.tenant) {
    actorId = "30000000-0000-4000-8000-000000000098";
    await harness.repositories.tenants.insert({
      id: change.tenantId,
      name: "Mismatched tenant",
    });
    await harness.repositories.principals.insert({
      id: actorId,
      kind: "operator",
      status: "active",
      tenantId: change.tenantId,
    });
  }
  await harness.repositories.domainEvents.insert({
    actorId,
    aggregateId: change.caseId ?? IDS.case,
    aggregateType: "access_workflow",
    aggregateVersion: change.aggregateVersion ?? 7,
    eventId: IDS.accessEvent,
    eventType: change.eventType ?? "access_applied",
    lane: "access",
    payload: {},
    requestId: IDS.request,
    tenantId: change.tenantId ?? IDS.tenant,
  });
}

async function expectAccessSnapshot(
  harness: TransactionTestHarness,
  expected: { eventCount: number; jobCount: number; state: string; version: number },
): Promise<void> {
  const workflow = await harness.repositories.accessWorkflows.findByCase({
    caseId: IDS.case,
    tenantId: IDS.tenant,
  });
  const events = await harness.repositories.domainEvents.listByAggregate({
    aggregateId: IDS.case,
    aggregateType: "access_workflow",
    tenantId: IDS.tenant,
  });
  const jobs = await harness.repositories.outboxJobs.listByEventIds({
    eventIds: events.map(({ eventId }: { eventId: string }) => eventId),
    tenantId: IDS.tenant,
  });

  expect(workflow).toMatchObject({
    state: expected.state,
    stateVersion: expected.version,
  });
  expect(events).toHaveLength(expected.eventCount);
  expect(jobs).toHaveLength(expected.jobCount);
  if (events[0]) {
    expect(events[0]).toMatchObject({
      actorId: IDS.actor,
      aggregateId: IDS.case,
      aggregateType: "access_workflow",
      aggregateVersion: expected.version,
      eventType: "access_apply_requested",
      requestId: IDS.request,
      tenantId: IDS.tenant,
    });
  }
  if (jobs[0]) {
    expect(jobs[0]).toMatchObject({
      jobType: "apply_room_access",
      sourceEventId: events[0]?.eventId,
      sourceLane: "access",
      status: "pending",
    });
  }
}

async function expectContactSnapshot(
  harness: TransactionTestHarness,
  expected: { eventCount: number; jobCount: number; state: string; version: number },
): Promise<void> {
  const workflow = await harness.repositories.contactWorkflows.findByCase({
    caseId: IDS.case,
    tenantId: IDS.tenant,
  });
  const events = await harness.repositories.domainEvents.listByAggregate({
    aggregateId: IDS.case,
    aggregateType: "contact_workflow",
    tenantId: IDS.tenant,
  });
  const jobs = await harness.repositories.outboxJobs.listByEventIds({
    eventIds: events.map(({ eventId }: { eventId: string }) => eventId),
    tenantId: IDS.tenant,
  });

  expect(workflow).toMatchObject({
    state: expected.state,
    stateVersion: expected.version,
  });
  expect(events).toHaveLength(expected.eventCount);
  expect(jobs).toHaveLength(expected.jobCount);
  if (events[0]) {
    expect(events[0]).toMatchObject({
      actorId: IDS.actor,
      aggregateId: IDS.case,
      aggregateType: "contact_workflow",
      aggregateVersion: expected.version,
      requestId: IDS.request,
      tenantId: IDS.tenant,
    });
  }
}
