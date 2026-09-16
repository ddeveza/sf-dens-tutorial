// Concept subtree `ids` (Day 4): 15- vs 18-character record IDs and key prefixes. The Hyperforce server-id claim
// is medium confidence (ambiguity 9) and is labelled so in the technical text.
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const IDS_CONCEPTS = [
  defineConcept({
    slug: 'ids',
    world,
    title: 'Record IDs',
    summary: {
      caveman: 'Every rock in the cave has a name tag; the tag tells you what kind of rock it is.',
      technical: 'Salesforce record identifiers: the 15- and 18-character forms and the three-character key prefix that encodes the object.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'ids.15-vs-18',
    world,
    title: '15-character vs 18-character IDs',
    summary: {
      caveman: 'Every rock has a short name tag and a long one. The short tag only works if you read CAPITAL and small letters differently; the long tag adds three letters at the end so that even readers who ignore capitals never mix up two rocks.',
      technical: 'A record ID is 15 characters and case-sensitive; the 18-character form appends a 3-character checksum that makes it case-insensitive (case-safe). Reports and the classic UI show 15; APIs from version 2.5 onward return 18. Both refer to the same record and the platform accepts either as input. CASESAFEID(Id) in a formula yields the 18-character form; a spreadsheet lookup comparing 15 to 18 fails on every row.',
    },
    terms: [
      { term: 'case-safe ID', caveman: 'the long name tag' },
      { term: 'CASESAFEID', caveman: 'the spell that turns a short tag into a long one' },
    ],
    misconceptions: [
      { id: 'different-records', summary: 'Thinks the 15- and 18-character forms identify different records.', probe: 'You have 001A0000012abc and 001A0000012abcAAA. How many records is that?' },
      { id: 'excel-safe', summary: 'Assumes a spreadsheet treats 15-character IDs as distinct when they differ only by case.', probe: 'Why can two different records collapse into one row in a case-insensitive VLOOKUP?' },
    ],
    probes: {
      why: ['Why did Salesforce add three characters instead of making the 15-character form case-insensitive?'],
      what_breaks: ['What breaks when a report export of IDs is matched against an API export in a spreadsheet?'],
      predict: ['Predict what CASESAFEID returns for an 18-character input.'],
      explain_to_junior: ['Explain to a junior admin how to reconcile a report export against an API export.'],
    },
  }),

  defineConcept({
    slug: 'ids.key-prefixes',
    world,
    title: 'Key prefixes',
    summary: {
      caveman: 'The first three letters of every name tag say what kind of rock it is. The standard kinds have the same three letters in every cave; the kinds a tribe invents get letters that can differ from cave to cave.',
      technical: "The first three characters of an ID identify the object: 001 Account, 003 Contact, 005 User, 006 Opportunity, 00Q Lead, 500 Case, 00e Profile, 0PS Permission Set. Custom objects get prefixes from a00 upward, custom metadata types from m00, platform events from e00, big objects from z00, assigned in creation order, so a custom prefix in a sandbox can differ from production. Resolve the object at runtime with Id.getSObjectType() rather than hardcoding a prefix. On Hyperforce, characters 4-6 carry a three-character server id (medium confidence; Winter '24 release-note snippet only).",
    },
    terms: [
      { term: 'key prefix', caveman: 'the first three letters of the name tag' },
      { term: 'getSObjectType', caveman: 'asking the tag what kind of rock it is' },
    ],
    misconceptions: [
      { id: 'custom-prefix-stable', summary: "Hardcodes a custom object's prefix, which differs between sandbox and production.", probe: "Your validation rule checks LEFT(Id, 3) = 'a0X' in a sandbox. Why might it silently do nothing in production?" },
      { id: 'prefix-is-in-name', summary: 'Believes the prefix is derived from the object name.', probe: 'Two orgs create the same custom object in different orders. Do they get the same prefix?' },
    ],
    probes: {
      why: ['Why do standard objects have stable prefixes but custom objects do not?'],
      what_if: ['What if two managed packages install custom objects in different orders in two orgs?'],
      predict: ['Predict the object type of an ID starting with 00Q, then 500, then a00.'],
    },
  }),
];
