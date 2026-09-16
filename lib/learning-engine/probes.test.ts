import { describe, expect, it } from 'vitest';
import { PROBE_CONFIG, type ProbeConfig } from './config.ts';
import {
  CHAIN_RUNGS,
  nextUnpassedRung,
  PROBE_CATALOG,
  probeDepthCap,
  probesRemaining,
  selectProbeAngle,
  shouldProbe,
  weakestEvidencedDimension,
  type ProbeSession,
} from './probes.ts';
import { PROBE_ANGLES } from './types.ts';
import { evidence, mastery, NOW } from './test-fixtures.ts';

const session: ProbeSession = { now: NOW, probesToday: 0, probesThisSession: 0, previousVerdict: null };
const DAY_MS = 86_400_000;
const ago = (days: number) => new Date(Date.parse(NOW) - days * DAY_MS).toISOString();

describe('PROBE_CATALOG', () => {
  it('matches the angle table: question type, dimension, depth, chain rung', () => {
    expect(PROBE_CATALOG.why).toMatchObject({ questionType: 'explain_why', dimension: 'understanding', depthMin: 2, depthMax: 2, rungs: [1] });
    expect(PROBE_CATALOG.what_if).toMatchObject({ questionType: 'explain_why', dimension: 'application', depthMin: 3, depthMax: 4, rungs: [2, 3] });
    expect(PROBE_CATALOG.what_breaks).toMatchObject({
      questionType: 'explain_why',
      altQuestionType: 'scenario_diagnosis',
      dimension: 'debugging',
      depthMin: 5,
      depthMax: 5,
      rungs: [],
    });
    expect(PROBE_CATALOG.what_would_you_change).toMatchObject({ questionType: 'fix_design', dimension: 'architecture', depthMin: 6, depthMax: 7, rungs: [4] });
    expect(PROBE_CATALOG.explain_without_jargon).toMatchObject({ questionType: 'teach_back', dimension: 'understanding', depthMin: 2, depthMax: 2, rungs: [] });
    expect(PROBE_CATALOG.explain_to_junior).toMatchObject({ questionType: 'teach_back', dimension: 'teach_back', depthMin: 2, depthMax: 5, rungs: [5] });
    expect(PROBE_CATALOG.predict).toMatchObject({ questionType: 'predict_outcome', dimension: 'application', depthMin: 3, depthMax: 3, rungs: [], deterministic: true });
    for (const angle of PROBE_ANGLES) expect(PROBE_CATALOG[angle].angle).toBe(angle);
  });

  it('the transfer chain is why -> what_if(single record) -> what_if(async) -> what_would_you_change -> explain_to_junior', () => {
    expect(CHAIN_RUNGS.map((r) => [r.rung, r.angle, r.variant])).toEqual([
      [1, 'why', null],
      [2, 'what_if', 'single_record'],
      [3, 'what_if', 'async'],
      [4, 'what_would_you_change', null],
      [5, 'explain_to_junior', null],
    ]);
    expect(nextUnpassedRung(0)?.rung).toBe(1);
    expect(nextUnpassedRung(2)?.rung).toBe(3);
    expect(nextUnpassedRung(5)).toBeNull();
  });

  it('probeDepthCap is bandDepthFloor + 2, never above 8', () => {
    expect(probeDepthCap('lost')).toBe(3);
    expect(probeDepthCap('competent')).toBe(6);
    expect(probeDepthCap('mastered')).toBe(8);
  });
});

describe('shouldProbe: depth >= bandDepthFloor and no fresh understanding => true; fresh understanding >= 70 within 3 days => false', () => {
  it('a correct deterministic answer at or above the floor with no understanding evidence probes', () => {
    expect(shouldProbe(mastery(), evidence({ depth: 1 }), session)).toBe(true);
    expect(shouldProbe(mastery({ band: 'developing' }), evidence({ depth: 3 }), session)).toBe(true);
    expect(shouldProbe(mastery({ band: 'developing' }), evidence({ depth: 4 }), session)).toBe(true);
  });

  it('does not probe below the band floor', () => {
    expect(shouldProbe(mastery({ band: 'competent' }), evidence({ depth: 3 }), session)).toBe(false);
    expect(shouldProbe(mastery({ band: 'familiar' }), evidence({ depth: 1 }), session)).toBe(false);
  });

  it('fresh understanding >= 70 within 3 days suppresses the probe; older or weaker understanding does not', () => {
    const fresh = mastery({}, { understanding: { score: 75, evidenceCount: 1, lastEvidenceAt: ago(1) } });
    expect(shouldProbe(fresh, evidence(), session)).toBe(false);

    const atBoundary = mastery({}, { understanding: { score: 75, evidenceCount: 1, lastEvidenceAt: ago(3) } });
    expect(shouldProbe(atBoundary, evidence(), session)).toBe(true);

    const stale = mastery({}, { understanding: { score: 90, evidenceCount: 3, lastEvidenceAt: ago(4) } });
    expect(shouldProbe(stale, evidence(), session)).toBe(true);

    const weak = mastery({}, { understanding: { score: 60, evidenceCount: 2, lastEvidenceAt: ago(1) } });
    expect(shouldProbe(weak, evidence(), session)).toBe(true);
  });

  it('never probes after a wrong answer or after an LLM-scored answer (unless forced)', () => {
    expect(shouldProbe(mastery(), evidence({ correct: false, score: 0 }), session)).toBe(false);
    expect(shouldProbe(mastery(), evidence({ scorer: 'llm', questionType: 'explain_why', depth: 2 }), session)).toBe(false);
  });
});

describe('shouldProbe: forced after suspicious verdict regardless of depth; respects per-concept and per-session caps', () => {
  it('a suspicious previous verdict forces the probe even below the floor', () => {
    const state = mastery({ band: 'competent' });
    expect(shouldProbe(state, evidence({ depth: 1 }), session)).toBe(false);
    expect(shouldProbe(state, evidence({ depth: 1 }), { ...session, previousVerdict: 'suspicious' })).toBe(true);
    // the mandatory follow-up fires after the LLM-scored probe itself
    const probeEvidence = evidence({ scorer: 'llm', questionType: 'explain_why', dimension: 'understanding', depth: 2, score: 72, probeAngle: 'why', chainRung: 1 });
    expect(shouldProbe(state, probeEvidence, { ...session, previousVerdict: 'suspicious' })).toBe(true);
  });

  it('a fast, confident answer early in a concept forces the probe (selfConfidence >= 4, < 5 s, fewer than 3 pieces of evidence)', () => {
    const state = mastery({ band: 'competent' });
    const fast = evidence({ depth: 1, selfConfidence: 5, durationMs: 4_000 });
    expect(shouldProbe(state, fast, session)).toBe(true);
    expect(shouldProbe(state, evidence({ depth: 1, selfConfidence: 3, durationMs: 4_000 }), session)).toBe(false);
    expect(shouldProbe(state, evidence({ depth: 1, selfConfidence: 5, durationMs: 5_000 }), session)).toBe(false);
    const experienced = mastery({ band: 'competent' }, { recall: { evidenceCount: 2, score: 80 }, application: { evidenceCount: 1, score: 80 } });
    expect(shouldProbe(experienced, fast, session)).toBe(false);
  });

  it('respects the per-concept-per-day and per-session caps, even when forced', () => {
    const forced = { ...session, previousVerdict: 'suspicious' as const };
    expect(shouldProbe(mastery(), evidence(), { ...forced, probesToday: PROBE_CONFIG.maxProbesPerConceptPerDay })).toBe(false);
    expect(shouldProbe(mastery(), evidence(), { ...forced, probesThisSession: PROBE_CONFIG.maxProbesPerSession })).toBe(false);
    expect(shouldProbe(mastery(), evidence(), { ...session, probesToday: 1, probesThisSession: 5 })).toBe(true);
    expect(probesRemaining({ probesToday: 2, probesThisSession: 0 })).toBe(false);
    expect(probesRemaining({ probesToday: 1, probesThisSession: 6 })).toBe(false);
    expect(probesRemaining({ probesToday: 1, probesThisSession: 5 })).toBe(true);
  });

  it('reads caps and windows from the config argument', () => {
    const config: ProbeConfig = { ...PROBE_CONFIG, maxProbesPerSession: 1, understandingFreshDays: 10 };
    expect(shouldProbe(mastery(), evidence(), { ...session, probesThisSession: 1 }, config)).toBe(false);
    const oldish = mastery({}, { understanding: { score: 80, evidenceCount: 1, lastEvidenceAt: ago(5) } });
    expect(shouldProbe(oldish, evidence(), session, config)).toBe(false);
  });
});

describe('selectProbeAngle: never repeats last 3 angles, prefers weakest dimension, predict-only without quota, skips angles without template', () => {
  const allTemplates = { probes: Object.fromEntries(PROBE_ANGLES.map((a) => [a, [`${a} template`]])) };

  it('skips the last three angles', () => {
    const state = mastery({ band: 'strong', recentProbeAngles: ['why', 'explain_without_jargon', 'what_if'] });
    const pick = selectProbeAngle(state, allTemplates, true);
    expect(pick).not.toBeNull();
    expect(['why', 'explain_without_jargon', 'what_if']).not.toContain(pick?.angle);
  });

  it('only the last probeAngleRepeatWindow angles are excluded', () => {
    const state = mastery({ band: 'strong', recentProbeAngles: ['what_breaks', 'why', 'explain_without_jargon', 'what_if'] });
    const understandingOnly = { probes: { why: ['t'], what_breaks: ['t'] } };
    expect(selectProbeAngle(state, understandingOnly, true)?.angle).toBe('what_breaks');
  });

  it('prefers the angle whose dimension is the weakest evidenced dimension (Understanding if none)', () => {
    const weakApplication = mastery(
      { band: 'developing' },
      { recall: { score: 80, evidenceCount: 2 }, understanding: { score: 60, evidenceCount: 1 }, application: { score: 20, evidenceCount: 1 } },
    );
    expect(weakestEvidencedDimension(weakApplication.dims)).toBe('application');
    expect(selectProbeAngle(weakApplication, allTemplates, true)?.angle).toBe('what_if');
    expect(weakestEvidencedDimension(mastery().dims)).toBe('understanding');
    expect(selectProbeAngle(mastery({ band: 'developing' }), allTemplates, true)?.dimension).toBe('understanding');
  });

  it('the next unpassed chain rung wins ties inside the preferred dimension', () => {
    const understanding = { probes: { explain_without_jargon: ['t'], why: ['t'] } };
    expect(selectProbeAngle(mastery({ chainRung: 0 }), understanding, true)).toMatchObject({ angle: 'why', rung: 1, variant: null });
    expect(selectProbeAngle(mastery({ chainRung: 1, recentProbeAngles: ['why'] }), understanding, true)).toMatchObject({
      angle: 'explain_without_jargon',
      rung: null,
    });
    // a passed rung does not disqualify its angle; only the repeat window does
    expect(selectProbeAngle(mastery({ chainRung: 1 }), understanding, true)).toMatchObject({ angle: 'why', rung: null });
    const application = { probes: { predict: ['t'], what_if: ['t'] } };
    const rung2 = selectProbeAngle(mastery({ band: 'developing', chainRung: 1 }), application, true);
    expect(rung2).toMatchObject({ angle: 'what_if', rung: 2, variant: 'single_record', depth: 3 });
    const rung3 = selectProbeAngle(mastery({ band: 'developing', chainRung: 2 }), application, true);
    expect(rung3).toMatchObject({ angle: 'what_if', rung: 3, variant: 'async' });
  });

  it('without LLM quota only predict is eligible; null when the concept has no predict template', () => {
    const state = mastery({ band: 'developing' });
    expect(selectProbeAngle(state, allTemplates, false)).toMatchObject({ angle: 'predict', questionType: 'predict_outcome', dimension: 'application', depth: 3 });
    expect(selectProbeAngle(state, { probes: { why: ['t'], what_if: ['t'] } }, false)).toBeNull();
  });

  it('skips angles without a template (missing or empty) and returns null when nothing is left', () => {
    const state = mastery({ band: 'developing' });
    expect(selectProbeAngle(state, { probes: { why: [], what_if: ['t'] } }, true)?.angle).toBe('what_if');
    expect(selectProbeAngle(state, { probes: {} }, true)).toBeNull();
    expect(selectProbeAngle(mastery({ recentProbeAngles: ['why'] }), { probes: { why: ['t'] } }, true)).toBeNull();
  });

  it('requires the angle depth to fit under bandDepthFloor + 2 and places the probe inside the angle range', () => {
    const lost = mastery({ band: 'lost' }, { debugging: { score: 10, evidenceCount: 1 } });
    // what_breaks (depth 5) does not fit under 1 + 2; explain_without_jargon is the understanding fallback via catalog order
    const pick = selectProbeAngle(lost, { probes: { what_breaks: ['t'], what_if: ['t'] } }, true);
    expect(pick?.angle).toBe('what_if');
    expect(pick?.depth).toBe(3);

    const strong = mastery({ band: 'strong' }, { debugging: { score: 10, evidenceCount: 1 } });
    expect(selectProbeAngle(strong, { probes: { what_breaks: ['t'] } }, true)).toMatchObject({ angle: 'what_breaks', depth: 5, questionType: 'explain_why' });

    const masteredArchitecture = mastery({ band: 'mastered' }, { architecture: { score: 30, evidenceCount: 1 } });
    expect(selectProbeAngle(masteredArchitecture, { probes: { what_would_you_change: ['t'] } }, true)).toMatchObject({ angle: 'what_would_you_change', depth: 7 });
  });
});
