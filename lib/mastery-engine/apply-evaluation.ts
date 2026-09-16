// LLM evaluations (explain_why, teach_back, scenarios, converted boss / capstone rubrics) applied to mastery.
// Implements LLM §A rules 2-9: the evaluation is evidence, never authority.
import { LLM_NEXT_ACTIONS, type LlmNextAction, type NextAction, type QuestionType } from '../learning-engine/types.ts';
import {
  activeFormKeys,
  addUpdate,
  nextRecallCounter,
  notePassedForm,
  noteProbeAngle,
  passChainRung,
  recordPrimaryEvidence,
  sumDeltas,
} from './bookkeeping.ts';
import { bandAtLeast, recompute } from './caps.ts';
import { confidenceVerdict, type ConfidenceSources } from './confidence.ts';
import type { MasteryConfig } from './config.ts';
import { expireHeld, releaseHeld } from './held.ts';
import { toIso } from './time.ts';
import { updateDimension, type DimensionDelta } from './update-dimension.ts';
import type {
  Band,
  ConfidenceVerdict,
  Dimension,
  DimensionUpdate,
  EvalFlag,
  Evaluation,
  Evidence,
  MasteryState,
  SelfConfidence,
} from './types.ts';

export interface ApplyEvaluationAttempt {
  selfConfidence: SelfConfidence | null;
  /** This evaluation grades a probe that followed a correct answer (held credit pending, rule 4 applies). */
  isProbeAfterCorrect: boolean;
  evidence: Evidence;
  /** Consistency source of the §4 confidence table, computed by the caller from the concept's recent attempts. */
  consistency?: { recentCorrectDeterministic: number; probesSoFar: number } | null;
}

export interface ApplyEvaluationInput {
  mastery: MasteryState;
  evaluation: Evaluation;
  questionType: QuestionType;
  now: string | Date;
  config: MasteryConfig;
  attempt?: ApplyEvaluationAttempt;
  /** Misconception ids declared on the concept; when given, unknown ids are dropped (rule 7). */
  conceptMisconceptionIds?: readonly string[] | null;
}

export interface ApplyEvaluationResult {
  updates: DimensionUpdate[];
  appliedDelta: number;
  nextAction: NextAction;
  misconceptionIds: string[];
  flags: EvalFlag[];
  state: MasteryState;
  verdict: ConfidenceVerdict;
}

const SECONDARY_DIMENSIONS = ['understanding', 'application', 'architecture'] as const;
type SecondaryDimension = (typeof SECONDARY_DIMENSIONS)[number];

export function applyEvaluation(input: ApplyEvaluationInput): ApplyEvaluationResult {
  const { mastery, evaluation, questionType, config, attempt } = input;
  const nowIso = toIso(input.now);
  const evidence = attempt?.evidence ?? syntheticEvidence(mastery, questionType, nowIso, config, evaluation);
  const atIso = toIso(evidence.at);
  const primaryDimension = evidence.dimension;
  const correct = evaluation.correctness >= config.correctThreshold;
  const selfConfidence = attempt?.selfConfidence ?? evidence.selfConfidence;

  let next = expireHeld(mastery, nowIso);

  // Verdict (rules 4 and 5, §4 table). A probe after a correct answer with weak understanding is suspicious
  // whatever the probe's own correctness: the original answer is what cannot be explained.
  const consistency: ConfidenceSources['consistency'] = attempt?.consistency
    ? {
        recentCorrectDeterministic: attempt.consistency.recentCorrectDeterministic,
        understandingScore: next.dims.understanding.evidenceCount >= 1 ? next.dims.understanding.score : null,
        chainRung: next.chainRung,
        probesSoFar: attempt.consistency.probesSoFar,
      }
    : null;
  const baseVerdict = confidenceVerdict(
    {
      correct,
      selfConfidence,
      llm: { understanding: evaluation.understanding, confidence: evaluation.confidence },
      consistency,
    },
    config,
  );
  const suspicious =
    baseVerdict === 'suspicious' ||
    (attempt?.isProbeAfterCorrect === true && evaluation.understanding < config.understandingBands.weak);
  const verdict: ConfidenceVerdict = suspicious ? 'suspicious' : baseVerdict;

  // Held credit from the answer this evaluation explains: released by understanding band.
  let updates: DimensionUpdate[] = [];
  const released = releaseHeld(next, evaluation.understanding, nowIso, config);
  next = released.state;
  for (const u of released.updates) updates = addUpdate(updates, u);

  const context = {
    chainRung: next.chainRung,
    consecutiveRecallCorrect: next.consecutiveRecallCorrect,
    recentPassedFormKeys: activeFormKeys(next, nowIso, config),
  };
  const llm = { correctness: evaluation.correctness, masteryDelta: evaluation.masteryDelta };

  // Primary dimension (rule 9): correctness is the primary score, except that the Understanding dimension tracks
  // the understanding sub-score directly ("Understanding updated toward the low score" in the suspicious case).
  const primaryTarget = primaryDimension === 'understanding' ? evaluation.understanding : evaluation.correctness;
  const primary = withholdIfSuspicious(
    updateDimension(
      next.dims[primaryDimension],
      {
        dimension: primaryDimension,
        target: primaryTarget,
        depth: evidence.depth,
        questionType,
        scorer: 'llm',
        formKey: evidence.formKey,
        secondary: false,
        llm,
        context,
      },
      config,
    ),
    primaryDimension,
    suspicious,
  );
  const dims = { ...next.dims };
  dims[primaryDimension] = recordPrimaryEvidence(next.dims[primaryDimension], evidence.depth, correct, atIso, primary.after);
  updates = addUpdate(updates, {
    dimension: primaryDimension,
    before: primary.before,
    after: primary.after,
    delta: primary.after - primary.before,
  });

  // Secondary evidence: sub-scores land only on dimensions that already have primary evidence, at secondaryWeight,
  // and never touch evidenceCount / maxDepthPassed / lastEvidenceAt.
  for (const sd of SECONDARY_DIMENSIONS) {
    if (sd === primaryDimension || next.dims[sd].evidenceCount < 1) continue;
    const r = withholdIfSuspicious(
      updateDimension(
        next.dims[sd],
        {
          dimension: sd,
          target: evaluation[sd satisfies SecondaryDimension],
          depth: evidence.depth,
          questionType,
          scorer: 'llm',
          formKey: evidence.formKey,
          secondary: true,
          llm,
          context,
        },
        config,
      ),
      sd,
      suspicious,
    );
    if (r.after === r.before) continue;
    dims[sd] = { ...dims[sd], score: r.after };
    updates = addUpdate(updates, { dimension: sd, before: r.before, after: r.after, delta: r.after - r.before });
  }

  // Rule 7: misconception ids (declared ones only when the concept's list is known), deduped into weakAreas.
  const allowed = input.conceptMisconceptionIds ? new Set(input.conceptMisconceptionIds) : null;
  const misconceptionIds = unique(
    evaluation.misconceptions
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .filter((id) => allowed === null || allowed.has(id)),
  );
  const weakAreas = unique([...next.weakAreas, ...misconceptionIds]);

  const flags: EvalFlag[] = [];
  if (suspicious) flags.push('suspicious');
  if (selfConfidence !== null && selfConfidence >= config.confidenceSignals.selfHighMin && !correct) flags.push('overconfident');

  next = {
    ...next,
    dims,
    consecutiveRecallCorrect: nextRecallCounter(next.consecutiveRecallCorrect, primaryDimension, correct, suspicious),
    chainRung: passChainRung(next.chainRung, evidence.chainRung, correct, suspicious),
    weakAreas,
  };
  if (correct) next = notePassedForm(next, evidence.formKey, atIso, config);
  next = noteProbeAngle(next, evidence.probeAngle, config);
  next = recompute({ ...next, updatedAt: nowIso }, config);

  const nextAction: NextAction = suspicious ? 'probe' : acceptedNextAction(evaluation.nextAction, next.band, config);

  return { updates, appliedDelta: sumDeltas(updates), nextAction, misconceptionIds, flags, state: next, verdict };
}

/** Rule 4: a suspicious verdict withholds positive credit everywhere except Understanding, which tracks the low score. */
function withholdIfSuspicious(delta: DimensionDelta, dimension: Dimension, suspicious: boolean): DimensionDelta {
  if (!suspicious || dimension === 'understanding' || delta.delta <= 0) return delta;
  return { ...delta, delta: 0, after: delta.before, suppressed: 'suspicious' };
}

/** Rule 6: only LLM_NEXT_ACTIONS members are accepted; `challenge` needs band >= challengeMinBand. */
function acceptedNextAction(candidate: unknown, band: Band, config: MasteryConfig): NextAction {
  if (typeof candidate !== 'string' || !(LLM_NEXT_ACTIONS as readonly string[]).includes(candidate)) return 'continue';
  const action = candidate as LlmNextAction;
  if (action === 'challenge' && !bandAtLeast(band, config.challengeMinBand)) return 'continue';
  return action;
}

/** Without attempt evidence the exercise tag is unknown: route by the question type's catalog defaults. */
function syntheticEvidence(
  mastery: MasteryState,
  questionType: QuestionType,
  nowIso: string,
  config: MasteryConfig,
  evaluation: Evaluation,
): Evidence {
  const defaults = config.questionTypeDefaults[questionType];
  return {
    attemptId: '',
    conceptId: mastery.conceptId,
    questionType,
    formKey: '',
    dimension: defaults.dimension,
    depth: defaults.depth,
    score: evaluation.correctness,
    correct: evaluation.correctness >= config.correctThreshold,
    scorer: 'llm',
    selfConfidence: null,
    probeAngle: null,
    chainRung: null,
    durationMs: 0,
    at: nowIso,
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
