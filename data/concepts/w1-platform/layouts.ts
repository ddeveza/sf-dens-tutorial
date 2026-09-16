// Concept subtree `layouts` (Day 9): record types, page layouts and Lightning record pages. The recurring lesson:
// none of them is a security mechanism (Day 27 deepens field access).
import { defineConcept } from '../../../lib/curriculum/builders.ts';
import { W1_PLATFORM } from '../../curriculum/worlds.ts';

const world = W1_PLATFORM;

export const LAYOUTS_CONCEPTS = [
  defineConcept({
    slug: 'layouts',
    world,
    title: 'Record types, layouts and pages',
    summary: {
      caveman: 'The same shelf can wear different labels for different tribes, and the room around it can be arranged differently, but the shelf is one shelf.',
      technical: 'Record types, page layouts and Lightning record pages: which one controls what a user sees, and why none of them controls what a user can access.',
    },
    terms: [],
    misconceptions: [],
    probes: {},
  }),

  defineConcept({
    slug: 'layouts.record-types',
    world,
    title: 'Record types',
    summary: {
      caveman: 'Same shelf, different labels for different tribes: hunters see hunting slots, farmers see farming slots, and each tribe gets its own list of allowed choices. But the shelf is one shelf, and anyone allowed in the room can still walk past it.',
      technical: "A record type bundles a business process, a picklist-value subset and a page layout assignment for an object. Record types are assigned through profiles, permission sets or permission set groups; a user's default record type is set only at the profile level. Assignment governs which types a user can create and select, not which records they can view: a user with no Support record type assigned can still open a Support Case that is shared with them (rendered through the Master or their assigned layout). The Master record type applies when no custom record type exists.",
    },
    terms: [
      { term: 'record type', caveman: 'the tribe-specific label set for one shelf' },
      { term: 'Master record type', caveman: 'the plain label used when no tribe label exists' },
    ],
    misconceptions: [
      { id: 'record-type-restricts-view', summary: 'Believes record-type assignment restricts read access to records of that type.', probe: 'A user has no Case record-type assignment and a Support Case is shared with them. Can they open it?' },
      { id: 'default-via-permset', summary: "Tries to set a user's default record type through a permission set.", probe: "Where is a user's default record type configured?" },
      { id: 'clone-layouts-per-team', summary: 'Clones page layouts per team instead of using record types.', probe: 'What do you lose when two teams need different picklist values but share one record type?' },
    ],
    probes: {
      why: ['Why is the default record type only a profile setting?'],
      what_if: ['What if a picklist value is missing for one team but present for another?'],
      what_breaks: ['What breaks when record types are used as a security mechanism?'],
      predict: ['Predict what a user sees when they open a record whose record type they are not assigned.'],
    },
  }),

  defineConcept({
    slug: 'layouts.page-layouts',
    world,
    title: 'Page layouts and layout assignment',
    summary: {
      caveman: 'The arrangement of slots on a shelf, which ones must be filled and which are read-only, chosen by who you are and which label set the shelf wears.',
      technical: 'A page layout defines the fields, sections, related lists, buttons and actions on a record page and marks fields required or read-only on that layout. The layout a user gets is selected by (profile, record type). Field-level security still decides whether a field is visible at all (Day 27). Layouts remain the source of related lists, actions and required/read-only settings even on Lightning record pages unless Dynamic Forms replaces the Record Detail component.',
    },
    terms: [
      { term: 'page layout', caveman: 'the slot arrangement on a shelf' },
      { term: 'layout assignment', caveman: 'which arrangement each tribe gets' },
    ],
    misconceptions: [
      { id: 'layout-is-security', summary: 'Uses page layouts to hide sensitive fields.', probe: 'A field is removed from the layout: can the user still see it in reports or through the API?' },
      { id: 'layout-per-user', summary: 'Expects to assign a layout per user rather than per profile and record type.', probe: 'What are the two keys that select a page layout?' },
    ],
    probes: {
      why: ['Why does the layout not control field visibility for reports and the API?'],
      what_breaks: ['What breaks when a field that is required on the layout is missing from an API insert?'],
      explain_to_junior: ['Explain to a junior admin why hiding a field on the layout is not securing it.'],
    },
  }),

  defineConcept({
    slug: 'layouts.lightning-pages',
    world,
    title: 'Lightning record pages and activation',
    summary: {
      caveman: 'The room around the shelf: which walls hold which boards. There is a default room for everyone, a room per workspace, and a room per workspace-and-tribe-and-label, and the most specific one wins.',
      technical: 'Lightning App Builder composes record pages from components; the Record Detail component renders the assigned page layout unless upgraded to Dynamic Forms (fields placed directly on the page). Activation decides which page a user sees: org default, app default, or app + record type + profile, most specific wins. Use the page layout editor for related lists, actions and required/read-only; use App Builder for component placement and visibility rules.',
    },
    terms: [
      { term: 'Lightning record page', caveman: 'the room around the shelf' },
      { term: 'page activation', caveman: 'which room each tribe is sent to' },
      { term: 'Dynamic Forms', caveman: 'pinning slots straight onto the room walls' },
    ],
    misconceptions: [
      { id: 'app-builder-replaces-layouts', summary: 'Believes Lightning pages make page layouts irrelevant.', probe: 'Which still owns related lists and required fields when a record page is active?' },
      { id: 'activation-is-global', summary: 'Activates a page as the org default and is surprised that other apps show it too.', probe: 'Order the three activation scopes from broadest to narrowest.' },
    ],
    probes: {
      why: ['Why keep page layouts at all once Lightning pages exist?'],
      predict: ['Predict which page a user sees when an org default and an app + record type + profile activation both apply.'],
      what_would_you_change: ['What would you change when five "wrong page" tickets arrive after a new record page was activated?'],
    },
  }),
];
