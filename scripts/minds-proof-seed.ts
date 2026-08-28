import { randomUUID } from "node:crypto";
import { createMindsClient } from "@animocabrands/minds-client-lib";

import { createPublicHandoff, validateProcessAEnvelope } from "@/proof/evidence-envelope";
import { selectFreshMindReply } from "@/proof/history-provenance";
import { executeSingleSend } from "@/proof/minds-proof-flow";
import { retryProviderRead } from "@/proof/provider-retry";
import { claimProofAttempt, executeClaimedSend, markAttemptFailed, transitionAttempt } from "@/proof/proof-attempt";
import {
  historyBoundary,
  readCompleteProviderHistory,
  recoverFreshReply,
  requireSentMessageId,
} from "./minds-proof-runtime";
import {
  loadProofEnvironment,
  mindsHandoffUrl,
  mindsProcessAUrl,
  mindsProcessAAttemptUrl,
  mindsProcessAPromptUrl,
  requireEnvironment,
  sha256,
  writeEvidence,
  readSecureTextOnce,
} from "./minds-seed-io";

const SDK_VERSION = "0.1.4";
let activeAttemptId: string | undefined;

async function main(): Promise<void> {
  loadProofEnvironment();
  const builderApiKey = requireEnvironment("MINDS_BUILDER_API_KEY");
  const mindId = requireEnvironment("MINDS_MIND_ID");
  const prompt = (await readSecureTextOnce(mindsProcessAPromptUrl)).text;
  const client = createMindsClient({ builderApiKey });
  const runId = `run-${randomUUID()}`;
  const attemptId = randomUUID();
  await claimProofAttempt(mindsProcessAAttemptUrl, "A", attemptId, new Date().toISOString());
  activeAttemptId = attemptId;
  const alias = `olt-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  await client.ensureConversation(alias, mindId);
  const cognitionBefore = await boundedRead(() => client.getCognitionBalance(mindId));
  const beforeObservedAt = new Date().toISOString();
  const initialRows = await readCompleteProviderHistory(client, alias);
  let terminalRows: import("@/proof/history-provenance").ProofHistoryRow[] = [];
  let sentMessageId = "";
  const exchange = await executeSingleSend({
    prompt,
    send: async (prompt) => {
      const sent = await executeClaimedSend({ url: mindsProcessAAttemptUrl, phase: "A", attemptId,
        now: () => new Date().toISOString(), send: () => client.sendMessage({ alias, messageText: prompt }) });
      sentMessageId = requireSentMessageId(sent);
      return sent;
    },
    waitForReply: () => client.waitForReply({
      alias,
      timeoutMs: 120_000,
      sentMessageText: prompt,
      ...(initialRows[0]?.fingerprint ? { afterFingerprint: initialRows[0].fingerprint } : {}),
    }),
    recoverReply: () => recoverFreshReply({
      client, alias, beforeRows: initialRows, sentMessageId,
      sentTextDigest: sha256(prompt),
      onReconciledRows: (rows) => { terminalRows = rows; },
    }),
  });
  if (terminalRows.length === 0) throw new Error("Authoritative terminal history was not reconciled");
  const reply = selectFreshMindReply({ beforeRows: initialRows, afterRows: terminalRows, sentMessageId, sentTextDigest: sha256(prompt) });
  const cognitionAfter = await boundedRead(() => client.getCognitionBalance(mindId));
  const afterObservedAt = new Date().toISOString();
  const envelope = buildEnvelope({
    runId, alias, mindId, startedAt, beforeObservedAt, afterObservedAt,
    initialRows, terminalRows, sentMessageId, reply,
    cognitionBefore: cognitionBefore.cognition, cognitionAfter: cognitionAfter.cognition,
  });
  const validated = validateProcessAEnvelope(envelope, sha256(mindId));
  await writeEvidence(mindsProcessAUrl, validated);
  await writeEvidence(mindsHandoffUrl, createPublicHandoff(validated, sha256(mindId)));
  await transitionAttempt(mindsProcessAAttemptUrl, "A", attemptId, "RECORDED", new Date().toISOString());
  void exchange;
  console.log("MINDS_PROCESS_A=recorded");
}

function buildEnvelope(input: {
  runId: string; alias: string; mindId: string; startedAt: string;
  beforeObservedAt: string; afterObservedAt: string;
  initialRows: import("@/proof/history-provenance").ProofHistoryRow[];
  terminalRows: import("@/proof/history-provenance").ProofHistoryRow[];
  sentMessageId: string; reply: import("@/proof/history-provenance").ProofHistoryRow;
  cognitionBefore: number; cognitionAfter: number;
}) {
  const outbound = input.terminalRows[1];
  if (!outbound || outbound.messageId !== input.sentMessageId) throw new Error("Outbound history row missing");
  return {
    schemaVersion: "minds-process-a-v2", phase: "A", runId: input.runId,
    processNonce: sha256(randomUUID()), pid: process.pid, sdkVersion: SDK_VERSION,
    alias: input.alias, aliasDigest: sha256(input.alias), mindDigest: sha256(input.mindId),
    startedAt: input.startedAt, completedAt: new Date().toISOString(),
    initialBoundary: historyBoundary(input.initialRows), terminalBoundary: historyBoundary(input.terminalRows),
    initialRows: input.initialRows, terminalRows: input.terminalRows,
    outbound: { messageId: outbound.messageId, rawText: outbound.messageText, contentDigest: sha256(outbound.messageText), sentAt: outbound.createdAt },
    reply: { messageId: input.reply.messageId, rawText: input.reply.messageText, contentDigest: sha256(input.reply.messageText), receivedAt: input.reply.createdAt },
    cognition: { before: input.cognitionBefore, beforeObservedAt: input.beforeObservedAt, after: input.cognitionAfter, afterObservedAt: input.afterObservedAt },
  };
}

function boundedRead<T>(operation: () => Promise<T>): Promise<T> {
  return retryProviderRead(operation, { attempts: 4, baseDelayMs: 1_000 });
}

await main().catch(async () => {
  if (activeAttemptId) await markAttemptFailed(mindsProcessAAttemptUrl, "A", activeAttemptId, new Date().toISOString());
  console.error("MINDS_PROCESS_A=failed"); process.exitCode = 1;
});
