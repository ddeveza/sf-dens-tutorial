// Curriculum config (ARCHITECTURE.md, Curriculum architecture §B). Every number the curriculum library, its
// builders and the integrity tests use lives here; nothing is inlined in schema.ts, builders.ts or integrity.ts.
// Relative `.ts` specifiers only: data/** and scripts/** import this file under plain node type stripping.
export const CURRICULUM_CONFIG = {
  defaultEstimatedMinutes: 60,
  minDimensionsPerLesson: 3, // distinct exercise dimensions per lesson/lab
  minMaxDepthPerLesson: 4, // at least one exercise at this depth or deeper
  minMisconceptionsPerConcept: 2,
  minProbeAnglesPerConcept: 2, // angles with >= 1 template
  minWeeklyTemplatesPerWorld: 2,
  lessonTeachBackMinDepth: 5, // Lesson.teachBack.depth floor
  totalDays: 180,
  capstoneDay: 180,
  dayRange: { min: 1, max: 180 },
  estimatedMinutesRange: { min: 5, max: 180 },
  explainWhyDepth: { min: 2, max: 4 }, // engine range for exercise-level explain_why
  teachBackDepth: { min: 2, max: 8 }, // engine range for exercise-level teach_back
  explainWhyProbeFromDepth: 3, // explainWhy(): depth >= this => llm 'probe', else 'check'
  maxLimitSourceTierPriority: 3, // deepDive.limits[].sourceId must cite tier priority 1-3
  skillWeightTolerance: 0.000001, // Concept.skills weights must sum to 1 within this
  minOptions: 2, // mcq / multi_select / find_anti_pattern / debug_code fixOptions / order steps
  defaultVisibility: 'core',
  defaultUnlock: { type: 'previous_complete' },
  // Integrity-test freshness (Testing section): older than warn => console.warn, older than max => failure.
  warnSourceAgeDays: 180,
  maxSourceAgeDays: 365,
} as const;

export type CurriculumConfig = typeof CURRICULUM_CONFIG;
