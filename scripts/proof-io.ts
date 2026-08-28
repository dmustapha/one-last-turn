import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export const evidenceDirectory = new URL("../artifacts/proof-rescue/", import.meta.url);

export function loadProofEnvironment(): void {
  try { loadEnvFile(new URL("../.env.local", import.meta.url)); }
  catch { throw new Error("Missing .env.local proof configuration"); }
}

export function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function writeEvidence(url: URL, value: unknown): Promise<void> {
  const targetPath = fileURLToPath(url);
  const directoryPath = dirname(targetPath);
  const temporaryPath = join(directoryPath, `.${basename(targetPath)}.${randomUUID()}.tmp`);
  const directoryIdentity = await prepareWriteDirectory(directoryPath);
  try {
    const file = await open(temporaryPath, "wx", 0o600);
    try {
      await file.chmod(0o600);
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await file.sync();
    } finally { await file.close(); }
    await assertSameDirectory(directoryPath, directoryIdentity);
    await rename(temporaryPath, targetPath);
    await syncDirectory(directoryPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function writeExclusiveEvidence(url: URL, value: unknown): Promise<void> {
  const targetPath = fileURLToPath(url);
  const directoryPath = dirname(targetPath);
  await prepareWriteDirectory(directoryPath);
  const file = await open(targetPath, "wx", 0o600);
  try {
    await file.chmod(0o600);
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await file.sync();
  } finally { await file.close(); }
  await syncDirectory(directoryPath);
}

async function prepareWriteDirectory(directoryPath: string) {
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const before = await lstat(directoryPath);
  if (!before.isDirectory() || before.isSymbolicLink()) throw new Error("Evidence directory must be a real directory");
  await chmod(directoryPath, 0o700);
  return assertSecureDirectory(directoryPath);
}

async function assertSecureDirectory(directoryPath: string) {
  const result = await lstat(directoryPath);
  if (!result.isDirectory() || result.isSymbolicLink()) throw new Error("Evidence directory must not be symbolic");
  if ((result.mode & 0o777) !== 0o700) throw new Error("Evidence directory must use mode 0700");
  return result;
}

async function assertSameDirectory(directoryPath: string, expected: Awaited<ReturnType<typeof lstat>>): Promise<void> {
  const actual = await assertSecureDirectory(directoryPath);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) throw new Error("Evidence directory changed during access");
}

async function syncDirectory(directoryPath: string): Promise<void> {
  let handle;
  try { handle = await open(directoryPath, "r"); }
  catch (error) { if (isUnsupportedDirectorySync(error)) return; throw error; }
  try { await handle.sync(); }
  catch (error) { if (!isUnsupportedDirectorySync(error)) throw error; }
  finally { await handle.close(); }
}

function isUnsupportedDirectorySync(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return ["EINVAL", "ENOTSUP", "EISDIR", "EBADF", "EPERM"].includes(String(error.code));
}

export async function readEvidence(url: URL): Promise<unknown> {
  const parsed: unknown = JSON.parse((await readSecureEvidence(url)).toString("utf8"));
  return parsed;
}

export async function digestEvidenceFile(url: URL): Promise<string> {
  return createHash("sha256").update(await readSecureEvidence(url)).digest("hex");
}

export async function readEvidenceOnce(url: URL): Promise<Readonly<{
  bytes: Buffer;
  digest: string;
  parsed: unknown;
}>> {
  const bytes = await readSecureEvidence(url);
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  return Object.freeze({ bytes, digest: createHash("sha256").update(bytes).digest("hex"), parsed });
}

export async function readSecureTextOnce(url: URL): Promise<Readonly<{ bytes: Buffer; digest: string; text: string }>> {
  const bytes = await readSecureEvidence(url);
  const text = bytes.toString("utf8");
  if (bytes.length === 0 || !Buffer.from(text, "utf8").equals(bytes)) throw new Error("Secure text evidence must be nonempty UTF-8");
  return Object.freeze({ bytes, digest: createHash("sha256").update(bytes).digest("hex"), text });
}

async function readSecureEvidence(url: URL): Promise<Buffer> {
  const filePath = fileURLToPath(url);
  const directoryPath = dirname(filePath);
  const directoryIdentity = await assertSecureDirectory(directoryPath);
  const linkStat = await lstat(filePath);
  if (!linkStat.isFile() || linkStat.isSymbolicLink()) throw new Error("Evidence must be a regular non-symbolic file");
  if ((linkStat.mode & 0o777) !== 0o600) throw new Error("Evidence file must use mode 0600");
  const file = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const openStat = await file.stat();
    if (!openStat.isFile() || (openStat.mode & 0o777) !== 0o600) throw new Error("Opened evidence must be a regular mode-0600 file");
    if (openStat.dev !== linkStat.dev || openStat.ino !== linkStat.ino) throw new Error("Evidence file changed during open");
    await assertSameDirectory(directoryPath, directoryIdentity);
    return file.readFile();
  } finally { await file.close(); }
}

export function safeMessageId(value: Record<string, unknown>): string | undefined {
  const candidate = value.messageId ?? value.id ?? value.message_id;
  return typeof candidate === "string" ? candidate : undefined;
}
