// False-understanding detection (ARCHITECTURE.md Learning Engine section 4): probe trigger, angle catalog,
// transfer chain and angle selection. Pure; `now` is passed in.
import { DIMENSIONS } from '../mastery-engine/types.ts';
import type { Band, ChainRung, ConfidenceVerdict, Depth, Dimension, DimensionState, Evidence, MasteryState } from '../mastery-engine/types.ts';
import { PROBE_CONFIG } from './config.ts';
import type { ProbeConfig } from './config.ts';
import { PROBE_ANGLES } from './types.ts';
import type { ProbeAngle, QuestionType } from './types.ts';
import { clamp, toDepth, toMs } from './util.ts';
import type { Instant } from './util.ts';

export type ChainVariant = 'single_record' | 'async';
export type PassableRung = Exclude<ChainRung, 0>;

export interface ProbeCatalogEntry {
  readonly angle: ProbeAngle;
  readonly questionType: QuestionType;
  /** Second question type the angle may be authored as (what_breaks: scenario_diagnosis). */
  readonly altQuestionType: QuestionType | null;
  readonly dimension: Dimension;
  readonly depthMin: Depth;
  readonly depthMax: Depth;
  /** Transfer-chain rungs this angle can pass (what_if carries two: single record, async). */
  readonly rungs: readonly PassableRung[];
  /** Scored without an LLM call (the only angle usable without quota). */
  readonly deterministic: boolean;
}

/** Angle -> question type / dimension evidenced / depth / chain rung, exactly the section 4 table. */
export const PROBE_CATALOG: Readonly<Record<ProbeAngle, ProbeCatalogEntry>> = {
  why: { angle: 'why', questionType: 'explain_why', altQuestionType: null, dimension: 'understanding', depthMin: 2, depthMax: 2, rungs: [1], deterministic: false },
  what_if: { angle: 'what_if', questionType: 'explain_why', altQuestionType: null, dimension: 'application', depthMin: 3, depthMax: 4, rungs: [2, 3], deterministic: false },
  what_breaks: {
    angle: 'what_breaks',
    questionType: 'explain_why',
    altQuestionType: 'scenario_diagnosis',
    dimension: 'debugging',
    depthMin: 5,
    depthMax: 5,
    rungs: [],
    deterministic: false,
  },
  what_would_you_change: {
    angle: 'what_would_you_change',
    questionType: 'fix_design',
    altQuestionType: null,
    dimension: 'architecture',
    depthMin: 6,
    depthMax: 7,
    rungs: [4],
    deterministic: false,
  },
  explain_without_jargon: {
    angle: 'explain_without_jargon',
    questionType: 'teach_back',
    altQuestionType: null,
    dimension: 'understanding',
    depthMin: 2,
    depthMax: 2,
    rungs: [],
    deterministic: false,
  },
  explain_to_junior: {
    angle: 'explain_to_junior',
    questionType: 'teach_back',
    altQuestionType: null,
    dimension: 'teach_back',
    depthMin: 2,
    depthMax: 5,
    rungs: [5],
    deterministic: false,
  },
  predict: { angle: 'predict', questionType: 'predict_outcome', altQuestionType: null, dimension: 'application', depthMin: 3, depthMax: 3, rungs: [], deterministic: true },
};

export interface ChainRungSpec {
  readonly rung: PassableRung;
  readonly angle: ProbeAngle;
  readonly variant: ChainVariant | null;
}

/** Anti-cramming transfer chain: a scheduling order (next probe = lowest unpassed rung), never a lock. */
export const CHAIN_RUNGS: readonly ChainRungSpec[] = [
  { rung: 1, angle: 'why', variant: null },
  { rung: 2, angle: 'what_if', variant: 'single_record' },
  { rung: 3, angle: 'what_if', variant: 'async' },
  { rung: 4, angle: 'what_would_you_change', variant: null },
  { rung: 5, angle: 'explain_to_junior', variant: null },
];

export function nextUnpassedRung(chainRung: ChainRung, config: ProbeConfig = PROBE_CONFIG): ChainRungSpec | null {
  if (chainRung >= config.chainRungMax) return null;
  return CHAIN_RUNGS.find((spec) => spec.rung > chainRung) ?? null;
}

/** Highest depth a probe may use for a band: bandDepthFloor + probeDepthAboveFloor, on the depth scale. */
export function probeDepthCap(band: Band, config: ProbeConfig = PROBE_CONFIG): Depth {
  return toDepth(config.bandDepthFloor[band] + config.probeDepthAboveFloor);
}

export interface ProbeCounts {
  /** Probes already asked on this concept today (learner-local day). */
  probesToday: number;
  /** Probes already asked in this session, any concept. */
  probesThisSession: number;
}

export function probesRemaining(counts: ProbeCounts, config: ProbeConfig = PROBE_CONFIG): boolean {
  return counts.probesToday < config.maxProbesPerConceptPerDay && counts.probesThisSession < config.maxProbesPerSession;
}

export interface ProbeSession extends ProbeCounts {
  now: Instant;
  /** Latest verdict stored on the concept before this answer; `suspicious` forces the probe. */
  previousVerdict: ConfidenceVerdict | null;
}

export function totalEvidence(dims: Readonly<Record<Dimension, DimensionState>>): number {
  return DIMENSIONS.reduce((sum, d) => sum + dims[d].evidenceCount, 0);
}

/** Understanding evidence scored >= understandingFreshScore inside the last understandingFreshDays. */
export function hasFreshUnderstanding(state: Pick<MasteryState, 'dims'>, now: Instant, config: ProbeConfig = PROBE_CONFIG): boolean {
  const understanding = state.dims.understanding;
  if (understanding.evidenceCount < 1 || understanding.lastEvidenceAt === null) return false;
  if (understanding.score < config.understandingFreshScore) return false;
  const ageMs = toMs(now) - toMs(understanding.lastEvidenceAt);
  return ageMs < config.understandingFreshDays * 86_400_000;
}

/**
 * Probe trigger after a correct answer. `state` is the concept's mastery as it stands when the answer arrives.
 * (a) depth >= bandDepthFloor[band]; (b) no fresh strong Understanding evidence; (c) per-concept and per-session caps.
 * (a) is bypassed when the previous verdict was `suspicious` or the answer was fast and confident early in the concept.
 */
export function shouldProbe(state: MasteryState, evidence: Evidence, session: ProbeSession, config: ProbeConfig = PROBE_CONFIG): boolean {
  if (!probesRemaining(session, config)) return false;
  if (!evidence.correct) return false;

  const fastConfident =
    evidence.selfConfidence !== null &&
    evidence.selfConfidence >= config.fastAnswerSelfConfidenceMin &&
    evidence.durationMs < config.fastAnswerMs &&
    totalEvidence(state.dims) < config.fastAnswerEvidenceMax;
  const forced = session.previousVerdict === 'suspicious' || fastConfident;

  if (!forced && evidence.scorer !== 'deterministic') return false;
  if (hasFreshUnderstanding(state, session.now, config)) return false;
  if (forced) return true;
  return evidence.depth >= config.bandDepthFloor[state.band];
}

/** Lowest-scoring dimension with primary evidence; Understanding when nothing is evidenced. Ties: DIMENSIONS order. */
export function weakestEvidencedDimension(dims: Readonly<Record<Dimension, DimensionState>>): Dimension {
  let weakest: Dimension | null = null;
  for (const d of DIMENSIONS) {
    if (dims[d].evidenceCount < 1) continue;
    if (weakest === null || dims[d].score < dims[weakest].score) weakest = d;
  }
  return weakest ?? 'understanding';
}

export interface ProbeConceptTemplates {
  /** `defineConcept({ probes })`: question templates per angle; angles without one are skipped. */
  probes: Partial<Record<ProbeAngle, readonly string[]>>;
}

export function hasProbeTemplate(concept: ProbeConceptTemplates, angle: ProbeAngle): boolean {
  const templates = concept.probes[angle];
  return templates !== undefined && templates.length > 0;
}

export interface ProbeSelection {
  angle: ProbeAngle;
  questionType: QuestionType;
  dimension: Dimension;
  depth: Depth;
  /** The chain rung this probe attempts, or null when the angle's rungs are already passed or it has none. */
  rung: PassableRung | null;
  variant: ChainVariant | null;
}

/**
 * Candidates = catalog minus the last probeAngleRepeatWindow angles minus angles without a template, whose minimum
 * depth fits under bandDepthFloor + probeDepthAboveFloor; without LLM quota only `predict`. Prefer the learner's weakest
 * evidenced dimension (Understanding if none); the next unpassed chain rung wins ties, then catalog order.
 */
export function selectProbeAngle(
  state: Pick<MasteryState, 'band' | 'dims' | 'chainRung' | 'recentProbeAngles'>,
  concept: ProbeConceptTemplates,
  quota: boolean,
  config: ProbeConfig = PROBE_CONFIG,
): ProbeSelection | null {
  const floor = config.bandDepthFloor[state.band];
  const maxDepth = probeDepthCap(state.band, config);
  const recent = new Set(state.recentProbeAngles.slice(-config.probeAngleRepeatWindow));

  let candidates = PROBE_ANGLES.filter((angle) => {
    const entry = PROBE_CATALOG[angle];
    return !recent.has(angle) && hasProbeTemplate(concept, angle) && entry.depthMin <= maxDepth;
  });
  if (!quota) candidates = candidates.filter((angle) => PROBE_CATALOG[angle].deterministic);
  if (candidates.length === 0) return null;

  const weakest = weakestEvidencedDimension(state.dims);
  const preferred = candidates.filter((angle) => PROBE_CATALOG[angle].dimension === weakest);
  const pool = preferred.length > 0 ? preferred : candidates;

  const nextRung = nextUnpassedRung(state.chainRung, config);
  const angle = nextRung !== null && pool.includes(nextRung.angle) ? nextRung.angle : pool[0];
  const entry = PROBE_CATALOG[angle];

  const rung = entry.rungs.find((r) => r > state.chainRung) ?? null;
  const variant = rung === null ? null : (CHAIN_RUNGS.find((spec) => spec.rung === rung)?.variant ?? null);
  const depth = toDepth(clamp(floor, entry.depthMin, Math.min(entry.depthMax, maxDepth)));

  return { angle, questionType: entry.questionType, dimension: entry.dimension, depth, rung, variant };
}
