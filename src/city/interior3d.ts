// LAST CITY — 사업체 내부 3D 장면. 업종마다 바닥·벽·조명·가구·사람을 다르게 꾸밉니다.
// 도시 장면과 별개의 Scene 이라 도시 렌더러는 건드리지 않고, 보스가 안에 있는 동안 이 장면만 그립니다.
// 크기는 사람 눈금(scale.ts)을 따르므로 눈높이(EYE_IN)가 서 있는 점원과 같습니다.
import * as THREE from 'three';
import type { BizKind } from './defs';
import { DOOR_HALF, type InteriorLayout } from './interior';
import { DECOR } from './interiordecor';
import { addFolk, type FolkLook } from './interiorfolk';
import { furnish } from './interiorfurn';
import { Kit, rnd, type Quality } from './interiorkit';
import type { Models } from './models';
import { EYE_HEIGHT } from './scale';

/** 1인칭 눈높이(키 1.9m 모델의 눈). 서 있는 점원·손님의 눈과 같습니다. */
export const EYE_IN = EYE_HEIGHT;
type Ctx2D = CanvasRenderingContext2D;

interface Mood {
  bg: number; fog: number; fogD: number; amb: number; ambI: number; trim: number;
  /** 바닥 그림 한 장이 덮는 월드 길이 */
  span: number; floor: (g: Ctx2D) => void; wall: (g: Ctx2D) => void; ceil: (g: Ctx2D) => void;
  look: FolkLook;
}

const noise = (g: Ctx2D, n: number, a: string, b: string, size = 256): void => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(rnd(i) * size, rnd(i + 9) * size, 2 + rnd(i + 3) * 14, 1 + rnd(i + 5) * 3); } };
const checker = (g: Ctx2D, a: string, b: string, n: number): void => { const s = 256 / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * s, y * s, s, s); } };
/** 사각 패널 천장 그림 */
const ceilGrid = (base: string, line: string) => (g: Ctx2D): void => { g.fillStyle = base; g.fillRect(0, 0, 256, 256); noise(g, 160, 'rgba(0,0,0,0.04)', 'rgba(255,255,255,0.05)'); g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.lineWidth = 1.2; g.stroke(); };

const MOODS: Record<BizKind, Mood> = {
  store: {
    bg: 0xdfe6e4, fog: 0xdfe6e4, fogD: 0.0006, amb: 0xdfe8e6, ambI: 1.2, trim: 0x3fae6a, span: 100, look: { uniform: 0x3fae6a, seat: 0xe8ece9, seat2: 0x3fae6a },
    floor: g => checker(g, '#eceeea', '#bcd2c6', 8),
    wall: g => { g.fillStyle = '#eef2ee'; g.fillRect(0, 0, 256, 256); noise(g, 80, 'rgba(0,0,0,0.025)', 'rgba(255,255,255,0.05)'); g.fillStyle = '#cfe8d9'; g.fillRect(0, 160, 256, 96); g.strokeStyle = '#a3c4b2'; g.lineWidth = 2; for (let r = 0; r < 5; r++) { const y = 160 + r * 19.2; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let c = 0; c < 4; c++) { const x = (r % 2 ? 32 : 0) + c * 64; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 19.2); g.stroke(); } } g.fillStyle = '#3fae6a'; g.fillRect(0, 150, 256, 10); },
    ceil: ceilGrid('#f2f4f2', '#cdd3d0'),
  },
  club: {
    bg: 0x08040f, fog: 0x08040f, fogD: 0.0016, amb: 0x5a3a90, ambI: 0.95, trim: 0xff3fd0, span: 128, look: { uniform: 0x1b1b22, seat: 0x2a1030, seat2: 0xff3fd0 },
    floor: g => { g.fillStyle = '#0c0814'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(255,70,220,0.5)'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } },
    wall: g => { g.fillStyle = '#150d20'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#1c1230' : '#120a1c'; g.fillRect(i * 16, 0, 16, 256); } g.fillStyle = '#2a1840'; for (let y = 160; y < 256; y += 32) for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x + 16, y); g.lineTo(x + 32, y + 16); g.lineTo(x + 16, y + 32); g.lineTo(x, y + 16); g.fill(); } g.fillStyle = '#ff3fd0'; g.fillRect(0, 154, 256, 3); },
    ceil: g => { g.fillStyle = '#0a0612'; g.fillRect(0, 0, 256, 256); noise(g, 60, 'rgba(120,60,180,0.12)', 'rgba(0,0,0,0.3)'); },
  },
  plant: {
    bg: 0x1b2127, fog: 0x1b2127, fogD: 0.0017, amb: 0xa8c0d4, ambI: 1.3, trim: 0xffc21c, span: 96, look: { uniform: 0xff8a1c, seat: 0x3a4048, seat2: 0xff8a1c },
    floor: g => { g.fillStyle = '#8a9097'; g.fillRect(0, 0, 256, 256); noise(g, 380, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.05)'); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254); },
    wall: g => { g.fillStyle = '#9aa4ac'; g.fillRect(0, 0, 256, 256); noise(g, 300, 'rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'); g.fillStyle = '#5f6b76'; g.fillRect(0, 150, 256, 106); g.strokeStyle = '#38414a'; g.lineWidth = 3; for (let x = 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, 150); g.lineTo(x, 256); g.stroke(); } g.fillStyle = '#8c969e'; for (let x = 8; x < 256; x += 32) for (const y of [158, 246]) { g.beginPath(); g.arc(x, y, 2, 0, 6.29); g.fill(); } for (let i = -1; i < 16; i++) { g.fillStyle = i % 2 ? '#ffc21c' : '#1c1c1c'; g.beginPath(); g.moveTo(i * 16, 256); g.lineTo(i * 16 + 8, 232); g.lineTo(i * 16 + 24, 232); g.lineTo(i * 16 + 16, 256); g.fill(); } },
    ceil: g => { g.fillStyle = '#4a525a'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#363d44'; g.lineWidth = 3; for (let x = 0; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); } },
  },
  casino: {
    bg: 0x1c0608, fog: 0x1c0608, fogD: 0.0012, amb: 0xffc7a0, ambI: 1.05, trim: 0xffd24a, span: 100, look: { uniform: 0x8a1c2a, seat: 0x7a1018, seat2: 0xd9a82c },
    floor: g => { g.fillStyle = '#7a1018'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#d9a82c'; g.lineWidth = 3; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const cx = 64 + x * 128, cy = 64 + y * 128; g.beginPath(); g.moveTo(cx, cy - 44); g.lineTo(cx + 44, cy); g.lineTo(cx, cy + 44); g.lineTo(cx - 44, cy); g.closePath(); g.stroke(); g.beginPath(); g.arc(cx, cy, 14, 0, 6.29); g.stroke(); } },
    wall: g => { g.fillStyle = '#5a0f18'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(217,168,44,0.35)'; g.lineWidth = 2; for (let y = -32; y < 160; y += 32) for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x + 16, y); g.lineTo(x + 32, y + 16); g.lineTo(x + 16, y + 32); g.lineTo(x, y + 16); g.closePath(); g.stroke(); } g.fillStyle = '#2e1608'; g.fillRect(0, 160, 256, 96); g.strokeStyle = '#d9a82c'; g.lineWidth = 3; for (let x = 0; x < 256; x += 64) g.strokeRect(x + 6, 172, 52, 72); g.fillStyle = '#d9a82c'; g.fillRect(0, 154, 256, 6); },
    ceil: g => { g.fillStyle = '#2a0a0e'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#d9a82c'; g.lineWidth = 3; g.strokeRect(12, 12, 232, 232); g.lineWidth = 1.5; g.strokeRect(28, 28, 200, 200); },
  },
  bank: {
    bg: 0xcfc8b8, fog: 0xcfc8b8, fogD: 0.0007, amb: 0xfff1d6, ambI: 1.05, trim: 0xc9a227, span: 100, look: { uniform: 0x22344f, seat: 0x5a3a24, seat2: 0x6b4a2e },
    floor: g => checker(g, '#efe9dc', '#9a9c9f', 6),
    wall: g => { g.fillStyle = '#ded6c4'; g.fillRect(0, 0, 256, 256); noise(g, 120, 'rgba(0,0,0,0.03)', 'rgba(255,255,255,0.06)'); g.strokeStyle = 'rgba(160,140,100,0.5)'; g.lineWidth = 3; for (let x = 0; x < 256; x += 64) g.strokeRect(x + 8, 14, 48, 124); g.fillStyle = '#b8b0a0'; g.fillRect(0, 160, 256, 96); g.strokeStyle = '#7d7466'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(rnd(i) * 256, 160); g.lineTo(rnd(i + 3) * 256, 256); g.stroke(); } g.fillStyle = '#c9a227'; g.fillRect(0, 154, 256, 6); },
    ceil: ceilGrid('#ece6d8', '#bdb298'),
  },
  gunshop: {
    bg: 0x120c0b, fog: 0x120c0b, fogD: 0.0014, amb: 0xd8b8a0, ambI: 1.15, trim: 0xff3b30, span: 96, look: { uniform: 0x2e3a22, seat: 0x3a2a20, seat2: 0x2a2018 },
    floor: g => { g.fillStyle = '#5a5651'; g.fillRect(0, 0, 256, 256); noise(g, 300, 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.06)'); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.strokeRect(0, 0, 256, 256); },
    wall: g => { g.fillStyle = '#4e4038'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#5a4a40' : '#483a32'; g.fillRect(i * 16, 0, 15, 256); } g.fillStyle = '#2c3237'; g.fillRect(0, 160, 256, 96); g.strokeStyle = '#4a5258'; g.lineWidth = 2; for (let y = 160; y < 256; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); } g.fillStyle = '#ff3b30'; g.fillRect(0, 156, 256, 4); },
    ceil: g => { g.fillStyle = '#3a2f2a'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#4a3c35'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256); },
  },
};

export class Interior3D {
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(75, 1, 1.2, 1400); private kit: Kit;

  constructor(public lay: InteriorLayout, public quality: Quality, models: Models | null = null) {
    const kit = this.kit = new Kit(this.scene, quality), m = MOODS[lay.kind];
    this.scene.background = new THREE.Color(m.bg); this.scene.fog = new THREE.FogExp2(m.fog, m.fogD);
    this.scene.add(new THREE.AmbientLight(m.amb, m.ambI), this.camera);
    this.shell(m);
    const ctx = { kit, lay, models, stock: kit.stock(2600, 1400) };
    furnish(ctx); DECOR[lay.kind](ctx, m.look); addFolk(kit, models, quality === 'high' ? lay.folk : lay.folk.slice(0, quality === 'standard' ? 8 : 4), m.look);
  }

  /** 바닥·천장·벽·출입문(바깥 거리의 빛) */
  private shell(m: Mood): void {
    const { kit } = this, { w: W, d: D, h: H } = this.lay, gap = DOOR_HALF, doorH = 48, dk = kit.mat(0x15171b), trim = kit.mat(m.trim, m.trim, this.lay.kind === 'club' ? 0.9 : 0.15);
    const flat = (w: number, h: number, map: THREE.Texture, x: number, y: number, z: number, rx: number, ry: number): THREE.Mesh => {
      const geo = new THREE.PlaneGeometry(w, h), mat = new THREE.MeshLambertMaterial({ map }); kit.own(geo, mat); const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); this.scene.add(o); return o;
    };
    const tile = (draw: (g: Ctx2D) => void, repeatX: number, repeatY: number): THREE.CanvasTexture => kit.tex(256, 256, draw, [repeatX, repeatY]);
    flat(W, D, tile(m.floor, W / m.span, D / m.span), W / 2, 0, D / 2, -Math.PI / 2, 0);
    flat(W, D, tile(m.ceil, W / 42, D / 42), W / 2, H, D / 2, Math.PI / 2, 0);
    // 벽: 한 장의 그림을 가로로 반복(그림 한 칸 = 약 3m)
    const wallTex = (len: number): THREE.CanvasTexture => tile(m.wall, len / 64, 1);
    flat(W, H, wallTex(W), W / 2, H / 2, 0, 0, 0);                                        // 안쪽(북)
    flat(D, H, wallTex(D), 0, H / 2, D / 2, 0, Math.PI / 2);                              // 왼쪽(서)
    flat(D, H, wallTex(D), W, H / 2, D / 2, 0, -Math.PI / 2);                             // 오른쪽(동)
    const fl = W / 2 - gap; flat(fl, H, wallTex(fl), fl / 2, H / 2, D, 0, Math.PI); flat(fl, H, wallTex(fl), W - fl / 2, H / 2, D, 0, Math.PI);      // 입구 벽 좌우
    flat(gap * 2, H - doorH, wallTex(gap * 2), W / 2, doorH + (H - doorH) / 2, D, 0, Math.PI);                                                                // 문 위
    // 문틀 + 바깥 거리의 빛(노을)
    kit.box(W / 2 - gap - 1.6, 0, D - 1.6, W / 2 - gap, doorH, D + 2, dk); kit.box(W / 2 + gap, 0, D - 1.6, W / 2 + gap + 1.6, doorH, D + 2, dk); kit.box(W / 2 - gap - 1.6, doorH - 0.6, D - 1.6, W / 2 + gap + 1.6, doorH + 1.4, D + 2, dk);
    const out = kit.tex(64, 128, g => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#f6c08a'); gr.addColorStop(0.55, '#ffd9a8'); gr.addColorStop(1, '#7b7f88'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); g.fillStyle = 'rgba(70,74,84,0.55)'; for (let i = 0; i < 6; i++) g.fillRect(i * 11, 52 - rnd(i + 2) * 30, 8, 80); });
    kit.plane(gap * 2, doorH, out, W / 2, doorH / 2, D + 3, Math.PI, true);
    const exit = kit.tex(128, 48, g => { g.fillStyle = '#0b3d1e'; g.fillRect(0, 0, 128, 48); g.fillStyle = '#7dffb0'; g.font = '900 32px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT ▼', 64, 26); });
    kit.plane(24, 9, exit, W / 2, doorH + 8, D - 1, Math.PI, true);
    // 앞쪽 큰 창(바깥 거리 그림)
    for (const cx of [W / 4 - gap / 2, W - W / 4 + gap / 2]) { const ww = W / 2 - gap - 30; kit.plane(ww, 30, out, cx, 36, D - 0.4, Math.PI, true); kit.box(cx - ww / 2 - 1, 20, D - 1.4, cx + ww / 2 + 1, 22, D, dk); kit.box(cx - ww / 2 - 1, 50, D - 1.4, cx + ww / 2 + 1, 52, D, dk); for (let i = 0; i <= 3; i++) kit.box(cx - ww / 2 + i * ww / 3 - 0.6, 20, D - 1.4, cx - ww / 2 + i * ww / 3 + 0.6, 52, D, dk); }
    // 걸레받이·천장 몰딩
    kit.box(0, 0, 0, W, 2.2, 0.9, trim); kit.box(0, 0, 0, 0.9, 2.2, D, trim); kit.box(W - 0.9, 0, 0, W, 2.2, D, trim); kit.box(0, H - 2.4, 0, W, H, 0.9, trim); kit.box(0, H - 2.4, 0, 0.9, H, D, trim); kit.box(W - 0.9, H - 2.4, 0, W, H, D, trim);
  }

  /** 카메라(플레이어 눈)와 모든 움직임(조명·화면·사람) 갱신 */
  update(t: number, x: number, y: number, yaw: number, pitch: number, bob: number, aspect: number): void {
    for (const a of this.kit.anim) a(t);
    if (Math.abs(this.camera.aspect - aspect) > 1e-3) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
    const cp = Math.cos(pitch), eye = EYE_IN + bob * 0.5;
    this.camera.position.set(x, eye, y); this.camera.lookAt(x + Math.cos(yaw) * cp * 100, eye + Math.sin(pitch) * 100, y + Math.sin(yaw) * cp * 100);
  }
  dispose(): void { this.kit.dispose(); this.scene.clear(); }
}
