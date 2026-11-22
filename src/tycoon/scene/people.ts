// TYCOON — 거리의 사람들과 자동차. 보도 모서리 그래프를 따라 걷고, 도로 차선을 따라 달립니다.
import * as THREE from 'three';
import type { CharacterKit, CharacterRig } from '../../shared/character';
import { CIVILIANS } from '../../shared/character';
import { makeVehicleMesh } from '../../shared/vehicle';
import { ContactShadows } from '../../outlaw/contact-shadows';
import { intersectionFactor } from './signals';
import { HALF, PITCH, WALK_EDGE, WORLD_HALF, hash01 } from './layout';
import type { Quality } from './city';

interface Node { i: number; j: number; sx: number; sz: number }
const nodeX = (n: Node): number => n.i * PITCH + n.sx * WALK_EDGE;
const nodeZ = (n: Node): number => n.j * PITCH + n.sz * WALK_EDGE;
const nodePos = (n: Node): [number, number] => [nodeX(n), nodeZ(n)];
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
  /** Reused references to nearby pedestrians, consumed by the traffic safety controller. */
  private visibleWalkers: Walker[] = [];
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
  private pickNext(w: Walker, unlockedAt: (i: number, j: number) => boolean): void {
    const valid = neighbors(w.to).filter(n => unlockedAt(n.i, n.j));
    const opts = valid.filter(n => !same(n, w.from)), next = opts[Math.floor(Math.random() * opts.length)] ?? valid[0] ?? w.to;
    w.prev = w.from; w.from = w.to; w.to = next;
  }
  update(dt: number, cam: THREE.Vector3, night: number, rain: number, unlockedAt: (i: number, j: number) => boolean): void {
    const limit = Math.round(this.target * (1 - night * 0.55) * (1 - rain * 0.45));
    this.visibleWalkers.length = 0;
    let n = 0;
    for (const w of this.walkers) {
      const want = n++ < limit;
      if (!want) { if (w.active && Math.hypot(w.x - cam.x, w.z - cam.z) > 40) { w.active = false; w.rig.root.visible = false; continue; } else if (!w.active) continue; }
      if (want && !w.active) { // 열린 구획 모서리에서 등장
        let tries = 0, node: Node = w.from; do { node = { i: Math.floor(Math.random() * 7) - 3, j: Math.floor(Math.random() * 7) - 3, sx: Math.random() < 0.5 ? -1 : 1, sz: Math.random() < 0.5 ? -1 : 1 }; } while (!unlockedAt(node.i, node.j) && ++tries < 30);
        if (!unlockedAt(node.i, node.j)) continue;
        const [x, z] = nodePos(node); if (Math.hypot(x - cam.x, z - cam.z) < 18) continue; w.from = w.to = node; w.prev = null; w.x = x; w.z = z; w.active = true; this.pickNext(w, unlockedAt);
      }
      const tx0 = nodeX(w.to), tz0 = nodeZ(w.to), fx0 = nodeX(w.from), fz0 = nodeZ(w.from), dx0 = tx0 - fx0, dz0 = tz0 - fz0, l0 = Math.hypot(dx0, dz0) || 1;
      const tx = tx0 + (-dz0 / l0) * w.lane, tz = tz0 + (dx0 / l0) * w.lane, dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
      if (w.wait > 0) { w.wait -= dt; w.rig.state.speed = 0; }
      else if (d < 0.6) { w.wait = hash01(w.x, w.z) < 0.2 ? 1 + Math.random() * 3 : 0; this.pickNext(w, unlockedAt); }
      else { const sp = w.speed; w.x += (dx / d) * sp * dt; w.z += (dz / d) * sp * dt; w.yaw = Math.atan2(-dz, dx); w.rig.state.speed = sp * 1.8; }
      const dist = Math.hypot(w.x - cam.x, w.z - cam.z), vis = dist < 120;
      w.rig.root.visible = vis; if (!vis) continue;
      this.visibleWalkers.push(w);
      w.rig.root.position.set(w.x, 0.18, w.z); const cur = w.rig.root.rotation.y; let dy = w.yaw - cur; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; w.rig.root.rotation.y = cur + dy * Math.min(1, dt * 8);
      w.rig.setDetail(dist > 70 ? 3 : dist > 40 ? 1 : 0); w.rig.step(dt); w.rig.update(dt);
    }
  }
  /** Stable, allocation-free view; only valid until the next Crowd.update call. */
  getVisiblePedestrians(): readonly { x: number; z: number }[] { return this.visibleWalkers; }
  dispose(): void { this.visibleWalkers.length = 0; this.group.removeFromParent(); }
}

interface Car { mesh: THREE.Group; axis: 'x' | 'z'; line: number; lane: number; dir: 1 | -1; t: number; speed: number; base: number; length: number; width: number; tailLights: THREE.Mesh[]; headPool: THREE.Mesh | null; }
/** 장애물 앞에서 서서히 감속하고 안전거리 안에 들어오면 정지한다. */
export function trafficSpeedFactor(gap: number, stop = 3, slow = 12): number {
  return THREE.MathUtils.clamp((gap - stop) / Math.max(1, slow - stop), 0, 1);
}
/** Stop for pedestrians in the road; pedestrians safely on the sidewalk do not stop traffic. */
export function pedestrianSpeedFactor(cx: number, cz: number, axis: 'x' | 'z', dir: 1 | -1, length: number, px: number, pz: number): number {
  const ahead = ((axis === 'x' ? px - cx : pz - cz) * dir) - length / 2;
  const side = Math.abs(axis === 'x' ? pz - cz : px - cx);
  return ahead > -length / 2 && ahead < 15 && side < 2.55 ? trafficSpeedFactor(ahead) : 1;
}
function placeCar(c: Car): void {
  const lane = c.dir > 0 ? c.lane : -c.lane;
  if (c.axis === 'x') { c.mesh.position.set(c.t, .025, c.line + lane); c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI; }
  else { c.mesh.position.set(c.line - lane, .025, c.t); c.mesh.rotation.y = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
}
const CAR_COLORS = [0xb83a34, 0x2f5f9a, 0xd8d8d2, 0x23262b, 0x3a7a58, 0xd0a23a, 0x6a6e74, 0x8a4aa0];

export class Traffic {
  readonly group = new THREE.Group();
  private cars: Car[] = []; private target = 0; private time = 0;
  private lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false }); private tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  private headGeo = new THREE.BoxGeometry(0.12, 0.2, 0.32); private tailGeo = new THREE.BoxGeometry(0.12, 0.18, 0.32);
  private brakeMat = new THREE.MeshBasicMaterial({ color: 0xff5030, toneMapped: false });
  private poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private poolTex = headlightTexture();
  private contact: ContactShadows;
  private poolMat = new THREE.MeshBasicMaterial({ map: this.poolTex, color: 0xffe3b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  private disposed = false;
  constructor(scene: THREE.Scene, quality: Quality) {
    this.contact = new ContactShadows(16); this.group.add(this.contact.mesh); scene.add(this.group);
    const total = quality === 'high' ? 16 : quality === 'standard' ? 10 : 5, roads: number[] = []; for (let k = 0; k <= 2 * HALF + 1; k++) roads.push(k * PITCH - (HALF * PITCH + PITCH / 2));
    for (let k = 0; k < total; k++) {
      const kind = hash01(k, 21) < 0.14 ? 'van' : hash01(k, 22) < 0.1 ? 'bus' : hash01(k, 23) < 0.12 ? 'truck' : 'car', c = CAR_COLORS[k % CAR_COLORS.length];
      const spec = kind === 'bus' ? { w: 9.5, d: 2.6, h: 3 } : kind === 'van' ? { w: 5, d: 2.1, h: 2.2 } : kind === 'truck' ? { w: 5.2, d: 2.1, h: 1.9 } : { w: 4.4, d: 1.9, h: 1.5 };
      const mesh = makeVehicleMesh({ kind, ...spec, c, v: k % 2, wreck: false });
      const tailLights: THREE.Mesh[] = []; let headPool: THREE.Mesh | null = null;
      for (const z of [-0.65, 0.65] as const) {
        const hl = new THREE.Mesh(this.headGeo, this.lightMat), tl = new THREE.Mesh(this.tailGeo, this.tailMat);
        const sc = spec.d / 1.9; hl.position.set(spec.w / 2 + 0.02, kind === 'bus' ? 0.9 : 0.72, z * sc); tl.position.set(-spec.w / 2 - 0.02, kind === 'bus' ? 0.9 : 0.68, z * sc); mesh.add(hl, tl); tailLights.push(tl);
      }
      if (quality !== 'low') {
        headPool = new THREE.Mesh(this.poolGeo, this.poolMat); headPool.position.set(spec.w / 2 + 4.8, .02, 0); headPool.scale.set(11, 1, 5.5); headPool.visible = false; mesh.add(headPool);
      }
      mesh.visible = false; this.group.add(mesh);
      const axis = k % 2 ? 'x' : 'z', dir = (hash01(k, 24) < 0.5 ? 1 : -1) as 1 | -1;
      const car: Car = { mesh, axis, line: roads[1 + (k * 3) % (roads.length - 2)], lane: 2.9, dir, t: (hash01(k, 25) * 2 - 1) * (WORLD_HALF - 8), speed: 6.5 + hash01(k, 26) * 5, base: 1, length: spec.w, width: spec.d, tailLights, headPool };
      placeCar(car); this.cars.push(car);
    }
    this.setStage(0);
  }
  setStage(stage: number): void { this.target = Math.min(this.cars.length, Math.round(this.cars.length * Math.min(1, 0.3 + stage * 0.14))); }
  update(dt: number, cam: THREE.Vector3, player: THREE.Vector3, night: number, pedestrians: readonly { x: number; z: number }[] = []): void {
    this.time += dt;
    const count = Math.ceil(this.target * (1 - night * 0.4)); this.contact.begin(night);
    let n = 0;
    for (const c of this.cars) {
      const on = n++ < count; if (!on) { c.mesh.visible = false; continue; }
      // Player and visible NPCs use the same crossing clearance rules.
      const px = c.mesh.position.x, pz = c.mesh.position.z;
      let target = Math.min(pedestrianSpeedFactor(px, pz, c.axis, c.dir, c.length, player.x, player.z), intersectionFactor(this.time, c.axis, c.line, c.t, c.dir, c.length));
      for (const pedestrian of pedestrians) {
        if (target <= 0) break;
        target = Math.min(target, pedestrianSpeedFactor(px, pz, c.axis, c.dir, c.length, pedestrian.x, pedestrian.z));
      }
      for (let i = 0; i < count; i++) { const other = this.cars[i]; if (other === c || other.axis !== c.axis || other.line !== c.line || other.dir !== c.dir) continue; const gap = (other.t - c.t) * c.dir; if (gap > 0) target = Math.min(target, trafficSpeedFactor(gap - (c.length + other.length) / 2)); }
      // 감속은 안전 우선, 재출발은 부드럽게 가속한다.
      c.base = target < c.base ? target : c.base + (target - c.base) * Math.min(1, dt * 2.5);
      c.t += c.dir * c.speed * c.base * dt; if (c.t > WORLD_HALF - 6) c.t = -WORLD_HALF + 6; if (c.t < -WORLD_HALF + 6) c.t = WORLD_HALF - 6;
      placeCar(c); c.mesh.visible = Math.hypot(c.mesh.position.x - cam.x, c.mesh.position.z - cam.z) < 260;
      for (const lamp of c.tailLights) lamp.material = target < .75 ? this.brakeMat : this.tailMat;
      if (c.headPool) c.headPool.visible = night > .12;
      if (c.mesh.visible) this.contact.add({ x: c.mesh.position.x, y: .045, z: c.mesh.position.z, yaw: c.mesh.rotation.y, length: c.length * 1.16, width: c.width * 1.25 });
    }
    this.contact.end(); this.lightMat.color.setRGB(.44 + night * 1.5, .40 + night * 1.32, .30 + night * 1.05);
    this.tailMat.color.setRGB(0.48 + night * .7, 0.07, 0.035);
    this.brakeMat.color.setRGB(1.95, .12 + night * .07, .045);
    this.poolMat.opacity = night * .53;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.contact.dispose();
    const geometries = new Set<THREE.BufferGeometry>([this.headGeo, this.tailGeo, this.poolGeo]);
    const materials = new Set<THREE.Material>([this.lightMat, this.tailMat, this.brakeMat, this.poolMat]);
    this.group.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const mat of Array.isArray(o.material) ? o.material : [o.material]) materials.add(mat); } });
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); this.poolTex.dispose(); this.group.removeFromParent(); this.group.clear(); this.cars.length = 0;
  }
}

// Procedural soft footprint: no external texture dependency or extra dynamic lights.
function headlightTexture(): THREE.DataTexture {
  const n = 32, pixels = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + .5) / n * 2 - 1, v = (j + .5) / n * 2 - 1;
    const left = Math.exp(-((v - .35) ** 2) * 12), right = Math.exp(-((v + .35) ** 2) * 12);
    const falloff = Math.max(0, 1 - u * u) ** 2 * Math.max(0, 1 - v * v);
    const p = (j * n + i) * 4; pixels[p] = pixels[p + 1] = pixels[p + 2] = 255; pixels[p + 3] = Math.round(Math.min(1, (left + right) * falloff) * 255);
  }
  const t = new THREE.DataTexture(pixels, n, n); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
