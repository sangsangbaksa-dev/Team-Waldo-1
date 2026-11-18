import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cleanLoadout, type PartId, type PartSlot, type ModularGun } from './attachments';
import type { WeaponId } from './config';

export const WEAPON_CODES: Record<WeaponId, string> = { pistol: 'P9 / SIDEARM', smg: 'VX–9 / PERSONAL DEFENSE', rifle: 'AR–416 / ASSAULT', shotgun: 'M12 / BREACHER', sniper: 'SR–700 / PRECISION' };
export function mountPoints(id: WeaponId): Record<PartSlot, THREE.Vector3> {
  const pistol = id === 'pistol';
  return { optic: new THREE.Vector3(pistol ? -0.02 : -0.1, pistol ? 0.16 : 0.2, 0), muzzle: new THREE.Vector3(pistol ? 0.29 : id === 'sniper' ? 1.04 : id === 'smg' ? 0.55 : 0.8, 0.065, 0), grip: new THREE.Vector3(0.3, -0.1, 0), magazine: new THREE.Vector3(pistol ? -0.12 : 0.04, -0.13, 0) };
}
function palette() {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x38414a, metalness: 0.88, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x151a20, metalness: 0.55, roughness: 0.36 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x282c2b, metalness: 0.08, roughness: 0.72 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x7c858b, metalness: 0.95, roughness: 0.28 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x91816a, metalness: 0.35, roughness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x3eafc0, metalness: 0.25, roughness: 0.08, transparent: true, opacity: 0.68, clearcoat: 1, side: THREE.DoubleSide }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff593d }),
  };
}
type Palette = ReturnType<typeof palette>;
function block(root: THREE.Object3D, m: THREE.Material, size: [number, number, number], pos: [number, number, number], bevel = 0.009): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 2, Math.min(bevel, ...size.map(s => s / 4))), m); mesh.position.set(...pos); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
}
function tube(root: THREE.Object3D, m: THREE.Material, r: number, length: number, pos: [number, number, number], axis: 'x' | 'y' | 'z' = 'x', r2 = r): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, length, 24), m); if (axis === 'x') mesh.rotation.z = -Math.PI / 2; if (axis === 'z') mesh.rotation.x = Math.PI / 2; mesh.position.set(...pos); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
}
function rail(root: THREE.Object3D, m: Palette, from: number, to: number, y: number): void {
  block(root, m.dark, [to - from, 0.022, 0.075], [(to + from) / 2, y, 0]);
  for (let x = from; x < to; x += 0.033) block(root, m.steel, [0.018, 0.025, 0.105], [x, y + 0.018, 0], 0.002);
}
export function makePart(id: PartId): THREE.Group {
  const root = new THREE.Group(), m = palette(); root.name = `part:${id}`;
  if (id === 'redDot') {
    block(root, m.dark, [0.16, 0.035, 0.12], [0, 0.025, 0]);
    for (const z of [-0.058, 0.058]) block(root, m.steel, [0.055, 0.11, 0.018], [0, 0.085, z]);
    block(root, m.steel, [0.065, 0.02, 0.14], [0, 0.145, 0]); block(root, m.glass, [0.008, 0.085, 0.098], [0.018, 0.096, 0], 0.001);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 8), m.dot); dot.position.set(-0.002, 0.095, 0); root.add(dot);
    tube(root, m.dark, 0.025, 0.025, [-0.035, 0.055, 0.075], 'z');
  } else if (id === 'scope4') {
    for (const x of [-0.12, 0.08]) { block(root, m.steel, [0.045, 0.09, 0.12], [x, 0.04, 0]); tube(root, m.dark, 0.062, 0.04, [x, 0.12, 0]); }
    tube(root, m.steel, 0.045, 0.39, [0, 0.12, 0]); tube(root, m.dark, 0.077, 0.12, [0.23, 0.12, 0], 'x', 0.055);
    tube(root, m.dark, 0.058, 0.08, [-0.24, 0.12, 0]); tube(root, m.glass, 0.067, 0.005, [0.292, 0.12, 0]);
    tube(root, m.glass, 0.05, 0.005, [-0.282, 0.12, 0]); tube(root, m.dark, 0.039, 0.07, [0.01, 0.185, 0], 'y');
    for (let x = -0.25; x < -0.18; x += 0.01) tube(root, m.polymer, 0.061, 0.004, [x, 0.12, 0]);
  } else if (id === 'suppressor' || id === 'compensator') {
    const suppress = id === 'suppressor', len = suppress ? 0.32 : 0.11, r = suppress ? 0.048 : 0.035;
    tube(root, m.dark, r, len, [len / 2, 0, 0]); tube(root, m.edge, r * 0.9, 0.009, [len, 0, 0]); tube(root, m.dark, r * 0.48, 0.012, [len + 0.004, 0, 0]);
    for (let x = 0.02; x < len - 0.025; x += suppress ? 0.022 : 0.027) {
      if (suppress) tube(root, m.steel, r + 0.001, 0.004, [x, 0, 0]);
      else for (const z of [-r, r]) block(root, m.polymer, [0.014, 0.028, 0.005], [x, 0, z], 0.001);
    }
  } else if (id === 'verticalGrip' || id === 'angledGrip') {
    block(root, m.steel, [0.15, 0.026, 0.095], [0, 0, 0]);
    const handle = new THREE.Group(); handle.rotation.z = id === 'angledGrip' ? -0.65 : -0.08; root.add(handle);
    block(handle, m.polymer, [0.075, 0.21, 0.07], [0, -0.1, 0]);
    for (let y = -0.04; y > -0.19; y -= 0.028) block(handle, m.dark, [0.079, 0.009, 0.075], [0, y, 0], 0.002);
  } else {
    const extended = id === 'extendedMag', len = extended ? 0.35 : 0.23;
    block(root, m.steel, [0.13, len, 0.082], [0, -len / 2, 0]);
    for (const z of [-0.043, 0.043]) for (const x of [-0.035, 0.025]) block(root, m.dark, [0.012, len * 0.78, 0.004], [x, -len / 2, z], 0.001);
    block(root, extended ? m.tan : m.polymer, [0.15, 0.034, 0.1], [0, -len, 0]);
    if (!extended) { const loop = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.012, 8, 20), m.tan); loop.position.y = -len - 0.04; root.add(loop); }
  }
  // Release palette materials unused by this particular part.
  const used = new Set<THREE.Material>(); root.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.material) used.add(mesh.material as THREE.Material); });
  Object.values(m).filter(mat => !used.has(mat)).forEach(mat => mat.dispose());
  return root;
}
export function makeModularGun(gun: Pick<ModularGun, 'id' | 'parts'>): THREE.Group {
  const root = new THREE.Group(), m = palette(), id = gun.id, pistol = id === 'pistol', sniper = id === 'sniper', short = id === 'smg', anchors = mountPoints(id);
  root.name = 'modular-weapon';
  if (pistol) {
    block(root, m.steel, [0.5, 0.14, 0.1], [0.02, 0.07, 0]); block(root, m.polymer, [0.42, 0.06, 0.095], [-0.02, -0.025, 0]);
    const grip = block(root, m.polymer, [0.13, 0.26, 0.095], [-0.14, -0.14, 0]); grip.rotation.z = -0.18;
    for (let x = -0.2; x < -0.06; x += 0.025) for (const z of [-0.052, 0.052]) block(root, m.dark, [0.009, 0.085, 0.006], [x, 0.08, z], 0.001);
    tube(root, m.edge, 0.024, 0.085, [0.25, 0.065, 0]); block(root, m.steel, [0.12, 0.025, 0.075], [0.02, -0.13, 0]); block(root, m.steel, [0.025, 0.12, 0.07], [0.07, -0.075, 0]);
  } else {
    block(root, m.steel, [0.55, 0.18, 0.14], [-0.08, 0.05, 0]); block(root, m.dark, [0.44, 0.11, 0.13], [-0.1, -0.07, 0]);
    block(root, m.polymer, [short ? 0.28 : 0.48, 0.13, 0.145], [short ? 0.29 : 0.4, 0.04, 0]);
    tube(root, m.steel, 0.024, anchors.muzzle.x - 0.35, [(anchors.muzzle.x + 0.35) / 2, 0.065, 0]); tube(root, m.dark, 0.037, 0.07, [anchors.muzzle.x - 0.03, 0.065, 0]);
    for (const side of [-1, 1]) for (let x = 0.23; x < (short ? 0.4 : 0.58); x += 0.053) block(root, m.dark, [0.028, 0.05, 0.008], [x, 0.055, side * 0.076], 0.004);
    rail(root, m, -0.32, short ? 0.39 : 0.62, 0.16);
    const stock = block(root, sniper ? m.tan : m.polymer, [0.43, 0.2, 0.12], [-0.61, -0.005, 0]); stock.rotation.z = -0.05;
    block(root, m.dark, [0.044, 0.25, 0.145], [-0.84, -0.025, 0]); block(root, m.steel, [0.2, 0.035, 0.075], [-0.56, 0.1, 0]);
    const grip = block(root, m.polymer, [0.105, 0.24, 0.1], [-0.24, -0.19, 0]); grip.rotation.z = -0.25;
    for (let y = -0.11; y > -0.29; y -= 0.03) block(root, m.dark, [0.11, 0.008, 0.106], [-0.24 + (y + 0.19) * 0.25, y, 0], 0.002);
    block(root, m.steel, [0.16, 0.02, 0.08], [-0.12, -0.22, 0]); block(root, m.steel, [0.02, 0.12, 0.08], [-0.04, -0.16, 0]);
    block(root, m.edge, [0.12, 0.04, 0.007], [-0.015, 0.055, 0.074]); tube(root, m.dark, 0.022, 0.022, [-0.26, 0.065, 0.085], 'z');
    for (const x of [-0.3, 0.12]) for (const z of [-0.075, 0.075]) tube(root, m.edge, 0.009, 0.007, [x, -0.02, z], 'z');
    if (sniper) { tube(root, m.steel, 0.012, 0.1, [-0.05, 0.02, 0.13], 'z'); tube(root, m.dark, 0.023, 0.03, [-0.05, 0.02, 0.19], 'z'); }
    if (id === 'shotgun') tube(root, m.dark, 0.022, 0.53, [0.47, -0.018, 0]);
  }
  const loadout = cleanLoadout(id, gun.parts);
  for (const [slot, part] of Object.entries(loadout)) { const mesh = makePart(part); mesh.position.copy(anchors[slot as PartSlot]); mesh.userData.slot = slot; root.add(mesh); }
  if (!loadout.magazine) { const mag = new THREE.Group(); mag.position.copy(anchors.magazine); root.add(mag); block(mag, m.polymer, [pistol ? 0.1 : 0.12, pistol ? 0.17 : 0.22, 0.075], [0, -0.1, 0]); block(mag, m.dark, [0.14, 0.025, 0.09], [0, -0.21, 0]); }
  const used = new Set<THREE.Material>(); root.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.material) used.add(mesh.material as THREE.Material); }); Object.values(m).filter(mat => !used.has(mat)).forEach(mat => mat.dispose());
  return root;
}
export function disposeModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
  root.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => mats.add(m)); });
  geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
}
