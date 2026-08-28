// File: tests/integration/db/demo-case-repository.test.ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DemoCaseService } from "../../../src/application/demo-case-service";
import { createDatabaseClient, type DatabaseClient } from "../../../src/infrastructure/db/client";
import { applyMigrations, discoverMigrations } from "../../../src/infrastructure/db/migrations";
import { createDemoCaseRepository, createPostgresDemoCaseStore } from "../../../src/infrastructure/db/demo-case-repository";
import { startPostgreSql17, stopPostgreSql17, type PostgreSqlTestContext } from "../helpers/postgres-container";

let database: DatabaseClient;
let postgresContext: PostgreSqlTestContext | undefined;
beforeAll(async () => {
  postgresContext = await startPostgreSql17();
  database = { sql: postgresContext.sql, close: async () => undefined };
  await applyMigrations(database, `${process.cwd()}/db/migrations`);
}, 60_000);
afterAll(async () => stopPostgreSql17(postgresContext), 60_000);

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
  it("persists one crash-safe send attempt per case phase", async () => {
    const repository = createDemoCaseRepository(database.sql);
    const service = new DemoCaseService(createPostgresDemoCaseStore(database));
    const draft = await repository.createDraft(`OLT-ATTEMPT-${crypto.randomUUID()}`);
    expect(await repository.save({ ...draft, state: "strategy_running", stateVersion: 2,
      authorizedTopic: "community_participation", authorizedAt: at(), stableAlias: "opaque-alias",
      mindDigest: "b".repeat(64), strategyProcessNonce: "00000000-0000-4000-8000-000000000001" }, 0)).toBe(true);
    const attempt = { id: crypto.randomUUID(), caseId: draft.id, phase: "strategy" as const,
      caseVersion: 2, aliasDigest: "a".repeat(64), mindDigest: "b".repeat(64),
      promptDigest: "c".repeat(64), processNonceDigest: "d".repeat(64),
      processInstanceDigest: "e".repeat(64), sdkVersion: "0.1.4",
      expectedBoundaryDigest: null };

    await repository.insertPreparedAttempt(attempt);
    expect((await repository.findAttemptById(attempt.id))?.state).toBe("prepared");
    expect((await repository.findAttemptByCode(draft.publicCode, "strategy"))?.id).toBe(attempt.id);
    await expect(service.openAttemptSendGate(attempt.id, "f".repeat(64), at())).resolves.toBeUndefined();
    expect(await repository.openAttemptSendGate(attempt.id, "f".repeat(64), at())).toBe(false);
    await service.settleAttemptFailure(attempt.id, "MINDS_ACK_PERSISTENCE_FAILED");
    expect(await repository.findAttemptById(attempt.id)).toMatchObject({
      state: "send_outcome_unknown", safeCode: "MINDS_ACK_PERSISTENCE_FAILED",
    });
    expect(await repository.acknowledgeAttemptSend(attempt.id, "1".repeat(64), at())).toBe(true);
    expect((await repository.findAttemptById(attempt.id))?.state).toBe("send_acknowledged");

    const evidence = { beforeBoundaryDigest: "f".repeat(64), afterBoundaryDigest: "2".repeat(64),
      outboundMessageIdDigest: "1".repeat(64), outboundContentDigest: attempt.promptDigest,
      replyMessageIdDigest: "4".repeat(64), replyContentDigest: "5".repeat(64),
      exchangeEvidenceDigest: "6".repeat(64), resolution: "acknowledged" as const,
      executionClass: "live_sdk" as const, recordedAt: at() };
    expect(await repository.recordAttemptExchange(attempt.id, evidence)).toBe(true);
    expect((await repository.findAttemptById(attempt.id))?.state).toBe("exchange_recorded");
    await expect(repository.insertPreparedAttempt({ ...attempt, id: crypto.randomUUID() }))
      .rejects.toMatchObject({ code: "23505" });
  });
  it("rolls back the case claim when attempt preparation fails", async () => {
    const repository = createDemoCaseRepository(database.sql);
    const service = new DemoCaseService(createPostgresDemoCaseStore(database));
    const attemptId = crypto.randomUUID();
    const preparation = { id: attemptId, promptDigest: "1".repeat(64),
      processInstanceDigest: "2".repeat(64), sdkVersion: "0.1.4" };
    const first = await service.createCase();
    await service.authorize(first.publicCode, 0);
    await service.claimStrategy(first.publicCode, 1, { alias: "first-alias", mindDigest: "3".repeat(64),
      processNonce: crypto.randomUUID(), attempt: preparation });
    const second = await service.createCase();
    await service.authorize(second.publicCode, 0);

    await expect(service.claimStrategy(second.publicCode, 1, { alias: "second-alias",
      mindDigest: "3".repeat(64), processNonce: crypto.randomUUID(), attempt: preparation }))
      .rejects.toMatchObject({ code: "23505" });
    expect(await repository.findByCode(second.publicCode)).toMatchObject({ state: "authorized", stateVersion: 1 });
    expect((await repository.listEventsByCode(second.publicCode)).map((event) => event.event))
      .toEqual(["authorize"]);
  }, 60_000);
  it("upgrades an existing 0001-0008 ledger without replay", async () => {
    const schema = `legacy_${crypto.randomUUID().replaceAll("-", "")}`;
    await database.sql.unsafe(`create schema "${schema}"`);
    if (!postgresContext) throw new Error("TEST_DATABASE_MISSING");
    const legacy = createDatabaseClient({ connectionString: postgresContext.connectionString, max: 1 });
    try {
      await legacy.sql.unsafe(`set search_path to "${schema}", public`);
      await legacy.sql`create table _olt_migrations (name text primary key, digest text not null,
        applied_at timestamptz not null default now())`;
      const migrations = await discoverMigrations(`${process.cwd()}/db/migrations`);
      expect(migrations.at(-1)?.name).toBe("0011_mind_send_attempt_constraints.sql");
      const demoStart = migrations.findIndex((migration) => migration.name === "0009_demo_slice.sql");
      expect(demoStart).toBeGreaterThan(0);
      for (const migration of migrations.slice(0, demoStart)) {
        await legacy.sql`insert into _olt_migrations (name, digest) values (${migration.name}, ${migration.checksum})`;
      }
      await legacy.sql`create table tenants (id integer primary key)`;
      await expect(applyMigrations(legacy, `${process.cwd()}/db/migrations`))
        .resolves.toEqual(migrations.slice(demoStart).map((migration) => migration.name));
      await expect(applyMigrations(legacy, `${process.cwd()}/db/migrations`)).resolves.toEqual([]);
    } finally {
      await legacy.close();
      await database.sql.unsafe(`drop schema "${schema}" cascade`);
    }
  }, 60_000);
});

function at(): string { return "2026-08-27T00:00:00.000Z"; }
