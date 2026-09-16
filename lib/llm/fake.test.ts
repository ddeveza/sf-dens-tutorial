import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { LLM_CLASSES, type LlmClass } from '../assessments/types.ts';
import { MASTERY_CONFIG } from '../mastery-engine/config.ts';
import { FAKE_MARKERS, FAKE_MODEL_ID, fakeEvaluate } from './fake.ts';
import { buildMessages, buildSystem, type PromptInput } from './prompts.ts';
import {
  BOSS_RUBRIC_KEYS,
  BossRubricSchema,
  CAPSTONE_DIMENSIONS,
  CapstoneSchema,
  EvaluationSchema,
  type BossRubric,
  type CapstoneRubric,
  type EvaluationOut,
} from './schemas.ts';
import type { EvaluateResult } from './types.ts';

const INPUT: PromptInput = {
  concept: { slug: 'order-of-execution', band: 'familiar' },
  question: { type: 'explain_why', depth: 3, text: 'Why does a before-save flow not see the record id on insert?' },
  reference: 'Before-save runs before the record is committed; the id is assigned only when the row is written.',
  knownMisconceptions: [
    { id: 'id-before-commit', summary: 'Believes the id exists before the insert is committed.' },
    { id: 'flow-after-trigger', summary: 'Believes before-save flows run after before triggers.' },
  ],
  learnerAnswer: 'Because the id is only assigned when the row is written, and before-save runs before that.',
};

function args(cls: LlmClass, learnerAnswer: string, latencyMs?: number) {
  return { class: cls, system: buildSystem(cls), messages: buildMessages({ ...INPUT, learnerAnswer }), latencyMs };
}

function call(cls: LlmClass, schema: typeof EvaluationSchema, learnerAnswer: string, latencyMs?: number): Promise<EvaluateResult<EvaluationOut>>;
function call(cls: LlmClass, schema: typeof BossRubricSchema, learnerAnswer: string, latencyMs?: number): Promise<EvaluateResult<BossRubric>>;
function call(cls: LlmClass, schema: typeof CapstoneSchema, learnerAnswer: string, latencyMs?: number): Promise<EvaluateResult<CapstoneRubric>>;
function call(cls: LlmClass, schema: z.ZodType, learnerAnswer: string, latencyMs?: number): Promise<EvaluateResult<unknown>> {
  return fakeEvaluate({ ...args(cls, learnerAnswer, latencyMs), schema });
}

async function evaluation(learnerAnswer: string, cls: LlmClass = 'check'): Promise<EvaluationOut> {
  const result = await call(cls, EvaluationSchema, learnerAnswer);
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}: ${result.detail}`);
  return result.output;
}

async function boss(learnerAnswer: string): Promise<BossRubric> {
  const result = await call('boss', BossRubricSchema, learnerAnswer);
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.output;
}

async function capstone(learnerAnswer: string): Promise<CapstoneRubric> {
  const result = await call('capstone', CapstoneSchema, learnerAnswer);
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.output;
}

function mean(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

describe('fakeEvaluate: schema validity', () => {
  it.each(LLM_CLASSES)('%s with EvaluationSchema validates', async (cls) => {
    const result = await call(cls, EvaluationSchema, INPUT.learnerAnswer);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(EvaluationSchema.safeParse(result.output).success).toBe(true);
      expect(result.model).toBe(FAKE_MODEL_ID);
      expect(result.usage).toBeNull();
    }
  });

  it.each(LLM_CLASSES)('%s with BossRubricSchema validates', async (cls) => {
    const result = await call(cls, BossRubricSchema, INPUT.learnerAnswer);
    expect(result.ok).toBe(true);
    if (result.ok) expect(BossRubricSchema.safeParse(result.output).success).toBe(true);
  });

  it.each(LLM_CLASSES)('%s with CapstoneSchema validates', async (cls) => {
    const result = await call(cls, CapstoneSchema, INPUT.learnerAnswer);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(CapstoneSchema.safeParse(result.output).success).toBe(true);
      expect(Object.keys(result.output.scores).sort()).toEqual([...CAPSTONE_DIMENSIONS].sort());
    }
  });

  it('every marker produces a schema-valid output for every schema', async () => {
    for (const marker of [FAKE_MARKERS.weak, FAKE_MARKERS.strong, FAKE_MARKERS.wrong]) {
      const text = `${marker} some answer text`;
      expect(EvaluationSchema.safeParse(await evaluation(text)).success).toBe(true);
      expect(BossRubricSchema.safeParse(await boss(text)).success).toBe(true);
      expect(CapstoneSchema.safeParse(await capstone(text)).success).toBe(true);
    }
  });

  it('an empty answer is still schema-valid and scores low', async () => {
    const out = await evaluation('');
    expect(EvaluationSchema.safeParse(out).success).toBe(true);
    expect(out.correctness).toBeLessThan(MASTERY_CONFIG.correctThreshold);
    expect(out.masteryDelta).toBeLessThanOrEqual(0);
  });
});

describe('fakeEvaluate: markers', () => {
  it('[[weak]] reproduces the suspicious path: correct answer, weak understanding, probe next', async () => {
    const out = await evaluation(`${FAKE_MARKERS.weak} Bulkify the trigger.`);
    expect(out.correctness).toBeGreaterThanOrEqual(MASTERY_CONFIG.correctThreshold);
    expect(out.understanding).toBeLessThan(MASTERY_CONFIG.understandingBands.weak);
    expect(out.confidence).toBeLessThan(MASTERY_CONFIG.confidenceSignals.llmConfidenceWeak);
    expect(out.masteryDelta).toBe(0);
    expect(out.nextAction).toBe('probe');
  });

  it('[[strong]] produces a strong, creditable evaluation', async () => {
    const out = await evaluation(`${FAKE_MARKERS.strong} Because the id is assigned at commit.`);
    expect(out.correctness).toBeGreaterThanOrEqual(MASTERY_CONFIG.correctThreshold);
    expect(out.understanding).toBeGreaterThanOrEqual(MASTERY_CONFIG.understandingBands.strong);
    expect(out.masteryDelta).toBeGreaterThan(0);
    expect(out.nextAction).toBe('continue');
    expect(out.misconceptions).toEqual([]);
  });

  it('[[wrong]] produces an incorrect evaluation that withholds credit', async () => {
    const out = await evaluation(`${FAKE_MARKERS.wrong} The id is always there.`);
    expect(out.correctness).toBeLessThan(MASTERY_CONFIG.correctThreshold);
    expect(out.masteryDelta).toBeLessThan(0);
    expect(out.nextAction).toBe('reinforce');
  });

  it('weak and wrong answers report the first known misconception by its declared id', async () => {
    const weak = await evaluation(`${FAKE_MARKERS.weak} x`);
    expect(weak.misconceptions).toHaveLength(1);
    expect(weak.misconceptions[0].id).toBe('id-before-commit');
    const wrong = await evaluation(`${FAKE_MARKERS.wrong} x`);
    expect(wrong.misconceptions[0].id).toBe('id-before-commit');
  });

  it('[[misconception:<id>]] reports that id when it is declared and a null-id item otherwise', async () => {
    const declared = await evaluation(`${FAKE_MARKERS.strong} [[misconception:flow-after-trigger]] text`);
    expect(declared.misconceptions).toEqual([{ id: 'flow-after-trigger', summary: expect.any(String) }]);
    const unknown = await evaluation(`${FAKE_MARKERS.strong} [[misconception:not-declared]] text`);
    expect(unknown.misconceptions).toHaveLength(1);
    expect(unknown.misconceptions[0].id).toBeNull();
  });

  it('failure markers force each failure reason', async () => {
    const fail = await call('check', EvaluationSchema, `${FAKE_MARKERS.fail} x`);
    expect(fail).toMatchObject({ ok: false, reason: 'parse_null' });
    const truncated = await call('probe', EvaluationSchema, `${FAKE_MARKERS.truncated} x`);
    expect(truncated).toMatchObject({ ok: false, reason: 'truncated' });
    const refusal = await call('boss', BossRubricSchema, `${FAKE_MARKERS.refuse} x`);
    expect(refusal).toMatchObject({ ok: false, reason: 'refusal' });
    const error = await call('capstone', CapstoneSchema, `${FAKE_MARKERS.error} x`);
    expect(error).toMatchObject({ ok: false, reason: 'error' });
  });

  it('markers are stripped from the graded text and never echoed in feedback', async () => {
    const out = await evaluation(`${FAKE_MARKERS.strong} answer`);
    expect(out.feedback).not.toContain('[[');
  });
});

describe('fakeEvaluate: derivation without markers', () => {
  it('is deterministic for identical input', async () => {
    expect(await evaluation(INPUT.learnerAnswer)).toEqual(await evaluation(INPUT.learnerAnswer));
    expect(await boss(INPUT.learnerAnswer)).toEqual(await boss(INPUT.learnerAnswer));
    expect(await capstone(INPUT.learnerAnswer)).toEqual(await capstone(INPUT.learnerAnswer));
  });

  it('a mechanism-rich answer scores higher understanding than a bare assertion', async () => {
    const bare = await evaluation('No id.');
    const rich = await evaluation(
      'Because the id is only assigned when the row is written, so before-save runs before that and therefore the field is null; the same applies when the transaction rolls back.',
    );
    expect(rich.understanding).toBeGreaterThan(bare.understanding);
    expect(rich.correctness).toBeGreaterThan(bare.correctness);
    expect(rich.masteryDelta).toBeGreaterThan(bare.masteryDelta);
  });

  it('scores are integers within 0-100 and masteryDelta within -10..10', async () => {
    for (const text of ['x', 'because because because', 'a'.repeat(5000)]) {
      const out = await evaluation(text);
      for (const key of ['correctness', 'understanding', 'application', 'architecture', 'confidence'] as const) {
        expect(Number.isInteger(out[key])).toBe(true);
        expect(out[key]).toBeGreaterThanOrEqual(0);
        expect(out[key]).toBeLessThanOrEqual(100);
      }
      expect(out.masteryDelta).toBeGreaterThanOrEqual(-10);
      expect(out.masteryDelta).toBeLessThanOrEqual(10);
    }
  });
});

describe('fakeEvaluate: rubric shapes', () => {
  it('boss overall is the rounded mean of the six rubric scores', async () => {
    for (const text of [`${FAKE_MARKERS.strong} x`, `${FAKE_MARKERS.weak} x`, INPUT.learnerAnswer]) {
      const out = await boss(text);
      expect(out.overall).toBe(mean(BOSS_RUBRIC_KEYS.map((k) => out[k])));
      expect(out.strengths.length).toBeLessThanOrEqual(5);
      expect(out.gaps.length).toBeLessThanOrEqual(5);
    }
  });

  it('capstone overall is the rounded mean of the twelve scores', async () => {
    for (const text of [`${FAKE_MARKERS.strong} x`, `${FAKE_MARKERS.wrong} x`, INPUT.learnerAnswer]) {
      const out = await capstone(text);
      expect(out.overall).toBe(mean(CAPSTONE_DIMENSIONS.map((d) => out.scores[d])));
    }
  });

  it('strong and weak profiles are ordered on every rubric dimension', async () => {
    const strongBoss = await boss(`${FAKE_MARKERS.strong} x`);
    const weakBoss = await boss(`${FAKE_MARKERS.weak} x`);
    for (const k of BOSS_RUBRIC_KEYS) expect(strongBoss[k]).toBeGreaterThan(weakBoss[k]);
    const strongCap = await capstone(`${FAKE_MARKERS.strong} x`);
    const wrongCap = await capstone(`${FAKE_MARKERS.wrong} x`);
    for (const d of CAPSTONE_DIMENSIONS) expect(strongCap.scores[d]).toBeGreaterThan(wrongCap.scores[d]);
  });
});

describe('fakeEvaluate: latency and messages', () => {
  it('honours latencyMs', async () => {
    const started = performance.now();
    const result = await call('check', EvaluationSchema, 'x', 20);
    expect(result.ok).toBe(true);
    expect(performance.now() - started).toBeGreaterThanOrEqual(15);
  });

  it('grades an empty message list as an empty answer', async () => {
    const result = await fakeEvaluate({ class: 'check', schema: EvaluationSchema, system: buildSystem('check'), messages: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.correctness).toBeLessThan(MASTERY_CONFIG.correctThreshold);
  });
});
