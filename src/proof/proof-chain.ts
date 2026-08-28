import { createPublicHandoff, validateProcessAEnvelope, validateProcessBEnvelope, validatePublicHandoff } from "@/proof/evidence-envelope";
import { buildSeedGoReceipt, canonicalProcessAEvidenceDigest } from "@/proof/minds-seed-review";
import { parseSeedSigningKey, signSeedGoReceipt } from "@/proof/minds-resume-flow";
import { buildReviewBundle, buildSeedAuthorization, parseRawReviewOnce, validateDispatchBindings } from "@/proof/review-artifacts";

type Once = Readonly<{ bytes: Uint8Array; digest: string; parsed: unknown }>;

export function validateCompleteSeedChain(input: {
  processA: unknown; processB: unknown; handoff: unknown; expectedMindDigest: string;
  seedDispatch: Once; seedReviews: readonly Once[]; authorization: Once; go: Once; signingKey: unknown;
  prompts: { processA: string; processB: string };
}): void {
  const processA = validateProcessAEnvelope(input.processA, input.expectedMindDigest);
  const processB = validateProcessBEnvelope(input.processB, input.expectedMindDigest);
  const handoff = validatePublicHandoff(input.handoff, input.expectedMindDigest);
  assertSame(handoff, createPublicHandoff(processA, input.expectedMindDigest));
  validateDispatchBindings(input.seedDispatch.parsed, { stage: "SEED", runId: handoff.runId,
    handoffDigest: sha256(JSON.stringify(handoff)), evidenceDigest: canonicalProcessAEvidenceDigest(processA, input.expectedMindDigest, input.prompts.processA) });
  const reviews = input.seedReviews.map((review) => parseRawReviewOnce(review, "SEED"));
  const authorization = buildSeedAuthorization(input.seedDispatch.parsed, reviews);
  assertSame(input.authorization.parsed, authorization);
  const go = buildSeedGoReceipt({
    processA, handoff, expectedMindDigest: input.expectedMindDigest,
    authorization, authorizationDigest: input.authorization.digest,
    recomputedRawReviewDigests: input.seedReviews.map((review) => review.digest),
    dispatchManifestDigest: input.seedDispatch.digest,
    issuedAt: (input.go.parsed as { issuedAt?: unknown }).issuedAt as string,
    trustedPrompt: input.prompts.processA,
  });
  assertSame(input.go.parsed, signSeedGoReceipt(go, parseSeedSigningKey(input.signingKey)));
  if (processB.seedGoDigest !== input.go.digest) throw new Error("Process B seed gate file binding mismatch");
}

export function rebuildFinalBundle(input: { dispatch: unknown; reviews: readonly Once[]; stored: unknown; expected: { runId: string; handoffDigest: string; evidenceDigest: string } }): unknown {
  validateDispatchBindings(input.dispatch, { stage: "FINAL", ...input.expected });
  const reviews = input.reviews.map((review) => parseRawReviewOnce(review, "FINAL"));
  const rebuilt = buildReviewBundle(input.dispatch, reviews);
  assertSame(input.stored, rebuilt);
  return rebuilt;
}

function assertSame(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Stored proof artifact does not match derived evidence");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
import { createHash } from "node:crypto";
