import { buildSeedGoReceipt } from "@/proof/minds-seed-review";
import { parseSeedSigningKey, signSeedGoReceipt } from "@/proof/minds-resume-flow";
import { buildSeedAuthorization, parseRawReviewOnce, validateDispatchBindings } from "@/proof/review-artifacts";
import {
  loadProofEnvironment,
  mindsHandoffUrl,
  mindsProcessAUrl,
  mindsSeedAuthorizationUrl,
  mindsSeedDispatchUrl, mindsSeedSigningKeyUrl,
  mindsProcessAPromptUrl,
  mindsSeedGoUrl,
  mindsSeedRawReviewUrls,
  readEvidence,
  readEvidenceOnce,
  readSecureTextOnce,
  requireEnvironment,
  sha256,
  writeExclusiveEvidence,
} from "./proof-shared";

async function main(): Promise<void> {
  loadProofEnvironment();
  const expectedMindDigest = sha256(requireEnvironment("MINDS_MIND_ID"));
  const [processA, handoff, authorizationOnce, dispatchOnce, keyValue] = await Promise.all([
    readEvidence(mindsProcessAUrl),
    readEvidence(mindsHandoffUrl),
    readEvidenceOnce(mindsSeedAuthorizationUrl),
    readEvidenceOnce(mindsSeedDispatchUrl), readEvidence(mindsSeedSigningKeyUrl),
  ]);
  const rawReviews = await Promise.all(mindsSeedRawReviewUrls.map(readEvidenceOnce));
  const prompt = (await readSecureTextOnce(mindsProcessAPromptUrl)).text;
  const handoffDigest = sha256(JSON.stringify(handoff));
  const reviews = rawReviews.map((review) => parseRawReviewOnce(review, "SEED"));
  const rebuilt = buildSeedAuthorization(dispatchOnce.parsed, reviews);
  if (JSON.stringify(rebuilt) !== JSON.stringify(authorizationOnce.parsed)) throw new Error("Stored seed authorization is not derived");
  validateDispatchBindings(dispatchOnce.parsed, { stage: "SEED", runId: rebuilt.findings[0] ? (handoff as { runId: string }).runId : "", handoffDigest, evidenceDigest: rebuilt.evidenceDigest });
  const payload = buildSeedGoReceipt({
    processA, handoff, expectedMindDigest, authorization: rebuilt,
    authorizationDigest: authorizationOnce.digest,
    recomputedRawReviewDigests: rawReviews.map((review) => review.digest),
    dispatchManifestDigest: dispatchOnce.digest, issuedAt: new Date().toISOString(),
    trustedPrompt: prompt,
  });
  await writeExclusiveEvidence(mindsSeedGoUrl, signSeedGoReceipt(payload, parseSeedSigningKey(keyValue)));
  console.log("MINDS_SEED_GATE=go");
}

await main().catch(() => { console.error("MINDS_SEED_GATE=failed"); process.exitCode = 1; });
