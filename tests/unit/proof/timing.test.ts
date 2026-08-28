import { describe, expect, it } from "vitest";

import { buildTruthfulDemoTimeline } from "@/proof/timing";

describe("truthful demo timing", () => {
  it("fits 90-120 seconds with a disclosed cut and one live call", () => {
    const timeline = buildTruthfulDemoTimeline({
      measuredFirstReplyMs: 74_000,
      measuredSecondReplyMs: 51_000,
    });

    expect(timeline.totalSeconds).toBeGreaterThanOrEqual(90);
    expect(timeline.totalSeconds).toBeLessThanOrEqual(120);
    expect(timeline.liveCallCount).toBeGreaterThanOrEqual(1);
    expect(timeline.usesDisclosedTimeCut).toBe(true);
  });

  it("rejects a timeline that labels cached output as live", () => {
    expect(() =>
      buildTruthfulDemoTimeline({
        measuredFirstReplyMs: 74_000,
        measuredSecondReplyMs: 51_000,
        cachedOutputLabeledLive: true,
      }),
    ).toThrow(/cached output/i);
  });
});

