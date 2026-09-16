// Derived stats: every number is a query over attempts / mastery / review_items, never a stored counter.
import type { BossRubricKey, CapstoneDimensionId } from '../llm/schemas.ts';
import type { GamificationConfig } from './config.ts';
import { asRecord, bossDefeated, numberAt, type AttemptRow, type MasteryRow, type ReviewItemRow } from './context.ts';
import type { DashboardViewModel, RepeatedMistake } from './types.ts';

export type DashboardStats = DashboardViewModel['stats'];

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

function byCreatedDesc(attempts: readonly AttemptRow[]): AttemptRow[] {
  return [...attempts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function bossesDefeated(attempts: readonly AttemptRow[]): number {
  const refs = new Set<string>();
  for (const a of attempts) if ((a.kind === 'boss' || a.kind === 'capstone') && a.bossRef && bossDefeated(a)) refs.add(a.bossRef);
  return refs.size;
}

export function labsCompleted(attempts: readonly AttemptRow[]): number {
  const ids = new Set<string>();
  for (const a of attempts) if (a.kind === 'lab' && a.passed === true) ids.add(a.exerciseId ?? a.formKey);
  return ids.size;
}

/** `mean(self_confidence / 5) - accuracy` over the last N rated attempts; null under the minimum. Positive = overconfident. */
export function calibration(attempts: readonly AttemptRow[], config: GamificationConfig): number | null {
  const rated = byCreatedDesc(attempts)
    .filter((a) => a.selfConfidence !== null)
    .slice(0, config.stats.calibrationWindow);
  if (rated.length < config.stats.calibrationMin) return null;
  const confidence = rated.reduce((s, a) => s + (a.selfConfidence ?? 0) / 5, 0) / rated.length;
  const accuracy = rated.filter((a) => a.correct === true || (a.correct === null && a.passed === true)).length / rated.length;
  return Math.round((confidence - accuracy) * 1000) / 1000;
}

export function reviewsDue(reviewItems: readonly Pick<ReviewItemRow, 'dueOn'>[], todayLocal: string): DashboardViewModel['reviewsDue'] {
  let due = 0;
  let overdue = 0;
  let nextFuture: string | null = null;
  for (const r of reviewItems) {
    if (r.dueOn <= todayLocal) due += 1;
    if (r.dueOn < todayLocal) overdue += 1;
    if (r.dueOn > todayLocal && (nextFuture === null || r.dueOn < nextFuture)) nextFuture = r.dueOn;
  }
  return { due, overdue, nextDueOn: due > 0 ? todayLocal : nextFuture };
}

/** Misconception ids on >= repeatedMistakeMin attempts, most frequent first; concept = the latest attempt carrying it. */
export function repeatedMistakes(attempts: readonly AttemptRow[], config: GamificationConfig): RepeatedMistake[] {
  const counts = new Map<string, { count: number; conceptSlug: string; at: string }>();
  for (const a of attempts) {
    const conceptSlug = a.conceptId ?? a.conceptIds[0] ?? '';
    for (const id of new Set(a.misconceptionIds)) {
      const row = counts.get(id) ?? { count: 0, conceptSlug, at: '' };
      row.count += 1;
      if (a.createdAt >= row.at) {
        row.at = a.createdAt;
        row.conceptSlug = conceptSlug;
      }
      counts.set(id, row);
    }
  }
  return [...counts.entries()]
    .filter(([, r]) => r.count >= config.stats.repeatedMistakeMin)
    .sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1))
    .map(([misconceptionId, r]) => ({ misconceptionId, count: r.count, conceptSlug: r.conceptSlug }));
}

function rubricMean(attempts: readonly AttemptRow[], keys: readonly BossRubricKey[]): number | null {
  const values: number[] = [];
  for (const a of attempts) for (const k of keys) {
    const v = numberAt(a.llmEvaluation, k);
    if (v !== null) values.push(v);
  }
  return mean(values);
}

function capstoneMean(attempt: AttemptRow | undefined, keys: readonly CapstoneDimensionId[]): number | null {
  const scores = asRecord(asRecord(attempt?.llmEvaluation)?.scores);
  if (!scores) return null;
  const values = keys.map((k) => numberAt(scores, k)).filter((v): v is number => v !== null);
  return mean(values);
}

function blend(masteryPart: number | null, bossPart: number | null, config: GamificationConfig): number | null {
  const w = config.stats.masteryWeight;
  if (masteryPart !== null && bossPart !== null) return w * masteryPart + (1 - w) * bossPart;
  return masteryPart ?? bossPart;
}

const ARCH_BOSS_KEYS: readonly BossRubricKey[] = ['solution', 'tradeOffs'];
const DEBUG_BOSS_KEYS: readonly BossRubricKey[] = ['suspect', 'why', 'dataNeeded', 'whatToInspect'];
const ARCH_CAPSTONE_KEYS: readonly CapstoneDimensionId[] = ['dataArchitecture', 'scalability', 'performance', 'reliability', 'tradeOffReasoning'];

export interface StatsInput {
  attempts: readonly AttemptRow[];
  masteries: readonly MasteryRow[];
  reviewItems: readonly ReviewItemRow[];
  todayLocal: string;
}

export function deriveStats(input: StatsInput, config: GamificationConfig): DashboardStats {
  const { attempts, masteries, reviewItems, todayLocal } = input;
  const recentBosses = byCreatedDesc(attempts.filter((a) => a.kind === 'boss')).slice(0, config.stats.bossWindow);
  const latestCapstone = byCreatedDesc(attempts.filter((a) => a.kind === 'capstone'))[0];

  const archMastery = mean(masteries.filter((m) => m.evidenceByDimension.architecture >= 1).map((m) => m.scores.architecture));
  const debugMastery = mean(masteries.filter((m) => m.evidenceByDimension.debugging >= 1).map((m) => m.scores.debugging));

  let architecture = blend(archMastery, rubricMean(recentBosses, ARCH_BOSS_KEYS), config);
  const capstoneArch = capstoneMean(latestCapstone, ARCH_CAPSTONE_KEYS);
  if (capstoneArch !== null) {
    const b = config.stats.capstoneBlend;
    architecture = architecture === null ? capstoneArch : (1 - b) * architecture + b * capstoneArch;
  }
  const debugging = blend(debugMastery, rubricMean(recentBosses, DEBUG_BOSS_KEYS), config);

  return {
    bossesDefeated: bossesDefeated(attempts),
    labsCompleted: labsCompleted(attempts),
    conceptsMastered: masteries.filter((m) => m.band === 'mastered').length,
    architectureScore: architecture === null ? null : Math.round(architecture),
    debuggingScore: debugging === null ? null : Math.round(debugging),
    reviewDebt: reviewsDue(reviewItems, todayLocal).due,
    repeatedMistakes: repeatedMistakes(attempts, config),
    timeSpentMs: attempts.reduce((s, a) => s + a.durationMs, 0),
    calibration: calibration(attempts, config),
  };
}
