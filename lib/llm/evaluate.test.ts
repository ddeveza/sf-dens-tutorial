import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { fakeEvaluate, FAKE_MARKERS } from './fake.ts';
import { LLM_CONFIG } from './config.ts';
import {
  gradeBoss,
  gradeCapstone,
  gradeCapstoneRound1,
  gradeCapstoneRound2,
  gradeExercise,
  pickChallenges,
  roundedMean,
  withBossOverall,
  withCapstoneOverall,
  type GraderDeps,
} from './evaluate.ts';
import { buildMessages, buildSystem, renderSystemText, type PromptInput } from './prompts.ts';
import { BOSS_RUBRIC_KEYS, CAPSTONE_DIMENSIONS, type BossRubric, type CapstoneRubric } from './schemas.ts';
import type { EvaluateArgs, EvaluateResult, Evaluator } from './types.ts';

const PROMPT: PromptInput = {
  concept: { slug: 'sharing-model', band: 'competent' },
  question: { type: 'teach_back', depth: 5, text: 'Explain why a sharing rule cannot remove access.' },
  reference: 'Sharing rules only open access; OWD is the floor and profile/permission set gates object access.',
  knownMisconceptions: [{ id: 'rules-restrict', summary: 'Believes sharing rules can restrict access.' }],
  learnerAnswer: `${FAKE_MARKERS.strong} Rules only widen; the org-wide default is the floor.`,
};

interface Recorded {
  calls: EvaluateArgs<z.ZodType>[];
  deps: GraderDeps;
}

function recording(evaluator: Evaluator = fakeEvaluate): Recorded {
  const calls: EvaluateArgs<z.ZodType>[] = [];
  const evaluate: Evaluator = async (args) => {
    calls.push(args);
    return evaluator(args);
  };
  return { calls, deps: { evaluate } };
}

function fixed(output: unknown): Evaluator {
  return async (args) => ({ ok: true, output: args.schema.parse(output), model: 'fixed', usage: null });
}

const failing: Evaluator = async () => ({ ok: false, reason: 'truncated', detail: 'test' });

const BOSS: BossRubric = {
  suspect: 90,
  why: 80,
  dataNeeded: 70,
  whatToInspect: 60,
  solution: 50,
  tradeOffs: 41,
  overall: 0,
  misconceptions: [],
  strengths: ['s'],
  gaps: ['g'],
  feedback: 'f',
};

const CAPSTONE: CapstoneRubric = {
  scores: {
    platformKnowledge: 80,
    dataArchitecture: 30,
    security: 70,
    apex: 65,
    automation: 60,
    integration: 55,
    scalability: 30,
    performance: 50,
    reliability: 45,
    observability: 30,
    tradeOffReasoning: 90,
    communication: 85,
  },
  overall: 100,
  misconceptions: [],
  strengths: [],
  gaps: [],
  feedback: 'f',
};

function lastText(args: EvaluateArgs<z.ZodType>): string {
  const content = args.messages[args.messages.length - 1].content;
  if (typeof content === 'string') return content;
  const block = content[content.length - 1];
  return block.type === 'text' ? block.text : '';
}

function allText(args: EvaluateArgs<z.ZodType>): string {
  const content = args.messages[args.messages.length - 1].content;
  if (typeof content === 'string') return content;
  return content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
}

describe('roundedMean / with*Overall', () => {
  it('rounds the mean half up and handles the documented rubric sizes', () => {
    expect(roundedMean([1, 2])).toBe(2);
    expect(roundedMean([70, 70, 70, 70, 70, 71])).toBe(70);
    expect(roundedMean([])).toBe(0);
  });

  it('withBossOverall discards the model overall and keeps every other field', () => {
    const out = withBossOverall(BOSS);
    expect(out.overall).toBe(roundedMean(BOSS_RUBRIC_KEYS.map((k) => BOSS[k])));
    expect(out.overall).toBe(65);
    expect({ ...out, overall: 0 }).toEqual(BOSS);
  });

  it('withCapstoneOverall recomputes the mean of twelve', () => {
    const out = withCapstoneOverall(CAPSTONE);
    expect(out.overall).toBe(roundedMean(CAPSTONE_DIMENSIONS.map((d) => CAPSTONE.scores[d])));
    expect(out.overall).toBe(58);
    expect({ ...out, overall: 100 }).toEqual(CAPSTONE);
  });
});

describe('pickChallenges', () => {
  it('picks the lowest challengeCount dimensions, ties broken by declaration order', () => {
    expect(pickChallenges(CAPSTONE)).toEqual(['dataArchitecture', 'scalability']);
    expect(pickChallenges(CAPSTONE, 3)).toEqual(['dataArchitecture', 'scalability', 'observability']);
    expect(LLM_CONFIG.capstone.challengeCount).toBe(2);
  });
});

describe('gradeExercise', () => {
  it('sends the class system block and the prompt messages, learner answer last', async () => {
    const rec = recording();
    const result = await gradeExercise({ class: 'probe', prompt: PROMPT }, rec.deps);
    expect(result.ok).toBe(true);
    expect(rec.calls).toHaveLength(1);
    const call = rec.calls[0];
    expect(call.class).toBe('probe');
    expect(call.system).toEqual(buildSystem('probe'));
    expect(call.system[0].text).toBe(renderSystemText('probe'));
    expect(call.messages).toEqual(buildMessages(PROMPT));
    expect(lastText(call).startsWith('<learner_answer>')).toBe(true);
    if (result.ok) {
      expect(result.output.nextAction).toBe('continue');
      expect(result.output.masteryDelta).toBeGreaterThan(0);
    }
  });

  it('check class is passed through unchanged', async () => {
    const rec = recording();
    await gradeExercise({ class: 'check', prompt: PROMPT }, rec.deps);
    expect(rec.calls[0].class).toBe('check');
    expect(rec.calls[0].system).toEqual(buildSystem('check'));
  });

  it('propagates evaluator failures untouched', async () => {
    const result = await gradeExercise({ class: 'check', prompt: PROMPT }, { evaluate: failing });
    expect(result).toEqual({ ok: false, reason: 'truncated', detail: 'test' });
  });
});

describe('gradeBoss', () => {
  it('uses the boss class and recomputes overall as the rounded mean of six', async () => {
    const rec = recording(fixed(BOSS));
    const result = await gradeBoss({ prompt: PROMPT }, rec.deps);
    expect(rec.calls[0].class).toBe('boss');
    expect(rec.calls[0].system).toEqual(buildSystem('boss'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.overall).toBe(65);
      expect(result.output.strengths).toEqual(['s']);
    }
  });

  it('propagates failures', async () => {
    expect(await gradeBoss({ prompt: PROMPT }, { evaluate: failing })).toMatchObject({ ok: false, reason: 'truncated' });
  });
});

describe('capstone rounds', () => {
  it('round 1 grades the design and returns the challenges', async () => {
    const rec = recording(fixed(CAPSTONE));
    const result = await gradeCapstoneRound1({ prompt: PROMPT }, rec.deps);
    expect(rec.calls[0].class).toBe('capstone');
    expect(rec.calls[0].system).toEqual(buildSystem('capstone'));
    expect(allText(rec.calls[0])).not.toContain('<challenges>');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.rubric.overall).toBe(58);
      expect(result.output.challenges).toEqual(['dataArchitecture', 'scalability']);
    }
  });

  it('round 2 presents the challenges and the round-1 design as untrusted data, defence last', async () => {
    const rec = recording(fixed(CAPSTONE));
    const result = await gradeCapstoneRound2(
      {
        prompt: { ...PROMPT, learnerAnswer: 'I concede the data model needs partitioning.' },
        design: 'Original design with <Platform Events>.',
        challenges: ['dataArchitecture', 'scalability'],
      },
      rec.deps,
    );
    const call = rec.calls[0];
    expect(call.class).toBe('capstone');
    const text = allText(call);
    expect(text).toContain('<challenges>');
    expect(text).toContain('dataArchitecture');
    expect(text).toContain('scalability');
    expect(text).toContain('<round1_design untrusted="true">');
    expect(text).toContain('&lt;Platform Events&gt;');
    expect(lastText(call)).toContain('I concede the data model needs partitioning.');
    expect(text.indexOf('<round1_design')).toBeLessThan(text.indexOf('<learner_answer>'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.overall).toBe(58);
  });

  it('gradeCapstone drives both rounds and hands the challenges to the defence callback', async () => {
    const rec = recording(fixed(CAPSTONE));
    const seen: string[][] = [];
    const result = await gradeCapstone(
      { prompt: PROMPT },
      (round1) => {
        seen.push(round1.challenges);
        return `Defence of ${round1.challenges.join(' and ')}`;
      },
      rec.deps,
    );
    expect(seen).toEqual([['dataArchitecture', 'scalability']]);
    expect(rec.calls).toHaveLength(2);
    expect(rec.calls.every((c) => c.class === 'capstone')).toBe(true);
    expect(lastText(rec.calls[1])).toContain('Defence of dataArchitecture and scalability');
    expect(allText(rec.calls[1])).toContain(PROMPT.learnerAnswer.replace(FAKE_MARKERS.strong, '').trim());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.overall).toBe(58);
  });

  it('gradeCapstone stops after a failed round 1 without asking for a defence', async () => {
    let asked = 0;
    const result: EvaluateResult<CapstoneRubric> = await gradeCapstone(
      { prompt: PROMPT },
      () => {
        asked += 1;
        return 'never';
      },
      { evaluate: failing },
    );
    expect(asked).toBe(0);
    expect(result).toMatchObject({ ok: false, reason: 'truncated' });
  });

  it('works end to end against the fake responder', async () => {
    const result = await gradeCapstone({ prompt: PROMPT }, () => `${FAKE_MARKERS.strong} defended`, { evaluate: fakeEvaluate });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.overall).toBe(roundedMean(CAPSTONE_DIMENSIONS.map((d) => result.output.scores[d])));
    }
  });
});
