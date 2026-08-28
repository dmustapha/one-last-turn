import { isAccessEventId, type AccessEventId } from "./ids";

export type CommittedAccessEventReference = Readonly<{
  aggregateVersion: number;
  eventId: AccessEventId;
  eventType: "access_applied";
  lane: "access";
}>;

export function isCommittedAccessEventReference(
  value: unknown,
): value is CommittedAccessEventReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  return candidate.lane === "access"
    && candidate.eventType === "access_applied"
    && Number.isInteger(candidate.aggregateVersion)
    && Number(candidate.aggregateVersion) > 0
    && isAccessEventId(candidate.eventId);
}
