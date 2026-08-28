// File: tests/integration/db/demo-case-concurrency.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DemoCaseService } from "../../../src/application/demo-case-service";
import type { DatabaseClient } from "../../../src/infrastructure/db/client";
import { createDemoCaseRepository, createPostgresDemoCaseStore } from "../../../src/infrastructure/db/demo-case-repository";
import { applyMigrations } from "../../../src/infrastructure/db/migrations";
import type { ExchangeEvidence, HistoryBoundary } from "../../../src/infrastructure/minds/history";
import { startPostgreSql17, stopPostgreSql17, type PostgreSqlTestContext } from "../helpers/postgres-container";

let database: DatabaseClient;
let postgresContext: PostgreSqlTestContext | undefined;
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
  postgresContext = await startPostgreSql17();
  database = { sql: postgresContext.sql, close: async () => undefined };
  await applyMigrations(database, `${process.cwd()}/db/migrations`);
}, 60_000);
afterAll(async () => stopPostgreSql17(postgresContext), 60_000);

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
  }, 60_000);
});
