// Deterministic canned responder used when LLM_MODE=fake (Playwright journeys, local dev without a key).
// Scores derive from the learner text: control markers force a profile ([[weak]] reproduces the suspicious
// path, [[strong]] a creditable answer, [[wrong]] an incorrect one) and failure markers force each failure
// reason; without a marker, length and mechanism vocabulary drive the scores. Output is validated against the
// schema the caller passed, so every shape the live client can return is covered.
// The numbers below are fixture values for tests, not product tunables; the thresholds they must respect
// (correctThreshold, understandingBands, llmConfidenceWeak) are read from MASTERY_CONFIG so the fake stays in
// step with the engine. No 'server-only' here; relative `.ts` specifiers only.
import type { z } from 'zod';
import type { LlmClass } from '../assessments/types.ts';
import type { LlmNextAction } from '../learning-engine/types.ts';
import { MASTERY_CONFIG } from '../mastery-engine/config.ts';
import { extractKnownMisconceptions, extractLearnerAnswer, type KnownMisconception } from './prompts.ts';
import { BOSS_RUBRIC_KEYS, CAPSTONE_DIMENSIONS, type BossRubricKey, type CapstoneDimensionId } from './schemas.ts';
import type { EvaluateArgs, EvaluateFailureReason, EvaluateResult } from './types.ts';

export const FAKE_MODEL_ID = 'fake';

export const FAKE_MARKERS = {
  weak: '[[weak]]',
  strong: '[[strong]]',
  wrong: '[[wrong]]',
  fail: '[[fail]]',
  truncated: '[[truncated]]',
  refuse: '[[refuse]]',
  error: '[[error]]',
} as const;

const MISCONCEPTION_MARKER = /\[\[misconception:([^\]]+)\]\]/g;
const ANY_MARKER = /\[\[[^\]]*\]\]/g;

const FAILURE_MARKERS: ReadonlyArray<readonly [string, EvaluateFailureReason]> = [
  [FAKE_MARKERS.fail, 'parse_null'],
  [FAKE_MARKERS.truncated, 'truncated'],
  [FAKE_MARKERS.refuse, 'refusal'],
  [FAKE_MARKERS.error, 'error'],
];

interface EvaluationProfile {
  name: 'strong' | 'weak' | 'wrong' | 'derived';
  correctness: number;
  understanding: number;
  application: number;
  architecture: number;
  confidence: number;
  masteryDelta: number;
  nextAction: LlmNextAction;
}

/** Fixture profiles; fake.test.ts asserts them against MASTERY_CONFIG's thresholds. */
export const FAKE_PROFILES: Record<Exclude<EvaluationProfile['name'], 'derived'>, EvaluationProfile> = {
  strong: {
    name: 'strong',
    correctness: 92,
    understanding: 90,
    application: 86,
    architecture: 80,
    confidence: 92,
    masteryDelta: 8,
    nextAction: 'continue',
  },
  // Correct but unexplained: the false-understanding path (correct >= threshold, understanding < weak band).
  weak: {
    name: 'weak',
    correctness: 85,
    understanding: 25,
    application: 30,
    architecture: 20,
    confidence: 30,
    masteryDelta: 0,
    nextAction: 'probe',
  },
  wrong: {
    name: 'wrong',
    correctness: 20,
    understanding: 20,
    application: 15,
    architecture: 10,
    confidence: 20,
    masteryDelta: -5,
    nextAction: 'reinforce',
  },
};

/** Derivation used when no profile marker is present. */
export const FAKE_DERIVATION = {
  base: 30,
  perWord: 1,
  maxWords: 40,
  perKeyword: 5,
  maxKeywords: 4,
  cap: 95,
  correctnessBonus: 6,
  applicationOffset: -10,
  architectureOffset: -20,
  deltaStrong: 6,
  deltaAdequate: 2,
  deltaIncorrect: -3,
  keywords: [
    'because',
    'so that',
    'therefore',
    'which means',
    'when',
    'limit',
    'transaction',
    'order',
    'before',
    'after',
    'fails',
    'breaks',
    'instead',
    'trade-off',
    'tradeoff',
    'cost',
    'risk',
    'scale',
    'rollback',
    'commit',
    'context',
    'sharing',
    'permission',
  ],
} as const;

const BOSS_OFFSETS: Record<BossRubricKey, number> = {
  suspect: 4,
  why: 0,
  dataNeeded: -6,
  whatToInspect: -5,
  solution: -2,
  tradeOffs: -10,
};

const CAPSTONE_OFFSETS: Record<CapstoneDimensionId, number> = {
  platformKnowledge: 4,
  dataArchitecture: 0,
  security: -3,
  apex: -2,
  automation: -1,
  integration: -5,
  scalability: -6,
  performance: -4,
  reliability: -7,
  observability: -10,
  tradeOffReasoning: -8,
  communication: 2,
};

const SUMMARY_MAX = 160;
const MISCONCEPTIONS_MAX = 5; // smallest schema cap (EvaluationSchema)

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function roundedMean(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function deriveProfile(text: string): EvaluationProfile {
  const lower = text.toLowerCase();
  const d = FAKE_DERIVATION;
  const words = Math.min(countWords(text), d.maxWords);
  const hits = Math.min(d.keywords.filter((k) => lower.includes(k)).length, d.maxKeywords);
  const understanding = clamp(d.base + words * d.perWord + hits * d.perKeyword, 0, d.cap);
  const correctness = clamp(understanding + d.correctnessBonus);
  const { weak, strong } = MASTERY_CONFIG.understandingBands;
  const incorrect = correctness < MASTERY_CONFIG.correctThreshold;
  let masteryDelta: number;
  let nextAction: LlmNextAction;
  if (understanding >= strong) {
    masteryDelta = d.deltaStrong;
    nextAction = 'continue';
  } else if (understanding >= weak) {
    masteryDelta = d.deltaAdequate;
    nextAction = 'probe';
  } else {
    masteryDelta = incorrect ? d.deltaIncorrect : 0;
    nextAction = 'reinforce';
  }
  return {
    name: 'derived',
    correctness,
    understanding,
    application: clamp(understanding + d.applicationOffset),
    architecture: clamp(understanding + d.architectureOffset),
    confidence: understanding,
    masteryDelta,
    nextAction,
  };
}

function selectProfile(raw: string): EvaluationProfile {
  if (raw.includes(FAKE_MARKERS.strong)) return FAKE_PROFILES.strong;
  if (raw.includes(FAKE_MARKERS.weak)) return FAKE_PROFILES.weak;
  if (raw.includes(FAKE_MARKERS.wrong)) return FAKE_PROFILES.wrong;
  return deriveProfile(raw.replace(ANY_MARKER, ' '));
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

function misconceptionsFor(
  raw: string,
  profile: EvaluationProfile,
  known: KnownMisconception[],
): { id: string | null; summary: string }[] {
  const explicit = [...raw.matchAll(MISCONCEPTION_MARKER)].map((m) => m[1].trim()).filter(Boolean);
  if (explicit.length > 0) {
    return explicit.slice(0, MISCONCEPTIONS_MAX).map((id) => {
      const declared = known.find((k) => k.id === id);
      return declared
        ? { id: declared.id, summary: truncate(declared.summary || `Known misconception ${declared.id}`, SUMMARY_MAX) }
        : { id: null, summary: truncate(`Possible misconception: ${id}`, SUMMARY_MAX) };
    });
  }
  const flagged = profile.understanding < MASTERY_CONFIG.understandingBands.weak;
  if (flagged && known.length > 0) {
    const first = known[0];
    return [{ id: first.id, summary: truncate(first.summary || `Known misconception ${first.id}`, SUMMARY_MAX) }];
  }
  return [];
}

function feedbackFor(profile: EvaluationProfile): string {
  switch (profile.name) {
    case 'strong':
      return 'Fake grader: you named the mechanism and connected it to the outcome. Keep stating the boundary where it stops holding.';
    case 'weak':
      return 'Fake grader: the conclusion is right, but the explanation does not show why it is right. Say what the platform does, in what order, and what changes at the boundary.';
    case 'wrong':
      return 'Fake grader: the conclusion does not match how the platform behaves here. Revisit the mechanism before trying again.';
    default:
      return `Fake grader: derived from ${profile.understanding >= MASTERY_CONFIG.understandingBands.strong ? 'a mechanism-rich' : 'a thin'} answer. Explain the cause, the order of events, and the limit or boundary involved.`;
  }
}

function strengthsFor(level: number): string[] {
  if (level >= MASTERY_CONFIG.understandingBands.strong) {
    return ['Names a specific cause that fits the symptoms.', 'Ties the fix to the platform mechanism.', 'States what to verify afterwards.'];
  }
  if (level >= MASTERY_CONFIG.understandingBands.weak) return ['Identifies the right area of the platform.'];
  return [];
}

function gapsFor(level: number): string[] {
  if (level >= MASTERY_CONFIG.understandingBands.strong) return ['Alternatives are named but not costed.'];
  if (level >= MASTERY_CONFIG.understandingBands.weak) {
    return ['The causal chain has a missing link.', 'No evidence is named that would confirm the suspect.'];
  }
  return ['The suspect does not fit the symptoms.', 'No mechanism connects cause and effect.', 'The fix addresses a symptom, not the cause.'];
}

function evaluationCandidate(profile: EvaluationProfile, misconceptions: { id: string | null; summary: string }[]) {
  return {
    correctness: profile.correctness,
    understanding: profile.understanding,
    application: profile.application,
    architecture: profile.architecture,
    confidence: profile.confidence,
    masteryDelta: profile.masteryDelta,
    misconceptions,
    nextAction: profile.nextAction,
    feedback: feedbackFor(profile),
  };
}

function bossCandidate(profile: EvaluationProfile, misconceptions: { id: string | null; summary: string }[]) {
  const level = profile.understanding;
  const scores = Object.fromEntries(BOSS_RUBRIC_KEYS.map((k) => [k, clamp(level + BOSS_OFFSETS[k])])) as Record<
    BossRubricKey,
    number
  >;
  return {
    ...scores,
    overall: roundedMean(BOSS_RUBRIC_KEYS.map((k) => scores[k])),
    misconceptions,
    strengths: strengthsFor(level),
    gaps: gapsFor(level),
    feedback: feedbackFor(profile),
  };
}

function capstoneCandidate(profile: EvaluationProfile, misconceptions: { id: string | null; summary: string }[]) {
  const level = profile.understanding;
  const scores = Object.fromEntries(
    CAPSTONE_DIMENSIONS.map((d) => [d, clamp(level + CAPSTONE_OFFSETS[d])]),
  ) as Record<CapstoneDimensionId, number>;
  return {
    scores,
    overall: roundedMean(CAPSTONE_DIMENSIONS.map((d) => scores[d])),
    misconceptions,
    strengths: strengthsFor(level),
    gaps: gapsFor(level),
    feedback: feedbackFor(profile),
  };
}

function candidatesFor(cls: LlmClass, profile: EvaluationProfile, misconceptions: { id: string | null; summary: string }[]) {
  const evaluation = () => evaluationCandidate(profile, misconceptions);
  const boss = () => bossCandidate(profile, misconceptions);
  const capstone = () => capstoneCandidate(profile, misconceptions);
  switch (cls) {
    case 'boss':
      return [boss, evaluation, capstone];
    case 'capstone':
      return [capstone, boss, evaluation];
    default:
      return [evaluation, boss, capstone];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FakeEvaluateArgs<TSchema extends z.ZodType> extends EvaluateArgs<TSchema> {
  /** FAKE_LLM_LATENCY_MS: simulated grading time so pending states are observable in the UI. */
  latencyMs?: number;
}

export async function fakeEvaluate<TSchema extends z.ZodType>(
  args: FakeEvaluateArgs<TSchema>,
): Promise<EvaluateResult<z.infer<TSchema>>> {
  if (args.latencyMs && args.latencyMs > 0) await sleep(args.latencyMs);

  const raw = extractLearnerAnswer(args.messages);
  for (const [marker, reason] of FAILURE_MARKERS) {
    if (raw.includes(marker)) return { ok: false, reason, detail: `fake responder: forced by ${marker}` };
  }

  const profile = selectProfile(raw);
  const misconceptions = misconceptionsFor(raw, profile, extractKnownMisconceptions(args.messages));
  for (const candidate of candidatesFor(args.class, profile, misconceptions)) {
    const parsed = args.schema.safeParse(candidate());
    if (parsed.success) return { ok: true, output: parsed.data, model: FAKE_MODEL_ID, usage: null };
  }
  return { ok: false, reason: 'parse_null', detail: 'fake responder: no canned shape satisfies the requested schema' };
}
