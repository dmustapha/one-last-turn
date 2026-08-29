// File: src/app/page.tsx
import { createCaseRuntime } from "../application/demo-runtime";
import { createCaseAction } from "./actions";
import { ActionPanel } from "./components/action-panel";
import { CaseTimeline } from "./components/case-timeline";
import { EvidenceStrip } from "./components/evidence-strip";
import { HandoffExplainer } from "./components/handoff-explainer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function loadCase(code: string) {
  const runtime = createCaseRuntime(process.env);
  try { return await runtime.controller.load(code); }
  finally { await runtime.close(); }
}

// A finished case, safe to view without credentials. Judges land on the full proof here.
// Override with SHOWCASE_CASE_CODE if the showcase case is ever reseeded.
const SHOWCASE_CASE = process.env.SHOWCASE_CASE_CODE ?? "OLT-75EFAAF2D3CB";

function NewCaseCard({ loadFailed = false }: { loadFailed?: boolean }) {
  return <section className="case-card intro-card"><p className="role">Operator</p>
    <h2>{loadFailed ? "That case could not be opened" : "Open a synthetic re-entry case"}</h2>
    {loadFailed && <p role="alert">The requested case is unavailable. No provider operation was attempted.</p>}
    <p>Everyone here is synthetic and pre-agreed. Nothing touches a real participant, and the Mind is
      only asked to work once the affected person has authorized a single bounded topic.</p>
    <form action={createCaseAction}><button>Create a case</button></form>
    <p className="showcase-hint">Rather see the finished result first? <a href={`/?case=${SHOWCASE_CASE}`}>Open a completed handoff</a> with both live Mind checkpoints and the one-turn receipt, already sealed.</p>
  </section>;
}

export default async function Home({ searchParams }: {
  searchParams: Promise<{ case?: string }>;
}) {
  const code = (await searchParams).case;
  const view = code ? await loadCase(code).catch(() => null) : null;
  return <main>
    <header className="hero">
      <div className="brandline">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo needs no next/image optimization */}
        <img src="/logo.svg" alt="" width={44} height={44} />
        <p className="eyebrow">Creative Minds Jam · Moderation &amp; community assistance</p>
      </div>
      <h1>One Last Turn</h1>
      <p>After an appeal decides who may return, someone still has to handle the first message. One
        private boundary. One remembered response. One last turn, carried by a single Mind across two
        separate processes, so the affected person&apos;s private choice is honored without ever being shown.</p>
    </header>
    {!view && <HandoffExplainer />}
    {!view ? <NewCaseCard loadFailed={Boolean(code)} /> :
      <section className="case-card"><div className="case-meta"><span>Synthetic case</span><code>{view.code}</code><span className="state-pill">{view.state}</span></div>
        <CaseTimeline view={view} />
        {view.response && <blockquote>{view.response.text}</blockquote>}
        <ActionPanel view={view} /><EvidenceStrip view={view} />
      </section>}
  </main>;
}
