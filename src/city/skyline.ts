// LAST CITY — 지평선의 거대 구조물: 안개 속에 서 있는 콘크리트 메가스트럭처, 파이프 다발, 하늘다리, 붉은 항공장애등, 먼 플레어탑.
// 카메라를 따라다니는 실루엣 고리라서 도시 어디서 봐도 하늘 가장자리에 같은 스카이라인이 걸리고, 색은 안개색과 섞여 대기 원근감을 만듭니다.
import * as THREE from 'three';
import type { Atmosphere, Rgb } from './atmosphere';

interface Tower { x: number; z: number; a: number; w: number; d: number; h: number; layer: number }
const rngOf = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

class Merged {
  pos: number[] = []; col: number[] = []; idx: number[] = [];
  /** 회전한(ang) 상자. 바닥에서 위로 갈수록 불투명해지도록 꼭짓점 알파를 높이로 정합니다. */
  box(cx: number, cz: number, ang: number, w: number, d: number, y0: number, y1: number, shade: number, fadeTo: number): void {
    const c = Math.cos(ang), s = Math.sin(ang), pt = (lx: number, lz: number): [number, number] => [cx + lx * c - lz * s, cz + lx * s + lz * c];
    const corners = [pt(-w / 2, -d / 2), pt(w / 2, -d / 2), pt(w / 2, d / 2), pt(-w / 2, d / 2)], a = (y: number): number => Math.max(0, Math.min(1, (y + 60) / fadeTo));
    const b = this.pos.length / 3;
    for (const y of [y0, y1]) for (const [x, z] of corners) { this.pos.push(x, y, z); this.col.push(shade, shade, shade, a(y)); }
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.idx.push(b + i, b + j, b + 4 + j, b + i, b + 4 + j, b + 4 + i); }
    this.idx.push(b + 4, b + 5, b + 6, b + 4, b + 6, b + 7);
  }
  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 4)); g.setIndex(this.idx); return g;
  }
}

export class Skyline {
  readonly group = new THREE.Group(); private mats: THREE.MeshBasicMaterial[] = []; private lights: THREE.Points; private lightMat: THREE.PointsMaterial; private beacons: THREE.Points; private beaconMat: THREE.PointsMaterial; private flares: THREE.Points; private flareMat: THREE.PointsMaterial;

  constructor(glow: THREE.Texture) {
    const rng = rngOf(20261119), towers: Tower[] = [], layers = [{ r: 4500, n: 74, hMin: 600, hMax: 2300, k: 0.5 }, { r: 4000, n: 56, hMin: 420, hMax: 1700, k: 0.22 }];
    layers.forEach((L, li) => {
      for (let i = 0; i < L.n; i++) {
        const a = (i + rng() * 0.8) / L.n * Math.PI * 2, big = rng() < 0.22, h = L.hMin + Math.pow(rng(), big ? 0.7 : 1.6) * (L.hMax - L.hMin);
        towers.push({ x: Math.cos(a) * L.r, z: Math.sin(a) * L.r, a, w: 130 + rng() * (big ? 420 : 200), d: 150 + rng() * 260, h, layer: li });
      }
    });
    const parts = layers.map(() => new Merged()), litPos: number[] = [], litCol: number[] = [], bPos: number[] = [], fPos: number[] = [];
    towers.forEach((t, ti) => {
      const m = parts[t.layer], ang = t.a + Math.PI / 2, shade = 0.78 + rng() * 0.3, tiers = 1 + Math.floor(rng() * 3), fade = 700;
      let h0 = 0, w = t.w, d = t.d; const cx = t.x, cz = t.z;
      for (let k = 0; k < tiers; k++) {
        const h1 = k === tiers - 1 ? t.h : h0 + (t.h - h0) * (0.45 + rng() * 0.25);
        m.box(cx, cz, ang, w, d, k === 0 ? -80 : h0, h1, shade * (1 - k * 0.04), fade);
        // 외벽의 불 켜진 창문: 건물 중심에서 도시 쪽을 향한 면에 흩뿌린다.
        if (t.layer === 1 || rng() < 0.5) {
          const n = Math.floor(10 + rng() * 26), inX = -Math.cos(t.a), inZ = -Math.sin(t.a);
          for (let q = 0; q < n; q++) {
            const u = (rng() - 0.5) * w * 0.94, y = h0 + 60 + rng() * Math.max(40, h1 - h0 - 80), px = cx + inX * (d / 2 + 2) + Math.cos(ang) * u, pz = cz + inZ * (d / 2 + 2) + Math.sin(ang) * u;
            litPos.push(px, y, pz); const warm = rng() < 0.7; litCol.push(warm ? 1 : 0.55, warm ? 0.72 + rng() * 0.2 : 0.85, warm ? 0.38 : 1);
          }
        }
        h0 = h1; w *= 0.72; d *= 0.72;
      }
      // 파이프 다발과 냉각탑 기둥(더 어두운 세로 줄)
      const pipes = Math.floor(rng() * 4);
      for (let p = 0; p < pipes; p++) { const off = (rng() - 0.5) * t.w * 0.8, px = t.x + Math.cos(ang) * off, pz = t.z + Math.sin(ang) * off; m.box(px, pz, ang, 8 + rng() * 14, 8 + rng() * 14, -60, t.h * (0.5 + rng() * 0.55), 0.55, fade); }
      // 하늘다리: 이웃 탑과 이어 줍니다(같은 층끼리, 거리가 가까울 때).
      const nb = towers[ti + 1]; if (nb && nb.layer === t.layer && Math.hypot(nb.x - t.x, nb.z - t.z) < 520 && rng() < 0.55) {
        const hy = 250 + rng() * Math.min(t.h, nb.h) * 0.6, mx = (t.x + nb.x) / 2, mz = (t.z + nb.z) / 2, len = Math.hypot(nb.x - t.x, nb.z - t.z), an = Math.atan2(nb.z - t.z, nb.x - t.x);
        m.box(mx, mz, an, len, 26 + rng() * 20, hy, hy + 30 + rng() * 26, 0.85, fade);
      }
      // 붉은 항공장애등: 높은 탑 꼭대기에
      if (t.h > 900 || rng() < 0.3) { bPos.push(t.x, t.h + 14, t.z); }
      // 가끔 플레어탑(주황 불꽃)
      if (t.layer === 0 && rng() < 0.12) { m.box(t.x + t.w * 0.2, t.z, ang, 12, 12, t.h, t.h + 220, 0.6, fade); fPos.push(t.x + t.w * 0.2, t.h + 236, t.z); }
    });
    parts.forEach((m, li) => {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }); this.mats.push(mat);
      const mesh = new THREE.Mesh(m.geo(), mat); mesh.renderOrder = -1 + li * 0.1; mesh.frustumCulled = false; mesh.userData.k = layers[li].k; this.group.add(mesh);
    });
    const pts = (p: number[], size: number, c?: number[]): [THREE.Points, THREE.PointsMaterial] => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); if (c) g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      const mt = new THREE.PointsMaterial({ size, map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, vertexColors: !!c, sizeAttenuation: true, color: c ? 0xffffff : 0xff2a1c }); const o = new THREE.Points(g, mt); o.frustumCulled = false; this.group.add(o); return [o, mt];
    };
    [this.lights, this.lightMat] = pts(litPos, 20, litCol); [this.beacons, this.beaconMat] = pts(bPos, 62); [this.flares, this.flareMat] = pts(fPos, 260);
    this.flareMat.color.setHex(0xff8a30);
    this.lights.renderOrder = 0; this.beacons.renderOrder = 0; this.flares.renderOrder = 0;
  }

  update(atm: Atmosphere, cam: THREE.Vector3, t: number): void {
    this.group.position.set(cam.x, 0, cam.z);
    // 실루엣 색: 안개색의 어두운 판을 안개색과 섞는다(먼 층일수록 안개에 가깝다). 낮엔 밝은 안개 속, 밤엔 어두운 윤곽.
    this.group.children.forEach(o => { const k = o.userData.k as number | undefined; if (k === undefined) return; const mat = (o as THREE.Mesh).material as THREE.MeshBasicMaterial, base = mix(atm.fog, [0.03, 0.035, 0.05], 0.78), c = mix(base, atm.fog, k * (0.8 + 0.2 * (1 - atm.night))); mat.color.setRGB(...c); });
    this.lightMat.opacity = Math.min(1, atm.windows * 0.95); this.lights.visible = atm.windows > 0.12;
    // 경고등: 두 박자 깜박임. 비·안개가 짙을수록 번져 보이게 더 크게.
    this.beaconMat.size = 62 + atm.rain * 26; this.beaconMat.opacity = (0.55 + 0.45 * Math.sin(t * 2.4)) * (0.22 + atm.night * 0.78);
    this.flareMat.opacity = (0.65 + 0.35 * Math.sin(t * 7.3 + Math.sin(t * 2.1) * 3)) * (0.5 + atm.night * 0.5); this.flares.visible = atm.night > 0.1 || atm.cloud > 0.6;
  }
}
