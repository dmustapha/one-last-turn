// File: tests/contract/minds-sdk.test.ts
import { describe, expect, it } from "vitest";
import { createMindsClient } from "@animocabrands/minds-client-lib";

describe("Minds SDK 0.1.4 contract", () => {
  it("exposes every adapter method", () => {
    const client = createMindsClient({ builderApiKey: "contract-only-not-sent" });
    for (const name of ["ensureConversation", "getCognitionBalance", "getHistory", "sendMessage", "waitForReply"]) {
      expect(typeof client[name as keyof typeof client]).toBe("function");
    }
  });
});
