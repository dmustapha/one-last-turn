// File: src/infrastructure/minds/minds-worker.ts
import { randomUUID } from "node:crypto";
import { createMindsClient } from "@animocabrands/minds-client-lib";

import {
  assertSameBoundary,
  createBoundary,
  readCompleteHistory,
  reconcileExchange,
  sha256,
  type ExchangeEvidence,
  type HistoryBoundary,
  type HistoryRow,
  type HistoryTransport,
} from "./history";

export interface MindSendJournal {
  openSendGate(beforeBoundaryDigest: string, at: string): Promise<void>;
  acknowledgeSend(providerMessageIdDigest: string, at: string): Promise<void>;
  noteAmbiguity(safeCode: string, at: string): Promise<void>;
  recordExchange(evidence: ExchangeEvidence): Promise<void>;
}

export interface MindTransport extends HistoryTransport {
  ensureConversation(alias: string, mindId: string): Promise<ConversationProjection>;
  getConversation(alias: string): Promise<ConversationProjection>;
  getCognitionBalance(mindId: string): Promise<number>;
  sendMessage(input: { alias: string; messageText: string }): Promise<unknown>;
  waitForReply(input: {
    alias: string; sentMessageText: string; afterFingerprint?: string; timeoutMs: number;
  }): Promise<{ timedOut: boolean }>;
}

export type MindWorkResult<T> = Readonly<{
  artifact: T; evidence: ExchangeEvidence;
}>;

const liveTransports = new WeakSet<object>();
const processInstance = Object.freeze({ id: randomUUID(), startedAt: new Date().toISOString() });

export function currentProcessInstanceId(): string { return processInstance.id; }

export function createLiveMindTransport(builderApiKey: string): MindTransport {
  const client = createMindsClient({ builderApiKey });
  const transport: MindTransport = {
    ensureConversation: (alias, mindId) => client.ensureConversation(alias, mindId),
    getConversation: (alias) => client.getConversation(alias),
    getCognitionBalance: async (mindId) => (await client.getCognitionBalance(mindId)).cognition,
    getHistory: (alias, options) => client.getHistory(alias, options),
    sendMessage: (input) => client.sendMessage(input),
    waitForReply: (input) => client.waitForReply(input),
  };
  liveTransports.add(transport);
  return transport;
}

function sentMessageId(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("MINDS_SEND_RESULT_INVALID");
  const record = value as Record<string, unknown>;
  const id = record.messageId ?? record.id ?? record.message_id;
  if (typeof id !== "string" || !id.trim()) throw new Error("MINDS_SEND_ID_MISSING");
  return id;
}

async function waitForTerminalRows(input: {
  transport: MindTransport; alias: string; beforeCount: number; delayMs: number;
}): Promise<HistoryRow[]> {
  const attempts = 30;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await readCompleteHistory({ transport: input.transport, alias: input.alias });
    if (rows.length >= input.beforeCount + 2) return rows;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, input.delayMs));
  }
  throw new Error("MINDS_REPLY_NOT_IN_HISTORY");
}

async function assertPreflight(input: {
  transport: MindTransport; alias: string; mindId: string; expectedBoundary?: HistoryBoundary;
}): Promise<HistoryRow[]> {
  if (await input.transport.getCognitionBalance(input.mindId) <= 0) throw new Error("MINDS_COGNITION_EMPTY");
  const conversation = await input.transport.ensureConversation(input.alias, input.mindId);
  await assertAliasMindBinding(input, conversation);
  const rows = await readCompleteHistory({ transport: input.transport, alias: input.alias });
  if (input.expectedBoundary) {
    assertSameBoundary(input.expectedBoundary, createBoundary(rows, new Date().toISOString()));
  }
  return rows;
}

async function assertAliasMindBinding(
  input: { transport: MindTransport; alias: string; mindId: string },
  conversation: ConversationProjection,
): Promise<void> {
  assertProjectedAlias(conversation.alias, input.alias);
  const directMindId = projectedMindId(conversation.mindId);
  if (directMindId) assertExpectedMind(directMindId, input.mindId);
  await assertAuthoritativeRoster(input);
}

async function assertAuthoritativeRoster(input: {
  transport: MindTransport; alias: string; mindId: string;
}): Promise<void> {
  let authoritative: ConversationProjection;
  try { authoritative = await input.transport.getConversation(input.alias); }
  catch { throw new Error("MINDS_ALIAS_MIND_UNVERIFIED"); }
  assertProjectedAlias(authoritative.alias, input.alias);
  const lookupMindId = projectedMindId(authoritative.mindId);
  if (lookupMindId) assertExpectedMind(lookupMindId, input.mindId);
  assertExpectedMind(strictMindParticipantId(authoritative.participants), input.mindId);
}

type ConversationProjection = { alias?: unknown; mindId?: unknown; participants?: unknown };

function assertProjectedAlias(value: unknown, expected: string): void {
  if (value != null && value !== expected) throw new Error("MINDS_ALIAS_MIND_MISMATCH");
}

function projectedMindId(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("MINDS_ALIAS_MIND_UNVERIFIED");
  return value;
}

function strictMindParticipantId(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 2) throw new Error("MINDS_ALIAS_MIND_UNVERIFIED");
  const participants = value.map(readParticipant);
  if (new Set(participants.map((item) => item.partyId)).size !== participants.length) {
    throw new Error("MINDS_ALIAS_MIND_UNVERIFIED");
  }
  const minds = participants.filter((item) => item.partyType === 0);
  const humans = participants.filter((item) => item.partyType === 1);
  if (minds.length !== 1 || humans.length !== 1) throw new Error("MINDS_ALIAS_MIND_UNVERIFIED");
  return minds[0]!.partyId;
}

function readParticipant(value: unknown): { partyId: string; partyType: 0 | 1 } {
  if (!value || typeof value !== "object") throw new Error("MINDS_ALIAS_MIND_UNVERIFIED");
  const record = value as Record<string, unknown>;
  if (typeof record.partyId !== "string" || !record.partyId) {
    throw new Error("MINDS_ALIAS_MIND_UNVERIFIED");
  }
  if (record.partyType !== 0 && record.partyType !== 1) throw new Error("MINDS_ALIAS_MIND_UNVERIFIED");
  return { partyId: record.partyId, partyType: record.partyType };
}

function assertExpectedMind(actual: string, expected: string): void {
  if (actual !== expected) throw new Error("MINDS_ALIAS_MIND_MISMATCH");
}

export async function executeMindWork<T>(input: {
  transport: MindTransport; alias: string; mindId: string; processNonce: string;
  prompt: string; expectedBoundary?: HistoryBoundary; parse: (text: string) => T;
  validate?: (artifact: T) => void; journal?: MindSendJournal;
  now?: () => string; recoveryDelayMs?: number;
}): Promise<MindWorkResult<T>> {
  const now = input.now ?? (() => new Date().toISOString());
  if (liveTransports.has(input.transport) && !input.journal) throw new Error("MINDS_SEND_JOURNAL_REQUIRED");
  const before = await assertPreflight(input);
  const startedAt = now();
  await assertAuthoritativeRoster(input);
  await input.journal?.openSendGate(createBoundary(before, startedAt).digest, startedAt);
  let id: string | undefined;
  let ambiguousSend = false;
  try {
    id = sentMessageId(await input.transport.sendMessage({ alias: input.alias, messageText: input.prompt }));
  } catch {
    ambiguousSend = true;
    try { await input.journal?.noteAmbiguity("MINDS_SEND_AMBIGUOUS", now()); }
    catch { /* preserve the provider-boundary safe code */ }
  }
  if (id) {
    try { await input.journal?.acknowledgeSend(sha256(id), now()); }
    catch {
      try { await input.journal?.noteAmbiguity("MINDS_ACK_PERSISTENCE_FAILED", now()); }
      catch { /* preserve the acknowledgement safe code */ }
      throw new Error("MINDS_ACK_PERSISTENCE_FAILED");
    }
  }
  try {
    // History is newest-first, so before[0] is the most recent row. Anchoring here makes
    // waitForReply wait for a reply strictly newer than the last known message (correct for
    // resumed Process B). The widened waitForTerminalRows poll below covers slow replies.
    const anchor = before[0];
    await input.transport.waitForReply({
      alias: input.alias, sentMessageText: input.prompt,
      ...(anchor ? { afterFingerprint: anchor.fingerprint } : {}), timeoutMs: 180_000,
    });
  } catch { /* the send already succeeded; recover with bounded read-only history only */ }
  let after: HistoryRow[];
  try { after = await waitForTerminalRows({ transport: input.transport, alias: input.alias,
    beforeCount: before.length, delayMs: input.recoveryDelayMs ?? 5_000 }); }
  catch (error) {
    if (ambiguousSend) throw new Error("MINDS_SEND_AMBIGUOUS");
    throw error;
  }
  const exchange = reconcileExchange({
    alias: input.alias, mindId: input.mindId, processNonce: input.processNonce,
    executionClass: liveTransports.has(input.transport) ? "live_sdk" : "test_transport",
    processInstanceId: processInstance.id, processStartedAt: processInstance.startedAt,
    prompt: input.prompt, ...(id ? { sentMessageId: id } : {}), before, after,
    startedAt, completedAt: now(),
  });
  await assertAuthoritativeRoster(input);
  await input.journal?.recordExchange(exchange.evidence);
  let artifact: T;
  try {
    artifact = input.parse(exchange.replyText);
  } catch (error) {
    // Redacted diagnostic only: structural shape plus a digest, never raw provider text.
    const text = exchange.replyText ?? "";
    const fence = String.fromCharCode(96).repeat(3);
    console.error("[minds-worker] artifact parse failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
      replyLength: text.length,
      hasOpenBrace: text.includes("{"),
      hasCodeFence: text.includes(fence),
      replyDigest: sha256(text).slice(0, 12),
    });
    throw error;
  }
  input.validate?.(artifact);
  return { artifact, evidence: exchange.evidence };
}
