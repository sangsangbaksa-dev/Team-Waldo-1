// LAST CITY — 사업체 가구. interior.ts 의 Solid(style)마다 사람 눈금에 맞는 모양을 만듭니다.
// 좌표는 월드 단위(1m ≈ 21)이고, 진열 상품은 Stock(인스턴싱)으로 한 번에 그립니다.
import * as THREE from 'three';
import type { BizKind } from './defs';
import type { InteriorLayout, Solid } from './interior';
import { Kit, PALETTE, rnd, type Stock } from './interiorkit';
import { bake, type Models } from './models';
import { HUMAN } from './scale';

/** 업종별 계산대 색: [몸통, 상판] */
const COUNTER: Record<BizKind, [number, number]> = { store: [0xf4f6f4, 0xcfd6d4], club: [0x1b1424, 0x2a1f3a], plant: [0x4b5560, 0x2e353c], casino: [0x3a0d12, 0xd8b24a], bank: [0x6b4a2e, 0xd8d2c4], gunshop: [0x3a2a20, 0x16181c] };

export interface FurnCtx { kit: Kit; lay: InteriorLayout; models: Models | null; stock: Stock }

/** 이 가구에 앉은 사람이 바라보는 방향(없으면 기본값) */
const seatedFacing = (lay: InteriorLayout, s: Solid, dflt: number): number => {
  const f = lay.folk.find(p => p.pose !== 'stand' && p.x >= s.x0 && p.x <= s.x1 && p.y >= s.y0 && p.y <= s.y1); return f ? f.ang : dflt;
};

export function furnish(c: FurnCtx): void {
  for (const s of c.lay.solids) {
    const fn = BUILD[s.style]; if (fn) fn(c, s);
  }
  c.stock.done();
}

type Build = (c: FurnCtx, s: Solid) => void;
const dims = (s: Solid): { w: number; d: number; cx: number; cz: number } => ({ w: s.x1 - s.x0, d: s.y1 - s.y0, cx: (s.x0 + s.x1) / 2, cz: (s.y0 + s.y1) / 2 });

// ---------- 계산대 ----------
const counter: Build = ({ kit, lay }, s) => {
  const k = lay.kind, [body, top] = COUNTER[k], { w, d, cx } = dims(s), { x0, y0, x1, y1, h } = s, vertical = d > w * 1.6;
  kit.box(x0, 1.5, y0, x1, h - 1.4, y1, kit.mat(body, k === 'club' ? 0xff3fd0 : 0, k === 'club' ? 0.28 : 0));
  kit.box(x0 + 0.5, 0, y0 + 0.5, x1 - 0.5, 1.5, y1 - 0.5, kit.mat(0x15171b));                    // 발 받침
  kit.box(x0 - 1.2, h - 1.4, y0 - 1.2, x1 + 1.2, h, y1 + 1.2, kit.mat(top, k === 'bank' || k === 'casino' ? 0x3a2b00 : 0, 0.25));
  if (s.h <= 0 || w < 14 && d < 14) return;
  if (k === 'club' && vertical) { // 바: 앞(서쪽)면 LED 띠 + 술잔 + 맥주 탭
    kit.box(x0 - 0.2, 4, y0, x0 + 0.2, 5.2, y1, kit.glow(0xff3fd0)); kit.box(x0 - 0.2, h - 6, y0, x0 + 0.2, h - 5, y1, kit.glow(0x35d9e6));
    for (let i = 0; i < 9; i++) kit.tube(x0 + 5, h, y0 + 8 + i * ((d - 16) / 8), 0.9, 2.6, kit.mat(0xcfe8ff, 0x335577, 0.4, { transparent: true, opacity: 0.6 }));
    for (let i = 0; i < 3; i++) { const z = y0 + d * (0.25 + i * 0.25); kit.tube(cx + 3, h, z, 0.7, 4, kit.mat(0xc8ccd2)); kit.box(cx + 3 - 0.6, h + 3.4, z - 0.6, cx + 3 + 2.8, h + 4.4, z + 0.6, kit.mat(0xc8ccd2)); }
  }
};

// ---------- 진열 선반 / 냉장고 / 랙 ----------
const shelf: Build = ({ kit, lay, stock }, s) => {
  const k = lay.kind, { w, d, cz } = dims(s), { x0, y0, x1, y1, h } = s, wall = y0 <= 4, steel = k === 'gunshop' ? 0x4a4f4a : 0xb8c0bc, board = k === 'gunshop' ? 0x3a3f3a : 0x9aa4a0;
  const levels = k === 'gunshop' ? 3 : 4, step = kit.quality === 'high' ? 3.4 : 4.6, back = kit.mat(steel);
  kit.box(x0, 0, y0, x1, 3, y1, kit.mat(0x6b7570));                                                                          // 받침
  if (wall) kit.box(x0, 3, y0, x1, h, y0 + 1.2, back); else kit.box(x0, 3, cz - 0.8, x1, h, cz + 0.8, back);
  kit.box(x0, 3, y0, x0 + 1.2, h, y1, back); kit.box(x1 - 1.2, 3, y0, x1, h, y1, back); kit.box(x0, h, y0, x1, h + 1, y1, kit.mat(k === 'gunshop' ? 0x1c1f1c : 0x3fae6a));
  const faces = wall ? [y1 - 3] : [y0 + 3.4, y1 - 3.4];
  for (let l = 0; l < levels; l++) {
    const y = 3 + l * (h - 5) / levels, bm = kit.mat(board); kit.box(x0 + 1, y, y0, x1 - 1, y + 0.7, y1, bm);
    for (const fz of faces) {
      kit.box(x0 + 1, y + 0.7, fz < cz ? y0 : y1 - 0.5, x1 - 1, y + 1.5, fz < cz ? y0 + 0.5 : y1, kit.mat(0xf2f2f2));      // 가격표 띠(발광 아님)
      for (let i = 0, n = Math.floor((w - 4) / step); i < n; i++) {
        const x = x0 + 2.5 + i * step, r = rnd(i * 7 + l * 31 + x0 + (fz < cz ? 0 : 99)), c = k === 'gunshop' ? [0x8a2a1c, 0x3d5a2a, 0xb59a3a, 0x555a52][Math.floor(r * 4)] : PALETTE[Math.floor(r * PALETTE.length)];
        const room = (h - 5) / levels - 2.6, ih = Math.min(room, 3.4 + r * 2.2);
        if (k !== 'gunshop' && r > 0.62) stock.can(x, y + 0.7, fz, 1.1 + r * 0.3, Math.min(room, ih + 0.8), c); else stock.box(x, y + 0.7, fz, step * 0.72, ih, 2.4, c);
      }
    }
  }
  void d;
};

const fridge: Build = ({ kit }, s) => {
  const { w } = dims(s), { x0, y0, x1, y1, h } = s, n = Math.max(1, Math.floor(w / 16)), dw = w / n;
  kit.box(x0, 0, y0, x1, h, y1, kit.mat(0x2b3138)); kit.box(x0, h - 3, y0, x1, h, y1 + 1, kit.mat(0x1b1f24)); kit.box(x0, h - 5, y1 - 0.4, x1, h - 3.6, y1 + 0.4, kit.glow(0xbfe6ff));
  const door = kit.tex(128, 256, g => {
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#e7f7ff'); gr.addColorStop(1, '#a9d6f2'); g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
    for (let r = 0; r < 5; r++) { g.fillStyle = '#7fa6bd'; g.fillRect(0, 44 + r * 44, 128, 3); for (let c = 0; c < 6; c++) { g.fillStyle = ['#e94b4b', '#f5c242', '#4fa3ff', '#5ed388', '#ff8fd2', '#b77bff'][(r * 2 + c * 5) % 6]; g.beginPath(); g.roundRect(6 + c * 20, 12 + r * 44, 13, 31, 3); g.fill(); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(8 + c * 20, 16 + r * 44, 3, 22); } }
    g.strokeStyle = '#26303a'; g.lineWidth = 5; g.strokeRect(2, 2, 124, 252);
  });
  for (let i = 0; i < n; i++) { const x = x0 + dw * (i + 0.5); kit.plane(dw - 1.2, h - 9, door, x, (h - 5) / 2 + 1, y1 + 0.6, 0, true); kit.box(x + dw / 2 - 3, h * 0.35, y1 + 0.7, x + dw / 2 - 2.4, h * 0.65, y1 + 1.3, kit.mat(0xcfd6d4)); }
};

const rack: Build = ({ kit, stock }, s) => { // 과자 철제 랙
  const { w, cz } = dims(s), { x0, y0, x1, y1, h } = s, m = kit.mat(0x4a5058);
  for (const [px, pz] of [[x0, y0], [x1 - 0.8, y0], [x0, y1 - 0.8], [x1 - 0.8, y1 - 0.8]]) kit.box(px, 0, pz, px + 0.8, h, pz + 0.8, m);
  for (let l = 0; l < 4; l++) {
    const y = 3 + l * (h - 4) / 4; kit.box(x0, y, y0, x1, y + 0.6, y1, kit.mat(0x7d858c));
    for (let i = 0, n = Math.floor((w - 3) / 3.8); i < n; i++) { const r = rnd(i * 5 + l * 13 + x0); stock.box(x0 + 2.2 + i * 3.8, y + 0.6, cz, 3, 4 + r * 2, 7, PALETTE[Math.floor(r * 8) % 8]); }
  }
};

// ---------- 스낵 바 · 낮은 탁자 ----------
const bar: Build = ({ kit }, s) => {
  const { x0, y0, x1, y1, h } = s, d = x1 - x0;
  kit.box(x0, 0, y0 + 2, x0 + 1.4, h - 1.6, y1 - 2, kit.mat(0x5a5f66)); kit.box(x1 - 1, 0, y0, x1, h, y1, kit.mat(0xd9dedd));
  kit.box(x0, h - 1.6, y0, x1, h, y1, kit.mat(0xb9825a)); kit.box(x0 - 0.4, h - 2.2, y0, x0, h, y1, kit.mat(0x3fae6a));
  kit.box(x0 + 1, 3, y0 + 2, x0 + 2.2, 4, y1 - 2, kit.mat(0xb8bec4));   // 발판 봉
  void d;
};
const lowtable: Build = ({ kit, lay }, s) => {
  const { w, d, cx, cz } = dims(s), { x0, y0, x1, y1, h } = s, club = lay.kind === 'club';
  kit.box(x0, h - 1.4, y0, x1, h, y1, kit.mat(club ? 0x1b1424 : 0x6b4a32, club ? 0xff3fd0 : 0, club ? 0.25 : 0));
  for (const [px, pz] of [[x0 + 1, y0 + 1], [x1 - 2, y0 + 1], [x0 + 1, y1 - 2], [x1 - 2, y1 - 2]]) kit.box(px, 0, pz, px + 1, h - 1.4, pz + 1, kit.mat(0x2b2f36));
  for (let i = 0; i < 3; i++) kit.tube(cx + (i - 1) * Math.min(5, w / 3), h, y0 + 4 + i * (d - 8) / 2, 1.2, 3, kit.mat(club ? 0xff9ad8 : 0xf2f2f2, club ? 0x883366 : 0, 0.4));
  void cz;
};

// ---------- 클럽 ----------
const dj: Build = ({ kit, lay }, s) => {
  const { w, cx } = dims(s), { x0, x1, h } = s, z0 = s.y0, z1 = s.y1, col = 0xff6ad5;
  kit.box(x0 + 8, 0, z0, x1 - 8, h - 1.5, z1, kit.mat(0x14101c, col, 0.25)); kit.box(x0 + 6, h - 1.5, z0 - 1, x1 - 6, h, z1 + 1, kit.mat(0x30263f));
  kit.box(x0 + 8, 6, z1, x1 - 8, 7, z1 + 0.3, kit.glow(col));
  for (const dx of [0.24, 0.76]) { const px = x0 + w * dx; kit.tube(px, h, z0 + 6, 5.4, 0.9, kit.mat(0x0a0a0c)); kit.tube(px, h + 0.9, z0 + 6, 1.4, 0.3, kit.glow(0xffffff)); kit.box(px - 5.8, h - 0.2, z0 + 0.5, px + 5.8, h + 0.4, z1 - 0.5, kit.mat(0x1c1c22)); }
  kit.box(cx - 7, h, z0 + 2, cx + 7, h + 1.6, z1 - 2, kit.mat(0x22232a)); kit.box(cx - 5, h + 1.6, z0 + 3, cx + 5, h + 1.9, z1 - 3, kit.glow(0x35d9e6));
  const led = kit.tex(128, 64, g => { g.fillStyle = '#10051c'; g.fillRect(0, 0, 128, 64); for (let i = 0; i < 24; i++) { g.fillStyle = ['#ff3fd0', '#35d9e6', '#b77bff', '#ffd84a'][i % 4]; g.fillRect(i * 5.3, 64 - 8 - rnd(i) * 44, 4, 8 + rnd(i) * 44); } });
  const lp = kit.plane(w * 0.86, 36, led, cx, 40, 1.5, 0, true); kit.anim.push(t => { (lp.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.15) % 1, 0.7, 0.7); });
  void lay;
};
const speaker: Build = ({ kit, lay }, s) => {
  const { w, cx } = dims(s), { x0, y0, x1, y1, h } = s, face = y1 + 0.3, col = 0xff6ad5;
  kit.box(x0, 0, y0, x1, h, y1, kit.mat(0x0e0e12)); kit.box(x0, 0, y1 - 0.1, x1, 1.2, y1 + 0.4, kit.mat(col, col, 0.6));
  for (const [yy, r] of [[h * 0.74, w * 0.2], [h * 0.38, w * 0.36]]) { const cone = kit.tube(cx, yy, face, r, 0.8, kit.mat(0x25252c)); cone.rotation.x = Math.PI / 2; const cap = kit.tube(cx, yy, face + 0.6, r * 0.28, 0.6, kit.glow(col)); cap.rotation.x = Math.PI / 2; kit.anim.push(t => { cone.scale.set(r * (1 + Math.sin(t * 9 + yy) * 0.012), 0.8, r * (1 + Math.sin(t * 9 + yy) * 0.012)); }); }
  void lay;
};
const sofa: Build = ({ kit, lay }, s) => {
  const { x0, y0, x1, y1, h } = s, club = lay.kind === 'club', c = club ? 0x6b2a8f : 0x6b4a32, em = club ? 0x2a0a40 : 0, ei = club ? 0.4 : 0, ar = 3;
  kit.box(x0, 0, y0, x1, h * 0.5, y1, kit.mat(c, em, ei)); kit.box(x0 + 7, h * 0.5, y0 + ar, x1, h, y1 - ar, kit.mat(c + 0x101010, em, ei));            // 좌석
  kit.box(x0, h * 0.5, y0, x0 + 7.5, h + 9, y1, kit.mat(c - 0x080808, em, ei));                                                                          // 등받이(벽 쪽)
  for (const [a, b] of [[y0, y0 + ar], [y1 - ar, y1]]) kit.box(x0, h * 0.5, a, x1, h + 3.2, b, kit.mat(c - 0x080808, em, ei));                              // 팔걸이
  if (club) kit.box(x0 + 7.6, h + 8.8, y0, x0 + 8, h + 9.2, y1, kit.glow(0xff3fd0, 0.9));
};

// ---------- 정제 공장 ----------
const tank: Build = ({ kit }, s) => {
  const { w, d, cx, cz } = dims(s), { h } = s, r = Math.min(w, d) / 2 - 1.5, steel = kit.mat(0x4a5159), liquid = kit.mat(0x4fd6ff, 0x1a8fb0, 0.85, { transparent: true, opacity: 0.85 });
  kit.tube(cx, 0, cz, r + 1.5, 4, kit.mat(0x2f353b)); const body = kit.tube(cx, 4, cz, r, h - 8, steel); body.scale.x = body.scale.z = r;
  kit.tube(cx, h - 4, cz, r + 1.2, 4, kit.mat(0x2f353b)); for (const yy of [h * 0.28, h * 0.55, h * 0.8]) kit.tube(cx, yy, cz, r + 0.7, 1.4, kit.mat(0x373e45));
  const gauge = kit.tube(cx, 10, cz + r + 0.2, 1.6, h - 22, liquid); kit.box(cx - 2.4, 8, cz + r - 0.4, cx + 2.4, h - 10, cz + r + 0.4, kit.mat(0x1b1f24)); kit.anim.push(t => { (gauge.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.7 + Math.sin(t * 2 + cx) * 0.2; });
  kit.tube(cx + r * 0.6, h - 4, cz - r * 0.5, 1.6, 12, kit.mat(0x7a858f)); kit.tube(cx, h - 4, cz, 1.8, 14, kit.mat(0x7a858f));       // 천장으로 올라가는 배관
};
const machine: Build = ({ kit }, s) => {
  const { w, cx, cz } = dims(s), { x0, y0, x1, y1, h } = s;
  kit.box(x0, 0, y0, x1, h, y1, kit.mat(0x5d6b78)); kit.box(x0 - 0.8, h * 0.78, y0 - 0.8, x1 + 0.8, h, y1 + 0.8, kit.mat(0x3a4148)); kit.box(x0 + 3, h * 0.28, y1, x1 - 3, h * 0.7, y1 + 0.8, kit.mat(0x1c2630, 0x2fd6ff, 0.5));
  for (let i = 0; i < 5; i++) kit.box(x0 + 3 + i * (w - 6) / 5, h * 0.1, y1, x0 + 5 + i * (w - 6) / 5, h * 0.2, y1 + 0.5, kit.mat(0x22282e));
  kit.tube(cx, h, cz, 3, 8, kit.mat(0x3a4148)); const b = kit.tube(x1 - 4, h, y0 + 4, 1.5, 2.4, kit.glow(0xff7a2a)); kit.anim.push(t => { b.visible = Math.floor(t * 3) % 2 === 0; });
};
const console_: Build = ({ kit }, s) => { // 관제 벽면: 모니터 + 버튼 줄
  const { w } = dims(s), { x0, y0, x1, y1, h } = s;
  kit.box(x0, 0, y0, x1, h, y1, kit.mat(0x2c343c));
  const n = Math.floor(w / 18); for (let i = 0; i < n; i++) { const x = x0 + 3 + i * (w - 3) / n, sc = kit.box(x, h * 0.45, y1, x + (w - 3) / n - 3, h * 0.88, y1 + 0.6, kit.glow([0x35d9e6, 0x7dffb0, 0xffc21c][i % 3], 0.55)); kit.anim.push(t => { sc.visible = Math.sin(t * (1.3 + i * 0.4) + i) > -0.8; }); }
  for (let i = 0; i < 18; i++) kit.box(x0 + 3 + i * (w - 6) / 18, h * 0.2, y1, x0 + 5 + i * (w - 6) / 18, h * 0.3, y1 + 0.5, kit.glow([0xff4040, 0x7dffb0, 0xffc21c][i % 3], 0.7));
};
const crate: Build = ({ kit, lay }, s) => {
  const { w, d, cx, cz } = dims(s), { x0, y0, x1, y1, h } = s, gun = lay.kind === 'gunshop', wood = gun ? 0x4d5a32 : 0x9a7646, band = gun ? 0x2f3a1e : 0x6d522f;
  kit.box(x0, 0, y0, x1, 2.4, y1, kit.mat(0x7a5c36));                                                                                 // 팰릿
  const nx = Math.max(1, Math.round(w / 21)), nz = Math.max(1, Math.round(d / 21));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const ax = x0 + (w / nx) * i + 0.6, bx = x0 + (w / nx) * (i + 1) - 0.6, az = y0 + (d / nz) * j + 0.6, bz = y0 + (d / nz) * (j + 1) - 0.6, top = rnd(i * 5 + j * 11 + x0) > 0.5 ? h : h * 0.5;
    kit.box(ax, 2.4, az, bx, top, bz, kit.mat(wood)); kit.box(ax - 0.2, top * 0.4, az - 0.2, bx + 0.2, top * 0.4 + 1.2, bz + 0.2, kit.mat(band));
  }
  void cx; void cz;
};

// ---------- 카지노 ----------
const slot: Build = ({ kit }, s) => {
  const { d } = dims(s), { x0, y0, x1, h } = s, east = (s.pad?.e ?? 0) > 0, n = Math.max(1, Math.floor(d / 21)), step = d / n, fx = east ? x1 : x0;
  for (let i = 0; i < n; i++) {
    const a = y0 + i * step + 0.6, b = a + step - 1.2, c = PALETTE[(i + (east ? 0 : 3)) % 8];
    kit.box(x0, 0, a, x1, h, b, kit.mat(0x2b0d12, 0x4a0a14, 0.4)); kit.box(x0 - 0.4, h - 6, a - 0.3, x1 + 0.4, h, b + 0.3, kit.mat(0xd9a82c, 0x6a4a00, 0.6));                      // 몸통 + 금색 머리
    const sx0 = east ? x1 : x0 - 0.5, sx1 = east ? x1 + 0.5 : x0, scr = kit.box(sx0, h * 0.5, a + 2, sx1, h * 0.84, b - 2, kit.glow(c, 0.9));
    kit.box(sx0 - (east ? 0 : 3), h * 0.38, a + 1.5, sx1 + (east ? 3 : 0), h * 0.44, b - 1.5, kit.mat(0x6a1a22));                                                              // 버튼 데크
    const lamp = kit.box(sx0, h - 4.8, a + 3, sx1, h - 2.4, b - 3, kit.glow(0xffe9a8)); kit.anim.push(t => { scr.visible = Math.sin(t * (3 + i * 0.7) + i) > -0.6; lamp.visible = Math.sin(t * 5 + i * 1.7) > -0.3; });
  }
  void fx;
};
const table: Build = ({ kit, lay }, s) => {
  const { w, d, cx, cz } = dims(s), { x0, y0, x1, y1, h } = s, roulette = cx < lay.w / 2;
  kit.box(x0 + 3, 0, y0 + 3, x1 - 3, h - 2.4, y1 - 3, kit.mat(0x1a0f0a)); kit.box(x0 - 1.5, h - 2.4, y0 - 1.5, x1 + 1.5, h, y1 + 1.5, kit.mat(0x5a2d12));
  const felt = kit.tex(256, 160, g => {
    g.fillStyle = '#0f6b3a'; g.fillRect(0, 0, 256, 160); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    if (roulette) { for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) { g.strokeRect(100 + c * 12, 10 + r * 16, 12, 16); g.fillStyle = (r + c) % 2 ? '#a81c1c' : '#101010'; g.fillRect(101 + c * 12, 11 + r * 16, 10, 14); } g.fillStyle = '#0f6b3a'; }
    else { for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(30 + i * 50, 70, 20, 0, 6.29); g.stroke(); } g.font = '700 16px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.textAlign = 'center'; g.fillText('BLACKJACK PAYS 3 TO 2', 128, 130); }
  });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w + 1, d + 1), new THREE.MeshLambertMaterial({ map: felt })); kit.own(top.geometry, top.material as THREE.Material); top.rotation.x = -Math.PI / 2; top.position.set(cx, h + 0.05, cz); kit.scene.add(top);
  if (roulette) { kit.tube(x0 + 20, h, cz, 9, 1.2, kit.mat(0x2a1a0e)); const wh = kit.tube(x0 + 20, h + 1.2, cz, 7, 0.8, kit.mat(0xc9a227, 0x6a4a00, 0.7)); kit.anim.push(t => { wh.rotation.y = t * 1.4; }); }
  for (let i = 0; i < 5; i++) kit.tube(x1 - 26 + i * 4.6, h, cz + (i % 2) * 5 - 2, 1.5, 0.7 + (i % 3) * 0.5, kit.mat([0xe94b4b, 0x4fa3ff, 0xf2f2f2, 0x1c1c1c, 0xffd24a][i]));
  for (let i = 0; i < 4; i++) kit.box(cx - 10 + i * 5, h + 0.05, y1 - 14, cx - 7 + i * 5, h + 0.3, y1 - 8, kit.mat(0xf2f2f2));        // 카드
};

// ---------- 은행 ----------
const column: Build = ({ kit }, s) => {
  const { w, cx, cz } = dims(s), { h } = s;
  kit.tube(cx, 0, cz, w * 0.62, 3, kit.mat(0xd8b24a)); kit.tube(cx, 3, cz, w * 0.44, h - 7, kit.mat(0xf1ece0)); kit.tube(cx, h - 4, cz, w * 0.62, 4, kit.mat(0xd8b24a));
};
const bench: Build = ({ kit, lay }, s) => {
  const { x0, y0, x1, h } = s, y1 = s.y1, face = seatedFacing(lay, s, -Math.PI / 2), south = Math.sin(face) > 0, wood = lay.kind === 'plant' ? 0x4a4f55 : 0x6b4a2e, cush = lay.kind === 'plant' ? 0x6b7078 : 0x6b2a2a;
  kit.box(x0, 0, y0, x1, h * 0.5, y1, kit.mat(wood)); kit.box(x0 + 0.6, h * 0.5, y0 + 0.6, x1 - 0.6, h, y1 - 0.6, kit.mat(cush));
  if (south) kit.box(x0, h, y0, x1, h + 9, y0 + 2, kit.mat(wood)); else kit.box(x0, h, y1 - 2, x1, h + 9, y1, kit.mat(wood));
};
/** 창구 / 유리 진열 카운터(은행·무기상) */
const glass: Build = (c, s) => {
  const { kit, lay } = c, k = lay.kind, { w, d, cx, cz } = dims(s), { x0, y0, x1, y1, h } = s, [body, top] = COUNTER[k];
  kit.box(x0, 1.5, y0, x1, h - 1.2, y1, kit.mat(body)); kit.box(x0 + 0.5, 0, y0 + 0.5, x1 - 0.5, 1.5, y1 - 0.5, kit.mat(0x15171b));
  if (k === 'bank') {
    kit.box(x0 - 1, h - 1.2, y0 - 1, x1 + 1, h, y1 + 1, kit.mat(top)); kit.box(x0, 2, y1 - 0.2, x1, 3.2, y1 + 0.3, kit.mat(0xc9a227, 0x3a2b00, 0.4));
    // 창구 유리 칸막이: 창구마다 반원 구멍 대신 가운데가 트인 유리판 두 장
    const wins = lay.folk.filter(f => f.pose === 'desk' || (f.role !== 'guest' && f.pose === 'sit')).map(f => f.x); if (!wins.length) wins.push(cx);
    const glassM = kit.mat(0x9fd6ff, 0x0f2a40, 0.35, { transparent: true, opacity: 0.2 }), frame = kit.mat(0x2a2a2a);
    for (const wx of wins) {
      for (const sx of [-1, 1]) { const g = kit.box(wx + sx * 22, h, y0 + 2, wx + sx * 22 + (sx > 0 ? 18 : -18), h + 24, y0 + 3, glassM); g.renderOrder = 3; }
      kit.box(wx - 24, h, y0 + 1, wx - 22, h + 26, y0 + 4, frame); kit.box(wx + 22, h, y0 + 1, wx + 24, h + 26, y0 + 4, frame); kit.box(wx - 24, h + 24, y0 + 1, wx + 24, h + 26, y0 + 4, frame);
      kit.box(wx - 10, h, y1 - 8, wx + 10, h + 0.8, y1 - 2, kit.mat(0xf2f2f2));                          // 서류
      kit.sign('#e8d28a', String(1 + wins.indexOf(wx)), wx, h + 36, y0 + 4, 16);
    }
  } else { // 무기상: 유리 진열장 + 천 깔개 위의 총
    kit.box(x0 - 1, h - 1.2, y0 - 1, x1 + 1, h, y1 + 1, kit.mat(top));
    const g = kit.box(x0, h, y0, x1, h + 12, y1, kit.mat(0x9fd6ff, 0x0f2a40, 0.4, { transparent: true, opacity: 0.2 }), kit.scene); g.renderOrder = 3; kit.box(x0, h - 1.2, y0, x1, h - 0.4, y1, kit.mat(0x9a2a2a));
    for (const [a, b] of [[x0 - 1, x0], [x1, x1 + 1]]) kit.box(a, h, y0 - 1, b, h + 12, y1 + 1, kit.mat(0x16181c)); kit.box(x0 - 1, h + 12, y0 - 1, x1 + 1, h + 13, y1 + 1, kit.mat(0x16181c));
    hangGuns(c, [{ x: x0 + 20, y: h - 0.4, z: cz }, { x: x0 + 70, y: h - 0.4, z: cz }, { x: cx + 6, y: h - 0.4, z: cz }, { x: cx + 56, y: h - 0.4, z: cz }, { x: x1 - 70, y: h - 0.4, z: cz }, { x: x1 - 20, y: h - 0.4, z: cz }], 0.55, 0);
  }
  void w; void d;
};

/** 총 모델(구워진 하나의 지오메트리)을 종류별 인스턴스로 놓습니다. pos 순서대로 종류가 돌아가며, 벽걸이는 옆모습이 보이게 합니다. */
export function hangGuns(c: FurnCtx, pos: { x: number; y: number; z: number }[], scale = 0.8, ry = 0): void {
  const gg = c.models?.groundGuns; if (!gg) return;
  const kinds = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rocket'], bykind = new Map<string, { x: number; y: number; z: number }[]>();
  pos.forEach((p, i) => { const k = kinds[i % kinds.length]; (bykind.get(k) ?? bykind.set(k, []).get(k)!).push(p); });
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true }); c.kit.own(lam); const d = new THREE.Object3D();
  for (const [k, list] of bykind) {
    const t = gg[k]; if (!t) continue; const geo = bake(t).fixed; if (!geo) continue;
    const mesh = new THREE.InstancedMesh(geo, lam, list.length); list.forEach((p, i) => { d.position.set(p.x, p.y, p.z); d.rotation.set(0, ry, 0); d.scale.setScalar(HUMAN * scale); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; c.kit.scene.add(mesh); c.kit.own(mesh); void geo;
  }
};

const BUILD: Partial<Record<Solid['style'], Build>> = {
  counter, shelf, fridge, rack, bar, lowtable, dj, speaker, sofa, tank, machine, console: console_, crate, slot, table, column, bench, glass,
};
