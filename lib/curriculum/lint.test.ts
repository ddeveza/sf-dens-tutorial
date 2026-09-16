import { describe, expect, it } from 'vitest';
import { FIXTURE_CONCEPTS, FIXTURE_LESSON, buildFixtureLessonInput } from '../../tests/fixtures/lesson-fixture.ts';
import { defineLesson } from './builders.ts';
import { JARGON_TERMS, JARGON_TERM_STRINGS } from './jargon.ts';
import { cavemanTextsBeforeReveal, conceptTerms, containsJargon, findJargon, lintLesson } from './lint.ts';

describe('findJargon', () => {
  it('matches global terms case-insensitively', () => {
    const hits = findJargon('the APEX code and the apex trigger');
    expect(hits.map((hit) => hit.term)).toEqual(['Apex', 'Apex', 'trigger']);
    expect(hits.map((hit) => hit.match)).toEqual(['APEX', 'apex', 'trigger']);
    expect(hits.map((hit) => hit.index)).toEqual([4, 22, 27]);
  });

  it('respects word boundaries: "organization" is not "org", but "orgs" is', () => {
    expect(findJargon('a large organization')).toEqual([]);
    expect(findJargon('three orgs').map((hit) => hit.term)).toEqual(['org']);
    expect(findJargon('reorg the team')).toEqual([]);
    expect(findJargon('the org.')).toHaveLength(1);
  });

  it('accepts an optional plural suffix and multi-word terms', () => {
    expect(findJargon('two indexes and one index').map((hit) => hit.match)).toEqual(['indexes', 'index']);
    expect(findJargon('assign a Record Type').map((hit) => hit.term)).toEqual(['record type']);
    expect(findJargon('many Custom Objects here').map((hit) => hit.match)).toEqual(['Custom Objects']);
  });

  it('keeps case-sensitive terms case-sensitive (REST the verb is fine, REST the protocol is not)', () => {
    expect(JARGON_TERMS.find((entry) => entry.term === 'REST')?.caseSensitive).toBe(true);
    expect(findJargon('take a rest')).toEqual([]);
    expect(findJargon('a REST call').map((hit) => hit.term)).toEqual(['REST']);
  });

  it('extends the set with per-lesson concept terms (also case-insensitive, also plural)', () => {
    expect(findJargon('set a bookmark', ['savepoint'])).toEqual([]);
    expect(findJargon('set a Savepoint', ['savepoint']).map((hit) => hit.term)).toEqual(['savepoint']);
    expect(findJargon('two transactions', ['transaction']).map((hit) => hit.match)).toEqual(['transactions']);
    expect(findJargon('a thing', [{ term: 'Thing', caseSensitive: true }])).toEqual([]);
    expect(findJargon('a Thing', [{ term: 'Thing', caseSensitive: true }])).toHaveLength(1);
  });

  it('reports each position once even when two terms overlap on the same span', () => {
    // 'Apex' and 'Apex class' both start at 4; the longer term wins its own span, the shorter is a separate hit.
    const hits = findJargon('the Apex class');
    expect(hits.map((hit) => `${hit.term}@${hit.index}`)).toEqual(['Apex@4', 'Apex class@4']);
    expect(findJargon('a savepoint', ['savepoint'])).toHaveLength(1); // global + extension, same span, one hit
  });

  it('containsJargon is the boolean form', () => {
    expect(containsJargon('plain words')).toBe(false);
    expect(containsJargon('a sandbox')).toBe(true);
  });

  it('every global term is a non-empty string and the string list mirrors the term list', () => {
    expect(JARGON_TERM_STRINGS).toEqual(JARGON_TERMS.map((entry) => entry.term));
    for (const term of JARGON_TERM_STRINGS) expect(term.trim().length).toBeGreaterThan(0);
    expect(new Set(JARGON_TERM_STRINGS.map((term) => term.toLowerCase())).size).toBe(JARGON_TERM_STRINGS.length);
  });
});

describe('lintLesson', () => {
  it('passes the fixture lesson against its concepts', () => {
    expect(lintLesson(FIXTURE_LESSON, FIXTURE_CONCEPTS)).toEqual([]);
  });

  it('collects the concept terms as the per-lesson extension', () => {
    expect(conceptTerms(FIXTURE_CONCEPTS)).toEqual(['transaction', 'commit', 'savepoint']);
  });

  it('lints curiosity, problem and every explanation caveman block (code blocks excluded), with paths', () => {
    const texts = cavemanTextsBeforeReveal(FIXTURE_LESSON);
    expect(texts.map((entry) => entry.path)).toEqual(['curiosity.caveman', 'problem.caveman', 'explanation.caveman[0]', 'explanation.caveman[1]', 'explanation.caveman[2]']);
    const withCode = defineLesson(
      {
        ...buildFixtureLessonInput(),
        explanation: {
          caveman: [
            { kind: 'code', language: 'apex', code: 'insert org;' },
            { kind: 'paragraph', text: 'Plain words.' },
          ],
          technical: 'Technical.',
          reveal: [],
        },
      },
      { today: '2026-09-11' },
    );
    expect(cavemanTextsBeforeReveal(withCode).map((entry) => entry.path)).toEqual(['curiosity.caveman', 'problem.caveman', 'explanation.caveman[1]']);
    expect(lintLesson(withCode, FIXTURE_CONCEPTS)).toEqual([]);
  });

  it('flags a concept term used in caveman text before the reveal, with the path and the written form', () => {
    const leaky = defineLesson(
      { ...buildFixtureLessonInput(), curiosity: { caveman: 'One Transaction holds it all.', technical: 'x' } },
      { today: '2026-09-11' },
    );
    const findings = lintLesson(leaky, FIXTURE_CONCEPTS);
    expect(findings).toEqual([{ path: 'curiosity.caveman', term: 'transaction', match: 'Transaction', index: 4 }]);
  });

  it('flags a global term even when the lesson has no concepts', () => {
    const leaky = defineLesson({ ...buildFixtureLessonInput(), problem: { caveman: 'The sandbox is slow.', technical: 'x' } }, { today: '2026-09-11' });
    expect(lintLesson(leaky, []).map((hit) => `${hit.path}:${hit.term}`)).toEqual(['problem.caveman:sandbox']);
  });
});
