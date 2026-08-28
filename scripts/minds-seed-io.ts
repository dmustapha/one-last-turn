import { evidenceDirectory } from "./proof-io";

export {
  loadProofEnvironment,
  readSecureTextOnce,
  requireEnvironment,
  sha256,
  writeEvidence,
} from "./proof-io";

export const mindsProcessAUrl = new URL("minds-process-a-v2.json", evidenceDirectory);
export const mindsHandoffUrl = new URL("minds-handoff-v2.json", evidenceDirectory);
export const mindsProcessAAttemptUrl = new URL("minds-process-a-attempt-v2.json", evidenceDirectory);
export const mindsProcessAPromptUrl = new URL("minds-process-a-prompt-v2.txt", evidenceDirectory);
