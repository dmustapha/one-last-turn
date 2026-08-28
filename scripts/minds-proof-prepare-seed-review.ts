import { validatePublicHandoff } from "@/proof/evidence-envelope";
import { canonicalProcessAEvidenceDigest } from "@/proof/minds-seed-review";
import { createDispatchManifest, randomDispatchDigests } from "@/proof/review-artifacts";
import {
  loadProofEnvironment, mindsHandoffUrl, mindsProcessAPromptUrl, mindsProcessAUrl, mindsSeedDispatchUrl, mindsSeedSigningKeyUrl,
  readEvidence, readSecureTextOnce, requireEnvironment, sha256, writeExclusiveEvidence,
} from "./proof-shared";

async function main(): Promise<void> {
  loadProofEnvironment();
  const expectedMindDigest = sha256(requireEnvironment("MINDS_MIND_ID"));
  const [processA, rawHandoff] = await Promise.all([readEvidence(mindsProcessAUrl), readEvidence(mindsHandoffUrl)]);
  const handoff = validatePublicHandoff(rawHandoff, expectedMindDigest);
  const prompt = (await readSecureTextOnce(mindsProcessAPromptUrl)).text;
  await writeExclusiveEvidence(mindsSeedSigningKeyUrl, {
    schemaVersion: "minds-seed-signing-key-v1", key: randomBytes(32).toString("hex"),
  });
  const manifest = createDispatchManifest({
    stage: "SEED", runId: handoff.runId,
    handoffDigest: sha256(JSON.stringify(handoff)),
    evidenceDigest: canonicalProcessAEvidenceDigest(processA, expectedMindDigest, prompt),
    issuedAt: new Date().toISOString(), dispatchDigests: randomDispatchDigests(),
  });
  await writeExclusiveEvidence(mindsSeedDispatchUrl, manifest);
  console.log("MINDS_SEED_REVIEW=prepared");
}

await main().catch(() => { console.error("MINDS_SEED_REVIEW=failed"); process.exitCode = 1; });
import { randomBytes } from "node:crypto";
