// A complete, LessonSchema-valid fixture built with the real builders. Every string-typed secret field carries the
// sentinel so client-view.test.ts (unit) and the Playwright leak guard (journey 9) can assert it never reaches the
// browser. Numeric secrets (mcq answer, multi_select answers, order, bugLines, fix) cannot hold a string; the
// key-name assertion covers them. `find_anti_pattern.antiPatternId` must resolve to a real anti-pattern id, so it
// carries a slug rather than the sentinel. The fixture defines its own world, mission, concepts, sources, releases,
// rule set and weekly templates (FIXTURE_REGISTRY), so it never depends on data/curriculum.
import type { RuleSet } from '../../lib/simulations/rule-set.ts';
import {
  antiPattern,
  architectureDecision,
  bestPractice,
  boss,
  callout,
  capstone,
  compareApproaches,
  debugCode,
  defineConcept,
  defineLesson,
  defineMission,
  defineRelease,
  defineSource,
  defineWeeklyBoss,
  defineWorld,
  explainWhy,
  findAntiPattern,
  fixDesign,
  list,
  mcq,
  multiSelect,
  orderExecution,
  paragraph,
  predict,
  scenario,
  teachBack,
  trueFalse,
} from '../../lib/curriculum/builders.ts';
import type { DefineLessonInput } from '../../lib/curriculum/builders.ts';
import type { Registry } from '../../lib/curriculum/index.ts';
import type { Lesson } from '../../lib/curriculum/schema.ts';

export const SENTINEL = 'SENTINEL_ANSWER_KEY_7f3a';
export const FIXTURE_TODAY = '2026-09-07';

const verification = { release: 'summer-26', apiVersion: '67.0', docVersion: 'fixture-1', lastVerified: '2026-09-01', status: 'verified' } as const;

export const FIXTURE_WORLD = defineWorld({ slug: 'w1-fixture', ordinal: 1, title: 'Fixture World', skill: 'platform' });
export const FIXTURE_MISSION = defineMission({ slug: 'w1-m1-fixture', world: 'w1-fixture', ordinal: 1, title: 'Fixture Mission' });

export const FIXTURE_SOURCES = [
  defineSource({ id: 'help-fixture-basics', title: 'Fixture help article', url: 'https://help.example.com/fixture/basics', tier: 'help', lastVerified: '2026-08-20', status: 'verified' }),
  defineSource({ id: 'dev-fixture-guide', title: 'Fixture developer guide', url: 'https://developer.example.com/fixture/guide', tier: 'developer', lastVerified: '2026-08-25', status: 'verified', release: 'summer-26', apiVersion: '67.0' }),
  defineSource({
    id: 'arch-fixture-changed',
    title: 'Fixture architect guide',
    url: 'https://architect.example.com/fixture/guide',
    tier: 'architect',
    lastVerified: '2026-07-01',
    status: 'documentation_changed',
    changeNote: { since: '2026-08-15', what: 'The guide now describes the bookmark rule differently.' },
  }),
  defineSource({ id: 'other-fixture-blog', title: 'Fixture community post', url: 'https://blog.example.com/fixture', tier: 'other', lastVerified: '2026-08-01', status: 'verified' }),
  defineSource({ id: 'rn-fixture-summer-26', title: "Fixture Summer '26 release notes", url: 'https://releasenotes.example.com/summer-26', tier: 'trust_release', lastVerified: '2026-06-01', status: 'verified', release: 'summer-26', apiVersion: '67.0' }),
];

export const FIXTURE_RELEASES = [
  defineRelease({
    id: 'summer-26',
    name: "Summer '26",
    apiVersion: '67.0',
    ga: { sandboxPreview: '2026-05-01', productionWeekends: ['2026-06-06', '2026-06-13'] },
    notesUrl: 'https://releasenotes.example.com/summer-26',
    sourceId: 'rn-fixture-summer-26',
  }),
];

export const FIXTURE_RULE_SETS: RuleSet<unknown>[] = [
  {
    id: 'governor-limits@summer-26',
    simulation: 'governor-limits',
    release: 'summer-26',
    apiVersion: '67.0',
    sourceIds: ['dev-fixture-guide'],
    verification: { ...verification },
    rules: { fixture: true },
  },
];

export const FIXTURE_CONCEPTS = [
  defineConcept({
    slug: 'fixture',
    world: FIXTURE_WORLD,
    title: 'Fixture parent',
    summary: { caveman: 'The big idea that holds the small ideas.', technical: 'Parent node of the fixture concept subtree.' },
    terms: [],
    misconceptions: [],
    probes: {},
  }),
  defineConcept({
    slug: 'fixture.boundaries',
    world: FIXTURE_WORLD,
    title: 'Bundle boundaries',
    summary: { caveman: 'A bundle of changes sticks together or not at all.', technical: 'A transaction commits atomically; any uncaught failure rolls back every change.' },
    terms: [
      { term: 'transaction', caveman: 'bundle of changes' },
      { term: 'commit', caveman: 'accept the bundle' },
    ],
    misconceptions: [
      { id: 'partial-commit', summary: 'Believes earlier changes survive a later failure.', probe: 'What happens to the first change when the third one fails?' },
      { id: 'catch-keeps', summary: 'Believes catching the failure keeps the bundle intact.', probe: 'If you catch the failure, which changes are kept?' },
    ],
    probes: {
      why: ['Why does the platform throw away every change on one failure?'],
      what_if: ['What if the failure happens after the last change?'],
      what_breaks: ['What breaks when a bundle is only half accepted?'],
    },
  }),
  defineConcept({
    slug: 'fixture.savepoints',
    world: FIXTURE_WORLD,
    title: 'Bookmarks',
    skills: { platform: 0.6, apex: 0.4 },
    summary: { caveman: 'A bookmark lets you undo only what came after it.', technical: 'A savepoint marks a point a later rollback returns to without abandoning earlier work.' },
    terms: [{ term: 'savepoint', caveman: 'bookmark' }],
    misconceptions: [
      { id: 'bookmark-forever', summary: 'Believes a bookmark survives the whole request.', probe: 'How long does the bookmark last?' },
      { id: 'bookmark-free', summary: 'Believes bookmarks cost nothing.', probe: 'What does each bookmark consume?' },
    ],
    probes: {
      why: ['Why would you set a bookmark before a risky step?'],
      predict: ['Predict what remains after undoing to the bookmark.'],
    },
  }),
];

const apexSetup = { language: 'apex', code: 'insert a;\ninsert b;\nthrow new MyException();' } as const;

export function buildFixtureLessonInput(): DefineLessonInput {
  return {
    slug: 'd001-fixture-lesson',
    day: 1,
    kind: 'lesson',
    world: 'w1-fixture',
    mission: 'w1-m1-fixture',
    ordinal: 1,
    title: 'Bundles and bookmarks',
    objectives: ['Explain why a bundle of changes is all-or-nothing', 'Use a bookmark to undo part of a bundle'],
    concepts: ['fixture.boundaries', 'fixture.savepoints'],
    curiosity: {
      caveman: 'You carry ten cups of water across the room. One spills. Do you still count the trip as done?',
      technical: 'Ten inserts run in one request and the ninth fails. Which rows exist afterwards?',
    },
    problem: {
      caveman: 'The hut saves many things in one go. If one part fails halfway, the rest must not stay half-done, or the books stop adding up.',
      technical: 'Partial writes leave orphaned children and inconsistent totals; the platform guarantees atomicity per request.',
    },
    explanation: {
      caveman: [
        paragraph('When the hut writes a bundle of changes, it keeps all of them or none of them. A failure in the middle throws the whole bundle away.'),
        list(['All changes stick together.', 'One failure undoes every change in the bundle.', 'A bookmark lets you undo only the part after it.']),
        callout('info', 'Nothing is kept until the whole bundle is accepted.'),
      ],
      technical: [
        paragraph('Every request runs inside one transaction. An uncaught exception rolls back every DML statement in it; a savepoint lets Apex roll back to a point instead of to the start.'),
      ],
      reveal: [
        { caveman: 'bundle of changes', technical: 'transaction' },
        { caveman: 'bookmark', technical: 'savepoint' },
      ],
    },
    deepDive: {
      how: { caveman: 'The hut writes on scrap paper first and copies it into the book only at the end.', technical: 'Writes accumulate in the transaction and commit at the end of the request unless an exception unwinds it.' },
      when: 'Group related writes so a failure cannot leave half of them behind.',
      whenNot: 'Do not stretch one request across independent work that should survive separately.',
      whatBreaks: 'A caught exception without a rollback leaves earlier writes committed at the end of the request.',
      scale: { at1M: 'Long transactions hold locks longer; contention grows with row count.', at10M: 'Batch the work; one giant transaction hits limits and lock timeouts.' },
      limits: [{ name: 'DML statements per transaction', value: '150', sourceId: 'dev-fixture-guide' }],
      security: 'Rollback does not undo callouts already sent.',
      performance: 'Savepoints have a small cost; nesting many of them slows the request.',
      interactions: 'Triggers and flows run inside the same transaction and roll back with it.',
    },
    bestPractices: [
      bestPractice({ id: 'one-bundle-per-request', concept: 'fixture.boundaries', what: 'Keep related writes in one request.', why: 'Atomicity is free inside a request.', when: 'Whenever writes depend on each other.', tradeOffs: 'Longer requests hold locks longer.' }),
      bestPractice({ id: 'bookmark-before-risk', concept: 'fixture.savepoints', what: 'Set a savepoint before a risky step.', why: 'You can undo only that step.', when: 'Optional side work that may fail.', tradeOffs: 'Each savepoint counts against DML limits.', code: { language: 'apex', code: 'Savepoint sp = Database.setSavepoint();' } }),
    ],
    antiPatterns: [
      antiPattern({
        id: 'swallowed-exception',
        concept: 'fixture.boundaries',
        name: 'Swallowed exception',
        whyItLooksOk: 'The request finishes without an error.',
        whyItFails: 'Earlier writes commit even though later ones never happened.',
        impact: { maintainability: 'Silent partial data.' },
        before: { language: 'apex', code: 'try { insert a; insert b; } catch (Exception e) {}' },
        after: { language: 'apex', code: 'Savepoint sp = Database.setSavepoint();\ntry { insert a; insert b; } catch (Exception e) { Database.rollback(sp); throw e; }' },
      }),
      antiPattern({
        id: 'bookmark-in-loop',
        concept: 'fixture.savepoints',
        name: 'Savepoint inside a loop',
        whyItLooksOk: 'Each iteration can be undone alone.',
        whyItFails: 'Every savepoint consumes a DML statement; the loop exhausts the limit.',
        impact: { governor: 'DML statement limit.', performance: 'Slower iterations.' },
        before: { language: 'apex', code: 'for (Account a : accounts) { Savepoint sp = Database.setSavepoint(); insert a; }' },
        after: { language: 'apex', code: 'Savepoint sp = Database.setSavepoint();\ninsert accounts;' },
      }),
    ],
    simulation: { id: 'governor-limits', ruleSetId: 'governor-limits@summer-26', preset: 'fixture' },
    exercises: [
      mcq({ id: 'all-or-nothing', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'What happens to the first insert when the third one throws?', options: ['It is rolled back', 'It stays', 'It is retried'], answer: 0, explain: SENTINEL }),
      multiSelect({ id: 'which-undo', concept: 'fixture.boundaries', dimension: 'understanding', depth: 2, prompt: 'Which statements are true about one request?', options: ['One transaction', 'Writes commit at the end', 'Each insert commits alone'], answers: [0, 1], explain: SENTINEL }),
      trueFalse({ id: 'partial-keeps', concept: 'fixture.boundaries', dimension: 'recall', depth: 1, prompt: 'Catching an exception keeps earlier writes committed even if you throw again.', answer: false, explain: SENTINEL }),
      predict({ id: 'rollback-partial', concept: 'fixture.boundaries', dimension: 'understanding', depth: 3, prompt: { caveman: 'What is left after the crash?', technical: 'Which rows exist after the exception?' }, setup: apexSetup, options: ['none', 'a only', 'a and b'], answer: 0, reveal: SENTINEL }),
      predict({ id: 'count-after-fail', concept: 'fixture.savepoints', dimension: 'application', depth: 3, prompt: 'Type the number of rows that remain after rolling back to the savepoint.', setup: 'insert a; Savepoint sp = Database.setSavepoint(); insert b; Database.rollback(sp);', answer: SENTINEL, reveal: SENTINEL }),
      orderExecution({ id: 'save-order', concept: 'fixture.boundaries', dimension: 'understanding', depth: 3, prompt: 'Order the steps of a request that fails.', steps: ['rollback', 'insert a', 'exception thrown'], order: [1, 2, 0], reveal: SENTINEL }),
      debugCode({ id: 'missing-rollback', concept: 'fixture.savepoints', dimension: 'debugging', depth: 4, prompt: 'Find the bug.', code: { language: 'apex', code: 'Savepoint sp = Database.setSavepoint();\ntry {\n  insert a;\n} catch (Exception e) { }' }, bugLines: [4], fixOptions: ['Remove the savepoint', 'Roll back to sp in the catch'], fix: 1, explain: SENTINEL }),
      findAntiPattern({ id: 'spot-swallow', concept: 'fixture.boundaries', dimension: 'debugging', depth: 4, prompt: 'Which snippet hides a partial write?', code: { language: 'apex', code: 'try { insert a; insert b; } catch (Exception e) {}' }, options: ['The catch block', 'The insert'], answer: 0, antiPatternId: 'swallowed-exception', explain: SENTINEL }),
      explainWhy({ id: 'why-all-or-nothing', concept: 'fixture.boundaries', dimension: 'understanding', depth: 2, prompt: 'Explain why a request is all-or-nothing.', keyPoints: [SENTINEL] }),
      teachBack({ id: 'teach-admin', concept: 'fixture.savepoints', dimension: 'teach_back', depth: 3, prompt: 'Explain bookmarks to an admin.', audience: 'admin', keyPoints: [SENTINEL] }),
      architectureDecision({ id: 'split-or-not', concept: 'fixture.boundaries', dimension: 'architecture', depth: 6, prompt: 'Choose a design.', scenario: 'An import writes parents and children.', options: ['One request', 'Two requests'], referenceAnswer: SENTINEL, keyPoints: [SENTINEL] }),
      compareApproaches({ id: 'bookmark-vs-restart', concept: 'fixture.savepoints', dimension: 'architecture', depth: 5, prompt: 'Compare the approaches.', a: 'Savepoint before the optional step.', b: 'Restart the whole request on failure.', keyPoints: [SENTINEL] }),
      fixDesign({ id: 'fix-batch-design', concept: 'fixture.boundaries', dimension: 'architecture', depth: 7, prompt: 'Fix the design.', design: 'One request imports one million rows.', keyPoints: [SENTINEL] }),
    ],
    scenario: scenario({ id: 'half-saved-invoices', concept: 'fixture.boundaries', dimension: 'debugging', depth: 5, prompt: 'Diagnose the incident.', scenario: 'Invoices exist without lines after a nightly job.', keyPoints: [SENTINEL], redHerrings: [SENTINEL] }),
    teachBack: teachBack({ id: 'teach-junior', concept: 'fixture.boundaries', dimension: 'teach_back', depth: 5, prompt: 'Teach a junior developer why writes are all-or-nothing.', audience: 'junior_dev', keyPoints: [SENTINEL] }),
    sources: ['help-fixture-basics', 'dev-fixture-guide', 'arch-fixture-changed', 'other-fixture-blog'],
    releaseNotes: [{ release: 'summer-26', apiVersion: '67.0', change: 'No behavior change; verified against the current guide.', affects: 'behavior' }],
    verification: { ...verification },
  };
}

export const FIXTURE_LESSON: Lesson = defineLesson(buildFixtureLessonInput(), { today: FIXTURE_TODAY });

export const FIXTURE_BOSS_LESSON: Lesson = defineLesson(
  {
    slug: 'boss-w1-m1-fixture',
    day: 2,
    kind: 'boss',
    world: 'w1-fixture',
    mission: 'w1-m1-fixture',
    ordinal: 2,
    title: 'Boss: the half-saved night',
    objectives: ['Diagnose a partial-write incident'],
    concepts: ['fixture.boundaries'],
    curiosity: { caveman: 'The night shift saved half the books. Where do you look first?', technical: 'A nightly job left invoices without lines.' },
    problem: { caveman: 'Some pages are written, some are blank, and nobody saw an error.', technical: 'Silent partial commits after a swallowed exception.' },
    explanation: { caveman: 'A boss fight has no lesson text; you bring what you learned.', technical: 'Boss battles are graded with the six-part incident rubric.', reveal: [] },
    exercises: [
      boss({
        id: 'incident',
        concept: 'fixture.boundaries',
        dimension: 'debugging',
        depth: 6,
        prompt: 'Work the incident.',
        incident: 'At 02:00 the nightly import wrote 4,000 invoices; 1,200 have no lines and no error was logged.',
        rubricKeyPoints: { suspect: [SENTINEL], why: [SENTINEL], dataNeeded: [SENTINEL], whatToInspect: [SENTINEL], solution: [SENTINEL], tradeOffs: [SENTINEL] },
      }),
    ],
    scenario: scenario({ id: 'aftermath', concept: 'fixture.boundaries', dimension: 'debugging', depth: 5, prompt: 'What do you check the next morning?', scenario: 'The job ran again and the count changed.', keyPoints: [SENTINEL] }),
    teachBack: teachBack({ id: 'debrief', concept: 'fixture.boundaries', dimension: 'teach_back', depth: 5, prompt: 'Debrief the team.', audience: 'architect', keyPoints: [SENTINEL] }),
    sources: ['dev-fixture-guide'],
    verification: { ...verification },
  },
  { today: FIXTURE_TODAY },
);

export const FIXTURE_CAPSTONE_LESSON: Lesson = defineLesson(
  {
    slug: 'capstone',
    day: 180,
    kind: 'capstone',
    world: 'w1-fixture',
    mission: 'w1-m1-fixture',
    ordinal: 3,
    title: 'Capstone',
    objectives: ['Design the whole system'],
    concepts: ['fixture.savepoints'],
    curiosity: { caveman: 'Build the whole hut from memory.', technical: 'Design a multi-object import with failure handling.' },
    problem: { caveman: 'Everything you learned, at once.', technical: 'Twelve rubric dimensions, one brief.' },
    explanation: { caveman: 'No lesson text; this is the final exam.', technical: 'Graded with CapstoneSchema.', reveal: [] },
    exercises: [
      capstone({
        id: 'final',
        concept: 'fixture.savepoints',
        dimension: 'architecture',
        depth: 8,
        prompt: 'Answer the brief.',
        brief: 'Design an import that never leaves half-written data.',
        rubricKeyPoints: {
          platformKnowledge: [SENTINEL],
          dataArchitecture: [SENTINEL],
          security: [SENTINEL],
          apex: [SENTINEL],
          automation: [SENTINEL],
          integration: [SENTINEL],
          scalability: [SENTINEL],
          performance: [SENTINEL],
          reliability: [SENTINEL],
          observability: [SENTINEL],
          tradeOffReasoning: [SENTINEL],
          communication: [SENTINEL],
        },
      }),
    ],
    scenario: scenario({ id: 'postmortem', concept: 'fixture.savepoints', dimension: 'debugging', depth: 5, prompt: 'Write the postmortem.', scenario: 'The import failed at row 900,000.', keyPoints: [SENTINEL] }),
    teachBack: teachBack({ id: 'present', concept: 'fixture.savepoints', dimension: 'teach_back', depth: 6, prompt: 'Present the design.', audience: 'architect', keyPoints: [SENTINEL] }),
    sources: ['dev-fixture-guide', 'help-fixture-basics'],
    verification: { ...verification },
  },
  { today: FIXTURE_TODAY },
);

export const FIXTURE_TEMPLATES = [
  defineWeeklyBoss({
    id: 'weekly-w1-fixture-drill',
    world: 'w1-fixture',
    title: 'Weekly boss: the drill',
    concepts: ['fixture.boundaries', 'fixture.savepoints'],
    exercise: boss({
      id: 'drill',
      concept: 'fixture.boundaries',
      dimension: 'debugging',
      depth: 6,
      prompt: 'Work the incident.',
      incident: 'A weekly job leaves bookmarks that never get cleaned up.',
      rubricKeyPoints: { suspect: [SENTINEL], why: [SENTINEL], dataNeeded: [SENTINEL], whatToInspect: [SENTINEL], solution: [SENTINEL], tradeOffs: [SENTINEL] },
    }),
    sources: ['dev-fixture-guide'],
    verification: { ...verification },
  }),
  defineWeeklyBoss({
    id: 'weekly-w1-fixture-boundaries',
    world: 'w1-fixture',
    title: 'Weekly boss: boundaries',
    concepts: ['fixture.boundaries'],
    exercise: boss({
      id: 'boundaries',
      concept: 'fixture.boundaries',
      dimension: 'debugging',
      depth: 6,
      prompt: 'Work the incident.',
      incident: 'A request commits half its writes.',
      rubricKeyPoints: { suspect: [SENTINEL], why: [SENTINEL], dataNeeded: [SENTINEL], whatToInspect: [SENTINEL], solution: [SENTINEL], tradeOffs: [SENTINEL] },
    }),
    sources: ['help-fixture-basics'],
    verification: { ...verification },
  }),
];

export const FIXTURE_REGISTRY: Registry = {
  WORLDS: [FIXTURE_WORLD],
  MISSIONS: [FIXTURE_MISSION],
  LESSONS: [FIXTURE_LESSON, FIXTURE_BOSS_LESSON, FIXTURE_CAPSTONE_LESSON],
  CONCEPTS: FIXTURE_CONCEPTS,
  SOURCES: FIXTURE_SOURCES,
  RELEASES: FIXTURE_RELEASES,
  WEEKLY_TEMPLATES: FIXTURE_TEMPLATES,
  RULE_SETS: FIXTURE_RULE_SETS,
};

/** A fresh, structurally-shared copy for tests that mutate the registry. */
export function cloneFixtureRegistry(): Registry {
  return {
    WORLDS: [...FIXTURE_REGISTRY.WORLDS],
    MISSIONS: [...FIXTURE_REGISTRY.MISSIONS],
    LESSONS: [...FIXTURE_REGISTRY.LESSONS],
    CONCEPTS: [...FIXTURE_REGISTRY.CONCEPTS],
    SOURCES: [...FIXTURE_REGISTRY.SOURCES],
    RELEASES: [...FIXTURE_REGISTRY.RELEASES],
    WEEKLY_TEMPLATES: [...FIXTURE_REGISTRY.WEEKLY_TEMPLATES],
    RULE_SETS: [...FIXTURE_REGISTRY.RULE_SETS],
  };
}
