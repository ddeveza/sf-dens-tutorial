// State bookkeeping shared by applyEvidence and applyEvaluation: evidence counts, form keys, probe angles,
// the recall counter and the transfer chain. All functions return new objects.
import type { ProbeAngle } from '../learning-engine/types.ts';
import type { MasteryConfig } from './config.ts';
import { MS_PER_DAY, epochMs } from './time.ts';
import type { ChainRung, Depth, Dimension, DimensionState, DimensionUpdate, MasteryState } from './types.ts';

/** Form keys passed within identicalFormWindowDays of `now`; keys without a timestamp count as inside the window. */
export function activeFormKeys(state: MasteryState, now: string | Date, config: MasteryConfig): string[] {
  const nowMs = epochMs(now);
  const windowMs = config.identicalFormWindowDays * MS_PER_DAY;
  return state.recentPassedFormKeys.filter((key) => {
    const at = state.recentPassedFormKeyAt[key];
    return at === undefined || nowMs - epochMs(at) <= windowMs;
  });
}

export function notePassedForm(state: MasteryState, formKey: string, at: string, config: MasteryConfig): MasteryState {
  if (formKey === '') return state;
  const keys = [...state.recentPassedFormKeys.filter((k) => k !== formKey), formKey].slice(-config.recentFormKeysMax);
  const timestamps: Record<string, string> = {};
  for (const key of keys) {
    const t = key === formKey ? at : state.recentPassedFormKeyAt[key];
    if (t !== undefined) timestamps[key] = t;
  }
  return { ...state, recentPassedFormKeys: keys, recentPassedFormKeyAt: timestamps };
}

export function noteProbeAngle(state: MasteryState, angle: ProbeAngle | null, config: MasteryConfig): MasteryState {
  if (angle === null) return state;
  return {
    ...state,
    lastProbeAngle: angle,
    recentProbeAngles: [...state.recentProbeAngles, angle].slice(-config.recentProbeAnglesMax),
  };
}

/**
 * Increments on correct recall evidence; resets on a wrong recall answer or on correct non-recall evidence whose
 * verdict is not suspicious; a failed or suspicious probe leaves it untouched (that is when saturation must bite).
 */
export function nextRecallCounter(current: number, dimension: Dimension, correct: boolean, suspicious: boolean): number {
  if (dimension === 'recall') return correct ? current + 1 : 0;
  return correct && !suspicious ? 0 : current;
}

/** Passing rung k (correct and not suspicious) sets chainRung = max(chainRung, k); never lowers it. */
export function passChainRung(
  current: ChainRung,
  rung: Exclude<ChainRung, 0> | null,
  correct: boolean,
  suspicious: boolean,
): ChainRung {
  if (rung === null || !correct || suspicious) return current;
  return rung > current ? rung : current;
}

/** Primary evidence bookkeeping: count, depth passed (score-based), timestamp; `score` is the post-update score. */
export function recordPrimaryEvidence(
  dim: DimensionState,
  depth: Depth,
  correct: boolean,
  at: string,
  score: number,
): DimensionState {
  return {
    score,
    evidenceCount: dim.evidenceCount + 1,
    maxDepthPassed: correct && depth > dim.maxDepthPassed ? depth : dim.maxDepthPassed,
    lastEvidenceAt: at,
  };
}

/** Appends an update, merging with an earlier one on the same dimension (before from the first, after from the last). */
export function addUpdate(list: DimensionUpdate[], update: DimensionUpdate): DimensionUpdate[] {
  const index = list.findIndex((u) => u.dimension === update.dimension);
  if (index === -1) return [...list, update];
  const before = list[index].before;
  const merged: DimensionUpdate = { dimension: update.dimension, before, after: update.after, delta: update.after - before };
  return list.map((u, i) => (i === index ? merged : u));
}

export function sumDeltas(updates: readonly DimensionUpdate[]): number {
  return updates.reduce((acc, u) => acc + u.delta, 0);
}
