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
