import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attacks, DODGE_DURATION, FEINT_DURATION } from '../../domain/combat.js';
import { clamp, easeOut, mesh, mix, smooth, standard } from './palette.js';

const PI = Math.PI;
const cube = new THREE.BoxGeometry(1, 1, 1);
const orb = new THREE.SphereGeometry(1, 11, 8);
const capsule = new THREE.CapsuleGeometry(1, 1, 3, 8);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const shieldBoss = new THREE.TorusGeometry(0.34, 0.032, 5, 14);
const spike = new THREE.ConeGeometry(0.065, 0.22, 5);

function shaped(points, depth, bevel = 0.035) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
}

const breastplate = shaped([[-0.35, 0.30], [-0.40, 0.14], [-0.29, -0.19], [-0.20, -0.25],
  [0.20, -0.25], [0.29, -0.19], [0.40, 0.14], [0.35, 0.30]], 0.31, 0.055);
const shieldShape = shaped([[-0.32, 0.36], [0.32, 0.36], [0.38, 0.15], [0.29, -0.18], [0, -0.41], [-0.29, -0.18], [-0.38, 0.15]], 0.06, 0.029);
const shieldFace = shaped([[-0.28, 0.31], [0.28, 0.31], [0.32, 0.14], [0.24, -0.15], [0, -0.34], [-0.24, -0.15], [-0.32, 0.14]], 0.02, 0.013);
const tabard = shaped([[-0.26, 0.20], [0.26, 0.20], [0.21, -0.46], [0.02, -0.57], [-0.20, -0.47]], 0.025, 0.012);
const blade = shaped([[-0.095, 0], [0.095, 0], [0.075, 0.95], [0, 1.19], [-0.075, 0.95]], 0.035, 0.012);
const bladeRidge = shaped([[-0.023, 0.03], [0, 1.08], [0.023, 0.03]], 0.019, 0.008);
const crest = shaped([[-0.22, -0.068], [-0.27, 0.05], [-0.14, 0.15], [0.042, 0.18], [0.22, 0.105], [0.29, 0.013], [0.18, -0.055]], 0.10, 0.035);
const mask = shaped([[-0.24, 0.11], [0.24, 0.11], [0.21, -0.12], [0.075, -0.22], [-0.075, -0.22], [-0.21, -0.12]], 0.07, 0.025);

function object(parent, x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function scaled(parent, geometry, material, x, y, z, sx, sy, sz, casts = true) {
  const m = mesh(parent, geometry, material, x, y, z, casts);
  m.scale.set(sx, sy, sz);
  return m;
}

function lerpPose(out, a, b, t) {
  for (let i = 0; i < a.length; i++) out[i] = mix(a[i], b[i], t);
}

// Torso pitch/yaw/roll, sword shoulder pitch/yaw/roll, elbow, blade yaw/roll, shield pitch, blade pitch.
const idle = [0.04, -0.03, 0, -0.32, 0.05, -0.25, -0.77, 0.15, 0.81, -0.21, 0.88];
const lightWind = [0.04, -0.60, 0.06, -0.56, -0.70, -0.52, -1.22, -0.54, 0.92, -0.12, 0.85];
const lightHit = [-0.15, 0.45, -0.14, -1.22, 0.29, -0.06, -0.24, 0.49, -0.72, -0.46, 2.46];
const heavyWind = [-0.28, -0.25, 0.01, -2.69, -0.26, -0.18, -0.76, -0.15, 0.20, -0.66, 2.33];
const heavyHit = [0.47, 0.14, -0.10, -0.46, 0.03, -0.09, -0.38, 0.31, -0.47, -0.28, 1.95];
const thrustWind = [-0.17, -0.43, 0.08, 0.17, -0.3, -0.3, -1.72, -0.12, 0.60, -1.05, 1.84];
const thrustHit = [-0.23, 0.20, -0.10, -1.52, 0.27, -0.10, -0.07, 0, -0.15, -0.4, 3.18];
const block = [0.13, -0.23, 0.07, -0.24, -0.26, -0.38, -0.86, 0.08, 0.72, -1.40, 0.99];
const stagger = [-0.46, 0.20, -0.23, 0.11, -0.42, -0.72, -0.48, 0.05, 1.34, -0.12, 0.27];
const victory = [-0.14, -0.20, 0.11, -1.50, -0.12, -0.87, -1.14, -0.32, 0.22, -0.1, 2.25];
const roll = [0.62, 0, -0.36, -0.7, 0.18, -0.34, -1.12, 0.07, 0.4, -0.84, 1.26];

function batchRigidMeshes(root, dynamic) {
  const rigs = [];
  root.traverse(node => { if (node.isGroup) rigs.push(node); });
  for (const rig of rigs) {
    const buckets = new Map();
    for (const read of rig.children) {
      if (!read.isMesh || dynamic.has(read)) continue;
      const key = read.material.id + ':' + Number(read.castShadow);
      const bucket = buckets.get(key) || [];
      bucket.push(read);
      buckets.set(key, bucket);
    }
    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      const geometries = bucket.map(part => {
        part.updateMatrix();
        const copy = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        return copy.applyMatrix4(part.matrix);
      });
      const geometry = mergeGeometries(geometries);
      for (const copy of geometries) copy.dispose();
      if (!geometry) continue;
      const merged = mesh(rig, geometry, bucket[0].material, 0, 0, 0, bucket[0].castShadow);
      merged.name = 'Rigid armor batch';
      rig.remove(...bucket);
    }
  }
}

export function createFighter(scene, team) {
  const root = new THREE.Group();
  scene.add(root);
  const body = object(root, 0, 0, 0);
  const torso = object(body, 0, 1.24, 0);
  const trim = standard(team ? '#c69a73' : '#c5b18b', 0.60, 0.45);
  const metal = standard(team ? '#806259' : '#687f80', 0.64, 0.46);
  const ridge = standard('#bcc9c5', 0.69, 0.33);
  const worn = standard(team ? '#553b36' : '#364e51', 0.48, 0.58);
  const cloth = standard(team ? '#a24634' : '#39797a', 0.05, 0.88);
  const sash = standard(team ? '#663127' : '#284b4d', 0.05, 0.95);
  const leather = standard('#322b2d', 0.09, 0.88);
  const dark = standard('#1c2023', 0.22, 0.72);

  mesh(torso, breastplate, metal, 0, 0.10, -0.175);
  scaled(torso, orb, worn, 0, -0.07, -0.17, 0.35, 0.25, 0.12);
  scaled(torso, cube, trim, 0, -0.20, 0, 0.69, 0.11, 0.55);
  scaled(torso, cube, worn, 0, -0.2, 0.30, 0.14, 0.15, 0.10);
  scaled(torso, orb, leather, 0, -0.32, 0, 0.36, 0.18, 0.29);
  const banner = mesh(torso, tabard, cloth, 0, -0.31, 0.26);
  const rearCloth = mesh(torso, tabard, sash, 0, -0.30, -0.30);
  rearCloth.rotation.y = PI;
  for (const side of [-1, 1]) {
    const band = scaled(torso, cube, trim, side * 0.21, 0.08, 0.202, 0.079, 0.44, 0.06);
    band.rotation.z = side * 0.41;
    const plate = scaled(torso, cube, worn, side * 0.29, -0.27, 0.045, 0.15, 0.27, 0.41);
    plate.rotation.z = side * 0.22;
  }
  for (let i = 0; i < 3; i++) scaled(torso, orb, trim, 0, 0.28 - 0.10 * i, 0.205, 0.031, 0.031, 0.025);

  const head = object(torso, 0, 0.60, 0.025);
  scaled(head, orb, worn, 0, -0.20, 0, 0.21, 0.12, 0.21);
  scaled(head, orb, metal, 0, -0.005, -0.035, 0.28, 0.30, 0.275);
  mesh(head, mask, ridge, 0, -0.046, 0.17);
  scaled(head, cube, dark, 0, 0.015, 0.266, 0.424, 0.060, 0.025);
  scaled(head, cube, trim, 0, 0.076, 0.236, 0.49, 0.052, 0.067);
  scaled(head, cube, worn, 0, -0.056, 0.267, 0.055, 0.19, 0.042);
  for (const side of [-1, 1]) {
    scaled(head, orb, trim, side * 0.233, -0.055, 0.116, 0.064, 0.115, 0.115);
    scaled(head, cube, dark, side * 0.106, -0.115, 0.258, 0.06, 0.039, 0.025);
  }
  const plume = mesh(head, crest, cloth, 0.05, 0.27, 0);
  plume.rotation.y = PI / 2;
  if (team) plume.scale.set(1.17, 1.29, 0.78);
  const plumeTrim = scaled(head, cube, trim, 0, 0.276, 0, 0.13, 0.07, 0.41);
  plumeTrim.rotation.x = 0.04;

  function leg(side) {
    const thigh = object(body, 0.22 * side, 0.98, -0.015);
    const shin = object(thigh, 0, -0.43, 0);
    scaled(thigh, capsule, leather, 0, -0.22, 0, 0.145, 0.155, 0.145);
    scaled(thigh, cube, worn, 0, -0.19, 0.105, 0.19, 0.26, 0.09);
    scaled(shin, orb, metal, 0, 0, 0.077, 0.15, 0.135, 0.153);
    scaled(shin, capsule, metal, 0, -0.212, 0, 0.11, 0.156, 0.105);
    scaled(shin, cube, trim, 0, -0.19, 0.09, 0.061, 0.23, 0.047);
    scaled(shin, orb, leather, 0, -0.425, 0.10, 0.146, 0.089, 0.207);
    return { thigh, shin };
  }
  const legs = [leg(-1), leg(1)];

  function arm(side) {
    const shoulder = object(torso, 0.49 * side, 0.23, 0);
    const elbow = object(shoulder, 0, -0.345, 0);
    scaled(shoulder, orb, metal, 0, 0.015, 0, 0.23, 0.19, 0.22);
    scaled(shoulder, orb, trim, 0.14 * side, 0.019, 0.08, 0.105, 0.11, 0.13);
    if (team) {
      for (const d of [-1, 1]) {
        const stud = mesh(shoulder, spike, trim, side * 0.12, 0.19, d * 0.105);
        stud.rotation.z = -side * 0.34;
      }
    }
    scaled(shoulder, capsule, leather, 0, -0.205, 0, 0.112, 0.120, 0.112);
    scaled(elbow, orb, worn, 0, 0, 0, 0.122, 0.106, 0.121);
    scaled(elbow, capsule, metal, 0, -0.148, 0.015, 0.104, 0.108, 0.10);
    scaled(elbow, orb, dark, 0, -0.311, 0, 0.102, 0.105, 0.098);
    return { shoulder, elbow };
  }
  const swordArm = arm(-1);
  const shieldArm = arm(1);
  const sword = object(swordArm.elbow, 0, -0.326, 0.05);
  scaled(sword, cylinder, leather, 0, 0, 0, 0.047, 0.255, 0.047);
  scaled(sword, orb, trim, 0, -0.143, 0, 0.069, 0.067, 0.068);
  scaled(sword, cube, trim, 0, 0.146, 0.012, 0.47, 0.075, 0.094);
  mesh(sword, blade, ridge, 0, 0.173, -0.018);
  mesh(sword, bladeRidge, trim, 0, 0.19, 0.018, false);
  const bladeBase = object(sword, 0, 0.21, 0);
  const bladeTip = object(sword, 0, 1.36, 0);
  const aura = new THREE.MeshBasicMaterial({ color: team ? '#ff8a55' : '#d5f9eb', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = scaled(sword, orb, aura, 0, 0.78, 0, 0.12, 0.65, 0.07, false);
  glow.receiveShadow = false;
  glow.visible = false;

  const shield = object(shieldArm.elbow, 0.076, -0.155, 0.15);
  if (team) {
    const base = scaled(shield, cylinder, worn, 0, 0, 0.048, 0.37, 0.113, 0.37);
    base.rotation.x = PI / 2;
    mesh(shield, shieldBoss, trim, 0, 0, 0.115);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI * 2;
      scaled(shield, orb, trim, Math.sin(a) * 0.28, Math.cos(a) * 0.28, 0.122, 0.028, 0.028, 0.022);
    }
    const stripe = scaled(shield, cube, cloth, 0, 0, 0.115, 0.52, 0.105, 0.028);
    stripe.rotation.z = -PI / 4;
    scaled(shield, orb, trim, 0, 0, 0.143, 0.13, 0.13, 0.08);
  } else {
    mesh(shield, shieldShape, trim);
    mesh(shield, shieldFace, worn, 0, 0, 0.087);
    scaled(shield, cube, cloth, 0, 0.025, 0.129, 0.13, 0.50, 0.022);
    scaled(shield, cube, cloth, 0, 0.078, 0.129, 0.32, 0.092, 0.022);
    scaled(shield, orb, trim, 0, 0.053, 0.146, 0.105, 0.100, 0.065);
    for (const side of [-1, 1]) {
      for (const y of [-0.10, 0.245]) scaled(shield, orb, ridge, side * 0.22, y, 0.133, 0.028, 0.028, 0.024);
    }
  }

  batchRigidMeshes(root, new Set([banner, rearCloth, glow]));

  const pose = new Float32Array(idle);
  const target = new Float32Array(idle);
  let stride = 0, walk = 0, time = 0, death = 0;
  let footTile = 0;
  return {
    root, bladeBase, bladeTip,
    update(player, dt, camp, stopped, low, roundEnd) {
      if (!stopped) time += dt;
      target.set(idle);
      let pop = 0;
      if (player.state === 'attack') {
        const attack = attacks[player.attack];
        const wind = player.attack === 'heavy' ? heavyWind : player.attack === 'riposte' ? thrustWind : lightWind;
        const landed = player.attack === 'heavy' ? heavyHit : player.attack === 'riposte' ? thrustHit : lightHit;
        const progress = player.timer;
        if (progress < attack.windup * 0.82) lerpPose(target, idle, wind, easeOut(clamp(progress / (attack.windup * 0.65), 0, 1)));
        else if (progress < attack.windup + attack.active * 0.55) {
          const scale = (progress - attack.windup * 0.82) / (attack.windup * 0.18 + attack.active * 0.55);
          lerpPose(target, wind, landed, smooth(scale));
        } else {
          const end = (progress - attack.windup - attack.active * 0.55) / (attack.recovery + attack.active * 0.45);
          lerpPose(target, landed, idle, smooth(clamp(end, 0, 1)));
        }
        const telegraph = player.attack === 'heavy' ? 0.48 : 0.75;
        const ratio = progress / attack.windup;
        pop = ratio > telegraph && ratio < 1.1 ? clamp((ratio - telegraph) * 1.8, 0, 0.32) : 0;
      } else if (player.state === 'feint') {
        lerpPose(target, heavyWind, idle, easeOut(clamp(player.timer / FEINT_DURATION, 0, 1)));
      } else if (player.state === 'block') {
        target.set(block);
        if (player.guardStart > 0) target[9] -= 0.26 * player.guardStart / 0.17;
      } else if (player.state === 'dodge') {
        lerpPose(target, idle, roll, Math.sin(clamp(player.timer / DODGE_DURATION, 0, 1) * PI) ** 0.72);
      } else if (player.state === 'stunned') {
        const reaction = Math.min(1, player.stun * 4) * (0.74 + 0.22 * Math.cos(player.timer * 12));
        lerpPose(target, idle, stagger, reaction);
      }
      if (camp) {
        target[3] -= 0.34;
        target[6] -= 0.32;
        target[9] -= team ? 0.16 : 0.05;
      }
      if (roundEnd) {
        target.set(roundEnd === 'win' ? victory : idle);
        pop = 0;
      }
      const speed = Math.hypot(player.moveX || 0, player.moveZ || 0) * 60;
      walk = mix(walk, !roundEnd && (player.state === 'block' || player.state === 'idle') ? Math.min(speed / 3, 1) : 0, 1 - Math.exp(-dt * 12));
      if (!stopped) stride += dt * (4 + 6 * walk);
      const bob = (0.012 * Math.sin(time * 3.2) + Math.abs(Math.sin(stride)) * 0.033 * walk);
      death = mix(death, player.hp <= 0 ? 1 : 0, 1 - Math.exp(-dt * 6));
      const tumble = player.state === 'dodge' ? Math.sin(clamp(player.timer / DODGE_DURATION, 0, 1) * PI) : 0;
      body.position.y = bob - tumble * 0.31 - death * 0.16;
      body.rotation.z = -death * 1.43 + tumble * Math.sign(player.dodgeX || 1) * 0.27;
      body.rotation.x = tumble * 0.27;
      const responsiveness = player.state === 'attack' ? 27 : 18;
      const weight = 1 - Math.exp(-dt * responsiveness);
      for (let i = 0; i < pose.length; i++) pose[i] = mix(pose[i], target[i], weight);
      torso.rotation.set(pose[0], pose[1], pose[2]);
      swordArm.shoulder.rotation.set(pose[3], pose[4], pose[5]);
      swordArm.elbow.rotation.x = pose[6];
      sword.rotation.set(pose[10], pose[7], pose[8]);
      shieldArm.shoulder.rotation.set(pose[9], 0.10, player.state === 'block' ? 0.13 : 0.37);
      shieldArm.elbow.rotation.x = player.state === 'block' ? -0.76 : -0.43;
      shield.rotation.y = player.state === 'block' ? -0.29 : 0.08;
      head.rotation.y = -pose[1] * 0.57;
      head.rotation.x = -pose[0] * 0.57;
      banner.rotation.x = Math.sin(time * 4.1) * 0.055 + walk * 0.035;
      rearCloth.rotation.x = -walk * 0.25 + Math.sin(time * 3.8 + 1) * 0.065;
      aura.opacity = pop;
      glow.visible = pop > 0 && !low;
      const along = (player.moveX || 0) * Math.sin(player.angle) + (player.moveZ || 0) * Math.cos(player.angle);
      const sign = along < -0.008 ? -1 : 1;
      for (const [index, { thigh, shin }] of legs.entries()) {
        const offset = index ? PI : 0;
        const phase = stride + offset;
        thigh.rotation.x = 0.14 - Math.sin(phase) * walk * 0.61 * sign - tumble * 0.68;
        thigh.rotation.z = (index ? 1 : -1) * (0.075 + tumble * 0.14);
        shin.rotation.x = -0.12 + Math.max(0, Math.cos(phase)) * walk * 0.78 + tumble * 0.84;
      }
      const tile = Math.floor(stride / PI);
      const footstep = walk > 0.53 && tile !== footTile;
      footTile = tile;
      return footstep;
    },
  };
}
