import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSESSMENT_CONFIG, CORRECT_THRESHOLD } from './config.ts';

const MASTERY_CONFIG_PATH = '../mastery-engine/config.ts';
const masteryConfigExists = existsSync(new URL(MASTERY_CONFIG_PATH, import.meta.url));

describe('ASSESSMENT_CONFIG', () => {
  it('pins the correct threshold at 70', () => {
    expect(CORRECT_THRESHOLD).toBe(70);
    expect(ASSESSMENT_CONFIG.correctThreshold).toBe(CORRECT_THRESHOLD);
  });

  it('uses a 0-100 score scale', () => {
    expect(ASSESSMENT_CONFIG.scoreMax).toBe(100);
  });

  it('weights sum to 1 for every composite scorer', () => {
    const { debugCode, findAntiPattern } = ASSESSMENT_CONFIG.weights;
    expect(debugCode.bugLines + debugCode.fix).toBeCloseTo(1);
    expect(findAntiPattern.snippet + findAntiPattern.antiPatternId).toBeCloseTo(1);
    expect(debugCode).toEqual({ bugLines: 0.5, fix: 0.5 });
    expect(findAntiPattern).toEqual({ snippet: 0.6, antiPatternId: 0.4 });
  });

  it('routes explain_why depth <= 3 to the check class', () => {
    expect(ASSESSMENT_CONFIG.llmClass.explainWhyCheckMaxDepth).toBe(3);
  });

  // MASTERY_CONFIG.correctThreshold is the authoritative value; this guard fires as soon as that module lands.
  it.runIf(masteryConfigExists)('agrees with MASTERY_CONFIG.correctThreshold', async () => {
    const mod = (await import(/* @vite-ignore */ MASTERY_CONFIG_PATH)) as {
      MASTERY_CONFIG?: { correctThreshold?: number };
    };
    expect(mod.MASTERY_CONFIG?.correctThreshold).toBe(ASSESSMENT_CONFIG.correctThreshold);
  });
});
