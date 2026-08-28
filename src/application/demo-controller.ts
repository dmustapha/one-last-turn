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
