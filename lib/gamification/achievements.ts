// Achievement catalog (readonly array, no enum: scripts import it) and the post-attempt evaluator.
// An unlock is persisted only as an xp_transactions row (reason achievement_unlocked, ref = id or id:param).
import type { GamificationConfig } from './config.ts';
import { asRecord, numberAt, type AttemptRow, type MasteryRow, type MissionRow, type ReviewItemRow, type XpTransactionRow } from './context.ts';
import { calibration } from './stats.ts';
import type { StreakState, XpEvent, XpReason } from './types.ts';
import { bandRank, meetsExplainWhy } from './xp.ts';

export interface AchievementContext {
  /** The attempt being recorded (also the last element of `attempts`). */
  attempt: AttemptRow;
  /** Evaluated history including `attempt`, ascending by createdAt. */
  attempts: readonly AttemptRow[];
  /** Ledger rows already in xp_transactions. */
  xpTransactions: readonly Pick<XpTransactionRow, 'reason' | 'ref'>[];
  /** Events computed for this attempt, not yet inserted. */
  xpEventsSoFar: readonly XpEvent[];
  masteries: readonly MasteryRow[];
  masteryBefore: MasteryRow | null;
  masteryAfter: MasteryRow | null;
  /** Review items as loaded before this attempt. */
  reviewItems: readonly ReviewItemRow[];
  /** Streak derived with today's attempt included. */
  streak: StreakState;
  missions: readonly MissionRow[];
  todayLocal: string;
  config: GamificationConfig;
}

export interface Achievement {
  id: string;
  name: string;
  hidden: boolean;
  xp: number;
  /** How many distinct refs this row can ever unlock (parametrised rows); 1 when absent. */
  maxUnlocks?: number;
  test: (ctx: AchievementContext) => string[]; // refs to unlock (usually [] or [id])
}

type LedgerEntry = { reason: XpReason; ref: string | null };

function ledger(ctx: AchievementContext): LedgerEntry[] {
  return [...ctx.xpTransactions, ...ctx.xpEventsSoFar];
}

function countReason(ctx: AchievementContext, reason: XpReason): number {
  return ledger(ctx).filter((e) => e.reason === reason).length;
}

function refsFor(ctx: AchievementContext, reason: XpReason): Set<string> {
  const out = new Set<string>();
  for (const e of ledger(ctx)) if (e.reason === reason && e.ref) out.add(e.ref);
  return out;
}

function when(condition: boolean, ref: string): string[] {
  return condition ? [ref] : [];
}

function isCorrect(a: Pick<AttemptRow, 'correct' | 'passed'>): boolean {
  return a.correct === true || (a.correct === null && a.passed === true);
}

function labResult(a: AttemptRow): Record<string, unknown> | null {
  return asRecord(asRecord(a.answer)?.result);
}

function labOwd(a: AttemptRow): string | null {
  const owd = asRecord(asRecord(a.answer)?.config)?.owd;
  return owd === undefined || owd === null ? null : JSON.stringify(owd);
}

const WORLDS_IN_CURRICULUM = 6;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first_light',
    name: 'First Light',
    hidden: false,
    xp: 25,
    test: (ctx) => when(countReason(ctx, 'lesson_completed') >= 1, 'first_light'),
  },
  {
    id: 'why_not_what',
    name: 'Why, Not What',
    hidden: false,
    xp: 50,
    test: (ctx) => when(countReason(ctx, 'explain_why_passed') >= ctx.config.achievements.whyNotWhat, 'why_not_what'),
  },
  {
    id: 'prophet',
    name: 'The Prophet',
    hidden: false,
    xp: 50,
    test: (ctx) => when(countReason(ctx, 'prediction_correct') >= ctx.config.achievements.prophet, 'prophet'),
  },
  {
    id: 'caveman_translator',
    name: 'Caveman Translator',
    hidden: false,
    xp: 75,
    test: (ctx) => {
      const { passThreshold } = ctx.config.xp;
      const floor = ctx.config.achievements.cavemanUnderstanding;
      const hit = ctx.attempts.some((a) => {
        if (a.questionType !== 'teach_back') return false;
        const correctness = numberAt(a.llmEvaluation, 'correctness');
        const understanding = numberAt(a.llmEvaluation, 'understanding');
        if (correctness === null || understanding === null) return false;
        if (correctness < passThreshold.correctness || understanding < floor) return false;
        return a.probeAngle === 'explain_without_jargon' || asRecord(a.answer)?.audience === 'no_jargon';
      });
      return when(hit, 'caveman_translator');
    },
  },
  {
    id: 'governor_limit_survivor',
    name: 'Governor Limit Survivor',
    hidden: false,
    xp: 100,
    test: (ctx) => {
      const breached = new Set<string>();
      let survived = false;
      for (const a of ctx.attempts) {
        if (a.kind !== 'lab') continue;
        const exercise = a.exerciseId ?? a.formKey;
        const result = labResult(a);
        if (!result) continue;
        const breach = result.firstBreach;
        if (breach !== null && breach !== undefined) breached.add(exercise);
        else if (a.passed === true && breached.has(exercise)) survived = true;
      }
      return when(survived, 'governor_limit_survivor');
    },
  },
  {
    id: 'order_keeper',
    name: 'Order Keeper',
    hidden: false,
    xp: 75,
    test: (ctx) =>
      when(
        ctx.attempts.some((a) => a.questionType === 'order_execution' && isCorrect(a) && a.depth >= ctx.config.achievements.orderKeeperDepth),
        'order_keeper',
      ),
  },
  {
    id: 'gatekeeper',
    name: 'Gatekeeper',
    hidden: false,
    xp: 75,
    test: (ctx) => {
      const owds: string[] = [];
      for (const a of ctx.attempts) {
        if (a.kind !== 'lab' || !isCorrect(a)) continue;
        const owd = labOwd(a);
        if (owd !== null) owds.push(owd);
      }
      const { gatekeeperCorrect, gatekeeperOwdConfigs } = ctx.config.achievements;
      return when(owds.length >= gatekeeperCorrect && new Set(owds).size >= gatekeeperOwdConfigs, 'gatekeeper');
    },
  },
  {
    id: 'selective_mind',
    name: 'Selective Mind',
    hidden: false,
    xp: 75,
    test: (ctx) => {
      const fixed = ctx.attempts.filter((a) => {
        if (a.kind !== 'lab') return false;
        const result = labResult(a);
        return result?.selectiveBefore === false && result?.selectiveAfter === true;
      }).length;
      return when(fixed >= ctx.config.achievements.selectiveMind, 'selective_mind');
    },
  },
  {
    id: 'bulkifier',
    name: 'The Bulkifier',
    hidden: false,
    xp: 50,
    test: (ctx) => {
      const concept = ctx.config.achievements.bulkifierConcept;
      const nowPassed =
        ctx.attempt.conceptId === concept && ctx.xpEventsSoFar.some((e) => e.reason === 'explain_why_passed');
      const everPassed = ctx.attempts.some((a) => {
        if (a.conceptId !== concept || a.questionType !== 'explain_why') return false;
        const correctness = numberAt(a.llmEvaluation, 'correctness');
        const understanding = numberAt(a.llmEvaluation, 'understanding');
        return correctness !== null && understanding !== null && meetsExplainWhy({ correctness, understanding }, ctx.config);
      });
      return when(nowPassed || everPassed, 'bulkifier');
    },
  },
  {
    id: 'first_blood',
    name: 'First Blood',
    hidden: false,
    xp: 100,
    test: (ctx) => when(countReason(ctx, 'mission_boss_defeated') >= 1, 'first_blood'),
  },
  {
    id: 'world_cleared',
    name: 'World Cleared',
    hidden: false,
    xp: 200,
    maxUnlocks: WORLDS_IN_CURRICULUM,
    test: (ctx) => {
      const defeated = refsFor(ctx, 'mission_boss_defeated');
      const byWorld = new Map<string, MissionRow[]>();
      for (const m of ctx.missions) byWorld.set(m.worldSlug, [...(byWorld.get(m.worldSlug) ?? []), m]);
      const cleared: string[] = [];
      for (const [world, missions] of byWorld) {
        if (missions.length > 0 && missions.every((m) => defeated.has(m.slug))) cleared.push(`world_cleared:${world}`);
      }
      return cleared;
    },
  },
  {
    id: 'week_one',
    name: 'Week One',
    hidden: false,
    xp: 50,
    test: (ctx) => when(ctx.streak.current >= ctx.config.achievements.streakDays.week_one, 'week_one'),
  },
  {
    id: 'month_one',
    name: 'Month One',
    hidden: false,
    xp: 150,
    test: (ctx) => when(ctx.streak.current >= ctx.config.achievements.streakDays.month_one, 'month_one'),
  },
  {
    id: 'centurion',
    name: 'Centurion',
    hidden: false,
    xp: 300,
    test: (ctx) => when(ctx.streak.current >= ctx.config.achievements.streakDays.centurion, 'centurion'),
  },
  {
    id: 'three_angles',
    name: 'Three Angles',
    hidden: true,
    xp: 50,
    test: (ctx) => {
      const angles = new Map<string, Set<string>>();
      for (const a of ctx.attempts) {
        if (!a.conceptId || !a.probeAngle || !isCorrect(a)) continue;
        const key = `${a.localDate} ${a.conceptId}`;
        const set = angles.get(key) ?? new Set<string>();
        set.add(a.probeAngle);
        angles.set(key, set);
      }
      const hit = [...angles.values()].some((set) => set.size >= ctx.config.achievements.threeAngles);
      return when(hit, 'three_angles');
    },
  },
  {
    id: 'comeback',
    name: 'Comeback',
    hidden: true,
    xp: 100,
    test: (ctx) => {
      const before = ctx.masteryBefore;
      const after = ctx.masteryAfter;
      const hit = !!before && !!after && before.band === 'lost' && before.evidenceCount >= 1 && bandRank(after.band) >= bandRank('competent');
      return when(hit, 'comeback');
    },
  },
  {
    id: 'debt_free',
    name: 'Debt Free',
    hidden: true,
    xp: 75,
    test: (ctx) => {
      const reviewedToday = new Set<string>();
      for (const a of ctx.attempts) if (a.reviewItemId && a.localDate === ctx.todayLocal) reviewedToday.add(a.reviewItemId);
      const debtAfter = ctx.reviewItems.filter((r) => r.dueOn <= ctx.todayLocal && !reviewedToday.has(r.id)).length;
      const debtStart = debtAfter + reviewedToday.size;
      return when(reviewedToday.size > 0 && debtAfter === 0 && debtStart >= ctx.config.achievements.debtFreeFrom, 'debt_free');
    },
  },
  {
    id: 'calibrated',
    name: 'Calibrated',
    hidden: true,
    xp: 100,
    test: (ctx) => {
      const value = calibration(ctx.attempts, ctx.config);
      return when(value !== null && Math.abs(value) <= ctx.config.achievements.calibratedTolerance, 'calibrated');
    },
  },
  {
    id: 'architect',
    name: 'The Architect',
    hidden: true,
    xp: 150,
    test: (ctx) =>
      when(
        ctx.attempts.some((a) => a.bossKind === 'weekly' && (numberAt(a.llmEvaluation, 'tradeOffs') ?? -1) >= ctx.config.achievements.architectTradeOffs),
        'architect',
      ),
  },
  {
    id: 'depth_quest_complete',
    name: 'Depth Quest Complete',
    hidden: false,
    xp: 500,
    test: (ctx) => when(countReason(ctx, 'capstone_passed') >= 1, 'depth_quest_complete'),
  },
];

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Catalog row for a ref (`id` or `id:param`). */
export function achievementFor(ref: string): Achievement | undefined {
  return byId.get(ref) ?? byId.get(ref.split(':')[0]);
}

export function unlockedAchievementRefs(rows: Iterable<{ reason: XpReason; ref: string | null }>): Set<string> {
  const out = new Set<string>();
  for (const r of rows) if (r.reason === 'achievement_unlocked' && r.ref) out.add(r.ref);
  return out;
}

/** Runs every predicate over the context and returns one achievement_unlocked event per newly satisfied ref. */
export function evaluateAchievements(ctx: AchievementContext): XpEvent[] {
  const unlocked = unlockedAchievementRefs(ledger(ctx));
  const events: XpEvent[] = [];
  for (const achievement of ACHIEVEMENTS) {
    for (const ref of achievement.test(ctx)) {
      if (unlocked.has(ref)) continue;
      unlocked.add(ref);
      events.push({ reason: 'achievement_unlocked', ref, base: achievement.xp, multiplier: 1, amount: achievement.xp });
    }
  }
  return events;
}
