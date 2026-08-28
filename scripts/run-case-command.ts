// File: scripts/run-case-command.ts
import { createCaseRuntime } from "../src/application/demo-runtime";

const RETURN_MESSAGE = "Can we discuss the past incident within the agreed future-focused boundary?";

async function main(): Promise<void> {
  const [action, code, rawVersion] = process.argv.slice(2);
  const runtime = createCaseRuntime(process.env);
  try {
    if (action === "create") {
      const created = await runtime.controller.create();
      process.stdout.write(`CASE_CODE=${created.code}\n`);
      return;
    }
    if (!action || !code || !rawVersion || !/^\d+$/.test(rawVersion)) {
      throw new Error("CASE_COMMAND_INPUT_REQUIRED");
    }
    const version = Number(rawVersion);
    const view = action === "authorize"
      ? await runtime.controller.authorize(code, version)
      : action === "submit-return"
        ? await runtime.controller.submitReturn(code, version, RETURN_MESSAGE)
        : action === "consume"
          ? await runtime.controller.consume(code, version)
          : null;
    if (!view) throw new Error("CASE_COMMAND_UNKNOWN");
    process.stdout.write(`CASE_COMMAND=${view.state}\n`);
  } finally { await runtime.close(); }
}

main().catch(() => { process.stderr.write("CASE_COMMAND=failed\n"); process.exitCode = 1; });
