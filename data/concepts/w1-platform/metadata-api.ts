// Concept subtree `metadata-api` (Day 10): retrieve/deploy with package.xml and the single-transaction deployment.
// Zip limits (10,000 files / 39 MB) are snippet-only (ambiguity 10) and labelled medium confidence.
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const METADATA_API_CONCEPTS = [
  defineConcept({
    slug: 'metadata-api',
    world,
    title: 'Metadata API and deployments',
    summary: {
      caveman: "Your hut's blueprint is a stack of paper; a courier carries the whole stack to another village in one trip, and every page arrives or none does.",
      technical: 'Retrieve and deploy of metadata as a zip with package.xml, the single-transaction nature of a deployment, and the sf CLI commands that wrap it.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'metadata-api.retrieve-deploy',
    world,
    title: 'Retrieve and deploy with package.xml',
    summary: {
      caveman: 'Write a list of the pages you want, hand it to the courier, and get a bundle back. Hand a bundle plus its list to the courier for the other village and the pages get copied in.',
      technical: 'The Metadata API moves metadata (schema, processes, presentation, authorization, configuration) as a zip file whose package.xml manifest lists components by type and name. A retrieve pulls the listed components out of an org; a deploy pushes a zip into one. A deployment may contain up to 10,000 files and 39 MB compressed (medium confidence; snippet only). You cannot write Apex directly in production: it must be deployed there.',
    },
    terms: [
      { term: 'Metadata API', caveman: 'the courier' },
      { term: 'package.xml', caveman: 'the list of pages' },
      { term: 'retrieve', caveman: 'asking for a bundle' },
      { term: 'deploy', caveman: 'sending a bundle' },
    ],
    misconceptions: [
      { id: 'metadata-is-schema-only', summary: 'Believes metadata means objects and fields, forgetting layouts, code, permissions and settings.', probe: 'Name five component types other than objects and fields that package.xml can list.' },
      { id: 'edit-in-production', summary: "Tries to write an Apex class in a production org's Developer Console.", probe: 'Why does production refuse to let you save an Apex class there?' },
    ],
    probes: {
      why: ['Why is metadata moved as a zip with a manifest rather than as individual API calls?'],
      what_breaks: ['What breaks when a manifest lists a component the source org does not have?'],
      explain_to_junior: ['Explain to a junior developer what package.xml is for.'],
    },
  }),

  defineConcept({
    slug: 'metadata-api.deploy-transaction',
    world,
    title: 'A deployment is one transaction',
    summary: {
      caveman: 'The courier delivers every page or none of them. One torn page and the whole bundle comes back, even the forty good ones.',
      technical: 'A metadata deployment is all-or-nothing: if any component fails to compile or validate (or, in production, the test gate fails), nothing is deployed. Compile on Deploy is always on in production and Full sandboxes. A successful deployment cannot be rolled back; you deploy a corrective change instead. Change sets share this behaviour (Day 11).',
    },
    terms: [
      { term: 'deployment', caveman: 'the courier trip' },
      { term: 'Compile on Deploy', caveman: 'the courier checking every page before handing it over' },
    ],
    misconceptions: [
      { id: 'partial-deploy', summary: 'Expects the 39 good components to land when one fails.', probe: 'A deploy of 40 components has one broken validation rule. How many of the other 39 land in the target org?' },
      { id: 'rollback-deploy', summary: 'Asks to roll back a successful deployment.', probe: 'How do you undo a deployment that succeeded?' },
    ],
    probes: {
      why: ['Why is a deployment atomic?'],
      predict: ['Predict the outcome of a 40-component deploy with one broken validation rule.'],
      what_would_you_change: ['What would you change so that one failing component does not block an urgent hotfix?'],
    },
  }),
];
