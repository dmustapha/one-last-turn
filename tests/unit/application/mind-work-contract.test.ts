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
