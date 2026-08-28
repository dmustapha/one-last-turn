import { describe, expect, it } from "vitest";

import {
  CONTACT_STATES,
  TERMINAL_CONTACT_STATES,
  reduceContactWorkflow,
  toPublicContactAvailability,
  type ContactEvent,
} from "@/domain/contact/contact-workflow";

import { ACCESS_COMMIT_REFERENCE, contactInState } from "./fixtures/workflows";

const REOPENING_EVENTS = [
  { type: "invitation_requested", accessCommit: ACCESS_COMMIT_REFERENCE },
  { type: "consented" },
  { type: "boundary_saved" },
  { type: "message_submitted" },
  { type: "evaluation_open" },
  { type: "room_opened" },
  { type: "response_sent" },
] as const satisfies readonly ContactEvent[];

const PUBLICLY_UNAVAILABLE_STATES = CONTACT_STATES.filter(
  (state) => state !== "room_open",
);

const STALE_ROOM_EVENTS = [
  { type: "room_opened" },
  { type: "response_sent" },
] as const satisfies readonly ContactEvent[];

describe("terminal contact states", () => {
  it.each(TERMINAL_CONTACT_STATES)(
    "does not reopen %s",
    (terminalState) => {
      for (const event of REOPENING_EVENTS) {
        const result = reduceContactWorkflow(
          contactInState(terminalState),
          event,
        );

        expect(result).toEqual({
          ok: false,
          error: {
            code: "CONTACT_TERMINAL_STATE",
            from: terminalState,
            event: event.type,
          },
        });
      }
    },
  );

  it.each(PUBLICLY_UNAVAILABLE_STATES)(
    "maps private %s state to the same returning-member response",
    (state) => {
      expect(toPublicContactAvailability(contactInState(state))).toEqual({
        available: false,
        message: "Optional contact is unavailable.",
      });
    },
  );

  it.each(["aborted", "reported"] as const)(
    "%s wins over stale room-open and send attempts",
    (terminalState) => {
      for (const event of STALE_ROOM_EVENTS) {
        const result = reduceContactWorkflow(
          contactInState(terminalState),
          event,
        );

        expect(result.ok).toBe(false);
        expect(result).toMatchObject({
          error: {
            code: "CONTACT_TERMINAL_STATE",
            from: terminalState,
            event: event.type,
          },
        });
      }
    },
  );

  it.each(["aborted", "reported"] as const)(
    "%s overrides a response that committed first",
    (terminalState) => {
      const result = reduceContactWorkflow(
        contactInState("completed"),
        { type: terminalState },
      );

      expect(result).toMatchObject({
        ok: true,
        value: { state: terminalState },
      });
    },
  );
});
