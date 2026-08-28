# One Last Turn

> A finite, post-appeal community handoff. A persistent Minds agent carries a private moderation strategy across two separate processes and completes exactly one controlled returning-member response, without ever re-exposing the private rules.

**Live demo:** https://one-last-turn.vercel.app · **Health:** https://one-last-turn.vercel.app/api/health

Built for **Creative Minds Jam #1** — Moderation and Community Assistance track.

![One Last Turn](docs/images/landing.png)

## What Is One Last Turn?

Moderation does not end when a ban is lifted. The hardest moment is the member's very next message, and today no tool remembers what the moderation team privately agreed. Whoever responds either over-explains and re-exposes the private terms, or fumbles the re-entry and the conflict reignites.

One Last Turn closes that gap. General access is decided by humans, independently. If an affected participant authorizes exactly one bounded topic, a persistent Minds Mind carries the private response strategy across two separate processes and completes one controlled returning-member response. The private boundary text is never restated or exposed.

The design splits responsibility cleanly:

- **The Mind holds the continuity.** The same funded alias is resumed across two independent processes, carrying the strategy from persistent memory.
- **PostgreSQL holds the authority.** Authorization, one-time consumption, and replay rejection are enforced in transactional application code, not by the model.

Neither can be bypassed by the other. Remove the Mind and the continuity is gone; remove the database and the one turn could be spent twice.

## How It Works

1. **Open the case.** An operator opens a synthetic re-entry case for a returning member.
2. **Authorize one topic.** An affected participant authorizes a single forward-looking topic. The private boundary is recorded, never shown again.
3. **Process A prepares the strategy.** The app assigns the Minds agent real case-analysis work, establishes a private response strategy, exits, and records the exact provider-history boundary.
4. **Separate session, new message.** A returning member submits a new message in a fully separate process.
5. **Process B resumes from memory.** The same stable Mind alias is resumed with no restating of the rules, and completes the response purely from remembered context.
6. **Consume the one turn atomically.** PostgreSQL validates authority, spends the one-time grant, writes a receipt, and rejects any replay.
7. **Prove the handoff.** The guided timeline UI shows the cross-process continuity and the finite outcome, without revealing the private boundary text.

```
Operator ─▶ Case (PostgreSQL: authority + one-turn grant)
                │
     Process A ─┴─▶ Minds Mind (alias X)  ── prepares private strategy ──▶ history boundary recorded
                                    │  (persistent memory)
     Process B ───▶ Minds Mind (alias X)  ── resumes from memory, no rules restated ──▶ one response
                │
                ▼
   PostgreSQL: validate authority ▶ consume one turn atomically ▶ write receipt ▶ reject replay
                │
                ▼
        Guided timeline UI (proves handoff, hides private text)
```

## Tech Stack

- **Framework:** Next.js 16, React 19
- **Language:** TypeScript
- **Agent:** `@animocabrands/minds-client-lib` 0.1.4 (Minds by Animoca Brands)
- **Datastore:** PostgreSQL with transactional one-time-consumption and replay rejection
- **Validation:** Zod-validated Mind artifacts
- **Entry points:** separate Process-A and Process-B CLI invocations sharing one stable alias
- **Deploy:** Vercel

## Running Locally

Requires Node 22 and a PostgreSQL database.

```bash
cp .env.example .env.local   # fill in DATABASE_URL and Minds credentials
npm install
npm run db:migrate
npm run test:all && npm run typecheck && npm run lint && npm run build
npm run dev
```

The two live entry points each permit exactly one semantic send and never auto-retry an ambiguous send. Raw provider material stays in ignored, owner-readable evidence; tracked manifests contain digests and classifications only.

## Project Structure

```
src/
  application/     # demo-case service, runtime, controller (orchestration)
  domain/demo/     # case + receipt domain model (authority + one-turn rules)
  infrastructure/  # PostgreSQL repository, Minds worker integration
  evidence/        # provider-honest timing and redacted manifests
db/migrations/     # schema, one-time receipt, demo slice
tests/             # unit + integration (domain, service, concurrency)
scripts/           # seed-demo, timing, process entry points
```

## Design Constraints

- Two live semantic sends maximum on the happy path (one per process).
- No automatic semantic retry after ambiguity.
- No mock or scripted substitution in live evidence.
- No exposure of credentials, raw IDs, aliases, prompts, or provider messages.

## License

MIT © Dami Mustapha
