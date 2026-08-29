// File: src/app/components/case-timeline.tsx
import type { DemoCaseView } from "../../application/demo-controller";
const stages = [
  ["authorized", "Boundary authorized", undefined], ["strategy_running", "Mind A · Strategy running", "a"],
  ["strategy_ready", "Strategy prepared", "a"], ["returned", "Return submitted", undefined],
  ["response_running", "Mind B · Response running", "b"], ["response_ready", "Remembered response", "b"],
  ["closed", "Receipt closed", undefined],
] as const;
const order = ["draft", ...stages.map(([state]) => state), "failed"];
type StageStatus = "complete" | "current" | "pending" | "stopped";

function failedIndex(view: DemoCaseView): number {
  if (view.failure?.stage === "strategy") return order.indexOf("strategy_running");
  if (view.failure?.stage === "response") return order.indexOf("response_running");
  return 1;
}

function stageStatus(view: DemoCaseView, index: number): StageStatus {
  if (view.state === "failed") {
    const stopped = failedIndex(view);
    return index < stopped ? "complete" : index === stopped ? "stopped" : "pending";
  }
  const current = order.indexOf(view.state);
  return index < current ? "complete" : index === current ? "current" : "pending";
}

const tickLabel: Record<StageStatus, string> = {
  complete: "Done", current: "In progress", pending: "Waiting", stopped: "Stopped",
};

export function CaseTimeline({ view }: { view: DemoCaseView }) {
  return <ol className="timeline" aria-label="Case timeline">{stages.map(([state, label, phase]) => {
    const index = order.indexOf(state);
    const status = stageStatus(view, index);
    // A closed case's terminal receipt step stays the aria-current step, but it is sealed, not in progress.
    const tick = status === "current" && view.state === "closed" ? "Sealed" : tickLabel[status];
    return <li key={state} data-status={status} data-phase={phase}
      aria-current={status === "current" ? "step" : undefined}>
      <span className="idx">{String(index).padStart(2, "0")}</span>
      <strong>{label}</strong>
      <span className="tick">{tick}</span>
    </li>;
  })}</ol>;
}
