// TYCOON — 플레이어 이동·카메라(3인칭/1인칭). 입력은 game.ts 가 모아 넘겨 줍니다.
import * as THREE from 'three';
import type { CharacterKit, CharacterRig } from '../../shared/character';
import type { Colliders } from './layout';

export interface MoveInput { mx: number; mz: number; run: boolean }
const WALK = 3.4, RUN = 6.4, RADIUS = 0.45, EYE = 1.62;
const wrap = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** 단계별 옷차림: 늘 평범한 시민이고, 올라갈수록 색이 말끔해집니다(작업복·광부 차림은 쓰지 않습니다). */
export function outfitFor(stage: number): { kind: string; team: number; seed: number } {
  if (stage <= 0) return { kind: 'civ', team: 0x6e6455, seed: 11 };
  if (stage <= 2) return { kind: 'civ3', team: 0x3a6ea5, seed: 11 };
  if (stage <= 4) return { kind: 'civ5', team: 0x2a3140, seed: 11 };
  return { kind: 'civ8', team: 0x14171e, seed: 11 };
}

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  rig: CharacterRig | null = null;
  facing = 0; camYaw = 0; camPitch = 0.28; dist = 7.5; firstPerson = false;
  speed = 0; private bob = 0; private outfit = ''; private wave = 0;
  private camPos = new THREE.Vector3(); private camInit = false; private tmp = { x: 0, z: 0 };

  constructor(private scene: THREE.Scene, private kit: CharacterKit | null) {}

  setOutfit(stage: number): void {
    if (!this.kit) return;
    const o = outfitFor(stage), key = `${o.kind}${o.team}`; if (key === this.outfit) return;
    this.outfit = key; if (this.rig) this.scene.remove(this.rig.root);
    this.rig = this.kit.create(o.kind, o.seed, o.team); this.rig.root.rotation.y = this.facing; this.scene.add(this.rig.root); this.rig.root.visible = !this.firstPerson;
  }
  teleport(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0.18, z); this.vel.set(0, 0, 0); this.facing = yaw; this.camYaw = yaw + Math.PI; this.camInit = false;
    if (this.rig) { this.rig.root.position.copy(this.pos); this.rig.root.rotation.y = this.facing; }
  }
  celebrate(): void { this.wave = 1.4; }
  setFirstPerson(on: boolean): void { this.firstPerson = on; if (this.rig) this.rig.root.visible = !on; if (on) this.camPitch = 0; else this.camPitch = 0.28; }

  update(dt: number, input: MoveInput, colliders: Colliders, frozen: boolean, extra?: (x: number, z: number, radius: number, out: { x: number; z: number }) => void): void {
    const len = Math.hypot(input.mx, input.mz), mag = frozen ? 0 : Math.min(1, len);
    const target = mag * (input.run ? RUN : WALK);
    // 카메라 기준 이동 방향
    let dx = 0, dz = 0;
    if (mag > 0.01) { const ix = input.mx / len, iz = input.mz / len, sn = Math.sin(this.camYaw), cs = Math.cos(this.camYaw); dx = ix * cs - iz * sn; dz = -ix * sn - iz * cs; }
    const ax = dx * target, az = dz * target, k = Math.min(1, dt * 10);
    this.vel.x += (ax - this.vel.x) * k; this.vel.z += (az - this.vel.z) * k;
    const steps = Math.max(1, Math.ceil(dt / 0.04)), sd = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * sd; this.pos.z += this.vel.z * sd;
      colliders.resolve(this.pos.x, this.pos.z, RADIUS, this.tmp); this.pos.x = this.tmp.x; this.pos.z = this.tmp.z;
      if (extra) { extra(this.pos.x, this.pos.z, RADIUS, this.tmp); colliders.resolve(this.tmp.x, this.tmp.z, RADIUS, this.tmp); this.pos.x = this.tmp.x; this.pos.z = this.tmp.z; }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.firstPerson) this.facing = this.camYaw + Math.PI / 2;
    else if (this.speed > 0.4) { const want = Math.atan2(-this.vel.z, this.vel.x), d = wrap(want - this.facing); this.facing += d * Math.min(1, dt * 12); }
    if (this.wave > 0) this.wave = Math.max(0, this.wave - dt);
    if (this.rig) {
      const r = this.rig; r.root.position.set(this.pos.x, 0.18, this.pos.z); r.root.rotation.y = this.facing;
      r.state.speed = this.speed; r.state.wave = this.wave > 0 ? Math.min(1, this.wave * 2) : 0; r.step(dt); r.update(dt);
    }
    this.bob += this.speed * dt * 1.9;
  }

  /** 카메라 배치. 3인칭은 건물 안으로 파고들지 않게 끌어당깁니다. */
  placeCamera(camera: THREE.PerspectiveCamera, dt: number, colliders: Colliders): void {
    const px = this.pos.x, pz = this.pos.z;
    if (this.firstPerson) {
      const y = 0.18 + EYE + Math.sin(this.bob * 2) * 0.03 * Math.min(1, this.speed / 3);
      camera.position.set(px, y, pz); camera.rotation.order = 'YXZ'; camera.rotation.set(this.camPitch, this.camYaw, 0); this.camInit = false; return;
    }
    const ty = 1.55, cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch), sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    let d = this.dist; const t = this.tmp;
    for (let s = 1.2; s <= this.dist; s += 0.5) {
      const x = px + sy * cp * s, z = pz + cy * cp * s, y = 0.18 + ty + sp * s;
      if ((y < 7 && colliders.resolve(x, z, 0.5, t) && Math.hypot(t.x - x, t.z - z) > 0.2) || colliders.crownHit(x, y, z, 0.45)) { d = Math.max(1.4, s - 0.9); break; }
    }
    const wx = px + sy * cp * d, wy = Math.max(0.6, 0.18 + ty + sp * d), wz = pz + cy * cp * d;
    if (!this.camInit) { this.camPos.set(wx, wy, wz); this.camInit = true; }
    const k = 1 - Math.pow(0.0005, dt); this.camPos.x += (wx - this.camPos.x) * k; this.camPos.y += (wy - this.camPos.y) * k; this.camPos.z += (wz - this.camPos.z) * k;
    camera.position.copy(this.camPos); camera.lookAt(px, 0.18 + ty, pz);
  }
  look(dx: number, dy: number): void {
    this.camYaw -= dx; this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * (this.firstPerson ? -1 : 1), this.firstPerson ? -1.3 : -0.1, this.firstPerson ? 1.3 : 1.2);
    if (this.firstPerson) this.camPitch = THREE.MathUtils.clamp(this.camPitch, -1.3, 1.3);
  }
  dispose(): void { if (this.rig) this.scene.remove(this.rig.root); }
}
