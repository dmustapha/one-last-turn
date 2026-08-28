import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { digestHistory, type ProofHistoryRow } from "@/proof/history-provenance";

export type HistoryBoundary = Readonly<{
  digest: string;
  rowCount: number;
  messageIds: readonly string[];
  contentDigests: readonly string[];
}>;

type MessageEvidence = Readonly<{
  messageId: string;
  rawText: string;
  contentDigest: string;
  sentAt?: string;
  receivedAt?: string;
}>;

type CognitionEvidence = Readonly<{
  before: number;
  beforeObservedAt: string;
  after: number;
  afterObservedAt: string;
}>;

export type ProcessEnvelope = Readonly<{
  schemaVersion: "minds-process-a-v2" | "minds-process-b-v2";
  phase: "A" | "B";
  seedGoDigest?: string;
  runId: string;
  processNonce: string;
  pid: number;
  sdkVersion: string;
  alias: string;
  aliasDigest: string;
  mindDigest: string;
  startedAt: string;
  completedAt: string;
  initialBoundary: HistoryBoundary;
  terminalBoundary: HistoryBoundary;
  initialRows: readonly ProofHistoryRow[];
  terminalRows: readonly ProofHistoryRow[];
  outbound: MessageEvidence & Readonly<{ sentAt: string }>;
  reply: MessageEvidence & Readonly<{ receivedAt: string }>;
  cognition: CognitionEvidence;
}>;

export type PublicHandoff = Readonly<{
  schemaVersion: "minds-public-handoff-v2";
  runId: string;
  alias: string;
  mindDigest: string;
  boundary: Readonly<{
    rowCount: number;
    digest: string;
    latestFingerprint: string;
  }>;
}>;

const digestPattern = /^[a-f0-9]{64}$/;
const envelopeKeys = [
  "schemaVersion", "phase", "runId", "processNonce", "pid", "sdkVersion",
  "alias", "aliasDigest", "mindDigest", "startedAt", "completedAt", "initialBoundary",
  "terminalBoundary", "initialRows", "terminalRows", "outbound", "reply", "cognition",
] as const;
const processBEnvelopeKeys = [...envelopeKeys, "seedGoDigest"] as const;
const boundaryKeys = ["digest", "rowCount", "messageIds", "contentDigests"] as const;
const rowKeys = ["messageId", "senderType", "createdAt", "messageText", "fingerprint"] as const;
const outboundKeys = ["messageId", "rawText", "contentDigest", "sentAt"] as const;
const replyKeys = ["messageId", "rawText", "contentDigest", "receivedAt"] as const;
const cognitionKeys = ["before", "beforeObservedAt", "after", "afterObservedAt"] as const;
const handoffKeys = ["schemaVersion", "runId", "alias", "mindDigest", "boundary"] as const;
const handoffBoundaryKeys = ["rowCount", "digest", "latestFingerprint"] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value)) return false;
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readExactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error("Evidence must be an exact plain record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(descriptors);
  const missing = keys.find((key) => !Object.hasOwn(descriptors, key));
  if (missing) throw new Error(`Evidence is missing required field ${missing}`);
  if (actualKeys.length !== keys.length || !actualKeys.every((key) => typeof key === "string" && keys.includes(key))) {
    throw new Error("Evidence contains an unexpected field");
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) throw new Error(`${key} must be inert own data`);
    result[key] = descriptor.value;
  }
  return result;
}

function readDenseArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${label} must be a plain array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw new Error(`${label} must be dense`);
  return Object.freeze(Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new Error(`${label} must contain inert data`);
    return descriptor.value;
  }));
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  return value;
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !digestPattern.test(value)) throw new Error(`${label} must be a SHA-256 digest`);
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(`${label} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  const values = readDenseArray(value, label);
  if (!values.every((item) => typeof item === "string" && item.trim() !== "")) {
    throw new Error(`${label} must contain non-empty strings`);
  }
  return Object.freeze(values as string[]);
}

function validateBoundary(value: unknown, label: string): HistoryBoundary {
  const record = readExactRecord(value, boundaryKeys);
  const messageIds = requireStringArray(record.messageIds, `${label}.messageIds`);
  const contentDigests = requireStringArray(record.contentDigests, `${label}.contentDigests`);
  const rowCount = record.rowCount;
  if (!Number.isSafeInteger(rowCount) || (rowCount as number) < 0) throw new Error(`${label}.rowCount is invalid`);
  if (messageIds.length !== rowCount || contentDigests.length !== rowCount) throw new Error(`${label} row arrays do not match rowCount`);
  if (new Set(messageIds).size !== messageIds.length) throw new Error(`${label}.messageIds must be unique`);
  contentDigests.forEach((item) => requireDigest(item, `${label}.contentDigests`));
  return Object.freeze({ digest: requireDigest(record.digest, `${label}.digest`), rowCount: rowCount as number, messageIds, contentDigests });
}

function validateHistoryRows(value: unknown, label: string): readonly ProofHistoryRow[] {
  const values = readDenseArray(value, label);
  const rows = values.map((item, index) => validateHistoryRow(item, `${label}[${index}]`));
  return Object.freeze(rows);
}

function validateHistoryRow(value: unknown, label: string): ProofHistoryRow {
  const record = readExactRecord(value, rowKeys);
  const senderType = record.senderType;
  if (!Number.isInteger(senderType) || ![0, 1, 2].includes(senderType as number)) {
    throw new Error(`${label}.senderType is invalid`);
  }
  return Object.freeze({
    messageId: requireString(record.messageId, `${label}.messageId`),
    senderType: senderType as number,
    createdAt: requireTimestamp(record.createdAt, `${label}.createdAt`),
    messageText: typeof record.messageText === "string" ? record.messageText : requireString(record.messageText, `${label}.messageText`),
    fingerprint: requireString(record.fingerprint, `${label}.fingerprint`),
  });
}

function validateMessage(value: unknown, kind: "outbound" | "reply"): MessageEvidence {
  const timeKey = kind === "outbound" ? "sentAt" : "receivedAt";
  const record = readExactRecord(value, kind === "outbound" ? outboundKeys : replyKeys);
  return Object.freeze({
    messageId: requireString(record.messageId, `${kind}.messageId`),
    rawText: requireString(record.rawText, `${kind}.rawText must be non-empty`),
    contentDigest: requireDigest(record.contentDigest, `${kind}.contentDigest`),
    [timeKey]: requireTimestamp(record[timeKey], `${kind}.${timeKey}`),
  });
}

function validateCognition(value: unknown): CognitionEvidence {
  const record = readExactRecord(value, cognitionKeys);
  if (![record.before, record.after].every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0)) {
    throw new Error("cognition values must be finite non-negative numbers");
  }
  return Object.freeze({
    before: record.before as number,
    beforeObservedAt: requireTimestamp(record.beforeObservedAt, "cognition.beforeObservedAt"),
    after: record.after as number,
    afterObservedAt: requireTimestamp(record.afterObservedAt, "cognition.afterObservedAt"),
  });
}

function sameBoundary(left: HistoryBoundary, right: HistoryBoundary): boolean {
  return left.digest === right.digest && left.rowCount === right.rowCount &&
    left.messageIds.every((id, index) => id === right.messageIds[index]) &&
    left.contentDigests.every((digest, index) => digest === right.contentDigests[index]);
}

function assertTerminalExtension(envelope: ProcessEnvelope): void {
  const { initialBoundary: initial, terminalBoundary: terminal } = envelope;
  const offset = terminal.rowCount - initial.rowCount;
  if (offset !== 2 || terminal.messageIds[0] !== envelope.reply.messageId || terminal.messageIds[1] !== envelope.outbound.messageId) {
    throw new Error("Terminal boundary does not bind the reply and outbound message IDs");
  }
  if (terminal.contentDigests[0] !== envelope.reply.contentDigest || terminal.contentDigests[1] !== envelope.outbound.contentDigest) {
    throw new Error("Terminal boundary does not bind the reply and outbound content digests");
  }
  const suffix = { ...initial, messageIds: terminal.messageIds.slice(offset), contentDigests: terminal.contentDigests.slice(offset) };
  if (!sameBoundary(initial, suffix)) throw new Error("Terminal history is not an exact extension of the initial boundary");
  if (JSON.stringify(envelope.terminalRows.slice(offset)) !== JSON.stringify(envelope.initialRows)) {
    throw new Error("Raw terminal history is not an exact extension of raw initial history");
  }
}

function assertRawBindings(envelope: ProcessEnvelope): void {
  if (sha256(envelope.alias) !== envelope.aliasDigest) throw new Error("Raw alias does not match aliasDigest");
  assertRowsMatchBoundary(envelope.initialRows, envelope.initialBoundary, "initial");
  assertRowsMatchBoundary(envelope.terminalRows, envelope.terminalBoundary, "terminal");
  if (sha256(envelope.outbound.rawText) !== envelope.outbound.contentDigest) throw new Error("Raw outbound text does not match its digest");
  if (sha256(envelope.reply.rawText) !== envelope.reply.contentDigest) throw new Error("Raw reply text does not match its digest");
  assertTerminalRows(envelope);
}

function assertRowsMatchBoundary(rows: readonly ProofHistoryRow[], boundary: HistoryBoundary, label: string): void {
  if (rows.length !== boundary.rowCount) {
    throw new Error(`Raw ${label} history rows length does not match boundary rowCount`);
  }
  const ids = rows.map((row) => row.messageId);
  const digests = rows.map((row) => sha256(row.messageText));
  if (digestHistory([...rows]) !== boundary.digest || ids.some((id, index) => id !== boundary.messageIds[index]) || digests.some((digest, index) => digest !== boundary.contentDigests[index])) {
    throw new Error(`Raw ${label} history rows do not match the ${label} boundary`);
  }
}

function assertTerminalRows(envelope: ProcessEnvelope): void {
  const reply = envelope.terminalRows[0];
  const outbound = envelope.terminalRows[1];
  if (!reply || ![0, 2].includes(reply.senderType)) throw new Error("Terminal reply must be a Mind sender row");
  if (!outbound || outbound.senderType !== 1) throw new Error("Terminal outbound must be a human sender row");
  assertMessageRow(reply, envelope.reply, "reply", "receivedAt");
  assertMessageRow(outbound, envelope.outbound, "outbound", "sentAt");
  const outboundAt = Date.parse(outbound.createdAt);
  if (envelope.initialRows.some((row) => Date.parse(row.createdAt) >= outboundAt)) {
    throw new Error("Outbound must be strictly newer than every initial row");
  }
  if (Date.parse(reply.createdAt) <= outboundAt) throw new Error("Reply must be strictly newer than outbound");
}

function assertMessageRow(row: ProofHistoryRow, evidence: MessageEvidence, label: string, timeKey: "sentAt" | "receivedAt"): void {
  if (row.messageId !== evidence.messageId || row.messageText !== evidence.rawText || sha256(row.messageText) !== evidence.contentDigest) {
    throw new Error(`Terminal ${label} row is not exactly bound to ${label} evidence`);
  }
  if (row.createdAt !== evidence[timeKey]) throw new Error(`${label} timestamp does not match terminal row`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateEnvelope(value: unknown, phase: "A" | "B", expectedMindDigest: string): ProcessEnvelope {
  const record = readExactRecord(value, phase === "A" ? envelopeKeys : processBEnvelopeKeys);
  requireDigest(expectedMindDigest, "expectedMindDigest");
  const envelopeMindDigest = requireDigest(record.mindDigest, "mindDigest");
  if (envelopeMindDigest !== expectedMindDigest) throw new Error("Envelope does not match trusted Mind digest");
  const expectedSchema = phase === "A" ? "minds-process-a-v2" : "minds-process-b-v2";
  if (record.schemaVersion !== expectedSchema || record.phase !== phase) throw new Error(`Invalid process-${phase} schema or phase`);
  const envelope = buildEnvelope(record, expectedSchema, phase);
  assertEnvelopeTimeline(envelope);
  assertRawBindings(envelope);
  assertTerminalExtension(envelope);
  return Object.freeze(envelope);
}

function buildEnvelope(record: Record<string, unknown>, schemaVersion: ProcessEnvelope["schemaVersion"], phase: "A" | "B"): ProcessEnvelope {
  if (!Number.isSafeInteger(record.pid) || (record.pid as number) <= 0) throw new Error("pid must be a positive integer");
  return {
    schemaVersion, phase, ...(phase === "B" ? { seedGoDigest: requireDigest(record.seedGoDigest, "seedGoDigest") } : {}),
    runId: requireString(record.runId, "runId"),
    processNonce: requireDigest(record.processNonce, "processNonce"), pid: record.pid as number,
    sdkVersion: requireString(record.sdkVersion, "sdkVersion"), alias: requireString(record.alias, "alias"), aliasDigest: requireDigest(record.aliasDigest, "aliasDigest"),
    mindDigest: requireDigest(record.mindDigest, "mindDigest"), startedAt: requireTimestamp(record.startedAt, "startedAt"),
    completedAt: requireTimestamp(record.completedAt, "completedAt"), initialBoundary: validateBoundary(record.initialBoundary, "initialBoundary"),
    terminalBoundary: validateBoundary(record.terminalBoundary, "terminalBoundary"), initialRows: validateHistoryRows(record.initialRows, "initialRows"),
    terminalRows: validateHistoryRows(record.terminalRows, "terminalRows"), outbound: validateMessage(record.outbound, "outbound") as ProcessEnvelope["outbound"],
    reply: validateMessage(record.reply, "reply") as ProcessEnvelope["reply"], cognition: validateCognition(record.cognition),
  };
}

function assertEnvelopeTimeline(envelope: ProcessEnvelope): void {
  const times = [envelope.startedAt, envelope.outbound.sentAt, envelope.reply.receivedAt, envelope.completedAt].map(Date.parse);
  if (!(times[0]! <= times[1]! && times[1]! < times[2]! && times[2]! <= times[3]!)) {
    throw new Error("Envelope timestamps are not causally ordered");
  }
  const beforeAt = Date.parse(envelope.cognition.beforeObservedAt);
  const afterAt = Date.parse(envelope.cognition.afterObservedAt);
  if (beforeAt < times[0]! || beforeAt >= times[1]!) throw new Error("Cognition before observation must precede outbound");
  if (afterAt <= times[2]! || afterAt > times[3]!) throw new Error("Cognition after observation must follow reply");
}

export function validateProcessAEnvelope(value: unknown, expectedMindDigest: string): ProcessEnvelope {
  return validateEnvelope(value, "A", expectedMindDigest);
}

export function validateProcessBEnvelope(value: unknown, expectedMindDigest: string): ProcessEnvelope {
  return validateEnvelope(value, "B", expectedMindDigest);
}

export function validateEnvelopePair(processA: unknown, processB: unknown, expectedMindDigest: string): Readonly<{ processA: ProcessEnvelope; processB: ProcessEnvelope }> {
  const a = validateProcessAEnvelope(processA, expectedMindDigest);
  const b = validateProcessBEnvelope(processB, expectedMindDigest);
  if (a.runId !== b.runId) throw new Error("Process run ID mismatch");
  if (a.pid === b.pid) throw new Error("Processes must use different PIDs");
  if (a.processNonce === b.processNonce) throw new Error("Processes must use different nonces");
  if (a.alias !== b.alias) throw new Error("Process raw alias mismatch");
  if (a.aliasDigest !== b.aliasDigest) throw new Error("Process alias binding mismatch");
  if (a.mindDigest !== b.mindDigest) throw new Error("Process Mind binding mismatch");
  if (!sameBoundary(a.terminalBoundary, b.initialBoundary)) throw new Error("Process A terminal and process B initial boundary mismatch");
  if (Date.parse(a.completedAt) > Date.parse(b.startedAt)) throw new Error("Process A completedAt must not exceed process B startedAt");
  return Object.freeze({ processA: a, processB: b });
}

export function createPublicHandoff(value: unknown, expectedMindDigest: string): PublicHandoff {
  const processA = validateProcessAEnvelope(value, expectedMindDigest);
  const latestFingerprint = processA.terminalRows[0]?.fingerprint;
  if (!latestFingerprint) throw new Error("Terminal history lacks a latest fingerprint");
  return Object.freeze({
    schemaVersion: "minds-public-handoff-v2",
    runId: processA.runId,
    alias: processA.alias,
    mindDigest: processA.mindDigest,
    boundary: Object.freeze({ rowCount: processA.terminalBoundary.rowCount, digest: processA.terminalBoundary.digest, latestFingerprint }),
  });
}

export function validatePublicHandoff(value: unknown, expectedMindDigest: string): PublicHandoff {
  const record = readExactRecord(value, handoffKeys);
  if (record.schemaVersion !== "minds-public-handoff-v2") throw new Error("Invalid public handoff schemaVersion");
  requireDigest(expectedMindDigest, "expectedMindDigest");
  if (record.mindDigest !== expectedMindDigest) throw new Error("Handoff does not match trusted Mind digest");
  return Object.freeze({ schemaVersion: "minds-public-handoff-v2", runId: requireString(record.runId, "runId"), alias: requireString(record.alias, "alias"), mindDigest: expectedMindDigest, boundary: validateHandoffBoundary(record.boundary) });
}

function validateHandoffBoundary(value: unknown): PublicHandoff["boundary"] {
  const record = readExactRecord(value, handoffBoundaryKeys);
  if (!Number.isSafeInteger(record.rowCount) || (record.rowCount as number) < 0) throw new Error("Handoff boundary rowCount is invalid");
  return Object.freeze({
    rowCount: record.rowCount as number,
    digest: requireDigest(record.digest, "handoff.boundary.digest"),
    latestFingerprint: requireString(record.latestFingerprint, "handoff.boundary.latestFingerprint"),
  });
}
