// File: tests/unit/application/demo-case-service.test.ts
import { describe, expect, it } from "vitest";
import { DemoCaseService } from "../../../src/application/demo-case-service";
import type { DemoCaseRecord, DemoCaseRepository, DemoCaseStore,
  MindSendAttemptRecord } from "../../../src/infrastructure/db/demo-case-repository";
import { sha256, type ExchangeEvidence } from "../../../src/infrastructure/minds/history";

function record(): DemoCaseRecord { return { id: "id", publicCode: "OLT-TEST", state: "draft", stateVersion: 0,
  authorizedTopic: null, authorizedAt: null, stableAlias: null, mindDigest: null,
  strategyArtifact: null, strategyDigest: null, strategyBoundary: null, strategyProvenance: null,
  strategyProcessNonce: null, strategyReadyAt: null, returnMessage: null, responseArtifact: null,
  responseDigest: null, responseBoundary: null, responseProvenance: null, responseProcessNonce: null,
  responseReadyAt: null, receiptDigest: null, receiptEvidenceClasses: null, turnConsumedAt: null,
  failureStage: null, failureCode: null }; }

function memoryStore(initial = record()): { store: DemoCaseStore; read(): DemoCaseRecord;
  readAttempt(id: string): MindSendAttemptRecord | undefined } {
  let current = initial;
  const attempts = new Map<string, MindSendAttemptRecord>();
  const repository: DemoCaseRepository = { createDraft: async () => current, findByCode: async () => current,
    findResponseJobInput: async () => null, lockByCode: async () => current,
    save: async (next, expected) => { if (current.stateVersion !== expected) return false; current = next; return true; },
    appendEvent: async () => undefined, listEventsByCode: async () => [], appendAuditEvent: async () => undefined,
    insertPreparedAttempt: async (input) => { attempts.set(input.id, { ...input, state: "prepared",
      beforeBoundaryDigest: null, providerMessageIdDigest: null, safeCode: null,
      sendGateOpenedAt: null, sendAcknowledgedAt: null, sendResolution: null,
      afterBoundaryDigest: null, exchangeEvidenceDigest: null, executionClass: null,
      exchangeRecordedAt: null }); },
    findAttemptById: async (id) => attempts.get(id) ?? null,
    findAttemptByCode: async (_code, phase) => [...attempts.values()].find((item) => item.phase === phase) ?? null,
    markAttemptPreSendFailed: async (id, safeCode) => { const attempt = attempts.get(id);
      if (attempt?.state !== "prepared") return false;
      attempts.set(id, { ...attempt, state: "pre_send_failed", safeCode }); return true; },
    openAttemptSendGate: async (id, digest, openedAt) => { const attempt = attempts.get(id);
      if (attempt?.state !== "prepared") return false;
      attempts.set(id, { ...attempt, state: "send_outcome_unknown", beforeBoundaryDigest: digest,
        sendGateOpenedAt: openedAt }); return true; },
    acknowledgeAttemptSend: async (id, digest, acknowledgedAt) => { const attempt = attempts.get(id);
      if (attempt?.state !== "send_outcome_unknown") return false;
      attempts.set(id, { ...attempt, state: "send_acknowledged", providerMessageIdDigest: digest,
        sendAcknowledgedAt: acknowledgedAt }); return true; },
    noteAttemptAmbiguity: async (id, safeCode) => { const attempt = attempts.get(id);
      if (attempt?.state !== "send_outcome_unknown") return false;
      attempts.set(id, { ...attempt, safeCode }); return true; },
    recordAttemptExchange: async (id, input) => { const attempt = attempts.get(id);
      if (!attempt || !["send_outcome_unknown", "send_acknowledged"].includes(attempt.state)) return false;
      attempts.set(id, { ...attempt, state: "exchange_recorded", sendResolution: input.resolution,
        afterBoundaryDigest: input.afterBoundaryDigest, exchangeEvidenceDigest: input.exchangeEvidenceDigest,
        executionClass: input.executionClass, exchangeRecordedAt: input.recordedAt }); return true; } };
  return { store: { findByCode: repository.findByCode, findResponseJobInput: repository.findResponseJobInput,
    listEventsByCode: repository.listEventsByCode, appendAuditEvent: repository.appendAuditEvent,
    findAttemptByCode: repository.findAttemptByCode,
    transaction: (work) => work(repository) }, read: () => current,
    readAttempt: (id) => attempts.get(id) };
}

describe("demo case service", () => {
  it("persists authorization with an incremented version", async () => {
    const memory = memoryStore(); const service = new DemoCaseService(memory.store, () => "2026-08-27T00:00:00.000Z");
    await service.authorize("OLT-TEST", 0);
    expect(memory.read()).toMatchObject({ state: "authorized", stateVersion: 1,
      authorizedTopic: "community_participation" });
  });
  it("rejects a stale writer", async () => {
    const memory = memoryStore(); const service = new DemoCaseService(memory.store);
    await service.authorize("OLT-TEST", 0);
    await expect(service.authorize("OLT-TEST", 0)).rejects.toThrow("DEMO_STALE_WRITE");
  });
  it("prepares the send journal atomically with a strategy claim", async () => {
    const memory = memoryStore();
    const service = new DemoCaseService(memory.store);
    const attemptId = "00000000-0000-4000-8000-000000000010";
    await service.authorize("OLT-TEST", 0);
    await service.claimStrategy("OLT-TEST", 1, { alias: "opaque-alias", mindDigest: "a".repeat(64),
      processNonce: "00000000-0000-4000-8000-000000000001",
      attempt: { id: attemptId, promptDigest: "b".repeat(64), processInstanceDigest: "c".repeat(64),
        sdkVersion: "0.1.4" } });

    expect(memory.readAttempt(attemptId)).toMatchObject({ state: "prepared", phase: "strategy",
      caseVersion: 2, aliasDigest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    await service.settleAttemptFailure(attemptId, "MINDS_AUTH_FAILED");
    expect(memory.readAttempt(attemptId)).toMatchObject({ state: "pre_send_failed",
      safeCode: "MINDS_AUTH_FAILED" });
  });
  it("settles an open send gate with a safe code without making it retryable", async () => {
    const memory = memoryStore();
    const service = new DemoCaseService(memory.store);
    const attemptId = "00000000-0000-4000-8000-000000000012";
    await service.authorize("OLT-TEST", 0);
    await service.claimStrategy("OLT-TEST", 1, { alias: "opaque-alias", mindDigest: "a".repeat(64),
      processNonce: "00000000-0000-4000-8000-000000000001",
      attempt: { id: attemptId, promptDigest: "b".repeat(64), processInstanceDigest: "c".repeat(64),
        sdkVersion: "0.1.4" } });
    await service.openAttemptSendGate(attemptId, "d".repeat(64), "2026-08-27T00:00:00.000Z");

    await service.settleAttemptFailure(attemptId, "MINDS_ACK_PERSISTENCE_FAILED");

    expect(memory.readAttempt(attemptId)).toMatchObject({ state: "send_outcome_unknown",
      safeCode: "MINDS_ACK_PERSISTENCE_FAILED" });
  });
  it("rejects exchange evidence that is not bound to the prepared attempt", async () => {
    const memory = memoryStore(); const service = new DemoCaseService(memory.store);
    const attemptId = "00000000-0000-4000-8000-000000000010";
    const nonce = "00000000-0000-4000-8000-000000000001";
    const instance = "00000000-0000-4000-8000-000000000002";
    const evidence = exchangeEvidence(nonce, instance);
    await service.authorize("OLT-TEST", 0);
    await service.claimStrategy("OLT-TEST", 1, { alias: "opaque-alias", mindDigest: "a".repeat(64),
      processNonce: nonce, attempt: { id: attemptId, promptDigest: evidence.outbound.contentDigest,
        processInstanceDigest: sha256(instance), sdkVersion: "0.1.4" } });
    await service.openAttemptSendGate(attemptId, evidence.before.digest, evidence.startedAt);
    await service.acknowledgeAttemptSend(attemptId, evidence.outbound.messageIdDigest, evidence.startedAt);

    await expect(service.recordAttemptExchange(attemptId, { ...evidence, aliasDigest: "9".repeat(64) }))
      .rejects.toThrow("MIND_ATTEMPT_EVIDENCE_MISMATCH");
    await expect(service.recordAttemptExchange(attemptId, { ...evidence,
      outbound: { ...evidence.outbound, messageIdDigest: "8".repeat(64) } }))
      .rejects.toThrow("MIND_ATTEMPT_EVIDENCE_MISMATCH");
    await expect(service.recordAttemptExchange(attemptId, { ...evidence,
      sendResolution: "history_recovered" }))
      .rejects.toThrow("MIND_ATTEMPT_EVIDENCE_MISMATCH");
    await expect(service.recordAttemptExchange(attemptId, evidence)).resolves.toBeUndefined();
    expect(memory.readAttempt(attemptId)?.state).toBe("exchange_recorded");
  });
  it("rejects a Process-B exchange that drifts from the prepared Process-A boundary", async () => {
    const nonce = "00000000-0000-4000-8000-000000000003";
    const instance = "00000000-0000-4000-8000-000000000004";
    const evidence = exchangeEvidence(nonce, instance);
    const expectedBoundary = { ...evidence.before, digest: "7".repeat(64) };
    const initial = { ...record(), state: "returned" as const, stateVersion: 4,
      stableAlias: "opaque-alias", mindDigest: "a".repeat(64), strategyBoundary: expectedBoundary,
      strategyProcessNonce: "00000000-0000-4000-8000-000000000001", returnMessage: "return" };
    const memory = memoryStore(initial); const service = new DemoCaseService(memory.store);
    const attemptId = "00000000-0000-4000-8000-000000000011";
    await service.claimResponse("OLT-TEST", 4, { processNonce: nonce,
      attempt: { id: attemptId, promptDigest: evidence.outbound.contentDigest,
        processInstanceDigest: sha256(instance), sdkVersion: "0.1.4" } });
    await service.openAttemptSendGate(attemptId, evidence.before.digest, evidence.startedAt);

    await expect(service.recordAttemptExchange(attemptId, { ...evidence,
      sendResolution: "history_recovered" })).rejects.toThrow("MIND_ATTEMPT_EVIDENCE_MISMATCH");
    expect(memory.readAttempt(attemptId)?.state).toBe("send_outcome_unknown");
  });
});

function exchangeEvidence(processNonce: string, processInstanceId: string): ExchangeEvidence {
  const before = { schemaVersion: 1 as const, digest: "d".repeat(64), rowCount: 0,
    newestFingerprintDigest: null, oldestFingerprintDigest: null, capturedAt: "2026-08-27T00:00:00.000Z" };
  return { schemaVersion: 1, sdkVersion: "0.1.4", executionClass: "live_sdk", logicalSendCount: 1,
    processInstanceId, processStartedAt: before.capturedAt, aliasDigest: sha256("opaque-alias"),
    mindDigest: "a".repeat(64), processNonce, startedAt: "2026-08-27T00:01:00.000Z",
    completedAt: "2026-08-27T00:02:00.000Z", latencyMs: 60_000, before,
    after: { ...before, digest: "e".repeat(64), rowCount: 2 },
    outbound: { messageIdDigest: "1".repeat(64), contentDigest: "2".repeat(64), createdAt: "2026-08-27T00:01:00.000Z" },
    reply: { messageIdDigest: "3".repeat(64), contentDigest: "4".repeat(64), createdAt: "2026-08-27T00:01:30.000Z" },
    sendResolution: "acknowledged", evidenceClasses: ["same_mind", "same_alias", "exact_boundary",
      "one_new_outbound", "one_fresh_reply", "semantic_constraints"] };
}
