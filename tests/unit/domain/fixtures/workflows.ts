import { expect } from "vitest";

import {
  initialAccessWorkflow,
  reduceAccessWorkflow,
  type AccessEvent,
  type AccessWorkflow,
} from "@/domain/eligibility/access-workflow";
import {
  initialContactWorkflow,
  type ContactState,
  type ContactWorkflow,
} from "@/domain/contact/contact-workflow";
import type { DomainError, Result } from "@/domain/shared/result";
import type { CommittedAccessEventReference } from "@/domain/shared/committed-event";
import type { AccessEventId, ContactEventId } from "@/domain/shared/ids";

export const ACCESS_COMMIT_REFERENCE = {
  aggregateVersion: 4,
  eventId: "018f1c20-7c7f-4c5d-8df2-4ee2b1fd6a70" as AccessEventId,
  eventType: "access_applied",
  lane: "access",
} satisfies CommittedAccessEventReference;

export const CONTACT_EVENT_ID = "9a89de09-4e41-47c7-8f51-60bf760a32a5" as ContactEventId;

export const ELIGIBILITY_RECORDED: AccessEvent = {
  type: "eligibility_recorded",
  outcome: "eligible",
  currentRole: "listener",
  targetRole: "speaker",
  effectiveAt: "2026-08-26T12:00:00.000Z",
};

export function unwrapResult<T>(result: Result<T, DomainError>): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, received ${result.error.code}`);
  }

  return result.value;
}

export function accessAfter(...events: AccessEvent[]): AccessWorkflow {
  return events.reduce(
    (workflow, event) => unwrapResult(reduceAccessWorkflow(workflow, event)),
    initialAccessWorkflow(),
  );
}

export function contactInState(state: ContactState): ContactWorkflow {
  return {
    ...initialContactWorkflow(),
    state,
  };
}
