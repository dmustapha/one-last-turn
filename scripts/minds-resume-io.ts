import { evidenceDirectory } from "./proof-io";

export {
  loadProofEnvironment,
  readEvidence,
  readEvidenceOnce,
  readSecureTextOnce,
  requireEnvironment,
  sha256,
  writeEvidence,
} from "./proof-io";

export const mindsHandoffUrl = new URL("minds-handoff-v2.json", evidenceDirectory);
export const mindsSeedGoUrl = new URL("minds-seed-go-v3.json", evidenceDirectory);
export const mindsSeedSigningKeyUrl = new URL("minds-seed-signing-key-v1.json", evidenceDirectory);
export const mindsProcessBUrl = new URL("minds-process-b-v2.json", evidenceDirectory);
export const mindsProcessBAttemptUrl = new URL("minds-process-b-attempt-v2.json", evidenceDirectory);
export const mindsProcessBPromptUrl = new URL("minds-process-b-prompt-v2.txt", evidenceDirectory);
