import { describe, expect, it } from 'vitest';
import { MASTERY_CONFIG } from './config.ts';
import { bossOverall, capstoneOverall, capstoneToEvaluation, rubricToEvaluation } from './rubric.ts';
import { EvaluationSchema, type BossRubric, type CapstoneRubric } from '../llm/schemas.ts';

function rubric(overrides: Partial<BossRubric> = {}): BossRubric {
  return {
    suspect: 80,
    why: 60,
    dataNeeded: 90,
    whatToInspect: 70,
    solution: 55,
    tradeOffs: 65,
    overall: 10, // advisory, must be discarded
    misconceptions: [{ id: 'm-1', summary: 'Confuses trigger context with batch scope' }],
    strengths: ['Found the recursion'],
    gaps: ['Skipped the debug log'],
    feedback: 'Solid diagnosis, thin on trade-offs.',
    ...overrides,
  };
}

function capstone(overrides: Partial<CapstoneRubric> = {}): CapstoneRubric {
  return {
    scores: {
      platformKnowledge: 80,
      dataArchitecture: 70,
      security: 90,
      apex: 60,
      automation: 100,
      integration: 50,
      scalability: 80,
      performance: 60,
      reliability: 90,
      observability: 70,
      tradeOffReasoning: 90,
      communication: 85,
    },
    overall: 5,
    misconceptions: [],
    strengths: [],
    gaps: [],
    feedback: 'Capstone feedback',
    ...overrides,
  };
}

describe('rubricToEvaluation', () => {
  it('correctness = mean(dataNeeded, whatToInspect), understanding = mean(suspect, why), application = solution, architecture = tradeOffs', () => {
    const e = rubricToEvaluation(rubric(), MASTERY_CONFIG);
    expect(e.correctness).toBe(80);
    expect(e.understanding).toBe(70);
    expect(e.application).toBe(55);
    expect(e.architecture).toBe(65);
    expect(e.confidence).toBe(70); // recomputed overall, not the advisory 10
    expect(e.masteryDelta).toBe(1);
    expect(e.nextAction).toBe('continue');
    expect(e.feedback).toBe('Solid diagnosis, thin on trade-offs.');
    expect(e.misconceptions).toEqual([{ id: 'm-1', summary: 'Confuses trigger context with batch scope' }]);
    expect(EvaluationSchema.safeParse(e).success).toBe(true);
  });

  it('masteryDelta is -1 when correctness is below correctThreshold', () => {
    const e = rubricToEvaluation(rubric({ dataNeeded: 60, whatToInspect: 70 }));
    expect(e.correctness).toBe(65);
    expect(e.masteryDelta).toBe(-1);
  });

  it('rounds means to integers', () => {
    const e = rubricToEvaluation(rubric({ suspect: 71, why: 70 }));
    expect(e.understanding).toBe(71); // 70.5 rounds half up
    expect(Number.isInteger(e.correctness)).toBe(true);
  });

  it('bossOverall = round(mean of six rubric scores)', () => {
    expect(bossOverall(rubric())).toBe(70);
    expect(bossOverall(rubric({ suspect: 100, why: 100, dataNeeded: 100, whatToInspect: 100, solution: 100, tradeOffs: 99 }))).toBe(100);
  });
});

describe('capstoneToEvaluation', () => {
  it('maps the 12 capstone dimensions onto the evaluation shape', () => {
    const e = capstoneToEvaluation(capstone(), MASTERY_CONFIG);
    expect(e.correctness).toBe(77); // 925 / 12 = 77.08
    expect(e.understanding).toBe(76); // platformKnowledge, security, apex, automation, integration
    expect(e.application).toBe(80); // reliability, observability
    expect(e.architecture).toBe(75); // dataArchitecture, scalability, performance, tradeOffReasoning
    expect(e.confidence).toBe(85); // communication
    expect(e.masteryDelta).toBe(1);
    expect(e.nextAction).toBe('continue');
    expect(e.feedback).toBe('Capstone feedback');
    expect(EvaluationSchema.safeParse(e).success).toBe(true);
  });

  it('capstoneOverall = round(mean of 12) and ignores the advisory overall', () => {
    expect(capstoneOverall(capstone())).toBe(77);
  });

  it('masteryDelta is -1 for a failing capstone', () => {
    const low = capstone({
      scores: {
        platformKnowledge: 50,
        dataArchitecture: 50,
        security: 50,
        apex: 50,
        automation: 50,
        integration: 50,
        scalability: 50,
        performance: 50,
        reliability: 50,
        observability: 50,
        tradeOffReasoning: 50,
        communication: 50,
      },
    });
    expect(capstoneToEvaluation(low).masteryDelta).toBe(-1);
  });
});
