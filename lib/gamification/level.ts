// Level curve: xpTotal(L) = coefficient x L x (L - 1); level from XP is the inverse, capped at maxLevel.
import type { GamificationConfig } from './config.ts';

export interface LevelView {
  level: number;
  title: string;
  xpTotal: number;
  xpIntoLevel: number;
  xpForLevel: number; // 0 at the cap
  nextLevelAt: number | null; // null at the cap
  pct: number; // 0-100 inside the level; 100 at the cap
}

/** Cumulative XP required to hold level L. */
export function xpTotal(level: number, config: GamificationConfig): number {
  return config.level.coefficient * level * (level - 1);
}

/** L = min(maxLevel, floor((1 + sqrt(1 + 4 xp / c)) / 2)), then corrected against xpTotal so float error never shifts a boundary. */
export function levelFromXp(xp: number, config: GamificationConfig): number {
  const { coefficient, maxLevel } = config.level;
  const safeXp = Math.max(0, xp);
  let level = Math.floor((1 + Math.sqrt(1 + (4 * safeXp) / coefficient)) / 2);
  level = Math.min(Math.max(level, 1), maxLevel);
  while (level < maxLevel && xpTotal(level + 1, config) <= safeXp) level += 1;
  while (level > 1 && xpTotal(level, config) > safeXp) level -= 1;
  return level;
}

export function titleFor(level: number, config: GamificationConfig): string {
  const { titles } = config.level;
  const index = Math.min(Math.max(Math.trunc(level), 1), titles.length) - 1;
  return titles[index];
}

export function levelView(xp: number, config: GamificationConfig): LevelView {
  const level = levelFromXp(xp, config);
  const floor = xpTotal(level, config);
  const atCap = level >= config.level.maxLevel;
  const xpIntoLevel = Math.max(0, xp - floor);
  if (atCap) {
    return { level, title: titleFor(level, config), xpTotal: xp, xpIntoLevel, xpForLevel: 0, nextLevelAt: null, pct: 100 };
  }
  const nextLevelAt = xpTotal(level + 1, config);
  const xpForLevel = nextLevelAt - floor;
  return {
    level,
    title: titleFor(level, config),
    xpTotal: xp,
    xpIntoLevel,
    xpForLevel,
    nextLevelAt,
    pct: Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100)),
  };
}
