// File: src/application/minds/run-response-job.ts
import { randomUUID } from "node:crypto";
import { MindsApiError } from "@animocabrands/minds-client-lib";

import type { DemoCaseRecord, ResponseJobInput } from "../../infrastructure/db/demo-case-repository";
import { MINDS_SDK_VERSION, sha256, type ExchangeEvidence } from "../../infrastructure/minds/history";
import { currentProcessInstanceId, executeMindWork, type MindSendJournal, type MindTransport } from "../../infrastructure/minds/minds-worker";
import type { AttemptPreparation } from "../demo-case-service";
import type { JobOutcome } from "./run-strategy-job";
import {
  assertRememberedConstraints,
  parseResponseArtifact,
  responsePrompt,
  type ResponseArtifact,
} from "./work-contract";

export interface ResponseCasePort {
  findResponseJobInput(code: string): Promise<ResponseJobInput | null>;
  claimResponse(code: string, version: number, input: {
    processNonce: string; attempt: AttemptPreparation;
  }): Promise<DemoCaseRecord>;
  recordResponse(code: string, version: number, artifact: ResponseArtifact, evidence: ExchangeEvidence): Promise<DemoCaseRecord>;
  verifyResponseReadback(code: string, artifact: ResponseArtifact, evidence: ExchangeEvidence): Promise<void>;
  fail(code: string, version: number, stage: string, failureCode: string): Promise<DemoCaseRecord>;
  settleAttemptFailure(attemptId: string, safeCode: string): Promise<void>;
  openAttemptSendGate(attemptId: string, digest: string, at: string): Promise<void>;
  acknowledgeAttemptSend(attemptId: string, digest: string, at: string): Promise<void>;
  noteAttemptAmbiguity(attemptId: string, safeCode: string): Promise<void>;
  recordAttemptExchange(attemptId: string, evidence: ExchangeEvidence): Promise<void>;
}

const responseFailureCodes = new Set(["MINDS_COGNITION_EMPTY", "MINDS_ALIAS_MIND_MISMATCH",
  "MINDS_ALIAS_MIND_UNVERIFIED",
  "MINDS_REPLY_NOT_IN_HISTORY", "MINDS_SEND_AMBIGUOUS", "MINDS_ACK_PERSISTENCE_FAILED",
  "MINDS_HISTORY_BOUNDARY_MISMATCH",
  "MINDS_EXECUTION_NOT_LIVE", "MIND_ARTIFACT_NOT_SINGLE_JSON", "MIND_ARTIFACT_INVALID_JSON", "MIND_ARTIFACT_TOO_SHORT"]);
function failureCode(error: unknown): string {
  if (error instanceof MindsApiError && (error.status === 401 || error.code === "AUTH_FAILED")) {
    return "MINDS_AUTH_FAILED";
  }
  return error instanceof Error && responseFailureCodes.has(error.message) ? error.message : "RESPONSE_FAILED";
}

async function markFailed(port: ResponseCasePort, code: string, version: number, reason: string): Promise<void> {
  try { await port.fail(code, version, "response", reason); }
  catch { /* preserve the original fixed failure code */ }
}

function journal(port: ResponseCasePort, attemptId: string): MindSendJournal {
  return { openSendGate: (digest, at) => port.openAttemptSendGate(attemptId, digest, at),
    acknowledgeSend: (digest, at) => port.acknowledgeAttemptSend(attemptId, digest, at),
    noteAmbiguity: (code) => port.noteAttemptAmbiguity(attemptId, code),
    recordExchange: (evidence) => {
      if (evidence.executionClass !== "live_sdk") throw new Error("MINDS_EXECUTION_NOT_LIVE");
      return port.recordAttemptExchange(attemptId, evidence);
    } };
}

export async function runResponseJob(input: {
  code: string; mindId: string; cases: ResponseCasePort; transport: MindTransport;
  processNonce?: string;
}): Promise<JobOutcome> {
  const minimal = await input.cases.findResponseJobInput(input.code);
  if (!minimal) return { state: "failed", code: "RESPONSE_INPUT_NOT_READY" };
  if (minimal.mindDigest !== sha256(input.mindId)) return { state: "failed", code: "RESPONSE_MIND_MISMATCH" };
  if (minimal.strategyProcessInstanceId === currentProcessInstanceId()) {
    return { state: "failed", code: "RESPONSE_PROCESS_NOT_SEPARATE" };
  }
  const processNonce = input.processNonce ?? randomUUID();
  const prompt = responsePrompt(minimal.returnMessage);
  const attemptId = randomUUID();
  let version = minimal.stateVersion;
  let attemptPrepared = false;
  try {
    const attempt = { id: attemptId, promptDigest: sha256(prompt),
      processInstanceDigest: sha256(currentProcessInstanceId()), sdkVersion: MINDS_SDK_VERSION };
    const claimed = await input.cases.claimResponse(input.code, version, { processNonce, attempt });
    attemptPrepared = true;
    version = claimed.stateVersion;
    const result = await executeMindWork({ transport: input.transport, alias: minimal.stableAlias,
      mindId: input.mindId, processNonce, prompt, journal: journal(input.cases, attemptId),
      expectedBoundary: minimal.strategyBoundary, parse: parseResponseArtifact,
      validate: assertRememberedConstraints });
    const ready = await input.cases.recordResponse(input.code, version, result.artifact, result.evidence);
    version = ready.stateVersion;
    await input.cases.verifyResponseReadback(input.code, result.artifact, result.evidence);
    return { state: "ready", code: "RESPONSE_READY" };
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
