import { describe, expect, it } from 'vitest';
import { PerfectCoverTracker } from '../../src/slack/cover-timing';

const approaching = { mode: 'approach' as const, prog: 0.7, t: 2 };
const peek = { mode: 'peek' as const, prog: 0, t: 0.2 };

describe('perfect-cover tracker', () => {
  it('awards only once per patrol, then resets on the next patrol', () => {
    const tracker = new PerfectCoverTracker();
    tracker.advance(0.6, true);
    expect(tracker.cover(approaching, true, false)).toBe(true);
    tracker.advance(0.6, true);
    expect(tracker.cover(approaching, true, false)).toBe(false);
    tracker.nextPatrol();
    tracker.advance(0.6, true);
    expect(tracker.cover(peek, true, false)).toBe(true);
  });

  it('does not award forced covers, idle covers or premature covers', () => {
    const tracker = new PerfectCoverTracker();
    tracker.advance(1, true);
    expect(tracker.cover(approaching, true, true)).toBe(false);
    tracker.advance(1, true);
    expect(tracker.cover(approaching, false, false)).toBe(false);
    tracker.advance(0.3, true);
    expect(tracker.cover(approaching, true, false)).toBe(false);
    tracker.advance(1, true);
    expect(tracker.cover({ ...approaching, prog: 0.98 }, true, false)).toBe(false);
  });

  it('requires actual continuous exposure and prevents immediate button spam', () => {
    const tracker = new PerfectCoverTracker();
    tracker.advance(0.5, true);
    tracker.advance(0.3, false);
    tracker.advance(0.3, true);
    expect(tracker.cover(approaching, true, false)).toBe(false);
    expect(tracker.cover(approaching, true, false)).toBe(false);
    tracker.advance(0.6, true);
    tracker.clearExposure();
    expect(tracker.cover(approaching, true, false)).toBe(false);
  });
});
