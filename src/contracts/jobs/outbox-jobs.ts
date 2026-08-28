import type {
  AccessEventId,
  ContactEventId,
  JobId,
} from "@/domain/shared/ids";

export type AccessOutboxJob = Readonly<{
  id: JobId;
  sourceEventId: AccessEventId;
  sourceLane: "access";
  type: "apply_room_access";
}>;

export type ContactOutboxJob = Readonly<{
  id: JobId;
  sourceEventId: ContactEventId;
  sourceLane: "contact";
  type: "store_boundary" | "evaluate_message";
}>;

export type OutboxJob = AccessOutboxJob | ContactOutboxJob;
