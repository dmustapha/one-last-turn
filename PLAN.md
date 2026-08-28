# One Last Turn — Forge Implementation Plan

## [EMERGENCY MODE — 0 components mocked]

**Project:** One Last Turn  
**Hackathon:** Creative Minds Jam #1: Hong Kong  
**Deadline:** 2026-08-28 23:59 HKT  
**Stack:** Next.js 16, React 19, TypeScript 6, PostgreSQL, Minds client 0.1.4  
**Architecture:** `ARCHITECTURE.md`  
**Scope authority:** committed thin-slice design and the task sequence below

This consolidates the approved implementation plan; it does not regenerate the product. Historical forecast 7.07 remains a failed internal qualification. Dami's strategy override authorizes building without rewriting that result.

## Repair Authority and Boundaries

This Plan supersedes the failed pre-repair draft preserved in Forge/Conductor history. It implements the selected thin slice without rewriting the historical 7.07 forecast. No provider operation occurs before Task 12, and no semantic send is automatically retried. The wider pipeline stops after Demo Rehearsal.

## Canonical Repaired Execution Plan

Every `--write` command atomically copies the named canonical block from `../ARCHITECTURE.md` into the app root. “Create/replace” is deliberate: the copy-exact blueprint replaces any same-path baseline. No file is hand-authored during Build.

### Task 0A: Bootstrap configuration — 0.25h

**Architecture reference:** §§12, 17, 26.
**Files — Create/replace:** `package.json`, `.env.example`, `tests/unit/config/env.test.ts`, `src/config/feature-flags.ts`, `src/config/env.ts`.
**Write bootstrap/test:** `for file in package.json .env.example tests/unit/config/env.test.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run red: `set -euo pipefail; RED_ROOT="$(mktemp -d)"; trap 'rm -rf "$RED_ROOT"' EXIT; for file in package.json .env.example tests/unit/config/env.test.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" "$RED_ROOT"; done; cd "$RED_ROOT"; npm install --ignore-scripts; set +e; RED_OUTPUT="$(npm test -- tests/unit/config/env.test.ts 2>&1)"; RED_STATUS=$?; set -e; test "$RED_STATUS" -ne 0; printf '%s\n' "$RED_OUTPUT" | rg -q 'src/config/env|Failed to resolve import|Cannot find module'`.
Expected red: missing `src/config/env` only.
**Write source:** `for file in src/config/feature-flags.ts src/config/env.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run green: `npm test -- tests/unit/config/env.test.ts`.
Expected green: three environment tests PASS.
**Commit:** `chore: install the thin-slice configuration contract`.

### Task 0B: Static knowledge and runner config — 0.50h

**Architecture reference:** §§12, 17–18, 26.
**Files — Create/replace:** `README.md`, `DOMAIN-GUIDE.md`, `playwright.config.ts`, `next.config.ts`, `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`. Next generates next-env.d.ts during the mandatory production build.
**Write:** `for file in README.md DOMAIN-GUIDE.md playwright.config.ts next.config.ts vitest.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run: `npm test -- tests/unit/config/env.test.ts && node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md ../PLAN.md`.
Expected: three environment tests PASS and the Forge artifact audit prints `"status": "PASS"`.
**Commit:** `docs: establish domain and verification boundaries`.

### Task 1: Finite domain and receipt — 1.00h

**Architecture reference:** §§3, 11.
**Files — Create/replace:** `tests/unit/domain/demo-case.test.ts`, `tests/unit/domain/demo-receipt.test.ts`, `src/domain/demo/demo-case.ts`, `src/domain/demo/demo-receipt.ts`.
**Write tests:** `for file in tests/unit/domain/demo-case.test.ts tests/unit/domain/demo-receipt.test.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run red: `npm test -- tests/unit/domain/demo-case.test.ts tests/unit/domain/demo-receipt.test.ts`.
Expected red: missing `src/domain/demo/demo-case` and `demo-receipt` modules only.
**Write source:** `for file in src/domain/demo/demo-case.ts src/domain/demo/demo-receipt.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run green: `npm test -- tests/unit/domain/demo-case.test.ts tests/unit/domain/demo-receipt.test.ts`.
Expected green: PASS; terminal replay and non-sequential receipt versions reject.
**Commit:** `feat: define finite one-turn authority`.

### Task 2: Work and provenance contracts — 1.00h

**Architecture reference:** §§6–7.
**Files — Create/replace:** `tests/unit/application/mind-work-contract.test.ts`, `src/application/minds/work-contract.ts`.
**Write tests:** `node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write tests/unit/application/mind-work-contract.test.ts .`.
Run red: `npm test -- tests/unit/application/mind-work-contract.test.ts`.
Expected red: missing work-contract module only.
**Write source:** `node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write src/application/minds/work-contract.ts .`.
Run green: `npm test -- tests/unit/application/mind-work-contract.test.ts`.
Expected green: PASS; strict JSON and Process-B omission checks hold.
**Commit:** `feat: define semantic and history evidence contracts`.

### Task 3: PostgreSQL projection and atomic service — 3.50h

**Architecture reference:** §§4–5, 11.
**Files — Create/replace:** `tests/integration/db/demo-case-repository.test.ts`, `tests/integration/db/demo-case-concurrency.test.ts`, `tests/unit/application/demo-case-service.test.ts`, `db/migrations/0009_demo_slice.sql`, `src/infrastructure/db/client.ts`, `src/infrastructure/db/migrations.ts`, `src/infrastructure/db/demo-case-repository.ts`, `src/application/demo-case-service.ts`, `scripts/migrate.ts`, `scripts/seed-demo.ts`.
**Write tests:** `for file in tests/integration/db/demo-case-repository.test.ts tests/integration/db/demo-case-concurrency.test.ts tests/unit/application/demo-case-service.test.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run red: `npm test -- tests/unit/application/demo-case-service.test.ts tests/integration/db/demo-case-repository.test.ts tests/integration/db/demo-case-concurrency.test.ts --no-file-parallelism`.
Expected red: missing demo-case-service/repository modules only; no migration or provider operation begins.
**Write source:** `for file in db/migrations/0009_demo_slice.sql src/infrastructure/db/client.ts src/infrastructure/db/migrations.ts src/infrastructure/db/demo-case-repository.ts src/application/demo-case-service.ts scripts/migrate.ts scripts/seed-demo.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run green: `npm test -- tests/unit/application/demo-case-service.test.ts && npm run db:migrate && npm run seed:demo && npm run seed:demo && npm test -- tests/integration/db/demo-case-repository.test.ts tests/integration/db/demo-case-concurrency.test.ts --no-file-parallelism`.
Expected green: unit and real PostgreSQL tests PASS; both seed runs print `CASE_CODE=OLT-DEMO-0001`; exactly one concurrent consume wins; the existing `_olt_migrations` digest ledger skips all applied files and rejects edited applied SQL.
**Commit:** `feat: persist and atomically consume demo cases`.

### Task 4: One-send Minds worker — 2.00h

**Architecture reference:** §7.
**Files — Create/replace:** `tests/unit/infrastructure/minds-worker.test.ts`, `tests/fault-injection/minds-failure.test.ts`, `tests/contract/minds-sdk.test.ts`, `src/infrastructure/minds/history.ts`, `src/infrastructure/minds/minds-worker.ts`.
**Write tests:** `for file in tests/unit/infrastructure/minds-worker.test.ts tests/fault-injection/minds-failure.test.ts tests/contract/minds-sdk.test.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run red: `npm test -- tests/unit/infrastructure/minds-worker.test.ts tests/fault-injection/minds-failure.test.ts`.
Expected red: missing minds-worker module only.
**Write source:** `for file in src/infrastructure/minds/history.ts src/infrastructure/minds/minds-worker.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run green: `npm test -- tests/unit/infrastructure/minds-worker.test.ts tests/fault-injection/minds-failure.test.ts tests/contract/minds-sdk.test.ts`.
Expected green: pagination, exact suffix, low-Cognition stop, one send, and read-only ambiguous-send recovery PASS.
**Commit:** `feat: bind one Mind send to complete history`.

### Task 5: Separate A/B jobs — 1.50h

**Architecture reference:** §8.
**Files — Create/replace:** `tests/unit/application/mind-jobs.test.ts`, `src/application/minds/run-strategy-job.ts`, `src/application/minds/run-response-job.ts`, `scripts/run-case-strategy.ts`, `scripts/run-case-response.ts`.
**Write tests:** `node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write tests/unit/application/mind-jobs.test.ts .`.
Run red: `npm test -- tests/unit/application/mind-jobs.test.ts`.
Expected red: missing strategy/response job modules only.
**Write source:** `for file in src/application/minds/run-strategy-job.ts src/application/minds/run-response-job.ts scripts/run-case-strategy.ts scripts/run-case-response.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run green: `npm test -- tests/unit/application/mind-jobs.test.ts`.
Expected green: invalid predecessors contact no provider; A/B CLI modules are distinct and outputs are fixed.
**Commit:** `feat: isolate strategy and response jobs`.

### Task 6: Deterministic controller surface — 1.50h

**Architecture reference:** §9.
**Files — Create/replace:** `tests/unit/application/demo-controller.test.ts`, `src/application/demo-controller.ts`, `src/application/demo-runtime.ts`, `src/app/actions.ts`, `src/app/api/health/route.ts`, `scripts/run-case-command.ts`.
**Write tests:** `node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write tests/unit/application/demo-controller.test.ts .`.
Run red: `npm test -- tests/unit/application/demo-controller.test.ts`.
Expected red: missing controller module only.
**Write source:** `for file in src/application/demo-controller.ts src/application/demo-runtime.ts src/app/actions.ts src/app/api/health/route.ts scripts/run-case-command.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run green: `npm test -- tests/unit/application/demo-controller.test.ts && npm run typecheck`.
Expected green: provider work is absent from server actions; strategy text and provider identifiers are absent from the view.
**Commit:** `feat: expose database-only case commands`.

### Task 7: Judge-facing timeline — 1.50h

**Architecture reference:** §10.
**Files — Create/replace:** `tests/unit/ui/case-timeline.test.tsx`, `tests/accessibility/thin-slice.test.tsx`, `src/app/components/case-timeline.tsx`, `src/app/components/action-panel.tsx`, `src/app/components/evidence-strip.tsx`, `src/app/page.tsx`, `src/app/globals.css`.
**Write tests:** `for file in tests/unit/ui/case-timeline.test.tsx tests/accessibility/thin-slice.test.tsx; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run red: `npm test -- tests/unit/ui/case-timeline.test.tsx tests/accessibility/thin-slice.test.tsx`.
Expected red: missing timeline/action-panel modules only.
**Write source:** `for file in src/app/components/case-timeline.tsx src/app/components/action-panel.tsx src/app/components/evidence-strip.tsx src/app/page.tsx src/app/globals.css; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run green: `npm test -- tests/unit/ui/case-timeline.test.tsx tests/accessibility/thin-slice.test.tsx && npm run build`.
Expected green: semantic current/running/closed states PASS and production build exits 0.
**Commit:** `feat: add the redacted proof timeline`.

### Task 8: Database-derived manifest — 1.00h

**Architecture reference:** §11.
**Files — Create/replace:** `tests/unit/evidence/live-manifest.test.ts`, `tests/unit/evidence/demo-timing.test.ts`, `tests/security/redaction.test.ts`, `src/evidence/live-manifest.ts`, `src/evidence/live-manifest-builder.ts`, `src/evidence/demo-timing.ts`, `scripts/write-live-manifest.ts`, `scripts/write-demo-timing.ts`, `scripts/capture-rehearsal-marker.ts`.
**Write tests:** `for file in tests/unit/evidence/live-manifest.test.ts tests/unit/evidence/demo-timing.test.ts tests/security/redaction.test.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run red: `npm test -- tests/unit/evidence/live-manifest.test.ts tests/unit/evidence/demo-timing.test.ts tests/security/redaction.test.ts`.
Expected red: missing live-manifest/demo-timing modules only.
**Write source:** `for file in src/evidence/live-manifest.ts src/evidence/live-manifest-builder.ts src/evidence/demo-timing.ts scripts/write-live-manifest.ts scripts/write-demo-timing.ts scripts/capture-rehearsal-marker.ts; do node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write "$file" .; done`.
Run green: `npm test -- tests/unit/evidence/live-manifest.test.ts tests/unit/evidence/demo-timing.test.ts tests/security/redaction.test.ts && npm run typecheck`.
Expected green: live origin/process instance, derived event versions/send count/digests/receipt/replay, timing bounds, and redaction checks PASS.
**Commit:** `feat: derive live proof from committed evidence`.

### Task 9: Read-only browser proof — 0.50h

**Architecture reference:** §§10, 18, 26.
**Files — Create/replace:** `tests/e2e/thin-slice.spec.ts`.
**Write:** `node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md --write tests/e2e/thin-slice.spec.ts .`.
Run: `npm run typecheck`.
Expected: PASS; Playwright execution waits for the deployed closed case in Task 12 and performs no provider send.
**Commit:** `test: add deployed redaction proof`.

### Task 10: Complete local gate — 1.00h

**Architecture reference:** §§17–18, 23, 27.
**Files — Create/replace:** none; all 62 authored Architecture files are now present.
**Write:** none.
Run: `node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md ../PLAN.md && npm run test:all && npm run typecheck && npm run lint && npm run build && git diff --check`.
Expected: audit PASS; all 40 canonical unit tests and all 4 canonical real-PostgreSQL integration tests PASS; contract/security/fault/accessibility, typecheck, lint, build, and diff checks exit 0.
**Commit:** `test: close the copy-exact local gate`.

### Task 11: Deployment preflight — 0.75h

**Architecture reference:** §§17, 20–22.
**Files — Create/replace:** none.
**Write:** none; deployment state remains Conductor-owned.
Run:
```bash
bash -euo pipefail <<'GATE'
npm run db:migrate
DEPLOY_OUTPUT="$(NO_COLOR=1 npx vercel --prod --yes 2>&1)"
printf '%s\n' "$DEPLOY_OUTPUT" >&2
APP_URL="$(printf '%s\n' "$DEPLOY_OUTPUT" | grep -Eo 'https://[^[:space:]]+' | tail -n1 | tr -d '\r')"
case "$APP_URL" in https://*) ;; *) echo APP_URL_CAPTURE_FAILED >&2; exit 1;; esac
export APP_URL
curl -fsS "$APP_URL/api/health" | jq -e '.status == "ready" and .database == true'
mkdir -p artifacts/implementation
APP_URL_TMP="artifacts/implementation/app-url.txt.tmp-$$"
printf '%s\n' "$APP_URL" > "$APP_URL_TMP"
mv "$APP_URL_TMP" artifacts/implementation/app-url.txt
GATE
```
Expected: migration exits 0, the captured value is HTTPS, deployment health returns database `ready`, and the URL is atomically persisted before any Minds send.
**Commit:** `chore: record healthy deployment preflight`.

### Task 12: Exact bounded live sequence — 2.00h

**Architecture reference:** §§20–22, 27.
**Files — Create/replace:** none. The redacted live manifest is a generated runtime output, not an Architecture source file.
**Write:** no source writes; the manifest command performs one atomic redacted runtime write.
Run:
```bash
npx vercel env run -e production -- bash -euo pipefail <<'LIVE'
npm run -s preflight:live-env
APP_URL="$(tr -d '\r\n' < artifacts/implementation/app-url.txt)"
case "$APP_URL" in https://*) ;; *) echo APP_URL_INVALID >&2; exit 1;; esac
export APP_URL
curl -fsS "$APP_URL/api/health" | jq -e '.status == "ready" and .database == true'
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
umask 077
install -d -m 700 artifacts/live-providers
SCREEN_INPUT="$({ ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true; } | npx tsx scripts/resolve-avfoundation-screen-input.ts)"
record_process() {
  local clip="$1"; shift
  ffmpeg -hide_banner -loglevel error -f avfoundation -framerate 30 -pixel_format nv12 -capture_cursor 1 \
    -i "$SCREEN_INPUT" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -y "$clip" \
    >"$clip.ffmpeg.log" 2>&1 &
  local recorder=$!
  sleep 1
  kill -0 "$recorder"
  set +e
  "$@" 2>&1 | tee "$clip.command.log" >&2
  local command_status=${PIPESTATUS[0]}
  set -e
  sleep 1
  kill -INT "$recorder" 2>/dev/null || true
  wait "$recorder" || true
  test -s "$clip"
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$clip" | awk '$1 > 0 { ok=1 } END { exit !ok }'
  cat "$clip.command.log"
  return "$command_status"
}
test "$(npm run -s seed:demo | tail -n1)" = CASE_CODE=OLT-DEMO-0001
CASE_LINE="$(npm run -s case:command -- create | tail -n1)"
case "$CASE_LINE" in CASE_CODE=OLT-*) ;; *) echo CASE_CREATE_FAILED >&2; exit 1;; esac
CASE_CODE="${CASE_LINE#CASE_CODE=}"
export CASE_CODE
test "$(npm run -s case:command -- authorize "$CASE_CODE" 0 | tail -n1)" = CASE_COMMAND=authorized
PROCESS_A_CLIP=artifacts/live-providers/process-a-same-run.mp4
test "$(record_process "$PROCESS_A_CLIP" npm run -s case:strategy -- "$CASE_CODE" | tail -n1)" = "CASE_STRATEGY=ready CODE=STRATEGY_READY"
test "$(npm run -s case:command -- submit-return "$CASE_CODE" 3 | tail -n1)" = CASE_COMMAND=returned
PROCESS_B_CLIP=artifacts/live-providers/process-b-same-run.mp4
test "$(record_process "$PROCESS_B_CLIP" npm run -s case:response -- "$CASE_CODE" | tail -n1)" = "CASE_RESPONSE=ready CODE=RESPONSE_READY"
test "$(npm run -s case:command -- consume "$CASE_CODE" 6 | tail -n1)" = CASE_COMMAND=closed
test "$(npm run -s evidence:manifest -- "$CASE_CODE" | tail -n1)" = LIVE_MANIFEST=ready
npx tsx -e 'import {readFileSync} from "node:fs"; import {liveManifestSchema} from "./src/evidence/live-manifest"; liveManifestSchema.parse(JSON.parse(readFileSync("artifacts/implementation/thin-slice-live-manifest.json","utf8")))'
E2E_CASE_CODE="$CASE_CODE" E2E_EXPECT_CLOSED=true npm run test:e2e -- tests/e2e/thin-slice.spec.ts
LIVE
```
Expected: ffmpeg captures each exact one-shot process from screen start through exit into ignored owner-only MP4 evidence; exactly one Process-A send and one later Process-B send; A exits before return submission/B; exact boundary and semantic checks pass; consume closes version 7; manifest command observes `DEMO_TERMINAL` replay rejection and derives a valid redacted manifest; browser proof PASS.
**Commit:** `docs: bind the deployed two-process proof`.

## Phase Gates

### Phase 0 Gate — Tasks 0A–0B (0.75h)

Run: `bash -euo pipefail -c 'npm test -- tests/unit/config/env.test.ts; node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md ../PLAN.md | jq -e '\''.status == "PASS"'\''; ! rg -n '\''createLiveMindTransport|sendMessage\('\'' src/config README.md DOMAIN-GUIDE.md playwright.config.ts'`.

- [ ] Configuration tests PASS.
- [ ] Root Forge audit PASS.
- [ ] No provider client is constructed or called.

### Phase 1 Gate — Tasks 1–3 (5.50h)

Run: `bash -euo pipefail -c 'npm test -- tests/unit/domain/demo-case.test.ts tests/unit/domain/demo-receipt.test.ts tests/unit/application/mind-work-contract.test.ts tests/unit/application/demo-case-service.test.ts; npm run db:migrate; test "$(npm run -s seed:demo | tail -n1)" = CASE_CODE=OLT-DEMO-0001; test "$(npm run -s seed:demo | tail -n1)" = CASE_CODE=OLT-DEMO-0001; npm test -- tests/integration/db/demo-case-repository.test.ts tests/integration/db/demo-case-concurrency.test.ts --no-file-parallelism'`.

- [ ] Domain, receipt, work-contract, service, repository, and concurrency tests PASS.
- [ ] Migration checksum enforcement and idempotent fixed seed PASS on real PostgreSQL.
- [ ] No provider client is constructed or called.

### Phase 2 Gate — Tasks 4–5 (3.50h)

Run: `bash -euo pipefail -c 'npm test -- tests/unit/infrastructure/minds-worker.test.ts tests/fault-injection/minds-failure.test.ts tests/contract/minds-sdk.test.ts tests/unit/application/mind-jobs.test.ts; npm run typecheck; ! rg -n '\''from ["'"'"'].*(?:src|scripts)/proof'\'' src/application src/infrastructure scripts/run-case-strategy.ts scripts/run-case-response.ts'`.

- [ ] Full history pagination, exact suffix, one-send, and ambiguous read-only recovery tests PASS.
- [ ] Separate A/B entry points and minimized Process-B input tests PASS.
- [ ] Production imports contain no `src/proof` or proof-script dependency.

### Phase 3 Gate — Tasks 6–9 (4.50h)

Run: `bash -euo pipefail -c 'npm test -- tests/unit/application/demo-controller.test.ts tests/unit/ui/case-timeline.test.tsx tests/unit/evidence/live-manifest.test.ts tests/unit/evidence/demo-timing.test.ts tests/security/redaction.test.ts tests/accessibility/thin-slice.test.tsx; npm run typecheck; npm run build; ! rg -n '\''createMindRuntime|createLiveMindTransport|sendMessage\('\'' src/app/actions.ts; ! rg -n -i '\''raw(alias|prompt|message)|mind[_ -]?id|history[_ -]?fingerprint|provider[_ -]?message\'' artifacts/implementation submission 2>/dev/null; node ../scripts/value-safe-scan.mjs ..'`.

- [ ] Server actions are database-only and expected-version protected.
- [ ] Redaction, UI, accessibility, manifest, typecheck, and build gates PASS.
- [ ] No tracked output contains raw alias, Mind ID, prompt, fingerprint, or provider message.

### Phase 4 Gate — Tasks 10–12 (3.75h)

Run local gate: `bash -euo pipefail -c 'node ../scripts/forge-artifact-audit.mjs ../ARCHITECTURE.md ../PLAN.md | jq -e '\''.status == "PASS"'\''; npm run test:all; npm run typecheck; npm run lint; npm run build; git diff --check; node ../scripts/value-safe-scan.mjs ..'`; then execute the exact Task 11 and Task 12 blocks once.
Capture measured rehearsal beats from the verified run: `PROCESS_A_CLIP=artifacts/live-providers/process-a-same-run.mp4; PROCESS_B_CLIP=artifacts/live-providers/process-b-same-run.mp4; test -s "$PROCESS_A_CLIP"; test -s "$PROCESS_B_CLIP"; npm run -s rehearsal:mark -- reset; npm run -s rehearsal:mark -- opening narration; npm run -s rehearsal:mark -- process-a process_a same_run_time_cut "$PROCESS_A_CLIP"; npm run -s rehearsal:mark -- handoff ui; npm run -s rehearsal:mark -- process-b process_b same_run_time_cut "$PROCESS_B_CLIP"; npm run -s rehearsal:mark -- close narration`.
Run rehearsal timing: `test "$(npm run -s evidence:timing -- artifacts/implementation/thin-slice-live-manifest.json artifacts/implementation/rehearsal-markers.json | tail -n1)" = DEMO_TIMING=ready && jq -e '.withinTarget == true and .totalMs >= 90000 and .totalMs <= 120000' artifacts/implementation/thin-slice-demo-timing.json`.

- [ ] Complete local gate and value-safe secret/permission scan PASS.
- [ ] HTTPS deployment/database health PASS before provider work.
- [ ] Exact A→exit→return→B→consume→replay→manifest sequence PASS, or stop honestly at the first failed row.
- [ ] Demo Rehearsal derives a 90–120-second plan from measured provider and deterministic transition evidence; no hard-coded duration.

## Risk Decision Trees

### DT-1: Minds API unavailable or credential invalid
Run: `npm run -s case:strategy -- "$CASE_CODE"`.
Expected: exact terminal line `CASE_STRATEGY=ready CODE=STRATEGY_READY`.
If success: persist/read back Process-A evidence and let the process exit.
If error: for `MINDS_COGNITION_EMPTY`, `MINDS_RUNTIME_DISABLED`, or `STRATEGY_FAILED`, verify credential presence and provider account status without printing values; fund Cognition if empty.
Rerun: `npx tsx -e 'import {createLiveMindTransport} from "./src/infrastructure/minds/minds-worker"; void (async()=>{const key=process.env.MINDS_BUILDER_API_KEY,id=process.env.MINDS_MIND_ID;if(!key||!id)throw Error("MINDS_CREDENTIALS_MISSING");if(await createLiveMindTransport(key).getCognitionBalance(id)<=0)throw Error("MINDS_COGNITION_EMPTY");console.log("MINDS_PREFLIGHT=ready")})()'` read-only after external repair; never rerun the semantic command for this case.
Verified alternative: after the external condition is corrected, run `CASE_LINE="$(npm run -s case:command -- create | tail -n1)"; case "$CASE_LINE" in CASE_CODE=OLT-*) ;; *) exit 1;; esac; CASE_CODE="${CASE_LINE#CASE_CODE=}"; test "$(npm run -s case:command -- authorize "$CASE_CODE" 0 | tail -n1)" = CASE_COMMAND=authorized` to create and authorize a fresh synthetic case.
Terminal fallback: mark live proof FAIL and stop before Process B.

### DT-2: Semantic send is ambiguous
Run: `npx tsx -e 'import {createCaseRuntime} from "./src/application/demo-runtime"; void (async()=>{const r=createCaseRuntime(process.env);try{const x=await r.cases.findByCode(process.env.CASE_CODE!);if(x?.failureCode!=="MINDS_SEND_AMBIGUOUS")throw Error("AMBIGUITY_NOT_PERSISTED");console.log("AMBIGUITY=terminal")}finally{await r.close()}})()'`.
Expected: `AMBIGUITY=terminal`, proving the persisted case stopped after bounded reconciliation was exhausted.
If success: keep the case terminal and do not continue or resend.
If error: for `MINDS_SEND_AMBIGUOUS`, keep the persisted redacted failure terminal; provider history remains the only read-only forensic source.
Rerun: `npm test -- tests/fault-injection/minds-failure.test.ts`; no live A/B rerun for that case because immediate bounded history recovery is already exhausted.
Verified alternative: a fresh case after review, never the ambiguous case.
Terminal fallback: fail the affected live row.

### DT-3: Process-B live history differs from stored boundary
Run: `npm run -s case:response -- "$CASE_CODE"`.
Expected: `CASE_RESPONSE=ready CODE=RESPONSE_READY` with stored A-after equal to B-before.
If success: continue to consume.
If error: for `MINDS_HISTORY_BOUNDARY_MISMATCH`, inspect all four redacted boundary fields and owner-only history.
Rerun: `npm test -- tests/unit/infrastructure/minds-worker.test.ts -t 'boundary'`; the live case is terminal and Process B is not invoked again.
Verified alternative: none for that case; a new case must establish a new A boundary.
Terminal fallback: stop before any Process-B semantic send.

### DT-4: Mind output is malformed or refuses direct work
Run: `npm test -- tests/unit/application/mind-work-contract.test.ts tests/unit/application/mind-jobs.test.ts`.
Expected: one strict JSON artifact and all semantic constraints PASS.
If success: persist the validated artifact.
If error: for `MIND_ARTIFACT_NOT_SINGLE_JSON`, `MIND_ARTIFACT_INVALID_JSON`, or `MIND_RESPONSE_MISSING_REMEMBERED_CONSTRAINTS`, persist the redacted failure code.
Rerun: `npm test -- tests/unit/application/mind-work-contract.test.ts`; never request another provider reply.
Verified alternative: none for the live claim.
Terminal fallback: stop without a second semantic send.

### DT-5: Private rule, alias, ID, or raw history leaks
Run: `node ../scripts/value-safe-scan.mjs ..`.
Expected: zero tracked matches; raw directory 0700, raw files and `.env.local` 0600.
If success: continue.
If error: for `SECRET_VALUE_MATCH` or a permission mismatch, remove tracked exposure, restrict permissions, and rotate externally exposed credentials.
Rerun: `node ../scripts/value-safe-scan.mjs ..`; it reports category counts only, never matched values.
Verified alternative: use only digest/classification fields in the tracked manifest.
Terminal fallback: block commit and deployment.

### DT-6: One-turn grant can be replayed
Run: `npm test -- tests/integration/db/demo-case-concurrency.test.ts` and `npm run -s evidence:manifest -- "$CASE_CODE"` after close.
Expected: exactly one consume winner and manifest command observes `DEMO_TERMINAL`.
If success: record replayRejected true from the observed error.
If error: for `LIVE_REPLAY_WAS_ACCEPTED`, inspect row lock, expected-version predicate, and receipt transaction.
Rerun: `npm test -- tests/integration/db/demo-case-concurrency.test.ts --no-file-parallelism`; never rewrite live evidence.
Verified alternative: none; replay authority is load-bearing.
Terminal fallback: block live proof.

### DT-7: Provider latency exceeds video window
Run: `test "$(npm run -s evidence:timing -- artifacts/implementation/thin-slice-live-manifest.json artifacts/implementation/rehearsal-markers.json | tail -n1)" = DEMO_TIMING=ready && jq -e '.withinTarget == true and .totalMs >= 90000 and .totalMs <= 120000' artifacts/implementation/thin-slice-demo-timing.json`.
Expected: evidence-derived total fits 90–120 seconds.
If success: keep the selected deterministic beat live.
If error: for `TIMING_OUT_OF_RANGE`, shorten narration/dwell and visibly time-cut provider footage from the same verified run.
Rerun: the exact `evidence:timing` and `jq` command above after editing measured narration/UI markers; no provider resend.
Verified alternative: same-run prerecorded provider footage labeled on screen; no faster resend.
Terminal fallback: block any unmeasured timing claim.

### DT-8: Full-app scope displaces vertical slice
Run: `test -z "$({ git diff --name-only; git ls-files --others --exclude-standard; } | sort -u | rg '(email|clerk|tenant|discord|multi-turn)' || true)"`.
Expected: no newly added critical-path match outside frozen baseline.
If success: continue P0.
If error: remove only the newly added out-of-scope dependency.
Rerun: the exact combined tracked/untracked path command above, then the Phase 4 local gate.
Verified alternative: preserve the 62-file authored canonical slice only.
Terminal fallback: request user authority if removal would overwrite unrelated work.

### DT-9: Minds appears peripheral
Run: `npx tsx -e 'import {readFileSync} from "node:fs"; import {liveManifestSchema} from "./src/evidence/live-manifest"; liveManifestSchema.parse(JSON.parse(readFileSync("artifacts/implementation/thin-slice-live-manifest.json","utf8")))'`.
Expected: same Mind/alias, exact A-after/B-before, distinct processes, two exact exchanges, semantic constraints, receipt, and replay rejection.
If success: show those redacted classes in the proof strip.
If error: mark the missing integration row FAIL.
Rerun: the exact schema command above over existing evidence only.
Verified alternative: none; mocks or activity counts cannot replace the outcome.
Terminal fallback: block sponsor-depth claims.

### DT-10: Restorative-care claim looks like generic moderation
Run: `REHEARSAL_SCRIPT=artifacts/implementation/rehearsal-script.md; mkdir -p "$(dirname "$REHEARSAL_SCRIPT")"; REHEARSAL_TMP="$REHEARSAL_SCRIPT.tmp-$$"; awk '/^## 6\. Measured Demo Script Template/{copy=1} /^## 7\./{copy=0} copy' ../PRD.md > "$REHEARSAL_TMP"; mv "$REHEARSAL_TMP" "$REHEARSAL_SCRIPT"; test -s "$REHEARSAL_SCRIPT" && rg -qi 'appeal' README.md src/app/page.tsx "$REHEARSAL_SCRIPT" && rg -qi 'access.*contact|contact.*access' README.md src/app/page.tsx "$REHEARSAL_SCRIPT" && rg -qi 'one.turn|finite' README.md src/app/page.tsx "$REHEARSAL_SCRIPT"`.
Expected: all three communicate access/contact separation, remembered boundary, and one-turn receipt.
If success: retain copy.
If error: revise copy only; do not add features.
Rerun: the exact `rg` checklist above after copy-only repair.
Verified alternative: lead with the finite receipt demo beat.
Terminal fallback: keep product behavior unchanged and flag narrative risk for rehearsal.

### DT-11: Email or broad tenancy enters core flow
Run: `! rg -n 'from .*?(resend|clerk)|CONTACT_LANE_ENABLED=true' src/application/demo-* src/app/actions.ts scripts/run-case-*.ts`.
Expected: no output.
If success: continue.
If error: remove the newly introduced integration from the thin-slice dependency graph.
Rerun: `! rg -n 'from .*?(resend|clerk)|CONTACT_LANE_ENABLED=true' src/application/demo-* src/app/actions.ts scripts/run-case-*.ts && npm run typecheck`.
Verified alternative: synthetic boundary state and opaque public case code.
Terminal fallback: stop for scope authority if removal affects unrelated baseline code.

### DT-12: Historical 7.07 is presented as a PASS
Run: `! rg -n '7\.07.*(?:pass|qualified|championship)' README.md PRD.md ARCHITECTURE.md PLAN.md submission 2>/dev/null`.
Expected: no claim that 7.07 passed or qualified.
If success: continue truthful packaging.
If error: replace only the false qualification sentence with the recorded strategy-override truth.
Rerun: `! rg -n '7\.07.*(?:pass|qualified|championship)' README.md PRD.md ARCHITECTURE.md PLAN.md submission 2>/dev/null`.
Verified alternative: state that the organizer permits the build while the historical internal gate failed.
Terminal fallback: block submission copy.

## Canonical Plan Gate

The Plan contains 14 tasks, 14 Architecture references, 14 commit messages, five explicit phase gates, 12 risk-aligned executable decision trees, exact commands for all 62 authored Architecture files, and phase budgets totaling exactly 18.0 hours. Task 12 is the only provider stage and stops on the first failed evidence row.


## Post-build Task 12A repair gate

This bounded repair was added after the failed Task-12 autopsy and does not alter the historical 18-hour Forge estimate or 62-file materialization denominator.

**Files:** the two post-build journal migrations, the send-attempt domain module, the existing demo repository/service, Minds worker/jobs, and targeted unit/PostgreSQL tests.

**Required order:** observe regression RED; atomically prepare one attempt with the case claim; commit `send_outcome_unknown` before the sole semantic send; persist acknowledgement and complete exchange separately; bind every redacted provenance field; forbid live transport without the journal; verify unit, PostgreSQL integration, contract, security, fault, accessibility, typecheck, lint, and build gates.

**Fresh-run gate:** do not reuse the terminal failed case. Before any new case, the exact runtime must pass `preflight:live-env`, authenticated read-only Mind/enabled/Cognition checks, value-safe secret custody, and the full local gate. A new Process-A semantic send still requires explicit Dami authorization. No automatic retry and no Process B unless Process A records valid live-SDK exchange evidence.
