import { describe, expect, it } from 'vitest';
import type { Depth, Dimension, DimensionState, MasteryState } from '../mastery-engine/types.ts';
import type { ScorerKind } from '../assessments/types.ts';
import { SR_CONFIG } from './config.ts';
import { addDays } from './dates.ts';
import {
  createReviewItemForFailure,
  createReviewItemForSkippedGap,
  generateReviewItem,
  reviewDepthFor,
  scorerOf,
  shouldCreateSkippedGapItem,
  weakestEvidencedDimension,
  type ReviewConcept,
} from './generate.ts';
import type { ReviewItemDraft } from './patch.ts';

const TODAY = '2026-09-07';
const NO_EVIDENCE: DimensionState = { score: 0, evidenceCount: 0, maxDepthPassed: 0, lastEvidenceAt: null };

function dim(score: number, evidenceCount: number, maxDepthPassed: Depth | 0 = 0): DimensionState {
  return { score, evidenceCount, maxDepthPassed, lastEvidenceAt: '2026-09-06T10:00:00.000Z' };
}

function makeState(overrides: Partial<Omit<MasteryState, 'dims'>> & { dims?: Partial<Record<Dimension, DimensionState>> } = {}): MasteryState {
  const { dims, ...rest } = overrides;
  return {
    userId: 'u1',
    conceptId: 'soql-in-loops',
    dims: {
      recall: NO_EVIDENCE,
      understanding: NO_EVIDENCE,
      application: NO_EVIDENCE,
      debugging: NO_EVIDENCE,
      architecture: NO_EVIDENCE,
      teach_back: NO_EVIDENCE,
      ...dims,
    },
    overallRaw: 0,
    overall: 0,
    band: 'lost',
    capReason: null,
    consecutiveRecallCorrect: 0,
    chainRung: 0,
    lastProbeAngle: null,
    recentProbeAngles: [],
    recentPassedFormKeys: [],
    recentPassedFormKeyAt: {},
    held: [],
    weakAreas: [],
    updatedAt: '2026-09-06T10:00:00.000Z',
    ...rest,
  };
}

const concept: ReviewConcept = {
  slug: 'soql-in-loops',
  probeAngles: ['why', 'what_if', 'what_breaks', 'what_would_you_change', 'explain_without_jargon', 'explain_to_junior', 'predict'],
};

const kindOf = (questionType: ReviewItemDraft['questionType']): ScorerKind | null => scorerOf(questionType);

describe('weakestEvidencedDimension', () => {
  it('picks the lowest score among evidenced dimensions and ignores unevidenced ones', () => {
    const state = makeState({
      dims: { recall: dim(80, 3, 2), understanding: dim(45, 2, 3), application: dim(70, 1, 3), debugging: dim(5, 0) },
    });
    expect(weakestEvidencedDimension(state)).toBe('understanding');
  });

  it('returns understanding when nothing is evidenced', () => {
    expect(weakestEvidencedDimension(makeState())).toBe('understanding');
  });

  it('breaks ties in dimension order', () => {
    const state = makeState({ dims: { application: dim(40, 1), recall: dim(40, 1) } });
    expect(weakestEvidencedDimension(state)).toBe('recall');
  });
});

describe('reviewDepthFor', () => {
  it('is max(windowMin[band], maxDepthPassed)', () => {
    expect(reviewDepthFor(makeState({ band: 'developing', dims: { understanding: dim(45, 2, 4) } }), 'understanding')).toBe(4);
    expect(reviewDepthFor(makeState({ band: 'developing', dims: { understanding: dim(45, 2, 2) } }), 'understanding')).toBe(3);
    expect(reviewDepthFor(makeState({ band: 'lost' }), 'understanding')).toBe(1);
    expect(reviewDepthFor(makeState({ band: 'mastered', dims: { architecture: dim(96, 4, 8) } }), 'architecture')).toBe(8);
  });
});

describe('generateReviewItem', () => {
  it('targets weakest evidenced dimension, excludes recentPassedFormKeys and recentProbeAngles', () => {
    const state = makeState({
      band: 'familiar',
      dims: { recall: dim(80, 3, 2), understanding: dim(45, 2, 3), application: dim(70, 1, 3) },
      recentProbeAngles: ['why'],
      recentPassedFormKeys: ['d001-q1', 'd001-q4'],
    });
    const previous: ReviewItemDraft = {
      userId: 'u1',
      conceptId: 'soql-in-loops',
      dimension: 'recall',
      depth: 2,
      questionType: 'mcq',
      angle: null,
      excludeFormKeys: [],
      dueOn: TODAY,
      intervalDays: 3,
      lastOutcome: 'struggle',
      reviewCount: 1,
      lapses: 0,
      reason: 'scheduled',
    };

    const { item, reviewPatch } = generateReviewItem(state, concept, previous, TODAY);

    expect(item.dimension).toBe('understanding');
    expect(item.depth).toBe(3);
    expect(item.excludeFormKeys).toEqual(['d001-q1', 'd001-q4']);
    expect(reviewPatch.exclude_form_keys).toEqual(['d001-q1', 'd001-q4']);
    // previous review was deterministic => this one is LLM, at an understanding angle that is not recent
    expect(kindOf(item.questionType)).toBe('llm');
    expect(item.angle).toBe('explain_without_jargon');
    expect(item.questionType).toBe('teach_back');
    expect(state.recentProbeAngles).not.toContain(item.angle);
  });

  it('never repeats the previous item angle even when it has dropped out of recentProbeAngles', () => {
    const state = makeState({ dims: { understanding: dim(45, 2, 3) }, recentProbeAngles: [] });
    const previous: ReviewItemDraft = {
      userId: 'u1',
      conceptId: 'soql-in-loops',
      dimension: 'understanding',
      depth: 3,
      questionType: 'mcq',
      angle: 'why',
      excludeFormKeys: [],
      dueOn: TODAY,
      intervalDays: 3,
      lastOutcome: 'struggle',
      reviewCount: 1,
      lapses: 0,
      reason: 'scheduled',
    };
    const { item } = generateReviewItem(state, { slug: concept.slug, probeAngles: ['why', 'explain_without_jargon'] }, previous, TODAY);
    expect(item.angle).toBe('explain_without_jargon');
  });

  it('generateReviewItem alternates deterministic and llm question types across consecutive reviews', () => {
    const state = makeState({ band: 'developing', dims: { understanding: dim(50, 2, 3) } });

    const first = generateReviewItem(state, concept, null, TODAY);
    expect(kindOf(first.item.questionType)).toBe('deterministic');
    expect(first.item.angle).toBeNull();

    const second = generateReviewItem(state, concept, first.item, TODAY);
    expect(kindOf(second.item.questionType)).toBe('llm');
    expect(second.item.angle).toBe('why');
    expect(second.item.questionType).toBe('explain_why');

    const third = generateReviewItem(state, concept, second.item, TODAY);
    expect(kindOf(third.item.questionType)).toBe('deterministic');

    const fourth = generateReviewItem(state, concept, third.item, TODAY);
    expect(kindOf(fourth.item.questionType)).toBe('llm');
  });

  it('prefers a question type whose depth range contains the review depth', () => {
    // developing band => depth 3; order_execution (2-5) is understanding's primary deterministic type
    expect(generateReviewItem(makeState({ band: 'developing', dims: { understanding: dim(50, 2, 3) } }), concept, null, TODAY).item.questionType).toBe(
      'order_execution',
    );
    // lost band => depth 1; order_execution does not fit, mcq (1-4) does
    expect(generateReviewItem(makeState({ band: 'lost', dims: { understanding: dim(50, 2, 1) } }), concept, null, TODAY).item.questionType).toBe('mcq');
  });

  it('uses an angle-less LLM pool type when every angle for the dimension is recent', () => {
    const state = makeState({
      band: 'developing',
      dims: { understanding: dim(45, 2, 3) },
      recentProbeAngles: ['why', 'explain_without_jargon', 'what_if'],
    });
    const previous = generateReviewItem(state, concept, null, TODAY).item; // deterministic
    const { item } = generateReviewItem(state, concept, previous, TODAY);
    expect(kindOf(item.questionType)).toBe('llm');
    expect(item.angle).toBeNull();
    expect(item.questionType).toBe('explain_why');
  });

  it('falls through to LLM when the dimension has no deterministic type (architecture, teach_back)', () => {
    const arch = generateReviewItem(makeState({ band: 'strong', dims: { architecture: dim(30, 1, 5), recall: dim(90, 5, 3) } }), { slug: concept.slug, probeAngles: [] }, null, TODAY);
    expect(arch.item.dimension).toBe('architecture');
    expect(arch.item.questionType).toBe('compare_approaches');
    expect(arch.item.angle).toBeNull();

    const withAngle = generateReviewItem(makeState({ band: 'strong', dims: { architecture: dim(30, 1, 6), recall: dim(90, 5, 3) } }), concept, null, TODAY);
    expect(withAngle.item.angle).toBe('what_would_you_change');
    expect(withAngle.item.questionType).toBe('fix_design');
    expect(withAngle.item.depth).toBe(6);

    const teach = generateReviewItem(makeState({ band: 'competent', dims: { teach_back: dim(40, 1, 4), recall: dim(90, 5, 3) } }), concept, null, TODAY);
    expect(teach.item.dimension).toBe('teach_back');
    expect(teach.item.questionType).toBe('teach_back');
    expect(teach.item.angle).toBe('explain_to_junior');
  });

  it('rides the deterministic predict angle for application when available and not recent', () => {
    const state = makeState({ band: 'developing', dims: { application: dim(30, 1, 3), recall: dim(90, 3, 2) } });
    const predicted = generateReviewItem(state, { slug: concept.slug, probeAngles: ['predict', 'what_if'] }, null, TODAY);
    expect(predicted.item.dimension).toBe('application');
    expect(predicted.item.questionType).toBe('predict_outcome');
    expect(predicted.item.angle).toBe('predict');

    const recent = generateReviewItem({ ...state, recentProbeAngles: ['predict'] }, { slug: concept.slug, probeAngles: ['predict', 'what_if'] }, null, TODAY);
    expect(recent.item.questionType).toBe('predict_outcome');
    expect(recent.item.angle).toBeNull();
  });

  it('chooses what_breaks question type by depth: explain_why at 5, scenario_diagnosis above', () => {
    const at5 = generateReviewItem(makeState({ band: 'strong', dims: { debugging: dim(30, 1, 5), recall: dim(90, 3, 2) } }), { slug: concept.slug, probeAngles: ['what_breaks'] }, { ...generateReviewItem(makeState(), concept, null, TODAY).item, questionType: 'mcq' }, TODAY);
    expect(at5.item.angle).toBe('what_breaks');
    expect(at5.item.questionType).toBe('explain_why');

    const at6 = generateReviewItem(makeState({ band: 'strong', dims: { debugging: dim(30, 1, 6), recall: dim(90, 3, 2) } }), { slug: concept.slug, probeAngles: ['what_breaks'] }, { ...generateReviewItem(makeState(), concept, null, TODAY).item, questionType: 'mcq' }, TODAY);
    expect(at6.item.questionType).toBe('scenario_diagnosis');
  });

  it('a fresh item is due tomorrow with interval 1 and no history; the reason reflects weakness', () => {
    const weak = generateReviewItem(makeState({ dims: { understanding: dim(45, 2, 2) } }), concept, null, TODAY);
    expect(weak.item.userId).toBe('u1');
    expect(weak.item.conceptId).toBe('soql-in-loops');
    expect(weak.item.dueOn).toBe(addDays(TODAY, 1));
    expect(weak.item.intervalDays).toBe(1);
    expect(weak.item.lastOutcome).toBeNull();
    expect(weak.item.reviewCount).toBe(0);
    expect(weak.item.lapses).toBe(0);
    expect(weak.item.reason).toBe('weak_dimension');
    expect('id' in weak.item).toBe(false);

    const fine = generateReviewItem(makeState({ band: 'competent', dims: { understanding: dim(60, 2, 4), recall: dim(80, 3, 2) } }), concept, null, TODAY);
    expect(fine.item.reason).toBe('scheduled');
  });

  it('a regenerated item keeps the previous schedule and identity', () => {
    const state = makeState({ dims: { understanding: dim(45, 2, 2) } });
    const previous: ReviewItemDraft = {
      id: 'r9',
      userId: 'u1',
      conceptId: 'soql-in-loops',
      dimension: 'recall',
      depth: 2,
      questionType: 'mcq',
      angle: null,
      excludeFormKeys: ['old'],
      dueOn: '2026-09-14',
      intervalDays: 7,
      lastOutcome: 'strong',
      reviewCount: 3,
      lapses: 1,
      reason: 'failed_attempt',
    };
    const { item, reviewPatch } = generateReviewItem(state, concept, previous, TODAY);
    expect(item.id).toBe('r9');
    expect(item.dueOn).toBe('2026-09-14');
    expect(item.intervalDays).toBe(7);
    expect(item.lastOutcome).toBe('strong');
    expect(item.reviewCount).toBe(3);
    expect(item.lapses).toBe(1);
    expect(item.reason).toBe('weak_dimension');
    expect(item.excludeFormKeys).toEqual([]); // replaced by the state's recent passed keys, not the old item's
    expect(reviewPatch.due_on).toBe('2026-09-14');
    expect(reviewPatch.review_count).toBe(3);
  });

  it('returns the reviewPatch with exactly the review_items columns', () => {
    const { reviewPatch } = generateReviewItem(makeState(), concept, null, TODAY);
    expect(reviewPatch).toEqual({
      concept_id: 'soql-in-loops',
      dimension: 'understanding',
      depth: 1,
      question_type: 'mcq',
      angle: null,
      exclude_form_keys: [],
      due_on: addDays(TODAY, 1),
      interval_days: 1,
      last_outcome: null,
      review_count: 0,
      lapses: 0,
      reason: 'weak_dimension',
    });
  });

  it('dedupes excludeFormKeys and copies them (no shared array with the state)', () => {
    const state = makeState({ recentPassedFormKeys: ['a', 'b', 'a'] });
    const { item } = generateReviewItem(state, concept, null, TODAY);
    expect(item.excludeFormKeys).toEqual(['a', 'b']);
    expect(item.excludeFormKeys).not.toBe(state.recentPassedFormKeys);
  });

  it('refuses a concept that does not match the mastery state', () => {
    expect(() => generateReviewItem(makeState(), { slug: 'other', probeAngles: [] }, null, TODAY)).toThrow(/concept/);
  });

  it('rejects a malformed todayLocal', () => {
    expect(() => generateReviewItem(makeState(), concept, null, '2026-9-7')).toThrow(TypeError);
  });
});

describe('createReviewItemForFailure', () => {
  it('is due tomorrow with reason failed_attempt and keeps review history from a live item', () => {
    const state = makeState({ dims: { understanding: dim(45, 2, 2) } });
    const fresh = createReviewItemForFailure(state, concept, null, TODAY);
    expect(fresh.item.reason).toBe('failed_attempt');
    expect(fresh.item.dueOn).toBe(addDays(TODAY, 1));
    expect(fresh.item.intervalDays).toBe(1);
    expect(fresh.reviewPatch.reason).toBe('failed_attempt');
    expect(fresh.reviewPatch.due_on).toBe(addDays(TODAY, 1));

    const live: ReviewItemDraft = { ...fresh.item, id: 'r1', dueOn: '2026-10-01', intervalDays: 21, lastOutcome: 'mastered', reviewCount: 4, lapses: 1, reason: 'scheduled' };
    const again = createReviewItemForFailure(state, concept, live, TODAY);
    expect(again.item.id).toBe('r1');
    expect(again.item.dueOn).toBe(addDays(TODAY, 1));
    expect(again.item.intervalDays).toBe(1);
    expect(again.item.reason).toBe('failed_attempt');
    expect(again.item.reviewCount).toBe(4);
    expect(again.item.lapses).toBe(1);
    expect(again.item.lastOutcome).toBe('mastered');
  });
});

describe('createReviewItemForSkippedGap', () => {
  it('is due tomorrow with reason skipped_with_gap', () => {
    const { item, reviewPatch } = createReviewItemForSkippedGap(makeState({ band: 'familiar' }), concept, null, TODAY);
    expect(item.reason).toBe('skipped_with_gap');
    expect(item.dueOn).toBe(addDays(TODAY, 1));
    expect(item.intervalDays).toBe(1);
    expect(reviewPatch.reason).toBe('skipped_with_gap');
  });

  it('shouldCreateSkippedGapItem is true below developing only', () => {
    expect(shouldCreateSkippedGapItem(makeState({ band: 'lost' }))).toBe(true);
    expect(shouldCreateSkippedGapItem(makeState({ band: 'familiar' }))).toBe(true);
    expect(shouldCreateSkippedGapItem(makeState({ band: 'developing' }))).toBe(false);
    expect(shouldCreateSkippedGapItem(makeState({ band: 'mastered' }))).toBe(false);
    expect(shouldCreateSkippedGapItem(makeState({ band: 'developing' }), { ...SR_CONFIG, skippedGapBandBelow: 'competent' })).toBe(true);
  });
});

describe('scorerOf', () => {
  it('reads the scorer from the config catalog and returns null for types reviews never generate', () => {
    expect(scorerOf('mcq')).toBe('deterministic');
    expect(scorerOf('predict_outcome')).toBe('deterministic');
    expect(scorerOf('explain_why')).toBe('llm');
    expect(scorerOf('teach_back')).toBe('llm');
    expect(scorerOf('boss')).toBeNull();
    expect(scorerOf('capstone')).toBeNull();
    expect(scorerOf('lab')).toBeNull();
  });
});
