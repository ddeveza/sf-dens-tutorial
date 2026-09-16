// Jargon lint for caveman text (ARCHITECTURE.md, Caveman <-> Technical toggle). Pure: strings in, hits out.
// The lint set is the global list (jargon.ts) union `concept.terms[].term` of the lesson's concepts; matching is
// case-insensitive (unless the term is marked caseSensitive) on word boundaries, with an optional plural suffix.
import { JARGON_TERMS } from './jargon.ts';
import type { JargonTerm } from './jargon.ts';
import { richBlocksText } from './schema.ts';
import type { Concept, Lesson } from './schema.ts';

export interface JargonHit {
  term: string; // the lint-set entry that matched
  match: string; // the text as written
  index: number; // offset in the text
}

export interface JargonFinding extends JargonHit {
  path: string; // e.g. 'curiosity.caveman', 'explanation.caveman[2]'
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';

function termPattern(entry: JargonTerm): RegExp {
  const plural = /s$/i.test(entry.term) ? '' : '(?:s|es)?';
  return new RegExp(`${BOUNDARY_BEFORE}${escapeRegExp(entry.term)}${plural}${BOUNDARY_AFTER}`, entry.caseSensitive ? 'gu' : 'giu');
}

function normalizeTerms(terms: readonly (string | JargonTerm)[]): JargonTerm[] {
  return terms.map((entry) => (typeof entry === 'string' ? { term: entry } : entry)).filter((entry) => entry.term.trim().length > 0);
}

/** Every jargon occurrence in `text`, sorted by position; `extraTerms` extends the global list (case-insensitive). */
export function findJargon(text: string, extraTerms: readonly (string | JargonTerm)[] = []): JargonHit[] {
  const hits: JargonHit[] = [];
  const seen = new Set<string>();
  for (const entry of [...JARGON_TERMS, ...normalizeTerms(extraTerms)]) {
    const pattern = termPattern(entry);
    for (const match of text.matchAll(pattern)) {
      const key = `${match.index}:${match[0].length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ term: entry.term, match: match[0], index: match.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index || a.term.localeCompare(b.term));
}

export function containsJargon(text: string, extraTerms: readonly (string | JargonTerm)[] = []): boolean {
  return findJargon(text, extraTerms).length > 0;
}

/** Caveman texts a learner sees before the reveal step: curiosity, problem and the explanation blocks. */
export function cavemanTextsBeforeReveal(lesson: Pick<Lesson, 'curiosity' | 'problem' | 'explanation'>): Array<{ path: string; text: string }> {
  const texts: Array<{ path: string; text: string }> = [
    { path: 'curiosity.caveman', text: lesson.curiosity.caveman },
    { path: 'problem.caveman', text: lesson.problem.caveman },
  ];
  lesson.explanation.caveman.forEach((block, index) => {
    const text = richBlocksText([block]);
    if (text.length > 0) texts.push({ path: `explanation.caveman[${index}]`, text });
  });
  return texts;
}

/** Terms the lesson's concepts add to the lint set. */
export function conceptTerms(concepts: readonly Pick<Concept, 'terms'>[]): string[] {
  return concepts.flatMap((concept) => concept.terms.map((entry) => entry.term));
}

/** Jargon findings for one lesson against the global list union its concepts' terms. Empty = passes. */
export function lintLesson(lesson: Pick<Lesson, 'curiosity' | 'problem' | 'explanation'>, concepts: readonly Pick<Concept, 'terms'>[]): JargonFinding[] {
  const extra = conceptTerms(concepts);
  return cavemanTextsBeforeReveal(lesson).flatMap(({ path, text }) => findJargon(text, extra).map((hit) => ({ ...hit, path })));
}
