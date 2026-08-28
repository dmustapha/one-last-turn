// File: scripts/run-case-strategy.ts
import { runStrategyJob } from "../src/application/minds/run-strategy-job";
import { createMindRuntime } from "../src/application/demo-runtime";

async function main(): Promise<void> {
  const code = process.argv[2];
  if (!code) throw new Error("PUBLIC_CASE_CODE_REQUIRED");
  const publicCode = code;
  const runtime = createMindRuntime(process.env);
  try {
    const result = await runStrategyJob({ code: publicCode, mindId: runtime.mindId,
      cases: runtime.cases, transport: runtime.minds });
    process.stdout.write(`CASE_STRATEGY=${result.state} CODE=${result.code}\n`);
    if (result.state === "failed") process.exitCode = 1;
  } finally { await runtime.close(); }
}

main().catch(() => { process.stderr.write("CASE_STRATEGY=failed\n"); process.exitCode = 1; });
