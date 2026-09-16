// Gamification read-model types. XpReason / BossKind mirror Postgres enums (pinned in types.test-d.ts).
import type { Band, DimensionScores } from '../mastery-engine/types.ts';
import type { Segment } from '../learning-engine/types.ts';

export type { Band } from '../mastery-engine/types.ts';

export const XP_REASONS = [
  'answer_correct',
  'prediction_correct',
  'explain_why_passed',
  'teach_back_passed',
  'scenario_passed',
  'lab_completed',
  'review_answered',
  'review_correct',
  'lesson_completed',
  'band_reached',
  'mission_boss_attempted',
  'mission_boss_defeated',
  'weekly_boss_attempted',
  'weekly_boss_defeated',
  'capstone_attempted',
  'capstone_passed',
  'achievement_unlocked',
  'manual_adjustment',
] as const;
export type XpReason = (typeof XP_REASONS)[number];

export const BOSS_KINDS = ['mission', 'weekly', 'capstone'] as const;
export type BossKind = (typeof BOSS_KINDS)[number];

export type BossStatus = 'locked' | 'available' | 'cooldown' | 'defeated' | 'expired';

export const SKILL_IDS = ['platform', 'data', 'security', 'apex', 'integration', 'architecture'] as const;
export type SkillId = (typeof SKILL_IDS)[number];
export const SKILL_LABELS: Record<SkillId, string> = {
  platform: 'Platform Knowledge',
  data: 'Data Architecture',
  security: 'Security',
  apex: 'Apex & Automation',
  integration: 'Integration',
  architecture: 'Architecture',
};

export interface XpEvent {
  reason: XpReason;
  ref: string | null;
  base: number;
  multiplier: number;
  amount: number;
}

export interface StreakState {
  current: number;
  longest: number;
  shieldBanked: boolean;
  atRisk: boolean;
  todayQualifies: boolean;
}

export type WeakReason = 'below_developing' | 'lopsided' | 'repeated_misconception' | 'decayed';

export interface KnowledgeNode {
  slug: string;
  name: string;
  depth: number;
  overall: number | null; // leaf: mastery.overall (null = unexplored); parent: aggregate
  band: Band | null;
  dimensions: DimensionScores | null;
  weak: boolean;
  weakReasons: WeakReason[];
  flaggedDescendants: number;
  children: KnowledgeNode[];
}

export interface SkillBar {
  id: SkillId;
  label: string;
  pct: number;
  coveragePct: number;
  explored: number;
  total: number;
}

export interface RepeatedMistake {
  misconceptionId: string;
  count: number;
  conceptSlug: string;
}

export interface DashboardViewModel {
  generatedAt: string;
  greeting: { localHour: number; displayName: string };
  streak: StreakState;
  level: {
    level: number;
    title: string;
    xpTotal: number;
    xpIntoLevel: number;
    xpForLevel: number;
    nextLevelAt: number | null;
    pct: number;
  };
  todayMission: {
    worldSlug: string;
    missionSlug: string;
    lessonSlug: string;
    title: string;
    dayIndex: number;
    progressPct: number;
    nextStep: Segment;
    actions: Array<'continue' | 'challenge_me' | 'review_weakness' | 'next_mission'>;
  } | null;
  boss: {
    kind: BossKind;
    ref: string;
    title: string;
    status: BossStatus;
    availableAt: string | null;
    lastRubric: { overall: number; weakest: string } | null;
  } | null;
  weakArea: { conceptSlug: string; name: string; overall: number; reasons: WeakReason[]; reviewSlug: string } | null;
  reviewsDue: { due: number; overdue: number; nextDueOn: string | null };
  recentAchievement: { id: string; name: string; unlockedAt: string; xp: number } | null;
  pendingUnlockToasts: Array<{ id: string; name: string; xp: number }>;
  skills: SkillBar[];
  longTerm: { pct: number; dayIndex: number; calendarDay: number; lessonsCompleted: number; lessonsCompetent: number };
  stats: {
    bossesDefeated: number;
    labsCompleted: number;
    conceptsMastered: number;
    architectureScore: number | null;
    debuggingScore: number | null;
    reviewDebt: number;
    repeatedMistakes: RepeatedMistake[];
    timeSpentMs: number;
    calibration: number | null;
  };
  xpToday: { amount: number; events: Array<{ reason: XpReason; amount: number; ref: string | null }> };
}

export interface ProgressViewModel {
  worlds: Array<{
    slug: string;
    name: string;
    coreLessons: number;
    completed: number;
    competent: number;
    bosses: { defeated: number; total: number };
    meanOverall: number | null;
  }>;
  weekly: Array<{ isoWeek: string; xp: number; attempts: number; lessonsCompleted: number; bandUps: number }>;
  knowledgeMap: KnowledgeNode[];
  skills: SkillBar[];
  radar: DimensionScores | null;
  history: Array<{ localDate: string; xp: number; attempts: number }>;
  repeatedMistakes: RepeatedMistake[];
}
