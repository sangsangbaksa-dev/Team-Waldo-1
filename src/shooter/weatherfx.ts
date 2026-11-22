// ZERO ZONE — 폭풍 날씨 효과: 카메라 둘레에 내리는 빗줄기와, 숲·호수·늪·강 위로 깔리는 옅은 안개 덩어리.
import * as THREE from 'three';
import { makeRng } from './config';
import type { GameMap } from './world';

const BOX = 46, TALL = 30;

export class WeatherFx {
  readonly group = new THREE.Group(); private rain: THREE.LineSegments | null = null; private pos: Float32Array | null = null; private off: Float32Array | null = null; private mist: Array<{ s: THREE.Sprite; bx: number; bz: number; ph: number; sp: number }> = [];
  constructor(map: GameMap, glow: THREE.Texture, quality: 'high' | 'standard' | 'low') {
    this.group.name = 'weather';
    const n = quality === 'high' ? 1100 : quality === 'standard' ? 560 : 0;
    if (n) {
      const r = makeRng(map.seed + 311); this.pos = new Float32Array(n * 6); this.off = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { this.off[i * 3] = (r() - 0.5) * BOX * 2; this.off[i * 3 + 1] = r() * TALL; this.off[i * 3 + 2] = (r() - 0.5) * BOX * 2; }
      // Rain positions are rewritten every frame; hint dynamic GPU uploads.
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c6d6, transparent: true, opacity: 0.3, depthWrite: false })); this.rain.frustumCulled = false; this.group.add(this.rain);
    }
    // 안개 덩어리: 지형 곁에만 깔아 마을은 선명하게 둡니다
    const r = makeRng(map.seed + 313), t = map.terrain, add = (x: number, z: number, s: number, op: number): void => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xaeb9c4, transparent: true, depthWrite: false, opacity: op })); sp.scale.set(s, s * 0.32, 1); sp.position.set(x, 1.4 + r() * 1.6, z); this.group.add(sp);
      this.mist.push({ s: sp, bx: x, bz: z, ph: r() * 6.28, sp: 0.15 + r() * 0.2 });
    };
    const per = quality === 'low' ? 1 : 3;
    for (const f of t.forests) for (let i = 0; i < per + 1; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * f.r * 0.8; add(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, 26 + r() * 22, 0.2); }
    for (const p of t.ponds) for (let i = 0; i < per; i++) { const a = r() * 6.28, d = r() * 0.9; add(p.x + Math.cos(a) * p.rx * d, p.z + Math.sin(a) * p.rz * d, Math.max(p.rx, p.rz) * (0.9 + r() * 0.6), p.swamp ? 0.3 : 0.2); }
    for (const rv of t.rivers) for (let i = 2; i < rv.pts.length - 2; i += 3) add(rv.pts[i][0], rv.pts[i][1], 24 + r() * 10, 0.16);
  }
  update(dt: number, time: number, cam: THREE.Vector3, density = 1): void {
    if (this.rain && this.pos && this.off) {
      const n = this.off.length / 3, shown = Math.floor(n * density), p = this.pos, o = this.off; (this.rain.geometry as THREE.BufferGeometry).setDrawRange(0, shown * 2);
      for (let i = 0; i < shown; i++) {
        let y = o[i * 3 + 1] - dt * (24 + (i % 7)); if (y < 0) y += TALL; o[i * 3 + 1] = y;
        // off[] stores camera-local offsets, not absolute world coordinates.
        // Subtracting cam.x/z before wrapping pushed rain out of the visible
        // area as the player moved away from the world origin.
        const X = cam.x + o[i * 3], Z = cam.z + o[i * 3 + 2], Y = cam.y - 12 + y;
        p[i * 6] = X; p[i * 6 + 1] = Y; p[i * 6 + 2] = Z; p[i * 6 + 3] = X + 0.07; p[i * 6 + 4] = Y + 0.85; p[i * 6 + 5] = Z + 0.02;
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    for (const m of this.mist) { m.s.position.x = m.bx + Math.sin(time * m.sp + m.ph) * 5; m.s.position.z = m.bz + Math.cos(time * m.sp * 0.8 + m.ph) * 4; }
  }
}
