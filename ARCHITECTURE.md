# One Last Turn — Architecture Document

## [EMERGENCY MODE — 0 components mocked]

**Version:** 2.0 — bounded manual repair after final Forge audit  
**Date:** 2026-08-27  
**Primary stack:** Full-stack web with external agent integration  
**Scope:** Approved thin working-product vertical slice only

This document is the copy-exact architectural source of truth. Every file in the tree has one complete tagged block below. Existing frozen domain and proof-harness files remain untouched historical context and are not production imports for this slice.

## 1. System Overview

### Purpose

Prove that one funded Minds Mind can perform real community-assistance work across two separate processes while deterministic code owns authorization, state transitions, privacy, one-turn limits, and receipts.

### Critical-path diagram

<pre>
Browser roles
  Operator -> Affected Participant -> Returning Member
        | validated server actions
        v
DemoController -> DemoCaseService -> PostgreSQL
        |               |              |
        |               | claim/CAS    | exact boundaries + artifacts
        |               v              |
        +--------> StrategyJob(A) ------+
                         | one send
                         v
                  Minds SDK 0.1.4
                         ^
                         | same alias, omitted rules, one send
        +--------> ResponseJob(B) ------+
        |               |
        v               v
Redacted view <- Receipt + replay rejection
</pre>

### Technology stack

| Technology | Pinned version | Purpose | Verification |
|---|---:|---|---|
| Node.js | >=22 | Runtime and separate job processes | [VERIFIED] package engine and local runtime |
| TypeScript | 6.0.3 | Strict application code | [VERIFIED] package lock |
| Next.js | 16.3.3 | App Router, server actions, deployment | [VERIFIED] installed package |
| React | 19.2.8 | Guided timeline | [VERIFIED] installed package |
| PostgreSQL client | 3.4.9 | Transactions and row locks | [VERIFIED] installed package |
| Zod | 4.4.3 | Work artifact and action validation | [VERIFIED] installed package |
| Minds client | 0.1.4 | Messaging, history, Cognition | [VERIFIED] installed declarations and implementation |
| Vitest / Playwright | 4.1.11 / 1.62.1 | Unit, integration, browser, accessibility gates | [VERIFIED] installed packages |

### Planned file structure

The 62 authored active thin-slice source, configuration, documentation, and test units below are the complete Forge delta. Next 16.3.3 generates `next-env.d.ts` during `next build`; that generated file is deliberately outside the authored-block/header denominator. Generated raw evidence and frozen, unreferenced baseline proof experiments are also excluded. `tailwind.config.ts` and `drizzle.config.ts` are retained inert baseline files: Tailwind 4 is configured through PostCSS and no Drizzle-kit command or schema path is part of this slice.

<pre>
one-last-turn/
├── package.json
├── .env.example
├── README.md
├── DOMAIN-GUIDE.md
├── playwright.config.ts
├── next.config.ts
├── vitest.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
├── db/migrations/0009_demo_slice.sql
├── scripts/migrate.ts
├── scripts/seed-demo.ts
├── scripts/run-case-strategy.ts
├── scripts/run-case-response.ts
├── scripts/run-case-command.ts
├── scripts/write-live-manifest.ts
├── scripts/write-demo-timing.ts
├── scripts/capture-rehearsal-marker.ts
├── src/config/env.ts
├── src/config/feature-flags.ts
├── src/infrastructure/db/client.ts
├── src/infrastructure/db/migrations.ts
├── src/domain/demo/demo-case.ts
├── src/domain/demo/demo-receipt.ts
├── src/evidence/live-manifest.ts
├── src/evidence/live-manifest-builder.ts
├── src/evidence/demo-timing.ts
├── src/application/demo-case-service.ts
├── src/application/demo-controller.ts
├── src/application/demo-runtime.ts
├── src/application/minds/work-contract.ts
├── src/application/minds/run-strategy-job.ts
├── src/application/minds/run-response-job.ts
├── src/infrastructure/db/demo-case-repository.ts
├── src/infrastructure/minds/history.ts
├── src/infrastructure/minds/minds-worker.ts
├── src/app/actions.ts
├── src/app/api/health/route.ts
├── src/app/page.tsx
├── src/app/globals.css
├── src/app/components/case-timeline.tsx
├── src/app/components/action-panel.tsx
├── src/app/components/evidence-strip.tsx
├── tests/unit/domain/demo-case.test.ts
├── tests/unit/domain/demo-receipt.test.ts
├── tests/unit/evidence/live-manifest.test.ts
├── tests/unit/evidence/demo-timing.test.ts
├── tests/unit/application/mind-work-contract.test.ts
├── tests/unit/application/demo-case-service.test.ts
├── tests/unit/application/mind-jobs.test.ts
├── tests/unit/application/demo-controller.test.ts
├── tests/unit/infrastructure/minds-worker.test.ts
├── tests/unit/ui/case-timeline.test.tsx
├── tests/unit/config/env.test.ts
├── tests/integration/db/demo-case-repository.test.ts
├── tests/integration/db/demo-case-concurrency.test.ts
├── tests/contract/minds-sdk.test.ts
├── tests/security/redaction.test.ts
├── tests/fault-injection/minds-failure.test.ts
├── tests/accessibility/thin-slice.test.tsx
└── tests/e2e/thin-slice.spec.ts
</pre>

## 2. Component Architecture

| # | Component | Type | Primary files | Purpose | Dependencies |
|---|---|---|---|---|---|
| C1 | Demo aggregate | Domain | `src/domain/demo/demo-case.ts` | Legal lifecycle and terminals | none |
| C2 | Case repository | Data | migration, repository | Durable state, CAS, events | PostgreSQL |
| C3 | Transactional case service | Application | `demo-case-service.ts` | Atomic transitions and one-winner consume | C1, C2 |
| C4 | Mind work contract | Application | `work-contract.ts` | Direct prompts and strict artifacts | Zod |
| C5 | Provenance-bound worker | Integration | `history.ts`, `minds-worker.ts` | Exact send/reply/history binding | Minds SDK |
| C6 | Separate A/B jobs | Application | two jobs and two scripts | Cross-process continuity | C3, C4, C5 |
| C7 | Controller and actions | Server | controller, actions | Redacted command surface | C3, C6 |
| C8 | Timeline UI | Frontend | three components | Judge-facing guided flow | C7, React |
| C9 | Receipt and proof | Evidence | receipt, live manifest, seed, tests | Finite outcome and observable proof | C3, C5 |

### Dependency graph

<pre>
C1 -> C3
C2 -> C3
C4 -> C6
C5 -> C6
C3 -> C6 -> C7 -> C8
C3 -> C9 -> C8
</pre>

### State ownership

- PostgreSQL owns product truth and aggregate versions.
- The Minds provider owns raw conversation history.
- Stored history fingerprints bind those systems but never replace provider read-back.
- The browser owns no authority. It receives a redacted projection only.
- Raw evidence lives under ignored mode-0700 directories; files use mode 0600.

## 3. C1: Demo Aggregate

### Contract

#### File: `src/domain/demo/demo-case.ts`
[ASSUMED] — Complete behavior contract; build verifies with the adjacent unit test.

```typescript
// File: src/domain/demo/demo-case.ts
export const DEMO_STATES = [
  "draft", "authorized", "strategy_running", "strategy_ready", "returned",
  "response_running", "response_ready", "closed", "failed",
] as const;

export type DemoState = (typeof DEMO_STATES)[number];
export type DemoEvent =
  | "authorize" | "claim_strategy" | "record_strategy" | "submit_return"
  | "claim_response" | "record_response" | "consume_turn" | "fail";

export type DemoSnapshot = Readonly<{ state: DemoState; version: number }>;
export type TransitionResult =
  | Readonly<{ ok: true; value: DemoSnapshot }>
  | Readonly<{ ok: false; error: { code: "DEMO_TRANSITION" | "DEMO_TERMINAL" } }>;

const next: Readonly<Record<Exclude<DemoState, "closed" | "failed">, Partial<Record<DemoEvent, DemoState>>>> = {
  draft: { authorize: "authorized", fail: "failed" },
  authorized: { claim_strategy: "strategy_running", fail: "failed" },
  strategy_running: { record_strategy: "strategy_ready", fail: "failed" },
  strategy_ready: { submit_return: "returned", fail: "failed" },
  returned: { claim_response: "response_running", fail: "failed" },
  response_running: { record_response: "response_ready", fail: "failed" },
  response_ready: { consume_turn: "closed", fail: "failed" },
};

export function transition(snapshot: DemoSnapshot, event: DemoEvent): TransitionResult {
  if (snapshot.state === "closed" || snapshot.state === "failed") {
    return { ok: false, error: { code: "DEMO_TERMINAL" } };
  }
  const state = next[snapshot.state][event];
  return state
    ? { ok: true, value: { state, version: snapshot.version + 1 } }
    : { ok: false, error: { code: "DEMO_TRANSITION" } };
}
```

#### File: `tests/unit/domain/demo-case.test.ts`
[ASSUMED] — Build-time executable specification.

```typescript
// File: tests/unit/domain/demo-case.test.ts
import { describe, expect, it } from "vitest";
import { transition, type DemoEvent, type DemoSnapshot } from "../../../src/domain/demo/demo-case";

const path: readonly DemoEvent[] = [
  "authorize", "claim_strategy", "record_strategy", "submit_return",
  "claim_response", "record_response", "consume_turn",
];

describe("demo aggregate", () => {
  it("closes only through the complete path", () => {
    const result = path.reduce<DemoSnapshot>((state, event) => {
      const next = transition(state, event);
      if (!next.ok) throw new Error(next.error.code);
      return next.value;
    }, { state: "draft", version: 0 });
    expect(result).toEqual({ state: "closed", version: 7 });
    expect(transition(result, "consume_turn")).toMatchObject({ ok: false });
  });
});
```

## 4. C2: PostgreSQL Projection

### Data contract

#### File: `db/migrations/0009_demo_slice.sql`
[ASSUMED] — Must execute against local/test and production PostgreSQL before live proof.

```sql
-- File: db/migrations/0009_demo_slice.sql
create table if not exists demo_cases (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  state text not null check (state in ('draft','authorized','strategy_running','strategy_ready','returned','response_running','response_ready','closed','failed')),
  state_version integer not null default 0 check (state_version >= 0),
  authorized_topic text,
  authorized_at timestamptz,
  stable_alias text,
  mind_digest text check (mind_digest is null or mind_digest ~ '^[0-9a-f]{64}$'),
  strategy_artifact jsonb,
  strategy_digest text check (strategy_digest is null or strategy_digest ~ '^[0-9a-f]{64}$'),
  strategy_boundary jsonb,
  strategy_provenance jsonb,
  strategy_process_nonce uuid,
  strategy_ready_at timestamptz,
  return_message text,
  response_artifact jsonb,
  response_digest text check (response_digest is null or response_digest ~ '^[0-9a-f]{64}$'),
  response_boundary jsonb,
  response_provenance jsonb,
  response_process_nonce uuid,
  response_ready_at timestamptz,
  receipt_digest text check (receipt_digest is null or receipt_digest ~ '^[0-9a-f]{64}$'),
  receipt_evidence_classes text[],
  turn_consumed_at timestamptz,
  failure_stage text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((authorized_topic is null) = (authorized_at is null)),
  check ((strategy_artifact is null) = (strategy_digest is null)),
  check ((strategy_artifact is null) = (strategy_boundary is null)),
  check ((strategy_artifact is null) = (strategy_provenance is null)),
  check (strategy_provenance is null or strategy_process_nonce is not null),
  check ((response_artifact is null) = (response_digest is null)),
  check ((response_artifact is null) = (response_boundary is null)),
  check ((response_artifact is null) = (response_provenance is null)),
  check (response_provenance is null or response_process_nonce is not null),
  check ((failure_stage is null) = (failure_code is null)),
  check ((state = 'failed') = (failure_code is not null)),
  check ((state = 'closed') = (turn_consumed_at is not null)),
  check ((state = 'closed') = (receipt_digest is not null)),
  check ((receipt_digest is null) = (receipt_evidence_classes is null))
);

create table if not exists demo_case_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  case_id uuid not null references demo_cases(id) on delete cascade,
  aggregate_version integer not null,
  event_type text not null,
  redacted_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (case_id, aggregate_version, event_type)
);

create index if not exists demo_case_events_case_sequence_idx
  on demo_case_events(case_id, sequence asc);
```

#### File: `src/infrastructure/db/client.ts`
[VERIFIED] — Complete existing PostgreSQL client retained unchanged.

```typescript
// File: src/infrastructure/db/client.ts
import postgres from "postgres";

export type DatabaseSql = postgres.Sql | postgres.TransactionSql;
export interface DatabaseClient { close(): Promise<void>; sql: postgres.Sql; }

export function createDatabaseClient(input: { connectionString: string; max?: number }): DatabaseClient {
  const sql = postgres(input.connectionString, {
    max: input.max ?? 10,
    transform: { undefined: null },
  });
  return { close: async () => sql.end(), sql };
}
```

#### File: `src/infrastructure/db/migrations.ts`
[ASSUMED] — Production migration runner extracted from the already tested harness pattern.

```typescript
// File: src/infrastructure/db/migrations.ts
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { DatabaseClient } from "./client";

type Migration = Readonly<{ name: string; sql: string; checksum: string }>;

export async function discoverMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(path.join(directory, name), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

export async function applyMigrations(database: DatabaseClient, directory: string): Promise<readonly string[]> {
  await database.sql`create table if not exists _olt_migrations (
    name text primary key, digest text not null, applied_at timestamptz not null default now()
  )`;
  const applied = new Map((await database.sql<{ name: string; digest: string }[]>`
    select name, digest from _olt_migrations`).map((row) => [row.name, row.digest]));
  const completed: string[] = [];
  for (const migration of await discoverMigrations(directory)) {
    if (applied.has(migration.name)) {
      if (applied.get(migration.name) !== migration.checksum) {
        throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${migration.name}`);
      }
      continue;
    }
    await database.sql.begin(async (sql) => {
      await sql.unsafe(migration.sql);
      await sql`insert into _olt_migrations (name, digest) values (${migration.name}, ${migration.checksum})`;
    });
    completed.push(migration.name);
  }
  return completed;
}
```

#### File: `scripts/migrate.ts`
[ASSUMED] — Redacted deployment entry point; it never prints the connection string.

```typescript
// File: scripts/migrate.ts
import path from "node:path";

import { loadEnv } from "../src/config/env";
import { createDatabaseClient } from "../src/infrastructure/db/client";
import { applyMigrations } from "../src/infrastructure/db/migrations";

async function main(): Promise<void> {
  const config = loadEnv(process.env);
  if (!config.databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  const database = createDatabaseClient({ connectionString: config.databaseUrl, max: 1 });
  try {
    const applied = await applyMigrations(database, path.join(process.cwd(), "db", "migrations"));
    process.stdout.write(`MIGRATIONS_APPLIED=${applied.length}\n`);
  } finally { await database.close(); }
}

main().catch(() => { process.stderr.write("MIGRATIONS_FAILED\n"); process.exitCode = 1; });
```

#### File: `src/infrastructure/db/demo-case-repository.ts`
[ASSUMED] — Exact interface boundary; SQL implementation is verified in integration tests.

```typescript
// File: src/infrastructure/db/demo-case-repository.ts
import type postgres from "postgres";

import type { DemoState } from "../../domain/demo/demo-case";
import type { ReceiptEvidenceClass } from "../../domain/demo/demo-receipt";
import {
  responseArtifactSchema,
  strategyArtifactSchema,
  type ResponseArtifact,
  type StrategyArtifact,
} from "../../application/minds/work-contract";
import {
  exchangeEvidenceSchema,
  historyBoundarySchema,
  type ExchangeEvidence,
  type HistoryBoundary,
} from "../minds/history";
import type { DatabaseClient, DatabaseSql } from "./client";

export type DemoCaseRecord = Readonly<{
  id: string; publicCode: string; state: DemoState; stateVersion: number;
  authorizedTopic: string | null; authorizedAt: string | null;
  stableAlias: string | null; mindDigest: string | null;
  strategyArtifact: StrategyArtifact | null; strategyDigest: string | null;
  strategyBoundary: HistoryBoundary | null; strategyProvenance: ExchangeEvidence | null;
  strategyProcessNonce: string | null; strategyReadyAt: string | null;
  returnMessage: string | null;
  responseArtifact: ResponseArtifact | null; responseDigest: string | null;
  responseBoundary: HistoryBoundary | null; responseProvenance: ExchangeEvidence | null;
  responseProcessNonce: string | null; responseReadyAt: string | null;
  receiptDigest: string | null; receiptEvidenceClasses: readonly ReceiptEvidenceClass[] | null;
  turnConsumedAt: string | null; failureStage: string | null; failureCode: string | null;
}>;
export type ResponseJobInput = Readonly<{
  id: string; publicCode: string; state: "returned"; stateVersion: number;
  stableAlias: string; mindDigest: string; strategyBoundary: HistoryBoundary;
  strategyProcessInstanceId: string;
  returnMessage: string;
}>;
export type DemoLedgerEvent = Readonly<{
  sequence: number; version: number; event: string; payload: Readonly<Record<string, unknown>>; createdAt: string;
}>;
export interface DemoCaseRepository {
  createDraft(publicCode: string): Promise<DemoCaseRecord>;
  findByCode(publicCode: string): Promise<DemoCaseRecord | null>;
  findResponseJobInput(publicCode: string): Promise<ResponseJobInput | null>;
  lockByCode(publicCode: string): Promise<DemoCaseRecord | null>;
  save(record: DemoCaseRecord, expectedVersion: number): Promise<boolean>;
  appendEvent(input: { caseId: string; version: number; event: string; payload?: Record<string, unknown> }): Promise<void>;
  listEventsByCode(publicCode: string): Promise<readonly DemoLedgerEvent[]>;
  appendAuditEvent(publicCode: string, version: number, event: "replay_rejected", payload: Record<string, unknown>): Promise<void>;
}
export interface DemoCaseStore {
  findByCode(publicCode: string): Promise<DemoCaseRecord | null>;
  findResponseJobInput(publicCode: string): Promise<ResponseJobInput | null>;
  listEventsByCode(publicCode: string): Promise<readonly DemoLedgerEvent[]>;
  appendAuditEvent(publicCode: string, version: number, event: "replay_rejected", payload: Record<string, unknown>): Promise<void>;
  transaction<T>(work: (repository: DemoCaseRepository) => Promise<T>): Promise<T>;
}

type Row = Record<string, unknown>;

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.valueOf())) throw new Error("DEMO_ROW_TIME_INVALID");
  return date.toISOString();
}

function optionalJson<T>(value: unknown, parse: (input: unknown) => T): T | null {
  return value === null || value === undefined ? null : parse(value);
}

function rowToRecord(row: Row): DemoCaseRecord {
  return {
    id: String(row.id), publicCode: String(row.public_code), state: row.state as DemoState,
    stateVersion: Number(row.state_version), authorizedTopic: row.authorized_topic ? String(row.authorized_topic) : null,
    authorizedAt: iso(row.authorized_at), stableAlias: row.stable_alias ? String(row.stable_alias) : null,
    mindDigest: row.mind_digest ? String(row.mind_digest) : null,
    strategyArtifact: optionalJson(row.strategy_artifact, strategyArtifactSchema.parse),
    strategyDigest: row.strategy_digest ? String(row.strategy_digest) : null,
    strategyBoundary: optionalJson(row.strategy_boundary, historyBoundarySchema.parse),
    strategyProvenance: optionalJson(row.strategy_provenance, exchangeEvidenceSchema.parse),
    strategyProcessNonce: row.strategy_process_nonce ? String(row.strategy_process_nonce) : null,
    strategyReadyAt: iso(row.strategy_ready_at), returnMessage: row.return_message ? String(row.return_message) : null,
    responseArtifact: optionalJson(row.response_artifact, responseArtifactSchema.parse),
    responseDigest: row.response_digest ? String(row.response_digest) : null,
    responseBoundary: optionalJson(row.response_boundary, historyBoundarySchema.parse),
    responseProvenance: optionalJson(row.response_provenance, exchangeEvidenceSchema.parse),
    responseProcessNonce: row.response_process_nonce ? String(row.response_process_nonce) : null,
    responseReadyAt: iso(row.response_ready_at), receiptDigest: row.receipt_digest ? String(row.receipt_digest) : null,
    receiptEvidenceClasses: row.receipt_evidence_classes as ReceiptEvidenceClass[] | null,
    turnConsumedAt: iso(row.turn_consumed_at), failureStage: row.failure_stage ? String(row.failure_stage) : null,
    failureCode: row.failure_code ? String(row.failure_code) : null,
  };
}

function json(sql: DatabaseSql, value: object | null): postgres.Parameter | null {
  return value ? sql.json(value as postgres.JSONValue) : null;
}

const columns = `id, public_code, state, state_version, authorized_topic, authorized_at,
  stable_alias, mind_digest, strategy_artifact, strategy_digest, strategy_boundary,
  strategy_provenance, strategy_process_nonce, strategy_ready_at, return_message,
  response_artifact, response_digest, response_boundary, response_provenance,
  response_process_nonce, response_ready_at, receipt_digest, receipt_evidence_classes,
  turn_consumed_at, failure_stage, failure_code`;

export function createDemoCaseRepository(sql: DatabaseSql): DemoCaseRepository {
  return {
    async createDraft(publicCode) {
      const rows = await sql.unsafe<Row[]>(`insert into demo_cases (public_code, state, state_version)
        values ($1, 'draft', 0) returning ${columns}`, [publicCode]);
      if (!rows[0]) throw new Error("DEMO_CREATE_FAILED");
      return rowToRecord(rows[0]);
    },
    async findByCode(publicCode) {
      const rows = await sql.unsafe<Row[]>(`select ${columns} from demo_cases where public_code = $1`, [publicCode]);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async findResponseJobInput(publicCode) {
      const rows = await sql<{
        id: string; public_code: string; state: string; state_version: number; stable_alias: string | null;
        mind_digest: string | null; strategy_boundary: unknown; strategy_provenance: unknown; return_message: string | null;
      }[]>`select id, public_code, state, state_version, stable_alias, mind_digest,
          strategy_boundary, strategy_provenance, return_message from demo_cases where public_code = ${publicCode}`;
      const row = rows[0];
      if (!row) return null;
      if (row.state !== "returned" || !row.stable_alias || !row.mind_digest || !row.return_message) return null;
      const provenance = exchangeEvidenceSchema.parse(row.strategy_provenance);
      return { id: row.id, publicCode: row.public_code, state: "returned", stateVersion: row.state_version,
        stableAlias: row.stable_alias, mindDigest: row.mind_digest,
        strategyBoundary: historyBoundarySchema.parse(row.strategy_boundary),
        strategyProcessInstanceId: provenance.processInstanceId, returnMessage: row.return_message };
    },
    async lockByCode(publicCode) {
      const rows = await sql.unsafe<Row[]>(`select ${columns} from demo_cases where public_code = $1 for update`, [publicCode]);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    save: (record, expectedVersion) => saveRecord(sql, record, expectedVersion),
    async appendEvent(input) {
      await sql`insert into demo_case_events (case_id, aggregate_version, event_type, redacted_payload)
        values (${input.caseId}, ${input.version}, ${input.event}, ${sql.json((input.payload ?? {}) as postgres.JSONValue)})`;
    },
    async listEventsByCode(publicCode) {
      const rows = await sql<{ sequence: number; aggregate_version: number; event_type: string;
        redacted_payload: Record<string, unknown>; created_at: Date }[]>`
        select event.sequence, event.aggregate_version, event.event_type, event.redacted_payload, event.created_at
        from demo_case_events event join demo_cases demo on demo.id = event.case_id
        where demo.public_code = ${publicCode} order by event.sequence asc`;
      return rows.map((row) => ({ sequence: Number(row.sequence), version: row.aggregate_version,
        event: row.event_type, payload: row.redacted_payload, createdAt: row.created_at.toISOString() }));
    },
    async appendAuditEvent(publicCode, version, event, payload) {
      const rows = await sql`insert into demo_case_events (case_id, aggregate_version, event_type, redacted_payload)
        select id, ${version}, ${event}, ${sql.json(payload as postgres.JSONValue)} from demo_cases
        where public_code = ${publicCode} and state_version = ${version}
        on conflict (case_id, aggregate_version, event_type) do nothing returning id`;
      if (rows.length === 0) {
        const existing = await sql`select event.id from demo_case_events event join demo_cases demo on demo.id = event.case_id
          where demo.public_code = ${publicCode} and event.aggregate_version = ${version} and event.event_type = ${event}`;
        if (existing.length === 0) throw new Error("DEMO_AUDIT_EVENT_REJECTED");
      }
    },
  };
}

export function createPostgresDemoCaseStore(database: DatabaseClient): DemoCaseStore {
  return {
    findByCode: (code) => createDemoCaseRepository(database.sql).findByCode(code),
    findResponseJobInput: (code) => createDemoCaseRepository(database.sql).findResponseJobInput(code),
    listEventsByCode: (code) => createDemoCaseRepository(database.sql).listEventsByCode(code),
    appendAuditEvent: (code, version, event, payload) =>
      createDemoCaseRepository(database.sql).appendAuditEvent(code, version, event, payload),
    async transaction(work) {
      const [result] = await database.sql.begin((sql) => [work(createDemoCaseRepository(sql))]);
      if (result === undefined) throw new Error("DEMO_TRANSACTION_RESULT_MISSING");
      return result;
    },
  };
}

async function saveRecord(sql: DatabaseSql, record: DemoCaseRecord, expectedVersion: number): Promise<boolean> {
  const rows = await sql`update demo_cases set state = ${record.state}, state_version = ${record.stateVersion},
      authorized_topic = ${record.authorizedTopic}, authorized_at = ${record.authorizedAt},
      stable_alias = ${record.stableAlias}, mind_digest = ${record.mindDigest},
      strategy_artifact = ${json(sql, record.strategyArtifact)}, strategy_digest = ${record.strategyDigest},
      strategy_boundary = ${json(sql, record.strategyBoundary)}, strategy_provenance = ${json(sql, record.strategyProvenance)},
      strategy_process_nonce = ${record.strategyProcessNonce}, strategy_ready_at = ${record.strategyReadyAt},
      return_message = ${record.returnMessage}, response_artifact = ${json(sql, record.responseArtifact)},
      response_digest = ${record.responseDigest}, response_boundary = ${json(sql, record.responseBoundary)},
      response_provenance = ${json(sql, record.responseProvenance)}, response_process_nonce = ${record.responseProcessNonce},
      response_ready_at = ${record.responseReadyAt}, receipt_digest = ${record.receiptDigest},
      receipt_evidence_classes = ${record.receiptEvidenceClasses ? [...record.receiptEvidenceClasses] : null}, turn_consumed_at = ${record.turnConsumedAt},
      failure_stage = ${record.failureStage}, failure_code = ${record.failureCode}, updated_at = now()
    where id = ${record.id} and state_version = ${expectedVersion} returning id`;
  return rows.length === 1;
}
```

## 5. C3: Transactional Case Service

#### File: `src/application/demo-case-service.ts`
[ASSUMED] — Transaction semantics are mandatory; repository adapter supplies the transaction scope.

```typescript
// File: src/application/demo-case-service.ts
import { randomBytes } from "node:crypto";

import { transition, type DemoEvent } from "../domain/demo/demo-case";
import { createReceipt, RECEIPT_EVIDENCE_CLASSES } from "../domain/demo/demo-receipt";
import {
  type DemoCaseStore,
  type DemoCaseRecord,
  type DemoLedgerEvent,
  type ResponseJobInput,
} from "../infrastructure/db/demo-case-repository";
import { assertSameBoundary, sha256, type ExchangeEvidence } from "../infrastructure/minds/history";
import type { ResponseArtifact, StrategyArtifact } from "./minds/work-contract";

type Patch = Partial<Omit<DemoCaseRecord, "id" | "publicCode" | "state" | "stateVersion">>;
type PatchFactory = Patch | ((record: DemoCaseRecord) => Patch);

function assertEvidenceIdentity(record: DemoCaseRecord, evidence: ExchangeEvidence, nonce: string | null): void {
  if (!record.stableAlias || evidence.aliasDigest !== sha256(record.stableAlias)) throw new Error("DEMO_ALIAS_EVIDENCE_MISMATCH");
  if (!record.mindDigest || evidence.mindDigest !== record.mindDigest) throw new Error("DEMO_MIND_EVIDENCE_MISMATCH");
  if (!nonce || evidence.processNonce !== nonce) throw new Error("DEMO_PROCESS_NONCE_MISMATCH");
}

export class DemoCaseService {
  constructor(private readonly store: DemoCaseStore, private readonly now = () => new Date().toISOString()) {}

  async createCase(): Promise<DemoCaseRecord> {
    const code = `OLT-${randomBytes(6).toString("hex").toUpperCase()}`;
    return this.store.transaction((repository) => repository.createDraft(code));
  }

  async findByCode(code: string): Promise<DemoCaseRecord | null> {
    return this.store.findByCode(code);
  }

  async findResponseJobInput(code: string): Promise<ResponseJobInput | null> {
    return this.store.findResponseJobInput(code);
  }

  async listEventsByCode(code: string): Promise<readonly DemoLedgerEvent[]> {
    return this.store.listEventsByCode(code);
  }

  async recordReplayRejection(code: string, version: number): Promise<void> {
    await this.store.appendAuditEvent(code, version, "replay_rejected",
      { attemptedVersion: version, code: "DEMO_TERMINAL", observedAt: this.now() });
  }

  async verifyStrategyReadback(code: string, artifact: StrategyArtifact, evidence: ExchangeEvidence): Promise<void> {
    const record = await this.requireCase(code);
    if (record.strategyDigest !== sha256(JSON.stringify(artifact)) ||
        JSON.stringify(record.strategyBoundary) !== JSON.stringify(evidence.after) ||
        JSON.stringify(record.strategyProvenance) !== JSON.stringify(evidence)) {
      throw new Error("DEMO_STRATEGY_READBACK_MISMATCH");
    }
  }

  async verifyResponseReadback(code: string, artifact: ResponseArtifact, evidence: ExchangeEvidence): Promise<void> {
    const record = await this.requireCase(code);
    if (record.responseDigest !== sha256(JSON.stringify(artifact)) ||
        JSON.stringify(record.responseBoundary) !== JSON.stringify(evidence.after) ||
        JSON.stringify(record.responseProvenance) !== JSON.stringify(evidence)) {
      throw new Error("DEMO_RESPONSE_READBACK_MISMATCH");
    }
  }

  authorize(code: string, expectedVersion: number): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "authorize", {
      authorizedTopic: "community_participation", authorizedAt: this.now(),
    });
  }

  claimStrategy(code: string, expectedVersion: number, input: {
    alias: string; mindDigest: string; processNonce: string;
  }): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "claim_strategy", {
      stableAlias: input.alias, mindDigest: input.mindDigest, strategyProcessNonce: input.processNonce,
    });
  }

  recordStrategy(code: string, expectedVersion: number, artifact: StrategyArtifact, evidence: ExchangeEvidence): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "record_strategy", (record) => {
      assertEvidenceIdentity(record, evidence, record.strategyProcessNonce);
      return { strategyArtifact: artifact, strategyDigest: sha256(JSON.stringify(artifact)),
        strategyBoundary: evidence.after, strategyProvenance: evidence, strategyReadyAt: this.now() };
    }, { artifactDigest: sha256(JSON.stringify(artifact)), boundaryDigest: evidence.after.digest });
  }

  submitReturn(code: string, expectedVersion: number, message: string): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "submit_return", { returnMessage: message });
  }

  claimResponse(code: string, expectedVersion: number, processNonce: string): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "claim_response", (record) => {
      if (record.strategyProcessNonce === processNonce) throw new Error("DEMO_PROCESS_NONCE_REUSED");
      return { responseProcessNonce: processNonce };
    });
  }

  recordResponse(code: string, expectedVersion: number, artifact: ResponseArtifact, evidence: ExchangeEvidence): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "record_response", (record) => {
      assertEvidenceIdentity(record, evidence, record.responseProcessNonce);
      if (!record.strategyBoundary) throw new Error("DEMO_STRATEGY_BOUNDARY_MISSING");
      assertSameBoundary(record.strategyBoundary, evidence.before);
      return { responseArtifact: artifact, responseDigest: sha256(JSON.stringify(artifact)),
        responseBoundary: evidence.after, responseProvenance: evidence, responseReadyAt: this.now() };
    }, { artifactDigest: sha256(JSON.stringify(artifact)), boundaryDigest: evidence.after.digest });
  }

  async consumeTurn(code: string, expectedVersion: number): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "consume_turn", (current) => {
      if (!current.strategyDigest || !current.responseDigest ||
          !current.strategyReadyAt || !current.responseReadyAt) {
        throw new Error("DEMO_EVIDENCE_INCOMPLETE");
      }
      const consumedAt = this.now();
      const receiptDigest = createReceipt({ caseCodeDigest: sha256(code),
        strategyDigest: current.strategyDigest, responseDigest: current.responseDigest,
        beforeVersion: expectedVersion, afterVersion: expectedVersion + 1,
        strategyReadyAt: current.strategyReadyAt, responseReadyAt: current.responseReadyAt,
        consumedAt, evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] });
      return { receiptDigest, receiptEvidenceClasses: RECEIPT_EVIDENCE_CLASSES,
        turnConsumedAt: consumedAt };
    });
  }

  fail(code: string, expectedVersion: number, stage: string, failureCode: string): Promise<DemoCaseRecord> {
    return this.mutate(code, expectedVersion, "fail", { failureStage: stage, failureCode });
  }

  private async requireCase(code: string): Promise<DemoCaseRecord> {
    const record = await this.findByCode(code);
    if (!record) throw new Error("DEMO_CASE_NOT_FOUND");
    return record;
  }

  private mutate(code: string, expectedVersion: number, event: DemoEvent, patch: PatchFactory, payload: Record<string, unknown> = {}): Promise<DemoCaseRecord> {
    return this.store.transaction(async (repository) => {
      const current = await repository.lockByCode(code);
      if (!current) throw new Error("DEMO_CASE_NOT_FOUND");
      if (current.stateVersion !== expectedVersion) throw new Error("DEMO_STALE_WRITE");
      const next = transition({ state: current.state, version: current.stateVersion }, event);
      if (!next.ok) throw new Error(next.error.code);
      const changes = typeof patch === "function" ? patch(current) : patch;
      const updated = { ...current, ...changes, state: next.value.state, stateVersion: next.value.version };
      if (!await repository.save(updated, expectedVersion)) throw new Error("DEMO_STALE_WRITE");
      await repository.appendEvent({ caseId: current.id, version: updated.stateVersion, event, payload });
      return updated;
    });
  }
}
```

#### File: `tests/integration/db/demo-case-concurrency.test.ts`
[ASSUMED] — Runs only with a reachable isolated PostgreSQL database.

```typescript
// File: tests/integration/db/demo-case-concurrency.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DemoCaseService } from "../../../src/application/demo-case-service";
import { createDatabaseClient, type DatabaseClient } from "../../../src/infrastructure/db/client";
import { createDemoCaseRepository, createPostgresDemoCaseStore } from "../../../src/infrastructure/db/demo-case-repository";
import { applyMigrations } from "../../../src/infrastructure/db/migrations";
import type { ExchangeEvidence, HistoryBoundary } from "../../../src/infrastructure/minds/history";

let database: DatabaseClient;
const at = "2026-08-27T00:00:00.000Z";
function boundary(seed: string): HistoryBoundary { return { schemaVersion: 1, digest: seed.repeat(64), rowCount: 0,
  newestFingerprintDigest: null, oldestFingerprintDigest: null, capturedAt: at }; }
function evidence(nonce: string, before = boundary("c"), after = boundary("d")): ExchangeEvidence { return {
  schemaVersion: 1 as const, sdkVersion: "0.1.4" as const, executionClass: "test_transport" as const,
  logicalSendCount: 1 as const, processInstanceId: crypto.randomUUID(), processStartedAt: at,
  aliasDigest: "e".repeat(64),
  mindDigest: "f".repeat(64), processNonce: nonce, startedAt: at,
  completedAt: "2026-08-27T00:00:01.000Z", latencyMs: 1000, before, after,
  outbound: { messageIdDigest: "1".repeat(64), contentDigest: "2".repeat(64), createdAt: at },
  reply: { messageIdDigest: "3".repeat(64), contentDigest: "4".repeat(64), createdAt: "2026-08-27T00:00:01.000Z" },
  sendResolution: "acknowledged",
  evidenceClasses: ["same_mind", "same_alias", "exact_boundary", "one_new_outbound",
    "one_fresh_reply", "semantic_constraints"] };
}
beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED_FOR_INTEGRATION_TEST");
  database = createDatabaseClient({ connectionString: process.env.DATABASE_URL, max: 4 });
  await applyMigrations(database, `${process.cwd()}/db/migrations`);
});
afterAll(async () => database?.close());

describe("one-turn concurrency", () => {
  it("allows exactly one real PostgreSQL consume winner", async () => {
    const repository = createDemoCaseRepository(database.sql);
    const draft = await repository.createDraft(`OLT-RACE-${crypto.randomUUID()}`);
    const strategyEvidence = evidence("00000000-0000-4000-8000-000000000001");
    const responseEvidence = evidence("00000000-0000-4000-8000-000000000002", strategyEvidence.after, boundary("5"));
    const ready = { ...draft, state: "response_ready" as const, stateVersion: 6,
      authorizedTopic: "community_participation", authorizedAt: at,
      stableAlias: "opaque-alias", mindDigest: "f".repeat(64),
      strategyArtifact: { riskSummary: "A private incident may pull discussion backward.",
        responsePlan: ["Keep access separate", "Offer one future topic"], safeScope: "Keep private choices confidential." },
      strategyDigest: "a".repeat(64), strategyBoundary: strategyEvidence.after,
      strategyProvenance: strategyEvidence, strategyProcessNonce: strategyEvidence.processNonce,
      strategyReadyAt: "2026-08-27T00:00:00.000Z", returnMessage: "Can we discuss the past incident safely?",
      responseArtifact: { access: "unchanged" as const, scope: "one_future_community_topic" as const,
        privacy: "withhold_private_context" as const, rationale: "The remembered boundary controls scope." },
      responseDigest: "b".repeat(64), responseBoundary: responseEvidence.after,
      responseProvenance: responseEvidence, responseProcessNonce: responseEvidence.processNonce,
      responseReadyAt: "2026-08-27T00:01:00.000Z" };
    expect(await repository.save(ready, 0)).toBe(true);
    const service = new DemoCaseService(createPostgresDemoCaseStore(database), () => "2026-08-27T00:02:00.000Z");
    const outcomes = await Promise.allSettled([
      service.consumeTurn(draft.publicCode, 6), service.consumeTurn(draft.publicCode, 6),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await repository.findByCode(draft.publicCode))?.state).toBe("closed");
  });
});
```

## 6. C4: Direct Mind Work Contracts

#### File: `src/application/minds/work-contract.ts`
[ASSUMED] — Schemas and omission rules come from the approved design.

```typescript
// File: src/application/minds/work-contract.ts
import { z } from "zod";

export const strategyArtifactSchema = z.object({
  riskSummary: z.string().min(20).max(600),
  responsePlan: z.array(z.string().min(5).max(240)).min(2).max(5),
  safeScope: z.string().min(10).max(240),
}).strict();
export const responseArtifactSchema = z.object({
  access: z.literal("unchanged"),
  scope: z.literal("one_future_community_topic"),
  privacy: z.literal("withhold_private_context"),
  rationale: z.string().min(10).max(400),
}).strict();

export type StrategyArtifact = z.infer<typeof strategyArtifactSchema>;
export type ResponseArtifact = z.infer<typeof responseArtifactSchema>;

const jsonObject = /\{[\s\S]*\}/;

function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const fence = String.fromCharCode(96).repeat(3);
  const candidate = trimmed.startsWith(`${fence}json`) && trimmed.endsWith(fence)
    ? trimmed.slice(fence.length + 4, -fence.length).trim()
    : trimmed;
  const match = jsonObject.exec(candidate);
  if (!match || match[0] !== candidate) {
    throw new Error("MIND_ARTIFACT_NOT_SINGLE_JSON");
  }
  try { return JSON.parse(match[0]); }
  catch { throw new Error("MIND_ARTIFACT_INVALID_JSON"); }
}

export function parseStrategyArtifact(value: string): StrategyArtifact {
  return strategyArtifactSchema.parse(parseJsonObject(value));
}

export function parseResponseArtifact(value: string): ResponseArtifact {
  return responseArtifactSchema.parse(parseJsonObject(value));
}

export function strategyPrompt(): string {
  return [
    "Perform direct case analysis and return JSON only.",
    "Access is already decided and independent of contact.",
    "One future community-participation topic is authorized.",
    "Never reveal the affected participant's private choice.",
  ].join("\n");
}

export function responsePrompt(returnMessage: string): string {
  return [
    "Complete the bounded returning-member response from remembered case context.",
    "Return one JSON object with access, scope, privacy, and rationale fields only.",
    "Derive the three decision values from remembered context; do not ask for the hidden rules.",
    `New message: ${returnMessage}`,
  ].join("\n");
}

export function assertRememberedConstraints(artifact: ResponseArtifact): void {
  responseArtifactSchema.parse(artifact);
}

export function renderPublicResponse(artifact: ResponseArtifact): string {
  responseArtifactSchema.parse(artifact);
  return "Your access is unchanged. We can discuss one future community-participation topic without disclosing private context.";
}
```

#### File: `tests/unit/application/mind-work-contract.test.ts`
[ASSUMED] — Omitted-fact test is the semantic contract.

```typescript
// File: tests/unit/application/mind-work-contract.test.ts
import { describe, expect, it } from "vitest";
import {
  assertRememberedConstraints,
  parseResponseArtifact,
  parseStrategyArtifact,
  responsePrompt,
  strategyPrompt,
} from "../../../src/application/minds/work-contract";

describe("Mind work contracts", () => {
  it("keeps Process-A rules out of Process B", () => {
    const a = strategyPrompt();
    const b = responsePrompt("Can we discuss what happened last time?");
    expect(a).toContain("Access is already decided");
    expect(b).not.toContain("Access is already decided");
    expect(b).not.toMatch(/accept|pledge|token/i);
  });

  it("parses strict useful artifacts", () => {
    expect(parseStrategyArtifact(JSON.stringify({
      riskSummary: "A returning member may pull the conversation back toward a private incident.",
      responsePlan: ["Keep access separate", "Offer one future community topic"],
      safeScope: "Do not reveal the affected participant's private choice.",
    })).responsePlan).toHaveLength(2);
    expect(parseResponseArtifact(JSON.stringify({ access: "unchanged",
      scope: "one_future_community_topic", privacy: "withhold_private_context",
      rationale: "Access stays unchanged while the contact remains tightly bounded.",
    })).scope).toBe("one_future_community_topic");
  });

  it("rejects generic agreement and accepts semantic recall", () => {
    expect(() => assertRememberedConstraints({ access: "changed", scope: "anything", privacy: "share",
      rationale: "Sounds good to me." } as never)).toThrow();
    expect(() => assertRememberedConstraints({
      access: "unchanged", scope: "one_future_community_topic", privacy: "withhold_private_context",
      rationale: "Access is independent, and the private boundary still applies.",
    })).not.toThrow();
  });
});
```

## 7. C5: Provenance-Bound Minds Worker

#### File: `src/infrastructure/minds/history.ts`
[ASSUMED] — Round-trip validator; exact wire types come from the pinned SDK.

```typescript
// File: src/infrastructure/minds/history.ts
import { createHash } from "node:crypto";
import type { MessageRecord } from "@animocabrands/minds-client-lib";
import { z } from "zod";

export const MINDS_SDK_VERSION = "0.1.4";
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const canonicalTime = z.string().datetime({ offset: false });

export const historyBoundarySchema = z.object({
  schemaVersion: z.literal(1), digest, rowCount: z.number().int().nonnegative(),
  newestFingerprintDigest: digest.nullable(), oldestFingerprintDigest: digest.nullable(),
  capturedAt: canonicalTime,
}).strict();

export const exchangeEvidenceSchema = z.object({
  schemaVersion: z.literal(1), sdkVersion: z.literal(MINDS_SDK_VERSION),
  executionClass: z.enum(["live_sdk", "test_transport"]), logicalSendCount: z.literal(1),
  processInstanceId: z.string().uuid(), processStartedAt: canonicalTime,
  aliasDigest: digest, mindDigest: digest, processNonce: z.string().uuid(),
  startedAt: canonicalTime, completedAt: canonicalTime, latencyMs: z.number().int().nonnegative(),
  before: historyBoundarySchema, after: historyBoundarySchema,
  outbound: z.object({ messageIdDigest: digest, contentDigest: digest, createdAt: canonicalTime }).strict(),
  reply: z.object({ messageIdDigest: digest, contentDigest: digest, createdAt: canonicalTime }).strict(),
  sendResolution: z.enum(["acknowledged", "history_recovered"]),
  evidenceClasses: z.array(z.enum([
    "same_mind", "same_alias", "exact_boundary", "one_new_outbound",
    "one_fresh_reply", "semantic_constraints",
  ])).length(6),
}).strict();

export type HistoryBoundary = z.infer<typeof historyBoundarySchema>;
export type ExchangeEvidence = z.infer<typeof exchangeEvidenceSchema>;
export type HistoryRow = Readonly<{
  messageId: string; messageText: string; createdAt: string;
  fingerprint: string; senderType: 0 | 1 | 2;
}>;
export interface HistoryTransport {
  getHistory(alias: string, options: { limit: number; cursor?: string }): Promise<MessageRecord[]>;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRow(row: MessageRecord, index: number): HistoryRow {
  const messageId = row.messageId;
  if (!messageId || typeof row.messageText !== "string" || !row.createdAt || !row.fingerprint) {
    throw new Error(`MINDS_HISTORY_ROW_INVALID:${index}`);
  }
  if (![0, 1, 2].includes(row.senderType ?? -1)) throw new Error(`MINDS_HISTORY_ROLE_INVALID:${index}`);
  const createdAt = new Date(row.createdAt).toISOString();
  if (createdAt !== row.createdAt) throw new Error(`MINDS_HISTORY_TIME_INVALID:${index}`);
  return { messageId, messageText: row.messageText, createdAt, fingerprint: row.fingerprint, senderType: row.senderType as 0 | 1 | 2 };
}

function assertHistoryShape(rows: readonly HistoryRow[]): void {
  const ids = rows.map((row) => row.messageId);
  const fingerprints = rows.map((row) => row.fingerprint);
  if (new Set(ids).size !== ids.length || new Set(fingerprints).size !== fingerprints.length) {
    throw new Error("MINDS_HISTORY_DUPLICATE_ROW");
  }
  for (let index = 1; index < rows.length; index += 1) {
    if (Date.parse(rows[index - 1]!.createdAt) < Date.parse(rows[index]!.createdAt)) {
      throw new Error("MINDS_HISTORY_NOT_NEWEST_FIRST");
    }
  }
}

export async function readCompleteHistory(input: {
  transport: HistoryTransport; alias: string; pageSize?: number; maxPages?: number;
}): Promise<HistoryRow[]> {
  const pageSize = input.pageSize ?? 200;
  const maxPages = input.maxPages ?? 20;
  const rows: HistoryRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const options = cursor ? { limit: pageSize, cursor } : { limit: pageSize };
    const batch = (await input.transport.getHistory(input.alias, options)).map(normalizeRow);
    rows.push(...batch);
    assertHistoryShape(rows);
    if (batch.length < pageSize) return rows;
    const next = batch.at(-1)?.fingerprint;
    if (!next || next === cursor) throw new Error("MINDS_HISTORY_CURSOR_DID_NOT_ADVANCE");
    cursor = next;
  }
  throw new Error("MINDS_HISTORY_PAGE_LIMIT_EXCEEDED");
}

function canonicalRows(rows: readonly HistoryRow[]): string {
  return JSON.stringify(rows.map((row) => ({
    messageIdDigest: sha256(row.messageId), contentDigest: sha256(row.messageText),
    createdAt: row.createdAt, fingerprintDigest: sha256(row.fingerprint), senderType: row.senderType,
  })));
}

export function createBoundary(rows: readonly HistoryRow[], capturedAt: string): HistoryBoundary {
  assertHistoryShape(rows);
  return historyBoundarySchema.parse({
    schemaVersion: 1, digest: sha256(canonicalRows(rows)), rowCount: rows.length,
    newestFingerprintDigest: rows[0] ? sha256(rows[0].fingerprint) : null,
    oldestFingerprintDigest: rows.at(-1) ? sha256(rows.at(-1)!.fingerprint) : null,
    capturedAt,
  });
}

export function assertSameBoundary(expected: HistoryBoundary, actual: HistoryBoundary): void {
  const fields = ["digest", "rowCount", "newestFingerprintDigest", "oldestFingerprintDigest"] as const;
  if (fields.some((field) => expected[field] !== actual[field])) {
    throw new Error("MINDS_HISTORY_BOUNDARY_MISMATCH");
  }
}

function assertExchangeShape(before: readonly HistoryRow[], after: readonly HistoryRow[]): [HistoryRow, HistoryRow] {
  if (after.length !== before.length + 2) throw new Error("MINDS_EXCHANGE_ROW_COUNT");
  if (canonicalRows(after.slice(2)) !== canonicalRows(before)) throw new Error("MINDS_EXCHANGE_STALE_SUFFIX");
  const reply = after[0];
  const outbound = after[1];
  if (!reply || !outbound || ![0, 2].includes(reply.senderType) || outbound.senderType !== 1) {
    throw new Error("MINDS_EXCHANGE_ROLE_ORDER");
  }
  return [reply, outbound];
}

export function reconcileExchange(input: {
  alias: string; mindId: string; processNonce: string; prompt: string; sentMessageId?: string;
  executionClass: "live_sdk" | "test_transport"; processInstanceId: string; processStartedAt: string;
  before: readonly HistoryRow[]; after: readonly HistoryRow[]; startedAt: string; completedAt: string;
}): Readonly<{ evidence: ExchangeEvidence; replyText: string }> {
  const [reply, outbound] = assertExchangeShape(input.before, input.after);
  if ((input.sentMessageId && outbound.messageId !== input.sentMessageId) || outbound.messageText !== input.prompt) {
    throw new Error("MINDS_OUTBOUND_PROVENANCE_MISMATCH");
  }
  if (Date.parse(reply.createdAt) <= Date.parse(outbound.createdAt)) throw new Error("MINDS_REPLY_NOT_FRESH");
  const completed = Date.parse(input.completedAt);
  const started = Date.parse(input.startedAt);
  const evidence = exchangeEvidenceSchema.parse({
    schemaVersion: 1, sdkVersion: MINDS_SDK_VERSION,
    executionClass: input.executionClass, logicalSendCount: 1,
    processInstanceId: input.processInstanceId, processStartedAt: input.processStartedAt,
    aliasDigest: sha256(input.alias), mindDigest: sha256(input.mindId), processNonce: input.processNonce,
    startedAt: input.startedAt, completedAt: input.completedAt, latencyMs: completed - started,
    before: createBoundary(input.before, input.startedAt), after: createBoundary(input.after, input.completedAt),
    outbound: { messageIdDigest: sha256(outbound.messageId), contentDigest: sha256(outbound.messageText), createdAt: outbound.createdAt },
    reply: { messageIdDigest: sha256(reply.messageId), contentDigest: sha256(reply.messageText), createdAt: reply.createdAt },
    sendResolution: input.sentMessageId ? "acknowledged" : "history_recovered",
    evidenceClasses: ["same_mind", "same_alias", "exact_boundary", "one_new_outbound", "one_fresh_reply", "semantic_constraints"],
  });
  return { evidence, replyText: reply.messageText };
}
```

#### File: `src/infrastructure/minds/minds-worker.ts`
[ASSUMED] — SDK methods are [VERIFIED]; application reconciliation remains build-tested.

```typescript
// File: src/infrastructure/minds/minds-worker.ts
import { randomUUID } from "node:crypto";
import { createMindsClient } from "@animocabrands/minds-client-lib";

import {
  assertSameBoundary,
  createBoundary,
  readCompleteHistory,
  reconcileExchange,
  type ExchangeEvidence,
  type HistoryBoundary,
  type HistoryRow,
  type HistoryTransport,
} from "./history";

export interface MindTransport extends HistoryTransport {
  ensureConversation(alias: string, mindId: string): Promise<{ mindId?: string }>;
  getCognitionBalance(mindId: string): Promise<number>;
  sendMessage(input: { alias: string; messageText: string }): Promise<unknown>;
  waitForReply(input: {
    alias: string; sentMessageText: string; afterFingerprint?: string; timeoutMs: number;
  }): Promise<{ timedOut: boolean }>;
}

export type MindWorkResult<T> = Readonly<{
  artifact: T; evidence: ExchangeEvidence;
}>;

const liveTransports = new WeakSet<object>();
const processInstance = Object.freeze({ id: randomUUID(), startedAt: new Date().toISOString() });

export function currentProcessInstanceId(): string { return processInstance.id; }

export function createLiveMindTransport(builderApiKey: string): MindTransport {
  const client = createMindsClient({ builderApiKey });
  const transport: MindTransport = {
    ensureConversation: (alias, mindId) => client.ensureConversation(alias, mindId),
    getCognitionBalance: async (mindId) => (await client.getCognitionBalance(mindId)).cognition,
    getHistory: (alias, options) => client.getHistory(alias, options),
    sendMessage: (input) => client.sendMessage(input),
    waitForReply: (input) => client.waitForReply(input),
  };
  liveTransports.add(transport);
  return transport;
}

function sentMessageId(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("MINDS_SEND_RESULT_INVALID");
  const record = value as Record<string, unknown>;
  const id = record.messageId ?? record.id ?? record.message_id;
  if (typeof id !== "string" || !id.trim()) throw new Error("MINDS_SEND_ID_MISSING");
  return id;
}

async function waitForTerminalRows(input: {
  transport: MindTransport; alias: string; beforeCount: number; delayMs: number;
}): Promise<HistoryRow[]> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rows = await readCompleteHistory({ transport: input.transport, alias: input.alias });
    if (rows.length >= input.beforeCount + 2) return rows;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, input.delayMs));
  }
  throw new Error("MINDS_REPLY_NOT_IN_HISTORY");
}

async function assertPreflight(input: {
  transport: MindTransport; alias: string; mindId: string; expectedBoundary?: HistoryBoundary;
}): Promise<HistoryRow[]> {
  if (await input.transport.getCognitionBalance(input.mindId) <= 0) throw new Error("MINDS_COGNITION_EMPTY");
  const conversation = await input.transport.ensureConversation(input.alias, input.mindId);
  if (conversation.mindId !== input.mindId) throw new Error("MINDS_ALIAS_MIND_MISMATCH");
  const rows = await readCompleteHistory({ transport: input.transport, alias: input.alias });
  if (input.expectedBoundary) {
    assertSameBoundary(input.expectedBoundary, createBoundary(rows, new Date().toISOString()));
  }
  return rows;
}

export async function executeMindWork<T>(input: {
  transport: MindTransport; alias: string; mindId: string; processNonce: string;
  prompt: string; expectedBoundary?: HistoryBoundary; parse: (text: string) => T;
  validate?: (artifact: T) => void; now?: () => string; recoveryDelayMs?: number;
}): Promise<MindWorkResult<T>> {
  const now = input.now ?? (() => new Date().toISOString());
  const before = await assertPreflight(input);
  const startedAt = now();
  let id: string | undefined;
  let ambiguousSend = false;
  try { id = sentMessageId(await input.transport.sendMessage({ alias: input.alias, messageText: input.prompt })); }
  catch { ambiguousSend = true; }
  try {
    await input.transport.waitForReply({
      alias: input.alias, sentMessageText: input.prompt,
      ...(before[0] ? { afterFingerprint: before[0].fingerprint } : {}), timeoutMs: 180_000,
    });
  } catch { /* the send already succeeded; recover with bounded read-only history only */ }
  let after: HistoryRow[];
  try { after = await waitForTerminalRows({ transport: input.transport, alias: input.alias,
    beforeCount: before.length, delayMs: input.recoveryDelayMs ?? 1_500 }); }
  catch (error) {
    if (ambiguousSend) throw new Error("MINDS_SEND_AMBIGUOUS");
    throw error;
  }
  const exchange = reconcileExchange({
    alias: input.alias, mindId: input.mindId, processNonce: input.processNonce,
    executionClass: liveTransports.has(input.transport) ? "live_sdk" : "test_transport",
    processInstanceId: processInstance.id, processStartedAt: processInstance.startedAt,
    prompt: input.prompt, ...(id ? { sentMessageId: id } : {}), before, after,
    startedAt, completedAt: now(),
  });
  const artifact = input.parse(exchange.replyText);
  input.validate?.(artifact);
  return { artifact, evidence: exchange.evidence };
}
```

## 8. C6: Separate Process Jobs

#### File: `src/application/minds/run-strategy-job.ts`
[ASSUMED] — Complete orchestration contract; production adapter must persist exact rows before advancement.

```typescript
// File: src/application/minds/run-strategy-job.ts
import { randomUUID } from "node:crypto";

import type { DemoCaseRecord } from "../../infrastructure/db/demo-case-repository";
import { sha256, type ExchangeEvidence } from "../../infrastructure/minds/history";
import { executeMindWork, type MindTransport } from "../../infrastructure/minds/minds-worker";
import { parseStrategyArtifact, strategyPrompt, type StrategyArtifact } from "./work-contract";

export type JobOutcome = Readonly<{ state: "ready" | "failed"; code: string }>;
export interface StrategyCasePort {
  findByCode(code: string): Promise<DemoCaseRecord | null>;
  claimStrategy(code: string, version: number, input: { alias: string; mindDigest: string; processNonce: string }): Promise<DemoCaseRecord>;
  recordStrategy(code: string, version: number, artifact: StrategyArtifact, evidence: ExchangeEvidence): Promise<DemoCaseRecord>;
  verifyStrategyReadback(code: string, artifact: StrategyArtifact, evidence: ExchangeEvidence): Promise<void>;
  fail(code: string, version: number, stage: string, failureCode: string): Promise<DemoCaseRecord>;
}

const strategyFailureCodes = new Set(["MINDS_COGNITION_EMPTY", "MINDS_ALIAS_MIND_MISMATCH",
  "MINDS_REPLY_NOT_IN_HISTORY", "MINDS_SEND_AMBIGUOUS", "MINDS_HISTORY_BOUNDARY_MISMATCH",
  "MIND_ARTIFACT_NOT_SINGLE_JSON", "MIND_ARTIFACT_INVALID_JSON"]);
function failureCode(error: unknown): string {
  return error instanceof Error && strategyFailureCodes.has(error.message) ? error.message : "STRATEGY_FAILED";
}

async function markFailed(port: StrategyCasePort, code: string, version: number, reason: string): Promise<void> {
  try { await port.fail(code, version, "strategy", reason); }
  catch { /* preserve the original fixed failure code */ }
}

export async function runStrategyJob(input: {
  code: string; mindId: string; cases: StrategyCasePort; transport: MindTransport;
  processNonce?: string;
}): Promise<JobOutcome> {
  const current = await input.cases.findByCode(input.code);
  if (!current || current.state !== "authorized") return { state: "failed", code: "STRATEGY_NOT_AUTHORIZED" };
  const processNonce = input.processNonce ?? randomUUID();
  const alias = `olt-${sha256(`${current.id}:${processNonce}`).slice(0, 32)}`;
  let version = current.stateVersion;
  try {
    const claimed = await input.cases.claimStrategy(input.code, version, { alias, mindDigest: sha256(input.mindId), processNonce });
    version = claimed.stateVersion;
    const result = await executeMindWork({ transport: input.transport, alias, mindId: input.mindId,
      processNonce, prompt: strategyPrompt(), parse: parseStrategyArtifact });
    const ready = await input.cases.recordStrategy(input.code, version, result.artifact, result.evidence);
    version = ready.stateVersion;
    await input.cases.verifyStrategyReadback(input.code, result.artifact, result.evidence);
    return { state: "ready", code: "STRATEGY_READY" };
  } catch (error) {
    const reason = failureCode(error);
    await markFailed(input.cases, input.code, version, reason);
    return { state: "failed", code: reason };
  }
}
```

#### File: `src/application/minds/run-response-job.ts`
[ASSUMED] — Process B receives no Process-A rules or strategy text.

```typescript
// File: src/application/minds/run-response-job.ts
import { randomUUID } from "node:crypto";

import type { DemoCaseRecord, ResponseJobInput } from "../../infrastructure/db/demo-case-repository";
import { sha256, type ExchangeEvidence } from "../../infrastructure/minds/history";
import { currentProcessInstanceId, executeMindWork, type MindTransport } from "../../infrastructure/minds/minds-worker";
import type { JobOutcome } from "./run-strategy-job";
import {
  assertRememberedConstraints,
  parseResponseArtifact,
  responsePrompt,
  type ResponseArtifact,
} from "./work-contract";

export interface ResponseCasePort {
  findResponseJobInput(code: string): Promise<ResponseJobInput | null>;
  claimResponse(code: string, version: number, processNonce: string): Promise<DemoCaseRecord>;
  recordResponse(code: string, version: number, artifact: ResponseArtifact, evidence: ExchangeEvidence): Promise<DemoCaseRecord>;
  verifyResponseReadback(code: string, artifact: ResponseArtifact, evidence: ExchangeEvidence): Promise<void>;
  fail(code: string, version: number, stage: string, failureCode: string): Promise<DemoCaseRecord>;
}

const responseFailureCodes = new Set(["MINDS_COGNITION_EMPTY", "MINDS_ALIAS_MIND_MISMATCH",
  "MINDS_REPLY_NOT_IN_HISTORY", "MINDS_SEND_AMBIGUOUS", "MINDS_HISTORY_BOUNDARY_MISMATCH",
  "MIND_ARTIFACT_NOT_SINGLE_JSON", "MIND_ARTIFACT_INVALID_JSON"]);
function failureCode(error: unknown): string {
  return error instanceof Error && responseFailureCodes.has(error.message) ? error.message : "RESPONSE_FAILED";
}

async function markFailed(port: ResponseCasePort, code: string, version: number, reason: string): Promise<void> {
  try { await port.fail(code, version, "response", reason); }
  catch { /* preserve the original fixed failure code */ }
}

export async function runResponseJob(input: {
  code: string; mindId: string; cases: ResponseCasePort; transport: MindTransport;
  processNonce?: string;
}): Promise<JobOutcome> {
  const minimal = await input.cases.findResponseJobInput(input.code);
  if (!minimal) return { state: "failed", code: "RESPONSE_INPUT_NOT_READY" };
  if (minimal.mindDigest !== sha256(input.mindId)) return { state: "failed", code: "RESPONSE_MIND_MISMATCH" };
  if (minimal.strategyProcessInstanceId === currentProcessInstanceId()) {
    return { state: "failed", code: "RESPONSE_PROCESS_NOT_SEPARATE" };
  }
  const processNonce = input.processNonce ?? randomUUID();
  let version = minimal.stateVersion;
  try {
    const claimed = await input.cases.claimResponse(input.code, version, processNonce);
    version = claimed.stateVersion;
    const result = await executeMindWork({ transport: input.transport, alias: minimal.stableAlias,
      mindId: input.mindId, processNonce, prompt: responsePrompt(minimal.returnMessage),
      expectedBoundary: minimal.strategyBoundary, parse: parseResponseArtifact,
      validate: assertRememberedConstraints });
    const ready = await input.cases.recordResponse(input.code, version, result.artifact, result.evidence);
    version = ready.stateVersion;
    await input.cases.verifyResponseReadback(input.code, result.artifact, result.evidence);
    return { state: "ready", code: "RESPONSE_READY" };
  } catch (error) {
    const reason = failureCode(error);
    await markFailed(input.cases, input.code, version, reason);
    return { state: "failed", code: reason };
  }
}
```

#### File: `scripts/run-case-strategy.ts`
[ASSUMED] — Safe CLI output contract.

```typescript
// File: scripts/run-case-strategy.ts
import { runStrategyJob } from "../src/application/minds/run-strategy-job";
import { createMindRuntime } from "../src/application/demo-runtime";

async function main(): Promise<void> {
  const code = process.argv[2];
  if (!code) throw new Error("PUBLIC_CASE_CODE_REQUIRED");
  const publicCode = code;
  const runtime = createMindRuntime(process.env);
  try {
    const result = await runStrategyJob({ code: publicCode, mindId: runtime.mindId,
      cases: runtime.cases, transport: runtime.minds });
    process.stdout.write(`CASE_STRATEGY=${result.state} CODE=${result.code}\n`);
    if (result.state === "failed") process.exitCode = 1;
  } finally { await runtime.close(); }
}

main().catch(() => { process.stderr.write("CASE_STRATEGY=failed\n"); process.exitCode = 1; });
```

#### File: `scripts/run-case-response.ts`
[ASSUMED] — Safe CLI output contract.

```typescript
// File: scripts/run-case-response.ts
import { runResponseJob } from "../src/application/minds/run-response-job";
import { createMindRuntime } from "../src/application/demo-runtime";

async function main(): Promise<void> {
  const code = process.argv[2];
  if (!code) throw new Error("PUBLIC_CASE_CODE_REQUIRED");
  const publicCode = code;
  const runtime = createMindRuntime(process.env);
  try {
    const result = await runResponseJob({ code: publicCode, mindId: runtime.mindId,
      cases: runtime.cases, transport: runtime.minds });
    process.stdout.write(`CASE_RESPONSE=${result.state} CODE=${result.code}\n`);
    if (result.state === "failed") process.exitCode = 1;
  } finally { await runtime.close(); }
}

main().catch(() => { process.stderr.write("CASE_RESPONSE=failed\n"); process.exitCode = 1; });
```

#### File: `src/application/demo-runtime.ts`
[ASSUMED] — Copy-exact composition root; isolated materialization must typecheck before Build.

```typescript
// File: src/application/demo-runtime.ts
import { loadEnv, type AppConfig } from "../config/env";
import { createDatabaseClient } from "../infrastructure/db/client";
import { createPostgresDemoCaseStore } from "../infrastructure/db/demo-case-repository";
import { createLiveMindTransport } from "../infrastructure/minds/minds-worker";
import { DemoCaseService } from "./demo-case-service";
import { DemoController } from "./demo-controller";

type CaseConfig = AppConfig & { databaseUrl: string };

function requireCaseConfig(source: NodeJS.ProcessEnv): CaseConfig {
  const config = loadEnv(source);
  if (!config.features.demoCase) throw new Error("DEMO_CASE_DISABLED");
  if (!config.databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  return config as CaseConfig;
}

export function createCaseRuntime(source: NodeJS.ProcessEnv) {
  const config = requireCaseConfig(source);
  const database = createDatabaseClient({ connectionString: config.databaseUrl });
  const cases = new DemoCaseService(createPostgresDemoCaseStore(database));
  return { config, cases, controller: new DemoController(cases), close: () => database.close() };
}

export function createMindRuntime(source: NodeJS.ProcessEnv) {
  const config = requireCaseConfig(source);
  if (!config.features.mindsLive || !config.builderApiKey || !config.mindId) {
    throw new Error("MINDS_RUNTIME_DISABLED");
  }
  const builderApiKey = config.builderApiKey;
  const mindId = config.mindId;
  const database = createDatabaseClient({ connectionString: config.databaseUrl });
  const cases = new DemoCaseService(createPostgresDemoCaseStore(database));
  return { config, mindId, cases,
    minds: createLiveMindTransport(builderApiKey), close: () => database.close() };
}
```

## 9. C7: Controller and Server Actions

#### File: `src/application/demo-controller.ts`
[ASSUMED] — Redacted view-model boundary.

```typescript
// File: src/application/demo-controller.ts
import type { DemoState } from "../domain/demo/demo-case";
import type { ReceiptEvidenceClass } from "../domain/demo/demo-receipt";
import type { DemoCaseRecord } from "../infrastructure/db/demo-case-repository";
import { renderPublicResponse } from "./minds/work-contract";

export interface DemoCaseView {
  code: string; state: DemoState; expectedVersion: number; synthetic: true;
  strategy?: { classification: "live"; summary: string; digest: string; readyAt: string };
  returnMessage?: string; response?: { classification: "live"; text: string; digest: string; readyAt: string };
  receipt?: { consumedAt: string; digest: string; evidenceClasses: readonly ReceiptEvidenceClass[] };
  failure?: { stage: string; code: string }; evidence: readonly string[];
}

export interface ControllerCasePort {
  createCase(): Promise<DemoCaseRecord>; findByCode(code: string): Promise<DemoCaseRecord | null>;
  authorize(code: string, version: number): Promise<DemoCaseRecord>;
  submitReturn(code: string, version: number, message: string): Promise<DemoCaseRecord>;
  consumeTurn(code: string, version: number): Promise<DemoCaseRecord>;
}

function toView(record: DemoCaseRecord): DemoCaseView {
  const view: DemoCaseView = { code: record.publicCode, state: record.state,
    expectedVersion: record.stateVersion, synthetic: true,
    evidence: [record.strategyProvenance ? "Process A live" : "Process A pending",
      record.responseProvenance ? "Process B live" : "Process B pending"] };
  if (record.strategyArtifact && record.strategyDigest && record.strategyReadyAt) {
    view.strategy = { classification: "live", summary: "Private response strategy persisted",
      digest: record.strategyDigest, readyAt: record.strategyReadyAt };
  }
  if (record.returnMessage) view.returnMessage = record.returnMessage;
  if (record.responseArtifact && record.responseDigest && record.responseReadyAt) {
    view.response = { classification: "live", text: renderPublicResponse(record.responseArtifact),
      digest: record.responseDigest, readyAt: record.responseReadyAt };
  }
  if (record.receiptDigest && record.turnConsumedAt && record.receiptEvidenceClasses) {
    view.receipt = { consumedAt: record.turnConsumedAt, digest: record.receiptDigest,
      evidenceClasses: record.receiptEvidenceClasses };
  }
  if (record.failureStage && record.failureCode) view.failure = { stage: record.failureStage, code: record.failureCode };
  return view;
}

export class DemoController {
  constructor(private readonly cases: ControllerCasePort) {}

  async create(): Promise<DemoCaseView> { return toView(await this.cases.createCase()); }
  async load(code: string): Promise<DemoCaseView> {
    const record = await this.cases.findByCode(code);
    if (!record) throw new Error("DEMO_CASE_NOT_FOUND");
    return toView(record);
  }
  async authorize(code: string, version: number): Promise<DemoCaseView> {
    return toView(await this.cases.authorize(code, version));
  }
  async submitReturn(code: string, version: number, message: string): Promise<DemoCaseView> {
    return toView(await this.cases.submitReturn(code, version, message));
  }
  async consume(code: string, version: number): Promise<DemoCaseView> {
    return toView(await this.cases.consumeTurn(code, version));
  }
}
```

#### File: `src/app/actions.ts`
[ASSUMED] — Deterministic action boundary with concrete database-only composition; provider jobs run only in separate CLI processes.

```typescript
// File: src/app/actions.ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createCaseRuntime } from "../application/demo-runtime";

const codeSchema = z.string().min(8).max(64).regex(/^[A-Z0-9-]+$/);
const versionSchema = z.coerce.number().int().nonnegative();
const messageSchema = z.string().trim().min(10).max(400);

function command(formData: FormData): { code: string; version: number } {
  return { code: codeSchema.parse(formData.get("code")), version: versionSchema.parse(formData.get("version")) };
}

async function withController<T>(work: (controller: ReturnType<typeof createCaseRuntime>["controller"]) => Promise<T>): Promise<T> {
  const runtime = createCaseRuntime(process.env);
  try { return await work(runtime.controller); }
  finally { await runtime.close(); }
}

export async function createCaseAction(): Promise<never> {
  const view = await withController((controller) => controller.create());
  redirect(`/?case=${encodeURIComponent(view.code)}`);
}

export async function authorizeAction(formData: FormData): Promise<void> {
  const input = command(formData);
  await withController((controller) => controller.authorize(input.code, input.version));
  revalidatePath("/");
}

export async function submitReturnAction(formData: FormData): Promise<void> {
  const input = command(formData);
  const message = messageSchema.parse(formData.get("message"));
  await withController((controller) => controller.submitReturn(input.code, input.version, message));
  revalidatePath("/");
}

export async function consumeAction(formData: FormData): Promise<void> {
  const input = command(formData);
  await withController((controller) => controller.consume(input.code, input.version));
  revalidatePath("/");
}
```

#### File: `src/app/api/health/route.ts`
[ASSUMED] — Database/schema readiness route; it performs no Minds provider operation.

```typescript
// File: src/app/api/health/route.ts
import { loadEnv } from "../../../config/env";
import { createDatabaseClient } from "../../../infrastructure/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(): Promise<Response> {
  const config = loadEnv(process.env);
  if (!config.databaseUrl) return Response.json({ status: "not_ready", database: false }, { status: 503 });
  const database = createDatabaseClient({ connectionString: config.databaseUrl, max: 1 });
  try {
    const rows = await database.sql<{ ready: boolean }[]>`select
      to_regclass('public.demo_cases') is not null and
      to_regclass('public.demo_case_events') is not null as ready`;
    const ready = rows[0]?.ready === true;
    return Response.json({ status: ready ? "ready" : "not_ready", database: ready }, { status: ready ? 200 : 503 });
  } catch { return Response.json({ status: "not_ready", database: false }, { status: 503 }); }
  finally { await database.close(); }
}
```

## 10. C8: Timeline UI

#### File: `src/app/components/case-timeline.tsx`
[ASSUMED] — Complete pure presentation component; actions are injected by parent page.

```tsx
// File: src/app/components/case-timeline.tsx
import type { DemoCaseView } from "../../application/demo-controller";
const stages = [
  ["authorized", "Boundary authorized"], ["strategy_running", "Strategy running"],
  ["strategy_ready", "Strategy prepared"], ["returned", "Return submitted"],
  ["response_running", "Response running"], ["response_ready", "Remembered response"],
  ["closed", "Receipt closed"],
] as const;
const order = ["draft", ...stages.map(([state]) => state), "failed"];

export function CaseTimeline({ view }: { view: DemoCaseView }) {
  const current = order.indexOf(view.state);
  return <ol className="timeline" aria-label="Case timeline">{stages.map(([state, label]) => {
    const index = order.indexOf(state);
    const status = view.state === "failed" ? "stopped" : index < current ? "complete" : index === current ? "current" : "pending";
    return <li key={state} data-status={status} aria-current={status === "current" ? "step" : undefined}>
      <span>{String(index).padStart(2, "0")}</span><strong>{label}</strong><small>{status}</small>
    </li>;
  })}</ol>;
}
```

#### File: `src/app/components/action-panel.tsx`
[ASSUMED] — Progressive action surface.

```tsx
// File: src/app/components/action-panel.tsx
import type { DemoCaseView } from "../../application/demo-controller";
import {
  authorizeAction, consumeAction, submitReturnAction,
} from "../actions";

function HiddenCase({ view }: { view: DemoCaseView }) {
  return <><input type="hidden" name="code" value={view.code} /><input type="hidden" name="version" value={view.expectedVersion} /></>;
}

export function ActionPanel({ view }: { view: DemoCaseView }) {
  if (view.state === "draft") return <form action={authorizeAction}><HiddenCase view={view} /><button>Authorize one topic</button></form>;
  if (view.state === "authorized") return <p role="status">Authorized. Deployment operator starts Process A once, then refreshes this case.</p>;
  if (view.state === "strategy_ready") return <form action={submitReturnAction}><HiddenCase view={view} />
    <label htmlFor="return-message">Returning member message</label>
    <textarea id="return-message" name="message" required minLength={10} maxLength={400} />
    <button>Submit return</button></form>;
  if (view.state === "returned") return <p role="status">Return stored. Deployment operator starts the separate Process B once, then refreshes this case.</p>;
  if (view.state === "response_ready") return <form action={consumeAction}><HiddenCase view={view} /><button>Consume one turn</button></form>;
  if (view.state === "closed") return <button disabled>Already used</button>;
  if (view.state.endsWith("_running")) return <p role="status">Mind work is running. Do not retry this send.</p>;
  return <p role="alert">This case stopped honestly. Start a new synthetic case.</p>;
}
```

#### File: `src/app/components/evidence-strip.tsx`
[ASSUMED] — Redacted evidence only.

```tsx
// File: src/app/components/evidence-strip.tsx
import type { DemoCaseView } from "../../application/demo-controller";

export function EvidenceStrip({ view }: { view: DemoCaseView }) {
  const items = [...view.evidence];
  if (view.strategy) items.push(`A ${view.strategy.classification} · ${view.strategy.digest.slice(0, 10)}`);
  if (view.response) items.push(`B ${view.response.classification} · ${view.response.digest.slice(0, 10)}`);
  if (view.receipt) items.push(`Receipt · ${view.receipt.digest.slice(0, 10)}`);
  return <aside className="evidence" aria-label="Integration proof">{items.map((item) => <span key={item}>{item}</span>)}</aside>;
}
```

#### File: `src/app/page.tsx`
[ASSUMED] — Complete guided server page; provider waits use Vercel's documented 300-second function budget.

```tsx
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
    {!view ? <section className="case-card"><p className="role">Operator</p><h2>Open a synthetic re-entry case</h2>
      <p>No private participant data is used. Provider work begins only after the bounded topic is authorized.</p>
      <form action={createCaseAction}><button>Create case</button></form></section> :
      <section className="case-card"><div className="case-meta"><span>Synthetic case</span><code>{view.code}</code><span>{view.state}</span></div>
        <CaseTimeline view={view} />
        {view.response && <blockquote>{view.response.text}</blockquote>}
        {view.failure && <p role="alert">Stopped at {view.failure.stage}: {view.failure.code}</p>}
        <ActionPanel view={view} /><EvidenceStrip view={view} />
      </section>}
  </main>;
}
```

#### File: `src/app/globals.css`
[ASSUMED] — Complete responsive proof-stage styling.

```css
/* File: src/app/globals.css */
@import "tailwindcss";

:root { --ink:#17231d; --paper:#f4f0e6; --moss:#42604f; --clay:#bd6d4c; --line:#c8c0ad; }
* { box-sizing:border-box; }
body { margin:0; color:var(--ink); background:radial-gradient(circle at 80% 0,#dbe3d4,transparent 35%),var(--paper); font-family:Arial,sans-serif; }
main { width:min(1080px,calc(100% - 32px)); margin:auto; padding:56px 0 80px; }
.hero { max-width:760px; margin-bottom:32px; }
.eyebrow,.role { color:var(--clay); font-size:.78rem; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
h1 { margin:.15em 0; font-family:Georgia,serif; font-size:clamp(3rem,9vw,7rem); line-height:.86; letter-spacing:-.055em; }
.hero>p:last-child { max-width:650px; font-size:1.15rem; line-height:1.6; }
.case-card { border:1px solid var(--line); border-radius:26px; padding:clamp(22px,4vw,44px); background:rgba(255,255,255,.58); box-shadow:0 24px 70px rgba(31,43,35,.12); }
.case-meta,.evidence { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.case-meta span,.evidence span { border:1px solid var(--line); border-radius:999px; padding:7px 11px; font-size:.76rem; background:#fff9; }
.case-meta code { margin-right:auto; }
.timeline { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; padding:0; margin:38px 0; list-style:none; }
.timeline li { min-height:130px; padding:13px; border:1px solid var(--line); border-radius:16px; display:flex; flex-direction:column; gap:12px; opacity:.48; }
.timeline li[data-status="complete"],.timeline li[data-status="current"] { opacity:1; background:#fff; }
.timeline li[data-status="current"] { outline:3px solid var(--clay); }
.timeline span,.timeline small { font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; }
button,textarea { font:inherit; }
button { border:0; border-radius:999px; padding:13px 20px; color:white; background:var(--ink); font-weight:800; cursor:pointer; }
button:disabled { cursor:not-allowed; background:#727a75; }
button:focus-visible,textarea:focus-visible { outline:3px solid var(--clay); outline-offset:3px; }
form { display:grid; gap:12px; justify-items:start; }
textarea { width:min(100%,620px); min-height:110px; padding:14px; border:1px solid var(--line); border-radius:14px; background:white; }
blockquote { margin:24px 0; padding:20px; border-left:5px solid var(--moss); background:white; font:1.15rem/1.55 Georgia,serif; }
.evidence { margin-top:28px; }
@media (max-width:780px) { .timeline { grid-template-columns:1fr; }.timeline li { min-height:auto; }.case-meta code { width:100%; order:3; } }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; transition:none!important; } }
```

## 11. C9: Receipt and Seed

#### File: `src/domain/demo/demo-receipt.ts`
[ASSUMED] — Canonical SHA-256 receipt.

```typescript
// File: src/domain/demo/demo-receipt.ts
import { createHash } from "node:crypto";
import { z } from "zod";

export const RECEIPT_EVIDENCE_CLASSES = [
  "strategy_live_exchange", "response_live_exchange", "same_alias",
  "exact_boundary", "semantic_constraints", "one_turn_consumed",
] as const;
export type ReceiptEvidenceClass = (typeof RECEIPT_EVIDENCE_CLASSES)[number];

const receiptInputSchema = z.object({
  caseCodeDigest: z.string().regex(/^[0-9a-f]{64}$/),
  strategyDigest: z.string().regex(/^[0-9a-f]{64}$/),
  responseDigest: z.string().regex(/^[0-9a-f]{64}$/),
  beforeVersion: z.number().int().nonnegative(), afterVersion: z.number().int().positive(),
  strategyReadyAt: z.string().datetime({ offset: false }),
  responseReadyAt: z.string().datetime({ offset: false }),
  consumedAt: z.string().datetime({ offset: false }),
  evidenceClasses: z.tuple([
    z.literal("strategy_live_exchange"), z.literal("response_live_exchange"),
    z.literal("same_alias"), z.literal("exact_boundary"),
    z.literal("semantic_constraints"), z.literal("one_turn_consumed"),
  ]),
}).strict().superRefine((value, context) => {
  if (value.afterVersion !== value.beforeVersion + 1) {
    context.addIssue({ code: "custom", message: "receipt versions must be sequential" });
  }
});
export type ReceiptInput = z.infer<typeof receiptInputSchema>;

export function createReceipt(input: ReceiptInput): string {
  const value = receiptInputSchema.parse(input);
  const ordered = [value.caseCodeDigest, value.strategyDigest, value.responseDigest,
    value.beforeVersion, value.afterVersion, value.strategyReadyAt,
    value.responseReadyAt, value.consumedAt, value.evidenceClasses];
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}
```

#### File: `src/evidence/live-manifest.ts`
[ASSUMED] — Redacted evidence schema; it cannot represent prompts, raw messages, aliases, IDs, or credentials.

```typescript
// File: src/evidence/live-manifest.ts
import { z } from "zod";
import { MINDS_SDK_VERSION } from "../infrastructure/minds/history";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const processSchema = z.object({
  executionClass: z.literal("live_sdk"), logicalSendCount: z.literal(1),
  wireAttemptCount: z.literal("sdk_managed_unknown"), processInstanceId: z.string().uuid(),
  processStartedAt: z.string().datetime({ offset: false }),
  processNonce: z.string().uuid(), startedAt: z.string().datetime({ offset: false }),
  completedAt: z.string().datetime({ offset: false }), latencyMs: z.number().int().nonnegative(),
  aliasDigest: digest, mindDigest: digest, beforeBoundaryDigest: digest,
  afterBoundaryDigest: digest, artifactDigest: digest,
  sendResolution: z.enum(["acknowledged", "history_recovered"]),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.completedAt) - Date.parse(value.startedAt) !== value.latencyMs) {
    context.addIssue({ code: "custom", message: "process latency mismatch" });
  }
  if (Date.parse(value.processStartedAt) > Date.parse(value.startedAt)) {
    context.addIssue({ code: "custom", message: "process start follows work start" });
  }
});

export const liveManifestSchema = z.object({
  schemaVersion: z.literal(1), classification: z.literal("live"),
  deploymentUrl: z.string().url().startsWith("https://"), sdkVersion: z.literal(MINDS_SDK_VERSION),
  processA: processSchema, processB: processSchema, sameAlias: z.literal(true), sameMind: z.literal(true),
  semanticSendCount: z.literal(2), stateVersions: z.tuple([z.literal(3), z.literal(6), z.literal(7)]),
  receiptDigest: digest, replayRejected: z.literal(true),
  evidenceClasses: z.tuple([
    z.literal("strategy_live_exchange"), z.literal("response_live_exchange"),
    z.literal("same_alias"), z.literal("exact_boundary"),
    z.literal("semantic_constraints"), z.literal("one_turn_consumed"),
  ]),
}).strict().superRefine((value, context) => {
  const invalid = value.processA.afterBoundaryDigest !== value.processB.beforeBoundaryDigest ||
    value.processA.aliasDigest !== value.processB.aliasDigest ||
    value.processA.mindDigest !== value.processB.mindDigest ||
    value.processA.processInstanceId === value.processB.processInstanceId ||
    value.processA.processNonce === value.processB.processNonce ||
    Date.parse(value.processB.processStartedAt) < Date.parse(value.processA.completedAt) ||
    Date.parse(value.processB.startedAt) < Date.parse(value.processA.completedAt);
  if (invalid) context.addIssue({ code: "custom", message: "cross-process evidence mismatch" });
});
export type LiveManifest = z.infer<typeof liveManifestSchema>;

export function createLiveManifest(input: LiveManifest): LiveManifest {
  return liveManifestSchema.parse(input);
}

export function serializeLiveManifest(input: LiveManifest): string {
  return `${JSON.stringify(createLiveManifest(input), null, 2)}\n`;
}
```

#### File: `scripts/seed-demo.ts`
[ASSUMED] — Seeds deterministic state only.

```typescript
// File: scripts/seed-demo.ts
import { loadEnv } from "../src/config/env";
import { createDatabaseClient } from "../src/infrastructure/db/client";
import { createDemoCaseRepository } from "../src/infrastructure/db/demo-case-repository";

const SEED_CODE = "OLT-DEMO-0001";

async function main(): Promise<void> {
  const config = loadEnv(process.env);
  if (!config.databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  const database = createDatabaseClient({ connectionString: config.databaseUrl, max: 1 });
  try {
    const record = await database.sql.begin(async (sql) => {
      const repository = createDemoCaseRepository(sql);
      return await repository.findByCode(SEED_CODE) ?? repository.createDraft(SEED_CODE);
    });
    if (record.state !== "draft" || record.stateVersion !== 0 || record.strategyProvenance || record.responseProvenance) {
      throw new Error("SEED_CASE_NOT_DRAFT_ONLY");
    }
    process.stdout.write(`CASE_CODE=${record.publicCode}\n`);
  } finally { await database.close(); }
}

main().catch(() => { process.stderr.write("SEED_DEMO_FAILED\n"); process.exitCode = 1; });
```

#### File: `scripts/run-case-command.ts`
[ASSUMED] — Deterministic case commands for the live proof sequence; no provider adapter is constructed.

```typescript
// File: scripts/run-case-command.ts
import { createCaseRuntime } from "../src/application/demo-runtime";

const RETURN_MESSAGE = "Can we discuss the past incident within the agreed future-focused boundary?";

async function main(): Promise<void> {
  const [action, code, rawVersion] = process.argv.slice(2);
  const runtime = createCaseRuntime(process.env);
  try {
    if (action === "create") {
      const created = await runtime.controller.create();
      process.stdout.write(`CASE_CODE=${created.code}\n`);
      return;
    }
    if (!action || !code || !rawVersion || !/^\d+$/.test(rawVersion)) {
      throw new Error("CASE_COMMAND_INPUT_REQUIRED");
    }
    const version = Number(rawVersion);
    const view = action === "authorize"
      ? await runtime.controller.authorize(code, version)
      : action === "submit-return"
        ? await runtime.controller.submitReturn(code, version, RETURN_MESSAGE)
        : action === "consume"
          ? await runtime.controller.consume(code, version)
          : null;
    if (!view) throw new Error("CASE_COMMAND_UNKNOWN");
    process.stdout.write(`CASE_COMMAND=${view.state}\n`);
  } finally { await runtime.close(); }
}

main().catch(() => { process.stderr.write("CASE_COMMAND=failed\n"); process.exitCode = 1; });
```

#### File: `src/evidence/live-manifest-builder.ts`
[ASSUMED] — Pure derivation from the committed case record plus an observed replay outcome.

```typescript
// File: src/evidence/live-manifest-builder.ts
import { createReceipt, RECEIPT_EVIDENCE_CLASSES } from "../domain/demo/demo-receipt";
import type { DemoCaseRecord, DemoLedgerEvent } from "../infrastructure/db/demo-case-repository";
import { sha256, type ExchangeEvidence } from "../infrastructure/minds/history";
import type { LiveManifest } from "./live-manifest";

function processEvidence(evidence: ExchangeEvidence, artifactDigest: string) {
  return { executionClass: evidence.executionClass as "live_sdk", logicalSendCount: evidence.logicalSendCount,
    wireAttemptCount: "sdk_managed_unknown" as const, processInstanceId: evidence.processInstanceId,
    processStartedAt: evidence.processStartedAt, processNonce: evidence.processNonce,
    startedAt: evidence.startedAt, completedAt: evidence.completedAt, latencyMs: evidence.latencyMs,
    aliasDigest: evidence.aliasDigest, mindDigest: evidence.mindDigest,
    beforeBoundaryDigest: evidence.before.digest, afterBoundaryDigest: evidence.after.digest,
    artifactDigest, sendResolution: evidence.sendResolution };
}

function requireEventVersions(events: readonly DemoLedgerEvent[], strategyDigest: string,
  responseDigest: string, strategyBoundaryDigest: string, responseBoundaryDigest: string): [3, 6, 7] {
  const expected = ["authorize", "claim_strategy", "record_strategy", "submit_return",
    "claim_response", "record_response", "consume_turn", "replay_rejected"];
  if (events.length !== expected.length || events.some((event, index) =>
    event.event !== expected[index] || event.version !== Math.min(index + 1, 7))) {
    throw new Error("LIVE_MANIFEST_LEDGER_MISMATCH");
  }
  const replay = events[7]!;
  if (replay.payload.code !== "DEMO_TERMINAL" || replay.payload.attemptedVersion !== replay.version ||
      typeof replay.payload.observedAt !== "string" || new Date(replay.payload.observedAt).toISOString() !== replay.payload.observedAt) {
    throw new Error("LIVE_MANIFEST_REPLAY_MISMATCH");
  }
  const strategy = events[2]!.payload;
  const response = events[5]!.payload;
  if (strategy.artifactDigest !== strategyDigest || strategy.boundaryDigest !== strategyBoundaryDigest ||
      response.artifactDigest !== responseDigest || response.boundaryDigest !== responseBoundaryDigest) {
    throw new Error("LIVE_MANIFEST_EVENT_PAYLOAD_MISMATCH");
  }
  return [events[2]!.version, events[5]!.version, events[6]!.version] as [3, 6, 7];
}

function requireReceipt(record: DemoCaseRecord, strategyDigest: string, responseDigest: string,
  versions: [3, 6, 7]): string {
  if (!record.strategyReadyAt || !record.responseReadyAt || !record.turnConsumedAt || !record.receiptDigest ||
      JSON.stringify(record.receiptEvidenceClasses) !== JSON.stringify(RECEIPT_EVIDENCE_CLASSES)) {
    throw new Error("LIVE_MANIFEST_RECEIPT_MISMATCH");
  }
  const computed = createReceipt({ caseCodeDigest: sha256(record.publicCode), strategyDigest, responseDigest,
    beforeVersion: versions[1], afterVersion: versions[2], strategyReadyAt: record.strategyReadyAt,
    responseReadyAt: record.responseReadyAt, consumedAt: record.turnConsumedAt,
    evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] });
  if (computed !== record.receiptDigest) throw new Error("LIVE_MANIFEST_RECEIPT_MISMATCH");
  return computed;
}

export function buildLiveManifest(input: { record: DemoCaseRecord; events: readonly DemoLedgerEvent[];
  deploymentUrl: string }): LiveManifest {
  const { record } = input;
  if (record.state !== "closed" || !record.strategyProvenance || !record.responseProvenance ||
      !record.strategyArtifact || !record.responseArtifact) throw new Error("LIVE_MANIFEST_EVIDENCE_INCOMPLETE");
  const processA = record.strategyProvenance;
  const processB = record.responseProvenance;
  if (processA.executionClass !== "live_sdk" || processB.executionClass !== "live_sdk" ||
      processA.processInstanceId === processB.processInstanceId) throw new Error("LIVE_MANIFEST_ORIGIN_MISMATCH");
  const strategyDigest = sha256(JSON.stringify(record.strategyArtifact));
  const responseDigest = sha256(JSON.stringify(record.responseArtifact));
  if (strategyDigest !== record.strategyDigest || responseDigest !== record.responseDigest) {
    throw new Error("LIVE_MANIFEST_ARTIFACT_MISMATCH");
  }
  const sameAlias = processA.aliasDigest === processB.aliasDigest;
  const sameMind = processA.mindDigest === processB.mindDigest;
  const semanticSendCount = processA.logicalSendCount + processB.logicalSendCount;
  if (!sameAlias || !sameMind || semanticSendCount !== 2 || processA.sdkVersion !== processB.sdkVersion) {
    throw new Error("LIVE_MANIFEST_CROSS_PROCESS_MISMATCH");
  }
  const classification: "live" = processA.executionClass === "live_sdk" && processB.executionClass === "live_sdk"
    ? "live" : (() => { throw new Error("LIVE_MANIFEST_ORIGIN_MISMATCH"); })();
  const verifiedSendCount: 2 = semanticSendCount === 2 ? semanticSendCount :
    (() => { throw new Error("LIVE_MANIFEST_SEND_COUNT_MISMATCH"); })();
  const replayRejected: true = input.events.at(-1)?.event === "replay_rejected" ? true :
    (() => { throw new Error("LIVE_MANIFEST_REPLAY_MISSING"); })();
  const stateVersions = requireEventVersions(input.events, strategyDigest, responseDigest,
    processA.after.digest, processB.after.digest);
  if (record.stateVersion !== stateVersions[2]) throw new Error("LIVE_MANIFEST_LEDGER_MISMATCH");
  return { schemaVersion: 1, classification, deploymentUrl: input.deploymentUrl,
    sdkVersion: processA.sdkVersion, processA: processEvidence(processA, strategyDigest),
    processB: processEvidence(processB, responseDigest), sameAlias, sameMind, semanticSendCount: verifiedSendCount,
    stateVersions, receiptDigest: requireReceipt(record, strategyDigest, responseDigest, stateVersions),
    replayRejected,
    evidenceClasses: record.receiptEvidenceClasses as unknown as LiveManifest["evidenceClasses"] };
}

export async function observeReplayRejection(code: string, version: number,
  consume: (code: string, version: number) => Promise<unknown>): Promise<true> {
  try { await consume(code, version); }
  catch (error) {
    if (error instanceof Error && error.message === "DEMO_TERMINAL") return true;
    throw error;
  }
  throw new Error("LIVE_REPLAY_WAS_ACCEPTED");
}
```

#### File: `scripts/write-live-manifest.ts`
[ASSUMED] — Derives the redacted manifest from committed database evidence and an observed terminal replay rejection.

```typescript
// File: scripts/write-live-manifest.ts
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCaseRuntime } from "../src/application/demo-runtime";
import { buildLiveManifest, observeReplayRejection } from "../src/evidence/live-manifest-builder";
import { serializeLiveManifest } from "../src/evidence/live-manifest";

async function main(): Promise<void> {
  const code = process.argv[2];
  if (!code) throw new Error("PUBLIC_CASE_CODE_REQUIRED");
  const runtime = createCaseRuntime(process.env);
  try {
    const record = await runtime.cases.findByCode(code);
    if (!record || !runtime.config.appUrl) throw new Error("LIVE_MANIFEST_CONFIGURATION_MISSING");
    await observeReplayRejection(code, record.stateVersion,
      (caseCode, version) => runtime.cases.consumeTurn(caseCode, version));
    await runtime.cases.recordReplayRejection(code, record.stateVersion);
    const confirmed = await runtime.cases.findByCode(code);
    if (!confirmed || confirmed.stateVersion !== record.stateVersion ||
        confirmed.receiptDigest !== record.receiptDigest) {
      throw new Error("LIVE_REPLAY_CHANGED_COMMITTED_STATE");
    }
    const events = await runtime.cases.listEventsByCode(code);
    const output = serializeLiveManifest(buildLiveManifest({ record: confirmed, events,
      deploymentUrl: runtime.config.appUrl }));
    const destination = path.join(process.cwd(), "artifacts", "implementation", "thin-slice-live-manifest.json");
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp-${process.pid}`;
    await writeFile(temporary, output, { mode: 0o644 });
    await rename(temporary, destination);
    process.stdout.write("LIVE_MANIFEST=ready\n");
  } finally { await runtime.close(); }
}

main().catch(() => { process.stderr.write("LIVE_MANIFEST=failed\n"); process.exitCode = 1; });
```

#### File: `src/evidence/demo-timing.ts`
[ASSUMED] — Computes the rehearsal duration only from measured markers and the verified live manifest.

```typescript
// File: src/evidence/demo-timing.ts
import { z } from "zod";
import { sha256 } from "../infrastructure/minds/history";
import type { LiveManifest } from "./live-manifest";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const beatSchema = z.object({ id: z.string().min(1), kind: z.enum(["narration", "ui", "process_a", "process_b"]),
  startedMs: z.number().int().nonnegative(), endedMs: z.number().int().positive(),
  mode: z.enum(["live", "same_run_time_cut"]).optional(), clipDigest: digest.optional(),
  evidenceDigest: digest.optional(), label: z.string().optional() }).strict();
export const rehearsalMarkersSchema = z.object({ schemaVersion: z.literal(1), sourceManifestDigest: digest,
  beats: z.array(beatSchema) }).strict();
export const demoTimingSchema = z.object({ schemaVersion: z.literal(1), sourceManifestDigest: digest,
  actualProviderLatencyMs: z.object({ processA: z.number().int(), processB: z.number().int() }),
  beats: z.array(beatSchema), totalMs: z.number().int().min(90_000).max(120_000), withinTarget: z.literal(true) }).strict();
export type DemoTiming = z.infer<typeof demoTimingSchema>;

function assertProviderBeat(beat: z.infer<typeof beatSchema>, actualMs: number, evidenceDigest: string): void {
  const shownMs = beat.endedMs - beat.startedMs;
  const live = beat.mode === "live" && !beat.clipDigest && !beat.evidenceDigest && !beat.label &&
    Math.abs(shownMs - actualMs) <= 1_500;
  if (live) return;
  const cut = beat.mode === "same_run_time_cut" && shownMs <= actualMs && beat.clipDigest &&
    beat.evidenceDigest === evidenceDigest && beat.label === "Same verified run · time-compressed";
  if (!cut) throw new Error("TIMING_PROVIDER_EVIDENCE_MISMATCH");
}

export function buildDemoTiming(manifest: LiveManifest, rawManifest: string, rawMarkers: unknown): DemoTiming {
  const markers = rehearsalMarkersSchema.parse(rawMarkers);
  if (markers.beats.length < 4) throw new Error("TIMING_MARKERS_INCOMPLETE");
  const sourceManifestDigest = sha256(rawManifest);
  if (markers.sourceManifestDigest !== sourceManifestDigest) throw new Error("TIMING_MANIFEST_DIGEST_MISMATCH");
  for (let index = 0; index < markers.beats.length; index += 1) {
    const beat = markers.beats[index]!;
    if (beat.endedMs <= beat.startedMs || (index > 0 && beat.startedMs < markers.beats[index - 1]!.endedMs)) {
      throw new Error("TIMING_MARKERS_NOT_MONOTONIC");
    }
    if ((beat.kind === "narration" || beat.kind === "ui") &&
        (beat.mode || beat.clipDigest || beat.evidenceDigest || beat.label)) {
      throw new Error("TIMING_NON_PROVIDER_METADATA");
    }
  }
  const processABeats = markers.beats.filter((beat) => beat.kind === "process_a");
  const processBBeats = markers.beats.filter((beat) => beat.kind === "process_b");
  if (processABeats.length !== 1 || processBBeats.length !== 1) throw new Error("TIMING_PROVIDER_BEAT_COUNT");
  const processA = processABeats[0]!;
  const processB = processBBeats[0]!;
  assertProviderBeat(processA, manifest.processA.latencyMs, sha256(JSON.stringify(manifest.processA)));
  assertProviderBeat(processB, manifest.processB.latencyMs, sha256(JSON.stringify(manifest.processB)));
  const totalMs = markers.beats.at(-1)!.endedMs - markers.beats[0]!.startedMs;
  return demoTimingSchema.parse({ schemaVersion: 1, sourceManifestDigest,
    actualProviderLatencyMs: { processA: manifest.processA.latencyMs, processB: manifest.processB.latencyMs },
    beats: markers.beats, totalMs, withinTarget: true });
}
```

#### File: `scripts/write-demo-timing.ts`
[ASSUMED] — Atomically writes a redacted, evidence-bound rehearsal timing plan without provider calls.

```typescript
// File: scripts/write-demo-timing.ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDemoTiming } from "../src/evidence/demo-timing";
import { createLiveManifest } from "../src/evidence/live-manifest";

async function main(): Promise<void> {
  const manifestPath = process.argv[2] ?? "artifacts/implementation/thin-slice-live-manifest.json";
  const markersPath = process.argv[3] ?? "artifacts/implementation/rehearsal-markers.json";
  const rawManifest = await readFile(manifestPath, "utf8");
  const timing = buildDemoTiming(createLiveManifest(JSON.parse(rawManifest)), rawManifest,
    JSON.parse(await readFile(markersPath, "utf8")));
  const destination = path.join(process.cwd(), "artifacts", "implementation", "thin-slice-demo-timing.json");
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(timing, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, destination);
  process.stdout.write("DEMO_TIMING=ready\n");
}
main().catch(() => { process.stderr.write("DEMO_TIMING=failed\n"); process.exitCode = 1; });
```

#### File: `scripts/capture-rehearsal-marker.ts`
[ASSUMED] — Captures human narration/UI/display beats with wall-clock measurements and no provider call.

```typescript
// File: scripts/capture-rehearsal-marker.ts
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { rehearsalMarkersSchema } from "../src/evidence/demo-timing";
import { createLiveManifest } from "../src/evidence/live-manifest";
import { sha256 } from "../src/infrastructure/minds/history";

const markerPath = "artifacts/implementation/rehearsal-markers.json";
const manifestPath = "artifacts/implementation/thin-slice-live-manifest.json";

export function digestClip(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function atomicWrite(value: unknown): Promise<void> {
  const temporary = `${markerPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, markerPath);
}

async function main(): Promise<void> {
  const [id, rawKind, rawMode, clipPath] = process.argv.slice(2);
  const rawManifest = await readFile(manifestPath, "utf8");
  const manifest = createLiveManifest(JSON.parse(rawManifest));
  const sourceManifestDigest = sha256(rawManifest);
  if (id === "reset") { await atomicWrite({ schemaVersion: 1, sourceManifestDigest, beats: [] }); return; }
  const kind = rawKind as "narration" | "ui" | "process_a" | "process_b";
  if (!id || !["narration", "ui", "process_a", "process_b"].includes(kind)) throw new Error("REHEARSAL_MARKER_INPUT_INVALID");
  const existing = rehearsalMarkersSchema.parse(JSON.parse(await readFile(markerPath, "utf8")));
  if (existing.sourceManifestDigest !== sourceManifestDigest || existing.beats.some((beat) => beat.id === id)) {
    throw new Error("REHEARSAL_MARKER_STATE_INVALID");
  }
  const startedMs = Date.now();
  const terminal = createInterface({ input: stdin, output: stdout });
  await terminal.question(`Perform ${id}, then press Enter to stop timing: `);
  terminal.close();
  const beat: Record<string, unknown> = { id, kind, startedMs, endedMs: Date.now() };
  if (kind === "process_a" || kind === "process_b") {
    const mode = rawMode === "same_run_time_cut" ? rawMode : "live";
    Object.assign(beat, { mode });
    if (mode === "same_run_time_cut") {
      if (!clipPath) throw new Error("REHEARSAL_CLIP_REQUIRED");
      Object.assign(beat, { clipDigest: digestClip(await readFile(clipPath)),
        evidenceDigest: sha256(JSON.stringify(kind === "process_a" ? manifest.processA : manifest.processB)),
        label: "Same verified run · time-compressed" });
    }
  }
  await atomicWrite({ ...existing, beats: [...existing.beats, beat] });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write("REHEARSAL_MARKER=failed\n"); process.exitCode = 1; });
}
```

#### File: `tests/unit/evidence/demo-timing.test.ts`
[ASSUMED] — Timing totals and same-run time cuts are derived and bounded.

```typescript
// File: tests/unit/evidence/demo-timing.test.ts
import { describe, expect, it } from "vitest";
import { buildDemoTiming } from "../../../src/evidence/demo-timing";
import { sha256 } from "../../../src/infrastructure/minds/history";
import type { LiveManifest } from "../../../src/evidence/live-manifest";
import { digestClip } from "../../../scripts/capture-rehearsal-marker";

const process = { latencyMs: 10_000 };
const manifest = { processA: process, processB: process } as LiveManifest;
const raw = JSON.stringify(manifest);
function markers(totalMs: number): { schemaVersion: 1; sourceManifestDigest: string;
  beats: Array<Record<string, unknown>> } { return { schemaVersion: 1, sourceManifestDigest: sha256(raw), beats: [
  { id: "opening", kind: "narration", startedMs: 0, endedMs: 20_000 },
  { id: "a", kind: "process_a", startedMs: 20_000, endedMs: 30_000, mode: "live" },
  { id: "ui", kind: "ui", startedMs: 30_000, endedMs: totalMs - 10_000 },
  { id: "b", kind: "process_b", startedMs: totalMs - 10_000, endedMs: totalMs, mode: "live" },
] }; }
describe("demo timing", () => {
  it("hashes exact binary clip bytes", () => expect(digestClip(Buffer.from([0x80])))
    .not.toBe(digestClip(Buffer.from([0x81]))));
  it("accepts a computed 100-second rehearsal", () => expect(buildDemoTiming(manifest, raw, markers(100_000)).totalMs).toBe(100_000));
  it.each([89_999, 120_001])("rejects an out-of-range total", (total) =>
    expect(() => buildDemoTiming(manifest, raw, markers(total))).toThrow());
  it("rejects a caller manifest digest mismatch", () => expect(() => buildDemoTiming(manifest, raw,
    { ...markers(100_000), sourceManifestDigest: "0".repeat(64) })).toThrow("TIMING_MANIFEST_DIGEST_MISMATCH"));
  it("rejects a duplicate provider beat", () => {
    const value = markers(100_000);
    value.beats.splice(2, 0, { id: "a-copy", kind: "process_a", startedMs: 30_000,
      endedMs: 40_000, mode: "live" });
    value.beats[3] = { ...value.beats[3]!, startedMs: 40_000 };
    expect(() => buildDemoTiming(manifest, raw, value)).toThrow("TIMING_PROVIDER_BEAT_COUNT");
  });
  it("rejects clip metadata on a live provider beat", () => {
    const value = markers(100_000);
    value.beats[1] = { ...value.beats[1]!, clipDigest: "a".repeat(64) };
    expect(() => buildDemoTiming(manifest, raw, value)).toThrow("TIMING_PROVIDER_EVIDENCE_MISMATCH");
  });
  it("binds a labeled same-run time cut to the exact process evidence", () => {
    const value = markers(100_000);
    value.beats[1] = { ...value.beats[1]!, endedMs: 25_000, mode: "same_run_time_cut",
      clipDigest: "f".repeat(64), evidenceDigest: sha256(JSON.stringify(manifest.processA)),
      label: "Same verified run · time-compressed" };
    value.beats[2] = { ...value.beats[2]!, startedMs: 25_000 };
    expect(buildDemoTiming(manifest, raw, value).totalMs).toBe(100_000);
    value.beats[1] = { ...value.beats[1]!, evidenceDigest: "0".repeat(64) };
    expect(() => buildDemoTiming(manifest, raw, value)).toThrow("TIMING_PROVIDER_EVIDENCE_MISMATCH");
  });
});
```

#### File: `tests/e2e/thin-slice.spec.ts`
[ASSUMED] — Read-only browser proof over a separately prepared real case; it performs no provider send.

```typescript
// File: tests/e2e/thin-slice.spec.ts
import { expect, test } from "@playwright/test";
test("deployed case renders redacted evidence and terminal replay state", async ({ page }) => {
  const code = process.env.E2E_CASE_CODE;
  if (!code) throw new Error("E2E_CASE_CODE_REQUIRED");
  await page.goto(`/?case=${encodeURIComponent(code)}`);
  await expect(page.getByRole("heading", { name: /One Last Turn/i })).toBeVisible();
  await expect(page.getByLabel("Case timeline")).toBeVisible();
  await expect(page.getByLabel("Integration proof")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/stable alias|mind id|message id|fingerprint|private choice/i);
  if (process.env.E2E_EXPECT_CLOSED === "true") {
    await expect(page.getByRole("button", { name: "Already used" })).toBeDisabled();
  }
});
```

## 12. Domain Knowledge File

Build creates `DOMAIN-GUIDE.md` with: appeal versus contact, bounded authorization, stable alias, authoritative boundary, omitted-context proof, semantic ambiguity, deterministic authority, one-turn grant, replay, receipt, raw evidence, redacted manifest, and Cognition. Each term maps to the code identifiers above and cites PRD sections 1–7.

## 13. Submission Directory Plan

<pre>
submission/
├── screenshots/{landing.png,core-feature.png,integration-proof.png}
├── video/links.md
├── proof.md
├── links.md
└── sponsor-tracks.md
</pre>

Package creates this directory. Demo supplies screenshots and video link. Deploy and live proof supply redacted integration evidence.

## 14. Multi-Track Architecture

One track only: Moderation and Community Assistance. No secondary track is claimed.

## 15. Safety Architecture

| Layer | Component | Defense | Test |
|---|---|---|---|
| Input validation | C4, C7 | Strict Zod artifacts and bounded form inputs | malformed artifact and invalid action tests |
| Transaction authority | C1–C3 | predecessor, expected version, row lock, atomic receipt | transition and concurrency tests |
| Circuit breaker | C5–C6 | stop on low Cognition, timeout, ambiguity, or boundary mismatch | fault injection tests |
| Graceful degradation | C7–C8 | exact redacted failure state; no fake success | UI failure-state test |
| Privacy | C7, C9 | redacted view plus ignored owner-only evidence | secret and leakage scans |

## 16. Agent Architecture

The Minds worker does not loop autonomously inside the application. Each job has one direct work assignment and one semantic-send ceiling. Self-correction is limited to schema validation: malformed provider output fails rather than triggering another semantic send. Process isolation is the A/B executable boundary; results enter shared state only after provenance and schema checks.

## 17. Configuration Reference

### Credentials Needed

| Variable | Used by | Where to obtain | Required before |
|---|---|---|---|
| `DATABASE_URL` | repository and migrations | provisioned PostgreSQL dashboard | integration/deploy |
| `MINDS_BUILDER_API_KEY` | Minds client | Minds Builder Hub | live preflight |
| `MINDS_MIND_ID` | stable conversation binding | Minds Builder account | live preflight |
| `MINDS_LIVE_ENABLED` | production safety gate | set to `true` only for live run | deploy |
| `DEMO_CASE_ENABLED` | thin-slice feature gate | deployment configuration | deploy |

No email, Clerk, or delivery credential is required by the thin-slice hero flow.

#### File: `src/config/feature-flags.ts`
[VERIFIED] — Existing feature flags extended by one explicit demo-case flag.

```typescript
// File: src/config/feature-flags.ts
export type FeatureFlags = Readonly<{
  authLive: boolean; contactLane: boolean; demoCase: boolean; emailLive: boolean; mindsLive: boolean;
}>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.freeze({
  authLive: false, contactLane: false, demoCase: false, emailLive: false, mindsLive: false,
});
```

#### File: `src/config/env.ts`
[ASSUMED] — Complete final environment contract; tests prove feature/credential dependencies.

```typescript
// File: src/config/env.ts
import { z } from "zod";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from "./feature-flags";

const booleanString = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(), APP_URL: z.string().url().optional(),
  MINDS_LIVE_ENABLED: booleanString, MINDS_BUILDER_API_KEY: z.string().min(1).optional(),
  MINDS_MIND_ID: z.string().min(1).optional(), DEMO_CASE_ENABLED: booleanString,
  EMAIL_LIVE_ENABLED: booleanString, RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(), AUTH_LIVE_ENABLED: booleanString,
  CLERK_SECRET_KEY: z.string().min(1).optional(), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CONTACT_LANE_ENABLED: booleanString, DEMO_BYPASS_AUTH: booleanString,
});
type ParsedEnvironment = z.infer<typeof environmentSchema>;

export type AppConfig = Readonly<{
  appUrl: string | undefined; builderApiKey: string | undefined; databaseUrl: string | undefined;
  demoBypassAuth: boolean; features: FeatureFlags; mindId: string | undefined;
  nodeEnv: ParsedEnvironment["NODE_ENV"];
}>;

export function loadEnv(source: NodeJS.ProcessEnv): AppConfig {
  const parsed = environmentSchema.parse(source);
  validateRequiredVariables(parsed);
  return Object.freeze({ appUrl: parsed.APP_URL, builderApiKey: parsed.MINDS_BUILDER_API_KEY,
    databaseUrl: parsed.DATABASE_URL, demoBypassAuth: parsed.DEMO_BYPASS_AUTH,
    features: Object.freeze({ ...DEFAULT_FEATURE_FLAGS, authLive: parsed.AUTH_LIVE_ENABLED,
      contactLane: parsed.CONTACT_LANE_ENABLED, demoCase: parsed.DEMO_CASE_ENABLED,
      emailLive: parsed.EMAIL_LIVE_ENABLED, mindsLive: parsed.MINDS_LIVE_ENABLED }),
    mindId: parsed.MINDS_MIND_ID, nodeEnv: parsed.NODE_ENV });
}

function validateRequiredVariables(environment: ParsedEnvironment): void {
  if (environment.NODE_ENV === "production" && environment.DEMO_BYPASS_AUTH) {
    throw new Error("DEMO_BYPASS_AUTH cannot be enabled in production");
  }
  if (environment.DEMO_CASE_ENABLED && !environment.MINDS_LIVE_ENABLED) {
    throw new Error("DEMO_CASE_ENABLED requires MINDS_LIVE_ENABLED");
  }
  const missing = collectMissingVariables(environment);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

function collectMissingVariables(environment: ParsedEnvironment): string[] {
  const missing: string[] = [];
  requireWhen(missing, environment.NODE_ENV !== "test", environment, ["DATABASE_URL"]);
  requireWhen(missing, environment.MINDS_LIVE_ENABLED, environment,
    ["MINDS_BUILDER_API_KEY", "MINDS_MIND_ID"]);
  requireWhen(missing, environment.EMAIL_LIVE_ENABLED, environment, ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"]);
  requireWhen(missing, environment.AUTH_LIVE_ENABLED, environment,
    ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
  return missing;
}

function requireWhen(missing: string[], enabled: boolean, environment: ParsedEnvironment,
  names: ReadonlyArray<keyof ParsedEnvironment>): void {
  if (!enabled) return;
  for (const name of names) if (!environment[name]) missing.push(name);
}
```

#### File: `package.json`
[VERIFIED] — Existing pinned dependencies with corrected executable scripts.

```json
{
  "_file": "package.json",
  "name": "one-last-turn",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration --no-file-parallelism",
    "test:contract": "vitest run tests/contract",
    "test:security": "vitest run tests/security",
    "test:fault": "vitest run tests/fault-injection",
    "test:a11y": "vitest run tests/accessibility",
    "test:e2e": "playwright test",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:contract && npm run test:security && npm run test:fault && npm run test:a11y",
    "db:migrate": "tsx scripts/migrate.ts",
    "seed:demo": "tsx scripts/seed-demo.ts",
    "preflight:live-env": "tsx scripts/assert-live-env-preflight.ts",
    "case:strategy": "tsx scripts/run-case-strategy.ts",
    "case:response": "tsx scripts/run-case-response.ts",
    "case:command": "tsx scripts/run-case-command.ts",
    "evidence:manifest": "tsx scripts/write-live-manifest.ts",
    "evidence:timing": "tsx scripts/write-demo-timing.ts",
    "rehearsal:mark": "tsx scripts/capture-rehearsal-marker.ts"
  },
  "dependencies": {
    "@animocabrands/minds-client-lib": "0.1.4", "@clerk/nextjs": "7.8.2",
    "drizzle-orm": "0.45.2", "next": "16.3.3", "pino": "10.3.1",
    "postgres": "3.4.9", "react": "19.2.8", "react-dom": "19.2.8",
    "resend": "6.24.0", "server-only": "0.0.1", "zod": "4.4.3"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.13.0", "@playwright/test": "1.62.1",
    "@tailwindcss/postcss": "4.3.3", "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2", "@testing-library/user-event": "14.6.6",
    "@types/node": "26.3.0", "@types/react": "19.2.18", "@types/react-dom": "19.2.5",
    "@vitest/coverage-v8": "4.1.11", "eslint": "9.39.5", "eslint-config-next": "16.3.3",
    "eslint-plugin-boundaries": "7.2.0", "jsdom": "29.1.1", "tailwindcss": "4.3.3",
    "testcontainers": "12.1.0", "tsx": "4.23.12", "typescript": "6.0.3", "vitest": "4.1.11"
  }
}
```

#### File: `.env.example`
[VERIFIED] — Placeholder-only manifest; values are never real credentials.

```dotenv
# File: .env.example
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/one_last_turn
APP_URL=http://localhost:3000
DEMO_CASE_ENABLED=false
MINDS_LIVE_ENABLED=false
MINDS_BUILDER_API_KEY=replace_in_untracked_env
MINDS_MIND_ID=replace_in_untracked_env
EMAIL_LIVE_ENABLED=false
RESEND_API_KEY=replace_only_if_email_enabled
RESEND_WEBHOOK_SECRET=replace_only_if_email_enabled
AUTH_LIVE_ENABLED=false
CLERK_SECRET_KEY=replace_only_if_auth_enabled
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=replace_only_if_auth_enabled
CONTACT_LANE_ENABLED=false
DEMO_BYPASS_AUTH=false
```

## 18. Testing Strategy

| Layer | Command | Acceptance |
|---|---|---|
| Unit | `npm run test:unit` | transitions, prompts, provenance, receipts pass |
| Integration | `npm run test:integration` | migrations and exactly-one consume pass against PostgreSQL |
| Contract | `npm run test:contract` | SDK and environment contracts pass |
| Security/fault | `npm run test:security && npm run test:fault` | no leakage and honest failure states |
| Accessibility | `npm run test:a11y` | ready, running, response, closed, failed states pass |
| Browser | `E2E_CASE_CODE=... npm run test:e2e -- tests/e2e/thin-slice.spec.ts` | deployed prepared case renders redacted proof; no provider send occurs in Playwright |
| Build | `npm run typecheck && npm run lint && npm run build` | zero errors and warnings |

### Acceptance criteria

| Feature | Criterion | Priority |
|---|---|:---:|
| Process A | Live strategy plus exact terminal boundary persists | P0 |
| Process B | Fresh response applies omitted scope from same alias | P0 |
| Authority | Second consume loses atomically | P0 |
| Privacy | UI and tracked artifacts contain no forbidden raw fields | P0 |
| Cognition | Low balance stops before semantic send | P0 |

## 19. Component Build Order

1. **C1 and C4 in parallel:** pure contracts expose risks earliest.
2. **C2 then C3:** repository precedes transactional service because state ownership must be stable.
3. **C5 in parallel with C2:** SDK provenance does not depend on database implementation.
4. **C6 after C3, C4, C5:** jobs compose the validated boundaries.
5. **C7 and C9 in parallel after C3:** server surface and receipt share the stable aggregate.
6. **C8 after C7:** UI consumes only the final redacted view.

P0 requires C1–C9. C8 does not create authority, but the judge-facing observable proof is itself load-bearing.

### P0 observable integration mapping

| P0 feature | Required components | Integration proof |
|---|---|---|
| F-005 Judge-facing proof timeline | C7 controller/actions, C8 timeline, C9 receipt/evidence | Browser shows both Minds checkpoints, receipt digest, and replay rejection |
| F-006 Cognition and failure visibility | C5 worker, C6 jobs, C7 redacted view, C8 status UI | Low balance stops before send and renders a redacted failed stage |

## 20. Deployment Sequence

Local proof workers run through `vercel env run -e production -- ...` and execute `npm run -s preflight:live-env` before case creation. They must never source a file produced by `vercel env pull` for Secrets: Vercel Secrets are non-readable after creation, so a pulled representation is not a usable Builder credential. The preflight rejects non-JWT-shaped Builder keys and non-UUID Mind IDs before database mutation or provider work.

| Service | Depends on | Startup command | Health check | Environment |
|---|---|---|---|---|
| Provisioned PostgreSQL | external managed dependency | `test -n "$DATABASE_URL"` | `node --input-type=module -e 'import postgres from "postgres"; const sql=postgres(process.env.DATABASE_URL,{max:1}); try { const [row]=await sql\`select 1 as ready\`; if(row.ready!==1) process.exit(1); } finally { await sql.end(); }'` | `DATABASE_URL` |
| Schema migration | Provisioned PostgreSQL | `npm run db:migrate` | `test "$(npm run -s db:migrate \| tail -n1)" = 'MIGRATIONS_APPLIED=0'` | `NODE_ENV`, `DATABASE_URL` |
| Next.js | Schema migration | `npm run start` | `curl -fsS "$APP_URL/api/health" \| jq -e '.status == "ready" and .database == true'` | `NODE_ENV`, `DATABASE_URL`, `APP_URL`, `DEMO_CASE_ENABLED`, `MINDS_LIVE_ENABLED`, `MINDS_BUILDER_API_KEY`, `MINDS_MIND_ID`, `EMAIL_LIVE_ENABLED`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `AUTH_LIVE_ENABLED`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CONTACT_LANE_ENABLED`, `DEMO_BYPASS_AUTH` |
| Case command | Schema migration | `CASE_CODE=$(npm run -s case:command -- create \| sed -n 's/^CASE_CODE=//p'); export CASE_CODE; npm run -s case:command -- authorize "$CASE_CODE" 0` | `test -n "$CASE_CODE" && test "$(npm run -s case:command -- authorize "$CASE_CODE" 0 2>&1 \| tail -n1)" = 'CASE_COMMAND=failed'` after the first successful authorize proves replay is rejected | `NODE_ENV`, `DATABASE_URL`, `APP_URL`, `DEMO_CASE_ENABLED`, `MINDS_LIVE_ENABLED`, `MINDS_BUILDER_API_KEY`, `MINDS_MIND_ID`, `EMAIL_LIVE_ENABLED`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `AUTH_LIVE_ENABLED`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CONTACT_LANE_ENABLED`, `DEMO_BYPASS_AUTH`, `CASE_CODE` |
| Process A | Case authorized, PostgreSQL, Minds | `CASE_STRATEGY_RESULT=$(npm run -s case:strategy -- "$CASE_CODE" \| tail -n1)` | `test "$CASE_STRATEGY_RESULT" = 'CASE_STRATEGY=ready CODE=STRATEGY_READY'` | `NODE_ENV`, `DATABASE_URL`, `APP_URL`, `DEMO_CASE_ENABLED`, `MINDS_LIVE_ENABLED`, `MINDS_BUILDER_API_KEY`, `MINDS_MIND_ID`, `EMAIL_LIVE_ENABLED`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `AUTH_LIVE_ENABLED`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CONTACT_LANE_ENABLED`, `DEMO_BYPASS_AUTH`, `CASE_CODE` |
| Process B | Return stored, Process-A boundary, PostgreSQL, Minds | `CASE_RESPONSE_RESULT=$(npm run -s case:response -- "$CASE_CODE" \| tail -n1)` | `test "$CASE_RESPONSE_RESULT" = 'CASE_RESPONSE=ready CODE=RESPONSE_READY'` | `NODE_ENV`, `DATABASE_URL`, `APP_URL`, `DEMO_CASE_ENABLED`, `MINDS_LIVE_ENABLED`, `MINDS_BUILDER_API_KEY`, `MINDS_MIND_ID`, `EMAIL_LIVE_ENABLED`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `AUTH_LIVE_ENABLED`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CONTACT_LANE_ENABLED`, `DEMO_BYPASS_AUTH`, `CASE_CODE` |
| Manifest | Closed case, A/B evidence, receipt | `MANIFEST_RESULT=$(npm run -s evidence:manifest -- "$CASE_CODE" \| tail -n1)` | `test "$MANIFEST_RESULT" = LIVE_MANIFEST=ready && npx tsx -e 'import {readFileSync} from "node:fs"; import {liveManifestSchema} from "./src/evidence/live-manifest"; liveManifestSchema.parse(JSON.parse(readFileSync("artifacts/implementation/thin-slice-live-manifest.json","utf8")))'` | `NODE_ENV`, `DATABASE_URL`, `APP_URL`, `DEMO_CASE_ENABLED`, `MINDS_LIVE_ENABLED`, `MINDS_BUILDER_API_KEY`, `MINDS_MIND_ID`, `EMAIL_LIVE_ENABLED`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `AUTH_LIVE_ENABLED`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CONTACT_LANE_ENABLED`, `DEMO_BYPASS_AUTH`, `CASE_CODE`, `MANIFEST_RESULT` |

No deployment step runs A and B concurrently. Process B depends on Process A's committed terminal boundary.

### Live demo-obligation execution

1. Assert the idempotent fixed seed locally, then create a fresh deployed draft with `npm run -s case:command -- create`, capture its public code, and run `npm run -s case:command -- authorize "$CASE_CODE" 0`; require `CASE_COMMAND=authorized`.
2. Run `npm run -s case:strategy -- "$CASE_CODE"` in Process A and require `CASE_STRATEGY=ready CODE=STRATEGY_READY`; let Process A exit completely.
3. Run `npm run -s case:command -- submit-return "$CASE_CODE" 3` and require `CASE_COMMAND=returned`; the fixed new message contains no Process-A rules.
4. Start a new shell process and run `npm run -s case:response -- "$CASE_CODE"`; require `CASE_RESPONSE=ready CODE=RESPONSE_READY`, exact A-after/B-before equality, and a fresh response on the same alias and Mind.
5. Run `npm run -s case:command -- consume "$CASE_CODE" 6` and require `CASE_COMMAND=closed`.
6. Run `npm run -s evidence:manifest -- "$CASE_CODE"`; it attempts the version-7 replay, requires `DEMO_TERMINAL`, re-reads the closed row, and atomically writes the schema-valid redacted manifest.

The judge-facing rehearsal shows these exact results from one verified deployed run. It never replaces them with test-transport output.

## 21. Addresses and External References

| Item | Value | Verification |
|---|---|---|
| Minds Builder Hub | `https://build.hellominds.ai/en/docs` | official brief |
| Minds API base | SDK default `https://api.build.hellominds.ai` | installed SDK 0.1.4 |
| Public app URL | `DEPLOY_AND_RECORD_URL_HERE` | deploy phase |
| PostgreSQL | credential-bound, no public address in docs | deployment config |

## 22. Integration Map

| From | To | Protocol | Credential | Health check | Priority |
|---|---|---|---|---|:---:|
| Next.js / jobs | PostgreSQL | TLS SQL | `DATABASE_URL` | exact `select 1` probe plus zero-pending migration check | P0 |
| Process A | Minds Builder API | HTTPS | `MINDS_BUILDER_API_KEY`, `MINDS_MIND_ID` | cognition plus read-only history preflight | P0 |
| Process B | Minds Builder API | HTTPS | `MINDS_BUILDER_API_KEY`, `MINDS_MIND_ID` | stored/live boundary equality | P0 |
| Browser | Next.js | HTTPS | none for synthetic demo | `curl -fsS "$APP_URL/api/health"` | P0 |

## 23. Architecture Quality Gate

| Metric | Actual | Result |
|---|---:|:---:|
| File coverage | 62 authored active tree paths / 62 unique canonical blocks | PASS |
| Verification tags | 62 / 62 canonical blocks | PASS |
| Pseudocode/delegated entry points | 0 | PASS |
| Dangling project imports | 0 | PASS |
| PRD component coverage | 9 / 9 | PASS |
| Internal file-path headers | all source/config blocks | PASS |
| Component build order | 9 components, explicit dependencies and safe parallel groups | PASS |
| Deployment completeness | 7 / 7 rows have executable startup and health checks | PASS |
| Unsafe parallel semantic scripts | 0 | PASS |
| P0 alignment | F-001–F-006 and C1–C9 are all load-bearing P0 | PASS |

### Known verification boundary

The SDK method surface and isolated materialization are verified: all 40 canonical unit tests, all 4 canonical real-PostgreSQL integration tests, contract, security, fault, accessibility, typecheck, lint, and production build pass. Architecture is 10/10. Live semantic continuity remains [UNVERIFIED] until the deployed two-process round trip produces its redacted manifest.


## 24. Historical Audit Disposition

The failed 4/10 pre-repair recount is preserved in the Forge and Conductor state history, not duplicated as executable file blocks here. Sections 26–27 and the deterministic audit are the current repair verdict.


## 26. Canonical Repaired Support Files

These blocks supersede same-path archived blocks in §24 and complete the canonical denominator.

#### File: `playwright.config.ts`
[ASSUMED] — Browser gate targets the deployed or locally configured application without inventing provider outcomes.

```typescript
// File: playwright.config.ts
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
  testDir: "./tests/e2e", fullyParallel: false, forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0, reporter: "line",
  use: { baseURL: process.env.APP_URL ?? "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env.APP_URL ? {} : { webServer: {
    command: "npm run dev", reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:3000/api/health", timeout: 120_000,
  } }),
};
export default defineConfig(config);
```

#### File: `next.config.ts`
[VERIFIED] — Active Next.js runtime configuration loaded by the production build.

```typescript
// File: next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = { poweredByHeader: false, reactStrictMode: true };
export default nextConfig;
```

#### File: `vitest.config.ts`
[VERIFIED] — Active Vitest configuration for canonical and preserved regression tests.

```typescript
// File: vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.{ts,tsx}"], restoreMocks: true },
});
```

#### File: `tsconfig.json`
[VERIFIED] — Strict TypeScript configuration makes `npm run typecheck` compile the application instead of accepting an empty project.

```json
{
  "_file": "tsconfig.json",
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "esnext"], "allowJs": false,
    "skipLibCheck": true, "strict": true, "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true, "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true,
    "isolatedModules": true, "esModuleInterop": true, "jsx": "react-jsx", "incremental": true,
    "plugins": [{ "name": "next" }], "paths": { "@/*": ["./src/*"] }, "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

#### File: `eslint.config.mjs`
[VERIFIED] — ESLint 9 flat configuration with Next.js and TypeScript rules.

```javascript
// File: eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals, ...nextTypeScript,
  globalIgnores([".next/**", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
```

#### File: `postcss.config.mjs`
[VERIFIED] — Tailwind PostCSS plugin used by the production Next.js build.

```javascript
// File: postcss.config.mjs
const postcssConfig = { plugins: { "@tailwindcss/postcss": {} } };
export default postcssConfig;
```

#### File: `README.md`
[ASSUMED] — Complete operating boundary for the thin slice.

```markdown
<!-- File: README.md -->
# One Last Turn

One Last Turn is a synthetic-data proof that one funded Minds Mind can carry a bounded community-care constraint across two separate processes. PostgreSQL—not the Mind—owns authorization, lifecycle, one-turn consumption, and replay rejection.

## Local gates

Use Node 22. Copy `.env.example` to ignored `.env.local`, run `npm install`, `npm run db:migrate`, then `npm run test:all && npm run typecheck && npm run lint && npm run build`.

## Live boundary

Process A and Process B are separate CLI invocations. Each permits exactly one semantic send. Never auto-retry an ambiguous send. Raw provider material stays in ignored owner-readable evidence; tracked manifests contain digests and classifications only. A passing test transport is never described as live proof.
```

#### File: `DOMAIN-GUIDE.md`
[ASSUMED] — Domain terms map directly to code and PRD contracts.

```markdown
<!-- File: DOMAIN-GUIDE.md -->
# Domain Guide

- **Bounded authorization:** deterministic approval of one future community-participation topic; `authorize` in PRD F-001.
- **Stable alias:** one opaque conversation key reused by both processes; C5 history evidence.
- **Authoritative boundary:** canonical digest of the complete newest-first provider history; C5.
- **Omitted-context proof:** Process B excludes Process-A constraints while its fresh reply semantically applies them; F-003.
- **Semantic ambiguity:** a send may have reached the provider despite a client error; it becomes terminal and is never retried automatically.
- **One-turn grant:** only `response_ready → closed` may consume; C1/C3.
- **Receipt:** digest of locked committed artifacts, versions, times, and evidence classes; C9.
- **Cognition:** provider-funded execution balance checked before each semantic send; F-006.
```

#### File: `tests/unit/domain/demo-receipt.test.ts`
[ASSUMED] — Canonical receipt rejects reordered classes and non-sequential versions.

```typescript
// File: tests/unit/domain/demo-receipt.test.ts
import { describe, expect, it } from "vitest";
import { createReceipt, RECEIPT_EVIDENCE_CLASSES, type ReceiptInput } from "../../../src/domain/demo/demo-receipt";

const valid: ReceiptInput = { caseCodeDigest: "a".repeat(64), strategyDigest: "b".repeat(64),
  responseDigest: "c".repeat(64), beforeVersion: 6, afterVersion: 7,
  strategyReadyAt: "2026-08-27T00:00:00.000Z", responseReadyAt: "2026-08-27T00:01:00.000Z",
  consumedAt: "2026-08-27T00:02:00.000Z", evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] };

describe("demo receipt", () => {
  it("is deterministic", () => expect(createReceipt(valid)).toBe(createReceipt(valid)));
  it("rejects a version gap", () => expect(() => createReceipt({ ...valid, afterVersion: 8 })).toThrow());
  it("rejects reordered evidence", () => expect(() => createReceipt({ ...valid,
    evidenceClasses: [...valid.evidenceClasses].reverse() } as unknown as ReceiptInput)).toThrow());
});
```

#### File: `tests/unit/evidence/live-manifest.test.ts`
[ASSUMED] — Cross-process manifest equality is schema-enforced.

```typescript
// File: tests/unit/evidence/live-manifest.test.ts
import { describe, expect, it } from "vitest";
import { createLiveManifest, type LiveManifest } from "../../../src/evidence/live-manifest";
import { buildLiveManifest, observeReplayRejection } from "../../../src/evidence/live-manifest-builder";
import { createReceipt, RECEIPT_EVIDENCE_CLASSES } from "../../../src/domain/demo/demo-receipt";
import { sha256, type ExchangeEvidence } from "../../../src/infrastructure/minds/history";
import type { DemoCaseRecord, DemoLedgerEvent } from "../../../src/infrastructure/db/demo-case-repository";

const digest = "a".repeat(64);
const processA = { processNonce: "00000000-0000-4000-8000-000000000001",
  executionClass: "live_sdk" as const, logicalSendCount: 1 as const,
  wireAttemptCount: "sdk_managed_unknown" as const,
  processInstanceId: "00000000-0000-4000-8000-000000000011", processStartedAt: "2026-08-26T23:59:00.000Z",
  startedAt: "2026-08-27T00:00:00.000Z", completedAt: "2026-08-27T00:01:00.000Z", latencyMs: 60_000,
  aliasDigest: digest, mindDigest: digest, beforeBoundaryDigest: "b".repeat(64),
  afterBoundaryDigest: "c".repeat(64), artifactDigest: "d".repeat(64), sendResolution: "acknowledged" as const };
const valid: LiveManifest = { schemaVersion: 1, classification: "live", deploymentUrl: "https://example.test",
  sdkVersion: "0.1.4", processA, processB: { ...processA,
  processNonce: "00000000-0000-4000-8000-000000000002",
    processInstanceId: "00000000-0000-4000-8000-000000000022",
    processStartedAt: "2026-08-27T00:01:30.000Z",
    startedAt: "2026-08-27T00:02:00.000Z", completedAt: "2026-08-27T00:03:00.000Z",
    beforeBoundaryDigest: processA.afterBoundaryDigest, afterBoundaryDigest: "e".repeat(64) },
  sameAlias: true, sameMind: true, semanticSendCount: 2, stateVersions: [3, 6, 7],
  receiptDigest: "f".repeat(64), replayRejected: true,
  evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] };

function builderFixture(): { record: DemoCaseRecord; events: DemoLedgerEvent[] } {
  const strategyArtifact = { riskSummary: "A sufficiently specific synthetic risk summary.",
    responsePlan: ["Keep access unchanged", "Limit the future topic"], safeScope: "One future community topic only" };
  const responseArtifact = { access: "unchanged" as const, scope: "one_future_community_topic" as const,
    privacy: "withhold_private_context" as const, rationale: "Keep private context withheld." };
  const strategyDigest = sha256(JSON.stringify(strategyArtifact));
  const responseDigest = sha256(JSON.stringify(responseArtifact));
  const boundary = (value: string, capturedAt: string) => ({ schemaVersion: 1 as const, digest: value.repeat(64),
    rowCount: 1, newestFingerprintDigest: value.repeat(64), oldestFingerprintDigest: value.repeat(64), capturedAt });
  const evidence = (processInstanceId: string, processNonce: string, processStartedAt: string,
    startedAt: string, completedAt: string, before: ReturnType<typeof boundary>, after: ReturnType<typeof boundary>): ExchangeEvidence => ({
    schemaVersion: 1, sdkVersion: "0.1.4", executionClass: "live_sdk", logicalSendCount: 1,
    processInstanceId, processStartedAt, aliasDigest: digest, mindDigest: digest, processNonce,
    startedAt, completedAt, latencyMs: Date.parse(completedAt) - Date.parse(startedAt), before, after,
    outbound: { messageIdDigest: digest, contentDigest: digest, createdAt: startedAt },
    reply: { messageIdDigest: digest, contentDigest: digest, createdAt: completedAt }, sendResolution: "acknowledged",
    evidenceClasses: ["same_mind", "same_alias", "exact_boundary", "one_new_outbound", "one_fresh_reply", "semantic_constraints"] });
  const beforeA = boundary("b", "2026-08-27T00:00:00.000Z");
  const afterA = boundary("c", "2026-08-27T00:01:00.000Z");
  const afterB = boundary("e", "2026-08-27T00:03:00.000Z");
  const processA = evidence("00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000001",
    "2026-08-26T23:59:00.000Z", "2026-08-27T00:00:00.000Z", "2026-08-27T00:01:00.000Z", beforeA, afterA);
  const processB = evidence("00000000-0000-4000-8000-000000000022", "00000000-0000-4000-8000-000000000002",
    "2026-08-27T00:01:30.000Z", "2026-08-27T00:02:00.000Z", "2026-08-27T00:03:00.000Z", afterA, afterB);
  const receiptDigest = createReceipt({ caseCodeDigest: sha256("OLT-X"), strategyDigest, responseDigest,
    beforeVersion: 6, afterVersion: 7, strategyReadyAt: processA.completedAt, responseReadyAt: processB.completedAt,
    consumedAt: "2026-08-27T00:04:00.000Z", evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] });
  const record = { publicCode: "OLT-X", state: "closed", stateVersion: 7, strategyArtifact, responseArtifact,
    strategyDigest, responseDigest, strategyProvenance: processA, responseProvenance: processB,
    strategyReadyAt: processA.completedAt, responseReadyAt: processB.completedAt,
    turnConsumedAt: "2026-08-27T00:04:00.000Z", receiptDigest,
    receiptEvidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] } as unknown as DemoCaseRecord;
  const names = ["authorize", "claim_strategy", "record_strategy", "submit_return", "claim_response",
    "record_response", "consume_turn", "replay_rejected"];
  const events = names.map((event, index) => ({ sequence: index + 1, version: Math.min(index + 1, 7), event,
    payload: index === 2 ? { artifactDigest: strategyDigest, boundaryDigest: afterA.digest } : index === 5
      ? { artifactDigest: responseDigest, boundaryDigest: afterB.digest } : index === 7
        ? { code: "DEMO_TERMINAL", attemptedVersion: 7, observedAt: "2026-08-27T00:05:00.000Z" } : {},
    createdAt: `2026-08-27T00:0${index}:00.000Z` }));
  return { record, events };
}

describe("live manifest", () => {
  it("accepts a bound A/B proof", () => expect(createLiveManifest(valid).semanticSendCount).toBe(2));
  it("rejects boundary drift", () => expect(() => createLiveManifest({ ...valid,
    processB: { ...valid.processB, beforeBoundaryDigest: digest } })).toThrow());
  it("rejects a Process-B launch before Process A completed", () => expect(() => createLiveManifest({ ...valid,
    processB: { ...valid.processB, processStartedAt: "2026-08-27T00:00:30.000Z" } })).toThrow());
  it("derives ledger-bound facts from a complete record", () => {
    const fixture = builderFixture();
    expect(buildLiveManifest({ ...fixture, deploymentUrl: "https://example.test" }).stateVersions).toEqual([3, 6, 7]);
  });
  it("rejects a tampered record-strategy ledger digest", () => {
    const fixture = builderFixture();
    fixture.events[2] = { ...fixture.events[2]!, payload: { ...fixture.events[2]!.payload, artifactDigest: digest } };
    expect(() => buildLiveManifest({ ...fixture, deploymentUrl: "https://example.test" }))
      .toThrow("LIVE_MANIFEST_EVENT_PAYLOAD_MISMATCH");
  });
  it("accepts only an observed terminal replay error", async () => {
    await expect(observeReplayRejection("OLT-X", 7, async () => { throw new Error("DEMO_TERMINAL"); }))
      .resolves.toBe(true);
    await expect(observeReplayRejection("OLT-X", 7, async () => undefined))
      .rejects.toThrow("LIVE_REPLAY_WAS_ACCEPTED");
  });
});
```

#### File: `tests/unit/config/env.test.ts`
[ASSUMED] — Demo flags cannot enable an uncredentialed live path.

```typescript
// File: tests/unit/config/env.test.ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../src/config/env";

describe("environment contract", () => {
  it("allows credential-free unit tests", () => expect(loadEnv({ NODE_ENV: "test" }).features.demoCase).toBe(false));
  it("requires Minds live mode for the demo", () => expect(() => loadEnv({ NODE_ENV: "test",
    DEMO_CASE_ENABLED: "true" })).toThrow("DEMO_CASE_ENABLED requires MINDS_LIVE_ENABLED"));
  it("requires live credentials", () => expect(() => loadEnv({ NODE_ENV: "test",
    DEMO_CASE_ENABLED: "true", MINDS_LIVE_ENABLED: "true" })).toThrow("MINDS_BUILDER_API_KEY"));
});
```

#### File: `tests/unit/infrastructure/minds-worker.test.ts`
[ASSUMED] — Pagination, drift, and pre-send failure are executable without semantic provider operations.

```typescript
// File: tests/unit/infrastructure/minds-worker.test.ts
import { describe, expect, it, vi } from "vitest";
import { createBoundary, readCompleteHistory } from "../../../src/infrastructure/minds/history";
import { executeMindWork, type MindTransport } from "../../../src/infrastructure/minds/minds-worker";

const row = (id: string, minute: number, senderType: 0 | 1 | 2 = 1, messageText = id) => ({
  messageId: id, messageText, createdAt: `2026-08-27T00:${String(minute).padStart(2, "0")}:00.000Z`,
  fingerprint: `fp-${id}`, senderType });

describe("Minds worker", () => {
  it("paginates newest-first with an exclusive cursor", async () => {
    const getHistory = vi.fn(async (_alias: string, options: { limit: number; cursor?: string }) =>
      options.cursor ? [row("old", 1)] : [row("new", 2), row("mid", 1)]);
    const rows = await readCompleteHistory({ transport: { getHistory }, alias: "alias", pageSize: 2 });
    expect(rows.map((item) => item.messageId)).toEqual(["new", "mid", "old"]);
    expect(getHistory).toHaveBeenLastCalledWith("alias", { limit: 2, cursor: "fp-mid" });
  });
  it("stops before send when Cognition is empty", async () => {
    const sendMessage = vi.fn();
    const transport = { getCognitionBalance: async () => 0, ensureConversation: vi.fn(),
      getHistory: vi.fn(), sendMessage, waitForReply: vi.fn() } satisfies MindTransport;
    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String }))
      .rejects.toThrow("MINDS_COGNITION_EMPTY");
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it("uses read-only recovery after wait failure without resending", async () => {
    const sendMessage = vi.fn(async () => ({ messageId: "out" }));
    const getHistory = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row("reply", 2, 0, "useful reply"), row("out", 1, 1, "work")]);
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getHistory, sendMessage,
      waitForReply: vi.fn(async () => { throw new Error("timeout"); }) } satisfies MindTransport;
    const times = ["2026-08-27T00:01:00.000Z", "2026-08-27T00:02:00.000Z"];
    const result = await executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String,
      now: () => times.shift()! });
    expect(result.artifact).toBe("useful reply");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it("recovers one uniquely bound exchange after an ambiguous send acknowledgement", async () => {
    const sendMessage = vi.fn(async () => { throw new Error("socket closed"); });
    const getHistory = vi.fn().mockResolvedValueOnce([])
      .mockResolvedValueOnce([row("reply", 2, 0, "recovered reply"), row("out", 1, 1, "work")]);
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getHistory, sendMessage,
      waitForReply: vi.fn(async () => ({ timedOut: false })) } satisfies MindTransport;
    const times = ["2026-08-27T00:01:00.000Z", "2026-08-27T00:02:00.000Z"];
    const result = await executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "work", parse: String,
      recoveryDelayMs: 0, now: () => times.shift()! });
    expect(result.evidence.sendResolution).toBe("history_recovered");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it("detects a changed expected boundary", () => {
    const a = createBoundary([row("one", 1)], "2026-08-27T00:02:00.000Z");
    const b = createBoundary([], "2026-08-27T00:02:00.000Z");
    expect(a.digest).not.toBe(b.digest);
  });
});
```

#### File: `tests/unit/application/demo-case-service.test.ts`
[ASSUMED] — Service test exercises the locked record, event, and replay path through the store port.

```typescript
// File: tests/unit/application/demo-case-service.test.ts
import { describe, expect, it } from "vitest";
import { DemoCaseService } from "../../../src/application/demo-case-service";
import type { DemoCaseRecord, DemoCaseRepository, DemoCaseStore } from "../../../src/infrastructure/db/demo-case-repository";

function record(): DemoCaseRecord { return { id: "id", publicCode: "OLT-TEST", state: "draft", stateVersion: 0,
  authorizedTopic: null, authorizedAt: null, stableAlias: null, mindDigest: null,
  strategyArtifact: null, strategyDigest: null, strategyBoundary: null, strategyProvenance: null,
  strategyProcessNonce: null, strategyReadyAt: null, returnMessage: null, responseArtifact: null,
  responseDigest: null, responseBoundary: null, responseProvenance: null, responseProcessNonce: null,
  responseReadyAt: null, receiptDigest: null, receiptEvidenceClasses: null, turnConsumedAt: null,
  failureStage: null, failureCode: null }; }

function memoryStore(initial = record()): { store: DemoCaseStore; read(): DemoCaseRecord } {
  let current = initial;
  const repository: DemoCaseRepository = { createDraft: async () => current, findByCode: async () => current,
    findResponseJobInput: async () => null, lockByCode: async () => current,
    save: async (next, expected) => { if (current.stateVersion !== expected) return false; current = next; return true; },
    appendEvent: async () => undefined, listEventsByCode: async () => [], appendAuditEvent: async () => undefined };
  return { store: { findByCode: repository.findByCode, findResponseJobInput: repository.findResponseJobInput,
    listEventsByCode: repository.listEventsByCode, appendAuditEvent: repository.appendAuditEvent,
    transaction: (work) => work(repository) }, read: () => current };
}

describe("demo case service", () => {
  it("persists authorization with an incremented version", async () => {
    const memory = memoryStore(); const service = new DemoCaseService(memory.store, () => "2026-08-27T00:00:00.000Z");
    await service.authorize("OLT-TEST", 0);
    expect(memory.read()).toMatchObject({ state: "authorized", stateVersion: 1,
      authorizedTopic: "community_participation" });
  });
  it("rejects a stale writer", async () => {
    const memory = memoryStore(); const service = new DemoCaseService(memory.store);
    await service.authorize("OLT-TEST", 0);
    await expect(service.authorize("OLT-TEST", 0)).rejects.toThrow("DEMO_STALE_WRITE");
  });
});
```

#### File: `tests/unit/application/mind-jobs.test.ts`
[ASSUMED] — Jobs reject invalid predecessor/input before contacting the transport.

```typescript
// File: tests/unit/application/mind-jobs.test.ts
import { describe, expect, it, vi } from "vitest";
import { runResponseJob } from "../../../src/application/minds/run-response-job";
import { runStrategyJob } from "../../../src/application/minds/run-strategy-job";
import { sha256 } from "../../../src/infrastructure/minds/history";

const transport = { getCognitionBalance: vi.fn(), ensureConversation: vi.fn(), getHistory: vi.fn(),
  sendMessage: vi.fn(), waitForReply: vi.fn() };

describe("separate Mind jobs", () => {
  it("does not send before strategy authorization", async () => {
    const cases = { findByCode: async () => null } as never;
    expect(await runStrategyJob({ code: "OLT-X", mindId: "mind", cases, transport })).toEqual({ state: "failed", code: "STRATEGY_NOT_AUTHORIZED" });
    expect(transport.sendMessage).not.toHaveBeenCalled();
  });
  it("does not send without minimized response input", async () => {
    const cases = { findResponseJobInput: async () => null } as never;
    expect(await runResponseJob({ code: "OLT-X", mindId: "mind", cases, transport })).toEqual({ state: "failed", code: "RESPONSE_INPUT_NOT_READY" });
    expect(transport.sendMessage).not.toHaveBeenCalled();
  });
  it("rejects Process-B boundary drift before send", async () => {
    const expected = { schemaVersion: 1 as const, digest: "a".repeat(64), rowCount: 1,
      newestFingerprintDigest: "b".repeat(64), oldestFingerprintDigest: "b".repeat(64),
      capturedAt: "2026-08-27T00:00:00.000Z" };
    const cases = { findResponseJobInput: async () => ({ state: "returned", stateVersion: 4,
      stableAlias: "alias", mindDigest: sha256("mind"), strategyBoundary: expected,
      strategyProcessInstanceId: "00000000-0000-4000-8000-000000000099", returnMessage: "hello" }),
      claimResponse: async () => ({ stateVersion: 5 }), fail: async () => ({ stateVersion: 6 }) } as never;
    const isolated = { getCognitionBalance: vi.fn(async () => 1),
      ensureConversation: vi.fn(async () => ({ mindId: "mind" })), getHistory: vi.fn(async () => []),
      sendMessage: vi.fn(), waitForReply: vi.fn() };
    await expect(runResponseJob({ code: "OLT-X", mindId: "mind", cases, transport: isolated }))
      .resolves.toEqual({ state: "failed", code: "MINDS_HISTORY_BOUNDARY_MISMATCH" });
    expect(isolated.sendMessage).not.toHaveBeenCalled();
  });
});
```

#### File: `tests/unit/application/demo-controller.test.ts`
[ASSUMED] — The view exposes classifications and digests, never raw provenance.

```typescript
// File: tests/unit/application/demo-controller.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { DemoController } from "../../../src/application/demo-controller";

describe("demo controller", () => {
  it("keeps provider work out of web actions and exposes deterministic CLI commands", async () => {
    const [actions, command, health] = await Promise.all([
      readFile(new URL("../../../src/app/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../scripts/run-case-command.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../src/app/api/health/route.ts", import.meta.url), "utf8"),
    ]);
    expect(actions).not.toMatch(/createMindRuntime|sendMessage|runStrategyJob|runResponseJob/);
    expect(command).toContain('action === "create"');
    expect(health).toContain('status: ready ? "ready" : "not_ready"');
  });
  it("creates a fresh synthetic draft view", async () => {
    const record = { publicCode: "OLT-FRESH", state: "draft", stateVersion: 0,
      strategyArtifact: null, strategyDigest: null, strategyReadyAt: null, strategyProvenance: null,
      returnMessage: null, responseArtifact: null, responseDigest: null, responseReadyAt: null,
      responseProvenance: null, receiptDigest: null, turnConsumedAt: null,
      receiptEvidenceClasses: null, failureStage: null, failureCode: null };
    const controller = new DemoController({ createCase: vi.fn(async () => record) } as never);
    await expect(controller.create()).resolves.toMatchObject({ code: "OLT-FRESH", state: "draft" });
  });
  it("loads a redacted draft view", async () => {
    const record = { publicCode: "OLT-TEST", state: "draft", stateVersion: 0,
      strategyArtifact: null, strategyDigest: null, strategyReadyAt: null, strategyProvenance: null,
      returnMessage: null, responseArtifact: null, responseDigest: null, responseReadyAt: null,
      responseProvenance: null, receiptDigest: null, turnConsumedAt: null,
      receiptEvidenceClasses: null, failureStage: null, failureCode: null };
    const controller = new DemoController({ findByCode: vi.fn(async () => record) } as never);
    const view = await controller.load("OLT-TEST");
    expect(view).toEqual({ code: "OLT-TEST", state: "draft", expectedVersion: 0, synthetic: true,
      evidence: ["Process A pending", "Process B pending"] });
    expect(JSON.stringify(view)).not.toMatch(/messageText|fingerprint|processNonce/);
  });
  it("never exposes model-authored strategy text", async () => {
    const record = { publicCode: "OLT-TEST", state: "strategy_ready", stateVersion: 3,
      strategyArtifact: { riskSummary: "MODEL_PRIVATE_DETAIL_SHOULD_NOT_RENDER" },
      strategyDigest: "a".repeat(64), strategyReadyAt: "2026-08-27T00:00:00.000Z",
      strategyProvenance: {}, returnMessage: null, responseArtifact: null, responseDigest: null,
      responseReadyAt: null, responseProvenance: null, receiptDigest: null, turnConsumedAt: null,
      receiptEvidenceClasses: null, failureStage: null, failureCode: null };
    const controller = new DemoController({ findByCode: vi.fn(async () => record) } as never);
    const view = await controller.load("OLT-TEST");
    expect(view.strategy?.summary).toBe("Private response strategy persisted");
    expect(JSON.stringify(view)).not.toContain("MODEL_PRIVATE_DETAIL_SHOULD_NOT_RENDER");
  });
  it("renders a fixed public response and keeps private rationale out", async () => {
    const record = { publicCode: "OLT-TEST", state: "response_ready", stateVersion: 6,
      strategyArtifact: null, strategyDigest: null, strategyReadyAt: null, strategyProvenance: {},
      returnMessage: "hello", responseArtifact: { access: "unchanged", scope: "one_future_community_topic",
        privacy: "withhold_private_context", rationale: "PRIVATE_SENTINEL" }, responseDigest: "b".repeat(64),
      responseReadyAt: "2026-08-27T00:00:00.000Z", responseProvenance: {}, receiptDigest: null,
      turnConsumedAt: null, receiptEvidenceClasses: null, failureStage: null, failureCode: null };
    const controller = new DemoController({ findByCode: vi.fn(async () => record) } as never);
    const view = await controller.load("OLT-TEST");
    expect(view.response?.text).toContain("Your access is unchanged");
    expect(JSON.stringify(view)).not.toContain("PRIVATE_SENTINEL");
  });
});
```

#### File: `tests/unit/ui/case-timeline.test.tsx`
[ASSUMED] — Timeline exposes current/completed semantics.

```tsx
// File: tests/unit/ui/case-timeline.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseTimeline } from "../../../src/app/components/case-timeline";

describe("case timeline", () => {
  it("marks the current step", () => {
    render(<CaseTimeline view={{ code: "OLT-X", state: "strategy_ready", expectedVersion: 3,
      synthetic: true, evidence: [] }} />);
    expect(screen.getByLabelText("Case timeline").querySelector('[aria-current="step"]')?.textContent)
      .toContain("Strategy prepared");
  });
});
```

#### File: `tests/integration/db/demo-case-repository.test.ts`
[ASSUMED] — A real configured PostgreSQL instance is mandatory; absence is a hard test failure.

```typescript
// File: tests/integration/db/demo-case-repository.test.ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "../../../src/infrastructure/db/client";
import { applyMigrations, discoverMigrations } from "../../../src/infrastructure/db/migrations";
import { createDemoCaseRepository } from "../../../src/infrastructure/db/demo-case-repository";

let database: DatabaseClient;
beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED_FOR_INTEGRATION_TEST");
  database = createDatabaseClient({ connectionString: process.env.DATABASE_URL, max: 2 });
  await applyMigrations(database, `${process.cwd()}/db/migrations`);
});
afterAll(async () => database?.close());

describe("demo repository", () => {
  it("round-trips a draft and rejects a stale save", async () => {
    const code = `OLT-IT-${crypto.randomUUID()}`;
    const repository = createDemoCaseRepository(database.sql);
    const draft = await repository.createDraft(code);
    expect(await repository.findByCode(code)).toEqual(draft);
    expect(await repository.save({ ...draft, state: "authorized", stateVersion: 1 }, 9)).toBe(false);
  });
  it("reuses the legacy checksum ledger and rejects edited applied SQL", async () => {
    expect(await applyMigrations(database, `${process.cwd()}/db/migrations`)).toEqual([]);
    const directory = await mkdtemp(path.join(tmpdir(), "olt-migration-check-"));
    try {
      const name = "0009_demo_slice.sql";
      const original = await readFile(path.join(process.cwd(), "db/migrations", name), "utf8");
      await writeFile(path.join(directory, name), `${original}\n-- edited after apply\n`);
      await expect(applyMigrations(database, directory)).rejects.toThrow(`MIGRATION_CHECKSUM_MISMATCH:${name}`);
    } finally { await rm(directory, { recursive: true }); }
  });
  it("upgrades an existing 0001-0008 ledger without replay", async () => {
    const schema = `legacy_${crypto.randomUUID().replaceAll("-", "")}`;
    await database.sql.unsafe(`create schema "${schema}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("options", `-csearch_path=${schema},public`);
    const legacy = createDatabaseClient({ connectionString: url.toString(), max: 1 });
    try {
      await legacy.sql`create table _olt_migrations (name text primary key, digest text not null,
        applied_at timestamptz not null default now())`;
      const migrations = await discoverMigrations(`${process.cwd()}/db/migrations`);
      expect(migrations.at(-1)?.name).toBe("0009_demo_slice.sql");
      for (const migration of migrations.slice(0, -1)) {
        await legacy.sql`insert into _olt_migrations (name, digest) values (${migration.name}, ${migration.checksum})`;
      }
      await legacy.sql`create table tenants (id integer primary key)`;
      await expect(applyMigrations(legacy, `${process.cwd()}/db/migrations`))
        .resolves.toEqual(["0009_demo_slice.sql"]);
      await expect(applyMigrations(legacy, `${process.cwd()}/db/migrations`)).resolves.toEqual([]);
    } finally {
      await legacy.close();
      await database.sql.unsafe(`drop schema "${schema}" cascade`);
    }
  });
});
```

#### File: `tests/contract/minds-sdk.test.ts`
[VERIFIED] — Pinned SDK surface used by the adapter is checked without a provider call.

```typescript
// File: tests/contract/minds-sdk.test.ts
import { describe, expect, it } from "vitest";
import { createMindsClient } from "@animocabrands/minds-client-lib";

describe("Minds SDK 0.1.4 contract", () => {
  it("exposes every adapter method", () => {
    const client = createMindsClient({ builderApiKey: "contract-only-not-sent" });
    for (const name of ["ensureConversation", "getCognitionBalance", "getHistory", "sendMessage", "waitForReply"]) {
      expect(typeof client[name as keyof typeof client]).toBe("function");
    }
  });
});
```

#### File: `tests/security/redaction.test.ts`
[ASSUMED] — Tracked view and manifest schemas cannot represent raw provider fields.

```typescript
// File: tests/security/redaction.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { liveManifestSchema } from "../../src/evidence/live-manifest";

describe("redaction boundary", () => {
  it("rejects raw prompts and messages", () => {
    const keys = Object.keys(liveManifestSchema.shape);
    expect(keys).not.toContain("prompt"); expect(keys).not.toContain("messageText");
    expect(keys).not.toContain("alias"); expect(keys).not.toContain("mindId");
  });
  it("keeps provider execution out of web actions", () => {
    const actions = readFileSync(`${process.cwd()}/src/app/actions.ts`, "utf8");
    expect(actions).not.toMatch(/createMindRuntime|runStrategyJob|runResponseJob|sendMessage/);
  });
});
```

#### File: `tests/fault-injection/minds-failure.test.ts`
[ASSUMED] — An ambiguous send is terminal and never semantically retried.

```typescript
// File: tests/fault-injection/minds-failure.test.ts
import { describe, expect, it, vi } from "vitest";
import { executeMindWork } from "../../src/infrastructure/minds/minds-worker";

describe("Mind send fault", () => {
  it("attempts one send when the client throws ambiguously", async () => {
    const sendMessage = vi.fn(async () => { throw new Error("network"); });
    const transport = { getCognitionBalance: async () => 1,
      ensureConversation: async () => ({ mindId: "mind" }), getHistory: async () => [],
      sendMessage, waitForReply: vi.fn() };
    await expect(executeMindWork({ transport, alias: "alias", mindId: "mind",
      processNonce: "00000000-0000-4000-8000-000000000001", prompt: "one assignment",
      parse: String, recoveryDelayMs: 0 }))
      .rejects.toThrow("MINDS_SEND_AMBIGUOUS");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
```

#### File: `tests/accessibility/thin-slice.test.tsx`
[ASSUMED] — Critical status surfaces use accessible native semantics.

```tsx
// File: tests/accessibility/thin-slice.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionPanel } from "../../src/app/components/action-panel";

describe("thin-slice accessibility", () => {
  it("announces running work and prevents retry", () => {
    render(<ActionPanel view={{ code: "OLT-X", state: "response_running", expectedVersion: 5,
      synthetic: true, evidence: [] }} />);
    expect(screen.getByRole("status").textContent).toContain("Do not retry");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

## 27. Repaired Architecture Gate

The canonical result is determined by the root-repository Forge audit (`node scripts/forge-artifact-audit.mjs ARCHITECTURE.md PLAN.md`), isolated application materialization, and the commands in §18. The Forge audit is intentionally workspace tooling, not an application dependency. Live semantic continuity remains **UNVERIFIED** until Process A and Process B succeed on the deployed product and the database-derived redacted manifest passes its schema.


## 28. Post-build Task 12A: Durable Mind send-attempt journal

The Process-A autopsy proved the failed run stopped before `sendMessage`, but it also exposed an observability gap: the aggregate alone could not classify a future crash at the send boundary. The repaired runtime creates one `demo_mind_send_attempts` row atomically with each strategy/response claim.

```text
prepared
├── pre_send_failed
└── send_outcome_unknown
    ├── send_acknowledged
    │   └── exchange_recorded
    └── exchange_recorded (exact read-only history recovery only)
```

`prepared` and `pre_send_failed` prove zero sends. `send_outcome_unknown` is permanently conservative `0-or-1` and never grants retry authority. `send_acknowledged` proves one provider-accepted outbound but not a complete exchange. `exchange_recorded` proves an exact outbound/fresh-reply pair before semantic parsing.

Migrations `0010_mind_send_attempts.sql` and `0011_mind_send_attempt_constraints.sql` enforce one attempt per case/phase, fixed SDK version, live-SDK execution, response-boundary equality, provider acknowledgement/outbound identity, digest-only storage, minimized safe codes, and monotonic gate/ack/exchange timestamps. The application additionally binds alias, Mind, prompt, nonce, process instance, SDK, expected boundary, resolution, and provider message digest inside the attempt transaction.

A live SDK transport cannot execute without a journal. The send gate must commit before the sole `sendMessage` call. Any crash after that commit is ambiguous and cannot be retried; only bounded read-only history reconciliation may advance it. Raw aliases, Mind IDs, prompts, replies, and provider identifiers are never stored in the journal.
