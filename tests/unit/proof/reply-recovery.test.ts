import { describe, expect, it, vi } from "vitest";

import { waitForHistoryReply } from "@/proof/reply-recovery";

describe("late Minds reply recovery", () => {
  it("polls history after timeout and returns the first Mind reply", async () => {
    const loadHistory = vi
      .fn()
      .mockResolvedValueOnce([{ senderType: 1, messageText: "human" }])
      .mockResolvedValueOnce([
        { senderType: 0, messageText: "late reply", fingerprint: "reply-fp" },
        { senderType: 1, messageText: "human" },
      ]);

    const reply = await waitForHistoryReply({
      loadHistory,
      attempts: 2,
      intervalMs: 0,
    });

    expect(reply.messageText).toBe("late reply");
    expect(loadHistory).toHaveBeenCalledTimes(2);
  });

  it("fails explicitly when no Mind reply reaches history", async () => {
    await expect(
      waitForHistoryReply({
        loadHistory: async () => [{ senderType: 1, messageText: "human" }],
        attempts: 2,
        intervalMs: 0,
      }),
    ).rejects.toThrow(/did not reach history/i);
  });
});

