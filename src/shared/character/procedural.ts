// Procedural military fallback for FRONTLINE and ZERO ZONE.
// Uses the same baked geometry and joint poses as the existing common character kit.
import * as THREE from 'three';
import { bake } from './bake';
import { CharacterRig, type CharPart } from './rig';
import type { Look } from './variants';
import { HIP, KNEE } from './pose';

export type MilitaryLook = 'rifle' | 'heavy' | 'medic' | 'worker' | 'swat' | 'guard' | 'merc';
const cache = new Map<MilitaryLook, CharPart>();

function buildPart(kind: MilitaryLook): CharPart {
  const mats: THREE.Material[] = [];
  const mat = (color: number, name = ''): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 }); m.name = name; mats.push(m); return m;
  };
  const cloth = mat(kind === 'swat' ? 0x303b43 : kind === 'medic' ? 0x777e70 : kind === 'merc' ? 0x786c55 : 0x535b4a);
  const armor = mat(kind === 'heavy' ? 0x4c555b : 0x383f40), black = mat(0x202629), steel = mat(0x788084);
  const team = mat(0xffffff, 'Team'), skin = mat(0xffffff, 'Skin'), white = mat(0xe4e2d9), red = mat(0xb44338);
  const body = new THREE.Group(), leg = new THREE.Group(), shin = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group();
  const box = (g: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material): THREE.Mesh => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); o.position.set(x,y,z); g.add(o); return o;
  };
  const sphere = (g: THREE.Group, x: number, y: number, z: number, r: number, m: THREE.Material, sx = 1, sy = 1, sz = 1): void => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); o.position.set(x,y,z); o.scale.set(sx,sy,sz); g.add(o);
  };
  const heavy = kind === 'heavy', worker = kind === 'worker';
  box(body, 0, 1.13, 0, 0.32, 0.48, heavy ? 0.52 : 0.43, cloth);
  box(body, 0.16, 1.18, 0, 0.13, 0.32, heavy ? 0.48 : 0.40, armor);
  box(body, 0, 0.92, 0, 0.35, 0.10, 0.45, black);
  for (const z of [-0.12, 0, 0.12]) box(body, 0.24, 1.07, z, 0.09, 0.15, 0.09, black);
  box(body, -0.21, 1.16, 0, 0.20, 0.34, 0.35, kind === 'medic' ? white : armor);
  if (kind === 'medic') { box(body, -0.32, 1.19, 0, 0.025, 0.20, 0.055, red); box(body, -0.32, 1.19, 0, 0.025, 0.055, 0.19, red); }
  else for (const z of [-0.11,0.11]) box(body, -0.32, 1.16, z, 0.025, 0.28, 0.055, team);
  sphere(body, 0.01, 1.56, 0, 0.145, skin, 0.88, 1.14, 0.89);
  sphere(body, -0.025, 1.64, 0, 0.175, worker ? team : armor, 1.05, 0.72, 1.03);
  box(body, 0.13, 1.62, 0, 0.17, 0.04, 0.31, worker ? team : black);
  if (heavy || kind === 'swat') box(body, 0.13, 1.55, 0, 0.10, 0.09, 0.23, steel);
  for (const z of [-0.22,0.22]) box(body, 0, 1.34, z, 0.24, 0.13, 0.09, team);
  // The common rig rotates each leg around HIP, each shin around KNEE.
  box(leg, 0, -KNEE * 0.48, 0, 0.20, KNEE, 0.18, cloth);
  box(leg, 0.10, -KNEE + 0.045, 0, 0.08, 0.12, 0.17, armor);
  box(shin, 0, -0.19, 0, 0.16, 0.39, 0.16, cloth);
  box(shin, 0.065, -(HIP - KNEE) + 0.07, 0, 0.26, 0.14, 0.18, black);
  for (const g of [armL, armR]) {
    box(g, 0, -0.15, 0, 0.15, 0.30, 0.15, cloth);
    box(g, 0.025, -0.33, 0, 0.15, 0.18, 0.15, armor);
    box(g, 0.025, -0.45, 0, 0.12, 0.12, 0.12, black);
  }
  if (worker) box(armR, 0.025, -0.53, 0, 0.09, 0.24, 0.09, steel);
  else if (kind !== 'medic') {
    box(armR, 0.05, -0.52, -0.045, 0.13, heavy ? 0.58 : 0.39, 0.11, armor);
    box(armR, 0.05, heavy ? -0.86 : -0.77, -0.045, 0.075, 0.24, 0.075, black);
    box(armR, -0.04, -0.49, -0.045, 0.12, 0.12, 0.08, steel);
  }
  const make = (g: THREE.Group) => { const b = bake(g); g.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); return b; };
  const part: CharPart = { body: make(body), leg: make(leg), shin: make(shin), armL: { geo: make(armL), pivot: new THREE.Vector3(0, 1.33, -0.25) }, armR: { geo: make(armR), pivot: new THREE.Vector3(0, 1.33, 0.25) } };
  for (const m of mats) m.dispose();
  return part;
}

export function makeProceduralMilitary(kind: MilitaryLook, look: Look): CharacterRig {
  let part = cache.get(kind);
  if (!part) { part = buildPart(kind); cache.set(kind, part); }
  return new CharacterRig(part, look);
}
