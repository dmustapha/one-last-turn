// File: scripts/write-live-manifest.ts
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCaseRuntime } from "../src/application/demo-runtime";
import { buildLiveManifest, observeReplayRejection } from "../src/evidence/live-manifest-builder";
import { serializeLiveManifest } from "../src/evidence/live-manifest";

async function main(): Promise<void> {
  const code = process.argv[2];
  if (!code) throw new Error("PUBLIC_CASE_CODE_REQUIRED");
  const runtime = createCaseRuntime(process.env);
  try {
    const record = await runtime.cases.findByCode(code);
    if (!record || !runtime.config.appUrl) throw new Error("LIVE_MANIFEST_CONFIGURATION_MISSING");
    await observeReplayRejection(code, record.stateVersion,
      (caseCode, version) => runtime.cases.consumeTurn(caseCode, version));
    await runtime.cases.recordReplayRejection(code, record.stateVersion);
    const confirmed = await runtime.cases.findByCode(code);
    if (!confirmed || confirmed.stateVersion !== record.stateVersion ||
        confirmed.receiptDigest !== record.receiptDigest) {
      throw new Error("LIVE_REPLAY_CHANGED_COMMITTED_STATE");
    }
    const events = await runtime.cases.listEventsByCode(code);
    const output = serializeLiveManifest(buildLiveManifest({ record: confirmed, events,
      deploymentUrl: runtime.config.appUrl }));
    const destination = path.join(process.cwd(), "artifacts", "implementation", "thin-slice-live-manifest.json");
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp-${process.pid}`;
    await writeFile(temporary, output, { mode: 0o644 });
    await rename(temporary, destination);
    process.stdout.write("LIVE_MANIFEST=ready\n");
  } finally { await runtime.close(); }
}

main().catch(() => { process.stderr.write("LIVE_MANIFEST=failed\n"); process.exitCode = 1; });
