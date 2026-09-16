// Concept subtree `platform` (Days 1 and 3 of the First 30 Days outline): the multitenant machine, kernel vs
// metadata vs data, releases, API versions, Trust and why limits exist. One file per subtree root; the root is a
// parent (never an exercise concept) and every leaf carries misconceptions and probe templates for the engine.
// Caveman text contains no term from lib/curriculum/jargon.ts and none of the concept's own terms (curriculum.test.ts).
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const PLATFORM_CONCEPTS = [
  defineConcept({
    slug: 'platform',
    world,
    title: 'The platform itself',
    summary: {
      caveman: 'One shared machine that many businesses use at once, each seeing only its own things.',
      technical: 'The multitenant Lightning Platform: a shared kernel, per-tenant metadata and data, three releases a year, and limits that keep tenants from starving each other.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'platform.multitenancy',
    world,
    title: 'Multitenancy: one kernel, many orgs',
    summary: {
      caveman: 'Many tribes share one giant cave. Each tribe gets its own wall of shelves and cannot see the other walls, but the cave, the fire and the keeper are shared by everyone.',
      technical: 'Every org runs on the same shared kernel and the same physical database schema; each row carries the OrgID and every query is scoped by it. There is no per-customer database and no per-customer code deployment, which is what makes upgrading everyone three times a year possible and why per-transaction limits exist.',
    },
    terms: [
      { term: 'multitenancy', caveman: 'many tribes, one cave' },
      { term: 'kernel', caveman: 'the shared cave' },
      { term: 'OrgID', caveman: 'the tribe mark on every rock' },
    ],
    misconceptions: [
      { id: 'private-database', summary: 'Believes each org is its own database server that could be tuned, patched or opted out of upgrades independently.', probe: 'If your org were a private server, what could you do to it that you in fact cannot?' },
      { id: 'custom-object-is-table', summary: 'Believes creating a custom object runs CREATE TABLE in the underlying database.', probe: 'What actually gets written when you click Save on a new custom object?' },
      { id: 'limits-are-punishment', summary: 'Believes governor limits exist to sell bigger editions rather than to protect shared resources.', probe: 'Whose work would suffer if your transaction had no CPU ceiling?' },
    ],
    probes: {
      why: ['Why can Salesforce upgrade every customer in one weekend when a typical software vendor cannot?'],
      what_if: ['What if one tenant ran a query that scanned a billion rows with no limit?'],
      what_breaks: ['What breaks in a shared-kernel design if tenant data were not tagged on every row?'],
      explain_to_junior: ['Explain to a new developer why they cannot get SSH access to "their" database.'],
    },
  }),

  defineConcept({
    slug: 'platform.metadata-vs-data',
    world,
    title: 'Kernel, metadata and data',
    summary: {
      caveman: "The cave keeper owns the walls. Each tribe draws its shelf plan on its wall, then piles rocks on those shelves. The plan and the rocks are both just marks in the keeper's ledger.",
      technical: 'Three layers: the kernel (Salesforce-owned runtime and schema, identical for everyone), tenant metadata (your objects, fields, layouts, code, stored as rows in system tables) and tenant data (your records, stored in shared generic tables and interpreted through your metadata at runtime). A custom object or field is a metadata row, not DDL; the runtime compiles your metadata into the queries it executes.',
    },
    terms: [
      { term: 'metadata', caveman: 'the shelf plan' },
      { term: 'kernel', caveman: 'the cave keeper and the walls' },
    ],
    misconceptions: [
      { id: 'ddl-on-save', summary: 'Thinks adding a field alters a physical table and therefore expects table locks or downtime.', probe: 'Why can you add a field to an object holding 50 million records in seconds?' },
      { id: 'code-is-not-metadata', summary: 'Treats Apex classes and layouts as "code" distinct from "metadata", so they are left out of deployments.', probe: 'Name three things you would forget to deploy if you believed only objects and fields were metadata.' },
    ],
    probes: {
      why: ['Why is a custom object described as a row and not a table?'],
      what_breaks: ['What breaks in an integration that assumes a field name maps to a physical column?'],
      predict: ['Predict what Setup shows one second after you save a new custom field on an object with 50 million records.'],
      explain_without_jargon: ['Describe the difference between the shelf plan and the rocks without using the words metadata or data.'],
    },
  }),

  defineConcept({
    slug: 'platform.releases',
    world,
    title: 'Three releases a year',
    summary: {
      caveman: 'Every hut gets the new roof the same season, whether the family asked for it or not. The calendar on the village wall says which week yours is next, and the roofer always tests your old furniture under the new roof first.',
      technical: "Salesforce ships three releases a year (Spring, Summer, Winter; roughly February, June and October) to every org automatically with zero downtime; impacting changes arrive off by default behind Release Updates in Setup. Before each release Salesforce reruns customers' Apex unit tests against the new version (the Hammer runs), one reason meaningful assertions matter. Ladder: Winter '26 = API 65.0, Spring '26 = 66.0, Summer '26 = 67.0 (current on most production orgs in September 2026), Winter '27 = 68.0 (medium confidence; rolling to production September-October 2026).",
    },
    terms: [
      { term: 'release', caveman: 'the new roof' },
      { term: 'Release Updates', caveman: "the roofer's checklist of changes you must switch on yourself" },
    ],
    misconceptions: [
      { id: 'opt-out', summary: 'Believes an org can defer or skip a release.', probe: 'What is the only way to see a release later than your neighbours, and how much later?' },
      { id: 'release-equals-api', summary: "Confuses the org's release with the API version a class or integration is pinned to.", probe: "Your org is on Winter '27 and a class is saved at API 58.0: which behaviours does that class get?" },
      { id: 'features-on-by-default', summary: 'Expects every new feature to be active the Monday after the upgrade.', probe: 'Where do you look for behaviour changes that are waiting for you to enable them?' },
    ],
    probes: {
      why: ['Why does Salesforce rerun your unit tests before a release lands?'],
      what_if: ['What if a release changed a default and your tests had no assertions?'],
      predict: ['Predict which API version a Developer Edition org signed up today reports in its docs and in Setup.'],
      what_would_you_change: ["What would you change in a team's calendar once you know the release dates?"],
    },
  }),

  defineConcept({
    slug: 'platform.api-versions',
    world,
    title: 'API versions and retirements',
    summary: {
      caveman: 'Every tool in the hut is stamped with the year it was made. The keeper keeps old tools working for a long time, but one day announces the oldest stamps will stop being honoured, and posts the date on the wall years ahead.',
      technical: "Each release introduces a new API version (Summer '26 = 67.0, Winter '27 = 68.0); Apex classes, triggers, flows and integrations are saved at a version and keep that version's behaviour until you change it. Old versions retire on a published schedule: SOAP API login() for versions 31.0-64.0 retires in Summer '27, API versions 31.0-40.0 in Summer '28 (Active Retirements article), standard-volume platform events in Winter '27. The docs version picker defaults to \"Winter '27 (API version 68.0) - Latest\", so a value read there may not apply yet to a Summer '26 org.",
    },
    terms: [
      { term: 'API version', caveman: 'the year stamp on a tool' },
      { term: 'retirement', caveman: 'the day an old stamp stops being honoured' },
    ],
    misconceptions: [
      { id: 'latest-docs-apply', summary: 'Quotes "Latest" documentation values to an org still on the previous release.', probe: 'How do you find out which release your instance is on before quoting a limit?' },
      { id: 'old-integrations-forever', summary: 'Assumes an integration pinned to API 31.0 keeps working indefinitely.', probe: 'Where is the retirement calendar, and what does the SOAP login() retirement mean for a twelve-year-old integration?' },
    ],
    probes: {
      why: ['Why does Salesforce version behaviour per class rather than per org?'],
      what_breaks: ['What breaks on the Monday after a retirement for an integration nobody has touched in years?'],
      explain_to_junior: ['Explain to a junior developer why saving a class at the newest API version is not automatically safe.'],
    },
  }),

  defineConcept({
    slug: 'platform.trust-and-instances',
    world,
    title: 'Your instance, Trust and maintenance windows',
    summary: {
      caveman: 'Your hut stands in one named village. The village notice board says whether the water is running today and which nights the roads will be closed for work, months ahead.',
      technical: 'Every org lives on a named instance (Setup > Company Information; the My Domain page also shows it). status.salesforce.com (Trust) publishes each instance\'s health, current release and maintenance, with maintenance posted up to 12 months ahead. Release upgrades are automatic and zero-downtime; other maintenance may have windows. Trust and Company Information, not the docs, are the authority on which release your instance runs.',
    },
    terms: [
      { term: 'instance', caveman: 'the named village your hut stands in' },
      { term: 'Trust', caveman: 'the village notice board' },
    ],
    misconceptions: [
      { id: 'docs-say-release', summary: "Looks up the org's release in documentation instead of on Trust or Company Information.", probe: 'Two orgs of the same company: could they be on different releases in the same week? Where would you check?' },
      { id: 'maintenance-is-surprise', summary: 'Treats maintenance windows as unpredictable outages.', probe: 'How far ahead is maintenance published, and where?' },
    ],
    probes: {
      why: ['Why might your sandbox and production report different releases in September?'],
      what_if: ['What if you scheduled a big data load during an announced maintenance window?'],
      predict: ["Predict what Setup > Company Information shows on the Monday after your instance's upgrade weekend."],
    },
  }),

  defineConcept({
    slug: 'platform.why-limits',
    world,
    title: 'Why limits must exist',
    summary: {
      caveman: 'One campfire, many tribes: every tribe gets the same number of logs per night. Toss on one too many and the fire keeper pulls your pot off the fire mid-cook, no arguing, so the other tribes still get to eat.',
      technical: "Because the kernel, database and CPU are shared, one tenant's runaway transaction would degrade every other tenant on the instance. Governor limits are per-transaction ceilings (SOQL queries, DML statements, CPU time, heap and more) enforced by the runtime; exceeding one throws an uncatchable LimitException that rolls the transaction back. The numbers are release-dependent and documented in the Apex guide and the Limits Quick Reference; Day 15 teaches the table itself.",
    },
    terms: [
      { term: 'governor limit', caveman: 'the number of logs each tribe gets' },
      { term: 'LimitException', caveman: 'the fire keeper pulling your pot off the fire' },
    ],
    misconceptions: [
      { id: 'limits-are-per-org', summary: 'Believes limits are per org per day rather than per transaction (most are per transaction; a few org-wide 24-hour allocations exist for asynchronous work).', probe: 'If ten users each run the same page at once, do they share one SOQL query budget?' },
      { id: 'catch-limit-exception', summary: 'Believes a try/catch can recover from a governor limit.', probe: 'What happens to the transaction when a limit is hit inside a try block?' },
    ],
    probes: {
      why: ['Why are limits enforced per transaction instead of per user per day?'],
      what_breaks: ['What breaks for other customers on your instance if limits did not exist?'],
      what_would_you_change: ['What would you change in a design that issues a SOQL query inside a loop?'],
    },
  }),
];
