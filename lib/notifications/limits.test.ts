import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CONFIG } from './config.ts';
import { PROVIDER_LIMITS, shouldWarn } from './limits.ts';

describe('PROVIDER_LIMITS', () => {
  it('records the researched caps as data', () => {
    expect(PROVIDER_LIMITS.resend).toMatchObject({ dailyCap: 100, monthlyCap: 3000, verified: '2026-09-04' });
    expect(PROVIDER_LIMITS.smtp).toMatchObject({ dailyCap: null, monthlyCap: null, verified: null });
    expect(PROVIDER_LIMITS.console).toMatchObject({ dailyCap: null, monthlyCap: null });
    expect(PROVIDER_LIMITS.supabase_auth).toMatchObject({ hourlyCap: 2, dailyCap: null });
  });
});

describe('shouldWarn', () => {
  it('warns at warnAtPercentOfDailyCap of the daily cap', () => {
    expect(NOTIFICATION_CONFIG.warnAtPercentOfDailyCap).toBe(80);
    expect(shouldWarn(79, 'resend')).toBe(false);
    expect(shouldWarn(80, 'resend')).toBe(true);
    expect(shouldWarn(150, 'resend')).toBe(true);
  });

  it('never warns for providers without a daily cap', () => {
    expect(shouldWarn(10_000, 'smtp')).toBe(false);
    expect(shouldWarn(10_000, 'console')).toBe(false);
  });

  it('reads the threshold from the config it is given', () => {
    expect(shouldWarn(50, 'resend', { ...NOTIFICATION_CONFIG, warnAtPercentOfDailyCap: 50 })).toBe(true);
    expect(shouldWarn(50, 'resend', { ...NOTIFICATION_CONFIG, warnAtPercentOfDailyCap: 51 })).toBe(false);
  });
});
