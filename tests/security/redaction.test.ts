// File: tests/security/redaction.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { liveManifestSchema } from "../../src/evidence/live-manifest";

describe("redaction boundary", () => {
  it("rejects raw prompts and messages", () => {
    const keys = Object.keys(liveManifestSchema.shape);
    expect(keys).not.toContain("prompt"); expect(keys).not.toContain("messageText");
    expect(keys).not.toContain("alias"); expect(keys).not.toContain("mindId");
  });
  it("keeps provider execution out of web actions", () => {
    const actions = readFileSync(`${process.cwd()}/src/app/actions.ts`, "utf8");
    expect(actions).not.toMatch(/createMindRuntime|runStrategyJob|runResponseJob|sendMessage/);
  });
});
