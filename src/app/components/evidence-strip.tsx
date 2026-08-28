// File: src/app/components/evidence-strip.tsx
import type { DemoCaseView } from "../../application/demo-controller";

export function EvidenceStrip({ view }: { view: DemoCaseView }) {
  const items = [...view.evidence];
  if (view.strategy) items.push(`Mind A checkpoint · ${view.strategy.classification} · ${view.strategy.digest.slice(0, 10)}`);
  if (view.response) items.push(`Mind B checkpoint · ${view.response.classification} · ${view.response.digest.slice(0, 10)}`);
  if (view.receipt) items.push(`Receipt · ${view.receipt.digest.slice(0, 10)}`);
  return <aside className="evidence" aria-label="Integration proof">
    {items.length ? items.map((item) => <span key={item}>{item}</span>) : <span>Proof checkpoints pending</span>}
  </aside>;
}
