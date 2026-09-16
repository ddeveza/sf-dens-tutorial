// Concept subtree `relationships` (Day 6): lookup vs master-detail, junction objects and relationship conversion.
// Not asserted (ambiguity 8): what happens to a lookup value when the parent is deleted beyond "children remain",
// whether master-detail depth is capped at exactly three levels, and standard objects on the detail side.
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const RELATIONSHIPS_CONCEPTS = [
  defineConcept({
    slug: 'relationships',
    world,
    title: 'Relationships between objects',
    summary: {
      caveman: 'Rocks can be tied together with a loose string or a chain, and sometimes a small rock is the knot between two big ones.',
      technical: 'Lookup, master-detail, junction objects, and the rules for converting between relationship types.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'relationships.lookup-vs-master-detail',
    world,
    title: 'Lookup vs master-detail',
    summary: {
      caveman: 'A loose string between two rocks lets each rock be its own thing. A chain means the little rock goes wherever the big rock goes, even into the trash, and whoever owns the big rock owns the little one too.',
      technical: 'Lookup: an optional or required reference with independent ownership and sharing and no cascade delete by default. Master-detail: the detail must have a master, inherits the master\'s owner and sharing (no sharing rules, manual sharing or queues on the detail), cascade-deletes with the master, has reparenting off by default, and is the only relationship that supports roll-up summary fields. Limits: 2 master-detail relationships per object; 40 relationships in total by default, raisable to 50. Master-detail-subdetail chains are allowed; the hierarchical relationship exists only on User; external and indirect lookups target external objects. Editing a detail record locks its master (Day 24).',
    },
    terms: [
      { term: 'lookup', caveman: 'a loose string' },
      { term: 'master-detail', caveman: 'a chain' },
      { term: 'cascade delete', caveman: 'the little rock following the big one into the trash' },
      { term: 'reparenting', caveman: 'moving the chain to a different big rock' },
    ],
    misconceptions: [
      { id: 'detail-has-owner', summary: 'Expects a master-detail child to have its own owner, queue or sharing rules.', probe: 'A Sales team wants to assign Invoice lines to their queue. What does the relationship type have to be?' },
      { id: 'lookup-cascades', summary: 'Believes deleting a lookup parent deletes the children.', probe: 'You delete an Account with 300 lookup children. What happens to the children?' },
      { id: 'rollup-on-lookup', summary: 'Expects a roll-up summary on a lookup relationship.', probe: 'Why is Roll-Up Summary not offered as a field type on Invoice__c when its lines use a lookup?' },
    ],
    probes: {
      why: ["Why does a master-detail child inherit its parent's sharing?"],
      what_if: ['What if a child object needs cascade delete and its own owner?'],
      what_breaks: ['What breaks when a heavily edited child is master-detail to a very busy parent?'],
      predict: ['Predict what happens to Expense_Report__c children when their master Account is deleted, and what changes if the relationship were a lookup.'],
    },
  }),

  defineConcept({
    slug: 'relationships.junction',
    world,
    title: 'Junction objects (many-to-many)',
    summary: {
      caveman: 'When many big rocks must each tie to many other big rocks, you add a small knot rock in the middle with two chains, one to each side.',
      technical: 'A junction object is a custom object with two master-detail relationships; the first is the primary master, which determines look and feel and sharing inheritance, and the junction record is deleted when either master is deleted. It models many-to-many (Course to Student via Enrollment) and can carry its own fields. A junction object uses both of the object\'s two master-detail slots.',
    },
    terms: [
      { term: 'junction object', caveman: 'the knot rock in the middle' },
      { term: 'primary master', caveman: 'the side the knot rock copies its look from' },
    ],
    misconceptions: [
      { id: 'multi-select-instead', summary: 'Uses a multi-select picklist to model many-to-many.', probe: 'What can you not report on or roll up when a many-to-many is a multi-select picklist?' },
      { id: 'junction-survives', summary: 'Expects the junction record to survive when one master is deleted.', probe: 'Delete a Course. What happens to its Enrollments?' },
    ],
    probes: {
      why: ['Why does a junction object use master-detail rather than two lookups?'],
      predict: ['Predict how many master-detail slots remain on a junction object.'],
      explain_to_junior: ['Explain to a junior admin how Student, Course and Enrollment fit together.'],
    },
  }),

  defineConcept({
    slug: 'relationships.conversion',
    world,
    title: 'Converting between lookup and master-detail',
    summary: {
      caveman: 'You can swap a loose string for a chain only if every little rock already has a big rock to chain to; a stray rock with no partner blocks the swap. Swapping a chain back to a string means little rocks stop following big ones into the trash.',
      technical: 'Creating a master-detail on an object that already has records requires every record to have a parent: orphan (null) values block the conversion. The workaround is to create a lookup, populate it for every record, then convert it to master-detail. Converting master-detail to lookup keeps the data but stops cascade delete and ownership inheritance, and any roll-up summary fields must be removed first. Rehearse conversions on realistic data (a Partial Copy or Full sandbox), not on ten hand-made records.',
    },
    terms: [
      { term: 'orphan record', caveman: 'a stray rock with no partner' },
      { term: 'relationship conversion', caveman: 'swapping the string for a chain' },
    ],
    misconceptions: [
      { id: 'convert-anytime', summary: 'Believes a lookup can become master-detail regardless of existing data.', probe: 'The conversion fails in production but worked in a Developer sandbox. What differs?' },
      { id: 'conversion-keeps-ownership', summary: 'Expects detail records to keep their previous owners after the conversion.', probe: 'After converting to master-detail, who owns the child records?' },
    ],
    probes: {
      why: ['Why does Salesforce refuse to create a master-detail over orphan records?'],
      what_breaks: ['What breaks for a team that assigns child records to a queue after the conversion?'],
      what_would_you_change: ['What would you change in the rehearsal of a relationship conversion before deploying it?'],
    },
  }),
];
