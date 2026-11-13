// LAST CITY — 건물 생성기: Blender 로 구운 외벽 타일 + 1층 상점가 + 돌림띠·벽기둥·셋백·옥상 설비.
import * as THREE from 'three';
import type { World } from './world';

export const FACADE_STYLES = ['brick', 'glass', 'deco', 'industrial', 'ribbon'] as const;
const GF = 56;                       // 1층 높이
const AWN = [0xb83a3a, 0x2f6b8f, 0x3f7d45, 0xd9a43a, 0x6b4a8f, 0xc9c2b0];
const hash = (n: number): number => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

class Mesh {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  quad(p: number[][], n: number[], c: THREE.Color, uv?: number[][]): void {
    const b = this.pos.length / 3;
    for (let i = 0; i < 4; i++) { this.pos.push(...p[i]); this.nor.push(...n); this.col.push(c.r, c.g, c.b); this.uv.push(...(uv ? uv[i] : [0.5, 0.5])); }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: THREE.Color, top = true): void {
    const d = c.clone().multiplyScalar(0.8), e = c.clone().multiplyScalar(0.9);
    this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], e);
    this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], e);
    this.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], d);
    this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], d);
    if (top) this.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], c);
  }
  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setIndex(this.idx); return g;
  }
}

function shopTexture(variant: number): THREE.CanvasTexture {
  const W = 512, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4a4742'; g.fillRect(0, H - 22, W, 22);                   // 하단 석재 받침
  g.fillStyle = '#bdb8ae'; g.fillRect(0, 0, W, 34);                        // 간판 띠
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 34, W, 4);
  for (let b = 0; b < 4; b++) {
    const x = b * 128;
    g.fillStyle = '#b6b1a6'; g.fillRect(x, 38, 9, H - 60);                // 벽기둥
    const gx = x + 16, gw = 98, door = (b + variant) % 3 === 1;
    const grd = g.createLinearGradient(0, 44, 0, H - 24); grd.addColorStop(0, '#5f7d99'); grd.addColorStop(0.5, '#2c4259'); grd.addColorStop(1, '#1c2733');
    g.fillStyle = grd; g.fillRect(gx, 44, gw, H - 70);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(gx + 8, 44); g.lineTo(gx + 44, 44); g.lineTo(gx + 16, H - 26); g.lineTo(gx - 8 + 8, H - 26); g.fill();
    g.strokeStyle = '#1a1c20'; g.lineWidth = 4; g.strokeRect(gx, 44, gw, H - 70);
    if (door) { g.fillStyle = '#23262b'; g.fillRect(gx + 30, 54, 38, H - 80); g.fillStyle = '#e8c868'; g.fillRect(gx + 36, 54 + (H - 80) / 2, 4, 14); }
    else { g.fillStyle = (b + variant) % 2 ? 'rgba(255,214,140,0.55)' : 'rgba(255,255,255,0.0)'; g.fillRect(gx + 4, 48, gw - 8, H - 78); g.fillStyle = '#1a1c20'; g.fillRect(gx + gw / 2 - 1.5, 44, 3, H - 70); }
    g.fillStyle = '#2a2d33'; g.font = '700 18px sans-serif'; g.textAlign = 'center'; g.fillText(['OPEN', 'SHOP', 'CAFÉ', 'BAR', '24H', 'MART'][(b * 2 + variant) % 6], x + 64, 24);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

export function buildBuildings(world: World, scene: THREE.Scene, base: string): void {
  const loader = new THREE.TextureLoader(), tex = (n: string): THREE.Texture => { const t = loader.load(`${base}assets/tex/${n}.png`); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const facades = FACADE_STYLES.map(() => new Mesh()), shops = [new Mesh(), new Mesh()], trim = new Mesh(), c = new THREE.Color(), wall = new THREE.Color();
  const tint = (s: { wall: string }): THREE.Color => wall.set(s.wall).lerp(new THREE.Color(0xe2ddd4), 0.5).clone();
  world.map.solids.forEach((s, i) => {
    if (s.struct || !s.alive) return;
    const r = (k: number): number => hash(i * 31 + k), style = Math.floor(r(1) * FACADE_STYLES.length), F = facades[style], H = 150 + s.height * 1250 + r(2) * 60, tall = H > 520 && r(3) < 0.7;
    const tintC = tint(s), light = tintC.clone().lerp(new THREE.Color(0xf1ede4), 0.55), dark = tintC.clone().multiplyScalar(0.55);
    // 층(티어): 높은 건물은 위로 갈수록 좁아지는 셋백
    const tiers: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }[] = [];
    if (tall) {
      const iw = Math.min(s.w, s.h) * 0.14, h1 = H * (0.5 + r(4) * 0.12);
      tiers.push({ x0: s.x, z0: s.y, x1: s.x + s.w, z1: s.y + s.h, y0: 0, y1: h1 }, { x0: s.x + iw, z0: s.y + iw, x1: s.x + s.w - iw, z1: s.y + s.h - iw, y0: h1, y1: H });
    } else tiers.push({ x0: s.x, z0: s.y, x1: s.x + s.w, z1: s.y + s.h, y0: 0, y1: H });
    const uo = r(5) * 4;
    tiers.forEach((t, ti) => {
      const sides = [
        { a: [t.x0, t.z1], d: [1, 0], n: [0, 1], L: t.x1 - t.x0 }, { a: [t.x1, t.z0], d: [-1, 0], n: [0, -1], L: t.x1 - t.x0 },
        { a: [t.x1, t.z1], d: [0, -1], n: [1, 0], L: t.z1 - t.z0 }, { a: [t.x0, t.z0], d: [0, 1], n: [-1, 0], L: t.z1 - t.z0 },
      ];
      const yb = ti === 0 ? GF : t.y0, P = (sd: typeof sides[0], tt: number, y: number): number[] => [sd.a[0] + sd.d[0] * tt, y, sd.a[1] + sd.d[1] * tt];
      sides.forEach((sd, si) => {
        // 외벽(윗부분)
        const u1 = sd.L / 176, vb = (yb - GF) / 184, vt = (t.y1 - GF) / 184, uo2 = uo + si * 0.37, bay = Math.max(1, Math.round(sd.L / 44));
        F.quad([P(sd, 0, yb), P(sd, sd.L, yb), P(sd, sd.L, t.y1), P(sd, 0, t.y1)], [sd.n[0], 0, sd.n[1]], tintC, [[uo2, vb], [uo2 + u1 * (bay * 44 / sd.L), vb], [uo2 + u1 * (bay * 44 / sd.L), vt], [uo2, vt]]);
        if (ti === 0) {   // 1층 상점가 + 차양
          const S = shops[(style + si) % 2], gu = sd.L / 176;
          S.quad([P(sd, 0, 0), P(sd, sd.L, 0), P(sd, sd.L, GF), P(sd, 0, GF)], [sd.n[0], 0, sd.n[1]], light, [[0, 0], [gu, 0], [gu, 1], [0, 1]]);
          for (let b = 0; b < bay; b++) if (hash(i * 97 + si * 13 + b) < 0.55 && H > 140) {
            const t0 = (b + 0.1) * sd.L / bay, t1 = (b + 0.9) * sd.L / bay, o = 15, col = c.setHex(AWN[Math.floor(hash(i + si * 7 + b * 3) * AWN.length)]).clone();
            const q = (tt: number, y: number, out: number): number[] => { const p = P(sd, tt, y); return [p[0] + sd.n[0] * out, p[1], p[2] + sd.n[1] * out]; };
            trim.quad([q(t0, 38, 0.5), q(t1, 38, 0.5), q(t1, 28, o), q(t0, 28, o)], [sd.n[0] * 0.5, 0.8, sd.n[1] * 0.5], col);
            trim.quad([q(t0, 28, o), q(t1, 28, o), q(t1, 24, o), q(t0, 24, o)], [sd.n[0], 0, sd.n[1]], col.clone().multiplyScalar(0.8));
          }
        }
      });
      // 돌림띠 + 파라펫
      const cs = 4, ch = 7;
      trim.box(t.x0 - cs, t.y1 - ch, t.z0 - cs, t.x1 + cs, t.y1, t.z1 + cs, light);
      trim.box(t.x0 - 1, t.y1, t.z0 - 1, t.x1 + 1, t.y1 + 5, t.z0 + 3, dark, true); trim.box(t.x0 - 1, t.y1, t.z1 - 3, t.x1 + 1, t.y1 + 5, t.z1 + 1, dark, true);
      trim.box(t.x0 - 1, t.y1, t.z0 + 3, t.x0 + 3, t.y1 + 5, t.z1 - 3, dark, true); trim.box(t.x1 - 3, t.y1, t.z0 + 3, t.x1 + 1, t.y1 + 5, t.z1 - 3, dark, true);
      trim.box(t.x0 + 3, t.y1 + 0.4, t.z0 + 3, t.x1 - 3, t.y1 + 1, t.z1 - 3, new THREE.Color(s.roof).multiplyScalar(0.6));
      if (t.y0 > 0) trim.box(t.x0 - 7, t.y0 - 6, t.z0 - 7, t.x1 + 7, t.y0 + 1, t.z1 + 7, light);   // 셋백 단 윗면
      // 중간 층 띠(매 12층 느낌의 가로 줄)
      if (t.y1 - t.y0 > 300) { const my = t.y0 + (t.y1 - t.y0) * 0.5; trim.box(t.x0 - 2, my, t.z0 - 2, t.x1 + 2, my + 5, t.z1 + 2, light, false); }
      // 옥상 설비
      if (ti === tiers.length - 1) {
        const w = t.x1 - t.x0, d = t.z1 - t.z0, n = 2 + Math.floor(r(8) * 4);
        for (let k = 0; k < n; k++) {
          const px = t.x0 + 12 + r(20 + k) * (w - 36), pz = t.z0 + 12 + r(40 + k) * (d - 36), kind = Math.floor(r(60 + k) * 4);
          if (kind === 0) trim.box(px, t.y1 + 1, pz, px + 16, t.y1 + 11, pz + 12, c.set(0x8d939c));            // 냉각기
          else if (kind === 1) { trim.box(px, t.y1 + 1, pz, px + 8, t.y1 + 22, pz + 8, c.set(0x6b4a30)); trim.box(px - 3, t.y1 + 22, pz - 3, px + 11, t.y1 + 32, pz + 11, c.set(0x7d5a3a)); }   // 물탱크
          else if (kind === 2) trim.box(px, t.y1 + 1, pz, px + 20, t.y1 + 16, pz + 18, c.set(0xb8b3aa));        // 계단탑
          else trim.box(px, t.y1 + 1, pz, px + 2, t.y1 + 38, pz + 2, c.set(0x30343a));                          // 안테나
        }
      }
    });
    // 모서리 벽기둥 + 하단 기단
    const t0 = tiers[0];
    for (const [cx, cz] of [[t0.x0, t0.z0], [t0.x1, t0.z0], [t0.x0, t0.z1], [t0.x1, t0.z1]]) trim.box(cx - 3, 0, cz - 3, cx + 3, Math.min(t0.y1, H) - 4, cz + 3, light, false);
    trim.box(t0.x0 - 2, 0, t0.z0 - 2, t0.x1 + 2, 8, t0.z1 + 2, dark, true);
    if (s.sign) {
      const stex = new THREE.CanvasTexture((() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d')!; g.fillStyle = '#14161a'; g.fillRect(0, 0, 256, 96); g.strokeStyle = s.signColor!; g.lineWidth = 6; g.strokeRect(5, 5, 246, 86); g.fillStyle = s.signColor!; g.font = '900 60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.sign!, 128, 52); return cv; })());
      stex.colorSpace = THREE.SRGBColorSpace; const sm = new THREE.MeshBasicMaterial({ map: stex, side: THREE.DoubleSide }), W = Math.min(s.w, s.h, 150) * 0.9, top = tiers[tiers.length - 1].y1;
      for (let q = 0; q < 2; q++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, W * 0.375), sm); m.position.set(s.x + s.w / 2, top + W * 0.22 + 8, s.y + s.h / 2); m.rotation.y = q * Math.PI / 2; scene.add(m); }
    }
  });
  const add = (m: Mesh, mat: THREE.Material): void => { if (!m.idx.length) return; const o = new THREE.Mesh(m.geo(), mat); o.castShadow = true; o.receiveShadow = true; scene.add(o); };
  FACADE_STYLES.forEach((n, k) => add(facades[k], new THREE.MeshLambertMaterial({ map: tex(`facade_${n}`), emissiveMap: tex(`facade_${n}_e`), emissive: 0xffffff, emissiveIntensity: 0.5, vertexColors: true, side: THREE.DoubleSide })));
  shops.forEach((m, k) => add(m, new THREE.MeshLambertMaterial({ map: shopTexture(k * 2), vertexColors: true, side: THREE.DoubleSide })));
  add(trim, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}
