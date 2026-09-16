// Overall, band and the seven hard caps (Mastery §3 table, applied in table order).
import type { MasteryConfig } from './config.ts';
import { totalEvidence } from './state.ts';
import { BANDS, DIMENSIONS, type Band, type CapReason, type Depth, type Dimension, type MasteryState } from './types.ts';

export function bandIndex(band: Band): number {
  return BANDS.indexOf(band);
}

export function lowerBand(band: Band): Band {
  return BANDS[Math.max(0, bandIndex(band) - 1)];
}

export function bandAtLeast(band: Band, min: Band): boolean {
  return bandIndex(band) >= bandIndex(min);
}

export function bandFor(score: number, config: MasteryConfig): Band {
  for (let i = BANDS.length - 1; i >= 0; i -= 1) {
    if (score >= config.bands[BANDS[i]].min) return BANDS[i];
  }
  return BANDS[0];
}

export function bandMax(band: Band, config: MasteryConfig): number {
  return config.bands[band].max;
}

/** Weighted mean over evidenced dimensions only (no evidence, no vote), rounded to an integer. */
export function overallRawOf(state: Pick<MasteryState, 'dims'>, config: MasteryConfig): number {
  let numerator = 0;
  let denominator = 0;
  for (const d of DIMENSIONS) {
    const dim = state.dims[d];
    if (dim.evidenceCount < 1) continue;
    numerator += config.dimensionWeights[d] * dim.score;
    denominator += config.dimensionWeights[d];
  }
  return denominator === 0 ? 0 : Math.round(numerator / denominator);
}

export interface CapCheck {
  reason: Exclude<CapReason, 'min_evidence'>;
  fires: boolean;
  ceiling: Band;
}

/** The six structural caps, in table order. `min_evidence` depends on the running band and lives in recompute(). */
export function capChecks(state: Pick<MasteryState, 'dims'>, config: MasteryConfig): CapCheck[] {
  const { dims } = state;
  const gate = config.masteredGate;
  const evidenced = (d: Dimension) => dims[d].evidenceCount >= 1;
  const depthOf = (d: Dimension) => dims[d].maxDepthPassed;
  const anyDepth = (min: Depth) => DIMENSIONS.some((d) => depthOf(d) >= min);

  return [
    {
      reason: 'recall_only',
      fires: evidenced('recall') && DIMENSIONS.every((d) => d === 'recall' || !evidenced(d)),
      ceiling: 'familiar',
    },
    { reason: 'no_understanding', fires: !evidenced('understanding'), ceiling: 'developing' },
    {
      reason: 'no_application_or_debugging',
      fires: !(depthOf('application') >= config.applyDepth || depthOf('debugging') >= config.applyDepth),
      ceiling: 'competent',
    },
    { reason: 'no_optimize_evidence', fires: !anyDepth(gate.optimizeDepth), ceiling: 'competent' },
    {
      reason: 'no_design_evidence',
      fires: !(depthOf('architecture') >= gate.designDepth && anyDepth(gate.tradeOffsDepth)),
      ceiling: 'strong',
    },
    {
      reason: 'mastered_gate',
      fires: !(
        dims.teach_back.score >= gate.teachBackMin &&
        depthOf('teach_back') >= gate.teachBackDepth &&
        (depthOf('application') >= gate.appOrDebugDepth || depthOf('debugging') >= gate.appOrDebugDepth)
      ),
      ceiling: 'strong',
    },
  ];
}

/** Recomputes overallRaw, band, overall and capReason from the dimensions. Never mutates its input. */
export function recompute(state: MasteryState, config: MasteryConfig): MasteryState {
  const overallRaw = overallRawOf(state, config);
  let band = bandFor(overallRaw, config);
  let reason: CapReason | null = null;

  for (const cap of capChecks(state, config)) {
    if (cap.fires && bandIndex(cap.ceiling) < bandIndex(band)) {
      band = cap.ceiling;
      reason ??= cap.reason;
    }
  }

  const total = totalEvidence(state);
  while ((band === 'strong' || band === 'mastered') && total < config.minEvidence[band]) {
    band = lowerBand(band);
    reason ??= 'min_evidence';
  }

  return { ...state, overallRaw, overall: Math.min(overallRaw, bandMax(band, config)), band, capReason: reason };
}

/** First cap (table order) whose ceiling binds below bandFor(overallRaw); null when none does. */
export function capReason(state: MasteryState, config: MasteryConfig): CapReason | null {
  return recompute(state, config).capReason;
}
