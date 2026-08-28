// File: scripts/capture-rehearsal-marker.ts
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { rehearsalMarkersSchema } from "../src/evidence/demo-timing";
import { createLiveManifest } from "../src/evidence/live-manifest";
import { sha256 } from "../src/infrastructure/minds/history";

const markerPath = "artifacts/implementation/rehearsal-markers.json";
const manifestPath = "artifacts/implementation/thin-slice-live-manifest.json";

export function digestClip(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function atomicWrite(value: unknown): Promise<void> {
  const temporary = `${markerPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, markerPath);
}

async function main(): Promise<void> {
  const [id, rawKind, rawMode, clipPath] = process.argv.slice(2);
  const rawManifest = await readFile(manifestPath, "utf8");
  const manifest = createLiveManifest(JSON.parse(rawManifest));
  const sourceManifestDigest = sha256(rawManifest);
  if (id === "reset") { await atomicWrite({ schemaVersion: 1, sourceManifestDigest, beats: [] }); return; }
  const kind = rawKind as "narration" | "ui" | "process_a" | "process_b";
  if (!id || !["narration", "ui", "process_a", "process_b"].includes(kind)) throw new Error("REHEARSAL_MARKER_INPUT_INVALID");
  const existing = rehearsalMarkersSchema.parse(JSON.parse(await readFile(markerPath, "utf8")));
  if (existing.sourceManifestDigest !== sourceManifestDigest || existing.beats.some((beat) => beat.id === id)) {
    throw new Error("REHEARSAL_MARKER_STATE_INVALID");
  }
  const startedMs = Date.now();
  const terminal = createInterface({ input: stdin, output: stdout });
  await terminal.question(`Perform ${id}, then press Enter to stop timing: `);
  terminal.close();
  const beat: Record<string, unknown> = { id, kind, startedMs, endedMs: Date.now() };
  if (kind === "process_a" || kind === "process_b") {
    const mode = rawMode === "same_run_time_cut" ? rawMode : "live";
    Object.assign(beat, { mode });
    if (mode === "same_run_time_cut") {
      if (!clipPath) throw new Error("REHEARSAL_CLIP_REQUIRED");
      Object.assign(beat, { clipDigest: digestClip(await readFile(clipPath)),
        evidenceDigest: sha256(JSON.stringify(kind === "process_a" ? manifest.processA : manifest.processB)),
        label: "Same verified run · time-compressed" });
    }
  }
  await atomicWrite({ ...existing, beats: [...existing.beats, beat] });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write("REHEARSAL_MARKER=failed\n"); process.exitCode = 1; });
}
