import { describe, expect, it, vi } from "vitest";

import {
  type ConsentReceipt,
  withPersistentConsent,
} from "@/proof/consent-gate";

const validConsent: ConsentReceipt = {
  consentId: "consent-proof-1",
  participantAlias: "synthetic-affected-adult",
  disclosureVersion: "minds-persistence-v1",
  acceptedAt: "2026-08-26T08:00:00.000Z",
  persistentMemoryAccepted: true,
  deletionLimitAccepted: true,
};

describe("persistent-processing consent gate", () => {
  it("calls Minds only after a complete informed-consent receipt", async () => {
    const providerCall = vi.fn(async () => "provider-receipt");

    const result = await withPersistentConsent(validConsent, providerCall);

    expect(result.providerResult).toBe("provider-receipt");
    expect(result.consentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(providerCall).toHaveBeenCalledOnce();
  });

  it.each([
    undefined,
    { ...validConsent, persistentMemoryAccepted: false },
    { ...validConsent, deletionLimitAccepted: false },
  ])("makes zero provider calls when consent is incomplete", async (receipt) => {
    const providerCall = vi.fn(async () => "must-not-run");

    await expect(withPersistentConsent(receipt, providerCall)).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
    });
    expect(providerCall).not.toHaveBeenCalled();
  });
});

