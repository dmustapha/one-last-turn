import { validatePublicHandoff } from "@/proof/evidence-envelope";
import { canonicalCombinedEvidenceDigest } from "@/proof/minds-proof-verifier";
import { createDispatchManifest, randomDispatchDigests } from "@/proof/review-artifacts";
import {
  loadProofEnvironment, mindsFinalDispatchUrl, mindsHandoffUrl, mindsProcessAPromptUrl, mindsProcessAUrl,
  mindsProcessBPromptUrl, mindsProcessBUrl, readEvidence, readSecureTextOnce, requireEnvironment, sha256, writeExclusiveEvidence,
} from "./proof-shared";

async function main(): Promise<void> {
  loadProofEnvironment();
  const expectedMindDigest = sha256(requireEnvironment("MINDS_MIND_ID"));
  const [processA, processB, rawHandoff] = await Promise.all([
    readEvidence(mindsProcessAUrl), readEvidence(mindsProcessBUrl), readEvidence(mindsHandoffUrl),
  ]);
  const handoff = validatePublicHandoff(rawHandoff, expectedMindDigest);
  const [processAPrompt, processBPrompt] = await Promise.all([readSecureTextOnce(mindsProcessAPromptUrl), readSecureTextOnce(mindsProcessBPromptUrl)]);
  const manifest = createDispatchManifest({
    stage: "FINAL", runId: handoff.runId,
    handoffDigest: sha256(JSON.stringify(handoff)),
    evidenceDigest: canonicalCombinedEvidenceDigest(processA, processB, expectedMindDigest, { processA: processAPrompt.text, processB: processBPrompt.text }),
    issuedAt: new Date().toISOString(), dispatchDigests: randomDispatchDigests(),
  });
  await writeExclusiveEvidence(mindsFinalDispatchUrl, manifest);
  console.log("MINDS_FINAL_REVIEW=prepared");
}

await main().catch(() => { console.error("MINDS_FINAL_REVIEW=failed"); process.exitCode = 1; });
