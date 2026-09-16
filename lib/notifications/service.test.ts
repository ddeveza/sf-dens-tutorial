import { describe, expect, it, vi, type Mock } from 'vitest';
import { NOTIFICATION_CONFIG } from './config.ts';
import { sendDueNotifications, type NotificationLogger, type SendDueDeps } from './service.ts';
import type { DueCandidate, EmailMessage, EmailProvider, NotificationKind, SendResult, TemplateData } from './types.ts';

// 22:00Z on Monday 2026-09-07 is 19:00 in America/Sao_Paulo: the study slot for preferredHour 19.
const NOW = new Date('2026-09-07T22:00:00Z');
const SITE = 'https://depth-quest.example.com';

function candidate(userId: string, overrides: Partial<DueCandidate> = {}): DueCandidate {
  return {
    pref: { userId, enabled: true, preferredHour: 19, timeZone: 'America/Sao_Paulo', frequency: 'daily', streakReminder: false, reviewDueReminder: true },
    email: `${userId}@example.com`,
    studiedToday: false,
    reviewsDue: 0,
    streakDays: 0,
    sentToday: [],
    ...overrides,
  };
}

function templateData(kind: NotificationKind): TemplateData {
  switch (kind) {
    case 'daily_reminder':
      return { kind, siteUrl: SITE, day: 4, lessonTitle: 'Record IDs', missionTitle: 'M2', streakDays: 2, level: 1, levelTitle: 'Platform Initiate', teaser: 'Teaser?' };
    case 'review_due':
      return { kind, siteUrl: SITE, day: 4, lessonTitle: 'Record IDs', missionTitle: 'M2', reviewsDue: 2, weakest: null, dueConcepts: ['A', 'B'] };
    case 'streak_at_risk':
      return { kind, siteUrl: SITE, streakDays: 2, minAttempts: 3, quickestReview: null };
  }
}

function fakeProvider(result: SendResult | ((msg: EmailMessage) => SendResult | Promise<SendResult>) = { id: 'msg-1' }): EmailProvider & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: 'console',
    sent,
    async send(msg) {
      sent.push(msg);
      return typeof result === 'function' ? result(msg) : result;
    },
  };
}

type LoggerMocks = { [K in keyof NotificationLogger]: Mock<NotificationLogger[K]> };

function silentLogger(): LoggerMocks {
  return { info: vi.fn<NotificationLogger['info']>(), warn: vi.fn<NotificationLogger['warn']>(), error: vi.fn<NotificationLogger['error']>() };
}

function deps(overrides: Partial<SendDueDeps> = {}): SendDueDeps & { provider: EmailProvider & { sent: EmailMessage[] } } {
  const provider = fakeProvider();
  return {
    loadCandidates: async () => [candidate('u1')],
    insertLog: vi.fn(async () => 'inserted' as const),
    updateLog: vi.fn(async () => undefined),
    render: vi.fn(async (kind: NotificationKind) => templateData(kind)),
    provider,
    config: NOTIFICATION_CONFIG,
    logger: silentLogger(),
    ...overrides,
  } as SendDueDeps & { provider: EmailProvider & { sent: EmailMessage[] } };
}

describe('sendDueNotifications', () => {
  it('select -> log insert -> render -> send -> update, in that order, for one due learner', async () => {
    const d = deps();
    const order: string[] = [];
    (d.insertLog as ReturnType<typeof vi.fn>).mockImplementation(async () => (order.push('insert'), 'inserted'));
    (d.render as ReturnType<typeof vi.fn>).mockImplementation(async (kind: NotificationKind) => (order.push('render'), templateData(kind)));
    (d.updateLog as ReturnType<typeof vi.fn>).mockImplementation(async () => void order.push('update'));
    const sendSpy = vi.spyOn(d.provider, 'send');
    sendSpy.mockImplementation(async (msg) => (order.push('send'), d.provider.sent.push(msg), { id: 'msg-1' }));

    const report = await sendDueNotifications(NOW, d);

    expect(report).toEqual({ selected: 1, sent: 1, skipped: 0, failed: 0 });
    expect(order).toEqual(['insert', 'render', 'send', 'update']);
    expect(d.insertLog).toHaveBeenCalledWith('u1', 'daily_reminder', '2026-09-07', 'console');
    expect(d.render).toHaveBeenCalledWith('daily_reminder', 'u1');
    expect(d.provider.sent).toHaveLength(1);
    expect(d.provider.sent[0]).toMatchObject({ to: 'u1@example.com', subject: 'Day 4: Record IDs' });
    expect(d.provider.sent[0].html).toContain(`${SITE}/dashboard`);
    expect(d.updateLog).toHaveBeenCalledWith({ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-07', status: 'sent', providerMessageId: 'msg-1' });
  });

  it('is idempotent: a duplicate log insert skips the send without touching the row', async () => {
    const d = deps({ insertLog: vi.fn(async () => 'duplicate' as const) });
    const report = await sendDueNotifications(NOW, d);
    expect(report).toEqual({ selected: 1, sent: 0, skipped: 1, failed: 0 });
    expect(d.provider.sent).toHaveLength(0);
    expect(d.render).not.toHaveBeenCalled();
    expect(d.updateLog).not.toHaveBeenCalled();
  });

  it('a provider { error } leaves a failed row with the error and is not retried in the run', async () => {
    const provider = fakeProvider({ error: 'daily_quota_exceeded: over cap' });
    const d = deps({ provider });
    const report = await sendDueNotifications(NOW, d);
    expect(report).toEqual({ selected: 1, sent: 0, skipped: 0, failed: 1 });
    expect(provider.sent).toHaveLength(1);
    expect(d.updateLog).toHaveBeenCalledTimes(1);
    expect(d.updateLog).toHaveBeenCalledWith({ userId: 'u1', kind: 'daily_reminder', localDate: '2026-09-07', status: 'failed', error: 'daily_quota_exceeded: over cap' });
  });

  it('a throwing provider is recorded as failed, never propagated', async () => {
    const provider = fakeProvider(() => {
      throw new Error('socket hang up');
    });
    const d = deps({ provider });
    await expect(sendDueNotifications(NOW, d)).resolves.toEqual({ selected: 1, sent: 0, skipped: 0, failed: 1 });
    expect(d.updateLog).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'socket hang up' }));
  });

  it('a render failure is recorded as failed and nothing is sent', async () => {
    const d = deps({
      render: vi.fn(async () => {
        throw new Error('lesson 4 missing');
      }),
    });
    await expect(sendDueNotifications(NOW, d)).resolves.toEqual({ selected: 1, sent: 0, skipped: 0, failed: 1 });
    expect(d.provider.sent).toHaveLength(0);
    expect(d.updateLog).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'lesson 4 missing' }));
  });

  it('a render result for the wrong kind is a failure', async () => {
    const d = deps({ render: vi.fn(async () => templateData('streak_at_risk')) });
    await expect(sendDueNotifications(NOW, d)).resolves.toMatchObject({ failed: 1, sent: 0 });
    expect(d.provider.sent).toHaveLength(0);
  });

  it('continues past one learner\'s failure to the next', async () => {
    const provider = fakeProvider((msg) => (msg.to === 'u1@example.com' ? { error: 'bounce' } : { id: 'ok' }));
    const d = deps({ provider, loadCandidates: async () => [candidate('u1'), candidate('u2')] });
    expect(await sendDueNotifications(NOW, d)).toEqual({ selected: 2, sent: 1, skipped: 0, failed: 1 });
  });

  it('a log-insert exception counts as failed and moves on (no row exists, the next run retries)', async () => {
    const insertLog = vi.fn(async (userId: string) => {
      if (userId === 'u1') throw new Error('connection reset');
      return 'inserted' as const;
    });
    const d = deps({ insertLog, loadCandidates: async () => [candidate('u1'), candidate('u2')] });
    expect(await sendDueNotifications(NOW, d)).toEqual({ selected: 2, sent: 1, skipped: 0, failed: 1 });
    expect(d.provider.sent.map((m) => m.to)).toEqual(['u2@example.com']);
    expect(d.logger.error).toHaveBeenCalled();
  });

  it('a failed status update after a successful send still counts the send', async () => {
    const d = deps({
      updateLog: vi.fn(async () => {
        throw new Error('update failed');
      }),
    });
    expect(await sendDueNotifications(NOW, d)).toEqual({ selected: 1, sent: 1, skipped: 0, failed: 0 });
    expect(d.logger.error).toHaveBeenCalled();
  });

  it('sends at most maxSendsPerRun per invocation and reports the full selection', async () => {
    const d = deps({
      config: { ...NOTIFICATION_CONFIG, maxSendsPerRun: 2 },
      loadCandidates: async () => [candidate('u1'), candidate('u2'), candidate('u3')],
    });
    const report = await sendDueNotifications(NOW, d);
    expect(report).toEqual({ selected: 3, sent: 2, skipped: 0, failed: 0 });
    expect(d.provider.sent.map((m) => m.to)).toEqual(['u1@example.com', 'u2@example.com']);
    expect(d.insertLog).toHaveBeenCalledTimes(2);
    expect(d.logger.warn).toHaveBeenCalled();
  });

  it('does nothing when nobody is due', async () => {
    const d = deps({ loadCandidates: async () => [candidate('u1', { studiedToday: true })] });
    expect(await sendDueNotifications(NOW, d)).toEqual({ selected: 0, sent: 0, skipped: 0, failed: 0 });
    expect(d.insertLog).not.toHaveBeenCalled();
    expect(d.provider.sent).toHaveLength(0);
  });

  it('renders review_due and streak_at_risk with their own templates', async () => {
    const late = new Date('2026-09-08T00:00:00Z'); // 21:00 in Sao Paulo: study slot (window) + streak slot
    const c = candidate('u1', {
      reviewsDue: 2,
      streakDays: 2,
      pref: { userId: 'u1', enabled: true, preferredHour: 19, timeZone: 'America/Sao_Paulo', frequency: 'daily', streakReminder: true, reviewDueReminder: true },
    });
    const d = deps({ loadCandidates: async () => [c] });
    expect(await sendDueNotifications(late, d)).toEqual({ selected: 2, sent: 2, skipped: 0, failed: 0 });
    expect(d.provider.sent.map((m) => m.subject)).toEqual(['2 reviews due, plus Day 4', 'Your 2-day streak ends at midnight']);
  });

  it('warns when the day\'s count approaches the provider\'s daily cap', async () => {
    const resendLike = fakeProvider();
    (resendLike as { name: EmailProvider['name'] }).name = 'resend';
    const warned = deps({ provider: resendLike, countSentToday: async () => 80 });
    await sendDueNotifications(NOW, warned);
    expect(warned.logger.warn).toHaveBeenCalledWith(expect.stringMatching(/daily cap/i), expect.objectContaining({ provider: 'resend', count: 80, dailyCap: 100 }));

    const quiet = deps({ provider: fakeProvider(), countSentToday: async () => 80 });
    await sendDueNotifications(NOW, quiet);
    expect(quiet.logger.warn).not.toHaveBeenCalled();
  });
});
