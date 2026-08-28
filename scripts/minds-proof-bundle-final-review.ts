import { buildReviewBundle, parseRawReviewOnce, validateDispatchBindings } from "@/proof/review-artifacts";
import { validatePublicHandoff } from "@/proof/evidence-envelope";
import { canonicalCombinedEvidenceDigest } from "@/proof/minds-proof-verifier";
import {
  loadProofEnvironment, mindsFinalDispatchUrl, mindsFinalRawReviewUrls, mindsFinalReviewBundleUrl, mindsHandoffUrl, mindsProcessAPromptUrl, mindsProcessAUrl, mindsProcessBPromptUrl, mindsProcessBUrl,
  readEvidence, readEvidenceOnce, readSecureTextOnce, requireEnvironment, sha256, writeExclusiveEvidence,
} from "./proof-shared";

async function main(): Promise<void> {
  loadProofEnvironment();
  const expectedMindDigest = sha256(requireEnvironment("MINDS_MIND_ID"));
  const [rawManifest, processA, processB, rawHandoff] = await Promise.all([readEvidence(mindsFinalDispatchUrl), readEvidence(mindsProcessAUrl), readEvidence(mindsProcessBUrl), readEvidence(mindsHandoffUrl)]);
  const handoff = validatePublicHandoff(rawHandoff, expectedMindDigest);
  const [processAPrompt, processBPrompt] = await Promise.all([readSecureTextOnce(mindsProcessAPromptUrl), readSecureTextOnce(mindsProcessBPromptUrl)]);
  const manifest = validateDispatchBindings(rawManifest, { stage: "FINAL", runId: handoff.runId, handoffDigest: sha256(JSON.stringify(handoff)), evidenceDigest: canonicalCombinedEvidenceDigest(processA, processB, expectedMindDigest, { processA: processAPrompt.text, processB: processBPrompt.text }) });
  const reviews = await Promise.all(mindsFinalRawReviewUrls.map(async (url) =>
    parseRawReviewOnce(await readEvidenceOnce(url), "FINAL")));
  await writeExclusiveEvidence(mindsFinalReviewBundleUrl, buildReviewBundle(manifest, reviews));
  console.log("MINDS_FINAL_REVIEW=bundled");
}

await main().catch(() => { console.error("MINDS_FINAL_REVIEW=failed"); process.exitCode = 1; });
