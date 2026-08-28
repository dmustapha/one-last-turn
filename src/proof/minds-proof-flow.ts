import type { ProofHistoryRow } from "@/proof/history-provenance";
import { types as utilTypes } from "node:util";

type SendOutcome = { sent: unknown; reply: unknown; timedOut: boolean };
type SingleSendInput = {
  prompt: string;
  send: (prompt: string) => Promise<unknown>;
  waitForReply: (sent: unknown) => Promise<{ timedOut: boolean; reply?: unknown }>;
  recoverReply: () => Promise<unknown>;
};

export async function executeSingleSend(input: SingleSendInput): Promise<SendOutcome> {
  const sent = await input.send(input.prompt);
  const outcome = await input.waitForReply(sent);
  const reply = await input.recoverReply();
  if (!reply) throw new Error("No structural Mind reply was observed");
  return { sent, reply, timedOut: outcome.timedOut };
}

export async function runAuthorizedProcessBExchange(
  input: SingleSendInput & {
    authorizeSeed: () => Promise<void>;
    verifyBoundary: () => Promise<void>;
  },
): Promise<SendOutcome> {
  await input.authorizeSeed();
  await input.verifyBoundary();
  return executeSingleSend(input);
}

export async function loadCompleteHistory(input: {
  loadPage: (cursor?: string) => Promise<ProofHistoryRow[]>;
  pageSize: number;
  maxPages: number;
}): Promise<ProofHistoryRow[]> {
  const rows: ProofHistoryRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < input.maxPages; page += 1) {
    const batch = await input.loadPage(cursor);
    rows.push(...batch);
    if (batch.length < input.pageSize) return rows;
    const next = batch.at(-1)?.fingerprint;
    if (!next || next === cursor) throw new Error("Complete history pagination did not advance");
    cursor = next;
  }
  throw new Error("Complete history exceeded the bounded page limit");
}

export function normalizeProviderHistory(value: unknown): ProofHistoryRow[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error("Provider history array is invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== value.length + 1 || keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key)))) throw new Error("Provider history array shape is invalid");
  const snapshot = Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new Error("Provider history array must contain inert dense data");
    return descriptor.value;
  });
  return snapshot.map((item, index) => normalizeProviderRow(item, index));
}

function normalizeProviderRow(value: unknown, index: number): ProofHistoryRow {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value)) throw new Error(`History row ${index} is invalid`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const read = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) throw new Error(`History row ${index} ${key} must be inert data`);
    return descriptor.value;
  };
  let messageId: unknown;
  try { messageId = read("messageId"); } catch { messageId = read("id"); }
  if (typeof messageId !== "string" || messageId.trim() === "") throw new Error(`History row ${index} messageId is missing`);
  const messageText = read("messageText");
  const createdAt = read("createdAt");
  const fingerprint = read("fingerprint");
  const senderType = read("senderType");
  if (typeof messageText !== "string") throw new Error(`History row ${index} messageText is missing`);
  if (typeof createdAt !== "string") throw new Error(`History row ${index} createdAt is missing`);
  if (typeof fingerprint !== "string" || fingerprint.trim() === "") throw new Error(`History row ${index} fingerprint is missing`);
  if (typeof senderType !== "number") throw new Error(`History row ${index} senderType is missing`);
  return { messageId, messageText, createdAt, fingerprint, senderType };
}
