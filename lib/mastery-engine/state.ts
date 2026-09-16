// MasteryState construction and the conversion to / from the `mastery` row (six score columns + overall, band,
// cap_reason, evidence_count, state jsonb). The jsonb shape is owned by MasteryStateSchema; SQL stores, the engine parses.
import { z } from 'zod';
import { PROBE_ANGLES } from '../learning-engine/types.ts';
import { DIMENSIONS, type Band, type CapReason, type Dimension, type DimensionState, type MasteryState } from './types.ts';
import { toIso } from './time.ts';

/** Sentinel for rows whose jsonb carries no timestamp and whose caller passed none. */
export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

const DepthOrZero = z.literal([0, 1, 2, 3, 4, 5, 6, 7, 8]);

const DimensionMetaSchema = z.object({
  evidenceCount: z.number().int().min(0),
  maxDepthPassed: DepthOrZero,
  lastEvidenceAt: z.string().nullable(),
});
export type DimensionMeta = z.infer<typeof DimensionMetaSchema>;

const emptyMeta = (): DimensionMeta => ({ evidenceCount: 0, maxDepthPassed: 0, lastEvidenceAt: null });

const DimsMetaSchema = z.object({
  recall: DimensionMetaSchema,
  understanding: DimensionMetaSchema,
  application: DimensionMetaSchema,
  debugging: DimensionMetaSchema,
  architecture: DimensionMetaSchema,
  teach_back: DimensionMetaSchema,
});

const HeldCreditSchema = z.object({
  attemptId: z.string(),
  dimension: z.enum(DIMENSIONS),
  delta: z.number(),
  expiresAt: z.string(),
});

/** Shape of `mastery.state` jsonb: everything in MasteryState that is not a column. */
export const MasteryStateSchema = z.object({
  version: z.literal(1).default(1),
  dims: DimsMetaSchema.default(() => ({
    recall: emptyMeta(),
    understanding: emptyMeta(),
    application: emptyMeta(),
    debugging: emptyMeta(),
    architecture: emptyMeta(),
    teach_back: emptyMeta(),
  })),
  overallRaw: z.number().min(0).max(100).default(0),
  consecutiveRecallCorrect: z.number().int().min(0).default(0),
  chainRung: z.literal([0, 1, 2, 3, 4, 5]).default(0),
  lastProbeAngle: z.enum(PROBE_ANGLES).nullable().default(null),
  recentProbeAngles: z.array(z.enum(PROBE_ANGLES)).default([]),
  recentPassedFormKeys: z.array(z.string()).default([]),
  recentPassedFormKeyAt: z.record(z.string(), z.string()).default({}),
  held: z.array(HeldCreditSchema).default([]),
  weakAreas: z.array(z.string()).default([]),
  updatedAt: z.string().nullable().default(null),
});
export type MasteryStateJson = z.infer<typeof MasteryStateSchema>;

/** What the engine reads: the generated `Tables<'mastery'>` row is assignable (extra columns are ignored). */
export interface MasteryRowLike {
  user_id: string;
  concept_id: string;
  recall: number;
  understanding: number;
  application: number;
  debugging: number;
  architecture: number;
  teach_back: number;
  overall: number;
  band: Band;
  cap_reason: CapReason | null;
  evidence_count: number;
  state: unknown;
  updated_at?: string | null;
}

/** What the engine writes: a complete row (record_attempt replaces whole rows, never adds deltas). */
export interface MasteryRow extends Omit<MasteryRowLike, 'state' | 'updated_at'> {
  state: MasteryStateJson;
  updated_at: string;
}

/** One `masteryPatches[]` entry: `Omit<TablesInsert<'mastery'>, 'user_id' | 'created_at' | 'updated_at'>`. */
export type MasteryPatch = Omit<MasteryRow, 'user_id' | 'updated_at'>;

export function emptyDimension(): DimensionState {
  return { score: 0, ...emptyMeta() };
}

export function createMasteryState(userId: string, conceptId: string, now: string | Date): MasteryState {
  return {
    userId,
    conceptId,
    dims: {
      recall: emptyDimension(),
      understanding: emptyDimension(),
      application: emptyDimension(),
      debugging: emptyDimension(),
      architecture: emptyDimension(),
      teach_back: emptyDimension(),
    },
    overallRaw: 0,
    overall: 0,
    band: 'lost',
    capReason: null,
    consecutiveRecallCorrect: 0,
    chainRung: 0,
    lastProbeAngle: null,
    recentProbeAngles: [],
    recentPassedFormKeys: [],
    recentPassedFormKeyAt: {},
    held: [],
    weakAreas: [],
    updatedAt: toIso(now),
  };
}

/** Sum of primary evidence across dimensions: the denormalised `evidence_count` column. */
export function totalEvidence(state: Pick<MasteryState, 'dims'>): number {
  return DIMENSIONS.reduce((acc, d) => acc + state.dims[d].evidenceCount, 0);
}

/**
 * Lenient on purpose: invalid or empty jsonb falls back to unevidenced metadata while the score columns are kept
 * (a bug report, not a crash path). Validate with MasteryStateSchema directly when strictness is wanted.
 */
export function parseMasteryState(row: MasteryRowLike): MasteryState {
  const parsed = MasteryStateSchema.safeParse(row.state);
  const json: MasteryStateJson = parsed.success ? parsed.data : MasteryStateSchema.parse({});
  const dims = {} as Record<Dimension, DimensionState>;
  for (const d of DIMENSIONS) {
    const meta = json.dims[d];
    dims[d] = {
      score: row[d],
      evidenceCount: meta.evidenceCount,
      maxDepthPassed: meta.maxDepthPassed,
      lastEvidenceAt: meta.lastEvidenceAt,
    };
  }
  return {
    userId: row.user_id,
    conceptId: row.concept_id,
    dims,
    overallRaw: json.overallRaw,
    overall: row.overall,
    band: row.band,
    capReason: row.cap_reason,
    consecutiveRecallCorrect: json.consecutiveRecallCorrect,
    chainRung: json.chainRung,
    lastProbeAngle: json.lastProbeAngle,
    recentProbeAngles: json.recentProbeAngles,
    recentPassedFormKeys: json.recentPassedFormKeys,
    recentPassedFormKeyAt: json.recentPassedFormKeyAt,
    held: json.held,
    weakAreas: json.weakAreas,
    updatedAt: json.updatedAt ?? row.updated_at ?? EPOCH_ISO,
  };
}

export function toMasteryRow(state: MasteryState): MasteryRow {
  const dims = {} as MasteryStateJson['dims'];
  for (const d of DIMENSIONS) {
    const { evidenceCount, maxDepthPassed, lastEvidenceAt } = state.dims[d];
    dims[d] = { evidenceCount, maxDepthPassed, lastEvidenceAt };
  }
  return {
    user_id: state.userId,
    concept_id: state.conceptId,
    recall: state.dims.recall.score,
    understanding: state.dims.understanding.score,
    application: state.dims.application.score,
    debugging: state.dims.debugging.score,
    architecture: state.dims.architecture.score,
    teach_back: state.dims.teach_back.score,
    overall: state.overall,
    band: state.band,
    cap_reason: state.capReason,
    evidence_count: totalEvidence(state),
    state: {
      version: 1,
      dims,
      overallRaw: state.overallRaw,
      consecutiveRecallCorrect: state.consecutiveRecallCorrect,
      chainRung: state.chainRung,
      lastProbeAngle: state.lastProbeAngle,
      recentProbeAngles: [...state.recentProbeAngles],
      recentPassedFormKeys: [...state.recentPassedFormKeys],
      recentPassedFormKeyAt: { ...state.recentPassedFormKeyAt },
      held: state.held.map((h) => ({ ...h })),
      weakAreas: [...state.weakAreas],
      updatedAt: state.updatedAt,
    },
    updated_at: state.updatedAt,
  };
}

export function toMasteryPatch(state: MasteryState): MasteryPatch {
  const { user_id: _userId, updated_at: _updatedAt, ...patch } = toMasteryRow(state);
  void _userId;
  void _updatedAt;
  return patch;
}
