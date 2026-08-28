import { createHmac, timingSafeEqual } from "node:crypto";
import { types as utilTypes } from "node:util";

export type SeedGoPayload = Readonly<{
  schemaVersion: "minds-seed-go-v3"; handoffDigest: string; authorizationDigest: string;
  dispatchManifestDigest: string; evidenceDigest: string; runId: string;
  reviewerCount: 3; issuedAt: string;
}>;
export type SeedGoReceipt = SeedGoPayload & Readonly<{ signature: string }>;
const payloadKeys = ["schemaVersion", "handoffDigest", "authorizationDigest", "dispatchManifestDigest", "evidenceDigest", "runId", "reviewerCount", "issuedAt"] as const;
const receiptKeys = [...payloadKeys, "signature"] as const;
const digestPattern = /^[a-f0-9]{64}$/;

export function signSeedGoReceipt(payload: SeedGoPayload, key: Uint8Array): SeedGoReceipt {
  const normalized = normalizePayload(payload);
  return Object.freeze({ ...normalized, signature: signature(normalized, key) });
}

export function validateSeedGoReceipt(value: unknown, expectedHandoffDigest: string, key: Uint8Array): SeedGoReceipt {
  const record = exactRecord(value, receiptKeys);
  const payload = normalizePayload(Object.fromEntries(payloadKeys.map((key) => [key, record[key]])));
  if (payload.handoffDigest !== expectedHandoffDigest) throw new Error("Seed GO receipt handoff mismatch");
  if (typeof record.signature !== "string" || !digestPattern.test(record.signature)) throw new Error("Invalid seed GO signature");
  const expected = Buffer.from(signature(payload, key), "hex");
  const actual = Buffer.from(record.signature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Seed GO signature mismatch");
  return Object.freeze({ ...payload, signature: record.signature });
}

export function parseSeedSigningKey(value: unknown): Uint8Array {
  const record = exactRecord(value, ["schemaVersion", "key"]);
  if (record.schemaVersion !== "minds-seed-signing-key-v1" || typeof record.key !== "string" || !digestPattern.test(record.key)) throw new Error("Invalid seed signing key");
  return Buffer.from(record.key, "hex");
}

function normalizePayload(value: unknown): SeedGoPayload {
  const record = exactRecord(value, payloadKeys);
  if (record.schemaVersion !== "minds-seed-go-v3" || record.reviewerCount !== 3) throw new Error("Invalid seed GO schema");
  for (const key of ["handoffDigest", "authorizationDigest", "dispatchManifestDigest", "evidenceDigest"] as const) if (typeof record[key] !== "string" || !digestPattern.test(record[key])) throw new Error("Invalid seed GO digest");
  if (typeof record.runId !== "string" || record.runId.trim() === "" || typeof record.issuedAt !== "string" || !Number.isFinite(Date.parse(record.issuedAt)) || new Date(Date.parse(record.issuedAt)).toISOString() !== record.issuedAt) throw new Error("Invalid seed GO binding");
  return Object.freeze(record as SeedGoPayload);
}

function exactRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value) || Array.isArray(value)) throw new Error("Invalid inert seed receipt");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("Invalid seed receipt prototype");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || !actual.every((key) => typeof key === "string" && keys.includes(key))) throw new Error("Invalid seed receipt fields");
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) { const descriptor = descriptors[key]; if (!descriptor || !("value" in descriptor)) throw new Error("Seed receipt accessors are invalid"); result[key] = descriptor.value; }
  return result;
}

function signature(payload: SeedGoPayload, key: Uint8Array): string {
  if (key.byteLength !== 32) throw new Error("Invalid seed signing key length");
  return createHmac("sha256", key).update(JSON.stringify(payload)).digest("hex");
}
