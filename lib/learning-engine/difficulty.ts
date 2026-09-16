// Difficulty adaptation (ARCHITECTURE.md Learning Engine section 6): target depth from band and evidence, exercise
// picking with fallback, challenge depth and the challenge-fail penalty. Pure.
import type { Band, Depth, Dimension } from '../mastery-engine/types.ts';
import { DIFFICULTY_CONFIG, PROBE_CONFIG } from './config.ts';
import type { DifficultyConfig, ProbeConfig } from './config.ts';
import { clamp, toDepth } from './util.ts';

export function bandDepthWindow(band: Band, config: DifficultyConfig = DIFFICULTY_CONFIG): readonly [Depth, Depth] {
  return config.bandDepthWindow[band];
}

export interface DifficultyEvidence {
  /** Depth of the last question served on the concept, or null when none yet. */
  currentDepth: Depth | null;
  /** Consecutive correct answers on the concept, including the latest. */
  consecutiveCorrect: number;
  /** Consecutive wrong answers on the concept, including the latest. */
  consecutiveFailures: number;
}

/**
 * Depth for the next question: inside the band window, +1 after stepUpAfterConsecutiveCorrect correct answers
 * (capped at window max + stepUpOvershoot), -1 after stepDownAfterFail failures (floored at window min).
 */
export function targetDepth(band: Band, evidence: DifficultyEvidence, config: DifficultyConfig = DIFFICULTY_CONFIG): Depth {
  const [min, max] = config.bandDepthWindow[band];
  const ceiling = Math.min(config.depthMax, max + config.stepUpOvershoot);
  const base = clamp(evidence.currentDepth ?? min, min, ceiling);
  let depth = base;
  if (evidence.consecutiveCorrect >= config.stepUpAfterConsecutiveCorrect) depth = base + config.stepUpAmount;
  else if (evidence.consecutiveFailures >= config.stepDownAfterFail) depth = base - config.stepDownAmount;
  return toDepth(clamp(depth, min, ceiling));
}

export interface ExerciseLike {
  id: string;
  depth: Depth;
  dimension: Dimension;
}

export interface PickExerciseOptions {
  /** Exercise ids (form keys) to leave out, e.g. `recentPassedFormKeys`. */
  excludeIds?: readonly string[];
  config?: DifficultyConfig;
}

/**
 * First exercise of the dimension at `depth`; none => nearest lower depth; none lower => nearest higher.
 * Null when the dimension has no eligible exercise at all.
 */
export function pickExercise<T extends ExerciseLike>(pool: readonly T[], depth: Depth, dimension: Dimension, options: PickExerciseOptions = {}): T | null {
  const excluded = new Set(options.excludeIds ?? []);
  const eligible = pool.filter((exercise) => exercise.dimension === dimension && !excluded.has(exercise.id));
  if (eligible.length === 0) return null;

  const exact = eligible.find((exercise) => exercise.depth === depth);
  if (exact !== undefined) return exact;

  const lower = eligible.filter((exercise) => exercise.depth < depth);
  if (lower.length > 0) {
    const nearest = Math.max(...lower.map((exercise) => exercise.depth));
    return lower.find((exercise) => exercise.depth === nearest) ?? null;
  }

  const higher = eligible.filter((exercise) => exercise.depth > depth);
  const nearest = Math.min(...higher.map((exercise) => exercise.depth));
  return higher.find((exercise) => exercise.depth === nearest) ?? null;
}

/** `challenge_me` / `challenge` depth: min(depthMax, bandDepthFloor[band] + challengeJump). */
export function challengeDepth(band: Band, probe: ProbeConfig = PROBE_CONFIG, difficulty: DifficultyConfig = DIFFICULTY_CONFIG): Depth {
  return toDepth(Math.min(difficulty.depthMax, probe.bandDepthFloor[band] + difficulty.challengeJump));
}

/** Negative deltas from a failed challenge gate are multiplied by challengeFailPenaltyFactor; the rest pass through. */
export function applyChallengePenalty(delta: number, config: DifficultyConfig = DIFFICULTY_CONFIG): number {
  return delta < 0 ? delta * config.challengeFailPenaltyFactor : delta;
}
