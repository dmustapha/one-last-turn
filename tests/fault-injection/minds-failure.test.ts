// File: tests/fault-injection/minds-failure.test.ts
import { describe, expect, it, vi } from "vitest";
import { executeMindWork } from "../../src/infrastructure/minds/minds-worker";

describe("Mind send fault", () => {
  it("attempts one send when the client throws ambiguously", async () => {
    const sendMessage = vi.fn(async () => { throw new Error("network"); });
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => ({
        alias: "alias", participants: [
          { partyType: 0, partyId: "mind" }, { partyType: 1, partyId: "human" },
        ],
      }),
      getHistory: async () => [],
      sendMessage, waitForReply: vi.fn() };
    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "one assignment",
      parse: String, recoveryDelayMs: 0 }))
      .rejects.toThrow("MINDS_SEND_AMBIGUOUS");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
