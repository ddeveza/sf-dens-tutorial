import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAMIFICATION_CONFIG } from './config.ts';
import { localDateOf } from './dates.ts';
import { deriveStreak, qualifyingDaysFromAttempts, STREAK_CONFIG } from './streak.ts';
import { makeAttempt } from './testing.ts';

const cfg = STREAK_CONFIG;

function days(...specs: string[]): Set<string> {
  const out = new Set<string>();
  for (const spec of specs) {
    const [from, to] = spec.split('..');
    if (!to) {
      out.add(from);
      continue;
    }
    const start = Number(from.slice(8));
    const end = Number(to.slice(8));
    for (let d = start; d <= end; d++) out.add(`${from.slice(0, 8)}${String(d).padStart(2, '0')}`);
  }
  return out;
}

describe('deriveStreak', () => {
  it('reproduces the documented example: 7 days, shield, miss, 2 days, today pending', () => {
    const s = deriveStreak(days('2026-09-01..2026-09-07', '2026-09-09..2026-09-10'), '2026-09-11', cfg);
    expect(s).toEqual({ current: 9, longest: 9, shieldBanked: false, atRisk: true, todayQualifies: false });
  });

  it('banks a shield on every 7th consecutive qualifying day', () => {
    expect(deriveStreak(days('2026-09-01..2026-09-06'), '2026-09-07', cfg).shieldBanked).toBe(false);
    expect(deriveStreak(days('2026-09-01..2026-09-07'), '2026-09-08', cfg)).toMatchObject({ current: 7, shieldBanked: true });
  });

  it('a single miss consumes the shield and the run continues', () => {
    const s = deriveStreak(days('2026-09-01..2026-09-07', '2026-09-09'), '2026-09-10', cfg);
    expect(s).toMatchObject({ current: 8, shieldBanked: false });
  });

  it('two consecutive misses reset the run even with a shield', () => {
    const s = deriveStreak(days('2026-09-01..2026-09-07', '2026-09-10..2026-09-11'), '2026-09-12', cfg);
    expect(s).toMatchObject({ current: 2, longest: 7, shieldBanked: false });
  });

  it('a miss with no shield resets the run', () => {
    const s = deriveStreak(days('2026-09-01..2026-09-03', '2026-09-05..2026-09-06'), '2026-09-07', cfg);
    expect(s).toMatchObject({ current: 2, longest: 3 });
  });

  it('banks at most one shield at a time', () => {
    // 14 consecutive days would bank two without the cap; two misses must still reset.
    const s = deriveStreak(days('2026-09-01..2026-09-14'), '2026-09-17', cfg);
    expect(s).toMatchObject({ current: 0, longest: 14, shieldBanked: false });
  });

  it('a shielded day does not count toward the next shield', () => {
    // 1-7 bank, 8 bridged, 9-14 are six qualifying days: no new shield yet; the 15th qualifying day banks it.
    expect(deriveStreak(days('2026-09-01..2026-09-07', '2026-09-09..2026-09-14'), '2026-09-15', cfg).shieldBanked).toBe(false);
    expect(deriveStreak(days('2026-09-01..2026-09-07', '2026-09-09..2026-09-15'), '2026-09-16', cfg).shieldBanked).toBe(true);
  });

  it('today is not a break until local midnight; it extends the run when it qualifies', () => {
    expect(deriveStreak(days('2026-09-01..2026-09-03'), '2026-09-04', cfg)).toMatchObject({ current: 3, atRisk: true, todayQualifies: false });
    expect(deriveStreak(days('2026-09-01..2026-09-04'), '2026-09-04', cfg)).toMatchObject({ current: 4, longest: 4, atRisk: false, todayQualifies: true });
  });

  it('handles an empty history and a history of only today', () => {
    expect(deriveStreak(new Set(), '2026-09-07', cfg)).toEqual({ current: 0, longest: 0, shieldBanked: false, atRisk: true, todayQualifies: false });
    expect(deriveStreak(days('2026-09-07'), '2026-09-07', cfg)).toEqual({ current: 1, longest: 1, shieldBanked: false, atRisk: false, todayQualifies: true });
  });

  it('ignores days after today (a stale todayLocal never sees the future)', () => {
    expect(deriveStreak(days('2026-09-01..2026-09-03', '2026-09-09'), '2026-09-04', cfg)).toMatchObject({ current: 3 });
  });

  it('reads dates stamped in the learner time zone: a late-evening Los Angeles attempt is still that local day', () => {
    const zone = 'America/Los_Angeles';
    const evening = '2026-09-06T06:30:00.000Z'; // 23:30 on Sep 5 in Los Angeles
    expect(localDateOf(evening, zone)).toBe('2026-09-05');
    expect(localDateOf(evening, 'UTC')).toBe('2026-09-06');
    const local = new Set(['2026-09-04', localDateOf(evening, zone)]);
    expect(deriveStreak(local, '2026-09-06', cfg)).toMatchObject({ current: 2 });
    // Stamped in UTC instead, the same two attempts leave a gap on Sep 5 and the run restarts at 1 today.
    const utc = new Set(['2026-09-04', localDateOf(evening, 'UTC')]);
    expect(deriveStreak(utc, '2026-09-06', cfg)).toMatchObject({ current: 1, todayQualifies: true, atRisk: false });
  });
});

describe('qualifyingDaysFromAttempts', () => {
  it('needs 3 evaluated attempts or one free-text kind; pending rows never qualify', () => {
    const attempts = [
      makeAttempt({ localDate: '2026-09-01' }),
      makeAttempt({ localDate: '2026-09-01' }),
      makeAttempt({ localDate: '2026-09-01' }),
      makeAttempt({ localDate: '2026-09-02' }),
      makeAttempt({ localDate: '2026-09-02' }),
      makeAttempt({ localDate: '2026-09-03', kind: 'teach_back', questionType: 'teach_back' }),
      makeAttempt({ localDate: '2026-09-04', kind: 'teach_back', questionType: 'teach_back', status: 'pending_evaluation' }),
      makeAttempt({ localDate: '2026-09-05', status: 'pending_evaluation' }),
      makeAttempt({ localDate: '2026-09-05', status: 'pending_evaluation' }),
      makeAttempt({ localDate: '2026-09-05', status: 'pending_evaluation' }),
    ];
    expect([...qualifyingDaysFromAttempts(attempts, cfg)].sort()).toEqual(['2026-09-01', '2026-09-03']);
  });
});

describe('STREAK_CONFIG', () => {
  it('is the gamification config streak block with the documented values', () => {
    expect(STREAK_CONFIG).toBe(GAMIFICATION_CONFIG.streak);
    expect(STREAK_CONFIG).toEqual({
      minAttempts: 3,
      freeTextKinds: ['explain_why', 'teach_back', 'scenario', 'boss', 'capstone'],
      shieldEveryDays: 7,
      maxBankedShields: 1,
    });
  });

  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const viewSql = existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
        .find((sql) => sql.includes('v_qualifying_days'))
    : undefined;

  it.skipIf(!viewSql)('matches the v_qualifying_days view in the migration', () => {
    const sql = viewSql ?? '';
    const view = sql.slice(sql.indexOf('v_qualifying_days'));
    expect(view).toMatch(new RegExp(`count\\(\\*\\)\\s*>=\\s*${STREAK_CONFIG.minAttempts}\\b`));
    const kindsMatch = /kind\s+in\s*\(([^)]*)\)/i.exec(view);
    expect(kindsMatch).not.toBeNull();
    const kinds = (kindsMatch?.[1] ?? '')
      .split(',')
      .map((k) => k.trim().replace(/^'|'$/g, ''))
      .sort();
    expect(kinds).toEqual([...STREAK_CONFIG.freeTextKinds].sort());
  });
});
