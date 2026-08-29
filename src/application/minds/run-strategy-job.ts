// File: src/application/minds/run-strategy-job.ts
import { randomUUID } from "node:crypto";
import { MindsApiError } from "@animocabrands/minds-client-lib";

import type { DemoCaseRecord } from "../../infrastructure/db/demo-case-repository";
import { MINDS_SDK_VERSION, sha256, type ExchangeEvidence } from "../../infrastructure/minds/history";
import { currentProcessInstanceId, executeMindWork, type MindSendJournal, type MindTransport } from "../../infrastructure/minds/minds-worker";
import type { AttemptPreparation } from "../demo-case-service";
import { parseStrategyArtifact, strategyPrompt, type StrategyArtifact } from "./work-contract";

export type JobOutcome = Readonly<{ state: "ready" | "failed"; code: string }>;
export interface StrategyCasePort {
  findByCode(code: string): Promise<DemoCaseRecord | null>;
  claimStrategy(code: string, version: number, input: {
    alias: string; mindDigest: string; processNonce: string; attempt: AttemptPreparation;
  }): Promise<DemoCaseRecord>;
  recordStrategy(code: string, version: number, artifact: StrategyArtifact, evidence: ExchangeEvidence): Promise<DemoCaseRecord>;
  verifyStrategyReadback(code: string, artifact: StrategyArtifact, evidence: ExchangeEvidence): Promise<void>;
  fail(code: string, version: number, stage: string, failureCode: string): Promise<DemoCaseRecord>;
  settleAttemptFailure(attemptId: string, safeCode: string): Promise<void>;
  openAttemptSendGate(attemptId: string, digest: string, at: string): Promise<void>;
  acknowledgeAttemptSend(attemptId: string, digest: string, at: string): Promise<void>;
  noteAttemptAmbiguity(attemptId: string, safeCode: string): Promise<void>;
  recordAttemptExchange(attemptId: string, evidence: ExchangeEvidence): Promise<void>;
}

const strategyFailureCodes = new Set(["MINDS_COGNITION_EMPTY", "MINDS_ALIAS_MIND_MISMATCH",
  "MINDS_ALIAS_MIND_UNVERIFIED",
  "MINDS_REPLY_NOT_IN_HISTORY", "MINDS_SEND_AMBIGUOUS", "MINDS_ACK_PERSISTENCE_FAILED",
  "MINDS_HISTORY_BOUNDARY_MISMATCH",
  "MINDS_EXECUTION_NOT_LIVE", "MIND_ARTIFACT_NOT_SINGLE_JSON", "MIND_ARTIFACT_INVALID_JSON", "MIND_ARTIFACT_TOO_SHORT"]);
function failureCode(error: unknown): string {
  if (error instanceof MindsApiError && (error.status === 401 || error.code === "AUTH_FAILED")) {
    return "MINDS_AUTH_FAILED";
  }
  return error instanceof Error && strategyFailureCodes.has(error.message) ? error.message : "STRATEGY_FAILED";
}

async function markFailed(port: StrategyCasePort, code: string, version: number, reason: string): Promise<void> {
  try { await port.fail(code, version, "strategy", reason); }
  catch { /* preserve the original fixed failure code */ }
}

function journal(port: StrategyCasePort, attemptId: string): MindSendJournal {
  return { openSendGate: (digest, at) => port.openAttemptSendGate(attemptId, digest, at),
    acknowledgeSend: (digest, at) => port.acknowledgeAttemptSend(attemptId, digest, at),
    noteAmbiguity: (code) => port.noteAttemptAmbiguity(attemptId, code),
    recordExchange: (evidence) => {
      if (evidence.executionClass !== "live_sdk") throw new Error("MINDS_EXECUTION_NOT_LIVE");
      return port.recordAttemptExchange(attemptId, evidence);
    } };
}

export async function runStrategyJob(input: {
  code: string; mindId: string; cases: StrategyCasePort; transport: MindTransport;
  processNonce?: string;
}): Promise<JobOutcome> {
  const current = await input.cases.findByCode(input.code);
  if (!current || current.state !== "authorized") return { state: "failed", code: "STRATEGY_NOT_AUTHORIZED" };
  const processNonce = input.processNonce ?? randomUUID();
  const alias = `olt-${sha256(`${current.id}:${processNonce}`).slice(0, 32)}`;
  const prompt = strategyPrompt();
  const attemptId = randomUUID();
  let version = current.stateVersion;
  let attemptPrepared = false;
  try {
    const attempt = { id: attemptId, promptDigest: sha256(prompt),
      processInstanceDigest: sha256(currentProcessInstanceId()), sdkVersion: MINDS_SDK_VERSION };
    const claimed = await input.cases.claimStrategy(input.code, version, {
      alias, mindDigest: sha256(input.mindId), processNonce, attempt });
    attemptPrepared = true;
    version = claimed.stateVersion;
    const result = await executeMindWork({ transport: input.transport, alias, mindId: input.mindId,
      processNonce, prompt, journal: journal(input.cases, attemptId), parse: parseStrategyArtifact });
    const ready = await input.cases.recordStrategy(input.code, version, result.artifact, result.evidence);
    version = ready.stateVersion;
    await input.cases.verifyStrategyReadback(input.code, result.artifact, result.evidence);
    return { state: "ready", code: "STRATEGY_READY" };
  } catch (error) {
    const reason = failureCode(error);
    if (attemptPrepared) {
      try { await input.cases.settleAttemptFailure(attemptId, reason); }
      catch { /* never reclassify a send boundary optimistically */ }
    }
    await markFailed(input.cases, input.code, version, reason);
    return { state: "failed", code: reason };
  }
}
