// Answer keys never reach the browser (ARCHITECTURE.md, Server/client boundary policy, rule 3). `ClientExercise` is
// a per-type projection: each variant strips exactly the secret fields it carries and keeps learner-facing ones.
// Reveal content and correctness come back from the Server Action after the attempt is recorded.
import type {
  ArchitectureDecisionExercise,
  BossExercise,
  CapstoneExercise,
  CompareApproachesExercise,
  DebugCodeExercise,
  Exercise,
  ExplainWhyExercise,
  FindAntiPatternExercise,
  FixDesignExercise,
  Lesson,
  McqExercise,
  MultiSelectExercise,
  OrderExecutionExercise,
  PredictOutcomeExercise,
  ScenarioDiagnosisExercise,
  TeachBackExercise,
  TrueFalseExercise,
} from './schema.ts';

/** Key names that must never appear in a client payload. `fix` is the schema name of debug_code's answer index; `fixAnswer` is its assessments alias. */
export const SECRET_FIELDS = [
  'answer',
  'answers',
  'order',
  'bugLines',
  'explain',
  'fix',
  'fixAnswer',
  'antiPatternId',
  'reveal',
  'keyPoints',
  'referenceAnswer',
  'redHerrings',
  'rubricKeyPoints',
] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

type Public<T, K extends keyof T> = Omit<T, K>;

export type ClientMcq = Public<McqExercise, 'answer' | 'explain'>;
export type ClientMultiSelect = Public<MultiSelectExercise, 'answers' | 'explain'>;
export type ClientTrueFalse = Public<TrueFalseExercise, 'answer' | 'explain'>;
export type ClientPredictOutcome = Public<PredictOutcomeExercise, 'answer' | 'reveal'>;
export type ClientOrderExecution = Public<OrderExecutionExercise, 'order' | 'reveal'>;
export type ClientDebugCode = Public<DebugCodeExercise, 'bugLines' | 'fix' | 'explain'>;
export type ClientFindAntiPattern = Public<FindAntiPatternExercise, 'answer' | 'antiPatternId' | 'explain'>;
export type ClientExplainWhy = Public<ExplainWhyExercise, 'keyPoints'>;
export type ClientTeachBack = Public<TeachBackExercise, 'keyPoints'>;
export type ClientScenarioDiagnosis = Public<ScenarioDiagnosisExercise, 'keyPoints' | 'redHerrings'>;
export type ClientArchitectureDecision = Public<ArchitectureDecisionExercise, 'referenceAnswer' | 'keyPoints'>;
export type ClientCompareApproaches = Public<CompareApproachesExercise, 'keyPoints'>;
export type ClientFixDesign = Public<FixDesignExercise, 'keyPoints'>;
export type ClientBoss = Public<BossExercise, 'rubricKeyPoints'>;
export type ClientCapstone = Public<CapstoneExercise, 'rubricKeyPoints'>;

export type ClientExercise =
  | ClientMcq
  | ClientMultiSelect
  | ClientTrueFalse
  | ClientPredictOutcome
  | ClientOrderExecution
  | ClientDebugCode
  | ClientFindAntiPattern
  | ClientExplainWhy
  | ClientTeachBack
  | ClientScenarioDiagnosis
  | ClientArchitectureDecision
  | ClientCompareApproaches
  | ClientFixDesign
  | ClientBoss
  | ClientCapstone;

export interface ClientLesson extends Omit<Lesson, 'exercises' | 'scenario' | 'teachBack'> {
  exercises: ClientExercise[];
  scenario: ClientScenarioDiagnosis;
  teachBack: ClientTeachBack;
}

/** Copy without `keys`; K is checked against the variant's own keys, so a misspelled secret fails to compile. */
function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}

/** Per-variant projection: every branch names the secrets it drops, so a new secret field is a compile-time decision. */
export function toClientExercise(exercise: Exercise): ClientExercise {
  switch (exercise.type) {
    case 'mcq':
      return omit(exercise, ['answer', 'explain']);
    case 'multi_select':
      return omit(exercise, ['answers', 'explain']);
    case 'true_false':
      return omit(exercise, ['answer', 'explain']);
    case 'predict_outcome':
      return omit(exercise, ['answer', 'reveal']);
    case 'order_execution':
      return omit(exercise, ['order', 'reveal']);
    case 'debug_code':
      return omit(exercise, ['bugLines', 'fix', 'explain']);
    case 'find_anti_pattern':
      return omit(exercise, ['answer', 'antiPatternId', 'explain']);
    case 'explain_why':
      return omit(exercise, ['keyPoints']);
    case 'teach_back':
      return toClientTeachBack(exercise);
    case 'scenario_diagnosis':
      return toClientScenario(exercise);
    case 'architecture_decision':
      return omit(exercise, ['referenceAnswer', 'keyPoints']);
    case 'compare_approaches':
      return omit(exercise, ['keyPoints']);
    case 'fix_design':
      return omit(exercise, ['keyPoints']);
    case 'boss':
      return omit(exercise, ['rubricKeyPoints']);
    case 'capstone':
      return omit(exercise, ['rubricKeyPoints']);
  }
}

export function toClientScenario(exercise: ScenarioDiagnosisExercise): ClientScenarioDiagnosis {
  return omit(exercise, ['keyPoints', 'redHerrings']);
}

export function toClientTeachBack(exercise: TeachBackExercise): ClientTeachBack {
  return omit(exercise, ['keyPoints']);
}

export function toClientLesson(lesson: Lesson): ClientLesson {
  return {
    ...lesson,
    exercises: lesson.exercises.map(toClientExercise),
    scenario: toClientScenario(lesson.scenario),
    teachBack: toClientTeachBack(lesson.teachBack),
  };
}

/**
 * The one learner-facing key that shares a secret's name: the lesson-level `explanation.reveal` is the caveman ->
 * technical bridge table rendered between the two modes, not an answer key (the exercise-level `reveal` is).
 */
export const PUBLIC_PATHS_NAMED_LIKE_SECRETS: readonly string[] = ['explanation.reveal'];

/** Paths (dot/bracket notation) of every key in `value` whose name is a secret field; empty = clean. Test helper. */
export function findSecretKeys(value: unknown, path = '', publicPaths: readonly string[] = PUBLIC_PATHS_NAMED_LIKE_SECRETS): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findSecretKeys(item, `${path}[${index}]`, publicPaths));
  if (typeof value !== 'object' || value === null) return [];
  const secrets = new Set<string>(SECRET_FIELDS);
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    const isSecret = secrets.has(key) && !publicPaths.includes(childPath);
    return [...(isSecret ? [childPath] : []), ...findSecretKeys(child, childPath, publicPaths)];
  });
}
