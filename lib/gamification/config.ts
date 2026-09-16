// Every number in the Gamification section of ARCHITECTURE.md. Engines take `config` as a parameter; nothing
// reads GAMIFICATION_CONFIG at module level. Relative `.ts` specifiers only (scripts import this under plain node).
import type { AttemptKind } from '../assessments/types.ts';
import type { Band } from '../mastery-engine/types.ts';
import type { XpReason } from './types.ts';

export type BandReachedBand = Extract<Band, 'developing' | 'competent' | 'strong' | 'mastered'>;
export const BAND_REACHED_BANDS: readonly BandReachedBand[] = ['developing', 'competent', 'strong', 'mastered'];

/** Reasons the partial unique index `xp_once_per_ref` makes once-only per (user, reason, ref). */
export const ONCE_ONLY_REASONS: readonly XpReason[] = [
  'lesson_completed',
  'band_reached',
  'lab_completed',
  'mission_boss_attempted',
  'mission_boss_defeated',
  'weekly_boss_attempted',
  'weekly_boss_defeated',
  'capstone_attempted',
  'capstone_passed',
  'achievement_unlocked',
];

export interface XpBaseConfig {
  answer_correct: number;
  prediction_correct: number;
  review_answered: number;
  review_correct: number;
  explain_why_passed: number;
  scenario_passed: number;
  teach_back_passed: number;
  lab_completed: number;
  lesson_completed: number;
  band_reached: Record<BandReachedBand, number>;
  mission_boss_attempted: number;
  mission_boss_defeated: number;
  weekly_boss_attempted: number;
  weekly_boss_defeated: number;
  capstone_attempted: number;
  capstone_passed: number;
}

export interface XpConfig {
  base: XpBaseConfig;
  /** Mirrors MASTERY_CONFIG.correctThreshold / understandingBands.adequate / .strong (asserted equal in xp.test.ts). */
  passThreshold: { correctness: number; understanding: { explain_why: number; teach_back: number } };
  depthMultiplier: readonly number[]; // index = depth - 1
  attemptMultiplier: readonly number[]; // index = prior attempts on the question, clamped to the last entry
}

export interface LevelConfig {
  coefficient: number; // xpTotal(L) = coefficient x L x (L - 1)
  maxLevel: number;
  titles: readonly string[]; // index = level - 1
}

export interface StreakConfig {
  minAttempts: number;
  freeTextKinds: readonly AttemptKind[];
  shieldEveryDays: number;
  maxBankedShields: number;
}

export interface WeakAreaConfig {
  threshold: number; // overall below this (with evidence) = below_developing
  lopsidedGap: number; // an evidenced dimension this far under overall = lopsided
  decayDays: number; // review due this many days ago = decayed
  recencyDays: number; // dashboard pick considers concepts attempted within this window
  repeatedMisconceptionMin: number; // misconception seen on this many attempts = repeated
}

export interface SkillsConfig {
  unexploredValue: number; // overall(c) for a concept without a mastery row
}

export interface BossConfig {
  mission: { minOverall: number; minDimension: number };
  weekly: { minOverall: number; minDimension: number; minConcepts: number; maxOutstanding: number };
  capstone: { minOverall: number; minDimension: number; minDimensionsAtOrAbove: number };
  cooldownDays: number;
  weekLengthDays: number;
}

export interface StatsConfig {
  bossWindow: number; // last N boss attempts blended into the scores
  masteryWeight: number; // weight of the mastery mean; bosses get 1 - masteryWeight
  capstoneBlend: number; // weight of the capstone mean once a capstone attempt exists (architecture only)
  calibrationWindow: number; // last N rated attempts
  calibrationMin: number; // fewer rated attempts than this = null
  repeatedMistakeMin: number; // misconception id on this many attempts = repeated mistake
}

export interface LongTermConfig {
  weights: { lessons: number; bosses: number; capstone: number };
  competentThreshold: number; // mean concept overall for full day credit
  partialCredit: number; // completed but below Competent
  coreDays: number; // lesson days 1..coreDays; the capstone is coreDays + 1
  capstoneAttemptedCredit: number;
}

export interface GuardrailsConfig {
  maxAchievementXpShare: number; // catalog total <= share x xpTotal(maxLevel)
  maxToasts: number; // unlock toasts per attempt / dashboard render
}

export interface AchievementsConfig {
  whyNotWhat: number; // explain_why_passed rows
  prophet: number; // prediction_correct rows
  cavemanUnderstanding: number; // teach-back understanding floor
  gatekeeperCorrect: number; // correct sharing lab predictions
  gatekeeperOwdConfigs: number; // distinct OWD configs among them
  selectiveMind: number; // non-selective -> selective lab attempts
  bulkifierConcept: string;
  streakDays: { week_one: number; month_one: number; centurion: number };
  threeAngles: number; // distinct probe angles, same concept, same local date
  debtFreeFrom: number; // review debt at the start of the day
  calibratedTolerance: number; // |mean(confidence/5) - accuracy|
  architectTradeOffs: number; // weekly boss rubric.tradeOffs floor
  orderKeeperDepth: number; // order_execution depth floor
}

export interface GamificationConfig {
  xp: XpConfig;
  level: LevelConfig;
  streak: StreakConfig;
  weakArea: WeakAreaConfig;
  skills: SkillsConfig;
  boss: BossConfig;
  stats: StatsConfig;
  longTerm: LongTermConfig;
  guardrails: GuardrailsConfig;
  achievements: AchievementsConfig;
}

export const LEVEL_TITLES: readonly string[] = [
  'Platform Initiate',
  'Platform Novice',
  'Platform Apprentice',
  'Metadata Reader',
  'Transaction Watcher',
  'Data Wanderer',
  'Index Seeker',
  'Selectivity Scout',
  'Skew Hunter',
  'Data Steward',
  'Sharing Squire',
  'Permission Warden',
  'Fortress Guard',
  'Access Cartographer',
  'Security Sentinel',
  'Trigger Smith',
  'Bulkifier',
  'Limit Tamer',
  'Async Conductor',
  'Automation Engineer',
  'Callout Courier',
  'Event Herald',
  'Idempotency Keeper',
  'Integration Envoy',
  'Network Weaver',
  'Trade-off Tactician',
  'Systems Strategist',
  'Incident Commander',
  'Platform Architect',
  'Depth Master',
];

export const GAMIFICATION_CONFIG: GamificationConfig = {
  xp: {
    base: {
      answer_correct: 10,
      prediction_correct: 12,
      review_answered: 5,
      review_correct: 10,
      explain_why_passed: 25,
      scenario_passed: 30,
      teach_back_passed: 40,
      lab_completed: 30,
      lesson_completed: 50,
      band_reached: { developing: 20, competent: 40, strong: 60, mastered: 100 },
      mission_boss_attempted: 20,
      mission_boss_defeated: 150,
      weekly_boss_attempted: 30,
      weekly_boss_defeated: 250,
      capstone_attempted: 300,
      capstone_passed: 1000,
    },
    passThreshold: { correctness: 70, understanding: { explain_why: 50, teach_back: 70 } },
    depthMultiplier: [1, 1, 1.25, 1.25, 1.5, 1.5, 2, 2],
    attemptMultiplier: [1, 0.5, 0],
  },
  level: { coefficient: 100, maxLevel: 30, titles: LEVEL_TITLES },
  streak: {
    minAttempts: 3,
    freeTextKinds: ['explain_why', 'teach_back', 'scenario', 'boss', 'capstone'],
    shieldEveryDays: 7,
    maxBankedShields: 1,
  },
  weakArea: { threshold: 60, lopsidedGap: 25, decayDays: 14, recencyDays: 30, repeatedMisconceptionMin: 2 },
  skills: { unexploredValue: 0 },
  boss: {
    mission: { minOverall: 70, minDimension: 40 },
    weekly: { minOverall: 75, minDimension: 50, minConcepts: 3, maxOutstanding: 2 },
    capstone: { minOverall: 75, minDimension: 60, minDimensionsAtOrAbove: 9 },
    cooldownDays: 1,
    weekLengthDays: 7,
  },
  stats: { bossWindow: 5, masteryWeight: 0.6, capstoneBlend: 0.5, calibrationWindow: 30, calibrationMin: 10, repeatedMistakeMin: 2 },
  longTerm: {
    weights: { lessons: 0.7, bosses: 0.2, capstone: 0.1 },
    competentThreshold: 75,
    partialCredit: 0.5,
    coreDays: 179,
    capstoneAttemptedCredit: 0.5,
  },
  guardrails: { maxAchievementXpShare: 0.05, maxToasts: 1 },
  achievements: {
    whyNotWhat: 10,
    prophet: 25,
    cavemanUnderstanding: 85,
    gatekeeperCorrect: 10,
    gatekeeperOwdConfigs: 3,
    selectiveMind: 5,
    bulkifierConcept: 'soql-in-loops',
    streakDays: { week_one: 7, month_one: 30, centurion: 100 },
    threeAngles: 3,
    debtFreeFrom: 10,
    calibratedTolerance: 0.1,
    architectTradeOffs: 85,
    orderKeeperDepth: 5,
  },
};
