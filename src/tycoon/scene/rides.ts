// HUSTLE — reusable urban fleet; no economy unlocks or permanent upgrades.
import * as THREE from 'three';
import { makeVehicleMesh } from '../../shared/vehicle';
import { carBodiesOverlap, pointWithinCar, pushWalkerFromCar, stepDrive, type DriveState, type DriveInput, type DriveTuning } from './driving';
import type { Colliders, Layout, Zone } from './layout';
import type { Player } from './player';
import { PITCH } from './layout';

interface Ride extends DriveState { mesh: THREE.Group; name: string; tune: DriveTuning }
export interface ParkedVehicle { x: number; z: number; heading: number; active: boolean; name: string }
interface FleetSpec { name: string; kind: 'car' | 'jeep' | 'van' | 'truck'; color: number; tune: DriveTuning; district?: Zone }
const FLEET: readonly FleetSpec[] = [
  { name: '시티 세단', kind: 'car', color: 0x395877, tune: { forward: 21, reverse: 7, turnRate: 1.8, response: 2.7 } },
  { name: '오프로드 지프', kind: 'jeep', color: 0x86714c, tune: { forward: 17, reverse: 6, turnRate: 2.15, response: 2.3 } },
  { name: '배송 밴', kind: 'van', color: 0x9bafae, tune: { forward: 15, reverse: 5, turnRate: 1.6, response: 2.2 }, district: 'market' },
  { name: '항만 픽업', kind: 'truck', color: 0x697c64, tune: { forward: 17, reverse: 6, turnRate: 1.75, response: 2.2 }, district: 'harbor' },
  { name: '도심 쿠페', kind: 'car', color: 0x973e43, tune: { forward: 26, reverse: 7, turnRate: 1.65, response: 3.25 }, district: 'downtown' },
  { name: '비즈니스 세단', kind: 'car', color: 0x25292f, tune: { forward: 23, reverse: 7, turnRate: 1.7, response: 2.7 }, district: 'uptown' },
  { name: '외곽 작업차', kind: 'truck', color: 0xb38a4f, tune: { forward: 18, reverse: 6, turnRate: 1.75, response: 2.2 }, district: 'fringe' },
] as const;
const worldDistance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const RADIUS = 1.03;
const BODY_LENGTH = 1.95;

/** A vehicle is a rounded rectangle, not a single point. Check front and rear ends. */
export class Rides {
  private cars: Ride[] = [];
  private active: Ride | null = null;
  private scratch = { x: 0, z: 0 };
  private bodyProbe = { x: 0, z: 0, heading: 0 };
  private night = 0;
  private trafficBlocks: (x: number, z: number, radius: number) => boolean = () => false;
  private lamp = new THREE.SpotLight(0xffe9b8, 0, 46, Math.PI / 5, 0.55, 1.6);
  constructor(scene: THREE.Scene, layout: Layout, private colliders: Colliders, trafficBlocks?: (x: number, z: number, radius: number) => boolean) {
    if (trafficBlocks) this.trafficBlocks = trafficBlocks;
    this.lamp.castShadow = false;
    scene.add(this.lamp, this.lamp.target);
    const nearestVertical = Math.round((layout.spawn.x - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
    const nearestHorizontal = Math.round((layout.spawn.z - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
    const candidates: Array<{ x: number; z: number; heading: number }> = [
      { x: nearestVertical - 3, z: layout.spawn.z + 4, heading: -Math.PI / 2 },
      { x: nearestVertical + 3, z: layout.spawn.z - 4, heading: Math.PI / 2 },
      { x: layout.spawn.x + 5, z: nearestHorizontal - 3, heading: 0 },
      { x: layout.spawn.x - 5, z: nearestHorizontal + 3, heading: Math.PI },
    ];
    for (const [i, spec] of FLEET.entries()) {
      const positions = i < 2 ? candidates : (() => {
        const blocks = layout.blocks.filter(b => b.zone === spec.district);
        const b = blocks[Math.floor(blocks.length / 2)];
        return b ? [
          { x: b.cx + PITCH / 2 - 3, z: b.cz + 5, heading: -Math.PI / 2 },
          { x: b.cx - PITCH / 2 + 3, z: b.cz - 6, heading: Math.PI / 2 },
          { x: b.cx - 5, z: b.cz + PITCH / 2 - 3, heading: 0 },
        ] : [];
      })();
      const spot = positions.find(p => this.occupiable(p.x, p.z, p.heading));
      if (!spot) continue;
      const dims = spec.kind === 'van' ? { w: 4.9, d: 2.05, h: 2.2 } : spec.kind === 'truck' ? { w: 4.7, d: 2.1, h: 1.8 } : spec.kind === 'jeep' ? { w: 4.35, d: 2.05, h: 1.85 } : { w: 4.45, d: 1.95, h: 1.5 };
      const mesh = makeVehicleMesh({ kind: spec.kind, ...dims, c: spec.color, v: i % 2, wreck: false });
      mesh.position.set(spot.x, 0.18, spot.z); mesh.rotation.y = spot.heading;
      mesh.name = 'HUSTLE: ' + spec.name; scene.add(mesh);
      this.cars.push({ ...spot, speed: 0, mesh, name: spec.name, tune: spec.tune });
    }
  }
  get driving(): boolean { return this.active !== null; }
  setTrafficBlocker(blocker: (x: number, z: number, radius: number) => boolean): void {
    this.trafficBlocks = blocker;
  }
  setLighting(night: number): void {
    this.night = Math.max(0, Math.min(1, night));
    this.lamp.intensity = this.active ? this.night * 1.5 : 0;
  }
  private placeLamp(car: Ride): void {
    const cs = Math.cos(car.heading), sn = -Math.sin(car.heading);
    this.lamp.position.set(car.x + cs * 1.8, 1.22, car.z + sn * 1.8);
    this.lamp.target.position.set(car.x + cs * 22, 0.8, car.z + sn * 22);
    this.lamp.intensity = this.night * 1.5;
  }
  /** Place first-person view at the windscreen line, not inside opaque roof geometry. */
  positionDriverCamera(camera: THREE.PerspectiveCamera, player: Player): void {
    const car = this.active;
    if (!car || !player.firstPerson) return;
    const forward = 2.55;
    camera.position.set(car.x + Math.cos(car.heading) * forward, 1.68, car.z - Math.sin(car.heading) * forward);
  }
  get speed(): number { return Math.abs(this.active?.speed ?? 0); }
  get gear(): 'D' | 'N' | 'R' { const v = this.active?.speed ?? 0; return v > 0.25 ? 'D' : v < -0.25 ? 'R' : 'N'; }
  get name(): string | null { return this.active?.name ?? null; }
  positions(): ParkedVehicle[] { return this.cars.map(c => ({ x: c.x, z: c.z, heading: c.heading, name: c.name, active: c === this.active })); }
  snapshot(): { name: string; x: number; z: number; heading: number } | null {
    const c = this.active; return c ? { name: c.name, x: c.x, z: c.z, heading: c.heading } : null;
  }
  /** Resume an occupied car only when its validated position is collision-free. */
  restore(ride: { name: string; x: number; z: number; heading: number }, player: Player): boolean {
    const car = this.cars.find(c => c.name === ride.name);
    if (!car || !Number.isFinite(ride.x) || !Number.isFinite(ride.z) || !Number.isFinite(ride.heading) ||
      !this.occupiable(ride.x, ride.z, ride.heading, car)) return false;
    car.x = ride.x; car.z = ride.z; car.heading = Math.atan2(Math.sin(ride.heading), Math.cos(ride.heading)); car.speed = 0;
    car.mesh.position.set(car.x, 0.18, car.z); car.mesh.rotation.y = car.heading;
    this.active = car;
    this.placeLamp(car);
    player.pos.set(car.x, 0.18, car.z); player.vel.set(0, 0, 0);
    player.facing = car.heading;
    if (player.rig) player.rig.root.visible = false;
    return true;
  }
  private occupiable(x: number, z: number, heading: number, ignore?: Ride): boolean {
    for (const part of [-BODY_LENGTH, 0, BODY_LENGTH]) {
      const px = x + Math.cos(heading) * part, pz = z - Math.sin(heading) * part;
      this.colliders.resolve(px, pz, RADIUS, this.scratch);
      if (Math.hypot(this.scratch.x - px, this.scratch.z - pz) > 0.03 || this.trafficBlocks(px, pz, RADIUS)) return false;
    }
    // Reuse one probe to avoid allocating a body per collision test.
    this.bodyProbe.x = x; this.bodyProbe.z = z; this.bodyProbe.heading = heading;
    for (const other of this.cars) {
      if (other === ignore || Math.hypot(other.x - x, other.z - z) > 7) continue;
      if (carBodiesOverlap(this.bodyProbe, other)) return false;
    }
    return true;
  }
  resolveWalker(x: number, z: number, r: number, out: { x: number; z: number }): void {
    if (this.active) { out.x = x; out.z = z; return; }
    let px = x, pz = z;
    for (const car of this.cars) {
      if (Math.abs(car.x - px) > 5 || Math.abs(car.z - pz) > 5) continue;
      const point = pushWalkerFromCar(px, pz, r, car);
      px = point.x; pz = point.z;
    }
    out.x = px; out.z = pz;
  }
  /** Traffic cars yield before reaching a parked or player-controlled vehicle. */
  blocksTraffic(x: number, z: number, radius: number): boolean {
    for (const car of this.cars) {
      if (Math.abs(car.x - x) > 5 + radius || Math.abs(car.z - z) > 5 + radius) continue;
      if (pointWithinCar(x, z, radius, car)) return true;
    }
    return false;
  }
  nearby(x: number, z: number): { name: string; distance: number } | null {
    if (this.active) return { name: this.active.name, distance: 0 };
    let best: Ride | null = null, distance = 5.3;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < distance) { best = car; distance = d; }
    }
    return best ? { name: best.name, distance } : null;
  }
  toggle(player: Player): { ok: boolean; message: string } {
    if (this.active) {
      const car = this.active;
      if (Math.abs(car.speed) > 1) return { ok: false, message: '차량을 완전히 멈춘 뒤 하차하세요' };
      const offsets = [
        { x: -Math.sin(car.heading) * 2.65, z: -Math.cos(car.heading) * 2.65 },
        { x: Math.sin(car.heading) * 2.65, z: Math.cos(car.heading) * 2.65 },
        { x: -Math.cos(car.heading) * 3.2, z: Math.sin(car.heading) * 3.2 },
      ];
      const exit = offsets.find(o => {
        const x = car.x + o.x, z = car.z + o.z;
        this.colliders.resolve(x, z, 0.48, this.scratch);
        return Math.hypot(this.scratch.x - x, this.scratch.z - z) < 0.04 &&
          worldDistance({ x, z }, car) > 2.3 &&
          !this.trafficBlocks(x, z, 0.48) &&
          !this.cars.some(other => other !== car && pointWithinCar(x, z, 0.48, other));
      });
      if (!exit) return { ok: false, message: '내릴 공간이 없습니다. 차를 조금 움직여 보세요' };
      this.active = null; this.lamp.intensity = 0;
      player.teleport(car.x + exit.x, car.z + exit.z, car.heading);
      player.camYaw = car.heading - Math.PI / 2;
      player.camPitch = 0.28; player.dist = 7.5;
      if (player.rig) player.rig.root.visible = !player.firstPerson;
      return { ok: true, message: '차량에서 내렸습니다' };
    }
    let best: Ride | null = null, d = 5.3;
    for (const car of this.cars) { const n = worldDistance(car, player.pos); if (n < d) { best = car; d = n; } }
    if (!best) return { ok: false, message: '근처에 주차된 차량이 없습니다' };
    this.active = best;
    this.placeLamp(best);
    player.setFirstPerson(false);
    if (player.rig) player.rig.root.visible = false;
    player.pos.set(best.x, 0.18, best.z);
    player.vel.set(0, 0, 0);
    player.camYaw = best.heading - Math.PI / 2;
    player.camPitch = 0.35; player.dist = 10;
    return { ok: true, message: best.name + ' · W/S 가감속, A/D 조향, Space 브레이크' };
  }
  update(dt: number, input: DriveInput, player: Player, frozen: boolean): boolean {
    const car = this.active;
    if (!car) return false;
    if (frozen) return false; // Pause physics without discarding vehicle momentum.
    const impact = stepDrive(car, input, dt, car.tune, (x, z, heading) => this.occupiable(x, z, heading, car));
    car.mesh.position.set(car.x, 0.18, car.z); car.mesh.rotation.y = car.heading;
    this.placeLamp(car);
    player.pos.set(car.x, 0.18, car.z);
    player.vel.set(0, 0, 0);
    player.speed = Math.abs(car.speed);
    player.facing = car.heading;
    const follow = car.heading - Math.PI / 2;
    if (!player.firstPerson) player.camYaw += angleDelta(follow, player.camYaw) * (1 - Math.exp(-3.5 * dt));
    player.camYaw = Math.atan2(Math.sin(player.camYaw), Math.cos(player.camYaw));
    return impact;
  }
  dispose(): void {
    for (const car of this.cars) {
      car.mesh.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const material of materials) material.dispose();
        }
      });
      car.mesh.removeFromParent();
    }
    this.cars.length = 0; this.active = null;
    this.lamp.removeFromParent(); this.lamp.target.removeFromParent();
  }
}
