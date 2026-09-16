import { describe, expect, it } from 'vitest';
import {
  EPOCH_ISO,
  MasteryStateSchema,
  createMasteryState,
  parseMasteryState,
  toMasteryPatch,
  toMasteryRow,
  totalEvidence,
} from './state.ts';
import { CONCEPT, NOW, USER, stateWith } from './test-fixtures.ts';
import { DIMENSIONS } from './types.ts';

describe('createMasteryState', () => {
  it('starts every dimension unevidenced at 0, band lost, nothing held', () => {
    const s = createMasteryState(USER, CONCEPT, NOW);
    expect(s.userId).toBe(USER);
    expect(s.conceptId).toBe(CONCEPT);
    for (const d of DIMENSIONS) {
      expect(s.dims[d]).toEqual({ score: 0, evidenceCount: 0, maxDepthPassed: 0, lastEvidenceAt: null });
    }
    expect(s.overallRaw).toBe(0);
    expect(s.overall).toBe(0);
    expect(s.band).toBe('lost');
    expect(s.capReason).toBeNull();
    expect(s.consecutiveRecallCorrect).toBe(0);
    expect(s.chainRung).toBe(0);
    expect(s.lastProbeAngle).toBeNull();
    expect(s.recentProbeAngles).toEqual([]);
    expect(s.recentPassedFormKeys).toEqual([]);
    expect(s.recentPassedFormKeyAt).toEqual({});
    expect(s.held).toEqual([]);
    expect(s.weakAreas).toEqual([]);
    expect(s.updatedAt).toBe(NOW);
  });

  it('accepts a Date for now', () => {
    expect(createMasteryState(USER, CONCEPT, new Date(NOW)).updatedAt).toBe(NOW);
  });
});

describe('row conversion', () => {
  const rich = stateWith(
    {
      recall: { score: 74, n: 5, depth: 2 },
      understanding: { score: 72, n: 3, depth: 3 },
      application: { score: 70, n: 2, depth: 4 },
    },
    {
      chainRung: 3,
      consecutiveRecallCorrect: 2,
      lastProbeAngle: 'why',
      recentProbeAngles: ['why', 'what_if'],
      recentPassedFormKeys: ['q1', 'q2'],
      recentPassedFormKeyAt: { q1: NOW, q2: NOW },
      held: [{ attemptId: 'a9', dimension: 'recall', delta: 12.5, expiresAt: '2026-09-14T10:00:00.000Z' }],
      weakAreas: ['m-1'],
    },
  );

  it('toMasteryRow writes the six score columns, overall, band, cap_reason, evidence_count and state jsonb', () => {
    const row = toMasteryRow(rich);
    expect(row.user_id).toBe(USER);
    expect(row.concept_id).toBe(CONCEPT);
    expect(row.recall).toBe(74);
    expect(row.understanding).toBe(72);
    expect(row.application).toBe(70);
    expect(row.debugging).toBe(0);
    expect(row.architecture).toBe(0);
    expect(row.teach_back).toBe(0);
    expect(row.overall).toBe(rich.overall);
    expect(row.band).toBe(rich.band);
    expect(row.cap_reason).toBe(rich.capReason);
    expect(row.evidence_count).toBe(10);
    expect(totalEvidence(rich)).toBe(10);
    expect(MasteryStateSchema.safeParse(row.state).success).toBe(true);
    expect(JSON.parse(JSON.stringify(row.state))).toEqual(row.state);
  });

  it('round-trips through parseMasteryState', () => {
    expect(parseMasteryState(toMasteryRow(rich))).toEqual(rich);
  });

  it('toMasteryPatch drops user_id (record_attempt derives it from auth.uid())', () => {
    const patch = toMasteryPatch(rich);
    expect('user_id' in patch).toBe(false);
    expect(patch.concept_id).toBe(CONCEPT);
  });

  it('parses a fresh row whose state is {} from the columns alone', () => {
    const s = parseMasteryState({
      user_id: USER,
      concept_id: CONCEPT,
      recall: 50,
      understanding: 0,
      application: 0,
      debugging: 0,
      architecture: 0,
      teach_back: 0,
      overall: 50,
      band: 'familiar',
      cap_reason: 'recall_only',
      evidence_count: 1,
      state: {},
      updated_at: NOW,
    });
    expect(s.dims.recall.score).toBe(50);
    expect(s.dims.recall.evidenceCount).toBe(0);
    expect(s.band).toBe('familiar');
    expect(s.capReason).toBe('recall_only');
    expect(s.held).toEqual([]);
    expect(s.updatedAt).toBe(NOW);
  });

  it('invalid state jsonb is not a crash path: falls back to defaults and keeps the columns', () => {
    const base = toMasteryRow(rich);
    const garbage = parseMasteryState({ ...base, state: 'not-an-object', updated_at: undefined });
    expect(garbage.dims.recall.score).toBe(74);
    expect(garbage.dims.recall.evidenceCount).toBe(0);
    expect(garbage.chainRung).toBe(0);
    expect(garbage.updatedAt).toBe(EPOCH_ISO);

    const partial = parseMasteryState({ ...base, state: { chainRung: 'x', dims: 42 } });
    expect(partial.chainRung).toBe(0);
    expect(partial.band).toBe(rich.band);
  });
});
