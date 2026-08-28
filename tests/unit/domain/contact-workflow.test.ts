import { describe, expect, it } from "vitest";

import {
  initialContactWorkflow,
  reduceContactWorkflow,
  toPublicContactAvailability,
} from "@/domain/contact/contact-workflow";

import { ACCESS_COMMIT_REFERENCE, unwrapResult } from "./fixtures/workflows";

describe("contact workflow", () => {
  it("supports one revision before opening the optional room", () => {
    const invited = unwrapResult(
      reduceContactWorkflow(initialContactWorkflow(), {
        type: "invitation_requested",
        accessCommit: ACCESS_COMMIT_REFERENCE,
      }),
    );
    const consented = unwrapResult(
      reduceContactWorkflow(invited, { type: "consented" }),
    );
    const boundarySaved = unwrapResult(
      reduceContactWorkflow(consented, { type: "boundary_saved" }),
    );
    const evaluating = unwrapResult(
      reduceContactWorkflow(boundarySaved, { type: "message_submitted" }),
    );
    const revise = unwrapResult(
      reduceContactWorkflow(evaluating, { type: "evaluation_revise" }),
    );
    const evaluatingFinal = unwrapResult(
      reduceContactWorkflow(revise, { type: "revision_submitted" }),
    );
    const opened = unwrapResult(
      reduceContactWorkflow(evaluatingFinal, { type: "evaluation_open" }),
    );

    expect(opened.state).toBe("room_open");
    expect(opened.revisionsUsed).toBe(1);
    expect(toPublicContactAvailability(opened)).toEqual({
      available: true,
      message: "Optional contact is available.",
    });
  });

  it("requires a committed eligibility event before an invitation", () => {
    const result = reduceContactWorkflow(initialContactWorkflow(), {
      type: "invitation_requested",
      accessCommit: {
        ...ACCESS_COMMIT_REFERENCE,
        eventId: "",
      } as typeof ACCESS_COMMIT_REFERENCE,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONTACT_ELIGIBILITY_NOT_COMMITTED",
        from: "not_invited",
        event: "invitation_requested",
      },
    });
  });

  it("rejects a forged non-event identifier as commit evidence", () => {
    const result = reduceContactWorkflow(initialContactWorkflow(), {
      type: "invitation_requested",
      accessCommit: {
        ...ACCESS_COMMIT_REFERENCE,
        eventId: "anything",
      } as typeof ACCESS_COMMIT_REFERENCE,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONTACT_ELIGIBILITY_NOT_COMMITTED" },
    });
  });

  it("permits no-contact as a first-class terminal choice", () => {
    const invited = unwrapResult(
      reduceContactWorkflow(initialContactWorkflow(), {
        type: "invitation_requested",
        accessCommit: ACCESS_COMMIT_REFERENCE,
      }),
    );
    const closed = unwrapResult(
      reduceContactWorkflow(invited, { type: "no_contact" }),
    );

    expect(closed.state).toBe("no_contact");
  });
});
