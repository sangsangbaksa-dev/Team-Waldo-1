import { describe, expect, it } from 'vitest';
import { Battle, validArmy, type Placement } from '../src/squad/sim';
import { buildArmy } from '../src/squad/ai';
import { parseArmy } from '../src/squad/net';
function run(a: Placement[], b: Placement[], seed = 5): Battle { const sim = new Battle(a, b, seed); while (sim.winner === null) sim.step(); return sim; }
describe('squad battle', () => {
  const blue: Placement[] = [{ type: 'guard', x: 4, y: 11 }, { type: 'archer', x: 5, y: 14 }, { type: 'striker', x: 7, y: 11 }];
  const red: Placement[] = blue.map(p => ({ ...p, y: 19 - p.y }));
  it('is deterministic', () => { expect(run(blue, red, 42)).toEqual(run(blue, red, 42)); });
  it('keeps mirrored armies close', () => { const b = run(blue, red); const hp = (s: number) => b.units.filter(u => u.side === s).reduce((n, u) => n + Math.max(0, u.hp), 0); expect(Math.abs(hp(0) - hp(1))).toBeLessThan(100); });
  it('builds legal armies on both sides at every difficulty', () => { for (const d of ['easy', 'normal', 'hard'] as const) for (const s of [0, 1] as const) expect(validArmy(buildArmy(s, d, blue), s)).toBe(true); });
  it.each([['guard', 'striker'], ['striker', 'archer'], ['archer', 'guard']] as const)('%s counters %s', (a, b) => { expect(run([{ type: a, x: 5, y: 10 }], [{ type: b, x: 5, y: 9 }]).winner).toBe(0); });
});
describe('squad online messages', () => {
  it('accepts only well-formed armies', () => {
    expect(parseArmy([{ type: 'guard', x: 3, y: 4 }])).toEqual([{ type: 'guard', x: 3, y: 4 }]);
    for (const bad of [null, 'x', [{ type: 'dragon', x: 1, y: 1 }], [{ type: 'guard', x: 1.5, y: 1 }], [{ type: 'guard', x: 1 }], Array.from({ length: 41 }, () => ({ type: 'guard', x: 1, y: 1 }))]) expect(parseArmy(bad)).toBeNull();
  });
});
