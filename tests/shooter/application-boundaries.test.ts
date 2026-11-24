import { describe, expect, it } from 'vitest';
import { composeInput, type InputState } from '../../src/shooter/application/input';
import { advanceMatch, fastForward, roomFillOf } from '../../src/shooter/application/match-flow';
import { BR_PLAYERS } from '../../src/shooter/config';
import { findInteraction } from '../../src/shooter/application/interaction';
import { interactionLabel } from '../../src/shooter/ui/interaction-label';
import { Match } from '../../src/shooter/sim';

const state = (overrides: Partial<InputState> = {}): InputState => ({
  keys: new Set(), mouse: { fire: false, ads: false },
  touch: { fire: false, ads: false, crouch: false, move: { x: 0, y: 0 } },
  active: true, yaw: 0, pitch: 0, dt: 0.1,
  air: 0, vehicle: -1, currentSlot: 0, hasOtherGun: true,
  nade: false, smoke: false, flash: false, heal: 0, reload: false, interact: false,
  jumpQueued: false, slot: -1, swap: false, ...overrides,
});

describe('shooter application boundaries', () => {
  it('selects available interaction independently of HUD copy', () => {
    const match = new Match({ seed: 7, mode: 'duel', difficulty: 'normal', humans: [{ name: 'A' }], fill: 1 });
    const p = match.players[0];
    match.loot = [{ id: 1, kind: 'weapon', weapon: 'rifle', x: p.x, z: p.z, taken: true },
      { id: 2, kind: 'weapon', weapon: 'smg', x: p.x, z: p.z, taken: false }];
    const found = findInteraction(match, p);
    expect(found).toEqual({ kind: 'weapon', weapon: 'smg' });
    expect(interactionLabel(found)).toBe('기관단총');
    p.alive = false;
    expect(findInteraction(match, p)).toBeNull();
  });
  it('routes arrow keys to aiming only while keyboard ADS is held', () => {
    const keys = new Set(['KeyK', 'ArrowRight', 'ArrowUp']);
    const aimed = composeInput(state({ keys, pitch: 1.39 }));
    expect(aimed.looked).toBe(true);
    expect(aimed.input.yaw).toBeCloseTo(0.08);
    expect(aimed.input.pitch).toBe(1.4);
    expect(aimed.input.mx).toBe(0);
    expect(aimed.input.mz).toBe(0);
    const walking = composeInput(state({ keys: new Set(['ArrowRight', 'ArrowUp']) }));
    expect(walking.input.mx).toBe(1);
    expect(walking.input.mz).toBe(1);
  });
  it('suppresses combat input when inactive and handles slot swaps', () => {
    const input = composeInput(state({ active: false, keys: new Set(['KeyJ', 'Space', 'KeyW']), nade: true, heal: 2, reload: true, swap: true })).input;
    expect(input).toMatchObject({ fire: false, jump: false, mx: 0, mz: 0, nade: false, heal: 0, reload: false, slot: -1 });
    expect(composeInput(state({ swap: true })).input.slot).toBe(1);
    expect(composeInput(state({ swap: true, hasOtherGun: false })).input.slot).toBe(-1);
  });
  it('preserves the order of synchronization and simulation, including a partial tick', () => {
    const order: string[] = [], steps: number[] = [];
    advanceMatch({ step: dt => { order.push('step'); steps.push(dt); } }, 0.04, () => order.push('sync'));
    expect(order).toEqual(['sync', 'step', 'sync', 'step', 'sync', 'step']);
    expect(steps.reduce((a, b) => a + b, 0)).toBeCloseTo(0.04);
  });
  it('bounds room fill and stops fast-forward on completion', () => {
    expect(roomFillOf({ fill: Infinity }, 2)).toBe(0);
    expect(roomFillOf({ fill: 1 }, 3)).toBe(3);
    expect(roomFillOf({ fill: 9999 }, 3)).toBe(BR_PLAYERS);
    let steps = 0, drains = 0;
    const match = { over: false, winner: 0, step() { if (++steps === 2) this.over = true; }, drain() { drains++; return []; } };
    expect(fastForward(match, 10)).toBe(0);
    expect(drains).toBe(2);
  });
});
