import { createHash, randomBytes } from "node:crypto";
import { access, link, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";

import type postgres from "postgres";

import { strategyArtifactSchema, responseArtifactSchema } from "../src/application/minds/work-contract";
import { createReceipt, RECEIPT_EVIDENCE_CLASSES } from "../src/domain/demo/demo-receipt";
import { createDatabaseClient } from "../src/infrastructure/db/client";
import { exchangeEvidenceSchema, sha256 } from "../src/infrastructure/minds/history";

type Row = Record<string, unknown>;
type FixtureClass = "it" | "attempt" | "race" | "rollback_first" | "rollback_second";
type Classified = Readonly<{ id: string; fixtureClass: FixtureClass }>;
type Snapshot = Readonly<{ cases: Row[]; events: Row[]; attempts: Row[] }>;
type PreparedManifest = Readonly<{
  schemaVersion: 2;
  status: "prepared";
  quarantineSchema: string;
  databaseFingerprint: string;
  fullSnapshotDigest: string;
  fixtures: Classified[];
  fixtureDigest: string;
  preservedIds: string[];
  preservedDigest: string;
  confirmationToken: string;
}>;

const schema = "olt_fixture_quarantine_20260828";
const expected = Object.freeze({ it: 23, attempt: 9, race: 17, rollback_first: 11, rollback_second: 11 });
const caseNullable = ["authorized_topic", "authorized_at", "stable_alias", "mind_digest",
  "strategy_artifact", "strategy_digest", "strategy_boundary", "strategy_provenance",
  "strategy_process_nonce", "strategy_ready_at", "return_message", "response_artifact",
  "response_digest", "response_boundary", "response_provenance", "response_process_nonce",
  "response_ready_at", "receipt_digest", "receipt_evidence_classes", "turn_consumed_at",
  "failure_stage", "failure_code"];
const sendNullable = ["expected_boundary_digest", "before_boundary_digest", "send_gate_opened_at",
  "provider_message_id_digest", "send_acknowledged_at", "send_resolution", "after_boundary_digest",
  "outbound_message_id_digest", "outbound_content_digest", "reply_message_id_digest",
  "reply_content_digest", "exchange_evidence_digest", "exchange_recorded_at", "safe_code", "execution_class"];

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, canonical(entry)]));
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function snapshotDigest(snapshot: Snapshot): string {
  return digest({ cases: sorted(snapshot.cases), events: sorted(snapshot.events), attempts: sorted(snapshot.attempts) });
}

function sorted(rows: Row[]): Row[] {
  return [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function groupByCase(rows: Row[]): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row.case_id);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function isNull(row: Row, fields: string[]): boolean {
  return fields.every((field) => row[field] == null);
}

function isUuidCode(code: string, prefix: string): boolean {
  return new RegExp(`^${prefix}[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$`, "i").test(code);
}

function eventShape(rows: Row[]): Array<[string, number]> {
  return [...rows].sort((a, b) => Number(a.sequence) - Number(b.sequence))
    .map((row) => [String(row.event_type), Number(row.aggregate_version)]);
}

function assertIt(row: Row, events: Row[], attempts: Row[]): void {
  assert(row.state === "draft" && row.state_version === 0 && isNull(row, caseNullable), "IT_FIXTURE_SHAPE_INVALID");
  assert(events.length === 0 && attempts.length === 0, "IT_FIXTURE_CHILDREN_INVALID");
}

function assertAttemptFixture(row: Row, events: Row[], attempts: Row[]): void {
  assert(row.state === "strategy_running" && row.state_version === 2 && row.authorized_topic === "community_participation" &&
    row.stable_alias === "opaque-alias" && row.mind_digest === "b".repeat(64) &&
    row.strategy_process_nonce === "00000000-0000-4000-8000-000000000001", "ATTEMPT_FIXTURE_SHAPE_INVALID");
  assert(events.length === 0 && attempts.length === 1, "ATTEMPT_FIXTURE_CHILDREN_INVALID");
  const attempt = attempts[0]!;
  assert(attempt.phase === "strategy" && attempt.state === "exchange_recorded" && attempt.case_version === 2 &&
    attempt.alias_digest === "a".repeat(64) && attempt.mind_digest === "b".repeat(64) &&
    attempt.prompt_digest === "c".repeat(64) && attempt.process_nonce_digest === "d".repeat(64) &&
    attempt.process_instance_digest === "e".repeat(64) && attempt.sdk_version === "0.1.4" &&
    attempt.before_boundary_digest === "f".repeat(64) && attempt.provider_message_id_digest === "1".repeat(64) &&
    attempt.send_resolution === "acknowledged" && attempt.after_boundary_digest === "2".repeat(64) &&
    attempt.outbound_message_id_digest === "1".repeat(64) && attempt.outbound_content_digest === "c".repeat(64) &&
    attempt.reply_message_id_digest === "4".repeat(64) && attempt.reply_content_digest === "5".repeat(64) &&
    attempt.exchange_evidence_digest === "6".repeat(64) && attempt.execution_class === "live_sdk" &&
    attempt.safe_code == null, "ATTEMPT_JOURNAL_SHAPE_INVALID");
}

function assertRace(row: Row, events: Row[], attempts: Row[]): void {
  assert(row.state === "closed" && row.state_version === 7 && row.authorized_topic === "community_participation" &&
    row.stable_alias === "opaque-alias" && row.mind_digest === "f".repeat(64), "RACE_FIXTURE_SHAPE_INVALID");
  strategyArtifactSchema.parse(row.strategy_artifact);
  responseArtifactSchema.parse(row.response_artifact);
  const strategyEvidence = exchangeEvidenceSchema.parse(row.strategy_provenance);
  const responseEvidence = exchangeEvidenceSchema.parse(row.response_provenance);
  const expectedReceipt = createReceipt({ caseCodeDigest: sha256(String(row.public_code)),
    strategyDigest: String(row.strategy_digest), responseDigest: String(row.response_digest),
    beforeVersion: 6, afterVersion: 7, strategyReadyAt: iso(row.strategy_ready_at),
    responseReadyAt: iso(row.response_ready_at), consumedAt: iso(row.turn_consumed_at),
    evidenceClasses: [...RECEIPT_EVIDENCE_CLASSES] });
  assert(row.strategy_digest === "a".repeat(64) && row.response_digest === "b".repeat(64) &&
    row.receipt_digest === expectedReceipt && strategyEvidence.executionClass === "test_transport" &&
    responseEvidence.executionClass === "test_transport", "RACE_EVIDENCE_INVALID");
  assert(JSON.stringify(eventShape(events)) === JSON.stringify([["consume_turn", 7]]) && attempts.length === 0,
    "RACE_FIXTURE_CHILDREN_INVALID");
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  assert(Number.isFinite(date.valueOf()), "FIXTURE_TIME_INVALID");
  return date.toISOString();
}

function assertRollbackFirst(row: Row, events: Row[], attempts: Row[]): void {
  assert(row.state === "strategy_running" && row.state_version === 2 && row.authorized_topic === "community_participation" &&
    row.stable_alias === "first-alias" && row.mind_digest === "3".repeat(64) && row.strategy_process_nonce &&
    isNull(row, caseNullable.filter((field) => !["authorized_topic", "authorized_at", "stable_alias", "mind_digest",
      "strategy_process_nonce"].includes(field))), "ROLLBACK_FIRST_SHAPE_INVALID");
  assert(JSON.stringify(eventShape(events)) === JSON.stringify([["authorize", 1], ["claim_strategy", 2]]) &&
    attempts.length === 1, "ROLLBACK_FIRST_CHILDREN_INVALID");
  const attempt = attempts[0]!;
  assert(attempt.phase === "strategy" && attempt.state === "prepared" && attempt.case_version === 2 &&
    attempt.alias_digest === sha256("first-alias") && attempt.mind_digest === "3".repeat(64) &&
    attempt.prompt_digest === "1".repeat(64) && attempt.process_nonce_digest === sha256(String(row.strategy_process_nonce)) &&
    attempt.process_instance_digest === "2".repeat(64) && attempt.sdk_version === "0.1.4" &&
    isNull(attempt, sendNullable), "ROLLBACK_FIRST_ATTEMPT_INVALID");
}

function assertRollbackSecond(row: Row, events: Row[], attempts: Row[], claimSequences: Set<number>): void {
  assert(row.state === "authorized" && row.state_version === 1 && row.authorized_topic === "community_participation" &&
    row.authorized_at && isNull(row, caseNullable.filter((field) => !["authorized_topic", "authorized_at"].includes(field))),
    "ROLLBACK_SECOND_SHAPE_INVALID");
  assert(JSON.stringify(eventShape(events)) === JSON.stringify([["authorize", 1]]) && attempts.length === 0,
    "ROLLBACK_SECOND_CHILDREN_INVALID");
  assert(claimSequences.has(Number(events[0]!.sequence) - 1), "ROLLBACK_SECOND_PAIR_INVALID");
}

function classify(snapshot: Snapshot): Classified[] {
  const events = groupByCase(snapshot.events);
  const attempts = groupByCase(snapshot.attempts);
  const classified: Classified[] = [];
  const claimSequences = new Set<number>();
  for (const row of snapshot.cases) {
    const id = String(row.id); const code = String(row.public_code);
    if (isUuidCode(code, "OLT-IT-")) { assertIt(row, events.get(id) ?? [], attempts.get(id) ?? []); classified.push({ id, fixtureClass: "it" }); }
    else if (isUuidCode(code, "OLT-ATTEMPT-")) { assertAttemptFixture(row, events.get(id) ?? [], attempts.get(id) ?? []); classified.push({ id, fixtureClass: "attempt" }); }
    else if (isUuidCode(code, "OLT-RACE-")) { assertRace(row, events.get(id) ?? [], attempts.get(id) ?? []); classified.push({ id, fixtureClass: "race" }); }
    else if (row.stable_alias === "first-alias") {
      const rows = events.get(id) ?? []; assertRollbackFirst(row, rows, attempts.get(id) ?? []);
      claimSequences.add(Number(rows.find((event) => event.event_type === "claim_strategy")!.sequence));
      classified.push({ id, fixtureClass: "rollback_first" });
    }
  }
  for (const row of snapshot.cases) {
    const id = String(row.id); if (classified.some((item) => item.id === id)) continue;
    if (row.state === "authorized") {
      assertRollbackSecond(row, events.get(id) ?? [], attempts.get(id) ?? [], claimSequences);
      classified.push({ id, fixtureClass: "rollback_second" });
    }
  }
  return classified;
}

function assertPartition(snapshot: Snapshot, fixtures: Classified[]): Row[] {
  const counts = Object.fromEntries(Object.keys(expected).map((key) => [key, 0])) as Record<FixtureClass, number>;
  for (const fixture of fixtures) counts[fixture.fixtureClass] += 1;
  assert(Object.entries(expected).every(([key, count]) => counts[key as FixtureClass] === count), "FIXTURE_PARTITION_INVALID");
  assert(fixtures.length === 71 && new Set(fixtures.map((item) => item.id)).size === 71, "FIXTURE_CARDINALITY_INVALID");
  const target = new Set(fixtures.map((item) => item.id));
  const preserved = snapshot.cases.filter((row) => !target.has(String(row.id)));
  assert(preserved.length === 3 && preserved.filter((row) => row.public_code === "OLT-DEMO-0001").length === 1 &&
    preserved.filter((row) => row.state === "failed" && row.failure_code).length === 2, "PRESERVATION_SET_INVALID");
  assert(snapshot.cases.length === 74, "SOURCE_CASE_TOTAL_INVALID");
  assert(snapshot.events.filter((row) => target.has(String(row.case_id))).length === 50 &&
    snapshot.attempts.filter((row) => target.has(String(row.case_id))).length === 20, "FIXTURE_CHILD_TOTAL_INVALID");
  return preserved;
}

async function readSnapshot(sql: postgres.Sql | postgres.TransactionSql): Promise<Snapshot> {
  const cases = await sql.unsafe<Row[]>("select * from public.demo_cases order by id");
  const events = await sql.unsafe<Row[]>("select * from public.demo_case_events order by id");
  const attempts = await sql.unsafe<Row[]>("select * from public.demo_mind_send_attempts order by id");
  return { cases, events, attempts };
}

function buildPreparedManifest(fixtures: Classified[], snapshot: Snapshot, preserved: Row[],
  databaseFingerprint: string): PreparedManifest {
  const targetIds = new Set(fixtures.map((item) => item.id));
  return { schemaVersion: 2, status: "prepared", quarantineSchema: schema, databaseFingerprint,
    fullSnapshotDigest: snapshotDigest(snapshot), fixtures,
    fixtureDigest: snapshotDigest({ cases: snapshot.cases.filter((row) => targetIds.has(String(row.id))),
      events: snapshot.events.filter((row) => targetIds.has(String(row.case_id))),
      attempts: snapshot.attempts.filter((row) => targetIds.has(String(row.case_id))) }),
    preservedIds: preserved.map((row) => String(row.id)).sort(),
    preservedDigest: preservedDigest(snapshot, new Set(preserved.map((row) => String(row.id)))),
    confirmationToken: randomBytes(32).toString("hex") };
}

function manifestPath(): string {
  const defaultPath = path.resolve("artifacts/live-providers/fixture-cleanup-manifest.json");
  const resolved = path.resolve(process.env.FIXTURE_MANIFEST_PATH ?? defaultPath);
  assert(process.env.NODE_ENV === "test" || resolved === defaultPath, "MANIFEST_PATH_NOT_AUTHORIZED");
  return resolved;
}

async function writeExclusive(target: string, value: unknown): Promise<void> {
  const handle = await open(target, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

async function publishCommitted(target: string, value: unknown): Promise<void> {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeExclusive(temporary, value);
  try { await link(temporary, target); await syncDirectory(target); }
  finally { await unlink(temporary).catch(() => undefined); }
}

async function syncDirectory(target: string): Promise<void> {
  const directory = await open(path.dirname(target), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

async function loadPrepared(target: string): Promise<PreparedManifest> {
  const preparedPath = `${target}.prepared`;
  const permissions = (await stat(preparedPath)).mode & 0o077;
  assert(permissions === 0, "PREPARED_MANIFEST_PERMISSIONS_INVALID");
  const value = JSON.parse(await readFile(preparedPath, "utf8")) as Partial<PreparedManifest>;
  assert(value.schemaVersion === 2 && value.status === "prepared" && value.quarantineSchema === schema &&
    typeof value.databaseFingerprint === "string" && typeof value.fullSnapshotDigest === "string" &&
    Array.isArray(value.fixtures) && typeof value.fixtureDigest === "string" &&
    Array.isArray(value.preservedIds) && typeof value.preservedDigest === "string" &&
    typeof value.confirmationToken === "string" && /^[0-9a-f]{64}$/.test(value.confirmationToken),
  "PREPARED_MANIFEST_INVALID");
  return value as PreparedManifest;
}

function preservedDigest(snapshot: Snapshot, ids: Set<string>): string {
  return snapshotDigest({ cases: snapshot.cases.filter((row) => ids.has(String(row.id))),
    events: snapshot.events.filter((row) => ids.has(String(row.case_id))),
    attempts: snapshot.attempts.filter((row) => ids.has(String(row.case_id))) });
}

async function createTargetTable(tx: postgres.TransactionSql, fixtures: Classified[]): Promise<void> {
  await tx.unsafe("create temp table olt_frozen_fixture_targets (case_id uuid primary key, fixture_class text not null) on commit drop");
  for (const fixture of fixtures) await tx`insert into olt_frozen_fixture_targets (case_id, fixture_class)
    values (${fixture.id}, ${fixture.fixtureClass})`;
}

async function createArchive(tx: postgres.TransactionSql, prepared: PreparedManifest): Promise<void> {
  await tx.unsafe(`create schema ${schema}`);
  await tx.unsafe(`revoke all on schema ${schema} from public`);
  for (const table of ["demo_cases", "demo_case_events", "demo_mind_send_attempts"]) {
    await tx.unsafe(`create table ${schema}.${table} as select * from public.${table} where false`);
  }
  await tx.unsafe(`create table ${schema}.fixture_manifest (
    case_id uuid primary key, fixture_class text not null, archived_at timestamptz not null default now())`);
  await tx.unsafe(`create table ${schema}.cleanup_metadata (
    singleton boolean primary key default true check (singleton), prepared_digest text not null,
    confirmation_digest text not null, committed_at timestamptz not null default now())`);
  await tx.unsafe(`insert into ${schema}.demo_cases select source.* from public.demo_cases source
    join olt_frozen_fixture_targets target on target.case_id = source.id`);
  await tx.unsafe(`insert into ${schema}.demo_case_events select source.* from public.demo_case_events source
    join olt_frozen_fixture_targets target on target.case_id = source.case_id`);
  await tx.unsafe(`insert into ${schema}.demo_mind_send_attempts select source.* from public.demo_mind_send_attempts source
    join olt_frozen_fixture_targets target on target.case_id = source.case_id`);
  await tx.unsafe(`insert into ${schema}.fixture_manifest (case_id, fixture_class)
    select case_id, fixture_class from olt_frozen_fixture_targets`);
  await tx.unsafe(`insert into ${schema}.cleanup_metadata (prepared_digest, confirmation_digest)
    values ($1, $2)`, [digest(prepared), sha256(prepared.confirmationToken)]);
}

function endpointFingerprint(connectionString: string): string {
  const endpoint = new URL(connectionString);
  return digest({ protocol: endpoint.protocol, hostname: endpoint.hostname.toLowerCase(),
    port: endpoint.port || "5432", database: endpoint.pathname.replace(/^\//, "") });
}

async function databaseFingerprint(sql: postgres.Sql | postgres.TransactionSql,
  connectionString: string): Promise<string> {
  const [identity] = await sql`select current_database() database, current_user role,
    current_setting('server_version_num') server_version`;
  return digest({ identity, endpoint: endpointFingerprint(connectionString) });
}

async function assertArchiveEquality(tx: postgres.TransactionSql, sourceDigest: string): Promise<void> {
  const archived: Snapshot = {
    cases: await tx.unsafe<Row[]>(`select * from ${schema}.demo_cases order by id`),
    events: await tx.unsafe<Row[]>(`select * from ${schema}.demo_case_events order by id`),
    attempts: await tx.unsafe<Row[]>(`select * from ${schema}.demo_mind_send_attempts order by id`),
  };
  assert(archived.cases.length === 71 && archived.events.length === 50 && archived.attempts.length === 20,
    "ARCHIVE_CARDINALITY_INVALID");
  assert(snapshotDigest(archived) === sourceDigest, "ARCHIVE_DIGEST_MISMATCH");
  for (const table of ["demo_cases", "demo_case_events", "demo_mind_send_attempts"]) {
    const key = table === "demo_cases" ? "id" : "case_id";
    const [row] = await tx.unsafe<Array<{ count: number }>>(`select count(*)::int count from (
      (select source.* from public.${table} source join olt_frozen_fixture_targets target on target.case_id = source.${key}
       except all select * from ${schema}.${table}) union all
      (select * from ${schema}.${table} except all
       select source.* from public.${table} source join olt_frozen_fixture_targets target on target.case_id = source.${key})
    ) difference`);
    assert(row?.count === 0, "ARCHIVE_EXACT_EQUALITY_FAILED");
  }
}

async function deleteFrozen(tx: postgres.TransactionSql): Promise<void> {
  const attempts = await tx.unsafe(`delete from public.demo_mind_send_attempts source using olt_frozen_fixture_targets target
    where source.case_id = target.case_id returning source.id`);
  const events = await tx.unsafe(`delete from public.demo_case_events source using olt_frozen_fixture_targets target
    where source.case_id = target.case_id returning source.id`);
  const cases = await tx.unsafe(`delete from public.demo_cases source using olt_frozen_fixture_targets target
    where source.id = target.case_id returning source.id`);
  assert(attempts.length === 20 && events.length === 50 && cases.length === 71, "FIXTURE_DELETE_CARDINALITY_INVALID");
}

async function verifyCommittedDatabase(sql: postgres.Sql, prepared: PreparedManifest,
  connectionString: string): Promise<string> {
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    assert(await databaseFingerprint(tx, connectionString) === prepared.databaseFingerprint,
      "PREPARED_DATABASE_MISMATCH");
    const [metadata] = await tx.unsafe<Array<{ prepared_digest: string; confirmation_digest: string;
      committed_at: Date | string }>>(`select prepared_digest, confirmation_digest, committed_at
      from ${schema}.cleanup_metadata where singleton = true`);
    assert(metadata?.prepared_digest === digest(prepared) &&
      metadata.confirmation_digest === sha256(prepared.confirmationToken), "ARCHIVE_AUTHORITY_MISMATCH");
    const archived: Snapshot = {
      cases: await tx.unsafe<Row[]>(`select * from ${schema}.demo_cases order by id`),
      events: await tx.unsafe<Row[]>(`select * from ${schema}.demo_case_events order by id`),
      attempts: await tx.unsafe<Row[]>(`select * from ${schema}.demo_mind_send_attempts order by id`),
    };
    assert(archived.cases.length === 71 && archived.events.length === 50 && archived.attempts.length === 20 &&
      snapshotDigest(archived) === prepared.fixtureDigest, "COMMITTED_ARCHIVE_INVALID");
    const active = await readSnapshot(tx);
    const activeIds = active.cases.map((row) => String(row.id)).sort();
    assert(digest(activeIds) === digest(prepared.preservedIds) &&
      preservedDigest(active, new Set(activeIds)) === prepared.preservedDigest,
    "COMMITTED_ACTIVE_SET_INVALID");
    return iso(metadata.committed_at);
  });
}

async function finalizeEvidence(targetPath: string, prepared: PreparedManifest,
  committedAt: string): Promise<void> {
  if (process.env.NODE_ENV === "test" && process.env.FIXTURE_TEST_FINALIZE_FAULT === "1") {
    throw new Error("FIXTURE_TEST_FINALIZE_FAULT");
  }
  const { confirmationToken: _, ...evidence } = prepared;
  void _;
  const committed = { ...evidence, status: "committed", confirmationDigest: sha256(prepared.confirmationToken), committedAt };
  try {
    const existing = JSON.parse(await readFile(targetPath, "utf8"));
    assert(digest(existing) === digest(committed), "COMMITTED_MANIFEST_CONFLICT");
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!missing) throw error;
    await publishCommitted(targetPath, committed);
  }
  await unlink(`${targetPath}.prepared`).catch(() => undefined);
  await syncDirectory(targetPath).catch(() => undefined);
}

async function executeCleanup(connectionString: string, confirmation: string): Promise<void> {
  const targetPath = manifestPath();
  const prepared = await loadPrepared(targetPath);
  assert(confirmation === prepared.confirmationToken, "PREPARED_CONFIRMATION_MISMATCH");
  const database = createDatabaseClient({ connectionString, max: 1 });
  let committedAt: string;
  try {
    const [archive] = await database.sql`select to_regnamespace(${schema}) is not null as present`;
    if (!archive?.present) {
      await database.sql.begin("isolation level serializable", async (tx) => {
        await tx.unsafe("set local lock_timeout = '10s'");
        await tx.unsafe("set local statement_timeout = '60s'");
        await tx.unsafe("select pg_advisory_xact_lock(7428842101)");
        await tx.unsafe("lock table public.demo_cases, public.demo_case_events, public.demo_mind_send_attempts in share row exclusive mode");
        assert(await databaseFingerprint(tx, connectionString) === prepared.databaseFingerprint, "PREPARED_DATABASE_MISMATCH");
        const before = await readSnapshot(tx);
        assert(snapshotDigest(before) === prepared.fullSnapshotDigest, "PREPARED_SNAPSHOT_MISMATCH");
        const fixtures = classify(before); const preserved = assertPartition(before, fixtures);
        assert(digest(fixtures) === digest(prepared.fixtures), "PREPARED_TARGET_MISMATCH");
        const target = new Set(fixtures.map((item) => item.id));
        const sourceDigest = snapshotDigest({ cases: before.cases.filter((row) => target.has(String(row.id))),
          events: before.events.filter((row) => target.has(String(row.case_id))),
          attempts: before.attempts.filter((row) => target.has(String(row.case_id))) });
        const keepDigest = preservedDigest(before, new Set(preserved.map((row) => String(row.id))));
        assert(sourceDigest === prepared.fixtureDigest && keepDigest === prepared.preservedDigest &&
          digest(preserved.map((row) => String(row.id)).sort()) === digest(prepared.preservedIds),
        "PREPARED_DIGEST_MISMATCH");
        await createTargetTable(tx, fixtures); await createArchive(tx, prepared);
        if (process.env.NODE_ENV === "test" && process.env.FIXTURE_TEST_FAULT === "1") throw new Error("FIXTURE_TEST_FAULT");
        await assertArchiveEquality(tx, sourceDigest); await deleteFrozen(tx);
        const after = await readSnapshot(tx);
        assert(after.cases.length === 3 && after.attempts.filter((row) => ["prepared", "send_outcome_unknown", "send_acknowledged"].includes(String(row.state))).length === 0,
          "ACTIVE_POSTCONDITION_INVALID");
        assert(preservedDigest(after, new Set(after.cases.map((row) => String(row.id)))) === keepDigest, "PRESERVED_ROWS_CHANGED");
        assert(classify(after).length === 0, "FIXTURE_ROWS_REMAIN");
      });
    }
    committedAt = await verifyCommittedDatabase(database.sql, prepared, connectionString);
  } finally { await database.close(); }
  await finalizeEvidence(targetPath, prepared, committedAt);
}

async function checkCleanup(connectionString: string): Promise<string> {
  const targetPath = manifestPath();
  await access(targetPath).then(() => { throw new Error("COMMITTED_MANIFEST_ALREADY_EXISTS"); }, () => undefined);
  const database = createDatabaseClient({ connectionString, max: 1 });
  let prepared: PreparedManifest | undefined;
  try {
    await database.sql.begin("isolation level repeatable read read only", async (tx) => {
      const [exists] = await tx`select to_regnamespace(${schema}) is not null as present`;
      assert(exists?.present === false, "QUARANTINE_SCHEMA_ALREADY_EXISTS");
      const snapshot = await readSnapshot(tx);
      const fixtures = classify(snapshot); const preserved = assertPartition(snapshot, fixtures);
      prepared = buildPreparedManifest(fixtures, snapshot, preserved, await databaseFingerprint(tx, connectionString));
    });
  } finally { await database.close(); }
  assert(prepared, "PREPARED_MANIFEST_NOT_BUILT");
  await writeExclusive(`${targetPath}.prepared`, prepared);
  return prepared.confirmationToken;
}

const connectionString = process.env.DATABASE_URL;
const mode = process.argv[2];
if (!connectionString || !["--check", "--execute"].includes(mode ?? "")) {
  process.stderr.write("FIXTURE_QUARANTINE=failed CODE=EXECUTION_AUTHORITY_REQUIRED\n");
  process.exitCode = 1;
} else (mode === "--check" ? checkCleanup(connectionString) : executeCleanup(connectionString, process.argv[3] ?? ""))
  .then((confirmation) => process.stdout.write(mode === "--check"
    ? `FIXTURE_QUARANTINE=verified CASES=71 EVENTS=50 ATTEMPTS=20 CONFIRM=${confirmation}\n`
    : "FIXTURE_QUARANTINE=complete CASES=71 EVENTS=50 ATTEMPTS=20\n"))
  .catch((error) => {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "FIXTURE_QUARANTINE_FAILED";
    process.stderr.write(`FIXTURE_QUARANTINE=failed CODE=${code}\n`);
    if (process.env.FIXTURE_DEBUG_LOCAL === "1" && error instanceof Error) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
