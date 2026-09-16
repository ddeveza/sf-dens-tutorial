import { describe, expect, it } from 'vitest';
import { GAMIFICATION_CONFIG } from './config.ts';
import { levelFromXp, levelView, titleFor, xpTotal } from './level.ts';

const config = GAMIFICATION_CONFIG;

describe('xpTotal', () => {
  it('is 100 x L x (L - 1)', () => {
    expect(xpTotal(1, config)).toBe(0);
    expect(xpTotal(2, config)).toBe(200);
    expect(xpTotal(10, config)).toBe(9_000);
    expect(xpTotal(20, config)).toBe(38_000);
    expect(xpTotal(30, config)).toBe(87_000);
  });
});

describe('levelFromXp', () => {
  it.each([
    [0, 1],
    [199, 1],
    [200, 2],
    [8_999, 9],
    [9_000, 10],
    [37_999, 19],
    [38_000, 20],
    [86_999, 29],
    [87_000, 30],
  ])('%i XP -> level %i', (xp, level) => {
    expect(levelFromXp(xp, config)).toBe(level);
  });

  it('caps at maxLevel; XP keeps accruing with no further level', () => {
    expect(levelFromXp(200_000, config)).toBe(30);
    expect(levelFromXp(Number.MAX_SAFE_INTEGER, config)).toBe(30);
  });

  it('never returns below level 1', () => {
    expect(levelFromXp(-50, config)).toBe(1);
  });

  it('agrees with xpTotal at every boundary up to the cap', () => {
    for (let L = 1; L <= config.level.maxLevel; L++) {
      expect(levelFromXp(xpTotal(L, config), config)).toBe(L);
      if (L > 1) expect(levelFromXp(xpTotal(L, config) - 1, config)).toBe(L - 1);
    }
  });
});

describe('titleFor', () => {
  it('has one title per level in the fixed table', () => {
    expect(config.level.titles).toHaveLength(config.level.maxLevel);
    expect(titleFor(1, config)).toBe('Platform Initiate');
    expect(titleFor(9, config)).toBe('Skew Hunter');
    expect(titleFor(10, config)).toBe('Data Steward');
    expect(titleFor(20, config)).toBe('Automation Engineer');
    expect(titleFor(30, config)).toBe('Depth Master');
  });

  it('clamps out-of-range levels into the table', () => {
    expect(titleFor(0, config)).toBe('Platform Initiate');
    expect(titleFor(99, config)).toBe('Depth Master');
  });
});

describe('levelView', () => {
  it('reports progress inside the current level', () => {
    expect(levelView(8_420, config)).toEqual({
      level: 9,
      title: 'Skew Hunter',
      xpTotal: 8_420,
      xpIntoLevel: 1_220,
      xpForLevel: 1_800,
      nextLevelAt: 9_000,
      pct: 68,
    });
  });

  it('starts at level 1 with 200 to go', () => {
    expect(levelView(0, config)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForLevel: 200, nextLevelAt: 200, pct: 0 });
  });

  it('at the cap there is no next level and the bar is full', () => {
    expect(levelView(90_000, config)).toMatchObject({ level: 30, title: 'Depth Master', xpIntoLevel: 3_000, xpForLevel: 0, nextLevelAt: null, pct: 100 });
  });
});
