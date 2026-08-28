import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  IDS,
  requestDigest,
  resetTransactionDatabase,
  seedCase,
  startTransactionHarness,
  stopTransactionHarness,
  type TransactionTestHarness,
} from "../helpers/transaction-harness";

describe("transaction runner concurrency", () => {
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

  it("returns one logical result for two concurrent identical commands", async () => {
    const current = requireHarness();
    await seedCase(current.repositories);
    const command = accessCommand();

    const [first, second] = await Promise.all([
      current.runner.commitAccessTransition(command),
      current.runner.commitAccessTransition(command),
    ]);

    expect(logicalResult(first)).toEqual(logicalResult(second));
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    await expectSingleAccessWrite(current, 3);
  });

  it("conflicts when concurrent requests reuse a key with different digests", async () => {
    const current = requireHarness();
    await seedCase(current.repositories);
    const first = accessCommand();
    const second = accessCommand({
      eventId: randomUUID(),
      jobId: randomUUID(),
      requestDigest: requestDigest("different-command-body"),
    });

    const settled = await Promise.allSettled([
      current.runner.commitAccessTransition(first),
      current.runner.commitAccessTransition(second),
    ]);

    const successes = settled.filter((result) => result.status === "fulfilled");
    const failures = settled.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      reason: { code: "IDEMPOTENCY_KEY_REUSED" },
      status: "rejected",
    });
    await expectSingleAccessWrite(current, 3);
  });

  it("rejects a stale expected version without writing an event or job", async () => {
    const current = requireHarness();
    await seedCase(current.repositories, { accessVersion: 3 });

    await expect(current.runner.commitAccessTransition(accessCommand()))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expectSingleAccessWrite(current, 3, 0);
  });

  it("makes abort dominate a concurrent message send and leaves no evaluation job pending", async () => {
    const current = requireHarness();
    await seedCase(current.repositories, {
      contactState: "boundary_saved",
      contactVersion: 4,
    });

    const settled = await Promise.allSettled([
      current.runner.commitContactTransition(sendMessageCommand()),
      current.runner.commitContactTransition(abortCommand()),
    ]);

    const workflow = await current.repositories.contactWorkflows.findByCase({
      caseId: IDS.case,
      tenantId: IDS.tenant,
    });
    const pendingEvaluationJobs = await current.repositories.outboxJobs.listPending({
      aggregateId: IDS.case,
      jobType: "evaluate_message",
      sourceLane: "contact",
      tenantId: IDS.tenant,
    });

    expect(workflow).toMatchObject({ state: "aborted" });
    expect(pendingEvaluationJobs).toEqual([]);
    expect(settled[1]).toMatchObject({ status: "fulfilled" });
    const events = await current.repositories.domainEvents.listByAggregate({
      aggregateId: IDS.case,
      aggregateType: "contact_workflow",
      tenantId: IDS.tenant,
    });
    expect(events.filter(({ eventType }) => eventType === "aborted")).toHaveLength(1);
    const evaluationJobs = (await current.repositories.outboxJobs.listByEventIds({
      eventIds: events.map(({ eventId }) => eventId),
      tenantId: IDS.tenant,
    })).filter(({ jobType }) => jobType === "evaluate_message");
    expect(evaluationJobs).toHaveLength(settled[0]?.status === "fulfilled" ? 1 : 0);
    expect(evaluationJobs.every(({ status }) => status === "cancelled")).toBe(true);

    await expect(current.runner.commitContactTransition({
      ...abortCommand(),
      eventId: randomUUID(),
      idempotency: { key: "abort-again", requestDigest: requestDigest("abort-again") },
    })).rejects.toMatchObject({ code: "CONTACT_TERMINAL_STATE" });
    const afterRepeat = await current.repositories.domainEvents.listByAggregate({
      aggregateId: IDS.case,
      aggregateType: "contact_workflow",
      tenantId: IDS.tenant,
    });
    expect(afterRepeat.filter(({ eventType }) => eventType === "aborted")).toHaveLength(1);
  });

  function requireHarness(): TransactionTestHarness {
    if (!harness) throw new Error("Transaction harness did not start.");
    return harness;
  }
});

function accessCommand(
  change: { eventId?: string; jobId?: string; requestDigest?: string } = {},
) {
  return {
    actorId: IDS.actor,
    caseId: IDS.case,
    event: { type: "access_apply_requested" as const },
    eventId: change.eventId ?? IDS.accessEvent,
    expectedVersion: 2,
    idempotency: {
      key: "concurrent-access-command",
      requestDigest: change.requestDigest ?? requestDigest("concurrent-access-command"),
    },
    outbox: {
      dedupeKey: "concurrent-access-command",
      id: change.jobId ?? IDS.accessJob,
      payload: { caseId: IDS.case, roomId: IDS.room, role: "speaker" as const },
      sourceLane: "access" as const,
      type: "apply_room_access" as const,
    },
    requestId: IDS.request,
    tenantId: IDS.tenant,
  };
}

function sendMessageCommand() {
  return {
    actorId: IDS.returning,
    caseId: IDS.case,
    event: { type: "message_submitted" as const },
    eventId: IDS.contactEvent,
    expectedVersion: 4,
    idempotency: {
      key: "send-message",
      requestDigest: requestDigest("send-message"),
    },
    outbox: {
      dedupeKey: "evaluate-message",
      id: IDS.contactJob,
      payload: { caseId: IDS.case },
      sourceLane: "contact" as const,
      type: "evaluate_message" as const,
    },
    requestId: IDS.request,
    tenantId: IDS.tenant,
  };
}

function abortCommand() {
  return {
    actorId: IDS.returning,
    caseId: IDS.case,
    event: { type: "aborted" as const },
    eventId: "50000000-0000-4000-8000-000000000002",
    expectedVersion: 4,
    idempotency: {
      key: "abort-contact",
      requestDigest: requestDigest("abort-contact"),
    },
    outbox: null,
    requestId: "70000000-0000-4000-8000-000000000002",
    tenantId: IDS.tenant,
  };
}

function logicalResult(result: {
  aggregateVersion: number;
  eventId: string;
  jobId: string | null;
}) {
  return {
    aggregateVersion: result.aggregateVersion,
    eventId: result.eventId,
    jobId: result.jobId,
  };
}

async function expectSingleAccessWrite(
  harness: TransactionTestHarness,
  version: number,
  writeCount = 1,
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
  const idempotencyRecords = await harness.repositories.idempotency.list({
    actorId: IDS.actor,
    key: "concurrent-access-command",
    operation: "access.transition",
    tenantId: IDS.tenant,
  });

  expect(workflow).toMatchObject({ stateVersion: version });
  expect(events).toHaveLength(writeCount);
  expect(jobs).toHaveLength(writeCount);
  expect(idempotencyRecords).toHaveLength(writeCount);
}
