// Concept subtree `sf-cli` (Day 10): the sf CLI. Every command name and flag here is medium confidence (snippet
// only, ambiguity 10) and the lab tells the learner to verify in a real terminal.
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const SF_CLI_CONCEPTS = [
  defineConcept({
    slug: 'sf-cli',
    world,
    title: 'The sf CLI',
    summary: {
      caveman: "The keeper's messenger you talk to from your own desk instead of walking to the cave.",
      technical: 'The Salesforce CLI (sf), its core commands, and how they wrap the Metadata API and source tracking.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'sf-cli.basics',
    world,
    title: 'sf CLI basics',
    summary: {
      caveman: 'From your desk you tell the messenger: let me in, show me my huts, open one, build me a pop-up kitchen, write the page list, fetch the pages, send the pages. Old messenger words still work, but nobody teaches them any more.',
      technical: 'sf (CLI v2) replaces sfdx (deprecated; security fixes only): sf org login web, sf org list, sf org open, sf org create scratch, sf project generate manifest, sf project retrieve start, sf project deploy start (the VS Code "Push Source" command wraps it). Command names and flags are medium confidence (developer.salesforce.com returned 403 during research); verify in a real terminal before the Day 10 lab. Prefer sf commands over legacy sfdx force:source:* snippets from old blog posts.',
    },
    terms: [
      { term: 'sf CLI', caveman: 'the messenger' },
      { term: 'sfdx', caveman: 'the old messenger words' },
      { term: 'manifest', caveman: 'the page list' },
    ],
    misconceptions: [
      { id: 'sfdx-is-current', summary: 'Copies sfdx force:source:push from old posts.', probe: 'Which command family replaces sfdx force:source:push, and why do old snippets still appear to work?' },
      { id: 'deploy-detects-changes-everywhere', summary: 'Expects sf project deploy start to auto-detect changes against a Full sandbox.', probe: 'Which org types track source, and what does deploy do against one that does not?' },
    ],
    probes: {
      why: ['Why did Salesforce move from sfdx to sf?'],
      predict: ['Predict what sf project deploy start does with no flags against an org without source tracking.'],
      explain_to_junior: ['Explain to a junior developer the three commands they need on day one.'],
    },
  }),
];
