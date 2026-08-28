// File: tests/unit/application/demo-controller.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { DemoController } from "../../../src/application/demo-controller";

describe("demo controller", () => {
  it("keeps provider work out of web actions and exposes deterministic CLI commands", async () => {
    const [actions, command, health] = await Promise.all([
      readFile(new URL("../../../src/app/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../scripts/run-case-command.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../src/app/api/health/route.ts", import.meta.url), "utf8"),
    ]);
    expect(actions).not.toMatch(/createMindRuntime|sendMessage|runStrategyJob|runResponseJob/);
    expect(command).toContain('action === "create"');
    expect(health).toContain('status: ready ? "ready" : "not_ready"');
  });
  it("creates a fresh synthetic draft view", async () => {
    const record = { publicCode: "OLT-FRESH", state: "draft", stateVersion: 0,
      strategyArtifact: null, strategyDigest: null, strategyReadyAt: null, strategyProvenance: null,
      returnMessage: null, responseArtifact: null, responseDigest: null, responseReadyAt: null,
      responseProvenance: null, receiptDigest: null, turnConsumedAt: null,
      receiptEvidenceClasses: null, failureStage: null, failureCode: null };
    const controller = new DemoController({ createCase: vi.fn(async () => record) } as never);
    await expect(controller.create()).resolves.toMatchObject({ code: "OLT-FRESH", state: "draft" });
  });
  it("loads a redacted draft view", async () => {
    const record = { publicCode: "OLT-TEST", state: "draft", stateVersion: 0,
      strategyArtifact: null, strategyDigest: null, strategyReadyAt: null, strategyProvenance: null,
      returnMessage: null, responseArtifact: null, responseDigest: null, responseReadyAt: null,
      responseProvenance: null, receiptDigest: null, turnConsumedAt: null,
      receiptEvidenceClasses: null, failureStage: null, failureCode: null };
    const controller = new DemoController({ findByCode: vi.fn(async () => record) } as never);
    const view = await controller.load("OLT-TEST");
    expect(view).toEqual({ code: "OLT-TEST", state: "draft", expectedVersion: 0, synthetic: true,
      evidence: ["Process A pending", "Process B pending"] });
    expect(JSON.stringify(view)).not.toMatch(/messageText|fingerprint|processNonce/);
  });
  it("never exposes model-authored strategy text", async () => {
    const record = { publicCode: "OLT-TEST", state: "strategy_ready", stateVersion: 3,
      strategyArtifact: { riskSummary: "MODEL_PRIVATE_DETAIL_SHOULD_NOT_RENDER" },
      strategyDigest: "a".repeat(64), strategyReadyAt: "2026-08-27T00:00:00.000Z",
      strategyProvenance: {}, returnMessage: null, responseArtifact: null, responseDigest: null,
      responseReadyAt: null, responseProvenance: null, receiptDigest: null, turnConsumedAt: null,
      receiptEvidenceClasses: null, failureStage: null, failureCode: null };
    const controller = new DemoController({ findByCode: vi.fn(async () => record) } as never);
    const view = await controller.load("OLT-TEST");
    expect(view.strategy?.summary).toBe("Private response strategy persisted");
    expect(JSON.stringify(view)).not.toContain("MODEL_PRIVATE_DETAIL_SHOULD_NOT_RENDER");
  });
  it("renders a fixed public response and keeps private rationale out", async () => {
    const record = { publicCode: "OLT-TEST", state: "response_ready", stateVersion: 6,
      strategyArtifact: null, strategyDigest: null, strategyReadyAt: null, strategyProvenance: {},
      returnMessage: "hello", responseArtifact: { access: "unchanged", scope: "one_future_community_topic",
        privacy: "withhold_private_context", rationale: "PRIVATE_SENTINEL" }, responseDigest: "b".repeat(64),
      responseReadyAt: "2026-08-27T00:00:00.000Z", responseProvenance: {}, receiptDigest: null,
      turnConsumedAt: null, receiptEvidenceClasses: null, failureStage: null, failureCode: null };
    const controller = new DemoController({ findByCode: vi.fn(async () => record) } as never);
    const view = await controller.load("OLT-TEST");
    expect(view.response?.text).toContain("Your access is unchanged");
    expect(JSON.stringify(view)).not.toContain("PRIVATE_SENTINEL");
  });
});
