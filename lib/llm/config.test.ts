import { describe, expect, it } from 'vitest';
import { LLM_CLASSES } from '../assessments/types.ts';
import {
  DEFAULT_LLM_MODEL,
  LLM_CONFIG,
  LLM_EFFORTS,
  LLM_MODEL_IDS,
  LLM_PLANS,
  quotaLimitsPayload,
  resolveRoute,
  routeFor,
} from './config.ts';

const MINUTE_MS = 60_000;

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

describe('LLM_CONFIG', () => {
  it('routes every LLM class and nothing else', () => {
    expect(Object.keys(LLM_CONFIG.routing).sort()).toEqual([...LLM_CLASSES].sort());
    for (const cls of LLM_CLASSES) {
      const route = LLM_CONFIG.routing[cls];
      expect(LLM_MODEL_IDS).toContain(route.model);
      expect(LLM_EFFORTS).toContain(route.effort);
      expect(route.maxTokens).toBeGreaterThan(0);
      expect(typeof route.stream).toBe('boolean');
    }
  });

  it('carries the documented routing table', () => {
    expect(DEFAULT_LLM_MODEL).toBe('claude-opus-5');
    expect(LLM_CONFIG.routing.check).toEqual({ model: 'claude-opus-5', effort: 'low', maxTokens: 8000, stream: false });
    expect(LLM_CONFIG.routing.probe).toEqual({ model: 'claude-opus-5', effort: 'medium', maxTokens: 16000, stream: false });
    expect(LLM_CONFIG.routing.boss).toEqual({ model: 'claude-opus-5', effort: 'high', maxTokens: 16000, stream: false });
    expect(LLM_CONFIG.routing.capstone).toEqual({ model: 'claude-opus-5', effort: 'xhigh', maxTokens: 32000, stream: true });
  });

  it('only the capstone class streams', () => {
    const streaming = LLM_CLASSES.filter((cls) => LLM_CONFIG.routing[cls].stream);
    expect(streaming).toEqual(['capstone']);
  });

  it('carries the documented scalar values', () => {
    expect(LLM_CONFIG.cacheTtl).toBe('5m');
    expect(LLM_CONFIG.pendingRetryMax).toBe(3);
    expect(LLM_CONFIG.pendingRetryBackoff).toEqual([1 * MINUTE_MS, 5 * MINUTE_MS, 30 * MINUTE_MS]);
    expect(LLM_CONFIG.pendingDrainPerAction).toBe(2);
    expect(LLM_CONFIG.pendingDrainPerCron).toBe(50);
    expect(LLM_CONFIG.serverActionLimitPerMinute).toBe(30);
  });

  it('backoff has one entry per allowed retry (index = retry_count)', () => {
    expect(LLM_CONFIG.pendingRetryBackoff).toHaveLength(LLM_CONFIG.pendingRetryMax);
    let prev = 0;
    for (const ms of LLM_CONFIG.pendingRetryBackoff) {
      expect(ms).toBeGreaterThan(prev);
      prev = ms;
    }
  });

  it('quota covers every plan with the documented limits and is the check_llm_quota payload', () => {
    expect(Object.keys(LLM_CONFIG.quota).sort()).toEqual([...LLM_PLANS].sort());
    expect(LLM_CONFIG.quota.personal).toEqual({ hour: 30, day: 150 });
    expect(LLM_CONFIG.quota.free).toEqual({ hour: 8, day: 25 });
    expect(LLM_CONFIG.quota.team).toEqual({ hour: 60, day: 400 });
    for (const plan of LLM_PLANS) {
      expect(LLM_CONFIG.quota[plan].hour).toBeLessThanOrEqual(LLM_CONFIG.quota[plan].day);
    }
    expect(quotaLimitsPayload()).toEqual(LLM_CONFIG.quota);
    expect(JSON.parse(JSON.stringify(quotaLimitsPayload()))).toEqual(LLM_CONFIG.quota);
  });

  it('holds no scoring or defeat key (those belong to mastery-engine / gamification config)', () => {
    // `routing.boss` is the LLM class key; every other subtree must be free of scoring vocabulary.
    const rest = Object.fromEntries(Object.entries(LLM_CONFIG).filter(([key]) => key !== 'routing'));
    const keys = collectKeys(rest);
    for (const forbidden of [
      'correctThreshold',
      'understandingBands',
      'maxDelta',
      'defeat',
      'boss',
      'mission',
      'weekly',
      'bands',
      'dimensionWeights',
    ]) {
      expect(keys.has(forbidden), `LLM_CONFIG must not carry '${forbidden}'`).toBe(false);
    }
    // 'boss' is a routing class key, which is the only place that word may appear.
    expect(Object.keys(LLM_CONFIG.routing)).toContain('boss');
  });

  it('system prompt guard exceeds the largest minimum cacheable prefix (1024 on claude-sonnet-5)', () => {
    expect(LLM_CONFIG.systemPromptGuard.minTokens).toBe(1100);
    expect(LLM_CONFIG.systemPromptGuard.charsPerToken).toBe(3.5);
    expect(LLM_CONFIG.capstone.challengeCount).toBe(2);
  });
});

describe('resolveRoute / routeFor', () => {
  it('falls back to the static route when nothing is provided', () => {
    expect(resolveRoute('probe', {})).toEqual(LLM_CONFIG.routing.probe);
  });

  it('ANTHROPIC_MODEL replaces the static default model for every class', () => {
    for (const cls of LLM_CLASSES) {
      const route = routeFor(cls, { ANTHROPIC_MODEL: 'claude-sonnet-5' });
      expect(route.model).toBe('claude-sonnet-5');
      expect(route.effort).toBe(LLM_CONFIG.routing[cls].effort);
      expect(route.maxTokens).toBe(LLM_CONFIG.routing[cls].maxTokens);
      expect(route.stream).toBe(LLM_CONFIG.routing[cls].stream);
    }
  });

  it('per-class env overrides win over ANTHROPIC_MODEL and the static effort', () => {
    const env = {
      ANTHROPIC_MODEL: 'claude-opus-5',
      LLM_MODEL_CHECK: 'claude-sonnet-5',
      LLM_EFFORT_CHECK: 'medium',
      LLM_EFFORT_BOSS: 'max',
    } as const;
    expect(routeFor('check', env)).toEqual({ model: 'claude-sonnet-5', effort: 'medium', maxTokens: 8000, stream: false });
    expect(routeFor('boss', env)).toEqual({ model: 'claude-opus-5', effort: 'max', maxTokens: 16000, stream: false });
    expect(routeFor('probe', env)).toEqual(LLM_CONFIG.routing.probe);
    expect(routeFor('capstone', env)).toEqual(LLM_CONFIG.routing.capstone);
  });

  it('never mutates the config table', () => {
    const before = JSON.stringify(LLM_CONFIG);
    routeFor('check', { ANTHROPIC_MODEL: 'claude-sonnet-5', LLM_EFFORT_CHECK: 'max' });
    expect(JSON.stringify(LLM_CONFIG)).toBe(before);
  });
});
