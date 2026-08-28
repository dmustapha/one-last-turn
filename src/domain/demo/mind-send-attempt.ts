export type MindSendAttemptState =
  | "prepared"
  | "pre_send_failed"
  | "send_outcome_unknown"
  | "send_acknowledged"
  | "exchange_recorded";

export type SendCountClassification = "zero" | "zero_or_one" | "one";

const transitions: Readonly<Record<MindSendAttemptState, readonly MindSendAttemptState[]>> = {
  prepared: ["pre_send_failed", "send_outcome_unknown"],
  pre_send_failed: [],
  send_outcome_unknown: ["send_acknowledged", "exchange_recorded"],
  send_acknowledged: ["exchange_recorded"],
  exchange_recorded: [],
};

export function assertAttemptTransition(from: MindSendAttemptState, to: MindSendAttemptState): void {
  if (!transitions[from].includes(to)) throw new Error("MIND_ATTEMPT_TRANSITION_INVALID");
}

export function sendCountClassification(state: MindSendAttemptState): SendCountClassification {
  if (state === "prepared" || state === "pre_send_failed") return "zero";
  return state === "send_outcome_unknown" ? "zero_or_one" : "one";
}
