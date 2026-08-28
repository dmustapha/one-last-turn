// File: tests/unit/infrastructure/minds-worker.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createBoundary,
  readCompleteHistory,
  reconcileExchange,
} from "../../../src/infrastructure/minds/history";
import { createLiveMindTransport, executeMindWork, type MindTransport } from "../../../src/infrastructure/minds/minds-worker";

const row = (id: string, minute: number, senderType: 0 | 1 | 2 = 1, messageText = id) => ({
  messageId: id, messageText, createdAt: `2026-08-27T00:${String(minute).padStart(2, "0")}:00.000Z`,
  fingerprint: `fp-${id}`, senderType });

const mindIdentityJournal = () => ({
  openSendGate: vi.fn(), acknowledgeSend: vi.fn(), noteAmbiguity: vi.fn(), recordExchange: vi.fn(),
});

function mindIdentityTransport(input: {
  conversation: Record<string, unknown>;
  lookup: () => Promise<Record<string, unknown>>;
  completeExchange?: boolean;
}) {
  const getConversation = vi.fn(input.lookup);
  const getHistory = input.completeExchange
    ? vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
      row("reply", 2, 0, "reply"), row("out", 1, 1, "work"),
    ])
    : vi.fn();
  const sendMessage = vi.fn(async () => ({ messageId: "out" }));
  const transport = {
    getCognitionBalance: vi.fn(async () => 1),
    ensureConversation: vi.fn(async () => input.conversation),
    getConversation, getHistory, sendMessage,
    waitForReply: vi.fn(async () => ({ timedOut: false })),
  } as MindTransport;
  return { transport, getConversation, getHistory, sendMessage };
}

const participantConversation = (mindIds: string[] = ["mind"]) => ({
  alias: "alias",
  participants: [
    ...mindIds.map((partyId) => ({ partyType: 0, partyId })),
    { partyType: 1, partyId: "human" },
  ],
});

describe("Minds worker", () => {
  it("paginates newest-first with an exclusive cursor", async () => {
    const getHistory = vi.fn(async (_alias: string, options: { limit: number; cursor?: string }) =>
      options.cursor ? [row("old", 1)] : [row("new", 2), row("mid", 1)]);
    const rows = await readCompleteHistory({ transport: { getHistory }, alias: "alias", pageSize: 2 });
    expect(rows.map((item) => item.messageId)).toEqual(["new", "mid", "old"]);
    expect(getHistory).toHaveBeenLastCalledWith("alias", { limit: 2, cursor: "fp-mid" });
  });
  it("stops before send when Cognition is empty", async () => {
    const sendMessage = vi.fn();
    const transport = { getCognitionBalance: async () => 0, ensureConversation: vi.fn(),
      getConversation: vi.fn(), getHistory: vi.fn(), sendMessage,
      waitForReply: vi.fn() } satisfies MindTransport;
    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String }))
      .rejects.toThrow("MINDS_COGNITION_EMPTY");
    expect(sendMessage).not.toHaveBeenCalled();
  });
  describe("conversation Mind identity", () => {
    const execute = (transport: MindTransport, journal = mindIdentityJournal()) => ({
      promise: executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
        processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String }),
      journal,
    });

    it("requires authoritative roster agreement for an exact direct Mind ID", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias", mindId: "mind" },
        lookup: async () => participantConversation(), completeExchange: true });
      const { promise } = execute(fixture.transport);
      await expect(promise).resolves.toMatchObject({ artifact: "reply" });
      expect(fixture.getConversation).toHaveBeenCalledTimes(3);
      expect(fixture.sendMessage).toHaveBeenCalledOnce();
    });

    it("rejects an exact direct Mind ID when the authoritative roster conflicts", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias", mindId: "mind" },
        lookup: async () => participantConversation(["other"]) });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_MISMATCH");
      expect(fixture.getConversation).toHaveBeenCalledOnce();
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("verifies an omitted direct Mind ID from the participant roster", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias" },
        lookup: async () => participantConversation(), completeExchange: true });
      const { promise } = execute(fixture.transport);
      await expect(promise).resolves.toMatchObject({ artifact: "reply" });
      expect(fixture.getConversation).toHaveBeenCalledWith("alias");
      expect(fixture.sendMessage).toHaveBeenCalledOnce();
    });

    it("does not accept an exact lookup Mind ID without a roster", async () => {
      const fixture = mindIdentityTransport({ conversation: {},
        lookup: async () => ({ alias: "alias", mindId: "mind" }) });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_UNVERIFIED");
      expect(fixture.getConversation).toHaveBeenCalledOnce();
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("rejects a different lookup Mind ID without requiring participants", async () => {
      const fixture = mindIdentityTransport({ conversation: {},
        lookup: async () => ({ alias: "alias", mindId: "other" }) });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_MISMATCH");
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it.each([
      ["null", null],
      ["empty", ""],
    ])("resolves a %s conversation Mind projection before proceeding", async (_label, mindId) => {
      const fixture = mindIdentityTransport({ conversation: { alias: null, mindId },
        lookup: async () => participantConversation(), completeExchange: true });
      const { promise } = execute(fixture.transport);
      await expect(promise).resolves.toMatchObject({ artifact: "reply" });
      expect(fixture.getConversation).toHaveBeenCalledWith("alias");
      expect(fixture.sendMessage).toHaveBeenCalledOnce();
    });

    it("rejects a direct Mind mismatch without participant override", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias", mindId: "other" },
        lookup: async () => participantConversation() });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_MISMATCH");
      expect(fixture.getConversation).not.toHaveBeenCalled();
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("rejects a different sole Mind participant before the send gate", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias" },
        lookup: async () => participantConversation(["other"]) });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_MISMATCH");
      expect(fixture.getConversation).toHaveBeenCalledOnce();
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("classifies an absent Mind participant as unverified", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias" },
        lookup: async () => participantConversation([]) });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_UNVERIFIED");
      expect(fixture.getConversation).toHaveBeenCalledOnce();
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("classifies conversation lookup failure as unverified before the send gate", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias" },
        lookup: async () => { throw new Error("LOOKUP_SENTINEL"); } });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_UNVERIFIED");
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("rejects a malformed direct Mind projection without resolver fallback", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias", mindId: {} },
        lookup: async () => participantConversation() });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_UNVERIFIED");
      expect(fixture.getConversation).not.toHaveBeenCalled();
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("rejects a contradictory returned alias before resolver or send", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "other", mindId: "mind" },
        lookup: async () => participantConversation() });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_MISMATCH");
      expect(fixture.getConversation).not.toHaveBeenCalled();
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("classifies multiple Mind participants as unverified", async () => {
      const fixture = mindIdentityTransport({ conversation: { alias: "alias" },
        lookup: async () => participantConversation(["mind", "other"]) });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_UNVERIFIED");
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it.each([
      ["string role", [{ partyType: 0, partyId: "mind" }, { partyType: "1", partyId: "human" }]],
      ["unknown role", [{ partyType: 0, partyId: "mind" }, { partyType: 2, partyId: "other" }]],
      ["missing ID", [{ partyType: 0, partyId: "mind" }, { partyType: 1 }]],
      ["duplicate ID", [{ partyType: 0, partyId: "mind" }, { partyType: 1, partyId: "mind" }]],
      ["two Mind roles", [{ partyType: 0, partyId: "mind" }, { partyType: 0, partyId: "other" }]],
      ["two human roles", [{ partyType: 1, partyId: "human" }, { partyType: 1, partyId: "other" }]],
    ])("rejects a roster with malformed %s evidence", async (_label, participants) => {
      const lookup = async () => ({ alias: "alias", participants });
      const fixture = mindIdentityTransport({ conversation: {}, lookup });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_UNVERIFIED");
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });

    it("revalidates the roster immediately before opening the send gate", async () => {
      let lookups = 0;
      const lookup = async () => (++lookups === 1
        ? participantConversation()
        : participantConversation(["other"]));
      const fixture = mindIdentityTransport({ conversation: {}, lookup, completeExchange: true });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_MISMATCH");
      expect(fixture.getConversation).toHaveBeenCalledTimes(2);
      expect(journal.openSendGate).not.toHaveBeenCalled();
      expect(fixture.sendMessage).not.toHaveBeenCalled();
    });

    it("revalidates the roster before recording a complete exchange", async () => {
      let lookups = 0;
      const lookup = async () => (++lookups < 3
        ? participantConversation()
        : participantConversation(["other"]));
      const fixture = mindIdentityTransport({ conversation: {}, lookup, completeExchange: true });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_MISMATCH");
      expect(fixture.getConversation).toHaveBeenCalledTimes(3);
      expect(fixture.sendMessage).toHaveBeenCalledOnce();
      expect(journal.recordExchange).not.toHaveBeenCalled();
    });

    it("rejects a contradictory lookup alias before the send gate", async () => {
      const fixture = mindIdentityTransport({ conversation: {}, lookup: async () => ({
        ...participantConversation(), alias: "other",
      }) });
      const { promise, journal } = execute(fixture.transport);
      await expect(promise).rejects.toThrow("MINDS_ALIAS_MIND_MISMATCH");
      expect([fixture.getHistory, journal.openSendGate, fixture.sendMessage]
        .every((mock) => mock.mock.calls.length === 0)).toBe(true);
    });
  });
  it("uses read-only recovery after wait failure without resending", async () => {
    const sendMessage = vi.fn(async () => ({ messageId: "out" }));
    const getHistory = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row("reply", 2, 0, "useful reply"), row("out", 1, 1, "work")]);
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory, sendMessage,
      waitForReply: vi.fn(async () => { throw new Error("timeout"); }) } satisfies MindTransport;
    const times = ["2026-08-27T00:01:00.000Z", "2026-08-27T00:02:00.000Z"];
    const result = await executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String,
      now: () => times.shift()! });
    expect(result.artifact).toBe("useful reply");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it("recovers one uniquely bound exchange after an ambiguous send acknowledgement", async () => {
    const sendMessage = vi.fn(async () => { throw new Error("socket closed"); });
    const getHistory = vi.fn().mockResolvedValueOnce([])
      .mockResolvedValueOnce([row("reply", 2, 0, "recovered reply"), row("out", 1, 1, "work")]);
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory, sendMessage,
      waitForReply: vi.fn(async () => ({ timedOut: false })) } satisfies MindTransport;
    const times = ["2026-08-27T00:01:00.000Z", "2026-08-27T00:02:00.000Z"];
    const result = await executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String,
      recoveryDelayMs: 0, now: () => times.shift()! });
    expect(result.evidence.sendResolution).toBe("history_recovered");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it("detects a changed expected boundary", () => {
    const a = createBoundary([row("one", 1)], "2026-08-27T00:02:00.000Z");
    const b = createBoundary([], "2026-08-27T00:02:00.000Z");
    expect(a.digest).not.toBe(b.digest);
  });
  it("rejects an exchange whose prior-history suffix changed", () => {
    const before = [row("prior", 0, 0)];
    const after = [
      row("reply", 3, 0),
      row("out", 2, 1, "work"),
      row("changed-prior", 0, 0),
    ];
    expect(() => reconcileExchange({
      alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001",
      prompt: "work", sentMessageId: "out", executionClass: "test_transport",
      processInstanceId: "00000000-0000-4000-8000-000000000002",
      processStartedAt: "2026-08-27T00:00:00.000Z", before, after,
      startedAt: "2026-08-27T00:01:00.000Z", completedAt: "2026-08-27T00:04:00.000Z",
    })).toThrow("MINDS_EXCHANGE_STALE_SUFFIX");
  });
  it("does not resend when provider output parsing fails", async () => {
    const sendMessage = vi.fn(async () => ({ messageId: "out" }));
    const getHistory = vi.fn().mockResolvedValueOnce([])
      .mockResolvedValueOnce([row("reply", 2, 0, "malformed"), row("out", 1, 1, "work")]);
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory, sendMessage,
      waitForReply: vi.fn(async () => ({ timedOut: false })) } satisfies MindTransport;
    const times = ["2026-08-27T00:01:00.000Z", "2026-08-27T00:02:00.000Z"];
    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work",
      parse: () => { throw new Error("MALFORMED_PROVIDER_OUTPUT"); },
      now: () => times.shift()! })).rejects.toThrow("MALFORMED_PROVIDER_OUTPUT");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it("opens the durable gate before the sole semantic send", async () => {
    const order: string[] = [];
    const journal = { openSendGate: vi.fn(async () => { order.push("gate"); }),
      acknowledgeSend: vi.fn(async () => { order.push("ack"); }),
      noteAmbiguity: vi.fn(), recordExchange: vi.fn(async () => { order.push("exchange"); }) };
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }),
      getConversation: async () => { order.push("bind"); return participantConversation(); },
      getHistory: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([row("reply", 2, 0, "reply"), row("out", 1, 1, "work")]),
      sendMessage: vi.fn(async () => { order.push("send"); return { messageId: "out" }; }),
      waitForReply: vi.fn(async () => ({ timedOut: false })) } satisfies MindTransport;
    const times = ["2026-08-27T00:01:00.000Z", "2026-08-27T00:01:01.000Z",
      "2026-08-27T00:02:00.000Z"];

    await executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String,
      now: () => times.shift()! });

    expect(order).toEqual(["bind", "bind", "gate", "send", "ack", "bind", "exchange"]);
  });
  it("never sends when the durable gate cannot commit", async () => {
    const sendMessage = vi.fn();
    const journal = { openSendGate: vi.fn(async () => { throw new Error("DB_DOWN"); }),
      acknowledgeSend: vi.fn(), noteAmbiguity: vi.fn(), recordExchange: vi.fn() };
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory: vi.fn(async () => []),
      sendMessage, waitForReply: vi.fn() } satisfies MindTransport;

    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String }))
      .rejects.toThrow("DB_DOWN");
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it("records an ambiguous outcome once and never resends", async () => {
    const journal = { openSendGate: vi.fn(), acknowledgeSend: vi.fn(),
      noteAmbiguity: vi.fn(), recordExchange: vi.fn() };
    const sendMessage = vi.fn(async () => { throw new Error("socket closed"); });
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory: vi.fn(async () => []),
      sendMessage, waitForReply: vi.fn(async () => ({ timedOut: true })) } satisfies MindTransport;

    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String,
      recoveryDelayMs: 0 })).rejects.toThrow("MINDS_SEND_AMBIGUOUS");
    expect(journal.noteAmbiguity).toHaveBeenCalledOnce();
    expect(journal.acknowledgeSend).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledOnce();
  });
  it("preserves the ambiguous safe code when ambiguity journaling fails", async () => {
    const journal = { openSendGate: vi.fn(), acknowledgeSend: vi.fn(),
      noteAmbiguity: vi.fn(async () => { throw new Error("AMBIGUITY_JOURNAL_FAILED"); }),
      recordExchange: vi.fn() };
    const sendMessage = vi.fn(async () => { throw new Error("socket closed"); });
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory: vi.fn(async () => []), sendMessage, waitForReply: vi.fn() } satisfies MindTransport;

    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String,
      recoveryDelayMs: 0 })).rejects.toThrow("MINDS_SEND_AMBIGUOUS");
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(journal.acknowledgeSend).not.toHaveBeenCalled();
  });
  it("records a complete exchange before semantic parsing", async () => {
    const order: string[] = [];
    const journal = { openSendGate: vi.fn(), acknowledgeSend: vi.fn(), noteAmbiguity: vi.fn(),
      recordExchange: vi.fn(async () => { order.push("exchange"); }) };
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([row("reply", 2, 0, "bad"), row("out", 1, 1, "work")]),
      sendMessage: vi.fn(async () => ({ messageId: "out" })),
      waitForReply: vi.fn(async () => ({ timedOut: false })) } satisfies MindTransport;

    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work",
      parse: () => { order.push("parse"); throw new Error("BAD_ARTIFACT"); } }))
      .rejects.toThrow("BAD_ARTIFACT");
    expect(order).toEqual(["exchange", "parse"]);
  });
  it("requires a durable journal for a live SDK transport before any provider read", async () => {
    const live = createLiveMindTransport("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature");
    await expect(executeMindWork({ transport: live, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String }))
      .rejects.toThrow("MINDS_SEND_JOURNAL_REQUIRED");
  });
  it("leaves the gate conservative when acknowledgement journaling fails", async () => {
    const journal = { openSendGate: vi.fn(),
      acknowledgeSend: vi.fn(async () => { throw new Error("ACK_JOURNAL_FAILED"); }),
      noteAmbiguity: vi.fn(), recordExchange: vi.fn() };
    const sendMessage = vi.fn(async () => ({ messageId: "out" }));
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory: vi.fn(async () => []),
      sendMessage, waitForReply: vi.fn() } satisfies MindTransport;
    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String }))
      .rejects.toThrow("MINDS_ACK_PERSISTENCE_FAILED");
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(journal.noteAmbiguity).toHaveBeenCalledWith("MINDS_ACK_PERSISTENCE_FAILED", expect.any(String));
    expect(journal.recordExchange).not.toHaveBeenCalled();
  });
  it("keeps acknowledgement durable when no complete reply appears", async () => {
    const journal = { openSendGate: vi.fn(), acknowledgeSend: vi.fn(),
      noteAmbiguity: vi.fn(), recordExchange: vi.fn() };
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory: vi.fn(async () => []),
      sendMessage: vi.fn(async () => ({ messageId: "out" })),
      waitForReply: vi.fn(async () => ({ timedOut: true })) } satisfies MindTransport;
    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String,
      recoveryDelayMs: 0 })).rejects.toThrow("MINDS_REPLY_NOT_IN_HISTORY");
    expect(journal.acknowledgeSend).toHaveBeenCalledOnce();
    expect(journal.recordExchange).not.toHaveBeenCalled();
  });
  it("does not lose acknowledgement when exchange journaling fails", async () => {
    const journal = { openSendGate: vi.fn(), acknowledgeSend: vi.fn(), noteAmbiguity: vi.fn(),
      recordExchange: vi.fn(async () => { throw new Error("EXCHANGE_JOURNAL_FAILED"); }) };
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getConversation: async () => participantConversation(),
      getHistory: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([row("reply", 2, 0, "reply"), row("out", 1, 1, "work")]),
      sendMessage: vi.fn(async () => ({ messageId: "out" })),
      waitForReply: vi.fn(async () => ({ timedOut: false })) } satisfies MindTransport;
    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind", journal,
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String }))
      .rejects.toThrow("EXCHANGE_JOURNAL_FAILED");
    expect(journal.acknowledgeSend).toHaveBeenCalledOnce();
    expect(transport.sendMessage).toHaveBeenCalledOnce();
  });
});
