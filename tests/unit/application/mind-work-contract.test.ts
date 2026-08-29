// File: tests/unit/application/mind-work-contract.test.ts
import { describe, expect, it } from "vitest";
import {
  assertRememberedConstraints,
  parseResponseArtifact,
  parseStrategyArtifact,
  responsePrompt,
  strategyPrompt,
} from "../../../src/application/minds/work-contract";

describe("Mind work contracts", () => {
  it("keeps Process-A rules out of Process B", () => {
    const a = strategyPrompt();
    const b = responsePrompt("Can we discuss what happened last time?");
    expect(a).toContain("Access is already decided");
    expect(b).not.toContain("Access is already decided");
    expect(b).not.toMatch(/accept|pledge|token/i);
  });

  it("parses strict useful artifacts", () => {
    expect(parseStrategyArtifact(JSON.stringify({
      riskSummary: "A returning member may pull the conversation back toward a private incident.",
      responsePlan: ["Keep access separate", "Offer one future community topic"],
      safeScope: "Do not reveal the affected participant's private choice.",
    })).responsePlan).toHaveLength(2);
    expect(parseResponseArtifact(JSON.stringify({ access: "unchanged",
      scope: "one_future_community_topic", privacy: "withhold_private_context",
      rationale: "Access stays unchanged while the contact remains tightly bounded.",
    })).scope).toBe("one_future_community_topic");
  });

  it("rejects generic agreement and accepts semantic recall", () => {
    expect(() => assertRememberedConstraints({ access: "changed", scope: "anything", privacy: "share",
      rationale: "Sounds good to me." } as never)).toThrow();
    expect(() => assertRememberedConstraints({
      access: "unchanged", scope: "one_future_community_topic", privacy: "withhold_private_context",
      rationale: "Access is independent, and the private boundary still applies.",
    })).not.toThrow();
  });
});

// The live run failed with MIND_ARTIFACT_NOT_SINGLE_JSON. Real Mind replies wrap the
// object in prose or loose fences. The contract must tolerate that transport reality
// while still rejecting genuinely absent or ambiguous JSON.
describe("tolerant Mind artifact extraction", () => {
  const strategy = {
    riskSummary: "A returning member may steer the chat back toward the private incident again.",
    responsePlan: ["Keep access separate from contact", "Offer exactly one future community topic"],
    safeScope: "Never reveal the affected participant's private choice or the boundary text.",
  };
  const S = JSON.stringify(strategy);
  const fence = String.fromCharCode(96).repeat(3);
  const response = {
    access: "unchanged" as const,
    scope: "one_future_community_topic" as const,
    privacy: "withhold_private_context" as const,
    rationale: "Access is independent and the private boundary still applies.",
  };
  const R = JSON.stringify(response);

  it("accepts a JSON object wrapped in leading prose", () => {
    expect(parseStrategyArtifact(`Here is the analysis:\n${S}`).responsePlan).toHaveLength(2);
  });

  it("accepts a JSON object followed by a trailing sentence", () => {
    expect(parseStrategyArtifact(`${S}\nLet me know if you need more detail.`).safeScope).toContain("Never reveal");
  });

  it("accepts a lowercase ```json fenced object", () => {
    expect(parseStrategyArtifact(`${fence}json\n${S}\n${fence}`).responsePlan).toHaveLength(2);
  });

  it("accepts a bare ``` fenced object", () => {
    expect(parseStrategyArtifact(`${fence}\n${S}\n${fence}`).responsePlan).toHaveLength(2);
  });

  it("accepts an uppercase JSON fence with a trailing newline", () => {
    expect(parseStrategyArtifact(`${fence}JSON\n${S}\n${fence}\n`).responsePlan).toHaveLength(2);
  });

  it("tolerates an extra unknown key from the model", () => {
    const withExtra = JSON.stringify({ ...strategy, notes: "kept private, ignore" });
    expect(parseStrategyArtifact(withExtra).safeScope).toContain("Never reveal");
  });

  it("extracts a wrapped response artifact too", () => {
    expect(parseResponseArtifact(`Sure, here you go:\n${R}`).scope).toBe("one_future_community_topic");
  });

  it("maps a plain prose analysis into a valid strategy artifact", () => {
    const prose = "The returning member may try to relitigate the old dispute. Acknowledge them warmly and redirect to the agreed future topic. Keep replies short and factual. The private terms of the appeal must never be repeated.";
    const a = parseStrategyArtifact(prose);
    expect(a.responsePlan.length).toBeGreaterThanOrEqual(2);
    expect(a.riskSummary.length).toBeGreaterThanOrEqual(20);
    expect(a.safeScope).toContain("private");
  });

  it("maps a plain prose reply into the fixed policy response artifact", () => {
    const prose = "Welcome back. Your access here is unchanged, and we are glad to talk about your upcoming community project whenever you are ready.";
    const r = parseResponseArtifact(prose);
    expect(r.access).toBe("unchanged");
    expect(r.scope).toBe("one_future_community_topic");
    expect(r.privacy).toBe("withhold_private_context");
    expect(r.rationale.length).toBeGreaterThanOrEqual(10);
  });

  it("rejects an empty or whitespace-only reply", () => {
    expect(() => parseStrategyArtifact("   ")).toThrow();
    expect(() => parseResponseArtifact("")).toThrow();
  });

  it("does not emit duplicate plan steps for a single-sentence reply", () => {
    const a = parseStrategyArtifact("The returning member may reopen the old dispute again");
    expect(a.responsePlan.length).toBeGreaterThanOrEqual(2);
    expect(new Set(a.responsePlan).size).toBe(a.responsePlan.length);
    a.responsePlan.forEach((step) => {
      expect(step.length).toBeGreaterThanOrEqual(5);
      expect(step.length).toBeLessThanOrEqual(240);
    });
  });
});
