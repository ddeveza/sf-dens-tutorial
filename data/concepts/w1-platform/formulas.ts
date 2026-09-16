// Concept subtree `formulas` (Day 8): formula fields, cross-object formulas and roll-up summaries. The spanning
// cap is taught as "10-15, raisable by Support" because the KB says 15 and the tips page says 10 (ambiguity 6).
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const FORMULAS_CONCEPTS = [
  defineConcept({
    slug: 'formulas',
    world,
    title: 'Formula and roll-up fields',
    summary: {
      caveman: 'A chalkboard that redoes its sum every time you look, and a tally the big rock keeps about its chained little rocks.',
      technical: 'Formula fields, cross-object formulas and roll-up summary fields: what they compute, their limits, and when to move to automation.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'formulas.formula-fields',
    world,
    title: 'Formula fields',
    summary: {
      caveman: 'A chalkboard on the shelf that works out its answer fresh every time someone looks at it. It stores nothing; if the chalkboard gets too long, the keeper refuses to hang it.',
      technical: 'A formula field is computed at read time and not stored. Limits: 3,900 characters of formula source and 5,000 bytes compiled; a formula that references other formula fields expands them into its own compiled size, so chains fail at save time. Formulas appear in reports and list views, and only deterministic formulas (no cross-object references, no TODAY() or NOW(), no TEXT(picklist)) are eligible for a custom index (Day 23).',
    },
    terms: [
      { term: 'formula field', caveman: 'the chalkboard' },
      { term: 'compiled size', caveman: 'how long the chalkboard is once every borrowed sum is written out' },
    ],
    misconceptions: [
      { id: 'formula-is-stored', summary: 'Believes formula values are stored and can be filtered efficiently or bulk-updated.', probe: 'Can you filter a million-row object on a cross-object formula and expect an index to help?' },
      { id: 'chain-formulas-freely', summary: 'Chains formulas that reference other formulas without accounting for compiled size.', probe: 'Formula C references B, which references A, each 1,500 bytes compiled. Does C save?' },
    ],
    probes: {
      why: ['Why does referencing another formula count against your own compiled limit?'],
      predict: ['Predict whether a 4,000-character formula saves.'],
      what_would_you_change: ['What would you change when a formula chain hits the 5,000-byte compiled limit?'],
    },
  }),

  defineConcept({
    slug: 'formulas.cross-object',
    world,
    title: 'Cross-object (spanning) formulas',
    summary: {
      caveman: 'A chalkboard may peek at a rock tied to yours, and at that rock\'s partner, and so on, but only a handful of rocks may be peeked at from one shelf; the keeper can raise the handful if you ask.',
      technical: 'A formula can traverse relationships (Account.Owner.Name, up to 10 levels of parent). Each distinct object referenced across all formulas on one object counts toward a spanning-relationship cap: KB 000383053 says 15, the cross-object tips snippet says 10; teach it as a small cap of 10-15 that Support can raise. Cross-object formulas are non-deterministic and therefore cannot be custom-indexed.',
    },
    terms: [
      { term: 'cross-object formula', caveman: 'a chalkboard that peeks at tied rocks' },
      { term: 'spanning relationship', caveman: 'one rock peeked at through a string' },
    ],
    misconceptions: [
      { id: 'cap-is-per-formula', summary: 'Counts the spanning cap per formula rather than per object.', probe: 'Ten formulas on Case each reference a different parent object. What runs out?' },
      { id: 'cross-object-indexable', summary: 'Asks Support to index a cross-object formula.', probe: 'Why will Support decline to index a formula that references Account.Owner.Name?' },
    ],
    probes: {
      why: ['Why is the spanning cap per object rather than per formula?'],
      what_breaks: ["What breaks when an object's formulas reference 16 distinct related objects?"],
      explain_to_junior: ['Explain to a junior admin why "just add another formula" can fail on a busy object.'],
    },
  }),

  defineConcept({
    slug: 'formulas.rollup-summary',
    world,
    title: 'Roll-up summary fields',
    summary: {
      caveman: 'The big rock keeps a tally about its chained little rocks: how many, the sum, the smallest, the biggest. No chain, no tally: a loose string does not count.',
      technical: 'Roll-up summary fields live on the master side of a master-detail relationship and compute COUNT, SUM, MIN or MAX over detail records (number, currency, percent, date and date/time fields; filters allowed; details whose formula fields evaluate to #Error! are excluded). Limits: 25 per object by default, 40 hard maximum (raised by Support). They are stored and recalculated when details change (step 16 of the save order, Day 13). They are not available on lookup relationships; for those, use Flow or Apex.',
    },
    terms: [
      { term: 'roll-up summary', caveman: 'the tally the big rock keeps' },
      { term: 'master side', caveman: 'the big rock end of the chain' },
    ],
    misconceptions: [
      { id: 'rollup-on-lookup', summary: 'Expects Roll-Up Summary as a field type on a lookup parent.', probe: 'Invoice__c lines use a lookup. Is Roll-Up Summary offered when you add a field to Invoice__c?' },
      { id: 'rollup-unlimited', summary: 'Adds roll-ups freely without knowing the 25 default cap.', probe: 'What happens on the 26th roll-up, and who can raise the cap?' },
    ],
    probes: {
      why: ['Why do roll-ups require master-detail?'],
      predict: ['Predict whether a SUM of Amount__c over lookup children can be a roll-up summary.'],
      what_would_you_change: ['What would you change in a design that needs a total over lookup children?'],
    },
  }),
];
