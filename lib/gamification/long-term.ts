// Day-180 progress bar, completion credit and gap closure. Calendar days are not progress.
import type { FlexAction, LessonStatus } from '../learning-engine/types.ts';
import type { GamificationConfig } from './config.ts';
import { bossDefeated, type AttemptRow, type LessonProgressRow, type LessonRow, type MasteryRow, type MissionRow } from './context.ts';
import { daysBetween, minDate } from './dates.ts';
import type { DashboardViewModel, XpEvent, XpReason } from './types.ts';
import { bandRank, dedupeOnceOnly } from './xp.ts';

export type LongTermProgress = DashboardViewModel['longTerm'];

const DONE = new Set<LessonStatus>(['completed', 'completed_early']);
const CONSUMED = new Set<LessonStatus>(['completed', 'completed_early', 'skipped_with_gap']);

/** Mean mastery overall over the lesson's concepts; a concept without a row counts 0. */
export function lessonMeanOverall(conceptSlugs: readonly string[], masteries: readonly Pick<MasteryRow, 'conceptId' | 'overall'>[]): number {
  if (conceptSlugs.length === 0) return 0;
  const by = new Map(masteries.map((m) => [m.conceptId, m.overall]));
  return conceptSlugs.reduce((s, c) => s + (by.get(c) ?? 0), 0) / conceptSlugs.length;
}

/** 1.0 completed at Competent+, partialCredit completed below, 0 otherwise (skipped_with_gap earns nothing until closed). */
export function dayCredit(status: LessonStatus | undefined, meanOverall: number, config: GamificationConfig): number {
  if (!status || !DONE.has(status)) return 0;
  return meanOverall >= config.longTerm.competentThreshold ? 1 : config.longTerm.partialCredit;
}

function coreDayLessons(lessons: readonly LessonRow[], config: GamificationConfig): Map<number, LessonRow> {
  const byDay = new Map<number, LessonRow>();
  for (const l of lessons) {
    if (l.visibility !== 'core' || l.day === null || l.day < 1 || l.day > config.longTerm.coreDays) continue;
    if (!byDay.has(l.day)) byDay.set(l.day, l);
  }
  return byDay;
}

/** Smallest core day not completed / completed_early / skipped_with_gap; coreDays + 1 once every day is consumed. */
export function dayIndex(lessons: readonly LessonRow[], progress: readonly LessonProgressRow[], config: GamificationConfig): number {
  const byDay = coreDayLessons(lessons, config);
  const status = new Map(progress.map((p) => [p.lessonSlug, p.status]));
  for (let day = 1; day <= config.longTerm.coreDays; day++) {
    const lesson = byDay.get(day);
    if (!lesson || !CONSUMED.has(status.get(lesson.slug) ?? 'not_started')) return day;
  }
  return config.longTerm.coreDays + 1;
}

export interface LongTermInput {
  lessons: readonly LessonRow[];
  lessonProgress: readonly LessonProgressRow[];
  masteries: readonly MasteryRow[];
  missions: readonly MissionRow[];
  attempts: readonly AttemptRow[];
  todayLocal: string;
}

export function deriveLongTermProgress(input: LongTermInput, config: GamificationConfig): LongTermProgress {
  const { lessons, lessonProgress, masteries, missions, attempts, todayLocal } = input;
  const { weights, coreDays, capstoneAttemptedCredit } = config.longTerm;
  const status = new Map(lessonProgress.map((p) => [p.lessonSlug, p.status]));

  let credit = 0;
  let lessonsCompleted = 0;
  let lessonsCompetent = 0;
  for (const lesson of coreDayLessons(lessons, config).values()) {
    const s = status.get(lesson.slug);
    const c = dayCredit(s, lessonMeanOverall(lesson.concepts, masteries), config);
    credit += c;
    if (s && DONE.has(s)) {
      lessonsCompleted += 1;
      if (c === 1) lessonsCompetent += 1;
    }
  }
  const lessonCredit = credit / coreDays;

  const defeatedMissions = new Set<string>();
  let capstoneCredit = 0;
  for (const a of attempts) {
    if (a.kind === 'boss' && a.bossKind === 'mission' && a.bossRef && bossDefeated(a)) defeatedMissions.add(a.bossRef);
    if (a.kind === 'capstone') capstoneCredit = Math.max(capstoneCredit, bossDefeated(a) ? 1 : capstoneAttemptedCredit);
  }
  const missionSlugs = new Set(missions.map((m) => m.slug));
  const bossCredit = missions.length > 0 ? [...defeatedMissions].filter((r) => missionSlugs.has(r)).length / missions.length : 0;

  const pct = Math.round(100 * (weights.lessons * lessonCredit + weights.bosses * bossCredit + weights.capstone * capstoneCredit));
  const first = minDate(attempts.map((a) => a.localDate));
  const calendarDay = first ? Math.max(1, daysBetween(first, todayLocal) + 1) : 1;

  return { pct, dayIndex: dayIndex(lessons, lessonProgress, config), calendarDay, lessonsCompleted, lessonsCompetent };
}

/**
 * Lesson status after a flex action, as the learning engine records it: `next_mission` with the early-advance
 * condition true is `completed_early` (full credit), false is `skipped_with_gap`; terminal statuses never move.
 */
export function lessonStatusAfterFlex(current: LessonStatus, action: FlexAction, earlyAdvanceOk: boolean): LessonStatus {
  if (CONSUMED.has(current)) return current;
  if (action !== 'next_mission') return current;
  return earlyAdvanceOk ? 'completed_early' : 'skipped_with_gap';
}

/** Every concept of the lesson has reached Developing (band rank, never a number). */
export function gapClosed(conceptSlugs: readonly string[], masteries: readonly Pick<MasteryRow, 'conceptId' | 'band'>[]): boolean {
  if (conceptSlugs.length === 0) return false;
  const by = new Map(masteries.map((m) => [m.conceptId, m.band]));
  const developing = bandRank('developing');
  return conceptSlugs.every((c) => bandRank(by.get(c) ?? null) >= developing);
}

export interface GapClosureInput {
  lessonSlug: string;
  status: LessonStatus;
  conceptSlugs: readonly string[];
  masteries: readonly Pick<MasteryRow, 'conceptId' | 'band'>[];
  ledger: Iterable<{ reason: XpReason; ref: string | null }>;
}

/**
 * Closes a `skipped_with_gap` lesson once its concepts reach Developing: status -> completed and one
 * `lesson_completed` row, unless the ledger already holds it. Any other status is returned untouched.
 */
export function gapClosureEvents(input: GapClosureInput, config: GamificationConfig): { status: LessonStatus; events: XpEvent[] } {
  if (input.status !== 'skipped_with_gap' || !gapClosed(input.conceptSlugs, input.masteries)) return { status: input.status, events: [] };
  const base = config.xp.base.lesson_completed;
  const events = dedupeOnceOnly([{ reason: 'lesson_completed', ref: input.lessonSlug, base, multiplier: 1, amount: base }], input.ledger);
  return { status: 'completed', events };
}
