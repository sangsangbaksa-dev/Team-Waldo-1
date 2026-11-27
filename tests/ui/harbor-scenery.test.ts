import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { sceneryFit, sceneryModelFor } from '../../project-harbor/world/scenery';
import type { WorldProp } from '../../project-harbor/world/domain';

function prop(kind: WorldProp['kind'], extra: Partial<WorldProp> = {}): WorldProp {
  return { kind, x: 100, z: 200, w: 2, h: 4, d: 1, color: 0xffffff, ...extra };
}

describe('Harbor authored scenery', () => {
  it('references real nodes in the shipped Blender GLB', () => {
    const file = readFileSync(new URL('../../public/assets/models/props.glb', import.meta.url));
    expect(file.toString('ascii', 0, 4)).toBe('glTF');
    const json = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12))) as { nodes: { name?: string }[] };
    const names = new Set(json.nodes.map(node => node.name));
    for (const kind of ['lamp', 'bench', 'trash', 'barricade', 'planter', 'sign', 'stall', 'tree'] as const) {
      expect(names.has(sceneryModelFor(prop(kind)))).toBe(true);
    }
    expect(names.has(sceneryModelFor(prop('tree', { x: 2400 })))).toBe(true);
    expect(sceneryModelFor(prop('rock'))).toBeUndefined();
  });
  it('matches ordinary prop dimensions and preserves road-facing yaw', () => {
    expect(sceneryFit(prop('bench', { yaw: 1.2 }), new Vector3(1, 2, .5))).toEqual({ sx: 2, sy: 2, sz: 2, yaw: 1.2 });
  });
  it('keeps tree crowns broad and lamp proportions natural', () => {
    const tree = prop('tree', { w: 2, d: 2, h: 10 });
    const fit = sceneryFit(tree, new Vector3(4, 5, 4));
    expect(fit.sx).toBeCloseTo(1.2);
    expect(fit.sz).toBeCloseTo(1.2);
    expect(fit.sy).toBe(2);
    expect(sceneryFit(tree, new Vector3(4, 5, 4))).toEqual(fit);
    const lamp = sceneryFit(prop('lamp', { h: 4.5 }), new Vector3(1.4, 9, .4));
    expect([lamp.sx, lamp.sy, lamp.sz]).toEqual([.5, .5, .5]);
  });
});
