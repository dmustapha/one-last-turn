type RecallInput = {
  seedProcessId: number;
  resumeProcessId: number;
  alias: string;
  resumeText: string;
  replyText: string;
  seedFingerprint: string;
  resumeFingerprint: string;
  historyMessageCount: number;
};

type SemanticRecallInput = {
  processBText: string;
  replyText: string;
};

type ConceptName =
  | "ACCESS_INDEPENDENCE"
  | "PRIVATE_CLOSURE"
  | "PERSISTENCE_DISCLOSURE";

const refusalPattern =
  /^\s*(?:decline|refuse)(?:[.!:]|$)|\b(?:i|we)\s+(?:decline|refuse)\s+(?:this|the|to\b)|\b(?:i|we)\s+(?:will not|won't|cannot|can't)\s+(?:help|assist|continue|participate|comply|accept|agree|do|take\s+part)\b|\bi(?:['’]ll|\s+will)\s+pass\b|\bi(?:['’]d|\s+would)\s+rather\s+not\b|\b(?:i|we)(?:['’]m|\s+am|['’]re|\s+are)\s+not\s+(?:comfortable|willing|able)\b|\b(?:i|we)\s+do(?:n't|n’t|\s+not)\s+feel\s+comfortable\b|\bno\s+thanks\b|\b(?:i|we)\s+won't\s+be\s+participat\w*\b|\b(?:i|we)\s+do not agree\b/i;
const genericAgreementPattern =
  /\b(?:i agree|makes sense|sounds good|understood|okay|ok)\b/i;

const stopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "before",
  "being",
  "could",
  "their",
  "there",
  "these",
  "thing",
  "those",
  "would",
]);

function clauses(text: string): string[] {
  return text
    .split(/[.!?;]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function hasSingleClauseAccess(clause: string): boolean {
  const access = /\b(?:access|role|membership|eligibility)\b/i.test(clause);
  const participation =
    /\b(?:contact|outreach|participat\w*|opt(?:ing)?[- ]?in|engag\w*|choice)\b/i.test(clause);
  const independence =
    /\b(?:independent(?:ly)?\s+(?:of|from)|separate\s+from|separate(?:\s+\w+){0,3}\s+opt[- ]?in|regardless\s+of|irrespective\s+of|whether\s+or\s+not|(?:does|do|must|should|will)\s+not\s+depend|(?:is|are|was|were)n['’]?t\s+conditioned|not\s+conditioned|no\s+bearing\s+on|without\s+(?:affect\w*|chang\w*)|remain\w*\s+(?:the\s+)?same|stay\w*\s+(?:the\s+)?same|unchanged|(?:eligibility\s+)?comes?\s+first|complete\s+eligibility\s+first)\b/i.test(
      clause,
    );
  return access && participation && independence;
}

function hasAccessOrdering(clause: string): boolean {
  const access = /\b(?:access|role|membership|eligibility)\b/i.test(clause);
  const ordering =
    /\b(?:complete\b.{0,30}\beligibility\b.{0,20}\bfirst|eligibility\b.{0,20}\bcomes?\s+first|(?:access|role|membership|eligibility)\b.{0,40}\bindependent\w*)\b/i.test(
      clause,
    );
  return access && ordering;
}

function hasSeparateParticipation(clause: string): boolean {
  const participation = /\b(?:contact|outreach|participat\w*|opt[- ]?in)\b/i.test(clause);
  const separation =
    /\b(?:separate(?:\s+\w+){0,3}\s+opt[- ]?in|independent(?:ly)?\s+(?:of|from)|separate\s+from)\b/i.test(
      clause,
    );
  return participation && separation;
}

function hasAccessConcept(parts: string[]): boolean {
  if (parts.some(hasSingleClauseAccess)) return true;
  return parts.some((part, index) => {
    const next = parts[index + 1];
    if (!next) return false;
    return (
      (hasAccessOrdering(part) && hasSeparateParticipation(next)) ||
      (hasSeparateParticipation(part) && hasAccessOrdering(next))
    );
  });
}

function hasPrivateClosure(clause: string): boolean {
  const returning =
    /\breturn(?:ing|s|ed)?\s+(?:member|participant|user|person)\b|\bwhen\b.{0,35}\breturns?\b/i.test(
      clause,
    );
  const genericStatus =
    /\bgeneric\b.{0,35}\b(?:unavailable|not available)\b|\b(?:unavailable|not available)\b.{0,35}\bgeneric\b/i.test(
      clause,
    );
  const sensitiveChoice = /\b(?:declin\w*|choice|reason)\b/i.test(clause);
  const concealed =
    /\b(?:private|hidden|conceal\w*|confidential|not\s+(?:be\s+)?reveal\w*|not\s+(?:be\s+)?expos\w*)\b/i.test(
      clause,
    );
  return returning && genericStatus && sensitiveChoice && concealed;
}

const persistedEntities = ["conversation", "memory", "data", "information", "record", "history"];

function persistenceEntities(clause: string): string[] {
  const persistence =
    /\b(?:persistent\s+\w+|(?:sav\w*|stor\w*|retain\w*)\s+(?:\w+\s+){0,2}\w+|\w+\s+(?:\w+\s+){0,3}(?:persist\w*|sav\w*|stor\w*|retain\w*|kept|remain\w*|stay\w*))\b/i.test(
      clause,
    );
  if (!persistence) return [];
  return persistedEntities.filter((entity) => new RegExp(`\\b${entity}\\w*\\b`, "i").test(clause));
}

function hasDeletionLimit(clause: string): boolean {
  return (
    /\b(?:delet\w*|eras\w*|remov\w*|wip\w*)\b.{0,100}\b(?:limit\w*|cannot|can't|may\s+not|not|incomplete|partial|guarantee|fully|complete|leave\w*|remnant\w*|residual\w*|trace\w*)\b/i.test(
      clause,
    ) ||
    /\b(?:limit\w*|cannot|can't|not|incomplete|partial|guarantee|fully|complete)\b.{0,80}\b(?:delet\w*|eras\w*|remov\w*)\b/i.test(
      clause,
    )
  );
}

function explicitDeletionTarget(clause: string): string | undefined {
  const match = clause.match(
    /\b(?:delet\w*|eras\w*|remov\w*|wip\w*)\s+(?:up\s+)?(?:(?:the|a|an)\s+)?([a-z]+)\b/i,
  );
  const ignored = /^(?:may|might|can|cannot|will|would|is|are|has|have|limit\w*)$/i;
  return match?.[1] && !ignored.test(match[1]) ? match[1].toLowerCase() : undefined;
}

function deletionRefersTo(clause: string, entities: string[], allowImplicit: boolean): boolean {
  const target = explicitDeletionTarget(clause);
  const targetMatches = target && entities.some((entity) => target.startsWith(entity));
  const anaphor = /\b(?:it|them|that\s+(?:data|information|memory)|those\s+(?:records|conversations))\b/i.test(
    clause,
  );
  if (target && !targetMatches && !/^(?:it|them|that|those)$/.test(target)) return false;
  const repeatsEntity = entities.some((entity) => new RegExp(`\\b${entity}\\w*\\b`, "i").test(clause));
  return Boolean(targetMatches || repeatsEntity || anaphor || allowImplicit);
}

function hasDisclosureTiming(clause: string): boolean {
  const boundary =
    /\b(?:up[ -]?front|before\b.{0,80}\b(?:submit\w*|submission|process\w*|processing|consent|continue|send\w*|shar\w*)|prior to\b.{0,80}\b(?:submit\w*|submission|process\w*|processing|consent|continu\w*|send\w*|shar\w*))\b/i.test(
      clause,
    );
  const disclosure =
    /\b(?:disclos\w*|explain\w*|tell\w*|inform\w*|warn\w*|do\s+this|make\s+(?:it\s+)?clear)\b/i.test(
      clause,
    );
  return boundary && disclosure;
}

function hasNearbyTiming(parts: string[], start: number, end: number): boolean {
  const first = Math.max(0, start - 1);
  const last = Math.min(parts.length - 1, end + 1);
  return parts.slice(first, last + 1).some(hasDisclosureTiming);
}

function hasPersistenceConcept(parts: string[]): boolean {
  return parts.some((part, index) => {
    const entities = persistenceEntities(part);
    if (entities.length === 0) return false;
    if (hasDeletionLimit(part) && deletionRefersTo(part, entities, true)) {
      return hasNearbyTiming(parts, index, index);
    }
    const deletion = parts[index + 1];
    if (!deletion || !hasDeletionLimit(deletion)) return false;
    if (!deletionRefersTo(deletion, entities, false)) return false;
    return hasNearbyTiming(parts, index, index + 1);
  });
}

function matchedConcepts(text: string): ConceptName[] {
  const parts = clauses(text);
  const matched: ConceptName[] = [];
  if (hasAccessConcept(parts)) matched.push("ACCESS_INDEPENDENCE");
  if (parts.some(hasPrivateClosure)) matched.push("PRIVATE_CLOSURE");
  if (hasPersistenceConcept(parts)) matched.push("PERSISTENCE_DISCLOSURE");
  return matched;
}

function isProposition(clause: string): boolean {
  const verb =
    /\b(?:is|are|was|were|be|become|remain|stay|keep|depend|affect|condition|choose|participate|contact|submit|process|consent|disclose|explain|tell|inform|warn|save|store|retain|persist|delete|erase|wipe|remove|show|hide|reveal|protect|ensure|avoid|prevent|complete|come)\w*\b/i;
  return meaningfulTokens(clause).length >= 4 && verb.test(clause);
}

function hasSubstantiveRationale(text: string): boolean {
  const causalOutcome =
    /\b(?:because|so(?:\s+that)?|therefore)\s+(?:[a-z'’-]+\s+){0,5}(?:is|isn['’]?t|are|aren['’]?t|can|cannot|can't|must|should|will|does|do|remain\w*|stay\w*|depend\w*|affect\w*|protect\w*|preserv\w*|avoid\w*|prevent\w*)\b/i;
  const purposeOutcome =
    /\b(?:in order to|to)\s+(?:ensure|protect|avoid|prevent|preserve|allow|help)\b.{3,80}\b\w+\b/i;
  const sequencedAction =
    /\b(?:before|after)\s+(?:they|people|users?|members?)\s+\w+\b|\bfirst\b.{3,80}\bthen\b|\b(?:complete|establish|confirm|determine)\b.{0,60}\bfirst\b.{0,120}\b(?:then|next|should|must|will)\b|\b(?:tell|inform|warn|explain)\b.{0,30}\bup[ -]?front\b.{0,100}\b(?:is|are|will|may|can)\b/i;
  return causalOutcome.test(text) || purposeOutcome.test(text) || sequencedAction.test(text);
}

function assertParticipation(replyText: string, concepts: ConceptName[]): void {
  if (refusalPattern.test(replyText)) throw new Error("Mind declined or refused participation");
  const hasCritical = concepts.includes("PERSISTENCE_DISCLOSURE");
  const hasSupporting = concepts.some((concept) => concept !== "PERSISTENCE_DISCLOSURE");
  if (!hasCritical || !hasSupporting) {
    throw new Error("Semantic evidence requires the critical disclosure plus access independence or private closure");
  }
  if (clauses(replyText).filter(isProposition).length < 2 || !hasSubstantiveRationale(replyText)) {
    throw new Error("Semantic evidence requires natural rationale or sequencing language");
  }
}

function meaningfulTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length >= 4 && !stopWords.has(token),
  );
}

function echoRatio(processBText: string, replyText: string): number {
  const promptTokens = new Set(meaningfulTokens(processBText));
  const replyTokens = meaningfulTokens(replyText);
  if (replyTokens.length === 0) return 1;
  return replyTokens.filter((token) => promptTokens.has(token)).length / replyTokens.length;
}

export function verifySeedParticipation(replyText: string): ConceptName[] {
  const concepts = matchedConcepts(replyText);
  assertParticipation(replyText, concepts);
  return concepts;
}

export function verifySemanticRecall(input: SemanticRecallInput) {
  if (refusalPattern.test(input.replyText)) throw new Error("Mind declined or refused participation");
  const leakedConcepts = matchedConcepts(input.processBText);
  if (leakedConcepts.length > 0) throw new Error("Process-B text restated an approved concept");
  const concepts = matchedConcepts(input.replyText);
  if (concepts.length === 0 && genericAgreementPattern.test(input.replyText)) {
    throw new Error("Generic agreement is not semantic recall");
  }
  assertParticipation(input.replyText, concepts);
  const ratio = echoRatio(input.processBText, input.replyText);
  if (ratio >= 0.55) throw new Error("Reply exceeded the meaningful-token echo limit");
  return { status: "pass" as const, recalledConcepts: concepts, echoRatio: ratio };
}

function assertDistinctProcess(input: RecallInput): void {
  if (input.seedProcessId === input.resumeProcessId) {
    throw new Error("Proof requires distinct processes");
  }
  if (input.seedFingerprint === input.resumeFingerprint) {
    throw new Error("Proof requires distinct history fingerprints");
  }
}

export function verifyCrossProcessRecall(input: RecallInput) {
  assertDistinctProcess(input);
  if (input.historyMessageCount < 4) throw new Error("Proof requires a complete history boundary");
  const result = verifySemanticRecall({
    processBText: input.resumeText,
    replyText: input.replyText,
  });
  return { ...result, alias: input.alias };
}

/** @deprecated Use verifySeedParticipation. */
export function verifyPolicyAcceptance(replyText: string): ConceptName[] {
  return verifySeedParticipation(replyText);
}
