// Public surface of lib/gamification: the two view-model builders plus every engine, re-exported.
// Pure: db/queries/dashboard.ts loads a GamificationContext, the page renders the result.
import type { LessonStatus } from '../learning-engine/types.ts';
import type { DimensionScores } from '../mastery-engine/types.ts';
import { DIMENSIONS } from '../mastery-engine/types.ts';
import { achievementFor, type AchievementContext } from './achievements.ts';
import { deriveBossBoard, pickDashboardBoss } from './bosses.ts';
import { GAMIFICATION_CONFIG, type GamificationConfig } from './config.ts';
import { bossDefeated, type AttemptRow, type GamificationContext, type MasteryRow } from './context.ts';
import { isoWeekOf, localHourOf } from './dates.ts';
import { deriveKnowledgeMap, pickWeakArea } from './knowledge-map.ts';
import { levelView } from './level.ts';
import { deriveLongTermProgress } from './long-term.ts';
import { deriveSkillBars } from './skills.ts';
import { deriveStats, repeatedMistakes, reviewsDue } from './stats.ts';
import { deriveStreak, qualifyingDaysFromAttempts } from './streak.ts';
import type { DashboardViewModel, ProgressViewModel, XpEvent } from './types.ts';

export * from './types.ts';
export * from './context.ts';
export * from './config.ts';
export * from './dates.ts';
export * from './xp.ts';
export * from './level.ts';
export * from './streak.ts';
export * from './achievements.ts';
export * from './skills.ts';
export * from './knowledge-map.ts';
export * from './bosses.ts';
export * from './stats.ts';
export * from './long-term.ts';

const DONE = new Set<LessonStatus>(['completed', 'completed_early']);

function toIso(now: string | Date): string {
  return typeof now === 'string' ? new Date(now).toISOString() : now.toISOString();
}

function xpTotalOf(ctx: GamificationContext): number {
  return ctx.xpTransactions.reduce((s, r) => s + r.amount, 0);
}

function meanOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

/** Mean of every dimension over mastery rows with evidence in that dimension; null without any mastery. */
export function deriveRadar(masteries: readonly MasteryRow[]): DimensionScores | null {
  if (masteries.length === 0) return null;
  const radar = {} as DimensionScores;
  for (const d of DIMENSIONS) {
    const evidenced = masteries.filter((m) => m.evidenceByDimension[d] >= 1).map((m) => m.scores[d]);
    radar[d] = meanOrNull(evidenced) ?? 0;
  }
  return radar;
}

/**
 * Assembles the AchievementContext the Server Action hands to evaluateAchievements(): the loaded context plus the
 * attempt being recorded, its XP events so far and the concept's mastery before/after.
 */
export function toAchievementContext(
  ctx: GamificationContext,
  extras: { attempt: AttemptRow; xpEventsSoFar: readonly XpEvent[]; masteryBefore: MasteryRow | null; masteryAfter: MasteryRow | null },
  config: GamificationConfig = GAMIFICATION_CONFIG,
): AchievementContext {
  const attempts = [...ctx.attempts.filter((a) => a.id !== extras.attempt.id), extras.attempt];
  const days = new Set([...ctx.qualifyingDays, ...qualifyingDaysFromAttempts(attempts, config.streak)]);
  return {
    attempt: extras.attempt,
    attempts,
    xpTransactions: ctx.xpTransactions,
    xpEventsSoFar: extras.xpEventsSoFar,
    masteries: ctx.masteries,
    masteryBefore: extras.masteryBefore,
    masteryAfter: extras.masteryAfter,
    reviewItems: ctx.reviewItems,
    streak: deriveStreak(days, ctx.todayLocal, config.streak),
    missions: ctx.registry.missions,
    todayLocal: ctx.todayLocal,
    config,
  };
}

export function buildDashboardViewModel(ctx: GamificationContext, now: string | Date, config: GamificationConfig = GAMIFICATION_CONFIG): DashboardViewModel {
  const { registry, todayLocal } = ctx;
  const generatedAt = toIso(now);
  const streak = deriveStreak(new Set(ctx.qualifyingDays), todayLocal, config.streak);
  const level = levelView(xpTotalOf(ctx), config);

  const lessonBySlug = new Map(registry.lessons.map((l) => [l.slug, l]));
  const missionBySlug = new Map(registry.missions.map((m) => [m.slug, m]));
  const longTerm = deriveLongTermProgress(
    { lessons: registry.lessons, lessonProgress: ctx.lessonProgress, masteries: ctx.masteries, missions: registry.missions, attempts: ctx.attempts, todayLocal },
    config,
  );

  let todayMission: DashboardViewModel['todayMission'] = null;
  const current = ctx.currentLesson ? lessonBySlug.get(ctx.currentLesson.lessonSlug) : undefined;
  if (ctx.currentLesson && current) {
    const mission = missionBySlug.get(current.missionSlug);
    todayMission = {
      worldSlug: mission?.worldSlug ?? '',
      missionSlug: current.missionSlug,
      lessonSlug: current.slug,
      title: current.title,
      dayIndex: current.day ?? longTerm.dayIndex,
      progressPct: ctx.currentLesson.progressPct,
      nextStep: ctx.currentLesson.nextStep,
      actions: [...ctx.currentLesson.actions],
    };
  }

  const board = deriveBossBoard(
    { attempts: ctx.attempts, lessons: registry.lessons, missions: registry.missions, lessonProgress: ctx.lessonProgress, weeklyTemplates: registry.weeklyTemplates, todayLocal },
    config,
  );
  const bossCard = pickDashboardBoss(board, current?.missionSlug ?? null);
  const boss: DashboardViewModel['boss'] = bossCard
    ? { kind: bossCard.kind, ref: bossCard.ref, title: bossCard.title, status: bossCard.status, availableAt: bossCard.availableAt, lastRubric: bossCard.lastRubric }
    : null;

  const knowledgeMap = deriveKnowledgeMap(registry.concepts, ctx.masteries, ctx.attempts, ctx.reviewItems, todayLocal, config);
  const weakNode = pickWeakArea(knowledgeMap, ctx.attempts, todayLocal, config);
  const weakArea: DashboardViewModel['weakArea'] = weakNode
    ? { conceptSlug: weakNode.slug, name: weakNode.name, overall: weakNode.overall ?? 0, reasons: weakNode.weakReasons, reviewSlug: weakNode.slug }
    : null;

  const unlocks = ctx.xpTransactions
    .filter((r) => r.reason === 'achievement_unlocked' && r.ref)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const latest = unlocks[0];
  const recentAchievement: DashboardViewModel['recentAchievement'] = latest
    ? { id: latest.ref ?? '', name: achievementFor(latest.ref ?? '')?.name ?? latest.ref ?? '', unlockedAt: latest.createdAt, xp: latest.amount }
    : null;
  const pendingUnlockToasts = unlocks
    .filter((r) => ctx.lastDashboardViewedAt === null || r.createdAt > ctx.lastDashboardViewedAt)
    .slice(0, config.guardrails.maxToasts)
    .map((r) => ({ id: r.ref ?? '', name: achievementFor(r.ref ?? '')?.name ?? r.ref ?? '', xp: r.amount }));

  const todayRows = ctx.xpTransactions.filter((r) => r.localDate === todayLocal);

  return {
    generatedAt,
    greeting: { localHour: localHourOf(generatedAt, ctx.profile.timeZone), displayName: ctx.profile.displayName },
    streak,
    level,
    todayMission,
    boss,
    weakArea,
    reviewsDue: reviewsDue(ctx.reviewItems, todayLocal),
    recentAchievement,
    pendingUnlockToasts,
    skills: deriveSkillBars(registry.concepts, ctx.masteries, config),
    longTerm,
    stats: deriveStats({ attempts: ctx.attempts, masteries: ctx.masteries, reviewItems: ctx.reviewItems, todayLocal }, config),
    xpToday: { amount: todayRows.reduce((s, r) => s + r.amount, 0), events: todayRows.map((r) => ({ reason: r.reason, amount: r.amount, ref: r.ref })) },
  };
}

// `now` is accepted for symmetry with the dashboard builder; every date in the progress model is learner-local.
export function buildProgressViewModel(ctx: GamificationContext, now: string | Date, config: GamificationConfig = GAMIFICATION_CONFIG): ProgressViewModel {
  const { registry, todayLocal } = ctx;
  const status = new Map(ctx.lessonProgress.map((p) => [p.lessonSlug, p.status]));
  const masteryBy = new Map(ctx.masteries.map((m) => [m.conceptId, m]));
  const defeated = new Set<string>();
  for (const a of ctx.attempts) if (a.kind === 'boss' && a.bossKind === 'mission' && a.bossRef && bossDefeated(a)) defeated.add(a.bossRef);

  const worlds: ProgressViewModel['worlds'] = [...registry.worlds]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((world) => {
      const missions = registry.missions.filter((m) => m.worldSlug === world.slug);
      const missionSlugs = new Set(missions.map((m) => m.slug));
      const core = registry.lessons.filter((l) => missionSlugs.has(l.missionSlug) && l.visibility === 'core' && l.day !== null && l.day <= config.longTerm.coreDays);
      let completed = 0;
      let competent = 0;
      for (const lesson of core) {
        const s = status.get(lesson.slug);
        if (!s || !DONE.has(s)) continue;
        completed += 1;
        const mean = lesson.concepts.length === 0 ? 0 : lesson.concepts.reduce((acc, c) => acc + (masteryBy.get(c)?.overall ?? 0), 0) / lesson.concepts.length;
        if (mean >= config.longTerm.competentThreshold) competent += 1;
      }
      const overalls = registry.concepts.filter((c) => c.worldSlug === world.slug).map((c) => masteryBy.get(c.slug)?.overall).filter((v): v is number => v !== undefined);
      return {
        slug: world.slug,
        name: world.title,
        coreLessons: core.length,
        completed,
        competent,
        bosses: { defeated: missions.filter((m) => defeated.has(m.slug)).length, total: missions.length },
        meanOverall: meanOrNull(overalls),
      };
    });

  const weeks = new Map<string, ProgressViewModel['weekly'][number]>();
  const weekOf = (localDate: string) => {
    const key = isoWeekOf(localDate);
    const row = weeks.get(key) ?? { isoWeek: key, xp: 0, attempts: 0, lessonsCompleted: 0, bandUps: 0 };
    weeks.set(key, row);
    return row;
  };
  const days = new Map<string, ProgressViewModel['history'][number]>();
  const dayOf = (localDate: string) => {
    const row = days.get(localDate) ?? { localDate, xp: 0, attempts: 0 };
    days.set(localDate, row);
    return row;
  };
  for (const r of ctx.xpTransactions) {
    const w = weekOf(r.localDate);
    w.xp += r.amount;
    if (r.reason === 'lesson_completed') w.lessonsCompleted += 1;
    if (r.reason === 'band_reached') w.bandUps += 1;
    dayOf(r.localDate).xp += r.amount;
  }
  for (const a of ctx.attempts) {
    weekOf(a.localDate).attempts += 1;
    dayOf(a.localDate).attempts += 1;
  }
  const sortKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  return {
    worlds,
    weekly: [...weeks.values()].sort((a, b) => sortKey(a.isoWeek, b.isoWeek)),
    knowledgeMap: deriveKnowledgeMap(registry.concepts, ctx.masteries, ctx.attempts, ctx.reviewItems, todayLocal, config),
    skills: deriveSkillBars(registry.concepts, ctx.masteries, config),
    radar: deriveRadar(ctx.masteries),
    history: [...days.values()].sort((a, b) => sortKey(a.localDate, b.localDate)),
    repeatedMistakes: repeatedMistakes(ctx.attempts, config),
  };
}
