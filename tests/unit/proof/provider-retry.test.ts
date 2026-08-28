import { describe, expect, it, vi } from "vitest";

import { retryProviderRead } from "@/proof/provider-retry";

describe("provider read retry", () => {
  it("retries transient network reads and returns the successful value", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("fetch failed"), { code: "network_error" }))
      .mockResolvedValueOnce("fingerprint");

    await expect(
      retryProviderRead(read, { attempts: 2, baseDelayMs: 0 }),
    ).resolves.toBe("fingerprint");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient provider failures", async () => {
    const read = vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { code: "AUTH_FAILED" }));

    await expect(
      retryProviderRead(read, { attempts: 3, baseDelayMs: 0 }),
    ).rejects.toThrow("denied");
    expect(read).toHaveBeenCalledOnce();
  });
});

