// The six worlds (ARCHITECTURE.md §B data layout: `curriculum/worlds.ts`, 6 defineWorld, slug w<1-6>-<name>).
// `skill` is the default skill bar for the world's concepts (defineConcept defaults `skills` to { [world.skill]: 1 }).
// Caveman summaries stay jargon-free by the same rule as lessons even though only lessons are linted.
import { defineWorld } from '../../lib/curriculum/builders.ts';
import type { World } from '../../lib/curriculum/schema.ts';

export const W1_PLATFORM = defineWorld({
  slug: 'w1-platform',
  ordinal: 1,
  title: 'The Salesforce Platform',
  skill: 'platform',
  summary: {
    caveman: 'One giant shared cave, many tribes, one keeper. Learn how the cave is built, why every tribe gets the same number of logs for the fire, and how a rock gets saved.',
    technical: 'Multitenant architecture, orgs and releases, the data model, the transaction and save order, governor limits, SOQL and data movement, and the sharing model: the platform mechanics every later world builds on.',
  },
});

export const W2_DATA = defineWorld({
  slug: 'w2-data',
  ordinal: 2,
  title: 'The Data Kingdom',
  skill: 'data',
  summary: {
    caveman: 'Where the rocks are kept, how they are found fast when there are millions of them, and how to move a mountain of them without breaking the shelves.',
    technical: 'Large data volumes, indexing and selectivity, skew, archiving, bulk loading and data architecture trade-offs at scale.',
  },
});

export const W3_SECURITY = defineWorld({
  slug: 'w3-security',
  ordinal: 3,
  title: 'The Security Fortress',
  skill: 'security',
  summary: {
    caveman: 'Who may enter which room, who may touch which shelf, and what the guards do when someone tries the wrong door.',
    technical: 'Authentication, profiles and permission sets, the sharing model in depth, Apex security modes, session and login policies, and auditing.',
  },
});

export const W4_AUTOMATION = defineWorld({
  slug: 'w4-automation',
  ordinal: 4,
  title: 'The Automation Engine',
  skill: 'apex',
  summary: {
    caveman: 'The helpers that work while you sleep: when they wake up, what they are allowed to do, and how they fail loudly or quietly.',
    technical: 'Apex in depth, triggers and frameworks, Flow design, asynchronous processing, testing, debugging and observability.',
  },
});

export const W5_INTEGRATION = defineWorld({
  slug: 'w5-integration',
  ordinal: 5,
  title: 'The Integration Network',
  skill: 'integration',
  summary: {
    caveman: 'Talking to other villages: which road to take, how to prove who you are, and what to do when the other side does not answer.',
    technical: 'APIs and their limits, authentication for integrations, events and streaming, patterns for reliability, idempotency and error handling.',
  },
});

export const W6_ARCHITECTURE = defineWorld({
  slug: 'w6-architecture',
  ordinal: 6,
  title: "The Architect's Realm",
  skill: 'architecture',
  summary: {
    caveman: 'Deciding how a whole village should be built before the first hut goes up, and explaining the choice to people who will live in it.',
    technical: 'Well-architected trade-offs, solution design, scalability and performance reviews, governance, and communicating decisions; ends in the Day-180 capstone.',
  },
});

export const WORLDS: readonly World[] = [W1_PLATFORM, W2_DATA, W3_SECURITY, W4_AUTOMATION, W5_INTEGRATION, W6_ARCHITECTURE];
