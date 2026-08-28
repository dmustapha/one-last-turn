import type { ContactEvent } from "@/domain/contact/contact-workflow";
import type { AccessEvent } from "@/domain/eligibility/access-workflow";
import type { AccessEventId, ContactEventId } from "@/domain/shared/ids";

export type ContactDomainEvent = Readonly<{
  id: ContactEventId;
  lane: "contact";
  target: "contact_workflow" | "optional_contact_room";
  type: ContactEvent["type"];
}>;

export type AccessDomainEvent = Readonly<{
  id: AccessEventId;
  lane: "access";
  target: "access_workflow" | "general_project_room_acl";
  type: AccessEvent["type"];
}>;

export type DomainEvent = AccessDomainEvent | ContactDomainEvent;

export function contactEventToDomainEvent(
  event: ContactEvent,
  id: ContactEventId,
): ContactDomainEvent {
  const target = OPTIONAL_ROOM_EVENTS.has(event.type)
    ? "optional_contact_room"
    : "contact_workflow";
  return { id, lane: "contact", target, type: event.type };
}

export function accessEventToDomainEvent(
  event: AccessEvent,
  id: AccessEventId,
): AccessDomainEvent {
  const target = event.type === "access_apply_requested"
    ? "general_project_room_acl"
    : "access_workflow";
  return { id, lane: "access", target, type: event.type };
}

const OPTIONAL_ROOM_EVENTS: ReadonlySet<ContactEvent["type"]> = new Set([
  "evaluation_open",
  "room_opened",
  "response_sent",
  "completed",
  "aborted",
  "reported",
]);
