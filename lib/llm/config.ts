// Every number the LLM boundary uses (ARCHITECTURE.md LLM §A "LLM config table" and "Model routing").
// No scoring key lives here: correctThreshold / understandingBands / maxDelta belong to
// lib/mastery-engine/config.ts and boss defeat rules to lib/gamification/config.ts.
// No 'server-only' and relative `.ts` specifiers only: lib/env/server.ts imports this file and scripts/**
// import that under plain node type stripping.
import { LLM_CLASSES, type LlmClass } from '../assessments/types.ts';

export const LLM_MODEL_IDS = ['claude-opus-5', 'claude-sonnet-5'] as const;
export type LlmModelId = (typeof LLM_MODEL_IDS)[number];
export const DEFAULT_LLM_MODEL: LlmModelId = 'claude-opus-5';

export const LLM_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type LlmEffort = (typeof LLM_EFFORTS)[number];

export const LLM_PLANS = ['personal', 'free', 'team'] as const;
export type LlmPlan = (typeof LLM_PLANS)[number];

export const CACHE_TTLS = ['5m', '1h'] as const;
export type CacheTtl = (typeof CACHE_TTLS)[number];

export interface RouteConfig {
  model: LlmModelId;
  effort: LlmEffort;
  /** Never lowball: truncation is a failed evaluation. */
  maxTokens: number;
  /** `client.messages.stream(...).finalMessage()` instead of a single request. */
  stream: boolean;
}

export interface QuotaLimits {
  hour: number;
  day: number;
}

export interface LlmConfig {
  routing: Record<LlmClass, RouteConfig>;
  cacheTtl: CacheTtl;
  /** Then `needs_review`. The only name for the retry cap; the step machine receives it as `pendingRetryMax`. */
  pendingRetryMax: number;
  /** Milliseconds; index = attempts.retry_count. */
  pendingRetryBackoff: readonly number[];
  pendingDrainPerAction: number;
  pendingDrainPerCron: number;
  /** `p_plan_limits` for check_llm_quota / reserve_llm_call, keyed by profiles.plan. */
  quota: Record<LlmPlan, QuotaLimits>;
  serverActionLimitPerMinute: number;
  /**
   * prompts.test.ts guard: a system block must exceed the largest minimum cacheable prefix (1024 tokens on
   * claude-sonnet-5) or caching silently no-ops. Token count is approximated as chars / charsPerToken.
   */
  systemPromptGuard: { minTokens: number; charsPerToken: number };
  /** Round 2 ("defend") challenges the lowest `challengeCount` round-1 dimensions. */
  capstone: { challengeCount: number };
}

const MINUTE_MS = 60_000;

export const LLM_CONFIG: LlmConfig = {
  routing: {
    check: { model: DEFAULT_LLM_MODEL, effort: 'low', maxTokens: 8000, stream: false },
    probe: { model: DEFAULT_LLM_MODEL, effort: 'medium', maxTokens: 16000, stream: false },
    boss: { model: DEFAULT_LLM_MODEL, effort: 'high', maxTokens: 16000, stream: false },
    capstone: { model: DEFAULT_LLM_MODEL, effort: 'xhigh', maxTokens: 32000, stream: true },
  },
  cacheTtl: '5m',
  pendingRetryMax: 3,
  pendingRetryBackoff: [1 * MINUTE_MS, 5 * MINUTE_MS, 30 * MINUTE_MS],
  pendingDrainPerAction: 2,
  pendingDrainPerCron: 50,
  quota: {
    personal: { hour: 30, day: 150 },
    free: { hour: 8, day: 25 },
    team: { hour: 60, day: 400 },
  },
  serverActionLimitPerMinute: 30,
  systemPromptGuard: { minTokens: 1100, charsPerToken: 3.5 },
  capstone: { challengeCount: 2 },
};

/** The jsonb argument for `check_llm_quota(p_plan_limits)` / `reserve_llm_call(p_plan_limits)`; SQL holds no tunables. */
export function quotaLimitsPayload(config: LlmConfig = LLM_CONFIG): Record<LlmPlan, QuotaLimits> {
  return config.quota;
}

export interface RouteOverrides {
  /** `ANTHROPIC_MODEL`: replaces the static default model for every class. */
  defaultModel?: LlmModelId;
  /** `LLM_MODEL_<CLASS>`: wins over `defaultModel`. */
  model?: LlmModelId;
  /** `LLM_EFFORT_<CLASS>`. */
  effort?: LlmEffort;
}

/** Env override wins per class; unset falls back to ANTHROPIC_MODEL, then to the static table. */
export function resolveRoute(cls: LlmClass, overrides: RouteOverrides, config: LlmConfig = LLM_CONFIG): RouteConfig {
  const base = config.routing[cls];
  return {
    model: overrides.model ?? overrides.defaultModel ?? base.model,
    effort: overrides.effort ?? base.effort,
    maxTokens: base.maxTokens,
    stream: base.stream,
  };
}

/** Structural view of the env keys routing reads; `ServerEnv` from lib/env/server.ts satisfies it. */
export interface RouteEnv {
  ANTHROPIC_MODEL?: LlmModelId;
  LLM_MODEL_CHECK?: LlmModelId;
  LLM_MODEL_PROBE?: LlmModelId;
  LLM_MODEL_BOSS?: LlmModelId;
  LLM_MODEL_CAPSTONE?: LlmModelId;
  LLM_EFFORT_CHECK?: LlmEffort;
  LLM_EFFORT_PROBE?: LlmEffort;
  LLM_EFFORT_BOSS?: LlmEffort;
  LLM_EFFORT_CAPSTONE?: LlmEffort;
}

export function routeFor(cls: LlmClass, env: RouteEnv, config: LlmConfig = LLM_CONFIG): RouteConfig {
  const key = cls.toUpperCase() as Uppercase<LlmClass>;
  return resolveRoute(
    cls,
    { defaultModel: env.ANTHROPIC_MODEL, model: env[`LLM_MODEL_${key}`], effort: env[`LLM_EFFORT_${key}`] },
    config,
  );
}

export function isLlmClass(value: string): value is LlmClass {
  return (LLM_CLASSES as readonly string[]).includes(value);
}
