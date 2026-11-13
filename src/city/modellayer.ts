// LAST CITY — Blender 모델을 그리는 층: 캐릭터(인스턴싱)·차량·건물·소품·1인칭 총.
import * as THREE from 'three';
import { ACTORS, BLOCK, BLOCKS, CIV, FACTIONS, PITCH, POLICE, ROAD, SIZE, type WeaponId } from './defs';
import { makeRng } from './map';
import { CHAR_KINDS, instantiate, type Baked, type Models } from './models';
import type { Actor, Structure, Vehicle, World } from './world';

const CLOTH = [0x8d99ae, 0xb08968, 0x6d8a96, 0xa58fb3, 0x9aa37b, 0xc58f8f, 0xd27d5a, 0x5f9ea0], SKIN = [0xf1c9a5, 0xd9a47a, 0xa8744f, 0x7a5236, 0xf5d6b8];
export const fcol = (f: number): number => f === POLICE ? 0x3f6fe0 : f === CIV ? 0x9aa3ad : new THREE.Color(FACTIONS[f]?.color ?? '#fff').getHex();
const CAP: Record<string, number> = { civ: 160, civ2: 120, civ3: 120, civ4: 120, rifle: 260, worker: 160, merc: 120, guard: 80, boss: 12, heavy: 120, sniper: 80, medic: 60, cop: 60, swat: 60 };
const MUZZLE: Record<string, number> = { pistol: 0.26, smg: 0.5, shotgun: 0.7, rifle: 0.82, sniper: 1.12, rocket: 0.95, minigun: 0.75, railgun: 0.98 };
const CIV_SKINS = ['civ', 'civ2', 'civ3', 'civ4'];
const CIV_CARS = ['sedan', 'hatch', 'suv', 'sedan', 'taxi', 'van', 'hatch'];
const VEHICLE_MODEL: Record<string, string> = { sedan: 'sedan', sports: 'sports', truck: 'truck', police: 'police', tank: 'tank' };

interface CharSet { fixed?: THREE.InstancedMesh; team?: THREE.InstancedMesh; skin?: THREE.InstancedMesh; glow?: THREE.InstancedMesh; leg?: THREE.InstancedMesh; n: number; nl: number }

export class ModelLayer {
  private d = new THREE.Object3D(); private base = new THREE.Matrix4(); private local = new THREE.Matrix4(); private q = new THREE.Quaternion(); private qz = new THREE.Quaternion();
  private v1 = new THREE.Vector3(); private one = new THREE.Vector3(1, 1, 1); private col = new THREE.Color(); private zAxis = new THREE.Vector3(0, 0, 1); private yAxis = new THREE.Vector3(0, 1, 0);
  private sets: Record<string, CharSet> = {}; private mechs = new Map<number, THREE.Object3D>(); private crystalMesh: THREE.InstancedMesh;
  private lam = new THREE.MeshLambertMaterial({ vertexColors: true }); private basic = new THREE.MeshBasicMaterial({ vertexColors: true });
  vmScene = new THREE.Scene(); vmCam = new THREE.PerspectiveCamera(64, 1, 0.5, 200); private vm: THREE.Object3D | null = null; private vmId = ''; private vmSwap = 0; private flash: THREE.Sprite;

  constructor(private scene: THREE.Scene, private world: World, private models: Models, glow: THREE.Texture, shadows: boolean) {
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, tint: boolean, shadow = shadows): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (tint) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      scene.add(m); return m;
    };
    for (const k of CHAR_KINDS) {
      const cm = models.chars[k], cap = CAP[k] ?? 80, s: CharSet = { n: 0, nl: 0 };
      if (cm.body.fixed) s.fixed = mk(cm.body.fixed, this.lam, cap, false);
      if (cm.body.team) s.team = mk(cm.body.team, this.lam, cap, true);
      if (cm.body.skin) s.skin = mk(cm.body.skin, this.lam, cap, true, false);
      if (cm.body.glow) s.glow = mk(cm.body.glow, this.basic, cap, false, false);
      if (cm.leg.fixed) s.leg = mk(cm.leg.fixed, this.lam, cap * 2, false);
      this.sets[k] = s;
    }
    // 크리스탈 / 나무 / 가로등 / 거리 소품
    this.crystalMesh = mk(models.baked.crystal.fixed!, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x12465e }), world.crystals.length, false, false);
    this.scatter();
    // 1인칭 총 장면 (별도 패스: 벽을 뚫고 나오지 않게 깊이를 지우고 그립니다)
    this.vmScene.add(new THREE.HemisphereLight(0xdbe6ff, 0x6a5a50, 1.9)); const sun = new THREE.DirectionalLight(0xffe2b8, 2.4); sun.position.set(2, 4, 3); this.vmScene.add(sun);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffd98a, blending: THREE.AdditiveBlending, depthTest: false, transparent: true })); this.flash.scale.set(0.55, 0.55, 1); this.flash.visible = false; this.flash.renderOrder = 10;
  }

  private inst(b: Baked, mat: THREE.Material, n: number, shadow = false): THREE.InstancedMesh | null {
    if (!b.fixed) return null; const m = new THREE.InstancedMesh(b.fixed, mat, n); m.frustumCulled = false; m.castShadow = shadow; this.scene.add(m); return m;
  }

  private scatter(): void {
    const w = this.world, rng = makeRng(20261113), d = this.d, B = this.models.baked, put = (m: THREE.InstancedMesh, i: number, x: number, z: number, ry: number, s: number, sy = s): void => { d.position.set(x, 0, z); d.rotation.set(0, ry, 0); d.scale.set(s, sy, s); d.updateMatrix(); m.setMatrixAt(i, d.matrix); };
    // 나무
    const rounds = w.map.trees.filter((_, i) => i % 3 !== 0), pines = w.map.trees.filter((_, i) => i % 3 === 0);
    for (const [name, list, rad] of [['tree_round', rounds, 1.9], ['tree_pine', pines, 2.0]] as const) {
      const m = this.inst(B[name], this.lam, list.length, true); if (!m) continue; list.forEach((t, i) => put(m, i, t.x, t.y, t.x * 0.37, (t.r / rad) * 1.05, (t.r / rad) * (0.9 + (i % 3) * 0.12))); m.count = list.length; m.instanceMatrix.needsUpdate = true;
    }
    // 가로등
    const corners: [number, number][] = [[8, 8], [BLOCK - 8, 8], [8, BLOCK - 8], [BLOCK - 8, BLOCK - 8]], lampN = w.map.blocks.length * 4;
    const lamp = this.inst(B.lamp, this.lam, lampN, true); let glowLamp: THREE.InstancedMesh | null = null;
    if (B.lamp.glow) { glowLamp = new THREE.InstancedMesh(B.lamp.glow, this.basic, lampN); glowLamp.frustumCulled = false; this.scene.add(glowLamp); }
    let i = 0;
    for (const b of w.map.blocks) for (const [dx, dy] of corners) {
      const ang = Math.atan2(dy - BLOCK / 2, dx - BLOCK / 2); d.position.set(b.x + dx, 0, b.y + dy); d.rotation.set(0, -ang, 0); d.scale.setScalar(10); d.updateMatrix();
      lamp?.setMatrixAt(i, d.matrix); glowLamp?.setMatrixAt(i, d.matrix); i++;
    }
    // 신호등: 교차로 모서리마다
    const tlR = this.inst(B.tl_red, this.lam, 220), tlG = this.inst(B.tl_green, this.lam, 220), tlRg = B.tl_red.glow ? new THREE.InstancedMesh(B.tl_red.glow, this.basic, 220) : null, tlGg = B.tl_green.glow ? new THREE.InstancedMesh(B.tl_green.glow, this.basic, 220) : null;
    if (tlRg) { tlRg.frustumCulled = false; this.scene.add(tlRg); } if (tlGg) { tlGg.frustumCulled = false; this.scene.add(tlGg); }
    let nr = 0, ng = 0;
    for (const b of w.map.blocks) for (const [cx, cy, ry] of [[16, 16, 0], [BLOCK - 16, 16, 0], [16, BLOCK - 16, Math.PI], [BLOCK - 16, BLOCK - 16, Math.PI]] as const) {
      if (rng() < 0.45) continue; const red = (cx < BLOCK / 2) === (cy < BLOCK / 2); d.position.set(b.x + cx, 0, b.y + cy); d.rotation.set(0, ry + (cx > BLOCK / 2 ? Math.PI : 0) * 0, 0); d.scale.setScalar(10); d.updateMatrix();
      if (red) { tlR?.setMatrixAt(nr, d.matrix); tlRg?.setMatrixAt(nr, d.matrix); nr++; } else { tlG?.setMatrixAt(ng, d.matrix); tlGg?.setMatrixAt(ng, d.matrix); ng++; }
    }
    for (const [m, n] of [[tlR, nr], [tlRg, nr], [tlG, ng], [tlGg, ng]] as const) if (m) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    // 보도 소품: 블록 가장자리를 따라
    const edge = (b: { x: number; y: number }, inset: number): { x: number; z: number; nx: number; ny: number } => {
      const side = Math.floor(rng() * 4), t = 30 + rng() * (BLOCK - 60);
      return side === 0 ? { x: b.x + t, z: b.y + inset, nx: 0, ny: -1 } : side === 1 ? { x: b.x + BLOCK - inset, z: b.y + t, nx: 1, ny: 0 } : side === 2 ? { x: b.x + t, z: b.y + BLOCK - inset, nx: 0, ny: 1 } : { x: b.x + inset, z: b.y + t, nx: -1, ny: 0 };
    };
    const plan: [string, number, number][] = [['hydrant', 1, 7], ['bin', 1, 9], ['mailbox', 0.5, 8], ['bench', 0.5, 12], ['dumpster', 0.3, 10], ['cone', 0.8, 8], ['barrier', 0.3, 9]];
    for (const [name, per, inset] of plan) {
      const items: { x: number; z: number; ry: number }[] = [];
      for (const b of w.map.blocks) { if (b.type === 'base') continue; let n = Math.floor(per) + (rng() < per % 1 ? 1 : 0); if (name === 'barrier' && b.type !== 'police' && b.type !== 'military') n = rng() < 0.15 ? 1 : 0; while (n-- > 0) { const e = edge(b, inset); items.push({ x: e.x, z: e.z, ry: -Math.atan2(e.ny, e.nx) + (name === 'barrier' ? Math.PI / 2 : 0) }); if (name === 'cone') for (let k = 1; k < 3; k++) items.push({ x: e.x + k * 14 * (e.ny !== 0 ? 1 : 0), z: e.z + k * 14 * (e.nx !== 0 ? 1 : 0), ry: 0 }); } }
      const m = this.inst(B[name], this.lam, items.length, false); if (!m) continue; items.forEach((it, k) => put(m, k, it.x, it.z, it.ry, 10)); m.count = items.length; m.instanceMatrix.needsUpdate = true;
    }
    if (lamp) lamp.instanceMatrix.needsUpdate = true;
    if (glowLamp) glowLamp.instanceMatrix.needsUpdate = true;
  }

  // ---------- 개별 모델 ----------
  makeStruct(s: Structure): THREE.Object3D | null { const t = this.models.structures[s.kind]; if (!t) return null; const g = instantiate(t, { team: fcol(s.f) }); g.scale.setScalar(10); g.position.set(s.x + s.w / 2, 0, s.y + s.h / 2); return g; }
  makeVehicle(v: Vehicle): THREE.Object3D | null {
    const t = this.models.vehicles[v.kind === 'sedan' ? CIV_CARS[v.id % CIV_CARS.length] : VEHICLE_MODEL[v.kind]]; if (!t) return null;
    const g = instantiate(t, { paint: new THREE.Color(v.color).getHex(), team: fcol(Math.max(0, v.f)) }); g.scale.setScalar(v.kind === 'tank' ? 14 : 18); return g;
  }
  makeLootGun(id: string): THREE.Object3D | null { const t = this.models.groundGuns[id]; return t ? instantiate(t) : null; }
  makeCrate(): THREE.Object3D | null { const t = this.models.props.crate; return t ? instantiate(t) : null; }
  makePlane(): THREE.Object3D | null { const t = this.models.props.plane; if (!t) return null; const g = instantiate(t); g.scale.setScalar(10); return g; }

  // ---------- 매 프레임 ----------
  update(pb: Actor | null, third: boolean, cam: THREE.Vector3): void {
    const w = this.world, d = this.d, base = this.base, local = this.local;
    for (const k of CHAR_KINDS) { const s = this.sets[k]; s.n = 0; s.nl = 0; }
    const seenMech = new Set<number>();
    for (const a of w.actors) {
      if (!a.alive || a.inVeh) continue; const dx = a.x - cam.x, dz = a.y - cam.z; if (dx * dx + dz * dz > 2600 * 2600) continue;
      const def = ACTORS[a.kind];
      if (def.mech) { seenMech.add(a.id); this.syncMech(a); continue; }
      if (a === pb && !third) continue; const key = a.kind === 'civ' ? CIV_SKINS[a.id % 4] : a.kind, s = this.sets[key]; if (!s) continue;
      const cap = CAP[key] ?? 80; if (s.n >= cap) continue;
      const S = a.kind === 'boss' ? 21 : a.kind === 'heavy' ? 20 : 19, spd = Math.hypot(a.vx, a.vy), bob = Math.abs(Math.sin(a.walk * 0.09)) * Math.min(1, spd / 70) * 0.04 * S;
      this.q.setFromAxisAngle(this.yAxis, -a.ang); this.v1.set(a.x, bob, a.y); base.compose(this.v1, this.q, d.scale.set(S, S, S));
      const i = s.n++; const team = a.flash > 0 ? 0xffffff : a.f === CIV ? CLOTH[a.slot % CLOTH.length] : fcol(a.f);
      s.fixed?.setMatrixAt(i, base); s.glow?.setMatrixAt(i, base);
      if (s.team) { s.team.setMatrixAt(i, base); s.team.setColorAt(i, this.col.setHex(team)); }
      if (s.skin) { s.skin.setMatrixAt(i, base); s.skin.setColorAt(i, this.col.setHex(a.flash > 0 ? 0xffffff : SKIN[a.id % SKIN.length])); }
      if (s.leg) {
        const swing = Math.sin(a.walk * 0.09) * 0.75 * Math.min(1, spd / 70);
        for (let side = -1; side <= 1; side += 2) { this.qz.setFromAxisAngle(this.zAxis, swing * side); this.v1.set(0, 0.9, side * 0.11); local.compose(this.v1, this.qz, this.one); this.d.matrix.multiplyMatrices(base, local); s.leg.setMatrixAt(s.nl++, this.d.matrix); }
      }
    }
    for (const k of CHAR_KINDS) {
      const s = this.sets[k]; for (const m of [s.fixed, s.team, s.skin, s.glow]) if (m) { m.count = s.n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      if (s.leg) { s.leg.count = s.nl; s.leg.instanceMatrix.needsUpdate = true; }
    }
    for (const [id, g] of this.mechs) if (!seenMech.has(id)) { this.scene.remove(g); this.mechs.delete(id); }
    // 크리스탈
    let nc = 0; for (const c of w.crystals) { if (c.amount <= 0) continue; const s = 13 + 12 * c.amount / c.max; d.rotation.set(0, c.id * 1.7, 0); d.position.set(c.x, 0, c.y); d.scale.setScalar(s); d.updateMatrix(); this.crystalMesh.setMatrixAt(nc++, d.matrix); }
    this.crystalMesh.count = 0; void nc; this.crystalMesh.instanceMatrix.needsUpdate = true;
  }
  private syncMech(a: Actor): void {
    let g = this.mechs.get(a.id);
    if (!g) { const t = this.models.vehicles[a.kind]; if (!t) return; g = instantiate(t, { team: fcol(a.f) }); g.scale.setScalar(12); this.scene.add(g); this.mechs.set(a.id, g); }
    g.position.set(a.x, 0, a.y); g.rotation.y = -a.ang;
  }

  // ---------- 1인칭 총 ----------
  viewmodel(show: boolean, id: WeaponId, dt: number, recoil: number, reloading: boolean, moving: number, t: number, fireFlash: boolean): void {
    if (id !== this.vmId) {
      this.vmId = id; if (this.vm) this.vmScene.remove(this.vm); this.vm = null; const tpl = this.models.viewGuns[id]; this.vmSwap = 0.35;
      if (tpl) { this.vm = instantiate(tpl); this.vm.traverse(o => { (o as THREE.Mesh).castShadow = false; }); this.vm.add(this.flash); this.flash.position.set(MUZZLE[id] ?? 0.6, 0.05, 0); this.vmScene.add(this.vm); }
    }
    if (!this.vm) return; this.vm.visible = show; if (!show) return;
    this.vmSwap = Math.max(0, this.vmSwap - dt); const sw = this.vmSwap / 0.35, bob = Math.sin(t * 9) * 0.35 * moving, sway = Math.cos(t * 4.5) * 0.25 * moving;
    const big = id === 'rocket' || id === 'minigun' || id === 'sniper' ? 11 : 12.5;
    this.vm.scale.setScalar(big); this.vm.rotation.set(recoil * 0.1 - (reloading ? 0.7 : 0) - sw * 0.8, Math.PI / 2 + recoil * 0.02, 0);
    this.vm.position.set(4.6 + sway, -4.4 + bob - (reloading ? 3 : 0) - sw * 5, -9.5 + recoil * 1.4);
    this.flash.visible = fireFlash; this.flash.material.rotation = t * 40;
  }
  syncViewCam(cam: THREE.PerspectiveCamera): void { this.vmCam.fov = cam.fov; this.vmCam.aspect = cam.aspect; this.vmCam.updateProjectionMatrix(); }
}
export { SIZE, PITCH, ROAD, BLOCKS };
