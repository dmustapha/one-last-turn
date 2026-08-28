import { pathToFileURL } from "node:url";

export function resolveAvfoundationScreenInput(inventory: string): string {
  for (const line of inventory.split(/\r?\n/)) {
    const match = line.match(/\[(\d+)]\s+Capture screen(?:\s+\d+)?\s*$/);
    if (match) return `${match[1]}:none`;
  }

  throw new Error("No AVFoundation screen input found");
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  process.stdout.write(`${resolveAvfoundationScreenInput(Buffer.concat(chunks).toString("utf8"))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unable to resolve AVFoundation screen input";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
