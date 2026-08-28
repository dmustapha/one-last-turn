// File: src/domain/demo/demo-receipt.ts
import { createHash } from "node:crypto";
import { z } from "zod";

export const RECEIPT_EVIDENCE_CLASSES = [
  "strategy_live_exchange", "response_live_exchange", "same_alias",
  "exact_boundary", "semantic_constraints", "one_turn_consumed",
] as const;
export type ReceiptEvidenceClass = (typeof RECEIPT_EVIDENCE_CLASSES)[number];

const receiptInputSchema = z.object({
  caseCodeDigest: z.string().regex(/^[0-9a-f]{64}$/),
  strategyDigest: z.string().regex(/^[0-9a-f]{64}$/),
  responseDigest: z.string().regex(/^[0-9a-f]{64}$/),
  beforeVersion: z.number().int().nonnegative(), afterVersion: z.number().int().positive(),
  strategyReadyAt: z.string().datetime({ offset: false }),
  responseReadyAt: z.string().datetime({ offset: false }),
  consumedAt: z.string().datetime({ offset: false }),
  evidenceClasses: z.tuple([
    z.literal("strategy_live_exchange"), z.literal("response_live_exchange"),
    z.literal("same_alias"), z.literal("exact_boundary"),
    z.literal("semantic_constraints"), z.literal("one_turn_consumed"),
  ]),
}).strict().superRefine((value, context) => {
  if (value.afterVersion !== value.beforeVersion + 1) {
    context.addIssue({ code: "custom", message: "receipt versions must be sequential" });
  }
});
export type ReceiptInput = z.infer<typeof receiptInputSchema>;

export function createReceipt(input: ReceiptInput): string {
  const value = receiptInputSchema.parse(input);
  const ordered = [value.caseCodeDigest, value.strategyDigest, value.responseDigest,
    value.beforeVersion, value.afterVersion, value.strategyReadyAt,
    value.responseReadyAt, value.consumedAt, value.evidenceClasses];
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}
