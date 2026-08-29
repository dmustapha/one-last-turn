// File: src/app/components/handoff-explainer.tsx
// The compact visual explainer of the cross-process handoff — the entire novelty of the product.
// Moss carries Process A (structure/trust); clay arrives only at Process B (the remembered turn).
export function HandoffExplainer() {
  return (
    <section className="ab" aria-label="How the cross-process handoff works">
      <div className="ab-step" data-phase="a">
        <b>Process A · prepare</b>
        <small>A Mind reads the minimized rules once and prepares a private response strategy, then the process exits.</small>
      </div>
      <div className="ab-arrow" aria-hidden="true">→</div>
      <div className="ab-step" data-phase="gap">
        <b>The gap</b>
        <small>A new process starts fresh. The private rules are never restated. Only the case and a new message cross over.</small>
      </div>
      <div className="ab-arrow" aria-hidden="true">→</div>
      <div className="ab-step" data-phase="b">
        <b>Process B · remember</b>
        <small>The same Mind resumes its own alias and completes the reply from memory. One turn is consumed; replay is refused.</small>
      </div>
    </section>
  );
}
