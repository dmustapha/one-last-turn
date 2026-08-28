// File: tests/accessibility/thin-slice.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { DemoCaseView } from "../../src/application/demo-controller";
import { ActionPanel } from "../../src/app/components/action-panel";

function view(overrides: Partial<DemoCaseView> = {}): DemoCaseView {
  return { code: "OLT-X", state: "draft", expectedVersion: 0,
    synthetic: true, evidence: [], ...overrides };
}

afterEach(cleanup);

describe("thin-slice accessibility", () => {
  it("announces running work and prevents retry", () => {
    render(<ActionPanel view={view({ state: "response_running", expectedVersion: 5 })} />);

    expect(screen.getByRole("status").textContent).toContain("Do not retry");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("exposes one clear labelled action for a draft case", () => {
    render(<ActionPanel view={view()} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Authorize one topic" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("announces the redacted failure stage and offers no unsafe retry", () => {
    render(<ActionPanel view={view({ state: "failed", expectedVersion: 2,
      failure: { stage: "strategy", code: "MINDS_COGNITION_EMPTY" } })} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Stopped at strategy");
    expect(alert.textContent).toContain("MINDS_COGNITION_EMPTY");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses a disabled native control for a consumed turn", () => {
    render(<ActionPanel view={view({ state: "closed", expectedVersion: 7 })} />);

    expect((screen.getByRole("button", { name: "Already used" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
