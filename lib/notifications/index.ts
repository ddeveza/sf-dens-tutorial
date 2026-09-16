// Public surface of lib/notifications. The scheduler, templates and limits are pure; the providers and the service
// do IO only through what the caller passes in (the cron route wires db/admin.ts and the parsed env).
export * from './types.ts';
export { NOTIFICATION_CONFIG } from './config.ts';
export type { NotificationConfig } from './config.ts';
export { isValidTimeZone, localParts } from './time.ts';
export { selectDue } from './scheduler.ts';
export { PROVIDER_LIMITS, shouldWarn } from './limits.ts';
export type { LimitedProvider, ProviderLimit } from './limits.ts';
export { errorMessage } from './errors.ts';
export { CTA_LABEL, DASHBOARD_PATH, PRODUCT_NAME, ctaUrl, dailyReminder, escapeHtml, renderTemplate, reviewDue, streakAtRisk, whatStillCounts } from './templates/index.ts';
export {
  SMTP_DEFAULT_PORT,
  SMTP_IMPLICIT_TLS_PORT,
  createConsoleProvider,
  createResendProvider,
  createSmtpProvider,
  getEmailProvider,
} from './providers/index.ts';
export type {
  ConsoleProviderOptions,
  EmailProviderEnv,
  ResendEmailClient,
  ResendProviderOptions,
  ResendSendPayload,
  ResendSendResponse,
  SmtpMail,
  SmtpProviderOptions,
  SmtpTransport,
  SmtpTransportOptions,
} from './providers/index.ts';
export { sendDueNotifications } from './service.ts';
export type { LogKey, LogUpdate, NotificationLogger, SendDueDeps, SendDueReport } from './service.ts';
