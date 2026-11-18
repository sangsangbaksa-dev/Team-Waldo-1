// FRONTLINE — 유닛·건물·자원 3D 모델. 별도 에셋 파일 없이 기본 도형을 조립합니다(원점은 발밑/바닥 중심).
import * as THREE from 'three';
import { BUILDINGS, TEAM_COLORS, type BuildKind, type UnitKind } from './config';

const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.25, flatShading: true, ...o });

export interface Mats {
  team: THREE.MeshStandardMaterial; teamDark: THREE.MeshStandardMaterial; glow: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial; steel: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; skin: THREE.MeshStandardMaterial; hull: THREE.MeshStandardMaterial; concrete: THREE.MeshStandardMaterial;
}
const cache = new Map<number, Mats>();
export function matsFor(owner: number): Mats {
  let m = cache.get(owner); if (m) return m;
  const c = TEAM_COLORS[owner] ?? 0xcccccc, tc = new THREE.Color(c);
  m = {
    team: std(c, { roughness: 0.45, metalness: 0.35 }), teamDark: std(tc.clone().multiplyScalar(0.55).getHex()),
    glow: new THREE.MeshStandardMaterial({ color: tc.clone().lerp(new THREE.Color(0xffffff), 0.35), emissive: tc, emissiveIntensity: 1.4, roughness: 0.3 }),
    armor: std(0x5a6068), steel: std(0x9aa2ac, { metalness: 0.55, roughness: 0.4 }), dark: std(0x23272d, { metalness: 0.4 }), skin: std(0xd6b28f, { metalness: 0, roughness: 0.8 }),
    hull: std(owner === 0 ? 0x6b7787 : 0x7d6c68), concrete: std(owner === 0 ? 0x8a929d : 0x958a86, { metalness: 0.1, roughness: 0.85 }),
  };
  cache.set(owner, m); return m;
}
export const crystalMat = new THREE.MeshStandardMaterial({ color: 0x4fd6ff, emissive: 0x1d8fd0, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.2, flatShading: true });
const crystalHi = new THREE.MeshStandardMaterial({ color: 0xbff2ff, emissive: 0x57c9f0, emissiveIntensity: 1.5, roughness: 0.2, flatShading: true });

type Part = THREE.Mesh;
function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): Part {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o;
}
function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10): Part {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y + h / 2, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o;
}
function ball(g: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, sy = 1): Part {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m); o.position.set(x, y + r, z); o.scale.y = sy; o.castShadow = true; g.add(o); return o;
}

export interface UnitRig { root: THREE.Group; body: THREE.Object3D; gun: THREE.Object3D | null; flash: THREE.Mesh; carry: THREE.Object3D | null; arm: THREE.Object3D | null; scale: number }

/** 모델은 +X 방향을 봅니다. */
export function makeUnit(kind: UnitKind, owner: number): UnitRig {
  const m = matsFor(owner), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  let gun: THREE.Object3D | null = null, carry: THREE.Object3D | null = null, arm: THREE.Object3D | null = null, muzzle = 0.8, mh = 0.62;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); flash.visible = false;
  if (kind === 'worker') {
    cyl(body, 0.17, 0.2, 0.34, m.team, 0, 0.12, 0); ball(body, 0.17, m.team, 0, 0.4, 0, 1.1);
    ball(body, 0.12, m.skin, 0.03, 0.66, 0); box(body, 0.1, 0.07, 0.22, m.glow, 0.13, 0.7, 0);
    box(body, 0.14, 0.3, 0.26, m.armor, -0.17, 0.3, 0);
    arm = new THREE.Group(); arm.position.set(0.12, 0.5, 0.16); body.add(arm); box(arm, 0.4, 0.07, 0.07, m.steel, 0.14, -0.03, 0); box(arm, 0.08, 0.2, 0.08, m.dark, 0.34, -0.14, 0);
    carry = new THREE.Group(); carry.position.set(-0.3, 0.45, 0); body.add(carry);
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), crystalMat); c.position.y = 0.1; c.scale.y = 1.4; carry.add(c); carry.visible = false;
    mh = 0.8; muzzle = 0.4;
  } else if (kind === 'marine') {
    box(body, 0.1, 0.24, 0.12, m.dark, 0, 0, 0.1); box(body, 0.1, 0.24, 0.12, m.dark, 0, 0, -0.1);
    cyl(body, 0.2, 0.22, 0.42, m.armor, 0, 0.22, 0); box(body, 0.1, 0.18, 0.38, m.team, 0.02, 0.5, 0); // 어깨 보호대
    ball(body, 0.17, m.armor, 0.02, 0.68, 0); box(body, 0.1, 0.09, 0.22, m.glow, 0.15, 0.76, 0); // 헬멧 바이저
    gun = new THREE.Group(); gun.position.set(0.2, 0.52, 0.17); body.add(gun); box(gun, 0.7, 0.1, 0.09, m.dark, 0.18, -0.05, 0); box(gun, 0.22, 0.14, 0.1, m.steel, 0, -0.07, 0);
    box(body, 0.12, 0.34, 0.2, m.steel, -0.2, 0.35, 0);
    mh = 1; muzzle = 0.88;
  } else if (kind === 'rocket') {
    box(body, 0.13, 0.28, 0.15, m.dark, 0, 0, 0.12); box(body, 0.13, 0.28, 0.15, m.dark, 0, 0, -0.12);
    cyl(body, 0.26, 0.28, 0.5, m.hull, 0, 0.26, 0); box(body, 0.3, 0.1, 0.5, m.team, 0, 0.62, 0);
    ball(body, 0.2, m.hull, 0.02, 0.74, 0); box(body, 0.1, 0.1, 0.26, m.glow, 0.17, 0.86, 0);
    gun = new THREE.Group(); gun.position.set(0.0, 0.84, 0.3); body.add(gun); const t = cyl(gun, 0.1, 0.12, 0.95, m.steel, 0.2, -0.06, 0); t.rotation.z = Math.PI / 2; t.position.set(0.3, 0, 0); cyl(gun, 0.13, 0.13, 0.1, m.teamDark, 0.76, -0.06, 0).rotation.z = Math.PI / 2;
    box(body, 0.2, 0.4, 0.3, m.armor, -0.26, 0.4, 0);
    mh = 1.15; muzzle = 0.95;
  } else {
    box(body, 1.5, 0.3, 0.32, m.dark, 0, 0, 0.5); box(body, 1.5, 0.3, 0.32, m.dark, 0, 0, -0.5); // 무한궤도
    box(body, 1.25, 0.34, 0.8, m.hull, 0, 0.26, 0); box(body, 0.9, 0.12, 0.7, m.team, -0.08, 0.6, 0);
    const tur = new THREE.Group(); tur.position.set(-0.06, 0.7, 0); body.add(tur); cyl(tur, 0.42, 0.5, 0.3, m.armor, 0, 0, 0, 10); box(tur, 0.5, 0.2, 0.6, m.team, -0.1, 0.18, 0);
    gun = new THREE.Group(); gun.position.set(0.3, 0.14, 0); tur.add(gun); const bar = cyl(gun, 0.08, 0.1, 1.5, m.steel, 0.7, -0.08, 0); bar.rotation.z = Math.PI / 2; bar.position.set(0.7, 0, 0); cyl(gun, 0.12, 0.12, 0.2, m.dark, 1.42, -0.08, 0).rotation.z = Math.PI / 2;
    box(tur, 0.18, 0.18, 0.2, m.glow, -0.28, 0.32, 0.22);
    mh = 1.0; muzzle = 1.5; gun.userData.m = muzzle;
  }
  flash.position.set(muzzle, mh * 0.7, kind === 'marine' ? 0.17 : kind === 'rocket' ? 0.3 : 0); if (kind === 'tank') flash.position.set(1.8, 0.85, 0);
  root.add(flash);
  return { root, body, gun, flash, carry, arm, scale: 1 };
}

export interface BuildRig { root: THREE.Group; light: THREE.Mesh[]; spin: THREE.Object3D | null; barrel: THREE.Object3D | null; flash: THREE.Mesh | null; top: number }

export function makeBuilding(kind: BuildKind, owner: number): BuildRig {
  const m = matsFor(owner), root = new THREE.Group(), s = BUILDINGS[kind].size, light: THREE.Mesh[] = [];
  let spin: THREE.Object3D | null = null, barrel: THREE.Object3D | null = null, flash: THREE.Mesh | null = null, top = 2;
  const lamp = (x: number, y: number, z: number, w = 0.2, h = 0.12, d = 0.2): void => { const l = box(root, w, h, d, m.glow, x, y, z); light.push(l); };
  if (kind === 'hq') {
    box(root, s - 0.2, 0.28, s - 0.2, m.dark, 0, 0, 0); box(root, s - 0.8, 1.5, s - 0.9, m.concrete, 0, 0.28, 0);
    box(root, s - 0.5, 0.18, 0.5, m.team, 0, 1.0, (s - 0.9) / 2 + 0.2); box(root, s - 0.5, 0.18, 0.5, m.team, 0, 1.0, -(s - 0.9) / 2 - 0.2);
    const dome = ball(root, 1.1, m.steel, 0, 1.7, 0, 0.7); void dome; cyl(root, 0.2, 0.28, 0.8, m.armor, 0, 2.3, 0);
    spin = new THREE.Group(); spin.position.set(0, 3.0, 0); root.add(spin); const dish = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.3), m.steel); dish.rotation.x = Math.PI; dish.position.y = 0.1; spin.add(dish); cyl(spin, 0.03, 0.03, 0.55, m.dark, 0, 0.1, 0);
    box(root, 0.9, 1.0, 0.1, m.dark, 0, 0.28, (s - 0.9) / 2 + 0.45); lamp(0, 1.45, (s - 0.9) / 2 + 0.52, 0.8, 0.08, 0.04);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { cyl(root, 0.18, 0.22, 1.5, m.armor, x * (s / 2 - 0.5), 0.28, z * (s / 2 - 0.5), 8); lamp(x * (s / 2 - 0.5), 1.8, z * (s / 2 - 0.5), 0.18, 0.1, 0.18); }
    top = 3.4;
  } else if (kind === 'depot') {
    // 정비용 보급함과 밝은 십자 표식으로 회복 시설을 식별합니다.
    box(root, 0.65, 0.4, 0.5, m.hull, 0.5, 0.95, 0.35);
    box(root, 0.42, 0.035, 0.1, m.glow, 0.5, 1.36, 0.35);
    box(root, 0.1, 0.035, 0.35, m.glow, 0.5, 1.36, 0.35);
    box(root, s - 0.2, 0.2, s - 0.2, m.dark, 0, 0, 0); box(root, 1.1, 0.8, 0.8, m.concrete, -0.1, 0.2, 0.45); box(root, 1.1, 0.14, 0.82, m.team, -0.1, 0.62, 0.45);
    cyl(root, 0.38, 0.38, 1.05, m.steel, -0.45, 0.2, -0.45, 12); cyl(root, 0.38, 0.38, 1.05, m.steel, 0.4, 0.2, -0.45, 12); cyl(root, 0.4, 0.4, 0.12, m.team, -0.45, 0.78, -0.45, 12); cyl(root, 0.4, 0.4, 0.12, m.team, 0.4, 0.78, -0.45, 12);
    box(root, 0.5, 0.5, 0.5, m.hull, 0.65, 0.2, 0.45); lamp(0.65, 0.72, 0.45, 0.22, 0.08, 0.22); top = 1.4;
  } else if (kind === 'barracks') {
    box(root, s - 0.2, 0.2, s - 0.2, m.dark, 0, 0, 0); box(root, s - 0.6, 1.1, s - 0.8, m.concrete, 0, 0.2, 0);
    const roof = box(root, s - 0.4, 0.16, s - 0.5, m.hull, 0, 1.3, 0); roof.rotation.x = 0.08; box(root, s - 0.5, 0.28, 0.2, m.team, 0, 1.46, -(s - 0.6) / 2 + 0.05);
    box(root, 1.1, 0.85, 0.12, m.dark, 0, 0.2, (s - 0.8) / 2 + 0.05); lamp(0, 1.0, (s - 0.8) / 2 + 0.1, 1.0, 0.07, 0.04);
    cyl(root, 0.1, 0.1, 0.8, m.steel, 0.9, 1.4, -0.7, 8); const flag = box(root, 0.5, 0.3, 0.04, m.team, 1.15, 1.9, -0.7); void flag; top = 2.3;
  } else if (kind === 'factory') {
    box(root, s - 0.2, 0.2, s - 0.2, m.dark, 0, 0, 0); box(root, s - 0.5, 1.3, s - 0.7, m.concrete, 0, 0.2, 0.1);
    for (let i = 0; i < 3; i++) { const r = box(root, 0.78, 0.5, s - 0.9, m.hull, -0.9 + i * 0.9, 1.5, 0.1); r.rotation.z = -0.35; }
    cyl(root, 0.2, 0.24, 1.7, m.armor, -1.0, 1.4, -0.9, 8); cyl(root, 0.2, 0.24, 1.3, m.armor, -0.4, 1.4, -0.9, 8); cyl(root, 0.23, 0.2, 0.12, m.team, -1.0, 3.0, -0.9, 8);
    box(root, 1.4, 0.95, 0.12, m.dark, 0.2, 0.2, (s - 0.7) / 2 + 0.15); lamp(0.2, 1.1, (s - 0.7) / 2 + 0.22, 1.3, 0.07, 0.04);
    box(root, 0.16, 1.3, 0.16, m.steel, 1.15, 1.5, 0.6); box(root, 1.0, 0.1, 0.12, m.steel, 0.75, 2.7, 0.6); box(root, 0.5, 0.18, 0.5, m.team, 0.0, 1.35, 1.2); top = 3.2;
  } else {
    box(root, s - 0.2, 0.3, s - 0.2, m.dark, 0, 0, 0); cyl(root, 0.42, 0.55, 1.5, m.concrete, 0, 0.3, 0, 8); cyl(root, 0.5, 0.42, 0.18, m.team, 0, 1.6, 0, 8);
    spin = new THREE.Group(); spin.position.set(0, 1.95, 0); root.add(spin); box(spin, 0.7, 0.4, 0.6, m.hull, 0, -0.2, 0); barrel = new THREE.Group(); barrel.position.set(0.3, 0, 0); spin.add(barrel);
    const b = cyl(barrel, 0.07, 0.09, 1.1, m.steel, 0.5, -0.07, 0, 8); b.rotation.z = Math.PI / 2; b.position.set(0.5, 0, 0); box(spin, 0.14, 0.14, 0.14, m.glow, -0.2, 0.2, 0); lamp(0, 1.5, 0.45, 0.2, 0.06, 0.04);
    flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); flash.position.set(1.15, 0, 0); flash.visible = false; spin.add(flash); top = 2.3;
  }
  return { root, light, spin, barrel, flash, top };
}

export function makeCrystals(seed: number): THREE.Group {
  const g = new THREE.Group(); g.scale.setScalar(0.8); let r = seed * 9301 + 49297; const rnd = (): number => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const n = 4 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const h = 0.7 + rnd() * 0.9, c = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 + rnd() * 0.14), i === 0 ? crystalHi : crystalMat);
    c.scale.set(1, h / 0.4, 1); const a = i / n * Math.PI * 2 + rnd(), d = i === 0 ? 0 : 0.28 + rnd() * 0.1;
    c.position.set(Math.cos(a) * d, h * 0.5, Math.sin(a) * d); c.rotation.set((rnd() - 0.5) * 0.35, rnd() * 3, (rnd() - 0.5) * 0.35); c.castShadow = true; g.add(c);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.12, 8), std(0x3d4650)); base.position.y = 0.05; base.receiveShadow = true; g.add(base);
  return g;
}
