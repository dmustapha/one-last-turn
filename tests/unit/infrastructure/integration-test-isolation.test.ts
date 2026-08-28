import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const canonicalSuites = [
  "tests/integration/db/demo-case-repository.test.ts",
  "tests/integration/db/demo-case-concurrency.test.ts",
];

describe("canonical demo integration isolation", () => {
  it.each(canonicalSuites)("uses disposable PostgreSQL and never persistent DATABASE_URL in %s", async (file) => {
    const source = await readFile(path.resolve(file), "utf8");
    expect(source).toContain("startPostgreSql17");
    expect(source).toContain("stopPostgreSql17");
    expect(source).not.toContain("process.env.DATABASE_URL");
  });
});
