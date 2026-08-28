import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  executeSingleSend,
  loadCompleteHistory,
  normalizeProviderHistory,
  runAuthorizedProcessBExchange,
} from "@/proof/minds-proof-flow";
import {
  buildSeedGoReceipt,
  validateSeedAuthorization,
} from "@/proof/minds-seed-review";
import { signSeedGoReceipt, validateSeedGoReceipt } from "@/proof/minds-resume-flow";
import {
  buildFailureResult,
  canonicalCombinedEvidenceDigest,
  verifyOfflineProof,
} from "@/proof/minds-proof-verifier";
import { digestHistory, type ProofHistoryRow } from "@/proof/history-provenance";
import { requireSentMessageId } from "../../../scripts/minds-proof-runtime";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (character: string) => character.repeat(64);
const trustedMindDigest = digest("a");
const dispatches = [digest("b"), digest("c"), digest("d")];
const rawReviewDigests = [digest("e"), digest("f"), digest("1")];
const PROCESS_A_PROMPT = "fixture-only process A prompt";
const PROCESS_B_PROMPT = "fixture-only process B prompt";

const oldHuman: ProofHistoryRow = {
  messageId: "old-human",
  senderType: 1,
  createdAt: "2026-08-27T00:00:00.000Z",
  messageText: "old",
  fingerprint: "fp-old-human",
};
const oldMind: ProofHistoryRow = {
  messageId: "old-mind",
  senderType: 0,
  createdAt: "2026-08-27T00:00:01.000Z",
  messageText: "old reply",
  fingerprint: "fp-old-mind",
};
const humanA: ProofHistoryRow = {
  messageId: "human-a",
  senderType: 1,
  createdAt: "2026-08-27T00:00:03.000Z",
  messageText: PROCESS_A_PROMPT,
  fingerprint: "fp-human-a",
};
const mindA: ProofHistoryRow = {
  messageId: "mind-a",
  senderType: 0,
  createdAt: "2026-08-27T00:00:04.000Z",
  messageText: "A natural response",
  fingerprint: "fp-mind-a",
};
const humanB: ProofHistoryRow = {
  messageId: "human-b",
  senderType: 1,
  createdAt: "2026-08-27T00:01:03.000Z",
  messageText: PROCESS_B_PROMPT,
  fingerprint: "fp-human-b",
};
const mindB: ProofHistoryRow = {
  messageId: "mind-b",
  senderType: 2,
  createdAt: "2026-08-27T00:01:04.000Z",
  messageText: "A natural recalled response",
  fingerprint: "fp-mind-b",
};
const initialA = [oldMind, oldHuman];
const terminalA = [mindA, humanA, ...initialA];
const terminalB = [mindB, humanB, ...terminalA];

const boundary = (rows: ProofHistoryRow[]) => ({
  digest: digestHistory(rows),
  rowCount: rows.length,
  messageIds: rows.map((row) => row.messageId),
  contentDigests: rows.map((row) => sha256(row.messageText)),
});

function envelope(phase: "A" | "B") {
  const isA = phase === "A";
  const initialRows = isA ? initialA : terminalA;
  const terminalRows = isA ? terminalA : terminalB;
  const outbound = isA ? humanA : humanB;
  const reply = isA ? mindA : mindB;
  return {
    schemaVersion: isA ? "minds-process-a-v2" : "minds-process-b-v2",
    phase,
    ...(!isA ? { seedGoDigest: digest("9") } : {}),
    runId: "run-safe",
    processNonce: isA ? digest("2") : digest("3"),
    pid: isA ? 1001 : 1002,
    sdkVersion: "0.1.4",
    alias: "ignored-private-alias",
    aliasDigest: sha256("ignored-private-alias"),
    mindDigest: trustedMindDigest,
    startedAt: isA ? "2026-08-27T00:00:02.000Z" : "2026-08-27T00:01:02.000Z",
    completedAt: isA ? "2026-08-27T00:00:05.000Z" : "2026-08-27T00:01:05.000Z",
    initialBoundary: boundary(initialRows),
    terminalBoundary: boundary(terminalRows),
    initialRows,
    terminalRows,
    outbound: {
      messageId: outbound.messageId,
      rawText: outbound.messageText,
      contentDigest: sha256(outbound.messageText),
      sentAt: outbound.createdAt,
    },
    reply: {
      messageId: reply.messageId,
      rawText: reply.messageText,
      contentDigest: sha256(reply.messageText),
      receivedAt: reply.createdAt,
    },
    cognition: {
      before: isA ? 100 : 90,
      beforeObservedAt: isA ? "2026-08-27T00:00:02.500Z" : "2026-08-27T00:01:02.500Z",
      after: isA ? 90 : 80,
      afterObservedAt: isA ? "2026-08-27T00:00:04.500Z" : "2026-08-27T00:01:04.500Z",
    },
  };
}

function seedFinding(index: number, override: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    reviewerId: `seed-reviewer-${index}`,
    dispatchDigest: dispatches[index],
    evidenceDigest: digest("4"),
    reviewEvidenceDigest: rawReviewDigests[index],
    reviewedAt: `2026-08-27T00:10:0${index}.000Z`,
    voluntaryEngagement: true,
    criticalPersistenceRecall: true,
    supportingConcepts: ["ACCESS_INDEPENDENCE"],
    refusal: false,
    semanticInsufficiency: false,
    verdict: "PASS",
    ...override,
  };
}

function seedAuthorization(override: Record<string, unknown> = {}) {
  return {
    schemaVersion: "minds-seed-authorization-v2",
    handoffDigest: digest("5"),
    evidenceDigest: digest("4"),
    expectedDispatchDigests: dispatches,
    findings: [seedFinding(0), seedFinding(1), seedFinding(2)],
    ...override,
  };
}

function finalFinding(index: number, evidenceDigest: string, override = {}) {
  return {
    schemaVersion: 1,
    reviewerId: `final-reviewer-${index}`,
    dispatchDigest: dispatches[index],
    evidenceDigest,
    reviewEvidenceDigest: rawReviewDigests[index],
    reviewedAt: `2026-08-27T00:20:0${index}.000Z`,
    processBConstraintsOmitted: true,
    criticalPersistenceRecall: true,
    supportingConcepts: ["PRIVATE_CLOSURE"],
    genericAgreement: false,
    promptEcho: false,
    refusal: false,
    staleEvidence: false,
    verdict: "PASS",
    ...override,
  };
}

describe("single-send orchestration", () => {
  it("sends at most once and uses bounded read-only recovery after timeout", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "sent" });
    const recoverReply = vi.fn().mockResolvedValue({ messageId: "reply" });
    const result = await executeSingleSend({
      prompt: "safe",
      send,
      waitForReply: vi.fn().mockResolvedValue({ timedOut: true }),
      recoverReply,
    });
    expect(result.reply).toEqual({ messageId: "reply" });
    expect(send).toHaveBeenCalledOnce();
    expect(recoverReply).toHaveBeenCalledOnce();
  });

  it("reconciles through authoritative history even when SSE returns promptly", async () => {
    const sseReply = { messageId: "untrusted-sse" };
    const historyReply = { messageId: "history-reply" };
    const recoverReply = vi.fn().mockResolvedValue(historyReply);
    const result = await executeSingleSend({
      prompt: "safe",
      send: vi.fn().mockResolvedValue({ messageId: "sent" }),
      waitForReply: vi.fn().mockResolvedValue({ timedOut: false, reply: sseReply }),
      recoverReply,
    });
    expect(result.reply).toEqual(historyReply);
    expect(recoverReply).toHaveBeenCalledOnce();
  });

  it.each(["seed authorization", "boundary"])("stops before send when %s fails", async (failure) => {
    const send = vi.fn();
    await expect(runAuthorizedProcessBExchange({
      authorizeSeed: async () => { if (failure === "seed authorization") throw new Error("seed"); },
      verifyBoundary: async () => { if (failure === "boundary") throw new Error("boundary"); },
      prompt: PROCESS_B_PROMPT,
      send,
      waitForReply: vi.fn(),
      recoverReply: vi.fn(),
    })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["missing", "fake", "wrong-key", "tampered"])("never sends with a %s signed GO receipt", async (kind) => {
    const key = Buffer.alloc(32, 4);
    const payload = { schemaVersion: "minds-seed-go-v3" as const, handoffDigest: digest("5"), authorizationDigest: digest("6"), dispatchManifestDigest: digest("7"), evidenceDigest: digest("8"), runId: "run-safe", reviewerCount: 3 as const, issuedAt: "2026-08-27T00:15:00.000Z" };
    const valid = signSeedGoReceipt(payload, key);
    const receipt = kind === "missing" ? undefined : kind === "fake" ? { ...payload, signature: digest("9") } : kind === "tampered" ? { ...valid, runId: "run-hostile" } : valid;
    const validationKey = kind === "wrong-key" ? Buffer.alloc(32, 5) : key;
    const send = vi.fn();
    await expect(runAuthorizedProcessBExchange({ authorizeSeed: async () => { validateSeedGoReceipt(receipt, digest("5"), validationKey); }, verifyBoundary: async () => {}, prompt: PROCESS_B_PROMPT, send, waitForReply: vi.fn(), recoverReply: vi.fn() })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("bounded complete history", () => {
  it("loads newest-first pages until the provider reports completion", async () => {
    const loadPage = vi.fn()
      .mockResolvedValueOnce([mindA, humanA])
      .mockResolvedValueOnce(initialA)
      .mockResolvedValueOnce([]);
    await expect(loadCompleteHistory({ loadPage, pageSize: 2, maxPages: 3 })).resolves.toEqual(terminalA);
    expect(loadPage).toHaveBeenNthCalledWith(2, humanA.fingerprint);
  });

  it("fails rather than claim completeness when the page bound is exhausted", async () => {
    await expect(loadCompleteHistory({
      loadPage: async () => [mindA],
      pageSize: 1,
      maxPages: 2,
    })).rejects.toThrow(/complete history/i);
  });
});

describe("seed authorization", () => {
  it("accepts exactly three unanimous digest-bound blind seed findings", () => {
    expect(validateSeedAuthorization(seedAuthorization(), digest("5"), rawReviewDigests)).toMatchObject({ evidenceDigest: digest("4") });
  });

  it.each([
    ["refusal", { refusal: true }],
    ["dissent", { verdict: "FAIL" }],
    ["semantic insufficiency", { semanticInsufficiency: true }],
    ["missing critical recall", { criticalPersistenceRecall: false }],
    ["missing support", { supportingConcepts: [] }],
  ])("rejects %s", (_label, adverse) => {
    const findings = [seedFinding(0, adverse), seedFinding(1), seedFinding(2)];
    expect(() => validateSeedAuthorization(seedAuthorization({ findings }), digest("5"), rawReviewDigests)).toThrow(/seed authorization/i);
  });

  it("rejects a seed authorization bound to another handoff", () => {
    expect(() => validateSeedAuthorization(seedAuthorization(), digest("6"), rawReviewDigests)).toThrow(/handoff/i);
  });

  it("rejects reuse of one pre-issued seed dispatch", () => {
    const findings = [seedFinding(0), seedFinding(1, { dispatchDigest: dispatches[0] }), seedFinding(2)];
    expect(() => validateSeedAuthorization(seedAuthorization({ findings }), digest("5"), rawReviewDigests)).toThrow(/dispatch/i);
  });

  it("rejects non-primitive seed concept labels without coercing them", () => {
    const malicious = { toString: () => "ACCESS_INDEPENDENCE" };
    const findings = [seedFinding(0, { supportingConcepts: [malicious] }), seedFinding(1), seedFinding(2)];
    expect(() => validateSeedAuthorization(seedAuthorization({ findings }), digest("5"), rawReviewDigests)).toThrow(/concept/i);
  });

  it("rejects seed findings whose ignored raw-review digest was not recomputed", () => {
    expect(() => validateSeedAuthorization(seedAuthorization(), digest("5"), [digest("9"), ...rawReviewDigests.slice(1)])).toThrow(/raw review/i);
  });

  it("produces only an opaque handoff-bound GO receipt", () => {
    const a = envelope("A");
    const handoff = {
      schemaVersion: "minds-public-handoff-v2",
      runId: a.runId,
      alias: a.alias,
      mindDigest: trustedMindDigest,
      boundary: { rowCount: a.terminalBoundary.rowCount, digest: a.terminalBoundary.digest, latestFingerprint: a.terminalRows[0]!.fingerprint },
    };
    const handoffDigest = sha256(JSON.stringify(handoff));
    const evidenceDigest = sha256(JSON.stringify(a));
    const authorization = seedAuthorization({ handoffDigest, evidenceDigest, findings: [seedFinding(0, { evidenceDigest }), seedFinding(1, { evidenceDigest }), seedFinding(2, { evidenceDigest })] });
    const receipt = buildSeedGoReceipt({
      processA: a, handoff, expectedMindDigest: trustedMindDigest,
      authorization, authorizationDigest: digest("8"), recomputedRawReviewDigests: rawReviewDigests,
      dispatchManifestDigest: digest("7"), issuedAt: "2026-08-27T00:15:00.000Z",
      trustedPrompt: PROCESS_A_PROMPT,
    });
    const key = Buffer.alloc(32, 7);
    const signed = signSeedGoReceipt(receipt, key);
    expect(signed).toMatchObject({ schemaVersion: "minds-seed-go-v3", handoffDigest,
      authorizationDigest: digest("8"), reviewerCount: 3 });
    expect(JSON.stringify(signed)).not.toMatch(/concept|finding|prompt|message|reply|constraint/i);
    expect(validateSeedGoReceipt(signed, handoffDigest, key)).toEqual(signed);
    expect(() => validateSeedGoReceipt(signed, handoffDigest, Buffer.alloc(32, 8))).toThrow(/signature/i);
  });
});

describe("process-B module isolation", () => {
  it("does not import process-A prompts, seed reviews, or raw seed artifacts", async () => {
    const source = await readFile(new URL("../../../scripts/minds-proof-resume.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/PROCESS_A_PROMPT|minds-seed-review|SeedAuthorization|mindsSeedAuthorizationUrl|mindsSeedRawReviewUrls/);
    expect(source).not.toMatch(/from "\.\/proof-shared"/);
    expect(source).toMatch(/from "\.\/minds-resume-io"/);
    expect(source).toContain("mindsProcessBPromptUrl");
    expect(source).not.toContain("mindsProcessAPromptUrl");
    expect(source.indexOf("readSecureTextOnce(mindsProcessBPromptUrl)")).toBeLessThan(source.indexOf("const client = createMindsClient"));
  });

  it("loads the isolated A prompt before constructing a provider client", async () => {
    const source = await readFile(new URL("../../../scripts/minds-proof-seed.ts", import.meta.url), "utf8");
    expect(source).toContain("mindsProcessAPromptUrl");
    expect(source).not.toContain("mindsProcessBPromptUrl");
    expect(source.indexOf("readSecureTextOnce(mindsProcessAPromptUrl)")).toBeLessThan(source.indexOf("const client = createMindsClient"));
  });

  it.each([["minds-proof-seed.ts", "mindsProcessBPromptUrl"], ["minds-proof-resume.ts", "mindsProcessAPromptUrl"]])("keeps the %s transitive module graph isolated", async (entry, forbidden) => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const sources = await collectModuleGraph(resolve(root, "scripts", entry), root);
    expect(sources.join("\n")).not.toContain(forbidden);
  });
});

async function collectModuleGraph(entry: string, root: string, seen = new Set<string>()): Promise<string[]> {
  if (seen.has(entry)) return [];
  seen.add(entry);
  const source = await readFile(entry, "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!);
  const local = imports.flatMap((specifier) => resolveLocalImport(specifier, entry, root));
  return [source, ...(await Promise.all(local.map((child) => collectModuleGraph(child, root, seen)))).flat()];
}

function resolveLocalImport(specifier: string, importer: string, root: string): string[] {
  if (specifier.startsWith("@/")) return [`${resolve(root, "src", specifier.slice(2))}.ts`];
  if (specifier.startsWith(".")) return [`${resolve(dirname(importer), specifier)}.ts`];
  return [];
}

describe("provider history normalization", () => {
  it("preserves complete newest-first rows and strips unrelated provider fields", () => {
    expect(normalizeProviderHistory([{ ...mindA, senderEmail: "ignored" }, humanA])).toEqual([mindA, humanA]);
  });

  it("rejects structurally incomplete provider history", () => {
    expect(() => normalizeProviderHistory([{ ...mindA, createdAt: undefined }])).toThrow(/createdAt/i);
  });

  it("rejects provider row accessors without executing them", () => {
    let reads = 0;
    const row = { ...mindA };
    Object.defineProperty(row, "messageText", { enumerable: true, get() { reads += 1; return "hostile"; } });
    expect(() => normalizeProviderHistory([row])).toThrow(/inert|accessor/i);
    expect(reads).toBe(0);
  });

  it.each(["proxy", "custom prototype", "custom property", "sparse", "accessor"])("rejects a hostile %s outer history array", (kind) => {
    const rows: ProofHistoryRow[] = [mindA];
    let reads = 0;
    let value: unknown = rows;
    if (kind === "proxy") value = new Proxy(rows, {});
    if (kind === "custom prototype") Object.setPrototypeOf(rows, Object.create(Array.prototype));
    if (kind === "custom property") Object.defineProperty(rows, "extra", { value: true });
    if (kind === "sparse") { rows.length = 2; }
    if (kind === "accessor") Object.defineProperty(rows, "0", { get() { reads += 1; return mindA; } });
    expect(() => normalizeProviderHistory(value)).toThrow(/history array/i);
    expect(reads).toBe(0);
  });

  it("rejects send-result accessors without executing them", () => {
    let reads = 0;
    const sent = Object.defineProperty({}, "messageId", { enumerable: true, get() { reads += 1; return "hostile"; } });
    expect(() => requireSentMessageId(sent)).toThrow(/inert|accessor/i);
    expect(reads).toBe(0);
  });
});

describe("offline verifier", () => {
  it("recomputes canonical evidence and accepts only matching unanimous reviews", () => {
    const a = envelope("A");
    const b = envelope("B");
    const evidenceDigest = canonicalCombinedEvidenceDigest(a, b, trustedMindDigest, { processA: PROCESS_A_PROMPT, processB: PROCESS_B_PROMPT });
    const result = verifyOfflineProof({
      processA: a,
      processB: b,
      expectedMindDigest: trustedMindDigest,
      trustedPrompts: { processA: PROCESS_A_PROMPT, processB: PROCESS_B_PROMPT },
      reviewBundle: {
        schemaVersion: "minds-final-review-bundle-v2",
        expectedEvidenceDigest: evidenceDigest,
        expectedDispatchDigests: dispatches,
        findings: [finalFinding(0, evidenceDigest), finalFinding(1, evidenceDigest), finalFinding(2, evidenceDigest)],
      },
      recomputedRawReviewDigests: rawReviewDigests,
      generatedAt: "2026-08-27T00:30:00.000Z",
    });
    expect(result.verdict).toBe("PASS");
    expect(result.evidenceDigest).toBe(evidenceDigest);
  });

  it("returns an explicit redacted FAIL for incomplete evidence", () => {
    expect(verifyOfflineProof({
      processA: {}, processB: {}, expectedMindDigest: trustedMindDigest, trustedPrompts: { processA: PROCESS_A_PROMPT, processB: PROCESS_B_PROMPT },
      reviewBundle: {}, recomputedRawReviewDigests: [], generatedAt: "2026-08-27T00:30:00.000Z",
    })).toEqual(buildFailureResult("2026-08-27T00:30:00.000Z", "INVALID_EVIDENCE"));
  });

  it("fails when independently recomputed raw-review digests differ", () => {
    const a = envelope("A");
    const b = envelope("B");
    const evidenceDigest = canonicalCombinedEvidenceDigest(a, b, trustedMindDigest, { processA: PROCESS_A_PROMPT, processB: PROCESS_B_PROMPT });
    const result = verifyOfflineProof({
      processA: a, processB: b, expectedMindDigest: trustedMindDigest, trustedPrompts: { processA: PROCESS_A_PROMPT, processB: PROCESS_B_PROMPT },
      reviewBundle: {
        schemaVersion: "minds-final-review-bundle-v2", expectedEvidenceDigest: evidenceDigest,
        expectedDispatchDigests: dispatches,
        findings: [finalFinding(0, evidenceDigest), finalFinding(1, evidenceDigest), finalFinding(2, evidenceDigest)],
      },
      recomputedRawReviewDigests: [digest("7"), ...rawReviewDigests.slice(1)],
      generatedAt: "2026-08-27T00:30:00.000Z",
    });
    expect(result).toMatchObject({ verdict: "FAIL", reasonCodes: ["RAW_REVIEW_DIGEST_MISMATCH"] });
  });

  it("rejects an internally consistent envelope whose B outbound prompt was tampered", () => {
    const a = envelope("A");
    const b = envelope("B");
    const changedHuman = { ...humanB, messageText: "A hinted replacement prompt" };
    const changedRows = [mindB, changedHuman, ...terminalA];
    const tampered = {
      ...b,
      terminalRows: changedRows,
      terminalBoundary: boundary(changedRows),
      outbound: {
        ...b.outbound,
        rawText: changedHuman.messageText,
        contentDigest: sha256(changedHuman.messageText),
      },
    };
    expect(() => canonicalCombinedEvidenceDigest(a, tampered, trustedMindDigest, { processA: PROCESS_A_PROMPT, processB: PROCESS_B_PROMPT })).toThrow(/approved process-B prompt/i);
  });

  it("rejects hostile outer input without evaluating or echoing generatedAt", () => {
    let reads = 0;
    const hostile = {
      processA: {}, processB: {}, expectedMindDigest: trustedMindDigest, trustedPrompts: { processA: PROCESS_A_PROMPT, processB: PROCESS_B_PROMPT },
      reviewBundle: {}, recomputedRawReviewDigests: [],
      get generatedAt() { reads += 1; throw new Error("secret-hostile-value"); },
    };
    const result = verifyOfflineProof(hostile);
    expect(reads).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/secret-hostile-value/);
  });

  it("redacts raw aliases, Mind bindings, prompts, messages, and provider IDs", () => {
    const serialized = JSON.stringify(buildFailureResult("2026-08-27T00:30:00.000Z", "INVALID_EVIDENCE"));
    expect(serialized).not.toMatch(/alias|mindId|mindDigest|prompt|message|provider/i);
  });
});
