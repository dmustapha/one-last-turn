// File: src/application/demo-case-service.ts
import { randomBytes } from "node:crypto";

import { transition, type DemoEvent } from "../domain/demo/demo-case";
import { createReceipt, RECEIPT_EVIDENCE_CLASSES } from "../domain/demo/demo-receipt";
import {
  type DemoCaseStore,
  type DemoCaseRecord,
  type DemoLedgerEvent,
  type DemoCaseRepository,
  type MindAttemptPhase,
  type MindSendAttemptRecord,
  type PreparedMindSendAttempt,
  type ResponseJobInput,
} from "../infrastructure/db/demo-case-repository";
import { assertSameBoundary, sha256, type ExchangeEvidence } from "../infrastructure/minds/history";
import type { ResponseArtifact, StrategyArtifact } from "./minds/work-contract";

type Patch = Partial<Omit<DemoCaseRecord, "id" | "publicCode" | "state" | "stateVersion">>;
type PatchFactory = Patch | ((record: DemoCaseRecord) => Patch);
type MutationEffect = (repository: DemoCaseRepository, current: DemoCaseRecord,
  updated: DemoCaseRecord) => Promise<void>;
export type AttemptPreparation = Readonly<{
  id: string; promptDigest: string; processInstanceDigest: string; sdkVersion: string;
}>;

function assertEvidenceIdentity(record: DemoCaseRecord, evidence: ExchangeEvidence, nonce: string | null): void {
  if (!record.stableAlias || evidence.aliasDigest !== sha256(record.stableAlias)) throw new Error("DEMO_ALIAS_EVIDENCE_MISMATCH");
  if (!record.mindDigest || evidence.mindDigest !== record.mindDigest) throw new Error("DEMO_MIND_EVIDENCE_MISMATCH");
  if (!nonce || evidence.processNonce !== nonce) throw new Error("DEMO_PROCESS_NONCE_MISMATCH");
}

export class DemoCaseService {
  constructor(private readonly store: DemoCaseStore, private readonly now = () => new Date().toISOString()) {}

  async createCase(): Promise<DemoCaseRecord> {
    const code = `OLT-${randomBytes(6).toString("hex").toUpperCase()}`;
    return this.store.transaction((repository) => repository.createDraft(code));
  }

  async findByCode(code: string): Promise<DemoCaseRecord | null> {
    return this.store.findByCode(code);
  }

  async findResponseJobInput(code: string): Promise<ResponseJobInput | null> {
    return this.store.findResponseJobInput(code);
  }

  async listEventsByCode(code: string): Promise<readonly DemoLedgerEvent[]> {
    return this.store.listEventsByCode(code);
  }

  findAttemptByCode(code: string, phase: MindAttemptPhase) {
    return this.store.findAttemptByCode(code, phase);
  }

  async recordReplayRejection(code: string, version: number): Promise<void> {
    await this.store.appendAuditEvent(code, version, "replay_rejected",
      { attemptedVersion: version, code: "DEMO_TERMINAL", observedAt: this.now() });
  }

  async verifyStrategyReadback(code: string, artifact: StrategyArtifact, evidence: ExchangeEvidence): Promise<void> {
    const record = await this.requireCase(code);
    if (record.strategyDigest !== sha256(JSON.stringify(artifact)) ||
        JSON.stringify(record.strategyBoundary) !== JSON.stringify(evidence.after) ||
        JSON.stringify(record.strategyProvenance) !== JSON.stringify(evidence)) {
      throw new Error("DEMO_STRATEGY_READBACK_MISMATCH");
    }
  }

  async verifyResponseReadback(code: string, artifact: ResponseArtifact, evidence: ExchangeEvidence): Promise<void> {
    const record = await this.requireCase(code);
    if (record.responseDigest !== sha256(JSON.stringify(artifact)) ||
        JSON.stringify(record.responseBoundary) !== JSON.stringify(evidence.after) ||
        JSON.stringify(record.responseProvenance) !== JSON.stringify(evidence)) {
      throw new Error("DEMO_RESPONSE_READBACK_MISMATCH");
    }
  }

  authorize(code: string, expectedVersion: number): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "authorize", {
      authorizedTopic: "community_participation", authorizedAt: this.now(),
    });
  }

  claimStrategy(code: string, expectedVersion: number, input: {
    alias: string; mindDigest: string; processNonce: string; attempt: AttemptPreparation;
  }): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "claim_strategy", {
      stableAlias: input.alias, mindDigest: input.mindDigest, strategyProcessNonce: input.processNonce,
    }, {}, async (repository, current, updated) => repository.insertPreparedAttempt(
      this.prepareAttempt(current.id, updated.stateVersion, "strategy", input.attempt,
        input.alias, input.mindDigest, input.processNonce, null)));
  }

  recordStrategy(code: string, expectedVersion: number, artifact: StrategyArtifact, evidence: ExchangeEvidence): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "record_strategy", (record) => {
      assertEvidenceIdentity(record, evidence, record.strategyProcessNonce);
      return { strategyArtifact: artifact, strategyDigest: sha256(JSON.stringify(artifact)),
        strategyBoundary: evidence.after, strategyProvenance: evidence, strategyReadyAt: this.now() };
    }, { artifactDigest: sha256(JSON.stringify(artifact)), boundaryDigest: evidence.after.digest });
  }

  submitReturn(code: string, expectedVersion: number, message: string): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "submit_return", { returnMessage: message });
  }

  claimResponse(code: string, expectedVersion: number, input: {
    processNonce: string; attempt: AttemptPreparation;
  }): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "claim_response", (record) => {
      if (record.strategyProcessNonce === input.processNonce) throw new Error("DEMO_PROCESS_NONCE_REUSED");
      return { responseProcessNonce: input.processNonce };
    }, {}, async (repository, current, updated) => {
      if (!current.stableAlias || !current.mindDigest || !current.strategyBoundary) {
        throw new Error("DEMO_RESPONSE_ATTEMPT_INPUT_MISSING");
      }
      await repository.insertPreparedAttempt(this.prepareAttempt(current.id, updated.stateVersion,
        "response", input.attempt, current.stableAlias, current.mindDigest,
        input.processNonce, current.strategyBoundary.digest));
    });
  }

  async settleAttemptFailure(attemptId: string, safeCode: string): Promise<void> {
    await this.store.transaction(async (repository) => {
      const attempt = await repository.findAttemptById(attemptId);
      if (!attempt) throw new Error("MIND_ATTEMPT_NOT_FOUND");
      if (attempt.state === "prepared" && !await repository.markAttemptPreSendFailed(attemptId, safeCode)) {
        throw new Error("MIND_ATTEMPT_TRANSITION_REJECTED");
      }
      if (attempt.state === "send_outcome_unknown" && attempt.safeCode === null &&
          !await repository.noteAttemptAmbiguity(attemptId, safeCode)) {
        throw new Error("MIND_ATTEMPT_TRANSITION_REJECTED");
      }
    });
  }

  async openAttemptSendGate(attemptId: string, beforeDigest: string, at: string): Promise<void> {
    await this.requireAttemptUpdate((repository) =>
      repository.openAttemptSendGate(attemptId, beforeDigest, at));
  }

  async acknowledgeAttemptSend(attemptId: string, messageDigest: string, at: string): Promise<void> {
    await this.requireAttemptUpdate((repository) =>
      repository.acknowledgeAttemptSend(attemptId, messageDigest, at));
  }

  async noteAttemptAmbiguity(attemptId: string, safeCode: string): Promise<void> {
    await this.requireAttemptUpdate((repository) =>
      repository.noteAttemptAmbiguity(attemptId, safeCode));
  }

  async recordAttemptExchange(attemptId: string, evidence: ExchangeEvidence): Promise<void> {
    if (evidence.executionClass !== "live_sdk") throw new Error("MIND_ATTEMPT_EVIDENCE_MISMATCH");
    const digests = { beforeBoundaryDigest: evidence.before.digest,
      afterBoundaryDigest: evidence.after.digest, outboundMessageIdDigest: evidence.outbound.messageIdDigest,
      outboundContentDigest: evidence.outbound.contentDigest, replyMessageIdDigest: evidence.reply.messageIdDigest,
      replyContentDigest: evidence.reply.contentDigest, exchangeEvidenceDigest: sha256(JSON.stringify(evidence)),
      resolution: evidence.sendResolution, executionClass: evidence.executionClass,
      recordedAt: evidence.completedAt };
    await this.store.transaction(async (repository) => {
      const attempt = await repository.findAttemptById(attemptId);
      if (!attempt) throw new Error("MIND_ATTEMPT_NOT_FOUND");
      this.assertAttemptEvidence(attempt, evidence);
      if (!await repository.recordAttemptExchange(attemptId, digests)) {
        throw new Error("MIND_ATTEMPT_TRANSITION_REJECTED");
      }
    });
  }

  recordResponse(code: string, expectedVersion: number, artifact: ResponseArtifact, evidence: ExchangeEvidence): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "record_response", (record) => {
      assertEvidenceIdentity(record, evidence, record.responseProcessNonce);
      if (!record.strategyBoundary) throw new Error("DEMO_STRATEGY_BOUNDARY_MISSING");
      assertSameBoundary(record.strategyBoundary, evidence.before);
      return { responseArtifact: artifact, responseDigest: sha256(JSON.stringify(artifact)),
        responseBoundary: evidence.after, responseProvenance: evidence, responseReadyAt: this.now() };
    }, { artifactDigest: sha256(JSON.stringify(artifact)), boundaryDigest: evidence.after.digest });
  }

  async consumeTurn(code: string, expectedVersion: number): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "consume_turn", (current) => {
      if (!current.strategyDigest || !current.responseDigest ||
          !current.strategyReadyAt || !current.responseReadyAt) {
        throw new Error("DEMO_EVIDENCE_INCOMPLETE");
      }
      const consumedAt = this.now();
      const receiptDigest = createReceipt({ caseCodeDigest: sha256(code),
        strategyDigest: current.strategyDigest, responseDigest: current.responseDigest,
        beforeVersion: expectedVersion, afterVersion: expectedVersion + 1,
        strategyReadyAt: current.strategyReadyAt, responseReadyAt: current.responseReadyAt,
        consumedAt, evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] });
      return { receiptDigest, receiptEvidenceClasses: RECEIPT_EVIDENCE_CLASSES,
        turnConsumedAt: consumedAt };
    });
  }

  fail(code: string, expectedVersion: number, stage: string, failureCode: string): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "fail", { failureStage: stage, failureCode });
  }

  private async requireCase(code: string): Promise<DemoCaseRecord> {
    const record = await this.findByCode(code);
    if (!record) throw new Error("DEMO_CASE_NOT_FOUND");
    return record;
  }

  private prepareAttempt(caseId: string, caseVersion: number, phase: MindAttemptPhase,
    input: AttemptPreparation, alias: string, mindDigest: string, nonce: string,
    expectedBoundaryDigest: string | null): PreparedMindSendAttempt {
    return { ...input, caseId, caseVersion, phase, aliasDigest: sha256(alias), mindDigest,
      processNonceDigest: sha256(nonce), expectedBoundaryDigest };
  }

  private assertAttemptEvidence(attempt: MindSendAttemptRecord, evidence: ExchangeEvidence): void {
    const expectedResolution = attempt.state === "send_acknowledged" ? "acknowledged" : "history_recovered";
    const mismatched = evidence.executionClass !== "live_sdk" ||
      attempt.aliasDigest !== evidence.aliasDigest ||
      attempt.mindDigest !== evidence.mindDigest ||
      attempt.processNonceDigest !== sha256(evidence.processNonce) ||
      attempt.processInstanceDigest !== sha256(evidence.processInstanceId) ||
      attempt.sdkVersion !== evidence.sdkVersion ||
      attempt.promptDigest !== evidence.outbound.contentDigest ||
      attempt.beforeBoundaryDigest !== evidence.before.digest ||
      evidence.sendResolution !== expectedResolution ||
      (attempt.expectedBoundaryDigest !== null && attempt.expectedBoundaryDigest !== evidence.before.digest) ||
      (attempt.providerMessageIdDigest !== null &&
        attempt.providerMessageIdDigest !== evidence.outbound.messageIdDigest);
    if (mismatched) throw new Error("MIND_ATTEMPT_EVIDENCE_MISMATCH");
  }

  private async requireAttemptUpdate(work: (repository: DemoCaseRepository) => Promise<boolean>): Promise<void> {
    await this.store.transaction(async (repository) => {
      if (!await work(repository)) throw new Error("MIND_ATTEMPT_TRANSITION_REJECTED");
    });
  }

  private mutate(code: string, expectedVersion: number, event: DemoEvent, patch: PatchFactory,
    payload: Record<string, unknown> = {}, effect?: MutationEffect): Promise<DemoCaseRecord> {
    return this.store.transaction(async (repository) => {
      const current = await repository.lockByCode(code);
      if (!current) throw new Error("DEMO_CASE_NOT_FOUND");
      if (current.stateVersion !== expectedVersion) throw new Error("DEMO_STALE_WRITE");
      const next = transition({ state: current.state, version: current.stateVersion }, event);
      if (!next.ok) throw new Error(next.error.code);
      const changes = typeof patch === "function" ? patch(current) : patch;
      const updated = { ...current, ...changes, state: next.value.state, stateVersion: next.value.version };
      if (!await repository.save(updated, expectedVersion)) throw new Error("DEMO_STALE_WRITE");
      await effect?.(repository, current, updated);
      await repository.appendEvent({ caseId: current.id, version: updated.stateVersion, event, payload });
      return updated;
    });
  }
}
