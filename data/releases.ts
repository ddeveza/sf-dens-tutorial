// Salesforce releases the curriculum can pin (ARCHITECTURE.md §C "Release model" and the release stamp verified
// 2026-09-04). Ids are the only release identifier anywhere (`RuleSet.release`, `lessons.release`,
// `verification.release`). The version ladder Winter '26 = 65.0, Spring '26 = 66.0, Summer '26 = 67.0,
// Winter '27 = 68.0 is confirmed (68.0 medium confidence: release-note snippets plus the docs version picker).
//
// GA dates: only Winter '27 has dates from the research (sandbox preview from Aug 28-29, 2026; production windows
// Sept 4, Oct 2 and Oct 9, 2026 quoted by the Salesforce Admins blog, medium confidence for the exact dates;
// confirm per instance on Trust). Summer '26 production dates (May 15, June 5/12/13, 2026) came from snippets of
// pages that did not render (ambiguity 4) and are recorded as such. Older releases carry no dates rather than
// invented ones; `sandboxPreview` says so in words because the schema wants a string, not a date.
import { defineRelease } from '../lib/sources/builders.ts';
import type { Release } from '../lib/sources/types.ts';

const RN = 'https://help.salesforce.com/s/articleView?id=release-notes.salesforce_release_notes.htm';
const NOT_RECORDED = 'not recorded (past release; see help-kb-release-schedule)';

export const RELEASES: readonly Release[] = [
  defineRelease({
    id: 'winter-26',
    name: "Winter '26",
    apiVersion: '65.0',
    ga: { sandboxPreview: NOT_RECORDED, productionWeekends: [] },
    notesUrl: `${RN}&release=258&type=5`,
    sourceId: 'rn-w26-home',
  }),
  defineRelease({
    id: 'spring-26',
    name: "Spring '26",
    apiVersion: '66.0',
    ga: { sandboxPreview: NOT_RECORDED, productionWeekends: [] },
    notesUrl: `${RN}&release=260&type=5`,
    sourceId: 'rn-sp26-apex',
  }),
  defineRelease({
    id: 'summer-26',
    name: "Summer '26",
    apiVersion: '67.0',
    // Snippet-only dates (ambiguity 4): quote with attribution, never as verified fact.
    ga: { sandboxPreview: 'not recorded (snippet-only research; unverified)', productionWeekends: ['2026-05-15', '2026-06-05', '2026-06-12', '2026-06-13'] },
    notesUrl: `${RN}&release=262&type=5`,
    sourceId: 'rn-s26-apex',
  }),
  defineRelease({
    id: 'winter-27',
    name: "Winter '27",
    apiVersion: '68.0',
    // Preview instances upgraded Aug 28-29, 2026 (preview cutoff 6:00 PM PT Aug 27); production windows medium confidence.
    ga: { sandboxPreview: '2026-08-28', productionWeekends: ['2026-09-04', '2026-10-02', '2026-10-09'] },
    notesUrl: `${RN}&release=264&type=5`,
    sourceId: 'rn-w27-home',
  }),
];

/** The release most production orgs run today (2026-09-04 stamp); Day 3 tells learners to confirm on Trust. */
export const CURRENT_GA_RELEASE_ID = 'summer-26';
/** The release on sandbox preview instances and rolling to production through Oct 2026. */
export const UPCOMING_RELEASE_ID = 'winter-27';
