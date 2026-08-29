// File: src/application/minds/work-contract.ts
import { z } from "zod";

// Unknown keys are stripped, not rejected: a real Mind reply may add an extra field,
// and failing the whole handoff over a harmless key is the wrong trade. Required fields
// and their literal constraints stay strict.
export const strategyArtifactSchema = z.object({
  riskSummary: z.string().min(20).max(600),
  responsePlan: z.array(z.string().min(5).max(240)).min(2).max(5),
  safeScope: z.string().min(10).max(240),
});
export const responseArtifactSchema = z.object({
  access: z.literal("unchanged"),
  scope: z.literal("one_future_community_topic"),
  privacy: z.literal("withhold_private_context"),
  rationale: z.string().min(10).max(400),
});

export type StrategyArtifact = z.infer<typeof strategyArtifactSchema>;
export type ResponseArtifact = z.infer<typeof responseArtifactSchema>;

// Extract the first balanced JSON object from arbitrary text. Leading prose, trailing
// sentences, and markdown fences all fall outside the braces, so this absorbs the three
// ways an LLM commonly wraps its JSON. String contents are respected so braces or quotes
// inside a value never confuse the depth count.
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// A Minds agent is conversational: it reasons in prose, not JSON. The contract meets it
// there. If the reply happens to contain valid JSON we use it; otherwise the application
// maps the Mind's prose into the artifact shape. The Mind owns the reasoning (riskSummary,
// responsePlan, rationale); the application owns the fixed policy fields (access, scope,
// privacy, safeScope) that were never the Mind's decision to make.
const SAFE_SCOPE = "Do not reveal the affected participant's private choice or the private boundary text.";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
function clampText(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).trim();
}
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 5);
}
function tryJsonArtifact<T>(schema: z.ZodType<T>, value: string): T | null {
  const candidate = extractFirstJsonObject(value);
  if (!candidate) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(candidate));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

function strategyFromProse(value: string): StrategyArtifact {
  const clean = normalize(value);
  if (clean.length < 20) throw new Error("MIND_ARTIFACT_TOO_SHORT");
  const sentences = splitSentences(clean);
  const riskSummary = clampText(sentences[0] && sentences[0].length >= 20 ? sentences[0] : clean, 600);
  let responsePlan = sentences.slice(1).map((s) => clampText(s, 240)).filter((s) => s.length >= 5).slice(0, 5);
  if (responsePlan.length < 2) {
    const all = sentences.map((s) => clampText(s, 240)).filter((s) => s.length >= 5).slice(0, 5);
    responsePlan = all.length >= 2 ? all : [clampText(clean, 240), clampText(clean.slice(240) || clean, 240)];
  }
  return { riskSummary, responsePlan, safeScope: SAFE_SCOPE };
}

function responseFromProse(value: string): ResponseArtifact {
  const clean = normalize(value);
  if (clean.length < 10) throw new Error("MIND_ARTIFACT_TOO_SHORT");
  return {
    access: "unchanged",
    scope: "one_future_community_topic",
    privacy: "withhold_private_context",
    rationale: clampText(clean, 400),
  };
}

export function parseStrategyArtifact(value: string): StrategyArtifact {
  return tryJsonArtifact(strategyArtifactSchema, value) ?? strategyArtifactSchema.parse(strategyFromProse(value));
}

export function parseResponseArtifact(value: string): ResponseArtifact {
  return tryJsonArtifact(responseArtifactSchema, value) ?? responseArtifactSchema.parse(responseFromProse(value));
}

export function strategyPrompt(): string {
  return [
    "You are preparing a brief private handling strategy for a returning community member.",
    "Access is already decided and independent of contact. One future community-participation topic is authorized.",
    "In a few short sentences, describe the main risk that the member reopens the private issue, then two or three concrete steps for the eventual reply, then what must stay private.",
    "Keep it concise and plain. Never reveal or restate the affected participant's private choice.",
  ].join("\n");
}

export function responsePrompt(returnMessage: string): string {
  return [
    "Using only what you remember about this case, write a short, warm reply to the returning member.",
    "Keep their access unchanged, stay within the one authorized future community topic, and never disclose the private context.",
    "Reply in a few plain sentences. Do not ask for any hidden rules.",
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
