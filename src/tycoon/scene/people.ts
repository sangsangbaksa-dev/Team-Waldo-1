// TYCOON — 거리의 사람들과 자동차. 보도 모서리 그래프를 따라 걷고, 도로 차선을 따라 달립니다.
import * as THREE from 'three';
import type { CharacterKit, CharacterRig } from '../../shared/character';
import { CIVILIANS } from '../../shared/character';
import { makeVehicleMesh } from '../../shared/vehicle';
import { HALF, PITCH, WALK_EDGE, WORLD_HALF, hash01 } from './layout';
import type { Quality } from './city';

interface Node { i: number; j: number; sx: number; sz: number }
const nodePos = (n: Node): [number, number] => [n.i * PITCH + n.sx * WALK_EDGE, n.j * PITCH + n.sz * WALK_EDGE];
const inGrid = (i: number, j: number): boolean => Math.abs(i) <= HALF && Math.abs(j) <= HALF;
/** 모서리 노드의 이웃: 같은 구획의 인접 모서리 둘 + 길 건너 맞은편 둘. */
function neighbors(n: Node): Node[] {
  const out: Node[] = [{ i: n.i, j: n.j, sx: -n.sx, sz: n.sz }, { i: n.i, j: n.j, sx: n.sx, sz: -n.sz }];
  if (inGrid(n.i + n.sx, n.j)) out.push({ i: n.i + n.sx, j: n.j, sx: -n.sx, sz: n.sz });
  if (inGrid(n.i, n.j + n.sz)) out.push({ i: n.i, j: n.j + n.sz, sx: n.sx, sz: -n.sz });
  return out;
}
const same = (a: Node, b: Node): boolean => a.i === b.i && a.j === b.j && a.sx === b.sx && a.sz === b.sz;

interface Walker { rig: CharacterRig; x: number; z: number; from: Node; to: Node; prev: Node | null; speed: number; lane: number; yaw: number; wait: number; active: boolean }

export class Crowd {
  readonly group = new THREE.Group();
  private walkers: Walker[] = [];
  private target = 0;
  constructor(scene: THREE.Scene, kit: CharacterKit, quality: Quality) {
    scene.add(this.group);
    const total = quality === 'high' ? 44 : quality === 'standard' ? 28 : 14;
    for (let k = 0; k < total; k++) {
      const rig = kit.create(CIVILIANS[k % CIVILIANS.length], 500 + k * 7); rig.root.visible = false; this.group.add(rig.root);
      const n: Node = { i: Math.floor(hash01(k, 1) * 7) - 3, j: Math.floor(hash01(k, 2) * 7) - 3, sx: hash01(k, 3) < 0.5 ? -1 : 1, sz: hash01(k, 4) < 0.5 ? -1 : 1 };
      const [x, z] = nodePos(n);
      this.walkers.push({ rig, x, z, from: n, to: n, prev: null, speed: 1.0 + hash01(k, 5) * 0.8, lane: (hash01(k, 6) - 0.5) * 1.6, yaw: 0, wait: 0, active: false });
    }
    this.setStage(0);
  }
  setStage(stage: number): void { this.target = Math.round(this.walkers.length * Math.min(1, 0.45 + stage * 0.1)); }
  private pickNext(w: Walker): void {
    const opts = neighbors(w.to).filter(n => !same(n, w.from)), next = opts[Math.floor(Math.random() * opts.length)] ?? w.from;
    w.prev = w.from; w.from = w.to; w.to = next;
  }
  update(dt: number, cam: THREE.Vector3, night: number, rain: number, unlockedAt: (i: number, j: number) => boolean): void {
    const limit = Math.round(this.target * (1 - night * 0.55) * (1 - rain * 0.45));
    let n = 0;
    for (const w of this.walkers) {
      const want = n++ < limit;
      if (!want) { if (w.active && Math.hypot(w.x - cam.x, w.z - cam.z) > 40) { w.active = false; w.rig.root.visible = false; } else if (!w.active) continue; }
      if (want && !w.active) { // 열린 구획 모서리에서 등장
        let tries = 0, node: Node = w.from; do { node = { i: Math.floor(Math.random() * 7) - 3, j: Math.floor(Math.random() * 7) - 3, sx: Math.random() < 0.5 ? -1 : 1, sz: Math.random() < 0.5 ? -1 : 1 }; } while (!unlockedAt(node.i, node.j) && ++tries < 30);
        const [x, z] = nodePos(node); if (Math.hypot(x - cam.x, z - cam.z) < 18) continue; w.from = w.to = node; w.prev = null; w.x = x; w.z = z; w.active = true; this.pickNext(w);
      }
      const [tx0, tz0] = nodePos(w.to), [fx0, fz0] = nodePos(w.from), dx0 = tx0 - fx0, dz0 = tz0 - fz0, l0 = Math.hypot(dx0, dz0) || 1;
      const tx = tx0 + (-dz0 / l0) * w.lane, tz = tz0 + (dx0 / l0) * w.lane, dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
      if (w.wait > 0) { w.wait -= dt; w.rig.state.speed = 0; }
      else if (d < 0.6) { w.wait = hash01(w.x, w.z) < 0.2 ? 1 + Math.random() * 3 : 0; this.pickNext(w); if (!unlockedAt(w.to.i, w.to.j) && Math.random() < 0.6) { const back = w.from; w.from = w.to; w.to = back; } }
      else { const sp = w.speed; w.x += (dx / d) * sp * dt; w.z += (dz / d) * sp * dt; w.yaw = Math.atan2(-dz, dx); w.rig.state.speed = sp * 1.8; }
      const dist = Math.hypot(w.x - cam.x, w.z - cam.z), vis = dist < 120;
      w.rig.root.visible = vis; if (!vis) continue;
      w.rig.root.position.set(w.x, 0.18, w.z); const cur = w.rig.root.rotation.y; let dy = w.yaw - cur; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; w.rig.root.rotation.y = cur + dy * Math.min(1, dt * 8);
      w.rig.setDetail(dist > 70 ? 3 : dist > 40 ? 1 : 0); w.rig.step(dt); w.rig.update(dt);
    }
  }
  /** Driving obstacle query: pedestrians do not become ghost objects on crosswalks. */
  blocks(x: number, z: number, radius: number): boolean {
    const r2 = (radius + 0.45) * (radius + 0.45);
    for (const walker of this.walkers) {
      if (!walker.active || !walker.rig.root.visible) continue;
      const dx = x - walker.x, dz = z - walker.z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }
  /** 플레이어 가까이에 있는 사람들(말풍선·부딪힘 회피용). */
  dispose(): void { this.group.removeFromParent(); }
}

interface Car { mesh: THREE.Group; axis: 'x' | 'z'; line: number; lane: number; dir: 1 | -1; t: number; speed: number; halfLength: number; halfWidth: number }
const CAR_COLORS = [0xb83a34, 0x2f5f9a, 0xd8d8d2, 0x23262b, 0x3a7a58, 0xd0a23a, 0x6a6e74, 0x8a4aa0];

export class Traffic {
  readonly group = new THREE.Group();
  private cars: Car[] = []; private target = 0;
  private lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false }); private tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  constructor(scene: THREE.Scene, quality: Quality) {
    scene.add(this.group);
    const total = quality === 'high' ? 16 : quality === 'standard' ? 10 : 5, roads: number[] = []; for (let k = 0; k <= 2 * HALF + 1; k++) roads.push(k * PITCH - (HALF * PITCH + PITCH / 2));
    for (let k = 0; k < total; k++) {
      const kind = hash01(k, 21) < 0.14 ? 'van' : hash01(k, 22) < 0.1 ? 'bus' : hash01(k, 23) < 0.12 ? 'truck' : 'car', c = CAR_COLORS[k % CAR_COLORS.length];
      const spec = kind === 'bus' ? { w: 9.5, d: 2.6, h: 3 } : kind === 'van' ? { w: 5, d: 2.1, h: 2.2 } : kind === 'truck' ? { w: 5.2, d: 2.1, h: 1.9 } : { w: 4.4, d: 1.9, h: 1.5 };
      const mesh = makeVehicleMesh({ kind, ...spec, c, v: k % 2, wreck: false });
      for (const z of [-0.65, 0.65] as const) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.32), this.lightMat), tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.32), this.tailMat);
        const sc = spec.d / 1.9; hl.position.set(spec.w / 2 + 0.02, kind === 'bus' ? 0.9 : 0.72, z * sc); tl.position.set(-spec.w / 2 - 0.02, kind === 'bus' ? 0.9 : 0.68, z * sc); mesh.add(hl, tl);
      }
      const axis = k % 2 ? 'x' : 'z', dir = (hash01(k, 24) < 0.5 ? 1 : -1) as 1 | -1;
      const line = roads[1 + (k * 3) % (roads.length - 2)], lane = 2.9;
      const t = (hash01(k, 25) * 2 - 1) * (WORLD_HALF - 8);
      // Place traffic at its assigned road immediately to avoid a first-frame jump.
      if (axis === 'x') { mesh.position.set(t, 0.18, line + dir * lane); mesh.rotation.y = dir > 0 ? 0 : Math.PI; }
      else { mesh.position.set(line - dir * lane, 0.18, t); mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
      mesh.visible = false; this.group.add(mesh);
      this.cars.push({ mesh, axis, line, lane, dir, t, speed: 6.5 + hash01(k, 26) * 5, halfLength: spec.w / 2, halfWidth: spec.d / 2 });
    }
    this.setStage(0);
  }
  setStage(stage: number): void { this.target = Math.min(this.cars.length, Math.round(this.cars.length * Math.min(1, 0.3 + stage * 0.14))); }
  /** Hit test against visible traffic. The render group stores world coordinates even before first update. */
  blocks(x: number, z: number, radius: number): boolean {
    for (const c of this.cars) {
      if (!c.mesh.visible) continue;
      const dx = Math.abs(x - c.mesh.position.x), dz = Math.abs(z - c.mesh.position.z);
      const along = c.axis === 'x' ? dx : dz;
      const across = c.axis === 'x' ? dz : dx;
      if (along < c.halfLength + radius && across < c.halfWidth + radius) return true;
    }
    return false;
  }
  update(dt: number, cam: THREE.Vector3, player: THREE.Vector3, night: number, parkedAhead?: (x: number, z: number, r: number) => boolean): void {
    let n = 0;
    for (const c of this.cars) {
      const on = n++ < this.target * (1 - night * 0.4); c.mesh.visible = on && Math.hypot(c.mesh.position.x - cam.x, c.mesh.position.z - cam.z) < 260; if (!on) continue;
      // 앞에 사람이 있으면 멈춥니다
      const along = c.axis === 'x' ? c.dir : 0, alongZ = c.axis === 'z' ? c.dir : 0, px = c.mesh.position.x, pz = c.mesh.position.z;
      const rx = player.x - px, rz = player.z - pz, fwd = rx * along + rz * alongZ, side = Math.abs(rx * alongZ * -1 + rz * along * 1);
      const probe = c.halfLength + 3.2;
      const parked = parkedAhead?.(px + along * probe, pz + alongZ * probe, c.halfWidth + 0.6) ?? false;
      const blocked = (fwd > 0 && fwd < 9 && side < 2.6) || parked;
      c.t += c.dir * c.speed * (blocked ? 0 : 1) * dt; if (c.t > WORLD_HALF - 6) c.t = -WORLD_HALF + 6; if (c.t < -WORLD_HALF + 6) c.t = WORLD_HALF - 6;
      const lane = c.dir > 0 ? c.lane : -c.lane;
      if (c.axis === 'x') { c.mesh.position.set(c.t, 0.18, c.line + lane); c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI; }
      else { c.mesh.position.set(c.line - lane, 0.18, c.t); c.mesh.rotation.y = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    }
    this.lightMat.color.setScalar(0.4 + night * 1.6); this.tailMat.color.setRGB(0.5 + night, 0.1, 0.06);
  }
  dispose(): void {
    const materials = new Set<THREE.Material>();
    for (const car of this.cars) car.mesh.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat);
    });
    for (const material of materials) material.dispose();
    this.cars.length = 0;
    this.group.removeFromParent();
  }
}
