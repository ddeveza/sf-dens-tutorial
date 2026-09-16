import { describe, expect, it } from 'vitest';
import { ASSESSMENT_CONFIG, type AssessmentConfig } from './config.ts';
import {
  jaccard,
  lcsLength,
  normalizeText,
  scoreDebugCode,
  scoreFindAntiPattern,
  scoreLab,
  scoreMcq,
  scoreMultiSelect,
  scoreOrderExecution,
  scoreOrdering,
  scorePredictOutcome,
  scoreTrueFalse,
} from './scorers.ts';

const THRESHOLD = ASSESSMENT_CONFIG.correctThreshold;

describe('helpers', () => {
  it.each([
    ['  Hello  World ', 'hello world'],
    ['MiXeD\tCase\n', 'mixed case'],
    ['', ''],
    ['   ', ''],
    ['ﬁeld', 'field'], // NFKC folds the ligature
  ])('normalizeText(%j) -> %j', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it.each([
    [[1, 2, 3], [1, 2, 3], 3, 3],
    [[1, 2], [2, 3], 1, 3],
    [[], [1], 0, 1],
    [[], [], 0, 0],
    [[1, 1, 2], [2, 2, 1], 2, 2], // duplicates collapse to sets
  ])('jaccard(%j, %j) -> intersection %i / union %i', (a, b, intersection, union) => {
    expect(jaccard(a, b)).toEqual({ intersection, union });
  });

  it.each([
    [['a', 'b', 'c'], ['a', 'b', 'c'], 3],
    [['a', 'c', 'b'], ['a', 'b', 'c'], 2],
    [['c', 'b', 'a'], ['a', 'b', 'c'], 1],
    [[], ['a'], 0],
    [['x', 'y'], ['a', 'b'], 0],
    [['a', 'b', 'c', 'd'], ['b', 'd'], 2],
  ])('lcsLength(%j, %j) -> %i', (a, b, expected) => {
    expect(lcsLength(a, b)).toBe(expected);
  });
});

describe('scoreMcq', () => {
  it.each([
    [2, 2, 100, true],
    [0, 0, 100, true],
    [1, 2, 0, false],
    [-1, 0, 0, false],
    [1.5, 1, 0, false],
    [Number.NaN, 0, 0, false],
  ])('answer %j vs key %j -> %i (correct %s)', (answer, key, score, correct) => {
    expect(scoreMcq(answer, key)).toMatchObject({ score, correct });
  });

  it('carries the chosen and expected indices in detail', () => {
    expect(scoreMcq(1, 2).detail).toEqual({ answer: 1, expected: 2 });
  });
});

describe('scoreMultiSelect', () => {
  it.each([
    [[0, 2], [0, 2], 100, true],
    [[2, 0], [0, 2], 100, true],
    [[0, 0, 2, 2], [0, 2], 100, true], // duplicate selections collapse
    [[0], [0, 2], 50, false],
    [[0, 1, 2], [0, 2], 67, false],
    [[1], [0, 2], 0, false],
    [[], [0, 2], 0, false],
    [[0, 1, 2, 3], [0, 1, 2], 75, false],
  ])('selected %j vs correct %j -> %i (correct %s)', (selected, correct, score, isCorrect) => {
    expect(scoreMultiSelect(selected, correct)).toMatchObject({ score, correct: isCorrect });
  });

  it('is correct only when the sets are identical, never by threshold', () => {
    const three = scoreMultiSelect([0, 1, 2, 3], [0, 1, 2]);
    expect(three.score).toBeGreaterThanOrEqual(THRESHOLD);
    expect(three.correct).toBe(false);
  });

  it('never rounds a non-identical selection up to 100', () => {
    const many = Array.from({ length: 200 }, (_, i) => i);
    const result = scoreMultiSelect(many.slice(0, 199), many);
    expect(result.score).toBe(99);
    expect(result.correct).toBe(false);
  });

  it('treats two empty sets as identical', () => {
    expect(scoreMultiSelect([], [])).toMatchObject({ score: 100, correct: true });
  });

  it('reports missing and extra options in detail', () => {
    expect(scoreMultiSelect([0, 1], [0, 2]).detail).toEqual({
      intersection: 1,
      union: 3,
      missing: [2],
      extra: [1],
    });
  });
});

describe('scoreTrueFalse', () => {
  it.each([
    [true, true, 100, true],
    [false, false, 100, true],
    [true, false, 0, false],
    [false, true, 0, false],
  ])('answer %s vs key %s -> %i', (answer, key, score, correct) => {
    expect(scoreTrueFalse(answer, key)).toMatchObject({ score, correct });
  });
});

describe('scorePredictOutcome', () => {
  const options = ['Trigger fires once', 'Trigger fires twice', 'No trigger'];

  describe('option-based (exercise has options)', () => {
    it.each([
      [1, 1, 100, true],
      [0, 1, 0, false],
      ['1', 1, 100, true], // numeric string from RevealInput.answer
      ['2', 1, 0, false],
      ['trigger fires TWICE ', 1, 100, true], // label match, normalized
      ['trigger fires once', 1, 0, false],
      ['9', 1, 0, false], // out of range index is simply wrong
      ['', 1, 0, false],
    ])('answer %j vs key index %i -> %i', (answer, key, score, correct) => {
      expect(scorePredictOutcome(answer, key, options)).toMatchObject({ score, correct });
    });
  });

  describe('exact-value (no options)', () => {
    it.each([
      ['101', '101', 100, true],
      ['  101 ', '101', 100, true],
      ['Too Many SOQL Queries', 'too many soql queries', 100, true],
      ['System.LimitException:   Too many SOQL queries', 'System.LimitException: Too many SOQL queries', 100, true],
      ['100', '101', 0, false],
      ['', '101', 0, false],
      ['101', ['100', '101'], 100, true], // any accepted value
      ['102', ['100', '101'], 0, false],
      [101, '101', 100, true], // numeric answer stringified
      ['101', 101, 100, true], // numeric key stringified when there are no options
    ])('answer %j vs accepted %j -> %i', (answer, accepted, score, correct) => {
      expect(scorePredictOutcome(answer, accepted)).toMatchObject({ score, correct });
    });

    it('never matches an empty accepted list', () => {
      expect(scorePredictOutcome('anything', [])).toMatchObject({ score: 0, correct: false });
    });
  });
});

describe('scoreOrdering', () => {
  it.each([
    [['a', 'b', 'c'], ['a', 'b', 'c'], 100, true, true],
    [['a', 'c', 'b'], ['a', 'b', 'c'], 67, false, false],
    [['c', 'b', 'a'], ['a', 'b', 'c'], 33, false, false],
    [['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e'], 80, true, false], // one missing -> partial credit
    [['a', 'b', 'c', 'd', 'e', 'x'], ['a', 'b', 'c', 'd', 'e'], 83, true, false], // one extra -> partial credit
    [[], ['a', 'b'], 0, false, false],
    [[], [], 100, true, true],
    [['x', 'y', 'z'], ['a', 'b', 'c'], 0, false, false],
  ])('answer %j vs key %j -> %i (correct %s, exact %s)', (answer, key, score, correct, exact) => {
    const result = scoreOrdering(answer, key);
    expect(result).toMatchObject({ score, correct });
    expect(result.detail?.exact).toBe(exact);
  });

  it('scores 100 only for an exact sequence, even when the key is a subsequence of the answer', () => {
    const result = scoreOrdering(['a', 'b', 'c', 'c'], ['a', 'b', 'c']);
    expect(result.score).toBeLessThan(100);
    expect(result.detail?.exact).toBe(false);
  });

  it('never rounds a non-exact order up to 100', () => {
    const key = Array.from({ length: 200 }, (_, i) => `s${i}`);
    const result = scoreOrdering(key.slice(0, 199), key);
    expect(result.score).toBe(99);
    expect(result.correct).toBe(true); // partial credit still clears the threshold
  });

  it('works on numeric ids as the lesson question uses', () => {
    expect(scoreOrdering([3, 1, 2], [3, 1, 2]).score).toBe(100);
    expect(scoreOrdering([1, 3, 2], [3, 1, 2]).score).toBe(67);
  });

  it('exposes lcs and length in detail', () => {
    expect(scoreOrdering(['a', 'c', 'b'], ['a', 'b', 'c']).detail).toEqual({ lcs: 2, length: 3, exact: false });
  });
});

describe('scoreOrderExecution', () => {
  it('delegates to scoreOrdering with the same numbers', () => {
    expect(scoreOrderExecution([0, 1, 2, 3], [0, 1, 2, 3])).toMatchObject({ score: 100, correct: true });
    expect(scoreOrderExecution([0, 2, 1, 3], [0, 1, 2, 3])).toMatchObject({ score: 75, correct: true });
    expect(scoreOrderExecution([3, 2, 1, 0], [0, 1, 2, 3])).toMatchObject({ score: 25, correct: false });
  });
});

describe('scoreDebugCode', () => {
  const key = { bugLines: [4, 9], fix: 2 };

  it.each([
    [{ bugLines: [4, 9], fix: 2 }, 100, true],
    [{ bugLines: [9, 4], fix: 2 }, 100, true],
    [{ bugLines: [4, 4, 9], fix: 2 }, 100, true], // duplicate lines collapse
    [{ bugLines: [4, 9], fix: 0 }, 50, false],
    [{ bugLines: [], fix: 2 }, 50, false],
    [{ bugLines: [4], fix: 2 }, 75, true],
    [{ bugLines: [4], fix: 0 }, 25, false],
    [{ bugLines: [4, 9, 12], fix: 2 }, 83, true],
    [{ bugLines: [1, 2], fix: 1 }, 0, false],
  ])('answer %j -> %i (correct %s)', (answer, score, correct) => {
    expect(scoreDebugCode(answer, key)).toMatchObject({ score, correct });
  });

  it('reads the 50/50 split from config', () => {
    const config: AssessmentConfig = {
      ...ASSESSMENT_CONFIG,
      weights: { ...ASSESSMENT_CONFIG.weights, debugCode: { bugLines: 0.8, fix: 0.2 } },
    };
    expect(scoreDebugCode({ bugLines: [4, 9], fix: 0 }, key, config).score).toBe(80);
    expect(scoreDebugCode({ bugLines: [], fix: 2 }, key, config).score).toBe(20);
  });

  it('exposes both halves in detail', () => {
    expect(scoreDebugCode({ bugLines: [4], fix: 2 }, key).detail).toEqual({
      bugLinesScore: 50,
      fixScore: 100,
      missing: [9],
      extra: [],
      fixCorrect: true,
    });
  });
});

describe('scoreFindAntiPattern', () => {
  const key = { answer: 1, antiPatternId: 'soql-in-loop' };

  it.each([
    [{ answer: 1, antiPatternId: 'soql-in-loop' }, 100, true],
    [{ answer: 1, antiPatternId: ' soql-in-loop ' }, 100, true], // whitespace-tolerant id
    [{ answer: 1, antiPatternId: 'dml-in-loop' }, 60, false],
    [{ answer: 0, antiPatternId: 'soql-in-loop' }, 40, false],
    [{ answer: 0, antiPatternId: 'dml-in-loop' }, 0, false],
    [{ answer: 1, antiPatternId: '' }, 60, false],
    [{ answer: 1, antiPatternId: 'SOQL-IN-LOOP' }, 60, false], // ids are case-sensitive slugs
  ])('answer %j -> %i (correct %s)', (answer, score, correct) => {
    expect(scoreFindAntiPattern(answer, key)).toMatchObject({ score, correct });
  });

  it('reads the 60/40 split from config', () => {
    const config: AssessmentConfig = {
      ...ASSESSMENT_CONFIG,
      weights: { ...ASSESSMENT_CONFIG.weights, findAntiPattern: { snippet: 0.5, antiPatternId: 0.5 } },
    };
    expect(scoreFindAntiPattern({ answer: 1, antiPatternId: 'nope' }, key, config).score).toBe(50);
  });

  it('exposes both halves in detail', () => {
    expect(scoreFindAntiPattern({ answer: 0, antiPatternId: 'soql-in-loop' }, key).detail).toEqual({
      snippetCorrect: false,
      antiPatternCorrect: true,
    });
  });
});

describe('scoreLab', () => {
  it('passes at 100 and fails at 0', () => {
    expect(scoreLab({ passed: true })).toMatchObject({ score: 100, correct: true });
    expect(scoreLab({ passed: false })).toMatchObject({ score: 0, correct: false });
  });
});

describe('correct threshold', () => {
  it('is applied uniformly by threshold-based scorers', () => {
    const custom: AssessmentConfig = { ...ASSESSMENT_CONFIG, correctThreshold: 90 };
    expect(scoreOrdering(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e'], custom)).toMatchObject({
      score: 80,
      correct: false,
    });
    expect(scoreDebugCode({ bugLines: [4], fix: 2 }, { bugLines: [4, 9], fix: 2 }, custom)).toMatchObject({
      score: 75,
      correct: false,
    });
  });
});
