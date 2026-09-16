import 'server-only';
// Template data for one learner, built from the same context the dashboard uses so the email can never disagree
// with the page it links to. Called only for learners `selectDue` picked, so the per-user cost is bounded by
// NOTIFICATION_CONFIG.maxSendsPerRun.
import { loadCurrentLesson } from '@/db/queries/current-lesson';
import { loadDashboardContext } from '@/db/queries/dashboard';
import type { AdminDb } from '@/db/admin';
import { getLesson, getWeeklyTemplates, listWorlds, toWeeklyTemplateRows } from '@/lib/curriculum';
import { GAMIFICATION_CONFIG, buildDashboardViewModel } from '@/lib/gamification';
import type { NotificationKind, TemplateData } from '@/lib/notifications';

function conceptTitles(registry: { concepts: readonly { slug: string; title: string }[] }, slugs: readonly string[]): string[] {
  const titleOf = new Map(registry.concepts.map((concept) => [concept.slug, concept.title] as const));
  return slugs.map((slug) => titleOf.get(slug) ?? slug);
}

/**
 * `render` for `sendDueNotifications`. The returned object's `kind` always equals the requested kind; the service
 * rejects a mismatch rather than sending the wrong email.
 */
export async function renderForUser(admin: AdminDb, siteUrl: string, kind: NotificationKind, userId: string): Promise<TemplateData> {
  const weeklyTemplates = toWeeklyTemplateRows(listWorlds().flatMap((world) => getWeeklyTemplates(world.slug)));
  const currentLesson = await loadCurrentLesson(admin, userId);
  const context = await loadDashboardContext(admin, userId, { currentLesson, weeklyTemplates });
  const view = buildDashboardViewModel(context.gamification, context.now);
  const registry = context.gamification.registry;

  if (kind === 'streak_at_risk') {
    const dueItem = context.gamification.reviewItems.find((item) => item.dueOn <= context.todayLocal) ?? null;
    return {
      kind,
      siteUrl,
      streakDays: view.streak.current,
      minAttempts: GAMIFICATION_CONFIG.streak.minAttempts,
      quickestReview: dueItem ? { concept: conceptTitles(registry, [dueItem.conceptId])[0] } : null,
    };
  }

  const mission = view.todayMission;
  const missionTitle = mission ? (registry.missions.find((row) => row.slug === mission.missionSlug)?.title ?? mission.missionSlug) : 'Your next mission';
  const lessonTitle = mission?.title ?? 'Pick up where you left off';
  const day = mission?.dayIndex ?? view.longTerm.dayIndex;

  if (kind === 'review_due') {
    const dueSlugs = context.gamification.reviewItems.filter((item) => item.dueOn <= context.todayLocal).map((item) => item.conceptId);
    const weakestRow = [...context.gamification.masteries].sort((a, b) => a.overall - b.overall)[0];
    return {
      kind,
      siteUrl,
      day,
      lessonTitle,
      missionTitle,
      reviewsDue: view.reviewsDue.due,
      weakest: weakestRow ? { concept: conceptTitles(registry, [weakestRow.conceptId])[0], band: weakestRow.band } : null,
      dueConcepts: conceptTitles(registry, dueSlugs),
    };
  }

  // Authored curiosity text is the teaser; with no lesson body published the title still makes a specific subject.
  const lesson = mission ? getLesson(mission.lessonSlug, context.todayLocal)?.lesson : null;
  return {
    kind: 'daily_reminder',
    siteUrl,
    day,
    lessonTitle,
    missionTitle,
    streakDays: view.streak.current,
    level: view.level.level,
    levelTitle: view.level.title,
    teaser: lesson?.curiosity.technical ?? `What do you already expect to be true about ${lessonTitle.toLowerCase()}?`,
  };
}
