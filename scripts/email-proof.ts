import { randomBytes, randomUUID } from "node:crypto";
import { Resend } from "resend";

import {
  createSignedInvitation,
  inspectSignedInvitation,
  invitationIdempotencyKey,
} from "@/proof/invitation";
import {
  emailEvidenceUrl,
  loadProofEnvironment,
  requireEnvironment,
  sha256,
  writeEvidence,
} from "./proof-shared";

const terminalEvents = new Set(["delivered", "bounced", "failed", "suppressed"]);

async function waitForTerminalEvent(resend: Resend, emailId: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    const result = await resend.emails.get(emailId);
    if (result.error) throw new Error(`Email status failed: ${result.error.name}`);
    if (result.data && terminalEvents.has(result.data.last_event)) return result.data;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("Email did not reach a terminal provider state within 90 seconds");
}

async function sendIdempotently(
  resend: Resend,
  payload: { from: string; to: string; subject: string; text: string },
  idempotencyKey: string,
) {
  const result = await resend.emails.send(payload, { idempotencyKey });
  if (result.error || !result.data?.id) {
    throw new Error(`Email send failed: ${result.error?.name ?? "missing_id"}`);
  }
  return result.data.id;
}

async function main() {
  loadProofEnvironment();
  const resend = new Resend(requireEnvironment("RESEND_API_KEY"));
  const recipient = requireEnvironment("PROOF_RECIPIENT_EMAIL");
  const from = requireEnvironment("RESEND_FROM_EMAIL");
  const invitationId = `olt-${randomUUID()}`;
  const signingKey = randomBytes(32).toString("hex");
  const issuedAt = new Date().toISOString();
  const invitation = createSignedInvitation({
    baseUrl: "https://proof.one-last-turn.local/invite",
    invitationId,
    recipientEmail: recipient,
    issuedAt,
    ttlSeconds: 600,
    signingKey,
  });
  const payload = {
    from,
    to: recipient,
    subject: "One Last Turn — permissioned proof invitation",
    text: `Synthetic proof invitation. Expires in 10 minutes.\n\n${invitation.url}`,
  };
  const idempotencyKey = invitationIdempotencyKey(invitationId);
  const firstId = await sendIdempotently(resend, payload, idempotencyKey);
  const replayId = await sendIdempotently(resend, payload, idempotencyKey);
  if (firstId !== replayId) throw new Error("Provider idempotency replay changed email ID");
  const delivered = await waitForTerminalEvent(resend, firstId);
  const failureId = await sendIdempotently(
    resend,
    { ...payload, to: "bounced@resend.dev", subject: `${payload.subject} — bounce proof` },
    `${idempotencyKey}/bounce`,
  );
  const failed = await waitForTerminalEvent(resend, failureId);
  const valid = inspectSignedInvitation({ url: invitation.url, signingKey, now: issuedAt });
  const expired = inspectSignedInvitation({
    url: invitation.url,
    signingKey,
    now: new Date(Date.parse(invitation.expiresAt) + 1).toISOString(),
  });
  const consumed = inspectSignedInvitation({
    url: invitation.url,
    signingKey,
    now: issuedAt,
    consumedInvitationIds: new Set([invitationId]),
  });
  await writeEvidence(emailEvidenceUrl, {
    proofVersion: 1,
    capturedAt: new Date().toISOString(),
    recipientDigest: sha256(recipient),
    providerMessageId: firstId,
    providerReplayMessageId: replayId,
    deliveredEvent: delivered.last_event,
    failureMessageId: failureId,
    failureEvent: failed.last_event,
    idempotencySameId: firstId === replayId,
    invitation: {
      invitationId,
      issuedAt,
      expiresAt: invitation.expiresAt,
      initialStatus: valid.status,
      expiredStatus: expired.status,
      consumedStatus: consumed.status,
      rawCapabilityPersisted: false,
    },
  });
  console.log(`EMAIL_PROOF=pass delivered=${delivered.last_event} failure=${failed.last_event} replay=same-id`);
}

await main();

