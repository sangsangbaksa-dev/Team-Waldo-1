import * as THREE from 'three';
import { batchStaticChildren } from './renderBatches';
import { BASE_WIDTH, HQ_SLOT, getBaseState, type PlacedStructure } from './base';
import type { War } from './war';

type BuildingKind = PlacedStructure['kind'];
type Marker = { mesh: THREE.Mesh; phase: number };

/**
 * A readable, industrial-fantasy construction district.
 * Buildings are purely visual: costs, collision, slot picking and the
 * authoritative war simulation remain unchanged.
 *
 * All rigid details are merged by material after construction. Old merged
 * buffers are disposed when a building is added, rather than leaking GPU memory.
 */
export function createBaseDistrict(scene: THREE.Scene, war: War): {
  update(elapsed?: number, reducedMotion?: boolean): void;
  slotAt(x: number, z: number): number | null; dispose(): void;
} {
  const owner = war.factions[0];
  const district = new THREE.Group();
  district.name = 'Player construction district';
  district.position.set(owner.x + 38, .12, owner.z - 2);
  scene.add(district);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(.5, .5, 1, 10);
  const hex = new THREE.CylinderGeometry(.5, .5, 1, 6);
  const cone = new THREE.ConeGeometry(.5, 1, 6);
  const crystal = new THREE.OctahedronGeometry(.5, 0);
  const sphere = new THREE.SphereGeometry(.5, 10, 8);
  const torus = new THREE.TorusGeometry(.5, .07, 6, 14);
  // A pitched prism, not the previous conical roof.
  const roofGeometry = new THREE.BufferGeometry();
  roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5,-.5,-.5, 0,.5,-.5, .5,-.5,-.5,
    -.5,-.5,.5, .5,-.5,.5, 0,.5,.5,
    -.5,-.5,-.5, -.5,-.5,.5, 0,.5,-.5,
    -.5,-.5,.5, 0,.5,.5, 0,.5,-.5,
    0,.5,-.5, 0,.5,.5, .5,-.5,-.5,
    .5,-.5,-.5, 0,.5,.5, .5,-.5,.5,
  ], 3));
  roofGeometry.computeVertexNormals();

  const matte = (color: number, metalness = .08, roughness = .87) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const concrete = matte(0x536166), concreteLight = matte(0x89948f);
  const concreteDark = matte(0x303c42), steel = matte(0x81928d, .62, .5);
  const iron = matte(0x26383e, .55, .49), bronze = matte(0xc1a16b, .49, .45);
  const wood = matte(0x5b4739), woodLight = matte(0x96795d);
  const roof = matte(0x2e4e55, .22, .66), soil = matte(0x655a46);
  const crop = matte(0x8ba76d), straw = matte(0xc7ac69);
  const grass = matte(0x405a4e), gravel = matte(0x424e50);
  const glass = matte(0x537e83, .32, .24);
  const banner = new THREE.MeshStandardMaterial({
    color: 0x49b7a8, side: THREE.DoubleSide, roughness: .72,
  });
  const light = new THREE.MeshStandardMaterial({
    color: 0xffd69b, emissive: 0xc17a2c, emissiveIntensity: .8, roughness: .34,
  });
  const ore = new THREE.MeshStandardMaterial({
    color: 0x7bd5de, emissive: 0x2e8093, emissiveIntensity: .32,
    roughness: .27, metalness: .38,
  });
  const geometries = [box, cylinder, hex, cone, crystal, sphere, torus, roofGeometry];
  const materials = [concrete, concreteLight, concreteDark, steel, iron, bronze,
    wood, woodLight, roof, soil, crop, straw, grass, gravel, glass, banner, light, ore];

  function part(parent: THREE.Group, shape: THREE.BufferGeometry, surface: THREE.Material,
    x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
    const mesh = new THREE.Mesh(shape, surface);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = false; // district shares the battlefield's shadow budget
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const block = (parent: THREE.Group, surface: THREE.Material,
    x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    part(parent, box, surface, x, y, z, sx, sy, sz);
  const barrel = (parent: THREE.Group, surface: THREE.Material,
    x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    part(parent, cylinder, surface, x, y, z, sx, sy, sz);

  const staticGeometry = new Set<THREE.BufferGeometry>();
  // Static meshes with identical surfaces collapse into material groups.
  function bake(group: THREE.Group, keep: ReadonlySet<THREE.Object3D> = new Set()): void {
    for (const batch of batchStaticChildren(group, keep)) staticGeometry.add(batch.geometry);
  }

  // The plaza surface is independent of buildings so its GPU buffers are kept.
  const plaza = new THREE.Group();
  plaza.name = 'Construction plaza';
  district.add(plaza);
  block(plaza, gravel, 0, -.14, 0, 47.1, .14, 47.1);
  for (let slot = 0; slot < BASE_WIDTH * BASE_WIDTH; slot++) {
    const col = slot % BASE_WIDTH, row = Math.floor(slot / BASE_WIDTH);
    const x = (col - 2) * 9, z = (row - 2) * 9;
    block(plaza, slot === HQ_SLOT ? bronze : concreteDark, x, .015, z, 8.55, .1, 8.55);
    block(plaza, slot === HQ_SLOT ? concrete : gravel, x, .1, z, 8.15, .075, 8.15);
    // Corner plates and individual tile markings survive an empty slot.
    for (const dx of [-3.8, 3.8]) for (const dz of [-3.8, 3.8])
      block(plaza, steel, x + dx, .18, z + dz, .35, .05, .35);
    if (slot !== HQ_SLOT) {
      block(plaza, concreteLight, x, .17, z - 3.65, 1.3, .045, .08);
      block(plaza, concreteLight, x, .17, z + 3.65, 1.3, .045, .08);
    }
  }
  // Traversable-looking promenades are recessed between the construction pads.
  for (let lane = -1.5; lane <= 1.5; lane++) {
    block(plaza, steel, lane * 9, .025, 0, .12, .045, 44);
    block(plaza, steel, 0, .025, lane * 9, 44, .045, .12);
  }
  for (const x of [-22.4, 22.4]) {
    block(plaza, concrete, x, .32, 0, .7, .75, 46);
    for (const z of [-18, -9, 0, 9, 18])
      barrel(plaza, bronze, x, .9, z, .75, .33, .75);
  }
  bake(plaza);

  const command = new THREE.Group();
  command.name = 'Central command spire';
  district.add(command);
  // HQ remains in the protected center slot and is not part of a placed structure.
  barrel(command, concreteDark, 0, .36, 0, 7.4, .6, 7.4);
  barrel(command, concreteLight, 0, .8, 0, 5.8, .65, 5.8);
  barrel(command, concrete, 0, 2.75, 0, 4.5, 4.1, 4.5);
  for (const x of [-1.7, 1.7]) for (const z of [-1.7, 1.7]) {
    barrel(command, iron, x, 2.1, z, .65, 3.5, .65);
    block(command, steel, x, 4.15, z, 1.15, .45, 1.15);
  }
  barrel(command, iron, 0, 5.05, 0, 5.3, .75, 5.3);
  part(command, cone, roof, 0, 6.5, 0, 6.5, 2.7, 6.5);
  barrel(command, iron, 0, 8.8, 0, .32, 2.75, .32);
  part(command, crystal, ore, 0, 10.5, 0, 1.35, 2.1, 1.35);
  for (const z of [-2.24, 2.24]) {
    block(command, iron, 0, 3.2, z, 1.6, 1.45, .16);
    block(command, bronze, 0, 4.03, z, 1.75, .2, .25);
  }
  for (const x of [-3.1, 3.1]) {
    block(command, iron, x, 4.1, 0, .18, 4.6, .18);
    block(command, banner, x + .55, 5.6, 0, 1.13, 1.55, .1);
  }
  bake(command);

  const constructed = new THREE.Group();
  constructed.name = 'Constructed buildings';
  district.add(constructed);
  let buildingBuffers = new Set<THREE.BufferGeometry>();
  let markers: Marker[] = [];
  let last = '';
  let animationPhase = 0;

  function foundation(group: THREE.Group): void {
    block(group, concreteDark, 0, .29, 0, 7.65, .45, 7.65);
    block(group, concreteLight, 0, .56, 0, 7.25, .1, 7.25);
    for (const x of [-3.55, 3.55]) {
      block(group, bronze, x, .7, 0, .12, .12, 6.85);
    }
  }
  function towerLight(group: THREE.Group, x: number, z: number, h = 4): void {
    barrel(group, iron, x, h * .48, z, .18, h, .18);
    part(group, sphere, light, x, h + .17, z, .47, .42, .47);
  }
  function doorway(group: THREE.Group, width = 1.9, height = 2.3, z = 2.45): void {
    block(group, iron, 0, height / 2 + .47, z, width, height, .18);
    block(group, steel, 0, height + .5, z + .06, width + .5, .24, .25);
    for (const x of [-width * .38, width * .38])
      block(group, bronze, x, height * .5 + .35, z + .15, .11, 1.45, .11);
  }
  function mineBuilding(group: THREE.Group, advanced: boolean): void {
    // Open gantry, winch drum, mineral loading and deep shaft entrance.
    block(group, concrete, 0, 1.52, -.8, 5.6, 1.95, 4.3);
    doorway(group, 2.3, 1.7, 1.4);
    for (const x of [-2.6, 2.6]) {
      block(group, iron, x, 4.7, -.7, .48, 6.6, .5);
      const brace = block(group, steel, x * .63, 4.65, -.7, .22, 5.8, .23);
      brace.rotation.z = x > 0 ? -.28 : .28;
    }
    block(group, steel, 0, 7.8, -.7, 6.6, .48, .65);
    barrel(group, bronze, 0, 6.5, -.7, 2.5, .7, 2.5).rotation.z = Math.PI / 2;
    for (const x of [-1.9, 1.9]) {
      part(group, torus, iron, x, 6.5, -.7, 1.85, 1.85, 1.85).rotation.y = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++) {
      const gem = part(group, crystal, ore, -2.7 + i * 1.32, .96, 2.9 + i % 2 * .23,
        .8, 1.65 + i % 3 * .25, .8);
      gem.rotation.z = i % 2 ? -.3 : .28;
    }
    for (const x of [-2.8, 2.8]) block(group, wood, x, .78, 1.75, .62, 1.2, 1.1);
    if (advanced) {
      towerLight(group, 2.9, -2.75, 6.4);
      block(group, iron, 0, 3.2, -3.35, 4.8, 3.2, .7);
      barrel(group, steel, 0, 5.8, -3.35, 1.65, 2.7, 1.65);
    }
  }
  function farmBuilding(group: THREE.Group, advanced: boolean): void {
    // A reinforced greenhouse with transparent glazing and irrigated beds.
    block(group, wood, 0, 1.4, -1.25, 6.15, 2.5, 3.5);
    block(group, glass, 0, 2.05, .72, 6, 2.5, .13);
    part(group, roofGeometry, roof, 0, 3.46, -1.25, 6.6, 2.5, 4.6);
    for (const x of [-2.5, 0, 2.5])
      block(group, steel, x, 2.1, .82, .18, 2.65, .28);
    for (const x of [-2.35, -.8, .8, 2.35]) {
      block(group, soil, x, .72, 2.7, 1.02, .26, 1.25);
      for (const z of [2.25, 2.62, 3.0]) {
        part(group, cone, crop, x, 1.12, z, .65, .85, .65);
        part(group, sphere, straw, x, 1.54, z, .18, .19, .18);
      }
    }
    for (const x of [-2.7, 2.7]) {
      barrel(group, woodLight, x, 1.95, -2.83, 1.2, 3, 1.2);
      part(group, cone, iron, x, 3.9, -2.83, 1.54, 1.3, 1.54);
    }
    if (advanced) {
      barrel(group, steel, 0, 4.25, -1.25, .5, 2.3, .5);
      part(group, sphere, light, 0, 5.55, -1.25, .65, .55, .65);
    }
  }
  function barracksBuilding(group: THREE.Group, advanced: boolean): void {
    // Low armored barracks, weapon racks and a visible training court.
    block(group, concrete, 0, 2.2, -1.0, 6.4, 3.35, 4.2);
    part(group, roofGeometry, roof, 0, 4.55, -1, 6.9, 2.1, 5);
    doorway(group, 2.2, 2.7, 1.16);
    for (const x of [-2.65, 2.65]) {
      block(group, banner, x, 3.1, 1.2, .91, 1.25, .15);
      block(group, steel, x, 1.15, 1.24, 1.24, .16, .22);
    }
    for (const x of [-2.5, -.8, .8, 2.5]) {
      block(group, wood, x, 1.05, 3.12, .23, 1.3, .28);
      block(group, steel, x, 2.25, 3.12, .12, 1.3, .14);
    }
    if (advanced) {
      for (const x of [-2.75, 2.75]) {
        barrel(group, iron, x, 5.9, -2.5, .2, 2.85, .2);
        block(group, banner, x + .53, 7.0, -2.5, 1.15, 1.4, .13);
      }
      towerLight(group, -3, -3, 5.2);
    }
  }
  function defenseTower(group: THREE.Group, advanced: boolean): void {
    // Crenellated watchtower with a lit observation deck and gun slit.
    barrel(group, concrete, 0, 3.1, -.35, 4.4, 5.6, 4.4);
    barrel(group, iron, 0, 6.13, -.35, 5.2, .6, 5.2);
    barrel(group, steel, 0, 6.6, -.35, 5.55, .33, 5.55);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const x = Math.sin(angle) * 2.25, z = Math.cos(angle) * 2.25 - .35;
      block(group, concreteLight, x, 7.1, z, .93, .92, .83).rotation.y = angle;
    }
    block(group, iron, 0, 3, 1.9, 1.0, 2.1, .18);
    block(group, glass, 0, 5.4, 1.95, 1.45, .6, .15);
    block(group, steel, 0, 5.35, 2.3, .38, .32, 2.4);
    for (const x of [-2.3, 2.3]) {
      block(group, concreteDark, x, 1.6, 0, .68, 2.6, .78);
      towerLight(group, x, -2.0, 4.2);
    }
    if (advanced) {
      barrel(group, iron, 0, 8.15, -.35, .3, 2.15, .3);
      part(group, crystal, ore, 0, 9.5, -.35, .9, 1.35, .9);
    }
  }

  const kindCounts: Record<BuildingKind, number> = { mine: 0, farm: 0, barracks: 0, fort: 0 };
  function construct(item: PlacedStructure): void {
    const col = item.slot % BASE_WIDTH, row = Math.floor(item.slot / BASE_WIDTH);
    const g = new THREE.Group();
    g.name = 'Building / ' + item.kind + ' / slot ' + item.slot;
    g.position.set((col - 2) * 9, 0, (row - 2) * 9);
    g.userData.slot = item.slot;
    g.userData.kind = item.kind;
    constructed.add(g);
    const advanced = kindCounts[item.kind]++ > 0;
    foundation(g);
    if (item.kind === 'mine') mineBuilding(g, advanced);
    else if (item.kind === 'farm') farmBuilding(g, advanced);
    else if (item.kind === 'barracks') barracksBuilding(g, advanced);
    else defenseTower(g, advanced);
    // A tiny beacon pulses over each structure; otherwise every part is static.
    const phase = item.slot * 1.39;
    const beacon = part(g, sphere, light, 0,
      7.6 + (item.kind === 'fort' ? 1.35 : 0) + Math.sin(animationPhase + phase) * .13, 0,
      .32, .42, .32);
    beacon.name = 'Construction beacon';
    markers.push({ mesh: beacon, phase });
    for (const batch of batchStaticChildren(g, new Set([beacon])))
      buildingBuffers.add(batch.geometry);
  }
  const motionPreference = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;

  function update(elapsed = 0, reducedMotion = false): void {
    const base = getBaseState(war);
    const signature = base.structures.map(s => s.kind + ':' + s.slot).join('|');
    if (signature !== last) {
      last = signature;
      for (const buffer of buildingBuffers) buffer.dispose();
      buildingBuffers = new Set();
      constructed.clear();
      markers = [];
      kindCounts.mine = kindCounts.farm = kindCounts.barracks = kindCounts.fort = 0;
      for (const item of base.structures) construct(item);
    }
    // Blueprint changes still render while paused. Only decorative motion needs time.
    if (reducedMotion || motionPreference?.matches || !Number.isFinite(elapsed) || elapsed <= 0) return;
    animationPhase = (animationPhase + elapsed * 1.56) % (Math.PI * 2);
    for (const marker of markers) {
      marker.mesh.position.y = 7.6 + (marker.mesh.parent?.userData.kind === 'fort' ? 1.35 : 0) +
        Math.sin(animationPhase + marker.phase) * .13;
    }
  }
  /** Preserve the existing world-space construction picking contract. */
  function slotAt(x: number, z: number): number | null {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const localX = x - district.position.x, localZ = z - district.position.z;
    const col = Math.round(localX / 9) + 2, row = Math.round(localZ / 9) + 2;
    if (col < 0 || col >= BASE_WIDTH || row < 0 || row >= BASE_WIDTH) return null;
    if (Math.abs(localX - (col - 2) * 9) > 4.1 ||
      Math.abs(localZ - (row - 2) * 9) > 4.1) return null;
    const slot = row * BASE_WIDTH + col;
    return getBaseState(war).structures.some(s => s.slot === slot) ? slot : null;
  }
  function dispose(): void {
    scene.remove(district);
    for (const buffer of staticGeometry) buffer.dispose();
    for (const buffer of buildingBuffers) buffer.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
  update();
  return { update, slotAt, dispose };
}
