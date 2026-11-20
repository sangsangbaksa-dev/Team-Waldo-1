import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../src/tycoon/core';
import { Colliders, GRID, PITCH, START, WALK_EDGE, WORLD_HALF, blockTier, blockUnlocked, buildLayout, hash01, zoneOf } from '../../src/tycoon/scene/layout';

describe('tycoon world layout', () => {
  const layout = buildLayout(SPOTS);

  it('builds a full grid of blocks', () => {
    expect(layout.blocks).toHaveLength(GRID * GRID);
  });

  it('places every spot on a lot inside its own district', () => {
    for (const s of SPOTS) {
      const lot = layout.spotLots.get(s.id);
      expect(lot, s.id).toBeTruthy();
      expect(lot!.block.zone, s.id).toBe(s.district);
    }
    const lots = [...layout.spotLots.values()];
    expect(new Set(lots).size).toBe(lots.length);
  });

  it('spawns the player inside the world, near the start block', () => {
    const { x, z } = layout.spawn;
    expect(Math.abs(x)).toBeLessThan(WORLD_HALF);
    expect(Math.abs(z)).toBeLessThan(WORLD_HALF);
    expect(Math.hypot(x - START.i * PITCH, z - START.j * PITCH)).toBeLessThan(PITCH * 1.5);
  });

  it('keeps door points on the sidewalk edge', () => {
    for (const lot of layout.lots) {
      const dx = Math.abs(lot.doorX - lot.block.cx), dz = Math.abs(lot.doorZ - lot.block.cz);
      expect(Math.max(dx, dz)).toBeCloseTo(WALK_EDGE, 5);
    }
  });

  it('opens the starting block at the first stage and never closes one as stages advance', () => {
    const start = layout.blocks.find(b => b.i === START.i && b.j === START.j)!;
    expect(blockUnlocked(start, 0)).toBe(true);
    for (const b of layout.blocks) {
      let was = false;
      for (let st = 0; st <= 6; st++) {
        const now = blockUnlocked(b, st);
        expect(was && !now, `${b.i},${b.j}@${st}`).toBe(false);
        was = now;
        expect(blockTier(b, st)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('assigns known zones and is deterministic', () => {
    expect(zoneOf(START.i, START.j)).toBe('slum');
    expect(buildLayout(SPOTS).spawn).toEqual(layout.spawn);
    expect(hash01(3, 7)).toBe(hash01(3, 7));
    expect(hash01(3, 7)).toBeGreaterThanOrEqual(0);
    expect(hash01(3, 7)).toBeLessThan(1);
  });
});

describe('Colliders', () => {
  const layout = buildLayout(SPOTS), b = layout.blocks[0], c = new Colliders();
  c.set(b, [{ x0: b.cx - 2, x1: b.cx + 2, z0: b.cz - 2, z1: b.cz + 2 }]);
  const out = { x: 0, z: 0 };

  it('pushes a circle out of a box', () => {
    expect(c.resolve(b.cx + 2.2, b.cz, 0.5, out)).toBe(true);
    expect(out.x).toBeGreaterThanOrEqual(b.cx + 2.5 - 1e-6);
  });
  it('leaves free space alone', () => {
    expect(c.resolve(b.cx + 10, b.cz + 10, 0.5, out)).toBe(false);
  });
  it('ejects a point that ended up inside the box', () => {
    c.resolve(b.cx + 0.5, b.cz, 0.5, out);
    expect(Math.abs(out.x - b.cx) >= 2.5 - 1e-6 || Math.abs(out.z - b.cz) >= 2.5 - 1e-6).toBe(true);
  });
});

describe('Colliders trees', () => {
  const layout = buildLayout(SPOTS), b = layout.blocks[0], tx = b.cx + 17, tz = b.cz + 6, out = { x: 0, z: 0 };
  const c = new Colliders(); c.setTrees([{ x: tx, z: tz, s: 1 }]);

  it('blocks walking through a trunk but not past it', () => {
    expect(c.resolve(tx + 0.4, tz, 0.5, out)).toBe(true);
    expect(Math.hypot(out.x - tx, out.z - tz)).toBeGreaterThanOrEqual(0.5 + 0.3 - 1e-6);
    expect(c.resolve(tx + 3, tz, 0.5, out)).toBe(false);
  });
  it('keeps the third-person camera out of the leaves', () => {
    expect(c.crownHit(tx, 3.8, tz, 0.4)).toBe(true);
    expect(c.crownHit(tx + 4, 3.8, tz, 0.4)).toBe(false);
    expect(c.crownHit(tx, 8, tz, 0.4)).toBe(false);
  });
  it('replaces the previous trees on every refill', () => {
    c.setTrees([]); expect(c.crownHit(tx, 3.8, tz, 0.4)).toBe(false); expect(c.resolve(tx + 0.1, tz, 0.5, out)).toBe(false);
  });
});
