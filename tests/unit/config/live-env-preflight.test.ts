import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assertLiveEnvPreflight } from "../../../scripts/assert-live-env-preflight";

describe("assertLiveEnvPreflight", () => {
  it("accepts the exact live environment flags", () => {
    expect(() => assertLiveEnvPreflight({
      DEMO_CASE_ENABLED: "true",
      MINDS_LIVE_ENABLED: "true",
      DEMO_BYPASS_AUTH: "false",
      MINDS_BUILDER_API_KEY: "header.payload.signature",
      MINDS_MIND_ID: "00000000-0000-4000-8000-000000000001",
    })).not.toThrow();
  });

  it("rejects missing flags instead of applying defaults", () => {
    expect(() => assertLiveEnvPreflight({})).toThrow("DEMO_CASE_ENABLED must be exactly true");
  });

  it("rejects an enabled production bypass", () => {
    expect(() => assertLiveEnvPreflight({
      DEMO_CASE_ENABLED: "true",
      MINDS_LIVE_ENABLED: "true",
      DEMO_BYPASS_AUTH: "true",
    })).toThrow("DEMO_BYPASS_AUTH must be exactly false");
  });

  it("rejects an unreadable pulled secret before provider work", () => {
    expect(() => assertLiveEnvPreflight({
      DEMO_CASE_ENABLED: "true",
      MINDS_LIVE_ENABLED: "true",
      DEMO_BYPASS_AUTH: "false",
      MINDS_BUILDER_API_KEY: "[REDACTED]",
      MINDS_MIND_ID: "00000000-0000-4000-8000-000000000001",
    })).toThrow("MINDS_BUILDER_API_KEY must be JWT-shaped");
  });

  it("rejects an unreadable pulled Mind ID before provider work", () => {
    expect(() => assertLiveEnvPreflight({
      DEMO_CASE_ENABLED: "true",
      MINDS_LIVE_ENABLED: "true",
      DEMO_BYPASS_AUTH: "false",
      MINDS_BUILDER_API_KEY: "header.payload.signature",
      MINDS_MIND_ID: "[REDACTED]",
    })).toThrow("MINDS_MIND_ID must be UUID-shaped");
  });

  it("records the safe job code in the Process-A command marker", () => {
    const source = readFileSync(`${process.cwd()}/scripts/run-case-strategy.ts`, "utf8");
    expect(source).toContain("CASE_STRATEGY=${result.state} CODE=${result.code}");
  });

  it("records the safe job code in the Process-B command marker", () => {
    const source = readFileSync(`${process.cwd()}/scripts/run-case-response.ts`, "utf8");
    expect(source).toContain("CASE_RESPONSE=${result.state} CODE=${result.code}");
  });

  it("exposes the credential-shape preflight as an explicit command", () => {
    const packageJson = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8"));
    expect(packageJson.scripts["preflight:live-env"])
      .toBe("tsx scripts/assert-live-env-preflight.ts");
  });
});
