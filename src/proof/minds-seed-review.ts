import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  createPublicHandoff,
  validateProcessAEnvelope,
  validatePublicHandoff,
} from "@/proof/evidence-envelope";
import type { SeedGoPayload } from "@/proof/minds-resume-flow";

export type SeedReviewFinding = Readonly<{
  schemaVersion: 1;
  reviewerId: string;
  dispatchDigest: string;
  evidenceDigest: string;
  reviewEvidenceDigest: string;
  reviewedAt: string;
  voluntaryEngagement: boolean;
  criticalPersistenceRecall: boolean;
  supportingConcepts: readonly ("ACCESS_INDEPENDENCE" | "PRIVATE_CLOSURE")[];
  refusal: boolean;
  semanticInsufficiency: boolean;
  verdict: "PASS" | "FAIL";
}>;

export type SeedAuthorization = Readonly<{
  schemaVersion: "minds-seed-authorization-v2";
  handoffDigest: string;
  evidenceDigest: string;
  expectedDispatchDigests: readonly string[];
  findings: readonly SeedReviewFinding[];
}>;

const digestPattern = /^[a-f0-9]{64}$/;
const authorizationKeys = ["schemaVersion", "handoffDigest", "evidenceDigest", "expectedDispatchDigests", "findings"] as const;
const findingKeys = [
  "schemaVersion", "reviewerId", "dispatchDigest", "evidenceDigest",
  "reviewEvidenceDigest", "reviewedAt", "voluntaryEngagement",
  "criticalPersistenceRecall", "supportingConcepts", "refusal",
  "semanticInsufficiency", "verdict",
] as const;

function exactRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value) || Array.isArray(value)) throw new Error("Expected exact inert record");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("Expected plain record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || !actual.every((key) => typeof key === "string" && keys.includes(key))) throw new Error("Unexpected or missing field");
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) throw new Error("Accessors are not evidence");
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

function denseArray(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value) || !Array.isArray(value)) throw new Error("Expected exact array");
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("Expected plain array");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw new Error("Expected dense array");
  return Object.freeze(Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new Error("Array accessors are not evidence");
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

function normalizeFinding(value: unknown): SeedReviewFinding {
  const record = exactRecord(value, findingKeys);
  const concepts = denseArray(record.supportingConcepts);
  const allowed = new Set(["ACCESS_INDEPENDENCE", "PRIVATE_CLOSURE"]);
  if (record.schemaVersion !== 1 || typeof record.reviewerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(record.reviewerId)) throw new Error("Invalid seed reviewer");
  if (![record.dispatchDigest, record.evidenceDigest, record.reviewEvidenceDigest].every(isDigest) || !isTimestamp(record.reviewedAt)) throw new Error("Invalid seed review binding");
  if (!concepts.every((concept) => typeof concept === "string" && allowed.has(concept)) || new Set(concepts).size !== concepts.length) throw new Error("Invalid seed concepts");
  for (const key of ["voluntaryEngagement", "criticalPersistenceRecall", "refusal", "semanticInsufficiency"] as const) {
    if (typeof record[key] !== "boolean") throw new Error("Invalid seed finding boolean");
  }
  if (record.verdict !== "PASS" && record.verdict !== "FAIL") throw new Error("Invalid seed verdict");
  return Object.freeze({ ...record, supportingConcepts: concepts } as SeedReviewFinding);
}

export function validateSeedAuthorization(value: unknown, expectedHandoffDigest: string, recomputedRawReviewDigests: unknown): SeedAuthorization {
  const record = exactRecord(value, authorizationKeys);
  if (record.schemaVersion !== "minds-seed-authorization-v2" || !isDigest(expectedHandoffDigest)) throw new Error("Invalid seed authorization schema");
  if (record.handoffDigest !== expectedHandoffDigest) throw new Error("Seed authorization handoff binding mismatch");
  if (!isDigest(record.evidenceDigest)) throw new Error("Invalid seed evidence digest");
  const dispatches = denseArray(record.expectedDispatchDigests);
  const findings = denseArray(record.findings).map(normalizeFinding);
  assertPanel(dispatches, findings, record.evidenceDigest);
  assertRawDigests(findings, recomputedRawReviewDigests);
  return Object.freeze({ schemaVersion: "minds-seed-authorization-v2", handoffDigest: expectedHandoffDigest, evidenceDigest: record.evidenceDigest, expectedDispatchDigests: dispatches as string[], findings });
}

function assertPanel(dispatches: readonly unknown[], findings: readonly SeedReviewFinding[], evidenceDigest: string): void {
  if (dispatches.length !== 3 || !dispatches.every(isDigest) || new Set(dispatches).size !== 3 || findings.length !== 3) throw new Error("Seed authorization requires three dispatches and findings");
  if (new Set(findings.map((item) => item.dispatchDigest)).size !== 3) throw new Error("Seed authorization findings require distinct dispatches");
  if (new Set(findings.map((item) => item.reviewerId)).size !== 3 || new Set(findings.map((item) => item.reviewEvidenceDigest)).size !== 3) throw new Error("Seed authorization reviewers must be distinct");
  if (!findings.every((item) => dispatches.includes(item.dispatchDigest) && item.evidenceDigest === evidenceDigest)) throw new Error("Seed authorization finding binding failed");
  const passes = findings.every((item) => item.voluntaryEngagement && item.criticalPersistenceRecall && item.supportingConcepts.length > 0 && !item.refusal && !item.semanticInsufficiency && item.verdict === "PASS");
  if (!passes) throw new Error("Seed authorization failed semantic or agency gate");
}

function assertRawDigests(findings: readonly SeedReviewFinding[], value: unknown): void {
  const rawDigests = denseArray(value);
  if (rawDigests.length !== 3 || !rawDigests.every(isDigest) || new Set(rawDigests).size !== 3 || !findings.every((finding) => rawDigests.includes(finding.reviewEvidenceDigest))) {
    throw new Error("Seed authorization raw review digest mismatch");
  }
}

export function buildSeedGoReceipt(input: {
  processA: unknown;
  handoff: unknown;
  expectedMindDigest: string;
  authorization: unknown;
  authorizationDigest: string;
  recomputedRawReviewDigests: unknown;
  dispatchManifestDigest: string;
  issuedAt: string;
  trustedPrompt: string;
}): SeedGoPayload {
  const processA = validateProcessAEnvelope(input.processA, input.expectedMindDigest);
  const handoff = validatePublicHandoff(input.handoff, input.expectedMindDigest);
  if (JSON.stringify(handoff) !== JSON.stringify(createPublicHandoff(processA, input.expectedMindDigest))) throw new Error("Seed handoff does not match process A");
  const handoffDigest = sha256(JSON.stringify(handoff));
  const authorization = validateSeedAuthorization(input.authorization, handoffDigest, input.recomputedRawReviewDigests);
  if (authorization.evidenceDigest !== canonicalProcessAEvidenceDigest(processA, input.expectedMindDigest, input.trustedPrompt)) throw new Error("Seed authorization does not match process A evidence");
  if (!isDigest(input.authorizationDigest)) throw new Error("Seed authorization file digest is invalid");
  if (!isDigest(input.dispatchManifestDigest) || !isTimestamp(input.issuedAt)) throw new Error("Invalid seed dispatch receipt binding");
  return Object.freeze({ schemaVersion: "minds-seed-go-v3", handoffDigest,
    authorizationDigest: input.authorizationDigest, dispatchManifestDigest: input.dispatchManifestDigest,
    evidenceDigest: authorization.evidenceDigest, runId: handoff.runId, reviewerCount: 3, issuedAt: input.issuedAt });
}

export function canonicalProcessAEvidenceDigest(value: unknown, expectedMindDigest: string, trustedPrompt: string): string {
  const processA = validateProcessAEnvelope(value, expectedMindDigest);
  if (processA.outbound.rawText !== trustedPrompt || processA.outbound.contentDigest !== sha256(trustedPrompt)) {
    throw new Error("Process A does not bind the exact approved prompt");
  }
  return sha256(JSON.stringify(processA));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
