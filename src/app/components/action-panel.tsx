// File: src/app/components/action-panel.tsx
import type { DemoCaseView } from "../../application/demo-controller";
import {
  authorizeAction, consumeAction, submitReturnAction,
} from "../actions";

function HiddenCase({ view }: { view: DemoCaseView }) {
  return <><input type="hidden" name="code" value={view.code} /><input type="hidden" name="version" value={view.expectedVersion} /></>;
}

export function ActionPanel({ view }: { view: DemoCaseView }) {
  if (view.state === "draft") return <form action={authorizeAction}><HiddenCase view={view} /><button>Authorize one topic</button></form>;
  if (view.state === "authorized") return <p className="op-note" role="status">Authorized. The operator now runs Process A once (the Mind prepares its private strategy), then refreshes this case.</p>;
  if (view.state === "strategy_ready") return <form action={submitReturnAction}><HiddenCase view={view} />
    <label htmlFor="return-message">Returning member&apos;s message</label>
    <textarea id="return-message" name="message" required minLength={10} maxLength={400} />
    <button>Submit return</button></form>;
  if (view.state === "returned") return <p className="op-note" role="status">Return stored. The operator now runs the separate Process B once (the same Mind answers from memory), then refreshes this case.</p>;
  if (view.state === "response_ready") return <form action={consumeAction}><HiddenCase view={view} /><button>Consume one turn</button></form>;
  if (view.state === "closed") return <button disabled>Already used</button>;
  if (view.state.endsWith("_running")) return <p className="op-note" role="status">The Mind is working. Do not retry this send; it is never resent automatically.</p>;
  if (view.failure) return <p className="failure" role="alert">
    <strong>Stopped at {view.failure.stage}</strong><span>{view.failure.code}</span>
    <small>No semantic retry was sent. Start a new synthetic case.</small>
  </p>;
  return <p role="alert">This case stopped honestly. Start a new synthetic case.</p>;
}
