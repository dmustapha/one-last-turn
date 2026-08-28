import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  mindsHandoffUrl,
  mindsProcessAUrl,
  mindsProcessBUrl,
  readEvidence,
  readSecureTextOnce,
  writeEvidence,
} from "../../../scripts/proof-shared";
import {
  createPublicHandoff,
  validateEnvelopePair,
  validateProcessAEnvelope,
  validateProcessBEnvelope,
  validatePublicHandoff,
} from "@/proof/evidence-envelope";

const digest = (character: string) => character.repeat(64);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const trustedMindDigest = digest("c");

const humanOld = {
  messageId: "human-old",
  senderType: 1,
  createdAt: "2026-08-26T23:59:58.000Z",
  messageText: "Earlier review",
  fingerprint: "fp-human-old",
};
const mindOld = {
  messageId: "mind-old",
  senderType: 0,
  createdAt: "2026-08-26T23:59:59.000Z",
  messageText: "Earlier response",
  fingerprint: "fp-mind-old",
};
const humanA = {
  messageId: "human-a",
  senderType: 1,
  createdAt: "2026-08-27T00:00:01.000Z",
  messageText: "Synthetic process-A constraints",
  fingerprint: "fp-human-a",
};
const mindA = {
  messageId: "mind-a",
  senderType: 0,
  createdAt: "2026-08-27T00:00:03.000Z",
  messageText: "Natural process-A response",
  fingerprint: "fp-mind-a",
};
const initialRows = [mindOld, humanOld];
const terminalRows = [mindA, humanA, ...initialRows];

const historyDigest = (rows: typeof initialRows) => sha256(JSON.stringify(rows));
const makeBoundary = (rows: typeof initialRows) => ({
  digest: historyDigest(rows),
  rowCount: rows.length,
  messageIds: rows.map((row) => row.messageId),
  contentDigests: rows.map((row) => sha256(row.messageText)),
});

const initialBoundary = makeBoundary(initialRows);
const terminalBoundary = makeBoundary(terminalRows);

const processA = {
  schemaVersion: "minds-process-a-v2",
  phase: "A",
  runId: "run-2026-08-27-a",
  processNonce: digest("a"),
  pid: 4101,
  sdkVersion: "0.1.4",
  alias: "proof-run-private-alias",
  aliasDigest: sha256("proof-run-private-alias"),
  mindDigest: trustedMindDigest,
  startedAt: "2026-08-27T00:00:00.000Z",
  completedAt: "2026-08-27T00:00:04.000Z",
  initialBoundary,
  terminalBoundary,
  initialRows,
  terminalRows,
  outbound: {
    messageId: "human-a",
    rawText: humanA.messageText,
    contentDigest: sha256(humanA.messageText),
    sentAt: "2026-08-27T00:00:01.000Z",
  },
  reply: {
    messageId: "mind-a",
    rawText: mindA.messageText,
    contentDigest: sha256(mindA.messageText),
    receivedAt: "2026-08-27T00:00:03.000Z",
  },
  cognition: {
    before: 100,
    beforeObservedAt: "2026-08-27T00:00:00.500Z",
    after: 95,
    afterObservedAt: "2026-08-27T00:00:03.500Z",
  },
};

const humanB = {
  messageId: "human-b",
  senderType: 1,
  createdAt: "2026-08-27T00:01:01.000Z",
  messageText: "Neutral process-B copy question",
  fingerprint: "fp-human-b",
};
const mindB = {
  messageId: "mind-b",
  senderType: 0,
  createdAt: "2026-08-27T00:01:03.000Z",
  messageText: "Natural process-B recall",
  fingerprint: "fp-mind-b",
};
const processBTerminalRows = [mindB, humanB, ...terminalRows];

const processB = {
  ...processA,
  schemaVersion: "minds-process-b-v2",
  phase: "B",
  seedGoDigest: digest("f"),
  processNonce: digest("d"),
  pid: 4102,
  startedAt: "2026-08-27T00:01:00.000Z",
  completedAt: "2026-08-27T00:01:04.000Z",
  initialBoundary: terminalBoundary,
  terminalBoundary: makeBoundary(processBTerminalRows),
  initialRows: terminalRows,
  terminalRows: processBTerminalRows,
  outbound: {
    messageId: "human-b",
    rawText: humanB.messageText,
    contentDigest: sha256(humanB.messageText),
    sentAt: "2026-08-27T00:01:01.000Z",
  },
  reply: {
    messageId: "mind-b",
    rawText: mindB.messageText,
    contentDigest: sha256(mindB.messageText),
    receivedAt: "2026-08-27T00:01:03.000Z",
  },
  cognition: {
    before: 95,
    beforeObservedAt: "2026-08-27T00:01:00.500Z",
    after: 90,
    afterObservedAt: "2026-08-27T00:01:03.500Z",
  },
};

describe("versioned evidence envelopes", () => {
  it("accepts an exact process-A/process-B pair", () => {
    expect(validateEnvelopePair(processA, processB, trustedMindDigest)).toEqual({
      processA: validateProcessAEnvelope(processA, trustedMindDigest),
      processB: validateProcessBEnvelope(processB, trustedMindDigest),
    });
  });

  it.each([
    ["cross-run", { runId: "other-run" }, /run ID/i],
    ["same PID", { pid: processA.pid }, /PID/i],
    ["same nonce", { processNonce: processA.processNonce }, /nonce/i],
    ["alias mismatch", { aliasDigest: digest("e") }, /alias/i],
    ["Mind mismatch", { mindDigest: digest("e") }, /Mind/i],
    [
      "boundary mismatch",
      { initialBoundary: { ...terminalBoundary, digest: digest("e") } },
      /boundary/i,
    ],
  ])("rejects %s envelopes", (_label, override, error) => {
    expect(() => validateEnvelopePair(processA, { ...processB, ...override }, trustedMindDigest)).toThrow(
      error,
    );
  });

  it.each([
    ["missing SDK version", { sdkVersion: undefined }, /sdkVersion/i],
    ["missing timestamp", { completedAt: undefined }, /completedAt/i],
    [
      "missing message ID",
      { outbound: { ...processA.outbound, messageId: "" } },
      /messageId/i,
    ],
    ["extra self-authored status", { passed: true }, /unexpected field/i],
  ])("rejects %s", (_label, override, error) => {
    const candidate: Record<string, unknown> = { ...processA, ...override };
    if (Object.hasOwn(override, "sdkVersion") && candidate.sdkVersion === undefined) {
      delete candidate.sdkVersion;
    }
    if (Object.hasOwn(override, "completedAt") && candidate.completedAt === undefined) {
      delete candidate.completedAt;
    }
    expect(() => validateProcessAEnvelope(candidate, trustedMindDigest)).toThrow(error);
  });

  it("rejects non-canonical timestamps and malformed digests", () => {
    expect(() =>
      validateProcessAEnvelope({ ...processA, completedAt: "2026-08-27T00:00:04Z" }, trustedMindDigest),
    ).toThrow(/canonical UTC/i);
    expect(() => validateProcessAEnvelope({ ...processA, mindDigest: "secret-id" }, trustedMindDigest)).toThrow(
      /mindDigest/i,
    );
  });

  it("creates an exact public handoff with no process or content material", () => {
    const handoff = createPublicHandoff(processA, trustedMindDigest);
    expect(handoff).toEqual({
      schemaVersion: "minds-public-handoff-v2",
      runId: processA.runId,
      alias: processA.alias,
      mindDigest: processA.mindDigest,
      boundary: {
        rowCount: processA.terminalBoundary.rowCount,
        digest: processA.terminalBoundary.digest,
        latestFingerprint: processA.terminalRows[0]!.fingerprint,
      },
    });
    expect(JSON.stringify(handoff)).not.toMatch(/nonce|pid|sdk|cognition|outbound|reply|text|constraint/i);
    expect(validatePublicHandoff(handoff, trustedMindDigest)).toEqual(handoff);
  });

  it.each([
    ["raw text", { prompt: "private constraints" }],
    ["status", { passed: true }],
    ["process metadata", { pid: 4101 }],
  ])("rejects public handoff leakage: %s", (_label, extra) => {
    const handoff = { ...createPublicHandoff(processA, trustedMindDigest), ...extra };
    expect(() => validatePublicHandoff(handoff, trustedMindDigest)).toThrow(/unexpected field/i);
  });

  it("rejects raw evidence whose digests do not bind its alias, rows, or messages", () => {
    expect(() => validateProcessAEnvelope({ ...processA, alias: "different-alias" }, trustedMindDigest)).toThrow(/alias/i);
    expect(() => validateProcessAEnvelope({ ...processA, initialRows: [{ ...mindOld, messageText: "changed" }, humanOld] }, trustedMindDigest)).toThrow(/initial/i);
    expect(() => validateProcessAEnvelope({ ...processA, outbound: { ...processA.outbound, rawText: "changed" } }, trustedMindDigest)).toThrow(/outbound/i);
  });

  it("rejects a mutated raw initial-history suffix even when its boundary is recomputed", () => {
    const mutatedRows = [mindA, humanA, mindOld, { ...humanOld, fingerprint: "mutated" }];
    expect(() => validateProcessAEnvelope({
      ...processA,
      terminalRows: mutatedRows,
      terminalBoundary: makeBoundary(mutatedRows),
    }, trustedMindDigest)).toThrow(/exact extension/i);
  });

  it("rejects histories whose raw row length does not equal the boundary", () => {
    expect(() => validateProcessAEnvelope({ ...processA, initialRows: [mindOld] }, trustedMindDigest)).toThrow(/rowCount/i);
  });

  it("requires a seed-GO file digest only on process B", () => {
    const missing = { ...processB } as Record<string, unknown>;
    delete missing.seedGoDigest;
    expect(() => validateProcessBEnvelope(missing, trustedMindDigest)).toThrow(/seedGoDigest/i);
    expect(() => validateProcessAEnvelope({ ...processA, seedGoDigest: digest("f") }, trustedMindDigest)).toThrow(/unexpected field/i);
  });

  it.each([
    ["reply role", [{ ...mindA, senderType: 1 }, humanA, ...initialRows], /Mind sender/i],
    ["outbound role", [mindA, { ...humanA, senderType: 0 }, ...initialRows], /human sender/i],
    ["reply timestamp", [{ ...mindA, createdAt: "2026-08-27T00:00:02.000Z" }, humanA, ...initialRows], /reply.*timestamp/i],
    ["outbound timestamp", [mindA, { ...humanA, createdAt: "2026-08-27T00:00:00.750Z" }, ...initialRows], /outbound.*timestamp/i],
  ])("rejects unbound terminal %s", (_label, rows, error) => {
    expect(() => validateProcessAEnvelope({
      ...processA,
      terminalRows: rows,
      terminalBoundary: makeBoundary(rows),
    }, trustedMindDigest)).toThrow(error);
  });

  it.each([
    ["empty outbound", { outbound: { ...processA.outbound, rawText: "" } }, /outbound.*non-empty/i],
    ["empty reply", { reply: { ...processA.reply, rawText: "" } }, /reply.*non-empty/i],
  ])("rejects %s raw text", (_label, override, error) => {
    expect(() => validateProcessAEnvelope({ ...processA, ...override }, trustedMindDigest)).toThrow(error);
  });

  it("rejects a process-B start before process A completed", () => {
    expect(() => validateEnvelopePair(processA, {
      ...processB,
      startedAt: "2026-08-27T00:00:03.500Z",
      cognition: { ...processB.cognition, beforeObservedAt: "2026-08-27T00:00:03.750Z" },
    }, trustedMindDigest)).toThrow(/completed.*started/i);
  });

  it.each([
    ["before cognition after outbound", { beforeObservedAt: processA.outbound.sentAt }, /before.*outbound/i],
    ["after cognition before reply", { afterObservedAt: processA.reply.receivedAt }, /after.*reply/i],
  ])("rejects %s", (_label, cognitionOverride, error) => {
    expect(() => validateProcessAEnvelope({
      ...processA,
      cognition: { ...processA.cognition, ...cognitionOverride },
    }, trustedMindDigest)).toThrow(error);
  });

  it("rejects matching self-authored Mind digests without the trusted binding", () => {
    const attackerDigest = digest("e");
    expect(() => validateEnvelopePair(
      { ...processA, mindDigest: attackerDigest },
      { ...processB, mindDigest: attackerDigest },
      trustedMindDigest,
    )).toThrow(/trusted Mind digest/i);
  });
});

describe("atomic evidence writes", () => {
  it("atomically replaces evidence with owner-only mode", async () => {
    const directory = await mkdtemp(join(tmpdir(), "one-last-turn-evidence-"));
    await chmod(directory, 0o755);
    const url = pathToFileURL(join(directory, "result.json"));

    await writeEvidence(url, { version: 1 });
    await writeEvidence(url, { version: 2 });

    expect(JSON.parse(await readFile(url, "utf8"))).toEqual({ version: 2 });
    expect((await stat(url)).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect(await readdir(directory)).toEqual(["result.json"]);
  });

  it("keeps process A, process B, and handoff at distinct paths", async () => {
    expect(new Set([mindsProcessAUrl.href, mindsProcessBUrl.href, mindsHandoffUrl.href]).size).toBe(3);
    const directory = await mkdtemp(join(tmpdir(), "one-last-turn-separate-"));
    const aUrl = pathToFileURL(join(directory, "a.json"));
    const bUrl = pathToFileURL(join(directory, "b.json"));
    await writeEvidence(aUrl, { phase: "A" });
    await writeEvidence(bUrl, { phase: "B" });
    expect(await readEvidence(aUrl)).toEqual({ phase: "A" });
    expect(await readEvidence(bUrl)).toEqual({ phase: "B" });
  });

  it("rejects writes through a symlink evidence directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "one-last-turn-write-dir-link-"));
    const realDirectory = join(root, "real");
    const linkedDirectory = join(root, "linked");
    await mkdir(realDirectory, { mode: 0o700 });
    await symlink(realDirectory, linkedDirectory);
    await expect(writeEvidence(pathToFileURL(join(linkedDirectory, "evidence.json")), {})).rejects.toThrow(/directory/i);
  });
});

describe("secure evidence reads", () => {
  it("reads an owner-only prompt exactly once with its byte digest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "one-last-turn-prompt-"));
    await chmod(directory, 0o700);
    const url = pathToFileURL(join(directory, "prompt.txt"));
    await writeFile(url, "fixture prompt", { mode: 0o600 });
    const result = await readSecureTextOnce(url);
    expect(result.text).toBe("fixture prompt");
    expect(result.digest).toBe(sha256("fixture prompt"));
  });

  it("rejects unsafe or symbolic prompt files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "one-last-turn-prompt-unsafe-"));
    await chmod(directory, 0o700);
    const unsafe = join(directory, "unsafe.txt");
    const link = join(directory, "link.txt");
    await writeFile(unsafe, "fixture prompt", { mode: 0o644 });
    await symlink(unsafe, link);
    await expect(readSecureTextOnce(pathToFileURL(unsafe))).rejects.toThrow(/0600/i);
    await expect(readSecureTextOnce(pathToFileURL(link))).rejects.toThrow(/symbolic|regular/i);
  });

  it("rejects evidence inside a non-0700 directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "one-last-turn-read-dir-mode-"));
    const url = pathToFileURL(join(directory, "evidence.json"));
    await writeFile(url, "{}\n", { mode: 0o600 });
    await chmod(directory, 0o755);
    await expect(readEvidence(url)).rejects.toThrow(/0700/i);
  });

  it("rejects a mode-0644 evidence file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "one-last-turn-read-mode-"));
    const url = pathToFileURL(join(directory, "evidence.json"));
    await writeFile(url, "{}\n", { mode: 0o644 });
    await expect(readEvidence(url)).rejects.toThrow(/0600/i);
  });

  it("rejects a symlink evidence file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "one-last-turn-read-link-"));
    const target = join(directory, "target.json");
    const link = join(directory, "link.json");
    await writeFile(target, "{}\n", { mode: 0o600 });
    await symlink(target, link);
    await expect(readEvidence(pathToFileURL(link))).rejects.toThrow(/regular.*0600|symbolic/i);
  });

  it("rejects an evidence file through a symlink directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "one-last-turn-read-dir-link-"));
    const realDirectory = join(root, "real");
    const linkedDirectory = join(root, "linked");
    await mkdir(realDirectory, { mode: 0o700 });
    await writeFile(join(realDirectory, "evidence.json"), "{}\n", { mode: 0o600 });
    await symlink(realDirectory, linkedDirectory);
    await expect(readEvidence(pathToFileURL(join(linkedDirectory, "evidence.json")))).rejects.toThrow(/directory/i);
  });
});
