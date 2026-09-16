import { describe, expect, it } from 'vitest';
import { QUESTION_TYPES, type QuestionType } from '../learning-engine/types.ts';
import { DEPTHS, type Depth } from '../mastery-engine/types.ts';
import { ATTEMPT_KINDS, LLM_CLASSES, type AttemptKind, type LlmClass, type ScorerKind } from './types.ts';
import {
  DETERMINISTIC_QUESTION_TYPES,
  attemptKindFor,
  isDeterministic,
  llmClassFor,
  scorerFor,
} from './attempt-kind.ts';
import { ASSESSMENT_CONFIG } from './config.ts';

// One row per QuestionType; the length assertion below guarantees the table is exhaustive.
const KIND_TABLE: ReadonlyArray<[QuestionType, AttemptKind, ScorerKind]> = [
  ['mcq', 'question', 'deterministic'],
  ['multi_select', 'question', 'deterministic'],
  ['true_false', 'question', 'deterministic'],
  ['predict_outcome', 'prediction', 'deterministic'],
  ['order_execution', 'question', 'deterministic'],
  ['debug_code', 'question', 'deterministic'],
  ['find_anti_pattern', 'question', 'deterministic'],
  ['explain_why', 'explain_why', 'llm'],
  ['compare_approaches', 'scenario', 'llm'],
  ['architecture_decision', 'scenario', 'llm'],
  ['fix_design', 'scenario', 'llm'],
  ['scenario_diagnosis', 'scenario', 'llm'],
  ['teach_back', 'teach_back', 'llm'],
  ['lab', 'lab', 'deterministic'],
  ['boss', 'boss', 'llm'],
  ['capstone', 'capstone', 'llm'],
];

describe('attemptKindFor', () => {
  it('covers every QUESTION_TYPES member exactly once', () => {
    expect(KIND_TABLE.map(([type]) => type).sort()).toEqual([...QUESTION_TYPES].sort());
    expect(KIND_TABLE).toHaveLength(16);
  });

  it.each(KIND_TABLE)('%s -> %s', (type, kind) => {
    expect(attemptKindFor(type)).toBe(kind);
  });

  it('only ever returns members of ATTEMPT_KINDS', () => {
    for (const type of QUESTION_TYPES) {
      expect(ATTEMPT_KINDS).toContain(attemptKindFor(type));
    }
  });

  it('rejects an unknown question type at runtime', () => {
    expect(() => attemptKindFor('essay' as QuestionType)).toThrow(/essay/);
  });
});

describe('scorerFor / isDeterministic', () => {
  it.each(KIND_TABLE)('%s scorer is %s', (type, _kind, scorer) => {
    expect(scorerFor(type)).toBe(scorer);
    expect(isDeterministic(type)).toBe(scorer === 'deterministic');
  });

  it('lists exactly seven scored question types plus lab as deterministic', () => {
    const deterministic = QUESTION_TYPES.filter(isDeterministic);
    expect(deterministic).toEqual([
      'mcq',
      'multi_select',
      'true_false',
      'predict_outcome',
      'order_execution',
      'debug_code',
      'find_anti_pattern',
      'lab',
    ]);
    expect(deterministic).toEqual([...DETERMINISTIC_QUESTION_TYPES]);
  });
});

describe('llmClassFor', () => {
  const CLASS_TABLE: ReadonlyArray<[QuestionType, Depth, LlmClass | null]> = [
    ['explain_why', 2, 'check'],
    ['explain_why', 3, 'check'],
    ['explain_why', 4, 'probe'],
    ['explain_why', 5, 'probe'],
    ['teach_back', 2, 'probe'],
    ['teach_back', 8, 'probe'],
    ['scenario_diagnosis', 5, 'probe'],
    ['architecture_decision', 6, 'probe'],
    ['compare_approaches', 5, 'probe'],
    ['fix_design', 7, 'probe'],
    ['boss', 7, 'boss'],
    ['boss', 8, 'boss'],
    ['capstone', 8, 'capstone'],
    ['mcq', 1, null],
    ['multi_select', 2, null],
    ['true_false', 1, null],
    ['predict_outcome', 3, null],
    ['order_execution', 2, null],
    ['debug_code', 4, null],
    ['find_anti_pattern', 3, null],
    ['lab', 4, null],
  ];

  it.each(CLASS_TABLE)('%s at depth %i -> %s', (type, depth, expected) => {
    expect(llmClassFor(type, depth)).toBe(expected);
  });

  it('returns null for every deterministic type at every depth', () => {
    for (const type of QUESTION_TYPES.filter(isDeterministic)) {
      for (const depth of DEPTHS) {
        expect(llmClassFor(type, depth)).toBeNull();
      }
    }
  });

  it('returns a member of LLM_CLASSES for every llm type at every depth', () => {
    for (const type of QUESTION_TYPES.filter((t) => !isDeterministic(t))) {
      for (const depth of DEPTHS) {
        expect(LLM_CLASSES).toContain(llmClassFor(type, depth));
      }
    }
  });

  it('reads the explain_why check/probe boundary from config, never inline', () => {
    const custom = { ...ASSESSMENT_CONFIG, llmClass: { explainWhyCheckMaxDepth: 4 as Depth } };
    expect(llmClassFor('explain_why', 4, custom)).toBe('check');
    expect(llmClassFor('explain_why', 5, custom)).toBe('probe');
    expect(ASSESSMENT_CONFIG.llmClass.explainWhyCheckMaxDepth).toBe(3);
  });
});
