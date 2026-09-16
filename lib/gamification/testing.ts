// Test factories for lib/gamification. Plain rows with sensible defaults; every test overrides what it asserts on.
// Imported only by *.test.ts files in this directory (never by app code).
import type { BossRubric, CapstoneRubric } from '../llm/schemas.ts';
import type { Band, DimensionScores } from '../mastery-engine/types.ts';
import type { GamificationConfig } from './config.ts';
import type {
  AttemptRow,
  ConceptRow,
  GamificationContext,
  LessonProgressRow,
  LessonRow,
  MasteryRow,
  MissionRow,
  ReviewItemRow,
  WeeklyTemplateRow,
  WorldRow,
  XpTransactionRow,
} from './context.ts';
import { toUtcMs } from './dates.ts';
import type { XpEvent } from './types.ts';
import { computeXpEvents, type ComputeXpInput } from './xp.ts';

let seq = 0;
const HOUR_MS = 3_600_000;

export function resetSeq(): void {
  seq = 0;
}

function stamp(localDate: string, offset: number): string {
  return new Date(toUtcMs(localDate) + 12 * HOUR_MS + offset * 1000).toISOString();
}

export function makeAttempt(o: Partial<AttemptRow> = {}): AttemptRow {
  seq += 1;
  const localDate = o.localDate ?? '2026-09-07';
  return {
    id: seq,
    kind: 'question',
    questionType: 'mcq',
    lessonSlug: 'd001-intro',
    conceptId: 'concept-a',
    conceptIds: [],
    exerciseId: `d001-intro/q${seq}`,
    formKey: `d001-intro/q${seq}`,
    dimension: 'recall',
    depth: 2,
    score: 100,
    correct: true,
    passed: true,
    selfConfidence: null,
    probeAngle: null,
    reviewItemId: null,
    bossKind: null,
    bossRef: null,
    answer: {},
    llmEvaluation: null,
    misconceptionIds: [],
    status: 'evaluated',
    durationMs: 60_000,
    localDate,
    createdAt: stamp(localDate, seq),
    ...o,
  };
}

export function scores(overall: number, o: Partial<DimensionScores> = {}): DimensionScores {
  return {
    recall: overall,
    understanding: overall,
    application: overall,
    debugging: overall,
    architecture: overall,
    teach_back: overall,
    ...o,
  };
}

export function makeMastery(o: Partial<MasteryRow> & { conceptId: string }): MasteryRow {
  const overall = o.overall ?? 70;
  const s = o.scores ?? scores(overall);
  return {
    band: bandOf(overall),
    evidenceCount: 3,
    evidenceByDimension: {
      recall: 1,
      understanding: 1,
      application: 1,
      debugging: 1,
      architecture: 1,
      teach_back: 1,
    },
    updatedAt: '2026-09-07T12:00:00.000Z',
    ...o,
    overall,
    scores: s,
  };
}

// Test-only band helper mirroring MASTERY_CONFIG.bands (lost 0-39, familiar 40-59, developing 60-74, competent 75-84, strong 85-94, mastered 95-100).
export function bandOf(overall: number): Band {
  if (overall >= 95) return 'mastered';
  if (overall >= 85) return 'strong';
  if (overall >= 75) return 'competent';
  if (overall >= 60) return 'developing';
  if (overall >= 40) return 'familiar';
  return 'lost';
}

export function makeConcept(o: Partial<ConceptRow> & { slug: string }): ConceptRow {
  return { parentSlug: null, worldSlug: 'w1-platform', title: o.slug, skills: { platform: 1 }, importance: 1, ...o };
}

export function makeWorld(o: Partial<WorldRow> = {}): WorldRow {
  return { slug: 'w1-platform', ordinal: 1, title: 'Platform', skill: 'platform', ...o };
}

export function makeMission(o: Partial<MissionRow> = {}): MissionRow {
  return { slug: 'w1-m1-basics', worldSlug: 'w1-platform', ordinal: 1, title: 'Basics', bossLessonSlug: null, ...o };
}

export function makeLesson(o: Partial<LessonRow> & { slug: string }): LessonRow {
  return {
    day: 1,
    kind: 'lesson',
    visibility: 'core',
    missionSlug: 'w1-m1-basics',
    ordinal: 1,
    title: o.slug,
    concepts: ['concept-a'],
    ...o,
  };
}

export function makeProgress(o: Partial<LessonProgressRow> & { lessonSlug: string }): LessonProgressRow {
  return { status: 'completed', completedAt: '2026-09-07T12:00:00.000Z', updatedAt: '2026-09-07T12:00:00.000Z', ...o };
}

export function makeReviewItem(o: Partial<ReviewItemRow> = {}): ReviewItemRow {
  seq += 1;
  return {
    id: `review-${seq}`,
    conceptId: 'concept-a',
    dueOn: '2026-09-07',
    lapses: 0,
    reviewCount: 0,
    reason: 'scheduled',
    ...o,
  };
}

export function makeXp(o: Partial<XpTransactionRow> = {}): XpTransactionRow {
  seq += 1;
  const localDate = o.localDate ?? '2026-09-07';
  const base = o.base ?? 10;
  return {
    id: seq,
    attemptId: null,
    reason: 'answer_correct',
    ref: null,
    base,
    multiplier: 1,
    amount: o.amount ?? base,
    localDate,
    createdAt: stamp(localDate, seq),
    ...o,
  };
}

export function makeWeeklyTemplate(o: Partial<WeeklyTemplateRow> = {}): WeeklyTemplateRow {
  return { id: 'weekly-w1-platform-limits', worldSlug: 'w1-platform', title: 'Limits week', concepts: ['concept-a'], ...o };
}

export function makeBossRubric(o: Partial<BossRubric> = {}): BossRubric {
  const dims = { suspect: 80, why: 80, dataNeeded: 80, whatToInspect: 80, solution: 80, tradeOffs: 80, ...o };
  return {
    overall: 80,
    misconceptions: [],
    strengths: [],
    gaps: [],
    feedback: '',
    ...dims,
  };
}

export function makeCapstoneRubric(o: Partial<CapstoneRubric['scores']> = {}, overall = 80): CapstoneRubric {
  return {
    scores: {
      platformKnowledge: 80,
      dataArchitecture: 80,
      security: 80,
      apex: 80,
      automation: 80,
      integration: 80,
      scalability: 80,
      performance: 80,
      reliability: 80,
      observability: 80,
      tradeOffReasoning: 80,
      communication: 80,
      ...o,
    },
    overall,
    misconceptions: [],
    strengths: [],
    gaps: [],
    feedback: '',
  };
}

export function makeContext(o: Partial<GamificationContext> = {}): GamificationContext {
  return {
    userId: 'user-1',
    profile: { displayName: 'Dana', timeZone: 'UTC' },
    todayLocal: '2026-09-07',
    attempts: [],
    xpTransactions: [],
    qualifyingDays: [],
    masteries: [],
    reviewItems: [],
    lessonProgress: [],
    registry: {
      worlds: [makeWorld()],
      missions: [makeMission()],
      lessons: [makeLesson({ slug: 'd001-intro', day: 1 })],
      concepts: [makeConcept({ slug: 'concept-a' })],
      weeklyTemplates: [],
    },
    currentLesson: null,
    lastDashboardViewedAt: null,
    ...o,
  };
}

// Day 13 ("Order of Execution") worked example from ARCHITECTURE.md: 401 XP over one lesson day.
export function day13Events(config: GamificationConfig): XpEvent[] {
  const lessonSlug = 'd013-order-of-execution';
  const conceptId = 'order-of-execution';
  let n = 0;
  const input = (o: Partial<ComputeXpInput['attempt']> & Partial<Omit<ComputeXpInput, 'attempt' | 'config'>>): ComputeXpInput => {
    n += 1;
    const {
      evaluation = null,
      masteryBefore = null,
      masteryAfter = null,
      lessonCompleted = false,
      priorAttemptsOnQuestion = 0,
      isIdenticalFormReplay = false,
      isReview = false,
      reviewCorrect = false,
      labPassed = false,
      ...attempt
    } = o;
    return {
      attempt: {
        kind: 'question',
        questionType: 'mcq',
        conceptId,
        exerciseId: `${lessonSlug}/e${n}`,
        formKey: `${lessonSlug}/e${n}`,
        depth: 3,
        correct: true,
        passed: true,
        lessonSlug,
        reviewItemId: null,
        bossKind: null,
        bossRef: null,
        ...attempt,
      },
      evaluation,
      masteryBefore,
      masteryAfter,
      lessonCompleted,
      priorAttemptsOnQuestion,
      isIdenticalFormReplay,
      isReview,
      reviewCorrect,
      labPassed,
      config,
    };
  };
  const inputs: ComputeXpInput[] = [
    // 5 MCQ correct at depth 3 -> 5 x 13
    ...Array.from({ length: 5 }, () => input({ depth: 3 })),
    // 2 predictions correct at depth 4 -> 2 x 15
    input({ kind: 'prediction', questionType: 'predict_outcome', depth: 4 }),
    input({ kind: 'prediction', questionType: 'predict_outcome', depth: 4 }),
    // explain-why probe passed at depth 4 -> 31
    input({ kind: 'explain_why', questionType: 'explain_why', depth: 4, evaluation: { correctness: 82, understanding: 64 } }),
    // lab -> 30 flat
    input({ kind: 'lab', questionType: 'lab', depth: 3, labPassed: true }),
    // scenario passed at depth 5 -> 45
    input({ kind: 'scenario', questionType: 'scenario_diagnosis', depth: 5, evaluation: { correctness: 85, understanding: 70 } }),
    // teach-back passed at depth 5 -> 60, lesson complete -> 50, concept enters Competent -> 40
    input({
      kind: 'teach_back',
      questionType: 'teach_back',
      depth: 5,
      evaluation: { correctness: 88, understanding: 80 },
      lessonCompleted: true,
      masteryBefore: { band: 'developing' },
      masteryAfter: { band: 'competent' },
    }),
    // 4 reviews at depth 1-2, 3 correct -> 4 x 5 + 3 x 10
    input({ depth: 1, isReview: true, reviewCorrect: true, reviewItemId: 'r1' }),
    input({ depth: 2, isReview: true, reviewCorrect: true, reviewItemId: 'r2' }),
    input({ depth: 1, isReview: true, reviewCorrect: true, reviewItemId: 'r3' }),
    input({ depth: 2, isReview: true, reviewCorrect: false, correct: false, reviewItemId: 'r4' }),
  ];
  return inputs.flatMap((i) => computeXpEvents(i));
}
