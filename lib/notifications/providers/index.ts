// `getEmailProvider(env)` picks the provider by EMAIL_PROVIDER. The caller passes the parsed env (lib/env/server.ts
// or a test object); nothing here touches process.env, and a misconfiguration fails fast with a named variable.
import { EMAIL_PROVIDER_NAMES, type EmailProvider, type EmailProviderName } from '../types.ts';
import { createConsoleProvider } from './console.ts';
import { createResendProvider } from './resend.ts';
import { SMTP_DEFAULT_PORT, createSmtpProvider } from './smtp.ts';

export { createConsoleProvider } from './console.ts';
export { createResendProvider } from './resend.ts';
export { createSmtpProvider, SMTP_DEFAULT_PORT, SMTP_IMPLICIT_TLS_PORT } from './smtp.ts';
export type { ConsoleProviderOptions } from './console.ts';
export type { ResendEmailClient, ResendProviderOptions, ResendSendPayload, ResendSendResponse } from './resend.ts';
export type { SmtpMail, SmtpProviderOptions, SmtpTransport, SmtpTransportOptions } from './smtp.ts';

export interface EmailProviderEnv {
  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string | number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
}

const MIN_PORT = 1;
const MAX_PORT = 65_535;

function isProviderName(value: string): value is EmailProviderName {
  return (EMAIL_PROVIDER_NAMES as readonly string[]).includes(value);
}

function required(env: EmailProviderEnv, key: 'EMAIL_FROM' | 'RESEND_API_KEY' | 'SMTP_HOST', provider: EmailProviderName): string {
  const value = env[key];
  if (!value || !value.trim()) throw new Error(`${key} is required when EMAIL_PROVIDER=${provider}`);
  return value.trim();
}

function parsePort(raw: string | number | undefined): number {
  if (raw === undefined || raw === '') return SMTP_DEFAULT_PORT;
  const port = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) throw new Error(`SMTP_PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}, got ${String(raw)}`);
  return port;
}

export function getEmailProvider(env: EmailProviderEnv): EmailProvider {
  const name = env.EMAIL_PROVIDER?.trim() ?? '';
  if (!isProviderName(name)) throw new Error(`EMAIL_PROVIDER must be one of ${EMAIL_PROVIDER_NAMES.join(', ')}, got "${name}"`);
  switch (name) {
    case 'console':
      return createConsoleProvider();
    case 'resend':
      return createResendProvider({ apiKey: required(env, 'RESEND_API_KEY', name), from: required(env, 'EMAIL_FROM', name) });
    case 'smtp':
      return createSmtpProvider({
        host: required(env, 'SMTP_HOST', name),
        port: parsePort(env.SMTP_PORT),
        user: env.SMTP_USER?.trim() || undefined,
        pass: env.SMTP_PASS || undefined,
        from: required(env, 'EMAIL_FROM', name),
      });
  }
}
