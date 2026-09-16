import { describe, expect, it } from 'vitest';
import { getEmailProvider } from './index.ts';

describe('getEmailProvider', () => {
  it('picks the console provider without any other configuration', () => {
    expect(getEmailProvider({ EMAIL_PROVIDER: 'console' }).name).toBe('console');
  });

  it('picks resend when the API key and sender are present', () => {
    expect(getEmailProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@b.c' }).name).toBe('resend');
  });

  it('picks smtp when the host and sender are present, defaulting the port', () => {
    expect(getEmailProvider({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'a@b.c' }).name).toBe('smtp');
    expect(getEmailProvider({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', EMAIL_FROM: 'a@b.c' }).name).toBe('smtp');
  });

  it('fails fast on missing or malformed configuration', () => {
    expect(() => getEmailProvider({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'a@b.c' })).toThrow(/RESEND_API_KEY/);
    expect(() => getEmailProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' })).toThrow(/EMAIL_FROM/);
    expect(() => getEmailProvider({ EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@b.c' })).toThrow(/SMTP_HOST/);
    expect(() => getEmailProvider({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_PORT: 'abc', EMAIL_FROM: 'a@b.c' })).toThrow(/SMTP_PORT/);
    expect(() => getEmailProvider({ EMAIL_PROVIDER: 'pigeon' })).toThrow(/EMAIL_PROVIDER/);
    expect(() => getEmailProvider({})).toThrow(/EMAIL_PROVIDER/);
  });
});
