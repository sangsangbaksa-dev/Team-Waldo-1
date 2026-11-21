// ZERO ZONE — 소품 모델: 건물 지붕, 차량, 컨테이너, 울타리, 전봇대, 주유소 같은 지도 위 물건과 보급 상자·총기 파츠 모양을 코드로 만듭니다.
// 같은 색끼리 하나의 메시로 합쳐서(Pieces) 소품이 수백 개여도 그리기 호출은 수십 번에 머뭅니다.
import * as THREE from 'three';
import type { PartId } from './config';
import type { Building, GameMap, Prop } from './world';

import { CYL, GLASS, BLACK, STEEL, RED, Pieces, shade, xf } from '../shared/pieces';
import { vehicle, makeVehicleMesh } from '../shared/vehicle';
export { Pieces, xf, makeVehicleMesh };

// ---------- 소품 한 개 ----------
function prop(p: Pieces, pr: Prop): void {
  const base = xf(pr.x, 0, pr.z, 0, pr.ry + pr.jit, 0), b = (sx: number, sy: number, sz: number, col: number, x: number, y: number, z: number, tr = false): void => p.box(sx, sy, sz, col, base, x, y, z, tr);
  const add = (geo: THREE.BufferGeometry, col: number, m: THREE.Matrix4, tr = false): void => p.add(geo, col, base.clone().multiply(m), tr);
  switch (pr.kind) {
    case 'car': case 'jeep': case 'truck': case 'van': case 'bus': vehicle(p, pr, base); break;
    case 'container': {
      const y = pr.v * 2.6; b(pr.w, 2.6, pr.d, pr.c, 0, y + 1.3, 0);
      for (let i = -5; i <= 5; i++) for (const s of [-1, 1]) b(0.08, 2.4, 0.07, shade(pr.c, 0.72), (i / 5) * (pr.w / 2 - 0.2), y + 1.3, s * (pr.d / 2 + 0.02));
      b(0.1, 2.5, pr.d - 0.1, shade(pr.c, 0.62), pr.w / 2 + 0.02, y + 1.3, 0); b(0.12, 2.3, 0.06, STEEL, pr.w / 2 + 0.06, y + 1.3, 0.35); b(0.12, 2.3, 0.06, STEEL, pr.w / 2 + 0.06, y + 1.3, -0.35);
      break;
    }
    case 'barrel': add(CYL(0.31, 0.95, 12), pr.c, xf(0, 0.475, 0)); for (const y of [0.25, 0.7]) add(new THREE.CylinderGeometry(0.325, 0.325, 0.05, 12), shade(pr.c, 0.7), xf(0, y, 0)); break;
    case 'hay': add(CYL(0.7, 1.5, 14), pr.c, xf(0, 0.7, 0, 0, 0, Math.PI / 2)); add(CYL(0.62, 1.52, 14), shade(pr.c, 0.86), xf(0, 0.7, 0, 0, 0, Math.PI / 2)); break;
    case 'pole': add(CYL(0.14, pr.h, 8), pr.c, xf(0, pr.h / 2, 0)); b(0.12, 0.12, 2.2, pr.c, 0, pr.h - 0.7, 0); b(0.12, 0.12, 1.6, pr.c, 0, pr.h - 1.5, 0); for (const z of [-0.95, 0, 0.95]) add(CYL(0.05, 0.22, 6), 0xc8cdd0, xf(0, pr.h - 0.55, z)); break;
    case 'tank': {
      const r = pr.w / 2, legH = pr.h - 2.8; for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(CYL(0.12, legH, 6), STEEL, xf(sx * pr.w * 0.36, legH / 2, sz * pr.w * 0.36));
      b(pr.w * 0.8, 0.12, 0.12, STEEL, 0, legH * 0.55, 0); add(CYL(r, 2.2, 16), pr.c, xf(0, legH + 1.1, 0)); add(new THREE.ConeGeometry(r, 0.7, 16), shade(pr.c, 0.85), xf(0, legH + 2.55, 0)); break;
    }
    case 'tent': add(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).scale(pr.w / 1.4142, pr.h, pr.d / 1.4142).translate(0, pr.h / 2, 0), pr.c, new THREE.Matrix4()); b(pr.w * 0.92, 0.12, pr.d * 0.92, shade(pr.c, 0.6), 0, 0.06, 0); break;
    case 'sandbag': b(pr.w, 0.52, pr.d, pr.c, 0, 0.26, 0); b(pr.w * 0.86, 0.5, pr.d * 0.92, shade(pr.c, 0.9), 0, 0.77, 0); for (let i = -1; i <= 1; i++) b(0.04, 0.5, pr.d + 0.02, shade(pr.c, 0.7), i * pr.w * 0.3, 0.26, 0); break;
    case 'dumpster': b(pr.w, 0.95, pr.d, pr.c, 0, 0.7, 0); b(pr.w + 0.05, 0.1, pr.d + 0.08, shade(pr.c, 0.6), 0, 1.22, 0); for (const sx of [-0.8, 0.8]) add(CYL(0.1, 0.1, 8), BLACK, xf(sx, 0.1, 0, Math.PI / 2)); break;
    case 'canopy': {
      b(pr.w, 0.4, pr.d, pr.c, 0, pr.h, 0); b(pr.w + 0.1, 0.12, pr.d + 0.1, 0xe8e8e0, 0, pr.h - 0.26, 0); b(pr.w - 0.4, 0.06, pr.d - 0.4, 0xfff4cf, 0, pr.h - 0.34, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(CYL(0.22, pr.h, 10), 0xe0e0d8, xf(sx * (pr.w / 2 - 0.6), pr.h / 2, sz * (pr.d / 2 - 0.6)));
      break;
    }
    case 'pump': b(pr.w, 0.16, pr.d + 0.5, 0x9a9a92, 0, 0.08, 0); for (const sx of [-0.55, 0.55]) { b(0.5, 1.3, 0.42, pr.c, sx, 0.8, 0); b(0.46, 0.4, 0.44, GLASS, sx, 1.0, 0); b(0.52, 0.12, 0.5, RED, sx, 1.5, 0); } break;
    case 'barrier': { b(pr.w, 0.35, pr.d, pr.c, 0, 0.175, 0); b(pr.w - 0.1, 0.5, pr.d * 0.55, pr.c, 0, 0.6, 0); b(pr.w - 0.2, 0.3, pr.d * 0.3, pr.c, 0, 0.95, 0); b(pr.w * 0.9, 0.06, pr.d * 0.7, 0xc9c3a0, 0, 0.5, 0); break; }
    case 'ruin': { const L = pr.w; b(L, pr.h * 0.55, pr.d, pr.c, 0, pr.h * 0.275, 0); b(L * 0.55, pr.h * 0.45, pr.d, shade(pr.c, 0.92), -L * 0.2, pr.h * 0.775, 0); if (pr.v > 0) b(L * 0.22, pr.h * 0.25, pr.d, shade(pr.c, 0.85), L * 0.3, pr.h * 0.65, 0); b(L * 0.3, 0.18, 0.9, 0x7a7468, L * 0.55, 0.09, 0.3); break; }
    case 'stonewall': { b(pr.w, 0.55, pr.d, pr.c, 0, 0.275, 0); b(pr.w - 0.08, 0.45, pr.d * 0.82, shade(pr.c, 1.08), 0, 0.75, 0); for (let i = -2; i <= 2; i++) b(0.05, 0.55, pr.d + 0.02, shade(pr.c, 0.72), i * pr.w * 0.2, 0.28, 0); b(pr.w, 0.1, pr.d * 0.9, shade(pr.c, 0.8), 0, 1.05, 0); break; }
    case 'stump': add(CYL(pr.w / 2, pr.h, 10), pr.c, xf(0, pr.h / 2, 0)); add(CYL(pr.w * 0.47, 0.04, 10), 0xc7a77a, xf(0, pr.h + 0.01, 0)); add(new THREE.ConeGeometry(pr.w * 0.62, 0.5, 8), shade(pr.c, 0.8), xf(0, 0.2, 0)); break;
    case 'log': add(CYL(pr.d / 2, pr.w, 10), pr.c, xf(0, pr.d / 2, 0, 0, 0, Math.PI / 2)); add(CYL(pr.d * 0.42, pr.w + 0.02, 10), shade(pr.c, 1.2), xf(0, pr.d / 2, 0, 0, 0, Math.PI / 2)); b(0.5, 0.3, 0.1, pr.c, pr.w * 0.2, 0.6, 0.35); break;
    case 'rubble': { b(pr.w, 0.45, pr.d, pr.c, 0, 0.225, 0); b(pr.w * 0.7, 0.4, pr.d * 0.6, shade(pr.c, 0.88), 0.2, 0.62, 0); b(pr.w * 0.35, 0.35, pr.d * 0.4, shade(pr.c, 1.1), -0.3, 0.95, 0.1); b(0.9, 0.3, 0.3, 0x5b5750, pr.w * 0.3, 0.2, pr.d * 0.45); b(0.14, 1.1, 0.14, 0x6b3a2a, -pr.w * 0.25, 0.95, -0.2); break; }
    case 'pallet': { b(pr.w, 0.16, pr.d, 0x7b5d38, 0, 0.08, 0); b(pr.w - 0.1, 1.1, pr.d - 0.1, pr.c, 0, 0.72, 0); b(pr.w - 0.1, 0.06, 0.06, 0x3a3a3a, 0, 0.9, pr.d / 2 - 0.02); b(pr.w - 0.1, 0.06, 0.06, 0x3a3a3a, 0, 0.5, pr.d / 2 - 0.02); break; }
    case 'fence': {
      const L = pr.w, wood = pr.v === 0;
      for (const x of [-L / 2 + 0.06, L / 2 - 0.06]) b(0.12, 1.3, 0.12, wood ? 0x6f5436 : STEEL, x, 0.65, 0);
      if (wood) { for (const y of [0.45, 0.95]) b(L, 0.1, 0.06, pr.c, 0, y, 0); b(0.1, 0.7, 0.07, pr.c, 0, 0.7, 0); }
      else { b(L, 0.05, 0.05, STEEL, 0, 1.28, 0); b(L, 0.05, 0.05, STEEL, 0, 0.05, 0); b(L, 1.2, 0.02, 0xaab0b4, 0, 0.66, 0, true); }
      break;
    }
    default: break;
  }
}

// ---------- 지붕 ----------
const ROOF_COLORS = [0x9a4a35, 0x4d5560, 0x6b5239, 0x7a2f26];
function prism(span: number, ph: number, len: number, shed: boolean): THREE.BufferGeometry {
  const s = new THREE.Shape(); s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); if (shed) { s.lineTo(span / 2, ph); s.lineTo(-span / 2, ph * 0.25); } else s.lineTo(0, ph); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); return g;
}
function roof(p: Pieces, bd: Building, rng: () => number): void {
  const { x, z, w, d, h } = bd, base = xf(x, 0, z), sizeLong = Math.max(w, d), alongX = w >= d;
  if (bd.roof === 'flat') {
    const tall = bd.type === 'tower', par = tall ? 1.1 : 0.5, col = bd.type === 'bunker' ? 0x6f7268 : 0x4d5258;
    p.box(w + 0.7, 0.35, d + 0.7, col, base, 0, h + 0.175, 0);
    for (const [sw, sd, ox, oz] of [[w + 0.7, 0.3, 0, (d + 0.7) / 2], [w + 0.7, 0.3, 0, -(d + 0.7) / 2], [0.3, d + 0.7, (w + 0.7) / 2, 0], [0.3, d + 0.7, -(w + 0.7) / 2, 0]] as const) p.box(sw, par, sd, 0x8b8f93, base, ox, h + 0.35 + par / 2, oz);
    if (bd.type === 'apartment' || bd.type === 'shop') {
      if (rng() < 0.85) p.box(1.4, 0.9, 1.1, 0xb6babd, base, (rng() - 0.5) * w * 0.5, h + 0.8, (rng() - 0.5) * d * 0.5);
      p.box(0.9, 0.7, 0.9, 0xa5a9ac, base, (rng() - 0.5) * w * 0.4, h + 0.7, (rng() - 0.5) * d * 0.4);
      if (bd.type === 'shop') p.box(Math.min(5, w * 0.5), 1.1, 0.2, [0xc9302c, 0x2f6aa0, 0x2f7a4a, 0xd0a02c][bd.tex % 4], base, 0, h + 0.9, d / 2 + 0.2);
    }
    if (tall) { p.add(CYL(0.08, 3, 6), 0x5a5a5e, base.clone().multiply(xf(w * 0.25, h + 2, d * 0.25))); p.box(1.6, 0.5, 0.5, 0x3b3f44, base, -w * 0.15, h + 0.65, 0); }
    if (bd.type === 'bunker') p.box(w - 1, 0.4, d - 1, 0x58705a, base, 0, h + 0.5, 0);
    if (bd.type === 'clinic') { p.box(2.6, 0.12, 0.8, 0xc9302c, base, 0, h + 0.42, 0); p.box(0.8, 0.12, 2.6, 0xc9302c, base, 0, h + 0.42, 0); p.box(1.4, 0.9, 1.1, 0xb6babd, base, w * 0.3, h + 0.8, d * 0.25); }
    if (bd.type === 'silo') { for (const y of [0.25, 0.5, 0.75]) p.box(w + 0.3, 0.18, d + 0.3, 0x9aa0a4, base, 0, h * y, 0); p.box(w * 0.7, 1.1, d * 0.7, 0xb8bcc0, base, 0, h + 0.85, 0); p.box(w * 0.4, 0.8, d * 0.4, 0x9aa0a4, base, 0, h + 1.8, 0); }
  } else {
    const shed = bd.roof === 'shed', span = (alongX ? d : w) + 0.9, long = sizeLong + 0.9, ph = shed ? 0.9 : Math.min(2.6, span * (bd.type === 'warehouse' || bd.type === 'hangar' ? 0.16 : bd.type === 'church' ? 0.5 : 0.3));
    const col = bd.type === 'warehouse' || bd.type === 'hangar' ? 0x7d8b95 : bd.type === 'barn' ? 0x4a4a4e : shed ? 0x6a6e72 : ROOF_COLORS[bd.tex % ROOF_COLORS.length];
    // 압출은 z 방향이 길이 방향: 긴 변이 x 면 90도 돌립니다
    p.add(prism(span, ph, long, shed), col, base.clone().multiply(xf(0, h, 0, 0, alongX ? Math.PI / 2 : 0, 0)));
    if (!shed) p.box(alongX ? long : 0.3, 0.12, alongX ? 0.3 : long, shade(col, 0.7), base, 0, h + ph + 0.04, 0);
    if (bd.type === 'house' && rng() < 0.5) p.box(0.7, 1.6, 0.7, 0x7a5a48, base, w * 0.2, h + ph * 0.6 + 0.6, d * (rng() < 0.5 ? 0.15 : -0.15));
    if (bd.type === 'church') { // 종탑과 십자가
      const col2 = 0xd8d2c0, tz = (alongX ? 0 : d * 0.32), tx = alongX ? w * 0.32 : 0;
      p.box(2.6, 4.6, 2.6, col2, base, tx, h + 2.3, tz); p.box(3.1, 0.3, 3.1, 0x4d5560, base, tx, h + 4.75, tz); p.box(0.18, 1.6, 0.18, 0xe8dcc6, base, tx, h + 5.7, tz); p.box(0.9, 0.18, 0.18, 0xe8dcc6, base, tx, h + 5.9, tz);
    }
    if (bd.type === 'diner') p.box(Math.min(4.5, w * 0.5), 0.9, 0.2, [0xc9302c, 0x2f6aa0][bd.tex % 2], base, 0, h + 1.2, d / 2 + 0.2);
    if (bd.type === 'warehouse' || bd.type === 'hangar') for (let i = -2; i <= 2; i++) p.box(alongX ? 0.25 : span, 0.08, alongX ? span : 0.25, shade(col, 0.82), base, alongX ? i * long * 0.2 : 0, h + ph * 0.5 + 0.1, alongX ? 0 : i * long * 0.2);
  }
}
/** 건물 지붕과 장식: 한 번에 합쳐서 돌려줍니다. */
export function buildRoofs(map: GameMap, rng: () => number): THREE.Group { const p = new Pieces(); for (const b of map.buildings) roof(p, b, rng); return p.mesh(); }
/** 지도의 소품(차량·컨테이너·울타리 등)을 합쳐서 돌려줍니다. */
export function buildProps(map: GameMap, skipBoxes?: Set<number>): THREE.Group { const p = new Pieces(); for (const pr of map.props) if (pr.kind !== 'bush' && !(skipBoxes && pr.box !== undefined && skipBoxes.has(pr.box))) prop(p, pr); return p.mesh(); }


// ---------- 보급 상자와 비행기 ----------
export function makeDropCrate(): THREE.Group {
  const g = new THREE.Group(), red = new THREE.MeshLambertMaterial({ color: 0xc03a2b, emissive: 0x3a0a06 }), band = new THREE.MeshLambertMaterial({ color: 0xf0e8d2 });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 1.7), red); crate.position.y = 0.6; crate.castShadow = true; g.add(crate);
  for (const [sx, sy, sz, x, y, z] of [[1.74, 0.18, 1.74, 0, 0.6, 0], [0.18, 1.24, 1.74, 0, 0.6, 0], [1.74, 1.24, 0.18, 0, 0.6, 0]] as const) { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), band); m.position.set(x, y, z); g.add(m); }
  const chute = new THREE.Group(); chute.name = 'chute';
  const cm = [new THREE.MeshLambertMaterial({ color: 0xe6e2d6, side: THREE.DoubleSide }), new THREE.MeshLambertMaterial({ color: 0xc03a2b, side: THREE.DoubleSide })];
  for (let i = 0; i < 8; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(3.6, 4, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2), cm[i % 2]); seg.position.y = 6.6; chute.add(seg); }
  const lines: number[] = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; lines.push(Math.cos(a) * 0.5, 1.2, Math.sin(a) * 0.5, Math.cos(a) * 3.6, 6.6, Math.sin(a) * 3.6); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)); chute.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
  g.add(chute); return g;
}
export function makePlane(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x657079, roughness: 0.68, metalness: 0.48 });
  const upper = new THREE.MeshStandardMaterial({ color: 0x849097, roughness: 0.62, metalness: 0.38 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x28343b, roughness: 0.72, metalness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x183441, roughness: 0.18, metalness: 0.65, emissive: 0x081821 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xb5bec0, roughness: 0.56, metalness: 0.45 });
  const light = (color: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  const cylinder = (r1: number, r2: number, length: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = add(new THREE.CylinderGeometry(r1, r2, length, 16), mat, x, y, z); m.rotation.z = -Math.PI / 2; return m;
  };
  // The profiles keep the large aircraft readable from both the chase camera and the ground.
  const profile = [[0, 0], [1.1, 0], [1.55, 1.4], [1.72, 4], [1.72, 17], [1.5, 20], [0.72, 22], [0, 22.5]].map(([r, x]) => new THREE.Vector2(r, x - 11));
  const fuselage = add(new THREE.LatheGeometry(profile, 24), body, 0, 0, 0); fuselage.rotation.z = -Math.PI / 2;
  const belly = add(new THREE.BoxGeometry(15, 0.35, 2.7), dark, -1, -1.35, 0); belly.rotation.z = -0.025;
  const cockpit = add(new THREE.SphereGeometry(1, 16, 10), glass, 9.15, 0.92, 0); cockpit.scale.set(2.15, 0.72, 1.3);
  for (const z of [-0.67, 0, 0.67]) { const bar = add(new THREE.BoxGeometry(2.5, 0.08, 0.07), pale, 9.1, 1.46, z); bar.rotation.z = -0.14; }
  for (const x of [-7.5, -4, -0.5, 3, 6.5]) {
    const ring = add(new THREE.TorusGeometry(1.72, 0.035, 5, 24), dark, x, 0, 0); ring.rotation.y = Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    for (let x = -7; x <= 5; x += 3) {
      const window = add(new THREE.BoxGeometry(0.72, 0.42, 0.08), glass, x, 0.48, side * 1.65);
      window.rotation.x = side * 0.12;
    }
    const wing = add(new THREE.BoxGeometry(5.2, 0.42, 16), upper, 0.5, 0.8, side * 8.4); wing.rotation.y = side * 0.10; wing.rotation.x = side * 0.035;
    const flap = add(new THREE.BoxGeometry(0.55, 0.12, 13), dark, -2.1, 0.72, side * 8.6); flap.rotation.y = side * 0.1;
    const tip = add(new THREE.BoxGeometry(2.6, 0.35, 0.55), pale, 0, 1.15, side * 16.4); tip.rotation.z = -0.08;
    add(new THREE.SphereGeometry(0.18, 8, 6), light(side < 0 ? 0xff5550 : 0x65ff91), 1.2, 1.1, side * 16.5);
    const tail = add(new THREE.BoxGeometry(3.4, 0.24, 5.8), upper, -9, 1.0, side * 3.2); tail.rotation.y = side * 0.2;
    for (const z of [side * 5.2, side * 10.6]) {
      cylinder(0.8, 0.92, 4.1, body, 2.7, 0.25, z);
      cylinder(0.74, 0.74, 0.16, dark, 4.83, 0.25, z);
      cylinder(0.25, 0.36, 0.55, pale, 5.05, 0.25, z);
      const prop = new THREE.Group(); prop.name = 'propeller'; prop.position.set(5.36, 0.25, z); g.add(prop);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), dark); prop.add(hub);
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.65, 0.24), dark);
        blade.position.set(0, Math.cos(i * Math.PI / 2) * 0.9, Math.sin(i * Math.PI / 2) * 0.9); blade.rotation.x = i * Math.PI / 2; prop.add(blade);
        const marking = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.25), pale);
        marking.position.set(0, Math.cos(i * Math.PI / 2) * 1.62, Math.sin(i * Math.PI / 2) * 1.62); marking.rotation.x = i * Math.PI / 2; prop.add(marking);
      }
    }
  }
  const fin = add(new THREE.BoxGeometry(4.2, 4.2, 0.35), body, -9.5, 2.8, 0); fin.rotation.z = -0.2;
  add(new THREE.BoxGeometry(1.1, 2.8, 0.38), upper, -11, 2.9, 0).rotation.z = -0.2;
  add(new THREE.SphereGeometry(0.2, 8, 6), light(0xff5550), -10.6, 5.0, 0);
  g.scale.setScalar(1.15); return g;
}

// ---------- 총기 파츠 ----------
/** 총 앞쪽이 +x. muzzle 은 총구의 x 좌표. 소음기·조준경·손잡이·탄창을 총 모델 좌표계에 맞춰 만듭니다. */
export function partMesh(part: PartId, muzzle: number): THREE.Object3D {
  const g = new THREE.Group(), dark = new THREE.MeshLambertMaterial({ color: 0x1d1f22 }), mid = new THREE.MeshLambertMaterial({ color: 0x3a3e44 }), glass = new THREE.MeshBasicMaterial({ color: 0x6fd0ff }), dot = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const cyl = (r: number, len: number, mat: THREE.Material, x: number, y: number, z = 0): THREE.Mesh => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); return m; };
  const box = (sx: number, sy: number, sz: number, mat: THREE.Material, x: number, y: number, z = 0): THREE.Mesh => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); return m; };
  switch (part) {
    case 'suppressor': g.add(cyl(0.05, 0.3, dark, muzzle + 0.1, 0.05)); g.add(cyl(0.056, 0.03, mid, muzzle - 0.04, 0.05)); break;
    case 'comp': g.add(cyl(0.04, 0.1, mid, muzzle + 0.02, 0.05)); for (const dx of [-0.02, 0.03]) g.add(box(0.012, 0.1, 0.1, dark, muzzle + dx, 0.05)); break;
    case 'reddot': g.add(box(0.12, 0.02, 0.07, dark, muzzle * 0.42, 0.13)); g.add(box(0.1, 0.08, 0.012, glass, muzzle * 0.42, 0.18, 0.03)); g.add(box(0.1, 0.08, 0.012, glass, muzzle * 0.42, 0.18, -0.03)); g.add(box(0.012, 0.012, 0.012, dot, muzzle * 0.42, 0.18)); break;
    case 'scope2': g.add(cyl(0.04, 0.26, dark, muzzle * 0.42, 0.17)); g.add(cyl(0.05, 0.06, mid, muzzle * 0.42 + 0.14, 0.17)); g.add(cyl(0.05, 0.06, mid, muzzle * 0.42 - 0.14, 0.17)); g.add(box(0.05, 0.05, 0.05, mid, muzzle * 0.42, 0.12)); break;
    case 'scope4': g.add(cyl(0.05, 0.4, dark, muzzle * 0.42, 0.18)); g.add(cyl(0.065, 0.09, mid, muzzle * 0.42 + 0.22, 0.18)); g.add(cyl(0.058, 0.07, mid, muzzle * 0.42 - 0.2, 0.18)); g.add(cyl(0.052, 0.005, glass, muzzle * 0.42 + 0.27, 0.18)); g.add(box(0.05, 0.06, 0.05, mid, muzzle * 0.42 + 0.08, 0.12)); g.add(box(0.05, 0.06, 0.05, mid, muzzle * 0.42 - 0.08, 0.12)); break;
    case 'grip': { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.13, 8), dark); v.position.set(muzzle * 0.66, -0.07, 0); g.add(v); g.add(box(0.07, 0.02, 0.05, mid, muzzle * 0.66, -0.005)); break; }
    case 'extmag': { const m = box(0.075, 0.26, 0.06, new THREE.MeshLambertMaterial({ color: 0x4a5236 }), muzzle * 0.36, -0.2); m.rotation.z = 0.12; g.add(m); g.add(box(0.08, 0.02, 0.065, dark, muzzle * 0.36 - 0.03, -0.335)); break; }
  }
  return g;
}
