// Knowledge map tree and weak-area rules. A leaf is weak only with evidence; a parent only through its own aggregate.
import type { Dimension } from '../mastery-engine/types.ts';
import { DIMENSIONS } from '../mastery-engine/types.ts';
import type { GamificationConfig } from './config.ts';
import type { AttemptRow, ConceptRow, MasteryRow, ReviewItemRow } from './context.ts';
import { addDays } from './dates.ts';
import type { KnowledgeNode, WeakReason } from './types.ts';

export interface WeakInput {
  mastery: MasteryRow | null;
  attempts: readonly Pick<AttemptRow, 'misconceptionIds'>[]; // attempts on this concept
  reviewItem: Pick<ReviewItemRow, 'dueOn'> | null;
  todayLocal: string;
}

function hasEvidence(input: WeakInput): boolean {
  return input.attempts.length >= 1 || (input.mastery?.evidenceCount ?? 0) >= 1;
}

/** Misconception ids seen on >= `min` of the given attempts. */
export function repeatedMisconceptionIds(attempts: readonly Pick<AttemptRow, 'misconceptionIds'>[], min: number): string[] {
  const counts = new Map<string, number>();
  for (const a of attempts) for (const id of new Set(a.misconceptionIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= min).map(([id]) => id);
}

export function isWeak(input: WeakInput, config: GamificationConfig): { weak: boolean; reasons: WeakReason[] } {
  const { mastery } = input;
  if (!mastery || !hasEvidence(input)) return { weak: false, reasons: [] };
  const { threshold, lopsidedGap, decayDays, repeatedMisconceptionMin } = config.weakArea;
  const reasons: WeakReason[] = [];
  if (mastery.overall < threshold) reasons.push('below_developing');
  const lopsided = DIMENSIONS.some((d: Dimension) => mastery.evidenceByDimension[d] >= 1 && mastery.overall - mastery.scores[d] >= lopsidedGap);
  if (lopsided) reasons.push('lopsided');
  if (repeatedMisconceptionIds(input.attempts, repeatedMisconceptionMin).length > 0) reasons.push('repeated_misconception');
  if (input.reviewItem && input.reviewItem.dueOn <= addDays(input.todayLocal, -decayDays)) reasons.push('decayed');
  return { weak: reasons.length > 0, reasons };
}

interface Built {
  node: KnowledgeNode;
  concept: ConceptRow;
  /** Importance-weighted evidence points feeding parent aggregates: own row (if evidenced) + evidenced leaves below. */
  votes: Array<{ weight: number; overall: number }>;
}

export function deriveKnowledgeMap(
  concepts: readonly ConceptRow[],
  masteries: readonly MasteryRow[],
  attempts: readonly AttemptRow[],
  reviewItems: readonly ReviewItemRow[],
  todayLocal: string,
  config: GamificationConfig,
): KnowledgeNode[] {
  const known = new Set(concepts.map((c) => c.slug));
  const childrenOf = new Map<string | null, ConceptRow[]>();
  for (const c of concepts) {
    const parent = c.parentSlug !== null && known.has(c.parentSlug) ? c.parentSlug : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(c);
    childrenOf.set(parent, list);
  }
  const masteryBy = new Map(masteries.map((m) => [m.conceptId, m]));
  const attemptsBy = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    if (!a.conceptId) continue;
    const list = attemptsBy.get(a.conceptId) ?? [];
    list.push(a);
    attemptsBy.set(a.conceptId, list);
  }
  const reviewBy = new Map(reviewItems.map((r) => [r.conceptId, r]));

  const build = (concept: ConceptRow, depth: number, visiting: Set<string>): Built => {
    visiting.add(concept.slug);
    const kids = (childrenOf.get(concept.slug) ?? []).filter((k) => !visiting.has(k.slug));
    const builtKids = kids.map((k) => build(k, depth + 1, visiting));
    const mastery = masteryBy.get(concept.slug) ?? null;
    const own = attemptsBy.get(concept.slug) ?? [];
    const ownEvidence = mastery !== null && (own.length >= 1 || mastery.evidenceCount >= 1);
    const isLeaf = builtKids.length === 0;

    if (isLeaf) {
      const { weak, reasons } = isWeak({ mastery, attempts: own, reviewItem: reviewBy.get(concept.slug) ?? null, todayLocal }, config);
      const overall = mastery ? mastery.overall : null;
      const node: KnowledgeNode = {
        slug: concept.slug,
        name: concept.title,
        depth,
        overall,
        band: mastery?.band ?? null,
        dimensions: mastery ? { ...mastery.scores } : null,
        weak,
        weakReasons: reasons,
        flaggedDescendants: 0,
        children: [],
      };
      const votes = ownEvidence && mastery ? [{ weight: concept.importance, overall: mastery.overall }] : [];
      return { node, concept, votes };
    }

    const votes = builtKids.flatMap((k) => k.votes);
    if (ownEvidence && mastery) votes.unshift({ weight: concept.importance, overall: mastery.overall });
    const weightSum = votes.reduce((s, v) => s + v.weight, 0);
    const aggregate = weightSum > 0 ? Math.round(votes.reduce((s, v) => s + v.weight * v.overall, 0) / weightSum) : null;
    const weak = aggregate !== null && aggregate < config.weakArea.threshold;
    const flagged = builtKids.reduce((n, k) => n + k.node.flaggedDescendants + (k.node.weak ? 1 : 0), 0);
    const node: KnowledgeNode = {
      slug: concept.slug,
      name: concept.title,
      depth,
      overall: aggregate,
      band: mastery?.band ?? null,
      dimensions: mastery ? { ...mastery.scores } : null,
      weak,
      weakReasons: weak ? ['below_developing'] : [],
      flaggedDescendants: flagged,
      children: builtKids.map((k) => k.node),
    };
    return { node, concept, votes };
  };

  return (childrenOf.get(null) ?? []).map((root) => build(root, 0, new Set()).node);
}

/** Depth-first flattening (parents before children). */
export function flattenNodes(nodes: readonly KnowledgeNode[]): KnowledgeNode[] {
  const out: KnowledgeNode[] = [];
  const walk = (n: KnowledgeNode): void => {
    out.push(n);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/**
 * The dashboard's single weak area: the weak leaf with the lowest overall among concepts attempted within
 * weakArea.recencyDays, ties broken by the most recent attempt.
 */
export function pickWeakArea(
  nodes: readonly KnowledgeNode[],
  attempts: readonly Pick<AttemptRow, 'conceptId' | 'localDate' | 'createdAt'>[],
  todayLocal: string,
  config: GamificationConfig,
): KnowledgeNode | null {
  const since = addDays(todayLocal, -config.weakArea.recencyDays);
  const lastAttemptAt = new Map<string, string>();
  for (const a of attempts) {
    if (!a.conceptId || a.localDate < since) continue;
    const known = lastAttemptAt.get(a.conceptId);
    if (known === undefined || a.createdAt > known) lastAttemptAt.set(a.conceptId, a.createdAt);
  }
  let best: KnowledgeNode | null = null;
  let bestAt = '';
  for (const n of flattenNodes(nodes)) {
    if (!n.weak || n.children.length > 0 || n.overall === null) continue;
    const at = lastAttemptAt.get(n.slug);
    if (at === undefined) continue;
    if (best === null || n.overall < (best.overall ?? Infinity) || (n.overall === best.overall && at > bestAt)) {
      best = n;
      bestAt = at;
    }
  }
  return best;
}
