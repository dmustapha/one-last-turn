# Technical Spike: One Last Turn

**Date:** 2026-08-27
**Scope:** Thin working-product slice only

## Verified patterns

| Component | Pattern | Evidence | Confidence |
|---|---|---|:---:|
| Minds SDK | `createMindsClient`, `ensureConversation`, `sendMessage`, `waitForReply`, and `getHistory` exist in 0.1.4 | Installed package `node_modules/@animocabrands/minds-client-lib/dist/index.d.ts` and implementation | HIGH |
| Stable alias binding | `ensureConversation(alias, mindId)` creates or checks the alias-to-Mind binding | Installed 0.1.4 implementation, lines implementing conflict and mismatch handling | HIGH |
| Reply recovery | `waitForReply` uses event streaming then bounded history polling | Installed 0.1.4 implementation | HIGH |
| History pagination | `getHistory` returns newest-first pages and maps cursor to the wire `before` parameter | Installed 0.1.4 implementation plus existing proof harness tests | HIGH |
| Cognition checks | `getCognitionBalance`, usage, and usage-by-tool are exposed | Installed 0.1.4 declarations and implementation | HIGH |
| PostgreSQL CAS | Row locking, expected version, append-only events, and a unique aggregate version can enforce one-winner consumption | Existing migrations and integration harness in this repository | HIGH |

## Unverified live behavior

| Component | Unknown | Risk | Required proof |
|---|---|---|---|
| Funded Mind | Current credential, Mind status, and Cognition balance | Live work can stop before the first send | Presence-safe preflight plus `getMind` and `getCognitionBalance` |
| Provider latency | Reply time for the final direct assignments | Demo cannot assume a fixed duration | Measure the deployed two-send run; prerecord only that verified run |
| Semantic continuity | Process B applies omitted Process-A rules | Sponsor integration claim fails | Exact before/after history boundaries and content-level artifact validation |
| Production database | Cross-process persistence on the deployed target | Local-only success is insufficient | Apply migration, write in process A, read and advance in process B |

## Decisions

- No external delivery API is part of the thin-slice hero flow.
- Provider reads may retry; semantic sends never retry automatically after ambiguity.
- Process A and Process B are distinct entry points. Stable alias plus stored history boundary is their only provider handoff.
- Raw provider rows remain owner-only and Git-ignored. Tracked evidence contains digests, timestamps, versions, and booleans.
- Historical score 7.07 remains failed internal evidence. This spike validates build mechanics, not qualification.

## Round-trip obligation

The integration is verified only when the app performs the full round trip: Process A writes a live strategy and terminal history boundary, PostgreSQL preserves it after the process exits, Process B reconstructs the same alias and boundary, reads the live history, writes a fresh response, and the app consumes the one-turn grant exactly once. A send receipt without reconstruction and read-back is not proof.
