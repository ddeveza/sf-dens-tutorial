// Provider limits as data (ARCHITECTURE.md Curriculum §D table), re-verified by hand. Code never branches on them
// except `shouldWarn`, which the service uses to log a warning as the day's log count approaches `dailyCap`.
import { NOTIFICATION_CONFIG, type NotificationConfig } from './config.ts';
import type { EmailProviderName } from './types.ts';

export interface ProviderLimit {
  readonly freeTier: 'yes' | 'depends' | 'n/a';
  readonly hourlyCap: number | null;
  readonly dailyCap: number | null;
  readonly monthlyCap: number | null;
  readonly notes: string;
  /** YYYY-MM-DD the row was last checked against the provider's published limits; null = unset. */
  readonly verified: string | null;
}

export type LimitedProvider = EmailProviderName | 'supabase_auth';

export const PROVIDER_LIMITS: Readonly<Record<LimitedProvider, ProviderLimit>> = {
  resend: {
    freeTier: 'yes',
    hourlyCap: null,
    dailyCap: 100,
    monthlyCap: 3000,
    notes: '`send()` returns { error }, never throws; sender must be on a verified (sub)domain',
    verified: '2026-09-04',
  },
  smtp: {
    freeTier: 'depends',
    hourlyCap: null,
    dailyCap: null,
    monthlyCap: null,
    notes: 'nodemailer; fill from the chosen SMTP provider at setup',
    verified: null,
  },
  console: {
    freeTier: 'n/a',
    hourlyCap: null,
    dailyCap: null,
    monthlyCap: null,
    notes: 'dev/test; prints to stdout, captured by Mailpit when using local Supabase SMTP instead',
    verified: null,
  },
  supabase_auth: {
    freeTier: 'yes',
    hourlyCap: 2,
    dailyCap: null,
    monthlyCap: null,
    notes: 'auth emails only; configure custom SMTP for magic links in production',
    verified: '2026-09-04',
  },
};

const PERCENT = 100;

/** True once `count` (today's `notification_log` rows) reaches `warnAtPercentOfDailyCap` of the provider's daily cap. */
export function shouldWarn(count: number, provider: EmailProviderName, config: NotificationConfig = NOTIFICATION_CONFIG): boolean {
  const { dailyCap } = PROVIDER_LIMITS[provider];
  if (dailyCap === null) return false;
  return count >= (dailyCap * config.warnAtPercentOfDailyCap) / PERCENT;
}
