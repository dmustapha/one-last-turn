import type { MindsClient } from "@animocabrands/minds-client-lib";
import { types as utilTypes } from "node:util";

import { digestHistory, selectFreshMindReply, type ProofHistoryRow } from "@/proof/history-provenance";
import { loadCompleteHistory, normalizeProviderHistory } from "@/proof/minds-proof-flow";
import { retryProviderRead } from "@/proof/provider-retry";
import { safeMessageId, sha256 } from "./proof-io";

const PAGE_SIZE = 20;
const MAX_PAGES = 10;

export async function readCompleteProviderHistory(client: MindsClient, alias: string): Promise<ProofHistoryRow[]> {
  return loadCompleteHistory({
    pageSize: PAGE_SIZE,
    maxPages: MAX_PAGES,
    loadPage: async (cursor) => normalizeProviderHistory(await retryProviderRead(
      () => client.getHistory(alias, { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
      { attempts: 4, baseDelayMs: 1_000 },
    )),
  });
}

export async function recoverFreshReply(input: {
  client: MindsClient;
  alias: string;
  beforeRows: ProofHistoryRow[];
  sentMessageId: string;
  sentTextDigest: string;
  onReconciledRows?: (rows: ProofHistoryRow[]) => void;
}): Promise<ProofHistoryRow> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const rows = await readCompleteProviderHistory(input.client, input.alias);
    try {
      const reply = selectFreshMindReply({
        beforeRows: input.beforeRows,
        afterRows: rows,
        sentMessageId: input.sentMessageId,
        sentTextDigest: input.sentTextDigest,
      });
      input.onReconciledRows?.(rows);
      return reply;
    } catch (error) {
      if (!isAwaitableReplyError(error) || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  throw new Error("Fresh reply recovery exhausted");
}

function isAwaitableReplyError(error: unknown): boolean {
  return error instanceof Error && /No fresh Mind reply|provenance is ambiguous/.test(error.message);
}

export function requireSentMessageId(value: unknown): string {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value)) throw new Error("Provider send result is malformed");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of ["messageId", "id", "message_id"]) {
    const descriptor = descriptors[key];
    if (descriptor && !("value" in descriptor)) throw new Error("Provider send result must use inert data");
  }
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of ["messageId", "id", "message_id"]) snapshot[key] = descriptors[key]?.value;
  const messageId = safeMessageId(snapshot);
  if (!messageId) throw new Error("Provider send result lacks a message ID");
  return messageId;
}

export function historyBoundary(rows: ProofHistoryRow[]) {
  return Object.freeze({
    digest: digestHistory(rows),
    rowCount: rows.length,
    messageIds: Object.freeze(rows.map((row) => row.messageId)),
    contentDigests: Object.freeze(rows.map((row) => sha256(row.messageText))),
  });
}

export function assertMinimalBoundary(rows: ProofHistoryRow[], boundary: {
  rowCount: number;
  digest: string;
  latestFingerprint: string;
}): void {
  if (rows.length !== boundary.rowCount || digestHistory(rows) !== boundary.digest) {
    throw new Error("Live process-A boundary does not match handoff");
  }
  if (rows[0]?.fingerprint !== boundary.latestFingerprint) {
    throw new Error("Live latest fingerprint does not match handoff");
  }
}
