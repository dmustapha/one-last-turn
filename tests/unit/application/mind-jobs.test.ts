// File: tests/unit/application/mind-jobs.test.ts
import { describe, expect, it, vi } from "vitest";
import { MindsApiError } from "@animocabrands/minds-client-lib";
import { runResponseJob } from "../../../src/application/minds/run-response-job";
import { runStrategyJob } from "../../../src/application/minds/run-strategy-job";
import { createBoundary, sha256 } from "../../../src/infrastructure/minds/history";

const transport = { getCognitionBalance: vi.fn(), ensureConversation: vi.fn(),
  getConversation: vi.fn(), getHistory: vi.fn(), sendMessage: vi.fn(), waitForReply: vi.fn() };

describe("separate Mind jobs", () => {
  it("does not send before strategy authorization", async () => {
    const cases = { findByCode: async () => null } as never;
    expect(await runStrategyJob({ code: "OLT-X", mindId: "mind", cases, transport })).toEqual({ state: "failed", code: "STRATEGY_NOT_AUTHORIZED" });
    expect(transport.sendMessage).not.toHaveBeenCalled();
  });
  it("does not send without minimized response input", async () => {
    const cases = { findResponseJobInput: async () => null } as never;
    expect(await runResponseJob({ code: "OLT-X", mindId: "mind", cases, transport })).toEqual({ state: "failed", code: "RESPONSE_INPUT_NOT_READY" });
    expect(transport.sendMessage).not.toHaveBeenCalled();
  });
  it("rejects Process-B boundary drift before send", async () => {
    const expected = { schemaVersion: 1 as const, digest: "a".repeat(64), rowCount: 1,
      newestFingerprintDigest: "b".repeat(64), oldestFingerprintDigest: "b".repeat(64),
      capturedAt: "2026-08-27T00:00:00.000Z" };
    const cases = { findResponseJobInput: async () => ({ state: "returned", stateVersion: 4,
      stableAlias: "alias", mindDigest: sha256("mind"), strategyBoundary: expected,
      strategyProcessInstanceId: "00000000-0000-4000-8000-000000000099", returnMessage: "hello" }),
      claimResponse: async () => ({ stateVersion: 5 }), fail: async () => ({ stateVersion: 6 }) } as never;
    const isolated = { getCognitionBalance: vi.fn(async () => 1),
      ensureConversation: vi.fn(async () => ({ mindId: "mind" })),
      getConversation: vi.fn(async () => ({ alias: "alias", participants: [
        { partyType: 0, partyId: "mind" }, { partyType: 1, partyId: "human" },
      ] })), getHistory: vi.fn(async () => []),
      sendMessage: vi.fn(), waitForReply: vi.fn() };
    await expect(runResponseJob({ code: "OLT-X", mindId: "mind", cases, transport: isolated }))
      .resolves.toEqual({ state: "failed", code: "MINDS_HISTORY_BOUNDARY_MISMATCH" });
    expect(isolated.sendMessage).not.toHaveBeenCalled();
  });

  it("persists a safe authentication code when Cognition preflight is unauthorized", async () => {
    const fail = vi.fn(async () => ({ stateVersion: 3 }));
    const settleAttemptFailure = vi.fn(async () => undefined);
    const cases = {
      findByCode: async () => ({ id: "case", state: "authorized", stateVersion: 1 }),
      claimStrategy: async () => ({ stateVersion: 2 }),
      fail, settleAttemptFailure,
    } as never;
    const isolated = {
      getCognitionBalance: vi.fn(async () => { throw new MindsApiError({
        status: 401, code: "AUTH_FAILED", message: "Unauthorized",
      }); }),
      ensureConversation: vi.fn(), getConversation: vi.fn(), getHistory: vi.fn(),
      sendMessage: vi.fn(), waitForReply: vi.fn(),
    };

    await expect(runStrategyJob({ code: "OLT-X", mindId: "mind", cases, transport: isolated }))
      .resolves.toEqual({ state: "failed", code: "MINDS_AUTH_FAILED" });
    expect(fail).toHaveBeenCalledWith("OLT-X", 2, "strategy", "MINDS_AUTH_FAILED");
    expect(settleAttemptFailure).toHaveBeenCalledWith(expect.any(String), "MINDS_AUTH_FAILED");
    expect(isolated.sendMessage).not.toHaveBeenCalled();
  });

  it("persists an unverified alias binding as a distinct pre-send failure", async () => {
    const fail = vi.fn(async () => ({ stateVersion: 3 }));
    const settleAttemptFailure = vi.fn(async () => undefined);
    const cases = {
      findByCode: async () => ({ id: "case", state: "authorized", stateVersion: 1 }),
      claimStrategy: async () => ({ stateVersion: 2 }), fail, settleAttemptFailure,
    } as never;
    const isolated = { getCognitionBalance: vi.fn(async () => 1),
      ensureConversation: vi.fn(async () => ({})),
      getConversation: vi.fn(async () => ({ participants: [] })), getHistory: vi.fn(),
      sendMessage: vi.fn(), waitForReply: vi.fn() };

    await expect(runStrategyJob({ code: "OLT-X", mindId: "mind", cases, transport: isolated }))
      .resolves.toEqual({ state: "failed", code: "MINDS_ALIAS_MIND_UNVERIFIED" });
    expect(settleAttemptFailure).toHaveBeenCalledWith(expect.any(String), "MINDS_ALIAS_MIND_UNVERIFIED");
    expect(isolated.sendMessage).not.toHaveBeenCalled();
  });

  it("classifies acknowledgement persistence failure after the send gate", async () => {
    const attempt = { state: "prepared", safeCode: null as string | null,
      providerMessageIdDigest: null as string | null };
    let ambiguityWrites = 0;
    const fail = vi.fn(async () => ({ stateVersion: 3 }));
    const recordAttemptExchange = vi.fn();
    const cases = {
      findByCode: async () => ({ id: "case", state: "authorized", stateVersion: 1 }),
      claimStrategy: async () => ({ stateVersion: 2 }),
      openAttemptSendGate: async () => { attempt.state = "send_outcome_unknown"; },
      acknowledgeAttemptSend: async () => { throw new Error("MIND_ATTEMPT_TRANSITION_REJECTED"); },
      noteAttemptAmbiguity: async () => { ambiguityWrites += 1;
        throw new Error("AMBIGUITY_JOURNAL_FAILED"); },
      recordAttemptExchange,
      settleAttemptFailure: async (_id: string, safeCode: string) => {
        if (attempt.state === "send_outcome_unknown" && attempt.safeCode === null) attempt.safeCode = safeCode;
      },
      fail,
    } as never;
    const sendMessage = vi.fn(async () => ({ messageId: "out" }));
    const isolated = { getCognitionBalance: vi.fn(async () => 1),
      ensureConversation: vi.fn(async () => ({ mindId: "mind" })),
      getConversation: vi.fn(async (alias: string) => ({ alias, participants: [
        { partyType: 0, partyId: "mind" }, { partyType: 1, partyId: "human" },
      ] })), getHistory: vi.fn(async () => []), sendMessage, waitForReply: vi.fn() };

    const result = await runStrategyJob({ code: "OLT-X", mindId: "mind", cases, transport: isolated });

    expect(attempt.state).toBe("send_outcome_unknown");
    expect(attempt.providerMessageIdDigest).toBeNull();
    expect(attempt.safeCode).toBe("MINDS_ACK_PERSISTENCE_FAILED");
    expect(result).toEqual({ state: "failed", code: "MINDS_ACK_PERSISTENCE_FAILED" });
    expect(fail).toHaveBeenCalledWith("OLT-X", 2, "strategy", "MINDS_ACK_PERSISTENCE_FAILED");
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(ambiguityWrites).toBe(1);
    expect(isolated.waitForReply).not.toHaveBeenCalled();
    expect(recordAttemptExchange).not.toHaveBeenCalled();
  });

  it("preserves the same safe authentication code in Process B", async () => {
    const fail = vi.fn(async () => ({ stateVersion: 6 }));
    const settleAttemptFailure = vi.fn(async () => undefined);
    const boundary = { schemaVersion: 1 as const, digest: "a".repeat(64), rowCount: 0,
      newestFingerprintDigest: null, oldestFingerprintDigest: null,
      capturedAt: "2026-08-27T00:00:00.000Z" };
    const cases = {
      findResponseJobInput: async () => ({ state: "returned", stateVersion: 4,
        stableAlias: "alias", mindDigest: sha256("mind"), strategyBoundary: boundary,
        strategyProcessInstanceId: "00000000-0000-4000-8000-000000000099", returnMessage: "hello" }),
      claimResponse: async () => ({ stateVersion: 5 }), fail, settleAttemptFailure,
    } as never;
    const isolated = {
      getCognitionBalance: vi.fn(async () => { throw new MindsApiError({
        status: 401, code: "AUTH_FAILED", message: "Unauthorized",
      }); }),
      ensureConversation: vi.fn(), getConversation: vi.fn(), getHistory: vi.fn(),
      sendMessage: vi.fn(), waitForReply: vi.fn(),
    };

    await expect(runResponseJob({ code: "OLT-X", mindId: "mind", cases, transport: isolated }))
      .resolves.toEqual({ state: "failed", code: "MINDS_AUTH_FAILED" });
    expect(fail).toHaveBeenCalledWith("OLT-X", 5, "response", "MINDS_AUTH_FAILED");
    expect(settleAttemptFailure).toHaveBeenCalledWith(expect.any(String), "MINDS_AUTH_FAILED");
    expect(isolated.sendMessage).not.toHaveBeenCalled();
  });

  it("preserves acknowledgement persistence failure in Process B", async () => {
    const boundary = createBoundary([], "2026-08-27T00:00:00.000Z");
    const attempt = { state: "prepared", safeCode: null as string | null };
    const fail = vi.fn(async () => ({ stateVersion: 6 }));
    const cases = {
      findResponseJobInput: async () => ({ state: "returned", stateVersion: 4,
        stableAlias: "alias", mindDigest: sha256("mind"), strategyBoundary: boundary,
        strategyProcessInstanceId: "00000000-0000-4000-8000-000000000099", returnMessage: "hello" }),
      claimResponse: async () => ({ stateVersion: 5 }),
      openAttemptSendGate: async () => { attempt.state = "send_outcome_unknown"; },
      acknowledgeAttemptSend: async () => { throw new Error("MIND_ATTEMPT_TRANSITION_REJECTED"); },
      noteAttemptAmbiguity: async (_id: string, safeCode: string) => { attempt.safeCode = safeCode; },
      recordAttemptExchange: vi.fn(), settleAttemptFailure: async () => undefined, fail,
    } as never;
    const sendMessage = vi.fn(async () => ({ messageId: "out" }));
    const isolated = { getCognitionBalance: vi.fn(async () => 1),
      ensureConversation: vi.fn(async () => ({ mindId: "mind" })),
      getConversation: vi.fn(async (alias: string) => ({ alias, participants: [
        { partyType: 0, partyId: "mind" }, { partyType: 1, partyId: "human" },
      ] })), getHistory: vi.fn(async () => []), sendMessage, waitForReply: vi.fn() };

    const result = await runResponseJob({ code: "OLT-X", mindId: "mind", cases, transport: isolated });

    expect(attempt).toEqual({ state: "send_outcome_unknown", safeCode: "MINDS_ACK_PERSISTENCE_FAILED" });
    expect(result).toEqual({ state: "failed", code: "MINDS_ACK_PERSISTENCE_FAILED" });
    expect(fail).toHaveBeenCalledWith("OLT-X", 5, "response", "MINDS_ACK_PERSISTENCE_FAILED");
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
