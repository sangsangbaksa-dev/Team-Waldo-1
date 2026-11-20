// FRONTLINE — 유닛·건물·자원 3D 모델. 별도 에셋 파일 없이 기본 도형을 조립합니다(원점은 발밑/바닥 중심).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadCharacterKit, type CharacterKit, type CharacterRig } from '../shared/character';
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

/** 정적 장갑·환기구·골조를 재질별로 합쳐 디테일이 많아져도 draw call 을 늘리지 않습니다. */
type Panel = readonly [number, number, number, number, number, number];
function panels(root: THREE.Object3D, mat: THREE.Material, specs: readonly Panel[]): void {
  const parts = specs.map(([w,h,d,x,y,z]) => new THREE.BoxGeometry(w,h,d).translate(x,y+h/2,z));
  if (!parts.length) return;
  const geo = mergeGeometries(parts); parts.forEach(g => g.dispose());
  if (geo) { const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); }
}

let unitKit: CharacterKit | null = null;
/** 공용 캐릭터 키트를 미리 받아 둡니다. 준비되기 전에 만든 유닛은 도형 모델로 남습니다. */
export function preloadUnitKit(): void { if (!unitKit) void loadCharacterKit(import.meta.env.BASE_URL).then(k => { unitKit = k; }).catch(() => undefined); }
const KIT_OF: Partial<Record<UnitKind, string>> = { worker: 'worker', marine: 'rifle', rocket: 'heavy', medic: 'medic' };
export interface UnitRig { ch?: CharacterRig; root: THREE.Group; body: THREE.Object3D; gun: THREE.Object3D | null; flash: THREE.Mesh; carry: THREE.Object3D | null; arm: THREE.Object3D | null; scale: number }

/** 의무병 등 — 등의 구급 배낭(흰 바탕에 팀색 십자). */
function medicPack(body: THREE.Object3D, m: Mats): void {
  const white = std(0xf1efe8, { roughness: 0.6, metalness: 0.05 });
  box(body, 0.16, 0.36, 0.34, white, -0.22, 0.34, 0); box(body, 0.04, 0.22, 0.07, m.team, -0.31, 0.43, 0); box(body, 0.04, 0.07, 0.22, m.team, -0.31, 0.5, 0);
}
/** 정찰 지프: 낮은 차체·바퀴 네 개·롤바. 팀색 줄무늬와 사막 위장 도색. */
function jeepBody(body: THREE.Object3D, m: Mats): void {
  const sand = std(0xb99a62, { roughness: 0.75, metalness: 0.15 });
  box(body, 1.5, 0.22, 0.78, m.dark, 0, 0.22, 0); box(body, 1.4, 0.26, 0.74, sand, 0, 0.4, 0); box(body, 0.5, 0.2, 0.7, sand, 0.55, 0.62, 0); box(body, 1.3, 0.06, 0.3, m.team, -0.02, 0.66, 0);
  box(body, 0.05, 0.3, 0.6, m.glow, 0.78, 0.46, 0); box(body, 0.1, 0.34, 0.74, m.steel, -0.2, 0.66, 0); // 앞유리 틀·롤바
  for (const [x, z] of [[-0.5, -0.46], [0.5, -0.46], [-0.5, 0.46], [0.5, 0.46]] as const) { const w = cyl(body, 0.22, 0.22, 0.16, m.dark, x, 0.0, z, 10); w.rotation.x = Math.PI / 2; w.position.y = 0.22; }
  box(body, 0.08, 0.28, 0.5, m.armor, -0.74, 0.4, 0); box(body, 0.34, 0.3, 0.3, m.hull, -0.6, 0.66, 0); // 뒤 예비 타이어 보관함
  panels(body, m.dark, [[0.05,0.12,0.52,0.81,0.35,0], [0.38,0.1,0.09,0.5,0.63,-0.36],[0.38,0.1,0.09,0.5,0.63,0.36], [0.06,0.38,0.06,-0.48,0.64,-0.32], [0.06,0.38,0.06,-0.48,0.64,0.32], [0.4,0.06,0.7,-0.36,1.0,0]]);
  panels(body, m.steel, [[0.10,0.10,0.88,0.79,0.28,0],[0.10,0.09,0.82,-0.78,0.28,0],[0.13,0.07,0.08,-0.32,0.66,0.39],[0.13,0.07,0.08,-0.32,0.66,-0.39]]);
}

/** 모델은 +X 방향을 봅니다. */
export function makeUnit(kind: UnitKind, owner: number): UnitRig {
  const m = matsFor(owner), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  let gun: THREE.Object3D | null = null, carry: THREE.Object3D | null = null, arm: THREE.Object3D | null = null, muzzle = 0.8, mh = 0.62;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); flash.visible = false;
  const kitKind = KIT_OF[kind];
  if (kitKind && unitKit?.has(kitKind)) { // 공용 캐릭터(손 모델·팀색·피부색 포함)
    const ch = unitKit.create(kitKind, { team: TEAM_COLORS[owner] ?? 0xcccccc, skin: 0xd6b28f, height: 1, width: 1 }); ch.root.scale.multiplyScalar(0.5); body.add(ch.root);
    ch.state.aim = kind === 'worker' || kind === 'medic' ? 0 : 1;
    if (kind === 'worker') { carry = new THREE.Group(); carry.position.set(-0.3, 0.45, 0); body.add(carry); const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), crystalMat); c.position.y = 0.1; c.scale.y = 1.4; carry.add(c); carry.visible = false; mh = 0.8; muzzle = 0.4; }
    else if (kind === 'medic') { medicPack(body, m); mh = 0.9; muzzle = 0.4; }
    else { gun = new THREE.Group(); gun.position.set(0.2, 0.52, 0.17); body.add(gun); mh = kind === 'rocket' ? 1.15 : 1; muzzle = kind === 'rocket' ? 0.95 : 0.88; }
    flash.position.set(muzzle, mh * 0.7, kind === 'rocket' ? 0.3 : 0.17); root.add(flash);
    return { ch, root, body, gun, flash, carry, arm, scale: 1 };
  }
  if (kind === 'worker') {
    cyl(body, 0.17, 0.2, 0.34, m.team, 0, 0.12, 0); ball(body, 0.17, m.team, 0, 0.4, 0, 1.1);
    ball(body, 0.12, m.skin, 0.03, 0.66, 0); box(body, 0.1, 0.07, 0.22, m.glow, 0.13, 0.7, 0);
    box(body, 0.14, 0.3, 0.26, m.armor, -0.17, 0.3, 0);
    arm = new THREE.Group(); arm.position.set(0.12, 0.5, 0.16); body.add(arm); box(arm, 0.4, 0.07, 0.07, m.steel, 0.14, -0.03, 0); box(arm, 0.08, 0.2, 0.08, m.dark, 0.34, -0.14, 0);
    carry = new THREE.Group(); carry.position.set(-0.3, 0.45, 0); body.add(carry);
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), crystalMat); c.position.y = 0.1; c.scale.y = 1.4; carry.add(c); carry.visible = false;
    mh = 0.8; muzzle = 0.4;
  } else if (kind === 'medic') {
    box(body, 0.1, 0.24, 0.12, m.dark, 0, 0, 0.1); box(body, 0.1, 0.24, 0.12, m.dark, 0, 0, -0.1);
    cyl(body, 0.2, 0.22, 0.42, m.armor, 0, 0.22, 0); ball(body, 0.16, m.armor, 0.02, 0.68, 0); box(body, 0.1, 0.08, 0.2, m.glow, 0.14, 0.74, 0);
    medicPack(body, m); mh = 0.9; muzzle = 0.4;
  } else if (kind === 'jeep') {
    jeepBody(body, m); gun = new THREE.Group(); gun.position.set(-0.1, 0.9, 0); body.add(gun);
    box(gun, 0.8, 0.09, 0.09, m.dark, 0.34, -0.05, 0.06); box(gun, 0.8, 0.09, 0.09, m.dark, 0.34, -0.05, -0.06); box(gun, 0.2, 0.18, 0.28, m.steel, 0, -0.1, 0);
    mh = 1.0; muzzle = 0.95; gun.userData.m = muzzle;
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
    const treads: Panel[] = [], hubs: Panel[] = [];
    for (const side of [-1,1]) for (let i=0;i<6;i++) {
      const x = -0.63 + i*0.25; treads.push([0.19,0.035,0.34,x,0.3,side*0.5]); hubs.push([0.13,0.16,0.035,x,0.07,side*0.67]);
    }
    panels(body,m.armor,treads); panels(body,m.steel,hubs);
    panels(body,m.hull,[[1.22,0.13,0.08,0,0.35,0.64],[1.22,0.13,0.08,0,0.35,-0.64]]);
    box(body, 1.25, 0.34, 0.8, m.hull, 0, 0.26, 0); box(body, 0.9, 0.12, 0.7, m.team, -0.08, 0.6, 0);
    const tur = new THREE.Group(); tur.position.set(-0.06, 0.7, 0); body.add(tur); cyl(tur, 0.42, 0.5, 0.3, m.armor, 0, 0, 0, 10); box(tur, 0.5, 0.2, 0.6, m.team, -0.1, 0.18, 0);
    gun = new THREE.Group(); gun.position.set(0.3, 0.14, 0); tur.add(gun); const bar = cyl(gun, 0.08, 0.1, 1.5, m.steel, 0.7, -0.08, 0); bar.rotation.z = Math.PI / 2; bar.position.set(0.7, 0, 0); cyl(gun, 0.12, 0.12, 0.2, m.dark, 1.42, -0.08, 0).rotation.z = Math.PI / 2;
    box(tur, 0.18, 0.18, 0.2, m.glow, -0.28, 0.32, 0.22);
    panels(body, m.dark, [[0.05,0.13,0.46,-0.65,0.39,0],[0.3,0.05,0.10,-0.38,0.62,-0.27],[0.3,0.05,0.10,-0.38,0.62,0.27]]);
    panels(tur,m.steel,[[0.18,0.05,0.22,-0.18,0.42,0],[0.06,0.35,0.06,-0.38,0.38,-0.23]]);
    panels(tur,m.armor,[[0.19,0.18,0.13,0.22,0.19,-0.39],[0.19,0.18,0.13,0.22,0.19,0.39]]);
    mh = 1.0; muzzle = 1.5; gun.userData.m = muzzle;
  }
  flash.position.set(muzzle, mh * 0.7, kind === 'marine' ? 0.17 : kind === 'rocket' ? 0.3 : 0); if (kind === 'tank') flash.position.set(1.8, 0.85, 0); if (kind === 'jeep') flash.position.set(1.2, 1.0, 0);
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
    const nexus = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), m.glow); nexus.scale.y = 1.6; nexus.position.y = 1.15; nexus.castShadow = true; spin.add(nexus); light.push(nexus);
    top = 4.4;
  } else if (kind === 'depot') {
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
    // 롤식 방어탑: 층층이 좁아지는 돌탑, 팀색 띠, 꼭대기에 떠서 회전하며 쏘는 팀색 수정구.
    box(root, s - 0.2, 0.3, s - 0.2, m.dark, 0, 0, 0); cyl(root, 0.72, 0.88, 0.9, m.concrete, 0, 0.3, 0, 8); cyl(root, 0.8, 0.74, 0.12, m.team, 0, 1.2, 0, 8);
    cyl(root, 0.5, 0.68, 1.25, m.concrete, 0, 1.32, 0, 8); cyl(root, 0.56, 0.52, 0.12, m.team, 0, 2.5, 0, 8);
    for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) { const b = box(root, 0.18, 1.0, 0.18, m.armor, x * 0.78, 0.3, z * 0.78); b.rotation.set(z * 0.2, 0, -x * 0.2); lamp(x * 0.62, 1.85, z * 0.62, 0.1, 0.34, 0.1); }
    cyl(root, 0.22, 0.34, 0.5, m.steel, 0, 2.62, 0, 8);
    spin = new THREE.Group(); spin.position.set(0, 3.45, 0); root.add(spin);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), m.glow); orb.scale.y = 1.5; orb.castShadow = true; spin.add(orb); light.push(orb);
    barrel = new THREE.Group(); barrel.position.set(0.3, 0, 0); spin.add(barrel); const nozzle = cyl(barrel, 0.0, 0.14, 0.5, m.steel, 0.2, -0.25, 0, 6); nozzle.rotation.z = -Math.PI / 2; nozzle.position.set(0.2, 0, 0);
    flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); flash.position.set(0.95, 0, 0); flash.visible = false; spin.add(flash); top = 4.0;
  }
  // 같은 사막 군사 기지의 디자인 언어: 기초 볼트, 철제 패널, 역할별 설비.
  const edge=s/2-0.18, foot: Panel[]=[];
  for(const x of [-edge,edge])for(const z of [-edge,edge])foot.push([0.22,0.09,0.22,x,0.2,z]);
  panels(root,m.steel,foot);
  if(kind==='hq'||kind==='barracks'||kind==='factory'){
    const vents:Panel[]=[], frames:Panel[]=[];
    const side=s/2-0.25, y=kind==='hq'?0.7:0.48;
    for(const x of [-1,1]){
      frames.push([0.13,0.62,0.72,x*side,y,0.05]);
      for(let i=0;i<4;i++)vents.push([0.15,0.045,0.58,x*(side+0.03),y+0.11+i*0.115,0.05]);
    }
    panels(root,m.dark,frames);panels(root,m.steel,vents);
    if(kind==='hq') {
      panels(root,m.armor,[[0.75,0.15,0.55,-1.05,1.78,0.9],[0.75,0.15,0.55,1.05,1.78,0.9]]);
      lamp(-1.05,1.94,0.9,0.52,0.035,0.32);lamp(1.05,1.94,0.9,0.52,0.035,0.32);
      panels(root,m.teamDark,[[0.18,0.70,0.85,-1.55,0.42,-0.65],[0.18,0.70,0.85,1.55,0.42,-0.65]]);
    }else if(kind==='barracks'){
      panels(root,m.armor,[[0.22,0.84,0.22,-0.75,0.22,1.25],[0.22,0.84,0.22,0.75,0.22,1.25],[1.65,0.18,0.52,0,1.12,1.23]]);
      panels(root,m.steel,[[0.52,0.11,0.36,-0.65,1.55,0.3],[0.52,0.11,0.36,0.65,1.55,0.3]]);
    }else {
      panels(root,m.steel,[[0.12,1.16,0.12,-0.64,0.23,1.37],[0.12,1.16,0.12,1.03,0.23,1.37],[1.8,0.13,0.19,0.2,1.29,1.37]]);
      panels(root,m.dark,[[0.16,0.055,0.8,-0.28,0.23,1.02],[0.16,0.055,0.8,0.62,0.23,1.02]]);
    }
  }else if(kind==='depot'){
    panels(root,m.steel,[[1.56,0.06,0.09,0,0.29,-0.83],[0.08,0.08,1.56,0.83,0.31,0],[0.08,0.08,1.56,-0.83,0.31,0]]);
    panels(root,m.dark,[[0.12,0.12,0.38,-0.48,0.72,-0.45],[0.12,0.12,0.38,0.40,0.72,-0.45]]);
  }else {
    panels(root,m.armor,[[0.42,0.45,0.17,0,0.34,-0.83],[0.42,0.45,0.17,0,0.34,0.83],[0.17,0.45,0.42,0.83,0.34,0],[0.17,0.45,0.42,-0.83,0.34,0]]);
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
