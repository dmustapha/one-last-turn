const SHA256_DIGEST = /^sha256:([0-9a-f]{64})$/;

export function parseRequestDigest(value: string): Buffer {
  const match = SHA256_DIGEST.exec(value);
  if (!match?.[1]) throw new Error("INVALID_REQUEST_DIGEST");
  return Buffer.from(match[1], "hex");
}
