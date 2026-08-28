// File: src/evidence/live-manifest.ts
import { z } from "zod";
import { MINDS_SDK_VERSION } from "../infrastructure/minds/history";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const processSchema = z.object({
  executionClass: z.literal("live_sdk"), logicalSendCount: z.literal(1),
  wireAttemptCount: z.literal("sdk_managed_unknown"), processInstanceId: z.string().uuid(),
  processStartedAt: z.string().datetime({ offset: false }),
  processNonce: z.string().uuid(), startedAt: z.string().datetime({ offset: false }),
  completedAt: z.string().datetime({ offset: false }), latencyMs: z.number().int().nonnegative(),
  aliasDigest: digest, mindDigest: digest, beforeBoundaryDigest: digest,
  afterBoundaryDigest: digest, artifactDigest: digest,
  sendResolution: z.enum(["acknowledged", "history_recovered"]),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.completedAt) - Date.parse(value.startedAt) !== value.latencyMs) {
    context.addIssue({ code: "custom", message: "process latency mismatch" });
  }
  if (Date.parse(value.processStartedAt) > Date.parse(value.startedAt)) {
    context.addIssue({ code: "custom", message: "process start follows work start" });
  }
});

export const liveManifestSchema = z.object({
  schemaVersion: z.literal(1), classification: z.literal("live"),
  deploymentUrl: z.string().url().startsWith("https://"), sdkVersion: z.literal(MINDS_SDK_VERSION),
  processA: processSchema, processB: processSchema, sameAlias: z.literal(true), sameMind: z.literal(true),
  semanticSendCount: z.literal(2), stateVersions: z.tuple([z.literal(3), z.literal(6), z.literal(7)]),
  receiptDigest: digest, replayRejected: z.literal(true),
  evidenceClasses: z.tuple([
    z.literal("strategy_live_exchange"), z.literal("response_live_exchange"),
    z.literal("same_alias"), z.literal("exact_boundary"),
    z.literal("semantic_constraints"), z.literal("one_turn_consumed"),
  ]),
}).strict().superRefine((value, context) => {
  const invalid = value.processA.afterBoundaryDigest !== value.processB.beforeBoundaryDigest ||
    value.processA.aliasDigest !== value.processB.aliasDigest ||
    value.processA.mindDigest !== value.processB.mindDigest ||
    value.processA.processInstanceId === value.processB.processInstanceId ||
    value.processA.processNonce === value.processB.processNonce ||
    Date.parse(value.processB.processStartedAt) < Date.parse(value.processA.completedAt) ||
    Date.parse(value.processB.startedAt) < Date.parse(value.processA.completedAt);
  if (invalid) context.addIssue({ code: "custom", message: "cross-process evidence mismatch" });
});
export type LiveManifest = z.infer<typeof liveManifestSchema>;

export function createLiveManifest(input: LiveManifest): LiveManifest {
  return liveManifestSchema.parse(input);
}

export function serializeLiveManifest(input: LiveManifest): string {
  return `${JSON.stringify(createLiveManifest(input), null, 2)}\n`;
}
