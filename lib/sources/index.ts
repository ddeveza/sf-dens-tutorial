// lib/sources public surface: records, schemas, config, builders and registry helpers. Pure: plain objects in/out.
import { SOURCES_CONFIG } from './config.ts';
import type { SourcesConfig } from './config.ts';
import { tierPriority } from './types.ts';
import type { Release, Source, SourceTier } from './types.ts';

export * from './types.ts';
export * from './schema.ts';
export * from './config.ts';
export * from './builders.ts';

type SourceLookup = readonly Source[] | ReadonlyMap<string, Source>;

export function indexSources(sources: readonly Source[]): Map<string, Source> {
  return new Map(sources.map((source) => [source.id, source]));
}

/** Source record by id, or undefined. Accepts an array or a prebuilt Map. */
export function getSource(sources: SourceLookup, id: string): Source | undefined {
  if (sources instanceof Map) return sources.get(id);
  return (sources as readonly Source[]).find((source) => source.id === id);
}

/** Source record by id; throws when absent (curriculum.test.ts guarantees presence for every cited id). */
export function requireSource(sources: SourceLookup, id: string): Source {
  const source = getSource(sources, id);
  if (!source) throw new Error(`unknown source id '${id}'`);
  return source;
}

export function getRelease(releases: readonly Release[], id: string): Release | undefined {
  return releases.find((release) => release.id === id);
}

/** Rendering order of the Sources block: config.tierOrder first, then id; stable for equal keys. */
export function sourcesByTier(sources: readonly Source[], config: SourcesConfig = SOURCES_CONFIG): Source[] {
  const rank = new Map<SourceTier, number>(config.tierOrder.map((tier, index) => [tier, index]));
  return [...sources].sort((a, b) => {
    const byTier = (rank.get(a.tier) ?? config.tierOrder.length) - (rank.get(b.tier) ?? config.tierOrder.length);
    if (byTier !== 0) return byTier;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Sources grouped by tier in config.tierOrder; tiers without sources are omitted. */
export function groupSourcesByTier(
  sources: readonly Source[],
  config: SourcesConfig = SOURCES_CONFIG,
): Array<{ tier: SourceTier; sources: Source[] }> {
  const ordered = sourcesByTier(sources, config);
  const groups: Array<{ tier: SourceTier; sources: Source[] }> = [];
  for (const source of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.tier === source.tier) last.sources.push(source);
    else groups.push({ tier: source.tier, sources: [source] });
  }
  return groups;
}

/** A taught limit may only cite tier priority 1..maxPriority (help/developer/architect); 'other' is never enough. */
export function isLimitGradeSource(source: Pick<Source, 'tier'>, maxPriority: number): boolean {
  return tierPriority[source.tier] <= maxPriority;
}
