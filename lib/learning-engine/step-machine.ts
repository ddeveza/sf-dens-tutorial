// Lesson step machine (ARCHITECTURE.md Learning Engine section 1). Pure: `transition` returns a new StepState or a
// refusal value; the Server Action persists the result through `advance_step` / `complete_read_step`.
import type { SimId } from '../simulations/rule-set.ts';
import { LEARNING_CONFIG } from './config.ts';
import type { LearningConfig, StepKind } from './config.ts';
import { SESSION_STEPS } from './types.ts';
import type { Segment, SessionStep, SkipReason, StepPayload, StepState, StepStatus } from './types.ts';

/** warmup followed by the eleven lesson steps in fixed order. */
export const STEP_ORDER: readonly SessionStep[] = SESSION_STEPS;

export function stepIndex(step: SessionStep): number {
  return STEP_ORDER.indexOf(step);
}

export function previousStep(step: SessionStep): SessionStep | null {
  const i = stepIndex(step);
  return i > 0 ? STEP_ORDER[i - 1] : null;
}

export function nextStep(step: SessionStep): SessionStep | null {
  const i = stepIndex(step);
  return i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : null;
}

export function segmentOf(step: SessionStep, config: LearningConfig = LEARNING_CONFIG): Segment {
  return config.steps[step].segment;
}

export function stepKind(step: SessionStep, config: LearningConfig = LEARNING_CONFIG): StepKind {
  return config.steps[step].kind;
}

/** Steps a learner completes with Continue (the `complete_read_step` allow list; includes the simulator). */
export function isReadStep(step: SessionStep, config: LearningConfig = LEARNING_CONFIG): boolean {
  return config.readSteps.includes(step);
}

/** Steps that complete only through a recorded attempt. */
export function isEvaluatedStep(step: SessionStep, config: LearningConfig = LEARNING_CONFIG): boolean {
  return config.steps[step].kind === 'evaluated';
}

export function isDone(status: StepStatus): boolean {
  return status === 'completed' || status === 'skipped';
}

export interface InitialStepOptions {
  /** Required for the simulation step: the lesson's simulator id. */
  simulator?: SimId;
}

/** The payload shape a fresh step row carries. The prediction sentinel (`predictionId: ''`) means "not captured yet". */
export function emptyPayload(step: SessionStep, options: InitialStepOptions = {}): StepPayload {
  switch (step) {
    case 'curiosity':
    case 'problem':
      return { step };
    case 'caveman':
    case 'technical':
      return { step, toggles: 0 };
    case 'simulation':
      if (options.simulator === undefined) throw new TypeError('emptyPayload: the simulation step needs a simulator id');
      return { step, simulator: options.simulator, finalState: null };
    case 'prediction':
      return { step, predictionId: '', choice: '', capturedAt: '', revealedAt: null };
    case 'spaced_review':
      return { step, reviewItemIds: [], attemptIds: [] };
    default:
      return { step, attemptIds: [] };
  }
}

export function initialStepState(lessonId: string, step: SessionStep, status: StepStatus = 'locked', options: InitialStepOptions = {}): StepState {
  return {
    lessonId,
    step,
    status,
    enteredAt: null,
    completedAt: null,
    durationMs: 0,
    skipReason: null,
    payload: emptyPayload(step, options),
  };
}

export type StepActor = 'learner' | 'system';

export type StepEvent =
  /** locked -> available. Guard: previous step completed/skipped (none for warmup), or the challenge gate. */
  | { type: 'unlock'; at: string; viaChallengeGate?: boolean }
  /** available -> active (prediction: awaiting_prediction); completed -> active re-enters read-only. */
  | { type: 'enter'; at: string }
  /** Read steps: active -> completed. Prediction: revealed -> completed. Warmup: active -> completed when nothing is due. */
  | {
      type: 'continue';
      at: string;
      durationMs?: number;
      noneDue?: boolean;
      toggles?: number;
      simulation?: { simulator: SimId; finalState: unknown };
    }
  /** Read steps by the learner (confident / move_on); evaluated steps only by the system (challenge_gate / move_on). */
  | { type: 'skip'; at: string; reason: SkipReason; actor: StepActor; durationMs?: number }
  /** Prediction: awaiting_prediction -> predicted, persisted before any reveal. */
  | { type: 'capture'; at: string; predictionId: string; choice: string; durationMs?: number }
  /** Prediction: predicted -> revealed; refused in every other status. */
  | { type: 'reveal'; at: string; durationMs?: number }
  /** Evaluated steps: active -> submitted; on a completed step the attempt is appended without re-completing. */
  | { type: 'submit'; at: string; attemptId: string; durationMs?: number; reviewItemIds?: readonly string[] }
  /** submitted -> completed (deterministic score or LLM end_turn). */
  | { type: 'evaluated'; at: string }
  /** LLM parse failure: -> pending_evaluation, or completed with zero delta once retryCount reaches pendingRetryMax. */
  | { type: 'evaluation_failed'; at: string; retryCount: number }
  /** pending_evaluation -> completed after a successful drain retry. */
  | { type: 'evaluation_resolved'; at: string };

export type TransitionRefusal =
  | 'previous_step_not_done'
  | 'invalid_status'
  | 'not_learner_skippable'
  | 'invalid_skip_reason'
  | 'not_read_step'
  | 'not_evaluated_step'
  | 'not_prediction_step'
  | 'not_predicted'
  | 'already_predicted'
  | 'warmup_has_due_items';

export interface TransitionContext {
  /** State of the step before this one in STEP_ORDER (null for warmup or when unknown). */
  previous: StepState | null;
  /** LLM_CONFIG.pendingRetryMax, passed in so this module carries no LLM numbers. */
  pendingRetryMax: number;
  config?: LearningConfig;
}

export type TransitionResult = { ok: true; state: StepState } | { ok: false; reason: TransitionRefusal; state: StepState };

/** Server-side clamp for client-reported active time. */
export function clampDuration(ms: number, config: LearningConfig = LEARNING_CONFIG): number {
  return Number.isFinite(ms) ? Math.min(Math.max(Math.floor(ms), 0), config.serverClampMs) : 0;
}

function accumulate(state: StepState, durationMs: number | undefined, config: LearningConfig): number {
  const add = durationMs === undefined ? 0 : clampDuration(durationMs, config);
  return Math.min(state.durationMs + add, config.serverClampMs);
}

function uniq(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function appendAttempt(payload: StepPayload, attemptId: string, reviewItemIds: readonly string[] | undefined): StepPayload {
  if (payload.step === 'spaced_review') {
    return {
      ...payload,
      attemptIds: uniq([...payload.attemptIds, attemptId]),
      reviewItemIds: reviewItemIds === undefined ? payload.reviewItemIds : uniq([...payload.reviewItemIds, ...reviewItemIds]),
    };
  }
  if ('attemptIds' in payload) return { ...payload, attemptIds: uniq([...payload.attemptIds, attemptId]) };
  return payload;
}

function readPayload(payload: StepPayload, event: Extract<StepEvent, { type: 'continue' }>): StepPayload {
  if ((payload.step === 'caveman' || payload.step === 'technical') && event.toggles !== undefined) {
    return { ...payload, toggles: Math.max(0, Math.floor(event.toggles)) };
  }
  if (payload.step === 'simulation' && event.simulation !== undefined) {
    return { step: 'simulation', simulator: event.simulation.simulator, finalState: event.simulation.finalState };
  }
  return payload;
}

export function transition(state: StepState, event: StepEvent, ctx: TransitionContext): TransitionResult {
  const config = ctx.config ?? LEARNING_CONFIG;
  const refuse = (reason: TransitionRefusal): TransitionResult => ({ ok: false, reason, state });
  const accept = (patch: Partial<StepState>): TransitionResult => ({ ok: true, state: { ...state, ...patch } });
  const complete = (at: string, durationMs?: number, payload: StepPayload = state.payload): TransitionResult =>
    accept({ status: 'completed', completedAt: state.completedAt ?? at, durationMs: accumulate(state, durationMs, config), payload });

  switch (event.type) {
    case 'unlock': {
      if (state.status !== 'locked') return refuse('invalid_status');
      const prev = previousStep(state.step);
      const previousDone = prev === null || (ctx.previous !== null && ctx.previous.step === prev && isDone(ctx.previous.status));
      if (!previousDone && event.viaChallengeGate !== true) return refuse('previous_step_not_done');
      return accept({ status: 'available' });
    }

    case 'enter': {
      if (state.status !== 'available' && state.status !== 'completed') return refuse('invalid_status');
      const status: StepStatus = state.step === 'prediction' && state.status === 'available' ? 'awaiting_prediction' : 'active';
      return accept({ status, enteredAt: state.enteredAt ?? event.at });
    }

    case 'continue': {
      if (state.step === 'prediction') {
        if (state.status !== 'revealed') return refuse('invalid_status');
        return complete(event.at, event.durationMs);
      }
      if (state.step === 'warmup') {
        if (state.status !== 'active') return refuse('invalid_status');
        if (event.noneDue !== true) return refuse('warmup_has_due_items');
        return complete(event.at, event.durationMs);
      }
      if (!isReadStep(state.step, config)) return refuse('not_read_step');
      if (state.status !== 'active') return refuse('invalid_status');
      return complete(event.at, event.durationMs, readPayload(state.payload, event));
    }

    case 'skip': {
      if (isDone(state.status)) return refuse('invalid_status');
      if (isReadStep(state.step, config)) {
        if (event.actor === 'learner' && state.status !== 'active' && state.status !== 'available') return refuse('invalid_status');
      } else {
        if (event.actor !== 'system') return refuse('not_learner_skippable');
        if (event.reason === 'confident') return refuse('invalid_skip_reason');
      }
      return accept({
        status: 'skipped',
        skipReason: event.reason,
        completedAt: state.completedAt ?? event.at,
        durationMs: accumulate(state, event.durationMs, config),
      });
    }

    case 'capture': {
      if (state.step !== 'prediction') return refuse('not_prediction_step');
      if (state.status === 'predicted' || state.status === 'revealed' || state.status === 'completed') return refuse('already_predicted');
      if (state.status !== 'awaiting_prediction' && state.status !== 'active') return refuse('invalid_status');
      return accept({
        status: 'predicted',
        payload: { step: 'prediction', predictionId: event.predictionId, choice: event.choice, capturedAt: event.at, revealedAt: null },
        durationMs: accumulate(state, event.durationMs, config),
      });
    }

    case 'reveal': {
      if (state.step !== 'prediction') return refuse('not_prediction_step');
      if (state.status !== 'predicted' || state.payload.step !== 'prediction') return refuse('not_predicted');
      return accept({
        status: 'revealed',
        payload: { ...state.payload, revealedAt: event.at },
        durationMs: accumulate(state, event.durationMs, config),
      });
    }

    case 'submit': {
      if (!isEvaluatedStep(state.step, config) || state.step === 'prediction') return refuse('not_evaluated_step');
      if (state.status !== 'active' && state.status !== 'completed') return refuse('invalid_status');
      const status: StepStatus = state.status === 'completed' ? 'completed' : 'submitted';
      return accept({
        status,
        payload: appendAttempt(state.payload, event.attemptId, event.reviewItemIds),
        durationMs: accumulate(state, event.durationMs, config),
      });
    }

    case 'evaluated': {
      if (state.status === 'completed') return accept({});
      if (state.status !== 'submitted') return refuse('invalid_status');
      return complete(event.at);
    }

    case 'evaluation_failed': {
      if (state.status === 'completed') return accept({});
      if (state.status !== 'submitted' && state.status !== 'pending_evaluation') return refuse('invalid_status');
      if (event.retryCount >= ctx.pendingRetryMax) return complete(event.at);
      return accept({ status: 'pending_evaluation' });
    }

    case 'evaluation_resolved': {
      if (state.status === 'completed') return accept({});
      if (state.status !== 'pending_evaluation') return refuse('invalid_status');
      return complete(event.at);
    }
  }
}
