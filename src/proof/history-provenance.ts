import { createHash } from "node:crypto";

export type ProofHistoryRow = {
  messageId: string;
  senderType: number;
  createdAt: string;
  messageText: string;
  fingerprint: string;
};

type ReplySelectionInput = {
  beforeRows: ProofHistoryRow[];
  afterRows: ProofHistoryRow[];
  sentMessageId: string;
  sentTextDigest: string;
};

const SHA256_DIGEST = /^[0-9a-f]{64}$/;

function isCanonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && value === new Date(timestamp).toISOString();
}

function validateRow(row: ProofHistoryRow): void {
  if (!row.messageId?.trim()) throw new Error("History row message ID is missing");
  if (!row.createdAt?.trim() || !isCanonicalTimestamp(row.createdAt)) {
    throw new Error("History row must use a canonical UTC ISO timestamp");
  }
  if (![0, 1, 2].includes(row.senderType)) {
    throw new Error("History row sender type must be 0, 1, or 2");
  }
  if (typeof row.messageText !== "string") {
    throw new Error("History row message text is missing");
  }
  if (!row.fingerprint?.trim()) throw new Error("History row fingerprint is missing");
}

function assertUniqueMessageIds(rows: ProofHistoryRow[]): void {
  const ids = rows.map((row) => row.messageId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("History contains a duplicate message ID");
  }
}

function canonicalize(rows: ProofHistoryRow[]): string {
  rows.forEach(validateRow);
  assertUniqueMessageIds(rows);
  return JSON.stringify(
    rows.map(({ messageId, senderType, createdAt, messageText, fingerprint }) => ({
      messageId,
      senderType,
      createdAt,
      messageText,
      fingerprint,
    })),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function digestHistory(rows: ProofHistoryRow[]): string {
  return sha256(canonicalize(rows));
}

function assertDigest(value: string, label: string): void {
  if (!SHA256_DIGEST.test(value)) {
    throw new Error(`${label} must be exactly 64 lowercase hexadecimal characters`);
  }
}

export function assertMatchingBoundary(expected: string, actual: string): void {
  assertDigest(expected, "Expected boundary digest");
  assertDigest(actual, "Actual boundary digest");
  if (expected !== actual) {
    throw new Error("Process A terminal and process B initial boundary mismatch");
  }
}

function findSentRow(input: ReplySelectionInput): [ProofHistoryRow, number] {
  const matches = input.afterRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.messageId === input.sentMessageId);
  if (matches.length !== 1) throw new Error("Sent human row provenance is ambiguous");
  const match = matches[0];
  if (!match) throw new Error("Sent human row provenance is missing");
  return [match.row, match.index];
}

function assertSentRow(input: ReplySelectionInput, sent: ProofHistoryRow): void {
  if (input.beforeRows.some((row) => row.messageId === sent.messageId)) {
    throw new Error("Sent human row already exists before process B");
  }
  if (sent.senderType !== 1 || sha256(sent.messageText) !== input.sentTextDigest) {
    throw new Error("Sent human row does not match the outbound message");
  }
}

function assertBoundarySuffix(input: ReplySelectionInput, sentIndex: number): void {
  const suffix = input.afterRows.slice(sentIndex + 1);
  if (canonicalize(suffix) !== canonicalize(input.beforeRows)) {
    throw new Error("Process A history is not the exact process B boundary suffix");
  }
}

function assertSentAfterBoundary(sent: ProofHistoryRow, beforeRows: ProofHistoryRow[]): void {
  const sentAt = Date.parse(sent.createdAt);
  if (beforeRows.some((row) => Date.parse(row.createdAt) >= sentAt)) {
    throw new Error("Process B sent row must be newer than process A history");
  }
}

export function selectFreshMindReply(input: ReplySelectionInput): ProofHistoryRow {
  digestHistory(input.beforeRows);
  digestHistory(input.afterRows);
  assertDigest(input.sentTextDigest, "Sent text digest");
  const [sent, sentIndex] = findSentRow(input);
  assertSentRow(input, sent);
  assertBoundarySuffix(input, sentIndex);
  assertSentAfterBoundary(sent, input.beforeRows);
  const prefix = input.afterRows.slice(0, sentIndex);
  if (prefix.length === 0) throw new Error("No fresh Mind reply follows the B send");
  if (prefix.length !== 1) {
    throw new Error("Fresh reply provenance is ambiguous; expected exactly one Mind reply");
  }
  const reply = prefix[0] as ProofHistoryRow;
  if (reply.senderType !== 0 && reply.senderType !== 2) {
    throw new Error("Fresh row is not a Mind reply");
  }
  if (Date.parse(reply.createdAt) <= Date.parse(sent.createdAt)) {
    throw new Error("Mind reply must be strictly newer than the B send");
  }
  return reply;
}
