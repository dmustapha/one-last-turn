// File: src/evidence/live-manifest-builder.ts
import { createReceipt, RECEIPT_EVIDENCE_CLASSES } from "../domain/demo/demo-receipt";
import type { DemoCaseRecord, DemoLedgerEvent } from "../infrastructure/db/demo-case-repository";
import { sha256, type ExchangeEvidence } from "../infrastructure/minds/history";
import type { LiveManifest } from "./live-manifest";

function processEvidence(evidence: ExchangeEvidence, artifactDigest: string) {
  return { executionClass: evidence.executionClass as "live_sdk", logicalSendCount: evidence.logicalSendCount,
    wireAttemptCount: "sdk_managed_unknown" as const, processInstanceId: evidence.processInstanceId,
    processStartedAt: evidence.processStartedAt, processNonce: evidence.processNonce,
    startedAt: evidence.startedAt, completedAt: evidence.completedAt, latencyMs: evidence.latencyMs,
    aliasDigest: evidence.aliasDigest, mindDigest: evidence.mindDigest,
    beforeBoundaryDigest: evidence.before.digest, afterBoundaryDigest: evidence.after.digest,
    artifactDigest, sendResolution: evidence.sendResolution };
}

function requireEventVersions(events: readonly DemoLedgerEvent[], strategyDigest: string,
  responseDigest: string, strategyBoundaryDigest: string, responseBoundaryDigest: string): [3, 6, 7] {
  const expected = ["authorize", "claim_strategy", "record_strategy", "submit_return",
    "claim_response", "record_response", "consume_turn", "replay_rejected"];
  if (events.length !== expected.length || events.some((event, index) =>
    event.event !== expected[index] || event.version !== Math.min(index + 1, 7))) {
    throw new Error("LIVE_MANIFEST_LEDGER_MISMATCH");
  }
  const replay = events[7]!;
  if (replay.payload.code !== "DEMO_TERMINAL" || replay.payload.attemptedVersion !== replay.version ||
      typeof replay.payload.observedAt !== "string" || new Date(replay.payload.observedAt).toISOString() !== replay.payload.observedAt) {
    throw new Error("LIVE_MANIFEST_REPLAY_MISMATCH");
  }
  const strategy = events[2]!.payload;
  const response = events[5]!.payload;
  if (strategy.artifactDigest !== strategyDigest || strategy.boundaryDigest !== strategyBoundaryDigest ||
      response.artifactDigest !== responseDigest || response.boundaryDigest !== responseBoundaryDigest) {
    throw new Error("LIVE_MANIFEST_EVENT_PAYLOAD_MISMATCH");
  }
  return [events[2]!.version, events[5]!.version, events[6]!.version] as [3, 6, 7];
}

function requireReceipt(record: DemoCaseRecord, strategyDigest: string, responseDigest: string,
  versions: [3, 6, 7]): string {
  if (!record.strategyReadyAt || !record.responseReadyAt || !record.turnConsumedAt || !record.receiptDigest ||
      JSON.stringify(record.receiptEvidenceClasses) !== JSON.stringify(RECEIPT_EVIDENCE_CLASSES)) {
    throw new Error("LIVE_MANIFEST_RECEIPT_MISMATCH");
  }
  const computed = createReceipt({ caseCodeDigest: sha256(record.publicCode), strategyDigest, responseDigest,
    beforeVersion: versions[1], afterVersion: versions[2], strategyReadyAt: record.strategyReadyAt,
    responseReadyAt: record.responseReadyAt, consumedAt: record.turnConsumedAt,
    evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] });
  if (computed !== record.receiptDigest) throw new Error("LIVE_MANIFEST_RECEIPT_MISMATCH");
  return computed;
}

export function buildLiveManifest(input: { record: DemoCaseRecord; events: readonly DemoLedgerEvent[];
  deploymentUrl: string }): LiveManifest {
  const { record } = input;
  if (record.state !== "closed" || !record.strategyProvenance || !record.responseProvenance ||
      !record.strategyArtifact || !record.responseArtifact) throw new Error("LIVE_MANIFEST_EVIDENCE_INCOMPLETE");
  const processA = record.strategyProvenance;
  const processB = record.responseProvenance;
  if (processA.executionClass !== "live_sdk" || processB.executionClass !== "live_sdk" ||
      processA.processInstanceId === processB.processInstanceId) throw new Error("LIVE_MANIFEST_ORIGIN_MISMATCH");
  const strategyDigest = sha256(JSON.stringify(record.strategyArtifact));
  const responseDigest = sha256(JSON.stringify(record.responseArtifact));
  if (strategyDigest !== record.strategyDigest || responseDigest !== record.responseDigest) {
    throw new Error("LIVE_MANIFEST_ARTIFACT_MISMATCH");
  }
  const sameAlias = processA.aliasDigest === processB.aliasDigest;
  const sameMind = processA.mindDigest === processB.mindDigest;
  const semanticSendCount = processA.logicalSendCount + processB.logicalSendCount;
  if (!sameAlias || !sameMind || semanticSendCount !== 2 || processA.sdkVersion !== processB.sdkVersion) {
    throw new Error("LIVE_MANIFEST_CROSS_PROCESS_MISMATCH");
  }
  const classification: "live" = processA.executionClass === "live_sdk" && processB.executionClass === "live_sdk"
    ? "live" : (() => { throw new Error("LIVE_MANIFEST_ORIGIN_MISMATCH"); })();
  const verifiedSendCount: 2 = semanticSendCount === 2 ? semanticSendCount :
    (() => { throw new Error("LIVE_MANIFEST_SEND_COUNT_MISMATCH"); })();
  const replayRejected: true = input.events.at(-1)?.event === "replay_rejected" ? true :
    (() => { throw new Error("LIVE_MANIFEST_REPLAY_MISSING"); })();
  const stateVersions = requireEventVersions(input.events, strategyDigest, responseDigest,
    processA.after.digest, processB.after.digest);
  if (record.stateVersion !== stateVersions[2]) throw new Error("LIVE_MANIFEST_LEDGER_MISMATCH");
  return { schemaVersion: 1, classification, deploymentUrl: input.deploymentUrl,
    sdkVersion: processA.sdkVersion, processA: processEvidence(processA, strategyDigest),
    processB: processEvidence(processB, responseDigest), sameAlias, sameMind, semanticSendCount: verifiedSendCount,
    stateVersions, receiptDigest: requireReceipt(record, strategyDigest, responseDigest, stateVersions),
    replayRejected,
    evidenceClasses: record.receiptEvidenceClasses as unknown as LiveManifest["evidenceClasses"] };
}

export async function observeReplayRejection(code: string, version: number,
  consume: (code: string, version: number) => Promise<unknown>): Promise<true> {
  try { await consume(code, version); }
  catch (error) {
    if (error instanceof Error && error.message === "DEMO_TERMINAL") return true;
    throw error;
  }
  throw new Error("LIVE_REPLAY_WAS_ACCEPTED");
}
