import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shooter/sim';
import { emptyTerrain, groundHeight } from '../../src/shooter/terrain';
import { lineClear } from '../../src/shooter/world';

function shellDamage(hill: boolean): number {
  const m = new Match({
    seed: 3, mode: 'duel', difficulty: 'normal',
    humans: [{ name: 'Target' }, { name: 'Other' }], fill: 2,
  });
  m.map.boxes = []; m.map.grid.clear(); m.map.terrain = emptyTerrain();
  if (hill) m.map.terrain.rises.push({ x: 0, z: 0, r: 5, h: 5 });
  const target = m.players[0];
  target.x = 3; target.z = 0;
  m.players[1].x = 60; m.players[1].z = 60;
  const shellY = groundHeight(m.map.terrain, -3, 0) + 0.4;
  const targetY = groundHeight(m.map.terrain, 3, 0) + 1.2;
  expect(lineClear(m.map, -3, shellY, 0, 3, targetY, 0)).toBe(!hill);
  m.reds = []; m.shells = [{ id: 1, x: -3, z: 0, t0: 0, land: 0 }];
  m.step(1 / 60);
  return 100 - target.hp;
}

describe('ZERO ZONE artillery damage behind terrain', () => {
  it('reduces artillery blast damage when a hill blocks line of sight', () => {
    const open = shellDamage(false), covered = shellDamage(true);
    expect(open).toBeGreaterThan(15);
    expect(covered).toBeGreaterThan(1);
    expect(covered).toBeLessThan(open * 0.4);
  });
});
