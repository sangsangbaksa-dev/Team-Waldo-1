// FRONTLINE 롤식 라인전 — 3D 화면: 지형, 챔피언·미니언·포탑·몬스터, 스킬 이펙트, 카메라. 시뮬레이션은 읽기만 합니다.
import * as THREE from 'three';
import { makeEnvironment, standardize } from '../../shared/gfx';
import { readPreferences } from '../../prefs';
import { makePost, type PostFx } from '../../postfx';
import { makeBuilding, makeUnit, matsFor, type BuildRig, type UnitRig } from '../models';
import { CHAMPS, LANE_PTS, LANES, NEXUS, RIVER, SIZE, type ChampId, type MonsterKind } from './config';
import { animateChamp, decorateChamp } from './champs3d';
import { buildScenery, type Scenery } from './scenery3d';
import { isMinion, type Ent, type MobaSim, type SimEvent } from './sim';
import { addLaneDetails, decorateStructure } from './detail3d';

type Quality = 'high' | 'standard' | 'low';
interface Vis { id: number; root: THREE.Group; rig: UnitRig | null; brig: BuildRig | null; ring: THREE.Mesh | null; x: number; y: number; yaw: number; moved: number; hit: number; seen: boolean; mon: THREE.Group | null }
interface Fx { obj: THREE.Object3D; t: number; life: number; tick: (f: Fx, dt: number) => void }
const rng = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const TEAM_HEX = ['#3d8bff', '#ff5a3c'];

export class MobaView {
  post: PostFx | null = null; readonly renderer: THREE.WebGLRenderer; readonly scene = new THREE.Scene(); readonly camera = new THREE.PerspectiveCamera(34, 1, 0.5, 600);
  cam = { x: 14, y: 84, dist: 30 }; private pitch = 0.98; private w = 1; private h = 1; private clock = 0;
  private vis = new Map<number, Vis>(); private fx: Fx[] = []; private raycaster = new THREE.Raycaster(); private sun = new THREE.DirectionalLight(0xffe2b4, 2.4);
  private shadows: boolean; private aim: THREE.Mesh; private aimRange: THREE.Mesh; private fxBudget: number;
  private glow = new Map<number, THREE.MeshBasicMaterial>();
  private environment: THREE.Texture | null = null; private reducedMotion = readPreferences().reducedMotion;
  private scenery!: Scenery; private fog!: THREE.Mesh; private fogCtx!: CanvasRenderingContext2D; private fogTex!: THREE.CanvasTexture; private fogT = 0; private wardVis = new Map<number, THREE.Group>();

  constructor(readonly canvas: HTMLCanvasElement, readonly sim: MobaSim, readonly quality: Quality = 'high') {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5)); this.shadows = quality !== 'low';
    this.renderer.shadowMap.enabled = this.shadows; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.fxBudget = quality === 'high' ? 140 : quality === 'standard' ? 80 : 36;
    const sky = new THREE.Color(0xc4cfb0); this.scene.background = sky; this.scene.fog = new THREE.Fog(sky, 100, 250);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x5a5a3c, 1.25));
    const rim = new THREE.DirectionalLight(0x9ebcff, 0.6); rim.position.set(30, 20, -35); this.scene.add(rim);
    this.sun.castShadow = this.shadows; const sc = this.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160; this.sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024); this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    if (quality === 'high') { this.environment = makeEnvironment(this.renderer, { top: 0x648ec6, horizon: 0xf2d6ad, ground: 0x435541, sun: 0xffe1a9, sunDir: [-0.45, 1, 0.4], sunPower: 3 }); this.scene.environment = this.environment; }
    this.buildTerrain(); addLaneDetails(this.scene, quality); this.scenery = buildScenery(this.scene, sim.map, this.shadows, quality === 'low'); this.buildFog();
    this.aim = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })); this.aim.rotation.x = -Math.PI / 2; this.aim.position.y = 0.08; this.aim.visible = false; this.scene.add(this.aim);
    this.aimRange = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })); this.aimRange.rotation.x = -Math.PI / 2; this.aimRange.position.y = 0.07; this.aimRange.visible = false; this.scene.add(this.aimRange);
    const me = sim.me(); this.cam.x = me.x; this.cam.y = me.y; if (window.innerWidth < 900 || matchMedia('(pointer: coarse)').matches) this.cam.dist = 32;
    this.resize(canvas.clientWidth || 800, canvas.clientHeight || 600);
    this.post = makePost(quality, this.renderer, this.scene, this.camera, { strength: 0.4, radius: 0.5, threshold: 0.9, vignette: 0.24, saturation: 1.1 });
  }

  // ---------- 지형 ----------
  private buildTerrain(): void {
    const n = SIZE, r = rng(11), tex = document.createElement('canvas'); tex.width = tex.height = 1600; const g = tex.getContext('2d')!, k = tex.width / n;
    g.fillStyle = '#5f7a45'; g.fillRect(0, 0, tex.width, tex.height);
    const blot = (c: string, count: number, r0: number, r1: number, a: number): void => { for (let i = 0; i < count; i++) { g.globalAlpha = a * (0.4 + r() * 0.6); g.fillStyle = c; g.beginPath(); g.arc(r() * tex.width, r() * tex.height, (r0 + r() * (r1 - r0)) * k, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; };
    blot('#4d6a38', 320, 1, 5, 0.35); blot('#6f8a4d', 260, 0.8, 3.4, 0.3); blot('#3f5a2e', 200, 0.4, 1.6, 0.3);
    const poly = (pts: Array<{ x: number; y: number }>, w: number, style: string): void => { g.strokeStyle = style; g.lineWidth = w * k; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k))); g.stroke(); };
    // 정글 길(옅은 흙길): 둥지에서 길목으로 가는 길은 장식 정도로만.
    poly(RIVER, 7.5, 'rgba(70,150,190,.55)'); poly(RIVER, 5.2, 'rgba(96,190,225,.85)'); poly(RIVER, 2.2, 'rgba(160,225,245,.7)');
    for (const l of LANES) { poly(LANE_PTS[l], 8.5, 'rgba(96,84,60,.55)'); poly(LANE_PTS[l], 7, '#a8946a'); poly(LANE_PTS[l], 5, '#b9a67c'); }
    // Fine irregular ground markings break up the broad color fields at camera height.
    for (let i = 0; i < (this.quality === 'low' ? 2500 : 8000); i++) {
      const x = r() * tex.width, y = r() * tex.height, size = 1 + r() * 5;
      g.fillStyle = r() < 0.5 ? 'rgba(32,55,29,.12)' : 'rgba(224,213,158,.12)';
      g.beginPath(); g.ellipse(x, y, size, size * (0.25 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    for (const c of this.sim.map.camps) { const gr = g.createRadialGradient(c.at.x * k, c.at.y * k, 0, c.at.x * k, c.at.y * k, 4.4 * k); gr.addColorStop(0, 'rgba(160,140,100,.9)'); gr.addColorStop(1, 'rgba(160,140,100,0)'); g.fillStyle = gr; g.fillRect((c.at.x - 5) * k, (c.at.y - 5) * k, 10 * k, 10 * k); }
    NEXUS.forEach((b, t) => { const gr = g.createRadialGradient(b.x * k, b.y * k, 3 * k, b.x * k, b.y * k, 13 * k); gr.addColorStop(0, t === 0 ? 'rgba(80,130,210,.85)' : 'rgba(215,95,70,.85)'); gr.addColorStop(0.75, t === 0 ? 'rgba(120,150,190,.45)' : 'rgba(190,130,110,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect((b.x - 14) * k, (b.y - 14) * k, 28 * k, 28 * k); });
    const map = new THREE.CanvasTexture(tex); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshStandardMaterial({ map, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(n / 2, 0, n / 2); ground.receiveShadow = true; this.scene.add(ground);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x3f5a35, roughness: 1 })); far.rotation.x = -Math.PI / 2; far.position.set(n / 2, -0.05, n / 2); this.scene.add(far);
    // 바위 덩어리와 나무
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), 1400), col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); let ri = 0;
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 2.8, 6), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), 900), trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 5), new THREE.MeshStandardMaterial({ color: 0x4a3a28 }), 900); let ti = 0;
    for (const b of this.sim.map.boulders) {
      const parts = Math.max(2, Math.round(b.r * 2.2));
      for (let i = 0; i < parts && ri < 1400; i++) { const a = r() * 6.28, d = r() * b.r * 0.7, s = b.r * (0.35 + r() * 0.35), h = 0.7 + r() * 0.8; e.set(r() * 3, r() * 6, r() * 3); q.setFromEuler(e); m4.compose(new THREE.Vector3(b.x + Math.cos(a) * d, s * h * 0.5, b.y + Math.sin(a) * d), q, new THREE.Vector3(s, s * h, s)); rocks.setMatrixAt(ri, m4); col.setHSL(0.09 + r() * 0.03, 0.1, 0.32 + r() * 0.14); rocks.setColorAt(ri++, col); }
      const nt = Math.round(b.r * 1.6); for (let i = 0; i < nt && ti < 900; i++) { const a = r() * 6.28, d = r() * b.r * 0.9, s = 0.8 + r() * 0.9, x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d; m4.compose(new THREE.Vector3(x, 0.8 + 1.4 * s, y), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trees.setMatrixAt(ti, m4); col.setHSL(0.27 + r() * 0.06, 0.45, 0.18 + r() * 0.1); trees.setColorAt(ti, col); m4.compose(new THREE.Vector3(x, 0.45 * s, y), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trunk.setMatrixAt(ti++, m4); }
    }
    rocks.count = ri; trees.count = ti; trunk.count = ti; rocks.castShadow = this.shadows; trees.castShadow = this.shadows; for (const m of [rocks, trees]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } trunk.instanceMatrix.needsUpdate = true; this.scene.add(rocks, trees, trunk);
    // 맵 테두리 산
    const edge = new THREE.InstancedMesh(new THREE.ConeGeometry(3, 9, 5), new THREE.MeshStandardMaterial({ color: 0x5a6a5c, flatShading: true, roughness: 1 }), 120);
    for (let i = 0; i < 120; i++) { const t = i / 120 * 4, side = Math.floor(t), a = (t - side) * (n + 24) - 12, d = -3 - r() * 6, s = 0.7 + r() * 0.9, x = side === 0 ? a : side === 1 ? n - d : side === 2 ? a : d, y = side === 0 ? d : side === 1 ? a : side === 2 ? n - d : a; m4.compose(new THREE.Vector3(x, 3 * s, y), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); edge.setMatrixAt(i, m4); }
    this.scene.add(edge);
  }

  // ---------- 시야 안개 ----------
  /** 아군이 보지 못하는 땅을 어둡게 덮는 판. 시야 원을 지워 가며 그립니다. */
  private buildFog(): void {
    const c = document.createElement('canvas'); c.width = c.height = 256; this.fogCtx = c.getContext('2d')!; this.fogTex = new THREE.CanvasTexture(c); this.fogTex.colorSpace = THREE.SRGBColorSpace;
    this.fog = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false })); this.fog.rotation.x = -Math.PI / 2; this.fog.position.set(SIZE / 2, 0.22, SIZE / 2); this.fog.renderOrder = 4; this.scene.add(this.fog); this.paintFog();
  }
  private paintFog(): void {
    const g = this.fogCtx, k = 256 / SIZE; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, 256, 256); g.fillStyle = 'rgba(10,16,26,0.5)'; g.fillRect(0, 0, 256, 256); g.globalCompositeOperation = 'destination-out';
    for (const o of this.sim.sightOf(this.sim.myTeam)) { const gr = g.createRadialGradient(o.x * k, o.y * k, o.r * k * 0.55, o.x * k, o.y * k, o.r * k); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(o.x * k, o.y * k, o.r * k, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over'; this.fogTex.needsUpdate = true;
  }
  private syncWards(): void {
    const live = new Set<number>();
    for (const w of this.sim.wards) {
      live.add(w.id); let g = this.wardVis.get(w.id);
      if (!g) { g = new THREE.Group(); const c = w.team === 0 ? 0x5dc8ff : 0xff6a4a, post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9 })), eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: c })), ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 24), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); post.position.y = 0.45; eye.position.y = 1.15; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(post, eye, ring); g.position.set(w.x, 0, w.y); g.userData.eye = eye; this.scene.add(g); this.wardVis.set(w.id, g); }
      g.visible = w.team === this.sim.myTeam || this.sim.seenPt(this.sim.myTeam, w.x, w.y); (g.userData.eye as THREE.Object3D).rotation.y = this.clock * 2; g.position.y = Math.sin(this.clock * 2 + w.id) * 0.04;
    }
    for (const [id, g] of this.wardVis) if (!live.has(id)) { this.scene.remove(g); this.wardVis.delete(id); }
  }

  // ---------- 카메라 ----------
  resize(w: number, h: number, pad = 0): void {
    this.w = Math.max(1, w); this.h = Math.max(1, h); this.renderer.setSize(this.w, this.h, false); this.camera.aspect = this.w / this.h;
    if (pad > 0) this.camera.setViewOffset(this.w, this.h + pad, 0, pad, this.w, this.h); else this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
  }
  zoom(f: number): void { this.cam.dist = Math.min(52, Math.max(18, this.cam.dist * f)); }
  lookAt(x: number, y: number): void { this.cam.x = Math.min(SIZE - 4, Math.max(4, x)); this.cam.y = Math.min(SIZE - 4, Math.max(4, y)); }
  pan(dx: number, dy: number): void { this.lookAt(this.cam.x + dx, this.cam.y + dy); }
  private placeCamera(): void {
    const { x, y, dist } = this.cam, c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    this.camera.position.set(x, dist * s, y + dist * c * 0.9 + 2); this.camera.lookAt(x, 0, y - 1.5); this.camera.updateMatrixWorld(); this.sun.position.set(x - 18, 40, y + 16); this.sun.target.position.set(x, 0, y); this.sun.target.updateMatrixWorld(); this.fitShadow(x, y, 34, 90);
  }
  /** 화면에 보이는 땅 전체에 그림자가 닿도록 그림자 카메라 범위를 줌·시점에 맞춥니다(범위 밖은 그림자가 뚝 끊겨 보입니다). */
  private fitShadow(x: number, z: number, min: number, max: number): void {
    if (!this.shadows) return; const cam = this.camera, o = cam.position; let r = min;
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const d = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(o); const hit = d.y < -1e-3 ? -o.y / d.y : Infinity;
      const gx = hit === Infinity ? o.x + d.x * 1e3 : o.x + d.x * hit, gz = hit === Infinity ? o.z + d.z * 1e3 : o.z + d.z * hit; r = Math.max(r, Math.hypot(gx - x, gz - z));
    }
    r = Math.min(max, r * 1.05); const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - r) > 1) { sc.left = sc.bottom = -r; sc.right = sc.top = r; sc.updateProjectionMatrix(); }
  }

  ground(sx: number, sy: number): { x: number; y: number } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1), this.camera); const r = this.raycaster.ray; if (r.direction.y > -0.001) return null; const t = -r.origin.y / r.direction.y; return { x: r.origin.x + r.direction.x * t, y: r.origin.z + r.direction.z * t };
  }
  project(x: number, y: number, h = 0): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, h, y).project(this.camera); if (v.z > 1 || v.z < -1) return null; return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }
  corners(bottom: number): Array<{ x: number; y: number }> { const o: Array<{ x: number; y: number }> = []; for (const [sx, sy] of [[0, 0], [this.w, 0], [this.w, bottom], [0, bottom]] as const) { const g = this.ground(sx, sy); if (g) o.push(g); } return o; }
  /** 화면 좌표 근처의 엔티티(적 우선). */
  pick(sx: number, sy: number, me: number): number {
    this.raycaster.setFromCamera(new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1), this.camera); const ray = this.raycaster.ray, sph = new THREE.Sphere(), v = new THREE.Vector3(); let best = 0, bt = Infinity;
    for (const e of this.sim.ents) {
      if (e.hp <= 0 || e.hero?.dead || e.id === me || !this.sim.canSee(this.sim.myTeam, e)) continue; const rad = Math.max(0.9, e.radius + 0.35) * (e.kind === 'nexus' ? 1.3 : e.kind === 'turret' ? 1.2 : 1);
      sph.set(v.set(e.x, e.kind === 'nexus' ? 2 : e.kind === 'turret' ? 1.5 : 0.8, e.y).clone(), rad); if (ray.intersectSphere(sph, v)) { const d = v.distanceTo(ray.origin); if (d < bt) { bt = d; best = e.id; } }
    }
    return best;
  }
  /** 스킬 조준선: 지름(반경) r 의 원을 (x,y)에, 시전 사거리 원을 영웅 주변에. */
  setAim(on: { x: number; y: number; r: number; range: number; from: { x: number; y: number }; color: number } | null): void {
    if (!on) { this.aim.visible = false; this.aimRange.visible = false; return; }
    this.aim.visible = true; this.aim.position.set(on.x, 0.08, on.y); this.aim.scale.setScalar(Math.max(0.4, on.r)); (this.aim.material as THREE.MeshBasicMaterial).color.setHex(on.color);
    this.aimRange.visible = on.range > 0; this.aimRange.position.set(on.from.x, 0.07, on.from.y); this.aimRange.scale.setScalar(on.range);
  }

  // ---------- 엔티티 ----------
  private monster(sub: MonsterKind, team: number): THREE.Group {
    const g = new THREE.Group(), m = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true, ...o });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = this.shadows; g.add(o); return o; };
    if (sub === 'wolf') { add(new THREE.BoxGeometry(0.9, 0.5, 0.45), m(0x6f6a66), 0, 0.45, 0); add(new THREE.BoxGeometry(0.4, 0.38, 0.38), m(0x857f7a), 0.6, 0.62, 0); add(new THREE.ConeGeometry(0.1, 0.25, 4), m(0x4a4642), 0.7, 0.9, 0.12); add(new THREE.ConeGeometry(0.1, 0.25, 4), m(0x4a4642), 0.7, 0.9, -0.12); for (const [x, z] of [[0.3, 0.18], [0.3, -0.18], [-0.3, 0.18], [-0.3, -0.18]]) add(new THREE.BoxGeometry(0.12, 0.35, 0.12), m(0x4a4642), x, 0.17, z); add(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd24a }), 0.8, 0.68, 0.1); add(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd24a }), 0.8, 0.68, -0.1); }
    else if (sub === 'golem') { add(new THREE.DodecahedronGeometry(0.8), m(0x7b7568), 0, 1.0, 0, 1, 1.15, 0.9); add(new THREE.DodecahedronGeometry(0.4), m(0x8c8576), 0.1, 1.95, 0); add(new THREE.DodecahedronGeometry(0.42), m(0x6a655a), 0, 1.0, 0.95); add(new THREE.DodecahedronGeometry(0.42), m(0x6a655a), 0, 1.0, -0.95); add(new THREE.BoxGeometry(0.08, 0.08, 0.26), new THREE.MeshBasicMaterial({ color: 0x6fe0ff }), 0.42, 2.0, 0); add(new THREE.OctahedronGeometry(0.28), m(0x4fd6ff, { emissive: 0x1d8fd0, emissiveIntensity: 1 }), 0.2, 1.1, 0.5); }
    else if (sub === 'drake') { add(new THREE.SphereGeometry(1.1, 10, 8), m(0xb53b2a), 0, 1.3, 0, 1.4, 0.9, 0.9); add(new THREE.SphereGeometry(0.6, 8, 6), m(0xcc4a33), 1.5, 1.9, 0); add(new THREE.ConeGeometry(0.2, 0.7, 5), m(0xffd2a0), 1.8, 2.35, 0.3); add(new THREE.ConeGeometry(0.2, 0.7, 5), m(0xffd2a0), 1.8, 2.35, -0.3); const w1 = add(new THREE.BoxGeometry(0.1, 1.6, 2.2), m(0x8f2c20), -0.2, 2.2, 1.4), w2 = add(new THREE.BoxGeometry(0.1, 1.6, 2.2), m(0x8f2c20), -0.2, 2.2, -1.4); w1.rotation.x = -0.5; w2.rotation.x = 0.5; add(new THREE.ConeGeometry(0.5, 2, 6), m(0x8f2c20), -1.9, 1.2, 0).rotation.z = Math.PI / 2; add(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffee88 }), 2, 2.05, 0.28); add(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffee88 }), 2, 2.05, -0.28); }
    else if (sub === 'raptor') { add(new THREE.SphereGeometry(0.34, 8, 6), m(0xd9923a), 0, 0.62, 0, 1.3, 1, 0.9); add(new THREE.SphereGeometry(0.2, 8, 6), m(0xe8b25a), 0.36, 0.95, 0); add(new THREE.ConeGeometry(0.07, 0.3, 4), m(0xffe9a0), 0.62, 0.92, 0).rotation.z = -Math.PI / 2; for (const z of [0.13, -0.13]) add(new THREE.BoxGeometry(0.07, 0.4, 0.07), m(0x6a4a20), 0, 0.2, z); add(new THREE.ConeGeometry(0.16, 0.7, 4), m(0xb5622a), -0.55, 0.7, 0).rotation.z = Math.PI / 2 + 0.4; add(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0x1a1008 }), 0.46, 1.0, 0.1); add(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0x1a1008 }), 0.46, 1.0, -0.1); }
    else if (sub === 'krug') { add(new THREE.DodecahedronGeometry(0.75), m(0x7a6a52), 0, 0.7, 0, 1.2, 0.8, 1); add(new THREE.DodecahedronGeometry(0.32), m(0x9a8a6e), 0.75, 0.62, 0); for (const [x, z] of [[0.4, 0.55], [0.4, -0.55], [-0.4, 0.55], [-0.4, -0.55]]) add(new THREE.CylinderGeometry(0.14, 0.18, 0.4, 5), m(0x5c4f3c), x, 0.2, z); add(new THREE.OctahedronGeometry(0.22), m(0xffa24a, { emissive: 0xc05a10, emissiveIntensity: 1 }), 0, 1.25, 0); }
    else if (sub === 'crab') { add(new THREE.SphereGeometry(0.55, 10, 8), m(0x3fb0a8, { emissive: 0x0f5a55, emissiveIntensity: 0.5 }), 0, 0.5, 0, 1.3, 0.55, 1); for (const z of [0.65, -0.65]) { add(new THREE.SphereGeometry(0.26, 8, 6), m(0xe8734a), 0.5, 0.5, z); add(new THREE.BoxGeometry(0.08, 0.2, 0.08), m(0x2a8a84), 0.55, 0.86, z * 0.4); } for (const z of [0.35, -0.35, 0.55, -0.55]) add(new THREE.BoxGeometry(0.5, 0.06, 0.06), m(0x2a8a84), -0.15, 0.22, z); }
    else { add(new THREE.SphereGeometry(1.5, 12, 8), m(0x5a2d8f, { emissive: 0x2a0f55, emissiveIntensity: 0.6 }), 0, 1.8, 0, 1, 1.1, 1); add(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7ad9 }), 1.2, 2.2, 0); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(new THREE.ConeGeometry(0.22, 2.2, 5), m(0x7a3fbf), Math.cos(a) * 1.5, 0.9, Math.sin(a) * 1.5).rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); } add(new THREE.ConeGeometry(0.2, 0.9, 5), m(0xffd2a0), 1.5, 3.1, 0.5); add(new THREE.ConeGeometry(0.2, 0.9, 5), m(0xffd2a0), 1.5, 3.1, -0.5); }
    void team; return g;
  }
  /** 억제기: 받침 위에 떠서 도는 수정. */
  private crystal(team: number): THREE.Group {
    const g = new THREE.Group(), c = team === 0 ? 0x4aa8ff : 0xff5a3a, base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x4d4a46, roughness: 0.85, flatShading: true })), gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.95), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.3, flatShading: true })); base.position.y = 0.3; gem.position.y = 1.9; gem.scale.y = 1.5; gem.userData.keep = true; gem.userData.spin = true; base.castShadow = gem.castShadow = this.shadows;
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2, pillar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.5, 0.25), new THREE.MeshStandardMaterial({ color: 0x6a655c, roughness: 0.9, flatShading: true })); pillar.position.set(Math.cos(a) * 1.05, 0.9, Math.sin(a) * 1.05); g.add(pillar); }
    g.add(base, gem); return g;
  }
  private make(e: Ent): Vis {
    const root = new THREE.Group(); let rig: UnitRig | null = null, brig: BuildRig | null = null, mon: THREE.Group | null = null, ring: THREE.Mesh | null = null;
    if (e.kind === 'hero') { const d = CHAMPS[e.sub as ChampId]; rig = makeUnit(d.model, e.team); decorateChamp(rig, e.sub as ChampId, e.team); rig.root.scale.setScalar(d.scale); root.add(rig.root); }
    else if (e.kind === 'melee' || e.kind === 'caster' || e.kind === 'siege') { rig = makeUnit(e.kind === 'melee' ? 'marine' : e.kind === 'caster' ? 'worker' : 'tank', e.team); rig.root.scale.setScalar(e.kind === 'siege' ? 0.95 : 1.05); root.add(rig.root); }
    else if (e.kind === 'super') { rig = makeUnit('marine', e.team); rig.root.scale.setScalar(1.75); root.add(rig.root); }
    else if (e.kind === 'inhib') { mon = this.crystal(e.team); root.add(mon); }
    else if (e.kind === 'turret') { brig = makeBuilding('tower', e.team); brig.root.scale.setScalar(1.55); root.add(brig.root); }
    else if (e.kind === 'nexus') { brig = makeBuilding('hq', e.team); brig.root.scale.setScalar(1.35); root.add(brig.root); }
    else { mon = this.monster(e.sub as MonsterKind, e.team); mon.scale.setScalar(1); root.add(mon); }
    if (e.kind === 'hero') { ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.scale.setScalar(1.3); root.add(ring); }
    if (e.kind === 'turret' || e.kind === 'nexus') decorateStructure(root, e.team, e.kind === 'nexus');
    standardize(root, { roughness: 0.65, metalness: 0.18, envMapIntensity: 0.8 });
    this.scene.add(root); void matsFor; return { id: e.id, root, rig, brig, ring, x: e.x, y: e.y, yaw: 0, moved: 0, hit: -99, seen: true, mon };
  }
  private updateVis(dt: number, viewerTeam: number, meId: number): void {
    const alive = new Set<number>();
    for (const e of this.sim.ents) {
      let v = this.vis.get(e.id); if (!v) { v = this.make(e); this.vis.set(e.id, v); } alive.add(e.id);
      const dead = e.hp <= 0 || !!e.hero?.dead; v.root.visible = !dead && this.sim.canSee(viewerTeam, e);
      if (dead) { v.x = e.x; v.y = e.y; continue; }
      const k = Math.min(1, dt * 14), px = v.x, py = v.y; v.x += (e.x - v.x) * k; v.y += (e.y - v.y) * k; const mv = Math.hypot(v.x - px, v.y - py) / Math.max(dt, 0.001); v.moved += (Math.min(1, mv / 3) - v.moved) * Math.min(1, dt * 8);
      v.root.position.set(v.x, 0, v.y);
      const want = -Math.atan2(e.fy, e.fx); let dy = want - v.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; v.yaw += dy * Math.min(1, dt * 12);
      if (v.rig) {
        v.rig.root.rotation.y = v.yaw; const bob = Math.sin(this.clock * 13 + e.id) * 0.05 * v.moved; v.rig.body.position.y = Math.abs(bob); v.rig.body.rotation.z = bob * 0.5;
        const fired = this.sim.tick - e.fired; if (v.rig.ch) { const st = v.rig.ch.state; st.speed = v.moved * 3; st.walk += dt * v.moved * 4.8; st.time += dt; st.recoil = fired >= 0 && fired < 3 ? 1 : 0; v.rig.ch.update(dt); } v.rig.flash.visible = fired >= 0 && fired < 2 && e.range > 2.5; if (v.rig.gun) v.rig.gun.position.x = (v.rig.gun.position.x * 0 + 0.2) - (fired >= 0 && fired < 3 ? 0.08 : 0);
        if (isMinion(e.kind)) { const lunge = fired >= 0 && fired < 4 && e.range < 2.5 ? Math.sin(fired / 4 * Math.PI) * 0.35 : 0; v.rig.body.position.x = lunge; }
        if (v.rig.carry) v.rig.carry.visible = false; if (e.hero && !this.reducedMotion) animateChamp(v.rig, this.clock);
        if (e.hero) { const sk = this.sim.tick - e.hero.castAt; v.rig.body.scale.setScalar(sk >= 0 && sk < 6 ? 1.12 : 1); }
      }
      if (v.mon && e.kind === 'inhib') { const gem = v.mon.children.find(c => c.userData.spin); if (gem) { gem.rotation.y += dt * 1.4; gem.position.y = 1.9 + Math.sin(this.clock * 2) * 0.12; } }
      else if (v.mon) { v.mon.rotation.y = v.yaw; const f = this.sim.tick - e.fired; v.mon.position.x = f >= 0 && f < 5 ? Math.sin(f / 5 * Math.PI) * 0.4 * Math.cos(v.yaw) : 0; v.mon.position.y = Math.abs(Math.sin(this.clock * 6 + e.id) * 0.06 * v.moved); }
      if (v.brig) { const sp = v.brig.spin; if (sp) { if (e.kind === 'turret') { if (this.sim.tick - e.fired < 20) sp.rotation.y = -Math.atan2(e.fy, e.fx); else sp.rotation.y += dt * 1.2; if (v.brig.flash) v.brig.flash.visible = this.sim.tick - e.fired < 3; } else sp.rotation.y += dt * 0.7; } }
      if (v.ring) { const m = v.ring.material as THREE.MeshBasicMaterial; m.color.setHex(e.id === meId ? 0xffd24a : e.team === viewerTeam ? 0x5dff9a : 0xff5a4a); }
      // 맞으면 깜빡
      const hurt = this.sim.tick - e.hurt < 3; v.root.traverse(o => { const mt = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mt && 'emissive' in mt && !(mt as THREE.MeshStandardMaterial).userData.keep) { if (hurt) { mt.userData.e0 ??= mt.emissive.getHex(); mt.emissive.setHex(0x883322); } else if (mt.userData.e0 !== undefined) mt.emissive.setHex(mt.userData.e0 as number); } });
    }
    for (const [id, v] of this.vis) if (!alive.has(id)) { this.scene.remove(v.root); this.vis.delete(id); }
  }

  // ---------- 이펙트 ----------
  private add(f: Fx): void { if (this.fx.length >= this.fxBudget) { const o = this.fx.shift()!; this.scene.remove(o.obj); } this.scene.add(f.obj); this.fx.push(f); }
  private mat(c: number, o = 1): THREE.MeshBasicMaterial { return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false }); }
  private flash(x: number, y: number, r: number, c: number, life = 0.35): void {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), this.mat(c, 0.8)); m.position.set(x, 0.7, y); this.add({ obj: m, t: 0, life, tick: f => { const k = f.t / f.life; m.scale.setScalar(r * (0.3 + k * 0.9)); (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); } });
  }
  private ring(x: number, y: number, r: number, c: number, life = 0.5, h = 0.1): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), this.mat(c, 0.9)); m.rotation.x = -Math.PI / 2; m.position.set(x, h, y); this.add({ obj: m, t: 0, life, tick: f => { const k = f.t / f.life; m.scale.setScalar(r * (0.4 + 0.6 * Math.min(1, k * 2))); (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k); } });
  }
  private beam(x0: number, y0: number, x1: number, y1: number, c: number, w: number, life: number, h0 = 1, h1 = 1): void {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 0.1, m = new THREE.Mesh(new THREE.BoxGeometry(len, w, w), this.mat(c, 0.95)); m.position.set((x0 + x1) / 2, (h0 + h1) / 2, (y0 + y1) / 2); m.rotation.y = -Math.atan2(dy, dx); m.rotation.z = Math.atan2(h1 - h0, len);
    this.add({ obj: m, t: 0, life, tick: f => { (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - f.t / f.life); m.scale.y = m.scale.z = 1 - f.t / f.life * 0.7; } });
  }
  private pillar(x: number, y: number, c: number, life: number): void {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6, 8, 1, true), this.mat(c, 0.8)); m.position.set(x, 3, y); this.add({ obj: m, t: 0, life, tick: f => { const k = f.t / f.life; (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k) * (0.6 + 0.4 * Math.sin(f.t * 18)); m.scale.set(1 - k * 0.5, 1, 1 - k * 0.5); } });
  }
  private bolt(x0: number, y0: number, x1: number, y1: number, c: number, life: number, size: number): void {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), this.mat(c, 1)); this.add({ obj: m, t: 0, life, tick: f => { const k = f.t / f.life; m.position.set(x0 + (x1 - x0) * k, 1.2 - 0.4 * k, y0 + (y1 - y0) * k); } });
  }
  consume(events: SimEvent[], viewer: number): void {
    for (const e of events) {
      const c = e.t === 'shot' || e.t === 'bolt' || e.t === 'blast' || e.t === 'dash' || e.t === 'buff' ? (e.team === 0 ? 0x8fd0ff : e.team === 1 ? 0xffa27a : 0xffe08a) : 0xffffff;
      if (e.t === 'shot') { if (e.ranged) this.bolt(e.x0, e.y0, e.x1, e.y1, c, 0.14, 0.12); else this.flash(e.x1, e.y1, 0.35, 0xffe9b0, 0.15); }
      else if (e.t === 'bolt') { this.beam(e.x0, e.y0, e.x1, e.y1, c, e.wide * 0.3, 0.28); this.flash(e.x1, e.y1, 0.9, c, 0.3); }
      else if (e.t === 'blast') { this.ring(e.x, e.y, e.r, c, 0.5); this.flash(e.x, e.y, e.r * 0.5, c, 0.3); }
      else if (e.t === 'dash') this.beam(e.x0, e.y0, e.x1, e.y1, c, 0.5, 0.3, 0.7, 0.7);
      else if (e.t === 'buff') { const v = this.vis.get(e.id); if (v) this.ring(v.x, v.y, 1.6, 0x9dff9a, 0.6, 0.15); }
      else if (e.t === 'die') { const big = e.kind === 'turret' || e.kind === 'nexus' || e.kind === 'monster'; this.flash(e.x, e.y, big ? (e.kind === 'nexus' ? 5 : 2.2) : 0.8, big ? 0xffb050 : e.team === 0 ? 0x7fb4ff : e.team === 1 ? 0xff8f6a : 0xd9c5a0, big ? 0.7 : 0.3); if (big) this.ring(e.x, e.y, 4, 0xffd27a, 0.7); }
      else if (e.t === 'level') { const v = this.vis.get(e.id); if (v) this.ring(v.x, v.y, 2.2, 0xffe27a, 0.8, 0.12); }
      else if (e.t === 'ping') { if (e.team === viewer) { const pc = e.kind === 'danger' ? 0xff4a3a : e.kind === 'assist' ? 0xffe05a : 0x6aff9a; this.ring(e.x, e.y, 3.4, pc, 1.1, 0.3); this.ring(e.x, e.y, 2, pc, 1.4, 0.3); this.pillar(e.x, e.y, pc, 1.4); } }
      else if (e.t === 'ward') { if (e.team === viewer) this.ring(e.x, e.y, 2.2, 0x5dc8ff, 0.9, 0.2); }
      else if (e.t === 'unward') { this.ring(e.x, e.y, 2.4, 0xffd24a, 0.7, 0.2); this.flash(e.x, e.y, 1.1, 0xffe9a0, 0.3); }
      else if (e.t === 'spell') { const v = this.vis.get(e.id); if (v) this.ring(v.x, v.y, e.spell === 'flash' ? 1.2 : 2, e.spell === 'ignite' ? 0xff7a3a : 0xfff1a0, 0.6, 0.15); }
      else if (e.t === 'recall') { const v = this.vis.get(e.id); if (v) this.ring(v.x, v.y, 1.8, 0x9fd8ff, 1.2, 0.12); }
    }
    void viewer;
  }

  render(dt: number): void {
    this.clock += dt; const me = this.sim.me(); this.updateVis(dt, this.sim.myTeam, me.id); this.syncWards(); if (!this.reducedMotion) this.scenery.update(dt, this.clock); if ((this.fogT -= dt) <= 0) { this.fogT = 0.12; this.paintFog(); }
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; if (f.t >= f.life) { this.scene.remove(f.obj); this.fx.splice(i, 1); } else f.tick(f, dt); }
    this.placeCamera(); if (this.post) this.post.render(dt); else this.renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) { o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); } });
    this.environment?.dispose(); this.post?.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); void TEAM_HEX; void this.glow;
  }
}
