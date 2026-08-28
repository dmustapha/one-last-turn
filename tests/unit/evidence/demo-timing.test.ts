// File: tests/unit/evidence/demo-timing.test.ts
import { describe, expect, it } from "vitest";
import { buildDemoTiming } from "../../../src/evidence/demo-timing";
import { sha256 } from "../../../src/infrastructure/minds/history";
import type { LiveManifest } from "../../../src/evidence/live-manifest";
import { digestClip } from "../../../scripts/capture-rehearsal-marker";

const process = { latencyMs: 10_000 };
const manifest = { processA: process, processB: process } as LiveManifest;
const raw = JSON.stringify(manifest);
function markers(totalMs: number): { schemaVersion: 1; sourceManifestDigest: string;
  beats: Array<Record<string, unknown>> } { return { schemaVersion: 1, sourceManifestDigest: sha256(raw), beats: [
  { id: "opening", kind: "narration", startedMs: 0, endedMs: 20_000 },
  { id: "a", kind: "process_a", startedMs: 20_000, endedMs: 30_000, mode: "live" },
  { id: "ui", kind: "ui", startedMs: 30_000, endedMs: totalMs - 10_000 },
  { id: "b", kind: "process_b", startedMs: totalMs - 10_000, endedMs: totalMs, mode: "live" },
] }; }
describe("demo timing", () => {
  it("hashes exact binary clip bytes", () => expect(digestClip(Buffer.from([0x80])))
    .not.toBe(digestClip(Buffer.from([0x81]))));
  it("accepts a computed 100-second rehearsal", () => expect(buildDemoTiming(manifest, raw, markers(100_000)).totalMs).toBe(100_000));
  it.each([89_999, 120_001])("rejects an out-of-range total", (total) =>
    expect(() => buildDemoTiming(manifest, raw, markers(total))).toThrow());
  it("rejects a caller manifest digest mismatch", () => expect(() => buildDemoTiming(manifest, raw,
    { ...markers(100_000), sourceManifestDigest: "0".repeat(64) })).toThrow("TIMING_MANIFEST_DIGEST_MISMATCH"));
  it("rejects a duplicate provider beat", () => {
    const value = markers(100_000);
    value.beats.splice(2, 0, { id: "a-copy", kind: "process_a", startedMs: 30_000,
      endedMs: 40_000, mode: "live" });
    value.beats[3] = { ...value.beats[3]!, startedMs: 40_000 };
    expect(() => buildDemoTiming(manifest, raw, value)).toThrow("TIMING_PROVIDER_BEAT_COUNT");
  });
  it("rejects clip metadata on a live provider beat", () => {
    const value = markers(100_000);
    value.beats[1] = { ...value.beats[1]!, clipDigest: "a".repeat(64) };
    expect(() => buildDemoTiming(manifest, raw, value)).toThrow("TIMING_PROVIDER_EVIDENCE_MISMATCH");
  });
  it("binds a labeled same-run time cut to the exact process evidence", () => {
    const value = markers(100_000);
    value.beats[1] = { ...value.beats[1]!, endedMs: 25_000, mode: "same_run_time_cut",
      clipDigest: "f".repeat(64), evidenceDigest: sha256(JSON.stringify(manifest.processA)),
      label: "Same verified run · time-compressed" };
    value.beats[2] = { ...value.beats[2]!, startedMs: 25_000 };
    expect(buildDemoTiming(manifest, raw, value).totalMs).toBe(100_000);
    value.beats[1] = { ...value.beats[1]!, evidenceDigest: "0".repeat(64) };
    expect(() => buildDemoTiming(manifest, raw, value)).toThrow("TIMING_PROVIDER_EVIDENCE_MISMATCH");
  });
});
