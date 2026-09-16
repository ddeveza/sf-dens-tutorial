import { describe, expect, it } from 'vitest';
import { FIXTURE_LESSON, FIXTURE_SOURCES, FIXTURE_TODAY } from '../../tests/fixtures/lesson-fixture.ts';
import { SOURCES_CONFIG } from '../sources/config.ts';
import { defineSource } from '../sources/builders.ts';
import { EFFECTIVE_STATUS_ORDER } from '../sources/types.ts';
import {
  daysBetween,
  effectiveSourceStatus,
  effectiveStatus,
  effectiveVerification,
  isStale,
  lessonOwnStatus,
  lessonVerificationView,
  rankStatus,
  truncateChangeNote,
  worstStatus,
} from './verification.ts';

const verified = { status: 'verified', lastVerified: '2026-09-01' } as const;

describe('status ordering', () => {
  it('ranks verified < stale < unverified < documentation_changed < retired < draft', () => {
    expect(EFFECTIVE_STATUS_ORDER).toEqual(['verified', 'stale', 'unverified', 'documentation_changed', 'retired', 'draft']);
    expect(rankStatus('verified')).toBeLessThan(rankStatus('stale'));
    expect(rankStatus('stale')).toBeLessThan(rankStatus('unverified'));
    expect(rankStatus('unverified')).toBeLessThan(rankStatus('documentation_changed'));
    expect(rankStatus('documentation_changed')).toBeLessThan(rankStatus('retired'));
    expect(rankStatus('retired')).toBeLessThan(rankStatus('draft'));
  });

  it('worstStatus picks the highest rank regardless of position', () => {
    expect(worstStatus('verified')).toBe('verified');
    expect(worstStatus('verified', 'stale')).toBe('stale');
    expect(worstStatus('stale', 'unverified', 'verified')).toBe('unverified');
    expect(worstStatus('unverified', 'documentation_changed')).toBe('documentation_changed');
    expect(worstStatus('draft', 'retired', 'documentation_changed')).toBe('draft');
    expect(worstStatus('retired', 'verified')).toBe('retired');
  });
});

describe('dates and staleness', () => {
  it('daysBetween counts whole UTC days, negative backwards', () => {
    expect(daysBetween('2026-09-01', '2026-09-11')).toBe(10);
    expect(daysBetween('2026-09-11', '2026-09-01')).toBe(-10);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('isStale is strictly more than staleAfterDays', () => {
    expect(SOURCES_CONFIG.staleAfterDays).toBe(130);
    expect(isStale('2026-05-01', '2026-09-08')).toBe(false); // 130 days
    expect(isStale('2026-05-01', '2026-09-09')).toBe(true); // 131 days
  });

  it('lessonOwnStatus derives stale, never authored; future or invalid dates are draft', () => {
    expect(lessonOwnStatus(verified, '2026-09-11')).toBe('verified');
    expect(lessonOwnStatus(verified, '2027-01-09')).toBe('verified'); // 2026-09-01 + 130 days
    expect(lessonOwnStatus(verified, '2027-01-10')).toBe('stale'); // 131 days
    expect(lessonOwnStatus({ status: 'documentation_changed', lastVerified: '2025-01-01' }, '2026-09-11')).toBe('documentation_changed');
    expect(lessonOwnStatus({ status: 'draft', lastVerified: '2026-09-01' }, '2026-09-11')).toBe('draft');
    expect(lessonOwnStatus({ status: 'verified', lastVerified: '2026-09-12' }, '2026-09-11')).toBe('draft');
    expect(lessonOwnStatus({ status: 'verified', lastVerified: 'not-a-date' }, '2026-09-11')).toBe('draft');
  });
});

describe('effectiveSourceStatus and the changeNote.since rule', () => {
  const changed = defineSource({
    id: 'help-changed',
    title: 'Changed',
    url: 'https://help.example.com/changed',
    tier: 'help',
    lastVerified: '2026-06-01',
    status: 'documentation_changed',
    changeNote: { since: '2026-08-15', what: 'Numbers moved.' },
  });

  it('counts documentation_changed as verified when the lesson was verified after changeNote.since', () => {
    expect(effectiveSourceStatus(changed, '2026-09-01', '2026-09-11')).toBe('verified');
  });

  it('keeps documentation_changed when the lesson is older than or equal to changeNote.since', () => {
    expect(effectiveSourceStatus(changed, '2026-08-15', '2026-09-11')).toBe('documentation_changed');
    expect(effectiveSourceStatus(changed, '2026-08-01', '2026-09-11')).toBe('documentation_changed');
  });

  it('upgrades a verified source to stale past staleAfterDays', () => {
    const old = defineSource({ id: 'help-old', title: 'Old', url: 'https://help.example.com/old', tier: 'help', lastVerified: '2026-01-01', status: 'verified' });
    expect(effectiveSourceStatus(old, '2026-09-01', '2026-05-10')).toBe('verified');
    expect(effectiveSourceStatus(old, '2026-09-01', '2026-09-11')).toBe('stale');
  });

  it('unverified and retired pass through', () => {
    const unverified = defineSource({ id: 'dev-unverified', title: 'U', url: 'https://developer.example.com/u', tier: 'developer', lastVerified: null, status: 'unverified' });
    expect(effectiveSourceStatus(unverified, '2026-09-01', '2026-09-11')).toBe('unverified');
    const retired = defineSource({ id: 'dev-retired', title: 'R', url: 'https://developer.example.com/r', tier: 'developer', lastVerified: '2026-09-01', status: 'retired' });
    expect(effectiveSourceStatus(retired, '2026-09-01', '2026-09-11')).toBe('retired');
  });
});

describe('effectiveVerification over a lesson', () => {
  it('is worst-of the lesson and its cited sources; the fixture is verified because its changed source predates the lesson', () => {
    const result = effectiveVerification(FIXTURE_LESSON, FIXTURE_SOURCES, FIXTURE_TODAY);
    expect(result.status).toBe('verified');
    expect(result.lessonStatus).toBe('verified');
    expect(result.sourceStatuses.map((entry) => `${entry.sourceId}:${entry.status}`)).toEqual([
      'help-fixture-basics:verified',
      'dev-fixture-guide:verified',
      'arch-fixture-changed:verified',
      'other-fixture-blog:verified',
    ]);
    expect(result.changeNotes).toEqual([]);
    expect(result.missingSourceIds).toEqual([]);
  });

  it('flags documentation_changed with the change note when the lesson is older than changeNote.since', () => {
    const older = { ...FIXTURE_LESSON, verification: { ...FIXTURE_LESSON.verification, lastVerified: '2026-08-01' } };
    const result = effectiveVerification(older, FIXTURE_SOURCES, FIXTURE_TODAY);
    expect(result.status).toBe('documentation_changed');
    expect(result.changeNotes).toEqual([
      {
        sourceId: 'arch-fixture-changed',
        title: 'Fixture architect guide',
        url: 'https://architect.example.com/fixture/guide',
        since: '2026-08-15',
        what: 'The guide now describes the bookmark rule differently.',
      },
    ]);
  });

  it('derives stale for the lesson itself past staleAfterDays and ranks a missing source as unverified above it', () => {
    expect(effectiveStatus(FIXTURE_LESSON, FIXTURE_SOURCES, '2027-03-01')).toBe('stale');
    const missing = { ...FIXTURE_LESSON, sources: [...FIXTURE_LESSON.sources, 'help-nowhere'] };
    const result = effectiveVerification(missing, FIXTURE_SOURCES, '2027-03-01');
    expect(result.status).toBe('unverified');
    expect(result.missingSourceIds).toEqual(['help-nowhere']);
  });

  it('accepts a prebuilt Map as the source lookup', () => {
    const map = new Map(FIXTURE_SOURCES.map((source) => [source.id, source]));
    expect(effectiveStatus(FIXTURE_LESSON, map, FIXTURE_TODAY)).toBe('verified');
  });

  it('lessonVerificationView keeps the authored status and adds effectiveStatus', () => {
    const older = { ...FIXTURE_LESSON, verification: { ...FIXTURE_LESSON.verification, lastVerified: '2026-08-01' } };
    const view = lessonVerificationView(older, FIXTURE_SOURCES, FIXTURE_TODAY);
    expect(view.status).toBe('verified');
    expect(view.effectiveStatus).toBe('documentation_changed');
    expect(view.release).toBe('summer-26');
    expect(view.apiVersion).toBe('67.0');
    expect(view.docVersion).toBe('fixture-1');
    expect(view.lastVerified).toBe('2026-08-01');
    expect(view.changeNotes).toHaveLength(1);
  });
});

describe('truncateChangeNote', () => {
  it('leaves short notes alone and truncates long ones to the configured length with an ellipsis', () => {
    expect(truncateChangeNote('short')).toBe('short');
    const long = 'x'.repeat(500);
    const cut = truncateChangeNote(long);
    expect(cut.length).toBe(SOURCES_CONFIG.showChangeNoteMaxChars);
    expect(cut.endsWith('…')).toBe(true);
    expect(truncateChangeNote('abcdef', 4)).toBe('abc…');
  });
});
