// Held credit: a correct answer's delta parked while a probe is pending, released by the probe's understanding band.
import type { MasteryConfig, UnderstandingBand } from './config.ts';
import { addDays, epochMs } from './time.ts';
import { clamp } from './update-dimension.ts';
import { DIMENSIONS, type Dimension, type DimensionUpdate, type HeldCredit, type MasteryState } from './types.ts';

export function understandingBandFor(understanding: number, config: MasteryConfig): UnderstandingBand {
  if (understanding < config.understandingBands.weak) return 'weak';
  if (understanding < config.understandingBands.strong) return 'adequate';
  return 'strong';
}

export function releaseFactor(understanding: number, config: MasteryConfig): number {
  return config.heldRelease[understandingBandFor(understanding, config)];
}

export function heldExpiry(at: string | Date, config: MasteryConfig): string {
  return addDays(at, config.heldExpiryDays);
}

export function holdCredit(state: MasteryState, credit: HeldCredit): MasteryState {
  return { ...state, held: [...state.held, credit] };
}

/** Drops credits whose expiresAt is at or before `now` (expired credit is discarded, never released). */
export function expireHeld(state: MasteryState, now: string | Date): MasteryState {
  const nowMs = epochMs(now);
  const held = state.held.filter((h) => epochMs(h.expiresAt) > nowMs);
  return held.length === state.held.length ? state : { ...state, held };
}

/**
 * Releases every unexpired credit at heldRelease[understanding band] into its dimension's score.
 * Does not recompute band / overall; the caller does after all updates of the attempt.
 */
export function releaseHeld(
  state: MasteryState,
  understanding: number,
  now: string | Date,
  config: MasteryConfig,
): { state: MasteryState; updates: DimensionUpdate[] } {
  const live = expireHeld(state, now);
  if (live.held.length === 0) return { state: live, updates: [] };

  const factor = releaseFactor(understanding, config);
  const totals: Partial<Record<Dimension, number>> = {};
  for (const credit of live.held) totals[credit.dimension] = (totals[credit.dimension] ?? 0) + credit.delta * factor;

  const dims = { ...live.dims };
  const updates: DimensionUpdate[] = [];
  for (const d of DIMENSIONS) {
    const add = totals[d];
    if (add === undefined) continue;
    const before = dims[d].score;
    const after = clamp(Math.round(before + add), 0, 100);
    dims[d] = { ...dims[d], score: after };
    updates.push({ dimension: d, before, after, delta: after - before });
  }
  return { state: { ...live, dims, held: [] }, updates };
}
