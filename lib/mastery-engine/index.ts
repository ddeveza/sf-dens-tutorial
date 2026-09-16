// Public API of the mastery engine. Pure: plain objects in, plain objects out; callers pass `now`.
export * from './types.ts';
export * from './config.ts';
export * from './state.ts';
export * from './time.ts';
export { updateDimension, clamp, type DimensionEvidence, type DimensionDelta, type DeltaSuppression } from './update-dimension.ts';
export * from './caps.ts';
export * from './held.ts';
export * from './confidence.ts';
export { activeFormKeys } from './bookkeeping.ts';
export * from './apply-evidence.ts';
export * from './apply-evaluation.ts';
export * from './rubric.ts';
