import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

type InvitationPayload = {
  invitationId: string;
  recipientDigest: string;
  issuedAt: string;
  expiresAt: string;
};

type CreateInvitationInput = {
  baseUrl: string;
  invitationId: string;
  recipientEmail: string;
  issuedAt: string;
  ttlSeconds: number;
  signingKey: string;
};

function sign(encodedPayload: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: InvitationPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(encoded: string): InvitationPayload {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

export function createSignedInvitation(input: CreateInvitationInput) {
  const issuedAtMs = Date.parse(input.issuedAt);
  const payload: InvitationPayload = {
    invitationId: input.invitationId,
    recipientDigest: createHash("sha256").update(input.recipientEmail).digest("hex"),
    issuedAt: input.issuedAt,
    expiresAt: new Date(issuedAtMs + input.ttlSeconds * 1_000).toISOString(),
  };
  const encoded = encodePayload(payload);
  const url = new URL(input.baseUrl);
  url.searchParams.set("p", encoded);
  url.searchParams.set("s", sign(encoded, input.signingKey));
  return { ...payload, url: url.toString() };
}

function hasValidSignature(encoded: string, signature: string, key: string): boolean {
  const expected = Buffer.from(sign(encoded, key));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function inspectSignedInvitation(input: {
  url: string;
  signingKey: string;
  now: string;
  consumedInvitationIds?: Set<string>;
}) {
  const url = new URL(input.url);
  const encoded = url.searchParams.get("p") ?? "";
  const signature = url.searchParams.get("s") ?? "";
  if (!hasValidSignature(encoded, signature, input.signingKey)) {
    return { status: "invalid" as const };
  }
  const payload = decodePayload(encoded);
  if (input.consumedInvitationIds?.has(payload.invitationId)) {
    return { status: "consumed" as const, invitationId: payload.invitationId };
  }
  const expired = Date.parse(input.now) > Date.parse(payload.expiresAt);
  return { status: expired ? "expired" as const : "valid" as const, ...payload };
}

export function invitationIdempotencyKey(invitationId: string): string {
  const digest = createHash("sha256").update(invitationId).digest("hex").slice(0, 24);
  return `one-last-turn/invitation/${digest}`;
}

