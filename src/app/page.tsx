// File: src/app/page.tsx
import { createCaseRuntime } from "../application/demo-runtime";
import { createCaseAction } from "./actions";
import { ActionPanel } from "./components/action-panel";
import { CaseTimeline } from "./components/case-timeline";
import { EvidenceStrip } from "./components/evidence-strip";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function loadCase(code: string) {
  const runtime = createCaseRuntime(process.env);
  try { return await runtime.controller.load(code); }
  finally { await runtime.close(); }
}

function NewCaseCard({ loadFailed = false }: { loadFailed?: boolean }) {
  return <section className="case-card intro-card"><p className="role">Operator</p>
    <h2>{loadFailed ? "That case could not be opened" : "Open a synthetic re-entry case"}</h2>
    {loadFailed && <p role="alert">The requested case is unavailable. No provider operation was attempted.</p>}
    <p>No private participant data is used. Provider work begins only after the bounded topic is authorized.</p>
    <form action={createCaseAction}><button>Create case</button></form>
  </section>;
}

export default async function Home({ searchParams }: {
  searchParams: Promise<{ case?: string }>;
}) {
  const code = (await searchParams).case;
  const view = code ? await loadCase(code).catch(() => null) : null;
  return <main>
    <header className="hero"><p className="eyebrow">Creative Minds Jam · live thin slice</p>
      <h1>One Last Turn</h1>
      <p>One Mind carries a private community-care boundary across two processes. The app permits exactly one remembered response.</p>
    </header>
    {!view ? <NewCaseCard loadFailed={Boolean(code)} /> :
      <section className="case-card"><div className="case-meta"><span>Synthetic case</span><code>{view.code}</code><span>{view.state}</span></div>
        <CaseTimeline view={view} />
        {view.response && <blockquote>{view.response.text}</blockquote>}
        <ActionPanel view={view} /><EvidenceStrip view={view} />
      </section>}
  </main>;
}
