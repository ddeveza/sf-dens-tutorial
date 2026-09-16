// Blog and community sources (tier 'other', priority 5): every `blog-*` row plus `sf-releases-page` from the
// ARCHITECTURE.md Sources table. Blog ids were `blog-<topic>`; the id regex requires the tier prefix, so they are
// `other-blog-<topic>` here (data/sources/aliases.ts maps the raw ids). The research table listed the Developers
// Blog rows (`blog-dev-summer26`, `blog-dev-spring26`, `blog-eng-soql-2013`) under tier developer; §C defines
// 'other' as blogs/community and an id must match its tier, so they live here at priority 5. The consequence is
// deliberate: an `other` source can never be the sole basis of a taught limit (integrity check 6).
import { defineSource } from '../../lib/sources/builders.ts';

const RESEARCH_DATE = '2026-09-04';
const fetched = (ok: boolean) =>
  ok ? ({ lastVerified: RESEARCH_DATE, status: 'verified', fetchedOk: true } as const) : ({ lastVerified: null, status: 'unverified', fetchedOk: false } as const);

export const OTHER_SOURCES = [
  defineSource({ id: 'other-blog-dev-summer26', title: "The Salesforce Developer's Guide to the Summer '26 Release (Developers Blog, June 8, 2026)", url: 'https://developer.salesforce.com/blogs/2026/06/the-salesforce-developers-guide-to-the-summer-26-release', tier: 'other', release: 'summer-26', apiVersion: '67.0', ...fetched(true) }),
  defineSource({ id: 'other-blog-dev-spring26', title: "The Salesforce Developer's Guide to the Spring '26 Release (Developers Blog)", url: 'https://developer.salesforce.com/blogs/2026/01/developers-guide-to-the-spring-26-release', tier: 'other', release: 'spring-26', apiVersion: '66.0', ...fetched(false) }),
  defineSource({ id: 'other-blog-admin-w27-countdown', title: "Admin Release Countdown: Get Ready for Winter '27 (Salesforce Admins blog, Aug 6, 2026)", url: 'https://admin.salesforce.com/blog/2026/admin-winter-27-release-countdown', tier: 'other', release: 'winter-27', ...fetched(true) }),
  defineSource({ id: 'other-blog-admin-profiles', title: "The Salesforce Admin's Guide to Profiles and Permissions (Salesforce Admins blog, Mar 16, 2026)", url: 'https://admin.salesforce.com/blog/2026/the-salesforce-admins-guide-to-profiles-and-permissions', tier: 'other', ...fetched(true) }),
  defineSource({ id: 'other-blog-sf-architect-s26', title: "Summer '26 Release Architect Highlights: Sharing, Security, and Agentic Integration (salesforce.com blog)", url: 'https://www.salesforce.com/blog/summer-26-release-architect-highlights/', tier: 'other', release: 'summer-26', apiVersion: '67.0', ...fetched(true) }),
  defineSource({ id: 'other-sf-releases-page', title: 'Salesforce Releases (salesforce.com)', url: 'https://www.salesforce.com/products/innovation/releases/', tier: 'other', release: 'winter-27', ...fetched(true) }),
  defineSource({ id: 'other-blog-admin-go-with-flow', title: "Go with the Flow: What's Happening with Workflow Rules and Process Builder? (Salesforce Admins blog; Winter '23 / Summer '23 cutoffs)", url: 'https://admin.salesforce.com/blog/2021/go-with-the-flow-whats-happening-with-workflow-rules-and-process-builder', tier: 'other', ...fetched(false) }),
  defineSource({ id: 'other-blog-eng-soql-2013', title: 'Maximizing the Performance of Force.com SOQL, Reports, and List Views (Developer Blog, 2013; historical)', url: 'https://developer.salesforce.com/blogs/engineering/2013/07/maximizing-the-performance-of-force-com-soql-reports-and-list-views', tier: 'other', ...fetched(false) }),
];
