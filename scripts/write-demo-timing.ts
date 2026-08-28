// File: scripts/write-demo-timing.ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDemoTiming } from "../src/evidence/demo-timing";
import { createLiveManifest } from "../src/evidence/live-manifest";

async function main(): Promise<void> {
  const manifestPath = process.argv[2] ?? "artifacts/implementation/thin-slice-live-manifest.json";
  const markersPath = process.argv[3] ?? "artifacts/implementation/rehearsal-markers.json";
  const rawManifest = await readFile(manifestPath, "utf8");
  const timing = buildDemoTiming(createLiveManifest(JSON.parse(rawManifest)), rawManifest,
    JSON.parse(await readFile(markersPath, "utf8")));
  const destination = path.join(process.cwd(), "artifacts", "implementation", "thin-slice-demo-timing.json");
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(timing, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, destination);
  process.stdout.write("DEMO_TIMING=ready\n");
}
main().catch(() => { process.stderr.write("DEMO_TIMING=failed\n"); process.exitCode = 1; });
