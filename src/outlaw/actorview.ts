// OUTLAW CITY의 관절형 시민·차량·수집품과 네온 표식, 풀링된 전투 이펙트를 그립니다.
import { OUTFITS } from './life';
import * as THREE from 'three';
import { blankPose, calmState, computePose } from '../shared/character/pose';
import { instantiate, type Baked, type CharModel } from '../city/models';
import { VEHICLES, clamp, type Ped, type Pickup, type Poi, type SimEvent, type Vehicle, type VehicleDef, type WeaponId } from './types';
import { MISSION_LIST, canStart } from './missions';
import { groundHeight, surfaceAt } from './world';
import type { Sim } from './sim';
import type { OutlawAssets } from './assets';
import type { Quality } from './cityview';
import { ContactShadows } from './contact-shadows';

interface Rig {
  root: THREE.Group; hip: THREE.Group; legs: THREE.Group[]; shins: THREE.Group[]; arms: THREE.Group[];
  hand: THREE.Group; flash: THREE.Sprite; gun: THREE.Object3D | null; weapon: WeaponId; nextPose: number; flashT: number;
}
interface CarView {
  root: THREE.Group; body: THREE.Object3D; lamps: THREE.Group; brakes: THREE.Mesh[]; reverse: THREE.Mesh[]; sirens: THREE.Sprite[];
  policeNodes: THREE.Object3D[]; wheels: THREE.Object3D[]; last: number[]; paintColor: number; vf: number; emit: number; skidX: number; skidZ: number; scorched: boolean;
}
interface LootView { root: THREE.Group; prop: THREE.Group; sparkle: THREE.Sprite }
interface Beacon { root: THREE.Group; ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; beam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> }
type FxKind = 'fire' | 'smoke' | 'spark' | 'blood' | 'debris' | 'ring' | 'tracer' | 'skid' | 'pool';
interface Fx { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; kind: FxKind; life: number; total: number; vx: number; vy: number; vz: number; size: number; growth: number; alpha: number }
const CLOTH = [0x616b78, 0x8a7066, 0x585e57, 0x857b69, 0x595569, 0x6b7b7b, 0x805d60, 0x414651];
const SKIN = [0xe4b996, 0xc58e6b, 0x986343, 0x654536, 0xd4a07d];
const LOOT = { cash: 0x5dff8f, health: 0xff4545, armor: 0x3b82ff, weapon: 0xffd23f, ammo: 0xd0c3a0, package: 0xffd23f };
const POI: Record<string, number> = { safehouse: 0x5dff8f, gunshop: 0xff9b48, paynspray: 0x3df2ff, hospital: 0xffe6e6, start: 0xffd23f };
const UP = new THREE.Vector3(0, 1, 0);

export class ActorView {
  private readonly root = new THREE.Group();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly palette = new Map<string, THREE.Material>();
  private readonly paletteMaterials = new Set<THREE.Material>();
  private readonly articulated = new Map<CharModel, CharModel>();
  private readonly rigs = new Map<number, Rig>();
  private readonly cars = new Map<number, CarView>();
  private readonly loot = new Map<number, LootView>();
  private readonly livePeds = new Set<number>();
  private readonly liveCars = new Set<number>();
  private readonly liveLoot = new Set<number>();
  private readonly liveRocketIds = new Set<number>();
  private readonly nearbyPois: Poi[] = [];
  private readonly poiById = new Map<string, Poi>();
  private readonly rockets = new Map<number, THREE.Group>();
  private readonly beacons: Beacon[] = [];
  private beaconBeamGeometry: THREE.BufferGeometry | null = null;
  private readonly fx: Fx[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly glow: THREE.DataTexture;
  private readonly box: THREE.BoxGeometry;
  private readonly plane: THREE.PlaneGeometry;
  private readonly ring: THREE.RingGeometry;
  private readonly ball: THREE.SphereGeometry;
  private readonly capsule: THREE.CapsuleGeometry;
  private readonly cone: THREE.ConeGeometry;
  private readonly cylinder: THREE.CylinderGeometry;
  private readonly tailLamp: THREE.PlaneGeometry;
  private readonly tireGeo: THREE.CylinderGeometry;
  private readonly contact: ContactShadows;
  private time = 0;
  private disposed = false;
  private readonly cameraPos = new THREE.Vector3();
  private fxCursor = 0;
  private skidCursor = 0;
  /** 사이렌 차량 주변 벽·노면에 번지는 적청 점멸광(가장 가까운 한 대) */
  private readonly sirenLight = new THREE.PointLight(0xff4545, 0, 34, 1.6);
  private readonly skidStart: number;

  constructor(readonly scene: THREE.Scene, readonly sim: Sim, readonly assets: OutlawAssets | null, readonly quality: Quality) {
    for (const poi of sim.map.pois) this.poiById.set(poi.id, poi);
    this.box = this.ownGeo(new THREE.BoxGeometry(1, 1, 1)); this.plane = this.ownGeo(new THREE.PlaneGeometry(1, 1));
    this.ring = this.ownGeo(new THREE.RingGeometry(0.88, 1, 48)); this.ball = this.ownGeo(new THREE.SphereGeometry(1, 10, 6));
    this.capsule = this.ownGeo(new THREE.CapsuleGeometry(0.26, 0.75, 3, 8)); this.cone = this.ownGeo(new THREE.ConeGeometry(1, 1, 12, 1, true)); this.cylinder = this.ownGeo(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true));
    this.tailLamp = this.ownGeo(new THREE.PlaneGeometry(0.26, 0.14));
    this.tireGeo = this.ownGeo(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).rotateX(Math.PI / 2));
    const n = 64, data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const a = Math.pow(Math.max(0, 1 - Math.hypot((x + 0.5) / n * 2 - 1, (y + 0.5) / n * 2 - 1)), 1.7), i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(a * 255);
    }
    this.glow = new THREE.DataTexture(data, n, n); this.glow.needsUpdate = true; this.glow.magFilter = this.glow.minFilter = THREE.LinearFilter;
    this.contact = new ContactShadows(quality === 'low' ? 28 : 64);
    this.root.name = 'outlaw-actors'; this.root.add(this.sirenLight, this.contact.mesh); scene.add(this.root); this.cameraPos.set(sim.player.x, sim.player.y, sim.player.z);
    this.skidStart = quality === 'low' ? 128 : quality === 'standard' ? 224 : 320;
    // 이벤트 폭주와 장시간 드리프트도 GPU 자원 수를 늘리지 않도록 처음에만 할당합니다.
    for (let i = 0; i < this.skidStart + (quality === 'low' ? 48 : 96); i++) {
      const mat = this.ownMat(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
      const mesh = new THREE.Mesh(this.plane, mat); mesh.visible = false; mesh.frustumCulled = false; this.root.add(mesh);
      this.fx.push({ mesh, kind: 'spark', life: 0, total: 1, vx: 0, vy: 0, vz: 0, size: 1, growth: 0, alpha: 1 });
    }
    if (quality !== 'low') for (let i = 0; i < 2; i++) { const light = new THREE.PointLight(0xffa34b, 0, 24, 2); this.root.add(light); this.lights.push(light); }
  }
  private ownGeo<T extends THREE.BufferGeometry>(g: T): T { this.geometries.add(g); return g; }
  /** GLB 차체 로컬 AABB. 시뮬 halfL과 모델 축/스케일이 어긋날 때 후미등 뜨는 문제를 막습니다. */
  private vehicleBounds(body: THREE.Object3D, d: VehicleDef): { box: THREE.Box3; xForward: boolean } {
    const box = new THREE.Box3().setFromObject(body);
    if (!Number.isFinite(box.min.x) || box.isEmpty()) box.set(new THREE.Vector3(-d.halfL, 0, -d.halfW), new THREE.Vector3(d.halfL, d.height, d.halfW));
    const size = box.getSize(new THREE.Vector3());
    return { box, xForward: size.x >= size.z };
  }
  private attachRearLamps(body: THREE.Object3D, d: VehicleDef, brakes: THREE.Mesh[], reverse: THREE.Mesh[]): void {
    const { box, xForward } = this.vehicleBounds(body, d);
    const size = box.getSize(new THREE.Vector3());
    const cx = (box.min.x + box.max.x) * 0.5, cz = (box.min.z + box.max.z) * 0.5;
    const y = box.min.y + size.y * 0.36, lateral = Math.max(0.18, (xForward ? size.z : size.x) * 0.27);
    const mount = new THREE.Group(); mount.name = 'rear-lamps'; body.add(mount);
    for (const side of [-1, 1]) {
      const brake = new THREE.Mesh(this.tailLamp, this.ownMat(new THREE.MeshBasicMaterial({ color: 0xd62828, transparent: true, opacity: 0.22 })));
      const rev = new THREE.Mesh(this.tailLamp, this.ownMat(new THREE.MeshBasicMaterial({ color: 0xf8fbff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
      rev.scale.set(0.78, 0.82, 1);
      if (xForward) {
        brake.position.set(box.min.x + 0.014, y, cz + side * lateral);
        rev.position.set(box.min.x + 0.014, y - size.y * 0.07, cz + side * lateral * 0.9);
        brake.rotation.y = rev.rotation.y = Math.PI / 2;
      } else {
        brake.position.set(cx + side * lateral, y, box.min.z + 0.014);
        rev.position.set(cx + side * lateral * 0.9, y - size.y * 0.07, box.min.z + 0.014);
        brake.rotation.y = rev.rotation.y = Math.PI;
      }
      mount.add(brake, rev); brakes.push(brake); reverse.push(rev);
    }
  }
  private ownMat<T extends THREE.Material>(m: T): T { this.materials.add(m); return m; }
  private material(color: number, baked = false, glow = false): THREE.Material {
    const key = `${color}:${baked}:${glow}`; let m = this.palette.get(key);
    if (!m) { m = this.ownMat(glow ? new THREE.MeshBasicMaterial({ color, vertexColors: baked }) : new THREE.MeshLambertMaterial({ color, vertexColors: baked })); this.palette.set(key, m); this.paletteMaterials.add(m); }
    return m;
  }
  private mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.material(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = this.quality !== 'low'; parent.add(m); return m;
  }
  private sprite(parent: THREE.Object3D, color: number, size: number): THREE.Sprite {
    const m = this.ownMat(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const s = new THREE.Sprite(m); s.scale.set(size, size, 1); parent.add(s); return s;
  }
  private part(b: Baked, team: number, skin: number): THREE.Group {
    const g = new THREE.Group();
    for (const key of ['fixed', 'team', 'skin', 'glow'] as const) if (b[key]) {
      const m = new THREE.Mesh(b[key], this.material(key === 'team' ? team : key === 'skin' ? skin : 0xffffff, true, key === 'glow')); m.castShadow = this.quality !== 'low'; g.add(m);
    }
    return g;
  }
  private articulate(src: CharModel): CharModel {
    if (src.armL && src.armR) return src;
    const cached = this.articulated.get(src); if (cached) return cached;
    const blank = (): Baked => ({ fixed: null, team: null, skin: null, glow: null });
    const body = blank(), left = blank(), right = blank(), pivotL = new THREE.Vector3(0, 1.455, -0.252), pivotR = new THREE.Vector3(0, 1.455, 0.252);
    // 구형 GLB의 일체형 팔은 삼각형 단위로 분리해 원본을 건드리지 않고 관절을 복원합니다.
    for (const key of ['fixed', 'team', 'skin', 'glow'] as const) {
      const original = src.body[key]; if (!original) continue;
      const g = original.index ? original.toNonIndexed() : original, pos = g.getAttribute('position'), buckets: number[][] = [[], [], []];
      for (let i = 0; i < pos.count; i += 3) {
        const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        const arm = Math.abs(z) > 0.235 && y < 1.56 && y > 0.65;
        if (!arm && x > 0.37 && y < 1.5 && y > 0.85) continue;
        buckets[arm ? z < 0 ? 1 : 2 : 0].push(i, i + 1, i + 2);
      }
      buckets.forEach((indices, side) => {
        if (!indices.length) return; const out = this.ownGeo(new THREE.BufferGeometry());
        for (const name of ['position', 'normal', 'color']) {
          const a = g.getAttribute(name); if (!a) continue; const values = new Float32Array(indices.length * a.itemSize);
          indices.forEach((index, i) => { for (let c = 0; c < a.itemSize; c++) values[i * a.itemSize + c] = a.getComponent(index, c); }); out.setAttribute(name, new THREE.BufferAttribute(values, a.itemSize));
        }
        if (side) { const pivot = side === 1 ? pivotL : pivotR; out.translate(-pivot.x, -pivot.y, -pivot.z); out.rotateZ(-1.1); }
        [body, left, right][side][key] = out;
      });
      if (g !== original) g.dispose();
    }
    const model: CharModel = { ...src, body, armL: { geo: left, pivot: pivotL }, armR: { geo: right, pivot: pivotR } }; this.articulated.set(src, model); return model;
  }
  private makeRig(p: Ped): Rig {
    const root = new THREE.Group(), hip = new THREE.Group(), torso = new THREE.Group(), legs: THREE.Group[] = [], shins: THREE.Group[] = [], arms: THREE.Group[] = [];
    const variant = Math.abs(Math.trunc(p.variant)), team = p.kind === 'cop' ? 0x244d88 : p.kind === 'swat' || p.kind === 'soldier' ? 0x262f3b : p.team === 'gang' ? [0x803a62, 0x42685d, 0x775386][variant % 3] : p.kind === 'player' ? (this.sim.life.outfit >= 0 ? OUTFITS[this.sim.life.outfit % OUTFITS.length]! : CLOTH[variant % CLOTH.length]!) : CLOTH[variant % CLOTH.length];
    const skin = SKIN[variant % SKIN.length], source = this.assets?.pedModel(p.kind, p.variant), model = source ? this.articulate(source) : undefined;
    hip.position.y = 0.9; torso.position.y = -0.9; hip.rotation.order = 'ZYX'; hip.add(torso); root.add(hip);
    if (model) {
      torso.add(this.part(model.body, team, skin));
      for (const side of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(0, 0.9, side * 0.11); leg.add(this.part(model.leg, team, skin)); legs.push(leg); root.add(leg);
        if (model.shin) { const shin = new THREE.Group(); shin.position.y = -0.44; shin.add(this.part(model.shin, team, skin)); leg.add(shin); shins.push(shin); }
      }
      for (const limb of [model.armL, model.armR]) { const arm = new THREE.Group(); if (limb) { arm.position.copy(limb.pivot); arm.add(this.part(limb.geo, team, skin)); } else arm.position.set(0, 1.4, arms.length ? -0.25 : 0.25); torso.add(arm); arms.push(arm); }
    } else {
      this.mesh(torso, this.capsule, team, 0, 1.02, 0); this.mesh(torso, this.ball, skin, 0, 1.67, 0, 0.22, 0.24, 0.22);
      for (const side of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(0, 0.85, side * 0.14); this.mesh(leg, this.box, 0x2b3039, 0, -0.4, 0, 0.22, 0.8, 0.21); legs.push(leg); root.add(leg);
        const arm = new THREE.Group(); arm.position.set(0, 1.4, side * 0.3); this.mesh(arm, this.box, team, 0, -0.27, 0, 0.17, 0.5, 0.17); this.mesh(arm, this.ball, skin, 0, -0.55, 0, 0.1, 0.1, 0.1); arms.push(arm); torso.add(arm);
      }
    }
    const hand = new THREE.Group(); hand.position.set(0.03, -0.57, 0); hand.rotation.z = -1.42; arms[1].add(hand);
    const flash = this.sprite(hand, 0xffdb91, 0.65); flash.position.x = 0.65; flash.visible = false;
    const r: Rig = { root, hip, legs, shins, arms, hand, flash, gun: null, weapon: 'fist', nextPose: 0, flashT: 0 };
    root.name = `ped-${p.id}`; this.root.add(root); this.rigs.set(p.id, r); return r;
  }
  private gun(id: WeaponId): THREE.Object3D {
    const template = this.assets?.groundGuns[id]; if (template) return instantiate(template);
    if (id === 'bat') { const b = new THREE.Group(); this.mesh(b, this.box, 0xb58a56, 0.45, 0.05, 0, 0.9, 0.07, 0.07); this.mesh(b, this.box, 0x2a2a2a, 0.02, 0.05, 0, 0.18, 0.05, 0.05); return b; }
    if (id === 'grenade') { const b = new THREE.Group(); this.mesh(b, this.ball, 0x3d4a35, 0.06, 0, 0, 0.1, 0.13, 0.1); return b; }
    const g = new THREE.Group(), long = id === 'rifle' || id === 'sniper' || id === 'shotgun' || id === 'rocket';
    this.mesh(g, this.box, 0x272d35, long ? 0.32 : 0.15, 0, 0, long ? 0.8 : 0.32, id === 'rocket' ? 0.2 : 0.09, 0.09);
    this.mesh(g, this.box, 0x504b48, 0.08, -0.1, 0, 0.09, 0.22, 0.08); return g;
  }
  private cs = calmState(); private cp = blankPose();
  private pose(p: Ped, r: Rig): void {
    // 걷기·달리기·웅크리기·피격 다리/몸통 각도는 공용 캐릭터 모듈(src/shared/character)이 계산합니다.
    const st = this.cs; st.speed = p.speed; st.walk = p.walk; st.time = this.sim.t; st.crouch = p.crouch ? 1 : 0; st.hit = 0;
    const P = computePose(st, this.cp), amp = clamp(p.speed / 3.2, 0, 1), sn = Math.sin(p.walk * 1.35);
    r.hip.rotation.set(0, P.torsoTwist, P.torsoLean + Math.sin(p.hurt * 30) * p.hurt * 0.55);
    r.legs[0].rotation.z = P.thighL; r.legs[1].rotation.z = P.thighR; if (r.shins[0]) r.shins[0].rotation.z = P.shinL; if (r.shins[1]) r.shins[1].rotation.z = P.shinR;
    const armed = r.weapon !== 'fist', aiming = armed && (p.aiming || p.muzzle > 0 || p.fireHeld), punch = Math.sin(clamp(p.punchT / 0.3, 0, 1) * Math.PI);
    r.arms.forEach((arm, i) => { arm.rotation.set(0, aiming ? -p.pitch * 0.3 : 0, aiming ? 1.42 + p.pitch - p.kick * 0.17 : armed && i ? 0.25 : -sn * (i ? -1 : 1) * amp * 0.55); });
    if (p.punchT > 0) { r.arms[1].rotation.z = punch * 1.9; r.hip.rotation.y -= punch * 0.45; }
    if (p.mode === 'cower') r.arms.forEach(a => { a.rotation.z = 2.7; });
  }
  private makeCar(v: Vehicle): CarView {
    const root = new THREE.Group(); root.rotation.order = 'YXZ'; root.name = `vehicle-${v.id}`;
    let template: THREE.Object3D | undefined; try { template = this.assets?.vehicleTemplate(v.kind); } catch { /* 누락 모델은 도형으로 대체합니다. */ }
    const body = template ? instantiate(template, { paint: v.color }) : new THREE.Group(), d = VEHICLES[v.kind]; root.add(body);
    if (!template) {
      // 차량 에셋을 불러오지 못해도 차종에 맞는 실루엣과 둥근 타이어를 유지한다.
      const L = d.halfL, W = d.halfW, H = d.height;
      const heavy = ['truck', 'van', 'ambulance', 'suv', 'tank'].includes(v.kind);
      const sporty = ['sports', 'gt', 'hyper', 'muscle', 'buggy'].includes(v.kind);
      const paint = this.ownMat(new THREE.MeshStandardMaterial({ color: v.color, roughness: 0.38, metalness: 0.4 }));
      const glazing = this.ownMat(new THREE.MeshStandardMaterial({ color: 0x344c5d, roughness: 0.18, metalness: 0.42 }));
      const colored = (x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh => {
        const m = this.mesh(body, this.box, 0xffffff, x, y, z, sx, sy, sz); m.material = paint; return m;
      };
      colored(0, H * 0.40, 0, L * 1.94, H * 0.38, W * 1.93);
      colored(L * 0.55, H * 0.61, 0, L * 0.77, H * 0.13, W * 1.84);
      colored(-L * 0.66, H * 0.55, 0, L * 0.58, H * 0.17, W * 1.86);
      const cabinL = heavy ? L * 1.12 : sporty ? L * 0.91 : L * 1.04, cabinX = heavy ? -L * 0.16 : -L * 0.12;
      const cabin = this.mesh(body, this.box, 0xffffff, cabinX, H * 0.73, 0, cabinL, H * 0.37, W * 1.76); cabin.material = glazing;
      colored(cabinX, H * 0.94, 0, cabinL * 0.96, H * 0.09, W * 1.7);
      for (const side of [-1, 1]) {
        colored(cabinX, H * 0.76, side * W * 0.89, 0.12, H * 0.36, 0.06);
        this.mesh(body, this.box, 0x273038, cabinX + cabinL * 0.39, H * 0.69, side * W, 0.25, 0.15, 0.22);
        colored(0, H * 0.27, side * W * 0.95, L * 1.30, H * 0.13, 0.09);
      }
      for (const s of [-1, 1]) this.mesh(body, this.box, 0x343a3e, s * L * 0.95, H * 0.27, 0, 0.20, H * 0.16, W * 1.91);
      this.mesh(body, this.box, 0x243039, L * 0.985, H * 0.44, 0, 0.045, H * 0.19, W * 0.85);
      for (const side of [-1, 1]) {
        this.mesh(body, this.box, 0xe3f1e7, L * 0.985, H * 0.47, side * W * 0.66, 0.07, H * 0.10, W * 0.32);
        this.mesh(body, this.box, 0x9f2526, -L * 0.985, H * 0.44, side * W * 0.66, 0.07, H * 0.10, W * 0.32);
      }
      if (v.kind === 'tank') {
        colored(0.04, H * 0.92, 0, L * 0.75, H * 0.25, W * 1.15);
        this.mesh(body, this.box, 0x586057, L * 0.63, H * 1.03, 0, L * 1.14, 0.22, 0.22);
        for (const side of [-1, 1]) this.mesh(body, this.box, 0x202527, 0, H * 0.26, side * W * 0.88, L * 1.9, H * 0.32, W * 0.38);
      } else {
        const radius = Math.min(heavy ? 0.48 : 0.36, H * 0.32);
        for (const ax of [-0.66, 0.66]) for (const side of [-1, 1]) {
          const wheel = new THREE.Group(); wheel.name = 'wheel'; wheel.position.set(L * ax, radius, W * side * 0.94); body.add(wheel);
          this.mesh(wheel, this.tireGeo, 0x17191c, 0, 0, 0, radius * 2, radius * 2, heavy ? 0.32 : 0.28);
          this.mesh(wheel, this.tireGeo, 0x929da6, 0, 0, side * 0.15, radius * 1.12, radius * 1.12, 0.05);
          this.mesh(wheel, this.box, 0x48525b, 0, 0, side * 0.182, radius * 0.90, 0.055, 0.035);
        }
      }
      if (v.kind === 'taxi' || v.kind === 'police' || v.kind === 'ambulance') this.mesh(body, this.box, v.kind === 'taxi' ? 0xf2cf57 : 0xd8e9ef, cabinX, H * 1.02, 0, 0.28, 0.15, v.kind === 'taxi' ? 0.56 : W * 1.1);
      if (sporty && this.quality !== 'low') { for (const s of [-1, 1]) this.mesh(body, this.box, 0x262b30, -L * 0.83, H * 0.68, s * W * 0.56, 0.14, 0.24, 0.08); this.mesh(body, this.box, 0x333a3e, -L * 0.83, H * 0.8, 0, 0.29, 0.10, W * 1.5); }
    }
    const { box, xForward } = this.vehicleBounds(body, d);
    const size = box.getSize(new THREE.Vector3());
    const cx = (box.min.x + box.max.x) * 0.5, cz = (box.min.z + box.max.z) * 0.5;
    const headY = box.min.y + size.y * 0.45, headLat = Math.max(0.2, (xForward ? size.z : size.x) * 0.28);
    const lamps = new THREE.Group(), brakes: THREE.Mesh[] = [], reverse: THREE.Mesh[] = [], sirens: THREE.Sprite[] = [], policeNodes: THREE.Object3D[] = [], wheels: THREE.Object3D[] = [];
    this.attachRearLamps(body, d, brakes, reverse);
    for (const side of [-1, 1]) {
      const lat = side * headLat;
      const glow = this.sprite(lamps, 0xc6e5ff, 0.85);
      const cone = new THREE.Mesh(this.cone, this.ownMat(new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'varying vec2 vUv; void main(){float f=smoothstep(0.,.28,vUv.y)*pow(1.-vUv.y,1.8);gl_FragColor=vec4(.65,.8,1.,f*.065);}' })));
      cone.rotation.z = Math.PI / 2; cone.scale.set(2.1, 12, 1.1);
      if (xForward) {
        glow.position.set(box.max.x + 0.02, headY, cz + lat);
        cone.position.set(box.max.x + 5.8, headY - 0.12, cz + lat);
      } else {
        glow.position.set(cx + lat, headY, box.max.z + 0.02);
        cone.position.set(cx + lat, headY - 0.12, box.max.z + 5.8); cone.rotation.y = Math.PI / 2;
      }
      lamps.add(glow, cone);
      if (v.kind === 'police') { const s = this.sprite(root, side < 0 ? 0xff4545 : 0x3b82ff, 1.65); s.position.set(0, box.max.y + 0.12, side * 0.45); sirens.push(s); }
    }
    body.traverse(o => { if (/police_Light[AB]/i.test(o.name)) policeNodes.push(o); if (/wheel|tyre|tire/i.test(o.name) && !(o.parent && /wheel|tyre|tire/i.test(o.parent.name))) wheels.push(o); });
    root.add(lamps); this.root.add(root);
    const c: CarView = { root, body, lamps, brakes, reverse, sirens, policeNodes, wheels, last: [], paintColor: v.color, vf: v.vf, emit: 0, skidX: v.x, skidZ: v.z, scorched: false }; this.cars.set(v.id, c); return c;
  }
  private makeLoot(p: Pickup): LootView {
    const root = new THREE.Group(), prop = new THREE.Group(), color = LOOT[p.kind]; root.add(prop); root.name = `pickup-${p.id}`;
    if (p.kind === 'weapon' && p.weapon) prop.add(this.gun(p.weapon));
    else if (p.kind === 'health') {
      this.mesh(prop, this.box, 0xe4e8e6, 0, 0, 0, 0.52, 0.4, 0.34);
      for (const side of [-1, 1]) { this.mesh(prop, this.box, 0xff4545, 0, 0, side * 0.18, 0.32, 0.085, 0.02); this.mesh(prop, this.box, 0xff4545, 0, 0, side * 0.18, 0.085, 0.3, 0.02); }
    } else if (p.kind === 'armor') {
      this.mesh(prop, this.box, 0x315e93, 0, 0, 0, 0.5, 0.5, 0.23); for (const side of [-1, 1]) this.mesh(prop, this.box, 0x628bb1, side * 0.18, 0.28, 0, 0.14, 0.22, 0.23);
    } else if (p.kind === 'cash') {
      for (let i = 0; i < 3; i++) this.mesh(prop, this.box, 0x619b79, 0, i * 0.045, 0, 0.52, 0.04, 0.26); this.mesh(prop, this.box, 0xe6dbc0, 0, 0.06, 0, 0.09, 0.15, 0.27);
    } else {
      const crate = p.kind === 'ammo' ? this.assets?.props.crate : undefined;
      if (crate) { const model = instantiate(crate), bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3()); const scale = 0.48 / Math.max(size.x, size.y, size.z, 0.01); model.scale.multiplyScalar(scale); model.position.addScaledVector(center, -scale); prop.add(model); }
      else this.mesh(prop, this.box, p.kind === 'package' ? 0xcfa83d : 0x646c4e, 0, 0, 0, 0.48, 0.42, 0.38);
      this.mesh(prop, this.box, 0xe4d5a1, 0, 0.22, 0, 0.09, 0.025, 0.4);
    }
    const ring = new THREE.Mesh(this.ring, this.material(color, false, true)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.scale.setScalar(0.65); root.add(ring);
    const sparkle = this.sprite(prop, color, 0.7); sparkle.position.y = 0.2; root.position.set(p.x, p.y, p.z); this.root.add(root);
    const l = { root, prop, sparkle }; this.loot.set(p.id, l); return l;
  }
  private makeBeacon(): Beacon {
    const root = new THREE.Group(), mat = (opacity: number) => this.ownMat(new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.AdditiveBlending }));
    // All marker beams have the same vertex fade. Share the immutable GPU
    // geometry, retaining separate materials for per-marker colors and opacity.
    if (!this.beaconBeamGeometry) {
      const geo = this.ownGeo(this.cylinder.clone());
      const pos = geo.getAttribute('position'), colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const a = pos.getY(i) > 0 ? 0 : 1, j = i * 3;
        colors[j] = a; colors[j + 1] = a; colors[j + 2] = a;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this.beaconBeamGeometry = geo;
    }
    const ring = new THREE.Mesh(this.ring, mat(0.65)), beam = new THREE.Mesh(this.beaconBeamGeometry, mat(0.045));
    beam.material.vertexColors = true;
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.065; root.add(ring, beam); this.root.add(root);
    const b = { root, ring, beam }; this.beacons.push(b); return b;
  }
  private emit(kind: FxKind, x: number, y: number, z: number, color: number, size: number, life: number, vx = 0, vy = 0, vz = 0, growth = 0): Fx {
    const ground = kind === 'skid' || kind === 'pool', i = ground ? this.skidStart + this.skidCursor++ % (this.fx.length - this.skidStart) : this.fxCursor++ % this.skidStart;
    const f = this.fx[i], m = f.mesh, mat = m.material;
    f.kind = kind; f.life = f.total = life; f.vx = vx; f.vy = vy; f.vz = vz; f.size = size; f.growth = growth; f.alpha = kind === 'smoke' ? 0.36 : ground ? 0.28 : 1;
    m.visible = true; m.position.set(x, y, z); m.rotation.set(0, 0, 0); m.scale.setScalar(size);
    const map = kind === 'fire' || kind === 'smoke' || kind === 'blood' || kind === 'pool' ? this.glow : null;
    const blending = kind === 'fire' || kind === 'spark' || kind === 'ring' || kind === 'tracer' ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (mat.map !== map || mat.blending !== blending) { mat.map = map; mat.blending = blending; mat.needsUpdate = true; }
    mat.color.setHex(color); mat.opacity = f.alpha; mat.fog = kind !== 'fire';
    m.geometry = kind === 'ring' ? this.ring : kind === 'spark' || kind === 'debris' || kind === 'tracer' ? this.box : this.plane;
    if (ground || kind === 'ring') { m.rotation.x = -Math.PI / 2; if (kind === 'skid') m.scale.set(size, 0.24, 1); }
    return f;
  }
  private burst(x: number, y: number, z: number, count: number, blood = false, dust = false): void {
    for (let i = 0; i < Math.min(this.quality === 'low' ? 10 : 24, count); i++) {
      const a = Math.random() * Math.PI * 2, speed = 1 + Math.random() * 6, chip = dust && i % 3 === 0;
      this.emit(blood ? 'blood' : chip ? 'debris' : 'spark', x, y, z, blood ? 0x942b3b : chip ? 0xa89e90 : 0xffbe6a, blood ? 0.12 : chip ? 0.09 : 0.045, 0.25 + Math.random() * 0.55, Math.cos(a) * speed, 1 + Math.random() * 4, Math.sin(a) * speed);
    }
    if (dust) this.emit('smoke', x, y, z, 0xa59b91, 0.8, 0.65, 0, 0.6, 0, 1.3);
  }
  handle(events: SimEvent[]): void {
    if (this.disposed) return;
    for (const e of events) {
      if (e.t === 'shot') {
        const distanceSq = (e.ox - this.cameraPos.x) ** 2 + (e.oz - this.cameraPos.z) ** 2;
        // A distant gunshot does not justify constructing an articulated rig.
        // Rig visibility is capped at 160m in update(), tracer FX at 320m.
        if (distanceSq < 160 ** 2) {
          const p = this.sim.ped(e.id);
          const r = p ? this.rigs.get(e.id) ?? this.makeRig(p) : undefined;
          if (r) r.flashT = e.weapon === 'shotgun' || e.weapon === 'sniper' ? 0.085 : 0.055;
        }
        if (distanceSq > 320 ** 2 || e.weapon === 'fist') continue;
        this.v.set(e.ex - e.ox, e.ey - e.oy, e.ez - e.oz); const distance = this.v.length(); if (distance < 0.001) continue; this.v.divideScalar(distance);
        const long = e.weapon === 'rifle' || e.weapon === 'sniper', len = Math.min(distance, long ? e.weapon === 'sniper' ? 38 : 22 : 9);
        const f = this.emit('tracer', e.ox + this.v.x * len / 2, e.oy + this.v.y * len / 2, e.oz + this.v.z * len / 2, long ? 0xffedbc : 0xffbd77, 1, 0.1);
        f.mesh.quaternion.setFromUnitVectors(UP, this.v); f.mesh.scale.set(long ? 0.025 : 0.016, len, long ? 0.025 : 0.016);
        this.emit('fire', e.ox, e.oy, e.oz, 0xffd29a, e.weapon === 'shotgun' ? 1.05 : 0.6, 0.06);
      } else if (e.t === 'hit') {
        if (Math.hypot(e.x - this.cameraPos.x, e.z - this.cameraPos.z) < 180) this.burst(e.x, e.y, e.z, e.kind === 'ped' ? 7 : 12, e.kind === 'ped', e.kind !== 'ped');
      } else if (e.t === 'explosion') {
        if (Math.hypot(e.x - this.cameraPos.x, e.z - this.cameraPos.z) > 400) continue;
        this.emit('fire', e.x, e.y + 1, e.z, 0xff8736, e.r * 1.8, 0.75, 0, 1.5, 0, e.r * 3); this.emit('fire', e.x, e.y + 1, e.z, 0xffe1a1, e.r, 0.2, 0, 0, 0, e.r * 3);
        this.emit('ring', e.x, groundHeight(this.sim.map, e.x, e.z) + 0.09, e.z, 0xffc182, 1, 0.65, 0, 0, 0, e.r * 3); this.burst(e.x, e.y + 1, e.z, 24);
        for (let i = 0; i < (this.quality === 'low' ? 6 : 12); i++) this.emit('smoke', e.x + (Math.random() - 0.5) * e.r, e.y + i * 0.45, e.z + (Math.random() - 0.5) * e.r, 0x25262b, 1.8 + Math.random() * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 0.7, 1.8, 0, 1.8);
        const light = this.lights.find(l => l.intensity < 1) ?? this.lights[0]; if (light) { light.position.set(e.x, e.y + 2, e.z); light.intensity = 55; }
      } else if (e.t === 'crash') {
        if (Math.hypot(e.x - this.cameraPos.x, e.z - this.cameraPos.z) < 160) this.burst(e.x, (this.sim.vehicles.find(v => v.id === e.id)?.y ?? 0) + 0.6, e.z, Math.ceil(e.power));
      } else if (e.t === 'death') {
        const p = this.sim.peds.find(p => p.id === e.id); if (p) { const f = this.emit('pool', p.x, p.y + 0.025, p.z, 0x641f30, 0.8, 22, 0, 0, 0, 0.035); f.alpha = 0.24; }
      } else if (e.t === 'wreck') {
        const v = this.sim.vehicles.find(v => v.id === e.id); if (v && Math.hypot(v.x - this.cameraPos.x, v.z - this.cameraPos.z) < 320) this.burst(v.x, v.y + 1, v.z, 20);
      }
    }
  }
  private car(v: Vehicle, c: CarView, dt: number, night: boolean): void {
    const d = VEHICLES[v.kind], last = c.last;
    // +x가 전방이므로 피치는 z축, 롤은 x축입니다.
    if (last[0] !== v.x || last[1] !== v.y || last[2] !== v.z || last[3] !== v.h || last[4] !== v.pitch || last[5] !== v.roll) {
      c.root.position.set(v.x, v.y, v.z); c.root.rotation.set(v.roll, -v.h, v.pitch);
      last[0] = v.x; last[1] = v.y; last[2] = v.z; last[3] = v.h; last[4] = v.pitch; last[5] = v.roll;
    }
    c.lamps.visible = night && !v.wrecked;
    const reversing = !v.wrecked && v.vf < -0.12 && v.input.throttle === 0 && v.input.brake > 0;
    const braking = !v.wrecked && !reversing && v.vf > 0.35 && (v.input.brake > 0 || (c.vf - v.vf > dt * 1.5));
    const tailIdle = night ? 0.38 : 0.14;
    c.brakes.forEach(b => {
      b.visible = !v.wrecked;
      const m = b.material as THREE.MeshBasicMaterial;
      m.opacity = braking ? 0.95 : reversing ? tailIdle * 0.55 : tailIdle;
    });
    c.reverse.forEach(r => {
      r.visible = !v.wrecked;
      (r.material as THREE.MeshBasicMaterial).opacity = reversing ? (night ? 1 : 0.88) : 0;
    });
    const pulse = Math.floor(this.time * 9) % 2; c.sirens.forEach((s, i) => { s.visible = v.siren && !v.wrecked && pulse === i; });
    c.policeNodes.forEach((o, i) => { o.visible = !v.wrecked && (!v.siren || pulse === i % 2); });
    for (const w of c.wheels) { if (w.userData.outlawBase === undefined) w.userData.outlawBase = w.rotation.z; w.rotation.z = (w.userData.outlawBase as number) + v.wheel; } c.vf = v.vf;
    if (v.wrecked && !c.scorched) { c.body.traverse(o => { if (o instanceof THREE.Mesh) { this.releaseMaterials(o); o.material = this.material(0x202126); } }); c.scorched = true; }
    const drift = !v.wrecked && Math.abs(v.vf) > 5 && (v.input.handbrake || Math.abs(v.vl) > 3); c.emit += dt;
    if (c.emit >= (this.quality === 'low' ? 0.16 : 0.075)) {
      const elapsed = c.emit; c.emit = 0;
      if (drift) {
        const cH = Math.cos(v.h), sH = Math.sin(v.h), distance = Math.hypot(v.x - c.skidX, v.z - c.skidZ);
        for (const side of [-1, 1]) {
          const x = v.x - cH * d.halfL * 0.65 - sH * side * d.halfW, z = v.z - sH * d.halfL * 0.65 + cH * side * d.halfW;
          this.emit('smoke', x, v.y + 0.3, z, 0xc8ccd2, 0.65, 0.8, -v.vx * 0.1, 0.7, -v.vz * 0.1, 1.6);
          if (distance > 0.08 && v.y - groundHeight(this.sim.map, v.x, v.z) < 0.35) {
            const length = Math.min(2.8, Math.max(0.3, Math.abs(v.vf) * elapsed));
            const f = this.emit('skid', x - cH * length / 2, groundHeight(this.sim.map, x, z) + 0.025, z - sH * length / 2, 0x151723, length, 12); f.mesh.rotation.set(-Math.PI / 2, 0, v.h); f.mesh.scale.set(length, 0.24, 1);
          }
        }
      }
      c.skidX = v.x; c.skidZ = v.z;
      const hp = v.hp / Math.max(1, v.maxHp), burning = v.wrecked && v.burn > 0;
      if (hp < 0.5 && (!v.wrecked || burning)) {
        const x = v.x + Math.cos(v.h) * d.halfL * 0.55, z = v.z + Math.sin(v.h) * d.halfL * 0.55;
        this.emit('smoke', x, v.y + d.height, z, hp < 0.25 ? 0x292a30 : 0x83868b, 0.9, burning ? 3.5 : 1.8, 0.2, 1.4, 0, 1.1);
        if (hp < 0.25) this.emit('fire', x, v.y + 0.9, z, burning && v.burn < 0.5 ? 0xffedbc : 0xff8b37, burning ? 2.1 : 0.65, 0.35, 0, 2, 0, 0.8);
      }
    }
  }
  private spikeMeshes: THREE.Mesh[] = [];
  private spikeStrips(): void {
    const ks = this.sim.spikes;
    while (this.spikeMeshes.length < ks.length) { const m = new THREE.Mesh(this.box, this.ownMat(new THREE.MeshBasicMaterial({ color: 0xb8bcc4 }))); m.scale.set(0.5, 0.06, 7); this.root.add(m); this.spikeMeshes.push(m); }
    this.spikeMeshes.forEach((m, i) => { const k = ks[i]; m.visible = !!k; if (k) { m.position.set(k.x, groundHeight(this.sim.map, k.x, k.z) + 0.05, k.z); m.rotation.y = -k.h; } });
  }
  private sirenWash(): void {
    let best: Vehicle | undefined, bd = 70;
    for (const v of this.sim.vehicles) if (v.siren && !v.wrecked) { const d = Math.hypot(v.x - this.cameraPos.x, v.z - this.cameraPos.z); if (d < bd) { bd = d; best = v; } }
    const l = this.sirenLight; if (!best) { l.intensity = 0; return; }
    const red = Math.floor(this.time * 9) % 2 === 0; l.color.setHex(red ? 0xff3b3b : 0x3b7bff); l.position.set(best.x, best.y + 2.6, best.z);
    l.intensity = (this.quality === 'low' ? 0 : 38) * clamp(1.15 - bd / 70, 0, 1);
  }
  update(dt: number, camera: THREE.PerspectiveCamera, clock: number): void {
    if (this.disposed) return; dt = Math.max(0, Number.isFinite(dt) ? dt : 0); this.time += dt; camera.getWorldPosition(this.cameraPos); this.sirenWash(); this.spikeStrips();
    const hour = ((clock % 24) + 24) % 24, night = hour >= 20 || hour < 6, livePeds = this.livePeds; livePeds.clear();
    for (const p of this.sim.peds) {
      livePeds.add(p.id); const dist = Math.hypot(p.x - this.cameraPos.x, p.z - this.cameraPos.z), player = p.id === this.sim.player.id;
      let r = this.rigs.get(p.id); if (!r && !player && dist > 160) continue; r ??= this.makeRig(p); r.flashT = Math.max(0, r.flashT - dt);
      const dead = p.alive ? 0 : Math.max(0, this.sim.t - p.diedAt), sink = player ? 0 : clamp((dead - 7) / 3, 0, 1);
      r.root.visible = !p.vehicle && (player || (dist <= 160 && sink < 1)); if (!r.root.visible) continue;
      const weapon = p.guns[p.cur]?.id ?? 'fist';
      if (weapon !== r.weapon) {
        if (r.gun) { this.release(r.gun); r.gun = null; } r.weapon = weapon;
        if (weapon !== 'fist') { r.gun = this.gun(weapon); const bounds = new THREE.Box3().setFromObject(r.gun); r.flash.position.set(clamp(bounds.max.x + 0.04, 0.25, 1.8), 0, 0); r.hand.add(r.gun); }
      }
      r.flash.visible = p.alive && weapon !== 'fist' && (p.muzzle > 0 || r.flashT > 0); r.flash.scale.setScalar(weapon === 'shotgun' || weapon === 'sniper' ? 0.95 : 0.65);
      r.root.position.set(p.x, p.y - sink * 2 + (p.alive && p.grounded ? Math.abs(Math.sin(p.walk * 1.35)) * Math.min(1, p.speed / 3.2) * 0.04 : 0), p.z);
      r.root.scale.set(1, p.crouch || p.mode === 'cower' ? 0.73 : 1, 1); r.root.rotation.set(0, -p.yaw, 0);
      if (!p.alive) { r.root.scale.setScalar(1); const fall = clamp(dead / 0.45, 0, 1); r.root.rotation.z = -Math.PI / 2 * fall; r.root.position.y += 0.27 * fall; }
      if (player || this.time >= r.nextPose || p.hurt > 0 || p.punchT > 0 || r.flash.visible) { this.pose(p, r); r.nextPose = this.time + (dist > 90 ? 0.22 : dist > 45 ? 0.1 : 0); }
    }
    this.prune(this.rigs, livePeds, r => r.root);
    const liveCars = this.liveCars; liveCars.clear(); this.contact.begin(night ? 1 : 0);
    for (const v of this.sim.vehicles) {
      liveCars.add(v.id); const near = Math.hypot(v.x - this.cameraPos.x, v.z - this.cameraPos.z) <= 320;
      let c = this.cars.get(v.id);
      if (c && c.paintColor !== v.color) {
        // Pay'n'Spray updates the simulation color; rebuild only this car's paint.
        this.release(c.root); this.cars.delete(v.id); c = undefined;
      }
      if (!c && !near) continue; c ??= this.makeCar(v); c.root.visible = near; if (near) {
        this.car(v, c, dt, night);
        const d = VEHICLES[v.kind], h = groundHeight(this.sim.map, v.x, v.z);
        // No flat decal across sloped ramps or rooftop geometry.
        if (h < .08) this.contact.add({ x: v.x, y: surfaceAt(this.sim.map, v.x, v.z) === 'road' ? .038 : .185, z: v.z, yaw: -v.h, length: d.halfL * 2.32, width: d.halfW * 2.55, gap: Math.max(0, v.y - h) });
      }
    }
    this.contact.end(); this.prune(this.cars, liveCars, c => c.root);
    const liveLoot = this.liveLoot; liveLoot.clear();
    for (const p of this.sim.pickups) {
      liveLoot.add(p.id); const dist = Math.hypot(p.x - this.cameraPos.x, p.z - this.cameraPos.z), visible = !p.taken && dist < 90;
      let l = this.loot.get(p.id); if (!l && !visible) continue; l ??= this.makeLoot(p); l.root.visible = visible;
      if (visible) { l.root.position.set(p.x, p.y, p.z); l.prop.position.y = 0.85 + Math.sin(this.time * 2 + p.id) * 0.12; l.prop.rotation.y = this.time * 0.65 + p.id; l.sparkle.visible = dist < 12; l.sparkle.material.opacity = 0.35 + 0.45 * Math.pow(Math.max(0, Math.sin(this.time * 4 + p.id)), 12); }
    }
    this.prune(this.loot, liveLoot, l => l.root); this.markers(); this.projectiles(dt); this.updateFx(dt, camera);
  }
  private markers(): void {
    let index = 0; const max = this.quality === 'low' ? 12 : 24;
    const add = (x: number, z: number, r: number, color: number, mission: boolean): void => {
      const dist = Math.hypot(x - this.cameraPos.x, z - this.cameraPos.z); if (index >= max || dist > (mission ? 300 : 100)) return;
      const b = this.beacons[index] ?? this.makeBeacon(), close = dist < 15; b.root.visible = true;
      b.root.position.set(x, groundHeight(this.sim.map, x, z), z); b.ring.scale.setScalar(Math.max(0.7, r)); b.ring.material.color.setHex(color); b.beam.material.color.setHex(color);
      const pulse = 0.82 + Math.sin(this.time * 2.2 + index) * 0.18, height = mission ? 40 : close ? 7 : 4;
      b.ring.material.opacity = (mission ? 0.7 : close ? 0.6 : 0.28) * pulse; b.beam.material.opacity = (mission ? 0.075 : close ? 0.045 : 0.02) * pulse;
      b.beam.scale.set(Math.max(0.5, r * 0.8), height, Math.max(0.5, r * 0.8)); b.beam.position.y = height / 2; index++;
    };
    for (const m of this.sim.mission.markers) add(m.x, m.z, m.r, m.color, true);
    for (const m of this.sim.activity.markers) add(m.x, m.z, m.r, m.color, true);
    for (const m of this.sim.job.markers) add(m.x, m.z, m.r, m.color, true);
    for (const m of MISSION_LIST) if (canStart(this.sim, m.id)) {
      const p = this.poiById.get(m.startPoi);
      if (p) add(p.x, p.z, p.r, 0xffd23f, true);
    }
    const nearby = this.nearbyPois, cx = this.cameraPos.x, cz = this.cameraPos.z;
    nearby.length = 0;
    for (const p of this.sim.map.pois) {
      if (POI[p.kind] === undefined || (p.x - cx) ** 2 + (p.z - cz) ** 2 >= 10000) continue;
      nearby.push(p);
    }
    nearby.sort((a, b) => ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
    for (const p of nearby) add(p.x, p.z, Math.min(2.2, p.r), POI[p.kind], false);
    for (; index < this.beacons.length; index++) this.beacons[index].root.visible = false;
  }
  private projectiles(dt: number): void {
    const live = this.liveRocketIds; live.clear();
    for (const p of this.sim.projectiles) {
      live.add(p.id); let g = this.rockets.get(p.id); const visible = Math.hypot(p.x - this.cameraPos.x, p.z - this.cameraPos.z) < 320; if (!g && !visible) continue;
      if (!g && p.kind === 'grenade') { g = new THREE.Group(); this.mesh(g, this.ball, 0x3d4a35, 0, 0, 0, 0.11, 0.14, 0.11); this.mesh(g, this.box, 0x8a8f86, 0, 0.14, 0, 0.05, 0.05, 0.05); this.root.add(g); this.rockets.set(p.id, g); g.userData.trail = 0; }
      if (!g) {
        g = new THREE.Group(); this.mesh(g, this.cylinder, 0x7b836a, 0, 0, 0, 0.075, 0.65, 0.075); this.mesh(g, this.cone, 0x3e4546, 0, 0.45, 0, 0.075, 0.25, 0.075);
        const fire = this.sprite(g, 0xffb750, 0.9); fire.position.y = -0.45; this.root.add(g); this.rockets.set(p.id, g); g.userData.trail = 0;
      }
      g.visible = visible; if (!visible) continue; g.position.set(p.x, p.y, p.z); if (p.kind === 'grenade') { g.rotation.x += dt * 9; continue; } this.v.set(p.vx, p.vy, p.vz); if (this.v.lengthSq() > 0) g.quaternion.setFromUnitVectors(UP, this.v.normalize());
      g.userData.trail = (g.userData.trail as number) + dt;
      if (g.userData.trail >= 0.035) {
        const steps = Math.min(8, Math.floor((g.userData.trail as number) / 0.035)); g.userData.trail = 0;
        for (let i = 0; i < steps; i++) { const back = i * 0.035; this.emit('smoke', p.x - p.vx * back, p.y - p.vy * back, p.z - p.vz * back, 0x8f9398, 0.45, 1.1, 0, 0.2, 0, 1.1); } this.emit('fire', p.x, p.y, p.z, 0xffac41, 0.75, 0.1);
      }
    }
    this.prune(this.rockets, live, g => g);
  }
  private updateFx(dt: number, camera: THREE.PerspectiveCamera): void {
    camera.getWorldQuaternion(this.q);
    for (const f of this.fx) {
      if (f.life <= 0) continue; f.life -= dt; const m = f.mesh; if (f.life <= 0) { m.visible = false; continue; }
      const age = f.total - f.life, fade = clamp(f.life / Math.min(f.total, f.kind === 'skid' || f.kind === 'pool' ? 3 : f.total), 0, 1); m.material.opacity = fade * f.alpha;
      m.position.x += f.vx * dt; m.position.y += f.vy * dt; m.position.z += f.vz * dt;
      if (f.kind === 'spark' || f.kind === 'blood' || f.kind === 'debris') { f.vy -= dt * 12; m.rotation.x += dt * 6; m.rotation.z += dt * 4; }
      if (f.kind === 'fire' || f.kind === 'smoke' || f.kind === 'blood') m.quaternion.copy(this.q);
      if (f.kind !== 'tracer' && f.kind !== 'skid') { const s = Math.max(0.001, f.size + age * f.growth); m.scale.set(s, s * (f.kind === 'fire' ? 1.25 : 1), s); }
      if (f.kind === 'spark') m.scale.set(f.size, f.size * 4, f.size);
    }
    for (const light of this.lights) light.intensity *= Math.exp(-dt * 18);
  }
  private prune<T>(map: Map<number, T>, live: Set<number>, node: (v: T) => THREE.Object3D): void { for (const [id, value] of map) if (!live.has(id)) { this.release(node(value)); map.delete(id); } }
  private release(root: THREE.Object3D): void {
    // 외부 모델 지오메트리와 instantiate의 공용 재질은 소유하지 않습니다.
    root.removeFromParent(); root.traverse(o => {
      if (o instanceof THREE.Sprite && this.materials.has(o.material)) { o.material.dispose(); this.materials.delete(o.material); }
      if (o instanceof THREE.Mesh) this.releaseMaterials(o);
    });
  }
  private releaseMaterials(o: THREE.Mesh): void { for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (this.materials.has(m) && !this.paletteMaterials.has(m)) { m.dispose(); this.materials.delete(m); } }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.contact.dispose(); this.root.removeFromParent(); this.root.clear();
    for (const g of this.geometries) g.dispose(); for (const m of this.materials) m.dispose(); this.glow.dispose();
    this.beaconBeamGeometry = null; this.geometries.clear(); this.materials.clear(); this.palette.clear(); this.paletteMaterials.clear(); this.nearbyPois.length = 0; this.poiById.clear(); this.articulated.clear(); this.rigs.clear(); this.cars.clear(); this.loot.clear(); this.rockets.clear(); this.beacons.length = 0; this.fx.length = 0; this.lights.length = 0;
  }
}
