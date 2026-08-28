// File: src/domain/demo/demo-case.ts
export const DEMO_STATES = [
  "draft", "authorized", "strategy_running", "strategy_ready", "returned",
  "response_running", "response_ready", "closed", "failed",
] as const;

export type DemoState = (typeof DEMO_STATES)[number];
export type DemoEvent =
  | "authorize" | "claim_strategy" | "record_strategy" | "submit_return"
  | "claim_response" | "record_response" | "consume_turn" | "fail";

export type DemoSnapshot = Readonly<{ state: DemoState; version: number }>;
export type TransitionResult =
  | Readonly<{ ok: true; value: DemoSnapshot }>
  | Readonly<{ ok: false; error: { code: "DEMO_TRANSITION" | "DEMO_TERMINAL" } }>;

const next: Readonly<Record<Exclude<DemoState, "closed" | "failed">, Partial<Record<DemoEvent, DemoState>>>> = {
  draft: { authorize: "authorized", fail: "failed" },
  authorized: { claim_strategy: "strategy_running", fail: "failed" },
  strategy_running: { record_strategy: "strategy_ready", fail: "failed" },
  strategy_ready: { submit_return: "returned", fail: "failed" },
  returned: { claim_response: "response_running", fail: "failed" },
  response_running: { record_response: "response_ready", fail: "failed" },
  response_ready: { consume_turn: "closed", fail: "failed" },
};

export function transition(snapshot: DemoSnapshot, event: DemoEvent): TransitionResult {
  if (snapshot.state === "closed" || snapshot.state === "failed") {
    return { ok: false, error: { code: "DEMO_TERMINAL" } };
  }
  const state = next[snapshot.state][event];
  return state
    ? { ok: true, value: { state, version: snapshot.version + 1 } }
    : { ok: false, error: { code: "DEMO_TRANSITION" } };
}
