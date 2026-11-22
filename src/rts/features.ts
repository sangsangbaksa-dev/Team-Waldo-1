// FRONTLINE — 지형지물 3D 표시. 숲(나무)·언덕(둔덕)·진흙(젖은 웅덩이)·폐허(무너진 벽)·다리를
// 종류마다 InstancedMesh 한 장으로 그립니다. 게임플레이 규칙은 terrain.ts 에 있고, 여기서는 읽기만 합니다.
import * as THREE from 'three';
import type { RtsMap } from './map';
import { G_FOREST, G_HILL, G_MUD, G_RUIN } from './terrain';
import { stoneTexture } from './visuals';

const seeded = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

/** 지형 효과 칸을 그라운드 텍스처에 칠합니다(k = 텍스처 픽셀/칸). 칸 경계가 티 나지 않게 알갱이를 흩뿌립니다. */
export function paintFeatures(g: CanvasRenderingContext2D, k: number, map: RtsMap): void {
  const n = map.size, rnd = seeded(404), tint: Record<number, string> = { [G_FOREST]: '58,92,44', [G_HILL]: '196,166,112', [G_MUD]: '70,52,34', [G_RUIN]: '120,118,112' };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const gr = map.ground[y * n + x], c = tint[gr]; if (!c) continue;
    for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${c},${0.22 + rnd() * 0.22})`; g.beginPath(); g.arc((x + rnd()) * k, (y + rnd()) * k, (0.5 + rnd() * 0.7) * k, 0, Math.PI * 2); g.fill(); }
  }
  // 다리 주변 강둑: 판자 아래 젖은 흙.
  for (const b of map.bridges) { g.fillStyle = 'rgba(92,70,40,.55)'; g.beginPath(); g.arc(b.x * k, b.y * k, 3.4 * k, 0, Math.PI * 2); g.fill(); }
}

export class Features {
  constructor(private scene: THREE.Scene, private map: RtsMap, private quality: 'high' | 'standard' | 'low', private shadows: boolean) {
    this.trees(); this.hills(); this.mud(); this.ruins(); this.bridges();
  }
  private cells(kind: number): Array<[number, number, number]> {
    const n = this.map.size, g = this.map.ground, out: Array<[number, number, number]> = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y * n + x] === kind) {
      let nb = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (g[Math.min(n - 1, Math.max(0, y + j)) * n + Math.min(n - 1, Math.max(0, x + i))] === kind) nb++;
      out.push([x, y, nb]);
    }
    return out;
  }
  private add(m: THREE.InstancedMesh, count: number): void { m.count = count; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.castShadow = this.shadows; m.receiveShadow = true; this.scene.add(m); }

  private trees(): void {
    const cells = this.cells(G_FOREST), per = this.quality === 'low' ? 1 : 2, rnd = seeded(11), m4 = new THREE.Matrix4(), col = new THREE.Color();
    const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.62, 2.1, 7), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), cells.length * per * 2 + 1), trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 1 }), cells.length * per + 1);
    let c = 0, t = 0;
    for (const [x, y] of cells) for (let i = 0; i < per; i++) {
      const px = x + 0.2 + rnd() * 0.6, pz = y + 0.2 + rnd() * 0.6, s = 0.8 + rnd() * 0.7;
      m4.compose(new THREE.Vector3(px, 0.35 * s, pz), new THREE.Quaternion(), new THREE.Vector3(0.5 * s, 0.35 * s, 0.5 * s)); trunk.setMatrixAt(t++, m4);
      for (let l = 0; l < 2; l++) { m4.compose(new THREE.Vector3(px, (1.05 + l * 0.8) * s, pz), new THREE.Quaternion(), new THREE.Vector3((1 - l * 0.35) * s, (1 - l * 0.25) * s, (1 - l * 0.35) * s)); mesh.setMatrixAt(c, m4); col.setHSL(0.27 + rnd() * 0.06, 0.45, 0.2 + rnd() * 0.1 + l * 0.04); mesh.setColorAt(c++, col); }
    }
    this.add(mesh, c); this.add(trunk, t);
  }
  private hills(): void {
    const cells = this.cells(G_HILL), rnd = seeded(12), m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ map: stoneTexture(false, 5), roughness: 0.95, flatShading: true }), cells.length + 1); let c = 0;
    for (const [x, y, nb] of cells) {
      const h = 0.16 + nb * 0.035 + rnd() * 0.08; e.set(0, rnd() * 6, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x + 0.5, 0.02, y + 0.5), q, new THREE.Vector3(0.95 + rnd() * 0.25, h, 0.95 + rnd() * 0.25)); mesh.setMatrixAt(c, m4); col.setHSL(0.09 + rnd() * 0.02, 0.38, 0.5 + rnd() * 0.08 + nb * 0.01); mesh.setColorAt(c++, col);
    }
    this.add(mesh, c); mesh.castShadow = false;
  }
  private mud(): void {
    const cells = this.cells(G_MUD), rnd = seeded(13), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.75, 9), new THREE.MeshStandardMaterial({ color: 0x3e2d1d, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.82, depthWrite: false }), cells.length + 1); let c = 0;
    for (const [x, y] of cells) { const s = 0.8 + rnd() * 0.5; m4.compose(new THREE.Vector3(x + 0.5 + (rnd() - 0.5) * 0.3, 0.035, y + 0.5 + (rnd() - 0.5) * 0.3), q, new THREE.Vector3(s, s, 1)); mesh.setMatrixAt(c++, m4); }
    this.add(mesh, c); mesh.castShadow = false;
  }
  private ruins(): void {
    const cells = this.cells(G_RUIN), rnd = seeded(14), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const mat = new THREE.MeshStandardMaterial({ map: stoneTexture(true, 9), roughness: 0.95, flatShading: true });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cells.length * 2 + 1), rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.3, 0), mat, cells.length * 2 + 1); let w = 0, r = 0;
    for (const [x, y] of cells) {
      if (rnd() < 0.5) { const h = 0.5 + rnd() * 0.7; e.set((rnd() - 0.5) * 0.12, rnd() * 3.14, (rnd() - 0.5) * 0.12); q.setFromEuler(e); m4.compose(new THREE.Vector3(x + 0.5, h / 2, y + 0.5), q, new THREE.Vector3(0.7 + rnd() * 0.5, h, 0.2)); walls.setMatrixAt(w, m4); col.setHSL(0.1, 0.18, 0.5 + rnd() * 0.15); walls.setColorAt(w++, col); }
      for (let i = 0; i < 2; i++) { const s = 0.5 + rnd() * 0.9; e.set(rnd() * 3, rnd() * 6, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x + rnd(), 0.1 * s, y + rnd()), q, new THREE.Vector3(s, s * 0.7, s)); rubble.setMatrixAt(r, m4); col.setHSL(0.1, 0.15, 0.42 + rnd() * 0.15); rubble.setColorAt(r++, col); }
    }
    this.add(walls, w); this.add(rubble, r);
  }
  private bridges(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.9, flatShading: true }), dark = new THREE.MeshStandardMaterial({ color: 0x5b3a1c, roughness: 0.95 });
    for (const b of this.map.bridges) {
      const g = new THREE.Group(), box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): void => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = this.shadows; o.receiveShadow = true; g.add(o); };
      for (let i = -7; i <= 7; i++) box(0.46, 0.14, 2.9, i * 0.5, 0.16, 0, i % 2 ? wood : dark); // 판자(가로 방향이 강을 가로지름)
      for (const s of [-1, 1]) { box(7.6, 0.12, 0.14, 0, 0.78, s * 1.5, dark); for (let i = -3; i <= 3; i += 2) box(0.14, 0.7, 0.14, i * 1.1, 0.45, s * 1.5, wood); }
      g.position.set(b.x, 0, b.y); g.rotation.y = -Math.atan2(b.ay, b.ax); this.scene.add(g);
    }
  }
}
