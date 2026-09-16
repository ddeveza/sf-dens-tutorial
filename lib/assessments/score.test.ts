import { describe, expect, it } from 'vitest';
import { ASSESSMENT_CONFIG } from './config.ts';
import { AssessmentError, coerceAnswer, scoreDeterministic, type DeterministicExerciseInput } from './score.ts';

const mcq: DeterministicExerciseInput = { type: 'mcq', options: ['a', 'b', 'c'], answer: 2 };
const multi: DeterministicExerciseInput = { type: 'multi_select', options: ['a', 'b', 'c', 'd'], answers: [0, 2] };
const tf: DeterministicExerciseInput = { type: 'true_false', answer: true };
const predictOptions: DeterministicExerciseInput = { type: 'predict_outcome', options: ['one', 'two'], answer: 1 };
const predictExact: DeterministicExerciseInput = { type: 'predict_outcome', answer: ['101', '101 records'] };
const order: DeterministicExerciseInput = { type: 'order_execution', order: [2, 0, 1, 3] };
const debug: DeterministicExerciseInput = { type: 'debug_code', bugLines: [4, 9], fix: 1 };
const anti: DeterministicExerciseInput = { type: 'find_anti_pattern', answer: 1, antiPatternId: 'soql-in-loop' };
const lab: DeterministicExerciseInput = { type: 'lab' };

describe('scoreDeterministic dispatch', () => {
  it.each([
    ['mcq exact', mcq, 2, 100],
    ['mcq wrong', mcq, 0, 0],
    ['mcq numeric string', mcq, '2', 100],
    ['multi_select exact', multi, [0, 2], 100],
    ['multi_select partial', multi, [0], 50],
    ['multi_select strings', multi, ['2', '0'], 100],
    ['multi_select single value', multi, 0, 50],
    ['multi_select empty', multi, [], 0],
    ['true_false boolean', tf, true, 100],
    ['true_false string', tf, 'TRUE', 100],
    ['true_false wrong string', tf, 'false', 0],
    ['predict option index', predictOptions, 1, 100],
    ['predict option numeric string', predictOptions, '1', 100],
    ['predict option label', predictOptions, 'Two', 100],
    ['predict option wrong', predictOptions, 0, 0],
    ['predict exact value', predictExact, '  101 Records ', 100],
    ['predict exact wrong', predictExact, '100', 0],
    ['order exact', order, [2, 0, 1, 3], 100],
    ['order strings', order, ['2', '0', '1', '3'], 100],
    ['order partial', order, [0, 2, 1, 3], 75],
    ['debug exact', debug, { bugLines: [4, 9], fix: 1 }, 100],
    ['debug strings', debug, { bugLines: ['4', '9'], fix: '1' }, 100],
    ['debug half', debug, { bugLines: [4, 9], fix: 0 }, 50],
    ['anti exact', anti, { answer: 1, antiPatternId: 'soql-in-loop' }, 100],
    ['anti string index', anti, { answer: '1', antiPatternId: 'soql-in-loop' }, 100],
    ['anti snippet only', anti, { answer: 1, antiPatternId: 'other' }, 60],
    ['lab passed object', lab, { passed: true }, 100],
    ['lab passed boolean', lab, true, 100],
    ['lab failed', lab, { passed: false }, 0],
  ])('%s', (_name, exercise, answer, score) => {
    const result = scoreDeterministic(exercise, answer);
    expect(result.score).toBe(score);
    expect(result.correct).toBe(
      exercise.type === 'multi_select' ? score === 100 : score >= ASSESSMENT_CONFIG.correctThreshold,
    );
  });

  it('accepts an explicit config', () => {
    const custom = { ...ASSESSMENT_CONFIG, correctThreshold: 80 };
    expect(scoreDeterministic(order, [0, 2, 1, 3], custom)).toMatchObject({ score: 75, correct: false });
  });

  it('ignores extra curriculum fields on the exercise (structural typing)', () => {
    const richExercise = { ...mcq, id: 'q1', concept: 'apex-triggers', depth: 2, dimension: 'recall', explain: 'x' };
    expect(scoreDeterministic(richExercise, 2).score).toBe(100);
  });
});

describe('scoreDeterministic errors', () => {
  it.each([
    ['explain_why', { type: 'explain_why' as const }],
    ['teach_back', { type: 'teach_back' as const }],
    ['boss', { type: 'boss' as const }],
    ['capstone', { type: 'capstone' as const }],
  ])('rejects the llm type %s with not_deterministic', (_name, exercise) => {
    expect(() => scoreDeterministic(exercise, 'free text')).toThrow(AssessmentError);
    try {
      scoreDeterministic(exercise, 'free text');
    } catch (error) {
      expect((error as AssessmentError).code).toBe('not_deterministic');
    }
  });

  it.each([
    ['mcq without answer', { type: 'mcq' as const }],
    ['mcq with boolean answer', { type: 'mcq' as const, answer: true }],
    ['multi_select without answers', { type: 'multi_select' as const }],
    ['true_false with numeric answer', { type: 'true_false' as const, answer: 1 }],
    ['predict with options but string index', { type: 'predict_outcome' as const, options: ['a'], answer: 'a' }],
    ['predict without answer', { type: 'predict_outcome' as const }],
    ['order without order', { type: 'order_execution' as const }],
    ['debug without fix', { type: 'debug_code' as const, bugLines: [1] }],
    ['debug without bugLines', { type: 'debug_code' as const, fix: 0 }],
    ['anti without id', { type: 'find_anti_pattern' as const, answer: 0 }],
    ['anti without answer', { type: 'find_anti_pattern' as const, antiPatternId: 'x' }],
  ])('rejects a malformed key: %s', (_name, exercise) => {
    expect(() => scoreDeterministic(exercise, 0)).toThrow(AssessmentError);
    try {
      scoreDeterministic(exercise, 0);
    } catch (error) {
      expect((error as AssessmentError).code).toBe('invalid_exercise');
    }
  });

  it.each([
    ['mcq string', mcq, 'b'],
    ['mcq float', mcq, 1.5],
    ['mcq negative', mcq, -1],
    ['mcq array', mcq, [2]],
    ['multi_select letters', multi, ['a', 'b']],
    ['multi_select object', multi, { answers: [0] }],
    ['true_false number', tf, 1],
    ['true_false maybe', tf, 'maybe'],
    ['predict options array', predictOptions, ['1']],
    ['predict exact array', predictExact, ['101']],
    ['predict exact object', predictExact, { value: '101' }],
    ['order letters', order, ['a', 'b']],
    ['order scalar', order, 2],
    ['debug missing fix', debug, { bugLines: [4] }],
    ['debug bad lines', debug, { bugLines: 'four', fix: 1 }],
    ['anti missing id', anti, { answer: 1 }],
    ['anti numeric id', anti, { answer: 1, antiPatternId: 7 }],
    ['lab string', lab, 'passed'],
    ['lab object without passed', lab, { ok: true }],
    ['null', mcq, null],
    ['undefined', mcq, undefined],
  ])('rejects an unusable learner answer: %s', (_name, exercise, answer) => {
    expect(() => scoreDeterministic(exercise, answer)).toThrow(AssessmentError);
    try {
      scoreDeterministic(exercise, answer);
    } catch (error) {
      expect((error as AssessmentError).code).toBe('invalid_answer');
    }
  });

  it('names the exercise type in the error message', () => {
    expect(() => scoreDeterministic(mcq, 'b')).toThrow(/mcq/);
    expect(() => scoreDeterministic({ type: 'boss' }, 'x')).toThrow(/boss/);
  });

  it('is an Error subclass with a stable name', () => {
    const error = new AssessmentError('invalid_answer', 'msg');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AssessmentError');
    expect(error.message).toBe('msg');
  });
});

describe('coerceAnswer', () => {
  it('returns ok with the typed answer for a usable shape', () => {
    expect(coerceAnswer(mcq, '2')).toEqual({ ok: true, answer: 2 });
    expect(coerceAnswer(multi, ['0', '2'])).toEqual({ ok: true, answer: [0, 2] });
    expect(coerceAnswer(tf, 'false')).toEqual({ ok: true, answer: false });
    expect(coerceAnswer(predictOptions, 'two')).toEqual({ ok: true, answer: 'two' });
    expect(coerceAnswer(predictExact, 7)).toEqual({ ok: true, answer: '7' });
    expect(coerceAnswer(order, ['1', '0'])).toEqual({ ok: true, answer: [1, 0] });
    expect(coerceAnswer(debug, { bugLines: ['4'], fix: '1' })).toEqual({ ok: true, answer: { bugLines: [4], fix: 1 } });
    expect(coerceAnswer(anti, { answer: '1', antiPatternId: 'x' })).toEqual({
      ok: true,
      answer: { answer: 1, antiPatternId: 'x' },
    });
    expect(coerceAnswer(lab, false)).toEqual({ ok: true, answer: { passed: false } });
  });

  it('returns ok: false with a reason instead of throwing', () => {
    expect(coerceAnswer(mcq, 'b')).toEqual({ ok: false, reason: expect.stringMatching(/mcq/) });
    expect(coerceAnswer({ type: 'explain_why' }, 'text')).toEqual({
      ok: false,
      reason: expect.stringMatching(/explain_why/),
    });
  });
});
