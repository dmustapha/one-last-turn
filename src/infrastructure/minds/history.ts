// File: src/infrastructure/minds/history.ts
import { createHash } from "node:crypto";
import type { MessageRecord } from "@animocabrands/minds-client-lib";
import { z } from "zod";

export const MINDS_SDK_VERSION = "0.1.4";
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const canonicalTime = z.string().datetime({ offset: false });

export const historyBoundarySchema = z.object({
  schemaVersion: z.literal(1), digest, rowCount: z.number().int().nonnegative(),
  newestFingerprintDigest: digest.nullable(), oldestFingerprintDigest: digest.nullable(),
  capturedAt: canonicalTime,
}).strict();

export const exchangeEvidenceSchema = z.object({
  schemaVersion: z.literal(1), sdkVersion: z.literal(MINDS_SDK_VERSION),
  executionClass: z.enum(["live_sdk", "test_transport"]), logicalSendCount: z.literal(1),
  processInstanceId: z.string().uuid(), processStartedAt: canonicalTime,
  aliasDigest: digest, mindDigest: digest, processNonce: z.string().uuid(),
  startedAt: canonicalTime, completedAt: canonicalTime, latencyMs: z.number().int().nonnegative(),
  before: historyBoundarySchema, after: historyBoundarySchema,
  outbound: z.object({ messageIdDigest: digest, contentDigest: digest, createdAt: canonicalTime }).strict(),
  reply: z.object({ messageIdDigest: digest, contentDigest: digest, createdAt: canonicalTime }).strict(),
  sendResolution: z.enum(["acknowledged", "history_recovered"]),
  evidenceClasses: z.array(z.enum([
    "same_mind", "same_alias", "exact_boundary", "one_new_outbound",
    "one_fresh_reply", "semantic_constraints",
  ])).length(6),
}).strict();

export type HistoryBoundary = z.infer<typeof historyBoundarySchema>;
export type ExchangeEvidence = z.infer<typeof exchangeEvidenceSchema>;
export type HistoryRow = Readonly<{
  messageId: string; messageText: string; createdAt: string;
  fingerprint: string; senderType: 0 | 1 | 2;
}>;
export interface HistoryTransport {
  getHistory(alias: string, options: { limit: number; cursor?: string }): Promise<MessageRecord[]>;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRow(row: MessageRecord, index: number): HistoryRow {
  const messageId = row.messageId;
  if (!messageId || typeof row.messageText !== "string" || !row.createdAt || !row.fingerprint) {
    throw new Error(`MINDS_HISTORY_ROW_INVALID:${index}`);
  }
  if (![0, 1, 2].includes(row.senderType ?? -1)) throw new Error(`MINDS_HISTORY_ROLE_INVALID:${index}`);
  const createdAt = new Date(row.createdAt).toISOString();
  if (createdAt !== row.createdAt) throw new Error(`MINDS_HISTORY_TIME_INVALID:${index}`);
  return { messageId, messageText: row.messageText, createdAt, fingerprint: row.fingerprint, senderType: row.senderType as 0 | 1 | 2 };
}

function assertHistoryShape(rows: readonly HistoryRow[]): void {
  const ids = rows.map((row) => row.messageId);
  const fingerprints = rows.map((row) => row.fingerprint);
  if (new Set(ids).size !== ids.length || new Set(fingerprints).size !== fingerprints.length) {
    throw new Error("MINDS_HISTORY_DUPLICATE_ROW");
  }
  for (let index = 1; index < rows.length; index += 1) {
    if (Date.parse(rows[index - 1]!.createdAt) < Date.parse(rows[index]!.createdAt)) {
      throw new Error("MINDS_HISTORY_NOT_NEWEST_FIRST");
    }
  }
}

export async function readCompleteHistory(input: {
  transport: HistoryTransport; alias: string; pageSize?: number; maxPages?: number;
}): Promise<HistoryRow[]> {
  const pageSize = input.pageSize ?? 200;
  const maxPages = input.maxPages ?? 20;
  const rows: HistoryRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const options = cursor ? { limit: pageSize, cursor } : { limit: pageSize };
    const batch = (await input.transport.getHistory(input.alias, options)).map(normalizeRow);
    rows.push(...batch);
    assertHistoryShape(rows);
    if (batch.length < pageSize) return rows;
    const next = batch.at(-1)?.fingerprint;
    if (!next || next === cursor) throw new Error("MINDS_HISTORY_CURSOR_DID_NOT_ADVANCE");
    cursor = next;
  }
  throw new Error("MINDS_HISTORY_PAGE_LIMIT_EXCEEDED");
}

function canonicalRows(rows: readonly HistoryRow[]): string {
  return JSON.stringify(rows.map((row) => ({
    messageIdDigest: sha256(row.messageId), contentDigest: sha256(row.messageText),
    createdAt: row.createdAt, fingerprintDigest: sha256(row.fingerprint), senderType: row.senderType,
  })));
}

export function createBoundary(rows: readonly HistoryRow[], capturedAt: string): HistoryBoundary {
  assertHistoryShape(rows);
  return historyBoundarySchema.parse({
    schemaVersion: 1, digest: sha256(canonicalRows(rows)), rowCount: rows.length,
    newestFingerprintDigest: rows[0] ? sha256(rows[0].fingerprint) : null,
    oldestFingerprintDigest: rows.at(-1) ? sha256(rows.at(-1)!.fingerprint) : null,
    capturedAt,
  });
}

export function assertSameBoundary(expected: HistoryBoundary, actual: HistoryBoundary): void {
  const fields = ["digest", "rowCount", "newestFingerprintDigest", "oldestFingerprintDigest"] as const;
  if (fields.some((field) => expected[field] !== actual[field])) {
    throw new Error("MINDS_HISTORY_BOUNDARY_MISMATCH");
  }
}

function assertExchangeShape(before: readonly HistoryRow[], after: readonly HistoryRow[]): [HistoryRow, HistoryRow] {
  if (after.length !== before.length + 2) throw new Error("MINDS_EXCHANGE_ROW_COUNT");
  if (canonicalRows(after.slice(2)) !== canonicalRows(before)) throw new Error("MINDS_EXCHANGE_STALE_SUFFIX");
  const reply = after[0];
  const outbound = after[1];
  if (!reply || !outbound || ![0, 2].includes(reply.senderType) || outbound.senderType !== 1) {
    throw new Error("MINDS_EXCHANGE_ROLE_ORDER");
  }
  return [reply, outbound];
}

export function reconcileExchange(input: {
  alias: string; mindId: string; processNonce: string; prompt: string; sentMessageId?: string;
  executionClass: "live_sdk" | "test_transport"; processInstanceId: string; processStartedAt: string;
  before: readonly HistoryRow[]; after: readonly HistoryRow[]; startedAt: string; completedAt: string;
}): Readonly<{ evidence: ExchangeEvidence; replyText: string }> {
  const [reply, outbound] = assertExchangeShape(input.before, input.after);
  if ((input.sentMessageId && outbound.messageId !== input.sentMessageId) || outbound.messageText !== input.prompt) {
    throw new Error("MINDS_OUTBOUND_PROVENANCE_MISMATCH");
  }
  if (Date.parse(reply.createdAt) <= Date.parse(outbound.createdAt)) throw new Error("MINDS_REPLY_NOT_FRESH");
  const completed = Date.parse(input.completedAt);
  const started = Date.parse(input.startedAt);
  const evidence = exchangeEvidenceSchema.parse({
    schemaVersion: 1, sdkVersion: MINDS_SDK_VERSION,
    executionClass: input.executionClass, logicalSendCount: 1,
    processInstanceId: input.processInstanceId, processStartedAt: input.processStartedAt,
    aliasDigest: sha256(input.alias), mindDigest: sha256(input.mindId), processNonce: input.processNonce,
    startedAt: input.startedAt, completedAt: input.completedAt, latencyMs: completed - started,
    before: createBoundary(input.before, input.startedAt), after: createBoundary(input.after, input.completedAt),
    outbound: { messageIdDigest: sha256(outbound.messageId), contentDigest: sha256(outbound.messageText), createdAt: outbound.createdAt },
    reply: { messageIdDigest: sha256(reply.messageId), contentDigest: sha256(reply.messageText), createdAt: reply.createdAt },
    sendResolution: input.sentMessageId ? "acknowledged" : "history_recovered",
    evidenceClasses: ["same_mind", "same_alias", "exact_boundary", "one_new_outbound", "one_fresh_reply", "semantic_constraints"],
  });
  return { evidence, replyText: reply.messageText };
}
