import type { DomainError, Result } from "@/domain/shared/result";

export const ACCESS_STATES = [
  "draft",
  "eligibility_recorded",
  "brief_published",
  "access_apply_pending",
  "access_applied",
  "access_apply_failed",
] as const;

export type AccessState = (typeof ACCESS_STATES)[number];
export type RoomRole = "listener" | "speaker";
export type AccessEvent =
  | Readonly<{
      type: "eligibility_recorded";
      outcome: "eligible" | "ineligible";
      currentRole: RoomRole;
      targetRole: RoomRole;
      effectiveAt: string;
    }>
  | Readonly<{ type: "brief_published" }>
  | Readonly<{ type: "access_apply_requested" }>
  | Readonly<{ type: "access_applied"; appliedRole: RoomRole }>
  | Readonly<{ type: "access_failed"; code: string }>;

export type AccessWorkflow = Readonly<{
  currentRole: RoomRole;
  effectiveAt: string | null;
  failureCode: string | null;
  outcome: "eligible" | "ineligible" | null;
  state: AccessState;
  targetRole: RoomRole;
}>;

export function initialAccessWorkflow(): AccessWorkflow {
  return {
    currentRole: "listener",
    effectiveAt: null,
    failureCode: null,
    outcome: null,
    state: "draft",
    targetRole: "speaker",
  };
}

export function reduceAccessWorkflow(
  workflow: AccessWorkflow,
  event: AccessEvent,
): Result<AccessWorkflow, DomainError> {
  switch (event.type) {
    case "eligibility_recorded": return recordEligibility(workflow, event);
    case "brief_published": return accessTransition(workflow, event, "eligibility_recorded", "brief_published");
    case "access_apply_requested": return requestAccess(workflow, event);
    case "access_applied": return applyAccess(workflow, event);
    case "access_failed": return failAccess(workflow, event);
  }
}

export function deriveGeneralAccess(workflow: AccessWorkflow) {
  if (workflow.state === "access_applied") {
    return { currentRole: workflow.currentRole, status: "applied" as const };
  }
  if (workflow.state === "access_apply_failed") {
    return { currentRole: workflow.currentRole, status: "failed" as const };
  }
  return { currentRole: workflow.currentRole, status: "pending" as const };
}

function recordEligibility(workflow: AccessWorkflow, event: Extract<AccessEvent, { type: "eligibility_recorded" }>) {
  if (workflow.state !== "draft") return accessError(workflow, event);
  return success({
    ...workflow,
    currentRole: event.currentRole,
    effectiveAt: event.effectiveAt,
    failureCode: null,
    outcome: event.outcome,
    state: "eligibility_recorded",
    targetRole: event.targetRole,
  });
}

function requestAccess(workflow: AccessWorkflow, event: Extract<AccessEvent, { type: "access_apply_requested" }>) {
  if (workflow.outcome !== "eligible") return accessError(workflow, event);
  return accessTransition(workflow, event, "brief_published", "access_apply_pending");
}

function applyAccess(workflow: AccessWorkflow, event: Extract<AccessEvent, { type: "access_applied" }>) {
  if (workflow.state !== "access_apply_pending") return accessError(workflow, event);
  if (event.appliedRole !== workflow.targetRole) {
    return accessError(workflow, event, "ACCESS_ROLE_MISMATCH");
  }
  return success({ ...workflow, currentRole: event.appliedRole, state: "access_applied", failureCode: null });
}

function failAccess(workflow: AccessWorkflow, event: Extract<AccessEvent, { type: "access_failed" }>) {
  if (workflow.state !== "access_apply_pending") return accessError(workflow, event);
  return success({ ...workflow, failureCode: event.code, state: "access_apply_failed" });
}

function accessTransition(workflow: AccessWorkflow, event: AccessEvent, from: AccessState, state: AccessState) {
  return workflow.state === from ? success({ ...workflow, state }) : accessError(workflow, event);
}

function success(value: AccessWorkflow): Result<AccessWorkflow, DomainError> {
  return { ok: true, value };
}

function accessError(workflow: AccessWorkflow, event: AccessEvent, code = "ACCESS_INVALID_TRANSITION"): Result<AccessWorkflow, DomainError> {
  return { ok: false, error: { code, event: event.type, from: workflow.state } };
}
