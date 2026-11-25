import * as THREE from 'three';
import { RIFLE, type Player } from '../domain/combat.js';
import { blendMotion } from './visual-motion.js';

const PANTS = new THREE.MeshStandardMaterial({ color: '#4b5146', roughness: 1 });
const JACKET = new THREE.MeshStandardMaterial({ color: '#666853', roughness: 0.96 });
const WEBBING = new THREE.MeshStandardMaterial({ color: '#7c7155', roughness: 0.95 });
const METAL = new THREE.MeshStandardMaterial({ color: '#353935', roughness: 0.52, metalness: 0.28 });
const DARK = new THREE.MeshStandardMaterial({ color: '#202522', roughness: 0.84 });
const WOOD = new THREE.MeshStandardMaterial({ color: '#554739', roughness: 0.82 });
const GLASS = new THREE.MeshStandardMaterial({ color: '#4d6457', roughness: 0.28, metalness: 0.45, emissive: '#1a271e' });
const FACE = new THREE.MeshStandardMaterial({ color: '#a0816b', roughness: 0.96 });
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(0.5, 9, 7);
const unitTube = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const unitCapsule = new THREE.CapsuleGeometry(0.5, 0.5, 3, 7);

function part(root: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
  x: number, y: number, z: number, w: number, h: number, d: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  root.add(mesh);
  return mesh;
}

export function rifle(root: THREE.Object3D) {
  const receiver = new THREE.Group();
  root.add(receiver);
  part(receiver, unitBox, WOOD, 0, -0.048, 0.032, 0.089, 0.086, 0.56);
  part(receiver, unitBox, WOOD, 0, -0.066, 0.374, 0.087, 0.146, 0.24).rotation.x = -0.19;
  part(receiver, unitBox, DARK, 0, -0.09, 0.499, 0.086, 0.14, 0.027).rotation.x = -0.11;
  part(receiver, unitBox, METAL, 0, 0.001, -0.027, 0.085, 0.046, 0.36);
  part(receiver, unitBox, DARK, 0, -0.091, -0.067, 0.067, 0.083, 0.116).rotation.x = -0.15;
  part(receiver, unitBox, WOOD, 0, -0.047, -0.365, 0.068, 0.061, 0.38);
  const tube = (material: THREE.Material, y: number, z: number, diameter: number, length: number) =>
    part(receiver, unitTube, material, 0, y, z, diameter, length, diameter).rotateX(Math.PI / 2);
  tube(METAL, 0.007, -0.48, 0.039, 0.78);
  tube(DARK, 0.007, -0.866, 0.055, 0.075);
  tube(METAL, 0.093, -0.035, 0.059, 0.32);
  tube(DARK, 0.093, -0.188, 0.095, 0.105);
  tube(DARK, 0.093, 0.125, 0.082, 0.12);
  tube(GLASS, 0.093, 0.188, 0.064, 0.006);
  tube(GLASS, 0.093, -0.242, 0.074, 0.006);
  part(receiver, unitBox, METAL, 0, 0.042, 0.064, 0.056, 0.045, 0.044);
  part(receiver, unitBox, METAL, 0, 0.041, -0.117, 0.061, 0.045, 0.047);
  part(receiver, unitTube, DARK, 0, 0.134, -0.043, 0.039, 0.038, 0.039);
  part(receiver, unitTube, METAL, 0.036, 0.093, -0.043, 0.04, 0.026, 0.04).rotateZ(Math.PI / 2);
  const bolt = new THREE.Group();
  bolt.position.set(0, 0.019, 0.114);
  receiver.add(bolt);
  part(bolt, unitTube, METAL, 0.054, -0.02, 0, 0.017, 0.078, 0.017).rotateZ(-1.01);
  part(bolt, unitSphere, DARK, 0.088, -0.043, 0, 0.036, 0.036, 0.04);
  return bolt;
}

function glintTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,245,198,1)');
  grad.addColorStop(0.18, 'rgba(255,212,140,0.76)');
  grad.addColorStop(0.5, 'rgba(255,187,106,0.22)');
  grad.addColorStop(1, 'rgba(255,173,69,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

let glintMap: THREE.Texture | undefined;
export class OperatorView {
  readonly root = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly glint: THREE.Sprite;
  private readonly protector: THREE.Mesh;
  private gait = 0;
  private phase = 0;
  private aim = 0;
  private generation = -1;

  constructor() {
    this.root.add(this.spine);
    part(this.spine, unitCapsule, JACKET, 0, 1.17, 0.01, 0.49, 0.38, 0.31);
    part(this.spine, unitBox, WEBBING, 0, 1.17, -0.078, 0.43, 0.4, 0.205);
    part(this.spine, unitBox, PANTS, 0, 1.24, 0.196, 0.39, 0.38, 0.18);
    part(this.spine, unitSphere, FACE, 0, 1.633, -0.01, 0.291, 0.318, 0.292);
    part(this.spine, unitSphere, PANTS, 0, 1.71, 0.011, 0.356, 0.244, 0.35);
    part(this.spine, unitBox, DARK, 0, 1.661, -0.133, 0.285, 0.047, 0.052);
    part(this.spine, unitBox, DARK, 0, 0.946, 0, 0.45, 0.096, 0.29);

    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.115, 0.888, 0);
      this.root.add(leg);
      this.legs.push(leg);
      part(leg, unitCapsule, PANTS, 0, -0.42, 0.018, 0.243, 0.53, 0.254);
      part(leg, unitBox, DARK, 0, -0.785, -0.028, 0.193, 0.195, 0.326);
      part(leg, unitBox, WEBBING, 0, -0.415, -0.108, 0.163, 0.151, 0.06);
      const arm = new THREE.Group();
      arm.position.set(side * 0.236, 1.402, 0);
      this.spine.add(arm);
      this.arms.push(arm);
      arm.rotation.z = side * 0.18;
      part(arm, unitCapsule, JACKET, 0, -0.144, 0, 0.193, 0.288, 0.2);
      part(arm, unitSphere, DARK, 0, -0.384, -0.025, 0.153, 0.178, 0.17);
    }

    const weapon = new THREE.Group();
    weapon.name = 'weapon';
    weapon.position.set(0.143, 1.329, -0.31);
    weapon.scale.setScalar(0.84);
    rifle(weapon);
    this.spine.add(weapon);

    glintMap ??= glintTexture();
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glintMap, color: '#ffd58b', blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.glint.position.set(0.14, 1.405, -0.525);
    this.spine.add(this.glint);
    this.protector = part(this.root, unitCapsule, new THREE.MeshBasicMaterial({
      color: '#edc678', transparent: true, opacity: 0.15, wireframe: true, depthWrite: false,
    }), 0, 0.91, 0, 0.81, 1.25, 0.8);
    this.root.traverse(child => {
      if (child instanceof THREE.Mesh && child !== this.protector) child.castShadow = true;
    });
  }

  update(player: Player, camera: THREE.Vector3, dt: number, time: number): void {
    this.root.visible = player.alive;
    if (!player.alive) return;
    if (this.generation !== player.generation) { this.generation = player.generation; this.gait = this.phase = this.aim = 0; }
    this.root.position.set(player.position.x, player.position.y, player.position.z);
    this.root.rotation.y = player.yaw;
    this.root.scale.y = player.height / 1.8;
    const gaitTarget = player.moving ? 1 : 0;
    this.gait = THREE.MathUtils.lerp(this.gait, gaitTarget, 1 - Math.exp(-dt * 13));
    this.phase += dt * (player.sprinting ? 15 : 10);
    const stride = Math.sin(this.phase) * this.gait;
    this.aim += (Number(player.aiming) - this.aim) * blendMotion(dt, 14);
    this.spine.rotation.x += ((player.sprinting ? -0.18 : player.crouched ? -0.15 : 0) - this.spine.rotation.x) * blendMotion(dt, 12);
    this.legs[0].rotation.x = stride * 0.7;
    this.legs[1].rotation.x = -stride * 0.7;
    this.arms[0].rotation.x = -1.13 + stride * 0.14;
    this.arms[1].rotation.x = -1.48 - stride * 0.14;
    const weapon = this.spine.getObjectByName('weapon')!;
    weapon.rotation.x = THREE.MathUtils.lerp(-0.18 + stride * 0.07, player.pitch, this.aim);
    weapon.position.y = THREE.MathUtils.lerp(1.329, 1.416, this.aim);
    this.glint.position.y = weapon.position.y + 0.08;
    const dx = camera.x - player.position.x, dz = camera.z - player.position.z;
    const distance = Math.hypot(dx, dz);
    const facing = (-Math.sin(player.yaw) * dx - Math.cos(player.yaw) * dz) / Math.max(distance, 1);
    const glint = this.aim * THREE.MathUtils.smoothstep(facing, 0.76, 0.94) * THREE.MathUtils.smoothstep(distance, 27, 42);
    this.glint.visible = glint > 0.01;
    this.glint.scale.setScalar(0.36 + Math.min(distance * 0.008, 1.6));
    this.glint.material.opacity = glint * 0.52;
    this.protector.visible = player.protectedUntil > time;
    (this.protector.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(time * 9) * 0.035;
  }

  dispose(): void {
    this.glint.material.dispose();
    (this.protector.material as THREE.Material).dispose();
  }
}

export class ViewRifle {
  readonly root = new THREE.Group();
  private readonly bolt: THREE.Group;
  private stride = 0;
  private phase = 0;
  private lastTime = -1;

  constructor() {
    this.bolt = rifle(this.root);

  }

  reset(): void { this.stride = this.phase = 0; this.lastTime = -1; }

  update(player: Player, time: number, aim: number, breath: boolean): void {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(0.065, time - this.lastTime)); this.lastTime = time;
    this.stride += (Number(player.moving) - this.stride) * blendMotion(dt, 12);
    this.phase += dt * (player.sprinting ? 13 : 9);
    const stride = Math.sin(this.phase) * this.stride;
    const settle = (1 - aim) * (breath ? 0.3 : 1);
    const reload = player.reloadUntil > time ? Math.sin(Math.PI * Math.min(1, (player.reloadUntil - time) / RIFLE.reload)) : 0;
    const cycle = player.boltUntil > time ? 1 - (player.boltUntil - time) / RIFLE.cycle : 0;
    const workingBolt = Math.sin(Math.PI * THREE.MathUtils.clamp((cycle - 0.13) / 0.65, 0, 1));
    this.root.position.set(0.28 * (1 - aim) + Math.sin(time * 1.5) * 0.006 * settle,
      -0.24 - reload * 0.31 + stride * 0.026 * settle + aim * 0.145, -0.63 - aim * 0.12);
    this.root.rotation.set(-0.012 - reload * 0.31 + stride * 0.018, (1 - aim) * -0.073 - reload * 0.21,
      (player.sprinting ? 0.17 : -0.073) * (1 - aim) - reload * 0.36);
    this.bolt.rotation.z = workingBolt * 1.14;
    this.bolt.position.z = 0.114 + workingBolt ** 2 * 0.083;
    this.root.visible = player.alive && aim < 0.78;
  }
}
