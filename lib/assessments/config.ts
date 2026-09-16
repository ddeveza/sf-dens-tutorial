// Assessment-engine numbers. Nothing in lib/assessments hardcodes a score, weight or depth: every value lives here.
// Relative `.ts` specifiers only: data/** and scripts/** may import this transitively under plain node type stripping.
import type { Depth } from '../mastery-engine/types.ts';

// MASTERY_CONFIG.correctThreshold (lib/mastery-engine/config.ts) is the authoritative value (ARCHITECTURE.md Engine §2:
// "`correct` for any evidence means `score >= config.correctThreshold` (70)"). This local constant exists so
// lib/assessments never imports the mastery engine; config.test.ts asserts the two agree once that module exists.
export const CORRECT_THRESHOLD = 70;

export interface AssessmentConfig {
  /** `score >= correctThreshold` => correct, for every scorer except multi_select (correct iff the sets are identical). */
  correctThreshold: number;
  /** Scores are integers in `0..scoreMax`. */
  scoreMax: number;
  weights: {
    /** debug_code: `bugLines` Jaccard share + `fix` option share (Engine §2: lines 50% + fix 50%). */
    debugCode: { bugLines: number; fix: number };
    /** find_anti_pattern: offending snippet share + named anti-pattern share (Engine §2: 60% + 40%). */
    findAntiPattern: { snippet: number; antiPatternId: number };
  };
  llmClass: {
    /** explain_why at `depth <= explainWhyCheckMaxDepth` is a `check` call; deeper is a `probe` (LLM §A). */
    explainWhyCheckMaxDepth: Depth;
  };
}

export const ASSESSMENT_CONFIG: AssessmentConfig = Object.freeze({
  correctThreshold: CORRECT_THRESHOLD,
  scoreMax: 100,
  weights: Object.freeze({
    debugCode: Object.freeze({ bugLines: 0.5, fix: 0.5 }),
    findAntiPattern: Object.freeze({ snippet: 0.6, antiPatternId: 0.4 }),
  }),
  llmClass: Object.freeze({ explainWhyCheckMaxDepth: 3 as Depth }),
});
