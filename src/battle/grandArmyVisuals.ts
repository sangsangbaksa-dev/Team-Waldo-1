import * as THREE from 'three';
import { GRAND_MAX_UNITS, type UnitKind, type War } from './war';

/** Dense, low-poly soldiers share a handful of GPU draw calls via instancing. */
const TYPES: UnitKind[] = ['infantry', 'archer', 'guardian', 'cavalry'];
const COLORS = [0x50d9d1, 0xf06a77, 0xf5c45d, 0xaa8eed];
type MeshGroup = { torso: THREE.InstancedMesh; head: THREE.InstancedMesh;
  helmet: THREE.InstancedMesh; weapon: THREE.InstancedMesh; mount?: THREE.InstancedMesh;
  shields?: THREE.InstancedMesh; count: number; kind: UnitKind };

export function createGrandArmyVisuals(parent: THREE.Object3D, war: War) {
  const torsoGeo = new THREE.CylinderGeometry(.65, .58, 1.48, 6);
  const headGeo = new THREE.SphereGeometry(.53, 8, 6);
  const helmetGeo = new THREE.ConeGeometry(.65, .88, 6);
  const swordGeo = new THREE.BoxGeometry(.2, 2.0, .18);
  const bowGeo = new THREE.TorusGeometry(.63, .1, 4, 10, Math.PI * 1.45);
  const horseGeo = new THREE.BoxGeometry(2.1, 1.18, 2.7);
  const shieldGeo = new THREE.BoxGeometry(.86, 1.4, .23);
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x445a63, roughness: .54, metalness: .2 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6d2ad, roughness: .8 });
  const weaponMat = new THREE.MeshStandardMaterial({ color: 0xc3ac80, roughness: .42, metalness: .27 });
  const mountMat = new THREE.MeshStandardMaterial({ color: 0x76533f, roughness: .88 });
  const shieldMat = new THREE.MeshStandardMaterial({ color: 0xd1c2a0, roughness: .55 });
  const teamMats = COLORS.map(color => new THREE.MeshStandardMaterial({color,roughness:.7,metalness:.08}));
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh {
    const object = new THREE.InstancedMesh(geometry, material, GRAND_MAX_UNITS);
    object.count = 0;
    object.frustumCulled = false;
    object.castShadow = geometry === torsoGeo;
    object.receiveShadow = false;
    parent.add(object);
    return object;
  }
  const groups = new Map<string, MeshGroup>();
  for (let owner = 0; owner < 4; owner++) for (const kind of TYPES) {
    groups.set(owner + ':' + kind, {
      torso: mesh(torsoGeo, teamMats[owner]),
      head: mesh(headGeo, skinMat),
      helmet: mesh(helmetGeo, helmetMat),
      weapon: mesh(kind === 'archer' ? bowGeo : swordGeo, weaponMat),
      mount: kind === 'cavalry' ? mesh(horseGeo, mountMat) : undefined,
      shields: kind === 'guardian' ? mesh(shieldGeo, shieldMat) : undefined,
      kind, count: 0,
    });
  }
  const dummy = new THREE.Object3D();
  function set(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number,
    sx = 1, sy = 1, sz = 1, angle = 0) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  function update() {
    for (const group of groups.values()) group.count = 0;
    for (const unit of war.units) {
      if (unit.hp <= 0 || !war.factions[unit.owner].alive) continue;
      const group = groups.get(unit.owner + ':' + unit.kind);
      if (!group || group.count >= GRAND_MAX_UNITS) continue;
      const i = group.count++;
      const x = unit.x, z = unit.z;
      const cavalry = unit.kind === 'cavalry';
      const height = cavalry ? 1.22 : unit.kind === 'guardian' ? 1.15 : .96;
      const base = cavalry ? 1.4 : 0;
      const facing = (unit.id * 1.31) % (Math.PI * 2);
      set(group.torso, i, x, base + 1.35 * height, z, height, height, height, facing);
      set(group.head, i, x, base + 2.43 * height, z, height, height, height);
      set(group.helmet, i, x, base + 3.12 * height, z, height, height, height);
      set(group.weapon, i, x + 1.1, base + 1.45 * height, z + .4,
        unit.kind === 'archer' ? 1 : .7, unit.kind === 'archer' ? 1 : .85, 1, facing);
      if (group.mount) set(group.mount, i, x, .93, z, 1, 1, 1, facing);
      if (group.shields) set(group.shields, i, x - 1, base + 1.5, z + .3);
    }
    for (const group of groups.values()) {
      const meshes = [group.torso, group.head, group.helmet, group.weapon, group.mount, group.shields];
      for (const object of meshes) if (object) {
        object.count = group.count;
        if (group.count) object.instanceMatrix.needsUpdate = true;
      }
    }
  }
  update();
  return { update };
}
