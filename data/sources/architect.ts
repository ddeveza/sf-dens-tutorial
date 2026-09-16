// Salesforce Architects sources (tier 'architect', priority 3): every `arch-*` row of the ARCHITECTURE.md Sources
// table, all read on 2026-09-04. `arch-wa-secure` came through a summarizing fetch (quotes may not be verbatim and
// its Apex anti-pattern text predates the 67.0 user-mode default; ambiguity 24), which is why its title says so.
import { defineSource } from '../../lib/sources/builders.ts';

const RESEARCH_DATE = '2026-09-04';
const verified = { lastVerified: RESEARCH_DATE, status: 'verified', fetchedOk: true } as const;

export const ARCHITECT_SOURCES = [
  defineSource({ id: 'arch-multitenant', title: 'Platform Multitenant Architecture (Salesforce Architects)', url: 'https://architect.salesforce.com/fundamentals/platform-multitenant-architecture', tier: 'architect', ...verified }),
  defineSource({ id: 'arch-record-triggered', title: 'Record-Triggered Automation (Platform Decision Guide, Salesforce Architects)', url: 'https://architect.salesforce.com/docs/architect/decision-guides/guide/record-triggered', tier: 'architect', ...verified }),
  defineSource({ id: 'arch-well-architected', title: 'Salesforce Well-Architected: Overview', url: 'https://architect.salesforce.com/well-architected/overview', tier: 'architect', ...verified }),
  defineSource({ id: 'arch-wa-secure', title: 'Salesforce Well-Architected: Secure (Trusted pillar; obtained via a summarizing fetch, quotes not verbatim)', url: 'https://architect.salesforce.com/docs/architect/well-architected/guide/secure', tier: 'architect', ...verified }),
];
