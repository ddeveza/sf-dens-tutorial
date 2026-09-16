import { describe, expect, it } from 'vitest';
import { SourceAuthoringError, defineRelease, defineSource } from './builders.ts';
import { SOURCES_CONFIG } from './config.ts';
import { getRelease, getSource, groupSourcesByTier, indexSources, isLimitGradeSource, requireSource, sourcesByTier } from './index.ts';
import { SOURCE_TIERS, tierPrefix, tierPriority } from './types.ts';
import type { SourceInput } from './builders.ts';

const base: SourceInput = { id: 'help-thing', title: 'Thing', url: 'https://help.salesforce.com/s/articleView?id=thing', tier: 'help', lastVerified: '2026-09-04', status: 'verified' };

function expectRefused(input: SourceInput, ...fragments: string[]): void {
  let caught: unknown;
  try {
    defineSource(input);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SourceAuthoringError);
  for (const fragment of fragments) expect((caught as Error).message).toContain(fragment);
}

describe('defineSource', () => {
  it('parses a verified source and keeps fetchedOk provenance', () => {
    expect(defineSource({ ...base, fetchedOk: true })).toEqual({ ...base, fetchedOk: true });
  });

  it('refuses lastVerified on an unverified source and requires it otherwise', () => {
    expectRefused({ ...base, status: 'unverified' }, "source help-thing", 'unverified sources carry no lastVerified date');
    expectRefused({ ...base, lastVerified: null }, 'lastVerified required unless status is unverified');
    expect(defineSource({ ...base, status: 'unverified', lastVerified: null }).lastVerified).toBeNull();
  });

  it('requires a changeNote when status is documentation_changed', () => {
    expectRefused({ ...base, status: 'documentation_changed' }, 'documentation_changed requires changeNote');
    const changed = defineSource({ ...base, status: 'documentation_changed', changeNote: { since: '2026-08-15', what: 'Limit raised.' } });
    expect(changed.changeNote).toEqual({ since: '2026-08-15', what: 'Limit raised.' });
  });

  it('never accepts an authored stale status', () => {
    expectRefused({ ...base, status: 'stale' }, "'stale' is derived, never authored");
  });

  it('id prefix must match the tier', () => {
    expectRefused({ ...base, id: 'dev-thing' }, "id prefix must be 'help-' for tier help");
    expectRefused({ ...base, id: 'kb-thing' }); // outside the regex entirely
    expectRefused({ ...base, id: 'help-thing', tier: 'developer' }, "id prefix must be 'dev-' for tier developer");
    for (const tier of SOURCE_TIERS) {
      expect(defineSource({ ...base, id: `${tierPrefix[tier]}-thing`, tier }).tier).toBe(tier);
    }
  });

  it('requires docVersion for PDF urls', () => {
    expectRefused({ ...base, url: 'https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/thing.pdf' }, 'docVersion required for PDF sources');
    expect(defineSource({ ...base, url: 'https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/thing.PDF', docVersion: "Winter '27" }).docVersion).toBe("Winter '27");
  });

  it('release ids follow <season>-<yy>', () => {
    expectRefused({ ...base, release: "Winter '27" });
    expect(defineSource({ ...base, release: 'winter-27', apiVersion: '68.0' }).release).toBe('winter-27');
  });
});

describe('defineRelease', () => {
  const release = { id: 'winter-27', name: "Winter '27", apiVersion: '68.0', ga: { sandboxPreview: '2026-08-28', productionWeekends: ['2026-09-04'] }, notesUrl: 'https://help.salesforce.com/s/articleView?id=release-notes.salesforce_release_notes.htm&release=264&type=5', sourceId: 'rn-w27-home' };

  it('parses and names the release on failure', () => {
    expect(defineRelease(release)).toEqual(release);
    expect(() => defineRelease({ ...release, apiVersion: '68' })).toThrow(/release winter-27/);
    expect(() => defineRelease({ ...release, id: 'w27' })).toThrow(SourceAuthoringError);
  });
});

describe('tiers', () => {
  it('priority and prefix tables cover every tier in spec order', () => {
    expect(tierPriority).toEqual({ help: 1, developer: 2, architect: 3, trust_release: 4, other: 5 });
    expect(tierPrefix).toEqual({ help: 'help', developer: 'dev', architect: 'arch', trust_release: 'rn', other: 'other' });
    expect(SOURCES_CONFIG.tierOrder).toEqual(['help', 'developer', 'architect', 'trust_release', 'other']);
  });

  it('isLimitGradeSource admits help/developer/architect only at max priority 3', () => {
    expect(isLimitGradeSource({ tier: 'help' }, 3)).toBe(true);
    expect(isLimitGradeSource({ tier: 'architect' }, 3)).toBe(true);
    expect(isLimitGradeSource({ tier: 'trust_release' }, 3)).toBe(false);
    expect(isLimitGradeSource({ tier: 'other' }, 3)).toBe(false);
  });
});

describe('registry helpers', () => {
  const sources = [
    defineSource({ ...base, id: 'other-b', tier: 'other' }),
    defineSource({ ...base, id: 'dev-z', tier: 'developer' }),
    defineSource({ ...base, id: 'help-b' }),
    defineSource({ ...base, id: 'help-a' }),
    defineSource({ ...base, id: 'rn-a', tier: 'trust_release' }),
  ];

  it('sourcesByTier orders by tierOrder then id and does not mutate', () => {
    expect(sourcesByTier(sources).map((source) => source.id)).toEqual(['help-a', 'help-b', 'dev-z', 'rn-a', 'other-b']);
    expect(sources.map((source) => source.id)).toEqual(['other-b', 'dev-z', 'help-b', 'help-a', 'rn-a']);
  });

  it('groupSourcesByTier omits empty tiers', () => {
    expect(groupSourcesByTier(sources).map((group) => `${group.tier}:${group.sources.length}`)).toEqual(['help:2', 'developer:1', 'trust_release:1', 'other:1']);
  });

  it('getSource / requireSource / indexSources / getRelease', () => {
    expect(getSource(sources, 'help-a')?.id).toBe('help-a');
    expect(getSource(indexSources(sources), 'dev-z')?.id).toBe('dev-z');
    expect(getSource(sources, 'help-none')).toBeUndefined();
    expect(() => requireSource(sources, 'help-none')).toThrow("unknown source id 'help-none'");
    const release = defineRelease({ id: 'summer-26', name: "Summer '26", apiVersion: '67.0', ga: { sandboxPreview: '', productionWeekends: [] }, notesUrl: 'https://example.com', sourceId: 'rn-a' });
    expect(getRelease([release], 'summer-26')).toBe(release);
    expect(getRelease([release], 'winter-27')).toBeUndefined();
  });
});
