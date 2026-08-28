import { pathToFileURL } from "node:url";

type LiveEnvSource = Readonly<Record<string, string | undefined>>;

export function assertLiveEnvPreflight(source: LiveEnvSource): void {
  if (source.DEMO_CASE_ENABLED !== "true") {
    throw new Error("DEMO_CASE_ENABLED must be exactly true");
  }
  if (source.MINDS_LIVE_ENABLED !== "true") {
    throw new Error("MINDS_LIVE_ENABLED must be exactly true");
  }
  if (source.DEMO_BYPASS_AUTH !== "false") {
    throw new Error("DEMO_BYPASS_AUTH must be exactly false");
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(source.MINDS_BUILDER_API_KEY ?? "")) {
    throw new Error("MINDS_BUILDER_API_KEY must be JWT-shaped");
  }
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(source.MINDS_MIND_ID ?? "")) {
    throw new Error("MINDS_MIND_ID must be UUID-shaped");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertLiveEnvPreflight(process.env);
    process.stdout.write("LIVE_ENV_PREFLIGHT=pass\n");
  } catch {
    process.stderr.write("LIVE_ENV_PREFLIGHT=failed\n");
    process.exitCode = 1;
  }
}
