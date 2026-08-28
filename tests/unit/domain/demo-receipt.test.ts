// File: tests/unit/domain/demo-receipt.test.ts
import { describe, expect, it } from "vitest";
import { createReceipt, RECEIPT_EVIDENCE_CLASSES, type ReceiptInput } from "../../../src/domain/demo/demo-receipt";

const valid: ReceiptInput = { caseCodeDigest: "a".repeat(64), strategyDigest: "b".repeat(64),
  responseDigest: "c".repeat(64), beforeVersion: 6, afterVersion: 7,
  strategyReadyAt: "2026-08-27T00:00:00.000Z", responseReadyAt: "2026-08-27T00:01:00.000Z",
  consumedAt: "2026-08-27T00:02:00.000Z", evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] };

describe("demo receipt", () => {
  it("is deterministic", () => expect(createReceipt(valid)).toBe(createReceipt(valid)));
  it("rejects a version gap", () => expect(() => createReceipt({ ...valid, afterVersion: 8 })).toThrow());
  it("rejects reordered evidence", () => expect(() => createReceipt({ ...valid,
    evidenceClasses: [...valid.evidenceClasses].reverse() } as unknown as ReceiptInput)).toThrow());
});
