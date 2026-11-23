// HUSTLE — session-only drivable cars. The economic simulation does not own vehicles.
import * as THREE from 'three';
import { makeVehicleMesh } from '../../shared/vehicle';
import type { Colliders } from './layout';
import type { Player, MoveInput } from './player';

interface Ride { mesh: THREE.Group; name: string; x: number; z: number; heading: number; speed: number; maxSpeed: number; steering: number }
const clamp = THREE.MathUtils.clamp;
const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Rides {
  private cars: Ride[] = [];
  private active: Ride | null = null;
  private scratch = { x: 0, z: 0 };
  constructor(private scene: THREE.Scene, spawn: { x: number; z: number }, private colliders: Colliders) {
    const specs = [
      { name: '시티 세단', kind: 'car', color: 0x2c526b, maxSpeed: 21, steering: 1.85, dx: 4.5, dz: 2 },
      { name: '오프로드 지프', kind: 'jeep', color: 0x80683f, maxSpeed: 16.5, steering: 2.25, dx: -5, dz: -3 },
    ] as const;
    for (const [index, s] of specs.entries()) {
      const mesh = makeVehicleMesh({ kind: s.kind, w: s.kind === 'jeep' ? 4.3 : 4.5, d: 2, h: 1.7, c: s.color, v: index, wreck: false });
      const safe = { x: spawn.x + s.dx, z: spawn.z + s.dz };
      colliders.resolve(safe.x, safe.z, 1.1, safe);
      mesh.position.set(safe.x, 0.18, safe.z);
      mesh.rotation.y = index === 0 ? 0 : Math.PI;
      scene.add(mesh);
      this.cars.push({ mesh, name: s.name, x: safe.x, z: safe.z, heading: index === 0 ? 0 : Math.PI, speed: 0, maxSpeed: s.maxSpeed, steering: s.steering });
    }
  }
  get driving(): boolean { return this.active !== null; }
  get speed(): number { return Math.abs(this.active?.speed ?? 0); }
  nearby(x: number, z: number): { name: string; distance: number } | null {
    if (this.active) return { name: this.active.name, distance: 0 };
    const sorted = this.cars.map(c => ({ car: c, distance: Math.hypot(c.x - x, c.z - z) })).sort((a, b) => a.distance - b.distance);
    return sorted[0] && sorted[0].distance < 5.2 ? { name: sorted[0].car.name, distance: sorted[0].distance } : null;
  }
  toggle(player: Player): string {
    if (this.active) {
      const car = this.active;
      if (Math.abs(car.speed) > 2) return '차를 세운 뒤 내릴 수 있습니다';
      const dx = -Math.sin(car.heading) * 2.7, dz = -Math.cos(car.heading) * 2.7;
      this.colliders.resolve(car.x + dx, car.z + dz, 0.45, this.scratch);
      if (Math.hypot(this.scratch.x - car.x, this.scratch.z - car.z) < 1.6) return '내릴 공간이 없습니다';
      this.active = null;
      player.teleport(this.scratch.x, this.scratch.z, car.heading);
      if (player.rig) player.rig.root.visible = !player.firstPerson;
      return '차량에서 내렸습니다';
    }
    const nearest = this.cars.map(c => ({ c, d: Math.hypot(c.x - player.pos.x, c.z - player.pos.z) })).sort((a, b) => a.d - b.d)[0];
    if (!nearest || nearest.d >= 5.2) return '주차된 차량에 가까이 가세요';
    this.active = nearest.c;
    player.setFirstPerson(false);
    if (player.rig) player.rig.root.visible = false;
    player.pos.set(nearest.c.x, 0.18, nearest.c.z);
    player.camYaw = -nearest.c.heading - Math.PI / 2;
    player.camPitch = 0.34;
    player.dist = 9;
    return nearest.c.name + ' 탑승 · WASD 운전 · F 하차';
  }
  update(dt: number, input: MoveInput, player: Player, frozen: boolean): void {
    const c = this.active;
    if (!c) return;
    if (frozen) { c.speed = 0; return; }
    const throttle = clamp(input.mz, -1, 1);
    const target = throttle >= 0 ? throttle * c.maxSpeed : throttle * 7;
    const response = throttle ? 2.8 : 3.5;
    c.speed += (target - c.speed) * Math.min(1, dt * response);
    if (Math.abs(c.speed) < 0.04) c.speed = 0;
    const steer = clamp(-input.mx, -1, 1);
    if (Math.abs(c.speed) > 0.15) c.heading += steer * c.steering * (c.speed / c.maxSpeed) * dt;
    // Sweep movement to avoid tunneling through buildings at low frame rates.
    const count = Math.max(1, Math.ceil(Math.abs(c.speed * dt) / 0.55));
    for (let i = 0; i < count; i++) {
      const nx = c.x + Math.cos(c.heading) * c.speed * dt / count;
      const nz = c.z - Math.sin(c.heading) * c.speed * dt / count;
      this.colliders.resolve(nx, nz, 1.13, this.scratch);
      if (Math.hypot(this.scratch.x - nx, this.scratch.z - nz) > 0.18) { c.speed = 0; break; }
      c.x = this.scratch.x; c.z = this.scratch.z;
    }
    c.mesh.position.set(c.x, 0.18, c.z);
    c.mesh.rotation.y = c.heading;
    player.pos.set(c.x, 0.18, c.z);
    player.vel.set(0, 0, 0);
    player.speed = Math.abs(c.speed);
    player.facing = -c.heading;
    const desiredYaw = -c.heading - Math.PI / 2;
    player.camYaw += angleDelta(desiredYaw, player.camYaw) * Math.min(1, dt * 3);
  }
  dispose(): void {
    for (const c of this.cars) {
      c.mesh.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) mat.dispose();
        }
      });
      c.mesh.removeFromParent();
    }
    this.cars.length = 0;
    this.active = null;
  }
}
