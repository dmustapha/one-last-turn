import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseClient } from "../../../src/infrastructure/db/client";
import { DemoCaseService } from "../../../src/application/demo-case-service";
import { createDemoCaseRepository, createPostgresDemoCaseStore } from "../../../src/infrastructure/db/demo-case-repository";
import { applyMigrations } from "../../../src/infrastructure/db/migrations";
import { sha256, type ExchangeEvidence, type HistoryBoundary } from "../../../src/infrastructure/minds/history";
import {
  startPostgreSql17,
  stopPostgreSql17,
  type PostgreSqlTestContext,
} from "../helpers/postgres-container";

const execute = promisify(execFile);
const quarantineSchema = "olt_fixture_quarantine_20260828";
let context: PostgreSqlTestContext | undefined;
let database: DatabaseClient;

beforeAll(async () => {
  context = await startPostgreSql17();
  database = { sql: context.sql, close: async () => undefined };
  await applyMigrations(database, `${process.cwd()}/db/migrations`);
  await seedProductionShape(database);
}, 60_000);

afterAll(async () => stopPostgreSql17(context), 60_000);

describe("production fixture quarantine", () => {
  it("archives exactly 71 source-proven fixtures and preserves the seed plus terminal cases", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "olt-fixture-quarantine-"));
    const manifest = path.join(directory, "manifest.json");
    try {
      const before = await preservedSnapshot(database);
      const fullBefore = await databaseSnapshot(database);
      const checked = await runCleanup(requireContext(), "--check", manifest);
      expect(checked.stderr).toBe("");
      expect(checked.stdout).toContain("FIXTURE_QUARANTINE=verified CASES=71 EVENTS=50 ATTEMPTS=20");
      const token = checked.stdout.match(/CONFIRM=([0-9a-f]{64})/)?.[1];
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      await expect(access(`${manifest}.prepared`)).resolves.toBeUndefined();
      await expect(access(manifest)).rejects.toThrow();
      expect((await stat(`${manifest}.prepared`)).mode & 0o077).toBe(0);

      const wrongToken = await runCleanup(requireContext(), "--execute", manifest, "0".repeat(64));
      expect(wrongToken.stderr).toContain("CODE=PREPARED_CONFIRMATION_MISMATCH");
      expect(await databaseSnapshot(database)).toBe(fullBefore);

      const rolledBack = await runCleanup(requireContext(), "--execute", manifest, token, true);
      expect(rolledBack.stderr).toContain("CODE=FIXTURE_TEST_FAULT");
      expect(await databaseSnapshot(database)).toBe(fullBefore);
      expect(await schemaExists(database)).toBe(false);
      await expect(access(manifest)).rejects.toThrow();

      const [substitute] = await database.sql`insert into demo_cases (public_code, state, state_version,
        authorized_topic, authorized_at) values ('OLT-LEGITIMATE-CASE', 'authorized', 1,
        'community_participation', now()) returning id`;
      await database.sql`insert into demo_case_events (case_id, aggregate_version, event_type)
        values (${substitute!.id}, 1, 'authorize')`;
      const substituted = await databaseSnapshot(database);
      const rejected = await runCleanup(requireContext(), "--execute", manifest, token);
      expect(rejected.stderr).toContain("CODE=PREPARED_SNAPSHOT_MISMATCH");
      expect(await databaseSnapshot(database)).toBe(substituted);
      expect(await schemaExists(database)).toBe(false);
      await expect(access(manifest)).rejects.toThrow();
      await database.sql`delete from demo_case_events where case_id = ${substitute!.id}`;
      await database.sql`delete from demo_cases where id = ${substitute!.id}`;

      const publicationFault = await runCleanup(requireContext(), "--execute", manifest, token, false, true);
      expect(publicationFault.stderr).toContain("CODE=FIXTURE_TEST_FINALIZE_FAULT");
      expect(await schemaExists(database)).toBe(true);
      await expect(access(manifest)).rejects.toThrow();
      await expect(access(`${manifest}.prepared`)).resolves.toBeUndefined();

      const result = await runCleanup(requireContext(), "--execute", manifest, token);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("FIXTURE_QUARANTINE=complete CASES=71");
      const [active] = await database.sql`select
        (select count(*)::int from demo_cases) cases,
        (select count(*)::int from demo_mind_send_attempts where state = 'prepared') prepared,
        (select count(*)::int from ${database.sql(quarantineSchema)}.demo_cases) archived`;
      expect(active).toMatchObject({ cases: 3, prepared: 0, archived: 71 });
      expect(await preservedSnapshot(database)).toBe(before);
      await expect(access(`${manifest}.prepared`)).rejects.toThrow();
      expect(JSON.parse(await readFile(manifest, "utf8"))).toMatchObject({ status: "committed" });
      expect((await stat(manifest)).mode & 0o077).toBe(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 60_000);
});

async function runCleanup(current: PostgreSqlTestContext, mode: "--check" | "--execute",
  manifest: string, token?: string, fault = false, finalizeFault = false) {
  try {
    const args = ["--import", "tsx", "scripts/quarantine-integration-fixtures.ts", mode];
    if (token) args.push(token);
    return await execute(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionString(current),
        FIXTURE_MANIFEST_PATH: manifest, FIXTURE_DEBUG_LOCAL: "1", FIXTURE_TEST_FAULT: fault ? "1" : "0",
        FIXTURE_TEST_FINALIZE_FAULT: finalizeFault ? "1" : "0",
        NODE_ENV: "test" },
      timeout: 30_000,
    });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { stdout: failure.stdout ?? "", stderr: failure.stderr ?? "command failed" };
  }
}

function connectionString(current: PostgreSqlTestContext): string {
  const host = current.container.getHost();
  const port = current.container.getMappedPort(5432);
  return `postgresql://one_last_turn:test_password@${host}:${port}/one_last_turn_test`;
}

function requireContext(): PostgreSqlTestContext {
  if (!context) throw new Error("TEST_DATABASE_MISSING");
  return context;
}

async function preservedSnapshot(db: DatabaseClient): Promise<string> {
  const cases = await db.sql`select * from demo_cases where public_code = 'OLT-DEMO-0001' or failure_code is not null order by id`;
  const ids = cases.map((row) => row.id as string);
  const events = await db.sql`select * from demo_case_events where case_id = any(${ids}) order by sequence`;
  const attempts = await db.sql`select * from demo_mind_send_attempts where case_id = any(${ids}) order by id`;
  return sha256(JSON.stringify({ cases, events, attempts }));
}

async function databaseSnapshot(db: DatabaseClient): Promise<string> {
  const cases = await db.sql`select * from demo_cases order by id`;
  const events = await db.sql`select * from demo_case_events order by id`;
  const attempts = await db.sql`select * from demo_mind_send_attempts order by id`;
  return sha256(JSON.stringify({ cases, events, attempts }));
}

async function schemaExists(db: DatabaseClient): Promise<boolean> {
  const [row] = await db.sql`select to_regnamespace(${quarantineSchema}) is not null present`;
  return row?.present === true;
}

async function seedProductionShape(db: DatabaseClient): Promise<void> {
  await seedPreserved(db);
  for (let index = 0; index < 23; index += 1) await insertDraft(db, `OLT-IT-${fixtureUuid(index)}`);
  for (let index = 0; index < 9; index += 1) await insertAttemptFixture(db, index);
  for (let index = 0; index < 17; index += 1) await insertRaceFixture(db, index);
  for (let index = 0; index < 11; index += 1) await insertRollbackPair(db, index);
}

async function seedPreserved(db: DatabaseClient): Promise<void> {
  await insertDraft(db, "OLT-DEMO-0001");
  await db.sql`insert into demo_cases (public_code, state, state_version, failure_stage, failure_code)
    values ('OLT-TERMINAL-A', 'failed', 1, 'strategy', 'MINDS_AUTH_FAILED')`;
  const [terminal] = await db.sql`insert into demo_cases (public_code, state, state_version,
    authorized_topic, authorized_at, stable_alias, mind_digest, strategy_process_nonce,
    failure_stage, failure_code) values ('OLT-TERMINAL-B', 'failed', 3,
    'community_participation', now(), 'terminal-alias', ${"b".repeat(64)}, gen_random_uuid(),
    'strategy', 'MINDS_ALIAS_MIND_MISMATCH') returning id`;
  await db.sql`insert into demo_mind_send_attempts (id, case_id, phase, case_version, state,
    alias_digest, mind_digest, prompt_digest, process_nonce_digest, process_instance_digest,
    sdk_version, expected_boundary_digest, safe_code) values (gen_random_uuid(), ${terminal!.id},
    'strategy', 2, 'pre_send_failed', ${"a".repeat(64)}, ${"b".repeat(64)}, ${"c".repeat(64)},
    ${"d".repeat(64)}, ${"e".repeat(64)}, '0.1.4', null, 'MINDS_ALIAS_MIND_MISMATCH')`;
}

async function insertDraft(db: DatabaseClient, code: string): Promise<void> {
  await db.sql`insert into demo_cases (public_code, state, state_version) values (${code}, 'draft', 0)`;
}

async function insertAttemptFixture(db: DatabaseClient, index: number): Promise<void> {
  const [row] = await db.sql`insert into demo_cases (public_code, state, state_version,
    authorized_topic, authorized_at, stable_alias, mind_digest, strategy_process_nonce)
    values (${`OLT-ATTEMPT-${fixtureUuid(100 + index)}`}, 'strategy_running', 2, 'community_participation',
    '2026-08-27T00:00:00.000Z', 'opaque-alias', ${"b".repeat(64)},
    '00000000-0000-4000-8000-000000000001') returning id`;
  await db.sql`insert into demo_mind_send_attempts (id, case_id, phase, case_version, state,
    alias_digest, mind_digest, prompt_digest, process_nonce_digest, process_instance_digest,
    sdk_version, expected_boundary_digest, before_boundary_digest, send_gate_opened_at,
    provider_message_id_digest, send_acknowledged_at, send_resolution, after_boundary_digest,
    outbound_message_id_digest, outbound_content_digest, reply_message_id_digest,
    reply_content_digest, exchange_evidence_digest, exchange_recorded_at, execution_class)
    values (gen_random_uuid(), ${row!.id}, 'strategy', 2, 'exchange_recorded', ${"a".repeat(64)},
    ${"b".repeat(64)}, ${"c".repeat(64)}, ${"d".repeat(64)}, ${"e".repeat(64)}, '0.1.4', null,
    ${"f".repeat(64)}, '2026-08-27T00:00:00.000Z', ${"1".repeat(64)},
    '2026-08-27T00:00:00.000Z', 'acknowledged', ${"2".repeat(64)},
    ${"1".repeat(64)}, ${"c".repeat(64)}, ${"4".repeat(64)}, ${"5".repeat(64)},
    ${"6".repeat(64)}, '2026-08-27T00:00:00.000Z', 'live_sdk')`;
}

async function insertRaceFixture(db: DatabaseClient, index: number): Promise<void> {
  const repository = createDemoCaseRepository(db.sql);
  const draft = await repository.createDraft(`OLT-RACE-${fixtureUuid(200 + index)}`);
  const strategyEvidence = exchangeEvidence("00000000-0000-4000-8000-000000000001");
  const responseEvidence = exchangeEvidence("00000000-0000-4000-8000-000000000002",
    strategyEvidence.after, historyBoundary("5"));
  const ready = { ...draft, state: "response_ready" as const, stateVersion: 6,
    authorizedTopic: "community_participation", authorizedAt: fixtureTime(),
    stableAlias: "opaque-alias", mindDigest: "f".repeat(64),
    strategyArtifact: { riskSummary: "A private incident may pull discussion backward.",
      responsePlan: ["Keep access separate", "Offer one future topic"],
      safeScope: "Keep private choices confidential." },
    strategyDigest: "a".repeat(64), strategyBoundary: strategyEvidence.after,
    strategyProvenance: strategyEvidence, strategyProcessNonce: strategyEvidence.processNonce,
    strategyReadyAt: fixtureTime(), returnMessage: "Can we discuss the past incident safely?",
    responseArtifact: { access: "unchanged" as const, scope: "one_future_community_topic" as const,
      privacy: "withhold_private_context" as const, rationale: "The remembered boundary controls scope." },
    responseDigest: "b".repeat(64), responseBoundary: responseEvidence.after,
    responseProvenance: responseEvidence, responseProcessNonce: responseEvidence.processNonce,
    responseReadyAt: "2026-08-27T00:01:00.000Z" };
  if (!await repository.save(ready, 0)) throw new Error("RACE_FIXTURE_SAVE_FAILED");
  const service = new DemoCaseService(createPostgresDemoCaseStore(db), () => "2026-08-27T00:02:00.000Z");
  await service.consumeTurn(draft.publicCode, 6);
}

async function insertRollbackPair(db: DatabaseClient, index: number): Promise<void> {
  const nonce = fixtureUuid(300 + index);
  const [first] = await db.sql`insert into demo_cases (public_code, state, state_version,
    authorized_topic, authorized_at, stable_alias, mind_digest, strategy_process_nonce)
    values (${`OLT-${index.toString(16).padStart(12, "0").toUpperCase()}`}, 'strategy_running', 2,
    'community_participation', now(), 'first-alias', ${"3".repeat(64)}, ${nonce}) returning id`;
  await db.sql`insert into demo_case_events (case_id, aggregate_version, event_type)
    values (${first!.id}, 1, 'authorize'), (${first!.id}, 2, 'claim_strategy')`;
  await db.sql`insert into demo_mind_send_attempts (id, case_id, phase, case_version, state,
    alias_digest, mind_digest, prompt_digest, process_nonce_digest, process_instance_digest,
    sdk_version, expected_boundary_digest) values (gen_random_uuid(), ${first!.id}, 'strategy', 2,
    'prepared', ${sha256("first-alias")}, ${"3".repeat(64)}, ${"1".repeat(64)},
    ${sha256(nonce)}, ${"2".repeat(64)}, '0.1.4', null)`;
  const [second] = await db.sql`insert into demo_cases (public_code, state, state_version,
    authorized_topic, authorized_at) values (${`OLT-${(index + 100).toString(16).padStart(12, "0").toUpperCase()}`},
    'authorized', 1, 'community_participation', now()) returning id`;
  await db.sql`insert into demo_case_events (case_id, aggregate_version, event_type)
    values (${second!.id}, 1, 'authorize')`;
}

function fixtureUuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function fixtureTime(): string { return "2026-08-27T00:00:00.000Z"; }

function historyBoundary(seed: string): HistoryBoundary {
  return { schemaVersion: 1, digest: seed.repeat(64), rowCount: 0,
    newestFingerprintDigest: null, oldestFingerprintDigest: null, capturedAt: fixtureTime() };
}

function exchangeEvidence(nonce: string, before = historyBoundary("c"),
  after = historyBoundary("d")): ExchangeEvidence {
  return { schemaVersion: 1, sdkVersion: "0.1.4", executionClass: "test_transport",
    logicalSendCount: 1, processInstanceId: fixtureUuid(Number(nonce.slice(-12))),
    processStartedAt: fixtureTime(), aliasDigest: "e".repeat(64), mindDigest: "f".repeat(64),
    processNonce: nonce, startedAt: fixtureTime(), completedAt: "2026-08-27T00:00:01.000Z",
    latencyMs: 1000, before, after,
    outbound: { messageIdDigest: "1".repeat(64), contentDigest: "2".repeat(64), createdAt: fixtureTime() },
    reply: { messageIdDigest: "3".repeat(64), contentDigest: "4".repeat(64),
      createdAt: "2026-08-27T00:00:01.000Z" }, sendResolution: "acknowledged",
    evidenceClasses: ["same_mind", "same_alias", "exact_boundary", "one_new_outbound",
      "one_fresh_reply", "semantic_constraints"] };
}
