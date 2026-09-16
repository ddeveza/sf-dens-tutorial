import { describe, expect, it } from 'vitest';
import { BANDS } from '../mastery-engine/types.ts';
import type { Band, Depth } from '../mastery-engine/types.ts';
import { DIFFICULTY_CONFIG, PROBE_CONFIG, type DifficultyConfig } from './config.ts';
import { applyChallengePenalty, bandDepthWindow, challengeDepth, pickExercise, targetDepth, type ExerciseLike } from './difficulty.ts';

describe('difficulty: two consecutive correct step up one depth; a fail steps down; never leaves band window by more than 1', () => {
  it('starts at the window minimum when there is no current depth', () => {
    expect(targetDepth('developing', { currentDepth: null, consecutiveCorrect: 0, consecutiveFailures: 0 })).toBe(3);
    expect(targetDepth('mastered', { currentDepth: null, consecutiveCorrect: 0, consecutiveFailures: 0 })).toBe(7);
  });

  it('steps up one depth after two consecutive correct answers, capped at window max + 1', () => {
    expect(targetDepth('developing', { currentDepth: 3, consecutiveCorrect: 1, consecutiveFailures: 0 })).toBe(3);
    expect(targetDepth('developing', { currentDepth: 3, consecutiveCorrect: 2, consecutiveFailures: 0 })).toBe(4);
    expect(targetDepth('developing', { currentDepth: 4, consecutiveCorrect: 2, consecutiveFailures: 0 })).toBe(5);
    expect(targetDepth('developing', { currentDepth: 5, consecutiveCorrect: 2, consecutiveFailures: 0 })).toBe(5);
    expect(targetDepth('developing', { currentDepth: 5, consecutiveCorrect: 7, consecutiveFailures: 0 })).toBe(5);
    expect(targetDepth('mastered', { currentDepth: 8, consecutiveCorrect: 2, consecutiveFailures: 0 })).toBe(8);
  });

  it('steps down one depth after a fail, floored at window min', () => {
    expect(targetDepth('developing', { currentDepth: 4, consecutiveCorrect: 0, consecutiveFailures: 1 })).toBe(3);
    expect(targetDepth('developing', { currentDepth: 3, consecutiveCorrect: 0, consecutiveFailures: 1 })).toBe(3);
    expect(targetDepth('developing', { currentDepth: 5, consecutiveCorrect: 0, consecutiveFailures: 3 })).toBe(4);
    expect(targetDepth('lost', { currentDepth: 1, consecutiveCorrect: 0, consecutiveFailures: 1 })).toBe(1);
  });

  it('a current depth outside the window (band changed) is pulled back inside', () => {
    expect(targetDepth('competent', { currentDepth: 1, consecutiveCorrect: 0, consecutiveFailures: 0 })).toBe(4);
    expect(targetDepth('lost', { currentDepth: 7, consecutiveCorrect: 0, consecutiveFailures: 0 })).toBe(3);
  });

  it('never leaves the band window by more than 1 for any band, depth and streak', () => {
    for (const band of BANDS) {
      const [min, max] = bandDepthWindow(band);
      for (let d = 1; d <= 8; d += 1) {
        for (const streak of [0, 1, 2, 5]) {
          for (const fails of [0, 1, 2]) {
            const depth = targetDepth(band, { currentDepth: d as Depth, consecutiveCorrect: streak, consecutiveFailures: fails });
            expect(depth, `${band} d=${d} streak=${streak} fails=${fails}`).toBeGreaterThanOrEqual(min);
            expect(depth, `${band} d=${d} streak=${streak} fails=${fails}`).toBeLessThanOrEqual(Math.min(8, max + 1));
          }
        }
      }
    }
  });

  it('reads every number from the config argument', () => {
    const config: DifficultyConfig = { ...DIFFICULTY_CONFIG, stepUpAfterConsecutiveCorrect: 3, stepUpOvershoot: 0 };
    expect(targetDepth('developing', { currentDepth: 3, consecutiveCorrect: 2, consecutiveFailures: 0 }, config)).toBe(3);
    expect(targetDepth('developing', { currentDepth: 4, consecutiveCorrect: 3, consecutiveFailures: 0 }, config)).toBe(4);
  });
});

describe('pickExercise: exact depth, else nearest lower, else nearest higher', () => {
  const pool: ExerciseLike[] = [
    { id: 'u2', depth: 2, dimension: 'understanding' },
    { id: 'u4a', depth: 4, dimension: 'understanding' },
    { id: 'u4b', depth: 4, dimension: 'understanding' },
    { id: 'u6', depth: 6, dimension: 'understanding' },
    { id: 'a3', depth: 3, dimension: 'application' },
  ];

  it('returns the first exact match', () => {
    expect(pickExercise(pool, 4, 'understanding')?.id).toBe('u4a');
  });

  it('falls back to the nearest lower depth, then the nearest higher', () => {
    expect(pickExercise(pool, 5, 'understanding')?.id).toBe('u4a');
    expect(pickExercise(pool, 3, 'understanding')?.id).toBe('u2');
    expect(pickExercise(pool, 1, 'understanding')?.id).toBe('u2');
    expect(pickExercise(pool, 7, 'understanding')?.id).toBe('u6');
  });

  it('honours the dimension and the exclusion list; null when the dimension has nothing left', () => {
    expect(pickExercise(pool, 3, 'application')?.id).toBe('a3');
    expect(pickExercise(pool, 4, 'understanding', { excludeIds: ['u4a'] })?.id).toBe('u4b');
    expect(pickExercise(pool, 4, 'understanding', { excludeIds: ['u4a', 'u4b'] })?.id).toBe('u2');
    expect(pickExercise(pool, 3, 'debugging')).toBeNull();
    expect(pickExercise(pool, 3, 'application', { excludeIds: ['a3'] })).toBeNull();
    expect(pickExercise([], 3, 'application')).toBeNull();
  });
});

describe('challenge depth and penalty', () => {
  it('challengeDepth = min(8, bandDepthFloor + challengeJump)', () => {
    const expected: Record<Band, Depth> = { lost: 3, familiar: 4, developing: 5, competent: 6, strong: 7, mastered: 8 };
    for (const band of BANDS) {
      expect(challengeDepth(band)).toBe(expected[band]);
      expect(challengeDepth(band)).toBe(Math.min(8, PROBE_CONFIG.bandDepthFloor[band] + DIFFICULTY_CONFIG.challengeJump));
    }
  });

  it('applyChallengePenalty halves negative deltas and leaves the rest alone', () => {
    expect(applyChallengePenalty(-10)).toBe(-5);
    expect(applyChallengePenalty(-3)).toBe(-1.5);
    expect(applyChallengePenalty(0)).toBe(0);
    expect(applyChallengePenalty(8)).toBe(8);
    expect(applyChallengePenalty(-10, { ...DIFFICULTY_CONFIG, challengeFailPenaltyFactor: 0.25 })).toBe(-2.5);
  });
});
