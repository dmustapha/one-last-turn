import { describe, expect, it } from "vitest";

import {
  assertAttemptTransition,
  sendCountClassification,
  type MindSendAttemptState,
} from "../../../src/domain/demo/mind-send-attempt";

describe("Mind send-attempt state", () => {
  it.each([
    ["prepared", "pre_send_failed"],
    ["prepared", "send_outcome_unknown"],
    ["send_outcome_unknown", "send_acknowledged"],
    ["send_outcome_unknown", "exchange_recorded"],
    ["send_acknowledged", "exchange_recorded"],
  ] satisfies [MindSendAttemptState, MindSendAttemptState][])('%s -> %s is allowed', (from, to) => {
    expect(() => assertAttemptTransition(from, to)).not.toThrow();
  });

  it.each([
    ["pre_send_failed", "send_outcome_unknown"],
    ["exchange_recorded", "send_acknowledged"],
    ["send_outcome_unknown", "send_outcome_unknown"],
    ["send_acknowledged", "send_outcome_unknown"],
  ] satisfies [MindSendAttemptState, MindSendAttemptState][])('%s -> %s is rejected', (from, to) => {
    expect(() => assertAttemptTransition(from, to)).toThrow("MIND_ATTEMPT_TRANSITION_INVALID");
  });

  it("classifies send count downward-safely", () => {
    expect(sendCountClassification("prepared")).toBe("zero");
    expect(sendCountClassification("pre_send_failed")).toBe("zero");
    expect(sendCountClassification("send_outcome_unknown")).toBe("zero_or_one");
    expect(sendCountClassification("send_acknowledged")).toBe("one");
    expect(sendCountClassification("exchange_recorded")).toBe("one");
  });
});
