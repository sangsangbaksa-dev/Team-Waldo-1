// LAST CITY — 업종별 인테리어 소품·조명·간판. 가구(interiorfurn.ts)와 사람(interiorfolk.ts) 말고 방 분위기를 만드는 것들입니다.
// 좌표는 월드 단위(1m ≈ 21). 방은 W×D×H, 안쪽(북) 벽이 z=0, 출입문이 z=D 입니다.
import * as THREE from 'three';
import type { BizKind } from './defs';
import { BIZ } from './defs';
import type { FurnCtx } from './interiorfurn';
import { hangGuns } from './interiorfurn';
import { addSeat, type FolkLook } from './interiorfolk';
import { PALETTE, rnd, type Kit } from './interiorkit';

type Decor = (c: FurnCtx, look: FolkLook) => void;

/** 천장 형광등 판 */
const panel = (kit: Kit, x: number, z: number, wx: number, wz: number, H: number, c: number, k = 1): void => { kit.box(x - wx / 2, H - 0.5, z - wz / 2, x + wx / 2, H, z + wz / 2, kit.glow(c, k)); };
/** 바닥에 붙이는 얇은 판(카펫·표시선) */
const decal = (kit: Kit, x0: number, z0: number, x1: number, z1: number, color: number, y = 0.2): void => { kit.box(x0, y - 0.2, z0, x1, y, z1, kit.mat(color)); };
const poster = (kit: Kit, x: number, y: number, z: number, ry: number, w: number, h: number, seed: number): void => {
  const t = kit.tex(64, 96, g => {
    g.fillStyle = ['#f2ead0', '#ffe27a', '#bfe8ff', '#ffd1e0'][seed % 4]; g.fillRect(0, 0, 64, 96);
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#e94b4b', '#4fa3ff', '#3fae6a', '#222'][(seed + i) % 4]; g.fillRect(6 + rnd(seed * 5 + i) * 20, 8 + i * 20, 20 + rnd(seed + i * 3) * 24, 12); }
    g.fillStyle = '#222'; g.fillRect(8, 86, 48, 3);
  });
  kit.plane(w, h, t, x, y, z, ry, false);
};

const store: Decor = (c, look) => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay, bm = BIZ.store;
  for (const x of [75, 165, 255]) for (const z of [50, 130, 205]) panel(kit, x, z, 38, 9, H, 0xffffff);
  kit.light(0xf0f8ff, 1.3, 80, H - 10, 100, 260); kit.light(0xf0f8ff, 1.2, 250, H - 10, 70, 260); kit.light(0xf0f8ff, 1.1, 165, H - 10, 190, 260);
  kit.sign(bm.color, bm.sign, 58, 52, 0.9, 46);
  kit.box(0, 30, 0, W, 31.6, 0.7, kit.mat(0x3fae6a)); kit.box(0, 30, 0, 0.7, 31.6, D, kit.mat(0x3fae6a)); kit.box(W - 0.7, 30, 0, W, 31.6, D, kit.mat(0x3fae6a));       // 벽 초록 띠
  // 통로 위 매다는 표지판
  const labels: [string, number, number, string][] = [['DRINK', 215, 6, '#4fa3ff'], ['SNACK', 213, 105, '#ffb347'], ['RAMEN', 213, 153, '#ff6a5a'], ['LIFE', 56, 143, '#5ed388']];
  for (const [t, x, , col] of labels) { const z = t === 'DRINK' ? 46 : t === 'LIFE' ? 125 : t === 'SNACK' ? 94 : 142; kit.box(x - 0.2, H - 14, z - 0.2, x + 0.2, H, z + 0.2, kit.mat(0x333333)); kit.sign(col, t, x, H - 17, z, 24); }
  for (let i = 0; i < 4; i++) poster(kit, 0.7, 36 + (i % 2) * 6, 95 + i * 30, Math.PI / 2, 14, 20, i + 3);
  for (let i = 0; i < 3; i++) poster(kit, W - 0.7, 36, 40 + i * 30, -Math.PI / 2, 14, 20, i + 9);
  // 출입 매트 · 쓰레기통 · ATM
  decal(kit, W / 2 - 34, D - 28, W / 2 + 34, D - 6, 0x2f3a36, 0.3); kit.tube(122, 0, 120, 3.8, 15, kit.mat(0x4a4f55)); kit.tube(122, 15, 120, 4, 0.7, kit.mat(0x2a2d30));
  kit.box(1, 0, 198, 11, 40, 214, kit.mat(0xd9dedd)); kit.box(11, 24, 200, 11.6, 34, 212, kit.glow(0x7dffb0, 0.9)); kit.box(11, 14, 200, 11.6, 19, 212, kit.mat(0x2b3138)); kit.sign('#3fae6a', 'ATM', 6, 46, 206, 18, Math.PI / 2);
  // 계산대 위 물건: 단말기·핫푸드 보온기·사탕 바구니
  const cx = 16, top = 22;
  kit.box(cx + 36, top, 60, cx + 48, top + 6, 70, kit.mat(0x222428)); const scr = kit.box(cx + 37, top + 6, 62, cx + 47, top + 12, 63, kit.glow(0x7dffb0)); scr.rotation.x = -0.35;
  const warm = kit.box(cx + 70, top, 58, cx + 86, top + 9, 72, kit.mat(0xffd9a0, 0xff7a2a, 0.5, { transparent: true, opacity: 0.45 })); warm.renderOrder = 3; kit.box(cx + 70, top, 58, cx + 86, top + 1.2, 72, kit.mat(0x333));
  for (let i = 0; i < 5; i++) kit.tube(cx + 72 + i * 2.8, top + 1.2, 65, 1, 5, kit.mat(0xd0a060));
  kit.tube(cx + 14, top, 70, 3.8, 3.5, kit.mat(0xd9352a)); for (let i = 0; i < 6; i++) kit.box(cx + 10 + i * 1.6, top + 3.5, 68, cx + 11.4 + i * 1.6, top + 5, 71, kit.mat(PALETTE[i]));
  kit.box(cx + 1, top, 60, cx + 8, top + 3, 70, kit.mat(0x3fae6a));
  // 천장 감시 카메라 · 스툴 하나 비어 있음
  kit.sphere(W - 10, H - 4, D - 10, 3, kit.mat(0x111, 0x000, 0)); addSeat(kit, 297, 212, 0, 'stool', look);
  for (let i = 0; i < 3; i++) kit.tube(300 + (i - 1) * 6, 22, 186 + i * 22, 1.5, 3.2, kit.mat(i === 1 ? 0xf2f2f2 : 0xd9352a));        // 스낵 바 위 컵
};

const club: Decor = (c, look) => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  // 댄스 플로어 5×5, 박자에 맞춰 색이 바뀝니다.
  const tiles: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }); kit.own(m); tiles.push(kit.box(100 + i * 26, 0.2, 76 + j * 26, 100 + i * 26 + 24, 1, 76 + j * 26 + 24, m)); }
  kit.anim.push(t => { tiles.forEach((m, k) => { (m.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.25 + (k % 5) * 0.08 + Math.floor(k / 5) * 0.12) % 1, 0.85, 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(t * 4 + k))); }); });
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(8, 1), new THREE.MeshLambertMaterial({ color: 0xdfe6ff, emissive: 0x8899ff, emissiveIntensity: 0.6, flatShading: true })); kit.own(ball.geometry, ball.material as THREE.Material);
  ball.position.set(165, H - 14, 142); kit.scene.add(ball); kit.box(164.6, H - 8, 141.6, 165.4, H, 142.4, kit.mat(0x111111));
  const ls = [kit.light(0xff3fd0, 2.4, 100, 50, 90, 260), kit.light(0x35d9e6, 2.4, 230, 50, 150, 260), kit.light(0xb77bff, 2.0, 165, 46, 190, 240)];
  kit.anim.push(t => { ball.rotation.y = t * 0.8; ls.forEach((l, i) => { l.position.x = 165 + Math.cos(t * 0.9 + i * 2.1) * 80; l.position.z = 130 + Math.sin(t * 0.9 + i * 2.1) * 55; }); });
  kit.box(2, 56, 1, W - 2, 57.6, 2.6, kit.glow(0xff3fd0)); kit.box(2, 18, 1, 3.6, 19.6, D - 2, kit.glow(0x35d9e6)); kit.box(W - 3.6, 18, 1, W - 2, 19.6, D - 2, kit.glow(0xb77bff));
  kit.sign('#ff6ad5', 'CLUB', 165, 60, 1, 78);
  // 천장 트러스와 스포트라이트
  for (const z of [96, 176]) { kit.box(30, H - 6, z - 0.6, W - 30, H - 4.8, z + 0.6, kit.mat(0x2a2a30)); for (let i = 0; i < 6; i++) kit.sphere(50 + i * 46, H - 7.5, z, 1.7, kit.glow([0xff3fd0, 0x35d9e6, 0xffd84a][i % 3])); }
  if (kit.quality !== 'low') {
    const lasers = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(kit.cyl, new THREE.MeshBasicMaterial({ color: [0xff3fd0, 0x35d9e6, 0x7dff6a][i % 3], transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); kit.own(b.material as THREE.Material);
      b.scale.set(0.3, 150, 0.3); b.rotation.z = Math.PI / 2; b.position.x = 75; const piv = new THREE.Group(); piv.position.set(40 + i * 62, H - 6, 28); piv.add(b); lasers.add(piv);
      kit.anim.push(t => { piv.rotation.y = Math.sin(t * 0.7 + i) * 0.9 + 1.2; piv.rotation.z = Math.sin(t * 1.1 + i * 2) * 0.25 - 0.25; });
    }
    kit.scene.add(lasers);
  }
  // 바 뒤 거울 선반과 술병
  kit.box(W - 1.2, 22, 70, W - 0.4, 50, 204, kit.mat(0x1a1626, 0x221a36, 0.5));
  for (let r = 0; r < 3; r++) { kit.box(W - 5, 27 + r * 8, 72, W - 1.2, 27.6 + r * 8, 202, kit.mat(0x30263f)); for (let i = 0; i < 20; i++) kit.tube(W - 3, 27.6 + r * 8, 76 + i * 6.3, 0.9 + rnd(i + r) * 0.3, 4.2 + rnd(i * 3 + r) * 1.4, kit.glow([0xff3fd0, 0x35d9e6, 0xffd84a, 0x7dff6a][(i + r) % 4], 0.8)); }
  // 입구 벨벳 로프
  for (const x of [128, 202]) { kit.tube(x, 0, 224, 0.8, 16, kit.mat(0xc9a227)); kit.sphere(x, 17, 224, 1.4, kit.mat(0xc9a227)); } kit.box(128, 12, 223.4, 202, 13.4, 224.6, kit.mat(0xa01040, 0x500020, 0.5));
  void look;
};

const plant: Decor = (c) => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay, bm = BIZ.plant;
  const hz = kit.tex(64, 16, g => { for (let i = -2; i < 10; i++) { g.fillStyle = i % 2 ? '#ffc21c' : '#1c1c1c'; g.beginPath(); g.moveTo(i * 8, 16); g.lineTo(i * 8 + 8, 0); g.lineTo(i * 8 + 16, 0); g.lineTo(i * 8 + 8, 16); g.fill(); } }, [1, 1]);
  // 탱크 구역을 두른 경고 줄무늬(바닥)
  const strips: [number, number, number, number][] = [[138, 8, 296, 12.6], [138, 86, 296, 90.6], [138, 8, 142.6, 90.6], [291.4, 8, 296, 90.6]];
  for (const [x0, z0, x1, z1] of strips) { const t = hz.clone(); t.needsUpdate = true; t.repeat.set(Math.max(x1 - x0, z1 - z0) / 12, 1); kit.own(t); const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ map: t })); kit.own(f.geometry, f.material as THREE.Material); f.rotation.x = -Math.PI / 2; if (x1 - x0 < z1 - z0) f.rotation.z = Math.PI / 2; f.position.set((x0 + x1) / 2, 0.25, (z0 + z1) / 2); kit.scene.add(f); }
  decal(kit, 118, 100, 121, D - 4, 0xffc21c, 0.25); decal(kit, 214, 100, 217, D - 4, 0xffc21c, 0.25);                               // 통로 노란 선
  for (let i = 0; i < 3; i++) { const p = kit.tube(0, 0, 0, 2.2, W, kit.mat(0x7a858f)); p.rotation.z = Math.PI / 2; p.position.set(W / 2, H - 5 - i * 4.4, 38 + i * 76); }
  for (let i = 0; i < 3; i++) { const p = kit.tube(0, 0, 0, 0.9, D, kit.glow(0x35d9e6, 0.9)); p.rotation.x = Math.PI / 2; p.position.set(60 + i * 105, H - 11, D / 2); }
  for (let i = 0; i < 6; i++) panel(kit, 40 + i * 50, 110, 20, 5, H, 0xfff0c0);
  kit.light(0xcfe6ff, 1.2, 80, H - 8, 90, 240); kit.light(0xcfe6ff, 1.1, 250, H - 8, 180, 240); const wl = kit.light(0xff7a2a, 1.4, 255, 46, 200, 180); kit.anim.push(t => { wl.intensity = 0.4 + 1.0 * Math.abs(Math.sin(t * 2.2)); });
  kit.sign('#7fd8ff', bm.sign, 165, 56, 1, 62);
  for (let i = 0; i < 5; i++) { const t = kit.tube(212 + i * 9, 0, 240, 3, 7.5, kit.mat(0x52d9ff, 0x1a7fa8, 1)); t.rotation.y = i; }                 // 크리스탈 용기
  for (let i = 0; i < 5; i++) kit.tube(292 + (i % 3) * 9, 0, 236 + Math.floor(i / 3) * 10, 3.6, 12, kit.mat([0xd9591c, 0x2a5fa8, 0xd9591c, 0x6a6f75, 0x2a5fa8][i]));      // 드럼통
  kit.box(0, 20, 130, 1.4, 54, 170, kit.mat(0x23303c, 0x2fd6ff, 0.5));                                                                          // 벽 계기판
  for (let i = 0; i < 4; i++) kit.tube(1.4 + 0.2, 28 + (i % 2) * 14, 138 + Math.floor(i / 2) * 20 + 4, 4, 0.8, kit.glow([0x7dffb0, 0xffc21c][i % 2], 0.8)).rotation.z = Math.PI / 2;
  kit.tube(4, 0, 190, 2, 10, kit.mat(0xd01818)); kit.box(1.4, 8, 188, 3.4, 12, 192, kit.mat(0x111));                                               // 소화기
  kit.sign('#ffc21c', 'DANGER', W - 1, 50, 120, 34, -Math.PI / 2);
};

const casino: Decor = (c) => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  for (const [x, z] of [[85, 120], [245, 120], [165, 200]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 1.1, 8, 24), kit.mat(0xd9a82c, 0x6a4a00, 0.8)); kit.own(ring.geometry); ring.rotation.x = Math.PI / 2; ring.position.set(x, H - 10, z); kit.scene.add(ring);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; kit.box(x + Math.cos(a) * 13 - 0.9, H - 13.5, z + Math.sin(a) * 13 - 0.9, x + Math.cos(a) * 13 + 0.9, H - 10, z + Math.sin(a) * 13 + 0.9, kit.glow(0xffe9a8)); }
    kit.tube(x, H - 10, z, 0.5, 10, kit.mat(0xd9a82c));
  }
  const l1 = kit.light(0xffd9a0, 2.0, 165, H - 12, 120, 300); kit.light(0xff9a60, 1.2, 70, H - 14, 220, 200); kit.light(0xff9a60, 1.2, 260, H - 14, 220, 200); kit.anim.push(t => { l1.intensity = 1.9 + Math.sin(t * 1.7) * 0.15; });
  kit.sign('#ffd84a', '777', 165, 56, 1, 70);
  for (const x of [50, 82, 248, 280]) kit.box(x, 0, 0.6, x + 2.2, H, 2.6, kit.mat(0xd9a82c, 0x6a4a00, 0.5));                                      // 벽 금장
  kit.box(1, 34, 70, 2.4, 36, 260, kit.glow(0xffd24a)); kit.box(W - 2.4, 34, 70, W - 1, 36, 260, kit.glow(0xffd24a));
  kit.sign('#ff9a3c', 'SLOTS', 1.4, 52, 138, 44, Math.PI / 2); kit.sign('#ff9a3c', 'SLOTS', W - 1.4, 52, 138, 44, -Math.PI / 2);
  decal(kit, W / 2 - 22, 60, W / 2 + 22, D - 4, 0x2a0a0e, 0.3);                                                                                    // 중앙 카펫
  // 환전 창구 철창과 안내판
  const [cx0, cx1, cz] = [110, 222, 36]; for (let i = 0; i <= 14; i++) kit.box(cx0 + i * (cx1 - cx0) / 14 - 0.3, 23.4, cz - 0.3, cx0 + i * (cx1 - cx0) / 14 + 0.3, 46, cz + 0.3, kit.mat(0xd8b24a, 0x6a4a00, 0.5));
  kit.box(cx0 - 1, 46, cz - 1, cx1 + 1, 48, cz + 1, kit.mat(0xd8b24a, 0x6a4a00, 0.5)); kit.sign('#ffe9a8', 'CASHIER', 166, 53, cz - 1.5, 38);
  for (const [x, z] of [[117, 173], [215, 173]]) { kit.tube(x, 19.4, z, 5, 0.5, kit.mat(0xd8b24a)); kit.box(x - 0.3, H - 18, z - 0.3, x + 0.3, H, z + 0.3, kit.mat(0x333)); kit.tube(x, H - 26, z, 4, 8, kit.glow(0xffe9a8, 0.9)); }
};

const bank: Decor = (c) => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  // 금고문(안쪽 벽 가운데)
  const vault = new THREE.Group(); vault.position.set(165, 34, 7);
  const dsk = new THREE.Mesh(kit.cyl, kit.mat(0x8c939b)); dsk.scale.set(23, 5, 23); dsk.rotation.x = Math.PI / 2; vault.add(dsk);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(23, 2, 8, 28), kit.mat(0xc9a227, 0x3a2b00, 0.5)); kit.own(rim.geometry); vault.add(rim);
  const hub = new THREE.Mesh(kit.cyl, kit.mat(0xc9a227)); hub.scale.set(4.4, 7, 4.4); hub.rotation.x = Math.PI / 2; vault.add(hub); for (let i = 0; i < 3; i++) { const sp = kit.box(-1.4, -16, 3, 1.4, 16, 5, kit.mat(0xc9a227), vault); sp.rotation.z = i * Math.PI / 3; }
  kit.scene.add(vault);
  // 대여 금고 벽(황동 문 격자)
  const deposit = kit.tex(256, 128, g => { g.fillStyle = '#2a2622'; g.fillRect(0, 0, 256, 128); for (let r = 0; r < 6; r++) for (let q = 0; q < 12; q++) { g.fillStyle = (r + q) % 3 ? '#b8923a' : '#c9a85a'; g.fillRect(3 + q * 21, 3 + r * 21, 18, 18); g.fillStyle = '#4a3a14'; g.beginPath(); g.arc(12 + q * 21, 12 + r * 21, 2.2, 0, 6.29); g.fill(); } });
  kit.plane(86, 43, deposit, 62, 28, 1.2, 0, false); kit.plane(86, 43, deposit, 268, 28, 1.2, 0, false);
  kit.box(0, 46, 0, W, 48, 1.6, kit.mat(0xc9a227)); kit.sign('#e8d28a', 'BANK', 62, 58, 1, 56); kit.sign('#e8d28a', 'BANK', 268, 58, 1, 56);
  for (const x of [75, 165, 255]) { kit.box(x - 0.2, H - 20, 130 - 0.2, x + 0.2, H, 130 + 0.2, kit.mat(0x222222)); kit.tube(x, H - 25, 130, 6, 5, kit.mat(0x1f6b45, 0x1f6b45, 0.5)); kit.light(0xffe9b8, 1.1, x, H - 26, 130, 250); }
  for (const z of [50, 120, 190]) for (const x of [75, 165, 255]) panel(kit, x, z, 30, 7, H, 0xfff3d6, 0.9);
  decal(kit, W / 2 - 24, 100, W / 2 + 24, D - 4, 0x7a1c1c, 0.3); decal(kit, W / 2 - 25, 100, W / 2 - 24, D - 4, 0xc9a227, 0.31); decal(kit, W / 2 + 24, 100, W / 2 + 25, D - 4, 0xc9a227, 0.31);
  // 놋쇠 줄 서기 기둥
  const post = (x: number, z: number): void => { kit.tube(x, 0, z, 1.6, 0.6, kit.mat(0xc9a227)); kit.tube(x, 0.6, z, 0.5, 15, kit.mat(0xc9a227)); kit.sphere(x, 16, z, 1, kit.mat(0xc9a227)); };
  for (const x of [128, 202]) { post(x, 104); post(x, 144); kit.box(x - 0.3, 12, 104, x + 0.3, 13, 144, kit.mat(0x8a1c2a)); }
  for (const x of [28, 302]) { kit.tube(x, 0, 240, 3.4, 5.5, kit.mat(0xb5651d)); for (const [dx, dy, r] of [[0, 14, 7], [-3, 11, 5], [3, 10, 5.5]]) kit.sphere(x + dx, 6 + dy, 240, r, kit.mat(0x2f8f4e)); }    // 화분
  const clock = kit.tex(64, 64, g => { g.fillStyle = '#f1ece0'; g.beginPath(); g.arc(32, 32, 30, 0, 6.29); g.fill(); g.strokeStyle = '#2a2a2a'; g.lineWidth = 4; g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(32, 32); g.lineTo(32, 12); g.moveTo(32, 32); g.lineTo(46, 38); g.stroke(); });
  kit.plane(14, 14, clock, W - 0.8, 52, 130, -Math.PI / 2, false);
  kit.box(W - 1.2, 8, 200, W - 0.2, 40, 218, kit.mat(0xd9dedd)); kit.box(W - 0.2, 22, 202, W + 0.2, 32, 216, kit.glow(0x7dffb0, 0.9));                                                            // ATM
};

const gunshop: Decor = (c) => {
  const { kit, lay } = c, { w: W, d: D, h: H } = lay;
  // 안쪽 벽 퍼그보드와 벽걸이 총
  const peg = kit.tex(64, 64, g => { g.fillStyle = '#7a6858'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4a3c30'; for (let y = 8; y < 64; y += 16) for (let x = 8; x < 64; x += 16) { g.beginPath(); g.arc(x, y, 2.4, 0, 6.29); g.fill(); } }, [(W - 24) / 14, 48 / 14]);
  kit.plane(W - 24, 48, peg, W / 2, 36, 1.5, 0, false);
  const guns: { x: number; y: number; z: number }[] = []; for (let r = 0; r < 2; r++) for (let i = 0; i < 11; i++) guns.push({ x: 38 + i * 25, y: (r ? 28 : 44) + (i % 2) * 1.5, z: 2.2 }); hangGuns(c, guns.map((g, i) => ({ ...g, y: g.y + (i % 6 === 4 ? 2 : 0) })), 0.62, 0);
  kit.box(12, 10, 0, W - 12, 11.6, 2.6, kit.glow(0xff3b30, 0.7)); kit.sign('#ff5d5d', 'GUNS', 165, 58, 0.8, 66);
  // 양 옆 벽 총기 전시
  hangGuns(c, [0, 1, 2, 3].map(i => ({ x: 1.6, y: 36 + (i % 2) * 7, z: 110 + i * 38 })), 0.7, Math.PI / 2); hangGuns(c, [0, 1, 2, 3].map(i => ({ x: W - 1.6, y: 36 + (i % 2) * 7, z: 110 + i * 38 })), 0.7, -Math.PI / 2);
  const tgt = kit.tex(64, 96, g => { g.fillStyle = '#f2ead0'; g.fillRect(0, 0, 64, 96); for (const r of [28, 18, 8]) { g.beginPath(); g.arc(32, 48, r, 0, 6.29); g.fillStyle = r === 18 ? '#f2ead0' : '#c92a2a'; g.fill(); } });
  kit.plane(16, 24, tgt, 0.8, 40, 96, Math.PI / 2, false); kit.plane(16, 24, tgt, W - 0.8, 40, 94, -Math.PI / 2, false); kit.plane(16, 24, tgt, 0.8, 40, 238, Math.PI / 2, false);
  const rl = kit.light(0xff3b30, 1.5, 165, H - 14, 60, 240), wl = kit.light(0xffd9a0, 1.8, 165, H - 10, 170, 300); kit.light(0xffe0b8, 1.4, 70, H - 10, 120, 240); kit.light(0xffe0b8, 1.4, 260, H - 10, 120, 240); kit.anim.push(t => { rl.intensity = 1.3 + Math.sin(t * 6) * 0.15 * (Math.sin(t * 0.7) > 0.8 ? 3 : 0.5); void wl; });
  for (const x of [80, 250]) { kit.box(x - 0.2, H - 16, 100 - 0.2, x + 0.2, H, 100 + 0.2, kit.mat(0x222222)); kit.tube(x, H - 20, 100, 4.4, 4, kit.glow(0xffc47a)); }
  for (const x of [60, 165, 270]) panel(kit, x, 140, 28, 6, H, 0xffe6c0, 0.7);
  for (let i = 0; i < 5; i++) kit.tube(236 + (i % 3) * 9, 0, 244 + Math.floor(i / 3) * 6, 4.2, 4, kit.mat(0x7a6a4a));                                                            // 모래주머니
  decal(kit, 36, 232, 100, 250, 0x2f2a26, 0.3);
  void D; void PALETTE;
};

export const DECOR: Record<BizKind, Decor> = { store, club, plant, casino, bank, gunshop };
