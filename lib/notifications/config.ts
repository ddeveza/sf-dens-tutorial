// Every number the notification scheduler, templates and service read (ARCHITECTURE.md Curriculum §D table).
// Functions take `config` as a parameter; the constant is the production default.
import type { Weekday } from './types.ts';

export interface NotificationConfig {
  /** Local hour for a new `notification_preferences` row. */
  readonly defaultPreferredHour: number;
  /** Zone for a new row and the fallback when a stored zone is unknown to ICU. */
  readonly defaultTimeZone: string;
  /** The study slot stays sendable for this many hours after `preferredHour` (a missed hourly run catches up). */
  readonly catchupWindowHours: number;
  /** Streak email at `preferredHour + streakOffsetHours` ... */
  readonly streakOffsetHours: number;
  /** ... but never after this local hour. */
  readonly streakLatestHour: number;
  /** Sends per route invocation; the rest wait for the next hourly run. */
  readonly maxSendsPerRun: number;
  /** Log a warning once the day's log count reaches this percentage of the provider's daily cap. */
  readonly warnAtPercentOfDailyCap: number;
  /** Emails per learner per local day, counting rows already logged. */
  readonly maxPerUserPerDay: number;
  /** A streak shorter than this has nothing to lose. */
  readonly streakMinDays: number;
  /** Local weekdays on which `frequency = 'weekdays'` sends (Sunday = 0). */
  readonly weekdayFrequencyDays: readonly Weekday[];
  /** Due concepts listed in the review-due email. */
  readonly reviewDueListMax: number;
}

export const NOTIFICATION_CONFIG: NotificationConfig = {
  defaultPreferredHour: 19,
  defaultTimeZone: 'UTC',
  catchupWindowHours: 6,
  streakOffsetHours: 3,
  streakLatestHour: 21,
  maxSendsPerRun: 500,
  warnAtPercentOfDailyCap: 80,
  maxPerUserPerDay: 2,
  streakMinDays: 1,
  weekdayFrequencyDays: [1, 2, 3, 4, 5],
  reviewDueListMax: 5,
};
