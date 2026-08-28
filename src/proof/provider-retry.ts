type ProviderFailure = { code?: string; status?: number };

function isTransient(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as ProviderFailure;
  return (
    ["network_error", "ETIMEDOUT", "ECONNRESET"].includes(failure.code ?? "") ||
    (typeof failure.status === "number" && failure.status >= 500)
  );
}

export async function retryProviderRead<T>(
  read: () => Promise<T>,
  options: { attempts: number; baseDelayMs: number },
): Promise<T> {
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (!isTransient(error) || attempt === options.attempts) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, options.baseDelayMs * attempt),
      );
    }
  }
  throw new Error("Provider read retry exhausted");
}

