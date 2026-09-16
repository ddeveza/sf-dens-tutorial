import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CONFIG, type NotificationConfig } from './config.ts';
import { selectDue } from './scheduler.ts';
import type { DueCandidate, NotificationKind, NotificationPreference } from './types.ts';

const cfg = NOTIFICATION_CONFIG;

// Fixed-offset reference zone: America/Sao_Paulo is UTC-3 all year (DST abolished in 2019).
// 22:00Z is 19:00 local; 2026-09-07 is a Monday.
const SP = 'America/Sao_Paulo';

function pref(overrides: Partial<NotificationPreference> = {}): NotificationPreference {
  return {
    userId: 'u1',
    enabled: true,
    preferredHour: 19,
    timeZone: SP,
    frequency: 'daily',
    streakReminder: true,
    reviewDueReminder: true,
    ...overrides,
  };
}

type CandidateOverrides = Omit<Partial<DueCandidate>, 'pref'> & { pref?: Partial<NotificationPreference> };

function candidate(overrides: CandidateOverrides = {}): DueCandidate {
  const { pref: prefOverrides, ...rest } = overrides;
  return {
    pref: pref(prefOverrides),
    email: 'u1@example.com',
    studiedToday: false,
    reviewsDue: 0,
    streakDays: 0,
    sentToday: [],
    ...rest,
  };
}

/** `now` such that the local clock in America/Sao_Paulo reads `hour`:00 on 2026-09-07 (Monday). */
function atLocalHour(hour: number, date = '2026-09-07'): Date {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00-03:00`);
}

const kinds = (out: { kind: NotificationKind }[]): NotificationKind[] => out.map((s) => s.kind);

describe('selectDue: gates', () => {
  it('returns nothing when the preference is disabled', () => {
    expect(selectDue(atLocalHour(19), [candidate({ pref: { enabled: false }, streakDays: 5 })], cfg)).toEqual([]);
  });

  it('returns nothing for an empty candidate list', () => {
    expect(selectDue(atLocalHour(19), [], cfg)).toEqual([]);
  });

  it('skips both slots once the learner has studied today', () => {
    expect(selectDue(atLocalHour(21), [candidate({ studiedToday: true, streakDays: 5, reviewsDue: 3 })], cfg)).toEqual([]);
  });

  it('frequency=weekdays skips Saturday and Sunday in the local zone', () => {
    const weekdays = candidate({ pref: { frequency: 'weekdays' } });
    expect(selectDue(atLocalHour(19, '2026-09-05'), [weekdays], cfg)).toEqual([]); // Saturday
    expect(selectDue(atLocalHour(19, '2026-09-06'), [weekdays], cfg)).toEqual([]); // Sunday
    expect(selectDue(atLocalHour(19, '2026-09-07'), [weekdays], cfg)).toHaveLength(1); // Monday
    expect(selectDue(atLocalHour(19, '2026-09-11'), [weekdays], cfg)).toHaveLength(1); // Friday
  });

  it('frequency=weekdays uses the local weekday, not the UTC weekday', () => {
    // 23:30Z Sunday 2026-09-06 is Monday 08:30 in Tokyo.
    const tokyo = candidate({ pref: { frequency: 'weekdays', timeZone: 'Asia/Tokyo', preferredHour: 8 } });
    expect(selectDue(new Date('2026-09-06T23:30:00Z'), [tokyo], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-07' }]);
    // 02:00Z Monday 2026-09-07 is Sunday 19:00 in Los Angeles (PDT).
    const la = candidate({ pref: { frequency: 'weekdays', timeZone: 'America/Los_Angeles', preferredHour: 19 } });
    expect(selectDue(new Date('2026-09-07T02:00:00Z'), [la], cfg)).toEqual([]);
  });

  it('frequency=daily fires on weekends', () => {
    expect(selectDue(atLocalHour(19, '2026-09-06'), [candidate()], cfg)).toHaveLength(1);
  });
});

describe('selectDue: study slot', () => {
  it('fires a daily_reminder at the preferred hour with the local date', () => {
    expect(selectDue(atLocalHour(19), [candidate()], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-07' }]);
  });

  it('does not fire before the preferred hour', () => {
    expect(selectDue(atLocalHour(18), [candidate()], cfg)).toEqual([]);
  });

  it('stays sendable for catchupWindowHours after the preferred hour, exclusive at the end', () => {
    const c = candidate({ pref: { preferredHour: 10, streakReminder: false } });
    for (let h = 10; h < 10 + cfg.catchupWindowHours; h++) {
      expect(kinds(selectDue(atLocalHour(h), [c], cfg)), `hour ${h}`).toEqual(['daily_reminder']);
    }
    expect(selectDue(atLocalHour(10 + cfg.catchupWindowHours), [c], cfg)).toEqual([]);
  });

  it('does not wrap the catch-up window past local midnight', () => {
    const c = candidate({ pref: { preferredHour: 22, streakReminder: false } });
    expect(kinds(selectDue(atLocalHour(23), [c], cfg))).toEqual(['daily_reminder']);
    // 01:00 the next local day is inside preferredHour + 6 arithmetically but is a new local date.
    expect(selectDue(atLocalHour(1, '2026-09-08'), [c], cfg)).toEqual([]);
  });

  it('becomes review_due when reviews are due and the learner opted in', () => {
    expect(kinds(selectDue(atLocalHour(19), [candidate({ reviewsDue: 3 })], cfg))).toEqual(['review_due']);
  });

  it('falls back to daily_reminder when reviewDueReminder is off or nothing is due', () => {
    expect(kinds(selectDue(atLocalHour(19), [candidate({ reviewsDue: 3, pref: { reviewDueReminder: false } })], cfg))).toEqual(['daily_reminder']);
    expect(kinds(selectDue(atLocalHour(19), [candidate({ reviewsDue: 0 })], cfg))).toEqual(['daily_reminder']);
  });

  it('dedupes against either study-slot kind already sent today', () => {
    expect(selectDue(atLocalHour(19), [candidate({ reviewsDue: 3, sentToday: ['daily_reminder'] })], cfg)).toEqual([]);
    expect(selectDue(atLocalHour(19), [candidate({ sentToday: ['review_due'] })], cfg)).toEqual([]);
  });

  it('a streak_at_risk row does not block the study slot', () => {
    const c = candidate({ sentToday: ['streak_at_risk'], streakDays: 4 });
    expect(kinds(selectDue(atLocalHour(19), [c], cfg))).toEqual(['daily_reminder']);
  });
});

describe('selectDue: streak slot', () => {
  it('fires at min(preferredHour + streakOffsetHours, streakLatestHour)', () => {
    // preferredHour 19 -> min(22, 21) = 21
    const late = candidate({ pref: { preferredHour: 19 }, streakDays: 3, sentToday: ['daily_reminder'] });
    expect(selectDue(atLocalHour(20), [late], cfg)).toEqual([]);
    expect(selectDue(atLocalHour(21), [late], cfg)).toEqual([{ userId: 'u1', kind: 'streak_at_risk', localDate: '2026-09-07' }]);
    expect(kinds(selectDue(atLocalHour(23), [late], cfg))).toEqual(['streak_at_risk']);
    // preferredHour 10 -> min(13, 21) = 13
    const early = candidate({ pref: { preferredHour: 10 }, streakDays: 3, sentToday: ['daily_reminder'] });
    expect(selectDue(atLocalHour(12), [early], cfg)).toEqual([]);
    expect(kinds(selectDue(atLocalHour(13), [early], cfg))).toEqual(['streak_at_risk']);
  });

  it('requires an active streak', () => {
    expect(selectDue(atLocalHour(21), [candidate({ streakDays: 0, sentToday: ['daily_reminder'] })], cfg)).toEqual([]);
    expect(kinds(selectDue(atLocalHour(21), [candidate({ streakDays: 1, sentToday: ['daily_reminder'] })], cfg))).toEqual(['streak_at_risk']);
  });

  it('respects the streakReminder opt-out', () => {
    const c = candidate({ pref: { streakReminder: false }, streakDays: 9, sentToday: ['daily_reminder'] });
    expect(selectDue(atLocalHour(21), [c], cfg)).toEqual([]);
  });

  it('dedupes against a streak_at_risk row already sent today', () => {
    const c = candidate({ streakDays: 9, sentToday: ['daily_reminder', 'streak_at_risk'] });
    expect(selectDue(atLocalHour(21), [c], cfg)).toEqual([]);
  });

  it('never nags after streakLatestHour when the preferred hour is late', () => {
    // preferredHour 23 -> min(26, 21) = 21: the streak warning precedes the study slot by design.
    const c = candidate({ pref: { preferredHour: 23 }, streakDays: 2 });
    expect(kinds(selectDue(atLocalHour(21), [c], cfg))).toEqual(['streak_at_risk']);
    expect(kinds(selectDue(atLocalHour(23), [c], cfg))).toEqual(['daily_reminder', 'streak_at_risk']);
  });
});

describe('selectDue: two-email cap', () => {
  it('can emit the study slot and the streak slot together, study slot first', () => {
    const c = candidate({ pref: { preferredHour: 16 }, streakDays: 4, reviewsDue: 2 });
    expect(selectDue(atLocalHour(19), [c], cfg)).toEqual([
      { userId: 'u1', kind: 'review_due', localDate: '2026-09-07' },
      { userId: 'u1', kind: 'streak_at_risk', localDate: '2026-09-07' },
    ]);
  });

  it('never exceeds maxPerUserPerDay including rows already sent', () => {
    expect(cfg.maxPerUserPerDay).toBe(2);
    const full = candidate({ pref: { preferredHour: 16 }, streakDays: 4, sentToday: ['daily_reminder', 'streak_at_risk'] });
    expect(selectDue(atLocalHour(19), [full], cfg)).toEqual([]);
    const one = candidate({ pref: { preferredHour: 16 }, streakDays: 4, sentToday: ['review_due'] });
    expect(kinds(selectDue(atLocalHour(19), [one], cfg))).toEqual(['streak_at_risk']);
  });

  it('a lower cap in config drops the streak slot first', () => {
    const tight: NotificationConfig = { ...cfg, maxPerUserPerDay: 1 };
    const c = candidate({ pref: { preferredHour: 16 }, streakDays: 4 });
    expect(kinds(selectDue(atLocalHour(19), [c], tight))).toEqual(['daily_reminder']);
  });
});

describe('selectDue: time zones', () => {
  it('honors Europe/Lisbon DST: WEST (+1) in September, WET (+0) in January', () => {
    const c = candidate({ pref: { timeZone: 'Europe/Lisbon', streakReminder: false } });
    expect(selectDue(new Date('2026-09-07T18:00:00Z'), [c], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-07' }]);
    expect(selectDue(new Date('2026-09-07T17:00:00Z'), [c], cfg)).toEqual([]);
    expect(selectDue(new Date('2026-01-12T18:00:00Z'), [c], cfg)).toEqual([]);
    expect(selectDue(new Date('2026-01-12T19:00:00Z'), [c], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-01-12' }]);
  });

  it('America/Sao_Paulo keeps the same offset in January and September', () => {
    const c = candidate({ pref: { streakReminder: false } });
    expect(selectDue(new Date('2026-01-12T22:00:00Z'), [c], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-01-12' }]);
    expect(selectDue(new Date('2026-09-07T22:00:00Z'), [c], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-07' }]);
  });

  it('stamps the local date, which may differ from the UTC date', () => {
    const tokyo = candidate({ pref: { timeZone: 'Asia/Tokyo', preferredHour: 7, streakReminder: false } });
    expect(selectDue(new Date('2026-09-07T22:00:00Z'), [tokyo], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-08' }]);
  });

  it('falls back to config.defaultTimeZone for an unknown zone instead of throwing', () => {
    expect(cfg.defaultTimeZone).toBe('UTC');
    const c = candidate({ pref: { timeZone: 'Mars/Olympus_Mons', preferredHour: 22, streakReminder: false } });
    expect(selectDue(new Date('2026-09-07T22:00:00Z'), [c], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-07' }]);
  });

  it('evaluates each candidate in its own zone and preserves input order', () => {
    const sp = candidate({ pref: { userId: 'sp', streakReminder: false } });
    const lisbon = candidate({ pref: { userId: 'pt', timeZone: 'Europe/Lisbon', preferredHour: 8, streakReminder: false } });
    const tokyo = candidate({ pref: { userId: 'jp', timeZone: 'Asia/Tokyo', preferredHour: 7, streakReminder: false } });
    // 22:00Z: 07:00 on the 8th in Tokyo (fires, next local date), 19:00 in Sao Paulo (fires),
    // 23:00 in Lisbon (preferred 08:00, window closed at 14:00).
    expect(selectDue(new Date('2026-09-07T22:00:00Z'), [tokyo, sp, lisbon], cfg)).toEqual([
      { userId: 'jp', kind: 'daily_reminder', localDate: '2026-09-08' },
      { userId: 'sp', kind: 'daily_reminder', localDate: '2026-09-07' },
    ]);
  });

  it('accepts an IANA link name that ICU lists under its legacy canonical name', () => {
    // 18:45Z is 00:15 on the 8th in Kolkata (UTC+5:30); with a UTC fallback it would wrongly be 18:45 on the 7th.
    const kolkata = candidate({ pref: { timeZone: 'Asia/Kolkata', preferredHour: 0, streakReminder: false } });
    expect(selectDue(new Date('2026-09-07T18:45:00Z'), [kolkata], cfg)).toEqual([{ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-08' }]);
  });
});

describe('selectDue: purity', () => {
  it('is deterministic and does not mutate its inputs', () => {
    const c = candidate({ pref: { preferredHour: 16 }, streakDays: 4, reviewsDue: 1, sentToday: [] });
    const snapshot = JSON.stringify(c);
    const a = selectDue(atLocalHour(19), [c], cfg);
    const b = selectDue(atLocalHour(19), [c], cfg);
    expect(a).toEqual(b);
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});
