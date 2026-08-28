// File: tests/unit/ui/case-timeline.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { DemoCaseView } from "../../../src/application/demo-controller";
import { CaseTimeline } from "../../../src/app/components/case-timeline";
import { EvidenceStrip } from "../../../src/app/components/evidence-strip";

function view(overrides: Partial<DemoCaseView> = {}): DemoCaseView {
  return { code: "OLT-X", state: "draft", expectedVersion: 0,
    synthetic: true, evidence: [], ...overrides };
}

afterEach(cleanup);

describe("case timeline", () => {
  it("marks completed, current, and pending stages", () => {
    render(<CaseTimeline view={view({ state: "strategy_ready", expectedVersion: 3 })} />);
    const timeline = screen.getByLabelText("Case timeline");

    expect(within(timeline).getAllByRole("listitem")).toHaveLength(7);
    expect(timeline.querySelector('[aria-current="step"]')?.textContent)
      .toContain("Strategy prepared");
    expect(within(timeline).getByText("Boundary authorized").closest("li")?.getAttribute("data-status"))
      .toBe("complete");
    expect(within(timeline).getByText("Return submitted").closest("li")?.getAttribute("data-status"))
      .toBe("pending");
  });

  it("names both Minds checkpoints for a judge", () => {
    render(<CaseTimeline view={view()} />);

    expect(screen.getByText("Mind A · Strategy running")).toBeTruthy();
    expect(screen.getByText("Mind B · Response running")).toBeTruthy();
  });

  it("stops at the redacted failed stage without presenting later work as failed", () => {
    render(<CaseTimeline view={view({ state: "failed", expectedVersion: 2,
      failure: { stage: "strategy", code: "MINDS_COGNITION_EMPTY" } })} />);

    expect(screen.getByText("Boundary authorized").closest("li")?.getAttribute("data-status"))
      .toBe("complete");
    expect(screen.getByText("Mind A · Strategy running").closest("li")?.getAttribute("data-status"))
      .toBe("stopped");
    expect(screen.getByText("Mind B · Response running").closest("li")?.getAttribute("data-status"))
      .toBe("pending");
  });

  it("keeps the receipt as the current terminal stage when closed", () => {
    render(<CaseTimeline view={view({ state: "closed", expectedVersion: 7 })} />);

    expect(screen.getByText("Receipt closed").closest("li")?.getAttribute("aria-current"))
      .toBe("step");
  });
});

describe("integration proof strip", () => {
  it("renders a truthful empty state", () => {
    render(<EvidenceStrip view={view()} />);

    expect(screen.getByLabelText("Integration proof").textContent).toContain("Proof checkpoints pending");
  });

  it("renders only redacted classifications and shortened digests", () => {
    render(<EvidenceStrip view={view({ evidence: ["Process A live", "Process B pending"],
      strategy: { classification: "live", summary: "Private response strategy persisted",
        digest: "abcdef1234567890", readyAt: "2026-08-27T00:00:00.000Z" } })} />);

    const proof = screen.getByLabelText("Integration proof");
    expect(proof.textContent).toContain("Mind A checkpoint · live · abcdef1234");
    expect(proof.textContent).not.toContain("Private response strategy persisted");
    expect(proof.textContent).not.toContain("abcdef1234567890");
  });
});
