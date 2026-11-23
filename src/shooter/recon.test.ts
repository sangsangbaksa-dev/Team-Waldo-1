import { describe, expect, it } from 'vitest';
import { freshRecon, RECON, useRecon, type ReconOperator, type ReconUnit } from './recon';

const agent = (): ReconOperator => ({ id: 0, x: 0, z: 0, alive: true, air: 0, veh: -1 });
const enemy = (id: number, x: number, z = 0): ReconUnit => ({ id, x, z, alive: true, air: 0 });

describe('ZERO ZONE reconnaissance pulse', () => {
  it('reveals a snapshot of up to six nearest grounded enemies within range', () => {
    const me = agent(), state = freshRecon(), far = enemy(40, RECON.range + 1);
    const units = [me, far, { ...enemy(8, 2), alive: false }, { ...enemy(9, 3), air: 2 },
      ...Array.from({ length: 8 }, (_, i) => enemy(i + 1, 10 + i * 4))];
    const used = useRecon(state, 80, me, units)!;
    expect(used.found).toBe(6);
    expect(used.state.marks.map(m => m.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(used.state.marks[0]).toEqual({ id: 1, x: 10, z: 0, expires: 80 + RECON.duration });
    expect(state).toEqual(freshRecon());
    units[4].x = 99;
    expect(used.state.marks[0].x).toBe(10);
  });

  it('limits usage to two pulses with cooldown and resets only for a new match', () => {
    const me = agent(), first = useRecon(freshRecon(), 30, me, [])!;
    expect(first.found).toBe(0);
    expect(useRecon(first.state, 30 + RECON.cooldown - 0.01, me, [])).toBeNull();
    const second = useRecon(first.state, 30 + RECON.cooldown, me, [])!;
    expect(second.state.charges).toBe(0);
    expect(useRecon(second.state, 300, me, [])).toBeNull();
    expect(freshRecon().charges).toBe(2);
  });

  it('does not consume a pulse while dead, airborne, or driving', () => {
    const state = freshRecon(), me = agent();
    expect(useRecon(state, 20, { ...me, alive: false }, [])).toBeNull();
    expect(useRecon(state, 20, { ...me, air: 1 }, [])).toBeNull();
    expect(useRecon(state, 20, { ...me, air: 3 }, [])).toBeNull();
    expect(useRecon(state, 20, { ...me, veh: 0 }, [])).toBeNull();
    expect(useRecon(state, Number.NaN, me, [])).toBeNull();
    expect(state.charges).toBe(2);
  });

  it('detects enemies exactly on the range boundary, but never oneself', () => {
    const me = agent(), used = useRecon(freshRecon(), 1, me, [me, enemy(1, RECON.range), enemy(2, RECON.range + 0.01)])!;
    expect(used.state.marks.map(m => m.id)).toEqual([1]);
  });
});
