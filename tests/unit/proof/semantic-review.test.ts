import { describe, expect, it } from "vitest";

import { aggregateSemanticReviews } from "@/proof/semantic-review";

const evidenceDigest = "a".repeat(64);
const dispatchDigests = ["b".repeat(64), "c".repeat(64), "d".repeat(64)];
const reviewEvidenceDigests = ["e".repeat(64), "f".repeat(64), "1".repeat(64)];

type FindingInput = {
  schemaVersion: number;
  reviewerId: string;
  dispatchDigest: string;
  evidenceDigest: string;
  reviewEvidenceDigest: string;
  reviewedAt: string;
  processBConstraintsOmitted: boolean;
  criticalPersistenceRecall: boolean;
  supportingConcepts: string[];
  genericAgreement: boolean;
  promptEcho: boolean;
  refusal: boolean;
  staleEvidence: boolean;
  verdict: string;
};

function finding(index: number, overrides: Partial<FindingInput> = {}): FindingInput {
  return {
    schemaVersion: 1,
    reviewerId: `reviewer-${index + 1}`,
    dispatchDigest: dispatchDigests[index]!,
    evidenceDigest,
    reviewEvidenceDigest: reviewEvidenceDigests[index]!,
    reviewedAt: `2026-08-27T01:02:0${index}.000Z`,
    processBConstraintsOmitted: true,
    criticalPersistenceRecall: true,
    supportingConcepts: ["ACCESS_INDEPENDENCE"],
    genericAgreement: false,
    promptEcho: false,
    refusal: false,
    staleEvidence: false,
    verdict: "PASS",
    ...overrides,
  };
}

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    expectedEvidenceDigest: evidenceDigest,
    expectedDispatchDigests: [...dispatchDigests],
    findings: [finding(0), finding(1), finding(2)],
    ...overrides,
  };
}

function expectFailure(input: unknown, reason: RegExp): void {
  expect(aggregateSemanticReviews(input)).toMatchObject({
    verdict: "FAIL",
    reasons: expect.arrayContaining([expect.stringMatching(reason)]),
  });
}

function expectRejected(input: unknown): void {
  expect(aggregateSemanticReviews(input).verdict).toBe("FAIL");
}

function withFirstFinding(first: unknown): Record<string, unknown> {
  return validInput({ findings: [first, finding(1), finding(2)] });
}

describe("aggregateSemanticReviews", () => {
  it("passes three unanimous reviews bound to pre-issued dispatches", () => {
    expect(aggregateSemanticReviews(validInput())).toEqual({
      verdict: "PASS",
      evidenceDigest,
      reviewerCount: 3,
      reasons: [],
    });
  });

  it.each([2, 4])("fails when given %i findings", (count) => {
    const findings = [finding(0), finding(1), finding(2)];
    if (count === 4) findings.push(finding(0, { reviewerId: "reviewer-4" }));

    expect(aggregateSemanticReviews(validInput({ findings: findings.slice(0, count) }))).toMatchObject({
      verdict: "FAIL",
      reviewerCount: count,
    });
  });

  it("rejects invented reviewer labels without matching pre-issued dispatches", () => {
    const findings = [0, 1, 2].map((index) =>
      finding(index, { dispatchDigest: `${index + 2}`.repeat(64) }),
    );

    expectFailure(validInput({ findings }), /pre-issued dispatch/i);
  });

  it("rejects findings bound to a different evidence artifact", () => {
    const findings = [0, 1, 2].map((index) =>
      finding(index, { evidenceDigest: "9".repeat(64) }),
    );

    expectFailure(validInput({ findings }), /expected evidence digest/i);
  });

  it.each(["providerMessage", "providerIdentifier", "rawProse"])(
    "rejects the unknown tracked field %s",
    (unsafeKey) => {
      const unsafeFinding: Record<string, unknown> = { ...finding(0) };
      unsafeFinding[unsafeKey] = "must not be tracked";
      const findings: unknown[] = [unsafeFinding, finding(1), finding(2)];

      expectFailure(validInput({ findings }), /exact keys/i);
    },
  );

  it("rejects a missing finding key", () => {
    const findings: unknown[] = [finding(0), finding(1), finding(2)];
    const missingKey: Partial<FindingInput> = { ...finding(0) };
    delete missingKey.reviewedAt;
    findings[0] = missingKey;

    expectFailure(validInput({ findings }), /exact keys/i);
  });

  it("rejects an extra finding key", () => {
    const findings: unknown[] = [
      { ...finding(0), note: "extra" },
      finding(1),
      finding(2),
    ];

    expectFailure(validInput({ findings }), /exact keys/i);
  });

  it("rejects duplicate raw-review evidence digests", () => {
    const findings = [finding(0), finding(1), finding(2)];
    findings[2] = finding(2, { reviewEvidenceDigest: reviewEvidenceDigests[0]! });

    expectFailure(validInput({ findings }), /unique review evidence digest/i);
  });

  it.each([
    ["malformed", ["not-a-digest", dispatchDigests[1], dispatchDigests[2]]],
    ["duplicate", [dispatchDigests[0], dispatchDigests[0], dispatchDigests[2]]],
    ["missing", dispatchDigests.slice(0, 2)],
  ])("rejects a %s expected dispatch list", (_name, expectedDispatchDigests) => {
    expectFailure(validInput({ expectedDispatchDigests }), /expected dispatch/i);
  });

  it("rejects duplicate reviewer identities", () => {
    const findings = [finding(0), finding(1), finding(2, { reviewerId: "reviewer-1" })];

    expectFailure(validInput({ findings }), /distinct reviewer/i);
  });

  it.each([
    ["expected evidence digest", { expectedEvidenceDigest: "ABC123" }],
    ["finding evidence digest", { findings: [finding(0, { evidenceDigest: "ABC123" }), finding(1), finding(2)] }],
    ["review evidence digest", { findings: [finding(0, { reviewEvidenceDigest: "ABC123" }), finding(1), finding(2)] }],
    ["timestamp", { findings: [finding(0, { reviewedAt: "2026-08-27T01:02:00Z" }), finding(1), finding(2)] }],
  ])("rejects malformed %s", (_name, overrides) => {
    expectFailure(validInput(overrides), /invalid/i);
  });

  it("recomputes failure when supplied PASS contradicts objective fields", () => {
    const findings = [
      finding(0, { criticalPersistenceRecall: false }),
      finding(1),
      finding(2),
    ];

    expectFailure(validInput({ findings }), /critical persistence/i);
  });

  it("treats supplied FAIL as dissent even when objective fields pass", () => {
    const findings = [finding(0), finding(1, { verdict: "FAIL" }), finding(2)];

    expectFailure(validInput({ findings }), /dissent/i);
  });

  it.each([
    ["constraints supplied", { processBConstraintsOmitted: false }],
    ["generic agreement", { genericAgreement: true }],
    ["prompt echo", { promptEcho: true }],
    ["refusal", { refusal: true }],
    ["stale evidence", { staleEvidence: true }],
  ])("rejects adverse finding: %s", (_name, adverse) => {
    const findings = [finding(0, adverse), finding(1), finding(2)];

    expectFailure(validInput({ findings }), /constraints|agreement|echo|refusal|stale/i);
  });

  it("rejects a finding without a supporting concept", () => {
    const findings = [finding(0, { supportingConcepts: [] }), finding(1), finding(2)];

    expectFailure(validInput({ findings }), /supporting concept/i);
  });

  it("rejects a concept outside the finite vocabulary", () => {
    const findings = [
      finding(0, { supportingConcepts: ["UNAPPROVED"] }),
      finding(1),
      finding(2),
    ];

    expectFailure(validInput({ findings }), /invalid finding/i);
  });

  it("rejects aggregate fields inherited from a prototype", () => {
    expectRejected(Object.create(validInput()));
  });

  it("rejects an extra top-level string key", () => {
    expectRejected({ ...validInput(), extra: "unexpected" });
  });

  it("rejects an extra top-level symbol key", () => {
    const input = validInput();
    Object.defineProperty(input, Symbol("extra"), { value: "unexpected" });

    expectRejected(input);
  });

  it("rejects a symbol key on a finding", () => {
    const unsafe = finding(0) as FindingInput & Record<symbol, unknown>;
    Object.defineProperty(unsafe, Symbol("extra"), { value: "unexpected" });

    expectRejected(withFirstFinding(unsafe));
  });

  it("rejects an aggregate accessor even when it returns a valid value", () => {
    const input = validInput();
    Object.defineProperty(input, "expectedEvidenceDigest", {
      enumerable: true,
      get: () => evidenceDigest,
    });

    expectRejected(input);
  });

  it("rejects a throwing aggregate accessor without throwing", () => {
    const input = validInput();
    Object.defineProperty(input, "findings", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });

    expect(() => aggregateSemanticReviews(input)).not.toThrow();
    expectRejected(input);
  });

  it("rejects a value-changing aggregate accessor before TOCTOU", () => {
    const input = validInput();
    let reads = 0;
    Object.defineProperty(input, "expectedEvidenceDigest", {
      enumerable: true,
      get() {
        reads += 1;
        return reads < 3 ? evidenceDigest : "9".repeat(64);
      },
    });

    expectRejected(input);
  });

  it("rejects a finding accessor even when it returns a valid value", () => {
    const unsafe = finding(0);
    Object.defineProperty(unsafe, "reviewerId", {
      enumerable: true,
      get: () => "reviewer-1",
    });

    expectRejected(withFirstFinding(unsafe));
  });

  it("rejects a throwing finding accessor without throwing", () => {
    const unsafe = finding(0);
    Object.defineProperty(unsafe, "verdict", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });

    expect(() => aggregateSemanticReviews(withFirstFinding(unsafe))).not.toThrow();
    expectRejected(withFirstFinding(unsafe));
  });

  it("rejects a value-changing finding accessor before TOCTOU", () => {
    const unsafe = finding(0);
    let reads = 0;
    Object.defineProperty(unsafe, "reviewerId", {
      enumerable: true,
      get() {
        reads += 1;
        return `reviewer-1-${reads}`;
      },
    });

    expectRejected(withFirstFinding(unsafe));
  });

  it("rejects an aggregate with a custom prototype", () => {
    const input = validInput();
    Object.setPrototypeOf(input, { inherited: true });

    expectRejected(input);
  });

  it("rejects a finding with a custom prototype", () => {
    const unsafe = finding(0);
    Object.setPrototypeOf(unsafe, { inherited: true });

    expectRejected(withFirstFinding(unsafe));
  });

  it("rejects supporting concepts with a custom array prototype", () => {
    const concepts = ["ACCESS_INDEPENDENCE"];
    Object.setPrototypeOf(concepts, Object.create(Array.prototype));

    expectRejected(withFirstFinding(finding(0, { supportingConcepts: concepts })));
  });

  it("rejects a supporting-concepts element accessor", () => {
    const concepts = ["ACCESS_INDEPENDENCE"];
    Object.defineProperty(concepts, "0", {
      enumerable: true,
      configurable: true,
      get: () => "ACCESS_INDEPENDENCE",
    });

    expectRejected(withFirstFinding(finding(0, { supportingConcepts: concepts })));
  });

  it("rejects a symbol property on supporting concepts", () => {
    const concepts = ["ACCESS_INDEPENDENCE"];
    Object.defineProperty(concepts, Symbol("extra"), { value: "unexpected" });

    expectRejected(withFirstFinding(finding(0, { supportingConcepts: concepts })));
  });

  it("rejects a custom string property on supporting concepts", () => {
    const concepts = ["ACCESS_INDEPENDENCE"] as string[] & { note?: string };
    concepts.note = "unexpected";

    expectRejected(withFirstFinding(finding(0, { supportingConcepts: concepts })));
  });

  it("rejects a sparse supporting-concepts array", () => {
    const concepts = new Array<string>(1);

    expectRejected(withFirstFinding(finding(0, { supportingConcepts: concepts })));
  });

  it("rejects a lying proxy even when its target is otherwise valid", () => {
    const lying = new Proxy(validInput(), {});

    expectRejected(lying);
  });

  it("fails malformed unknown input without throwing", () => {
    expect(() => aggregateSemanticReviews({ findings: [{}, {}, {}] })).not.toThrow();
    expectFailure({ findings: [{}, {}, {}] }, /invalid/i);
  });

  it("fails closed when hostile malformed input throws during inspection", () => {
    const hostile = new Proxy(
      {},
      {
        has() {
          throw new Error("hostile input");
        },
      },
    );

    expect(() => aggregateSemanticReviews(hostile)).not.toThrow();
    expectFailure(hostile, /invalid/i);
  });
});
