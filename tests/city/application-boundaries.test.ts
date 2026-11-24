import { describe, expect, it } from 'vitest';
import { MatchClock } from '../../src/city/application/match-clock';
import { selectAimTarget } from '../../src/city/domain/aim-target';
import { aimLabel } from '../../src/city/ui/aim-label';
import { World } from '../../src/city/world';

describe('city match boundaries', () => {
  it('keeps fractional tick debt and drops excessive catch-up work', () => {
    const clock = new MatchClock(), ticks: number[] = [];
    let effects = 0;
    const world = { step: (dt: number) => { ticks.push(dt); } };
    const advance = (dt: number) => clock.advance(world, dt, () => { effects++; });
    advance(1 / 120); expect(ticks).toHaveLength(0);
    advance(1 / 120); expect(ticks).toEqual([1 / 60]);
    advance(1); expect(ticks).toHaveLength(5);
    advance(0); expect(effects).toBe(5);
    advance(1 / 120); clock.reset(); advance(1 / 120);
    expect(ticks).toHaveLength(5);
  });

  it('selects visible entities independently of HTML, excluding dead or hidden actors', () => {
    const world = new World({ seed: 7, difficulty: 'd3', klass: 'warlord' });
    const boss = world.boss(0)!;
    const a = { ...boss, id: -1, f: 1, x: boss.x + 100 };
    const b = { ...a, id: -2, x: boss.x + 50 };
    const fixture = { boss: () => boss, inside: null, factions: world.factions,
      actors: [boss, a, b], structures: [], canSee: (_x: number, _y: number, x: number) => x !== b.x,
      hostile: (f: number, g: number) => f !== g };
    const target = selectAimTarget(fixture, 0);
    expect(target).toEqual({ kind: 'actor', entity: a, hostile: true });
    expect(aimLabel(target)).toContain('<b');
    a.alive = false;
    expect(selectAimTarget(fixture, 0)).toBeNull();
    expect(aimLabel(null)).toBe('');
  });
});
