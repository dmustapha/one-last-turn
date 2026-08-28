import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { validateEnvelopePair } from "@/proof/evidence-envelope";
import { aggregateSemanticReviews } from "@/proof/semantic-review";

const digestPattern = /^[a-f0-9]{64}$/;
const bundleKeys = ["schemaVersion", "expectedEvidenceDigest", "expectedDispatchDigests", "findings"] as const;
const findingKeys = [
  "schemaVersion", "reviewerId", "dispatchDigest", "evidenceDigest", "reviewEvidenceDigest", "reviewedAt",
  "processBConstraintsOmitted", "criticalPersistenceRecall", "supportingConcepts", "genericAgreement", "promptEcho",
  "refusal", "staleEvidence", "verdict",
] as const;
const verifierInputKeys = ["processA", "processB", "expectedMindDigest", "trustedPrompts", "reviewBundle", "recomputedRawReviewDigests", "generatedAt"] as const;
const SAFE_FAILURE_TIME = "1970-01-01T00:00:00.000Z";

type FailureCode = "INVALID_EVIDENCE" | "REVIEW_BINDING_FAILED" | "SEMANTIC_REVIEW_FAILED" | "RAW_REVIEW_DIGEST_MISMATCH";
export type ProofResult = Readonly<{
  schemaVersion: "minds-proof-result-v2";
  generatedAt: string;
  verdict: "PASS" | "FAIL";
  evidenceDigest?: string;
  reviewerCount: number;
  checks: Readonly<{ provenance: boolean; semanticReview: boolean; rawReviewBindings: boolean }>;
  reasonCodes: readonly FailureCode[];
}>;

function exactRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value) || Array.isArray(value)) throw new Error("Expected exact record");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("Expected plain record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || !actual.every((key) => typeof key === "string" && keys.includes(key))) throw new Error("Unexpected bundle fields");
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) throw new Error("Bundle accessors are invalid");
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function denseArray(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value) || !Array.isArray(value)) throw new Error("Expected exact array");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(descriptors).length !== value.length + 1) throw new Error("Invalid array shape");
  return Object.freeze(Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new Error("Array accessors are invalid");
    return descriptor.value;
  }));
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && digestPattern.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
  return new Date(Date.parse(value)).toISOString() === value;
}

export function canonicalCombinedEvidenceDigest(processA: unknown, processB: unknown, expectedMindDigest: string, prompts: { processA: string; processB: string }): string {
  const pair = validateEnvelopePair(processA, processB, expectedMindDigest);
  assertApprovedPrompt(pair.processA, prompts.processA, "A");
  assertApprovedPrompt(pair.processB, prompts.processB, "B");
  return sha256(JSON.stringify(pair));
}

function assertApprovedPrompt(envelope: { outbound: { rawText: string; contentDigest: string } }, prompt: string, phase: string): void {
  if (envelope.outbound.rawText !== prompt || envelope.outbound.contentDigest !== sha256(prompt)) {
    throw new Error(`Envelope does not bind the exact approved process-${phase} prompt`);
  }
}

export function buildFailureResult(generatedAt: string, code: FailureCode): ProofResult {
  return Object.freeze({ schemaVersion: "minds-proof-result-v2", generatedAt, verdict: "FAIL", reviewerCount: 0, checks: Object.freeze({ provenance: false, semanticReview: false, rawReviewBindings: false }), reasonCodes: Object.freeze([code]) });
}

export function verifyOfflineProof(value: unknown): ProofResult {
  let input: Readonly<Record<string, unknown>>;
  try { input = exactRecord(value, verifierInputKeys); }
  catch { return buildFailureResult(SAFE_FAILURE_TIME, "INVALID_EVIDENCE"); }
  if (!isTimestamp(input.generatedAt)) return buildFailureResult(SAFE_FAILURE_TIME, "INVALID_EVIDENCE");
  const generatedAt = input.generatedAt;
  if (typeof input.expectedMindDigest !== "string") return buildFailureResult(generatedAt, "INVALID_EVIDENCE");
  let evidenceDigest: string;
  try { evidenceDigest = canonicalCombinedEvidenceDigest(input.processA, input.processB, input.expectedMindDigest, exactPrompts(input.trustedPrompts)); } catch { return buildFailureResult(generatedAt, "INVALID_EVIDENCE"); }
  let bundle: ReturnType<typeof normalizeBundle>;
  try { bundle = normalizeBundle(input.reviewBundle); } catch { return failureWithDigest(generatedAt, evidenceDigest, "REVIEW_BINDING_FAILED"); }
  if (bundle.expectedEvidenceDigest !== evidenceDigest) return failureWithDigest(generatedAt, evidenceDigest, "REVIEW_BINDING_FAILED");
  const aggregate = aggregateSemanticReviews({ expectedEvidenceDigest: evidenceDigest, expectedDispatchDigests: bundle.expectedDispatchDigests, findings: bundle.findings });
  if (aggregate.verdict !== "PASS") return failureWithDigest(generatedAt, evidenceDigest, "SEMANTIC_REVIEW_FAILED", aggregate.reviewerCount);
  if (!rawDigestsMatch(bundle.findings, input.recomputedRawReviewDigests)) return failureWithDigest(generatedAt, evidenceDigest, "RAW_REVIEW_DIGEST_MISMATCH", 3);
  return Object.freeze({ schemaVersion: "minds-proof-result-v2", generatedAt, verdict: "PASS", evidenceDigest, reviewerCount: 3, checks: Object.freeze({ provenance: true, semanticReview: true, rawReviewBindings: true }), reasonCodes: Object.freeze([]) });
}

function normalizeBundle(value: unknown) {
  const record = exactRecord(value, bundleKeys);
  if (record.schemaVersion !== "minds-final-review-bundle-v2" || !isDigest(record.expectedEvidenceDigest)) throw new Error("Invalid final bundle");
  return Object.freeze({ expectedEvidenceDigest: record.expectedEvidenceDigest, expectedDispatchDigests: denseArray(record.expectedDispatchDigests), findings: denseArray(record.findings) });
}

function exactPrompts(value: unknown): { processA: string; processB: string } {
  const record = exactRecord(value, ["processA", "processB"]);
  if (typeof record.processA !== "string" || !record.processA || typeof record.processB !== "string" || !record.processB) throw new Error("Invalid trusted prompts");
  return { processA: record.processA, processB: record.processB };
}

function rawDigestsMatch(findings: readonly unknown[], rawDigests: unknown): boolean {
  try {
    const recomputed = denseArray(rawDigests);
    if (recomputed.length !== 3 || !recomputed.every(isDigest) || new Set(recomputed).size !== 3) return false;
    const recorded = findings.map((finding) => exactRecord(finding, findingKeys).reviewEvidenceDigest);
    return recorded.every((digest) => typeof digest === "string" && recomputed.includes(digest));
  } catch { return false; }
}

function failureWithDigest(generatedAt: string, evidenceDigest: string, code: FailureCode, reviewerCount = 0): ProofResult {
  return Object.freeze({ schemaVersion: "minds-proof-result-v2", generatedAt, verdict: "FAIL", evidenceDigest, reviewerCount, checks: Object.freeze({ provenance: true, semanticReview: false, rawReviewBindings: false }), reasonCodes: Object.freeze([code]) });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
