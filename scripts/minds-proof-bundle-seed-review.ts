import { buildSeedAuthorization, parseRawReviewOnce, validateDispatchBindings } from "@/proof/review-artifacts";
import { canonicalProcessAEvidenceDigest } from "@/proof/minds-seed-review";
import { validatePublicHandoff } from "@/proof/evidence-envelope";
import {
  loadProofEnvironment, mindsHandoffUrl, mindsProcessAPromptUrl, mindsProcessAUrl, mindsSeedAuthorizationUrl, mindsSeedDispatchUrl, mindsSeedRawReviewUrls,
  readEvidence, readEvidenceOnce, readSecureTextOnce, requireEnvironment, sha256, writeExclusiveEvidence,
} from "./proof-shared";

async function main(): Promise<void> {
  loadProofEnvironment();
  const expectedMindDigest = sha256(requireEnvironment("MINDS_MIND_ID"));
  const [rawManifest, processA, rawHandoff] = await Promise.all([readEvidence(mindsSeedDispatchUrl), readEvidence(mindsProcessAUrl), readEvidence(mindsHandoffUrl)]);
  const handoff = validatePublicHandoff(rawHandoff, expectedMindDigest);
  const prompt = (await readSecureTextOnce(mindsProcessAPromptUrl)).text;
  const manifest = validateDispatchBindings(rawManifest, { stage: "SEED", runId: handoff.runId, handoffDigest: sha256(JSON.stringify(handoff)), evidenceDigest: canonicalProcessAEvidenceDigest(processA, expectedMindDigest, prompt) });
  const reviews = await Promise.all(mindsSeedRawReviewUrls.map(async (url) =>
    parseRawReviewOnce(await readEvidenceOnce(url), "SEED")));
  await writeExclusiveEvidence(mindsSeedAuthorizationUrl, buildSeedAuthorization(manifest, reviews));
  console.log("MINDS_SEED_REVIEW=bundled");
}

await main().catch(() => { console.error("MINDS_SEED_REVIEW=failed"); process.exitCode = 1; });
