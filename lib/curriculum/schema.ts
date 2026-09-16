// Curriculum Zod schemas (ARCHITECTURE.md, Curriculum architecture §B "Types"). Types are z.infer of the schemas
// of the same name. Band, Dimension, Depth, ProbeAngle, SkillId and SimId are declared once in the engine type
// files and re-exported here; Verification comes from lib/sources. Relative `.ts` specifiers only (data/** and
// scripts/** import this under plain node type stripping); no enum / namespace syntax.
import { z } from 'zod';
import { BANDS, DEPTHS, DIMENSIONS } from '../mastery-engine/types.ts';
import type { Band, Depth, Dimension } from '../mastery-engine/types.ts';
import { PROBE_ANGLES } from '../learning-engine/types.ts';
import type { ProbeAngle } from '../learning-engine/types.ts';
import { SKILL_IDS } from '../gamification/types.ts';
import type { SkillId } from '../gamification/types.ts';
import { SIM_IDS, isSimId } from '../simulations/rule-set.ts';
import type { RuleSetId, SimId } from '../simulations/rule-set.ts';
import { ReleaseIdSchema, VerificationSchema } from '../sources/schema.ts';
import type { Verification } from '../sources/types.ts';
import { BOSS_RUBRIC_KEYS, CAPSTONE_DIMENSIONS } from '../llm/schemas.ts';
import { CURRICULUM_CONFIG } from './config.ts';

export { VerificationSchema };
export type { Band, Depth, Dimension, ProbeAngle, RuleSetId, SkillId, SimId, Verification };

// ---------------------------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------------------------

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CONCEPT_SLUG_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
export const WORLD_SLUG_RE = /^w[1-6]-[a-z0-9]+(-[a-z0-9]+)*$/;
export const MISSION_SLUG_RE = /^w[1-6]-m[1-9][0-9]*-[a-z0-9]+(-[a-z0-9]+)*$/;
export const DAY_LESSON_SLUG_RE = /^d[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$/;
export const WEEKLY_TEMPLATE_ID_RE = /^weekly-w[1-6]-[a-z0-9]+(-[a-z0-9]+)*$/;
export const LOCAL_EXERCISE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const EXERCISE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?$/;
export const RULE_SET_ID_RE = /^(governor-limits|order-of-execution|sharing|soql-selectivity)@(spring|summer|winter)-\d{2}$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SlugSchema = z.string().regex(SLUG_RE, 'slug: lowercase words joined by single hyphens');
export const ConceptSlugSchema = z.string().regex(CONCEPT_SLUG_RE, 'concept slug: dotted knowledge-map path');
export const MarkdownSchema = z.string().min(1);
export const IsoDateSchema = z.string().regex(ISO_DATE_RE, 'YYYY-MM-DD');

export type Slug = z.infer<typeof SlugSchema>;
export type ConceptSlug = z.infer<typeof ConceptSlugSchema>;
export type Markdown = z.infer<typeof MarkdownSchema>;

/** Real calendar date check on top of the YYYY-MM-DD shape (2026-02-30 is rejected). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const CODE_LANGUAGES = ['apex', 'soql', 'sosl', 'json', 'xml', 'flow', 'text'] as const;
export const CodeSchema = z
  .object({
    language: z.enum(CODE_LANGUAGES),
    code: z.string().min(1),
    caption: z.string().min(1).optional(),
  })
  .strict();
export type Code = z.infer<typeof CodeSchema>;

export const BilingualSchema = z.object({ caveman: MarkdownSchema, technical: MarkdownSchema }).strict();
export type Bilingual = z.infer<typeof BilingualSchema>;

// The toggle unit for the explanation step (Application section, "Caveman <-> Technical toggle contract").
export const RICH_BLOCK_KINDS = ['paragraph', 'code', 'callout', 'list'] as const;
export const RICH_CODE_LANGUAGES = ['apex', 'soql', 'text'] as const;
export const CALLOUT_TONES = ['info', 'warning'] as const;
export const RichBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paragraph'), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('code'), language: z.enum(RICH_CODE_LANGUAGES), code: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('callout'), tone: z.enum(CALLOUT_TONES), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('list'), items: z.array(z.string().min(1)).min(1) }).strict(),
]);
export type RichBlock = z.infer<typeof RichBlockSchema>;

/** Authors may hand a plain Markdown string; it becomes a single paragraph block. Output is always RichBlock[]. */
export const RichBlocksSchema = z.union([
  z
    .string()
    .min(1)
    .transform((text): RichBlock[] => [{ kind: 'paragraph', text }]),
  z.array(RichBlockSchema).min(1),
]);

export const DimensionSchema = z.enum(DIMENSIONS);
export const DepthSchema = z.literal([...DEPTHS]);
export const BandSchema = z.enum(BANDS);
export const ProbeAngleSchema = z.enum(PROBE_ANGLES);
export const SkillIdSchema = z.enum(SKILL_IDS);
export const SimIdSchema = z.enum(SIM_IDS);

/** Narrows a string to `RuleSetId` (`<sim>@<season>-<yy>` with a known sim); loaders take plain strings from routes. */
export function isRuleSetId(value: string): value is RuleSetId {
  if (!RULE_SET_ID_RE.test(value)) return false;
  const at = value.indexOf('@');
  return at > 0 && isSimId(value.slice(0, at));
}

/** Parses to the template-literal type so `simulation.ruleSetId` indexes `Map<RuleSetId, RuleSet>` without casts. */
export const RuleSetIdSchema = z.custom<RuleSetId>((value) => typeof value === 'string' && isRuleSetId(value), {
  message: "rule set id: '<sim>@<season>-<yy>' (e.g. 'governor-limits@winter-27')",
});

// ---------------------------------------------------------------------------------------------------------------
// Concepts, deep dive, best practice, anti-pattern
// ---------------------------------------------------------------------------------------------------------------

export const ConceptSchema = z
  .object({
    slug: ConceptSlugSchema,
    parent: ConceptSlugSchema.optional(),
    world: SlugSchema,
    title: z.string().min(1),
    skills: z.partialRecord(SkillIdSchema, z.number().gt(0).lte(1)).optional(),
    summary: BilingualSchema,
    terms: z.array(z.object({ term: z.string().min(1), caveman: z.string().min(1) }).strict()),
    misconceptions: z.array(
      z.object({ id: z.string().regex(SLUG_RE), summary: z.string().min(1), probe: z.string().min(1) }).strict(),
    ),
    probes: z.partialRecord(ProbeAngleSchema, z.array(z.string().min(1))),
  })
  .strict()
  .superRefine((concept, ctx) => {
    if (concept.skills) {
      const entries = Object.values(concept.skills) as number[];
      const sum = entries.reduce((total, weight) => total + weight, 0);
      if (entries.length === 0 || Math.abs(sum - 1) > CURRICULUM_CONFIG.skillWeightTolerance) {
        ctx.addIssue({ code: 'custom', path: ['skills'], message: `skills weights must sum to 1 (got ${sum})` });
      }
    }
    if (concept.parent !== undefined && concept.parent === concept.slug) {
      ctx.addIssue({ code: 'custom', path: ['parent'], message: 'a concept cannot be its own parent' });
    }
    const ids = new Set<string>();
    concept.misconceptions.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        ctx.addIssue({ code: 'custom', path: ['misconceptions', index, 'id'], message: `duplicate misconception id '${entry.id}'` });
      }
      ids.add(entry.id);
    });
  });
export type Concept = z.infer<typeof ConceptSchema>;
export type ConceptInput = z.input<typeof ConceptSchema>;

export const DeepDiveSchema = z
  .object({
    how: BilingualSchema,
    when: MarkdownSchema,
    whenNot: MarkdownSchema,
    whatBreaks: MarkdownSchema,
    scale: z.object({ at1M: MarkdownSchema, at10M: MarkdownSchema }).strict(),
    limits: z.array(z.object({ name: z.string().min(1), value: z.string().min(1), sourceId: z.string().min(1) }).strict()),
    security: MarkdownSchema,
    performance: MarkdownSchema,
    interactions: MarkdownSchema,
  })
  .strict();
export type DeepDive = z.infer<typeof DeepDiveSchema>;

export const BestPracticeSchema = z
  .object({
    id: z.string().regex(SLUG_RE),
    concept: ConceptSlugSchema,
    what: MarkdownSchema,
    why: MarkdownSchema,
    when: MarkdownSchema,
    tradeOffs: MarkdownSchema,
    code: CodeSchema.optional(),
  })
  .strict();
export type BestPractice = z.infer<typeof BestPracticeSchema>;

export const AntiPatternSchema = z
  .object({
    id: z.string().regex(SLUG_RE),
    concept: ConceptSlugSchema,
    name: z.string().min(1),
    whyItLooksOk: MarkdownSchema,
    whyItFails: MarkdownSchema,
    impact: z
      .object({
        governor: MarkdownSchema.optional(),
        performance: MarkdownSchema.optional(),
        security: MarkdownSchema.optional(),
        maintainability: MarkdownSchema.optional(),
      })
      .strict()
      .refine((impact) => Object.values(impact).some((value) => value !== undefined), 'at least one impact'),
    before: CodeSchema,
    after: CodeSchema,
  })
  .strict();
export type AntiPattern = z.infer<typeof AntiPatternSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Exercises: a discriminated union on `type`; each variant carries exactly its own fields.
// ---------------------------------------------------------------------------------------------------------------

export const ExerciseIdSchema = z
  .string()
  .regex(EXERCISE_ID_RE, "exercise id: '<local-id>' or '<lesson-slug>/<local-id>'")
  .refine((id) => !/^\d+$/.test(id.split('/').pop() ?? ''), 'index-based exercise ids are forbidden');

const KeyPoints = z.array(z.string().min(1)).min(1);
const Options = z.array(z.string().min(1)).min(CURRICULUM_CONFIG.minOptions);
const Index = z.number().int().min(0);

const exerciseBase = {
  id: ExerciseIdSchema,
  concept: ConceptSlugSchema,
  dimension: DimensionSchema,
  depth: DepthSchema,
  prompt: z.union([BilingualSchema, MarkdownSchema]),
  sourceIds: z.array(z.string().min(1)).optional(),
};

export const McqExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('mcq'), options: Options, answer: Index, explain: MarkdownSchema })
  .strict()
  .refine((e) => e.answer < e.options.length, { path: ['answer'], message: 'answer must index options' });

export const MultiSelectExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('multi_select'), options: Options, answers: z.array(Index).min(1), explain: MarkdownSchema })
  .strict()
  .superRefine((e, ctx) => {
    if (new Set(e.answers).size !== e.answers.length) ctx.addIssue({ code: 'custom', path: ['answers'], message: 'answers must be unique' });
    if (e.answers.some((index) => index >= e.options.length)) ctx.addIssue({ code: 'custom', path: ['answers'], message: 'answers must index options' });
  });

export const TrueFalseExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('true_false'), answer: z.boolean(), explain: MarkdownSchema })
  .strict();

// options present => answer is an option index; absent => free-text prediction matched (trimmed, case-insensitive)
export const PredictOutcomeExerciseSchema = z
  .object({
    ...exerciseBase,
    type: z.literal('predict_outcome'),
    setup: z.union([CodeSchema, MarkdownSchema]),
    options: Options.optional(),
    answer: z.union([Index, z.string().min(1), z.array(z.string().min(1)).min(1)]),
    reveal: MarkdownSchema,
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.options) {
      if (typeof e.answer !== 'number') ctx.addIssue({ code: 'custom', path: ['answer'], message: 'answer must be an option index when options are given' });
      else if (e.answer >= e.options.length) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'answer must index options' });
    } else if (typeof e.answer === 'number') {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'answer must be the expected value(s) when no options are given' });
    }
  });

export const OrderExecutionExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('order_execution'), steps: Options, order: z.array(Index).min(CURRICULUM_CONFIG.minOptions), reveal: MarkdownSchema })
  .strict()
  .refine(
    (e) => e.order.length === e.steps.length && new Set(e.order).size === e.steps.length && e.order.every((index) => index < e.steps.length),
    { path: ['order'], message: 'order must be a permutation of the step indices' },
  );

// scored: bugLines 50% + fix 50% (lib/assessments)
export const DebugCodeExerciseSchema = z
  .object({
    ...exerciseBase,
    type: z.literal('debug_code'),
    code: CodeSchema,
    bugLines: z.array(z.number().int().min(1)).min(1),
    fixOptions: Options,
    fix: Index,
    explain: MarkdownSchema,
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.fix >= e.fixOptions.length) ctx.addIssue({ code: 'custom', path: ['fix'], message: 'fix must index fixOptions' });
    const lineCount = e.code.code.split('\n').length;
    if (e.bugLines.some((line) => line > lineCount)) ctx.addIssue({ code: 'custom', path: ['bugLines'], message: `bugLines exceed the ${lineCount} code lines` });
    if (new Set(e.bugLines).size !== e.bugLines.length) ctx.addIssue({ code: 'custom', path: ['bugLines'], message: 'bugLines must be unique' });
  });

// scored: snippet 60% + named anti-pattern 40%
export const FindAntiPatternExerciseSchema = z
  .object({
    ...exerciseBase,
    type: z.literal('find_anti_pattern'),
    code: CodeSchema,
    options: Options,
    answer: Index,
    antiPatternId: z.string().regex(SLUG_RE),
    explain: MarkdownSchema,
  })
  .strict()
  .refine((e) => e.answer < e.options.length, { path: ['answer'], message: 'answer must index options' });

export const ExplainWhyExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('explain_why'), keyPoints: KeyPoints, llm: z.enum(['check', 'probe']) })
  .strict()
  .refine((e) => e.depth >= CURRICULUM_CONFIG.explainWhyDepth.min && e.depth <= CURRICULUM_CONFIG.explainWhyDepth.max, {
    path: ['depth'],
    message: `explain_why depth must be ${CURRICULUM_CONFIG.explainWhyDepth.min}-${CURRICULUM_CONFIG.explainWhyDepth.max}`,
  });

export const TEACH_BACK_AUDIENCES = ['junior_dev', 'admin', 'architect'] as const;
export const TeachBackExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('teach_back'), audience: z.enum(TEACH_BACK_AUDIENCES), keyPoints: KeyPoints })
  .strict()
  .refine((e) => e.depth >= CURRICULUM_CONFIG.teachBackDepth.min && e.depth <= CURRICULUM_CONFIG.teachBackDepth.max, {
    path: ['depth'],
    message: `teach_back depth must be ${CURRICULUM_CONFIG.teachBackDepth.min}-${CURRICULUM_CONFIG.teachBackDepth.max}`,
  });

export const ScenarioDiagnosisExerciseSchema = z
  .object({
    ...exerciseBase,
    type: z.literal('scenario_diagnosis'),
    scenario: MarkdownSchema,
    keyPoints: KeyPoints,
    redHerrings: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const ArchitectureDecisionExerciseSchema = z
  .object({
    ...exerciseBase,
    type: z.literal('architecture_decision'),
    scenario: MarkdownSchema,
    options: Options,
    referenceAnswer: MarkdownSchema,
    keyPoints: KeyPoints,
  })
  .strict();

export const CompareApproachesExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('compare_approaches'), a: MarkdownSchema, b: MarkdownSchema, keyPoints: KeyPoints })
  .strict();

export const FixDesignExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('fix_design'), design: MarkdownSchema, keyPoints: KeyPoints })
  .strict();

export const BossRubricKeyPointsSchema = z.record(z.enum(BOSS_RUBRIC_KEYS), KeyPoints);
export const BossExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('boss'), incident: MarkdownSchema, rubricKeyPoints: BossRubricKeyPointsSchema })
  .strict();

export const CapstoneRubricKeyPointsSchema = z.record(z.enum(CAPSTONE_DIMENSIONS), KeyPoints);
export const CapstoneExerciseSchema = z
  .object({ ...exerciseBase, type: z.literal('capstone'), brief: MarkdownSchema, rubricKeyPoints: CapstoneRubricKeyPointsSchema })
  .strict();

export const ExerciseSchema = z.discriminatedUnion('type', [
  McqExerciseSchema,
  MultiSelectExerciseSchema,
  TrueFalseExerciseSchema,
  PredictOutcomeExerciseSchema,
  OrderExecutionExerciseSchema,
  DebugCodeExerciseSchema,
  FindAntiPatternExerciseSchema,
  ExplainWhyExerciseSchema,
  TeachBackExerciseSchema,
  ScenarioDiagnosisExerciseSchema,
  ArchitectureDecisionExerciseSchema,
  CompareApproachesExerciseSchema,
  FixDesignExerciseSchema,
  BossExerciseSchema,
  CapstoneExerciseSchema,
]);
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseType = Exercise['type'];
export const EXERCISE_TYPES = ExerciseSchema.options.map((option) => option.shape.type.value) as readonly ExerciseType[];

export type McqExercise = z.infer<typeof McqExerciseSchema>;
export type MultiSelectExercise = z.infer<typeof MultiSelectExerciseSchema>;
export type TrueFalseExercise = z.infer<typeof TrueFalseExerciseSchema>;
export type PredictOutcomeExercise = z.infer<typeof PredictOutcomeExerciseSchema>;
export type OrderExecutionExercise = z.infer<typeof OrderExecutionExerciseSchema>;
export type DebugCodeExercise = z.infer<typeof DebugCodeExerciseSchema>;
export type FindAntiPatternExercise = z.infer<typeof FindAntiPatternExerciseSchema>;
export type ExplainWhyExercise = z.infer<typeof ExplainWhyExerciseSchema>;
export type TeachBackExercise = z.infer<typeof TeachBackExerciseSchema>;
export type ScenarioDiagnosisExercise = z.infer<typeof ScenarioDiagnosisExerciseSchema>;
export type ArchitectureDecisionExercise = z.infer<typeof ArchitectureDecisionExerciseSchema>;
export type CompareApproachesExercise = z.infer<typeof CompareApproachesExerciseSchema>;
export type FixDesignExercise = z.infer<typeof FixDesignExerciseSchema>;
export type BossExercise = z.infer<typeof BossExerciseSchema>;
export type CapstoneExercise = z.infer<typeof CapstoneExerciseSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Release notes, unlock rules, lessons, weekly templates, worlds, missions
// ---------------------------------------------------------------------------------------------------------------

export const RELEASE_NOTE_AFFECTS = ['behavior', 'limits', 'ui', 'deprecation'] as const;
export const ReleaseNoteSchema = z
  .object({
    release: ReleaseIdSchema,
    apiVersion: z.string().regex(/^\d{2,3}\.0$/).optional(),
    change: MarkdownSchema,
    affects: z.enum(RELEASE_NOTE_AFFECTS),
  })
  .strict();
export type ReleaseNote = z.infer<typeof ReleaseNoteSchema>;

export const LESSON_KINDS = ['lesson', 'lab', 'side_quest', 'boss', 'capstone'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];
export const LESSON_VISIBILITIES = ['core', 'side', 'hidden'] as const;
export type LessonVisibility = (typeof LESSON_VISIBILITIES)[number];

export const UnlockRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('previous_complete') }).strict(),
  z.object({ type: z.literal('band'), concept: ConceptSlugSchema, min: BandSchema }).strict(),
  z.object({ type: z.literal('boss_defeated'), lesson: SlugSchema }).strict(),
  z.object({ type: z.literal('hidden'), concept: ConceptSlugSchema, min: BandSchema }).strict(),
]);
export type UnlockRule = z.infer<typeof UnlockRuleSchema>;

export const SimulationRefSchema = z
  .object({ id: SimIdSchema, ruleSetId: RuleSetIdSchema, preset: z.string().min(1) })
  .strict()
  .refine((ref) => ref.ruleSetId.startsWith(`${ref.id}@`), { path: ['ruleSetId'], message: 'ruleSetId must belong to simulation id' });
export type SimulationRef = z.infer<typeof SimulationRefSchema>;

export const ExplanationSchema = z
  .object({
    caveman: RichBlocksSchema,
    technical: RichBlocksSchema,
    reveal: z.array(z.object({ caveman: z.string().min(1), technical: z.string().min(1) }).strict()),
  })
  .strict();
export type Explanation = z.infer<typeof ExplanationSchema>;

const LessonObjectSchema = z
  .object({
    slug: SlugSchema,
    day: z.number().int().min(CURRICULUM_CONFIG.dayRange.min).max(CURRICULUM_CONFIG.dayRange.max),
    kind: z.enum(LESSON_KINDS),
    world: SlugSchema,
    mission: SlugSchema,
    ordinal: z.number().int().min(1),
    visibility: z.enum(LESSON_VISIBILITIES),
    unlock: UnlockRuleSchema,
    estimatedMinutes: z.number().int().min(CURRICULUM_CONFIG.estimatedMinutesRange.min).max(CURRICULUM_CONFIG.estimatedMinutesRange.max),
    title: z.string().min(1),
    objectives: z.array(z.string().min(1)).min(1),
    concepts: z.array(ConceptSlugSchema).min(1), // first is primary
    curiosity: BilingualSchema,
    problem: BilingualSchema,
    explanation: ExplanationSchema,
    deepDive: DeepDiveSchema.optional(), // required for kind lesson/lab (refinement); boss/capstone skip it
    bestPractices: z.array(BestPracticeSchema),
    antiPatterns: z.array(AntiPatternSchema),
    simulation: SimulationRefSchema.optional(),
    exercises: z.array(ExerciseSchema),
    scenario: ScenarioDiagnosisExerciseSchema,
    teachBack: TeachBackExerciseSchema,
    sources: z.array(z.string().min(1)).min(1),
    releaseNotes: z.array(ReleaseNoteSchema),
    verification: VerificationSchema,
  })
  .strict();

export interface LessonSchemaOptions {
  /** YYYY-MM-DD; when given, verification.lastVerified must not be later than it. Callers pass it: no wall clock here. */
  today?: string;
}

type LessonShape = z.output<typeof LessonObjectSchema>;

function lessonRefinements(lesson: LessonShape, ctx: z.RefinementCtx, options: LessonSchemaOptions): void {
  const config = CURRICULUM_CONFIG;
  const label = lesson.slug;
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message: `${label}: ${message}` });

  // Slug conventions per kind (data layout table).
  if (lesson.kind === 'boss' && lesson.slug !== `boss-${lesson.mission}`) issue(['slug'], `boss lesson slug must be 'boss-${lesson.mission}'`);
  if (lesson.kind === 'capstone') {
    if (lesson.slug !== 'capstone') issue(['slug'], "capstone lesson slug must be 'capstone'");
    if (lesson.day !== config.capstoneDay) issue(['day'], `capstone must be day ${config.capstoneDay}`);
  }
  if (lesson.kind === 'lesson' || lesson.kind === 'lab' || lesson.kind === 'side_quest') {
    if (!DAY_LESSON_SLUG_RE.test(lesson.slug)) issue(['slug'], "lesson slug must be 'd<ddd>-<name>'");
    else if (Number(lesson.slug.slice(1, 4)) !== lesson.day) issue(['slug'], `slug day prefix must equal day ${lesson.day}`);
  }

  // Visibility <-> kind <-> unlock.
  if (lesson.kind === 'side_quest' && lesson.visibility !== 'side') issue(['visibility'], "side quests are visibility 'side'");
  if (lesson.visibility === 'hidden' && lesson.unlock.type !== 'hidden') issue(['unlock'], "hidden lessons need unlock { type: 'hidden' }");
  if (lesson.unlock.type === 'hidden' && lesson.visibility !== 'hidden') issue(['visibility'], "unlock 'hidden' requires visibility 'hidden'");
  if ((lesson.kind === 'boss' || lesson.kind === 'capstone') && lesson.visibility !== 'core') issue(['visibility'], `${lesson.kind} lessons are core`);

  // Exercise ids: namespaced under the lesson slug and unique (scenario and teachBack included).
  const allExercises = [...lesson.exercises, lesson.scenario, lesson.teachBack];
  const seen = new Set<string>();
  allExercises.forEach((exercise, index) => {
    const path = index < lesson.exercises.length ? ['exercises', index, 'id'] : index === lesson.exercises.length ? ['scenario', 'id'] : ['teachBack', 'id'];
    if (!exercise.id.startsWith(`${lesson.slug}/`)) issue(path, `exercise id '${exercise.id}' must be namespaced '${lesson.slug}/<id>'`);
    if (seen.has(exercise.id)) issue(path, `duplicate exercise id '${exercise.id}'`);
    seen.add(exercise.id);
  });

  // Kind-specific structure.
  if (lesson.kind === 'lesson' || lesson.kind === 'lab') {
    if (!lesson.deepDive) issue(['deepDive'], 'deepDive is required for lessons and labs');
    if (lesson.bestPractices.length < 1) issue(['bestPractices'], 'at least one best practice');
    if (lesson.antiPatterns.length < 1) issue(['antiPatterns'], 'at least one anti-pattern');
    const dimensions = new Set(lesson.exercises.map((exercise) => exercise.dimension));
    if (dimensions.size < config.minDimensionsPerLesson) {
      issue(['exercises'], `exercises must cover >= ${config.minDimensionsPerLesson} distinct dimensions (got ${dimensions.size})`);
    }
    const maxDepth = lesson.exercises.reduce((max, exercise) => Math.max(max, exercise.depth), 0);
    if (maxDepth < config.minMaxDepthPerLesson) issue(['exercises'], `some exercise must reach depth >= ${config.minMaxDepthPerLesson} (max ${maxDepth})`);
  }
  if (lesson.kind === 'boss' || lesson.kind === 'capstone') {
    const count = lesson.exercises.filter((exercise) => exercise.type === lesson.kind).length;
    if (count !== 1) issue(['exercises'], `a ${lesson.kind} lesson needs exactly one '${lesson.kind}' exercise (got ${count})`);
  }
  lesson.exercises.forEach((exercise, index) => {
    if ((exercise.type === 'boss' || exercise.type === 'capstone') && exercise.type !== lesson.kind) {
      issue(['exercises', index, 'type'], `'${exercise.type}' exercises belong only to ${exercise.type} lessons`);
    }
  });

  if (lesson.teachBack.depth < config.lessonTeachBackMinDepth) {
    issue(['teachBack', 'depth'], `lesson teach-back depth must be >= ${config.lessonTeachBackMinDepth}`);
  }

  // Verification date: a real calendar date, not in the future when `today` is known.
  if (!isValidIsoDate(lesson.verification.lastVerified)) {
    issue(['verification', 'lastVerified'], `'${lesson.verification.lastVerified}' is not a calendar date`);
  } else if (options.today && lesson.verification.lastVerified > options.today) {
    issue(['verification', 'lastVerified'], `lastVerified ${lesson.verification.lastVerified} is after today ${options.today}`);
  }
}

/** LessonSchema with an injected `today` for the not-in-the-future rule (tests and builders pass it). */
export function createLessonSchema(options: LessonSchemaOptions = {}) {
  return LessonObjectSchema.superRefine((lesson, ctx) => lessonRefinements(lesson, ctx, options));
}

export const LessonSchema = createLessonSchema();
export type Lesson = z.output<typeof LessonSchema>;
export type LessonInput = z.input<typeof LessonSchema>;

export const WeeklyBossTemplateSchema = z
  .object({
    id: z.string().regex(WEEKLY_TEMPLATE_ID_RE, "weekly template id: 'weekly-<world>-<name>'"),
    world: SlugSchema,
    title: z.string().min(1),
    concepts: z.array(ConceptSlugSchema).min(1), // non-empty, all in `world` (integrity test 4)
    exercise: BossExerciseSchema,
    sources: z.array(z.string().min(1)).min(1),
    verification: VerificationSchema,
  })
  .strict()
  .superRefine((template, ctx) => {
    if (!template.id.startsWith(`weekly-${template.world.split('-')[0]}-`)) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: `${template.id}: id must start with 'weekly-${template.world.split('-')[0]}-'` });
    }
    if (!template.exercise.id.startsWith(`${template.id}/`)) {
      ctx.addIssue({ code: 'custom', path: ['exercise', 'id'], message: `${template.id}: exercise id must be namespaced '${template.id}/<id>'` });
    }
    if (!isValidIsoDate(template.verification.lastVerified)) {
      ctx.addIssue({ code: 'custom', path: ['verification', 'lastVerified'], message: `${template.id}: not a calendar date` });
    }
  });
export type WeeklyBossTemplate = z.infer<typeof WeeklyBossTemplateSchema>;
export type WeeklyBossTemplateInput = z.input<typeof WeeklyBossTemplateSchema>;

export const WorldSchema = z
  .object({
    slug: z.string().regex(WORLD_SLUG_RE, "world slug: 'w<1-6>-<name>'"),
    ordinal: z.number().int().min(1).max(6),
    title: z.string().min(1),
    skill: SkillIdSchema, // default skill of the world's concepts
    summary: BilingualSchema.optional(),
  })
  .strict()
  .refine((world) => Number(world.slug.slice(1, 2)) === world.ordinal, { path: ['ordinal'], message: 'ordinal must match the w<n> slug prefix' });
export type World = z.infer<typeof WorldSchema>;

export const MissionSchema = z
  .object({
    slug: z.string().regex(MISSION_SLUG_RE, "mission slug: 'w<1-6>-m<n>-<name>'"),
    world: z.string().regex(WORLD_SLUG_RE),
    ordinal: z.number().int().min(1),
    title: z.string().min(1),
    summary: BilingualSchema.optional(),
  })
  .strict()
  .superRefine((mission, ctx) => {
    const worldPrefix = mission.world.split('-')[0];
    if (!mission.slug.startsWith(`${worldPrefix}-m`)) {
      ctx.addIssue({ code: 'custom', path: ['slug'], message: `${mission.slug}: slug must start with '${worldPrefix}-m'` });
    }
    const ordinalInSlug = Number(mission.slug.match(/^w[1-6]-m([1-9][0-9]*)-/)?.[1]);
    if (ordinalInSlug !== mission.ordinal) {
      ctx.addIssue({ code: 'custom', path: ['ordinal'], message: `${mission.slug}: ordinal must match the m<n> slug segment` });
    }
  });
export type Mission = z.infer<typeof MissionSchema>;

/** Text of a RichBlock array for lint and search (code blocks excluded: code is jargon by nature). */
export function richBlocksText(blocks: readonly RichBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case 'paragraph':
        case 'callout':
          return block.text;
        case 'list':
          return block.items.join('\n');
        case 'code':
          return '';
      }
    })
    .filter((text) => text.length > 0)
    .join('\n');
}

export function promptText(prompt: Exercise['prompt'], mode: 'caveman' | 'technical' = 'technical'): string {
  return typeof prompt === 'string' ? prompt : prompt[mode];
}
