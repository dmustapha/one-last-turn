import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  buildReviewBundle,
  createDispatchManifest,
  parseRawReviewOnce,
  validateDispatchManifest,
  validateDispatchBindings,
} from "@/proof/review-artifacts";
import {
  claimProofAttempt,
  executeClaimedSend,
} from "@/proof/proof-attempt";
import {
  readEvidence,
  readEvidenceOnce,
  writeEvidence,
  writeExclusiveEvidence,
} from "../../../scripts/proof-io";

const digest = (character: string) => character.repeat(64);
const dispatches = [digest("1"), digest("2"), digest("3")];

function rawReview(index: number) {
  return {
    schemaVersion: "minds-raw-review-v2",
    stage: "FINAL",
    reviewerId: `reviewer-${index}`,
    dispatchDigest: dispatches[index],
    evidenceDigest: digest("a"),
    reviewedAt: `2026-08-27T01:00:0${index}.000Z`,
    rationale: "The reply independently recalls the required safeguards.",
    finding: {
      processBConstraintsOmitted: true,
      criticalPersistenceRecall: true,
      supportingConcepts: ["ACCESS_INDEPENDENCE"],
      genericAgreement: false,
      promptEcho: false,
      refusal: false,
      staleEvidence: false,
      verdict: "PASS",
    },
  };
}

describe("pre-issued review orchestration", () => {
  it("creates an exact immutable three-dispatch manifest and rejects regeneration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "olt-dispatch-"));
    const url = pathToFileURL(join(directory, "dispatch.json"));
    const manifest = createDispatchManifest({
      stage: "FINAL", runId: "run-1", handoffDigest: digest("b"),
      evidenceDigest: digest("a"), issuedAt: "2026-08-27T00:59:00.000Z",
      dispatchDigests: dispatches,
    });
    await writeExclusiveEvidence(url, manifest);
    await expect(writeExclusiveEvidence(url, manifest)).rejects.toThrow(/exist|exclusive/i);
    expect(validateDispatchManifest(await readEvidence(url), "FINAL")).toEqual(manifest);
  });

  it("hashes and parses each raw review from the same single-read buffer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "olt-review-once-"));
    const url = pathToFileURL(join(directory, "review.json"));
    await writeEvidence(url, rawReview(0));
    const once = await readEvidenceOnce(url);
    const parsed = parseRawReviewOnce(once, "FINAL");
    expect(parsed.finding.reviewEvidenceDigest).toBe(once.digest);
    expect(parsed.finding.dispatchDigest).toBe(dispatches[0]);
  });

  it("rejects forged parsed or digest metadata and derives both from bytes", async () => {
    const bytes = Buffer.from(JSON.stringify(rawReview(0)));
    const forged = { bytes, digest: digest("9"), parsed: rawReview(1) };
    const parsed = parseRawReviewOnce(forged, "FINAL");
    expect(parsed.dispatchDigest).toBe(dispatches[0]);
    expect(parsed.reviewEvidenceDigest).not.toBe(digest("9"));
  });

  it("derives a final bundle only from the exact pre-issued receipt set", async () => {
    const directory = await mkdtemp(join(tmpdir(), "olt-review-bundle-"));
    const reviews = await Promise.all([0, 1, 2].map(async (index) => {
      const url = pathToFileURL(join(directory, `review-${index}.json`));
      await writeEvidence(url, rawReview(index));
      return parseRawReviewOnce(await readEvidenceOnce(url), "FINAL");
    }));
    const manifest = createDispatchManifest({
      stage: "FINAL", runId: "run-1", handoffDigest: digest("b"),
      evidenceDigest: digest("a"), issuedAt: "2026-08-27T00:59:00.000Z",
      dispatchDigests: dispatches,
    });
    expect(buildReviewBundle(manifest, reviews)).toMatchObject({
      schemaVersion: "minds-final-review-bundle-v2",
      expectedEvidenceDigest: digest("a"),
      expectedDispatchDigests: dispatches,
    });
    const duplicate = [reviews[0]!, reviews[0]!, reviews[2]!];
    expect(() => buildReviewBundle(manifest, duplicate)).toThrow(/receipt set|dispatch/i);
  });

  it.each([["runId", "wrong-run"], ["handoffDigest", digest("c")]])("rejects a dispatch with wrong %s binding", (field, value) => {
    const manifest = createDispatchManifest({ stage: "FINAL", runId: "run-1", handoffDigest: digest("b"), evidenceDigest: digest("a"), issuedAt: "2026-08-27T00:59:00.000Z", dispatchDigests: dispatches });
    expect(() => validateDispatchBindings(manifest, { stage: "FINAL", runId: "run-1", handoffDigest: digest("b"), evidenceDigest: digest("a"), [field]: value })).toThrow(/binding/i);
  });
});

describe("durable one-attempt claims", () => {
  it("blocks every rerun after an ambiguous send crash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "olt-attempt-"));
    const url = pathToFileURL(join(directory, "attempt.json"));
    await claimProofAttempt(url, "A", "attempt-1", "2026-08-27T02:00:00.000Z");
    const firstSend = vi.fn().mockRejectedValue(new Error("crash after provider acceptance"));
    await expect(executeClaimedSend({
      url, phase: "A", attemptId: "attempt-1", send: firstSend,
      now: () => "2026-08-27T02:00:01.000Z",
    })).rejects.toThrow();
    const secondSend = vi.fn();
    await expect(claimProofAttempt(url, "A", "attempt-2", "2026-08-27T02:01:00.000Z")).rejects.toThrow(/exist|claimed/i);
    expect(firstSend).toHaveBeenCalledOnce();
    expect(secondSend).not.toHaveBeenCalled();
    expect(await readEvidence(url)).toMatchObject({ state: "FAIL_OR_UNKNOWN" });
  });
});
