// File: tests/unit/config/env.test.ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../src/config/env";

describe("environment contract", () => {
  it("allows credential-free unit tests", () => expect(loadEnv({ NODE_ENV: "test" }).features.demoCase).toBe(false));
  it("requires Minds live mode for the demo", () => expect(() => loadEnv({ NODE_ENV: "test",
    DEMO_CASE_ENABLED: "true" })).toThrow("DEMO_CASE_ENABLED requires MINDS_LIVE_ENABLED"));
  it("requires live credentials", () => expect(() => loadEnv({ NODE_ENV: "test",
    DEMO_CASE_ENABLED: "true", MINDS_LIVE_ENABLED: "true" })).toThrow("MINDS_BUILDER_API_KEY"));
  it("rejects unreadable pulled credentials before runtime construction", () => expect(() => loadEnv({
    NODE_ENV: "test", DEMO_CASE_ENABLED: "true", MINDS_LIVE_ENABLED: "true",
    MINDS_BUILDER_API_KEY: "[REDACTED]", MINDS_MIND_ID: "[REDACTED]",
  })).toThrow());
  it("keeps unrelated email credentials outside the demo runtime scope", () => expect(loadEnv({
    NODE_ENV: "production", DATABASE_URL: "postgres://localhost/demo",
    DEMO_CASE_ENABLED: "true", MINDS_LIVE_ENABLED: "true", DEMO_BYPASS_AUTH: "false",
    MINDS_BUILDER_API_KEY: "a.b.c", MINDS_MIND_ID: "00000000-0000-4000-8000-000000000001",
    EMAIL_LIVE_ENABLED: "true", RESEND_API_KEY: "configured",
  }, { validationScope: "demo" }).features.demoCase).toBe(true));
  it("still requires webhook verification for the full live email scope", () => expect(() => loadEnv({
    NODE_ENV: "production", DATABASE_URL: "postgres://localhost/app",
    EMAIL_LIVE_ENABLED: "true", RESEND_API_KEY: "configured",
  })).toThrow("RESEND_WEBHOOK_SECRET"));
});
