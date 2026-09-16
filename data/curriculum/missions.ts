// Missions (ARCHITECTURE.md §B data layout: `curriculum/missions.ts`, slug w<1-6>-m<n>-<name>). World 1's six
// missions come from the First 30 Days outline: M1 Days 1-3, M2 Days 4-6 and 8-9, M3 Days 10-11, M4 Days 12-13 and
// 15-20, M5 Days 22-25, M6 Days 26-27 and 29. A mission is closed by its boss lesson `boss-<mission-slug>` (the
// last core lesson, kind 'boss'); the slugs are recorded here so later phases author the lessons under fixed names.
// Worlds 2-6 get their missions when their curriculum is outlined (Phase 7).
import { defineMission } from '../../lib/curriculum/builders.ts';
import type { Mission } from '../../lib/curriculum/schema.ts';

export const W1_MISSIONS: readonly Mission[] = [
  defineMission({
    slug: 'w1-m1-the-machine',
    world: 'w1-platform',
    ordinal: 1,
    title: 'The Machine Under the Buttons',
    summary: {
      caveman: 'What the cave is made of, which kitchens you get to cook in, and when everyone gets a new roof.',
      technical: 'Multitenancy, kernel vs metadata vs data, org and sandbox types, releases, API versions and Trust (Days 1-3).',
    },
  }),
  defineMission({
    slug: 'w1-m2-shape-of-data',
    world: 'w1-platform',
    ordinal: 2,
    title: 'The Shape of the Data',
    summary: {
      caveman: 'Name tags on rocks, shelves and their caps, strings and chains between rocks, chalkboards and tallies, and labels per tribe.',
      technical: 'Record IDs, objects and field allocations, relationships, formula and roll-up fields, record types and layouts (Days 4-6, 8-9).',
    },
  }),
  defineMission({
    slug: 'w1-m3-shipping-the-blueprint',
    world: 'w1-platform',
    ordinal: 3,
    title: 'Shipping the Blueprint',
    summary: {
      caveman: 'Carrying the hut plans to another village in one trip, and the checks the courier runs before handing them over.',
      technical: 'Metadata API, the sf CLI, deployment paths (change sets, DevOps Center, CLI) and the test gate (Days 10-11).',
    },
  }),
  defineMission({
    slug: 'w1-m4-one-transaction',
    world: 'w1-platform',
    ordinal: 4,
    title: 'One Transaction',
    summary: {
      caveman: 'One shopping trip, the 20-step assembly line, the shared campfire, and the helpers that work after you leave.',
      technical: 'Transaction boundaries, the save order of execution, governor limits by release, debug logs, triggers, statics and asynchronous Apex (Days 12-13, 15-20).',
    },
  }),
  defineMission({
    slug: 'w1-m5-asking-and-moving-data',
    world: 'w1-platform',
    ordinal: 5,
    title: 'Asking and Moving the Data',
    summary: {
      caveman: 'How to ask the warehouse for rocks without making it search every shelf, and how to move a mountain of rocks in and out.',
      technical: 'SOQL and SOSL, selectivity and query plans, bulk loading APIs and Data Loader, locking and skew (Days 22-25).',
    },
  }),
  defineMission({
    slug: 'w1-m6-who-sees-what',
    world: 'w1-platform',
    ordinal: 6,
    title: 'Who Sees What',
    summary: {
      caveman: 'Which tribes may enter which rooms, who may touch which slots, and how a helper decides whose eyes it borrows.',
      technical: 'Licences, profiles and permission sets, object and field permissions, the sharing model, and Apex security modes (Days 26-27, 29).',
    },
  }),
];

export const MISSIONS: readonly Mission[] = [...W1_MISSIONS];

/** The boss lesson that closes a mission: `boss-<mission-slug>` (LessonSchema enforces the same rule on kind 'boss'). */
export function bossLessonSlug(mission: Pick<Mission, 'slug'>): string {
  return `boss-${mission.slug}`;
}

/** Recorded now, authored in the lesson phase: mission slug -> boss lesson slug. */
export const MISSION_BOSS_LESSON_SLUGS: Readonly<Record<string, string>> = Object.fromEntries(MISSIONS.map((mission) => [mission.slug, bossLessonSlug(mission)]));
