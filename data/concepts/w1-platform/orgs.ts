// Concept subtree `orgs` (Days 2-3): sandbox types, scratch orgs, Developer Edition and the sandbox preview window.
// Scratch-org allocations could not be verified (ambiguity 5) and are deliberately not taught as numbers.
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const ORGS_CONCEPTS = [
  defineConcept({
    slug: 'orgs',
    world,
    title: 'Orgs and environments',
    summary: {
      caveman: 'Different kitchens for different jobs: the real one where customers eat, practice ones you can wipe, and copies you rebuild now and then.',
      technical: 'Production plus sandbox types, scratch orgs and Developer Edition orgs: which environment fits which task, what each can hold, and when each gets a new release.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'orgs.sandbox-types',
    world,
    title: 'Sandbox types: Developer, Developer Pro, Partial Copy, Full',
    summary: {
      caveman: 'Four practice kitchens: a tiny one you can wipe every day, a bigger tiny one, a half-stocked copy of the real kitchen you may rebuild every few days, and a full copy you may rebuild only about once a month.',
      technical: 'Developer: metadata only, 200 MB of data, refresh once a day. Developer Pro: 1 GB, daily refresh. Partial Copy: a sandbox template selects objects, up to 5 GB of sampled data, refresh every 5 days. Full: a replica of production data, refresh every 29 days. Allocations depend on edition (Enterprise Edition includes 25 Developer and 1 Partial Copy; Full and Developer Pro are purchased). A refresh replaces the sandbox: anything not deployed or committed elsewhere is lost.',
    },
    terms: [
      { term: 'sandbox', caveman: 'practice kitchen' },
      { term: 'refresh', caveman: 'rebuild the practice kitchen from the real one' },
      { term: 'Full sandbox', caveman: 'the full copy of the real kitchen' },
      { term: 'Partial Copy sandbox', caveman: 'the half-stocked copy' },
    ],
    misconceptions: [
      { id: 'dev-sandbox-has-data', summary: 'Expects production records in a Developer sandbox.', probe: 'You refresh a Developer sandbox. How many Account records are in it afterwards?' },
      { id: 'refresh-anytime', summary: 'Believes any sandbox can be refreshed whenever needed.', probe: 'You refreshed a Full sandbox today and need a fresh copy in 10 days. What happens?' },
      { id: 'develop-in-full', summary: 'Builds new features in the Full sandbox because it has real data.', probe: 'What do you lose when the Full sandbox is refreshed before your feature is deployed anywhere else?' },
    ],
    probes: {
      why: ['Why does the refresh interval grow with the amount of data copied?'],
      what_if: ['What if your only Full sandbox is mid-refresh when a production incident needs reproducing?'],
      predict: ['Predict which sandbox type a performance test over millions of rows needs.'],
      what_would_you_change: ['What would you change about a team that develops directly in the Full sandbox?'],
    },
  }),

  defineConcept({
    slug: 'orgs.scratch-orgs',
    world,
    title: 'Scratch orgs',
    summary: {
      caveman: 'A pop-up kitchen built from a written recipe in minutes, gone by itself after a week or a month, and it remembers every change you make so you can copy the recipe back out.',
      technical: 'Scratch orgs are ephemeral orgs created from a Dev Hub with a definition file (edition, features, settings); default lifetime 7 days, maximum 30; source tracking is on by default so the CLI can pull changes back into your project. Per-Dev-Hub active and daily allocations exist but could not be verified for this curriculum (developer.salesforce.com returned 403), so no numbers are taught here; the defaults above are medium confidence.',
    },
    terms: [
      { term: 'scratch org', caveman: 'pop-up kitchen' },
      { term: 'Dev Hub', caveman: 'the office that hands out pop-up kitchens' },
      { term: 'source tracking', caveman: 'the kitchen remembering what you changed' },
    ],
    misconceptions: [
      { id: 'scratch-is-sandbox', summary: 'Treats a scratch org as a sandbox with production data.', probe: 'Where does the data in a fresh scratch org come from?' },
      { id: 'scratch-lives-forever', summary: 'Leaves work in a scratch org for weeks without pulling it into source control.', probe: "What happens to unpulled changes on the org's expiry date?" },
    ],
    probes: {
      why: ['Why is source tracking on by default in scratch orgs but not in production?'],
      what_if: ['What if two developers need the same feature enabled but only one definition file turns it on?'],
      explain_to_junior: ['Explain to a junior developer when to use a scratch org instead of a Developer sandbox.'],
    },
  }),

  defineConcept({
    slug: 'orgs.developer-edition',
    world,
    title: 'Developer Edition orgs',
    summary: {
      caveman: 'A free kitchen of your own that never expires as long as you keep cooking in it now and then. Small: room for two cooks and a few shelves of food.',
      technical: 'A free standalone org for learning and building: 2 full user licences, 5 MB of data storage and 20 MB of file storage, up to 400 custom objects, most platform features enabled. It is not affiliated with any production org (no change sets to or from it), which makes it the right place for every lab in this course. Sign up at developer.salesforce.com.',
    },
    terms: [{ term: 'Developer Edition', caveman: 'your own free small kitchen' }],
    misconceptions: [
      { id: 'de-is-sandbox', summary: "Tries to build a change set from a Developer Edition org to a company's production org.", probe: 'Which orgs can a change set travel between, and is a Developer Edition one of them?' },
      { id: 'de-storage-unlimited', summary: 'Loads a large sample dataset and hits the 5 MB data allocation.', probe: 'Roughly how many 2 KB records fit in a Developer Edition org?' },
    ],
    probes: {
      why: ["Why do the labs use a Developer Edition org rather than your employer's sandbox?"],
      predict: ['Predict what happens when you try to insert 5,000 Accounts into a Developer Edition org.'],
      what_breaks: ['What breaks if a team prototypes in a Developer Edition org and then expects to move the work with a change set?'],
    },
  }),

  defineConcept({
    slug: 'orgs.sandbox-preview',
    world,
    title: 'The sandbox preview window',
    summary: {
      caveman: 'Six weeks before every hut gets the new roof, the practice kitchens in one part of the village get it early so you can test under it. Rebuild a practice kitchen after the deadline and it lands in the part that waits.',
      technical: "Each release upgrades preview sandbox instances about six weeks before production (Winter '27: from Aug 28-29, 2026; preview cutoff 6:00 PM PT Aug 27; non-preview upgrade Oct 9-10). Whether a sandbox is preview or non-preview depends on the instance it lands on when created or refreshed; Setup > Sandboxes shows a Release Type column. Refreshing after the cutoff moves a sandbox to a non-preview instance and loses early access until the general upgrade. The lead time is quoted as 4-5 weeks by the release-schedule FAQ and 6 weeks by the preview instructions; the concrete dates are what matter.",
    },
    terms: [
      { term: 'sandbox preview', caveman: 'getting the new roof early on a practice kitchen' },
      { term: 'Release Type', caveman: 'the label that says whether your practice kitchen is in the early group' },
    ],
    misconceptions: [
      { id: 'preview-is-optional-flag', summary: 'Believes preview is a checkbox on the sandbox rather than a property of the instance it lives on.', probe: 'How do you make an existing non-preview sandbox a preview one?' },
      { id: 'refresh-keeps-preview', summary: 'Refreshes a preview sandbox after the cutoff and expects it to stay on the new release.', probe: 'You refreshed a Developer sandbox at 8 PM PT on Aug 27, 2026. Which release is it on the next morning?' },
    ],
    probes: {
      why: ['Why does Salesforce upgrade sandboxes before production?'],
      predict: ['Predict the Release Type of a sandbox created on Sept 15, 2026.'],
      what_would_you_change: ['What would you change in a release calendar so the team always has one preview sandbox?'],
    },
  }),
];
