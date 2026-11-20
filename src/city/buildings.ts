// LAST CITY — 건물 생성기: Blender 로 구운 외벽 타일 + 1층 상점가 + 돌림띠·벽기둥·셋백·옥상 설비.
import * as THREE from 'three';
import type { World } from './world';
import { BIZ, BLOCK, PITCH, SIZE } from './defs';
import { facadeFins, facadeStyle, architectureChunk } from './architecture-detail';
import type { Atmosphere } from './atmosphere';
import type { Emitter } from './streetfx';

export const FACADE_STYLES = ['brick', 'glass', 'deco', 'industrial', 'ribbon'] as const;
const GF = 100;                      // 1층 높이 (사람 키 약 40 — scale.ts 의 HUMAN 기준 — 의 2배 이상)
const DOOR_H = 78, DOOR_W = 22;      // 출입문 높이 · 반폭
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
    const gx = x + 16, gw = 98, door = false;
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

/** 상점가 발광 무늬: 낮에는 거의 꺼져 있고 밤이면 유리창·간판 글씨가 켜진다(shopTexture 와 같은 칸 배치). */
function shopEmissive(variant: number): THREE.CanvasTexture {
  const W = 512, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!, LIT = ['255,196,120', '120,222,255', '255,120,196', '196,255,150', '255,236,170'];
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (let b = 0; b < 4; b++) {
    const x = b * 128, gx = x + 16, gw = 98, col = LIT[(b * 2 + variant * 3) % LIT.length], on = hash(variant * 17 + b * 5) < 0.78;
    if (on) { const grd = g.createLinearGradient(0, 44, 0, H - 24); grd.addColorStop(0, `rgba(${col},0.85)`); grd.addColorStop(1, `rgba(${col},0.45)`); g.fillStyle = grd; g.fillRect(gx + 4, 48, gw - 8, H - 78); g.fillStyle = '#000'; g.fillRect(gx + gw / 2 - 1.5, 44, 3, H - 70); }
    g.fillStyle = `rgb(${LIT[(b + variant) % LIT.length]})`; g.font = '700 18px sans-serif'; g.textAlign = 'center'; g.fillText(['OPEN', 'SHOP', 'CAFÉ', 'BAR', '24H', 'MART'][(b * 2 + variant) % 6], x + 64, 24);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/** 세로로 걸린 네온 돌출 간판 무늬(글자를 위에서 아래로 쌓는다). */
const BLADES: [string, string][] = [['HOTEL', '#ff4fa8'], ['BAR', '#35e0ff'], ['24H', '#ffd24a'], ['CLUB', '#b36bff'], ['술집', '#ff6a3a'], ['PAWN', '#5dff9a'], ['LIVE', '#ff3a3a'], ['RAMEN', '#ffb13a']];
function bladeTexture(text: string, color: string): THREE.CanvasTexture {
  const W = 64, H = 192, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.fillStyle = '#07060a'; g.fillRect(0, 0, W, H); g.strokeStyle = color; g.lineWidth = 5; g.shadowColor = color; g.shadowBlur = 8; g.strokeRect(5, 5, W - 10, H - 10);
  const chars = [...text], step = Math.min(44, (H - 24) / chars.length); g.fillStyle = color; g.font = `900 ${Math.round(step * 0.82)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  chars.forEach((ch, i) => g.fillText(ch, W / 2, H / 2 + (i - (chars.length - 1) / 2) * step));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function streakTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
  const gx = g.createLinearGradient(0, 0, 16, 0); gx.addColorStop(0, 'rgba(0,0,0,0.9)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,0.9)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 16, 128);
  return new THREE.CanvasTexture(c);
}

export interface BuildingFx { blink: (t: number) => void; setMood: (atm: Atmosphere) => void; stacks: Emitter[] }

/** 높은 건물 옥상의 붉은 항공장애등을 두 박자로 번갈아 깜박이게 하는 갱신 함수를 돌려준다. */
export function buildBuildings(world: World, scene: THREE.Scene, base: string, quality: 'low' | 'standard' | 'high' = 'standard'): BuildingFx {
  const loader = new THREE.TextureLoader(), tex = (n: string): THREE.Texture => { const t = loader.load(`${base}assets/tex/${n}.png`); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  // OUTLAW CITY's neighborhood batching approach: shared materials, local geometry bounds.
  const chunks = new Map<string,{facades:Mesh[];shops:Mesh[];trim:Mesh;lamps:Mesh}>();
  const chunk = (x:number,z:number) => {
    const key=architectureChunk(x,z,PITCH,quality);
    let bin=chunks.get(key);
    if(!bin){bin={facades:FACADE_STYLES.map(()=>new Mesh()),shops:[new Mesh(),new Mesh()],trim:new Mesh(),lamps:new Mesh()};chunks.set(key,bin);}
    return bin;
  };
  const c = new THREE.Color(), wall = new THREE.Color();
  const tint = (s: { wall: string }): THREE.Color => wall.set(s.wall).lerp(new THREE.Color(0xe2ddd4), 0.5).clone();
  const beacons: [number, number, number][] = [], blades = BLADES.map(() => new Mesh()), streaks = new Mesh(), stacks: Emitter[] = [], white = new THREE.Color(1, 1, 1), signMats: THREE.MeshBasicMaterial[] = [];
  const doors = new Map<number, World['businesses'][number]>(); for (const z of world.businesses) doors.set(z.solid, z);
  world.map.solids.forEach((s, i) => {
    if (s.struct || !s.alive) return;
    const {facades,shops,trim,lamps}=chunk(s.x+s.w/2,s.y+s.h/2);
    const r = (k: number): number => hash(i * 31 + k), style = facadeStyle(doors.get(i)?.kind, s.sign, s.height, r(1)), F = facades[style], H = 150 + s.height * 1250 + r(2) * 60, tall = H > 520 && r(3) < 0.7;
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
      const dz = ti === 0 ? doors.get(i) : undefined;
      sides.forEach((sd, si) => {
        // 이 면에 출입문이 있으면 문 위치(벽 위 거리)를 구한다
        let door = -1;
        if (dz && ((si === 0 && dz.y > t.z1) || (si === 1 && dz.y < t.z0) || (si === 2 && dz.x > t.x1) || (si === 3 && dz.x < t.x0))) door = si === 0 ? dz.x - t.x0 : si === 1 ? t.x1 - dz.x : si === 2 ? t.z1 - dz.y : dz.y - t.z0;
        // 외벽(윗부분)
        const u1 = sd.L / 176, vb = (yb - GF) / 184, vt = (t.y1 - GF) / 184, uo2 = uo + si * 0.37, bay = Math.max(1, Math.round(sd.L / 44));
        F.quad([P(sd, 0, yb), P(sd, sd.L, yb), P(sd, sd.L, t.y1), P(sd, 0, t.y1)], [sd.n[0], 0, sd.n[1]], tintC, [[uo2, vb], [uo2 + u1 * (bay * 44 / sd.L), vb], [uo2 + u1 * (bay * 44 / sd.L), vt], [uo2, vt]]);
        // Vertical facade ribs give the skyline real depth without additional materials.
        const surfaceBox = (a: number, b: number, lo: number, hi: number, depth: number, color: THREE.Color, target = trim, start = 0): void => {
          const p = P(sd, a, lo), q = P(sd, b, hi);
          const x0 = p[0] + sd.n[0] * start, z0 = p[2] + sd.n[1] * start;
          const x1 = q[0] + sd.n[0] * (start + depth), z1 = q[2] + sd.n[1] * (start + depth);
          target.box(Math.min(x0, x1), lo, Math.min(z0, z1), Math.max(x0, x1), hi, Math.max(z0, z1), color);
        };
        for (const f of facadeFins(sd.L, t.y1 - yb, style, quality)) {
          surfaceBox(f.at - f.width / 2, f.at + f.width / 2, yb + 5, t.y1 - 10, f.depth, light.clone().lerp(dark, f.shade));
        }
        if (ti === 0) {   // 1층 상점가 + 차양
          const S = shops[(style + si) % 2], gu = sd.L / 176;
          S.quad([P(sd, 0, 0), P(sd, sd.L, 0), P(sd, sd.L, GF), P(sd, 0, GF)], [sd.n[0], 0, sd.n[1]], light, [[0, 0], [gu, 0], [gu, 1], [0, 1]]);
          if (door >= 0) {   // 실제 출입문: 어두운 문틀 + 유리문 + 문턱, 위에는 작은 차양
            const q = (tt: number, y: number, out: number): number[] => { const p = P(sd, tt, y); return [p[0] + sd.n[0] * out, p[1], p[2] + sd.n[1] * out]; }, dn = [sd.n[0], 0, sd.n[1]], a0 = door - DOOR_W - 4, a1 = door + DOOR_W + 4;
            trim.quad([q(a0, 0, 1.2), q(a1, 0, 1.2), q(a1, DOOR_H + 5, 1.2), q(a0, DOOR_H + 5, 1.2)], dn, c.setHex(0x1a1c20).clone());
            trim.quad([q(door - DOOR_W, 0, 1.8), q(door + DOOR_W, 0, 1.8), q(door + DOOR_W, DOOR_H, 1.8), q(door - DOOR_W, DOOR_H, 1.8)], dn, c.setHex(0x6fa3c4).clone());
            trim.quad([q(door - 2, 0, 2.2), q(door + 2, 0, 2.2), q(door + 2, DOOR_H, 2.2), q(door - 2, DOOR_H, 2.2)], dn, c.setHex(0x1a1c20).clone());
            trim.quad([q(door - 14, 36, 2.6), q(door - 8, 36, 2.6), q(door - 8, 48, 2.6), q(door - 14, 48, 2.6)], dn, c.setHex(0xe8c868).clone());   // 손잡이
            // Recessed metallic entry frame, overhead canopy and a warm light strip.
            if (door > DOOR_W + 6 && door < sd.L - DOOR_W - 6) {
              const left = door - DOOR_W - 5, right = door + DOOR_W + 5;
              surfaceBox(left, left + 3, 4, DOOR_H + 5, 4, dark);
              surfaceBox(right - 3, right, 4, DOOR_H + 5, 4, dark);
              surfaceBox(left, right, DOOR_H + 5, DOOR_H + 8, 13, dark);
              const accent = new THREE.Color(dz ? BIZ[dz.kind].color : 0xffdeb1);
              surfaceBox(left + 4, right - 4, DOOR_H + 3, DOOR_H + 5, 1.8, accent, lamps, 10);
              if (dz?.kind === 'bank' && door > DOOR_W + 21 && door < sd.L - DOOR_W - 21) {
                // A stone pilaster and an entablature distinguish the central bank.
                for (const p of [left - 10, right + 4]) {
                  surfaceBox(p, p+6, 2, DOOR_H + 11, 6, light);
                  surfaceBox(p-2,p+8,0,5,9,dark);
                  surfaceBox(p-2,p+8,DOOR_H+9,DOOR_H+13,9,light);
                }
                surfaceBox(left-11,right+11,DOOR_H+13,DOOR_H+17,10,light);
              } else if (dz?.kind === 'casino' || dz?.kind === 'club') {
                for (const offset of [-1,1]) {
                  const center = door + offset * (DOOR_W + 3);
                  surfaceBox(center-0.8,center+0.8,9,DOOR_H-3,1.4,accent,lamps,4.2);
                }
              }
            }
            const s0 = q(door - DOOR_W - 6, 0, 0), s1 = q(door + DOOR_W + 6, 0, 12);   // 문턱 계단
            trim.box(Math.min(s0[0], s1[0]), 0, Math.min(s0[2], s1[2]), Math.max(s0[0], s1[0]), 3, Math.max(s0[2], s1[2]), c.setHex(0x8d8f94).clone());
          }
          for (let b = 0; b < bay; b++) if (hash(i * 97 + si * 13 + b) < 0.55 && H > 140) {
            const t0 = (b + 0.1) * sd.L / bay, t1 = (b + 0.9) * sd.L / bay, o = 15; if (door >= 0 && t1 > door - DOOR_W - 10 && t0 < door + DOOR_W + 10) continue; const col = c.setHex(AWN[Math.floor(hash(i + si * 7 + b * 3) * AWN.length)]).clone();
            const q = (tt: number, y: number, out: number): number[] => { const p = P(sd, tt, y); return [p[0] + sd.n[0] * out, p[1], p[2] + sd.n[1] * out]; };
            trim.quad([q(t0, GF - 22, 0.5), q(t1, GF - 22, 0.5), q(t1, GF - 34, o), q(t0, GF - 34, o)], [sd.n[0] * 0.5, 0.8, sd.n[1] * 0.5], col);
            trim.quad([q(t0, GF - 34, o), q(t1, GF - 34, o), q(t1, GF - 38, o), q(t0, GF - 38, o)], [sd.n[0], 0, sd.n[1]], col.clone().multiplyScalar(0.8));
          }
        }
        // 파이프 다발(산업풍 건물과 일부 건물): 외벽을 타고 오르는 수직관, 가로 배관, 붉은 플랜지
        if (ti === 0 && (style === 3 || r(95) < 0.3) && sd.L > 60 && hash(i * 41 + si) < 0.75) {
          const top = Math.min(t.y1 - 8, H - 8), steel = r(96) < 0.5, pc = new THREE.Color(steel ? 0x565c63 : 0x4a3a32), fl = new THREE.Color(0x8a2a24);
          const wallBox = (a: number, b: number, y0: number, y1: number, out: number, thick: number, cc: THREE.Color): void => {
            const p0 = P(sd, a, 0), p1 = P(sd, b, 0), xs = [p0[0], p1[0], p0[0] + sd.n[0] * (out + thick), p1[0] + sd.n[0] * (out + thick)], zs = [p0[2], p1[2], p0[2] + sd.n[1] * (out + thick), p1[2] + sd.n[1] * (out + thick)];
            trim.box(Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs), cc);
          };
          const nv = 1 + Math.floor(hash(i * 7 + si) * 3);
          for (let q = 0; q < nv; q++) { const tt = sd.L * (0.08 + 0.84 * hash(i * 11 + si * 5 + q)); if (door >= 0 && Math.abs(tt - door) < DOOR_W + 14) continue; wallBox(tt - 2.5, tt + 2.5, GF, top, 1, 5, pc); wallBox(tt - 4.5, tt + 4.5, GF + 40 + hash(q + i) * (top - GF) * 0.5, GF + 48 + hash(q + i) * (top - GF) * 0.5, 0.5, 6, fl); }
          const hy = GF + 50 + hash(i * 3 + si) * Math.max(10, top - GF - 70), a0 = sd.L * (0.1 + hash(i + si) * 0.3), a1 = Math.min(sd.L - 6, a0 + 50 + hash(i * 5 + si) * sd.L * 0.5);
          wallBox(a0, a1, hy, hy + 7, 3, 7, pc); wallBox(a0 - 3, a0 + 3, hy - 2, hy + 9, 2, 9, fl); wallBox(a1 - 3, a1 + 3, hy - 2, hy + 9, 2, 9, fl);
        }
        // 세로로 걸린 네온 돌출 간판 + 젖은 길 위에 번지는 반사 줄기
        if (ti === 0 && sd.L > 70 && H > GF + 130 && hash(i * 53 + si * 7) < 0.36) {
          const bi = Math.floor(hash(i * 29 + si) * BLADES.length), tt = sd.L * (0.15 + hash(i * 13 + si * 3) * 0.7);
          if (door < 0 || Math.abs(tt - door) > 50) {
            const y0 = GF + 28 + hash(i + si * 11) * Math.min(220, H - GF - 150), bw = 20, bh = 58, b0 = P(sd, tt, y0), dd = [sd.d[0], 0, sd.d[1]], o = (k: number, y: number): number[] => [b0[0] + sd.n[0] * k, y, b0[2] + sd.n[1] * k];
            blades[bi].quad([o(0, y0), o(bw, y0), o(bw, y0 + bh), o(0, y0 + bh)], dd, white, [[0, 0], [1, 0], [1, 1], [0, 1]]);
            const bx = Math.min(b0[0], b0[0] + sd.n[0] * 6), bz = Math.min(b0[2], b0[2] + sd.n[1] * 6); trim.box(bx - 1, y0 + bh * 0.5 - 1, bz - 1, bx + Math.abs(sd.n[0]) * 6 + 1, y0 + bh * 0.5 + 1, bz + Math.abs(sd.n[1]) * 6 + 1, new THREE.Color(0x2a2d33));
            const cc = new THREE.Color(BLADES[bi][1]), sx = b0[0] + sd.n[0] * 34, sz = b0[2] + sd.n[1] * 34, ln = 70, wd = 9;
            streaks.quad([[sx - sd.d[0] * ln - sd.n[0] * wd, 1.2, sz - sd.d[1] * ln - sd.n[1] * wd], [sx - sd.d[0] * ln + sd.n[0] * wd, 1.2, sz - sd.d[1] * ln + sd.n[1] * wd], [sx + sd.d[0] * ln + sd.n[0] * wd, 1.2, sz + sd.d[1] * ln + sd.n[1] * wd], [sx + sd.d[0] * ln - sd.n[0] * wd, 1.2, sz + sd.d[1] * ln - sd.n[1] * wd]], [0, 1, 0], cc, [[0, 0], [1, 0], [1, 1], [0, 1]]);
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
        if (tall) { beacons.push([t.x0 + 5, t.y1 + 9, t.z0 + 5], [t.x1 - 5, t.y1 + 9, t.z1 - 5]); }
        const w = t.x1 - t.x0, d = t.z1 - t.z0, n = 2 + Math.floor(r(8) * 4);
        for (let k = 0; k < n; k++) {
          const px = t.x0 + 12 + r(20 + k) * (w - 36), pz = t.z0 + 12 + r(40 + k) * (d - 36), kind = Math.floor(r(60 + k) * 5);
          if (kind === 0) {
            trim.box(px, t.y1 + 1, pz, px + 16, t.y1 + 11, pz + 12, c.set(0x8d939c));
            if (quality !== 'low') {
              trim.box(px + 2, t.y1 + 11, pz + 2, px + 14, t.y1 + 12, pz + 10, c.set(0x333b44));
              for (let f = 0; f < 4; f++) trim.box(px + 3 + f * 3, t.y1 + 12, pz + 2, px + 4 + f * 3, t.y1 + 12.6, pz + 10, c.set(0x9ca3a8));
            }
          }
          else if (kind === 1) { trim.box(px, t.y1 + 1, pz, px + 8, t.y1 + 22, pz + 8, c.set(0x6b4a30)); trim.box(px - 3, t.y1 + 22, pz - 3, px + 11, t.y1 + 32, pz + 11, c.set(0x7d5a3a)); }   // 물탱크
          else if (kind === 2) trim.box(px, t.y1 + 1, pz, px + 20, t.y1 + 16, pz + 18, c.set(0xb8b3aa));        // 계단탑
          else if (kind === 3) trim.box(px, t.y1 + 1, pz, px + 2, t.y1 + 38, pz + 2, c.set(0x30343a));          // 안테나
          else {   // 굴뚝: 붉은 띠 + 끝에서 연기가 오른다
            const sh = 56 + r(70 + k) * 44; trim.box(px, t.y1 + 1, pz, px + 9, t.y1 + sh, pz + 9, c.set(0x5a5650)); trim.box(px - 0.5, t.y1 + sh - 14, pz - 0.5, px + 9.5, t.y1 + sh - 8, pz + 9.5, c.set(0xa23a2e));
            if (stacks.length < 46) { stacks.push({ x: px + 4.5, y: t.y1 + sh + 3, z: pz + 4.5, rise: 150, spread: 0.7, smoke: true }); if (tall) beacons.push([px + 4.5, t.y1 + sh + 6, pz + 4.5]); }
          }
        }
      }
    });
    // 모서리 벽기둥 + 하단 기단
    const t0 = tiers[0]; if (tall && style === 3) beacons.push([t0.x1 + 3, t0.y1 * 0.97, t0.z1 + 3]);
    for (const [cx, cz] of [[t0.x0, t0.z0], [t0.x1, t0.z0], [t0.x0, t0.z1], [t0.x1, t0.z1]]) trim.box(cx - 3, 0, cz - 3, cx + 3, Math.min(t0.y1, H) - 4, cz + 3, light, false);
    trim.box(t0.x0 - 2, 0, t0.z0 - 2, t0.x1 + 2, 8, t0.z1 + 2, dark, true);
    if (s.sign) {
      const stex = new THREE.CanvasTexture((() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d')!; g.fillStyle = '#14161a'; g.fillRect(0, 0, 256, 96); g.strokeStyle = s.signColor!; g.lineWidth = 6; g.strokeRect(5, 5, 246, 86); g.fillStyle = s.signColor!; g.font = '900 60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.sign!, 128, 52); return cv; })());
      stex.colorSpace = THREE.SRGBColorSpace; const sm = new THREE.MeshBasicMaterial({ map: stex, side: THREE.DoubleSide }), W = Math.min(s.w, s.h, 150) * 0.9, top = tiers[tiers.length - 1].y1; signMats.push(sm);
      for (let q = 0; q < 2; q++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, W * 0.375), sm); m.position.set(s.x + s.w / 2, top + W * 0.22 + 8, s.y + s.h / 2); m.rotation.y = q * Math.PI / 2; scene.add(m); }
    }
  });
  // Shallow curb geometry follows existing block boundaries; it changes no collision.
  if (quality !== 'low') for (const b of world.map.blocks) {
    if (b.type === 'void') continue;
    const x = b.x, z = b.y, e = BLOCK, c = new THREE.Color(0x94989b), {trim}=chunk(x+e/2,z+e/2);
    trim.box(x, 0.05, z, x + e, 2.5, z + 4, c);
    trim.box(x, 0.05, z + e - 4, x + e, 2.5, z + e, c);
    trim.box(x, 0.05, z + 4, x + 4, 2.5, z + e - 4, c);
    trim.box(x + e - 4, 0.05, z + 4, x + e, 2.5, z + e - 4, c);
  }
  const add = (m: Mesh, mat: THREE.Material, shadow = true): void => { if (!m.idx.length) return; const o = new THREE.Mesh(m.geo(), mat); o.castShadow = shadow; o.receiveShadow = shadow; scene.add(o); };
  const facadeMats = FACADE_STYLES.map(n => new THREE.MeshLambertMaterial({ map: tex(`facade_${n}`), emissiveMap: tex(`facade_${n}_e`), emissive: 0xffd9a8, emissiveIntensity: 0.5, vertexColors: true, side: THREE.DoubleSide }));
  const shopMats = [0,1].map(k => new THREE.MeshLambertMaterial({ map: shopTexture(k * 2), emissiveMap: shopEmissive(k * 2), emissive: 0xffffff, emissiveIntensity: 0.2, vertexColors: true, side: THREE.DoubleSide }));
  const trimMat = new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  const entryMat = new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  for(const bin of chunks.values()){
    bin.facades.forEach((m,k)=>add(m,facadeMats[k]));
    bin.shops.forEach((m,k)=>add(m,shopMats[k]));
    add(bin.trim,trimMat); add(bin.lamps,entryMat,false);
  }
  // 네온 돌출 간판(스스로 빛나는 재질)과 반사 줄기(가산 혼합)
  const bladeMats = BLADES.map(([text, color]) => new THREE.MeshBasicMaterial({ map: bladeTexture(text, color), side: THREE.DoubleSide }));
  blades.forEach((m, k) => { if (!m.idx.length) return; const o = new THREE.Mesh(m.geo(), bladeMats[k]); scene.add(o); });
  const streakMat = new THREE.MeshBasicMaterial({ map: streakTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
  if (streaks.idx.length) { const o = new THREE.Mesh(streaks.geo(), streakMat); o.renderOrder = 3; scene.add(o); }
  // 붉은 항공장애등: 흐린 비 오는 하늘 아래에서도 도시 스카이라인이 읽히도록 번쩍이는 점
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  if (g) { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const glow = new THREE.CanvasTexture(cv), groups = [new THREE.Group(), new THREE.Group()];
  beacons.forEach(([x, y, z], k) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff2a1c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.scale.setScalar(46); sp.position.set(x, y, z); groups[k % 2].add(sp);
  });
  scene.add(groups[0], groups[1]);
  const beaconMats = groups.flatMap(g => g.children.map(c => (c as THREE.Sprite).material as THREE.SpriteMaterial));
  return {
    blink: (t: number): void => { const ph = (t % 2.4) / 2.4; groups[0].visible = ph < 0.4; groups[1].visible = ph >= 0.5 && ph < 0.9; },
    setMood: (atm: Atmosphere): void => {
      // 창문은 낮엔 거의 꺼지고 밤·흐린 날엔 켜진다. 네온은 낮에도 은은하게 보인다.
      facadeMats.forEach(m => { m.emissiveIntensity = 0.05 + atm.windows * 0.72; }); shopMats.forEach(m => { m.emissiveIntensity = 0.05 + atm.windows * 1.15; });
      entryMat.color.setScalar(0.45 + atm.lamps * 0.95);
      const n = 0.3 + atm.neon * 0.95; bladeMats.forEach(m => m.color.setScalar(n)); signMats.forEach(m => m.color.setScalar(0.4 + atm.neon * 0.8));
      streakMat.opacity = Math.min(1, atm.wet * atm.lamps * 0.34); streakMat.visible = streakMat.opacity > 0.02;
      for (const m of beaconMats) m.opacity = 0.7 + atm.night * 0.3;
    },
    stacks,
  };
}

/** 맵 가장자리를 둘러싼 방파제 벽 + 철조망 기둥 (자기장 대신 자연스러운 경계) */
export function buildPerimeter(scene: THREE.Scene): void {
  const m = new Mesh(), conc = new THREE.Color(0x8f9196), cap = new THREE.Color(0xc7c8cc), dark = new THREE.Color(0x4c4e54), H = 130, T = 40, E = 6000;
  const ring = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, c: THREE.Color): void => {
    m.box(x0 - T, y0, z0 - T, x1 + T, y1, z0, c); m.box(x0 - T, y0, z1, x1 + T, y1, z1 + T, c); m.box(x0 - T, y0, z0, x0, y1, z1, c); m.box(x1, y0, z0, x1 + T, y1, z1, c);
  };
  ring(0, 0, SIZE, SIZE, -20, H, conc); ring(-6, -6, SIZE + 6, SIZE + 6, H, H + 10, cap); ring(0, 0, SIZE, SIZE, -20, 14, dark);
  for (let k = 0; k <= SIZE; k += 120) for (const [x, z] of [[k, -2], [k, SIZE + 2], [-2, k], [SIZE + 2, k]]) m.box(x - 2, H + 10, z - 2, x + 2, H + 56, z + 2, dark);
  for (const [a, b, c2, d] of [[-E, -E, SIZE + E, -T - 1], [-E, SIZE + T + 1, SIZE + E, SIZE + E], [-E, -T - 1, -T - 1, SIZE + T + 1], [SIZE + T + 1, -T - 1, SIZE + E, SIZE + T + 1]]) m.box(a, -40, b, c2, -8, d, new THREE.Color(0x2a4558));
  const o = new THREE.Mesh(m.geo(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); o.castShadow = false; scene.add(o);
}
