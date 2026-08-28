// File: src/app/components/case-timeline.tsx
import type { DemoCaseView } from "../../application/demo-controller";
const stages = [
  ["authorized", "Boundary authorized"], ["strategy_running", "Mind A · Strategy running"],
  ["strategy_ready", "Strategy prepared"], ["returned", "Return submitted"],
  ["response_running", "Mind B · Response running"], ["response_ready", "Remembered response"],
  ["closed", "Receipt closed"],
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

export function CaseTimeline({ view }: { view: DemoCaseView }) {
  return <ol className="timeline" aria-label="Case timeline">{stages.map(([state, label]) => {
    const index = order.indexOf(state);
    const status = stageStatus(view, index);
    return <li key={state} data-status={status} aria-current={status === "current" ? "step" : undefined}>
      <span>{String(index).padStart(2, "0")}</span><strong>{label}</strong><small>{status}</small>
    </li>;
  })}</ol>;
}
