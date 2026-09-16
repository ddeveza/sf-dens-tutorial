// Deterministic evidence (mcq, predict_outcome, debug_code, ...): scored in lib/assessments, applied here.
// LLM-graded attempts go through applyEvaluation.
import {
  activeFormKeys,
  nextRecallCounter,
  notePassedForm,
  noteProbeAngle,
  passChainRung,
  recordPrimaryEvidence,
  sumDeltas,
} from './bookkeeping.ts';
import { recompute } from './caps.ts';
import { confidenceVerdict } from './confidence.ts';
import type { MasteryConfig } from './config.ts';
import { expireHeld, heldExpiry, holdCredit } from './held.ts';
import { toIso } from './time.ts';
import { updateDimension } from './update-dimension.ts';
import type { ConfidenceVerdict, DimensionUpdate, Evidence, HeldCredit, MasteryState } from './types.ts';

export interface ApplyEvidenceInput {
  state: MasteryState;
  evidence: Evidence;
  config: MasteryConfig;
  now: string | Date;
  /** True when the caller's shouldProbe() fired: a positive delta is parked in state.held instead of credited. */
  hold?: boolean;
}

export interface ApplyEvidenceResult {
  state: MasteryState;
  updates: DimensionUpdate[];
  appliedDelta: number;
  held?: HeldCredit;
  verdict: ConfidenceVerdict;
}

export function applyEvidence({ state, evidence, config, now, hold = false }: ApplyEvidenceInput): ApplyEvidenceResult {
  if (evidence.scorer !== 'deterministic') {
    throw new TypeError('applyEvidence handles deterministic evidence only; llm-scored attempts go through applyEvaluation');
  }
  const nowIso = toIso(now);
  const atIso = toIso(evidence.at);
  const dimension = evidence.dimension;
  const { correct } = evidence;

  let next = expireHeld(state, nowIso);
  const verdict = confidenceVerdict(
    { correct, selfConfidence: evidence.selfConfidence, llm: null, consistency: null },
    config,
  );

  const result = updateDimension(
    next.dims[dimension],
    {
      dimension,
      target: evidence.score,
      depth: evidence.depth,
      questionType: evidence.questionType,
      scorer: 'deterministic',
      formKey: evidence.formKey,
      secondary: false,
      llm: null,
      context: {
        chainRung: next.chainRung,
        consecutiveRecallCorrect: next.consecutiveRecallCorrect,
        recentPassedFormKeys: activeFormKeys(next, nowIso, config),
      },
    },
    config,
  );

  let held: HeldCredit | undefined;
  let updates: DimensionUpdate[] = [];
  let score = result.after;
  if (hold && result.delta > 0) {
    held = { attemptId: evidence.attemptId, dimension, delta: result.delta, expiresAt: heldExpiry(nowIso, config) };
    score = result.before;
  } else {
    updates = [{ dimension, before: result.before, after: result.after, delta: result.after - result.before }];
  }

  next = {
    ...next,
    dims: { ...next.dims, [dimension]: recordPrimaryEvidence(next.dims[dimension], evidence.depth, correct, atIso, score) },
    consecutiveRecallCorrect: nextRecallCounter(next.consecutiveRecallCorrect, dimension, correct, false),
    chainRung: passChainRung(next.chainRung, evidence.chainRung, correct, false),
  };
  if (held) next = holdCredit(next, held);
  if (correct) next = notePassedForm(next, evidence.formKey, atIso, config);
  next = noteProbeAngle(next, evidence.probeAngle, config);
  next = recompute({ ...next, updatedAt: nowIso }, config);

  return held === undefined
    ? { state: next, updates, appliedDelta: sumDeltas(updates), verdict }
    : { state: next, updates, appliedDelta: sumDeltas(updates), held, verdict };
}
