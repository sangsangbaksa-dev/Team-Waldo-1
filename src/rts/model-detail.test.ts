import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeBuilding, makeUnit } from './models';
import type { BuildKind, UnitKind } from './config';

function details(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse(o => { if (o instanceof THREE.Mesh && o.userData.ownedDetail) found.push(o); });
  return found;
}

describe('FRONTLINE quality-gated 3D detail', () => {
  for (const kind of ['hq', 'depot', 'barracks', 'factory', 'tower'] as BuildKind[]) {
    it(`adds batched detail to ${kind} only at higher quality`, () => {
      const low = makeBuilding(kind, 0, false), high = makeBuilding(kind, 0, true);
      expect(details(low.root)).toHaveLength(0);
      expect(details(high.root).length).toBeGreaterThan(0);
      expect(details(high.root).length).toBeLessThanOrEqual(4);
      expect(high.light.length).toBe(low.light.length);
      expect(high.top).toBe(low.top);
    });
  }
  for (const kind of ['tank', 'jeep'] as UnitKind[]) {
    it(`keeps the ${kind} weapon and flash attachment while adding detail`, () => {
      const low = makeUnit(kind, 1, false), high = makeUnit(kind, 1, true);
      expect(details(low.root)).toHaveLength(0);
      expect(details(high.root).length).toBeGreaterThan(0);
      expect(high.gun).not.toBeNull();
      expect(high.flash.position.toArray()).toEqual(low.flash.position.toArray());
    });
  }
});
