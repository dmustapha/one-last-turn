import type { DomainError, Result } from "@/domain/shared/result";
import {
  isCommittedAccessEventReference,
  type CommittedAccessEventReference,
} from "@/domain/shared/committed-event";

export const CONTACT_STATES = [
  "not_invited",
  "invited",
  "declined",
  "no_contact",
  "consented",
  "boundary_saved",
  "evaluating",
  "revise",
  "abstained",
  "room_open",
  "completed",
  "aborted",
  "reported",
  "expired",
] as const;

export const TERMINAL_CONTACT_STATES = [
  "declined",
  "no_contact",
  "abstained",
  "completed",
  "aborted",
  "reported",
  "expired",
] as const;

export type ContactState = (typeof CONTACT_STATES)[number];
export type ContactEvent =
  | Readonly<{ type: "invitation_requested"; accessCommit: CommittedAccessEventReference }>
  | Readonly<{ type: "invitation_delivered" }>
  | Readonly<{ type: "consented" }>
  | Readonly<{ type: "declined" }>
  | Readonly<{ type: "no_contact" }>
  | Readonly<{ type: "boundary_saved" }>
  | Readonly<{ type: "message_submitted" }>
  | Readonly<{ type: "evaluation_open" }>
  | Readonly<{ type: "evaluation_revise" }>
  | Readonly<{ type: "evaluation_abstain" }>
  | Readonly<{ type: "revision_submitted" }>
  | Readonly<{ type: "room_opened" }>
  | Readonly<{ type: "response_sent" }>
  | Readonly<{ type: "completed" }>
  | Readonly<{ type: "aborted" }>
  | Readonly<{ type: "reported" }>
  | Readonly<{ type: "expired" }>;

export type ContactWorkflow = Readonly<{
  revisionsUsed: 0 | 1;
  state: ContactState;
}>;

export function initialContactWorkflow(): ContactWorkflow {
  return { revisionsUsed: 0, state: "not_invited" };
}

export function reduceContactWorkflow(
  workflow: ContactWorkflow,
  event: ContactEvent,
): Result<ContactWorkflow, DomainError> {
  if (event.type === "aborted" || event.type === "reported") {
    return success({ ...workflow, state: event.type });
  }
  if (TERMINAL_CONTACT_STATE_SET.has(workflow.state)) {
    return contactError("CONTACT_TERMINAL_STATE", workflow, event);
  }

  switch (event.type) {
    case "invitation_requested": return requestInvitation(workflow, event);
    case "invitation_delivered": return transition(workflow, event, "invited", "invited");
    case "consented": return transition(workflow, event, "invited", "consented");
    case "declined": return transition(workflow, event, "invited", "declined");
    case "no_contact": return transition(workflow, event, "invited", "no_contact");
    case "boundary_saved": return transition(workflow, event, "consented", "boundary_saved");
    case "message_submitted": return transition(workflow, event, "boundary_saved", "evaluating");
    case "evaluation_open": return transition(workflow, event, "evaluating", "room_open");
    case "evaluation_revise": return requestRevision(workflow, event);
    case "evaluation_abstain": return transition(workflow, event, "evaluating", "abstained");
    case "revision_submitted": return submitRevision(workflow, event);
    case "room_opened": return transition(workflow, event, "evaluating", "room_open");
    case "response_sent": return transition(workflow, event, "room_open", "completed");
    case "completed": return transition(workflow, event, "room_open", "completed");
    case "expired": return success({ ...workflow, state: "expired" });
  }
}

export function toPublicContactAvailability(workflow: ContactWorkflow) {
  return workflow.state === "room_open"
    ? { available: true, message: "Optional contact is available." } as const
    : { available: false, message: "Optional contact is unavailable." } as const;
}

const TERMINAL_CONTACT_STATE_SET: ReadonlySet<ContactState> = new Set(TERMINAL_CONTACT_STATES);

function requestInvitation(workflow: ContactWorkflow, event: Extract<ContactEvent, { type: "invitation_requested" }>) {
  if (!isCommittedAccessEventReference(event.accessCommit)) {
    return contactError("CONTACT_ELIGIBILITY_NOT_COMMITTED", workflow, event);
  }
  return transition(workflow, event, "not_invited", "invited");
}

function requestRevision(workflow: ContactWorkflow, event: Extract<ContactEvent, { type: "evaluation_revise" }>) {
  if (workflow.revisionsUsed > 0) return contactError("CONTACT_INVALID_TRANSITION", workflow, event);
  return transition(workflow, event, "evaluating", "revise");
}

function submitRevision(workflow: ContactWorkflow, event: Extract<ContactEvent, { type: "revision_submitted" }>) {
  if (workflow.state !== "revise") return contactError("CONTACT_INVALID_TRANSITION", workflow, event);
  return success({ ...workflow, revisionsUsed: 1, state: "evaluating" });
}

function transition(workflow: ContactWorkflow, event: ContactEvent, from: ContactState, state: ContactState) {
  return workflow.state === from
    ? success({ ...workflow, state })
    : contactError("CONTACT_INVALID_TRANSITION", workflow, event);
}

function success(value: ContactWorkflow): Result<ContactWorkflow, DomainError> {
  return { ok: true, value };
}

function contactError(code: string, workflow: ContactWorkflow, event: ContactEvent): Result<ContactWorkflow, DomainError> {
  return { ok: false, error: { code, event: event.type, from: workflow.state } };
}
