// SOQL Selectivity Simulator (ARCHITECTURE.md, Simulations > SOQL Selectivity Simulator). Pure: plain objects in
// and out, no IO, no env, no clock. The engine reports a verdict (index vs full scan) and per-filter reasons; it
// deliberately does not imitate the Query Plan tool's cost numbers. Thresholds, the non-selective operator list, the
// non-indexable field kinds and the null-index behaviour come from the RuleSet the page passes
// (data/simulations/soql-selectivity/<release>.ts).
import { z } from 'zod';
import { SIM_CONFIG } from '../config.ts';
import type { RuleSet } from '../rule-set.ts';
import { ruleSetSchema } from '../rule-set-schema.ts';

export const SELECTIVITY_OPERATORS = ['eq', 'neq', 'in', 'notIn', 'like', 'likeLeadingWildcard', 'notLike', 'includes', 'excludes', 'gt', 'lt', 'isNull'] as const;
export type SelectivityOperator = (typeof SELECTIVITY_OPERATORS)[number];

export const INDEX_KINDS = ['standard', 'custom', 'none'] as const;
export type IndexKind = (typeof INDEX_KINDS)[number];
// Index kinds that carry a threshold row in the rule set.
export const INDEXED_KINDS = ['standard', 'custom'] as const;
export type IndexedKind = (typeof INDEXED_KINDS)[number];

export const FIELD_KINDS = ['text', 'numberOrDate', 'formula', 'picklist', 'lookup'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const COMBINATORS = ['AND', 'OR'] as const;
export type Combinator = (typeof COMBINATORS)[number];

// Emitted in this order, deduplicated.
export const SELECTIVITY_SUGGESTIONS = ['add_custom_index', 'replace_negative_operator', 'add_selective_leading_filter', 'avoid_formula_filter', 'reduce_scope'] as const;
export type SelectivitySuggestion = (typeof SELECTIVITY_SUGGESTIONS)[number];

// The breakpoint that `firstMillionPct` / `beyondPct` are defined against. It is part of the rule's definition
// (the field names say "first million"), not a tunable, so it lives here rather than in the rule set.
export const FIRST_MILLION_ROWS = 1_000_000;

export interface SelectivityFilter {
  id: string;
  field: string;
  operator: SelectivityOperator;
  index: IndexKind;
  matchingRows: number; // rows this filter alone matches
  fieldKind: FieldKind;
}

export interface SelectivityInput {
  totalRows: number;
  filters: SelectivityFilter[];
  combinator: Combinator;
}

export interface SelectivityThreshold {
  firstMillionPct: number; // percent of the first million rows
  beyondPct: number; // percent of rows above the first million
  maxRows: number; // absolute cap
}

export interface SelectivityRules {
  thresholds: Record<IndexedKind, SelectivityThreshold>;
  nonSelectiveOperators: Array<{ operator: SelectivityOperator; fieldKinds?: FieldKind[] }>; // fieldKinds absent => always
  nonIndexableFieldKinds: FieldKind[];
  customIndexIncludesNulls: boolean; // isNull on a custom index is usable only when true
  notes?: Record<string, string>; // provenance / verify-before-teaching notes, never read by the engine
}

export interface SelectivityFilterVerdict {
  id: string;
  usable: boolean; // this filter alone could drive an index
  threshold: number; // rows the filter's index may return and still be used; 0 without an index
  matchingRows: number;
  reason: string;
}

export interface SelectivityResult {
  selective: boolean;
  plan: 'index' | 'fullScan';
  perFilter: SelectivityFilterVerdict[]; // input order
  suggestions: SelectivitySuggestion[]; // empty when selective
}

// ---------- schemas ----------

const ThresholdSchema = z
  .object({
    firstMillionPct: z.number().min(0).max(100),
    beyondPct: z.number().min(0).max(100),
    maxRows: z.number().int().positive(),
  })
  .strict();

export const SelectivityRulesSchema = z
  .object({
    thresholds: z.object({ standard: ThresholdSchema, custom: ThresholdSchema }).strict(),
    nonSelectiveOperators: z.array(z.object({ operator: z.enum(SELECTIVITY_OPERATORS), fieldKinds: z.array(z.enum(FIELD_KINDS)).min(1).optional() }).strict()),
    nonIndexableFieldKinds: z.array(z.enum(FIELD_KINDS)),
    customIndexIncludesNulls: z.boolean(),
    notes: z.record(z.string(), z.string().min(1)).optional(),
  })
  .strict();

export const SelectivityRuleSetSchema = ruleSetSchema('soql-selectivity', SelectivityRulesSchema);

export const SelectivityFilterSchema = z
  .object({
    id: z.string().min(1),
    field: z.string().min(1),
    operator: z.enum(SELECTIVITY_OPERATORS),
    index: z.enum(INDEX_KINDS),
    matchingRows: z.number().int().nonnegative(),
    fieldKind: z.enum(FIELD_KINDS),
  })
  .strict();

export const SelectivityInputSchema = z
  .object({
    totalRows: z.number().int().min(SIM_CONFIG.selectivity.minRows).max(SIM_CONFIG.selectivity.maxRows),
    filters: z.array(SelectivityFilterSchema).min(1).max(SIM_CONFIG.selectivity.maxFilters),
    combinator: z.enum(COMBINATORS),
  })
  .strict()
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.filters.forEach((filter, index) => {
      if (seen.has(filter.id)) ctx.addIssue({ code: 'custom', message: `duplicate filter id '${filter.id}'`, path: ['filters', index, 'id'] });
      seen.add(filter.id);
      if (filter.matchingRows > input.totalRows) {
        ctx.addIssue({ code: 'custom', message: 'matchingRows cannot exceed totalRows', path: ['filters', index, 'matchingRows'] });
      }
    });
  });

// ---------- threshold ----------

// min(firstMillionPct% of min(totalRows, 1M) + beyondPct% of rows above 1M, maxRows), floored to whole rows.
export function selectivityThreshold(totalRows: number, threshold: SelectivityThreshold): number {
  const firstMillion = Math.min(totalRows, FIRST_MILLION_ROWS);
  const beyond = Math.max(totalRows - FIRST_MILLION_ROWS, 0);
  const byPercent = (firstMillion * threshold.firstMillionPct) / 100 + (beyond * threshold.beyondPct) / 100;
  return Math.floor(Math.min(byPercent, threshold.maxRows));
}

// ---------- wording ----------

const OPERATOR_LABEL: Record<SelectivityOperator, string> = {
  eq: '=',
  neq: '!=',
  in: 'IN',
  notIn: 'NOT IN',
  like: "LIKE 'x%'",
  likeLeadingWildcard: "LIKE '%x'",
  notLike: 'NOT LIKE',
  includes: 'INCLUDES',
  excludes: 'EXCLUDES',
  gt: '>',
  lt: '<',
  isNull: '= null',
};

const FIELD_KIND_LABEL: Record<FieldKind, string> = {
  text: 'Text',
  numberOrDate: 'Number/date',
  formula: 'Formula',
  picklist: 'Picklist',
  lookup: 'Lookup',
};

// Fixed en-US style grouping so reasons (and goldens) do not depend on the runtime locale.
function fmt(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---------- engine ----------

interface FilterAssessment {
  verdict: SelectivityFilterVerdict;
  suggestion?: SelectivitySuggestion;
}

function assessFilter(filter: SelectivityFilter, totalRows: number, rules: SelectivityRules): FilterAssessment {
  const threshold = filter.index === 'none' ? 0 : selectivityThreshold(totalRows, rules.thresholds[filter.index]);
  const verdictWith = (usable: boolean, reason: string): SelectivityFilterVerdict => ({ id: filter.id, usable, threshold, matchingRows: filter.matchingRows, reason });
  const unusable = (reason: string, suggestion?: SelectivitySuggestion): FilterAssessment => ({ verdict: verdictWith(false, reason), suggestion });

  if (rules.nonIndexableFieldKinds.includes(filter.fieldKind)) {
    return unusable(
      `${FIELD_KIND_LABEL[filter.fieldKind]} fields are not indexable, so '${filter.field}' can never drive the query.`,
      filter.fieldKind === 'formula' ? 'avoid_formula_filter' : 'add_selective_leading_filter',
    );
  }
  if (filter.index === 'none') {
    const customThreshold = selectivityThreshold(totalRows, rules.thresholds.custom);
    return unusable(
      `'${filter.field}' has no index, so the optimizer cannot use it to drive the query; a custom index would allow up to ${fmt(customThreshold)} matching rows on ${fmt(totalRows)} rows.`,
      'add_custom_index',
    );
  }
  const nonSelective = rules.nonSelectiveOperators.find((entry) => entry.operator === filter.operator && (entry.fieldKinds === undefined || entry.fieldKinds.includes(filter.fieldKind)));
  if (nonSelective) {
    const scope = nonSelective.fieldKinds === undefined ? '' : ` on ${filter.fieldKind} fields`;
    return unusable(`Operator ${OPERATOR_LABEL[filter.operator]} is never selective${scope}: the optimizer cannot use the ${filter.index} index on '${filter.field}'.`, 'replace_negative_operator');
  }
  if (filter.operator === 'isNull') {
    if (filter.index === 'standard') {
      return unusable(`= null cannot use the standard index on '${filter.field}': nulls are excluded from standard index tables.`, 'add_custom_index');
    }
    if (!rules.customIndexIncludesNulls) {
      return unusable(`= null cannot use the custom index on '${filter.field}': custom indexes exclude nulls unless Support creates one that includes them.`, 'add_custom_index');
    }
  }
  if (filter.matchingRows > threshold) {
    return unusable(
      `'${filter.field}' matches ${fmt(filter.matchingRows)} of ${fmt(totalRows)} rows, above the ${fmt(threshold)} threshold for a ${filter.index} index: the optimizer will not use it.`,
      'reduce_scope',
    );
  }
  const nullNote = filter.operator === 'isNull' ? ' (custom index includes nulls)' : '';
  return {
    verdict: verdictWith(true, `'${filter.field}' matches ${fmt(filter.matchingRows)} of ${fmt(totalRows)} rows, within the ${fmt(threshold)} threshold for a ${filter.index} index${nullNote}.`),
  };
}

function orderSuggestions(wanted: Set<SelectivitySuggestion>): SelectivitySuggestion[] {
  return SELECTIVITY_SUGGESTIONS.filter((s) => wanted.has(s));
}

export function simulate(input: SelectivityInput, ruleSet: RuleSet<SelectivityRules>): SelectivityResult {
  const rules = ruleSet.rules;
  const assessments = input.filters.map((filter) => assessFilter(filter, input.totalRows, rules));
  const perFilter = assessments.map((a) => ({ ...a.verdict }));
  const wanted = new Set<SelectivitySuggestion>();
  for (const a of assessments) if (a.suggestion) wanted.add(a.suggestion);

  let selective: boolean;
  if (input.combinator === 'AND') {
    // One usable filter is enough to drive the query; the rest are applied after the index lookup.
    selective = perFilter.some((f) => f.usable);
    if (!selective) wanted.add('add_selective_leading_filter');
  } else {
    // OR: every branch must be usable, and the union of branches must itself stay within the tightest threshold.
    const unusable = perFilter.filter((f) => !f.usable);
    if (unusable.length > 0) {
      selective = false;
      wanted.add('add_selective_leading_filter');
      const names = unusable.map((f) => `'${input.filters.find((x) => x.id === f.id)?.field ?? f.id}'`).join(', ');
      for (const f of perFilter) {
        if (f.usable) f.reason += ` OR: every branch must be usable and ${names} ${unusable.length === 1 ? 'is' : 'are'} not, so the whole query falls back to a full scan.`;
      }
    } else {
      const sum = perFilter.reduce((acc, f) => acc + f.matchingRows, 0);
      const tightest = Math.min(...perFilter.map((f) => f.threshold));
      selective = sum <= tightest;
      if (!selective) {
        wanted.add('reduce_scope');
        for (const f of perFilter) {
          f.reason += ` OR union: the branches together match ${fmt(sum)} rows, above the ${fmt(tightest)} threshold, so the whole query falls back to a full scan.`;
        }
      }
    }
  }

  return {
    selective,
    plan: selective ? 'index' : 'fullScan',
    perFilter,
    suggestions: selective ? [] : orderSuggestions(wanted),
  };
}
