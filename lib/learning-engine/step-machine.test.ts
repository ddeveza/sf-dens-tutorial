import { describe, expect, it } from 'vitest';
import { LEARNING_CONFIG } from './config.ts';
import {
  initialStepState,
  isDone,
  isEvaluatedStep,
  isReadStep,
  nextStep,
  previousStep,
  segmentOf,
  STEP_ORDER,
  transition,
  type StepEvent,
  type TransitionContext,
} from './step-machine.ts';
import { LESSON_STEPS, type SessionStep, type StepState } from './types.ts';
import { NOW, stepState } from './test-fixtures.ts';

const LATER = '2026-09-07T10:05:00.000Z';
const PENDING_RETRY_MAX = 3;

function ctx(previous: StepState | null = null, over: Partial<TransitionContext> = {}): TransitionContext {
  return { previous, pendingRetryMax: PENDING_RETRY_MAX, ...over };
}

function run(state: StepState, events: StepEvent[], context: TransitionContext = ctx()): StepState {
  let current = state;
  for (const event of events) {
    const result = transition(current, event, context);
    if (!result.ok) throw new Error(`transition ${event.type} refused: ${result.reason}`);
    current = result.state;
  }
  return current;
}

describe('STEP_ORDER and step classification', () => {
  it('starts with warmup followed by the eleven lesson steps in fixed order', () => {
    expect(STEP_ORDER).toEqual(['warmup', ...LESSON_STEPS]);
    expect(STEP_ORDER).toHaveLength(12);
  });

  it('segmentOf reads the per-step table', () => {
    expect(segmentOf('warmup')).toBe('warm_up');
    expect(segmentOf('caveman')).toBe('learn');
    expect(segmentOf('simulation')).toBe('deep_dive');
    expect(segmentOf('prediction')).toBe('deep_dive');
    expect(segmentOf('hands_on')).toBe('lab');
    expect(segmentOf('teach_back')).toBe('teach_back');
    expect(segmentOf('spaced_review')).toBe('challenge');
  });

  it('read steps are exactly LEARNING_CONFIG.readSteps; the rest (minus warmup) are evaluated', () => {
    for (const step of STEP_ORDER) {
      expect(isReadStep(step)).toBe(LEARNING_CONFIG.readSteps.includes(step));
    }
    expect(isEvaluatedStep('warmup')).toBe(true);
    expect(isEvaluatedStep('prediction')).toBe(true);
    expect(isEvaluatedStep('hands_on')).toBe(true);
    expect(isEvaluatedStep('caveman')).toBe(false);
    expect(isEvaluatedStep('simulation')).toBe(false);
  });

  it('previousStep / nextStep walk STEP_ORDER', () => {
    expect(previousStep('warmup')).toBeNull();
    expect(previousStep('curiosity')).toBe('warmup');
    expect(nextStep('real_world_scenario')).toBeNull();
    expect(nextStep('technical')).toBe('simulation');
  });

  it('isDone is true only for completed and skipped', () => {
    expect(isDone('completed')).toBe(true);
    expect(isDone('skipped')).toBe(true);
    expect(isDone('active')).toBe(false);
    expect(isDone('pending_evaluation')).toBe(false);
  });

  it('initialStepState builds the payload shape of its step', () => {
    expect(initialStepState('l', 'curiosity').payload).toEqual({ step: 'curiosity' });
    expect(initialStepState('l', 'caveman').payload).toEqual({ step: 'caveman', toggles: 0 });
    expect(initialStepState('l', 'hands_on').payload).toEqual({ step: 'hands_on', attemptIds: [] });
    expect(initialStepState('l', 'spaced_review').payload).toEqual({ step: 'spaced_review', reviewItemIds: [], attemptIds: [] });
    expect(initialStepState('l', 'prediction').payload).toEqual({
      step: 'prediction',
      predictionId: '',
      choice: '',
      capturedAt: '',
      revealedAt: null,
    });
    expect(initialStepState('l', 'simulation', 'locked', { simulator: 'sharing' }).payload).toEqual({
      step: 'simulation',
      simulator: 'sharing',
      finalState: null,
    });
    expect(() => initialStepState('l', 'simulation')).toThrow(TypeError);
  });
});

describe('step transitions: locked->available only after previous completed/skipped; evaluated steps cannot be skipped by learner', () => {
  it('warmup unlocks with no previous step', () => {
    const result = transition(stepState('warmup'), { type: 'unlock', at: NOW }, ctx(null));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.status).toBe('available');
  });

  it('a lesson step stays locked while the previous step is not completed or skipped', () => {
    const refusedNoPrev = transition(stepState('curiosity'), { type: 'unlock', at: NOW }, ctx(null));
    expect(refusedNoPrev).toMatchObject({ ok: false, reason: 'previous_step_not_done' });

    const refusedActive = transition(stepState('curiosity'), { type: 'unlock', at: NOW }, ctx(stepState('warmup', 'active')));
    expect(refusedActive).toMatchObject({ ok: false, reason: 'previous_step_not_done' });

    const wrongPrevious = transition(stepState('caveman'), { type: 'unlock', at: NOW }, ctx(stepState('warmup', 'completed')));
    expect(wrongPrevious).toMatchObject({ ok: false, reason: 'previous_step_not_done' });
  });

  it('unlocks after the previous step is completed or skipped, or through the challenge gate', () => {
    const afterCompleted = transition(stepState('curiosity'), { type: 'unlock', at: NOW }, ctx(stepState('warmup', 'completed')));
    expect(afterCompleted).toMatchObject({ ok: true, state: { status: 'available' } });

    const afterSkipped = transition(stepState('problem'), { type: 'unlock', at: NOW }, ctx(stepState('curiosity', 'skipped')));
    expect(afterSkipped).toMatchObject({ ok: true, state: { status: 'available' } });

    const gate = transition(stepState('assessment'), { type: 'unlock', at: NOW, viaChallengeGate: true }, ctx(null));
    expect(gate).toMatchObject({ ok: true, state: { status: 'available' } });
  });

  it('unlock is refused when the step is not locked', () => {
    expect(transition(stepState('curiosity', 'active'), { type: 'unlock', at: NOW }, ctx(stepState('warmup', 'completed')))).toMatchObject({
      ok: false,
      reason: 'invalid_status',
    });
  });

  it('enter sets enteredAt once and moves available -> active', () => {
    const entered = run(stepState('caveman', 'available'), [{ type: 'enter', at: NOW }]);
    expect(entered.status).toBe('active');
    expect(entered.enteredAt).toBe(NOW);

    const reentered = run({ ...entered, status: 'completed', completedAt: LATER }, [{ type: 'enter', at: LATER }]);
    expect(reentered.status).toBe('active');
    expect(reentered.enteredAt).toBe(NOW);
    expect(reentered.completedAt).toBe(LATER);
  });

  it('read steps complete on Continue and record toggles / simulator state', () => {
    const caveman = run(stepState('caveman', 'available'), [
      { type: 'enter', at: NOW },
      { type: 'continue', at: LATER, toggles: 3, durationMs: 90_000 },
    ]);
    expect(caveman.status).toBe('completed');
    expect(caveman.completedAt).toBe(LATER);
    expect(caveman.durationMs).toBe(90_000);
    expect(caveman.payload).toEqual({ step: 'caveman', toggles: 3 });

    const sim = run(stepState('simulation', 'available'), [
      { type: 'enter', at: NOW },
      { type: 'continue', at: LATER, simulation: { simulator: 'soql-selectivity', finalState: { rows: 12 } } },
    ]);
    expect(sim.payload).toEqual({ step: 'simulation', simulator: 'soql-selectivity', finalState: { rows: 12 } });
  });

  it('Continue is refused on evaluated steps and on steps that are not active', () => {
    expect(transition(stepState('hands_on', 'active'), { type: 'continue', at: NOW }, ctx())).toMatchObject({
      ok: false,
      reason: 'not_read_step',
    });
    expect(transition(stepState('caveman', 'available'), { type: 'continue', at: NOW }, ctx())).toMatchObject({
      ok: false,
      reason: 'invalid_status',
    });
  });

  it('warmup completes on Continue only when nothing is due', () => {
    expect(transition(stepState('warmup', 'active'), { type: 'continue', at: NOW }, ctx())).toMatchObject({
      ok: false,
      reason: 'warmup_has_due_items',
    });
    expect(transition(stepState('warmup', 'active'), { type: 'continue', at: NOW, noneDue: true }, ctx())).toMatchObject({
      ok: true,
      state: { status: 'completed' },
    });
  });

  it('read steps can be skipped by the learner (confident / move_on)', () => {
    const confident = transition(stepState('technical', 'active'), { type: 'skip', at: NOW, reason: 'confident', actor: 'learner' }, ctx());
    expect(confident).toMatchObject({ ok: true, state: { status: 'skipped', skipReason: 'confident', completedAt: NOW } });

    const moveOn = transition(stepState('problem', 'available'), { type: 'skip', at: NOW, reason: 'move_on', actor: 'learner' }, ctx());
    expect(moveOn).toMatchObject({ ok: true, state: { status: 'skipped', skipReason: 'move_on' } });
  });

  it('evaluated steps cannot be skipped by the learner; only the system may, and never as "confident"', () => {
    for (const step of ['warmup', 'prediction', 'hands_on', 'teach_back', 'assessment', 'spaced_review', 'real_world_scenario'] as const) {
      const learner = transition(stepState(step, 'active'), { type: 'skip', at: NOW, reason: 'confident', actor: 'learner' }, ctx());
      expect(learner, step).toMatchObject({ ok: false, reason: 'not_learner_skippable' });
      const learnerMoveOn = transition(stepState(step, 'active'), { type: 'skip', at: NOW, reason: 'move_on', actor: 'learner' }, ctx());
      expect(learnerMoveOn, step).toMatchObject({ ok: false, reason: 'not_learner_skippable' });
    }

    const gate = transition(stepState('assessment', 'locked'), { type: 'skip', at: NOW, reason: 'challenge_gate', actor: 'system' }, ctx());
    expect(gate).toMatchObject({ ok: true, state: { status: 'skipped', skipReason: 'challenge_gate' } });

    const moveOn = transition(stepState('teach_back', 'available'), { type: 'skip', at: NOW, reason: 'move_on', actor: 'system' }, ctx());
    expect(moveOn).toMatchObject({ ok: true, state: { status: 'skipped', skipReason: 'move_on' } });

    const confident = transition(stepState('hands_on', 'active'), { type: 'skip', at: NOW, reason: 'confident', actor: 'system' }, ctx());
    expect(confident).toMatchObject({ ok: false, reason: 'invalid_skip_reason' });
  });

  it('a completed or skipped step cannot be skipped again', () => {
    expect(transition(stepState('caveman', 'completed'), { type: 'skip', at: NOW, reason: 'confident', actor: 'learner' }, ctx())).toMatchObject({
      ok: false,
      reason: 'invalid_status',
    });
    expect(transition(stepState('hands_on', 'skipped'), { type: 'skip', at: NOW, reason: 'move_on', actor: 'system' }, ctx())).toMatchObject({
      ok: false,
      reason: 'invalid_status',
    });
  });
});

describe('prediction: reveal refused unless status predicted; capture persists before reveal', () => {
  it('entering the prediction step lands in awaiting_prediction', () => {
    const entered = run(stepState('prediction', 'available'), [{ type: 'enter', at: NOW }]);
    expect(entered.status).toBe('awaiting_prediction');
    expect(entered.enteredAt).toBe(NOW);
  });

  it('reveal is refused before a capture', () => {
    const entered = run(stepState('prediction', 'available'), [{ type: 'enter', at: NOW }]);
    expect(transition(entered, { type: 'reveal', at: LATER }, ctx())).toMatchObject({ ok: false, reason: 'not_predicted' });
    expect(transition(stepState('prediction', 'active'), { type: 'reveal', at: LATER }, ctx())).toMatchObject({ ok: false, reason: 'not_predicted' });
  });

  it('capture persists the choice with capturedAt and no revealedAt; reveal then stamps revealedAt', () => {
    const captured = run(stepState('prediction', 'available'), [
      { type: 'enter', at: NOW },
      { type: 'capture', at: NOW, predictionId: 'p-1', choice: 'B' },
    ]);
    expect(captured.status).toBe('predicted');
    expect(captured.payload).toEqual({ step: 'prediction', predictionId: 'p-1', choice: 'B', capturedAt: NOW, revealedAt: null });

    const revealed = run(captured, [{ type: 'reveal', at: LATER }]);
    expect(revealed.status).toBe('revealed');
    expect(revealed.payload).toEqual({ step: 'prediction', predictionId: 'p-1', choice: 'B', capturedAt: NOW, revealedAt: LATER });

    const completed = run(revealed, [{ type: 'continue', at: LATER }]);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBe(LATER);
  });

  it('a prediction is captured once', () => {
    const captured = run(stepState('prediction', 'available'), [
      { type: 'enter', at: NOW },
      { type: 'capture', at: NOW, predictionId: 'p-1', choice: 'B' },
    ]);
    expect(transition(captured, { type: 'capture', at: LATER, predictionId: 'p-1', choice: 'C' }, ctx())).toMatchObject({
      ok: false,
      reason: 'already_predicted',
    });
    const revealed = run(captured, [{ type: 'reveal', at: LATER }]);
    expect(transition(revealed, { type: 'reveal', at: LATER }, ctx())).toMatchObject({ ok: false, reason: 'not_predicted' });
  });

  it('capture and reveal apply only to the prediction step; Continue on prediction needs revealed', () => {
    expect(transition(stepState('hands_on', 'active'), { type: 'capture', at: NOW, predictionId: 'p', choice: 'A' }, ctx())).toMatchObject({
      ok: false,
      reason: 'not_prediction_step',
    });
    expect(transition(stepState('hands_on', 'active'), { type: 'reveal', at: NOW }, ctx())).toMatchObject({
      ok: false,
      reason: 'not_prediction_step',
    });
    expect(transition(stepState('prediction', 'predicted'), { type: 'continue', at: NOW }, ctx())).toMatchObject({
      ok: false,
      reason: 'invalid_status',
    });
  });
});

describe('evaluated steps: submit / evaluated / pending_evaluation', () => {
  it('submit records the attempt id and moves active -> submitted; evaluated completes', () => {
    const submitted = run(stepState('hands_on', 'available'), [
      { type: 'enter', at: NOW },
      { type: 'submit', at: LATER, attemptId: 'a-1', durationMs: 120_000 },
    ]);
    expect(submitted.status).toBe('submitted');
    expect(submitted.payload).toEqual({ step: 'hands_on', attemptIds: ['a-1'] });
    expect(submitted.durationMs).toBe(120_000);

    const completed = run(submitted, [{ type: 'evaluated', at: LATER }]);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBe(LATER);
  });

  it('spaced_review submissions carry the review item ids they answered', () => {
    const state = run(stepState('spaced_review', 'available'), [
      { type: 'enter', at: NOW },
      { type: 'submit', at: NOW, attemptId: 'a-1', reviewItemIds: ['r-1'] },
      { type: 'evaluated', at: NOW },
      { type: 'submit', at: LATER, attemptId: 'a-2', reviewItemIds: ['r-2', 'r-1'] },
    ]);
    expect(state.payload).toEqual({ step: 'spaced_review', reviewItemIds: ['r-1', 'r-2'], attemptIds: ['a-1', 'a-2'] });
  });

  it('extra attempts on a completed step record evidence but never re-complete the step', () => {
    const completed = run(stepState('assessment', 'available'), [
      { type: 'enter', at: NOW },
      { type: 'submit', at: NOW, attemptId: 'a-1' },
      { type: 'evaluated', at: NOW },
    ]);
    const extra = run(completed, [
      { type: 'submit', at: LATER, attemptId: 'a-2' },
      { type: 'evaluated', at: LATER },
    ]);
    expect(extra.status).toBe('completed');
    expect(extra.completedAt).toBe(NOW);
    expect(extra.payload).toEqual({ step: 'assessment', attemptIds: ['a-1', 'a-2'] });
  });

  it('submit is refused on read steps, on prediction, and outside active/completed', () => {
    expect(transition(stepState('caveman', 'active'), { type: 'submit', at: NOW, attemptId: 'a' }, ctx())).toMatchObject({
      ok: false,
      reason: 'not_evaluated_step',
    });
    expect(transition(stepState('prediction', 'predicted'), { type: 'submit', at: NOW, attemptId: 'a' }, ctx())).toMatchObject({
      ok: false,
      reason: 'not_evaluated_step',
    });
    expect(transition(stepState('hands_on', 'submitted'), { type: 'submit', at: NOW, attemptId: 'a' }, ctx())).toMatchObject({
      ok: false,
      reason: 'invalid_status',
    });
    expect(transition(stepState('hands_on', 'locked'), { type: 'evaluated', at: NOW }, ctx())).toMatchObject({
      ok: false,
      reason: 'invalid_status',
    });
  });

  it('pending_evaluation completes with zero delta after LLM_CONFIG.pendingRetryMax', () => {
    const submitted = run(stepState('teach_back', 'available'), [
      { type: 'enter', at: NOW },
      { type: 'submit', at: NOW, attemptId: 'a-1' },
    ]);

    const pending0 = run(submitted, [{ type: 'evaluation_failed', at: NOW, retryCount: 0 }]);
    expect(pending0.status).toBe('pending_evaluation');
    expect(pending0.completedAt).toBeNull();

    const pending2 = run(pending0, [
      { type: 'evaluation_failed', at: NOW, retryCount: 1 },
      { type: 'evaluation_failed', at: NOW, retryCount: 2 },
    ]);
    expect(pending2.status).toBe('pending_evaluation');

    const exhausted = run(pending2, [{ type: 'evaluation_failed', at: LATER, retryCount: PENDING_RETRY_MAX }]);
    expect(exhausted.status).toBe('completed');
    expect(exhausted.completedAt).toBe(LATER);
    expect(exhausted.payload).toEqual({ step: 'teach_back', attemptIds: ['a-1'] });
  });

  it('a successful retry resolves pending_evaluation to completed', () => {
    const pending = run(stepState('real_world_scenario', 'active'), [
      { type: 'submit', at: NOW, attemptId: 'a-1' },
      { type: 'evaluation_failed', at: NOW, retryCount: 0 },
    ]);
    const resolved = run(pending, [{ type: 'evaluation_resolved', at: LATER }]);
    expect(resolved.status).toBe('completed');
    expect(resolved.completedAt).toBe(LATER);

    expect(transition(stepState('real_world_scenario', 'active'), { type: 'evaluation_resolved', at: NOW }, ctx())).toMatchObject({
      ok: false,
      reason: 'invalid_status',
    });
  });

  it('evaluation events on an already completed step are no-ops (extra attempts)', () => {
    const completed = stepState('assessment', 'completed', { completedAt: NOW });
    expect(transition(completed, { type: 'evaluation_failed', at: LATER, retryCount: 0 }, ctx())).toMatchObject({
      ok: true,
      state: { status: 'completed', completedAt: NOW },
    });
    expect(transition(completed, { type: 'evaluation_resolved', at: LATER }, ctx())).toMatchObject({
      ok: true,
      state: { status: 'completed', completedAt: NOW },
    });
  });
});

describe('duration accounting', () => {
  it('accumulates client-reported time and clamps at serverClampMs', () => {
    const state = run(stepState('hands_on', 'active', { durationMs: 10_700_000 }), [
      { type: 'submit', at: NOW, attemptId: 'a-1', durationMs: 500_000 },
    ]);
    expect(state.durationMs).toBe(LEARNING_CONFIG.serverClampMs);
  });

  it('ignores negative or fractional garbage', () => {
    const state = run(stepState('caveman', 'active', { durationMs: 1_000 }), [{ type: 'continue', at: NOW, durationMs: -5_000 }]);
    expect(state.durationMs).toBe(1_000);
    const frac = run(stepState('caveman', 'active'), [{ type: 'continue', at: NOW, durationMs: 1234.9 }]);
    expect(frac.durationMs).toBe(1234);
  });
});

describe('a full happy-path day', () => {
  it('walks every step from locked to completed using only documented transitions', () => {
    let previous: StepState | null = null;
    const finished: StepState[] = [];
    for (const step of STEP_ORDER as readonly SessionStep[]) {
      const initial = initialStepState('l', step, 'locked', { simulator: 'governor-limits' });
      const context = ctx(previous);
      const events: StepEvent[] = [{ type: 'unlock', at: NOW }, { type: 'enter', at: NOW }];
      if (step === 'warmup') events.push({ type: 'continue', at: LATER, noneDue: true });
      else if (isReadStep(step)) events.push({ type: 'continue', at: LATER });
      else if (step === 'prediction') {
        events.push({ type: 'capture', at: NOW, predictionId: 'p', choice: 'A' }, { type: 'reveal', at: LATER }, { type: 'continue', at: LATER });
      } else events.push({ type: 'submit', at: NOW, attemptId: `a-${step}` }, { type: 'evaluated', at: LATER });
      const done = run(initial, events, context);
      expect(done.status).toBe('completed');
      finished.push(done);
      previous = done;
    }
    expect(finished).toHaveLength(12);
  });
});
