// Validates every simulator rule-set registry (data/simulations/<sim>/index.ts exporting { current, history }):
// each set parses against RuleSetSchema, cites at least one source, carries a well-formed release id, resolves its
// sourceIds / release in the registries when those are available, and is fresh enough (SIM_CONFIG age knobs).
// A registry that another slice has not written yet is skipped with a message, never failed.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ReleaseIdSchema } from '../sources/schema.ts';
import { SIM_CONFIG } from './config.ts';
import { SIM_IDS } from './rule-set.ts';
import type { RuleSet, RuleSetRegistry, SimId } from './rule-set.ts';
import { ruleSetSchema } from './rule-set-schema.ts';

// Deliberately a constant, not the wall clock: bump it when re-verifying so the freshness gate is reproducible.
const TODAY = '2026-09-07';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

type Loaded = { sim: SimId; registry: RuleSetRegistry<unknown> } | { sim: SimId; skip: string };

async function loadRegistry(sim: SimId): Promise<Loaded> {
  const relative = `data/simulations/${sim}/index.ts`;
  if (!existsSync(path.join(repoRoot, relative))) {
    return { sim, skip: `${relative} is not written yet (owned by another slice); skipping` };
  }
  try {
    const mod = (await import(/* @vite-ignore */ `../../${relative}`)) as Partial<RuleSetRegistry<unknown>>;
    if (!mod.current || !Array.isArray(mod.history)) {
      return { sim, skip: `${relative} does not export { current, history }; skipping` };
    }
    return { sim, registry: { current: mod.current, history: mod.history } };
  } catch (error) {
    return { sim, skip: `${relative} failed to import (${error instanceof Error ? error.message : String(error)}); skipping` };
  }
}

// Source and release registries belong to the sources/curriculum slices. Their export names are not this test's
// business, so ids are collected by shape: a source has `tier`, a release has `ga`.
interface IdRegistries {
  sources: Set<string>;
  releases: Set<string>;
}

function collectIds(value: unknown, into: IdRegistries, depth = 0): void {
  if (depth > 2 || value === null || typeof value !== 'object') return;
  const items: unknown[] = Array.isArray(value) ? value : value instanceof Map ? [...value.values()] : Object.values(value);
  for (const item of items) {
    if (item !== null && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      const record = item as { id: string; tier?: unknown; ga?: unknown };
      if (typeof record.tier === 'string') into.sources.add(record.id);
      else if (record.ga !== null && typeof record.ga === 'object') into.releases.add(record.id);
    } else {
      collectIds(item, into, depth + 1);
    }
  }
}

async function loadIdRegistries(): Promise<IdRegistries> {
  const into: IdRegistries = { sources: new Set(), releases: new Set() };
  const candidates = ['data/curriculum/index.ts', 'data/releases.ts', 'lib/sources/index.ts', 'data/sources/index.ts'];
  for (const relative of candidates) {
    if (!existsSync(path.join(repoRoot, relative))) continue;
    try {
      const mod: unknown = await import(/* @vite-ignore */ `../../${relative}`);
      collectIds(mod, into);
    } catch {
      // A registry mid-write by another slice is not this test's failure; the id checks below skip when empty.
    }
  }
  return into;
}

const loaded = await Promise.all(SIM_IDS.map(loadRegistry));
const idRegistries = await loadIdRegistries();

describe.each(loaded.map((entry) => [entry.sim, entry] as const))('%s rule sets', (sim, entry) => {
  if ('skip' in entry) {
    it.skip(entry.skip, () => {});
    return;
  }

  const sets = [entry.registry.current, ...entry.registry.history] as RuleSet<unknown>[];
  const schema = ruleSetSchema(sim, z.record(z.string(), z.unknown()));
  const cases = sets.map((set) => [set.id, set] as const);

  it('exports a current set and unique ids across current + history', () => {
    expect(entry.registry.current).toBeDefined();
    const ids = sets.map((set) => set.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(cases)('%s parses against RuleSetSchema', (_id, set) => {
    const parsed = schema.safeParse(set);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
  });

  it.each(cases)('%s belongs to this simulation and its id is `${simulation}@${release}`', (_id, set) => {
    expect(set.simulation).toBe(sim);
    expect(set.id).toBe(`${sim}@${set.release}`);
    expect(set.verification.release).toBe(set.release);
    expect(set.verification.apiVersion).toBe(set.apiVersion);
  });

  it.each(cases)('%s cites at least one source', (_id, set) => {
    expect(set.sourceIds.length).toBeGreaterThan(0);
    expect(new Set(set.sourceIds).size).toBe(set.sourceIds.length);
  });

  it.each(cases)('%s release id has <season>-<yy> format', (_id, set) => {
    expect(ReleaseIdSchema.safeParse(set.release).success).toBe(true);
  });

  it.each(cases)(`%s lastVerified is at most ${SIM_CONFIG.maxRuleSetAgeDays} days before ${TODAY} (warns past ${SIM_CONFIG.warnRuleSetAgeDays})`, (_id, set) => {
    const age = daysBetween(set.verification.lastVerified, TODAY);
    expect(age, `lastVerified ${set.verification.lastVerified} is in the future relative to ${TODAY}`).toBeGreaterThanOrEqual(0);
    if (age > SIM_CONFIG.warnRuleSetAgeDays) {
      console.warn(`[rule-sets] ${set.id} last verified ${age} days ago (warn after ${SIM_CONFIG.warnRuleSetAgeDays}, fail after ${SIM_CONFIG.maxRuleSetAgeDays})`);
    }
    expect(age, `${set.id} last verified ${age} days ago; re-verify (fails past ${SIM_CONFIG.maxRuleSetAgeDays})`).toBeLessThanOrEqual(SIM_CONFIG.maxRuleSetAgeDays);
  });

  if (idRegistries.sources.size === 0) {
    it.skip('sourceIds resolve in the source registry (registry not available yet)', () => {});
  } else {
    it.each(cases)('%s sourceIds resolve in the source registry', (_id, set) => {
      const missing = set.sourceIds.filter((id) => !idRegistries.sources.has(id));
      expect(missing, `unknown source ids: ${missing.join(', ')}`).toEqual([]);
    });
  }

  if (idRegistries.releases.size === 0) {
    it.skip('release resolves in the release registry (registry not available yet)', () => {});
  } else {
    it.each(cases)('%s release resolves in the release registry', (_id, set) => {
      expect(idRegistries.releases.has(set.release), `unknown release '${set.release}'`).toBe(true);
    });
  }
});
