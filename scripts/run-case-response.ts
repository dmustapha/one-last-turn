// File: scripts/run-case-response.ts
import { runResponseJob } from "../src/application/minds/run-response-job";
import { createMindRuntime } from "../src/application/demo-runtime";

async function main(): Promise<void> {
  const code = process.argv[2];
  if (!code) throw new Error("PUBLIC_CASE_CODE_REQUIRED");
  const publicCode = code;
  const runtime = createMindRuntime(process.env);
  try {
    const result = await runResponseJob({ code: publicCode, mindId: runtime.mindId,
      cases: runtime.cases, transport: runtime.minds });
    process.stdout.write(`CASE_RESPONSE=${result.state} CODE=${result.code}\n`);
    if (result.state === "failed") process.exitCode = 1;
  } finally { await runtime.close(); }
}

main().catch(() => { process.stderr.write("CASE_RESPONSE=failed\n"); process.exitCode = 1; });
