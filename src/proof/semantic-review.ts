import { types as utilTypes } from "node:util";

export type SupportingConcept = "ACCESS_INDEPENDENCE" | "PRIVATE_CLOSURE";

export type SemanticReviewFinding = Readonly<{
  schemaVersion: 1;
  reviewerId: string;
  // Blindness is an orchestration property proven by a pre-issued, separate
  // dispatch receipt. A reviewer label alone cannot prove an independent review.
  dispatchDigest: string;
  evidenceDigest: string;
  // SHA-256 of the ignored raw reviewer output; raw prose is never tracked here.
  reviewEvidenceDigest: string;
  reviewedAt: string;
  processBConstraintsOmitted: boolean;
  criticalPersistenceRecall: boolean;
  supportingConcepts: readonly SupportingConcept[];
  genericAgreement: boolean;
  promptEcho: boolean;
  refusal: boolean;
  staleEvidence: boolean;
  verdict: "PASS" | "FAIL";
}>;

export type SemanticReviewAggregate = {
  verdict: "PASS" | "FAIL";
  evidenceDigest?: string;
  reviewerCount: number;
  reasons: string[];
};

type TrustedInput = Readonly<{
  expectedEvidenceDigest: string;
  expectedDispatchDigests: readonly string[];
  findings: readonly SemanticReviewFinding[];
}>;

type Normalized<T> =
  | { ok: true; value: T }
  | { ok: false; reviewerCount: number; reason: string };

const aggregateKeys = [
  "expectedEvidenceDigest",
  "expectedDispatchDigests",
  "findings",
] as const;
const findingKeys = [
  "schemaVersion",
  "reviewerId",
  "dispatchDigest",
  "evidenceDigest",
  "reviewEvidenceDigest",
  "reviewedAt",
  "processBConstraintsOmitted",
  "criticalPersistenceRecall",
  "supportingConcepts",
  "genericAgreement",
  "promptEcho",
  "refusal",
  "staleEvidence",
  "verdict",
] as const;
const booleanKeys = [
  "processBConstraintsOmitted",
  "criticalPersistenceRecall",
  "genericAgreement",
  "promptEcho",
  "refusal",
  "staleEvidence",
] as const;
const digestPattern = /^[a-f0-9]{64}$/;
const reviewerPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const allowedConcepts = new Set<unknown>([
  "ACCESS_INDEPENDENCE",
  "PRIVATE_CLOSURE",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value)) return false;
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: unknown } {
  return Boolean(descriptor && Object.hasOwn(descriptor, "value"));
}

function readExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainRecord(value)) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
    PropertyKey,
    PropertyDescriptor | undefined
  >;
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.length !== expectedKeys.length) return undefined;
  if (!actualKeys.every((key) => typeof key === "string" && expectedKeys.includes(key))) {
    return undefined;
  }
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!isDataDescriptor(descriptor)) return undefined;
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function readDenseArray(value: unknown): readonly unknown[] | undefined {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value)) return undefined;
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
    PropertyKey,
    PropertyDescriptor | undefined
  >;
  const lengthDescriptor = descriptors.length;
  if (!isDataDescriptor(lengthDescriptor) || typeof lengthDescriptor.value !== "number") return undefined;
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== length + 1) return undefined;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!isDataDescriptor(descriptor)) return undefined;
    snapshot.push(descriptor.value);
  }
  return Object.freeze(snapshot);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && digestPattern.test(value);
}

function isCanonicalUtcIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function areConceptsValid(
  values: readonly unknown[],
): values is readonly SupportingConcept[] {
  return (
    new Set(values).size === values.length &&
    values.every((concept) => allowedConcepts.has(concept))
  );
}

function invalidFinding(reason = "Invalid finding"): Normalized<SemanticReviewFinding> {
  return { ok: false, reviewerCount: 0, reason };
}

function normalizeFinding(value: unknown): Normalized<SemanticReviewFinding> {
  const record = readExactRecord(value, findingKeys);
  if (!record) return invalidFinding("Findings must contain exact keys as inert own data");
  const concepts = readDenseArray(record.supportingConcepts);
  if (!concepts || !areConceptsValid(concepts)) return invalidFinding();
  if (
    record.schemaVersion !== 1 ||
    typeof record.reviewerId !== "string" ||
    !reviewerPattern.test(record.reviewerId) ||
    !isDigest(record.dispatchDigest) ||
    !isDigest(record.evidenceDigest) ||
    !isDigest(record.reviewEvidenceDigest) ||
    !isCanonicalUtcIso(record.reviewedAt) ||
    !booleanKeys.every((key) => typeof record[key] === "boolean") ||
    (record.verdict !== "PASS" && record.verdict !== "FAIL")
  ) {
    return invalidFinding();
  }
  return { ok: true, value: buildFinding(record, concepts) };
}

function buildFinding(
  record: Readonly<Record<string, unknown>>,
  supportingConcepts: readonly SupportingConcept[],
): SemanticReviewFinding {
  return Object.freeze({
    schemaVersion: 1,
    reviewerId: record.reviewerId as string,
    dispatchDigest: record.dispatchDigest as string,
    evidenceDigest: record.evidenceDigest as string,
    reviewEvidenceDigest: record.reviewEvidenceDigest as string,
    reviewedAt: record.reviewedAt as string,
    processBConstraintsOmitted: record.processBConstraintsOmitted as boolean,
    criticalPersistenceRecall: record.criticalPersistenceRecall as boolean,
    supportingConcepts,
    genericAgreement: record.genericAgreement as boolean,
    promptEcho: record.promptEcho as boolean,
    refusal: record.refusal as boolean,
    staleEvidence: record.staleEvidence as boolean,
    verdict: record.verdict as "PASS" | "FAIL",
  });
}

function normalizeFindings(value: unknown): Normalized<readonly SemanticReviewFinding[]> {
  const rawFindings = readDenseArray(value);
  if (!rawFindings) return { ok: false, reviewerCount: 0, reason: "Invalid findings list" };
  if (rawFindings.length !== 3) {
    return { ok: false, reviewerCount: rawFindings.length, reason: "Exactly 3 findings are required" };
  }
  const findings: SemanticReviewFinding[] = [];
  for (const rawFinding of rawFindings) {
    const normalized = normalizeFinding(rawFinding);
    if (!normalized.ok) return { ...normalized, reviewerCount: rawFindings.length };
    findings.push(normalized.value);
  }
  return { ok: true, value: Object.freeze(findings) };
}

function normalizeInput(value: unknown): Normalized<TrustedInput> {
  const record = readExactRecord(value, aggregateKeys);
  if (!record) return { ok: false, reviewerCount: 0, reason: "Invalid exact top-level input" };
  const dispatches = readDenseArray(record.expectedDispatchDigests);
  const findings = normalizeFindings(record.findings);
  if (!findings.ok) return findings;
  if (!isDigest(record.expectedEvidenceDigest)) {
    return { ok: false, reviewerCount: 3, reason: "Invalid expected evidence digest" };
  }
  if (!dispatches || dispatches.length !== 3 || !dispatches.every(isDigest)) {
    return { ok: false, reviewerCount: 3, reason: "Invalid expected dispatch list" };
  }
  if (new Set(dispatches).size !== 3) {
    return { ok: false, reviewerCount: 3, reason: "Invalid expected dispatch list" };
  }
  return { ok: true, value: freezeInput(record.expectedEvidenceDigest, dispatches, findings.value) };
}

function freezeInput(
  expectedEvidenceDigest: string,
  expectedDispatchDigests: readonly string[],
  findings: readonly SemanticReviewFinding[],
): TrustedInput {
  return Object.freeze({
    expectedEvidenceDigest,
    expectedDispatchDigests,
    findings,
  });
}

function objectiveFailure(finding: SemanticReviewFinding): string | undefined {
  if (!finding.processBConstraintsOmitted) return "Process-B constraints were not omitted";
  if (!finding.criticalPersistenceRecall) return "Critical persistence recall was not confirmed";
  if (finding.supportingConcepts.length === 0) return "No supporting concept was confirmed";
  if (finding.genericAgreement) return "Reply was generic agreement";
  if (finding.promptEcho) return "Reply echoed the prompt";
  if (finding.refusal) return "Reply was a refusal";
  if (finding.staleEvidence) return "Evidence was stale";
  return undefined;
}

function fail(reviewerCount: number, reason: string): SemanticReviewAggregate {
  return { verdict: "FAIL", reviewerCount, reasons: [reason] };
}

function verifyBindings(input: TrustedInput): string | undefined {
  const actualDispatches = input.findings.map((finding) => finding.dispatchDigest);
  if (new Set(actualDispatches).size !== 3) return "Findings require unique pre-issued dispatches";
  if (!actualDispatches.every((digest) => input.expectedDispatchDigests.includes(digest))) {
    return "Findings must match every pre-issued dispatch";
  }
  if (input.findings.some((finding) => finding.evidenceDigest !== input.expectedEvidenceDigest)) {
    return "Findings must match the expected evidence digest";
  }
  return undefined;
}

function verifyReviewers(findings: readonly SemanticReviewFinding[]): string | undefined {
  if (new Set(findings.map((finding) => finding.reviewerId)).size !== 3) {
    return "Reviews require distinct reviewer IDs";
  }
  if (new Set(findings.map((finding) => finding.reviewEvidenceDigest)).size !== 3) {
    return "Reviews require a unique review evidence digest";
  }
  return undefined;
}

function aggregateSnapshot(input: TrustedInput): SemanticReviewAggregate {
  const bindingsFailure = verifyBindings(input);
  if (bindingsFailure) return fail(3, bindingsFailure);
  const reviewerFailure = verifyReviewers(input.findings);
  if (reviewerFailure) return fail(3, reviewerFailure);
  const objectiveFailures = input.findings
    .map(objectiveFailure)
    .filter((reason): reason is string => Boolean(reason));
  if (objectiveFailures.length > 0) return fail(3, objectiveFailures[0]!);
  if (input.findings.some((finding) => finding.verdict === "FAIL")) {
    return fail(3, "At least one reviewer recorded dissent");
  }
  return {
    verdict: "PASS",
    evidenceDigest: input.expectedEvidenceDigest,
    reviewerCount: 3,
    reasons: [],
  };
}

export function aggregateSemanticReviews(input: unknown): SemanticReviewAggregate {
  try {
    const normalized = normalizeInput(input);
    if (!normalized.ok) return fail(normalized.reviewerCount, normalized.reason);
    return aggregateSnapshot(normalized.value);
  } catch {
    return fail(0, "Invalid semantic review input");
  }
}
