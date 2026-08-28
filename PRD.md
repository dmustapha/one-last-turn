# One Last Turn: Product Requirements Document

## [EMERGENCY MODE: 0 components mocked]

No product component is mocked in the live proof. Deterministic test adapters are permitted only under `NODE_ENV=test` and cannot support submission claims.

**Hackathon:** Creative Minds Jam #1: Hong Kong  
**Track:** Moderation and Community Assistance  
**Deadline:** 2026-08-28 23:59 HKT  
**Version:** 1.0, approved thin working-product slice

## 1. Project Overview

### One-liner

One Last Turn lets an operator record a pre-agreed synthetic boundary for one narrow topic, then uses a persistent Minds Mind to carry the response strategy across separate processes and complete one finite returning-member response.

### Problem statement

Appeal systems answer whether someone may return, but they do not manage the sensitive first contact after that decision. The result is a dangerous gap: a returning member can be legally or procedurally eligible while the affected participant's private boundaries are lost, exposed, or improvised by the next moderator.

### Solution

The application separates access from contact. For this hackathon slice, all personas and the affected-participant boundary are synthetic and pre-agreed; the operator records that boundary. Deterministic code enforces a one-turn grant and seals a replay-resistant receipt. Process A assigns a Minds Mind to prepare a strategy from minimized rules. After Process A exits, Process B resumes the same alias without those rules and assigns the Mind to produce the final response from remembered context. The UI proves the handoff without claiming real-participant identity or consent.

### Selection truth

One Last Turn's historical internal forecast is 7.07/10 and did not pass the team's 7.50 championship threshold. Dami explicitly retired that forecast as a pre-build blocker because it is not an organizer eligibility rule. This PRD records a build selection, not a retroactive qualification PASS.

### Why this wins

| Judging criterion | Weight | Evidence target |
|---|:---:|---|
| Minds Integration Depth | 20% derived | Same funded Mind, stable alias, two processes, omitted context, fresh reply |
| Creator-Economy Problem Fit | 20% derived | A narrow community-care handoff after an appeal decision |
| Innovation and Creativity | 20% derived | Finite contact authority plus load-bearing persistent memory |
| Execution and Completeness | 20% derived | Deployed guided flow, exact boundaries, replay rejection, honest failures |
| Viability and Scalability | 20% derived | Repeatable case aggregate without claiming production tenancy |

### Priority features

| ID | Priority | Feature | Observable |
|---|:---:|---|---|
| F-001 | P0 | Deterministic synthetic boundary authorization | Strategy job cannot claim an unauthorized case; no real-person consent claim is made |
| F-002 | P0 | Process-A live strategy | A validated strategy artifact and exact terminal history boundary persist |
| F-003 | P0 | Process-B remembered response | New reply applies an omitted Process-A rule without receiving it again |
| F-004 | P0 | One-turn receipt | First consume closes the case; second consume is rejected atomically |
| F-005 | P0 | Judge-facing proof timeline | UI shows both process checkpoints and redacted evidence classes; this is how the judge witnesses the thesis |
| F-006 | P0 | Cognition and failure visibility | Low credit, timeout, refusal, malformed output, and ambiguity remain explicit rather than becoming false success |

## 2. System Architecture Overview

### System diagram

```text
Judge browser
    | redacted actions and view models
    v
Next.js guided timeline
    | commands with expected aggregate version
    v
Demo controller -> Transactional case service -> PostgreSQL case + events
                         |                              ^
                         | claimed job                  | artifact + boundary
                         v                              |
                   Process A worker -> Minds SDK 0.1.4
                         | process exits
                         v
                   Process B worker -> same alias -> Minds SDK 0.1.4
                         |
                         v
                 receipt + replay rejection
                         |
                         v
           redacted manifest and judge proof strip
```

### Component table

| # | Component | Type | Purpose | Key dependencies |
|---|---|---|---|---|
| C1 | Demo aggregate | Domain | Enforce nine-state lifecycle and terminal behavior | None |
| C2 | Case repository | Data | Persist aggregate, boundaries, artifacts, and append-only events | PostgreSQL |
| C3 | Transactional case service | Application | Lock, compare-and-set, append event, and consume exactly once | C1, C2 |
| C4 | Mind work contract | Application | Build direct assignments and parse strict artifacts | Zod 4 |
| C5 | Provenance-bound Minds worker | Integration | Bind send and reply to alias and exact history boundaries | Minds SDK 0.1.4 |
| C6 | Separate A/B jobs | Application | Perform strategy and response work in distinct processes | C3, C4, C5 |
| C7 | Demo controller and actions | Server | Validate inputs and expose only redacted view models | Next.js, C3, C6 |
| C8 | Case timeline UI | Frontend | Guide three roles through one next action at a time | React 19, C7 |
| C9 | Receipt and proof manifest | Evidence | Seal finite completion and provide safe submission evidence | SHA-256, C3 |

### Data flow

The browser sends deterministic commands with expected state versions; it never launches provider work. The controller locks one case row, applies the transition, updates by expected version, and appends one redacted event. Separate Process-A and Process-B CLI invocations perform the two provider assignments. Process A creates a random stable alias, records the initial history boundary, sends once, reconciles a newer reply, validates the strategy, and persists the terminal boundary. Process B receives only the stored alias, boundary, and new return message. It proves live history still equals the stored boundary before sending. The final consume writes the receipt and terminal state in one transaction.

## 3. User Flows

### Flow 1: Authorize the bounded topic

1. Operator creates the synthetic case.
2. Operator reviews the pre-agreed synthetic affected-participant boundary.
3. Operator records authorization for one forward-looking community-participation topic.
4. Application records authorization and the one-turn limit without calling Minds or claiming real-participant identity.
5. Invalid or stale commands remain on the current state with a redacted error.

### Flow 2: Prepare strategy in Process A

1. Operator starts the strategy job.
2. Application claims the authorized case before provider access.
3. Process A sends the three minimized synthetic rules to the stable alias once.
4. Worker reconciles exactly one outbound row and one newer Mind reply.
5. Validated strategy and terminal history boundary persist, then Process A exits.
6. Timeout or ambiguity becomes a visible failure; no automatic semantic retry occurs.

### Flow 3: Resume and complete in Process B

1. The demo operator stages a synthetic Returning Member message in a later browser session; no distinct real principal is claimed.
2. Process B starts independently and loads only alias, stored boundary, and new message.
3. Worker compares live provider history with the Process-A terminal boundary.
4. Process B sends one direct completion assignment without restating private rules.
5. A fresh reply is validated and persisted as the response artifact.
6. A boundary mismatch stops before the send.

### Flow 4: Consume once and prove replay rejection

1. Judge reviews the deterministic public rendering of the Mind-produced decision and its evidence strip.
2. Application consumes the grant and writes the receipt atomically.
3. Case becomes closed.
4. A second consume attempt returns `DEMO_TERMINAL` and cannot alter the receipt.

## 4. Technical Specifications

### C1. Demo aggregate

- **States:** `draft`, `authorized`, `strategy_running`, `strategy_ready`, `returned`, `response_running`, `response_ready`, `closed`, `failed`.
- **Events:** authorize, claim strategy, record strategy, submit return, claim response, record response, consume turn, fail.
- **Constraint:** every successful event increments the aggregate version; closed and failed are terminal.

### C2. Case repository

- **Interface:** create draft, find full record, load minimized Process-B input, lock by public code, expected-version save, append event, transaction store.
- **State:** one `demo_cases` row and append-only `demo_case_events` rows.
- **Constraint:** unique `(case_id, aggregate_version)` and paired artifact/digest fields.

### C3. Transactional case service

- **Commands:** create, authorize, claim, record, submit, consume, fail.
- **Constraint:** each command locks, reduces, updates, appends, and commits as one transaction.
- **Concurrency:** exactly one writer can consume expected version 6 and advance to closed version 7.

### C4. Mind work contract

- **Strategy artifact:** risk summary, two to five response-plan steps, safe scope.
- **Response artifact:** three strict remembered-decision enums plus private rationale; application code renders the only public sentence.
- **Constraint:** Process B input contains no Process-A rule, strategy text, acceptance language, or provider identifier.

### C5. Provenance-bound Minds worker

- **Interface:** ensure conversation, get complete history, send once, wait, reconcile, validate.
- **Boundary:** complete-history digest, row count, newest/oldest fingerprint digests, alias/Mind digests, message/content digests, provider timestamps, and before/after snapshots.
- **Constraint:** reads may retry; semantic send count is one per job.

### C6. Separate A/B jobs

- **Process A input:** public case code only.
- **Process B input:** public case code only.
- **Constraint:** distinct process nonces, distinct CLI processes, minimized Process-B input, and no import from historical `src/proof`.

### C7. Demo controller and actions

- **Interface:** create, load, authorize, submit return, consume. Provider jobs are separate CLI entry points.
- **Output:** public code, state, fixed application-owned rendering of the live Mind decision, receipt digest, redacted failure.
- **Constraint:** never return alias, Mind ID, prompts, raw history, or hidden boundary text.

### C8. Case timeline UI

- **Roles:** Operator plus synthetic Affected Participant and Returning Member narrative fixtures; they are not authenticated principals.
- **Behavior:** progressive disclosure, one next action, semantic status region, keyboard access.
- **Constraint:** no login wall and no empty first visit.

### C9. Receipt and proof manifest

- **Receipt fields:** public-code digest, strategy digest, response digest, versions, timestamps, evidence classes.
- **Manifest:** deployment URL, SDK/origin class, distinct process-instance IDs, nonces, derived digests/send count/event versions, latency, replay result, and live classification.
- **Constraint:** no raw credentials, IDs, aliases, prompts, or provider messages.

## 5. API Contracts

### External API: Minds Builder API

- **Client:** `@animocabrands/minds-client-lib` 0.1.4
- **Authentication:** `MINDS_BUILDER_API_KEY` through `X-Api-Key`
- **Base URL:** library default `https://api.build.hellominds.ai`
- **Rate limits:** not published; two application-level semantic assignments maximum on the happy path. SDK 0.1.4 may internally retry HTTP 409, so wire-attempt count is explicitly provider-managed and unknown.
- **Unavailable behavior:** stop at the exact stage and retain truthful failed/ambiguous state.

| SDK operation | Request | Required response |
|---|---|---|
| `ensureConversation(alias, mindId)` | random stable alias and configured Mind ID | alias bound to the same Mind |
| `getHistory(alias, {limit, cursor})` | stable alias, bounded page | newest-first sanitized message rows |
| `sendMessage({alias, messageText})` | one direct assignment | sanitized provider acknowledgement |
| `waitForReply(...)` | alias, sent text, fingerprint, timeout | reply or explicit timeout |
| `getCognitionBalance(mindId)` | configured Mind ID | numeric spendable Cognition balance |

## 6. Measured Demo Script Template

**Target:** 90–120 seconds, generated only after the deployed manifest supplies actual transition and provider latency. Provider waits use visibly labeled footage from that same verified run when measured latency cannot fit the live beat; no duration or output is fabricated.

### Scene 1 / Flow 1: The boundary

**Screen:** Ready synthetic case, separate Access and Contact labels, authorization card.  
**Voiceover:** "The operator has decided access. For this synthetic demo, the operator records a pre-agreed fixture allowing one future-focused topic."  
**Action:** Click Authorize. Timeline advances to Strategy.

### Scene 2 / Flow 2: Process A prepares the strategy

**Screen:** Process A checkpoint, live Minds label, redacted boundary digest, strategy summary.  
**Voiceover:** "A Minds Mind now does real case work. It receives three minimized rules, prepares the private response strategy, and leaves an exact history boundary before this process exits."  
**Action:** Show verified Process-A result from the deployed run and process separation receipt.

### Scene 3 / Flow 3: Process B remembers

**Screen:** Fresh returning-member session and new message; no private rules visible.  
**Voiceover:** "In a separate process, the returning member asks about the past incident. We do not restate the private rules. The same Mind resumes the stable alias and completes the bounded response from remembered context."  
**Action:** Submit the message and reveal the fresh live Mind response plus newer boundary digest.

### Scene 4 / Flow 4: Finite outcome

**Screen:** Consume action, sealed receipt, then disabled replay with `Already used`.  
**Voiceover:** "The Mind writes the response. Deterministic code owns authority. It consumes the grant once, seals a receipt, and rejects replay. Private context never appears in the interface."  
**Action:** Perform consume live and trigger replay rejection.

The rehearsal phase assigns scene start/end times from captured `startedAt`, `completedAt`, deterministic UI-transition measurements, and narration rehearsal. If the calculated total falls outside 90–120 seconds, narration/dwell is adjusted or same-run provider footage is time-cut and labeled; provider work is never rerun merely to obtain faster timing.

### Demo prerequisites and seed requirements

The seed script creates only deterministic pre-provider state. It must never create strategy or response artifacts.

| Item | Exact state | Created by |
|---|---|---|
| Synthetic case | `draft`, idempotent `OLT-DEMO-0001` public code | `scripts/seed-demo.ts` |
| Roles | Operator, synthetic Affected Participant context, Returning Member labels | static fixture |
| Authorization copy | one future community-participation topic | static seed fixture |
| Provider artifacts | absent | live Process A and B only |
| Receipt | absent | live consume only |

## 7. Risk Register

| # | Category | Risk | Severity | Likelihood | Impact | Mitigation | Tree |
|---|---|---|:---:|:---:|---|---|---|
| R1 | Technical | Minds API unavailable or credential invalid | CRITICAL | MEDIUM | No live product | Presence-safe preflight, Mind status and Cognition check before send | DT-1 |
| R2 | Technical | Semantic send is ambiguous | CRITICAL | MEDIUM | Retry could duplicate work | Never auto-resend; persist ambiguity and reconcile read-only | DT-2 |
| R3 | Technical | Process-B live history differs from stored boundary | CRITICAL | LOW | Continuity provenance fails | Stop before send and mark boundary mismatch | DT-3 |
| R4 | Technical | Mind output is malformed or refuses direct work | HIGH | MEDIUM | Artifact cannot advance state | Strict Zod parser and honest failed stage | DT-4 |
| R5 | Privacy | Private rule, alias, ID, or raw history leaks | CRITICAL | LOW | Participant harm and disqualification | Redacted view model, ignored owner-only raw evidence, secret scan | DT-5 |
| R6 | Authority | One-turn grant can be replayed | CRITICAL | LOW | Product claim fails | Row lock, expected version, receipt in same transaction | DT-6 |
| R7 | Demo | Provider latency exceeds video window | HIGH | HIGH | Demo loses narrative | Use measured footage from same verified run; keep consume live | DT-7 |
| R8 | Time | Full-app scope displaces vertical slice | HIGH | MEDIUM | No working submission | Freeze excluded scope and build risk-first P0 spine | DT-8 |
| R9 | Judging | Minds appears peripheral | HIGH | MEDIUM | Sponsor criterion fails | Show omitted-context Process-B response and exact boundaries | DT-9 |
| R10 | Competitive | Restorative-care claim looks like generic moderation | MEDIUM | MEDIUM | Innovation score stays weak | Lead with finite post-appeal handoff, not moderation automation | DT-10 |
| R11 | Scope | Email or broad tenancy enters core flow | HIGH | LOW | Proof becomes diffuse | Exclude email, Discord, tenancy, dashboards | DT-11 |
| R12 | Evidence | Historical 7.07 is presented as a PASS | HIGH | LOW | Truthfulness failure | Preserve override note in docs and submission review | DT-12 |

## 7.5 Judge Experience

- **10 seconds:** hero says “One private boundary. One remembered response. One last turn.” A completed verified case can be opened for the seven-step proof.
- **30 seconds:** judge sees Access and Contact separated, with the Process-A Minds checkpoint highlighted.
- **60 seconds:** judge can authorize a fresh synthetic case or inspect a verified completed run.
- **First visit:** explanatory hero, synthetic-case boundary, and one clear create action. A case view adds the timeline, Minds checkpoints, and proof strip. No login wall.
- **Seed invariant:** seed only deterministic draft state. Live Minds artifacts are earned and never synthesized.

## 7.6 Judge Proof Artifacts

- The inline proof strip plus redacted manifest shows SDK version, live/test class, history-boundary digests, process separation, latency, receipt digest, and replay result.
- `artifacts/implementation/thin-slice-live-manifest.json` stores the same redacted machine-readable evidence.
- `submission/proof.md` is generated later from the live manifest, never hand-authored from claims.
- No blockchain explorer links apply.

## 8. Build Plan

| Window | Objective | Deliverable |
|---|---|---|
| 0–3h | State, persistence, work contracts | Green domain, repository, transaction, and omission tests |
| 3–7h | Minds adapter and separate jobs | Provenance-bound A/B orchestration with safe CLI output |
| 7–10h | Guided UI and receipt | Judge-usable timeline and replay rejection |
| 10–14h | Full local gate and deployment | Production build, database migration, reachable app |
| 14–18h | Two-send live proof and rehearsal | Redacted manifest and evidence-derived 90–120-second rehearsal plan |
| Remaining buffer | Fix only P0 blockers | Submission-ready working slice |

## 9. Dependencies and Prerequisites

| Dependency | Version/status | Credential | Required before |
|---|---|---|---|
| Node.js | 22+; local 24.10.0 | none | build |
| Next.js / React | 16.3.3 / 19.2.8 | none | build |
| PostgreSQL | production reachable | `DATABASE_URL` | integration/deploy |
| Minds client | 0.1.4 installed | `MINDS_BUILDER_API_KEY`, `MINDS_MIND_ID` | live proof |
| Cognition | funded balance required | same Mind account | first semantic send |
| Vercel | deployment target | platform auth outside repository | deploy |

## 10. Concerns Compliance

| Severity | Concern | Product response | Verification |
|:---:|---|---|---|
| C | Demo integrity | Two real assignments, separate processes, no substitution | live manifest and omitted-context assertion |
| C | Authority and privacy | Application owns synthetic boundary state and consumption; no real-participant permission claim; UI is redacted | concurrency, leakage, and replay tests |
| I | Provider reliability | Exact failure stages and no semantic retry | fault tests and live failure handling |
| I | Deadline scope | Only the approved thin slice is P0 | file plan and scope review |
| A | Polish | Guided timeline, accessible statuses, mobile layout | screenshot and accessibility gate |

## PRD Quality Gate

| Metric | Actual | Result |
|---|---:|:---:|
| Component coverage | 9 table / 9 specs | PASS |
| Flow-demo alignment | 4 flows / 4 scenes | PASS |
| External API unavailable-risk coverage | 1 API / 1 unavailable risk | PASS |
| Critical concern compliance | 2 / 2 | PASS |
| Implementation code blocks over 10 lines | 0 | PASS |
| Risk minimum | 12 | PASS |

Historical forecast remains 7.07 failed. Emergency scope contains zero mocked product components.
