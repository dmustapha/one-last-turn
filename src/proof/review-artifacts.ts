import { createHash, randomBytes } from "node:crypto";
import { types as utilTypes } from "node:util";

export type ReviewStage = "SEED" | "FINAL";
export type DispatchManifest = Readonly<{
  schemaVersion: "minds-review-dispatch-v2";
  stage: ReviewStage;
  runId: string;
  handoffDigest: string;
  evidenceDigest: string;
  issuedAt: string;
  dispatchDigests: readonly string[];
}>;

type ParsedRawReview = Readonly<{
  stage: ReviewStage;
  reviewerId: string;
  dispatchDigest: string;
  evidenceDigest: string;
  reviewEvidenceDigest: string;
  reviewedAt: string;
  rationale: string;
  finding: Readonly<Record<string, unknown>>;
}>;

const digestPattern = /^[a-f0-9]{64}$/;
const manifestKeys = ["schemaVersion", "stage", "runId", "handoffDigest", "evidenceDigest", "issuedAt", "dispatchDigests"] as const;
const rawKeys = ["schemaVersion", "stage", "reviewerId", "dispatchDigest", "evidenceDigest", "reviewedAt", "rationale", "finding"] as const;
const finalKeys = ["processBConstraintsOmitted", "criticalPersistenceRecall", "supportingConcepts", "genericAgreement", "promptEcho", "refusal", "staleEvidence", "verdict"] as const;
const seedKeys = ["voluntaryEngagement", "criticalPersistenceRecall", "supportingConcepts", "refusal", "semanticInsufficiency", "verdict"] as const;

function exactRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value) || Array.isArray(value)) throw new Error("Expected exact inert record");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("Expected plain record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || !actual.every((key) => typeof key === "string" && keys.includes(key))) throw new Error("Unexpected or missing review field");
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) throw new Error("Review accessors are invalid");
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

function denseArray(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value) || !Array.isArray(value)) throw new Error("Expected exact array");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(descriptors).length !== value.length + 1) throw new Error("Invalid review array");
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

export function randomDispatchDigests(): readonly string[] {
  return Object.freeze([0, 1, 2].map(() => randomBytes(32).toString("hex")));
}

export function createDispatchManifest(input: Omit<DispatchManifest, "schemaVersion">): DispatchManifest {
  return validateDispatchManifest({ schemaVersion: "minds-review-dispatch-v2", ...input }, input.stage);
}

export function validateDispatchManifest(value: unknown, expectedStage: ReviewStage): DispatchManifest {
  const record = exactRecord(value, manifestKeys);
  const dispatches = denseArray(record.dispatchDigests);
  if (record.schemaVersion !== "minds-review-dispatch-v2" || record.stage !== expectedStage) throw new Error("Invalid dispatch manifest schema");
  if (typeof record.runId !== "string" || record.runId.trim() === "" || !isDigest(record.handoffDigest) || !isDigest(record.evidenceDigest) || !isTimestamp(record.issuedAt)) throw new Error("Invalid dispatch manifest binding");
  if (dispatches.length !== 3 || !dispatches.every(isDigest) || new Set(dispatches).size !== 3) throw new Error("Dispatch manifest requires three unique receipts");
  return Object.freeze({ schemaVersion: "minds-review-dispatch-v2", stage: expectedStage, runId: record.runId, handoffDigest: record.handoffDigest, evidenceDigest: record.evidenceDigest, issuedAt: record.issuedAt, dispatchDigests: dispatches as string[] });
}

export function validateDispatchBindings(value: unknown, expected: {
  stage: ReviewStage; runId: string; handoffDigest: string; evidenceDigest: string;
}): DispatchManifest {
  const manifest = validateDispatchManifest(value, expected.stage);
  if (manifest.runId !== expected.runId || manifest.handoffDigest !== expected.handoffDigest || manifest.evidenceDigest !== expected.evidenceDigest) throw new Error("Dispatch manifest proof binding mismatch");
  return manifest;
}

export function parseRawReviewOnce(
  once: Readonly<{ bytes: Uint8Array; digest: string; parsed: unknown }>,
  expectedStage: ReviewStage,
): ParsedRawReview {
  if (!(once.bytes instanceof Uint8Array) || once.bytes.byteLength === 0) throw new Error("Invalid raw review read");
  const bytes = Buffer.from(once.bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  const record = exactRecord(parsed, rawKeys);
  if (record.schemaVersion !== "minds-raw-review-v2" || record.stage !== expectedStage) throw new Error("Invalid raw review schema");
  if (typeof record.reviewerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(record.reviewerId)) throw new Error("Invalid reviewer ID");
  if (!isDigest(record.dispatchDigest) || !isDigest(record.evidenceDigest) || !isTimestamp(record.reviewedAt)) throw new Error("Invalid raw review binding");
  if (typeof record.rationale !== "string" || record.rationale.trim() === "" || record.rationale.length > 4_000) throw new Error("Invalid review rationale");
  const rawFinding = normalizeFinding(record.finding, expectedStage);
  const finding = Object.freeze({
    schemaVersion: 1, reviewerId: record.reviewerId,
    dispatchDigest: record.dispatchDigest, evidenceDigest: record.evidenceDigest,
    reviewEvidenceDigest: digest, reviewedAt: record.reviewedAt,
    ...rawFinding,
  });
  return Object.freeze({ stage: expectedStage, reviewerId: record.reviewerId, dispatchDigest: record.dispatchDigest, evidenceDigest: record.evidenceDigest, reviewEvidenceDigest: digest, reviewedAt: record.reviewedAt, rationale: record.rationale, finding });
}

function normalizeFinding(value: unknown, stage: ReviewStage): Readonly<Record<string, unknown>> {
  const record = exactRecord(value, stage === "FINAL" ? finalKeys : seedKeys);
  const concepts = denseArray(record.supportingConcepts);
  if (!concepts.every((item) => typeof item === "string" && ["ACCESS_INDEPENDENCE", "PRIVATE_CLOSURE"].includes(item)) || new Set(concepts).size !== concepts.length) throw new Error("Invalid review concepts");
  const booleanKeys = stage === "FINAL"
    ? ["processBConstraintsOmitted", "criticalPersistenceRecall", "genericAgreement", "promptEcho", "refusal", "staleEvidence"]
    : ["voluntaryEngagement", "criticalPersistenceRecall", "refusal", "semanticInsufficiency"];
  if (!booleanKeys.every((key) => typeof record[key] === "boolean") || (record.verdict !== "PASS" && record.verdict !== "FAIL")) throw new Error("Invalid review finding");
  return Object.freeze({ ...record, supportingConcepts: concepts });
}

export function buildReviewBundle(manifestValue: unknown, reviews: readonly ParsedRawReview[]) {
  const manifest = validateDispatchManifest(manifestValue, "FINAL");
  assertReceiptSet(manifest, reviews);
  const findings = reviews.map((review) => review.finding);
  return Object.freeze({ schemaVersion: "minds-final-review-bundle-v2", expectedEvidenceDigest: manifest.evidenceDigest, expectedDispatchDigests: manifest.dispatchDigests, findings: Object.freeze(findings) });
}

export function buildSeedAuthorization(manifestValue: unknown, reviews: readonly ParsedRawReview[]) {
  const manifest = validateDispatchManifest(manifestValue, "SEED");
  assertReceiptSet(manifest, reviews);
  const findings = reviews.map((review) => review.finding);
  return Object.freeze({ schemaVersion: "minds-seed-authorization-v2", handoffDigest: manifest.handoffDigest, evidenceDigest: manifest.evidenceDigest, expectedDispatchDigests: manifest.dispatchDigests, findings: Object.freeze(findings) });
}

function assertReceiptSet(manifest: DispatchManifest, reviews: readonly ParsedRawReview[]): void {
  const dispatches = reviews.map((review) => review.dispatchDigest);
  if (reviews.length !== 3 || new Set(dispatches).size !== 3 || !manifest.dispatchDigests.every((digest) => dispatches.includes(digest))) throw new Error("Raw reviews do not match the exact pre-issued receipt set");
  if (new Set(reviews.map((review) => review.reviewerId)).size !== 3 || new Set(reviews.map((review) => review.reviewEvidenceDigest)).size !== 3) throw new Error("Raw reviews must be independently distinct");
  if (!reviews.every((review) => review.stage === manifest.stage && review.evidenceDigest === manifest.evidenceDigest)) throw new Error("Raw review evidence binding mismatch");
}
