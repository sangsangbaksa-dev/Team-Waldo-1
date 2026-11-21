// FRONTLINE — 3D 화면: 지형, 유닛·건물 표시, 이펙트, 카메라와 화면 좌표 변환. 시뮬레이션은 읽기만 합니다.
import * as THREE from 'three';
import { makePost, type PostFx } from '../postfx';
import { BUILDINGS, TEAM_COLORS, UNITS, type BuildKind } from './config';
import { crystalMat, makeBuilding, makeCrystals, makeUnit, matsFor, type BuildRig, type UnitRig } from './models';
import { DesertProps } from './desert';
import { Scenery, buildLanes, bushSpots, paintGround } from './scenery';
import type { Building, ResNode, RtsSim, SimEvent, Unit } from './sim';
import type { Marker } from './campaign';
import { FOG_HIDDEN, FOG_SEEN, type Vision } from './vision';

interface UVis { kind: 'unit'; id: number; rig: UnitRig; ring: THREE.Mesh; px: number; py: number; cx: number; cy: number; yaw: number; moved: number; shake: number; aura: THREE.Mesh | null }
interface BVis { kind: 'building'; id: number; rig: BuildRig; frame: THREE.Group; scaff: THREE.Group; done: boolean; wasDone: boolean; rubble: number }
interface NVis { kind: 'node'; id: number; obj: THREE.Group; base: number }
type Quality = 'high' | 'standard' | 'low';
interface Fx { obj: THREE.Object3D; t: number; life: number; tick: (f: Fx, dt: number) => void }

const FOG_A_HIDDEN = 226, FOG_A_SEEN = 118, FOG_Y = 4;
const ABILITY_COLOR: Record<string, number> = { marine: 0xffa53d, rocket: 0xff5a3c, tank: 0xffe066, jeep: 0x5de1ff, medic: 0x7dff9e, engineer: 0xffb347 };
const MARK_COLOR = [0xff5a3c, 0x5db4ff, 0xffe27a] as const;
interface MarkVis { group: THREE.Group; spin: THREE.Group; fill: THREE.Mesh; beam: THREE.Mesh; r: number; kind: Marker['kind']; side: number }
const US: Record<string, number> = { worker: 1.4, marine: 1.45, rocket: 1.45, tank: 1.2, jeep: 1.15, medic: 1.45, engineer: 1.45 };
const seeded = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

export class RtsView {
  post: PostFx | null = null; readonly renderer: THREE.WebGLRenderer; readonly scene = new THREE.Scene(); readonly camera = new THREE.PerspectiveCamera(36, 1, 0.5, 700);
  /** 카메라가 바라보는 지점(맵 좌표)과 거리. */
  cam = { x: 48, y: 48, dist: 58 }; readonly yaw: number; private pitch = 0.95;
  private units = new Map<number, UVis>(); private builds = new Map<number, BVis>(); private nodes = new Map<number, NVis>();
  private fx: Fx[] = []; private sun = new THREE.DirectionalLight(0xffe2b4, 2.5); private shadows: boolean;
  private ringGeo = new THREE.RingGeometry(0.9, 1.0, 28); private ghost: { kind: BuildKind; obj: THREE.Group; plane: THREE.Mesh } | null = null; private flag: THREE.Group;
  private raycaster = new THREE.Raycaster(); private clock = 0; private w = 1; private h = 1; private fxBudget: number;
  private ringMats = [new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0.9, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false })];
  /** 전장의 안개: 있으면 보이지 않는 적을 숨기고 어둡게 덮습니다. */ vision: Vision | null = null;
  private fog: { mesh: THREE.Mesh; tex: THREE.DataTexture; data: Uint8Array; cur: Float32Array } | null = null; private marks = new Map<string, MarkVis>();
  private grid: THREE.Mesh | null = null; private scenery: Scenery | null = null; private desert: DesertProps | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly sim: RtsSim, readonly viewer: number, readonly quality: Quality = 'high') {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5));
    this.shadows = quality !== 'low'; this.renderer.shadowMap.enabled = this.shadows; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.yaw = viewer === 0 ? 0 : Math.PI; this.fxBudget = quality === 'high' ? 160 : quality === 'standard' ? 90 : 40;
    const sky = new THREE.Color(0xe3c898); this.scene.background = sky; this.scene.fog = new THREE.Fog(sky, 105, 290);
    this.scene.add(new THREE.HemisphereLight(0xfff0d4, 0x9a7a52, 1.2));
    this.sun.castShadow = this.shadows; const sc = this.sun.shadow.camera; sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 1; sc.far = 200;
    this.sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024); this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.buildTerrain(); this.flag = this.makeFlag(); this.flag.visible = false; this.scene.add(this.flag);
    const start = sim.map.starts[viewer]; this.cam.x = start.x + 2; this.cam.y = start.y + 2;
    if (window.innerWidth < 900 || matchMedia('(pointer: coarse)').matches) this.cam.dist = 50; // 작은 화면에서는 가깝게
    this.resize(canvas.clientWidth || 800, canvas.clientHeight || 600);
    this.post = makePost(quality, this.renderer, this.scene, this.camera, { strength: 0.4, radius: 0.5, threshold: 0.9, vignette: 0.24, saturation: 1.1 });
  }

  // ---------- 지형 ----------
  private buildTerrain(): void {
    const n = this.sim.map.size, rnd = seeded(7), scene = this.scene;
    const tex = document.createElement('canvas'); tex.width = tex.height = 1536; const g = tex.getContext('2d')!, k = tex.width / n;
    g.fillStyle = '#c3a672'; g.fillRect(0, 0, tex.width, tex.height);
    const blot = (c: string, count: number, r0: number, r1: number, a: number): void => { for (let i = 0; i < count; i++) { g.globalAlpha = a * (0.4 + rnd() * 0.6); g.fillStyle = c; g.beginPath(); g.arc(rnd() * tex.width, rnd() * tex.height, (r0 + rnd() * (r1 - r0)) * k, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; };
    blot('#b49560', 260, 1.2, 4.8, 0.35); blot('#d4ba86', 240, 0.8, 3.4, 0.32); blot('#a98259', 100, 0.8, 2.8, 0.3); blot('#8f7a58', 190, 0.25, 1.0, 0.4);
    // 바람이 만든 모래 물결
    g.strokeStyle = 'rgba(120,92,56,.22)'; g.lineWidth = 0.09 * k; for (let i = 0; i < 380; i++) { const x = rnd() * tex.width, y = rnd() * tex.height, l = (2 + rnd() * 5) * k; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * 0.5, y - l * 0.18, x + l, y + l * 0.05); g.stroke(); }
    g.strokeStyle = 'rgba(255,240,205,.16)'; for (let i = 0; i < 260; i++) { const x = rnd() * tex.width, y = rnd() * tex.height, l = (2 + rnd() * 4) * k; g.beginPath(); g.moveTo(x, y + 0.14 * k); g.quadraticCurveTo(x + l * 0.5, y - l * 0.14, x + l, y + 0.2 * k); g.stroke(); }
    for (const s of this.sim.map.starts) { const grd = g.createRadialGradient((s.x + 2) * k, (s.y + 2) * k, 2 * k, (s.x + 2) * k, (s.y + 2) * k, 11 * k); grd.addColorStop(0, 'rgba(150,134,106,.95)'); grd.addColorStop(1, 'rgba(150,134,106,0)'); g.fillStyle = grd; g.fillRect(0, 0, tex.width, tex.height); }
    // 군사 기지 바닥: 본부 아래 육각 콘크리트 패드와 경고 줄무늬 테두리.
    for (const s of this.sim.map.starts) {
      const cx = (s.x + 2) * k, cy = (s.y + 2) * k, hex = (r: number): void => { g.beginPath(); for (let q = 0; q < 6; q++) { const a = Math.PI / 6 + (q * Math.PI) / 3; g[q ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k); } g.closePath(); };
      g.save(); hex(8.2); g.fillStyle = 'rgba(64,66,68,.85)'; g.fill(); g.lineWidth = 0.5 * k; g.setLineDash([1.4 * k, 1.4 * k]); g.strokeStyle = 'rgba(232,190,50,.8)'; g.stroke(); g.setLineDash([]);
      hex(6.9); g.fillStyle = 'rgba(118,120,122,.78)'; g.fill(); g.lineWidth = 0.16 * k; g.strokeStyle = 'rgba(40,42,44,.5)'; g.stroke(); g.restore();
    }
    for (const e of this.sim.map.expansions) { const grd = g.createRadialGradient((e.x + 2) * k, (e.y + 2) * k, 2 * k, (e.x + 2) * k, (e.y + 2) * k, 9 * k); grd.addColorStop(0, 'rgba(142,124,92,.7)'); grd.addColorStop(1, 'rgba(142,124,92,0)'); g.fillStyle = grd; g.fillRect(0, 0, tex.width, tex.height); }
    const lanes = buildLanes(this.sim.map), bushes = bushSpots(this.sim.map, lanes); paintGround(g, k, this.sim.map, lanes, bushes);
    g.strokeStyle = 'rgba(70,52,28,.06)'; g.lineWidth = 1; for (let i = 0; i <= n; i += 4) { g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, tex.height); g.moveTo(0, i * k); g.lineTo(tex.width, i * k); g.stroke(); }
    const map = new THREE.CanvasTexture(tex); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(n / 2, 0, n / 2); ground.receiveShadow = true; scene.add(ground);
    this.scenery = new Scenery(scene, this.sim.map, lanes, bushes, this.quality, this.shadows); this.desert = new DesertProps(scene, this.sim.map, lanes, this.quality, this.shadows);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0xb89a66, roughness: 1 })); far.rotation.x = -Math.PI / 2; far.position.set(n / 2, -0.05, n / 2); scene.add(far);
    // 막힌 칸마다 바위 한 덩어리(한 번의 그리기로 처리).
    const cells: Array<[number, number, number]> = [], t = this.sim.map.terrain;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (t[y * n + x]) {
      let nb = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (t[Math.min(n - 1, Math.max(0, y + j)) * n + Math.min(n - 1, Math.max(0, x + i))]) nb++;
      cells.push([x, y, nb]);
    }
    const rockGeo = new THREE.IcosahedronGeometry(0.9, 0), rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05, flatShading: true }), cells.length * 2);
    rocks.castShadow = this.shadows; rocks.receiveShadow = true; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(); let idx = 0;
    for (const [x, y, nb] of cells) for (let r = 0; r < 2; r++) {
      const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1, hgt = (0.5 + nb * 0.14 + rnd() * 0.6) * (edge ? 2.6 : 1) * (r ? 0.7 : 1), sx = 0.75 + rnd() * 0.55;
      e.set(rnd() * 3, rnd() * 6, rnd() * 3); q.setFromEuler(e); m4.compose(new THREE.Vector3(x + 0.5 + (rnd() - 0.5) * 0.5, hgt * 0.35, y + 0.5 + (rnd() - 0.5) * 0.5), q, new THREE.Vector3(sx, hgt, sx));
      rocks.setMatrixAt(idx, m4); col.setHSL(0.07 + rnd() * 0.035, 0.36 + rnd() * 0.12, 0.36 + rnd() * 0.14 + (nb > 6 ? 0.05 : 0)); rocks.setColorAt(idx++, col);
    }
    rocks.count = idx; rocks.instanceMatrix.needsUpdate = true; if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true; scene.add(rocks);
    // 맵 바깥 협곡 암벽: 층층이 쌓인 붉은 사암 메사(그림자 없이 한 번의 그리기).
    const mesas = this.quality === 'low' ? 46 : 96, strata = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), mesas * 3); let sc = 0;
    for (let i = 0; i < mesas; i++) {
      const side = i % 4, a = rnd() * (n + 40) - 20, d = 5 + rnd() * 20, x = side === 0 ? a : side === 1 ? a : side === 2 ? -d : n + d, y = side === 0 ? -d : side === 1 ? n + d : a;
      const w = 6 + rnd() * 9, dp = 5 + rnd() * 8, h = 5 + rnd() * 13 * (1 + d / 30), hue = 0.04 + rnd() * 0.04;
      for (let t = 0; t < 3; t++) {
        const f = 1 - t * 0.22, th = h * (t === 0 ? 0.5 : t === 1 ? 0.32 : 0.2), yy = t === 0 ? 0 : t === 1 ? h * 0.5 : h * 0.82;
        m4.compose(new THREE.Vector3(x, yy + th / 2 - 0.6, y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 0.5, 0)), new THREE.Vector3(w * f, th, dp * f));
        strata.setMatrixAt(sc, m4); col.setHSL(hue + t * 0.006, 0.42 - t * 0.04, 0.32 + t * 0.07 + rnd() * 0.05); strata.setColorAt(sc++, col);
      }
    }
    strata.count = sc; strata.instanceMatrix.needsUpdate = true; if (strata.instanceColor) strata.instanceColor.needsUpdate = true; scene.add(strata);
    // 건물 배치용 격자(평소엔 숨김).
    const gc = document.createElement('canvas'); gc.width = gc.height = 64; const gg = gc.getContext('2d')!; gg.strokeStyle = 'rgba(255,255,255,.55)'; gg.lineWidth = 3; gg.strokeRect(0, 0, 64, 64);
    const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(n, n);
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0.18, depthWrite: false })); this.grid.rotation.x = -Math.PI / 2; this.grid.position.set(n / 2, 0.03, n / 2); this.grid.visible = false; scene.add(this.grid);
  }
  private makeFlag(): THREE.Group {
    const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); pole.position.y = 0.7; g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshBasicMaterial({ color: 0x5dff9a, side: THREE.DoubleSide })); cloth.position.set(0.3, 1.2, 0); g.add(cloth); return g;
  }

  // ---------- 카메라 ----------
  /** pad: 아래쪽 패널이 가리는 높이(px). 장면의 중심을 그만큼 위로 올려 패널에 가리지 않게 합니다. */
  resize(w: number, h: number, pad = 0): void {
    this.w = Math.max(1, w); this.h = Math.max(1, h); this.renderer.setSize(this.w, this.h, false); this.camera.aspect = this.w / this.h;
    if (pad > 0) this.camera.setViewOffset(this.w, this.h + pad, 0, pad, this.w, this.h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  /** 화면 네 모서리가 땅에 닿는 점(미니맵 시야 표시용). */
  corners(bottom: number): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (const [sx, sy] of [[0, 0], [this.w, 0], [this.w, bottom], [0, bottom]] as const) { const g = this.ground(sx, sy); if (g) out.push(g); }
    return out;
  }
  /** 화면 기준 이동(오른쪽·아래가 양수). 거리가 멀수록 빠르게. */
  pan(dx: number, dy: number): void {
    const s = this.yaw === 0 ? 1 : -1; this.cam.x += dx * s; this.cam.y += dy * s; this.clampCam();
  }
  zoom(f: number): void { this.cam.dist = Math.min(92, Math.max(26, this.cam.dist * f)); }
  lookAt(x: number, y: number): void { this.cam.x = x; this.cam.y = y; this.clampCam(); }
  private clampCam(): void { const n = this.sim.map.size; this.cam.x = Math.min(n - 6, Math.max(6, this.cam.x)); this.cam.y = Math.min(n - 4, Math.max(8, this.cam.y)); }
  private placeCamera(): void {
    const { x, y, dist } = this.cam, c = Math.cos(this.pitch), s = Math.sin(this.pitch), sign = this.yaw === 0 ? 1 : -1;
    this.camera.position.set(x, dist * s, y + dist * c * sign * 0.9 + sign * 2); this.camera.lookAt(x, 0, y - sign * 1.5); this.camera.updateMatrixWorld();
    this.sun.position.set(x - 20, 44, y + 18); this.sun.target.position.set(x, 0, y); this.sun.target.updateMatrixWorld(); this.fitShadow(x, y, 52, 120);
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


  /** 화면 좌표(캔버스 안, 픽셀) → 맵 좌표. 하늘을 가리키면 null. */
  ground(sx: number, sy: number): { x: number; y: number } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1), this.camera); const r = this.raycaster.ray;
    if (r.direction.y > -0.001) return null; const t = -r.origin.y / r.direction.y; return { x: r.origin.x + r.direction.x * t, y: r.origin.z + r.direction.z * t };
  }
  /** 맵 좌표(높이 h)를 화면 픽셀로. 카메라 뒤면 null. */
  project(x: number, y: number, h = 0): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, h, y).project(this.camera); if (v.z > 1 || v.z < -1) return null; return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h };
  }
  /** 화면 좌표 아래의 유닛·건물·광물. 겹치면 카메라에 가까운 것. */
  pick(sx: number, sy: number): number {
    this.raycaster.setFromCamera(new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1), this.camera); const ray = this.raycaster.ray; let best = 0, bt = Infinity; const v = new THREE.Vector3(), box = new THREE.Box3(), sph = new THREE.Sphere();
    for (const u of this.sim.units) { if (this.hiddenUnit(u)) continue; sph.set(v.set(u.x, 0.55, u.y).clone(), Math.max(0.55, UNITS[u.kind].radius + 0.2)); if (ray.intersectSphere(sph, v)) { const d = v.distanceTo(ray.origin); if (d < bt) { bt = d; best = u.id; } } }
    for (const b of this.sim.buildings) { if (this.hiddenBuilding(b)) continue; box.min.set(b.x, 0, b.y); box.max.set(b.x + b.size, b.size < 3 ? 1.8 : 2.4, b.y + b.size); if (ray.intersectBox(box, v)) { const d = v.distanceTo(ray.origin) + 0.4; if (d < bt) { bt = d; best = b.id; } } }
    for (const nd of this.sim.nodes) { if (this.hiddenNode(nd)) continue; sph.set(v.set(nd.x + 0.5, 0.5, nd.y + 0.5).clone(), 0.85); if (ray.intersectSphere(sph, v)) { const d = v.distanceTo(ray.origin) + 0.6; if (d < bt) { bt = d; best = nd.id; } } }
    return best;
  }

  // ---------- 전장의 안개 ----------
  setVision(v: Vision | null): void {
    this.vision = v;
    if (this.fog) { this.scene.remove(this.fog.mesh); this.fog.tex.dispose(); this.fog = null; }
    if (!v) return;
    const n = this.sim.map.size, data = new Uint8Array(n * n * 4), cur = new Float32Array(n * n).fill(FOG_A_HIDDEN);
    for (let i = 0; i < n * n; i++) { data[i * 4] = 6; data[i * 4 + 1] = 10; data[i * 4 + 2] = 18; data[i * 4 + 3] = FOG_A_HIDDEN; }
    const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 20; mesh.frustumCulled = false; this.scene.add(mesh); this.fog = { mesh, tex, data, cur };
  }
  /** 안개가 서서히 걷히고 덮이도록 칸마다 투명도를 목표값으로 이동합니다. */
  private updateFog(dt: number): void {
    const f = this.fog, v = this.vision; if (!f || !v) return;
    const n = this.sim.map.size, st = v.state, k = Math.min(1, dt * 6);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, s = st[i], target = s === FOG_HIDDEN ? FOG_A_HIDDEN : s === FOG_SEEN ? FOG_A_SEEN : 0; let c = f.cur[i]; c += (target - c) * k; f.cur[i] = c; f.data[((n - 1 - y) * n + x) * 4 + 3] = Math.round(c);
    }
    f.tex.needsUpdate = true;
  }
  /** 카메라에서 본 땅과 같은 자리에 겹쳐 보이도록, 높이 FOG_Y 의 안개 판을 카메라 쪽으로 줄여 붙입니다. */
  private placeFog(): void {
    const f = this.fog; if (!f) return; const c = this.camera.position, n = this.sim.map.size, k = Math.max(0.2, (c.y - FOG_Y) / c.y);
    f.mesh.scale.set(k, k, 1); f.mesh.position.set(c.x + (n / 2 - c.x) * k, FOG_Y, c.z + (n / 2 - c.z) * k);
  }
  /** 안개 때문에 이 유닛이 보이지 않는가(내 편은 항상 보임). */
  hiddenUnit(u: { owner: number; x: number; y: number }): boolean { return !!this.vision && u.owner !== this.viewer && !this.vision.visible(u.x, u.y); }
  /** 한 번도 본 적 없는 곳의 적 건물은 숨깁니다(본 적 있으면 마지막 모습 그대로 보임). */
  hiddenBuilding(b: Building): boolean { return !!this.vision && b.owner !== this.viewer && !this.vision.explored(b.x + b.size / 2, b.y + b.size / 2); }
  private hiddenNode(n: ResNode): boolean { return !!this.vision && !this.vision.explored(n.x + 0.5, n.y + 0.5); }

  // ---------- 목표 표시(점령 지점·도착지·파괴 대상) ----------
  setMarkers(list: Marker[]): void {
    const keep = new Set<string>();
    for (const m of list) {
      keep.add(m.id); let o = this.marks.get(m.id);
      if (o && (o.r !== m.r || o.kind !== m.kind)) { this.scene.remove(o.group); this.marks.delete(m.id); o = undefined; }
      if (!o) {
        const group = new THREE.Group(), spin = new THREE.Group(), mat = (op: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
        const ring = new THREE.Mesh(new THREE.RingGeometry(m.r - 0.2, m.r, 48), mat(0.85)), fill = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat(0.3)), beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, m.kind === 'target' ? 9 : 7, 8, 1, true), mat(0.4));
        ring.rotation.x = fill.rotation.x = -Math.PI / 2; ring.position.y = 0.12; fill.position.y = 0.1; beam.position.y = m.kind === 'target' ? 4.5 : 3.5;
        for (const t of [0, 1, 2, 3]) { const tick = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.9), mat(0.9)); const a = t * Math.PI / 2; tick.position.set(Math.cos(a) * (m.r - 0.1), 0.14, Math.sin(a) * (m.r - 0.1)); tick.rotation.y = -a; spin.add(tick); }
        spin.add(ring); group.add(spin, fill, beam); group.traverse(x => { x.renderOrder = 30; }); this.scene.add(group);
        o = { group, spin, fill, beam, r: m.r, kind: m.kind, side: -1 }; this.marks.set(m.id, o);
      }
      o.group.position.set(m.x, 0, m.y); o.fill.scale.setScalar(Math.max(0.001, m.progress * m.r));
      if (o.side !== m.side) { o.side = m.side; const col = m.kind === 'goal' ? 0x7dff9e : MARK_COLOR[m.side]; o.group.traverse(x => { if (x instanceof THREE.Mesh) (x.material as THREE.MeshBasicMaterial).color.setHex(col); }); }
    }
    for (const [id, o] of this.marks) if (!keep.has(id)) { this.scene.remove(o.group); this.marks.delete(id); }
  }
  private updateMarks(dt: number): void {
    for (const o of this.marks.values()) { o.spin.rotation.y += dt * 0.5; (o.beam.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.15 * Math.sin(this.clock * 3); }
  }

  // ---------- 배치 미리보기 ----------
  setGhost(kind: BuildKind | null, x = 0, y = 0, ok = true): void {
    if (this.grid) this.grid.visible = !!kind;
    if (!kind) { if (this.ghost) this.ghost.obj.visible = false; return; }
    if (!this.ghost || this.ghost.kind !== kind) {
      if (this.ghost) this.scene.remove(this.ghost.obj);
      const rig = makeBuilding(kind, this.viewer), obj = new THREE.Group(), s = BUILDINGS[kind].size;
      rig.root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m => { const c = m.clone(); c.transparent = true; c.opacity = 0.55; return c; }); o.material = Array.isArray(o.material) ? mats : mats[0]; } });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0.4, depthWrite: false })); plane.rotation.x = -Math.PI / 2; plane.position.set(0, 0.06, 0);
      obj.add(rig.root, plane); this.scene.add(obj); this.ghost = { kind, obj, plane };
    }
    const s = BUILDINGS[kind].size; this.ghost.obj.visible = true; this.ghost.obj.position.set(x + s / 2, 0, y + s / 2); (this.ghost.plane.material as THREE.MeshBasicMaterial).color.set(ok ? 0x5dff9a : 0xff4d4d);
  }
  /** 명령을 내린 자리에 잠깐 보이는 표시. */
  ping(x: number, y: number, color: number): void {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), this.glowMat(color, 0.9)); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.09, y);
    this.add({ obj: ring, t: 0, life: 0.7, tick: f => { const k = f.t / f.life; ring.scale.setScalar(0.65 + k * 0.9); (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k); } });
  }
  setRally(p: { x: number; y: number } | null): void { this.flag.visible = !!p; if (p) this.flag.position.set(p.x, 0, p.y); }

  // ---------- 매 틱·매 프레임 ----------
  /** 시뮬레이션이 한 틱 진행될 때마다 부릅니다. 보간을 위해 직전 위치를 기억합니다. */
  onTick(): void { for (const u of this.sim.units) { const v = this.units.get(u.id); if (v) { v.px = v.cx; v.py = v.cy; v.cx = u.x; v.cy = u.y; } } }

  private syncEntities(): void {
    const s = this.sim;
    for (const u of s.units) if (!this.units.has(u.id)) this.addUnit(u);
    for (const [id, v] of this.units) if (!s.unit(id)) { this.scene.remove(v.rig.root); this.units.delete(id); }
    for (const b of s.buildings) if (!this.builds.has(b.id)) this.addBuilding(b);
    for (const [id, v] of this.builds) if (!s.building(id)) { this.scene.remove(v.rig.root, v.frame, v.scaff); this.builds.delete(id); }
    for (const n of s.nodes) if (!this.nodes.has(n.id)) this.addNode(n);
    for (const [id, v] of this.nodes) if (!s.node(id)) { this.scene.remove(v.obj); this.nodes.delete(id); }
  }
  private addUnit(u: Unit): void {
    const rig = makeUnit(u.kind, u.owner), r = UNITS[u.kind].radius, ring = new THREE.Mesh(this.ringGeo, this.ringMats[u.owner === this.viewer ? 0 : 1]); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(r * 1.5 + 0.2); ring.position.y = 0.05; ring.visible = false;
    rig.root.add(ring); this.scene.add(rig.root); this.units.set(u.id, { kind: 'unit', id: u.id, rig, ring, px: u.x, py: u.y, cx: u.x, cy: u.y, yaw: -Math.atan2(u.fy, u.fx), moved: 0, shake: 0, aura: null });
    rig.root.scale.setScalar(US[u.kind]);
  }
  private addBuilding(b: Building): void {
    const rig = makeBuilding(b.kind, b.owner), frame = new THREE.Group(), s = b.size;
    for (const [x, z, w, d] of [[0, -s / 2, s, 0.1], [0, s / 2, s, 0.1], [-s / 2, 0, 0.1, s], [s / 2, 0, 0.1, s]] as const) { const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), this.ringMats[b.owner === this.viewer ? 0 : 1]); bar.position.set(x, 0.06, z); frame.add(bar); }
    frame.position.set(b.x + s / 2, 0, b.y + s / 2); frame.visible = false;
    const scaff = new THREE.Group(), pm = new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.8, metalness: 0.2 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2 + s * 0.25, 5), pm); p.position.set(x * (s / 2 - 0.1), (1.2 + s * 0.25) / 2, z * (s / 2 - 0.1)); scaff.add(p); }
    scaff.position.set(b.x + s / 2, 0, b.y + s / 2); rig.root.position.set(b.x + s / 2, 0, b.y + s / 2);
    this.scene.add(rig.root, frame, scaff); this.builds.set(b.id, { kind: 'building', id: b.id, rig, frame, scaff, done: b.done, wasDone: b.done, rubble: 0 });
  }
  private addNode(n: ResNode): void { const obj = makeCrystals(n.id); obj.position.set(n.x + 0.5, 0, n.y + 0.5); this.scene.add(obj); this.nodes.set(n.id, { kind: 'node', id: n.id, obj, base: 1 }); }

  /** 선택·표시 상태를 갱신하고 그립니다. alpha 는 틱 사이 보간 비율(0~1). */
  render(dt: number, alpha: number, selected: ReadonlySet<number>): void {
    this.clock += dt; this.scenery?.update(this.clock); this.desert?.update(this.clock); this.syncEntities(); const tick = this.sim.tick, s = this.sim;
    for (const [id, v] of this.units) {
      const u = s.unit(id); if (!u) continue; const hid = this.hiddenUnit(u); v.rig.root.visible = !hid; if (hid) { v.ring.visible = false; continue; } const x = v.px + (v.cx - v.px) * alpha, y = v.py + (v.cy - v.py) * alpha, sp = Math.sqrt((v.cx - v.px) ** 2 + (v.cy - v.py) ** 2);
      v.moved += (sp > 0.005 ? 1 : -1) * dt * 6; v.moved = Math.min(1, Math.max(0, v.moved));
      const want = -Math.atan2(u.fy, u.fx); let d = want - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); v.yaw += d * Math.min(1, dt * 12);
      const r = v.rig, root = r.root; root.position.set(x, 0, y); root.rotation.y = v.yaw;
      const bob = Math.sin(this.clock * (u.kind === 'tank' || u.kind === 'jeep' ? 9 : 14) + id) * (u.kind === 'tank' || u.kind === 'jeep' ? 0.015 : 0.05) * v.moved; r.body.position.y = Math.abs(bob); r.body.rotation.z = bob * (u.kind === 'tank' || u.kind === 'jeep' ? 0.2 : 0.5);
      const fired = tick - u.fired; r.flash.visible = u.kind !== 'medic' && u.kind !== 'engineer' && fired >= 0 && fired < 2;
      if (r.gun) r.gun.position.x = (u.kind === 'tank' ? 0.3 : 0.2) - (fired >= 0 && fired < 3 ? 0.08 : 0);
      if (r.carry) r.carry.visible = u.carry > 0;
      if (r.ch) { const st = r.ch.state; st.speed = v.moved * 3; st.walk += dt * v.moved * 4.8; st.time += dt; st.wave = u.kind === 'worker' && (tick - u.mine < 3 || (u.o.t === 'gather' && u.o.phase === 1)) ? 0.5 : 0; st.recoil = fired >= 0 && fired < 3 ? 1 : 0; st.hit = (tick - u.hurt) >= 0 && (tick - u.hurt) < 3 ? 0.4 : 0; r.ch.update(dt); }
      if (r.arm) { const work = tick - u.mine < 3 || (u.o.t === 'gather' && u.o.phase === 1); r.arm.rotation.z = work ? Math.sin(this.clock * 16) * 0.7 - 0.4 : -0.3; }
      const hurt = tick - u.hurt; root.scale.setScalar(US[u.kind] * (hurt >= 0 && hurt < 2 ? 1.1 : 1));
      v.ring.visible = selected.has(id);
      if (v.ring.visible) v.ring.scale.setScalar((UNITS[u.kind].radius * 1.5 + 0.2) * (1 + 0.06 * Math.sin(this.clock * 4)));
      if (u.ab > tick && u.kind !== 'medic') {
        if (!v.aura) { v.aura = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28), this.glowMat(ABILITY_COLOR[u.kind] ?? 0xffffff, 0.75)); v.aura.rotation.x = -Math.PI / 2; v.aura.position.y = 0.08; r.root.add(v.aura); }
        v.aura.visible = true; v.aura.scale.setScalar(1.25 + Math.sin(this.clock * 9 + id) * 0.12);
      } else if (v.aura) v.aura.visible = false;
    }
    for (const [id, v] of this.builds) {
      const b = s.building(id); if (!b) continue; const hidB = this.hiddenBuilding(b); v.rig.root.visible = !hidB; const p = b.done ? 1 : Math.min(1, 0.12 + 0.88 * b.progress / BUILDINGS[b.kind].time);
      v.rig.root.scale.set(1, b.done ? 1 : Math.max(0.05, p), 1); v.scaff.visible = !b.done && !hidB; v.scaff.scale.y = 1 - p * 0.3;
      if (b.done && !v.wasDone) { v.wasDone = true; this.puff(b.x + b.size / 2, b.y + b.size / 2, b.size * 0.8, 0xd8cfb8); }
      for (const l of v.rig.light) l.visible = b.done && (Math.sin(this.clock * 3 + id) > -0.7);
      if (v.rig.spin && b.kind === 'hq') v.rig.spin.rotation.y += dt * 0.8;
      if (v.rig.spin && b.kind === 'tower') { const want = -Math.atan2(b.fy, b.fx); if (tick - b.fired < 40) v.rig.spin.rotation.y = want; }
      if (v.rig.flash) v.rig.flash.visible = tick - b.fired < 2;
      v.frame.visible = selected.has(id) && !hidB; const hurt = tick - b.hurt; if (!b.done) v.rig.root.rotation.y = 0; v.rig.root.position.y = hurt >= 0 && hurt < 2 ? 0.02 : 0;
    }
    for (const [id, v] of this.nodes) { const n = s.node(id); if (!n) continue; v.obj.visible = !this.hiddenNode(n); const f = 0.55 + 0.45 * Math.min(1, n.amount / 1500); v.obj.scale.set(f, f, f); }
    crystalMat.emissiveIntensity = 1.0 + Math.sin(this.clock * 2.2) * 0.25;
    this.updateFx(dt); this.updateMarks(dt); this.updateFog(dt); this.placeCamera(); this.placeFog(); if (this.post) this.post.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  // ---------- 이펙트 ----------
  private add(f: Fx): void { if (this.fx.length >= this.fxBudget) { const old = this.fx.shift(); if (old) this.scene.remove(old.obj); } this.fx.push(f); this.scene.add(f.obj); }
  private updateFx(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; if (f.t >= f.life) { this.scene.remove(f.obj); this.fx.splice(i, 1); continue; } f.tick(f, dt); }
  }
  private glowMat(color: number, opacity = 1): THREE.MeshBasicMaterial { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }); }
  private puff(x: number, y: number, r: number, color: number): void {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false })); m.position.set(x, 0.5, y);
    this.add({ obj: m, t: 0, life: 0.7, tick: f => { const k = f.t / f.life; m.scale.setScalar(r * (0.3 + k)); (m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k); m.position.y = 0.5 + k * 0.6; } });
  }
  private explode(x: number, y: number, r: number, big: boolean): void {
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), this.glowMat(0xff8a1f, 0.6)); core.position.set(x, 0.5 + r * 0.3, y);
    this.add({ obj: core, t: 0, life: big ? 0.6 : 0.4, tick: f => { const k = f.t / f.life; core.scale.setScalar(r * (0.35 + k * 0.9)); (core.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k); } });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24), this.glowMat(0xffc070, 0.45)); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.08, y);
    this.add({ obj: ring, t: 0, life: 0.45, tick: f => { const k = f.t / f.life; ring.scale.setScalar(r * (0.6 + k * 1.8)); (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k); } });
    const bits = big ? 9 : 4, rnd = seeded(Math.floor(x * 31 + y * 17 + this.clock * 100));
    for (let i = 0; i < bits; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2a2a2a : 0x5a4a38, transparent: true })); d.position.set(x, 0.5, y);
      const a = rnd() * 6.28, sp = (1.5 + rnd() * 3.5) * (big ? 1.3 : 1), vy = 3 + rnd() * 4;
      this.add({ obj: d, t: 0, life: 0.8, tick: (f, dt) => { d.position.x += Math.cos(a) * sp * dt; d.position.z += Math.sin(a) * sp * dt; d.position.y = Math.max(0.05, 0.5 + vy * f.t - 9 * f.t * f.t); d.rotation.x += dt * 8; (d.material as THREE.MeshBasicMaterial).opacity = 1 - f.t / f.life; } });
    }
    this.puff(x, y, r * 1.1, 0x4a4540);
  }
  private tracer(x0: number, y0: number, x1: number, y1: number, h0: number, h1: number, color: number, life: number, thick: number, len: number, arc = 0): void {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, thick), this.glowMat(color, 1)); const dx = x1 - x0, dy = y1 - y0, dist = Math.sqrt(dx * dx + dy * dy) || 1; m.rotation.y = -Math.atan2(dy, dx); m.position.set(x0, h0, y0);
    this.add({ obj: m, t: 0, life, tick: f => { const k = f.t / f.life; m.position.set(x0 + dx * k, h0 + (h1 - h0) * k + Math.sin(k * Math.PI) * arc * Math.min(1, dist / 8), y0 + dy * k); } });
  }
  /** 시뮬레이션 이벤트를 눈에 보이는 효과로 바꿉니다. 소리는 호출한 쪽에서 처리합니다. */
  consume(events: SimEvent[]): void {
    const vis = this.vision, seen = (x: number, y: number): boolean => !vis || vis.visible(x, y);
    for (const e of events) {
      if (e.t === 'shot' && !seen(e.x0, e.y0) && !seen(e.x1, e.y1)) continue;
      if ((e.t === 'die' || e.t === 'mined' || e.t === 'deposit' || e.t === 'heal' && e.owner !== this.viewer) && !seen(e.t === 'heal' ? e.x1 : e.x, e.t === 'heal' ? e.y1 : e.y)) continue;
      if ((e.t === 'placed' || e.t === 'ability') && e.owner !== this.viewer && !seen(e.x, e.y)) continue;
      if (e.t === 'shot') {
        const col = e.owner === 0 ? 0x9fe6ff : 0xffb27a;
        if (e.w === 'bullet') { this.tracer(e.x0, e.y0, e.x1, e.y1, 0.9, 0.6, col, 0.08, 0.05, 0.9); const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), this.glowMat(0xffffff, 0.9)); s.position.set(e.x1, 0.6, e.y1); this.add({ obj: s, t: 0, life: 0.12, tick: f => { s.scale.setScalar(1 + f.t * 10); (s.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - f.t / f.life); } }); }
        else if (e.w === 'rocket') { this.tracer(e.x0, e.y0, e.x1, e.y1, 1.2, 0.5, 0xffd27a, 0.3, 0.12, 0.5, 1.6); this.delay(0.3, () => this.explode(e.x1, e.y1, 0.9, false)); }
        else { this.tracer(e.x0, e.y0, e.x1, e.y1, 0.9, 0.4, 0xffe9b0, 0.22, 0.16, 0.7, 1.2); this.delay(0.22, () => this.explode(e.x1, e.y1, Math.max(1.1, e.splash), false)); }
      } else if (e.t === 'die') { if (e.building) { this.explode(e.x, e.y, e.size * 0.9, true); this.delay(0.18, () => this.explode(e.x + 0.7, e.y - 0.5, e.size * 0.6, true)); this.delay(0.34, () => this.explode(e.x - 0.6, e.y + 0.6, e.size * 0.7, true)); } else this.explode(e.x, e.y, e.kind === 'tank' ? 1.3 : 0.6, e.kind === 'tank'); }
      else if (e.t === 'heal') {
        this.tracer(e.x0, e.y0, e.x1, e.y1, 1.0, 1.0, e.fix ? 0xffb347 : 0x7dff9e, 0.3, 0.04, 0.5);
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), this.glowMat(e.fix ? 0xffd9a0 : 0xb6ffc8, 0.9)); c.position.set(e.x1, 0.7, e.y1);
        this.add({ obj: c, t: 0, life: 0.5, tick: (f, dt) => { c.position.y += dt * 1.4; c.rotation.y += dt * 6; (c.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - f.t / f.life); } });
      }
      else if (e.t === 'ability') {
        const col = ABILITY_COLOR[e.kind] ?? 0xffffff, rad = e.kind === 'medic' ? 5.5 : 2.4, ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), this.glowMat(col, 0.85)); ring.rotation.x = -Math.PI / 2; ring.position.set(e.x, 0.1, e.y);
        this.add({ obj: ring, t: 0, life: 0.6, tick: f => { const k = f.t / f.life; ring.scale.setScalar(rad * (0.25 + k * 0.75)); (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k); } });
        for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), this.glowMat(col, 0.9)), a = i * 1.047; sp.position.set(e.x, 0.6, e.y); this.add({ obj: sp, t: 0, life: 0.55, tick: (f, dt) => { sp.position.x += Math.cos(a) * 2.2 * dt; sp.position.z += Math.sin(a) * 2.2 * dt; sp.position.y += dt * 2.4; (sp.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - f.t / f.life); } }); }
      }
      else if (e.t === 'placed') this.puff(e.x, e.y, 1.2, 0xd8cfb8);
      else if (e.t === 'mined') { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), this.glowMat(0x9fe9ff, 1)); s.position.set(e.x, 0.9, e.y); this.add({ obj: s, t: 0, life: 0.35, tick: (f, dt) => { s.position.y += dt * 1.8; s.rotation.y += dt * 8; (s.material as THREE.MeshBasicMaterial).opacity = 1 - f.t / f.life; } }); }
      else if (e.t === 'deposit') { const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), this.glowMat(0x8fe6ff, 0.9)); s.position.set(e.x, 1.1, e.y); this.add({ obj: s, t: 0, life: 0.5, tick: (f, dt) => { s.position.y += dt * 1.4; (s.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - f.t / f.life); } }); }
    }
  }
  private delay(sec: number, fn: () => void): void { this.add({ obj: new THREE.Object3D(), t: 0, life: sec, tick: f => { if (f.t + 0.02 >= f.life) fn(); } }); }

  dispose(): void {
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) { o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); } });
    this.post?.dispose(); this.fog?.tex.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
void TEAM_COLORS; void matsFor;
