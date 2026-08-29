// File: src/app/components/evidence-strip.tsx
import type { DemoCaseView } from "../../application/demo-controller";

type Chip = { label: string; remembered?: boolean };

export function EvidenceStrip({ view }: { view: DemoCaseView }) {
  const chips: Chip[] = view.evidence.map((label) => ({ label }));
  if (view.strategy) chips.push({ label: `Mind A checkpoint · ${view.strategy.classification} · ${view.strategy.digest.slice(0, 10)}` });
  if (view.response) chips.push({ label: `Mind B remembered · ${view.response.classification} · ${view.response.digest.slice(0, 10)}`, remembered: true });
  if (view.receipt) chips.push({ label: `Receipt · ${view.receipt.digest.slice(0, 10)}` });
  return <>
    {chips.length > 0 && <p className="evidence-legend">Live provider digests: proof the same Mind did the work across two processes. The private text stays withheld.</p>}
    <aside className="evidence" aria-label="Integration proof">
      {chips.length ? chips.map((chip) => <span key={chip.label} className={chip.remembered ? "is-remembered" : undefined}>{chip.label}</span>) : <span>Proof checkpoints pending</span>}
    </aside>
  </>;
}
