import { describe, expect, it } from 'vitest';
import { MASTERY_CONFIG } from './config.ts';
import { expireHeld, heldExpiry, holdCredit, releaseFactor, releaseHeld, understandingBandFor } from './held.ts';
import { addDays } from './time.ts';
import { NOW, stateWith } from './test-fixtures.ts';
import type { HeldCredit } from './types.ts';

const cfg = MASTERY_CONFIG;

function credit(overrides: Partial<HeldCredit> = {}): HeldCredit {
  return { attemptId: 'a1', dimension: 'recall', delta: 50, expiresAt: addDays(NOW, cfg.heldExpiryDays), ...overrides };
}

describe('understanding bands and release factor', () => {
  it('maps understanding onto weak / adequate / strong', () => {
    expect(understandingBandFor(0, cfg)).toBe('weak');
    expect(understandingBandFor(49, cfg)).toBe('weak');
    expect(understandingBandFor(50, cfg)).toBe('adequate');
    expect(understandingBandFor(69, cfg)).toBe('adequate');
    expect(understandingBandFor(70, cfg)).toBe('strong');
    expect(understandingBandFor(100, cfg)).toBe('strong');
  });

  it('release factor is 1.0 / 0.5 / 0.1 by band', () => {
    expect(releaseFactor(80, cfg)).toBe(1);
    expect(releaseFactor(60, cfg)).toBe(0.5);
    expect(releaseFactor(30, cfg)).toBe(0.1);
  });
});

describe('held credit lifecycle', () => {
  it('heldExpiry is now + heldExpiryDays', () => {
    expect(heldExpiry(NOW, cfg)).toBe('2026-09-14T10:00:00.000Z');
  });

  it('holdCredit appends without mutating', () => {
    const s = stateWith({ recall: { score: 0, n: 1 } });
    const out = holdCredit(s, credit());
    expect(out.held).toHaveLength(1);
    expect(s.held).toHaveLength(0);
  });

  it('released 1.0 / 0.5 / 0.1 by understanding band', () => {
    const s = holdCredit(stateWith({ recall: { score: 0, n: 1 } }), credit());
    const strong = releaseHeld(s, 80, NOW, cfg);
    expect(strong.state.dims.recall.score).toBe(50);
    expect(strong.updates).toEqual([{ dimension: 'recall', before: 0, after: 50, delta: 50 }]);
    expect(strong.state.held).toEqual([]);

    const adequate = releaseHeld(s, 60, NOW, cfg);
    expect(adequate.state.dims.recall.score).toBe(25);

    const weak = releaseHeld(s, 30, NOW, cfg);
    expect(weak.state.dims.recall.score).toBe(5);
    expect(weak.updates).toEqual([{ dimension: 'recall', before: 0, after: 5, delta: 5 }]);
  });

  it('release merges several credits on one dimension and clamps at 100', () => {
    const s = holdCredit(holdCredit(stateWith({ recall: { score: 90, n: 2 } }), credit()), credit({ attemptId: 'a2' }));
    const out = releaseHeld(s, 90, NOW, cfg);
    expect(out.state.dims.recall.score).toBe(100);
    expect(out.updates).toEqual([{ dimension: 'recall', before: 90, after: 100, delta: 10 }]);
  });

  it('expired credit is discarded after heldExpiryDays and never released', () => {
    const s = holdCredit(stateWith({ recall: { score: 0, n: 1 } }), credit());
    const kept = expireHeld(s, addDays(NOW, cfg.heldExpiryDays - 0.01));
    expect(kept.held).toHaveLength(1);

    const dropped = expireHeld(s, addDays(NOW, cfg.heldExpiryDays));
    expect(dropped.held).toHaveLength(0);

    const late = releaseHeld(s, 90, addDays(NOW, cfg.heldExpiryDays + 1), cfg);
    expect(late.updates).toEqual([]);
    expect(late.state.dims.recall.score).toBe(0);
    expect(late.state.held).toEqual([]);
  });

  it('release with nothing held is a no-op', () => {
    const s = stateWith({ recall: { score: 10, n: 1 } });
    const out = releaseHeld(s, 90, NOW, cfg);
    expect(out.updates).toEqual([]);
    expect(out.state.dims.recall.score).toBe(10);
  });
});
