// File: tests/unit/domain/demo-case.test.ts
import { describe, expect, it } from "vitest";
import { transition, type DemoEvent, type DemoSnapshot } from "../../../src/domain/demo/demo-case";

const path: readonly DemoEvent[] = [
  "authorize", "claim_strategy", "record_strategy", "submit_return",
  "claim_response", "record_response", "consume_turn",
];

describe("demo aggregate", () => {
  it("closes only through the complete path", () => {
    const result = path.reduce<DemoSnapshot>((state, event) => {
      const next = transition(state, event);
      if (!next.ok) throw new Error(next.error.code);
      return next.value;
    }, { state: "draft", version: 0 });
    expect(result).toEqual({ state: "closed", version: 7 });
    expect(transition(result, "consume_turn")).toMatchObject({ ok: false });
  });
});
