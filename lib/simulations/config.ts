// Simulation UI and rule-set freshness knobs (ARCHITECTURE.md, Simulations). Rule numbers never live here:
// they live in versioned rule sets under data/simulations/<sim>/<release-id>.ts.
export const SIM_CONFIG = {
  maxRuleSetAgeDays: 365, // rule-sets.test.ts fails past this
  warnRuleSetAgeDays: 180, // rule-sets.test.ts warns
  governor: {
    loopIterations: { min: 1, max: 2000 }, // default = rules.triggerChunkSize
    maxOpsPerTransaction: 30,
  },
  sharing: { maxRoleDepth: 4, maxSimUsers: 5, maxRules: 6, maxPermissionSetsPerUser: 3 },
  selectivity: { minRows: 1_000, maxRows: 50_000_000, defaultRows: 1_000_000, maxFilters: 4 },
  orderOfExecution: { animationStepMs: 350 }, // 0 under prefers-reduced-motion
} as const;
export type SimConfig = typeof SIM_CONFIG;
