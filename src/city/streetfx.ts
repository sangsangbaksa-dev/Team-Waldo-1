// LAST CITY — 거리의 연출: 맨홀 증기·옥상 굴뚝 연기, 가로등 불빛 웅덩이, 붉은 경고등. 모두 분위기(밤·비)에 맞춰 세기가 변합니다.
import * as THREE from 'three';
import { BLOCK, BLOCKS, PITCH, ROAD } from './defs';
import type { Atmosphere, Rgb } from './atmosphere';

const rngOf = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export interface Emitter { x: number; y: number; z: number; /** 오르는 높이 · 최대 퍼짐 크기 배율 · 연기(어두움)인지 증기(밝음)인지 */ rise: number; spread: number; smoke: boolean }

const PUFFS = 7, SIZES = [34, 62, 100];

/** 증기·연기 기둥: 방출구마다 몇 덩이가 올라가며 커지고 흐려진다. 위치를 나이로 계산하므로 상태가 적고 빠릅니다. */
class Plumes {
  private layers: { pts: THREE.Points; pos: Float32Array; col: Float32Array }[] = []; private seed: Float32Array; private mat: THREE.PointsMaterial[] = [];
  constructor(private ems: Emitter[], scene: THREE.Scene, glow: THREE.Texture) {
    const n = ems.length * PUFFS; this.seed = new Float32Array(n * 2); const r = rngOf(77); for (let i = 0; i < n * 2; i++) this.seed[i] = r();
    for (const size of SIZES) {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 4); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const m = new THREE.PointsMaterial({ size, map: glow, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, fog: true }); const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts); this.layers.push({ pts, pos, col }); this.mat.push(m);
    }
  }
  setVisible(v: boolean): void { for (const l of this.layers) l.pts.visible = v; }
  update(t: number, atm: Atmosphere, wind: number): void {
    const steam = atm.steam, smoke = mix(steam, [0.12, 0.12, 0.14], 0.65), counts = [0, 0, 0];
    for (const l of this.layers) { l.pts.geometry.setDrawRange(0, 0); }
    // 층(나이 구간)별로 점을 모아 쓴다: 어린 덩이는 작게, 늙은 덩이는 크게.
    const idx = [0, 0, 0];
    this.ems.forEach((e, ei) => {
      for (let p = 0; p < PUFFS; p++) {
        const s = ei * PUFFS + p, life = 3.6 + this.seed[s * 2] * 2, age = ((t / life + p / PUFFS + this.seed[s * 2 + 1]) % 1), L = age < 0.28 ? 0 : age < 0.6 ? 1 : 2;
        const lay = this.layers[L], j = idx[L]++, wob = Math.sin(t * 0.7 + s) * e.spread * 12, drift = age * (14 + wind * 70);
        lay.pos[j * 3] = e.x + wob * age + drift; lay.pos[j * 3 + 1] = e.y + age * e.rise; lay.pos[j * 3 + 2] = e.z + Math.cos(t * 0.5 + s * 1.7) * e.spread * 10 * age + drift * 0.4;
        const c = e.smoke ? smoke : steam, a = Math.sin(Math.min(1, age) * Math.PI) * (e.smoke ? 0.5 : 0.42);
        lay.col[j * 4] = c[0]; lay.col[j * 4 + 1] = c[1]; lay.col[j * 4 + 2] = c[2]; lay.col[j * 4 + 3] = a; counts[L]++;
      }
    });
    this.layers.forEach((l, i) => { l.pts.geometry.setDrawRange(0, idx[i]); l.pts.geometry.attributes.position.needsUpdate = true; l.pts.geometry.attributes.color.needsUpdate = true; });
  }
}

export class StreetFx {
  private plumes: Plumes; private pools: THREE.Mesh; private poolMat: THREE.MeshBasicMaterial; private ventGlow: THREE.Points; private ventMat: THREE.PointsMaterial; readonly vents: Emitter[] = [];

  constructor(scene: THREE.Scene, glow: THREE.Texture, stacks: Emitter[], reduced: boolean) {
    const rng = rngOf(4242), ems: Emitter[] = [...stacks];
    // 맨홀 증기: 도로 가장자리, 교차로 사이 구간마다 가끔
    for (let i = 0; i <= BLOCKS; i++) for (let j = 0; j <= BLOCKS; j++) if (rng() < 0.3) {
      const alongX = rng() < 0.5, o = ROAD * (0.2 + rng() * 0.6), a = PITCH * (0.3 + rng() * 0.5);
      this.vents.push({ x: alongX ? j * PITCH + a + ROAD : i * PITCH + o, y: 2, z: alongX ? i * PITCH + o : j * PITCH + a + ROAD, rise: 130 + rng() * 60, spread: 0.8 + rng() * 0.6, smoke: false });
    }
    ems.push(...this.vents);
    this.plumes = new Plumes(ems, scene, glow); this.plumes.setVisible(!reduced);
    // 가로등 아래 불빛 웅덩이 + 맨홀 밑의 붉은 불빛
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [], corners: [number, number][] = [[8, 8], [BLOCK - 8, 8], [8, BLOCK - 8], [BLOCK - 8, BLOCK - 8]];
    const quad = (cx: number, cz: number, rx: number, rz: number, c: [number, number, number]): void => {
      const b = pos.length / 3; for (const [sx, sz, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) { pos.push(cx + sx * rx, 0.9, cz + sz * rz); uv.push(u, v); col.push(...c); }
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    };
    for (const b of this.blocksOf()) for (const [dx, dz] of corners) quad(b[0] + dx + (dx < BLOCK / 2 ? -22 : 22), b[1] + dz + (dz < BLOCK / 2 ? -22 : 22), 44, 44, [1, 0.68, 0.36]);
    for (const v of this.vents) quad(v.x, v.z, 46, 46, [1, 0.28, 0.16]);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); pg.setIndex(idx);
    this.poolMat = new THREE.MeshBasicMaterial({ map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
    this.pools = new THREE.Mesh(pg, this.poolMat); this.pools.frustumCulled = false; this.pools.renderOrder = 2; scene.add(this.pools);
    // 맨홀 위로 비치는 붉은 안개 불빛
    const vp = new Float32Array(this.vents.length * 3); this.vents.forEach((v, i) => vp.set([v.x, 26, v.z], i * 3));
    const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.BufferAttribute(vp, 3));
    this.ventMat = new THREE.PointsMaterial({ size: 38, map: glow, color: 0xff3a22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }); this.ventGlow = new THREE.Points(vg, this.ventMat); this.ventGlow.frustumCulled = false; scene.add(this.ventGlow);
  }
  private blocksOf(): [number, number][] { const out: [number, number][] = []; for (let j = 0; j < BLOCKS; j++) for (let i = 0; i < BLOCKS; i++) out.push([i * PITCH + ROAD, j * PITCH + ROAD]); return out; }

  update(t: number, atm: Atmosphere, reduced: boolean): void {
    this.plumes.update(reduced ? 0 : t, atm, atm.wind);
    this.poolMat.opacity = Math.min(1, atm.lamps * 0.06 * (0.55 + atm.wet * 0.7)); this.pools.visible = atm.lamps > 0.5;
    this.ventMat.opacity = (0.26 + 0.1 * Math.sin(t * 3.1)) * Math.min(1, atm.night * 1.2 + atm.rain * 0.3); this.ventGlow.visible = this.ventMat.opacity > 0.03;
  }
}
