type HistoryRow = {
  senderType?: number | null;
  messageText?: string | null;
  fingerprint?: string;
  messageId?: string;
  [key: string]: unknown;
};

function findMindReply(history: HistoryRow[]): HistoryRow | undefined {
  return history.find((row) => row.senderType === 0 || row.senderType === 2);
}

export async function waitForHistoryReply(input: {
  loadHistory: () => Promise<HistoryRow[]>;
  attempts: number;
  intervalMs: number;
}): Promise<HistoryRow> {
  for (let attempt = 0; attempt < input.attempts; attempt += 1) {
    const reply = findMindReply(await input.loadHistory());
    if (reply) return reply;
    if (attempt < input.attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, input.intervalMs));
    }
  }
  throw new Error("Mind reply did not reach history after SDK timeout");
}

