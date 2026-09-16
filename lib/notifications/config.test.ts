import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CONFIG } from './config.ts';

describe('NOTIFICATION_CONFIG', () => {
  it('matches the documented defaults', () => {
    expect(NOTIFICATION_CONFIG).toMatchObject({
      defaultPreferredHour: 19,
      defaultTimeZone: 'UTC',
      catchupWindowHours: 6,
      streakOffsetHours: 3,
      streakLatestHour: 21,
      maxSendsPerRun: 500,
      warnAtPercentOfDailyCap: 80,
    });
  });

  it('keeps the derived rules as data too', () => {
    expect(NOTIFICATION_CONFIG.maxPerUserPerDay).toBe(2);
    expect(NOTIFICATION_CONFIG.streakMinDays).toBe(1);
    expect(NOTIFICATION_CONFIG.weekdayFrequencyDays).toEqual([1, 2, 3, 4, 5]);
    expect(NOTIFICATION_CONFIG.reviewDueListMax).toBe(5);
  });

  it('keeps every hour inside a local day', () => {
    const { defaultPreferredHour, streakLatestHour, catchupWindowHours, streakOffsetHours } = NOTIFICATION_CONFIG;
    for (const h of [defaultPreferredHour, streakLatestHour]) expect(h).toBeGreaterThanOrEqual(0);
    for (const h of [defaultPreferredHour, streakLatestHour]) expect(h).toBeLessThanOrEqual(23);
    expect(catchupWindowHours).toBeGreaterThan(0);
    expect(streakOffsetHours).toBeGreaterThan(0);
  });
});
