// notification_preferences (learner-editable) and notification_log (admin-only, the idempotency record). The zone
// comes from profiles.time_zone: notification_preferences has no time_zone column. Selection rules live in
// lib/notifications/scheduler.ts; this file only assembles its DueCandidate inputs.
import 'server-only';
import { deriveStreak, STREAK_CONFIG } from '@/lib/gamification/streak';
import { NOTIFICATION_CONFIG, type NotificationConfig } from '@/lib/notifications/config';
import { isValidTimeZone, localParts } from '@/lib/notifications/time';
import {
  NOTIFICATION_FREQUENCIES,
  NOTIFICATION_KINDS,
  NOTIFICATION_LOG_STATUSES,
  type DueCandidate,
  type NotificationFrequency,
  type NotificationKind,
  type NotificationLogStatus,
  type NotificationPreference,
} from '@/lib/notifications/types';
import type { Tables } from '@/types/database';
import { PG_ERROR, QueryError, type Db } from './client';
import { getProfile } from './profiles';

export type NotificationPreferenceRow = Tables<'notification_preferences'>;
export type NotificationLogRow = Tables<'notification_log'>;

function asFrequency(value: string): NotificationFrequency {
  if ((NOTIFICATION_FREQUENCIES as readonly string[]).includes(value)) return value as NotificationFrequency;
  throw new QueryError('notification_preferences.frequency', { message: `unexpected frequency '${value}'` });
}

function asKind(value: string): NotificationKind {
  if ((NOTIFICATION_KINDS as readonly string[]).includes(value)) return value as NotificationKind;
  throw new QueryError('notification_log.kind', { message: `unexpected kind '${value}'` });
}

export function toNotificationPreference(row: NotificationPreferenceRow, timeZone: string): NotificationPreference {
  return {
    userId: row.user_id,
    enabled: row.enabled,
    preferredHour: row.preferred_hour,
    timeZone,
    frequency: asFrequency(row.frequency),
    streakReminder: row.streak_reminder,
    reviewDueReminder: row.review_due_reminder,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Learner side (session client)
// ---------------------------------------------------------------------------------------------------------------

export async function getNotificationPreference(db: Db, userId: string): Promise<NotificationPreference | null> {
  const [{ data, error }, profile] = await Promise.all([
    db.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
    getProfile(db, userId),
  ]);
  if (error) throw new QueryError('notification_preferences.select', error);
  if (!data) return null;
  return toNotificationPreference(data, profile?.time_zone ?? NOTIFICATION_CONFIG.defaultTimeZone);
}

export interface NotificationPreferencePatch {
  enabled?: boolean;
  preferred_hour?: number;
  frequency?: NotificationFrequency;
  streak_reminder?: boolean;
  review_due_reminder?: boolean;
}

/** Insert-or-update on the (user_id) primary key; RLS `with check` pins user_id to the session. */
export async function upsertNotificationPreference(db: Db, userId: string, patch: NotificationPreferencePatch): Promise<NotificationPreferenceRow> {
  const { data, error } = await db
    .from('notification_preferences')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw new QueryError('notification_preferences.upsert', error);
  return data;
}

// ---------------------------------------------------------------------------------------------------------------
// Cron side (admin client only; RLS bypassed, so every query filters explicitly)
// ---------------------------------------------------------------------------------------------------------------

/**
 * One DueCandidate per enabled learner with an email, computed for that learner's current local date:
 * studiedToday = the day already qualifies (v_qualifying_days, the streak's own definition), reviewsDue =
 * review_items with due_on <= local date, streakDays = deriveStreak over the qualifying days, sentToday = kinds
 * already logged for that local date. Batched with `.in()`: five round trips regardless of learner count.
 * selectDue() owns every rule; nothing is pre-filtered by hour here.
 */
export async function listNotificationCandidates(admin: Db, now: Date, config: NotificationConfig = NOTIFICATION_CONFIG): Promise<DueCandidate[]> {
  const { data: prefs, error: prefsError } = await admin.from('notification_preferences').select('*').eq('enabled', true);
  if (prefsError) throw new QueryError('notification_preferences.enabled', prefsError);
  if (prefs.length === 0) return [];

  const ids = prefs.map((p) => p.user_id);
  const { data: profiles, error: profilesError } = await admin.from('profiles').select('id, email, time_zone').in('id', ids);
  if (profilesError) throw new QueryError('profiles.for_reminders', profilesError);

  const zoneOf = new Map<string, string>();
  const emailOf = new Map<string, string>();
  for (const p of profiles) {
    if (!p.email) continue; // OAuth without an email scope: nothing to send to
    emailOf.set(p.id, p.email);
    zoneOf.set(p.id, isValidTimeZone(p.time_zone) ? p.time_zone : config.defaultTimeZone);
  }
  const candidates = prefs.filter((p) => emailOf.has(p.user_id));
  if (candidates.length === 0) return [];

  const localDateOf = new Map<string, string>();
  for (const p of candidates) localDateOf.set(p.user_id, localParts(now, zoneOf.get(p.user_id) ?? config.defaultTimeZone).date);
  const candidateIds = candidates.map((p) => p.user_id);
  const dates = [...new Set(localDateOf.values())];
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  const [qualifying, reviews, logs] = await Promise.all([
    admin.from('v_qualifying_days').select('user_id, local_date').in('user_id', candidateIds),
    admin.from('review_items').select('user_id, due_on').in('user_id', candidateIds).lte('due_on', maxDate),
    admin.from('notification_log').select('user_id, kind, local_date').in('user_id', candidateIds).in('local_date', dates),
  ]);
  if (qualifying.error) throw new QueryError('v_qualifying_days.for_reminders', qualifying.error);
  if (reviews.error) throw new QueryError('review_items.for_reminders', reviews.error);
  if (logs.error) throw new QueryError('notification_log.for_reminders', logs.error);

  const daysOf = new Map<string, Set<string>>();
  for (const row of qualifying.data) {
    if (row.user_id === null || row.local_date === null) continue;
    const set = daysOf.get(row.user_id) ?? new Set<string>();
    set.add(row.local_date);
    daysOf.set(row.user_id, set);
  }
  const reviewsDueOf = new Map<string, number>();
  for (const row of reviews.data) {
    const today = localDateOf.get(row.user_id);
    if (today !== undefined && row.due_on <= today) reviewsDueOf.set(row.user_id, (reviewsDueOf.get(row.user_id) ?? 0) + 1);
  }
  const sentOf = new Map<string, NotificationKind[]>();
  for (const row of logs.data) {
    if (row.local_date !== localDateOf.get(row.user_id)) continue;
    const list = sentOf.get(row.user_id) ?? [];
    list.push(asKind(row.kind));
    sentOf.set(row.user_id, list);
  }

  return candidates.map((row) => {
    const userId = row.user_id;
    const today = localDateOf.get(userId) ?? localParts(now, config.defaultTimeZone).date;
    const days = daysOf.get(userId) ?? new Set<string>();
    return {
      pref: toNotificationPreference(row, zoneOf.get(userId) ?? config.defaultTimeZone),
      email: emailOf.get(userId) ?? '',
      studiedToday: days.has(today),
      reviewsDue: reviewsDueOf.get(userId) ?? 0,
      streakDays: deriveStreak(days, today, STREAK_CONFIG).current,
      sentToday: sentOf.get(userId) ?? [],
    };
  });
}

export interface NotificationLogInsert {
  userId: string;
  kind: NotificationKind;
  /** YYYY-MM-DD in the learner's zone: the idempotency key with (user_id, kind). */
  localDate: string;
  provider: string;
  status: NotificationLogStatus;
  providerMessageId?: string | null;
  error?: string | null;
}

export type NotificationLogInsertResult = { outcome: 'inserted'; id: number } | { outcome: 'duplicate' };

/**
 * Insert the unique (user_id, kind, local_date) row FIRST; send only when the outcome is 'inserted'. A double-fired
 * cron hits 23505 and gets 'duplicate' (no throw), so it never sends twice.
 */
export async function insertNotificationLog(admin: Db, row: NotificationLogInsert): Promise<NotificationLogInsertResult> {
  const { data, error } = await admin
    .from('notification_log')
    .insert({
      user_id: row.userId,
      kind: row.kind,
      local_date: row.localDate,
      provider: row.provider,
      status: row.status,
      provider_message_id: row.providerMessageId ?? null,
      error: row.error ?? null,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === PG_ERROR.uniqueViolation) return { outcome: 'duplicate' };
    throw new QueryError('notification_log.insert', error);
  }
  return { outcome: 'inserted', id: data.id };
}

export interface NotificationLogUpdate {
  status: NotificationLogStatus;
  providerMessageId?: string | null;
  error?: string | null;
}

/** Records the provider outcome on the row inserted before the send. */
export async function updateNotificationLog(admin: Db, id: number, patch: NotificationLogUpdate): Promise<NotificationLogRow> {
  if (!(NOTIFICATION_LOG_STATUSES as readonly string[]).includes(patch.status)) {
    throw new QueryError('notification_log.update', { message: `unexpected status '${patch.status}'` });
  }
  const { data, error } = await admin
    .from('notification_log')
    .update({
      status: patch.status,
      ...(patch.providerMessageId !== undefined ? { provider_message_id: patch.providerMessageId } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new QueryError('notification_log.update', error);
  return data;
}

/** Rows logged for one learner on one local day (count toward maxPerUserPerDay). */
export async function listNotificationLog(admin: Db, userId: string, localDate: string): Promise<NotificationLogRow[]> {
  const { data, error } = await admin.from('notification_log').select('*').eq('user_id', userId).eq('local_date', localDate);
  if (error) throw new QueryError('notification_log.list', error);
  return data;
}
