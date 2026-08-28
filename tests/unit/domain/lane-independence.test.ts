import { describe, expect, it } from "vitest";

import {
  CONTACT_STATES,
  type ContactEvent,
} from "@/domain/contact/contact-workflow";
import { buildProjectRoomProjection } from "@/domain/room/project-room";
import { contactEventToDomainEvent } from "@/contracts/events/domain-events";

import {
  ACCESS_COMMIT_REFERENCE,
  accessAfter,
  contactInState,
  ELIGIBILITY_RECORDED,
  CONTACT_EVENT_ID,
} from "./fixtures/workflows";

const CONTACT_EVENTS = [
  {
    type: "invitation_requested",
    accessCommit: ACCESS_COMMIT_REFERENCE,
  },
  { type: "invitation_delivered" },
  { type: "consented" },
  { type: "declined" },
  { type: "no_contact" },
  { type: "boundary_saved" },
  { type: "message_submitted" },
  { type: "evaluation_open" },
  { type: "evaluation_revise" },
  { type: "evaluation_abstain" },
  { type: "revision_submitted" },
  { type: "room_opened" },
  { type: "response_sent" },
  { type: "completed" },
  { type: "aborted" },
  { type: "reported" },
  { type: "expired" },
] as const satisfies readonly ContactEvent[];

describe("access and contact lane independence", () => {
  it.each(CONTACT_STATES)(
    "keeps general access identical while contact is %s",
    (contactState) => {
      const access = accessAfter(
        ELIGIBILITY_RECORDED,
        { type: "brief_published" },
        { type: "access_apply_requested" },
        { type: "access_applied", appliedRole: "speaker" },
      );
      const projection = buildProjectRoomProjection({
        access,
        contact: contactInState(contactState),
      });

      expect(projection.generalAccess).toEqual({
        currentRole: "speaker",
        status: "applied",
      });
    },
  );

  it.each(CONTACT_EVENTS)(
    "prevents $type from targeting the general project-room ACL",
    (contactEvent) => {
      const event = contactEventToDomainEvent(contactEvent, CONTACT_EVENT_ID);

      expect(event.lane).toBe("contact");
      expect(event.target).not.toBe("general_project_room_acl");
      expect(["contact_workflow", "optional_contact_room"]).toContain(
        event.target,
      );
    },
  );
});
