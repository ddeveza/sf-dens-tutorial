// `sendDueNotifications(now, deps)`: select -> log insert -> render -> send -> update (ARCHITECTURE.md Curriculum §D
// sequence). The log row is inserted before the send so a double-fire (pg_cron and Vercel in the same hour, or a
// retried HTTP call) hits the unique (user_id, kind, local_date) key and skips; a provider failure leaves a `failed`
// row that is deliberately not retried that day. All IO comes in through `deps`; this module reads no env.
import type { NotificationConfig } from './config.ts';
import { errorMessage } from './errors.ts';
import { PROVIDER_LIMITS, shouldWarn } from './limits.ts';
import { selectDue } from './scheduler.ts';
import { renderTemplate } from './templates/index.ts';
import type { DueCandidate, EmailProvider, EmailProviderName, NotificationKind, SendResult, TemplateData } from './types.ts';

export interface NotificationLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface LogKey {
  userId: string;
  kind: NotificationKind;
  localDate: string;
}

export type LogUpdate = LogKey & ({ status: 'sent'; providerMessageId: string } | { status: 'failed'; error: string });

export interface SendDueDeps {
  /** Preferences + email + studiedToday + reviewsDue + streak + today's log rows, one row per enabled learner. */
  loadCandidates(): Promise<DueCandidate[]>;
  /** Insert the provisional `sent` row; 'duplicate' on a unique-key violation. */
  insertLog(userId: string, kind: NotificationKind, localDate: string, provider: EmailProviderName): Promise<'inserted' | 'duplicate'>;
  /** Finalize the row with the provider message id, or `failed` + error. */
  updateLog(update: LogUpdate): Promise<void>;
  /** Template data for the learner; `data.kind` must equal `kind`. */
  render(kind: NotificationKind, userId: string): Promise<TemplateData>;
  /** Optional: today's `notification_log` count for the daily-cap warning; defaults to this run's sends. */
  countSentToday?(): Promise<number>;
  provider: EmailProvider;
  config: NotificationConfig;
  logger: NotificationLogger;
}

export interface SendDueReport {
  /** Everything `selectDue` returned, including sends deferred by `maxSendsPerRun`. */
  selected: number;
  sent: number;
  /** Duplicate log rows: already handled this local day. */
  skipped: number;
  /** Attempted and not sent (provider error, render error, log insert error). */
  failed: number;
}

export async function sendDueNotifications(now: Date, deps: SendDueDeps): Promise<SendDueReport> {
  const { provider, config, logger } = deps;
  const candidates = await deps.loadCandidates();
  const emailByUser = new Map(candidates.map((c) => [c.pref.userId, c.email] as const));
  const due = selectDue(now, candidates, config);
  const batch = due.slice(0, config.maxSendsPerRun);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const selection of batch) {
    const key: LogKey = { userId: selection.userId, kind: selection.kind, localDate: selection.localDate };
    const to = emailByUser.get(selection.userId);
    if (!to) {
      failed += 1;
      logger.error('notification selected for a user without an email', { ...key });
      continue;
    }

    let inserted: 'inserted' | 'duplicate';
    try {
      inserted = await deps.insertLog(key.userId, key.kind, key.localDate, provider.name);
    } catch (e) {
      failed += 1;
      logger.error('notification_log insert failed', { ...key, error: errorMessage(e) });
      continue;
    }
    if (inserted === 'duplicate') {
      skipped += 1;
      continue;
    }

    let result: SendResult;
    try {
      const data = await deps.render(key.kind, key.userId);
      if (data.kind !== key.kind) throw new Error(`render returned ${data.kind} for ${key.kind}`);
      const email = renderTemplate(data);
      result = await provider.send({ to, subject: email.subject, html: email.html, text: email.text });
    } catch (e) {
      result = { error: errorMessage(e) };
    }

    let update: LogUpdate;
    if ('error' in result) {
      failed += 1;
      update = { ...key, status: 'failed', error: result.error };
      logger.warn('notification send failed', { ...key, provider: provider.name, error: result.error });
    } else {
      sent += 1;
      update = { ...key, status: 'sent', providerMessageId: result.id };
    }
    try {
      await deps.updateLog(update);
    } catch (e) {
      logger.error('notification_log update failed', { ...key, status: update.status, error: errorMessage(e) });
    }
  }

  const deferred = due.length - batch.length;
  if (deferred > 0) logger.warn('maxSendsPerRun reached; remaining sends wait for the next run', { deferred, maxSendsPerRun: config.maxSendsPerRun });

  let dayCount = sent;
  if (deps.countSentToday) {
    try {
      dayCount = await deps.countSentToday();
    } catch (e) {
      logger.error('countSentToday failed; using this run\'s sends for the cap warning', { error: errorMessage(e) });
    }
  }
  if (shouldWarn(dayCount, provider.name, config)) {
    logger.warn(`${provider.name} is approaching its daily cap`, { provider: provider.name, count: dayCount, dailyCap: PROVIDER_LIMITS[provider.name].dailyCap });
  }

  const report: SendDueReport = { selected: due.length, sent, skipped, failed };
  logger.info('reminders run complete', { ...report, deferred, provider: provider.name });
  return report;
}
