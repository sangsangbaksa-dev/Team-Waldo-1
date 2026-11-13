import * as THREE from 'three';
import { GRAND_MAX_UNITS, type UnitKind, type War } from './war';

/**
 * 100 vs 500 visual LOD: ten-plus armor details per warrior, still instanced
 * rather than creating a separate draw call for every soldier.
 */
const TYPES: UnitKind[] = ['infantry', 'archer', 'guardian', 'cavalry'];
const COLORS = [0x368c85, 0xb75d5a, 0xba984e, 0x806ca8];
type MeshGroup = {
  body: THREE.InstancedMesh; breastplate: THREE.InstancedMesh;
  face: THREE.InstancedMesh; helmet: THREE.InstancedMesh; visor: THREE.InstancedMesh;
  shoulder: THREE.InstancedMesh; cloak: THREE.InstancedMesh;
  leftLeg: THREE.InstancedMesh; rightLeg: THREE.InstancedMesh;
  weapon: THREE.InstancedMesh; shield?: THREE.InstancedMesh;
  shieldBoss?: THREE.InstancedMesh; quiver?: THREE.InstancedMesh;
  mount?: THREE.InstancedMesh; horseNeck?: THREE.InstancedMesh;
  horseHead?: THREE.InstancedMesh; horseLegs?: THREE.InstancedMesh;
  horseRearLeft?: THREE.InstancedMesh; horseFrontRight?: THREE.InstancedMesh;
  horseRearRight?: THREE.InstancedMesh; saddle?: THREE.InstancedMesh;
  count: number; kind: UnitKind;
};
export function createGrandArmyVisuals(parent: THREE.Object3D, war: War) {
  const torsoGeo = new THREE.CylinderGeometry(.58, .7, 1.44, 7);
  const chestGeo = new THREE.BoxGeometry(1.16, 1.05, .18);
  const headGeo = new THREE.SphereGeometry(.48, 9, 7);
  const helmetGeo = new THREE.CylinderGeometry(.54, .64, .65, 8);
  const visorGeo = new THREE.BoxGeometry(.94, .2, .26);
  const shoulderGeo = new THREE.SphereGeometry(.42, 6, 5);
  const cloakGeo = new THREE.BoxGeometry(1.25, 1.55, .16);
  const legGeo = new THREE.BoxGeometry(.49, .85, .55);
  const swordGeo = new THREE.BoxGeometry(.19, 2.05, .2);
  const spearGeo = new THREE.CylinderGeometry(.07, .08, 3.2, 5);
  const bowGeo = new THREE.TorusGeometry(.67, .075, 4, 12, Math.PI * 1.5);
  const shieldGeo = new THREE.BoxGeometry(.83, 1.52, .22);
  const horseGeo = new THREE.BoxGeometry(1.9, 1.23, 2.8);
  const neckGeo = new THREE.BoxGeometry(.73, 1.55, .82);
  const horseHeadGeo = new THREE.BoxGeometry(.95, .73, 1.03);
  const horseLegsGeo = new THREE.BoxGeometry(.36, .77, .4);
  const saddleGeo = new THREE.BoxGeometry(1.55, .22, 1.36);
  const quiverGeo = new THREE.CylinderGeometry(.24, .19, 1.18, 5);
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e9d98, roughness: .46, metalness: .55 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x314044, roughness: .52, metalness: .5 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x514034, roughness: .95 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9b092, roughness: .86 });
  const steelWeapon = new THREE.MeshStandardMaterial({ color: 0xcad2c8, roughness: .36, metalness: .68 });
  const horseMat = new THREE.MeshStandardMaterial({ color: 0x705443, roughness: .94 });
  const uniform = COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: .9 }));
  const cloaks = [0x244944, 0x703d3b, 0x68572e, 0x463960].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: .94 }));
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material): THREE.InstancedMesh => {
    const object = new THREE.InstancedMesh(geometry, material, GRAND_MAX_UNITS);
    object.count = 0;
    object.frustumCulled = false;
    object.castShadow = geometry === torsoGeo;
    object.receiveShadow = false;
    parent.add(object);
    return object;
  };
  const groups = new Map<string, MeshGroup>();
  for (let owner = 0; owner < 4; owner++) for (const kind of TYPES) {
    groups.set(owner + ':' + kind, {
      body: mesh(torsoGeo, uniform[owner]),
      breastplate: mesh(chestGeo, kind === 'guardian' ? steel : darkSteel),
      face: mesh(headGeo, skin),
      helmet: mesh(helmetGeo, kind === 'guardian' ? steel : darkSteel),
      visor: mesh(visorGeo, darkSteel),
      shoulder: mesh(shoulderGeo, steel),
      cloak: mesh(cloakGeo, cloaks[owner]),
      leftLeg: mesh(legGeo, leather),
      rightLeg: mesh(legGeo, leather),
      weapon: mesh(kind === 'archer' ? bowGeo : kind === 'guardian' ? spearGeo : swordGeo, steelWeapon),
      shield: kind === 'infantry' || kind === 'guardian' ? mesh(shieldGeo, uniform[owner]) : undefined,
      shieldBoss: kind === 'infantry' || kind === 'guardian' ? mesh(shoulderGeo, steel) : undefined,
      quiver: kind === 'archer' ? mesh(quiverGeo, leather) : undefined,
      mount: kind === 'cavalry' ? mesh(horseGeo, horseMat) : undefined,
      horseNeck: kind === 'cavalry' ? mesh(neckGeo, horseMat) : undefined,
      horseHead: kind === 'cavalry' ? mesh(horseHeadGeo, horseMat) : undefined,
      horseLegs: kind === 'cavalry' ? mesh(horseLegsGeo, leather) : undefined,
      horseRearLeft: kind === 'cavalry' ? mesh(horseLegsGeo, leather) : undefined,
      horseFrontRight: kind === 'cavalry' ? mesh(horseLegsGeo, leather) : undefined,
      horseRearRight: kind === 'cavalry' ? mesh(horseLegsGeo, leather) : undefined,
      saddle: kind === 'cavalry' ? mesh(saddleGeo, uniform[owner]) : undefined,
      kind,
      count: 0,
    });
  }
  const dummy = new THREE.Object3D();
  const facingById = new Map<number, {x: number; z: number; angle: number}>();
  let reducedMotion = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const set = (target: THREE.InstancedMesh | undefined, index: number,
    x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, angle = 0) => {
    if (!target) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    target.setMatrixAt(index, dummy.matrix);
  };
  // Convert model-space left/right/front offsets into an individual unit's facing.
  const offset = (x: number, z: number, right: number, front: number, angle: number): [number, number] =>
    [x + right * Math.cos(angle) + front * Math.sin(angle),
     z - right * Math.sin(angle) + front * Math.cos(angle)];
  function update(): void {
    for (const group of groups.values()) group.count = 0;
    const alive = new Set<number>();
    for (const unit of war.units) {
      if (unit.hp <= 0 || !war.factions[unit.owner].alive) continue;
      const group = groups.get(unit.owner + ':' + unit.kind);
      if (!group || group.count >= GRAND_MAX_UNITS) continue;
      alive.add(unit.id);
      const prev = facingById.get(unit.id);
      const dx = unit.x - (prev?.x ?? unit.x), dz = unit.z - (prev?.z ?? unit.z);
      const moving = dx * dx + dz * dz > .00002;
      const angle = moving ? Math.atan2(dx, dz) : (prev?.angle ?? (unit.id * 1.31) % (Math.PI * 2));
      facingById.set(unit.id, { x: unit.x, z: unit.z, angle });
      const i = group.count++, x = unit.x, z = unit.z, cavalry = unit.kind === 'cavalry';
      const height = unit.kind === 'guardian' ? 1.16 : unit.kind === 'archer' ? .94 : 1;
      const base = cavalry ? 1.34 : 0;
      // Individual phase offsets keep hundreds of soldiers from marching in lockstep.
      const gait = moving && !reducedMotion ? Math.sin(war.time * (cavalry ? 12.2 : 9.6) + unit.id * .71) : 0;
      const bob = moving && !reducedMotion ? Math.abs(gait) * .075 : 0;
      const y = base + bob;
      set(group.body, i, x, y + 1.32 * height, z, height, height, height, angle);
      const [chestX, chestZ] = offset(x, z, 0, .55 * height, angle);
      set(group.breastplate, i, chestX, y + 1.42 * height, chestZ, height, height, height, angle);
      set(group.face, i, x, y + 2.37 * height, z, height, height, height, angle);
      set(group.helmet, i, x, y + 2.82 * height, z, height, height, height, angle);
      const [visorX, visorZ] = offset(x, z, 0, .51 * height, angle);
      set(group.visor, i, visorX, y + 2.66 * height, visorZ, height, height, height, angle);
      const [shoulderX, shoulderZ] = offset(x, z, -.8 * height, 0, angle);
      set(group.shoulder, i, shoulderX, y + 1.97 * height, shoulderZ, height, height, height, angle);
      const [capeX, capeZ] = offset(x, z, 0, -.55 * height, angle);
      set(group.cloak, i, capeX, y + 1.2 * height, capeZ, height, height, height, angle);
      for (const [meshLeg, sign] of [[group.leftLeg, -1], [group.rightLeg, 1]] as const) {
        const [lx, lz] = offset(x, z, sign * .4 * height, -sign * gait * .24, angle);
        set(meshLeg, i, lx, y + (.42 + Math.max(0, sign * gait) * .12) * height,
          lz, height, height, height, angle);
      }
      const [wx, wz] = offset(x, z, 1.18 * height, .35 * height, angle);
      set(group.weapon, i, wx, y + (unit.kind === 'guardian' ? 1.84 : 1.59) * height, wz,
        unit.kind === 'archer' ? 1 : .8, unit.kind === 'guardian' ? 1 : .94, 1, angle);
      if (group.shield) {
        const [sx, sz] = offset(x, z, -1.16 * height, .52 * height, angle);
        set(group.shield, i, sx, y + 1.44 * height, sz,
          unit.kind === 'guardian' ? 1.28 : 1, unit.kind === 'guardian' ? 1.22 : 1, 1, angle);
        const [bx, bz] = offset(x, z, -1.16 * height, .7 * height, angle);
        set(group.shieldBoss, i, bx, y + 1.44 * height, bz, .36, .36, .2, angle);
      }
      if (group.quiver) {
        const [qx, qz] = offset(x, z, -.58 * height, -.53 * height, angle);
        set(group.quiver, i, qx, y + 1.8 * height, qz, .9, 1, .9, angle);
      }
      if (cavalry) {
        set(group.mount, i, x, .9, z, 1, 1, 1, angle);
        const [nx, nz] = offset(x, z, 0, 1.05, angle);
        set(group.horseNeck, i, nx, 1.5, nz, 1, 1, 1, angle);
        const [hx, hz] = offset(x, z, 0, 1.54, angle);
        set(group.horseHead, i, hx, 2.2, hz, 1, 1, 1, angle);
        set(group.saddle, i, x, 1.63, z, 1, 1, 1, angle);
        const positions = [
          [group.horseLegs, -.64, .9, 1],
          [group.horseFrontRight, .64, .9, -1],
          [group.horseRearLeft, -.64, -.98, -1],
          [group.horseRearRight, .64, -.98, 1],
        ] as const;
        for (const [leg, side, forward, phase] of positions) {
          const [lx, lz] = offset(x, z, side, forward + gait * phase * .18, angle);
          set(leg, i, lx, .37 + Math.max(0, gait * phase) * .13, lz, 1, 1, 1, angle);
        }
      }
    }
    for (const id of facingById.keys()) if (!alive.has(id)) facingById.delete(id);
    for (const group of groups.values()) {
      const all = [group.body, group.breastplate, group.face, group.helmet,
        group.visor, group.shoulder, group.cloak, group.leftLeg, group.rightLeg,
        group.weapon, group.shield, group.shieldBoss, group.quiver, group.mount,
        group.horseNeck, group.horseHead, group.horseLegs, group.horseRearLeft,
        group.horseFrontRight, group.horseRearRight, group.saddle];
      for (const object of all) if (object) {
        object.count = group.count;
        if (group.count) object.instanceMatrix.needsUpdate = true;
      }
    }
  }
  function setReducedMotion(enabled: boolean): void {
    reducedMotion = enabled;
  }
  update();
  return { update, setReducedMotion };
}
