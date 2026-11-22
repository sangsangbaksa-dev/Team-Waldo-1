// FRONTLINE — 유닛·건물·자원 3D 모델. 별도 에셋 파일 없이 기본 도형을 조립합니다(원점은 발밑/바닥 중심).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadCharacterKit, type CharacterKit, type CharacterRig } from '../shared/character';
import { makeProceduralMilitary, type MilitaryLook } from '../shared/character/procedural';
import { BUILDINGS, TEAM_COLORS, type BuildKind, type UnitKind } from './config';

const sharedMaterials = new WeakSet<THREE.Material>();
const keep = <T extends THREE.Material>(material: T): T => { sharedMaterials.add(material); return material; };
export const isSharedRtsMaterial = (material: THREE.Material): boolean => sharedMaterials.has(material);
const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.25, flatShading: true, ...o }));

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
    glow: keep(new THREE.MeshStandardMaterial({ color: tc.clone().lerp(new THREE.Color(0xffffff), 0.35), emissive: tc, emissiveIntensity: 1.4, roughness: 0.3 })),
    armor: std(0x5a6068), steel: std(0x9aa2ac, { metalness: 0.55, roughness: 0.4 }), dark: std(0x23272d, { metalness: 0.4 }), skin: std(0xd6b28f, { metalness: 0, roughness: 0.8 }),
    hull: std(owner === 0 ? 0x6b7787 : 0x7d6c68), concrete: std(owner === 0 ? 0x8a929d : 0x958a86, { metalness: 0.1, roughness: 0.85 }),
  };
  cache.set(owner, m); return m;
}
export const crystalMat = keep(new THREE.MeshStandardMaterial({ color: 0x4fd6ff, emissive: 0x1d8fd0, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.2, flatShading: true }));
const crystalHi = keep(new THREE.MeshStandardMaterial({ color: 0xbff2ff, emissive: 0x57c9f0, emissiveIntensity: 1.5, roughness: 0.2, flatShading: true }));

const crystalBase = std(0x3d4650);
const medicWhite = std(0xf1efe8, { roughness: 0.6, metalness: 0.05 });
const jeepSand = std(0xb99a62, { roughness: 0.75, metalness: 0.15 });
const flashMat = keep(new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));

/** Release only per-model geometry, never the common character kit or team materials. */
export function releaseModelGeometry(root: THREE.Object3D): void {
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse(o => {
    if (o instanceof THREE.Mesh && (o.userData.ownedGeometry || o.userData.ownedDetail) && !seen.has(o.geometry)) {
      seen.add(o.geometry); o.geometry.dispose();
    }
  });
}

type Part = THREE.Mesh;
function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): Part {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.castShadow = true; o.receiveShadow = true; o.userData.ownedGeometry = true; g.add(o); return o;
}
function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10): Part {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y + h / 2, z); o.castShadow = true; o.receiveShadow = true; o.userData.ownedGeometry = true; g.add(o); return o;
}
function ball(g: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, sy = 1): Part {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m); o.position.set(x, y + r, z); o.scale.y = sy; o.castShadow = true; o.userData.ownedGeometry = true; g.add(o); return o;
}

// Batch decorative rigid parts by material; moving turrets and lights stay separate.
function detail(parent: THREE.Object3D, build: (g: THREE.Group) => void): void {
  const g = new THREE.Group(); build(g); g.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld); o.geometry.dispose();
    const list = batches.get(o.material) ?? []; list.push(geo); batches.set(o.material, list);
  });
  for (const [mat, list] of batches) {
    const geo = mergeGeometries(list, false); for (const p of list) p.dispose();
    if (!geo) continue; const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.userData.ownedDetail = true; parent.add(mesh);
  }
}

let unitKit: CharacterKit | null = null;
/** 공용 캐릭터 키트를 미리 받아 둡니다. 준비되기 전에 만든 유닛은 도형 모델로 남습니다. */
export function preloadUnitKit(): void { if (!unitKit) void loadCharacterKit(import.meta.env.BASE_URL).then(k => { unitKit = k; }).catch(() => undefined); }
const KIT_OF: Partial<Record<UnitKind, MilitaryLook>> = { worker: 'worker', marine: 'rifle', rocket: 'heavy', medic: 'medic' };
export interface UnitRig { ch?: CharacterRig; root: THREE.Group; body: THREE.Object3D; gun: THREE.Object3D | null; flash: THREE.Mesh; carry: THREE.Object3D | null; arm: THREE.Object3D | null; scale: number }

/** 의무병 등 — 등의 구급 배낭(흰 바탕에 팀색 십자). */
function medicPack(body: THREE.Object3D, m: Mats): void {
  const white = medicWhite;
  box(body, 0.16, 0.36, 0.34, white, -0.22, 0.34, 0); box(body, 0.04, 0.22, 0.07, m.team, -0.31, 0.43, 0); box(body, 0.04, 0.07, 0.22, m.team, -0.31, 0.5, 0);
}
/** 정찰 지프: 낮은 차체·바퀴 네 개·롤바. 팀색 줄무늬와 사막 위장 도색. */
function jeepBody(body: THREE.Object3D, m: Mats): void {
  const sand = jeepSand;
  box(body, 1.5, 0.22, 0.78, m.dark, 0, 0.22, 0); box(body, 1.4, 0.26, 0.74, sand, 0, 0.4, 0); box(body, 0.5, 0.2, 0.7, sand, 0.55, 0.62, 0); box(body, 1.3, 0.06, 0.3, m.team, -0.02, 0.66, 0);
  box(body, 0.05, 0.3, 0.6, m.glow, 0.78, 0.46, 0); box(body, 0.1, 0.34, 0.74, m.steel, -0.2, 0.66, 0); // 앞유리 틀·롤바
  for (const [x, z] of [[-0.5, -0.46], [0.5, -0.46], [-0.5, 0.46], [0.5, 0.46]] as const) { const w = cyl(body, 0.22, 0.22, 0.16, m.dark, x, 0.0, z, 10); w.rotation.x = Math.PI / 2; w.position.y = 0.22; }
  box(body, 0.08, 0.28, 0.5, m.armor, -0.74, 0.4, 0); box(body, 0.34, 0.3, 0.3, m.hull, -0.6, 0.66, 0); // 뒤 예비 타이어 보관함
}

/** 모델은 +X 방향을 봅니다. */
export function makeUnit(kind: UnitKind, owner: number, detailed = true): UnitRig {
  const m = matsFor(owner), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  let gun: THREE.Object3D | null = null, carry: THREE.Object3D | null = null, arm: THREE.Object3D | null = null, muzzle = 0.8, mh = 0.62;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), flashMat); flash.visible = false; flash.userData.ownedGeometry = true;
  const kitKind = KIT_OF[kind];
  if (kitKind) { // Use identical animation and proportions for downloaded and procedural characters.
    const look = { team: TEAM_COLORS[owner] ?? 0xcccccc, skin: 0xd6b28f, height: 0.5, width: 0.5 };
    const ch = unitKit?.has(kitKind) ? unitKit.create(kitKind, look) : makeProceduralMilitary(kitKind, look); body.add(ch.root);
    ch.state.aim = kind === 'worker' || kind === 'medic' ? 0 : 1;
    if (kind === 'worker') { carry = new THREE.Group(); carry.position.set(-0.3, 0.45, 0); body.add(carry); const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), crystalMat); c.userData.ownedGeometry = true; c.position.y = 0.1; c.scale.y = 1.4; carry.add(c); carry.visible = false; mh = 0.8; muzzle = 0.4; }
    else if (kind === 'medic') { if (unitKit?.has(kitKind)) medicPack(body, m); mh = 0.9; muzzle = 0.4; }
    else { gun = new THREE.Group(); gun.position.set(0.2, 0.52, 0.17); body.add(gun); mh = kind === 'rocket' ? 1.15 : 1; muzzle = kind === 'rocket' ? 0.95 : 0.88; }
    flash.position.set(muzzle, mh * 0.7, kind === 'rocket' ? 0.3 : 0.17); root.add(flash);
    if (gun) gun.userData.restX = gun.position.x;
    return { ch, root, body, gun, flash, carry, arm, scale: 1 };
  }
  if (kind === 'jeep') {
    jeepBody(body, m);
    if (detailed) detail(body, g => {
      for (const z of [-0.48, 0.48]) for (const x of [-0.5, 0.5]) {
        const hub = cyl(g, 0.115, 0.115, 0.035, m.steel, x, 0, z * 1.15, 8); hub.rotation.x = Math.PI / 2; hub.position.y = 0.22;
        box(g, 0.46, 0.07, 0.24, m.hull, x, 0.43, z);
      }
      box(g, 0.09, 0.1, 0.8, m.steel, 0.85, 0.24);
      for (const z of [-0.24, 0.24]) { box(g, 0.04, 0.12, 0.18, m.steel, 0.825, 0.49, z); box(g, 0.3, 0.03, 0.06, m.dark, 0.49, 0.82, z); }
      box(g, 0.04, 0.46, 0.04, m.dark, -0.63, 0.9, -0.29);
    });
    gun = new THREE.Group(); gun.position.set(-0.1, 0.9, 0); body.add(gun);
    box(gun, 0.8, 0.09, 0.09, m.dark, 0.34, -0.05, 0.06); box(gun, 0.8, 0.09, 0.09, m.dark, 0.34, -0.05, -0.06); box(gun, 0.2, 0.18, 0.28, m.steel, 0, -0.1, 0);
    mh = 1.0; muzzle = 0.95; gun.userData.m = muzzle;
  } else {
    box(body, 1.5, 0.3, 0.32, m.dark, 0, 0, 0.5); box(body, 1.5, 0.3, 0.32, m.dark, 0, 0, -0.5); // 무한궤도
    box(body, 1.25, 0.34, 0.8, m.hull, 0, 0.26, 0); box(body, 0.9, 0.12, 0.7, m.team, -0.08, 0.6, 0);
    const tur = new THREE.Group(); tur.position.set(-0.06, 0.7, 0); body.add(tur); cyl(tur, 0.42, 0.5, 0.3, m.armor, 0, 0, 0, 10); box(tur, 0.5, 0.2, 0.6, m.team, -0.1, 0.18, 0);
    gun = new THREE.Group(); gun.position.set(0.3, 0.14, 0); tur.add(gun); const bar = cyl(gun, 0.08, 0.1, 1.5, m.steel, 0.7, -0.08, 0); bar.rotation.z = Math.PI / 2; bar.position.set(0.7, 0, 0); cyl(gun, 0.12, 0.12, 0.2, m.dark, 1.42, -0.08, 0).rotation.z = Math.PI / 2;
    box(tur, 0.18, 0.18, 0.2, m.glow, -0.28, 0.32, 0.22);
    if (detailed) {
      detail(body, g => {
        for (const z of [-0.67, 0.67]) {
          for (let i = 0; i < 5; i++) {
            const w = cyl(g, 0.115, 0.115, 0.055, m.steel, -0.6 + i * 0.3, 0, z, 8); w.rotation.x = Math.PI / 2; w.position.y = 0.16;
          }
          box(g, 1.38, 0.12, 0.12, m.hull, 0, 0.35, z * 0.9);
          for (let i = 0; i < 3; i++) box(g, 0.36, 0.09, 0.045, m.teamDark, -0.45 + i * 0.45, 0.38, z);
        }
        for (let i = 0; i < 4; i++) box(g, 0.08, 0.025, 0.55, m.dark, -0.56 + i * 0.12, 0.73);
        const glacis = box(g, 0.35, 0.16, 0.79, m.armor, 0.53, 0.48); glacis.rotation.z = -0.28;
      });
      detail(tur, g => {
        cyl(g, 0.15, 0.15, 0.045, m.steel, -0.13, 0.38, 0.13, 10);
        box(g, 0.03, 0.53, 0.03, m.dark, -0.31, 0.34, -0.23);
        for (const z of [-0.28, 0.28]) box(g, 0.18, 0.13, 0.09, m.hull, -0.27, 0.12, z);
      });
    }
    mh = 1.0; muzzle = 1.5; gun.userData.m = muzzle;
  }
  flash.position.set(muzzle, mh * 0.7, kind === 'marine' ? 0.17 : kind === 'rocket' ? 0.3 : 0); if (kind === 'tank') flash.position.set(1.8, 0.85, 0); if (kind === 'jeep') flash.position.set(1.2, 1.0, 0);
  root.add(flash);
  if (gun) gun.userData.restX = gun.position.x;
  return { root, body, gun, flash, carry, arm, scale: 1 };
}

export interface BuildRig { root: THREE.Group; light: THREE.Mesh[]; spin: THREE.Object3D | null; barrel: THREE.Object3D | null; flash: THREE.Mesh | null; top: number }

export function makeBuilding(kind: BuildKind, owner: number, detailed = true): BuildRig {
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
    flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), flashMat); flash.position.set(0.95, 0, 0); flash.visible = false; spin.add(flash); top = 4.0;
  }
  if (detailed) detail(root, g => {
    // Ground-level chassis trim, vents and durable structural braces, within the existing footprint.
    const edge = s / 2 - 0.16;
    for (const z of [-edge, edge]) {
      box(g, s - 0.35, 0.065, 0.055, m.steel, 0, 0.13, z);
      for (const x of [-edge + 0.16, edge - 0.16]) box(g, 0.14, 0.045, 0.22, m.teamDark, x, 0.22, z);
    }
    if (kind === 'hq' || kind === 'barracks' || kind === 'factory') {
      const front = kind === 'hq' ? (s - 0.9) / 2 + 0.40 : kind === 'factory' ? (s - 0.7) / 2 + 0.16 : (s - 0.8) / 2 + 0.11;
      const width = kind === 'factory' ? 1.4 : kind === 'hq' ? 0.9 : 1.1;
      const center = kind === 'factory' ? 0.2 : 0;
      for (let i = 0; i < 5; i++) box(g, width * 0.88, 0.028, 0.04, m.armor, center, 0.34 + i * 0.13, front + 0.055);
      for (const x of [center - width / 2 - 0.05, center + width / 2 + 0.05]) box(g, 0.09, 0.89, 0.12, m.steel, x, 0.3, front);
      for (const side of [-1, 1]) {
        const x = side * (s / 2 - 0.42);
        for (const z of [-0.65, 0.65]) box(g, 0.10, 0.78, 0.18, m.armor, x, 0.3, z);
        for (let i = 0; i < 4; i++) box(g, 0.075, 0.06, 0.47, m.dark, x, 0.67 + i * 0.10, 0);
      }
    }
    if (kind === 'factory') {
      for (const x of [-1, -0.4]) { cyl(g, 0.25, 0.25, 0.09, m.steel, x, x === -1 ? 3.12 : 2.70, -0.9, 8); }
      box(g, 0.76, 0.09, 0.38, m.armor, 0.75, 1.51, 0.96);
    } else if (kind === 'depot') {
      for (const x of [-0.45, 0.4]) { cyl(g, 0.12, 0.12, 0.12, m.dark, x, 1.25, -0.45, 8); box(g, 0.42, 0.06, 0.10, m.armor, x, 0.43, -0.08); }
    } else if (kind === 'tower') {
      for (const z of [-0.38, 0.38]) box(g, 0.08, 0.78, 0.10, m.steel, -0.58, 1.42, z);
      for (let i = 0; i < 5; i++) box(g, 0.08, 0.05, 0.76, m.armor, -0.62, 1.5 + i * 0.15);
    }
  });
  root.traverse(o => { if (o instanceof THREE.Mesh) o.userData.ownedGeometry = true; });
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
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.12, 8), crystalBase); base.position.y = 0.05; base.receiveShadow = true; g.add(base);
  g.traverse(o => { if (o instanceof THREE.Mesh) o.userData.ownedGeometry = true; });
  return g;
}
