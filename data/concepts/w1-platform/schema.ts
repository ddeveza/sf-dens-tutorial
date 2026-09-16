// Concept subtree `schema` (Day 5): standard vs custom objects, field allocations and storage. Numbers come from
// the edition allocation pages and the per-object custom-field page (ambiguity 23: the per-object table wins).
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const SCHEMA_CONCEPTS = [
  defineConcept({
    slug: 'schema',
    world,
    title: 'Objects, fields and storage',
    summary: {
      caveman: 'The keeper hands each tribe labelled shelves; the tribe may add shelves, but each room has a maximum shelf count and a maximum pile of rocks.',
      technical: 'Standard vs custom objects and fields, per-object and per-org allocations by edition, and data and file storage.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'schema.custom-objects',
    world,
    title: 'Standard vs custom objects and their allocations',
    summary: {
      caveman: 'Some shelves come with the cave and have the same names in every room. Shelves a tribe builds itself get a small tattoo on the label so nobody confuses them with the standard ones, and each room has a cap on how many home-made shelves it may hold.',
      technical: 'Standard objects (Account, Contact, Case, ...) are Salesforce-owned; custom objects carry the __c suffix. Allocations by edition: Developer Edition 400 custom objects, Enterprise 200, Unlimited 2,000, with an org-wide cap of 3,000 (installed packages count). A custom object is a metadata row created in Setup or Schema Builder and is available in the API immediately.',
    },
    terms: [
      { term: 'custom object', caveman: 'a home-made shelf' },
      { term: 'standard object', caveman: 'a shelf that came with the cave' },
      { term: '__c', caveman: 'the tattoo on a home-made label' },
    ],
    misconceptions: [
      { id: 'unlimited-objects', summary: 'Believes the custom object count is bounded only by licence cost.', probe: 'An Enterprise org has 190 custom objects and installs a package with 20 more. What happens?' },
      { id: 'standard-is-editable', summary: 'Tries to delete or rename a standard object.', probe: 'Which parts of a standard object can you change, and which cannot?' },
    ],
    probes: {
      why: ['Why does Salesforce cap the number of custom objects per edition?'],
      what_breaks: ['What breaks when a package install pushes an org past its custom object cap?'],
      explain_without_jargon: ['Describe a standard shelf and a home-made shelf to a business user.'],
    },
  }),

  defineConcept({
    slug: 'schema.field-allocations',
    world,
    title: 'Custom field allocations',
    summary: {
      caveman: 'Each shelf can hold only so many labelled slots. Some fancy slots count as several: a map-pin slot counts as three, a full address slot counts as nine. Slots added by a bought-in kit count against your total too.',
      technical: 'Custom fields per object: Developer Edition 500, Enterprise 500, Unlimited 800; hard cap 900 on Account, Contact, Case, Lead, Opportunity and custom objects (800 on most other standard objects, 50 on PriceBookEntry per the per-object page). Installed package fields count. Geolocation fields count as 3, custom address fields as 9. Long and rich text areas: 131,072 characters max, 32,768 default, with a per-object total of 1,638,400 characters (medium confidence); list views show only the first 255 characters of long text.',
    },
    terms: [
      { term: 'custom field', caveman: 'a labelled slot on a shelf' },
      { term: 'field allocation', caveman: 'the slot cap per shelf' },
    ],
    misconceptions: [
      { id: 'package-fields-free', summary: 'Assumes AppExchange package fields do not count toward the per-object cap.', probe: 'Account has 480 custom fields and a package adds 450 more. Does the install succeed on Enterprise Edition?' },
      { id: 'one-field-one-slot', summary: 'Counts a geolocation or custom address field as one.', probe: 'How many of the 500 does one custom address field consume?' },
    ],
    probes: {
      why: ['Why does a custom address field count as nine?'],
      predict: ['Predict whether a 450-field package installs on an Account that already has 480 custom fields.'],
      what_would_you_change: ['What would you change about an Account with 400 throwaway fields and no data dictionary?'],
    },
  }),

  defineConcept({
    slug: 'schema.storage',
    world,
    title: 'Data and file storage',
    summary: {
      caveman: 'Every rock weighs about the same, and the room has a weight limit. Pictures and papers go in a separate room with its own limit.',
      technical: 'Most records consume about 2 KB of data storage regardless of field count (a few objects differ; see the record-size article). Developer Edition: 5 MB data and 20 MB file storage. Enterprise: 10 GB data plus 20 MB per user licence; file storage is tracked separately. Setup > Storage Usage shows consumption by object; exceeding data storage blocks inserts until space is freed or bought.',
    },
    terms: [
      { term: 'data storage', caveman: 'the weight limit of the rock room' },
      { term: 'file storage', caveman: 'the separate paper room' },
    ],
    misconceptions: [
      { id: 'storage-by-fields', summary: 'Estimates storage from the number of fields rather than the number of records.', probe: 'Does adding 100 fields to Account change how much storage one million Accounts consume?' },
      { id: 'files-are-data', summary: 'Counts attachments and files against data storage.', probe: 'Where do 50 GB of uploaded PDFs count?' },
    ],
    probes: {
      why: ['Why is record size roughly constant across objects?'],
      predict: ['Predict the data storage of one million records in a Developer Edition org, and what happens on insert.'],
      what_breaks: ['What breaks first when an org runs out of data storage?'],
    },
  }),
];
