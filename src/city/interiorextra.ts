// LAST CITY — 사업체 내부를 더 풍성하게 만드는 마감 층.
// 가구(interiorfurn)·업종 소품(interiordecor) 위에 얹어서 ① 벽걸이 그림·조명·선반 ② 바닥 그림자·때·러그 ③ 천장 장식
// ④ 창으로 들어오는 빛줄기·먼지 같은 공기감을 더합니다. 모두 보기용이며 충돌은 interior.ts 의 solids 가 따로 맡습니다.
// 좌표는 월드 단위(1m ≈ 21), 방은 W×D×H, 안쪽(북)벽 z=0, 출입문 z=D.
import * as THREE from 'three';
import type { BizKind } from './defs';
import { DOOR_HALF } from './interior';
import type { FurnCtx } from './interiorfurn';
import { PALETTE, rnd, type Kit } from './interiorkit';

type Wall = 'N' | 'W' | 'E' | 'S';
type G2 = CanvasRenderingContext2D;
type Extra = (c: FurnCtx) => void;

// ───────────────────────── 공용 도구 ─────────────────────────
const softCache = new WeakMap<Kit, THREE.CanvasTexture>();
/** 가운데가 밝고 가장자리가 투명한 둥근 그라데이션(빛 번짐·그림자 겸용) */
const soft = (kit: Kit): THREE.CanvasTexture => {
  let t = softCache.get(kit);
  if (!t) { t = kit.tex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); softCache.set(kit, t); }
  return t;
};
const quadCache = new WeakMap<Kit, THREE.PlaneGeometry>();
const quad = (kit: Kit): THREE.PlaneGeometry => { let q = quadCache.get(kit); if (!q) { q = new THREE.PlaneGeometry(1, 1); kit.own(q); quadCache.set(kit, q); } return q; };
const blobMat = (kit: Kit, color: number, opacity: number, additive: boolean): THREE.MeshBasicMaterial => {
  const m = new THREE.MeshBasicMaterial({ map: soft(kit), color, transparent: true, opacity, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  kit.own(m); return m;
};
/** 바닥에 얹는 둥근 빛 웅덩이(additive)나 그림자(보통 혼합) */
const pool = (kit: Kit, x: number, z: number, w: number, d: number, color: number, opacity: number, additive = true): THREE.Mesh => {
  const m = new THREE.Mesh(quad(kit), blobMat(kit, color, opacity, additive)); m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.set(x, 0.5, z); m.renderOrder = additive ? 3 : 2; kit.scene.add(m); return m;
};
/** 벽에 붙이는 묶음: 안쪽 좌표 x=벽을 따라, y=높이(바닥 기준), z=방 안쪽으로 */
const mount = (c: FurnCtx, wall: Wall, u: number, y: number): THREE.Group => {
  const { w, d } = c.lay, k = c.kit;
  switch (wall) { case 'N': return k.group(u, y, 0, 0); case 'S': return k.group(u, y, d, Math.PI); case 'W': return k.group(0, y, u, Math.PI / 2); default: return k.group(w, y, u, -Math.PI / 2); }
};
const flat = (kit: Kit, g: THREE.Object3D, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, order = 2): THREE.Mesh => {
  const m = new THREE.Mesh(quad(kit), mat); m.scale.set(w, h, 1); m.position.set(x, y, z); m.renderOrder = order; g.add(m); return m;
};
/** 벽에 번지는 빛(액자 조명·벽등) */
const wash = (c: FurnCtx, wall: Wall, u: number, y: number, w: number, h: number, color: number, a: number): void => {
  const g = mount(c, wall, u, y); flat(c.kit, g, w, h, blobMat(c.kit, color, a, true), 0, 0, 0.3, 3);
};

// ───────────────────────── 그림(액자용) ─────────────────────────
const ART: ((g: G2, w: number, h: number, s: number) => void)[] = [
  // 풍경
  (g, w, h, s) => { const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, ['#f6b27a', '#7fb8e8', '#e8a0a0'][s % 3]); sky.addColorStop(1, '#fbe3b8'); g.fillStyle = sky; g.fillRect(0, 0, w, h); g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(w * 0.7, h * 0.3, h * 0.12, 0, 6.29); g.fill(); g.fillStyle = '#5f7f5a'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.62); g.quadraticCurveTo(w * 0.3, h * 0.4, w * 0.6, h * 0.66); g.lineTo(w, h * 0.55); g.lineTo(w, h); g.fill(); g.fillStyle = '#3f5d44'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.8); g.quadraticCurveTo(w * 0.5, h * 0.58, w, h * 0.82); g.lineTo(w, h); g.fill(); },
  // 추상
  (g, w, h, s) => { g.fillStyle = ['#efe6d2', '#1d2a44', '#d9c7a1'][s % 3]; g.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { g.fillStyle = ['#d9352a', '#2a6fd9', '#f2c230', '#222', '#3fae6a', '#e87ab6'][(i + s) % 6]; const x = rnd(s * 7 + i) * w * 0.7, y = rnd(s * 11 + i) * h * 0.7, a = w * (0.14 + rnd(s + i * 5) * 0.28); if (i % 2) { g.beginPath(); g.arc(x + a / 2, y + a / 2, a / 2, 0, 6.29); g.fill(); } else g.fillRect(x, y, a, a * 0.8); } },
  // 밤 도시
  (g, w, h) => { const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#10183a'); sky.addColorStop(1, '#5a3a7a'); g.fillStyle = sky; g.fillRect(0, 0, w, h); g.fillStyle = '#f7f1c8'; g.beginPath(); g.arc(w * 0.78, h * 0.22, h * 0.09, 0, 6.29); g.fill(); for (let i = 0; i < 9; i++) { const bw = w / 9, bh = h * (0.3 + rnd(i * 3 + 1) * 0.45); g.fillStyle = '#0c0f22'; g.fillRect(i * bw, h - bh, bw - 1, bh); g.fillStyle = '#ffd36b'; for (let r = 0; r < 5; r++) for (let q = 0; q < 2; q++) if (rnd(i * 13 + r * 3 + q) > 0.45) g.fillRect(i * bw + 2 + q * bw * 0.45, h - bh + 4 + r * h * 0.1, 2.4, 3); } },
  // 초상
  (g, w, h, s) => { g.fillStyle = ['#6b5a3e', '#3b4a5a', '#5a3b3b'][s % 3]; g.fillRect(0, 0, w, h); g.fillStyle = '#20242c'; g.beginPath(); g.moveTo(w * 0.15, h); g.lineTo(w * 0.28, h * 0.66); g.lineTo(w * 0.72, h * 0.66); g.lineTo(w * 0.85, h); g.fill(); g.fillStyle = '#e6c3a0'; g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.17, h * 0.22, 0, 0, 6.29); g.fill(); g.fillStyle = '#2a1c14'; g.beginPath(); g.ellipse(w / 2, h * 0.28, w * 0.19, h * 0.12, 0, Math.PI, 0); g.fill(); g.fillStyle = '#f2f2f2'; g.fillRect(w * 0.42, h * 0.64, w * 0.16, h * 0.08); },
  // 정물
  (g, w, h, s) => { g.fillStyle = '#d8c9a8'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a5a3a'; g.fillRect(0, h * 0.72, w, h * 0.28); g.fillStyle = ['#3a7fa8', '#a83a4a', '#3a8a5a'][s % 3]; g.beginPath(); g.moveTo(w * 0.4, h * 0.72); g.quadraticCurveTo(w * 0.3, h * 0.5, w * 0.44, h * 0.36); g.lineTo(w * 0.56, h * 0.36); g.quadraticCurveTo(w * 0.7, h * 0.5, w * 0.6, h * 0.72); g.fill(); for (let i = 0; i < 5; i++) { g.fillStyle = ['#e94b4b', '#f5c242', '#fff', '#ff8fd2', '#e94b4b'][i]; g.beginPath(); g.arc(w * (0.36 + i * 0.07), h * (0.24 + (i % 2) * 0.06), w * 0.05, 0, 6.29); g.fill(); } },
  // 바다
  (g, w, h) => { const sky = g.createLinearGradient(0, 0, 0, h * 0.55); sky.addColorStop(0, '#9fd0f0'); sky.addColorStop(1, '#fff0d0'); g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.55); for (let i = 0; i < 6; i++) { g.fillStyle = ['#1f5f8f', '#2a78a8', '#1a4f78', '#3a8fb8', '#1f5f8f', '#2a78a8'][i]; g.fillRect(0, h * (0.55 + i * 0.075), w, h * 0.08); } g.fillStyle = '#f2f2f2'; g.beginPath(); g.moveTo(w * 0.45, h * 0.62); g.lineTo(w * 0.45, h * 0.3); g.lineTo(w * 0.62, h * 0.6); g.fill(); g.fillStyle = '#5a3a24'; g.fillRect(w * 0.36, h * 0.6, w * 0.34, h * 0.04); },
];
/** 액자 한 점: 그림 + 테두리 + (선택) 그림 위 조명 */
const painting = (c: FurnCtx, wall: Wall, u: number, y: number, w: number, h: number, seed: number, frame = 0x6b4a2e, lit = true, light = false): void => {
  const { kit } = c, g = mount(c, wall, u, y), pw = 128, ph = Math.max(48, Math.round(pw * h / w));
  const tex = kit.tex(pw, ph, gg => ART[seed % ART.length](gg, pw, ph, seed));
  const fm = kit.mat(frame), b = 1.2;
  kit.box(-w / 2 - b, -h / 2 - b, 0, w / 2 + b, h / 2 + b, 0.5, kit.mat(0xefe9dc), g);
  kit.box(-w / 2 - b, h / 2, 0, w / 2 + b, h / 2 + b, 1.1, fm, g); kit.box(-w / 2 - b, -h / 2 - b, 0, w / 2 + b, -h / 2, 1.1, fm, g); kit.box(-w / 2 - b, -h / 2, 0, -w / 2, h / 2, 1.1, fm, g); kit.box(w / 2, -h / 2, 0, w / 2 + b, h / 2, 1.1, fm, g);
  const pm = lit ? new THREE.MeshLambertMaterial({ map: tex }) : new THREE.MeshBasicMaterial({ map: tex, fog: false }); kit.own(pm);
  flat(kit, g, w, h, pm, 0, 0, 0.55, 1);
  if (light) { kit.box(-w * 0.3, h / 2 + b + 1.4, 0, w * 0.3, h / 2 + b + 2.2, 3.6, kit.mat(0xc9a227), g); kit.box(-w * 0.3, h / 2 + b + 1.2, 3.2, w * 0.3, h / 2 + b + 1.6, 3.6, kit.glow(0xfff0c0), g); wash(c, wall, u, y, w * 1.5, h * 1.4, 0xffe2a8, 0.28); }
};
/** 벽등: 받침 + 빛나는 갓 + 벽을 물들이는 번짐 */
const sconce = (c: FurnCtx, wall: Wall, u: number, y: number, color: number, a = 0.5, size = 1): void => {
  const { kit } = c, g = mount(c, wall, u, y), s = size;
  kit.box(-1.2 * s, -3 * s, 0, 1.2 * s, 3 * s, 0.7, kit.mat(0x3a3128), g); kit.box(-1.6 * s, -2.4 * s, 0.7, 1.6 * s, 2.6 * s, 3.4 * s, kit.glow(color, 1), g);
  wash(c, wall, u, y, 20 * s, 34 * s, color, a);
};
/** 불 켜진 상자 간판(그림) */
const lightbox = (c: FurnCtx, wall: Wall, u: number, y: number, w: number, h: number, draw: (g: G2, w: number, h: number) => void, rim = 0x222222): void => {
  const { kit } = c, g = mount(c, wall, u, y), pw = 128, ph = Math.max(32, Math.round(pw * h / w)), tex = kit.tex(pw, ph, gg => draw(gg, pw, ph));
  kit.box(-w / 2 - 1, -h / 2 - 1, 0, w / 2 + 1, h / 2 + 1, 1.4, kit.mat(rim), g); const m = new THREE.MeshBasicMaterial({ map: tex, fog: false }); kit.own(m); flat(kit, g, w, h, m, 0, 0, 1.5, 1);
  wash(c, wall, u, y, w * 1.4, h * 1.7, 0xffffff, 0.12);
};
const textBoard = (text: string, bg: string, fg: string, size = 28) => (g: G2, w: number, h: number): void => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `900 ${size}px 'Noto Sans KR',sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n'); lines.forEach((l, i) => g.fillText(l, w / 2, h * (i + 1) / (lines.length + 1)));
};
/** 선반 하나(받침대 2개 + 판 + 위에 놓인 책·병·상자) */
const shelf = (c: FurnCtx, wall: Wall, u: number, y: number, len: number, seed: number, palette: number[] = PALETTE, kind: 'books' | 'jars' | 'boxes' = 'books'): void => {
  const { kit } = c, g = mount(c, wall, u, y), wood = kit.mat(0x6b4a2e);
  kit.box(-len / 2, 0, 0, len / 2, 1.1, 5, wood, g); for (const sx of [-len / 2 + 3, len / 2 - 3]) kit.box(sx - 0.5, -3, 0, sx + 0.5, 0, 4, kit.mat(0x333), g);
  let x = -len / 2 + 2, i = 0;
  while (x < len / 2 - 3) {
    const r = rnd(seed * 17 + i++), col = palette[Math.floor(r * 97) % palette.length];
    if (kind === 'books') { const bw = 1 + rnd(i + seed) * 1.2, bh = 3.4 + rnd(i * 3 + seed) * 2.6; kit.box(x, 1.1, 0.8, x + bw, 1.1 + bh, 4.2, kit.mat(col), g); x += bw + 0.1; }
    else if (kind === 'jars') { const jr = 1 + rnd(i + seed) * 0.7, jh = 2.6 + rnd(i * 3 + seed) * 2.4; const t = kit.tube(x + jr, 1.1, 2.6, jr, jh, kit.mat(col), g); t.rotation.y = 0; x += jr * 2 + 0.6; }
    else { const bw = 2.2 + rnd(i + seed) * 2, bh = 2 + rnd(i * 3 + seed) * 2.4; kit.box(x, 1.1, 0.8, x + bw, 1.1 + bh, 4.2, kit.mat(col), g); x += bw + 0.5; }
  }
};
/** 큰 잎사귀 화분 */
const potPlant = (kit: Kit, x: number, z: number, s = 1, leaf = 0x2f8f4e, pot = 0xb5651d): void => {
  kit.tube(x, 0, z, 4.4 * s, 6.5 * s, kit.mat(pot)); kit.tube(x, 6.4 * s, z, 3.9 * s, 0.6, kit.mat(0x3a2a1a));
  const lm = kit.mat(leaf), lm2 = kit.mat(new THREE.Color(leaf).multiplyScalar(0.72).getHex());
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + rnd(i) * 0.6, tilt = 0.45 + rnd(i * 3) * 0.5, m = kit.sphere(x + Math.cos(a) * 2.6 * s, 6.6 * s + 8 * s, z + Math.sin(a) * 2.6 * s, 1, i % 2 ? lm : lm2); m.scale.set(1.5 * s, 7.5 * s, 0.7 * s); m.rotation.set(Math.sin(a) * tilt, -a, -Math.cos(a) * tilt, 'YXZ'); }
};
/** 천장에서 늘어뜨린 갓등 + 바닥 빛 웅덩이 */
const pendant = (c: FurnCtx, x: number, z: number, drop: number, color: number, shade: number, r = 5, pa = 0.3): void => {
  const { kit } = c, H = c.lay.h, y = H - drop;
  kit.box(x - 0.15, y, z - 0.15, x + 0.15, H, z + 0.15, kit.mat(0x222222));
  const g = new THREE.CylinderGeometry(r * 0.45, r, r * 0.8, 18, 1, true); kit.own(g);
  const sm = new THREE.MeshLambertMaterial({ color: shade, side: THREE.DoubleSide }); kit.own(sm); const s = new THREE.Mesh(g, sm); s.position.set(x, y - r * 0.35, z); kit.scene.add(s);
  kit.sphere(x, y - r * 0.55, z, r * 0.32, kit.glow(color, 1)); pool(kit, x, z, r * 9, r * 9, color, pa);
};
/** 돌아가는 천장 선풍기 */
const fan = (kit: Kit, x: number, z: number, H: number, speed = 3): void => {
  const g = kit.group(x, H - 5, z); kit.tube(0, 3, 0, 0.5, 2.6, kit.mat(0x222), g); kit.tube(0, 0, 0, 2.2, 1.6, kit.mat(0x3a2e24), g);
  const rot = kit.group(0, 0.4, 0, 0, g);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const b = kit.box(2, -0.2, -2.2, 17, 0.4, 2.2, kit.mat(0x6b4a2e), rot); b.position.set(Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5); b.rotation.y = -a; }
  kit.anim.push(t => { rot.rotation.y = t * speed; });
};
/** 천장 환기구(격자 덮개) */
const vent = (kit: Kit, x: number, z: number, H: number, w = 10, d = 10, body = 0xc8ccc8): void => {
  kit.box(x - w / 2, H - 0.7, z - d / 2, x + w / 2, H, z + d / 2, kit.mat(body)); const dk = kit.mat(0x30343a);
  for (let i = 0; i < 6; i++) kit.box(x - w / 2 + 0.6, H - 0.9, z - d / 2 + 0.6 + i * (d - 1.2) / 5.4, x + w / 2 - 0.6, H - 0.7, z - d / 2 + 1.1 + i * (d - 1.2) / 5.4, dk);
};
/** 둥근 벽시계 */
const clock = (c: FurnCtx, wall: Wall, u: number, y: number, r = 5): void => {
  const { kit } = c, g = mount(c, wall, u, y);
  const face = kit.tex(64, 64, gg => { gg.fillStyle = '#f4f0e4'; gg.beginPath(); gg.arc(32, 32, 30, 0, 6.29); gg.fill(); gg.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; gg.fillRect(32 + Math.sin(a) * 25 - 1.5, 32 - Math.cos(a) * 25 - 1.5, 3, 3); } });
  const ring = kit.tube(0, 0, 0.4, r + 0.8, 1, kit.mat(0x2a2a2a), g); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0, 0.9);
  const m = new THREE.MeshLambertMaterial({ map: face, transparent: true }); kit.own(m); flat(kit, g, r * 2, r * 2, m, 0, 0, 1.45, 1);
  const hand = kit.box(-0.3, 0, 1.6, 0.3, r * 0.8, 1.9, kit.mat(0x111), g), min = kit.box(-0.2, 0, 1.9, 0.2, r * 0.95, 2.2, kit.mat(0x111), g);
  kit.anim.push(t => { min.rotation.z = -t * 0.35; hand.rotation.z = -t * 0.03; });
};

// ───────────────────────── 모든 업종 공통 ─────────────────────────
/** 벽 아래·위 어둠(모서리 음영), 가구·사람 밑 그림자, 바닥 때, 창에서 들어오는 빛, 떠다니는 먼지 */
const common = (c: FurnCtx, o: { grime: number; shade: number; shaft: number | null; dust: number; shaftA?: number }): void => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay, gap = DOOR_HALF;
  if (kit.quality !== 'low') {
    // 벽 모서리 음영
    const dark = kit.tex(8, 64, g => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 64); });
    const mk = (flip: boolean, a: number): THREE.MeshBasicMaterial => { const t = dark.clone(); t.needsUpdate = true; if (flip) { t.wrapT = THREE.RepeatWrapping; t.repeat.y = -1; t.offset.y = 1; } kit.own(t); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: a, depthWrite: false, fog: false }); kit.own(m); return m; };
    const lo = mk(true, o.shade), hi = mk(false, o.shade * 0.8);
    const walls: [Wall, number, number][] = [['N', W / 2, W], ['W', D / 2, D], ['E', D / 2, D], ['S', (W / 2 - gap) / 2, W / 2 - gap], ['S', W - (W / 2 - gap) / 2, W / 2 - gap]];
    for (const [wl, u, len] of walls) { const g = mount(c, wl, u, 0); flat(kit, g, len, 15, lo, 0, 7.5, 0.35, 2); const g2 = mount(c, wl, u, H); flat(kit, g2, len, 10, hi, 0, -5, 0.35, 2); }
  }
  // 가구·사람 밑 그림자
  for (const s of lay.solids) if (s.style !== 'void' && s.style !== 'glass') pool(kit, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, s.x1 - s.x0 + 12, s.y1 - s.y0 + 12, 0x000000, 0.38, false);
  for (const f of lay.folk) pool(kit, f.x, f.y, 17, 17, 0x000000, 0.4, false);
  // 바닥 때: 문에서 안쪽으로 걸어 다닌 자국과 얼룩
  if (o.grime > 0) {
    const t = kit.tex(512, 400, g => {
      g.clearRect(0, 0, 512, 400);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(30,24,18,${0.03 + rnd(i + 4) * 0.07})`; g.beginPath(); g.ellipse(rnd(i) * 512, rnd(i + 31) * 400, 6 + rnd(i + 5) * 34, 3 + rnd(i + 8) * 16, rnd(i + 2) * 3, 0, 6.29); g.fill(); }
      const lane = g.createLinearGradient(190, 0, 322, 0); lane.addColorStop(0, 'rgba(30,24,18,0)'); lane.addColorStop(0.5, 'rgba(30,24,18,0.16)'); lane.addColorStop(1, 'rgba(30,24,18,0)'); g.fillStyle = lane; g.fillRect(190, 130, 132, 270);
      g.strokeStyle = 'rgba(20,16,12,0.16)'; g.lineWidth = 1.5; for (let i = 0; i < 26; i++) { g.beginPath(); const x = rnd(i * 3) * 512, y = rnd(i * 5 + 1) * 400; g.moveTo(x, y); g.quadraticCurveTo(x + 14, y + 6 - rnd(i) * 12, x + 30 + rnd(i + 9) * 20, y + rnd(i + 7) * 10); g.stroke(); }
    });
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: o.grime, depthWrite: false, fog: false }); kit.own(m);
    const p = new THREE.Mesh(quad(kit), m); p.rotation.x = -Math.PI / 2; p.scale.set(W, D, 1); p.position.set(W / 2, 0.45, D / 2); p.renderOrder = 2; kit.scene.add(p);
  }
  // 앞 창으로 들어오는 노을빛(빛줄기 + 바닥에 떨어진 빛 조각)
  if (o.shaft !== null && kit.quality !== 'low') {
    const col = new THREE.Color(o.shaft), a = o.shaftA ?? 0.2;
    const ribbon = (x0: number, x1: number, shift: number, len: number): void => {
      const g = new THREE.BufferGeometry(), y0 = 20, y1 = 52, z0 = D - 1;
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y1, z0, x1, y1, z0, x1 + shift, 0.6, z0 - len, x0 + shift, 0.6, z0 - len, x0, y0, z0, x1, y0, z0], 3));
      const cv = (k: number): number[] => [col.r * k, col.g * k, col.b * k];
      g.setAttribute('color', new THREE.Float32BufferAttribute([...cv(1), ...cv(1), ...cv(0.05), ...cv(0.05), ...cv(1), ...cv(1)], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]); kit.own(g);
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); kit.own(m);
      const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 3; kit.scene.add(mesh);
      const fl = new THREE.BufferGeometry(); fl.setAttribute('position', new THREE.Float32BufferAttribute([x0 + shift * 0.9, 0.55, z0 - len * 0.5, x1 + shift * 0.9, 0.55, z0 - len * 0.5, x1 + shift * 1.25, 0.55, z0 - len, x0 + shift * 1.25, 0.55, z0 - len], 3)); fl.setIndex([0, 1, 2, 0, 2, 3]); kit.own(fl);
      const fm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: a * 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); kit.own(fm); const fmesh = new THREE.Mesh(fl, fm); fmesh.renderOrder = 3; kit.scene.add(fmesh);
    };
    for (const cx of [W / 4 - gap / 2, W - W / 4 + gap / 2]) { const ww = W / 2 - gap - 30; for (let i = 0; i < 3; i++) ribbon(cx - ww / 2 + i * ww / 3 + 2, cx - ww / 2 + (i + 1) * ww / 3 - 2, (cx < W / 2 ? 1 : -1) * 18, 70); }
  }
  // 떠다니는 먼지
  if (o.dust > 0 && kit.quality === 'high') {
    const n = o.dust, pos = new Float32Array(n * 3), base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { base[i * 3] = 8 + rnd(i) * (W - 16); base[i * 3 + 1] = 6 + rnd(i + 50) * (H - 14); base[i * 3 + 2] = 8 + rnd(i + 99) * (D - 16); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: soft(kit), color: 0xffffff, size: 1.6, transparent: true, opacity: 0.45, depthWrite: false, fog: false, sizeAttenuation: true }); kit.own(g, m);
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; kit.scene.add(pts);
    kit.anim.push(t => { for (let i = 0; i < n; i++) { pos[i * 3] = base[i * 3] + Math.sin(t * 0.2 + i) * 5; pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.3 + i * 1.7) * 3; pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.17 + i * 0.9) * 5; } g.attributes.position.needsUpdate = true; });
  }
};

// ───────────────────────── 업종별 ─────────────────────────
const store: Extra = c => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  common(c, { grime: 0.7, shade: 0.28, shaft: 0xffd9a0, shaftA: 0.16, dust: 90 });
  // 천장 불빛 웅덩이
  for (const x of [75, 165, 255]) for (const z of [50, 130, 205]) pool(kit, x, z, 80, 54, 0xf6fff4, 0.1);
  // 안쪽 벽 위 광고 상자
  const ads: [string, string, string][] = [['COLD\nDRINKS', '#1f6fd9', '#ffffff'], ['FRESH\nONIGIRI', '#3fae6a', '#ffffff'], ['HOT\nFOOD', '#d9352a', '#ffe9a8'], ['COFFEE\n700원', '#6b4a2e', '#fff0d0'], ['ICE\nCREAM', '#e87ab6', '#ffffff']];
  ads.forEach(([t, bg, fg], i) => lightbox(c, 'N', 138 + i * 40, 58, 32, 17, textBoard(t, bg, fg, 20), 0x1a1a1a));
  // 옆벽: 메뉴판·시계·게시판·소화기·밝은 벽등
  lightbox(c, 'E', 60, 46, 36, 20, textBoard('오늘의 도시락\n3,900', '#2a2018', '#ffd36b', 15)); lightbox(c, 'E', 118, 46, 28, 20, textBoard('1+1\nEVENT', '#d9352a', '#fff', 18));
  clock(c, 'E', 160, 56, 5.5); clock(c, 'N', 130, 62, 4.6);
  painting(c, 'W', 62, 50, 22, 15, 1, 0xeeeeee, true); painting(c, 'W', 150, 52, 24, 15, 0, 0xeeeeee, true);
  const cork = kit.tex(64, 48, g => { g.fillStyle = '#b98b55'; g.fillRect(0, 0, 64, 48); for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(80,50,20,${0.2 + rnd(i) * 0.3})`; g.fillRect(rnd(i) * 64, rnd(i + 7) * 48, 1.5, 1.5); } for (let i = 0; i < 7; i++) { g.fillStyle = ['#fff', '#ffe27a', '#bfe8ff', '#ffd1e0'][i % 4]; g.fillRect(4 + (i % 4) * 15, 5 + Math.floor(i / 4) * 22, 11, 16); g.fillStyle = '#d9352a'; g.fillRect(8 + (i % 4) * 15, 4 + Math.floor(i / 4) * 22, 3, 3); } });
  { const g = mount(c, 'W', 232, 40); kit.box(-13, -10, 0, 13, 10, 1.3, kit.mat(0x6b4a2e), g); const m = new THREE.MeshLambertMaterial({ map: cork }); kit.own(m); flat(kit, g, 24, 18, m, 0, 0, 1.4, 1); }
  { const g = mount(c, 'E', 214, 12); kit.tube(0, -4, 0.4, 2, 12, kit.mat(0xd01818), g); kit.box(-1, 6, 0, 1, 7.5, 1, kit.mat(0x111), g); }
  for (const [wl, u] of [['W', 120], ['E', 30], ['E', 175]] as const) sconce(c, wl, u, 44, 0xfff3d0, 0.34);
  // 천장: 환기구·스프링클러·행사 깃발
  for (const [x, z] of [[40, 40], [290, 120], [120, 230], [220, 230]]) vent(kit, x, z, H, 12, 12);
  for (const [x, z] of [[100, 90], [200, 90], [100, 200], [230, 200], [165, 170]]) { kit.tube(x, H - 2.2, z, 0.5, 2.2, kit.mat(0xb8bcc0)); kit.sphere(x, H - 2.4, z, 0.8, kit.mat(0xd9352a)); }
  const flags = [0xe94b4b, 0xf5c242, 0x4fa3ff, 0x5ed388, 0xff8fd2];
  for (const z of [86, 168]) { kit.box(124, H - 12.4, z - 0.12, 302, H - 12.1, z + 0.12, kit.mat(0x222)); for (let i = 0; i < 18; i++) { const f = kit.box(126 + i * 9.6 - 2, H - 16, z - 0.1, 126 + i * 9.6 + 2, H - 12.4, z + 0.1, kit.mat(flags[i % 5])); f.rotation.z = Math.PI / 4; f.scale.y = 2.4; f.position.y = H - 14.2; } }
  // 계산대 위: 흔드는 고양이 + 로또 + 껌 진열
  { const cat = kit.group(106, 22, 70); kit.box(-3.4, 0, -3, 3.4, 6, 3, kit.mat(0xf6f1e4), cat); kit.sphere(0, 8, 0, 3.4, kit.mat(0xf6f1e4), cat); for (const sx of [-2, 2]) kit.box(sx - 0.8, 10.2, -0.6, sx + 0.8, 12, 0.6, kit.mat(0xf6f1e4), cat); kit.box(-1.6, 3, 2.9, 1.6, 5.4, 3.3, kit.mat(0xffc21c), cat); kit.sphere(-1.1, 8.4, 3, 0.5, kit.mat(0x222), cat); kit.sphere(1.1, 8.4, 3, 0.5, kit.mat(0x222), cat); const arm = kit.group(3.4, 5, 0, 0, cat); kit.box(0, 0, -0.9, 1.6, 4, 0.9, kit.mat(0xf6f1e4), arm); kit.anim.push(t => { arm.rotation.z = -0.5 + Math.sin(t * 3.2) * 0.45; }); }
  for (let i = 0; i < 4; i++) kit.box(30 + i * 6, 22, 56, 35 + i * 6, 28, 57, kit.mat([0xe94b4b, 0x4fa3ff, 0xf5c242, 0x5ed388][i]));
  // 입구 옆: 우산꽂이·대걸레 통·바닥 안내 표시
  kit.tube(W / 2 + 34, 0, D - 12, 4.2, 9, kit.mat(0x2a6fb8)); for (let i = 0; i < 3; i++) { const u = kit.tube(W / 2 + 33 + i * 1.6, 8, D - 12, 0.5, 14, kit.mat([0xd9352a, 0x222, 0xf5c242][i])); u.rotation.z = (i - 1) * 0.1; }
  { const cone = (x: number, z: number): void => { kit.box(x - 3, 0, z - 3, x + 3, 0.7, z + 3, kit.mat(0xf5c242)); const t = kit.box(x - 2.4, 0.7, z - 0.8, x + 2.4, 10, z + 0.8, kit.mat(0xf5c242)); t.rotation.z = 0; kit.box(x - 2.4, 0.7, z - 0.9, x + 2.4, 10, z - 0.7, kit.mat(0xd9352a)); }; cone(44, 232); }
  for (const x of [20, 46]) kit.box(x, 0, D - 22, x + 20, 8, D - 6, kit.mat(0x2a6fb8)); // 장바구니 더미
  potPlant(kit, 308, 22, 0.9); shelf(c, 'W', 108, 30, 22, 3, PALETTE, 'boxes');
};

const club: Extra = c => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  common(c, { grime: 0.5, shade: 0.5, shaft: null, dust: 140 });
  // 천장: 별 같은 점 조명이 깜빡임
  if (kit.quality !== 'low') {
    const n = 170, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = 6 + rnd(i) * (W - 12); pos[i * 3 + 1] = H - 0.8; pos[i * 3 + 2] = 6 + rnd(i + 70) * (D - 12); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ map: soft(kit), size: 3.2, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }); kit.own(g, m); const pts = new THREE.Points(g, m); pts.frustumCulled = false; kit.scene.add(pts);
    const cc = new THREE.Color(); kit.anim.push(t => { for (let i = 0; i < n; i++) { cc.setHSL((i * 0.037 + t * 0.05) % 1, 0.8, 0.3 + 0.3 * Math.sin(t * 2 + i * 1.3)); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; } g.attributes.color.needsUpdate = true; });
  }
  // 천장 스포트라이트 빛기둥과 바닥에 번지는 색
  const spotCols = [0xff3fd0, 0x35d9e6, 0xffd84a, 0xb77bff, 0x7dff6a, 0xff6a3c];
  const cones: THREE.Group[] = [];
  spotCols.forEach((cl, i) => {
    const x = 50 + i * 46, piv = kit.group(x, H - 7.5, i % 2 ? 176 : 96); const g = new THREE.CylinderGeometry(1.2, 17, 80, 20, 1, true); kit.own(g); g.translate(0, -40, 0);
    const m = new THREE.MeshBasicMaterial({ color: cl, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); kit.own(m); piv.add(new THREE.Mesh(g, m)); cones.push(piv);
  });
  const floorGlow = spotCols.slice(0, 4).map(cl => pool(kit, 165, 130, 70, 70, cl, 0.32));
  kit.anim.push(t => { cones.forEach((p, i) => { p.rotation.z = Math.sin(t * 0.9 + i * 1.3) * 0.5; p.rotation.x = Math.cos(t * 0.7 + i * 2.1) * 0.5; }); floorGlow.forEach((p, i) => { p.position.x = 165 + Math.cos(t * 0.9 + i * 1.6) * 72; p.position.z = 130 + Math.sin(t * 0.9 + i * 1.6) * 52; }); });
  // 벽: 네온 그림(왼쪽 소파 위·오른쪽 바 위)과 LED 이퀄라이저
  const neonPic = (draw: (g: G2) => void) => (g: G2, w: number, h: number): void => { g.fillStyle = '#0a0612'; g.fillRect(0, 0, w, h); g.save(); g.scale(w / 128, h / 96); g.shadowBlur = 8; g.lineWidth = 4; g.lineCap = 'round'; draw(g); g.restore(); };
  const ring = (g: G2): void => { g.strokeStyle = g.shadowColor = '#ff3fd0'; g.beginPath(); g.arc(64, 48, 32, 0, 6.29); g.stroke(); g.strokeStyle = g.shadowColor = '#35d9e6'; g.beginPath(); g.arc(64, 48, 18, 0, 6.29); g.stroke(); };
  const heart = (g: G2): void => { g.strokeStyle = g.shadowColor = '#ff3f6a'; g.beginPath(); g.moveTo(64, 78); g.bezierCurveTo(16, 46, 40, 8, 64, 34); g.bezierCurveTo(88, 8, 112, 46, 64, 78); g.stroke(); };
  const bolt = (g: G2): void => { g.strokeStyle = g.shadowColor = '#ffd84a'; g.beginPath(); g.moveTo(74, 8); g.lineTo(46, 52); g.lineTo(66, 52); g.lineTo(52, 88); g.lineTo(88, 40); g.lineTo(68, 40); g.closePath(); g.stroke(); };
  const wave = (g: G2): void => { g.strokeStyle = g.shadowColor = '#7dff6a'; g.beginPath(); for (let x = 8; x <= 120; x += 4) { const y = 48 + Math.sin(x * 0.2) * 24 * Math.sin(x * 0.03); if (x === 8) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); };
  [[ring, 'W', 70], [heart, 'W', 124], [bolt, 'W', 178], [wave, 'W', 232]].forEach(([d, wl, u]) => lightbox(c, wl as Wall, u as number, 44, 30, 22, neonPic(d as (g: G2) => void), 0x120a1c));
  lightbox(c, 'E', 108, 50, 30, 22, neonPic(ring), 0x120a1c); lightbox(c, 'E', 232, 50, 30, 22, neonPic(heart), 0x120a1c);
  const eq: THREE.Mesh[] = []; for (let i = 0; i < 14; i++) { const b = kit.box(0, 0, 0, 1, 1, 1, kit.glow([0xff3fd0, 0x35d9e6, 0x7dff6a][i % 3])); b.position.set(2 + 0.4, 0, 0); eq.push(b); }
  { const g = mount(c, 'W', 150, 8); eq.forEach((b, i) => { kit.scene.remove(b); g.add(b); b.position.set(-30 + i * 4.4, 0, 1.2); b.scale.set(3, 1, 1); }); kit.anim.push(t => { eq.forEach((b, i) => { const h = 3 + (0.5 + 0.5 * Math.sin(t * 6 + i * 0.9)) * (4 + 6 * Math.abs(Math.sin(t * 1.3 + i))); b.scale.y = h; b.position.y = h / 2 + 4; }); }); }
  // 바 위·낮은 탁자 위 잔과 촛불, 바 위 매단 유리잔 선반
  for (let i = 0; i < 7; i++) { const x = 284 + (i % 2) * 14, z = 82 + i * 17; const t = kit.tube(x, 23, z, 1.5, 3.2 + rnd(i) * 1.4, kit.mat(0xcfe8ff, 0x35d9e6, 0.35, { transparent: true, opacity: 0.7 })); void t; kit.sphere(x + 4, 24, z + 3, 1.2, kit.glow([0xff3fd0, 0x35d9e6, 0xffd84a][i % 3])); }
  for (const z of [115, 201]) for (const dz of [-8, 8]) { kit.tube(54, 9, z + dz, 1.3, 3, kit.mat(0xcfe8ff, 0xff3fd0, 0.4, { transparent: true, opacity: 0.75 })); } for (const z of [115, 201]) kit.sphere(54, 11.6, z, 1, kit.glow(0xffc47a));
  kit.box(W - 10, 44, 70, W - 1, 45, 204, kit.mat(0x2a2236)); for (let i = 0; i < 26; i++) kit.tube(W - 5.5, 45, 74 + i * 5, 0.8, 2.6, kit.mat(0xcfe8ff, 0x35d9e6, 0.2, { transparent: true, opacity: 0.7 }));
  // 계단식 LED 바닥 띠(소파 구역 가장자리)와 입구 쪽 벨벳 커튼
  for (const [x0, z0, x1, z1] of [[66, 76, 67.4, 232], [98, 70, 262, 71.4]] as const) kit.box(x0, 0.2, z0, x1, 1.2, z1, kit.glow(0xb77bff, 0.9));
  for (const x of [8, W - 22]) for (let i = 0; i < 6; i++) { const h = H - 14 - rnd(i + x) * 3; kit.box(x + i * 2.4, 12, D - 3 - rnd(i) * 1.2, x + i * 2.4 + 2.2, h, D - 1.4, kit.mat(i % 2 ? 0x5a0a3a : 0x7a1050)); }
  // 문 위: 깜빡이는 네온 화살표
  const arrow = kit.sign('#ff6ad5', 'ENTER ▼', W / 2, H - 14, D - 1.4, 26, Math.PI); kit.anim.push(t => { arrow.visible = Math.sin(t * 5) > -0.4; });
};

const plant: Extra = c => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  common(c, { grime: 1, shade: 0.4, shaft: 0xbfe0ff, shaftA: 0.1, dust: 70 });
  // 공장 조명 + 철망 갓등 웅덩이
  for (const [x, z] of [[60, 130], [165, 130], [270, 130], [60, 205], [165, 205], [270, 205]]) pendant(c, x, z, 14, 0xfff0c0, 0x4a5058, 6, 0.28);
  for (const [x, z] of [[88, 50], [210, 50], [165, 90], [300, 90]]) pool(kit, x, z, 70, 56, 0xfff0c0, 0.1);
  // 바닥: 철판·배수구·기름 얼룩·행선 화살표
  const gr = kit.tex(64, 64, g => { g.fillStyle = '#2d3238'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#5c646d'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 8 + 4, 0); g.lineTo(i * 8 + 4, 64); g.moveTo(0, i * 8 + 4); g.lineTo(64, i * 8 + 4); g.stroke(); } }, [3, 1]);
  for (const [x, z] of [[165, 112], [108, 160]]) { const m = new THREE.Mesh(quad(kit), new THREE.MeshLambertMaterial({ map: gr })); kit.own(m.material as THREE.Material); m.rotation.x = -Math.PI / 2; m.scale.set(30, 10, 1); m.position.set(x, 0.4, z); kit.scene.add(m); }
  for (const [x, z, r] of [[190, 170, 22], [120, 118, 14], [262, 90, 16], [60, 236, 12]]) pool(kit, x, z, r * 2.6, r * 1.8, 0x05080c, 0.55, false);
  pool(kit, 190, 170, 36, 22, 0x6a8aa8, 0.07);
  // 탱크: 사다리·압력계·밸브 바퀴
  for (const x of [178, 256]) {
    for (let i = 0; i <= 12; i++) kit.box(x - 5, 5 + i * 4.4, 74.2, x + 5, 5.8 + i * 4.4, 75.2, kit.mat(0xc8ccd0)); kit.box(x - 5.4, 2, 74.2, x - 4.6, 58, 75.2, kit.mat(0xc8ccd0)); kit.box(x + 4.6, 2, 74.2, x + 5.4, 58, 75.2, kit.mat(0xc8ccd0));
    const gg = kit.tube(x - 16, 27, 75, 3.6, 1.2, kit.mat(0xf2f2f2)); gg.rotation.x = Math.PI / 2; const nd = kit.box(x - 16.2, 27, 75.8, x - 15.8, 30, 76.2, kit.mat(0xd01818)); nd.position.set(x - 16, 27.5, 76); kit.anim.push(t => { nd.rotation.z = -0.9 + Math.sin(t * 1.4 + x) * 0.35; });
    const v = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.5, 6, 14), kit.mat(0xd01818)); kit.own(v.geometry); v.position.set(x + 16, 16, 75.4); kit.scene.add(v); kit.box(x + 12.8, 15.7, 75, x + 19.2, 16.3, 75.6, kit.mat(0xd01818)); kit.box(x + 15.7, 12.8, 75, x + 16.3, 19.2, 75.6, kit.mat(0xd01818));
  }
  // 증기 분출(오르며 사라지는 흰 구름)
  const puffs: { m: THREE.Mesh; o: number }[] = []; const pm = blobMat(kit, 0xdfe8ee, 0.28, false);
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(quad(kit), pm.clone()); kit.own(m.material as THREE.Material); m.scale.set(8, 8, 1); m.renderOrder = 4; kit.scene.add(m); puffs.push({ m, o: i / 9 }); }
  kit.anim.push(t => { puffs.forEach(({ m, o }) => { const k = (t * 0.35 + o) % 1; m.position.set(138 + Math.sin(o * 20 + k * 3) * 2, 40 + k * 26, 94 + k * 5); m.lookAt(m.position.x, m.position.y, m.position.z + 10); const s = 5 + k * 12; m.scale.set(s, s, 1); (m.material as THREE.MeshBasicMaterial).opacity = 0.3 * Math.sin(k * Math.PI); }); });
  kit.tube(138, 0, 94, 1.6, 40, kit.mat(0x7a858f)); kit.tube(138, 38, 94, 2.4, 2, kit.mat(0x4a525a));
  // 기계 위 굴뚝과 점멸등
  kit.tube(268, 36, 118, 3, 10, kit.mat(0x4a525a)); const blink = [kit.sphere(232, 38, 116, 1.1, kit.glow(0xff3030)), kit.sphere(238, 38, 116, 1.1, kit.glow(0x30ff60)), kit.sphere(244, 38, 116, 1.1, kit.glow(0xffc21c))]; kit.anim.push(t => { blink.forEach((b, i) => { b.visible = Math.sin(t * (3 + i) + i) > -0.2; }); });
  // 벽: 안전 표지·사고 없는 날 전광판·사물함·응급상자·눈 세척기
  lightbox(c, 'N', 118, 56, 44, 15, (g, w, h) => { g.fillStyle = '#06100a'; g.fillRect(0, 0, w, h); g.fillStyle = '#7dffb0'; g.font = '900 9px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('DAYS WITHOUT ACCIDENT', w / 2, h * 0.3); g.fillStyle = '#ffc21c'; g.font = '900 24px monospace'; g.fillText('0 1 2 7', w / 2, h * 0.7); }, 0x2a2a2a);
  lightbox(c, 'N', 296, 52, 26, 20, textBoard('SAFETY\nFIRST', '#2fa84a', '#fff', 17), 0x1a1a1a);
  const lk = kit.tex(64, 64, g => { g.fillStyle = '#3a6a8a'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#1d3a4c'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.strokeRect(1 + i * 16, 2, 14, 60); g.fillStyle = '#10222c'; for (let j = 0; j < 4; j++) g.fillRect(4 + i * 16, 6 + j * 3, 8, 1); g.fillStyle = '#c8d0d8'; g.fillRect(11 + i * 16, 34, 2, 6); } });
  { const g = mount(c, 'E', 36, 21); kit.box(-24, -21, 0, 24, 21, 3, kit.mat(0x244a64), g); const m = new THREE.MeshLambertMaterial({ map: lk }); kit.own(m); flat(kit, g, 48, 42, m, 0, 0, 3.1, 1); }
  { const g = mount(c, 'E', 76, 32); kit.box(-5, -5, 0, 5, 5, 2.4, kit.mat(0xf2f2f2), g); kit.box(-1, -3.4, 2.4, 1, 3.4, 2.8, kit.mat(0xd01818), g); kit.box(-3.4, -1, 2.4, 3.4, 1, 2.8, kit.mat(0xd01818), g); }
  lightbox(c, 'W', 232, 44, 22, 16, textBoard('HARD HAT\nREQUIRED', '#ffc21c', '#111', 11), 0x222);
  for (const [wl, u] of [['W', 100], ['W', 205], ['E', 140], ['E', 215]] as const) { const g = mount(c, wl, u, 40); kit.box(-3, -2, 0, 3, 2, 3, kit.mat(0x2a2e34), g); kit.box(-2.4, -1.4, 3, 2.4, 1.4, 4, kit.glow(0xff9a30), g); wash(c, wl, u, 40, 22, 22, 0xff9a30, 0.28); }
  // 천장 환풍기(회전)와 케이블 트레이
  for (const x of [80, 250]) { const g = kit.group(x, H - 7, 20); const r = kit.group(0, 0, 0, 0, g); kit.tube(0, -7, 0, 6.5, 1, kit.mat(0x30363c), g); for (let i = 0; i < 4; i++) { const b = kit.box(0.5, -0.3, -1.6, 6, 0.3, 1.6, kit.mat(0x9aa3ab), r); b.rotation.y = i * Math.PI / 2; b.position.set(Math.cos(i * Math.PI / 2) * 3, 0, -Math.sin(i * Math.PI / 2) * 3); b.rotation.y = i * Math.PI / 2; } r.position.y = -6.6; kit.anim.push(t => { r.rotation.y = t * 7; }); }
  for (const x of [60, 160, 260]) kit.box(x - 3, H - 3.2, 10, x + 3, H - 2.4, D - 10, kit.mat(0x40464e));
  // 회전 경광등
  { const b = kit.group(W - 8, 46, 30); kit.box(-2.4, 0, -2.4, 2.4, 2, 2.4, kit.mat(0x222), b); kit.tube(0, 2, 0, 2.2, 3.6, kit.mat(0xd01818, 0xd01818, 0.8), b); const l = kit.light(0xff3a1c, 0, W - 14, 48, 32, 110); kit.anim.push(t => { l.intensity = 1.2 * Math.max(0, Math.sin(t * 5)); }); }
  potPlant(kit, 318, 246, 0.9, 0x4f8f3a, 0x6a6f75);
};

const casino: Extra = c => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  common(c, { grime: 0.25, shade: 0.42, shaft: 0xffb878, shaftA: 0.09, dust: 100 });
  for (const [x, z] of [[85, 120], [245, 120], [165, 200]]) { pool(kit, x, z, 96, 96, 0xffc46a, 0.2); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; kit.tube(x + Math.cos(a) * 13, H - 19, z + Math.sin(a) * 13, 0.2, 5, kit.glow(0xffe9a8, 0.8)); kit.sphere(x + Math.cos(a) * 13, H - 19.2, z + Math.sin(a) * 13, 0.5, kit.glow(0xffffff)); } }
  // 천장: 반짝이는 광섬유 별
  if (kit.quality !== 'low') {
    const n = 130, pos = new Float32Array(n * 3), col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = 20 + rnd(i) * (W - 40); pos[i * 3 + 1] = H - 0.9; pos[i * 3 + 2] = 20 + rnd(i + 70) * (D - 40); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ map: soft(kit), size: 3, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }); kit.own(g, m); const pts = new THREE.Points(g, m); pts.frustumCulled = false; kit.scene.add(pts);
    kit.anim.push(t => { for (let i = 0; i < n; i++) { const b = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + rnd(i) * 2) + i * 2.3)); col[i * 3] = 1 * b; col[i * 3 + 1] = 0.82 * b; col[i * 3 + 2] = 0.5 * b; } g.attributes.color.needsUpdate = true; });
  }
  // 안쪽 벽 간판 둘레: 번갈아 켜지는 전구 테두리
  const onM = kit.glow(0xfff2b0, 1), offM = kit.glow(0x6a4a10, 0.7), bulbs: THREE.Mesh[] = [];
  const bx0 = 128, bx1 = 202, by0 = 44, by1 = 68;
  const edge: [number, number][] = []; for (let x = bx0; x <= bx1; x += 6) { edge.push([x, by0], [x, by1]); } for (let y = by0 + 6; y < by1; y += 6) { edge.push([bx0, y], [bx1, y]); }
  edge.forEach(([x, y], i) => { const b = kit.sphere(x, y, 1.6, 1.1, i % 2 ? onM : offM); bulbs.push(b); });
  kit.anim.push(t => { const ph = Math.floor(t * 4) % 2; bulbs.forEach((b, i) => { b.material = (i + ph) % 2 ? onM : offM; }); });
  // 금빛 액자와 비로드 커튼, 벽등
  painting(c, 'W', 50, 46, 26, 18, 2, 0xc9a227, false, true); painting(c, 'W', 226, 46, 26, 18, 4, 0xc9a227, false, true); painting(c, 'E', 50, 46, 26, 18, 5, 0xc9a227, false, true); painting(c, 'E', 226, 46, 26, 18, 0, 0xc9a227, false, true);
  painting(c, 'N', 60, 46, 28, 18, 3, 0xc9a227, false, true); painting(c, 'N', 270, 46, 28, 18, 1, 0xc9a227, false, true);
  for (const [wl, u] of [['W', 20], ['W', 240], ['E', 20], ['E', 240]] as const) for (let i = 0; i < 5; i++) { const g = mount(c, wl, u + (i - 2) * 4.4, 0); kit.box(-2.1, 2, 0.4, 2.1, H - 8, 0.8 + (i % 2) * 1.4, kit.mat(i % 2 ? 0x6a0a1a : 0x8a1426), g); }
  for (const [wl, u] of [['W', 20], ['W', 240], ['E', 20], ['E', 240]] as const) { const g = mount(c, wl, u, 0); kit.box(-12, H - 9, 0, 12, H - 6.5, 3.2, kit.mat(0xd9a82c, 0x6a4a00, 0.5), g); for (let i = -2; i <= 2; i++) kit.tube(i * 4.6, H - 17, 2.4, 0.6, 8, kit.glow(0xffd24a, 0.8), g); }
  for (const [wl, u] of [['N', 24], ['N', 306], ['W', 80], ['W', 210], ['E', 80], ['E', 210]] as const) sconce(c, wl, u, 42, 0xffcf7a, 0.42);
  // 바닥 러그와 포커 테이블 위 칩·카드
  const rug = kit.tex(128, 96, g => { g.fillStyle = '#4a0a14'; g.fillRect(0, 0, 128, 96); g.strokeStyle = '#d9a82c'; g.lineWidth = 3; g.strokeRect(5, 5, 118, 86); g.lineWidth = 1.2; g.strokeRect(11, 11, 106, 74); g.beginPath(); g.moveTo(64, 14); g.lineTo(110, 48); g.lineTo(64, 82); g.lineTo(18, 48); g.closePath(); g.stroke(); g.beginPath(); g.arc(64, 48, 16, 0, 6.29); g.stroke(); });
  for (const [x, z] of [[117, 174], [215, 174]]) { const m = new THREE.Mesh(quad(kit), new THREE.MeshLambertMaterial({ map: rug })); kit.own(m.material as THREE.Material); m.rotation.x = -Math.PI / 2; m.scale.set(92, 68, 1); m.position.set(x, 0.32, z + 14); kit.scene.add(m); }
  const chips = [0xd9352a, 0x2a6fd9, 0x222222, 0x3fae6a, 0xf2f2f2];
  for (const [x0, x1] of [[84, 150], [182, 248]]) { const top = 19.2; for (let i = 0; i < 9; i++) { const x = x0 + 8 + rnd(i + x0) * (x1 - x0 - 16), z = 158 + rnd(i + 9 + x0) * 30; const n = 2 + Math.floor(rnd(i * 3) * 4); for (let k = 0; k < n; k++) kit.tube(x, top + k * 0.55, z, 1.5, 0.5, kit.mat(chips[(i + k) % 5])); } for (let i = 0; i < 4; i++) { const cd = kit.box(x0 + 14 + i * 12, top, 186 + (i % 2) * 2, x0 + 17 + i * 12, top + 0.25, 190 + (i % 2) * 2, kit.mat(0xf6f2e6)); cd.rotation.y = i * 0.5; } }
  // 슬롯머신 위 반짝 간판과 모서리 야자
  for (const [wl, u] of [['W', 138], ['E', 138]] as const) { const g = mount(c, wl, u, 0); for (let i = 0; i < 12; i++) { const b = kit.sphere(-26 + i * 4.7, 39, 2.2, 1, kit.glow([0xff3fd0, 0xffd84a, 0x35d9e6, 0x7dff6a][i % 4]), g); void b; } }
  const flash = kit.light(0xff7ad0, 0, 30, 30, 140, 100), flash2 = kit.light(0x7ad0ff, 0, W - 30, 30, 140, 100); kit.anim.push(t => { flash.intensity = 0.6 + 0.6 * Math.sin(t * 5); flash2.intensity = 0.6 + 0.6 * Math.sin(t * 5 + 2); });
  potPlant(kit, 22, 248, 1.1, 0x2f8f4e, 0xd9a82c); potPlant(kit, 308, 248, 1.1, 0x2f8f4e, 0xd9a82c);
  // 천장 황금 몰딩 띠
  kit.box(40, H - 3, 20, W - 40, H - 2.4, 21, kit.mat(0xd9a82c, 0x6a4a00, 0.6)); kit.box(40, H - 3, D - 20, W - 40, H - 2.4, D - 19, kit.mat(0xd9a82c, 0x6a4a00, 0.6));
};

const bank: Extra = c => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  common(c, { grime: 0.18, shade: 0.3, shaft: 0xffe2b0, shaftA: 0.15, dust: 90 });
  for (const x of [75, 165, 255]) pool(kit, x, 130, 80, 80, 0xffe9b8, 0.18);
  // 창구 위 대기 번호 전광판(숫자가 올라갑니다)
  for (const x of [75, 165, 255]) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 40; const g = cv.getContext('2d')!; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; kit.own(tex);
    let last = -1; const draw = (n: number): void => { g.fillStyle = '#080c10'; g.fillRect(0, 0, 128, 40); g.fillStyle = '#7dffb0'; g.font = '700 11px monospace'; g.textAlign = 'center'; g.fillText('NOW SERVING', 64, 13); g.fillStyle = '#ffc21c'; g.font = '900 24px monospace'; g.fillText(String(n).padStart(3, '0'), 64, 35); tex.needsUpdate = true; };
    const m = new THREE.MeshBasicMaterial({ map: tex, fog: false }); kit.own(m); draw(41 + Math.floor(x / 40));
    kit.box(x - 0.15, H - 16, 92 - 0.15, x + 0.15, H, 92 + 0.15, kit.mat(0x222)); kit.box(x - 9, H - 26, 90.6, x + 9, H - 16, 92.4, kit.mat(0x181818)); const p = new THREE.Mesh(quad(kit), m); p.scale.set(17, 8.4, 1); p.position.set(x, H - 21, 90.5); p.rotation.y = Math.PI; kit.scene.add(p);
    p.position.z = 92.5; p.rotation.y = 0; kit.anim.push(t => { const n = 41 + Math.floor(x / 40) + Math.floor(t / 6); if (n !== last) { last = n; draw(n); } });
  }
  // 옆벽 액자·벽등·시계·깃발
  [['W', 120], ['W', 185], ['E', 90], ['E', 160], ['E', 235]].forEach(([wl, u], i) => painting(c, wl as Wall, u as number, 46, 22 + (i % 2) * 6, 16, i + 2, 0xc9a227, true, true));
  painting(c, 'W', 235, 46, 22, 16, 0, 0xc9a227, true, true); clock(c, 'W', 150, 56, 5.5);
  for (const [wl, u] of [['W', 100], ['W', 205], ['E', 125], ['E', 195]] as const) sconce(c, wl, u, 40, 0xffe2a0, 0.4);
  for (const [x, col] of [[10, 0x22344f], [320, 0x22344f]] as const) { const g = mount(c, 'N', x, 0); kit.tube(0, 0, 2.6, 0.5, 40, kit.mat(0xc9a227), g); kit.box(-0.4, 32, 2, 11, 40, 2.4, kit.mat(col), g); kit.box(-0.4, 35, 2.4, 11, 36.4, 2.6, kit.mat(0xc9a227), g); }
  // 천장: 석고 몰딩 띠 + 가운데 메달리온과 큰 샹들리에
  kit.box(40, H - 3.4, 20, W - 40, H - 2.4, 22, kit.mat(0xefe6cf)); kit.box(40, H - 3.4, D - 40, W - 40, H - 2.4, D - 38, kit.mat(0xefe6cf));
  const med = new THREE.Mesh(new THREE.TorusGeometry(26, 1.6, 8, 40), kit.mat(0xc9a227, 0x3a2b00, 0.4)); kit.own(med.geometry); med.rotation.x = Math.PI / 2; med.position.set(165, H - 1.8, 190); kit.scene.add(med);
  { const g = kit.group(165, H - 17, 190); g.scale.setScalar(0.7); kit.tube(0, 14, 0, 0.35, 8.4, kit.mat(0x333), g); for (let r = 0; r < 2; r++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(10 - r * 4, 0.8, 6, 24), kit.mat(0xc9a227, 0x3a2b00, 0.5)); kit.own(ring.geometry); ring.rotation.x = Math.PI / 2; ring.position.y = 6 - r * 4; g.add(ring); for (let i = 0; i < 6 + r * 2; i++) { const a = i / (6 + r * 2) * 6.283, rr = 10 - r * 4; kit.tube(Math.cos(a) * rr, 6 - r * 4, Math.sin(a) * rr, 0.35, 3, kit.mat(0xfff3d6), g); kit.sphere(Math.cos(a) * rr, 9.4 - r * 4, Math.sin(a) * rr, 0.9, kit.glow(0xffe9a8), g); } } kit.sphere(0, 0, 0, 1.6, kit.glow(0xfff0c0), g); pool(kit, 165, 190, 90, 90, 0xffe2a0, 0.22); }
  // 바닥: 금빛 테두리 상감과 모서리 장식
  const inl = (x0: number, z0: number, x1: number, z1: number): void => { kit.box(x0, 0.16, z0, x1, 0.4, z1, kit.mat(0xc9a227, 0x3a2b00, 0.35)); };
  inl(16, 104, 17.4, 250); inl(W - 17.4, 104, W - 16, 250); inl(16, 104, 124, 105.4); inl(206, 104, W - 16, 105.4); inl(16, 248.6, 124, 250); inl(206, 248.6, W - 16, 250);
  // 대기 구역: 안내 책자 꽂이·티켓 발급기·정수기·화분
  { const g = mount(c, 'E', 80, 0); kit.box(-7, 0, 0, 7, 14, 6, kit.mat(0xefefef), g); kit.box(-5, 4, 6, 5, 12, 6.4, kit.glow(0x7dffb0, 0.8), g); kit.tube(0, 14, 3, 3.4, 3, kit.mat(0xbfe8ff, 0x1f6b9b, 0.3, { transparent: true, opacity: 0.7 }), g); }
  { const g = mount(c, 'W', 170, 0); kit.box(-6, 0, 0, 6, 30, 4, kit.mat(0x5a3a24), g); for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) kit.box(-5 + q * 3.5, 2 + r * 7, 4, -2 + q * 3.5, 8 + r * 7, 4.5, kit.mat([0xe94b4b, 0x4fa3ff, 0xf5c242, 0x5ed388][(r + q) % 4]), g); }
  potPlant(kit, 100, 246, 1, 0x2f8f4e, 0xc9a227); potPlant(kit, 230, 246, 1, 0x2f8f4e, 0xc9a227);
  // 창구 유리 위 안내 문구와 카운터 위 물건
  for (const x of [75, 165, 255]) { kit.tube(x - 22, 25, 76, 1.8, 3, kit.mat(0xc9a227)); kit.box(x + 12, 25, 72, x + 22, 26.2, 80, kit.mat(0x222)); kit.box(x + 14, 26.2, 74, x + 20, 30, 74.6, kit.glow(0x7dffb0, 0.8)); }
};

const gunshop: Extra = c => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  common(c, { grime: 1.1, shade: 0.4, shaft: 0xffc890, shaftA: 0.12, dust: 110 });
  // 매단 전구등과 웅덩이
  for (const [x, z] of [[60, 130], [165, 140], [270, 130], [70, 215], [260, 215]]) pendant(c, x, z, 15, 0xffc47a, 0x2c2a24, 7, 0.5);
  for (const [x, z] of [[100, 100], [230, 100]]) pool(kit, x, z, 110, 70, 0xffd8a0, 0.2);
  // 천장 서까래와 선풍기
  for (let i = 0; i < 5; i++) kit.box(30 + i * 68, H - 5, 3, 34 + i * 68, H, D - 3, kit.mat(0x3a2a20));
  for (const z of [60, 130, 200]) kit.box(3, H - 3, z - 2, W - 3, H, z + 2, kit.mat(0x2e2018));
  fan(kit, 165, 210, H); fan(kit, 100, 110, H, 2.4);
  // 벽: 사슴·멧돼지 박제, 깃발, 포스터, 칠판 가격표
  const antler = (g: THREE.Group, s: number): void => { for (const sx of [-1, 1]) { const a = kit.box(0, 0, 0, 0.7, 7 * s, 0.7, kit.mat(0xd9ceb0), g); a.position.set(sx * 3.2, 5.4, 1.2); a.rotation.z = -sx * 0.55; for (let i = 0; i < 2; i++) { const t = kit.box(0, 0, 0, 0.5, 3.4 * s, 0.5, kit.mat(0xd9ceb0), g); t.position.set(sx * (4.6 + i * 1.8), 7.4 + i * 1.8, 1.2); t.rotation.z = -sx * 0.25; } } };
  const trophy = (wl: Wall, u: number, y: number, s: number): void => { const g = mount(c, wl, u, y); kit.box(-5.4, -4, 0, 5.4, 4, 0.8, kit.mat(0x4a3220), g); const head = kit.sphere(0, 0, 4.2, 4.2, kit.mat(0x7a5a3a), g); head.scale.set(3.6, 3.4, 4.6); kit.box(-1.8, -4.4, 4, 1.8, -1.2, 9.2, kit.mat(0x6a4a2c), g); kit.sphere(-1.9, 1.3, 7.2, 0.5, kit.mat(0x111), g); kit.sphere(1.9, 1.3, 7.2, 0.5, kit.mat(0x111), g); antler(g, s); };
  trophy('W', 118, 44, 1); trophy('W', 224, 42, 0.8); trophy('E', 118, 44, 1); trophy('E', 190, 42, 0.8);
  const flag = (wl: Wall, u: number, y: number): void => { const t = kit.tex(64, 40, g => { for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#f2f2f2' : '#c92a2a'; g.fillRect(0, i * 5.8, 64, 5.8); } g.fillStyle = '#233a7a'; g.fillRect(0, 0, 28, 23); g.fillStyle = '#fff'; for (let i = 0; i < 20; i++) g.fillRect(2 + (i % 5) * 5, 2 + Math.floor(i / 5) * 5, 1.5, 1.5); }); const g = mount(c, wl, u, y); kit.box(-17, 9, 0, 17, 10, 1.4, kit.mat(0x222), g); const m = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }); kit.own(m); flat(kit, g, 32, 20, m, 0, -0.5, 0.9, 1); };
  flag('W', 160, 48); flag('E', 232, 48);
  lightbox(c, 'E', 150, 50, 30, 19, (g, w, h) => { g.fillStyle = '#1b2a22'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2e6'; g.font = '800 11px sans-serif'; g.textAlign = 'center'; g.fillText('TODAY', w / 2, 14); g.font = '600 9px sans-serif'; ['9mm  12$', '.45   15$', '12ga  18$', '5.56  21$'].forEach((l, i) => g.fillText(l, w / 2, 29 + i * 12)); }, 0x3a2a18);
  lightbox(c, 'W', 78, 46, 24, 18, textBoard('NO\nREFUNDS', '#c92a2a', '#fff', 15), 0x222); lightbox(c, 'W', 205, 52, 22, 14, textBoard('PERMIT\nREQUIRED', '#2a3a4a', '#ffd36b', 11), 0x222);
  // 창가 네온 OPEN
  const open = kit.sign('#ff3b30', 'OPEN', 70, 44, D - 1.6, 28, Math.PI); kit.sign('#35d9e6', 'AMMO', 260, 44, D - 1.6, 28, Math.PI); kit.anim.push(t => { open.visible = Math.sin(t * 7) > -0.7; });
  // 계산대 위: 탄약 상자 더미·계산기·종·조준경
  const cx = (x: number): number => x; const top = 22;
  for (const [x, n] of [[40, 3], [120, 2], [200, 4], [270, 3]] as const) for (let k = 0; k < n; k++) kit.box(cx(x) + k * 6.2, top, 74, cx(x) + k * 6.2 + 5.6, top + 3.2, 80, kit.mat([0xc9a227, 0xb02a2a, 0x3a5a3a, 0xc9a227][k % 4]));
  kit.box(200, top, 80, 214, top + 5, 90, kit.mat(0x2a2e34)); kit.box(202, top + 5, 82, 212, top + 8.5, 83, kit.glow(0x7dffb0, 0.9)).rotation.x = -0.4; kit.tube(240, top, 84, 3, 2, kit.mat(0xc9a227)); kit.sphere(240, top + 2, 84, 2.4, kit.mat(0xc9a227));
  // 바닥: 인디언 무늬 러그, 탄피
  const rug = kit.tex(128, 64, g => { g.fillStyle = '#7a2a1a'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#e8c870'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(14 + i * 22, 32); g.lineTo(25 + i * 22, 14); g.lineTo(36 + i * 22, 32); g.lineTo(25 + i * 22, 50); g.fill(); } g.strokeStyle = '#e8c870'; g.lineWidth = 3; g.strokeRect(4, 4, 120, 56); g.fillStyle = '#2a3a4a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(21 + i * 22, 32); g.lineTo(25 + i * 22, 24); g.lineTo(29 + i * 22, 32); g.lineTo(25 + i * 22, 40); g.fill(); } });
  { const m = new THREE.Mesh(quad(kit), new THREE.MeshLambertMaterial({ map: rug })); kit.own(m.material as THREE.Material); m.rotation.x = -Math.PI / 2; m.scale.set(80, 40, 1); m.position.set(165, 0.32, 128); kit.scene.add(m); }
  for (let i = 0; i < 24; i++) kit.tube(40 + rnd(i) * 240, 0.3, 100 + rnd(i + 5) * 120, 0.5, 1.2, kit.mat(0xc9a227));
  // 벽 한쪽 카모 그물과 사격장 과녁 걸이
  { const g = mount(c, 'E', 218, 0); const net = kit.tex(32, 32, gg => { gg.fillStyle = '#3a4a2a'; gg.fillRect(0, 0, 32, 32); for (let i = 0; i < 14; i++) { gg.fillStyle = ['#2a3620', '#56653a', '#1c2616'][i % 3]; gg.beginPath(); gg.ellipse(rnd(i) * 32, rnd(i + 7) * 32, 4 + rnd(i + 3) * 6, 2 + rnd(i + 9) * 4, rnd(i) * 3, 0, 6.29); gg.fill(); } }, [3, 2]); const m = new THREE.MeshLambertMaterial({ map: net }); kit.own(m); flat(kit, g, 46, 30, m, 0, 48, 1.2, 1); }
  for (const [wl, u] of [['W', 40], ['W', 190], ['E', 70], ['E', 120]] as const) sconce(c, wl, u, 42, 0xffb868, 0.4);
  shelf(c, 'E', 88, 30, 26, 5, [0xc9a227, 0x7a2a1a, 0x3a5a3a, 0x222222], 'jars'); shelf(c, 'W', 140, 30, 26, 8, [0xc9a227, 0x7a2a1a, 0x3a5a3a, 0x222222], 'boxes');
  void D;
};

/** 업종별 마감 장식 */
export const EXTRA: Record<BizKind, Extra> = { store, club, plant, casino, bank, gunshop };
