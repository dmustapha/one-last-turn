import { createHash } from "node:crypto";

export type ConsentReceipt = {
  consentId: string;
  participantAlias: string;
  disclosureVersion: string;
  acceptedAt: string;
  persistentMemoryAccepted: boolean;
  deletionLimitAccepted: boolean;
};

export class ProofInvariantError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ProofInvariantError";
  }
}

function assertCompleteConsent(receipt?: ConsentReceipt): asserts receipt is ConsentReceipt {
  if (
    !receipt ||
    !receipt.persistentMemoryAccepted ||
    !receipt.deletionLimitAccepted
  ) {
    throw new ProofInvariantError(
      "CONSENT_REQUIRED",
      "Persistent processing requires informed consent",
    );
  }
}

function digestConsent(receipt: ConsentReceipt): string {
  const canonical = [
    receipt.consentId,
    receipt.participantAlias,
    receipt.disclosureVersion,
    receipt.acceptedAt,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export async function withPersistentConsent<T>(
  receipt: ConsentReceipt | undefined,
  providerCall: () => Promise<T>,
): Promise<{ consentDigest: string; providerResult: T }> {
  assertCompleteConsent(receipt);
  const consentDigest = digestConsent(receipt);
  const providerResult = await providerCall();
  return { consentDigest, providerResult };
}

