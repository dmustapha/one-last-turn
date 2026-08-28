import { describe, expect, it } from "vitest";

import {
  verifyCrossProcessRecall,
  verifyPolicyAcceptance,
  verifySeedParticipation,
  verifySemanticRecall,
} from "@/proof/minds-evidence";

const naturalSeedReply = [
  "A returning member should keep the same access whether or not they choose optional contact.",
  "Before they submit anything, explain that memory persists and that deletion cannot guarantee complete erasure, so their choice is informed.",
].join(" ");

const naturalRecallReply = [
  "Keep the member's role unchanged regardless of whether they participate, because access must not depend on optional contact.",
  "First disclose that memory is retained and that deletion has limits; do this before processing their submission so consent is informed.",
].join(" ");

const crossSentenceParaphrase = [
  "Complete eligibility first; outreach should be a separate opt-in step, not a condition of general access.",
  "Tell people up front that conversations are saved across sessions and wiping them later may not remove every trace.",
].join(" ");

const crossTopicVocabulary =
  "Membership access is shown in the header. Outreach launches on Tuesday. Complete eligibility first, then publish the changelog. We save conversations for QA. Wipe the whiteboard after meetings because it may not remove every trace. Tell users up front before they continue.";

describe("seed participation evidence", () => {
  it("accepts a natural explanation of the critical disclosure and access independence", () => {
    expect(verifySeedParticipation(naturalSeedReply)).toEqual([
      "ACCESS_INDEPENDENCE",
      "PERSISTENCE_DISCLOSURE",
    ]);
  });

  it("accepts private closure alongside the critical disclosure without a fixed token", () => {
    expect(
      verifySeedParticipation(
        "When the member returns, show only a generic unavailable status and keep their private choice and reason hidden, so a decline is not exposed. Before consent or processing, disclose that the service retains persistent memory and that later deletion has erasure limits.",
      ),
    ).toEqual(["PRIVATE_CLOSURE", "PERSISTENCE_DISCLOSURE"]);
  });

  it("accepts natural paraphrases rather than requiring canonical vocabulary", () => {
    expect(
      verifySeedParticipation(
        "Membership is separate from the choice to opt in, because optional participation cannot affect general access. Data will be kept between sessions, and erasure may leave remnants; explain those limits prior to consent.",
      ),
    ).toEqual(["ACCESS_INDEPENDENCE", "PERSISTENCE_DISCLOSURE"]);
  });

  it("does not confuse a deletion-limit caveat with refusal", () => {
    expect(
      verifySeedParticipation(
        "General access stays the same whether they opt in or not. Before they submit, explain that memory is retained and I can't guarantee complete erasure, so they can decide knowingly.",
      ),
    ).toContain("PERSISTENCE_DISCLOSURE");
  });

  it("accepts concepts expressed across bounded adjacent clauses", () => {
    expect(verifySeedParticipation(crossSentenceParaphrase)).toEqual([
      "ACCESS_INDEPENDENCE",
      "PERSISTENCE_DISCLOSURE",
    ]);
  });

  it.each([
    "I cannot help with that request.",
    "I'll pass.",
    "I'm not comfortable participating.",
  ])("rejects a common refusal followed by valid concepts: %s", (refusal) => {
    expect(() =>
      verifySeedParticipation(`${refusal} ${naturalSeedReply}`),
    ).toThrow(/declined|refused/i);
  });

  it.each([
    "I don’t feel comfortable with this.",
    "I’d rather not participate.",
    "I cannot take part in this.",
    "No thanks, I won’t be participating.",
  ])("rejects an indirect refusal followed by valid concepts: %s", (refusal) => {
    expect(() =>
      verifySeedParticipation(`${refusal} ${naturalSeedReply}`),
    ).toThrow(/declined|refused/i);
  });

  it("rejects connective glue without a substantive rationale", () => {
    expect(() =>
      verifySeedParticipation(
        "Access does not depend on optional contact; disclose persistent memory and deletion limits before consent, because privacy.",
      ),
    ).toThrow(/rationale/i);
  });

  it("rejects unrelated concepts that merely occur in nearby clauses", () => {
    expect(() => verifySeedParticipation(crossTopicVocabulary)).toThrow();
  });

  it.each([
    "I decline this task. Before submission, mention persistent memory and deletion limits; access does not depend on contact.",
    "Persistent memory. Retention. Deletion limits. Erasure. Before submission. Access. Optional contact.",
    "Before submission, explain that persistent memory is retained and deletion cannot fully erase it.",
    "Access remains independent of optional participation because contact is optional.",
  ])("rejects insufficient seed evidence: %s", (replyText) => {
    expect(() => verifySeedParticipation(replyText)).toThrow();
  });
});

describe("process-B semantic recall evidence", () => {
  it("accepts natural omitted-fact recall that was not supplied by process B", () => {
    const result = verifySemanticRecall({
      processBText: "Review the proposed return screen and identify any changes needed before release.",
      replyText: naturalRecallReply,
    });

    expect(result.recalledConcepts).toEqual([
      "ACCESS_INDEPENDENCE",
      "PERSISTENCE_DISCLOSURE",
    ]);
    expect(result.echoRatio).toBeLessThan(0.55);
  });

  it("accepts bounded cross-sentence omitted-fact recall", () => {
    expect(
      verifySemanticRecall({
        processBText: "Review the return experience for clarity.",
        replyText: crossSentenceParaphrase,
      }).recalledConcepts,
    ).toEqual(["ACCESS_INDEPENDENCE", "PERSISTENCE_DISCLOSURE"]);
  });

  it("rejects cross-topic coincidental vocabulary as recall", () => {
    expect(() =>
      verifySemanticRecall({
        processBText: "Review the return experience for clarity.",
        replyText: crossTopicVocabulary,
      }),
    ).toThrow();
  });

  it("does not treat cross-topic process-B vocabulary as concept leakage", () => {
    expect(
      verifySemanticRecall({
        processBText: crossTopicVocabulary,
        replyText: naturalRecallReply,
      }).recalledConcepts,
    ).toEqual(["ACCESS_INDEPENDENCE", "PERSISTENCE_DISCLOSURE"]);
  });

  it.each([
    {
      name: "a declined request",
      processBText: "Review the proposed return screen.",
      replyText:
        "I refuse to continue. Access should not depend on contact, and before submission disclose persistent memory and deletion limits.",
      error: /declined|refused/i,
    },
    {
      name: "process-B constraint leakage",
      processBText:
        "Ensure access stays the same whether or not contact is accepted, then review the return screen.",
      replyText: naturalRecallReply,
      error: /process-b.*restated/i,
    },
    {
      name: "cross-sentence process-B access leakage",
      processBText:
        "Eligibility comes first. Outreach is a separate opt-in step.",
      replyText: naturalRecallReply,
      error: /process-b.*restated/i,
    },
    {
      name: "cross-sentence process-B persistence leakage",
      processBText:
        "We save conversations across sessions. Wiping them later may not remove every trace. Tell users up front before they continue.",
      replyText: naturalRecallReply,
      error: /process-b.*restated/i,
    },
    {
      name: "paraphrased process-B persistence leakage",
      processBText:
        "Memory stays between sessions, deletion may leave remnants. Explain why those facts matter prior to consent. Review the return screen.",
      replyText: naturalRecallReply,
      error: /process-b.*restated/i,
    },
    {
      name: "a raw keyword list",
      processBText: "Review the proposed return screen.",
      replyText:
        "Access, role, optional contact, participation; persistent memory, retention, deletion, erasure limits, before consent and submission.",
      error: /semantic|rationale/i,
    },
    {
      name: "only one approved concept",
      processBText: "Review the proposed return screen.",
      replyText:
        "Before processing their submission, explain that memory persists and deletion cannot guarantee complete erasure, so consent is informed.",
      error: /critical.*plus/i,
    },
    {
      name: "generic agreement",
      processBText: "Review the proposed return screen.",
      replyText: "Yes, I agree. That makes sense and sounds good to me.",
      error: /generic agreement/i,
    },
    {
      name: "a mostly echoed reply",
      processBText:
        "Review this proposed return screen and identify the exact changes needed before release for the returning member experience. Carefully evaluate wording, hierarchy, tone, clarity, safety, and visual sequence. Check navigation structure, emotional pacing, interaction labels, transition clarity, and release readiness.",
      replyText:
        "Review this proposed return screen and identify the exact changes needed before release for the returning member experience. Carefully evaluate wording, hierarchy, tone, clarity, safety, and visual sequence. Check navigation structure, emotional pacing, interaction labels, transition clarity, and release readiness. Access must remain independent of optional contact because eligibility should stay separate. Before processing, disclose persistent memory and deletion limits so consent is informed.",
      error: /echo/i,
    },
  ])("rejects $name", ({ processBText, replyText, error }) => {
    expect(() => verifySemanticRecall({ processBText, replyText })).toThrow(error);
  });
});

describe("deprecated proof-script adapters", () => {
  it("does not require a fixed POLICY_ACCEPTED marker", () => {
    expect(verifyPolicyAcceptance(naturalSeedReply)).toContain(
      "PERSISTENCE_DISCLOSURE",
    );
  });

  it("retains process and history-boundary checks before strict semantic recall", () => {
    expect(() =>
      verifyCrossProcessRecall({
        seedProcessId: 101,
        resumeProcessId: 101,
        alias: "proof-alias",
        resumeText: "Review the proposed return screen.",
        replyText: naturalRecallReply,
        seedFingerprint: "same",
        resumeFingerprint: "same",
        historyMessageCount: 4,
      }),
    ).toThrow(/distinct processes/i);

    expect(() =>
      verifyCrossProcessRecall({
        seedProcessId: 101,
        resumeProcessId: 202,
        alias: "proof-alias",
        resumeText: "Review the proposed return screen.",
        replyText: naturalRecallReply,
        seedFingerprint: "seed",
        resumeFingerprint: "resume",
        historyMessageCount: 3,
      }),
    ).toThrow(/history boundary/i);
  });
});
