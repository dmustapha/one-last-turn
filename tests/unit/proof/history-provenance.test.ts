import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertMatchingBoundary,
  digestHistory,
  selectFreshMindReply,
  type ProofHistoryRow,
} from "@/proof/history-provenance";

const humanA: ProofHistoryRow = {
  messageId: "human-a",
  senderType: 1,
  createdAt: "2026-08-27T00:00:00.000Z",
  messageText: "Review the invitation.",
  fingerprint: "fp-a",
};

const mindA: ProofHistoryRow = {
  messageId: "mind-a",
  senderType: 0,
  createdAt: "2026-08-27T00:00:01.000Z",
  messageText: "I will review it.",
  fingerprint: "fp-b",
};

const beforeRows = [mindA, humanA];
const sentB: ProofHistoryRow = {
  ...humanA,
  messageId: "human-b",
  createdAt: "2026-08-27T00:00:02.000Z",
  messageText: "Review the next draft.",
  fingerprint: "fp-c",
};
const replyB: ProofHistoryRow = {
  ...mindA,
  messageId: "mind-b",
  senderType: 2,
  createdAt: "2026-08-27T00:00:03.000Z",
  fingerprint: "fp-d",
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("history provenance", () => {
  it("produces a stable exact digest in provider order", () => {
    expect(digestHistory([humanA, mindA])).toBe(
      "16730f411dcffaed8403a8476dec52105818723bd42f2293f62849472cd2de26",
    );
    expect(digestHistory([mindA, humanA])).not.toBe(digestHistory([humanA, mindA]));
  });

  it("rejects an A-terminal and B-initial boundary mismatch", () => {
    expect(() => assertMatchingBoundary("a".repeat(64), "b".repeat(64))).toThrow(
      /boundary mismatch/i,
    );
  });

  it.each(["short", "A".repeat(64), "g".repeat(64)])(
    "rejects malformed boundary digests",
    (digest) => {
      expect(() => assertMatchingBoundary(digest, digest)).toThrow(
        /64 lowercase hexadecimal/i,
      );
    },
  );

  it("rejects stale Mind rows that predate the B send", () => {
    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows: [sentB, ...beforeRows],
        sentMessageId: sentB.messageId,
        sentTextDigest: sha256(sentB.messageText),
      }),
    ).toThrow(/fresh Mind reply/i);
  });

  it("rejects a history change caused only by the new human row", () => {
    const humanOnlyChange = { ...sentB, fingerprint: "human-only-change" };

    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows: [humanOnlyChange, ...beforeRows],
        sentMessageId: humanOnlyChange.messageId,
        sentTextDigest: sha256(humanOnlyChange.messageText),
      }),
    ).toThrow(/fresh Mind reply/i);
  });

  it.each([
    [{ ...humanA, messageId: "" }, /message ID/i],
    [{ ...humanA, createdAt: "" }, /timestamp/i],
  ])("rejects missing provenance fields", (invalidRow, expectedError) => {
    expect(() => digestHistory([invalidRow])).toThrow(expectedError);
  });

  it("rejects ambiguous fresh Mind replies", () => {
    const secondReply = {
      ...replyB,
      messageId: "mind-b-2",
      createdAt: "2026-08-27T00:00:04.000Z",
      fingerprint: "fp-e",
    };

    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows: [secondReply, replyB, sentB, ...beforeRows],
        sentMessageId: sentB.messageId,
        sentTextDigest: sha256(sentB.messageText),
      }),
    ).toThrow(/ambiguous/i);
  });

  it("selects one newer Mind reply before the sent row in newest-first order", () => {
    expect(
      selectFreshMindReply({
        beforeRows,
        afterRows: [replyB, sentB, ...beforeRows],
        sentMessageId: sentB.messageId,
        sentTextDigest: sha256(sentB.messageText),
      }),
    ).toEqual(replyB);
  });

  it("rejects a Mind reply separated from B by another human turn", () => {
    const humanC = {
      ...sentB,
      messageId: "human-c",
      createdAt: "2026-08-27T00:00:03.000Z",
      fingerprint: "fp-d",
    };
    const mindReplyToC = {
      ...replyB,
      createdAt: "2026-08-27T00:00:04.000Z",
      fingerprint: "fp-e",
    };

    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows: [mindReplyToC, humanC, sentB, ...beforeRows],
        sentMessageId: sentB.messageId,
        sentTextDigest: sha256(sentB.messageText),
      }),
    ).toThrow(/exactly one Mind reply/i);
  });

  it("rejects duplicate message IDs within process-A history", () => {
    const duplicate = { ...humanA, messageId: mindA.messageId };

    expect(() => digestHistory([mindA, duplicate])).toThrow(/duplicate message ID/i);
  });

  it("rejects duplicate message IDs among fresh history rows", () => {
    const duplicateReply = {
      ...replyB,
      createdAt: "2026-08-27T00:00:04.000Z",
      fingerprint: "fp-e",
    };

    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows: [duplicateReply, replyB, sentB, ...beforeRows],
        sentMessageId: sentB.messageId,
        sentTextDigest: sha256(sentB.messageText),
      }),
    ).toThrow(/duplicate message ID/i);
  });

  it.each([
    ["truncated", [replyB, sentB, mindA]],
    ["mutated", [replyB, sentB, { ...mindA, messageText: "changed" }, humanA]],
    [
      "inserted",
      [replyB, sentB, { ...humanA, messageId: "unrelated" }, ...beforeRows],
    ],
  ])("rejects a %s process-A boundary suffix", (_case, afterRows) => {
    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows,
        sentMessageId: sentB.messageId,
        sentTextDigest: sha256(sentB.messageText),
      }),
    ).toThrow(/boundary suffix/i);
  });

  it("rejects a malformed outbound text digest", () => {
    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows: [replyB, sentB, ...beforeRows],
        sentMessageId: sentB.messageId,
        sentTextDigest: "A".repeat(64),
      }),
    ).toThrow(/64 lowercase hexadecimal/i);
  });

  it("rejects a B send that is not newer than every A boundary row", () => {
    const staleSent = { ...sentB, createdAt: humanA.createdAt };
    const laterReply = { ...replyB, createdAt: "2026-08-27T00:00:04.000Z" };

    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows: [laterReply, staleSent, ...beforeRows],
        sentMessageId: staleSent.messageId,
        sentTextDigest: sha256(staleSent.messageText),
      }),
    ).toThrow(/newer than process A/i);
  });

  it.each([
    "0",
    "8/27/2026, 12:00:00 AM",
    "2026-08-27T00:00:00.000",
    "2026-08-27T01:00:00.000+01:00",
    "2026-08-27T00:00:00Z",
    "not-a-timestamp",
  ])("rejects non-canonical history timestamp %s", (createdAt) => {
    expect(() => digestHistory([{ ...humanA, createdAt }])).toThrow(
      /canonical UTC ISO timestamp/i,
    );
  });

  it("rejects a Mind reply with the same timestamp as the B send", () => {
    const equalTimeReply = { ...replyB, createdAt: sentB.createdAt };

    expect(() =>
      selectFreshMindReply({
        beforeRows,
        afterRows: [equalTimeReply, sentB, ...beforeRows],
        sentMessageId: sentB.messageId,
        sentTextDigest: sha256(sentB.messageText),
      }),
    ).toThrow(/strictly newer than the B send/i);
  });

  it.each([-1, 3, 99])("rejects unsupported sender type %i", (senderType) => {
    expect(() => digestHistory([{ ...humanA, senderType }])).toThrow(
      /sender type must be 0, 1, or 2/i,
    );
  });
});
