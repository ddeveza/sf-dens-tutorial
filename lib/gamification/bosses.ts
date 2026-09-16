// The only defeat verdict in the system (isDefeated), boss status derivation, weekly windows and template choice.
// submitAttempt merges `defeated` into llm_evaluation before record_attempt; SQL and every view only read it.
import { BOSS_RUBRIC_KEYS, CAPSTONE_DIMENSIONS, type BossRubric, type CapstoneRubric } from '../llm/schemas.ts';
import type { GamificationConfig } from './config.ts';
import { asRecord, bossDefeated, numberAt, type AttemptRow, type LessonProgressRow, type LessonRow, type MissionRow, type WeeklyTemplateRow } from './context.ts';
import { addDays, daysBetween, minDate } from './dates.ts';
import type { BossKind, BossStatus, XpEvent } from './types.ts';

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function isCapstoneRubric(rubric: BossRubric | CapstoneRubric): rubric is CapstoneRubric {
  return 'scores' in rubric && typeof (rubric as CapstoneRubric).scores === 'object';
}

/** Rounded mean of the six rubric dimensions; the model's own `overall` is never trusted. */
export function bossOverall(rubric: BossRubric): number {
  return Math.round(mean(BOSS_RUBRIC_KEYS.map((k) => rubric[k])));
}

/** Rounded mean of the twelve capstone dimensions. */
export function capstoneOverall(rubric: CapstoneRubric): number {
  return Math.round(mean(CAPSTONE_DIMENSIONS.map((k) => rubric.scores[k])));
}

export function isDefeated(rubric: BossRubric | CapstoneRubric, kind: BossKind, config: GamificationConfig): boolean {
  if (kind === 'capstone') {
    if (!isCapstoneRubric(rubric)) return false;
    const { minOverall, minDimension, minDimensionsAtOrAbove } = config.boss.capstone;
    const atOrAbove = CAPSTONE_DIMENSIONS.filter((k) => rubric.scores[k] >= minDimension).length;
    return capstoneOverall(rubric) >= minOverall && atOrAbove >= minDimensionsAtOrAbove;
  }
  if (isCapstoneRubric(rubric)) return false;
  const { minOverall, minDimension } = config.boss[kind];
  return bossOverall(rubric) >= minOverall && BOSS_RUBRIC_KEYS.every((k) => rubric[k] >= minDimension);
}

/** Lowest-scoring rubric key, for "what to practise before the retry". */
export function weakestDimension(rubric: BossRubric | CapstoneRubric): string {
  const entries: Array<[string, number]> = isCapstoneRubric(rubric)
    ? CAPSTONE_DIMENSIONS.map((k) => [k, rubric.scores[k]])
    : BOSS_RUBRIC_KEYS.map((k) => [k, rubric[k]]);
  return entries.reduce((weakest, entry) => (entry[1] < weakest[1] ? entry : weakest))[0];
}

const ATTEMPTED_REASON = { mission: 'mission_boss_attempted', weekly: 'weekly_boss_attempted', capstone: 'capstone_attempted' } as const;
const DEFEATED_REASON = { mission: 'mission_boss_defeated', weekly: 'weekly_boss_defeated', capstone: 'capstone_passed' } as const;

/** Flat XP rows for a boss attempt: attempted always, defeated on a true verdict. Both once-only by ref. */
export function bossXpEvents(input: { kind: BossKind; ref: string; defeated: boolean }, config: GamificationConfig): XpEvent[] {
  const base = config.xp.base;
  const events: XpEvent[] = [];
  const attempted = base[ATTEMPTED_REASON[input.kind]];
  events.push({ reason: ATTEMPTED_REASON[input.kind], ref: input.ref, base: attempted, multiplier: 1, amount: attempted });
  if (input.defeated) {
    const defeated = base[DEFEATED_REASON[input.kind]];
    events.push({ reason: DEFEATED_REASON[input.kind], ref: input.ref, base: defeated, multiplier: 1, amount: defeated });
  }
  return events;
}

// ---- weekly windows -------------------------------------------------------------------------------------

export function weeklyBossRef(week: number): string {
  return `weekly-w${String(week).padStart(2, '0')}`;
}

export interface WeeklyWindow {
  week: number;
  ref: string;
  startsOn: string; // inclusive
  endsOn: string; // inclusive
  availableOn: string; // first local date the boss can be attempted
}

/** Week W covers local dates [first + 7(W-1), first + 7W) and unlocks on first + 7W. */
export function weeklyBossWindow(firstAttemptDate: string, week: number, config: GamificationConfig): WeeklyWindow {
  const len = config.boss.weekLengthDays;
  const startsOn = addDays(firstAttemptDate, len * (week - 1));
  return { week, ref: weeklyBossRef(week), startsOn, endsOn: addDays(startsOn, len - 1), availableOn: addDays(startsOn, len) };
}

/** 1-based week index of a local date relative to the first attempt date (dates before it map to week 1). */
export function weekIndexFor(localDate: string, firstAttemptDate: string, config: GamificationConfig): number {
  return Math.max(1, Math.floor(daysBetween(firstAttemptDate, localDate) / config.boss.weekLengthDays) + 1);
}

function conceptsOf(attempt: Pick<AttemptRow, 'conceptId' | 'conceptIds'>): string[] {
  return attempt.conceptId ? [attempt.conceptId] : attempt.conceptIds;
}

/** Concepts whose first-ever attempt falls inside week W, in first-attempt order. */
export function conceptsFirstAttemptedInWeek(
  attempts: readonly Pick<AttemptRow, 'conceptId' | 'conceptIds' | 'localDate'>[],
  firstAttemptDate: string,
  week: number,
  config: GamificationConfig,
): string[] {
  const first = new Map<string, string>();
  for (const a of attempts) {
    for (const c of conceptsOf(a)) {
      const known = first.get(c);
      if (known === undefined || a.localDate < known) first.set(c, a.localDate);
    }
  }
  const { startsOn, endsOn } = weeklyBossWindow(firstAttemptDate, week, config);
  return [...first.entries()]
    .filter(([, date]) => date >= startsOn && date <= endsOn)
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([concept]) => concept);
}

/** Template with the largest overlap with the week's concept set; first wins ties; null without any overlap. */
export function selectWeeklyTemplate<T extends { id: string; concepts: readonly string[] }>(
  templates: readonly T[],
  concepts: readonly string[],
): T | null {
  const set = new Set(concepts);
  let best: T | null = null;
  let bestOverlap = 0;
  for (const t of templates) {
    const overlap = t.concepts.filter((c) => set.has(c)).length;
    if (overlap > bestOverlap) {
      best = t;
      bestOverlap = overlap;
    }
  }
  return best;
}

// ---- unlock rules ---------------------------------------------------------------------------------------

const DONE = new Set<LessonProgressRow['status']>(['completed', 'completed_early']);

function statusMap(progress: readonly LessonProgressRow[]): Map<string, LessonProgressRow['status']> {
  return new Map(progress.map((p) => [p.lessonSlug, p.status]));
}

/** Every core, non-boss lesson of the mission is completed / completed_early (closed gaps count; side quests never). */
export function missionBossUnlocked(missionSlug: string, lessons: readonly LessonRow[], progress: readonly LessonProgressRow[]): boolean {
  const required = lessons.filter((l) => l.missionSlug === missionSlug && l.visibility === 'core' && l.kind !== 'boss' && l.kind !== 'capstone');
  if (required.length === 0) return false;
  const status = statusMap(progress);
  return required.every((l) => DONE.has(status.get(l.slug) ?? 'not_started'));
}

export function defeatedBossRefs(attempts: readonly Pick<AttemptRow, 'kind' | 'bossRef' | 'llmEvaluation'>[]): Set<string> {
  const refs = new Set<string>();
  for (const a of attempts) if ((a.kind === 'boss' || a.kind === 'capstone') && a.bossRef && bossDefeated(a)) refs.add(a.bossRef);
  return refs;
}

/** All mission bosses defeated, or every core lesson with day <= coreDays completed / completed_early. */
export function capstoneUnlocked(
  input: { missions: readonly MissionRow[]; lessons: readonly LessonRow[]; lessonProgress: readonly LessonProgressRow[]; attempts: readonly AttemptRow[] },
  config: GamificationConfig,
): boolean {
  const defeated = defeatedBossRefs(input.attempts);
  if (input.missions.length > 0 && input.missions.every((m) => defeated.has(m.slug))) return true;
  const core = input.lessons.filter((l) => l.visibility === 'core' && l.day !== null && l.day <= config.longTerm.coreDays);
  if (core.length === 0) return false;
  const status = statusMap(input.lessonProgress);
  return core.every((l) => DONE.has(status.get(l.slug) ?? 'not_started'));
}

// ---- status ---------------------------------------------------------------------------------------------

export interface BossStatusInput {
  attempts: readonly AttemptRow[]; // attempts on this boss ref only
  unlocked: boolean;
  todayLocal: string;
  availableOn?: string | null; // known unlock date (weekly)
  newerOutstanding?: number; // weekly: newer weekly bosses that exist
}

export function bossStatus(input: BossStatusInput, config: GamificationConfig): { status: BossStatus; availableAt: string | null } {
  if (input.attempts.some(bossDefeated)) return { status: 'defeated', availableAt: null };
  if ((input.newerOutstanding ?? 0) >= config.boss.weekly.maxOutstanding) return { status: 'expired', availableAt: null };
  if (!input.unlocked) return { status: 'locked', availableAt: input.availableOn ?? null };
  const last = [...input.attempts].sort((a, b) => (a.localDate < b.localDate ? 1 : a.localDate > b.localDate ? -1 : 0))[0];
  if (last) {
    const availableAt = addDays(last.localDate, config.boss.cooldownDays);
    if (availableAt > input.todayLocal) return { status: 'cooldown', availableAt };
  }
  return { status: 'available', availableAt: null };
}

/** `{ overall, weakest }` from the latest attempt's stored rubric, or null. */
export function lastRubricSummary(attempts: readonly AttemptRow[]): { overall: number; weakest: string } | null {
  const last = [...attempts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
  const rubric = asRecord(last?.llmEvaluation);
  if (!rubric) return null;
  if (asRecord(rubric.scores)) {
    const r = rubric as unknown as CapstoneRubric;
    return { overall: capstoneOverall(r), weakest: weakestDimension(r) };
  }
  if (BOSS_RUBRIC_KEYS.every((k) => numberAt(rubric, k) !== null)) {
    const r = rubric as unknown as BossRubric;
    return { overall: bossOverall(r), weakest: weakestDimension(r) };
  }
  return null;
}

export interface BossCard {
  kind: BossKind;
  ref: string;
  title: string;
  status: BossStatus;
  availableAt: string | null;
  lastRubric: { overall: number; weakest: string } | null;
  missionSlug: string | null;
  week: number | null;
  templateId: string | null;
  concepts: string[];
}

export interface BossBoardInput {
  attempts: readonly AttemptRow[];
  lessons: readonly LessonRow[];
  missions: readonly MissionRow[];
  lessonProgress: readonly LessonProgressRow[];
  weeklyTemplates: readonly WeeklyTemplateRow[];
  todayLocal: string;
}

/** Every boss the learner can see, with derived status: mission bosses in order, weekly instances, capstone. */
export function deriveBossBoard(input: BossBoardInput, config: GamificationConfig): BossCard[] {
  const { attempts, lessons, missions, lessonProgress, weeklyTemplates, todayLocal } = input;
  const byRef = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    if (!a.bossRef) continue;
    const list = byRef.get(a.bossRef) ?? [];
    list.push(a);
    byRef.set(a.bossRef, list);
  }
  const cards: BossCard[] = [];
  const lessonBySlug = new Map(lessons.map((l) => [l.slug, l]));

  for (const m of missions) {
    const own = byRef.get(m.slug) ?? [];
    const { status, availableAt } = bossStatus({ attempts: own, unlocked: missionBossUnlocked(m.slug, lessons, lessonProgress), todayLocal }, config);
    const bossLesson = m.bossLessonSlug ? lessonBySlug.get(m.bossLessonSlug) : lessons.find((l) => l.missionSlug === m.slug && l.kind === 'boss');
    cards.push({
      kind: 'mission',
      ref: m.slug,
      title: bossLesson?.title ?? `${m.title} boss`,
      status,
      availableAt,
      lastRubric: lastRubricSummary(own),
      missionSlug: m.slug,
      week: null,
      templateId: null,
      concepts: bossLesson?.concepts ?? [],
    });
  }

  const firstAttemptDate = minDate(attempts.map((a) => a.localDate));
  if (firstAttemptDate) {
    const currentWeek = weekIndexFor(todayLocal, firstAttemptDate, config);
    const instances: Array<{ window: WeeklyWindow; concepts: string[]; unlocked: boolean }> = [];
    for (let week = 1; week <= currentWeek; week++) {
      const window = weeklyBossWindow(firstAttemptDate, week, config);
      const concepts = conceptsFirstAttemptedInWeek(attempts, firstAttemptDate, week, config);
      const hasAttempts = (byRef.get(window.ref) ?? []).length > 0;
      if (concepts.length < config.boss.weekly.minConcepts && !hasAttempts) continue;
      instances.push({ window, concepts, unlocked: window.availableOn <= todayLocal });
    }
    for (const inst of instances) {
      const own = byRef.get(inst.window.ref) ?? [];
      const newerOutstanding = instances.filter((o) => o.window.week > inst.window.week && o.unlocked).length;
      const { status, availableAt } = bossStatus(
        { attempts: own, unlocked: inst.unlocked, todayLocal, availableOn: inst.window.availableOn, newerOutstanding },
        config,
      );
      const template = selectWeeklyTemplate(weeklyTemplates, inst.concepts);
      cards.push({
        kind: 'weekly',
        ref: inst.window.ref,
        title: template?.title ?? `Weekly boss ${inst.window.week}`,
        status,
        availableAt,
        lastRubric: lastRubricSummary(own),
        missionSlug: null,
        week: inst.window.week,
        templateId: template?.id ?? null,
        concepts: inst.concepts,
      });
    }
  }

  const capstoneAttempts = attempts.filter((a) => a.kind === 'capstone');
  const capstoneLesson = lessons.find((l) => l.kind === 'capstone');
  const { status, availableAt } = bossStatus(
    { attempts: capstoneAttempts, unlocked: capstoneUnlocked({ missions, lessons, lessonProgress, attempts }, config), todayLocal },
    config,
  );
  cards.push({
    kind: 'capstone',
    ref: 'capstone',
    title: capstoneLesson?.title ?? 'Capstone',
    status,
    availableAt,
    lastRubric: lastRubricSummary(capstoneAttempts),
    missionSlug: null,
    week: null,
    templateId: null,
    concepts: capstoneLesson?.concepts ?? [],
  });

  return cards;
}

/**
 * The single boss card the dashboard shows: an available capstone, then the first available mission boss, then the
 * newest available weekly, then the soonest cooldown, then the current mission's locked boss (or the first locked one).
 */
export function pickDashboardBoss(board: readonly BossCard[], currentMissionSlug: string | null): BossCard | null {
  const available = board.filter((b) => b.status === 'available');
  const capstone = available.find((b) => b.kind === 'capstone');
  if (capstone) return capstone;
  const mission = available.find((b) => b.kind === 'mission');
  if (mission) return mission;
  const weekly = available.filter((b) => b.kind === 'weekly').sort((a, b) => (b.week ?? 0) - (a.week ?? 0))[0];
  if (weekly) return weekly;
  const cooldown = board
    .filter((b) => b.status === 'cooldown')
    .sort((a, b) => ((a.availableAt ?? '') < (b.availableAt ?? '') ? -1 : (a.availableAt ?? '') > (b.availableAt ?? '') ? 1 : 0))[0];
  if (cooldown) return cooldown;
  const locked = board.filter((b) => b.status === 'locked');
  return locked.find((b) => b.kind === 'mission' && b.missionSlug === currentMissionSlug) ?? locked.find((b) => b.kind === 'mission') ?? locked[0] ?? null;
}
