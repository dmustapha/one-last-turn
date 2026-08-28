import { describe, expect, it } from "vitest";

import {
  deriveGeneralAccess,
  initialAccessWorkflow,
  reduceAccessWorkflow,
} from "@/domain/eligibility/access-workflow";

import {
  accessAfter,
  ELIGIBILITY_RECORDED,
  unwrapResult,
} from "./fixtures/workflows";

describe("access workflow", () => {
  it("moves through the operator-owned access sequence", () => {
    const recorded = accessAfter(ELIGIBILITY_RECORDED);
    const published = unwrapResult(
      reduceAccessWorkflow(recorded, { type: "brief_published" }),
    );
    const pending = unwrapResult(
      reduceAccessWorkflow(published, { type: "access_apply_requested" }),
    );
    const applied = unwrapResult(
      reduceAccessWorkflow(pending, {
        type: "access_applied",
        appliedRole: "speaker",
      }),
    );

    expect([
      recorded.state,
      published.state,
      pending.state,
      applied.state,
    ]).toEqual([
      "eligibility_recorded",
      "brief_published",
      "access_apply_pending",
      "access_applied",
    ]);
    expect(deriveGeneralAccess(applied)).toEqual({
      currentRole: "speaker",
      status: "applied",
    });
  });

  it("preserves the prior role when access application fails", () => {
    const pending = accessAfter(
      ELIGIBILITY_RECORDED,
      { type: "brief_published" },
      { type: "access_apply_requested" },
    );
    const failed = unwrapResult(
      reduceAccessWorkflow(pending, {
        type: "access_failed",
        code: "ROOM_PROVIDER_UNAVAILABLE",
      }),
    );

    expect(failed.state).toBe("access_apply_failed");
    expect(deriveGeneralAccess(failed)).toEqual({
      currentRole: "listener",
      status: "failed",
    });
  });

  it("rejects an applied role that does not match the authorized target", () => {
    const pending = accessAfter(
      ELIGIBILITY_RECORDED,
      { type: "brief_published" },
      { type: "access_apply_requested" },
    );

    expect(
      reduceAccessWorkflow(pending, {
        type: "access_applied",
        appliedRole: "listener",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "ACCESS_ROLE_MISMATCH",
        from: "access_apply_pending",
        event: "access_applied",
      },
    });
  });

  it("does not copy transport event fields into workflow state", () => {
    const recorded = accessAfter(ELIGIBILITY_RECORDED);

    expect(recorded).not.toHaveProperty("type");
  });

  it("rejects an out-of-order event with a stable error code", () => {
    const result = reduceAccessWorkflow(initialAccessWorkflow(), {
      type: "access_apply_requested",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "ACCESS_INVALID_TRANSITION",
        from: "draft",
        event: "access_apply_requested",
      },
    });
  });
});
