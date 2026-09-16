// The ARCHITECTURE.md research tables (First 30 Days rows, Sources table) cite sources by their raw research ids
// (`kb-*`, `pdf-*`, `blog-*`, `trust-*`, `sf-releases-page`). The SourceSchema id regex requires the tier prefix
// (`^(help|dev|arch|rn|other)-`), so those rows were renamed on the way into data/sources/*.ts. This map lets a
// lesson author (or a rule-set file) paste an ARCHITECTURE id and resolve it; ids that were already canonical pass
// through resolveSourceId unchanged. The map is exhaustive for the renamed rows and tested by curriculum.test.ts.
export const RAW_ID_ALIASES: Readonly<Record<string, string>> = {
  // kb-* -> help-kb-* (Salesforce Help knowledge articles, tier help)
  'kb-id-15-18': 'help-kb-id-15-18',
  'kb-key-prefix': 'help-kb-key-prefix',
  'kb-prefix-lookup': 'help-kb-prefix-lookup',
  'kb-relationship-limit': 'help-kb-relationship-limit',
  'kb-md-conversion': 'help-kb-md-conversion',
  'kb-formula-size': 'help-kb-formula-size',
  'kb-spanning-15': 'help-kb-spanning-15',
  'kb-rollup-limit': 'help-kb-rollup-limit',
  'kb-sandbox-preview': 'help-kb-sandbox-preview',
  'kb-release-schedule': 'help-kb-release-schedule',
  'kb-soap-login-retirement': 'help-kb-soap-login-retirement',
  'kb-active-retirements': 'help-kb-active-retirements',
  'kb-past-retirements': 'help-kb-past-retirements',
  'kb-non-selective-remedy': 'help-kb-non-selective-remedy',
  'kb-non-selective-error': 'help-kb-non-selective-error',
  'kb-custom-index': 'help-kb-custom-index',
  'kb-external-id-index': 'help-kb-external-id-index',
  'kb-query-opt-faq': 'help-kb-query-opt-faq',
  'kb-query-plan': 'help-kb-query-plan',
  'kb-record-size': 'help-kb-record-size',
  'kb-unable-to-lock': 'help-kb-unable-to-lock',
  'kb-prevent-lock': 'help-kb-prevent-lock',
  'kb-import-automation': 'help-kb-import-automation',
  'kb-import-wizard': 'help-kb-import-wizard',
  'kb-wfr-pb-eos': 'help-kb-wfr-pb-eos',
  'kb-profile-retirement-cancelled': 'help-kb-profile-retirement-cancelled',
  // pdf-* -> dev-pdf-* (developer-doc PDFs on resources.docs.salesforce.com, tier developer)
  'pdf-soql-sosl': 'dev-pdf-soql-sosl',
  'pdf-apex-guide': 'dev-pdf-apex-guide',
  'pdf-limits-quickref': 'dev-pdf-limits-quickref',
  'pdf-ldv': 'dev-pdf-ldv',
  'pdf-data-loader': 'dev-pdf-data-loader',
  'pdf-draes': 'dev-pdf-draes',
  // blog-* -> other-blog-* (blogs are tier other per §C)
  'blog-dev-summer26': 'other-blog-dev-summer26',
  'blog-dev-spring26': 'other-blog-dev-spring26',
  'blog-admin-w27-countdown': 'other-blog-admin-w27-countdown',
  'blog-admin-profiles': 'other-blog-admin-profiles',
  'blog-sf-architect-s26': 'other-blog-sf-architect-s26',
  'blog-admin-go-with-flow': 'other-blog-admin-go-with-flow',
  'blog-eng-soql-2013': 'other-blog-eng-soql-2013',
  // trust-* -> rn-trust-* (Trust pages share the trust_release tier with release notes)
  'trust-home': 'rn-trust-home',
  'trust-maintenances': 'rn-trust-maintenances',
  // no prefix at all in the research table
  'sf-releases-page': 'other-sf-releases-page',
};

/** Canonical source id for a raw ARCHITECTURE.md id; canonical ids pass through unchanged. */
export function resolveSourceId(raw: string): string {
  return RAW_ID_ALIASES[raw] ?? raw;
}

/** True when `raw` is one of the renamed research ids (useful for lint messages that suggest the canonical id). */
export function isRawSourceId(raw: string): boolean {
  return Object.hasOwn(RAW_ID_ALIASES, raw);
}
