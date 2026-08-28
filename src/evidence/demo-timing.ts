// File: src/evidence/demo-timing.ts
import { z } from "zod";
import { sha256 } from "../infrastructure/minds/history";
import type { LiveManifest } from "./live-manifest";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const beatSchema = z.object({ id: z.string().min(1), kind: z.enum(["narration", "ui", "process_a", "process_b"]),
  startedMs: z.number().int().nonnegative(), endedMs: z.number().int().positive(),
  mode: z.enum(["live", "same_run_time_cut"]).optional(), clipDigest: digest.optional(),
  evidenceDigest: digest.optional(), label: z.string().optional() }).strict();
export const rehearsalMarkersSchema = z.object({ schemaVersion: z.literal(1), sourceManifestDigest: digest,
  beats: z.array(beatSchema) }).strict();
export const demoTimingSchema = z.object({ schemaVersion: z.literal(1), sourceManifestDigest: digest,
  actualProviderLatencyMs: z.object({ processA: z.number().int(), processB: z.number().int() }),
  beats: z.array(beatSchema), totalMs: z.number().int().min(90_000).max(120_000), withinTarget: z.literal(true) }).strict();
export type DemoTiming = z.infer<typeof demoTimingSchema>;

function assertProviderBeat(beat: z.infer<typeof beatSchema>, actualMs: number, evidenceDigest: string): void {
  const shownMs = beat.endedMs - beat.startedMs;
  const live = beat.mode === "live" && !beat.clipDigest && !beat.evidenceDigest && !beat.label &&
    Math.abs(shownMs - actualMs) <= 1_500;
  if (live) return;
  const cut = beat.mode === "same_run_time_cut" && shownMs <= actualMs && beat.clipDigest &&
    beat.evidenceDigest === evidenceDigest && beat.label === "Same verified run · time-compressed";
  if (!cut) throw new Error("TIMING_PROVIDER_EVIDENCE_MISMATCH");
}

export function buildDemoTiming(manifest: LiveManifest, rawManifest: string, rawMarkers: unknown): DemoTiming {
  const markers = rehearsalMarkersSchema.parse(rawMarkers);
  if (markers.beats.length < 4) throw new Error("TIMING_MARKERS_INCOMPLETE");
  const sourceManifestDigest = sha256(rawManifest);
  if (markers.sourceManifestDigest !== sourceManifestDigest) throw new Error("TIMING_MANIFEST_DIGEST_MISMATCH");
  for (let index = 0; index < markers.beats.length; index += 1) {
    const beat = markers.beats[index]!;
    if (beat.endedMs <= beat.startedMs || (index > 0 && beat.startedMs < markers.beats[index - 1]!.endedMs)) {
      throw new Error("TIMING_MARKERS_NOT_MONOTONIC");
    }
    if ((beat.kind === "narration" || beat.kind === "ui") &&
        (beat.mode || beat.clipDigest || beat.evidenceDigest || beat.label)) {
      throw new Error("TIMING_NON_PROVIDER_METADATA");
    }
  }
  const processABeats = markers.beats.filter((beat) => beat.kind === "process_a");
  const processBBeats = markers.beats.filter((beat) => beat.kind === "process_b");
  if (processABeats.length !== 1 || processBBeats.length !== 1) throw new Error("TIMING_PROVIDER_BEAT_COUNT");
  const processA = processABeats[0]!;
  const processB = processBBeats[0]!;
  assertProviderBeat(processA, manifest.processA.latencyMs, sha256(JSON.stringify(manifest.processA)));
  assertProviderBeat(processB, manifest.processB.latencyMs, sha256(JSON.stringify(manifest.processB)));
  const totalMs = markers.beats.at(-1)!.endedMs - markers.beats[0]!.startedMs;
  return demoTimingSchema.parse({ schemaVersion: 1, sourceManifestDigest,
    actualProviderLatencyMs: { processA: manifest.processA.latencyMs, processB: manifest.processB.latencyMs },
    beats: markers.beats, totalMs, withinTarget: true });
}
