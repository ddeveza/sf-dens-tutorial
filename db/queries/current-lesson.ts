// The dashboard's "today's mission": which lesson the learner is on, and how far into it they are. The pick is a
// registry read plus one step-state read; the numbers come from lib/learning-engine, which stays pure.
import 'server-only';
import { lessonProgress as lessonProgressPct, nextSegment } from '@/lib/learning-engine';
import type { CurrentLessonState } from '@/lib/gamification/context';
import { listLessons, type LessonRow } from './curriculum';
import { getStepStates, listLessonProgress, toStepState } from './steps';
import type { Db } from './client';

/** Core path only: side quests and labs never become "today's mission" (they are chosen from the world page). */
function isCorePath(lesson: LessonRow): boolean {
  return lesson.visibility === 'core' && (lesson.kind === 'lesson' || lesson.kind === 'boss' || lesson.kind === 'capstone');
}

function byDayThenOrdinal(a: LessonRow, b: LessonRow): number {
  const dayA = a.day ?? Number.MAX_SAFE_INTEGER;
  const dayB = b.day ?? Number.MAX_SAFE_INTEGER;
  return dayA !== dayB ? dayA - dayB : a.ordinal - b.ordinal;
}

/**
 * The first core lesson that is not completed, with its live step state. `null` when every core lesson is done (the
 * capstone then surfaces through the boss card) or when the registry is still empty.
 */
export async function loadCurrentLesson(db: Db, userId: string): Promise<CurrentLessonState | null> {
  const [lessons, progress] = await Promise.all([listLessons(db), listLessonProgress(db, userId)]);
  const completed = new Set(progress.filter((row) => row.status === 'completed').map((row) => row.lesson_id));

  const next = lessons.filter(isCorePath).sort(byDayThenOrdinal).find((lesson) => !completed.has(lesson.id));
  if (!next) return null;

  const steps = (await getStepStates(db, userId, next.id)).map(toStepState);
  return {
    lessonSlug: next.id,
    progressPct: lessonProgressPct(steps),
    nextStep: nextSegment(steps),
    // Phase 4 replaces this with selectNextAction's flex actions; before mastery data exists the only move is to continue.
    actions: ['continue'],
  };
}
