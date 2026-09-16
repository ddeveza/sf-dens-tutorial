// Authoring builders (ARCHITECTURE.md §B "Builders"). Each builder fills defaults, parses with its Zod schema
// immediately (errors surface at import time with the slug/id in the message) and defineLesson/defineWeeklyBoss
// namespace exercise ids as `${slug}/${localId}`. Relative `.ts` specifiers only; no enum / namespace syntax.
import { z } from 'zod';
import { CURRICULUM_CONFIG } from './config.ts';
import {
  AntiPatternSchema,
  ArchitectureDecisionExerciseSchema,
  BestPracticeSchema,
  BossExerciseSchema,
  CapstoneExerciseSchema,
  CompareApproachesExerciseSchema,
  ConceptSchema,
  DebugCodeExerciseSchema,
  ExplainWhyExerciseSchema,
  FindAntiPatternExerciseSchema,
  FixDesignExerciseSchema,
  LOCAL_EXERCISE_ID_RE,
  McqExerciseSchema,
  MissionSchema,
  MultiSelectExerciseSchema,
  OrderExecutionExerciseSchema,
  PredictOutcomeExerciseSchema,
  ScenarioDiagnosisExerciseSchema,
  TeachBackExerciseSchema,
  TrueFalseExerciseSchema,
  WeeklyBossTemplateSchema,
  WorldSchema,
  createLessonSchema,
} from './schema.ts';
import type {
  AntiPattern,
  ArchitectureDecisionExercise,
  BestPractice,
  BossExercise,
  CapstoneExercise,
  CompareApproachesExercise,
  Concept,
  ConceptInput,
  DebugCodeExercise,
  Exercise,
  ExplainWhyExercise,
  FindAntiPatternExercise,
  FixDesignExercise,
  Lesson,
  LessonInput,
  LessonSchemaOptions,
  McqExercise,
  Mission,
  MultiSelectExercise,
  OrderExecutionExercise,
  PredictOutcomeExercise,
  RichBlock,
  ScenarioDiagnosisExercise,
  TeachBackExercise,
  TrueFalseExercise,
  WeeklyBossTemplate,
  WeeklyBossTemplateInput,
  World,
} from './schema.ts';

export { defineRelease, defineSource } from '../sources/builders.ts';
export type { ReleaseInput, SourceInput } from '../sources/builders.ts';

export class CurriculumAuthoringError extends Error {
  readonly issues: z.core.$ZodIssue[];

  constructor(message: string, issues: z.core.$ZodIssue[] = []) {
    super(message);
    this.name = 'CurriculumAuthoringError';
    this.issues = issues;
  }
}

function parseWith<S extends z.ZodType>(schema: S, value: unknown, label: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new CurriculumAuthoringError(`${label}: ${z.prettifyError(result.error)}`, result.error.issues);
  return result.data;
}

function labelOf(kind: string, value: { id?: unknown; slug?: unknown }): string {
  const key = typeof value.slug === 'string' ? value.slug : typeof value.id === 'string' ? value.id : '<missing id>';
  return `${kind} '${key}'`;
}

// ---------------------------------------------------------------------------------------------------------------
// Rich blocks (explanation step)
// ---------------------------------------------------------------------------------------------------------------

export function paragraph(text: string): RichBlock {
  return { kind: 'paragraph', text };
}
export function codeBlock(language: 'apex' | 'soql' | 'text', code: string): RichBlock {
  return { kind: 'code', language, code };
}
export function callout(tone: 'info' | 'warning', text: string): RichBlock {
  return { kind: 'callout', tone, text };
}
export function list(items: string[]): RichBlock {
  return { kind: 'list', items };
}

// ---------------------------------------------------------------------------------------------------------------
// Exercise builders: authors give short local ids; defineLesson / defineWeeklyBoss namespace them.
// ---------------------------------------------------------------------------------------------------------------

type WithoutType<T> = Omit<T, 'type'>;

export function mcq(input: WithoutType<z.input<typeof McqExerciseSchema>>): McqExercise {
  return parseWith(McqExerciseSchema, { ...input, type: 'mcq' }, labelOf('exercise', input));
}
export function multiSelect(input: WithoutType<z.input<typeof MultiSelectExerciseSchema>>): MultiSelectExercise {
  return parseWith(MultiSelectExerciseSchema, { ...input, type: 'multi_select' }, labelOf('exercise', input));
}
export function trueFalse(input: WithoutType<z.input<typeof TrueFalseExerciseSchema>>): TrueFalseExercise {
  return parseWith(TrueFalseExerciseSchema, { ...input, type: 'true_false' }, labelOf('exercise', input));
}
/** Emits `type: 'predict_outcome'` (the Postgres question_type spelling). */
export function predict(input: WithoutType<z.input<typeof PredictOutcomeExerciseSchema>>): PredictOutcomeExercise {
  return parseWith(PredictOutcomeExerciseSchema, { ...input, type: 'predict_outcome' }, labelOf('exercise', input));
}
export function orderExecution(input: WithoutType<z.input<typeof OrderExecutionExerciseSchema>>): OrderExecutionExercise {
  return parseWith(OrderExecutionExerciseSchema, { ...input, type: 'order_execution' }, labelOf('exercise', input));
}
export function debugCode(input: WithoutType<z.input<typeof DebugCodeExerciseSchema>>): DebugCodeExercise {
  return parseWith(DebugCodeExerciseSchema, { ...input, type: 'debug_code' }, labelOf('exercise', input));
}
export function findAntiPattern(input: WithoutType<z.input<typeof FindAntiPatternExerciseSchema>>): FindAntiPatternExercise {
  return parseWith(FindAntiPatternExerciseSchema, { ...input, type: 'find_anti_pattern' }, labelOf('exercise', input));
}
/** `llm` defaults from depth: >= explainWhyProbeFromDepth => 'probe', else 'check'. */
export function explainWhy(input: Omit<z.input<typeof ExplainWhyExerciseSchema>, 'type' | 'llm'> & { llm?: 'check' | 'probe' }): ExplainWhyExercise {
  const llm = input.llm ?? (input.depth >= CURRICULUM_CONFIG.explainWhyProbeFromDepth ? 'probe' : 'check');
  return parseWith(ExplainWhyExerciseSchema, { ...input, llm, type: 'explain_why' }, labelOf('exercise', input));
}
export function teachBack(input: WithoutType<z.input<typeof TeachBackExerciseSchema>>): TeachBackExercise {
  return parseWith(TeachBackExerciseSchema, { ...input, type: 'teach_back' }, labelOf('exercise', input));
}
export function scenario(input: WithoutType<z.input<typeof ScenarioDiagnosisExerciseSchema>>): ScenarioDiagnosisExercise {
  return parseWith(ScenarioDiagnosisExerciseSchema, { ...input, type: 'scenario_diagnosis' }, labelOf('exercise', input));
}
export function architectureDecision(input: WithoutType<z.input<typeof ArchitectureDecisionExerciseSchema>>): ArchitectureDecisionExercise {
  return parseWith(ArchitectureDecisionExerciseSchema, { ...input, type: 'architecture_decision' }, labelOf('exercise', input));
}
export function compareApproaches(input: WithoutType<z.input<typeof CompareApproachesExerciseSchema>>): CompareApproachesExercise {
  return parseWith(CompareApproachesExerciseSchema, { ...input, type: 'compare_approaches' }, labelOf('exercise', input));
}
export function fixDesign(input: WithoutType<z.input<typeof FixDesignExerciseSchema>>): FixDesignExercise {
  return parseWith(FixDesignExerciseSchema, { ...input, type: 'fix_design' }, labelOf('exercise', input));
}
export function boss(input: WithoutType<z.input<typeof BossExerciseSchema>>): BossExercise {
  return parseWith(BossExerciseSchema, { ...input, type: 'boss' }, labelOf('exercise', input));
}
export function capstone(input: WithoutType<z.input<typeof CapstoneExerciseSchema>>): CapstoneExercise {
  return parseWith(CapstoneExerciseSchema, { ...input, type: 'capstone' }, labelOf('exercise', input));
}

export function bestPractice(input: z.input<typeof BestPracticeSchema>): BestPractice {
  return parseWith(BestPracticeSchema, input, labelOf('best practice', input));
}
export function antiPattern(input: z.input<typeof AntiPatternSchema>): AntiPattern {
  return parseWith(AntiPatternSchema, input, labelOf('anti-pattern', input));
}

// ---------------------------------------------------------------------------------------------------------------
// Worlds, missions, concepts
// ---------------------------------------------------------------------------------------------------------------

export function defineWorld(input: z.input<typeof WorldSchema>): World {
  return parseWith(WorldSchema, input, labelOf('world', input));
}

export function defineMission(input: z.input<typeof MissionSchema>): Mission {
  return parseWith(MissionSchema, input, labelOf('mission', input));
}

export type DefineConceptInput = Omit<ConceptInput, 'world'> & {
  /** The World record (defaults `skills` to `{ [world.skill]: 1 }`) or its slug (then `skills` is required). */
  world: World | string;
};

/** `skills` defaults from the world; `parent` defaults from the dotted slug prefix ('soql.selectivity' -> 'soql'). */
export function defineConcept(input: DefineConceptInput): Concept {
  const label = labelOf('concept', input);
  const worldSlug = typeof input.world === 'string' ? input.world : input.world.slug;
  let skills = input.skills;
  if (!skills) {
    if (typeof input.world === 'string') {
      throw new CurriculumAuthoringError(`${label}: pass the World record to default skills, or give skills explicitly`);
    }
    skills = { [input.world.skill]: 1 };
  }
  const dot = typeof input.slug === 'string' ? input.slug.lastIndexOf('.') : -1;
  const parent = input.parent ?? (dot > 0 ? input.slug.slice(0, dot) : undefined);
  return parseWith(ConceptSchema, { ...input, world: worldSlug, skills, ...(parent !== undefined ? { parent } : {}) }, label);
}

// ---------------------------------------------------------------------------------------------------------------
// Lessons and weekly boss templates
// ---------------------------------------------------------------------------------------------------------------

type LessonDefaults = 'estimatedMinutes' | 'visibility' | 'unlock' | 'bestPractices' | 'antiPatterns' | 'releaseNotes';
export type DefineLessonInput = Omit<LessonInput, LessonDefaults> & Partial<Pick<LessonInput, LessonDefaults>>;

/** `${owner}/${localId}`; an id already under `owner/` passes through; any other '/' id is a foreign namespace. */
export function namespaceExerciseId(owner: string, id: string, label: string): string {
  if (id.startsWith(`${owner}/`)) return id;
  if (id.includes('/')) throw new CurriculumAuthoringError(`${label}: exercise id '${id}' belongs to another namespace`);
  if (!LOCAL_EXERCISE_ID_RE.test(id)) throw new CurriculumAuthoringError(`${label}: exercise id '${id}' must be a lowercase hyphenated word`);
  if (/^\d+$/.test(id)) throw new CurriculumAuthoringError(`${label}: index-based exercise id '${id}' is forbidden (attempts reference ids forever)`);
  return `${owner}/${id}`;
}

function namespaceExercise<E extends { id: string }>(owner: string, exercise: E, label: string): E {
  return { ...exercise, id: namespaceExerciseId(owner, exercise.id, label) };
}

export function defineLesson(input: DefineLessonInput, options: LessonSchemaOptions = {}): Lesson {
  const label = labelOf('lesson', input);
  const slug = typeof input.slug === 'string' ? input.slug : '';
  const candidate: LessonInput = {
    ...input,
    estimatedMinutes: input.estimatedMinutes ?? CURRICULUM_CONFIG.defaultEstimatedMinutes,
    visibility: input.visibility ?? CURRICULUM_CONFIG.defaultVisibility,
    unlock: input.unlock ?? { ...CURRICULUM_CONFIG.defaultUnlock },
    bestPractices: input.bestPractices ?? [],
    antiPatterns: input.antiPatterns ?? [],
    releaseNotes: input.releaseNotes ?? [],
    exercises: (input.exercises ?? []).map((exercise) => namespaceExercise(slug, exercise, label)),
    scenario: input.scenario ? namespaceExercise(slug, input.scenario, label) : input.scenario,
    teachBack: input.teachBack ? namespaceExercise(slug, input.teachBack, label) : input.teachBack,
  };
  return parseWith(createLessonSchema(options), candidate, label);
}

export type DefineWeeklyBossInput = WeeklyBossTemplateInput;

export function defineWeeklyBoss(input: DefineWeeklyBossInput): WeeklyBossTemplate {
  const label = labelOf('weekly boss', input);
  const id = typeof input.id === 'string' ? input.id : '';
  const candidate: WeeklyBossTemplateInput = {
    ...input,
    exercise: input.exercise ? namespaceExercise(id, input.exercise, label) : input.exercise,
  };
  return parseWith(WeeklyBossTemplateSchema, candidate, label);
}

/** Every exercise a lesson owns, including the scenario and teach-back steps. */
export function lessonExercises(lesson: Pick<Lesson, 'exercises' | 'scenario' | 'teachBack'>): Exercise[] {
  return [...lesson.exercises, lesson.scenario, lesson.teachBack];
}
