import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { GameMap } from './world';

vi.mock('./textures', async () => {
  const three = await import('three');
  const make = () => new three.CanvasTexture({ width: 4, height: 4 } as HTMLCanvasElement);
  return {
    concreteTexture: vi.fn(make),
    dirtTexture: vi.fn(make),
    fadeDiscTexture: vi.fn(make),
    fadeRoadTexture: vi.fn(make),
    waterTexture: vi.fn(make),
  };
});

import * as textures from './textures';
import { TerrainView } from './terrainview';

const map = (): GameMap => ({
  seed: 4,
  compounds: [
    { x: -25, z: 0, r: 9, theme: 'farm' },
    { x: 0, z: 0, r: 15, theme: 'industrial' },
    { x: 35, z: 0, r: 24, theme: 'military' },
  ],
  roads: [],
  terrain: {
    rivers: [{ pts: [[-10, 20], [25, 20]], w: 4 }],
    ponds: [
      { x: 10, z: 45, rx: 12, rz: 8, ry: 0, swamp: false },
      { x: -20, z: 45, rx: 6, rz: 5, ry: 0, swamp: false },
    ],
    forests: [], hills: [], cliffs: [], bridges: [],
  },
}) as unknown as GameMap;

function maps(t: TerrainView): THREE.Texture[] {
  const result: THREE.Texture[] = [];
  t.group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if ('map' in m && m.map instanceof THREE.Texture) result.push(m.map);
    }
  });
  return result;
}

describe('ZERO ZONE terrain texture source reuse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('paints one concrete image but preserves per-town repeat scale', () => {
    const terrain = new TerrainView(map(), true);
    expect(textures.concreteTexture).toHaveBeenCalledTimes(1);
    const source = vi.mocked(textures.concreteTexture).mock.results[0].value.source;
    const pads = maps(terrain).filter(t => t.source === source);
    expect(pads).toHaveLength(3);
    expect(new Set(pads).size).toBe(3);
    expect(new Set(pads.map(t => t.repeat.x)).size).toBe(3);
  });

  it('paints water once for river and ponds while each surface scrolls independently', () => {
    const terrain = new TerrainView(map(), true);
    expect(textures.waterTexture).toHaveBeenCalledTimes(1);
    const source = vi.mocked(textures.waterTexture).mock.results[0].value.source;
    const waters = maps(terrain).filter(t => t.source === source);
    expect(waters).toHaveLength(3);
    expect(new Set(waters).size).toBe(3);
    terrain.update(1);
    expect(new Set(waters.map(t => t.offset.x)).size).toBe(3);
  });
});
