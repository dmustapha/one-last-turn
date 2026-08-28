// File: src/config/env.ts
import { z } from "zod";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from "./feature-flags";

const booleanString = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const builderKey = z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
const mindId = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(), APP_URL: z.string().url().optional(),
  MINDS_LIVE_ENABLED: booleanString, MINDS_BUILDER_API_KEY: builderKey.optional(),
  MINDS_MIND_ID: mindId.optional(), DEMO_CASE_ENABLED: booleanString,
  EMAIL_LIVE_ENABLED: booleanString, RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(), AUTH_LIVE_ENABLED: booleanString,
  CLERK_SECRET_KEY: z.string().min(1).optional(), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CONTACT_LANE_ENABLED: booleanString, DEMO_BYPASS_AUTH: booleanString,
});
type ParsedEnvironment = z.infer<typeof environmentSchema>;
type ValidationScope = "all" | "demo";

export type AppConfig = Readonly<{
  appUrl: string | undefined; builderApiKey: string | undefined; databaseUrl: string | undefined;
  demoBypassAuth: boolean; features: FeatureFlags; mindId: string | undefined;
  nodeEnv: ParsedEnvironment["NODE_ENV"];
}>;

export function loadEnv(source: NodeJS.ProcessEnv,
  options: { validationScope?: ValidationScope } = {}): AppConfig {
  const parsed = environmentSchema.parse(source);
  validateRequiredVariables(parsed, options.validationScope ?? "all");
  return Object.freeze({ appUrl: parsed.APP_URL, builderApiKey: parsed.MINDS_BUILDER_API_KEY,
    databaseUrl: parsed.DATABASE_URL, demoBypassAuth: parsed.DEMO_BYPASS_AUTH,
    features: Object.freeze({ ...DEFAULT_FEATURE_FLAGS, authLive: parsed.AUTH_LIVE_ENABLED,
      contactLane: parsed.CONTACT_LANE_ENABLED, demoCase: parsed.DEMO_CASE_ENABLED,
      emailLive: parsed.EMAIL_LIVE_ENABLED, mindsLive: parsed.MINDS_LIVE_ENABLED }),
    mindId: parsed.MINDS_MIND_ID, nodeEnv: parsed.NODE_ENV });
}

function validateRequiredVariables(environment: ParsedEnvironment, scope: ValidationScope): void {
  if (environment.NODE_ENV === "production" && environment.DEMO_BYPASS_AUTH) {
    throw new Error("DEMO_BYPASS_AUTH cannot be enabled in production");
  }
  if (environment.DEMO_CASE_ENABLED && !environment.MINDS_LIVE_ENABLED) {
    throw new Error("DEMO_CASE_ENABLED requires MINDS_LIVE_ENABLED");
  }
  const missing = collectMissingVariables(environment, scope);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

function collectMissingVariables(environment: ParsedEnvironment, scope: ValidationScope): string[] {
  const missing: string[] = [];
  requireWhen(missing, environment.NODE_ENV !== "test", environment, ["DATABASE_URL"]);
  requireWhen(missing, environment.MINDS_LIVE_ENABLED, environment,
    ["MINDS_BUILDER_API_KEY", "MINDS_MIND_ID"]);
  requireWhen(missing, scope === "all" && environment.EMAIL_LIVE_ENABLED, environment,
    ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"]);
  requireWhen(missing, scope === "all" && environment.AUTH_LIVE_ENABLED, environment,
    ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
  return missing;
}

function requireWhen(missing: string[], enabled: boolean, environment: ParsedEnvironment,
  names: ReadonlyArray<keyof ParsedEnvironment>): void {
  if (!enabled) return;
  for (const name of names) if (!environment[name]) missing.push(name);
}
