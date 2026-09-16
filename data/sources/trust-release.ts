// Trust and release-note sources (tier 'trust_release', priority 4): every `rn-*` and `trust-*` row of the
// ARCHITECTURE.md Sources table. Trust ids were `trust-<topic>` in the research table; the id regex requires the
// tier prefix, so they are `rn-trust-<topic>` here (data/sources/aliases.ts maps the raw ids). Release-notes pages
// on help.salesforce.com are JS shells to automated fetch: `fetchedOk: true` rows were read in a browser session on
// 2026-09-04. `rn-w26-home` is not in the research table: data/releases.ts needs a notes source for Winter '26 and
// nobody has opened that page yet, so it is recorded `unverified` (never cite it from a verified lesson).
import { defineSource } from '../../lib/sources/builders.ts';

const RESEARCH_DATE = '2026-09-04';
const fetched = (ok: boolean) =>
  ok ? ({ lastVerified: RESEARCH_DATE, status: 'verified', fetchedOk: true } as const) : ({ lastVerified: null, status: 'unverified', fetchedOk: false } as const);

const RN = 'https://help.salesforce.com/s/articleView?id=release-notes.';
const W27 = { release: 'winter-27', apiVersion: '68.0' } as const;
const S26 = { release: 'summer-26', apiVersion: '67.0' } as const;

export const TRUST_RELEASE_SOURCES = [
  defineSource({ id: 'rn-hyperforce-id', title: "Salesforce Object ID Is Refined to Use Three Characters (Winter '24 release note)", url: `${RN}rn_hyperforce_object_id.htm&language=en_US&release=246&type=5`, tier: 'trust_release', release: 'winter-24', ...fetched(false) }),
  defineSource({ id: 'rn-w27-home', title: "Salesforce Winter '27 Release Notes (home, release=264)", url: `${RN}salesforce_release_notes.htm&release=264&type=5`, tier: 'trust_release', ...W27, ...fetched(true) }),
  defineSource({ id: 'rn-w27-api', title: "Winter '27 Release Notes: API", url: `${RN}rn_api.htm&release=264&type=5`, tier: 'trust_release', ...W27, ...fetched(true) }),
  defineSource({ id: 'rn-w27-apex', title: "Winter '27 Release Notes: Apex", url: `${RN}rn_apex.htm&release=264&type=5`, tier: 'trust_release', ...W27, ...fetched(true) }),
  defineSource({ id: 'rn-w27-ru', title: "Winter '27 Release Notes: Release Updates", url: `${RN}rn_ru.htm&release=264&type=5`, tier: 'trust_release', release: 'winter-27', ...fetched(true) }),
  defineSource({ id: 'rn-w27-profile-filtering', title: "Enable Profile Filtering (Release Update), Winter '27 Release Notes", url: `${RN}rn_permissions_profile_filtering_enforced.htm&release=264&type=5`, tier: 'trust_release', release: 'winter-27', ...fetched(true) }),
  defineSource({ id: 'rn-s26-apex', title: "Summer '26 Release Notes: Apex", url: `${RN}rn_apex.htm&release=262&type=5`, tier: 'trust_release', ...S26, ...fetched(true) }),
  defineSource({ id: 'rn-s26-user-mode', title: "Summer '26: Database Operations Run in User Mode by Default, Not System Mode", url: `${RN}rn_apex_default_user_mode.htm&release=262&type=5`, tier: 'trust_release', ...S26, ...fetched(true) }),
  defineSource({ id: 'rn-s26-sharing-default', title: "Summer '26: Apex Classes Enforce Sharing Rules by Default", url: `${RN}rn_apex_default_enforce_sharing.htm&release=262&type=5`, tier: 'trust_release', ...S26, ...fetched(true) }),
  defineSource({ id: 'rn-s26-trigger-sharing', title: "Summer '26: Apex Triggers Always Run in a 'without sharing' Context", url: `${RN}rn_apex_triggers_system_mode.htm&release=262&type=5`, tier: 'trust_release', ...S26, ...fetched(true) }),
  defineSource({ id: 'rn-s26-lwc-67', title: "Get the Latest LWC Changes with LWC API Version 67.0 (Summer '26 release notes)", url: `${RN}rn_lwc_versioning.htm&language=en_US&release=262&type=5`, tier: 'trust_release', ...S26, ...fetched(false) }),
  defineSource({ id: 'rn-sp26-apex', title: "Spring '26 Release Notes: Apex", url: `${RN}rn_apex.htm&release=260&type=5`, tier: 'trust_release', release: 'spring-26', apiVersion: '66.0', ...fetched(true) }),
  defineSource({ id: 'rn-w26-home', title: "Salesforce Winter '26 Release Notes (home, release=258; not yet opened, recorded for data/releases.ts)", url: `${RN}salesforce_release_notes.htm&release=258&type=5`, tier: 'trust_release', release: 'winter-26', apiVersion: '65.0', ...fetched(false) }),
  defineSource({ id: 'rn-trust-home', title: 'Salesforce Trust (trust.salesforce.com; landing page only)', url: 'https://trust.salesforce.com/en/', tier: 'trust_release', ...fetched(true) }),
  defineSource({ id: 'rn-trust-maintenances', title: 'Salesforce Trust Status: Maintenances (JS app; not readable by automated fetch)', url: 'https://status.salesforce.com/products/all/maintenances', tier: 'trust_release', ...fetched(false) }),
  defineSource({ id: 'rn-view-all-rename', title: "The View All and Modify All Object Permissions Have New Names (release notes, release=254; Spring '25 inferred from the numbering)", url: `${RN}rn_permissions_rename.htm&release=254&type=5`, tier: 'trust_release', release: 'spring-25', ...fetched(true) }),
];
