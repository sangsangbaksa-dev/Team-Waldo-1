// OUTLAW CITY의 도보·차량 시점을 추적하고 정적 장애물 앞에서 카메라를 당깁니다.
import * as THREE from 'three';
import { clamp, angleDiff, wrapAngle, type CityMap } from './types';
import { rayStatic } from './world';

type Target = { x: number; y: number; z: number; yaw: number; speed: number };
type Look = { yaw: number; pitch: number };

export class ChaseCamera {
  private yaw = 0;
  private pitch = 0;
  private distance = 3.2;
  private shakePower = 0;
  private shakeTime = 0;
  private lastLookYaw = 0;
  private lastLookPitch = 0;
  private freeLookTime = 0;
  private fov = 70;
  private shotYaw = 0;
  private shotPitch = 0;
  private readonly focus = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly allowedPosition = new THREE.Vector3();
  private readonly displayPosition = new THREE.Vector3();
  private readonly map: CityMap;
  constructor(private readonly camera: THREE.PerspectiveCamera, map: CityMap) { this.map = map; }

  get aimYaw(): number { return this.shotYaw; }
  get aimPitch(): number { return this.shotPitch; }

  shake(power: number): void {
    if (!Number.isFinite(power) || power <= 0) return;
    this.shakePower = Math.max(this.shakePower, clamp(power, 0, 1));
    this.shakeTime = Math.max(this.shakeTime, 0.24);
  }

  reset(target?: Target, look?: Look): void {
    this.yaw = look?.yaw ?? target?.yaw ?? 0;
    this.pitch = look?.pitch ?? 0;
    this.distance = 3.2;
    this.freeLookTime = 0; this.position.set(0, 0, 0); this.lastLookYaw = this.shotYaw = this.yaw; this.lastLookPitch = this.shotPitch = this.pitch; this.fov = 70;
    this.shakePower = this.shakeTime = 0;
  }

  update(dt: number, mode: 'foot' | 'car', target: Target, look: Look, opts: { aim: boolean; lookBack: boolean; air: boolean; fovKick?: number }): void {
    const step = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
    const changed = Math.abs(angleDiff(this.lastLookYaw, look.yaw)) + Math.abs(look.pitch - this.lastLookPitch) > 0.0008;
    this.lastLookYaw = look.yaw;
    this.lastLookPitch = look.pitch;
    if (changed) this.freeLookTime = 1.65;
    else this.freeLookTime = Math.max(0, this.freeLookTime - step);

    const aimingYaw = opts.lookBack ? wrapAngle(target.yaw + Math.PI) : look.yaw;
    if (mode === 'foot') {
      this.yaw = aimingYaw;
      this.pitch = clamp(look.pitch, -0.68, 0.72);
    } else if (opts.lookBack) {
      this.yaw = this.smoothAngle(this.yaw, wrapAngle(target.yaw + Math.PI), step, 10);
      this.pitch = this.smooth(this.pitch, clamp(look.pitch, -0.35, 0.45), step, 8);
    } else if (this.freeLookTime > 0) {
      this.yaw = this.smoothAngle(this.yaw, look.yaw, step, 12);
      this.pitch = this.smooth(this.pitch, clamp(look.pitch, -0.45, 0.5), step, 10);
    } else {
      this.yaw = this.smoothAngle(this.yaw, target.yaw, step, 2.8 + Math.min(3, Math.abs(target.speed) * 0.05));
      this.pitch = this.smooth(this.pitch, 0.04, step, 2.8);
    }

    const aim = mode === 'foot' && opts.aim;
    let dist: number, height: number, side: number, wantedFov: number;
    if (mode === 'foot') {
      dist = aim ? 2.35 : 3.2;
      height = aim ? 1.48 : 1.6;
      side = aim ? 0.28 : 0.42;
      wantedFov = aim ? 55 : 70;
    } else {
      const speed = Math.abs(target.speed);
      dist = clamp(6.2 + speed * 0.045, 6.2, 8.1);
      height = 2.6;
      side = 0.25;
      wantedFov = 70 + clamp(speed / 62, 0, 1) * 22;
    }
    this.distance = this.smooth(this.distance, dist, step, 8);
    this.focus.set(target.x, target.y + (mode === 'car' ? 0.55 : 1.15) + (opts.air ? 0.15 : 0), target.z);
    const backX = Math.cos(this.yaw), backZ = Math.sin(this.yaw);
    const rightX = -Math.sin(this.yaw), rightZ = Math.cos(this.yaw);
    this.desired.set(this.focus.x - backX * this.distance + rightX * side, this.focus.y + height, this.focus.z - backZ * this.distance + rightZ * side);

    const dx = this.desired.x - this.focus.x, dy = this.desired.y - this.focus.y, dz = this.desired.z - this.focus.z;
    const rayLength = Math.hypot(dx, dy, dz);
    if (rayLength > 0.001) {
      const hit = rayStatic(this.map, this.focus.x, this.focus.y, this.focus.z, dx / rayLength, dy / rayLength, dz / rayLength, rayLength);
      const allowed = Number.isFinite(hit) ? Math.max(0.8, Math.min(rayLength, hit - 0.28)) : rayLength;
      // Reuse scratch vectors; never allocate two Vector3s for every camera frame.
      const wanted = this.allowedPosition.copy(this.focus).addScaledVector(this.desired.sub(this.focus), allowed / rayLength);
      const rate = allowed < this.position.distanceTo(this.focus) ? 24 : 6;
      if (!Number.isFinite(this.position.x) || this.position.lengthSq() < 1e-8) this.position.copy(wanted);
      else this.position.lerp(wanted, 1 - Math.exp(-rate * step));
      // 레이캐스트로 막힌 프레임에는 목표 위치를 넘지 않도록 다시 제한합니다.
      if (allowed < rayLength && this.position.distanceTo(this.focus) > allowed) this.position.copy(wanted);
    }
    if (mode === 'car' && Math.abs(target.speed) > 25) this.shakePower = Math.max(this.shakePower, Math.min(0.1, (Math.abs(target.speed) - 25) * 0.0015));
    // Screen shake is visual only. Never feed jitter into the smoothed chase
    // position: doing so causes long-lasting drift and camera-wall clipping.
    const screen = this.displayPosition.copy(this.position);
    if (this.shakeTime > 0 && this.shakePower > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - step);
      const fade = this.shakeTime > 0 ? this.shakePower : 0;
      screen.x += (Math.random() - 0.5) * fade * 0.12;
      screen.y += (Math.random() - 0.5) * fade * 0.1;
      screen.z += (Math.random() - 0.5) * fade * 0.12;
      this.shakePower *= Math.exp(-step * 8);
    }
    this.camera.position.copy(screen);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, -this.yaw - Math.PI / 2, 0);
    // 총구가 아니라 화면 중앙 레이의 실제 명중점을 향해 사격 조준을 맞춥니다.
    const rayX = Math.cos(this.yaw) * Math.cos(this.pitch), rayY = Math.sin(this.pitch), rayZ = Math.sin(this.yaw) * Math.cos(this.pitch);
    const hit = rayStatic(this.map, screen.x, screen.y, screen.z, rayX, rayY, rayZ, 60);
    const rayEnd = Number.isFinite(hit) ? hit : 60;
    const aimX = screen.x + rayX * rayEnd - target.x;
    const aimY = screen.y + rayY * rayEnd - (target.y + (mode === 'car' ? 0.7 : 1.2));
    const aimZ = screen.z + rayZ * rayEnd - target.z;
    this.shotYaw = Math.atan2(aimZ, aimX);
    this.shotPitch = Math.atan2(aimY, Math.hypot(aimX, aimZ));
    if (mode === 'foot' && aim) wantedFov = 55;
    this.fov = this.smooth(this.fov, wantedFov, step, 5);
    const displayedFov = this.fov + clamp(opts.fovKick ?? 0, 0, 6);
    if (Math.abs(this.camera.fov - displayedFov) > 0.01) { this.camera.fov = displayedFov; this.camera.updateProjectionMatrix(); }
  }

  private smooth(a: number, b: number, dt: number, rate: number): number { return a + (b - a) * (1 - Math.exp(-rate * dt)); }
  private smoothAngle(a: number, b: number, dt: number, rate: number): number { return wrapAngle(a + angleDiff(a, b) * (1 - Math.exp(-rate * dt))); }
}
