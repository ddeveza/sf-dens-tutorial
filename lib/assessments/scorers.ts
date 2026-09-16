// Deterministic scorers (ARCHITECTURE.md Engine §2 "Deterministic scoring rule" column). Pure: plain values in,
// DeterministicScore out, no IO, every number from ASSESSMENT_CONFIG. `scoreOrdering` is shared with the
// order-of-execution simulator so a lesson question and the simulator grade identically.
import { ASSESSMENT_CONFIG, type AssessmentConfig } from './config.ts';
import type { DeterministicScore } from './types.ts';

type Detail = NonNullable<DeterministicScore['detail']>;

/** Trim, collapse internal whitespace, fold case and Unicode compatibility forms (NFKC) for exact-value matching. */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Set-based Jaccard components; duplicates collapse. Jaccard(∅, ∅) is treated as identical by callers. */
export function jaccard<T>(a: readonly T[], b: readonly T[]): { intersection: number; union: number } {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const value of setA) {
    if (setB.has(value)) intersection += 1;
  }
  return { intersection, union: setA.size + setB.size - intersection };
}

/** Length of the longest common subsequence (order-preserving, not necessarily contiguous). O(|a|·|b|) time, O(|b|) space. */
export function lcsLength<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

/** Rounds a 0..1 ratio onto the score scale; only an identical answer may reach scoreMax. */
function ratioScore(ratio: number, identical: boolean, config: AssessmentConfig): number {
  if (identical) return config.scoreMax;
  return Math.min(config.scoreMax - 1, Math.round(ratio * config.scoreMax));
}

function byThreshold(score: number, config: AssessmentConfig, detail: Detail): DeterministicScore {
  return { score, correct: score >= config.correctThreshold, detail };
}

function binary(hit: boolean, config: AssessmentConfig, detail: Detail): DeterministicScore {
  return byThreshold(hit ? config.scoreMax : 0, config, detail);
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Parses an option index from a number or a digits-only string; null for anything else. */
function parseIndex(value: string | number): number | null {
  if (typeof value === 'number') return isIndex(value) ? value : null;
  return /^\s*\d+\s*$/.test(value) ? Number(value.trim()) : null;
}

/** mcq: exact option index, 100 / 0. */
export function scoreMcq(answer: number, key: number, config: AssessmentConfig = ASSESSMENT_CONFIG): DeterministicScore {
  return binary(Number.isInteger(answer) && answer === key, config, { answer, expected: key });
}

/** multi_select: Jaccard(selected, correct) x scoreMax; correct iff the two sets are identical (never by threshold). */
export function scoreMultiSelect(
  selected: readonly number[],
  correct: readonly number[],
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): DeterministicScore {
  const selectedSet = new Set(selected);
  const correctSet = new Set(correct);
  const { intersection, union } = jaccard(selected, correct);
  const identical = intersection === union;
  const score = ratioScore(union === 0 ? 1 : intersection / union, identical, config);
  return {
    score,
    correct: identical,
    detail: {
      intersection,
      union,
      missing: [...correctSet].filter((value) => !selectedSet.has(value)),
      extra: [...selectedSet].filter((value) => !correctSet.has(value)),
    },
  };
}

/** true_false: 100 / 0. */
export function scoreTrueFalse(
  answer: boolean,
  key: boolean,
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): DeterministicScore {
  return binary(answer === key, config, { answer, expected: key });
}

/**
 * predict_outcome. With `options`: the answer is an option index (number or digits string) or the option's label;
 * `key` is the accepted index (an accepted label resolves to its index). Without `options`: whitespace/case-normalized
 * exact match against the accepted value(s). 100 / 0.
 */
export function scorePredictOutcome(
  answer: string | number,
  key: number | string | readonly string[],
  options?: readonly string[],
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): DeterministicScore {
  if (options !== undefined) {
    const acceptedIndices =
      typeof key === 'number'
        ? [key]
        : (typeof key === 'string' ? [key] : key)
            .map((label) => options.findIndex((option) => normalizeText(option) === normalizeText(label)))
            .filter((index) => index >= 0);
    const answerIndex = parseIndex(answer);
    const answerLabel = normalizeText(String(answer));
    const matched = acceptedIndices.some(
      (index) => index === answerIndex || (answerLabel.length > 0 && normalizeText(options[index] ?? '') === answerLabel),
    );
    return binary(matched, config, { mode: 'option', answer: String(answer), matched, expected: acceptedIndices });
  }
  const accepted = (typeof key === 'string' || typeof key === 'number' ? [String(key)] : key)
    .map(normalizeText)
    .filter((value) => value.length > 0);
  const normalized = normalizeText(String(answer));
  const matched = normalized.length > 0 && accepted.includes(normalized);
  return binary(matched, config, { mode: 'exact', answer: normalized, matched, expected: accepted });
}

/**
 * Ordering credit shared by order_execution and the order-of-execution simulator: an exact sequence scores scoreMax;
 * otherwise LCS(answer, key) / max(|answer|, |key|) x scoreMax, so both omissions and extra items cost credit.
 */
export function scoreOrdering<T>(
  answer: readonly T[],
  key: readonly T[],
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): DeterministicScore {
  const exact = answer.length === key.length && answer.every((value, index) => value === key[index]);
  const lcs = exact ? key.length : lcsLength(answer, key);
  const length = Math.max(answer.length, key.length);
  const score = ratioScore(length === 0 ? 1 : lcs / length, exact, config);
  return byThreshold(score, config, { lcs, length, exact });
}

/** order_execution: exact 100; else LCS ratio (see scoreOrdering). */
export function scoreOrderExecution(
  answer: readonly number[],
  key: readonly number[],
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): DeterministicScore {
  return scoreOrdering(answer, key, config);
}

export interface DebugCodeAnswer {
  bugLines: readonly number[];
  fix: number;
}

/** debug_code: `bugLines` Jaccard share (weights.debugCode.bugLines) + exact `fix` option share (weights.debugCode.fix). */
export function scoreDebugCode(
  answer: DebugCodeAnswer,
  key: DebugCodeAnswer,
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): DeterministicScore {
  const answerLines = new Set(answer.bugLines);
  const keyLines = new Set(key.bugLines);
  const { intersection, union } = jaccard(answer.bugLines, key.bugLines);
  const linesRatio = union === 0 ? 1 : intersection / union;
  const fixCorrect = Number.isInteger(answer.fix) && answer.fix === key.fix;
  const { bugLines: linesWeight, fix: fixWeight } = config.weights.debugCode;
  const score = Math.round((linesRatio * linesWeight + (fixCorrect ? fixWeight : 0)) * config.scoreMax);
  return byThreshold(score, config, {
    bugLinesScore: Math.round(linesRatio * config.scoreMax),
    fixScore: fixCorrect ? config.scoreMax : 0,
    missing: [...keyLines].filter((line) => !answerLines.has(line)),
    extra: [...answerLines].filter((line) => !keyLines.has(line)),
    fixCorrect,
  });
}

export interface FindAntiPatternAnswer {
  answer: number; // index of the offending snippet among the exercise's options
  antiPatternId: string; // AntiPattern['id'] slug; compared exactly after trimming
}

/** find_anti_pattern: offending snippet share (weights.findAntiPattern.snippet) + named anti-pattern share (.antiPatternId). */
export function scoreFindAntiPattern(
  answer: FindAntiPatternAnswer,
  key: FindAntiPatternAnswer,
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): DeterministicScore {
  const snippetCorrect = Number.isInteger(answer.answer) && answer.answer === key.answer;
  const antiPatternCorrect = answer.antiPatternId.trim() === key.antiPatternId.trim();
  const { snippet: snippetWeight, antiPatternId: idWeight } = config.weights.findAntiPattern;
  const score = Math.round(((snippetCorrect ? snippetWeight : 0) + (antiPatternCorrect ? idWeight : 0)) * config.scoreMax);
  return byThreshold(score, config, { snippetCorrect, antiPatternCorrect });
}

export interface LabResult {
  passed: boolean;
}

/** lab (hands-on simulator run): pass 100 / fail 0. */
export function scoreLab(result: LabResult, config: AssessmentConfig = ASSESSMENT_CONFIG): DeterministicScore {
  return binary(result.passed, config, { passed: result.passed });
}
