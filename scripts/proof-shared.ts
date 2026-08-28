import { evidenceDirectory } from "./proof-io";

export {
  digestEvidenceFile,
  evidenceDirectory,
  loadProofEnvironment,
  readEvidence,
  readEvidenceOnce,
  readSecureTextOnce,
  requireEnvironment,
  safeMessageId,
  sha256,
  writeEvidence,
  writeExclusiveEvidence,
} from "./proof-io";

export const mindsProcessAUrl = new URL("minds-process-a-v2.json", evidenceDirectory);
export const mindsProcessBUrl = new URL("minds-process-b-v2.json", evidenceDirectory);
export const mindsHandoffUrl = new URL("minds-handoff-v2.json", evidenceDirectory);
export const mindsSeedAuthorizationUrl = new URL("minds-seed-authorization-v2.json", evidenceDirectory);
export const mindsSeedDispatchUrl = new URL("minds-seed-dispatch-v2.json", evidenceDirectory);
export const mindsSeedGoUrl = new URL("minds-seed-go-v3.json", evidenceDirectory);
export const mindsSeedSigningKeyUrl = new URL("minds-seed-signing-key-v1.json", evidenceDirectory);
export const mindsSeedRawReviewUrls = Object.freeze([1, 2, 3].map((index) => new URL(`minds-seed-review-${index}.raw.json`, evidenceDirectory)));
export const mindsFinalReviewBundleUrl = new URL("minds-final-review-bundle-v2.json", evidenceDirectory);
export const mindsFinalDispatchUrl = new URL("minds-final-dispatch-v2.json", evidenceDirectory);
export const mindsFinalRawReviewUrls = Object.freeze([1, 2, 3].map((index) => new URL(`minds-final-review-${index}.raw.json`, evidenceDirectory)));
export const mindsResultUrl = new URL("minds-result-v2.json", evidenceDirectory);
export const mindsProcessAAttemptUrl = new URL("minds-process-a-attempt-v2.json", evidenceDirectory);
export const mindsProcessBAttemptUrl = new URL("minds-process-b-attempt-v2.json", evidenceDirectory);
export const mindsProcessAPromptUrl = new URL("minds-process-a-prompt-v2.txt", evidenceDirectory);
export const mindsProcessBPromptUrl = new URL("minds-process-b-prompt-v2.txt", evidenceDirectory);
/** @deprecated Legacy scripts only. New flow uses distinct A/B/handoff artifacts. */
export const mindsStateUrl = new URL("minds-state.json", evidenceDirectory);
export const emailEvidenceUrl = new URL("email-evidence.json", evidenceDirectory);
export const manifestUrl = new URL("evidence-manifest.json", evidenceDirectory);
