// File: tests/unit/evidence/live-manifest.test.ts
import { describe, expect, it } from "vitest";
import { createLiveManifest, type LiveManifest } from "../../../src/evidence/live-manifest";
import { buildLiveManifest, observeReplayRejection } from "../../../src/evidence/live-manifest-builder";
import { createReceipt, RECEIPT_EVIDENCE_CLASSES } from "../../../src/domain/demo/demo-receipt";
import { sha256, type ExchangeEvidence } from "../../../src/infrastructure/minds/history";
import type { DemoCaseRecord, DemoLedgerEvent } from "../../../src/infrastructure/db/demo-case-repository";

const digest = "a".repeat(64);
const processA = { processNonce: "00000000-0000-4000-8000-000000000001",
  executionClass: "live_sdk" as const, logicalSendCount: 1 as const,
  wireAttemptCount: "sdk_managed_unknown" as const,
  processInstanceId: "00000000-0000-4000-8000-000000000011", processStartedAt: "2026-08-26T23:59:00.000Z",
  startedAt: "2026-08-27T00:00:00.000Z", completedAt: "2026-08-27T00:01:00.000Z", latencyMs: 60_000,
  aliasDigest: digest, mindDigest: digest, beforeBoundaryDigest: "b".repeat(64),
  afterBoundaryDigest: "c".repeat(64), artifactDigest: "d".repeat(64), sendResolution: "acknowledged" as const };
const valid: LiveManifest = { schemaVersion: 1, classification: "live", deploymentUrl: "https://example.test",
  sdkVersion: "0.1.4", processA, processB: { ...processA,
  processNonce: "00000000-0000-4000-8000-000000000002",
    processInstanceId: "00000000-0000-4000-8000-000000000022",
    processStartedAt: "2026-08-27T00:01:30.000Z",
    startedAt: "2026-08-27T00:02:00.000Z", completedAt: "2026-08-27T00:03:00.000Z",
    beforeBoundaryDigest: processA.afterBoundaryDigest, afterBoundaryDigest: "e".repeat(64) },
  sameAlias: true, sameMind: true, semanticSendCount: 2, stateVersions: [3, 6, 7],
  receiptDigest: "f".repeat(64), replayRejected: true,
  evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] };

function builderFixture(): { record: DemoCaseRecord; events: DemoLedgerEvent[] } {
  const strategyArtifact = { riskSummary: "A sufficiently specific synthetic risk summary.",
    responsePlan: ["Keep access unchanged", "Limit the future topic"], safeScope: "One future community topic only" };
  const responseArtifact = { access: "unchanged" as const, scope: "one_future_community_topic" as const,
    privacy: "withhold_private_context" as const, rationale: "Keep private context withheld." };
  const strategyDigest = sha256(JSON.stringify(strategyArtifact));
  const responseDigest = sha256(JSON.stringify(responseArtifact));
  const boundary = (value: string, capturedAt: string) => ({ schemaVersion: 1 as const, digest: value.repeat(64),
    rowCount: 1, newestFingerprintDigest: value.repeat(64), oldestFingerprintDigest: value.repeat(64), capturedAt });
  const evidence = (processInstanceId: string, processNonce: string, processStartedAt: string,
    startedAt: string, completedAt: string, before: ReturnType<typeof boundary>, after: ReturnType<typeof boundary>): ExchangeEvidence => ({
    schemaVersion: 1, sdkVersion: "0.1.4", executionClass: "live_sdk", logicalSendCount: 1,
    processInstanceId, processStartedAt, aliasDigest: digest, mindDigest: digest, processNonce,
    startedAt, completedAt, latencyMs: Date.parse(completedAt) - Date.parse(startedAt), before, after,
    outbound: { messageIdDigest: digest, contentDigest: digest, createdAt: startedAt },
    reply: { messageIdDigest: digest, contentDigest: digest, createdAt: completedAt }, sendResolution: "acknowledged",
    evidenceClasses: ["same_mind", "same_alias", "exact_boundary", "one_new_outbound", "one_fresh_reply", "semantic_constraints"] });
  const beforeA = boundary("b", "2026-08-27T00:00:00.000Z");
  const afterA = boundary("c", "2026-08-27T00:01:00.000Z");
  const afterB = boundary("e", "2026-08-27T00:03:00.000Z");
  const processA = evidence("00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000001",
    "2026-08-26T23:59:00.000Z", "2026-08-27T00:00:00.000Z", "2026-08-27T00:01:00.000Z", beforeA, afterA);
  const processB = evidence("00000000-0000-4000-8000-000000000022", "00000000-0000-4000-8000-000000000002",
    "2026-08-27T00:01:30.000Z", "2026-08-27T00:02:00.000Z", "2026-08-27T00:03:00.000Z", afterA, afterB);
  const receiptDigest = createReceipt({ caseCodeDigest: sha256("OLT-X"), strategyDigest, responseDigest,
    beforeVersion: 6, afterVersion: 7, strategyReadyAt: processA.completedAt, responseReadyAt: processB.completedAt,
    consumedAt: "2026-08-27T00:04:00.000Z", evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] });
  const record = { publicCode: "OLT-X", state: "closed", stateVersion: 7, strategyArtifact, responseArtifact,
    strategyDigest, responseDigest, strategyProvenance: processA, responseProvenance: processB,
    strategyReadyAt: processA.completedAt, responseReadyAt: processB.completedAt,
    turnConsumedAt: "2026-08-27T00:04:00.000Z", receiptDigest,
    receiptEvidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] } as unknown as DemoCaseRecord;
  const names = ["authorize", "claim_strategy", "record_strategy", "submit_return", "claim_response",
    "record_response", "consume_turn", "replay_rejected"];
  const events = names.map((event, index) => ({ sequence: index + 1, version: Math.min(index + 1, 7), event,
    payload: index === 2 ? { artifactDigest: strategyDigest, boundaryDigest: afterA.digest } : index === 5
      ? { artifactDigest: responseDigest, boundaryDigest: afterB.digest } : index === 7
        ? { code: "DEMO_TERMINAL", attemptedVersion: 7, observedAt: "2026-08-27T00:05:00.000Z" } : {},
    createdAt: `2026-08-27T00:0${index}:00.000Z` }));
  return { record, events };
}

describe("live manifest", () => {
  it("accepts a bound A/B proof", () => expect(createLiveManifest(valid).semanticSendCount).toBe(2));
  it("rejects boundary drift", () => expect(() => createLiveManifest({ ...valid,
    processB: { ...valid.processB, beforeBoundaryDigest: digest } })).toThrow());
  it("rejects a Process-B launch before Process A completed", () => expect(() => createLiveManifest({ ...valid,
    processB: { ...valid.processB, processStartedAt: "2026-08-27T00:00:30.000Z" } })).toThrow());
  it("derives ledger-bound facts from a complete record", () => {
    const fixture = builderFixture();
    expect(buildLiveManifest({ ...fixture, deploymentUrl: "https://example.test" }).stateVersions).toEqual([3, 6, 7]);
  });
  it("rejects a tampered record-strategy ledger digest", () => {
    const fixture = builderFixture();
    fixture.events[2] = { ...fixture.events[2]!, payload: { ...fixture.events[2]!.payload, artifactDigest: digest } };
    expect(() => buildLiveManifest({ ...fixture, deploymentUrl: "https://example.test" }))
      .toThrow("LIVE_MANIFEST_EVENT_PAYLOAD_MISMATCH");
  });
  it("accepts only an observed terminal replay error", async () => {
    await expect(observeReplayRejection("OLT-X", 7, async () => { throw new Error("DEMO_TERMINAL"); }))
      .resolves.toBe(true);
    await expect(observeReplayRejection("OLT-X", 7, async () => undefined))
      .rejects.toThrow("LIVE_REPLAY_WAS_ACCEPTED");
  });
});
