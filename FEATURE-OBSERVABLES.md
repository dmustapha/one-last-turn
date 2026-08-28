# One Last Turn Feature Observables

| ID | Feature | Observable | Test command | Sentinel failure | Verified by |
|---|---|---|---|---|---|
| F-001 | Bounded authorization | Strategy claim before authorization returns `DEMO_TRANSITION` and performs zero provider calls | `npm test -- tests/unit/application/demo-case-service.test.ts` | provider call count is nonzero | build unit gate |
| F-002 | Process-A live strategy | Strategy digest is nonempty and terminal boundary count exceeds its initial count | `npm run case:strategy -- "$CASE_CODE"` | strategy job is not ready | live proof |
| F-003 | Process-B remembered response | Prompt omits every A-only phrase and fresh response satisfies stored safe scope | `npm test -- tests/unit/application/mind-jobs.test.ts` | A-only phrase or fallback/mock response | build plus live proof |
| F-004 | One-turn receipt | Two concurrent consumes produce one receipt and one terminal rejection | `npm test -- tests/integration/db/demo-case-concurrency.test.ts` | two successful consumes | database gate |
| F-005 | Judge timeline | Landing shows full timeline and both Minds checkpoints without login or raw evidence | `npm run test:e2e -- tests/e2e/thin-slice.spec.ts` | timeline or checkpoint absent | E2E gate |
| F-006 | Failure visibility | Low Cognition stops before send and renders a redacted failure stage | `npm run test:fault` | semantic send count exceeds zero | fault gate |

The live manifest is final authority for F-002 and F-003. Test transports cannot satisfy live observables.
