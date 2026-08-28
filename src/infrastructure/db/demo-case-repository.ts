// File: src/infrastructure/db/demo-case-repository.ts
import type postgres from "postgres";

import type { DemoState } from "../../domain/demo/demo-case";
import type { ReceiptEvidenceClass } from "../../domain/demo/demo-receipt";
import type { MindSendAttemptState } from "../../domain/demo/mind-send-attempt";
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
export type MindAttemptPhase = "strategy" | "response";
export type PreparedMindSendAttempt = Readonly<{
  id: string; caseId: string; phase: MindAttemptPhase; caseVersion: number;
  aliasDigest: string; mindDigest: string; promptDigest: string;
  processNonceDigest: string; processInstanceDigest: string; sdkVersion: string;
  expectedBoundaryDigest: string | null;
}>;
export type AttemptExchangeDigests = Readonly<{
  beforeBoundaryDigest: string; afterBoundaryDigest: string;
  outboundMessageIdDigest: string; outboundContentDigest: string;
  replyMessageIdDigest: string; replyContentDigest: string;
  exchangeEvidenceDigest: string; resolution: "acknowledged" | "history_recovered";
  executionClass: "live_sdk"; recordedAt: string;
}>;
export type MindSendAttemptRecord = PreparedMindSendAttempt & Readonly<{
  state: MindSendAttemptState; beforeBoundaryDigest: string | null;
  providerMessageIdDigest: string | null; safeCode: string | null;
  sendGateOpenedAt: string | null; sendAcknowledgedAt: string | null;
  sendResolution: "acknowledged" | "history_recovered" | null;
  afterBoundaryDigest: string | null; exchangeEvidenceDigest: string | null;
  executionClass: "live_sdk" | null; exchangeRecordedAt: string | null;
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
  insertPreparedAttempt(input: PreparedMindSendAttempt): Promise<void>;
  findAttemptById(id: string): Promise<MindSendAttemptRecord | null>;
  findAttemptByCode(code: string, phase: MindAttemptPhase): Promise<MindSendAttemptRecord | null>;
  markAttemptPreSendFailed(id: string, safeCode: string): Promise<boolean>;
  openAttemptSendGate(id: string, beforeBoundaryDigest: string, at: string): Promise<boolean>;
  acknowledgeAttemptSend(id: string, providerMessageIdDigest: string, at: string): Promise<boolean>;
  noteAttemptAmbiguity(id: string, safeCode: string): Promise<boolean>;
  recordAttemptExchange(id: string, input: AttemptExchangeDigests): Promise<boolean>;
}
export interface DemoCaseStore {
  findByCode(publicCode: string): Promise<DemoCaseRecord | null>;
  findResponseJobInput(publicCode: string): Promise<ResponseJobInput | null>;
  listEventsByCode(publicCode: string): Promise<readonly DemoLedgerEvent[]>;
  appendAuditEvent(publicCode: string, version: number, event: "replay_rejected", payload: Record<string, unknown>): Promise<void>;
  findAttemptByCode(code: string, phase: MindAttemptPhase): Promise<MindSendAttemptRecord | null>;
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

function rowToAttempt(row: Row): MindSendAttemptRecord {
  return { id: String(row.id), caseId: String(row.case_id), phase: row.phase as MindAttemptPhase,
    caseVersion: Number(row.case_version), state: row.state as MindSendAttemptState,
    aliasDigest: String(row.alias_digest), mindDigest: String(row.mind_digest),
    promptDigest: String(row.prompt_digest), processNonceDigest: String(row.process_nonce_digest),
    processInstanceDigest: String(row.process_instance_digest), sdkVersion: String(row.sdk_version),
    expectedBoundaryDigest: row.expected_boundary_digest ? String(row.expected_boundary_digest) : null,
    beforeBoundaryDigest: row.before_boundary_digest ? String(row.before_boundary_digest) : null,
    providerMessageIdDigest: row.provider_message_id_digest ? String(row.provider_message_id_digest) : null,
    safeCode: row.safe_code ? String(row.safe_code) : null,
    sendGateOpenedAt: iso(row.send_gate_opened_at), sendAcknowledgedAt: iso(row.send_acknowledged_at),
    sendResolution: row.send_resolution as "acknowledged" | "history_recovered" | null,
    afterBoundaryDigest: row.after_boundary_digest ? String(row.after_boundary_digest) : null,
    exchangeEvidenceDigest: row.exchange_evidence_digest ? String(row.exchange_evidence_digest) : null,
    executionClass: row.execution_class as "live_sdk" | null,
    exchangeRecordedAt: iso(row.exchange_recorded_at) };
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
    async insertPreparedAttempt(input) {
      const rows = await sql`insert into demo_mind_send_attempts (id, case_id, phase, case_version,
        alias_digest, mind_digest, prompt_digest, process_nonce_digest,
        process_instance_digest, sdk_version, expected_boundary_digest, state)
        select ${input.id}, demo.id, ${input.phase}, ${input.caseVersion},
          ${input.aliasDigest}, ${input.mindDigest}, ${input.promptDigest},
          ${input.processNonceDigest}, ${input.processInstanceDigest}, ${input.sdkVersion},
          ${input.expectedBoundaryDigest}, 'prepared' from demo_cases demo
        where demo.id = ${input.caseId} and demo.state_version = ${input.caseVersion}
          and demo.state = case when ${input.phase} = 'strategy' then 'strategy_running' else 'response_running' end
        returning id`;
      if (rows.length !== 1) throw new Error("MIND_ATTEMPT_PREPARE_REJECTED");
    },
    async findAttemptById(id) {
      const rows = await sql<Row[]>`select * from demo_mind_send_attempts where id = ${id}`;
      return rows[0] ? rowToAttempt(rows[0]) : null;
    },
    async findAttemptByCode(code, phase) {
      const rows = await sql<Row[]>`select attempt.* from demo_mind_send_attempts attempt
        join demo_cases demo on demo.id = attempt.case_id
        where demo.public_code = ${code} and attempt.phase = ${phase}`;
      return rows[0] ? rowToAttempt(rows[0]) : null;
    },
    async markAttemptPreSendFailed(id, safeCode) {
      const rows = await sql`update demo_mind_send_attempts set state = 'pre_send_failed',
        safe_code = ${safeCode}, updated_at = now() where id = ${id} and state = 'prepared' returning id`;
      return rows.length === 1;
    },
    async openAttemptSendGate(id, beforeBoundaryDigest, at) {
      const rows = await sql`update demo_mind_send_attempts set state = 'send_outcome_unknown',
        before_boundary_digest = ${beforeBoundaryDigest}, send_gate_opened_at = ${at}, updated_at = now()
        where id = ${id} and state = 'prepared' returning id`;
      return rows.length === 1;
    },
    async acknowledgeAttemptSend(id, providerMessageIdDigest, at) {
      const rows = await sql`update demo_mind_send_attempts set state = 'send_acknowledged',
        provider_message_id_digest = ${providerMessageIdDigest}, send_acknowledged_at = ${at}, updated_at = now()
        where id = ${id} and state = 'send_outcome_unknown' returning id`;
      return rows.length === 1;
    },
    async noteAttemptAmbiguity(id, safeCode) {
      const rows = await sql`update demo_mind_send_attempts set safe_code = ${safeCode}, updated_at = now()
        where id = ${id} and state = 'send_outcome_unknown' returning id`;
      return rows.length === 1;
    },
    async recordAttemptExchange(id, input) {
      const rows = await sql`update demo_mind_send_attempts set state = 'exchange_recorded',
        send_resolution = ${input.resolution}, after_boundary_digest = ${input.afterBoundaryDigest},
        execution_class = ${input.executionClass},
        outbound_message_id_digest = ${input.outboundMessageIdDigest},
        outbound_content_digest = ${input.outboundContentDigest}, reply_message_id_digest = ${input.replyMessageIdDigest},
        reply_content_digest = ${input.replyContentDigest}, exchange_evidence_digest = ${input.exchangeEvidenceDigest},
        exchange_recorded_at = ${input.recordedAt}, updated_at = now()
        where id = ${id} and state in ('send_outcome_unknown', 'send_acknowledged')
          and before_boundary_digest = ${input.beforeBoundaryDigest} returning id`;
      return rows.length === 1;
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
    findAttemptByCode: (code, phase) =>
      createDemoCaseRepository(database.sql).findAttemptByCode(code, phase),
    async transaction<T>(work: (repository: DemoCaseRepository) => Promise<T>): Promise<T> {
      const [result] = await database.sql.begin((sql) => [
        work(createDemoCaseRepository(sql)).then((value) => ({ value })),
      ]);
      if (!result) throw new Error("DEMO_TRANSACTION_RESULT_MISSING");
      return result.value;
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
