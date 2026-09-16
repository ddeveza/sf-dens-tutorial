// Hourly reminder sweep. Authenticated solely by CRON_SECRET: no cookies, no session, so pg_cron and Vercel Cron
// can both call it. Idempotent by the unique notification_log (user_id, kind, local_date) insert inside the service.
import { createAdminClient } from '@/db/admin';
import {
  insertNotificationLog,
  listNotificationCandidates,
  listNotificationLog,
  updateNotificationLog,
} from '@/db/queries/notifications';
import { getServerEnv, siteUrl } from '@/lib/env/server';
import { NOTIFICATION_CONFIG, getEmailProvider, sendDueNotifications, type LogUpdate } from '@/lib/notifications';
import { renderForUser } from './render';

// Vercel: the sweep may fan out over every enabled learner, so it gets the long function budget.
export const maxDuration = 300;

function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const env = getServerEnv();
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return unauthorized();

  const admin = createAdminClient();
  const provider = getEmailProvider(env);
  const now = new Date();
  const site = siteUrl();

  const report = await sendDueNotifications(now, {
    loadCandidates: () => listNotificationCandidates(admin, now, NOTIFICATION_CONFIG),
    insertLog: async (userId, kind, localDate, providerName) => {
      // Provisional 'sent': the row exists before the send so a concurrent run collides on the unique key and skips.
      const result = await insertNotificationLog(admin, { userId, kind, localDate, provider: providerName, status: 'sent' });
      return result.outcome === 'duplicate' ? 'duplicate' : 'inserted';
    },
    updateLog: async (update: LogUpdate) => {
      const rows = await listNotificationLog(admin, update.userId, update.localDate);
      const row = rows.find((candidate) => candidate.kind === update.kind);
      if (!row) return;
      await updateNotificationLog(
        admin,
        row.id,
        update.status === 'sent' ? { status: 'sent', providerMessageId: update.providerMessageId } : { status: 'failed', error: update.error },
      );
    },
    render: (kind, userId) => renderForUser(admin, site, kind, userId),
    provider,
    config: NOTIFICATION_CONFIG,
    logger: console,
  });

  return Response.json(report);
}
