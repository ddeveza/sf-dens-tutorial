// SOQL selectivity rules as documented for Summer '26 (API 67.0): "Best Practices for Deployments with Large Data
// Volumes" (Indexes / query optimizer), KB 000385213 "Improve Performance of SOQL Queries using a Custom Index",
// KB 000386021 "Lightning Platform query optimization FAQ" and KB 000386468 on the non-selective query error
// (source ids below, verified 2026-09-04). Numbers are copied from those pages; nothing in ARCHITECTURE.md is
// authoritative for them. Validated against SelectivityRuleSetSchema on import.
import { SelectivityRuleSetSchema } from '../../../lib/simulations/soql-selectivity/index.ts';
import type { SelectivityRules } from '../../../lib/simulations/soql-selectivity/index.ts';
import type { RuleSet } from '../../../lib/simulations/rule-set.ts';

const rules: SelectivityRules = {
  thresholds: {
    // Standard index: up to 30% of the first million rows plus 15% of the rows beyond, capped at 1,000,000.
    standard: { firstMillionPct: 30, beyondPct: 15, maxRows: 1_000_000 },
    // Custom index: up to 10% of the first million rows plus 5% of the rows beyond, capped at 333,000.
    custom: { firstMillionPct: 10, beyondPct: 5, maxRows: 333_000 },
  },
  // Operators the optimizer never treats as selective, even on an indexed field. Every entry applies to all field
  // kinds in this release; the `fieldKinds` scope exists for a release that documents a per-kind exception.
  nonSelectiveOperators: [
    { operator: 'neq' }, // !=
    { operator: 'notIn' }, // NOT IN
    { operator: 'notLike' }, // NOT LIKE
    { operator: 'likeLeadingWildcard' }, // LIKE '%text'
    { operator: 'includes' }, // multi-select picklist INCLUDES: multi-select picklists cannot be indexed
    { operator: 'excludes' }, // multi-select picklist EXCLUDES
  ],
  // Formula fields (non-deterministic ones cannot be indexed at all; deterministic ones only via Support) are the
  // one field kind the simulator models as non-indexable. Long/rich text, multi-select picklists and encrypted
  // fields are also non-indexable but are not separate `fieldKind` values in this release.
  nonIndexableFieldKinds: ['formula'],
  // Nulls are excluded from index tables by default; Support can build a custom index that includes them.
  customIndexIncludesNulls: false,
  notes: {
    customCap: 'The 333,000 custom-index cap is from KB 000385213 (kb-custom-index); the LDV guide states only the percentages and an older engineering blog says 333,333. Day 23 teaches the percentages as fact and the caps as medium confidence.',
    standardCap: 'The 1,000,000 standard-index cap is documented only in a 2013 engineering blog (blog-eng-soql-2013); the LDV guide states only the percentages.',
    nonSelectiveError: "Apex triggers on objects with more than 200,000 rows raise 'Non-selective query against large object type' when the query is not selective (kb-non-selective-error).",
    andOr: 'AND uses the best usable filter and applies the rest afterwards; OR needs every branch usable and the union within the tightest threshold (kb-query-opt-faq).',
    likeSampling: 'LIKE selectivity is estimated by sampling 100,000 rows (kb-query-opt-faq); the simulator takes matchingRows as given rather than emulating the sample.',
  },
};

const set: RuleSet<SelectivityRules> = {
  id: 'soql-selectivity@summer-26',
  simulation: 'soql-selectivity',
  release: 'summer-26',
  apiVersion: '67.0',
  sourceIds: ['dev-pdf-ldv', 'help-kb-custom-index', 'help-kb-query-opt-faq', 'help-kb-non-selective-error'],
  verification: {
    release: 'summer-26',
    apiVersion: '67.0',
    docVersion: "Summer '26 (API 67.0); LDV PDF updated July 22, 2026; KB articles as fetched 2026-09-04",
    lastVerified: '2026-09-04',
    status: 'verified',
  },
  rules,
};

SelectivityRuleSetSchema.parse(set);

export const summer26 = set;
