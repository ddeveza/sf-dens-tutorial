import { describe, expect, it } from 'vitest';
import { DB_CONFIG } from '../config.ts';
import { RecordAttemptPayloadSchema, payloadByteLength, type RecordAttemptPayload } from './attempts.ts';

// The record_attempt.test.sql fixture, as a Server Action would build it.
const mcq: RecordAttemptPayload = {
  attempt: {
    client_nonce: '11111111-1111-1111-1111-111111111111',
    kind: 'question',
    lesson_id: 'd001-what-is-metadata',
    concept_id: 'metadata',
    exercise_id: 'd001-what-is-metadata/q1',
    form_key: 'd001-what-is-metadata/q1',
    question_type: 'mcq',
    dimension: 'recall',
    depth: 1,
    scorer: 'deterministic',
    answer: 2,
    score: 100,
    correct: true,
  },
  masteryPatches: [
    {
      concept_id: 'metadata',
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
    },
  ],
  reviewPatches: null,
  xpEvents: [{ reason: 'answer_correct', ref: 'd001-what-is-metadata/q1', base: 10, multiplier: 1, amount: 10 }],
  stepPatch: { lesson_id: 'd001-what-is-metadata', step: 'assessment', status: 'completed', content_hash: 'h' },
  llmCalls: 0,
};

const boss: RecordAttemptPayload = {
  attempt: {
    client_nonce: 'aaaaaaaa-0000-0000-0000-000000000001',
    kind: 'boss',
    boss_kind: 'mission',
    boss_ref: 'w1-m1-basics',
    lesson_id: 'boss-w1-m1-basics',
    concept_ids: ['metadata', 'transaction-model'],
    form_key: 'boss-w1-m1-basics',
    question_type: 'boss',
    depth: 7,
    scorer: 'llm',
    llm_class: 'boss',
    answer: 'The after-update trigger re-enters itself.',
    score: 70,
    passed: true,
    duration_ms: 900_000,
    llm_evaluation: { suspect: 80, overall: 70, misconceptions: [], defeated: true },
    status: 'evaluated',
  },
  masteryPatches: null,
  reviewPatches: [
    {
      concept_id: 'metadata',
      dimension: 'understanding',
      depth: 3,
      question_type: 'explain_why',
      angle: 'what_if',
      interval_days: 3,
      reason: 'scheduled',
      // due_on omitted on purpose: record_attempt defaults it to local_date + interval_days
    },
  ],
  xpEvents: [
    { reason: 'mission_boss_attempted', ref: 'w1-m1-basics', base: 100, multiplier: 1, amount: 100 },
    { reason: 'mission_boss_defeated', ref: 'w1-m1-basics', base: 300, multiplier: 1, amount: 300 },
  ],
  stepPatch: null,
  llmCalls: 1,
};

function withAttempt(overrides: Record<string, unknown>): unknown {
  return { ...mcq, attempt: { ...mcq.attempt, ...overrides } };
}

describe('RecordAttemptPayloadSchema', () => {
  it('parses the record_attempt fixture unchanged and its output satisfies RecordAttemptPayload', () => {
    const out: RecordAttemptPayload = RecordAttemptPayloadSchema.parse(mcq);
    expect(out).toEqual(mcq);
  });

  it('accepts a boss payload whose review patches omit due_on (SQL defaults it)', () => {
    expect(RecordAttemptPayloadSchema.parse(boss)).toEqual(boss);
  });

  it('strips identity columns a client might inject (user_id, local_date, id are the function\'s)', () => {
    const out = RecordAttemptPayloadSchema.parse(
      withAttempt({ user_id: '00000000-0000-0000-0000-00000000000b', local_date: '2020-01-01', id: 5 }),
    );
    expect(out.attempt).not.toHaveProperty('user_id');
    expect(out.attempt).not.toHaveProperty('local_date');
    expect(out.attempt).not.toHaveProperty('id');
  });

  it.each<[string, unknown]>([
    ['missing form_key', withAttempt({ form_key: undefined })],
    ['empty form_key', withAttempt({ form_key: '' })],
    ['unknown kind', withAttempt({ kind: 'quiz' })],
    ['unknown question_type spelling', withAttempt({ question_type: 'predict' })],
    ['non-uuid client_nonce', withAttempt({ client_nonce: 'nonce-1' })],
    ['score above 100', withAttempt({ score: 101 })],
    ['depth above 8', withAttempt({ depth: 9 })],
    ['depth below 1', withAttempt({ depth: 0 })],
    ['self_confidence above 5', withAttempt({ self_confidence: 6 })],
    ['chain_rung above 5', withAttempt({ chain_rung: 6 })],
    ['duration above the 3 h clamp', withAttempt({ duration_ms: 10_800_001 })],
    ['negative duration', withAttempt({ duration_ms: -1 })],
    ['unknown llm_class', withAttempt({ llm_class: 'cheap' })],
    ['unknown verdict', withAttempt({ verdict: 'confident' })],
    ['missing answer', withAttempt({ answer: undefined })],
    ['unknown xp reason', { ...mcq, xpEvents: [{ reason: 'bonus', base: 1, amount: 1 }] }],
    ['xp amount above 5000', { ...mcq, xpEvents: [{ reason: 'answer_correct', base: 10, amount: 5001 }] }],
    ['xp multiplier above 4', { ...mcq, xpEvents: [{ reason: 'answer_correct', base: 10, multiplier: 4.5, amount: 10 }] }],
    ['xpEvents null (must be an array)', { ...mcq, xpEvents: null }],
    ['interval_days outside {1,3,7,21,30}', { ...boss, reviewPatches: [{ ...boss.reviewPatches![0], interval_days: 2 }] }],
    ['review patch without reason', { ...boss, reviewPatches: [{ ...boss.reviewPatches![0], reason: undefined }] }],
    ['mastery score above 100', { ...mcq, masteryPatches: [{ ...mcq.masteryPatches![0], overall: 101 }] }],
    ['unknown band', { ...mcq, masteryPatches: [{ ...mcq.masteryPatches![0], band: 'expert' }] }],
    ['unknown cap_reason', { ...mcq, masteryPatches: [{ ...mcq.masteryPatches![0], cap_reason: 'because' }] }],
    ['stepPatch with unknown status', { ...mcq, stepPatch: { ...mcq.stepPatch, status: 'done' } }],
    ['stepPatch without lesson_id', { ...mcq, stepPatch: { step: 'assessment', status: 'completed' } }],
    ['negative llmCalls', { ...mcq, llmCalls: -1 }],
    ['missing llmCalls', { ...mcq, llmCalls: undefined }],
    ['missing masteryPatches key', { ...mcq, masteryPatches: undefined }],
  ])('rejects %s', (_label, payload) => {
    expect(RecordAttemptPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('accepts every nullable column as null', () => {
    const out = RecordAttemptPayloadSchema.parse(
      withAttempt({
        lesson_id: null,
        exercise_id: null,
        score: null,
        correct: null,
        passed: null,
        self_confidence: null,
        probe_angle: null,
        chain_rung: null,
        review_item_id: null,
        llm_evaluation: null,
        applied_delta: null,
        failure_reason: null,
        next_retry_at: null,
      }),
    );
    expect(out.attempt.lesson_id).toBeNull();
    expect(out.attempt.llm_evaluation).toBeNull();
  });

  it('accepts the pending-evaluation shape (status, retry bookkeeping, ISO next_retry_at)', () => {
    const out = RecordAttemptPayloadSchema.parse(
      withAttempt({
        kind: 'explain_why',
        question_type: 'explain_why',
        dimension: 'understanding',
        depth: 3,
        scorer: 'llm',
        llm_class: 'probe',
        answer: 'Because metadata describes the org.',
        score: undefined,
        correct: undefined,
        status: 'pending_evaluation',
        failure_reason: 'truncated',
        retry_count: 0,
        next_retry_at: '2026-09-07T10:00:00Z',
      }),
    );
    expect(out.attempt.status).toBe('pending_evaluation');
    expect(out.attempt.next_retry_at).toBe('2026-09-07T10:00:00Z');
  });
});

describe('payload size refinement', () => {
  it('payloadByteLength counts UTF-8 bytes of the serialized payload', () => {
    expect(payloadByteLength({ a: 'x' })).toBe('{"a":"x"}'.length);
    expect(payloadByteLength({ a: 'é' })).toBe('{"a":"é"}'.length + 1); // é is two bytes
  });

  it('accepts a payload just under DB_CONFIG.payloadMaxBytes', () => {
    const base = payloadByteLength(withAttempt({ answer: '' }));
    const filler = 'x'.repeat(DB_CONFIG.payloadMaxBytes - base - 16);
    const result = RecordAttemptPayloadSchema.safeParse(withAttempt({ answer: filler }));
    expect(result.success).toBe(true);
  });

  it('rejects a payload over DB_CONFIG.payloadMaxBytes before any RPC', () => {
    const result = RecordAttemptPayloadSchema.safeParse(withAttempt({ answer: 'x'.repeat(DB_CONFIG.payloadMaxBytes) }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message).join(' ')).toContain(String(DB_CONFIG.payloadMaxBytes));
    }
  });
});
