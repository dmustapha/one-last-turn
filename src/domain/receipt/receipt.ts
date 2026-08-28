export type ReceiptLane = "access" | "contact";
export type EvidenceClass = "LIVE" | "PROJECT_OWNED_LIVE" | "SIMULATED";

export type ReceiptEntry = Readonly<{
  classification: EvidenceClass;
  digest: string;
  eventType: string;
  lane: ReceiptLane;
  occurredAt: string;
}>;
