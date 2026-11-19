import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bakeStatic, DesertKit, seeded } from '../../src/shared/desertprops';
import { MAPS } from '../../src/race/maps';
import { buildMapTrack } from '../../src/race/track';
import { findOutpostSpots } from '../../src/race/outpost';

describe('공용 사막 소품', () => {
  const kit = new DesertKit([0x3d8bff, 0xff5a3c], false);
  const all = (): THREE.Group[] => [kit.tower(0), kit.tower(1), kit.vehicle('truck', 0), kit.vehicle('humvee', 1), kit.vehicle('tanker', 0), kit.radar(1), kit.generator(), kit.tent(), kit.flag(0), kit.windsock(), kit.sandbags(), kit.twall(), kit.hesco(), kit.crates(3), kit.wreck(0), kit.wreck(1)];
  it('소품은 모두 메시가 든 그룹이고 update 가 에러 없이 돈다', () => {
    for (const g of all()) { let meshes = 0; g.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes++; }); expect(meshes).toBeGreaterThan(0); }
    expect(() => { kit.update(0); kit.update(12.5); }).not.toThrow();
  });
  it('진영 번호가 팀 색을 고른다(범위를 넘으면 돌아간다)', () => {
    const color = (g: THREE.Group): number[] => { const out: number[] = []; g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.MeshStandardMaterial).color.getHex() === 0xff5a3c) out.push(1); }); return out; };
    expect(color(kit.tower(1)).length).toBeGreaterThan(0); expect(color(kit.tower(0)).length).toBe(0); expect(color(kit.tower(3)).length).toBeGreaterThan(0);
  });
  it('같은 시드는 같은 수열', () => { const a = seeded(5), b = seeded(5); expect([a(), a(), a()]).toEqual([b(), b(), b()]); });
  it('bakeStatic 은 움직이는 부품은 남기고 나머지를 재질별로 합친다', () => {
    const g = new THREE.Group(); g.add(kit.tower(0), kit.radar(0), kit.flag(0), kit.tent(), kit.vehicle('truck', 1));
    const count = (r: THREE.Object3D): number => { let n = 0; r.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
    const before = count(g); bakeStatic(g); const after = count(g);
    expect(after).toBeLessThan(before / 2);
    let live = 0; g.traverse(o => { if (o.userData.live) live++; }); expect(live).toBe(3); // 탑 조명 빔·레이더 팔·깃발 천
    expect(() => kit.update(3)).not.toThrow();
  });
});

describe('SPEED RUSH 길가 초소 자리', () => {
  const desert = buildMapTrack(MAPS.find(m => m.id === 'desert')!);
  it('데저트 하이웨이에서 서로 떨어진 자리를 찾고 늘 같은 자리가 나온다', () => {
    const a = findOutpostSpots(desert, 2), b = findOutpostSpots(desert, 2);
    expect(a.length).toBe(2); expect(a).toEqual(b);
    const gap = Math.abs(a[0].i - a[1].i); expect(Math.min(gap, desert.n - gap)).toBeGreaterThan(desert.n * 0.2);
  });
  it('도로(와 다른 구간)에서 충분히 떨어져 있다', () => {
    for (const s of findOutpostSpots(desert, 2)) {
      const x = desert.x[s.i] - desert.tz[s.i] * s.off * s.side, z = desert.z[s.i] + desert.tx[s.i] * s.off * s.side;
      let min = Infinity; for (let j = 0; j < desert.n; j++) min = Math.min(min, Math.hypot(desert.x[j] - x, desert.z[j] - z));
      expect(min).toBeGreaterThan(desert.halfWidth + 14);
    }
  });
});
