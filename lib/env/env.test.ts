import { afterEach, describe, expect, it, vi } from 'vitest';
import { getServerEnv, parseServerEnv, resetServerEnvCache, siteUrl } from './server.ts';

const BASE = {
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  CRON_SECRET: 'sixteen-chars-at-least',
};

describe('parseServerEnv', () => {
  it('applies the documented defaults for a minimal live configuration', () => {
    const env = parseServerEnv({ ...BASE, ANTHROPIC_API_KEY: 'sk-ant-test' });
    expect(env.LLM_MODE).toBe('live');
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5');
    expect(env.EMAIL_PROVIDER).toBe('console');
    expect(env.SMTP_PORT).toBe(587);
    expect(env.FAKE_LLM_LATENCY_MS).toBe(0);
    expect(env.LLM_MODEL_CHECK).toBeUndefined();
    expect(env.LLM_EFFORT_CHECK).toBeUndefined();
  });

  it('live mode requires ANTHROPIC_API_KEY', () => {
    expect(() => parseServerEnv({ ...BASE })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'live' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('fake mode without an API key is fine', () => {
    const env = parseServerEnv({ ...BASE, LLM_MODE: 'fake' });
    expect(env.LLM_MODE).toBe('fake');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('an unknown model id fails boot instead of falling back', () => {
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', LLM_MODEL_CHECK: 'claude-haiku-4-5' })).toThrow(
      /LLM_MODEL_CHECK/,
    );
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', ANTHROPIC_MODEL: 'claude-opus-5-20260401' })).toThrow(
      /ANTHROPIC_MODEL/,
    );
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', LLM_MODEL_CAPSTONE: 'gpt-5' })).toThrow(/LLM_MODEL_CAPSTONE/);
  });

  it('accepts the documented model ids and effort levels as overrides', () => {
    const env = parseServerEnv({
      ...BASE,
      LLM_MODE: 'fake',
      ANTHROPIC_MODEL: 'claude-opus-5',
      LLM_MODEL_CHECK: 'claude-sonnet-5',
      LLM_EFFORT_CHECK: 'low',
      LLM_EFFORT_BOSS: 'max',
      LLM_EFFORT_CAPSTONE: 'xhigh',
    });
    expect(env.LLM_MODEL_CHECK).toBe('claude-sonnet-5');
    expect(env.LLM_EFFORT_CHECK).toBe('low');
    expect(env.LLM_EFFORT_BOSS).toBe('max');
    expect(env.LLM_EFFORT_CAPSTONE).toBe('xhigh');
  });

  it('an unknown effort level fails boot', () => {
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', LLM_EFFORT_PROBE: 'ultra' })).toThrow(/LLM_EFFORT_PROBE/);
  });

  it('CRON_SECRET must be at least 16 characters', () => {
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/);
    expect(() => parseServerEnv({ SUPABASE_SECRET_KEY: 'x', LLM_MODE: 'fake' })).toThrow(/CRON_SECRET/);
  });

  it('SUPABASE_SECRET_KEY is required', () => {
    expect(() => parseServerEnv({ CRON_SECRET: BASE.CRON_SECRET, LLM_MODE: 'fake' })).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it('blank values behave as unset (KEY= lines in .env.local)', () => {
    const env = parseServerEnv({ ...BASE, LLM_MODE: 'fake', ANTHROPIC_API_KEY: '', ANTHROPIC_MODEL: '   ', EMAIL_FROM: '' });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5');
    expect(env.EMAIL_FROM).toBeUndefined();
  });

  it('email providers require their own credentials', () => {
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', EMAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(() =>
      parseServerEnv({ ...BASE, LLM_MODE: 'fake', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' }),
    ).toThrow(/EMAIL_FROM/);
    expect(
      parseServerEnv({
        ...BASE,
        LLM_MODE: 'fake',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_test',
        EMAIL_FROM: 'quest@example.com',
      }).EMAIL_PROVIDER,
    ).toBe('resend');

    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', EMAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_HOST/);
    const smtp = parseServerEnv({
      ...BASE,
      LLM_MODE: 'fake',
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '2525',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      EMAIL_FROM: 'quest@example.com',
    });
    expect(smtp.SMTP_PORT).toBe(2525);
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', EMAIL_PROVIDER: 'sendgrid' })).toThrow(/EMAIL_PROVIDER/);
  });

  it('rejects an unknown LLM_MODE and a negative fake latency', () => {
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'dry-run' })).toThrow(/LLM_MODE/);
    expect(() => parseServerEnv({ ...BASE, LLM_MODE: 'fake', FAKE_LLM_LATENCY_MS: '-5' })).toThrow(/FAKE_LLM_LATENCY_MS/);
    expect(parseServerEnv({ ...BASE, LLM_MODE: 'fake', FAKE_LLM_LATENCY_MS: '250' }).FAKE_LLM_LATENCY_MS).toBe(250);
  });

  it('reports every problem at once', () => {
    let message = '';
    try {
      parseServerEnv({ LLM_MODE: 'live', LLM_MODEL_BOSS: 'nope' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/SUPABASE_SECRET_KEY/);
    expect(message).toMatch(/CRON_SECRET/);
    expect(message).toMatch(/LLM_MODEL_BOSS/);
    expect(message).toMatch(/ANTHROPIC_API_KEY/);
  });
});

describe('getServerEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvCache();
  });

  it('parses process.env once and memoizes', () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
    vi.stubEnv('CRON_SECRET', 'sixteen-chars-at-least');
    vi.stubEnv('LLM_MODE', 'fake');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    resetServerEnvCache();

    const first = getServerEnv();
    vi.stubEnv('LLM_MODE', 'live');
    const second = getServerEnv();
    expect(second).toBe(first);
    expect(second.LLM_MODE).toBe('fake');

    resetServerEnvCache();
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    expect(getServerEnv().LLM_MODE).toBe('live');
  });
});

describe('siteUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers NEXT_PUBLIC_SITE_URL and strips a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://quest.example.com/');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_URL', 'preview-abc.vercel.app');
    expect(siteUrl()).toBe('https://quest.example.com');
  });

  it('falls back to https://NEXT_PUBLIC_VERCEL_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_URL', 'preview-abc.vercel.app');
    expect(siteUrl()).toBe('https://preview-abc.vercel.app');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_URL', 'https://already-prefixed.vercel.app/');
    expect(siteUrl()).toBe('https://already-prefixed.vercel.app');
  });

  it('falls back to localhost when nothing is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_URL', '');
    expect(siteUrl()).toBe('http://localhost:3000');
  });
});
