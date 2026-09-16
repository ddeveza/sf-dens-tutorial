// Notification contracts (ARCHITECTURE.md Curriculum §D). Plain data in, plain data out; the cron route and
// db/queries wire the IO. Relative `.ts` specifiers only, no enums.
import type { QuestionType } from '../learning-engine/types.ts';
import type { Band } from '../mastery-engine/types.ts';

export const EMAIL_PROVIDER_NAMES = ['resend', 'smtp', 'console'] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDER_NAMES)[number];

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Providers never throw: a failure is `{ error }` so the service can mark the log row `failed`. */
export type SendResult = { id: string } | { error: string };

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(msg: EmailMessage): Promise<SendResult>;
}

export const NOTIFICATION_FREQUENCIES = ['daily', 'weekdays'] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];

/** One `notification_preferences` row, camel-cased. */
export interface NotificationPreference {
  userId: string;
  enabled: boolean;
  preferredHour: number; // 0-23, local
  timeZone: string; // IANA
  frequency: NotificationFrequency;
  streakReminder: boolean;
  reviewDueReminder: boolean;
}

export const NOTIFICATION_KINDS = ['daily_reminder', 'review_due', 'streak_at_risk'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_LOG_STATUSES = ['sent', 'failed'] as const;
export type NotificationLogStatus = (typeof NOTIFICATION_LOG_STATUSES)[number];

/** Everything `selectDue` needs about one learner, loaded by the cron route in a single query. */
export interface DueCandidate {
  pref: NotificationPreference;
  email: string;
  studiedToday: boolean;
  /** review_items with due_on <= local date d: the one review-debt definition (SR §7, `<=`). */
  reviewsDue: number;
  streakDays: number;
  /** Kinds with a `notification_log` row for the learner's local date (sent or failed). */
  sentToday: NotificationKind[];
}

export interface DueSelection {
  userId: string;
  kind: NotificationKind;
  localDate: string; // YYYY-MM-DD in the learner's zone
}

/** Sunday = 0 .. Saturday = 6, matching `Date.prototype.getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface LocalParts {
  hour: number; // 0-23
  date: string; // YYYY-MM-DD
  weekday: Weekday;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface DailyReminderData {
  siteUrl: string;
  day: number;
  lessonTitle: string;
  missionTitle: string;
  streakDays: number;
  level: number;
  levelTitle: string;
  /** One boss-style teaser question. */
  teaser: string;
}

export interface ReviewDueData {
  siteUrl: string;
  day: number;
  lessonTitle: string;
  missionTitle: string;
  reviewsDue: number;
  weakest: { concept: string; band: Band } | null;
  /** Due concept titles; the template renders at most `reviewDueListMax`. */
  dueConcepts: string[];
}

export interface StreakAtRiskData {
  siteUrl: string;
  streakDays: number;
  /** GAMIFICATION_CONFIG.streak.minAttempts, passed in: the rule belongs to gamification. */
  minAttempts: number;
  quickestReview: { concept: string; questionType?: QuestionType } | null;
}

export interface TemplateDataMap {
  daily_reminder: DailyReminderData;
  review_due: ReviewDueData;
  streak_at_risk: StreakAtRiskData;
}

/** Discriminated by `kind` so `renderTemplate` can dispatch and the service can verify the render matches the selection. */
export type TemplateData = { [K in NotificationKind]: { kind: K } & TemplateDataMap[K] }[NotificationKind];
