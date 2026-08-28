import { randomUUID } from "node:crypto";
import { createMindsClient } from "@animocabrands/minds-client-lib";

import { validateProcessBEnvelope, validatePublicHandoff, type PublicHandoff } from "@/proof/evidence-envelope";
import { selectFreshMindReply, type ProofHistoryRow } from "@/proof/history-provenance";
import { runAuthorizedProcessBExchange } from "@/proof/minds-proof-flow";
import { parseSeedSigningKey, validateSeedGoReceipt } from "@/proof/minds-resume-flow";
import { claimProofAttempt, executeClaimedSend, markAttemptFailed, transitionAttempt } from "@/proof/proof-attempt";
import { retryProviderRead } from "@/proof/provider-retry";
import {
  assertMinimalBoundary,
  historyBoundary,
  readCompleteProviderHistory,
  recoverFreshReply,
  requireSentMessageId,
} from "./minds-proof-runtime";
import {
  loadProofEnvironment,
  mindsHandoffUrl,
  mindsProcessBUrl,
  mindsProcessBAttemptUrl,
  mindsProcessBPromptUrl,
  mindsSeedGoUrl,
  mindsSeedSigningKeyUrl,
  readEvidence, readEvidenceOnce, readSecureTextOnce,
  requireEnvironment,
  sha256,
  writeEvidence,
} from "./minds-resume-io";

const SDK_VERSION = "0.1.4";
let activeAttemptId: string | undefined;

async function main(): Promise<void> {
  loadProofEnvironment();
  const builderApiKey = requireEnvironment("MINDS_BUILDER_API_KEY");
  const mindId = requireEnvironment("MINDS_MIND_ID");
  const expectedMindDigest = sha256(mindId);
  const prompt = (await readSecureTextOnce(mindsProcessBPromptUrl)).text;
  const handoff = validatePublicHandoff(await readEvidence(mindsHandoffUrl), expectedMindDigest);
  const handoffDigest = sha256(JSON.stringify(handoff));
  const [goOnce, keyValue] = await Promise.all([readEvidenceOnce(mindsSeedGoUrl), readEvidence(mindsSeedSigningKeyUrl)]);
  const signingKey = parseSeedSigningKey(keyValue);
  const attemptId = randomUUID();
  await claimProofAttempt(mindsProcessBAttemptUrl, "B", attemptId, new Date().toISOString());
  activeAttemptId = attemptId;
  const client = createMindsClient({ builderApiKey });
  let initialRows: ProofHistoryRow[] = [];
  let terminalRows: ProofHistoryRow[] = [];
  let cognitionBefore = 0;
  let beforeObservedAt = "";
  let sentMessageId = "";
  const startedAt = new Date().toISOString();
  await runAuthorizedProcessBExchange({
    authorizeSeed: async () => { validateSeedGoReceipt(goOnce.parsed, handoffDigest, signingKey); },
    verifyBoundary: async () => {
      await verifyAliasMind(client, handoff, mindId);
      const balance = await boundedRead(() => client.getCognitionBalance(mindId));
      cognitionBefore = balance.cognition;
      beforeObservedAt = new Date().toISOString();
      initialRows = await readCompleteProviderHistory(client, handoff.alias);
      assertMinimalBoundary(initialRows, handoff.boundary);
    },
    prompt,
    send: async (prompt) => {
      const sent = await executeClaimedSend({ url: mindsProcessBAttemptUrl, phase: "B", attemptId,
        now: () => new Date().toISOString(), send: () => client.sendMessage({ alias: handoff.alias, messageText: prompt }) });
      sentMessageId = requireSentMessageId(sent);
      return sent;
    },
    waitForReply: () => client.waitForReply({
      alias: handoff.alias, timeoutMs: 120_000, sentMessageText: prompt,
      afterFingerprint: handoff.boundary.latestFingerprint,
    }),
    recoverReply: () => recoverFreshReply({
      client, alias: handoff.alias, beforeRows: initialRows,
      sentMessageId, sentTextDigest: sha256(prompt),
      onReconciledRows: (rows) => { terminalRows = rows; },
    }),
  });
  if (terminalRows.length === 0) throw new Error("Authoritative terminal history was not reconciled");
  const reply = selectFreshMindReply({ beforeRows: initialRows, afterRows: terminalRows, sentMessageId, sentTextDigest: sha256(prompt) });
  const cognitionAfter = await boundedRead(() => client.getCognitionBalance(mindId));
  const envelope = buildEnvelope({
    handoff, mindId, startedAt, beforeObservedAt, afterObservedAt: new Date().toISOString(),
    initialRows, terminalRows, sentMessageId, reply,
    cognitionBefore, cognitionAfter: cognitionAfter.cognition, seedGoDigest: goOnce.digest,
  });
  await writeEvidence(mindsProcessBUrl, validateProcessBEnvelope(envelope, expectedMindDigest));
  await transitionAttempt(mindsProcessBAttemptUrl, "B", attemptId, "RECORDED", new Date().toISOString());
  console.log("MINDS_PROCESS_B=recorded");
}

async function verifyAliasMind(client: ReturnType<typeof createMindsClient>, handoff: PublicHandoff, expectedMindId: string): Promise<void> {
  const actual = await boundedRead(() => client.getMindIdForAlias(handoff.alias));
  if (actual !== expectedMindId) throw new Error("Live alias is not bound to the authorized Mind");
}

function buildEnvelope(input: {
  handoff: PublicHandoff; mindId: string; startedAt: string;
  beforeObservedAt: string; afterObservedAt: string; initialRows: ProofHistoryRow[];
  terminalRows: ProofHistoryRow[]; sentMessageId: string; reply: ProofHistoryRow;
  cognitionBefore: number; cognitionAfter: number; seedGoDigest: string;
}) {
  const outbound = input.terminalRows[1];
  if (!outbound || outbound.messageId !== input.sentMessageId) throw new Error("Outbound history row missing");
  return {
    schemaVersion: "minds-process-b-v2", phase: "B", runId: input.handoff.runId,
    processNonce: sha256(randomUUID()), pid: process.pid, sdkVersion: SDK_VERSION,
    alias: input.handoff.alias, aliasDigest: sha256(input.handoff.alias), mindDigest: sha256(input.mindId),
    startedAt: input.startedAt, completedAt: new Date().toISOString(),
    initialBoundary: historyBoundary(input.initialRows), terminalBoundary: historyBoundary(input.terminalRows),
    initialRows: input.initialRows, terminalRows: input.terminalRows,
    outbound: { messageId: outbound.messageId, rawText: outbound.messageText, contentDigest: sha256(outbound.messageText), sentAt: outbound.createdAt },
    reply: { messageId: input.reply.messageId, rawText: input.reply.messageText, contentDigest: sha256(input.reply.messageText), receivedAt: input.reply.createdAt },
    cognition: { before: input.cognitionBefore, beforeObservedAt: input.beforeObservedAt, after: input.cognitionAfter, afterObservedAt: input.afterObservedAt },
    seedGoDigest: input.seedGoDigest,
  };
}

function boundedRead<T>(operation: () => Promise<T>): Promise<T> {
  return retryProviderRead(operation, { attempts: 4, baseDelayMs: 1_000 });
}

await main().catch(async () => {
  if (activeAttemptId) await markAttemptFailed(mindsProcessBAttemptUrl, "B", activeAttemptId, new Date().toISOString());
  console.error("MINDS_PROCESS_B=failed"); process.exitCode = 1;
});
