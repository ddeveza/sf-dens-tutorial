// scoreDeterministic: one entry point that dispatches on exercise.type. The exercise is a minimal structural key
// (the curriculum Exercise union satisfies it; lib/curriculum is deliberately not imported) and the learner answer is
// `unknown`, coerced from the wire shapes the client sends (indices as digit strings, booleans as 'true'/'false').
// Unusable input is an AssessmentError so the Server Action can map it to `invalid_input` instead of recording a miss.
import type { QuestionType } from '../learning-engine/types.ts';
import { isDeterministic, type DeterministicQuestionType } from './attempt-kind.ts';
import { ASSESSMENT_CONFIG, type AssessmentConfig } from './config.ts';
import {
  scoreDebugCode,
  scoreFindAntiPattern,
  scoreLab,
  scoreMcq,
  scoreMultiSelect,
  scoreOrderExecution,
  scorePredictOutcome,
  scoreTrueFalse,
} from './scorers.ts';
import type { DeterministicScore } from './types.ts';

export interface DeterministicExerciseInput {
  type: QuestionType;
  answer?: number | boolean | string | readonly string[];
  answers?: readonly number[];
  order?: readonly number[];
  bugLines?: readonly number[];
  fix?: number;
  antiPatternId?: string;
  options?: readonly string[];
}

export type DeterministicAnswer =
  | number // mcq, find_anti_pattern snippet, predict_outcome option index
  | boolean // true_false
  | string // predict_outcome value or option label
  | number[] // multi_select, order_execution
  | { bugLines: number[]; fix: number } // debug_code
  | { answer: number; antiPatternId: string } // find_anti_pattern
  | { passed: boolean }; // lab

export type AssessmentErrorCode = 'not_deterministic' | 'invalid_exercise' | 'invalid_answer';

export class AssessmentError extends Error {
  readonly code: AssessmentErrorCode;

  constructor(code: AssessmentErrorCode, message: string) {
    super(message);
    this.name = 'AssessmentError';
    this.code = code;
  }
}

export type CoerceAnswerResult = { ok: true; answer: DeterministicAnswer } | { ok: false; reason: string };

type ResolvedKey =
  | { type: 'mcq'; answer: number }
  | { type: 'multi_select'; answers: readonly number[] }
  | { type: 'true_false'; answer: boolean }
  | { type: 'predict_outcome'; answer: number | string | readonly string[]; options?: readonly string[] }
  | { type: 'order_execution'; order: readonly number[] }
  | { type: 'debug_code'; bugLines: readonly number[]; fix: number }
  | { type: 'find_anti_pattern'; answer: number; antiPatternId: string }
  | { type: 'lab' };

const ANSWER_SHAPES: Record<DeterministicQuestionType, string> = {
  mcq: 'an option index (non-negative integer or digits string)',
  multi_select: 'a list of option indices',
  true_false: "a boolean or 'true' / 'false'",
  predict_outcome: 'a single option index, option label or predicted value',
  order_execution: 'a list of step indices',
  debug_code: '{ bugLines: number[], fix: number }',
  find_anti_pattern: '{ answer: number, antiPatternId: string }',
  lab: '{ passed: boolean } or a boolean',
};

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isIndexList(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(isIndex);
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidExercise(type: QuestionType, missing: string): AssessmentError {
  return new AssessmentError('invalid_exercise', `${type} exercise key is malformed: expected ${missing}`);
}

/** Validates the answer key for a deterministic type; throws AssessmentError for llm types or a malformed key. */
function resolveKey(exercise: DeterministicExerciseInput): ResolvedKey {
  const { type } = exercise;
  if (!isDeterministic(type)) {
    throw new AssessmentError('not_deterministic', `${type} is graded by lib/llm, not lib/assessments`);
  }
  switch (type) {
    case 'mcq':
      if (!isIndex(exercise.answer)) throw invalidExercise(type, 'answer to be an option index');
      return { type, answer: exercise.answer };
    case 'multi_select':
      if (!isIndexList(exercise.answers)) throw invalidExercise(type, 'answers to be a list of option indices');
      return { type, answers: exercise.answers };
    case 'true_false':
      if (typeof exercise.answer !== 'boolean') throw invalidExercise(type, 'answer to be a boolean');
      return { type, answer: exercise.answer };
    case 'predict_outcome': {
      const { answer, options } = exercise;
      if (options !== undefined) {
        if (!isIndex(answer)) throw invalidExercise(type, 'answer to be an option index when options are present');
        return { type, answer, options };
      }
      if (typeof answer === 'string' || typeof answer === 'number' || isStringList(answer)) {
        return { type, answer };
      }
      throw invalidExercise(type, 'answer to be the accepted value or values');
    }
    case 'order_execution':
      if (!isIndexList(exercise.order)) throw invalidExercise(type, 'order to be a list of step indices');
      return { type, order: exercise.order };
    case 'debug_code':
      if (!isIndexList(exercise.bugLines)) throw invalidExercise(type, 'bugLines to be a list of line numbers');
      if (!isIndex(exercise.fix)) throw invalidExercise(type, 'fix to be an index into fixOptions');
      return { type, bugLines: exercise.bugLines, fix: exercise.fix };
    case 'find_anti_pattern':
      if (!isIndex(exercise.answer)) throw invalidExercise(type, 'answer to be the offending snippet index');
      if (typeof exercise.antiPatternId !== 'string') throw invalidExercise(type, 'antiPatternId to be a string');
      return { type, answer: exercise.answer, antiPatternId: exercise.antiPatternId };
    case 'lab':
      return { type };
    default:
      throw new AssessmentError('invalid_exercise', `Unknown deterministic type: ${String(type)}`);
  }
}

/** Non-negative integer from a number or a digits-only string; null otherwise. */
function coerceIndex(raw: unknown): number | null {
  if (isIndex(raw)) return raw;
  if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) return Number(raw.trim());
  return null;
}

function coerceIndexList(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const indices: number[] = [];
  for (const item of raw) {
    const index = coerceIndex(item);
    if (index === null) return null;
    indices.push(index);
  }
  return indices;
}

function coerceBoolean(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function coerceMcq(raw: unknown): number | null {
  return coerceIndex(raw);
}

function coerceMultiSelect(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return coerceIndexList(raw);
  const single = coerceIndex(raw);
  return single === null ? null : [single];
}

function coercePredict(raw: unknown, hasOptions: boolean): number | string | null {
  if (hasOptions) {
    const index = coerceIndex(raw);
    if (index !== null) return index;
    return typeof raw === 'string' ? raw : null;
  }
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
}

function coerceOrder(raw: unknown): number[] | null {
  return coerceIndexList(raw);
}

function coerceDebugCode(raw: unknown): { bugLines: number[]; fix: number } | null {
  if (!isRecord(raw)) return null;
  const bugLines = coerceIndexList(raw.bugLines);
  const fix = coerceIndex(raw.fix);
  return bugLines === null || fix === null ? null : { bugLines, fix };
}

function coerceFindAntiPattern(raw: unknown): { answer: number; antiPatternId: string } | null {
  if (!isRecord(raw)) return null;
  const answer = coerceIndex(raw.answer);
  const { antiPatternId } = raw;
  return answer === null || typeof antiPatternId !== 'string' ? null : { answer, antiPatternId };
}

function coerceLab(raw: unknown): { passed: boolean } | null {
  if (typeof raw === 'boolean') return { passed: raw };
  if (!isRecord(raw)) return null;
  const passed = coerceBoolean(raw.passed);
  return passed === null ? null : { passed };
}

function coerceFor(key: ResolvedKey, raw: unknown): DeterministicAnswer | null {
  switch (key.type) {
    case 'mcq':
      return coerceMcq(raw);
    case 'multi_select':
      return coerceMultiSelect(raw);
    case 'true_false':
      return coerceBoolean(raw);
    case 'predict_outcome':
      return coercePredict(raw, key.options !== undefined);
    case 'order_execution':
      return coerceOrder(raw);
    case 'debug_code':
      return coerceDebugCode(raw);
    case 'find_anti_pattern':
      return coerceFindAntiPattern(raw);
    case 'lab':
      return coerceLab(raw);
  }
}

function invalidAnswer(type: DeterministicQuestionType): AssessmentError {
  return new AssessmentError('invalid_answer', `${type} answer is unusable: expected ${ANSWER_SHAPES[type]}`);
}

/**
 * Value-returning validation for Server Actions: `ok: false` (with a reason naming the exercise type) for llm types,
 * malformed keys and unusable learner answers, so the caller can answer `invalid_input` before recording anything.
 */
export function coerceAnswer(exercise: DeterministicExerciseInput, raw: unknown): CoerceAnswerResult {
  let key: ResolvedKey;
  try {
    key = resolveKey(exercise);
  } catch (error) {
    if (error instanceof AssessmentError) return { ok: false, reason: error.message };
    throw error;
  }
  const answer = coerceFor(key, raw);
  return answer === null ? { ok: false, reason: invalidAnswer(key.type).message } : { ok: true, answer };
}

/** Grades a deterministic exercise. Throws AssessmentError (`not_deterministic` / `invalid_exercise` / `invalid_answer`). */
export function scoreDeterministic(
  exercise: DeterministicExerciseInput,
  answer: unknown,
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): DeterministicScore {
  const key = resolveKey(exercise);
  switch (key.type) {
    case 'mcq': {
      const chosen = coerceMcq(answer);
      if (chosen === null) throw invalidAnswer(key.type);
      return scoreMcq(chosen, key.answer, config);
    }
    case 'multi_select': {
      const selected = coerceMultiSelect(answer);
      if (selected === null) throw invalidAnswer(key.type);
      return scoreMultiSelect(selected, key.answers, config);
    }
    case 'true_false': {
      const chosen = coerceBoolean(answer);
      if (chosen === null) throw invalidAnswer(key.type);
      return scoreTrueFalse(chosen, key.answer, config);
    }
    case 'predict_outcome': {
      const predicted = coercePredict(answer, key.options !== undefined);
      if (predicted === null) throw invalidAnswer(key.type);
      return scorePredictOutcome(predicted, key.answer, key.options, config);
    }
    case 'order_execution': {
      const ordered = coerceOrder(answer);
      if (ordered === null) throw invalidAnswer(key.type);
      return scoreOrderExecution(ordered, key.order, config);
    }
    case 'debug_code': {
      const debug = coerceDebugCode(answer);
      if (debug === null) throw invalidAnswer(key.type);
      return scoreDebugCode(debug, { bugLines: key.bugLines, fix: key.fix }, config);
    }
    case 'find_anti_pattern': {
      const found = coerceFindAntiPattern(answer);
      if (found === null) throw invalidAnswer(key.type);
      return scoreFindAntiPattern(found, { answer: key.answer, antiPatternId: key.antiPatternId }, config);
    }
    case 'lab': {
      const result = coerceLab(answer);
      if (result === null) throw invalidAnswer(key.type);
      return scoreLab(result, config);
    }
  }
}
