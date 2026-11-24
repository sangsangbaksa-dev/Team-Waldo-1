import { describe, expect, it } from 'vitest';
import { SoloSession } from '../src/application/session.js';
import { neutralInput, TICK } from '../src/domain/combat.js';
import { createWorld } from '../src/domain/world.js';

describe('solo session snapshots', () => {
  it('reuses a snapshot until a simulation tick, and refreshes after a tick or restart', () => {
    const session = new SoloSession(createWorld(), 'NOMAD');
    const initial = session.snapshot;
    expect(session.snapshot).toBe(initial);
    session.update(neutralInput(), TICK / 2);
    expect(session.snapshot).toBe(initial);
    session.update(neutralInput(), TICK / 2);
    const advanced = session.snapshot;
    expect(advanced).not.toBe(initial);
    expect(advanced.time).toBeGreaterThan(initial.time);
    expect(session.snapshot).toBe(advanced);
    session.restart();
    expect(session.snapshot).not.toBe(advanced);
  });
});
