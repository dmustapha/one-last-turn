import { readEvidence, writeEvidence, writeExclusiveEvidence } from "../../scripts/proof-io";

export type AttemptPhase = "A" | "B";
export type AttemptState = "CLAIMED" | "SENDING" | "SENT" | "RECORDED" | "FAIL_OR_UNKNOWN";

type AttemptRecord = Readonly<{
  schemaVersion: "minds-proof-attempt-v2";
  phase: AttemptPhase;
  attemptId: string;
  state: AttemptState;
  updatedAt: string;
}>;

export async function claimProofAttempt(
  url: URL,
  phase: AttemptPhase,
  attemptId: string,
  now: string,
): Promise<void> {
  await writeExclusiveEvidence(url, record(phase, attemptId, "CLAIMED", now));
}

export async function executeClaimedSend<T>(input: {
  url: URL;
  phase: AttemptPhase;
  attemptId: string;
  send: () => Promise<T>;
  now: () => string;
}): Promise<T> {
  await transitionAttempt(input.url, input.phase, input.attemptId, "SENDING", input.now());
  try {
    const result = await input.send();
    await transitionAttempt(input.url, input.phase, input.attemptId, "SENT", input.now());
    return result;
  } catch (error) {
    await markAttemptFailed(input.url, input.phase, input.attemptId, input.now());
    throw error;
  }
}

export async function transitionAttempt(
  url: URL,
  phase: AttemptPhase,
  attemptId: string,
  state: AttemptState,
  now: string,
): Promise<void> {
  const current = validateAttempt(await readEvidence(url));
  if (current.phase !== phase || current.attemptId !== attemptId) throw new Error("Attempt identity mismatch");
  if (!isAllowedTransition(current.state, state)) throw new Error("Invalid or repeated attempt transition");
  await writeEvidence(url, record(phase, attemptId, state, now));
}

export async function markAttemptFailed(
  url: URL,
  phase: AttemptPhase,
  attemptId: string,
  now: string,
): Promise<void> {
  try {
    const current = validateAttempt(await readEvidence(url));
    if (current.state === "RECORDED" || current.state === "FAIL_OR_UNKNOWN") return;
    await writeEvidence(url, record(phase, attemptId, "FAIL_OR_UNKNOWN", now));
  } catch {
    // A durable existing claim remains fail-closed even if status repair fails.
  }
}

function isAllowedTransition(from: AttemptState, to: AttemptState): boolean {
  return (from === "CLAIMED" && to === "SENDING") ||
    (from === "SENDING" && (to === "SENT" || to === "FAIL_OR_UNKNOWN")) ||
    (from === "SENT" && (to === "RECORDED" || to === "FAIL_OR_UNKNOWN"));
}

function record(phase: AttemptPhase, attemptId: string, state: AttemptState, updatedAt: string): AttemptRecord {
  if (!/^[-A-Za-z0-9]{1,100}$/.test(attemptId)) throw new Error("Invalid attempt ID");
  if (new Date(Date.parse(updatedAt)).toISOString() !== updatedAt) throw new Error("Invalid attempt timestamp");
  return Object.freeze({ schemaVersion: "minds-proof-attempt-v2", phase, attemptId, state, updatedAt });
}

function validateAttempt(value: unknown): AttemptRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid attempt record");
  const recordValue = value as Record<string, unknown>;
  const keys = Object.keys(recordValue);
  if (keys.length !== 5 || !["schemaVersion", "phase", "attemptId", "state", "updatedAt"].every((key) => Object.hasOwn(recordValue, key))) throw new Error("Invalid attempt fields");
  return record(recordValue.phase as AttemptPhase, recordValue.attemptId as string, recordValue.state as AttemptState, recordValue.updatedAt as string);
}
