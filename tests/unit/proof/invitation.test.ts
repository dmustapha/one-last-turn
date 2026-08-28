import { describe, expect, it } from "vitest";

import {
  createSignedInvitation,
  inspectSignedInvitation,
  invitationIdempotencyKey,
} from "@/proof/invitation";

const signingKey = "proof-only-signing-key-with-at-least-32-bytes";

describe("permissioned invitation", () => {
  it("contains no recipient email and verifies before expiry", () => {
    const invitation = createSignedInvitation({
      baseUrl: "https://proof.one-last-turn.local/invite",
      invitationId: "invite-1",
      recipientEmail: "controlled@example.test",
      issuedAt: "2026-08-26T08:00:00.000Z",
      ttlSeconds: 600,
      signingKey,
    });

    expect(invitation.url).not.toContain("controlled@example.test");
    expect(
      inspectSignedInvitation({
        url: invitation.url,
        signingKey,
        now: "2026-08-26T08:09:59.000Z",
      }),
    ).toMatchObject({ status: "valid", invitationId: "invite-1" });
  });

  it("expires deterministically and rejects replay after consumption", () => {
    const invitation = createSignedInvitation({
      baseUrl: "https://proof.one-last-turn.local/invite",
      invitationId: "invite-2",
      recipientEmail: "controlled@example.test",
      issuedAt: "2026-08-26T08:00:00.000Z",
      ttlSeconds: 600,
      signingKey,
    });

    expect(
      inspectSignedInvitation({
        url: invitation.url,
        signingKey,
        now: "2026-08-26T08:10:01.000Z",
      }).status,
    ).toBe("expired");
    expect(
      inspectSignedInvitation({
        url: invitation.url,
        signingKey,
        now: "2026-08-26T08:05:00.000Z",
        consumedInvitationIds: new Set(["invite-2"]),
      }).status,
    ).toBe("consumed");
  });

  it("derives one stable provider idempotency key per invitation", () => {
    expect(invitationIdempotencyKey("invite-3")).toBe(
      invitationIdempotencyKey("invite-3"),
    );
    expect(invitationIdempotencyKey("invite-3")).not.toBe(
      invitationIdempotencyKey("invite-4"),
    );
  });
});

