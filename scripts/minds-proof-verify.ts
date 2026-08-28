import { buildFailureResult, canonicalCombinedEvidenceDigest, verifyOfflineProof } from "@/proof/minds-proof-verifier";
import { rebuildFinalBundle, validateCompleteSeedChain } from "@/proof/proof-chain";
import {
  loadProofEnvironment,
  mindsFinalRawReviewUrls,
  mindsFinalReviewBundleUrl,
  mindsFinalDispatchUrl,
  mindsHandoffUrl,
  mindsProcessAUrl,
  mindsProcessBUrl,
  mindsProcessAPromptUrl, mindsProcessBPromptUrl,
  mindsSeedAuthorizationUrl, mindsSeedDispatchUrl, mindsSeedGoUrl, mindsSeedRawReviewUrls, mindsSeedSigningKeyUrl,
  mindsResultUrl,
  readEvidence, readEvidenceOnce, readSecureTextOnce,
  requireEnvironment,
  sha256,
  writeEvidence,
} from "./proof-shared";

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  let result = buildFailureResult(generatedAt, "INVALID_EVIDENCE");
  try {
    loadProofEnvironment();
    const expectedMindDigest = sha256(requireEnvironment("MINDS_MIND_ID"));
    const [processA, processB, handoff, seedDispatch, authorization, go, signingKey, finalDispatch, reviewBundle] = await Promise.all([
      readEvidence(mindsProcessAUrl),
      readEvidence(mindsProcessBUrl),
      readEvidence(mindsHandoffUrl), readEvidenceOnce(mindsSeedDispatchUrl),
      readEvidenceOnce(mindsSeedAuthorizationUrl), readEvidenceOnce(mindsSeedGoUrl),
      readEvidence(mindsSeedSigningKeyUrl),
      readEvidence(mindsFinalDispatchUrl),
      readEvidence(mindsFinalReviewBundleUrl),
    ]);
    const [seedReviews, finalReviews] = await Promise.all([
      Promise.all(mindsSeedRawReviewUrls.map(readEvidenceOnce)),
      Promise.all(mindsFinalRawReviewUrls.map(readEvidenceOnce)),
    ]);
    const [processAPrompt, processBPrompt] = await Promise.all([readSecureTextOnce(mindsProcessAPromptUrl), readSecureTextOnce(mindsProcessBPromptUrl)]);
    const trustedPrompts = { processA: processAPrompt.text, processB: processBPrompt.text };
    validateCompleteSeedChain({ processA, processB, handoff, expectedMindDigest,
      seedDispatch, seedReviews, authorization, go, signingKey, prompts: trustedPrompts });
    const validatedHandoff = handoff as { runId: string };
    const rebuiltBundle = rebuildFinalBundle({ dispatch: finalDispatch, reviews: finalReviews, stored: reviewBundle,
      expected: { runId: validatedHandoff.runId, handoffDigest: sha256(JSON.stringify(handoff)), evidenceDigest: canonicalCombinedEvidenceDigest(processA, processB, expectedMindDigest, trustedPrompts) } });
    result = verifyOfflineProof({
      processA, processB, expectedMindDigest, trustedPrompts, reviewBundle: rebuiltBundle,
      recomputedRawReviewDigests: finalReviews.map((review) => review.digest), generatedAt,
    });
  } catch {
    result = buildFailureResult(generatedAt, "INVALID_EVIDENCE");
  }
  await writeEvidence(mindsResultUrl, result);
  console.log(`MINDS_VERIFY=${result.verdict.toLowerCase()}`);
}

await main();
