// SPEED RUSH — Three.js 장면: 석양 사이버 서킷, 스포츠카(Last City 의 vehicles.glb), 속도감 연출(FOV·카메라 흔들림·스트릭·불꽃·연기).
import * as THREE from 'three';
import { makePost, type PostFx } from '../postfx';
import { AdaptiveQuality } from '../shared/adaptive';
import { LodSet, splitInstanced } from '../shared/lod';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { instantiate } from '../city/models';
import { ghostAt } from './ghost';
import { type CharacterKit, type CharacterRig } from '../shared/character';
import { BOOST_LAG, carEuler, chaseFov, chaseRoll, chaseRumble, chaseShake, chevronFacing, fovRate, stepChaseAnchor, type ChaseAnchor } from './camera';
import { wrapAngle, boosting, kmh } from './physics';
import { type RaceState, type Racer } from './race';
import { type Track } from './track';
import { type Theme } from './maps';
import { buildOutposts, type Outpost } from './outpost';
import { buildBackdrop, distantFog } from './terrain';
import { addRaceScenery, makeWheelDetails } from './visuals';
import { readPreferences } from '../prefs';

const CAR_LEN = 4.7;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (g) draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

/** 중심선 기준 [latA..latB] 구간의 띠 지오메트리. y 는 도로 높이에 더하는 오프셋. color 를 주면 구간마다 색이 또렷이 나뉩니다. */
function ribbon(t: Track, latA: number, latB: number, yA: number, yB: number, color?: (i: number, side: 0 | 1) => [number, number, number], vScale = 1 / 40): THREE.BufferGeometry {
  const n = t.n, g = new THREE.BufferGeometry(), at = (i: number, lat: number, y: number): number[] => [t.x[i] - t.tz[i] * lat, t.y[i] + y, t.z[i] + t.tx[i] * lat];
  if (color) {
    const pos = new Float32Array(n * 12), col = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx: number[] = [];
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n, a = color(k, 0), b = color(k, 1);
      pos.set([...at(k, latA, yA), ...at(k, latB, yB), ...at(j, latA, yA), ...at(j, latB, yB)], k * 12); col.set([...a, ...b, ...a, ...b], k * 12);
      uv.set([0, k * t.ds * vScale, 1, k * t.ds * vScale, 0, (k + 1) * t.ds * vScale, 1, (k + 1) * t.ds * vScale], k * 8); // 콘크리트 같은 무늬를 입힐 수 있게 UV 도 같이 만듭니다(무늬 없는 재질은 무시).
      const o = k * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  }
  const pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx: number[] = [];
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    pos.set([...at(i, latA, yA), ...at(i, latB, yB)], k * 6); uv.set([0, k * t.ds * vScale, 1, k * t.ds * vScale], k * 4);
    if (k < n) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number, rotY: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rotY); g.translate(x, y, z);
  const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) c.set([color.r, color.g, color.b], i); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}

/** 흰 바탕에 곱해지는 거친 입자 무늬(자갈·풀·모래·껍질). 칠한 색 위에 곱해져 단색 면이 사라집니다. */
function grainTex(w: number, h: number, count: number, extra?: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  return canvasTex(w, h, g => {
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < count; i++) { const a = Math.random() * 0.22; g.fillStyle = Math.random() < 0.55 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 1.3})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
    extra?.(g);
  });
}
function scaleUv(g: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }

let dot: THREE.CanvasTexture | null = null;
/** 부드러운 원형 스프라이트(점이 네모로 보이지 않게). */
function dotTex(): THREE.CanvasTexture { dot ??= canvasTex(32, 32, g => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }, false); return dot; }

class Particles {
  readonly points: THREE.Points; private pos: Float32Array; private col: Float32Array; private vel: Float32Array; private life: Float32Array; private max: Float32Array; private rgb: Float32Array; private head = 0;
  constructor(private cap: number, size: number, blending: THREE.Blending, opacity = 1) {
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.rgb = new Float32Array(cap * 3);
    this.pos.fill(0, 0); for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -999;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 4)); // RGBA: 수명에 따라 색이 아니라 투명도가 줄어듭니다(검게 변하는 연기 방지)
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map: dotTex(), vertexColors: true, transparent: true, opacity, blending, depthWrite: false, sizeAttenuation: true })); this.points.frustumCulled = false;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number): void {
    const i = this.head; this.head = (this.head + 1) % this.cap; this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = life; this.max[i] = life; this.rgb.set([r, g, b], i * 3);
  }
  /** cam·nearFade 를 주면 카메라 nearFade(m) 안쪽 입자는 흐려집니다(렌즈 앞을 가리는 큰 동그라미 방지). */
  update(dt: number, gravity: number, cam?: THREE.Vector3, nearFade = 0): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt; const f = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= gravity * dt; this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      let a = f; if (cam && nearFade > 0) { const d = Math.hypot(this.pos[i * 3] - cam.x, this.pos[i * 3 + 1] - cam.y, this.pos[i * 3 + 2] - cam.z); a *= Math.max(0, Math.min(1, (d - nearFade * 0.45) / (nearFade * 0.55))); }
      this.col[i * 4] = this.rgb[i * 3]; this.col[i * 4 + 1] = this.rgb[i * 3 + 1]; this.col[i * 4 + 2] = this.rgb[i * 3 + 2]; this.col[i * 4 + 3] = a;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** 타이어 자국: 미끄러지는 뒷바퀴가 지나간 자리에 검은 띠를 남깁니다(오래된 것부터 덮어씁니다). */
class SkidMarks {
  readonly mesh: THREE.Mesh; private pos: Float32Array; private col: Float32Array; private head = 0; private last = new Map<number, [number, number, number]>(); private dirty = false;
  constructor(private cap: number) {
    this.pos = new Float32Array(cap * 6 * 3); this.col = new Float32Array(cap * 6 * 4);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
  }
  /** key 바퀴가 (x,y,z) 에 닿아 있다: 이전 지점과 이어 한 조각을 더합니다. */
  mark(key: number, x: number, y: number, z: number, alpha: number): void {
    const p = this.last.get(key); this.last.set(key, [x, y, z]); if (!p) return;
    const dx = x - p[0], dz = z - p[2], len = Math.hypot(dx, dz); if (len < 0.2 || len > 4) return;
    const hx = (-dz / len) * 0.15, hz = (dx / len) * 0.15, i = this.head * 18, c = this.head * 24; this.head = (this.head + 1) % this.cap;
    this.pos.set([p[0] - hx, p[1], p[2] - hz, p[0] + hx, p[1], p[2] + hz, x - hx, y, z - hz, p[0] + hx, p[1], p[2] + hz, x + hx, y, z + hz, x - hx, y, z - hz], i);
    for (let k = 0; k < 6; k++) this.col.set([0.02, 0.02, 0.03, alpha], c + k * 4);
    this.dirty = true;
  }
  /** 바퀴가 지면에서 미끄러지지 않으면 자국을 끊습니다. */
  lift(key: number): void { this.last.delete(key); }
  flush(): void { if (!this.dirty) return; this.dirty = false; (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.mesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
}

let driverKit: CharacterKit | null = null;
/** 공용 캐릭터 키트: 운전석 드라이버와 출발선 피트 크루에 씁니다. 없으면 차만 그립니다. */
export function setDriverKit(k: CharacterKit | null): void { driverKit = k; }
interface CarVis { racer: Racer; group: THREE.Group; flames: THREE.Mesh[]; wheels: THREE.Group[]; shadow: THREE.Mesh; lastV: number}

export class RaceView {
  post: PostFx | null = null; readonly renderer: THREE.WebGLRenderer; readonly scene = new THREE.Scene(); readonly camera = new THREE.PerspectiveCamera(64, 1, 0.4, 3200);
  private crew: CharacterRig[] = []; private cars: CarVis[] = []; private ground!: THREE.Mesh; private pads: Array<{ tex: THREE.CanvasTexture }> = [];
  private rainFx = new Particles(1800, 0.32, THREE.NormalBlending, 0.55); private sparks = new Particles(420, 0.2, THREE.AdditiveBlending); private smoke = new Particles(420, 1.1, THREE.NormalBlending, 0.2); private skids = new SkidMarks(1400); private streak: THREE.LineSegments; private streakPos: Float32Array; private streakSeed: Float32Array;
  private camH = 0; private camInit = false; private camAnchor: ChaseAnchor = { x: 0, y: 0, z: 0, ready: false }; private fov = 64; private shake = 0; private punch = 0; private time = 0; private sun: THREE.DirectionalLight;
  /** 하늘에 그린 해와 같은 방향에서 비추는 햇빛(높이는 조금 올려 차가 너무 어둡지 않게) */
  private sunDir = new THREE.Vector3();
  /** 실제 그림자맵(차 → 도로·벽). 저사양에서는 바닥 블롭 그림자만 씁니다. */
  private shadows = false;
  private chaseLift = 0; private viewH = 1; private startLamps: THREE.Mesh[] = [];
  private disposables: Array<{ dispose(): void }> = []; private outposts: Outpost | null = null;
  private reducedMotion = readPreferences().reducedMotion;

  constructor(canvas: HTMLCanvasElement, private track: Track, carTemplates: Record<string, THREE.Object3D> | null, quality: 'high' | 'standard' | 'low', private theme: Theme) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.shadows = quality !== 'low';
    if (this.shadows) { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    // 적응형 화질: 프레임이 길면 해상도 → 후처리 → 그림자 → 장식 순으로 낮춥니다(shared/adaptive.ts).
    this.adaptive = new AdaptiveQuality({ max: Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'standard' ? 1.5 : 1), setPixelRatio: pr => { this.renderer.setPixelRatio(pr); this.renderer.setSize(this.vw, this.vh, false); this.post?.setSize(this.vw, this.vh); }, setLevel: l => this.setLevel(l) });
    this.renderer.setPixelRatio(this.adaptive.pr);
    this.scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far); this.sun = new THREE.DirectionalLight(theme.light.sun, theme.light.sunPower); this.sunDir.set(...theme.sky.sun); this.sunDir.y = Math.max(0.45, this.sunDir.y + 0.35); this.sunDir.normalize();
    this.buildSky(); if (quality !== 'low') this.buildCarEnv(); this.buildGround(); this.buildRoad(); { const before = new Set(this.scene.children); this.buildProps(quality); this.chunkProps(before); }
    addRaceScenery(this.scene, track, quality);
    this.scene.add(new THREE.HemisphereLight(theme.light.sky, theme.light.ground, theme.light.hemi)); this.sun.position.set(-40, 60, 90); this.scene.add(this.sun, this.sun.target);
    if (this.shadows) {
      const sc = this.sun.shadow.camera; this.sun.castShadow = true; this.sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
      sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 40; sc.far = 220; sc.updateProjectionMatrix();
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04; this.sun.shadow.radius = 3;
    }
    const rimLight = new THREE.DirectionalLight(0x83bfff, 0.45); rimLight.position.set(50, 18, -65); this.scene.add(rimLight);
    this.scene.add(this.skids.mesh, this.sparks.points, this.smoke.points); if (theme.rain) this.scene.add(this.rainFx.points);
    const n = 90; this.streakPos = new Float32Array(n * 6); this.streakSeed = new Float32Array(n * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    // 줄기 꼬리(앞쪽 끝)는 검게(= 가산 혼합에서 투명) 칠해 머리(뒤쪽 끝)만 밝은 혜성 모양으로 만듭니다. 흐르는 방향(뒤쪽)이 한눈에 보입니다.
    const col = new Float32Array(n * 6); for (let i = 0; i < n; i++) col.set([0.9, 0.96, 1, 0, 0, 0], i * 6);
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.streak = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); this.streak.frustumCulled = false; this.scene.add(this.streak);
    this.carTemplates = carTemplates; this.viewH = window.innerHeight || 1;
    this.post = makePost(quality, this.renderer, this.scene, this.camera, { strength: 0.3, radius: 0.5, threshold: 0.96, vignette: 0.3, saturation: 1.1, contrast: 1.06 });
  }
  private carTemplates: Record<string, THREE.Object3D> | null;
  private readonly adaptive: AdaptiveQuality; private vw = 1; private vh = 1; private decoOn = false; private frame = 0;
  /** 1 후처리 끔 · 2 그림자 끔 · 3 장식(나무·건물·선인장 등 instanced 소품) 숨김 */
  private setLevel(l: number): void {
    if (l >= 1 && this.post) { this.post.dispose(); this.post = null; }
    if (l >= 2) this.sun.castShadow = false;
    if (l >= 3) { this.scene.traverse(o => { if (o.userData.deco) o.visible = false; }); this.lod.enabled = false; }
  }
  /** 코스 따라 길게 깔린 instanced 소품(가로등·나무·건물·컨테이너…)을 칸으로 쪼개 시야 밖·안개 너머 칸은 그리지 않는다. 한 덩어리일 때는 코스 전체를 매 프레임(그림자 패스 포함) 그렸다. */
  private readonly lod = new LodSet({ near: 1e9, far: 1e9 });
  private chunkProps(before: Set<THREE.Object3D>): void {
    const far = Math.min(3000, this.theme.fog.far * 2 * 0.97); this.lod.ranges = { near: far, far };
    for (const m of [...this.scene.children]) {
      if (before.has(m) || !(m instanceof THREE.InstancedMesh) || m.count < 24) continue;
      m.geometry.computeBoundingSphere(); const small = (m.geometry.boundingSphere?.radius ?? 9) < 3; // 가로등 기둥·말뚝 같은 작은 것은 더 가까이서 끈다
      for (const c of splitInstanced(m, 150, this.scene)) this.lod.add({ x: c.x, z: c.z, r: c.r, full: [c.mesh], scale: small ? 0.5 : 1 });
    }
  }
  private carEnv: THREE.Texture | null = null; private carMats = new Map<string, THREE.Material>();
  /** 하늘을 반사 맵으로 구워 차체 도장·유리에 노을과 하늘이 비치게 합니다. */
  private buildCarEnv(): void {
    const sky = this.scene.getObjectByName('sky') as THREE.Mesh | undefined; if (!sky) return;
    const tmp = new THREE.Scene(), pm = new THREE.PMREMGenerator(this.renderer), m = sky.clone(); m.position.set(0, 0, 0); tmp.add(m);
    this.carEnv = pm.fromScene(tmp, 0, 1, 4000).texture; pm.dispose();
  }
  /** 차체 재질을 광택 도장(클리어코트)·반사 유리·금속으로 바꿉니다. 발광 재질은 그대로 둡니다. */
  private polishCar(body: THREE.Object3D): void {
    if (!this.carEnv) return;
    body.traverse(o => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const lamp = mesh.material as THREE.MeshBasicMaterial;
      if (lamp.type === 'MeshBasicMaterial' && lamp.name.startsWith('Glow')) { // 헤드·테일램프: 밝기를 키워 후처리 블룸으로 실제처럼 번지게(스프라이트 없음)
        const key = `lamp:${lamp.name}`; let g = this.carMats.get(key);
        if (!g) { g = new THREE.MeshBasicMaterial({ color: lamp.color.clone().multiplyScalar(lamp.name === 'GlowRed' ? 3.4 : 2.2), toneMapped: false }); g.name = lamp.name; this.carMats.set(key, g); this.disposables.push(g); }
        mesh.material = g; return;
      }
      const src = mesh.material as THREE.MeshLambertMaterial; if (!(src as THREE.Material).type.startsWith('MeshLambert')) return;
      const key = `${src.name}:${src.color.getHexString()}`; let m = this.carMats.get(key);
      if (!m) {
        const base = { color: src.color.clone(), envMap: this.carEnv };
        const n = src.name;
        m = n === 'Paint' ? new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.85 })
          : n === 'Team' ? new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.3, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.9 })
          : n === 'Glass' ? new THREE.MeshStandardMaterial({ ...base, metalness: 0.85, roughness: 0.06, envMapIntensity: 1.5 })
          : n === 'Steel' || n === 'Gunmetal' || n === 'White' || n === 'Red' || n === 'Chrome' ? new THREE.MeshStandardMaterial({ ...base, metalness: 0.85, roughness: n === 'Chrome' ? 0.2 : 0.38, envMapIntensity: 0.9 })
          : new THREE.MeshStandardMaterial({ ...base, metalness: 0.1, roughness: 0.85, envMapIntensity: 0.25 });
        m.name = n; this.carMats.set(key, m); this.disposables.push(m);
      }
      mesh.material = m;
    });
  }
  /** 터치 조작이 화면 아래를 가릴 때 차를 버튼 위로 올립니다. */
  setChaseLift(on: boolean): void { this.chaseLift = on ? 1 : 0; }

  setRacers(racers: Racer[]): void {
    const flameGeo = new THREE.ConeGeometry(0.15, 1, 10, 1, true); flameGeo.rotateZ(Math.PI / 2); flameGeo.translate(-0.5, 0, 0);
    const shGeo = new THREE.PlaneGeometry(CAR_LEN * 1.25, 2.9); shGeo.rotateX(-Math.PI / 2);
    const shTex = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, false);
    const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, fog: false });
    for (const r of racers) {
      const group = new THREE.Group(); group.rotation.order = 'YXZ';
      let body: THREE.Object3D;
      const tpl = this.carTemplates?.[r.model];
      if (tpl) { body = instantiate(tpl, { paint: new THREE.Color(r.color).getHex(), team: new THREE.Color(r.accent).getHex() }); this.polishCar(body); }
      else {
        const fallback = new THREE.Group();
        const paint = new THREE.MeshPhysicalMaterial({ color: r.color, metalness: 0.35, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.16 });
        const glass = new THREE.MeshStandardMaterial({ color: 0x273d4b, metalness: 0.45, roughness: 0.2 });
        const rubber = new THREE.MeshStandardMaterial({ color: 0x171a1d, roughness: 0.9 });
        const metal = new THREE.MeshStandardMaterial({ color: 0x9da8ad, metalness: 0.8, roughness: 0.3 });
        const shell = new THREE.BoxGeometry(CAR_LEN, 0.65, 2), cabin = new THREE.BoxGeometry(2.1, 0.55, 1.7), tire = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12), rim = new THREE.CylinderGeometry(0.23, 0.23, 0.33, 12);
        const base = new THREE.Mesh(shell, paint); base.position.y = 0.62; fallback.add(base);
        const top = new THREE.Mesh(cabin, glass); top.position.set(-0.25, 1.21, 0); fallback.add(top);
        for (const x of [-1.45, 1.45]) for (const z of [-1, 1]) {
          const wheel = new THREE.Group(); wheel.position.set(x, 0.42, z); wheel.rotation.x = Math.PI / 2;
          wheel.add(new THREE.Mesh(tire, rubber), new THREE.Mesh(rim, metal)); fallback.add(wheel);
        }
        this.disposables.push(paint, glass, rubber, metal, shell, cabin, tire, rim); body = fallback;
      }
      group.add(body);
      const details = makeWheelDetails(); group.add(details.group);
      const flames: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const f = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0x66b8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        f.position.set(-CAR_LEN / 2 - 0.05, 0.32, s * 0.34); f.scale.set(0.001, 1, 1); group.add(f); flames.push(f);
      }
      // 불꽃·램프(MeshBasic)는 빛이라 그림자를 드리우지 않습니다
      if (this.shadows) group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).type.startsWith('MeshBasic')) m.castShadow = true; });
      const shadow = new THREE.Mesh(shGeo, shMat); this.scene.add(group, shadow); this.cars.push({ racer: r, group, flames, wheels: details.wheels, shadow, lastV: 0 });
    }
    this.disposables.push(flameGeo, shGeo, shTex, shMat);
  }

  /** 타임어택 고스트: 반투명 하늘색 차 한 대(없으면 null 로 끕니다). */
  private ghostCar: THREE.Group | null = null;
  setGhost(model: string, on: boolean): void {
    if (this.ghostCar) { this.scene.remove(this.ghostCar); this.ghostCar = null; }
    if (!on) return;
    const g = new THREE.Group(), tpl = this.carTemplates?.[model];
    const body = tpl ? instantiate(tpl, { paint: 0x7fe7ff, team: 0xffffff }) : new THREE.Mesh(new THREE.BoxGeometry(CAR_LEN, 1.1, 2));
    const mat = new THREE.MeshBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0.3, depthWrite: false, fog: false }); this.disposables.push(mat);
    body.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = mat; });
    g.add(body); g.visible = false; g.rotation.order = 'YXZ'; this.scene.add(g); this.ghostCar = g;
  }
  private updateGhost(race: RaceState): void {
    const g = this.ghostCar; if (!g || !race.ghost) return;
    const pose = ghostAt(race.ghost, Math.max(0, race.clock)), t = this.track;
    if (!pose) { g.visible = false; return; }
    const i = ((Math.round(pose.total) % t.n) + t.n) % t.n;
    g.visible = true; g.position.set(pose.x, t.y[i] + 0.02, pose.z); g.rotation.set(0, -pose.h, t.pitch[i] || 0, 'YXZ');
  }

  private buildSky(): void {
    const th = this.theme, mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: new THREE.Vector3(...th.sky.sun).normalize() }, top: { value: new THREE.Vector3(...th.sky.top) }, mid: { value: new THREE.Vector3(...th.sky.mid) }, low: { value: new THREE.Vector3(...th.sky.low) }, hor: { value: new THREE.Vector3(...th.sky.hor) }, sunCol: { value: new THREE.Vector3(...th.sky.sunColor) }, stars: { value: th.sky.stars }, clouds: { value: th.sky.clouds } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 sunDir, top, mid, low, hor, sunCol; uniform float stars, clouds;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
        void main(){ float h = clamp(vD.y, -0.2, 1.0);
          vec3 c = mix(hor, low, smoothstep(-0.05, 0.05, h)); c = mix(c, mid, smoothstep(0.02, 0.25, h)); c = mix(c, top, smoothstep(0.2, 0.75, h));
          float s = dot(normalize(vD), sunDir); c += sunCol * smoothstep(0.9965, 0.9985, s) * 1.4 + sunCol * vec3(1.0,0.6,0.4) * pow(max(s,0.0), 28.0) * 0.45;
          vec2 q = floor(vD.xz / max(vD.y, 0.05) * 18.0); float st = step(0.9965, fract(sin(dot(q, vec2(12.9898,78.233))) * 43758.5453)); c += vec3(st) * smoothstep(0.35, 0.8, h) * stars;
          if (clouds > 0.0 && vD.y > 0.02) { vec2 q = vD.xz / (vD.y + 0.22) * 1.6; float n = fbm(q + vec2(3.0, 1.0)) * 0.75 + fbm(q * 2.6) * 0.35, cov = smoothstep(1.0 - clouds * 0.75, 1.1 - clouds * 0.2, n), lit = clamp(0.55 + 0.6 * fbm(q * 1.4 + 4.0) + 0.5 * max(dot(normalize(vD), sunDir), 0.0), 0.0, 1.3);
            vec3 cc = mix(low * 0.9 + 0.15, vec3(1.0), 0.55) * lit; cc = mix(cc, sunCol, 0.18 * pow(max(dot(normalize(vD), sunDir), 0.0), 3.0));
            c = mix(c, cc, cov * smoothstep(0.02, 0.18, vD.y) * 0.92); }
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), mat); sky.name = 'sky'; this.scene.add(sky); this.disposables.push(sky.geometry, mat);
  }

  private buildGround(): void {
    const gr = this.theme.ground, S = gr.noise ? 512 : 128, tex = canvasTex(S, S, g => {
      g.fillStyle = gr.base; g.fillRect(0, 0, S, S);
      if (gr.noise) {
        // 이음매가 보이지 않도록 가장자리를 넘어가는 얼룩을 반대편에도 그립니다.
        const blob = (x: number, y: number, r: number, c: string): void => { for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { const gg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gg.addColorStop(0, c); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } };
        for (let i = 0; i < 46; i++) blob(Math.random() * S, Math.random() * S, 50 + Math.random() * 130, Math.random() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.10)');
        for (let i = 0; i < 5200; i++) { const a = Math.random() * 0.16; g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 1 + Math.random() * 2); }
      } else { g.strokeStyle = gr.line; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeStyle = gr.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke(); }
    });
    tex.repeat.set(gr.noise ? 40 : 110, gr.noise ? 40 : 110);
    const mat = new THREE.MeshBasicMaterial({ map: tex }); distantFog(mat); this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6600, 6600).rotateX(-Math.PI / 2), mat); this.ground.position.y = -0.4; this.scene.add(this.ground); this.disposables.push(this.ground.geometry, mat, tex);
  }

  private buildRoad(): void {
    const t = this.track, hw = t.halfWidth, th = this.theme, rd = th.road;
    // 40m 를 한 장으로 쓰는 아스팔트: 굵은 얼룩, 고운 입자, 타이어 자국, 균열, 보수 자국, 가장자리 선
    const TW = 512, TH = 1024, asphalt = canvasTex(TW, TH, g => {
      g.fillStyle = rd.base; g.fillRect(0, 0, TW, TH);
      for (let i = 0; i < 70; i++) { const x = Math.random() * TW, y = Math.random() * TH, r = 40 + Math.random() * 120, gr = g.createRadialGradient(x, y, 0, x, y, r), d = Math.random() < 0.5; gr.addColorStop(0, d ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      for (let i = 0; i < 9000; i++) { const a = Math.random() * 0.22; g.fillStyle = Math.random() < 0.55 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`; g.fillRect(Math.random() * TW, Math.random() * TH, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      for (const cx of [TW * 0.30, TW * 0.70]) { const gr = g.createLinearGradient(cx - 34, 0, cx + 34, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.20)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - 34, 0, 68, TH); }
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2; for (let i = 0; i < 14; i++) { let x = Math.random() * TW, y = Math.random() * TH; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 30; y += 12 + Math.random() * 22; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 5; i++) { const x = Math.random() * (TW - 140) + 30, y = Math.random() * TH, w = 40 + Math.random() * 70, h = 18 + Math.random() * 60; g.fillStyle = 'rgba(8,8,10,.07)'; for (let k = 4; k >= 0; k--) g.fillRect(x - k * 4, y - k * 4, w + k * 8, h + k * 8); } // 보수 자국: 가장자리를 겹쳐 번지게 해서 그림자 상자처럼 딱 잘리지 않게 합니다.
      g.fillStyle = rd.edge; g.fillRect(14, 0, 9, TH); g.fillRect(TW - 23, 0, 9, TH);
      g.fillStyle = rd.center; if (rd.centerDouble) { g.fillRect(TW / 2 - 12, 0, 7, TH); g.fillRect(TW / 2 + 5, 0, 7, TH); } else for (let y = 0; y < TH; y += 256) g.fillRect(TW / 2 - 4, y + 20, 9, 150);
      g.fillStyle = rd.lane; g.fillRect(TW * 0.25, 0, 4, TH); g.fillRect(TW * 0.75, 0, 4, TH);
      for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(Math.random() < 0.5 ? 14 + Math.random() * 9 : TW - 23 + Math.random() * 9, Math.random() * TH, 2, 2 + Math.random() * 4); }
    });
    asphalt.anisotropy = 8;
    const roadGeo = ribbon(t, -hw, hw, 0, 0); roadGeo.computeVertexNormals();
    const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: th.rain ? 0.48 : 0.92, metalness: th.rain ? 0.12 : 0.02 });
    const road = new THREE.Mesh(roadGeo, roadMat); road.renderOrder = 0; road.receiveShadow = true; this.scene.add(road);
    // 연석(빨강·흰색, 두 칸씩), 콘크리트 방호벽(밑단 어둡고 윗단이 또렷한 띠 + 상판), 도로 아래 스커트
    const curbCol = (i: number): [number, number, number] => [...th.curb[Math.floor(i / 2) % 2]];
    const curbMat = new THREE.MeshLambertMaterial({ vertexColors: true });    // 연석·벽의 단색 면을 없애는 무늬: 연석은 닳은 자국·타이어 가루, 벽은 거푸집 이음매·볼트·그을음이 있는 콘크리트
    const gritTex = canvasTex(128, 128, g => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1400; i++) { const a = Math.random() * 0.2; g.fillStyle = Math.random() < 0.6 ? `rgba(40,30,30,${a})` : `rgba(255,255,255,${a})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 3); }
      for (let i = 0; i < 9; i++) { const y = Math.random() * 128; g.fillStyle = 'rgba(20,16,16,.16)'; g.fillRect(0, y, 128, 1 + Math.random() * 2); }
    });
    const concreteTex = canvasTex(256, 128, g => {
      g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 3200; i++) { const a = Math.random() * 0.14; g.fillStyle = Math.random() < 0.55 ? `rgba(20,20,24,${a})` : `rgba(255,255,255,${a * 1.4})`; g.fillRect(Math.random() * 256, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      for (let i = 0; i < 6; i++) { const y = Math.random() * 128, gr = g.createLinearGradient(0, y, 0, y + 30); gr.addColorStop(0, 'rgba(30,26,22,.22)'); gr.addColorStop(1, 'rgba(30,26,22,0)'); g.fillStyle = gr; g.fillRect(Math.random() * 90, y, 18 + Math.random() * 50, 30); } // 빗물 얼룩
      const sh = g.createLinearGradient(0, 0, 70, 0); sh.addColorStop(0, 'rgba(0,0,0,.42)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(0, 0, 70, 128); // 밑단 그을음
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, 256, 3); g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(0, 3, 256, 1.5); // 이음매
      for (const [x, y] of [[180, 14], [180, 114], [220, 14], [220, 114]]) { g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - 1, y - 1, 1.6, 0, 7); g.fill(); }
    });
    gritTex.anisotropy = concreteTex.anisotropy = 8; curbMat.map = gritTex; this.disposables.push(gritTex, concreteTex);
    const curbL = new THREE.Mesh(ribbon(t, -hw - 1.5, -hw, 0.06, 0.06, i => curbCol(i), 1 / 3), curbMat), curbR = new THREE.Mesh(ribbon(t, hw, hw + 1.5, 0.06, 0.06, i => curbCol(i), 1 / 3), curbMat);
    const wallCol = (i: number, side: 0 | 1): [number, number, number] => { const band = Math.floor(i / 9) % 2, c = side === 0 ? th.wall.inner : band ? th.wall.b : th.wall.a, k = side === 0 ? 1 : 0.92 + 0.08 * ((i % 9) / 9); return [c[0] * k, c[1] * k, c[2] * k]; };
    const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: concreteTex });
    const wl = hw + 1.5;
    const wallL = new THREE.Mesh(ribbon(t, -wl, -wl, 0, 1.15, wallCol, 1 / 6), wallMat), wallR = new THREE.Mesh(ribbon(t, wl, wl, 0, 1.15, wallCol, 1 / 6), wallMat);
    const capCol = (i: number): [number, number, number] => { const c = th.wall.b; return [c[0] * 0.78, c[1] * 0.78, c[2] * 0.78 + 0.02 + (i % 2) * 0.0]; };
    const capL = new THREE.Mesh(ribbon(t, -wl - 0.35, -wl + 0.05, 1.15, 1.15, capCol), wallMat), capR = new THREE.Mesh(ribbon(t, wl - 0.05, wl + 0.35, 1.15, 1.15, capCol), wallMat);
    const skirtMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.ground.base).multiplyScalar(0.7), side: THREE.DoubleSide });
    const skirt = (a: number, b: number): THREE.Mesh => { const g = ribbon(t, a, b, 0, 0); const p = g.attributes.position as THREE.BufferAttribute; for (let k = 1; k < p.count; k += 2) p.setY(k, -0.4); return new THREE.Mesh(g, skirtMat); };
    // 벽 바깥 갓길(자갈·풀·모래)
    const shTex = grainTex(128, 128, 2600, g => { for (let i = 0; i < 40; i++) { const x = Math.random() * 128, y = Math.random() * 128, r = 3 + Math.random() * 7, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }); this.disposables.push(shTex);
    const shMat = new THREE.MeshBasicMaterial({ color: th.shoulder, map: shTex, side: THREE.DoubleSide });
    const shL = new THREE.Mesh(scaleUv(ribbon(t, -wl - 8, -wl, 0.02, 0.02), 2, 10), shMat), shR = new THREE.Mesh(scaleUv(ribbon(t, wl, wl + 8, 0.02, 0.02), 2, 10), shMat);
    for (const m of [curbL, curbR, wallL, wallR, capL, capR]) m.receiveShadow = true;
    this.scene.add(curbL, curbR, wallL, wallR, capL, capR, shL, shR, skirt(-wl, -wl), skirt(wl, wl));
    this.disposables.push(road.geometry, roadMat, asphalt, curbL.geometry, curbR.geometry, curbMat, wallL.geometry, wallR.geometry, capL.geometry, capR.geometry, shL.geometry, shR.geometry, shMat, wallMat, skirtMat);
    // 급커브 바깥쪽 타이어 벽
    const tires: Array<{ p: [number, number, number]; ry: number; color: number }> = [];
    for (let i = 0; i < t.n; i += 2) {
      const k = t.k[i]; if (Math.abs(k) < 0.0075) continue; const side = k > 0 ? -1 : 1, off = side * (wl + 0.9);
      for (let h = 0; h < 2; h++) tires.push({ p: [t.x[i] - t.tz[i] * off, t.y[i] + 0.3 + h * 0.58, t.z[i] + t.tx[i] * off], ry: 0, color: Math.floor(i / 8) % 2 ? 0x1c1c20 : 0xd8d8de });
    }
    if (tires.length) { // 옆면은 트레드 블록, 윗면은 휠 안쪽이 보이는 사이드월 무늬(둘 다 흰색 바탕이라 칸마다 칠한 색이 그대로 먹습니다)
      const tread = canvasTex(128, 32, g => {
        g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, 128, 32);
        for (let x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(0,0,0,.42)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, 16); g.lineTo(x, 32); g.lineTo(x + 2, 32); g.lineTo(x + 5, 16); g.lineTo(x + 2, 0); g.fill(); }
        for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * 128, Math.random() * 32, 2, 2); }
        const sh = g.createLinearGradient(0, 0, 0, 32); sh.addColorStop(0, 'rgba(0,0,0,.4)'); sh.addColorStop(0.2, 'rgba(0,0,0,0)'); sh.addColorStop(0.8, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = sh; g.fillRect(0, 0, 128, 32);
      });
      const wall = canvasTex(128, 128, g => {
        g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 128, 128);
        for (const [r, c] of [[63, 'rgba(0,0,0,.35)'], [46, 'rgba(255,255,255,.55)'], [40, 'rgba(0,0,0,.55)']] as const) { g.fillStyle = c; g.beginPath(); g.arc(64, 64, r, 0, 7); g.fill(); }
        const hubG = g.createRadialGradient(56, 56, 2, 64, 64, 38); hubG.addColorStop(0, '#f3f3f3'); hubG.addColorStop(1, '#6d6d6d'); g.fillStyle = hubG; g.beginPath(); g.arc(64, 64, 37, 0, 7); g.fill();
        g.fillStyle = 'rgba(0,0,0,.6)'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; g.beginPath(); g.arc(64 + Math.cos(a) * 21, 64 + Math.sin(a) * 21, 4, 0, 7); g.fill(); }
        g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill();
      }, false);
      this.disposables.push(tread, wall);
      this.instanced(new THREE.CylinderGeometry(0.62, 0.62, 0.55, 16, 1, true), new THREE.MeshStandardMaterial({ map: tread, roughness: 0.92 }), tires);
      this.instanced(new THREE.CircleGeometry(0.62, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: wall, roughness: 0.85 }), tires.map(x => ({ ...x, p: [x.p[0], x.p[1] + 0.277, x.p[2]] as [number, number, number] })));
    }
    // 부스트 패드
    const padTexBase = (): THREE.CanvasTexture => canvasTex(256, 128, g => {
      g.fillStyle = 'rgba(20,10,40,.55)'; g.fillRect(0, 0, 256, 128); g.strokeStyle = th.pad; g.lineWidth = 14; g.lineJoin = 'round';
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(30 + k * 78, 14); g.lineTo(78 + k * 78, 64); g.lineTo(30 + k * 78, 114); g.stroke(); }
    });
    for (const i of t.pads) {
      const tex = padTexBase(), m = new THREE.Mesh(new THREE.PlaneGeometry(16, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.order = 'YXZ'; m.rotation.y = -Math.atan2(t.tz[i], t.tx[i]); m.rotation.z = t.pitch[i]; m.position.set(t.x[i], t.y[i] + 0.1, t.z[i]); this.scene.add(m); this.pads.push({ tex }); this.disposables.push(m.geometry, tex);
    }
    // 출발선
    const i0 = 0, check = canvasTex(256, 32, g => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
    check.repeat.set(1, 1); const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, hw * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: check, polygonOffset: true, polygonOffsetFactor: -3 }));
    line.rotation.order = 'YXZ'; line.rotation.y = -Math.atan2(t.tz[i0], t.tx[i0]); line.rotation.z = t.pitch[i0]; line.rotation.y += 0; line.position.set(t.x[i0], t.y[i0] + 0.08, t.z[i0]); line.rotateY(Math.PI / 2); this.scene.add(line); this.disposables.push(line.geometry, check);
    const lampGeo = new THREE.SphereGeometry(0.42, 14, 10), rx0 = -t.tz[0], rz0 = t.tx[0];
    for (let i = 0; i < 3; i++) {
      const lat = (i - 1) * 2.4, mat = new THREE.MeshBasicMaterial({ color: 0x2a1016 });
      const lamp = new THREE.Mesh(lampGeo, mat);
      lamp.position.set(t.x[0] + rx0 * lat - t.tx[0] * 0.6, t.y[0] + 12.6, t.z[0] + rz0 * lat - t.tz[0] * 0.6);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: 0x2a1016, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.setScalar(4.2); lamp.add(halo); // 켜진 출발등의 빛 번짐
      this.scene.add(lamp); this.startLamps.push(lamp); this.disposables.push(mat, halo.material);
    }
    this.disposables.push(lampGeo);
    if (driverKit) { // 출발선 옆 피트 크루·관중: 코스를 바라보며 손을 흔듭니다
      for (let n = 0; n < 8; n++) {
        const side = n % 2 ? 1 : -1, ahead = 1 + Math.floor(n / 2) * 2, j = Math.min(t.n - 1, ahead), ch = driverKit.create(['civ', 'civ3', 'worker', 'civ5', 'guard'][n % 5], 40 + n, [0xe8e6df, 0xd9a23a, 0x2f6fd0, 0xc23b3b][n % 4]), dx = t.x[j] - t.tz[j] * side * (hw + 3.4), dz = t.z[j] + t.tx[j] * side * (hw + 3.4);
        ch.root.position.set(dx, t.y[j], dz); ch.root.rotation.y = -Math.atan2(t.tx[j] * side, -t.tz[j] * side) + Math.PI; ch.state.wave = n % 3 === 0 ? 1 : 0; ch.state.time = n; ch.update(0); this.scene.add(ch.root); this.crew.push(ch);
      }
    }
    const drawChev = (g: CanvasRenderingContext2D, mirror: boolean): void => {
      g.fillStyle = '#16130c'; g.fillRect(0, 0, 128, 96); g.save(); if (mirror) { g.translate(128, 0); g.scale(-1, 1); }
      g.strokeStyle = '#ffe14a'; g.lineWidth = 14; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(36, 16); g.lineTo(84, 48); g.lineTo(36, 80); g.moveTo(62, 16); g.lineTo(110, 48); g.lineTo(62, 80); g.stroke(); g.restore();
    };
    const boards: Record<'right' | 'left', Array<{ p: [number, number, number]; ry: number }>> = { right: [], left: [] };
    for (let i = 16; i < t.n - 16; i += 5) {
      if (Math.abs(t.k[i]) < 0.009) continue;
      const face = chevronFacing(t.tx[i], t.tz[i], t.k[i]), side = t.k[i] > 0 ? -1 : 1, off = side * (hw - 2.5);
      boards[face.mirror ? 'left' : 'right'].push({ p: [t.x[i] - t.tz[i] * off, t.y[i] + 0.72, t.z[i] + t.tx[i] * off], ry: face.yaw });
    }
    const chevMat = (mirror: boolean): THREE.MeshBasicMaterial => { const map = canvasTex(128, 96, g => drawChev(g, mirror), false); this.disposables.push(map); return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }); };
    if (boards.right.length) this.instanced(new THREE.PlaneGeometry(1.7, 1.15), chevMat(false), boards.right);
    if (boards.left.length) this.instanced(new THREE.PlaneGeometry(1.7, 1.15), chevMat(true), boards.left);
  }

  /** 출발 아치의 신호등. 3·2·1에 빨간 불이 하나씩 켜지고, 출발하면 잠깐 초록입니다. */
  private updateStartLights(race: RaceState): void {
    if (!this.startLamps.length) return;
    const count = race.phase === 'countdown' ? Math.max(0, Math.ceil(-race.clock)) : 0;
    const go = race.phase !== 'countdown' && race.clock >= 0 && race.clock < 1.15;
    const reds = count > 0 ? 4 - count : 0;
    this.startLamps.forEach((lamp, i) => {
      const lit = go || i < reds, hex = go ? 0x3dff8a : i < reds ? 0xff2942 : 0x2a1016; (lamp.material as THREE.MeshBasicMaterial).color.setHex(hex);
      const halo = lamp.children[0] as THREE.Sprite | undefined; if (halo) { (halo.material as THREE.SpriteMaterial).color.setHex(hex); (halo.material as THREE.SpriteMaterial).opacity = lit ? 0.85 : 0; }
    });
  }

  /** 도로에서 clear 미터 이상 떨어진 무작위 위치(x, z, 도로 고도)를 최대 count 개 찾습니다. radius 가 있으면 물체 반지름만큼 더 떨어뜨립니다(큰 메사·언덕이 도로를 덮지 않도록). */
  private scatter(count: number, minOff: number, maxOff: number, clear: number, gap = 0, both = true, radius?: () => number): Array<[number, number, number, number]> {
    const t = this.track, hw = t.halfWidth, out: Array<[number, number, number, number]> = [];
    for (let tries = 0; tries < count * 40 && out.length < count; tries++) {
      const r = radius ? radius() : 0, i = Math.floor(Math.random() * t.n), side = both ? (Math.random() < 0.5 ? -1 : 1) : 1, off = side * (hw + r + rnd(minOff, maxOff)), x = t.x[i] - t.tz[i] * off, z = t.z[i] + t.tx[i] * off;
      // 중심선 표본 사이 간격(ds)만큼 거리가 과대평가되므로 모든 표본을 확인하고 그만큼 여유를 둡니다.
      const need = hw + clear + r - t.ds * 0.5;
      // 높이 올라간 도로는 비탈이 옆으로 넓게 퍼지므로, 그 폭만큼 더 떨어뜨려 비탈에 소품이 파묻히지 않게 합니다.
      let ok = true; for (let j = 0; j < t.n; j++) { if (Math.hypot(t.x[j] - x, t.z[j] - z) < need + Math.max(0, t.y[j] * 2.4 - 2)) { ok = false; break; } }
      if (ok && gap > 0 && out.some(p => Math.hypot(p[0] - x, p[1] - z) < gap)) ok = false;
      if (ok) out.push([x, z, t.y[i], r]);
    }
    return out;
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Array<{ p: [number, number, number]; s?: [number, number, number]; ry?: number; color?: THREE.ColorRepresentation }>): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    items.forEach((it, k) => { m4.compose(new THREE.Vector3(...it.p), q.setFromEuler(e.set(0, it.ry ?? 0, 0)), new THREE.Vector3(...(it.s ?? [1, 1, 1]))); mesh.setMatrixAt(k, m4); if (it.color !== undefined) mesh.setColorAt(k, col.set(it.color)); });
    mesh.count = items.length; mesh.frustumCulled = false; mesh.userData.deco = this.decoOn; this.scene.add(mesh); this.disposables.push(geo, mat); return mesh;
  }

  private buildProps(quality: 'high' | 'standard' | 'low'): void {
    const t = this.track, hw = t.halfWidth, th = this.theme, parts: THREE.BufferGeometry[] = [], low = quality === 'low';
    // 아치(출발선 + 구간마다)
    const archAt = (i: number, big: boolean): void => {
      const col = new THREE.Color(big ? th.arch.big : (i / 50) % 2 < 1 ? th.arch.a : th.arch.b), rot = -Math.atan2(t.tz[i], t.tx[i]) + Math.PI / 2, rx = -t.tz[i], rz = t.tx[i], h = big ? 15 : 11, post = hw + 2.6;
      for (const s of [-1, 1]) parts.push(boxGeo(0.9, h, 0.9, t.x[i] + rx * post * s, t.y[i] + h / 2, t.z[i] + rz * post * s, rot, col));
      parts.push(boxGeo(post * 2 + 1.8, big ? 2.4 : 0.8, 0.9, t.x[i], t.y[i] + h, t.z[i], rot, col));
    };
    archAt(0, true); const arches = low ? Math.ceil(th.arch.count / 2) : th.arch.count; for (let k = 1; k < arches; k++) { const i = Math.round((k / arches) * t.n) % t.n; if (!t.pads.some(p => Math.abs(p - i) < 6) && Math.min(i, t.n - i) > 12) archAt(i, false); }
    // 아치 철골: 패널 이음매·볼트·경고 줄무늬·때가 탄 아랫단(칠한 색 위에 곱해지는 흰색 바탕 무늬)
    const archTex = canvasTex(128, 128, g => {
      g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 3); }
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 62, 128, 3); g.fillRect(62, 0, 3, 128); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 65, 128, 2); g.fillRect(65, 0, 2, 128);
      g.save(); g.beginPath(); g.rect(0, 108, 128, 20); g.clip(); g.fillStyle = 'rgba(20,20,20,.55)'; for (let x = -30; x < 150; x += 24) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 12, 128); g.lineTo(x + 32, 108); g.lineTo(x + 20, 108); g.fill(); } g.restore();
      for (const [x, y] of [[10, 10], [118, 10], [10, 98], [118, 98], [32, 10], [96, 10]]) { g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x - 1, y - 1, 1.3, 0, 7); g.fill(); }
      const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(0,0,0,.32)'); gr.addColorStop(0.18, 'rgba(0,0,0,0)'); gr.addColorStop(0.82, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.32)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
    const archMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: archTex }); this.disposables.push(archTex); this.scene.add(new THREE.Mesh(mergeGeometries(parts), archMat)); parts.forEach(p => p.dispose());
    // START 배너
    const bn = th.banner, banner = canvasTex(512, 96, g => { g.fillStyle = bn.bg; g.fillRect(0, 0, 512, 96); g.fillStyle = bn.fg; g.font = '900 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SPEED RUSH', 256, 52); g.fillStyle = bn.accent; g.fillRect(0, 0, 512, 6); g.fillRect(0, 90, 512, 6); }, false);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3, 2.2), new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide })); bm.position.set(t.x[0], t.y[0] + 15, t.z[0] + 0.01); bm.rotation.y = -Math.atan2(t.tz[0], t.tx[0]) + Math.PI / 2; this.scene.add(bm); this.disposables.push(bm.geometry, banner);
    this.disposables.push(archMat);
    // 도로 옆 기준점(속도감): 가로등 또는 반사 표지
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    if (th.lamp.kind === 'lamp') {
      // 기둥은 금속 광택과 하단 받침, 등은 렌즈 무늬를 갖고, 빛 번짐(후광)을 더합니다.
      const poleTex = canvasTex(32, 128, g => {
        const gr = g.createLinearGradient(0, 0, 32, 0); gr.addColorStop(0, '#2a2640'); gr.addColorStop(0.35, '#9a96b8'); gr.addColorStop(0.5, '#cfcce6'); gr.addColorStop(1, '#2a2640'); g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 118, 32, 10); g.fillRect(0, 0, 32, 4); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(0, 110, 32, 2);
      }, false);
      const lensTex = canvasTex(64, 32, g => {
        g.fillStyle = '#3a3a44'; g.fillRect(0, 0, 64, 32); const gr = g.createRadialGradient(32, 16, 1, 32, 16, 26); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#e6e6e6'); gr.addColorStop(1, '#9a9a9a'); g.fillStyle = gr; g.fillRect(4, 4, 56, 24);
      }, false);
      this.disposables.push(poleTex, lensTex);
      const spacing = 6, lampN = Math.floor(t.n / spacing) * 2, post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 7.5, 0.28), new THREE.MeshLambertMaterial({ color: 0x8f88c0, map: poleTex }), lampN), head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, map: lensTex }), lampN); let li = 0;
      const haloPos: number[] = [], haloCol: number[] = [];
      for (let i = 0; i < t.n && li < lampN - 1; i += spacing) for (const s of [-1, 1]) {
        const off = (hw + 4.2) * s, x = t.x[i] - t.tz[i] * off, z = t.z[i] + t.tx[i] * off;
        m4.compose(new THREE.Vector3(x, t.y[i] + 3.75, z), q.identity(), sc); post.setMatrixAt(li, m4);
        e.set(0, -Math.atan2(t.tz[i], t.tx[i]) + Math.PI / 2, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x - (-t.tz[i]) * s * 0.5, t.y[i] + 7.5, z - t.tx[i] * s * 0.5), q, sc); head.setMatrixAt(li, m4);
        head.setColorAt(li, c.setHex((i / spacing) % 2 === 0 ? th.lamp.a : th.lamp.b)); haloPos.push(x - (-t.tz[i]) * s * 0.5, t.y[i] + 7.3, z - t.tx[i] * s * 0.5); haloCol.push(c.r, c.g, c.b); li++;
      }
      post.count = head.count = li; this.scene.add(post, head); this.disposables.push(post.geometry, head.geometry);
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(haloPos, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(haloCol, 3));
      const halo = new THREE.Points(hg, new THREE.PointsMaterial({ size: 7, map: dotTex(), vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.frustumCulled = false; this.scene.add(halo); this.disposables.push(hg, halo.material as THREE.Material);
    } else {
      const step = 10, items: Array<{ p: [number, number, number]; ry: number; color: number }> = [];
      for (let i = 0; i < t.n; i += step) for (const s of [-1, 1]) { const off = (hw + 3) * s; items.push({ p: [t.x[i] - t.tz[i] * off, t.y[i] + 0.55, t.z[i] + t.tx[i] * off], ry: 0, color: (i / step) % 5 === 0 ? 0xf0a030 : 0xf4f4ee }); }
      const postTex = canvasTex(32, 64, g => { // 흰 기둥: 검은 띠 + 은색 반사판, 윗면 모서리 음영
        g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 32, 64); g.fillStyle = '#26262c'; g.fillRect(0, 12, 32, 14); g.fillStyle = '#d5dbe0'; g.fillRect(8, 15, 16, 8);
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 56, 32, 8); const gr = g.createLinearGradient(0, 0, 32, 0); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(0.3, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.3)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 64);
      }, false);
      this.disposables.push(postTex);
      this.instanced(new THREE.BoxGeometry(0.22, 1.1, 0.22), new THREE.MeshLambertMaterial({ color: 0xffffff, map: postTex }), items);
    }
    const mat = (o: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial => { const m = new THREE.MeshBasicMaterial(o); this.disposables.push(m); return m; };
    // 도로가 높이 올라간 곳은 비탈로 지면까지 내립니다.
    const embTex = grainTex(128, 128, 3200); this.disposables.push(embTex);
    const emb = (side: 1 | -1): THREE.Mesh => {
      const n = t.n, pos = new Float32Array((n + 1) * 6), uvs = new Float32Array((n + 1) * 4), idx: number[] = [];
      for (let k = 0; k <= n; k++) { const i = k % n, w = Math.max(6, t.y[i] * 2.4 + 4), a = side * (hw + 1.5), b = side * (hw + 1.5 + w), rx = -t.tz[i], rz = t.tx[i]; pos.set([t.x[i] + rx * a, t.y[i], t.z[i] + rz * a, t.x[i] + rx * b, -0.4, t.z[i] + rz * b], k * 6); uvs.set([0, k * t.ds / 5, w / 5, k * t.ds / 5], k * 4); if (k < n) { const o = k * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx); this.disposables.push(g);
      return new THREE.Mesh(g, mat({ color: new THREE.Color(th.ground.base).multiplyScalar(0.85), map: embTex, side: THREE.DoubleSide }));
    };
    this.scene.add(emb(1), emb(-1));
    const sceneryKind = th.scenery; this.decoOn = true;
    if (sceneryKind === 'city') {
      // 한 장 = 가로 12m(창 4칸) × 세로 14m(4층). 층마다 슬래브 띠가 있고, 불 켜진 창은 몇 칸씩 이어져 실제 사무실처럼 보입니다.
      // (예전 6×12 칸의 작은 무작위 점은 멀리서 노이즈처럼 번쩍였습니다.)
      const win = canvasTex(128, 256, g => {
        g.fillStyle = '#100c24'; g.fillRect(0, 0, 128, 256);
        for (let f = 0; f < 4; f++) {
          const y0 = f * 64; g.fillStyle = '#1d1838'; g.fillRect(0, y0, 128, 7);
          let run = 0, col = '#ffd9a0';
          for (let c = 0; c < 4; c++) {
            if (run <= 0 && Math.random() < 0.42) { run = 1 + Math.floor(Math.random() * 3); const h = Math.random(); col = h < 0.6 ? '#ffd29a' : h < 0.85 ? '#86e6ff' : '#ff86d8'; }
            const x = c * 32 + 4, y = y0 + 14;
            if (run-- > 0) { g.fillStyle = col; g.fillRect(x, y, 24, 40); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + 28, 24, 12); }
            else { g.fillStyle = '#1a1533'; g.fillRect(x, y, 24, 40); g.fillStyle = 'rgba(120,110,200,.10)'; g.fillRect(x, y, 24, 6); }
            g.fillStyle = '#0a0818'; g.fillRect(c * 32, y0 + 7, 3, 57);
          }
        }
      });
      const classes = [{ h: 45, n: low ? 60 : 110 }, { h: 90, n: low ? 40 : 80 }, { h: 160, n: low ? 18 : 40 }];
      const placed: Array<[number, number, number]> = [];
      for (const k of classes) {
        const w = 22, g = new THREE.BoxGeometry(w, k.h, w), uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 12), uv.getY(i) * (k.h / 14));
        const bmat = new THREE.MeshBasicMaterial({ map: win, color: th.tint }), mesh = new THREE.InstancedMesh(g, bmat, k.n); let count = 0;
        for (let tries = 0; tries < k.n * 30 && count < k.n; tries++) {
          const i = Math.floor(Math.random() * t.n), side = Math.random() < 0.5 ? -1 : 1, off = side * (hw + rnd(50, 380)), x = t.x[i] - t.tz[i] * off + rnd(-20, 20), z = t.z[i] + t.tx[i] * off + rnd(-20, 20);
          let ok = true; for (let j = 0; j < t.n; j += 2) { if (Math.hypot(t.x[j] - x, t.z[j] - z) < hw + 40) { ok = false; break; } }
          if (!ok || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 34)) continue;
          placed.push([x, z, k.h]); m4.compose(new THREE.Vector3(x, k.h / 2 - 0.4, z), q.setFromEuler(e.set(0, rnd(0, 6.28), 0)), sc.set(1, 1, 1)); mesh.setMatrixAt(count++, m4);
        }
        mesh.count = count; mesh.userData.deco = true; this.scene.add(mesh); this.disposables.push(g, bmat);
      }
      this.disposables.push(win);
    } else if (sceneryKind === 'harbor') {
      // 컨테이너 더미, 창고, 크레인
      const palette = [0xb23a2e, 0x2e6da4, 0xd4a017, 0x2f8f6b, 0x8e939c, 0xb5651d, 0xe8e6df], items: Array<{ p: [number, number, number]; ry: number; color: number }> = [];
      for (const [x, z] of this.scatter(low ? 45 : 90, 0, 260, 16, 22, true, () => 40)) {
        const ry = Math.random() < 0.5 ? 0 : Math.PI / 2, cols = 2 + Math.floor(Math.random() * 3), rows = 1 + Math.floor(Math.random() * 3), stack = 1 + Math.floor(Math.random() * 3);
        for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) for (let h = 0; h < stack; h++) { const lx = a * 12.6, lz = b * 2.8, cx = Math.cos(ry), sx = Math.sin(ry); items.push({ p: [x + lx * cx + lz * sx, 1.2 + h * 2.6 - 0.4, z - lx * sx + lz * cx], ry, color: palette[Math.floor(Math.random() * palette.length)] }); }
      }
      const contTex = canvasTex(128, 64, g => { // 골판 컨테이너: 세로 골, 위아래 레일, 번호판, 녹 줄기
        g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 128, 64);
        for (let x = 0; x < 128; x += 5) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, 5, 2, 54); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 2, 5, 1, 54); }
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, 128, 5); g.fillRect(0, 59, 128, 5); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(0, 5, 128, 1);
        g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(14, 12, 34, 9); g.fillStyle = 'rgba(0,0,0,.5)'; for (let k = 0; k < 6; k++) g.fillRect(16 + k * 5, 14, 3, 5);
        for (let i = 0; i < 7; i++) { const x = Math.random() * 128, gr = g.createLinearGradient(0, 8, 0, 56); gr.addColorStop(0, 'rgba(120,60,20,.28)'); gr.addColorStop(1, 'rgba(120,60,20,0)'); g.fillStyle = gr; g.fillRect(x, 8, 2 + Math.random() * 3, 48); }
        for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * 128, Math.random() * 64, 2, 2); }
      }, false);
      this.disposables.push(contTex);
      this.instanced(new THREE.BoxGeometry(12, 2.6, 2.4), mat({ color: 0xffffff, map: contTex }), items);
      const sheds = this.scatter(low ? 6 : 14, 0, 320, 30, 90, true, () => 40).map(([x, z]) => ({ p: [x, 6 - 0.4, z] as [number, number, number], s: [rnd(0.9, 1.5), 1, rnd(0.8, 1.3)] as [number, number, number], ry: Math.round(Math.random()) * Math.PI / 2, color: 0x8b95a3 }));
      const shedTex = canvasTex(128, 64, g => { // 철판 벽: 세로 골과 큰 셔터
        g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, 128, 64);
        for (let x = 0; x < 128; x += 4) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x, 0, 1.5, 64); }
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(34, 22, 60, 42); for (let y = 24; y < 64; y += 5) { g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(34, y, 60, 1.5); }
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, 128, 4); g.fillRect(0, 60, 128, 4);
      }, false);
      this.disposables.push(shedTex);
      this.instanced(new THREE.BoxGeometry(46, 12, 22), mat({ color: 0xffffff, map: shedTex }), sheds);
      const crane = (x: number, z: number): void => { const g: THREE.BufferGeometry[] = [], col = new THREE.Color(0xe0872a); for (const dx of [-14, 14]) for (const dz of [-6, 6]) g.push(boxGeo(1.6, 46, 1.6, x + dx, 22.6, z + dz, 0, col)); g.push(boxGeo(36, 3, 16, x, 46, z, 0, col), boxGeo(70, 2.4, 3, x, 50, z, 0, col)); const mm = mergeGeometries(g); g.forEach(o => o.dispose()); this.scene.add(new THREE.Mesh(mm, mat({ vertexColors: true }))); this.disposables.push(mm); };
      for (const [x, z] of this.scatter(low ? 2 : 5, 70, 260, 50, 200)) crane(x, z);
    } else if (sceneryKind === 'forest') {
      const snow = !!th.snow, trunk = new THREE.CylinderGeometry(0.5, 0.8, 4, 6), spots = this.scatter(low ? 160 : 340, 18, 320, 30, 9);
      // 세 단으로 쌓은 침엽수. 눈 쌓인 코스는 위쪽이 하얗게 칠해집니다.
      const tiers: THREE.BufferGeometry[] = [[3.7, 6, 2.5], [2.9, 5.2, 6], [2.1, 4.6, 9.4]].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 8, 2).translate(0, y, 0), p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const f = (p.getY(i) - (y - h / 2)) / h, white = snow ? Math.min(1, Math.max(0, (f - 0.25) * 2.2)) : 0, base = snow ? [0.16, 0.3, 0.24] : [1, 1, 1]; c.set([base[0] + (1 - base[0]) * white, base[1] + (1 - base[1]) * white, base[2] + (1 - base[2]) * white], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; });
      const crown = mergeGeometries(tiers.map(g => g.toNonIndexed())); tiers.forEach(g => g.dispose());
      const tint = new THREE.Color(th.tint), shade = (): THREE.Color => (snow ? new THREE.Color().setScalar(rnd(0.82, 1.1)) : tint.clone().multiplyScalar(rnd(0.7, 1.25)));
      const sizes = spots.map(() => rnd(0.8, 1.8));
      const bark = grainTex(32, 64, 500, g => { for (let x = 0; x < 32; x += 4) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + Math.random() * 2, 0, 1.5, 64); } });
      const needles = grainTex(64, 64, 900, g => { for (let y = 6; y < 64; y += 9) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, y, 64, 2); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, y + 2, 64, 1); } });
      needles.repeat.set(3, 1); this.disposables.push(bark, needles);
      this.instanced(trunk, mat({ color: 0x4a3524, map: bark }), spots.map(([x, z], k) => ({ p: [x, 2 * sizes[k] - 0.4, z] as [number, number, number], s: [sizes[k], sizes[k], sizes[k]] as [number, number, number] })));
      this.instanced(crown, mat({ vertexColors: true, map: needles }), spots.map(([x, z], k) => ({ p: [x, 2 * sizes[k] - 0.4, z] as [number, number, number], s: [sizes[k], sizes[k], sizes[k]] as [number, number, number], ry: rnd(0, 6), color: shade() })));
      this.addBackdrop(quality, crown, trunk);
    } else {
      // 사막: 메사, 선인장, 모래 언덕, 전봇대
      const strata = canvasTex(64, 128, g => { const cols = ['#b4622f', '#c97a3e', '#a8552a', '#d08a4b', '#b86a36']; for (let y = 0; y < 128; y += 8) { g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(0, y, 64, 8); } });
      const mesas = this.scatter(low ? 18 : 40, 40, 1100, 70, 150, true, () => rnd(60, 170) * 1.25).map(([x, z, , r]) => { const w = r / 1.25, h = rnd(24, 90); return { p: [x, h / 2 - 0.4, z] as [number, number, number], s: [w, h, w * rnd(0.6, 1.2)] as [number, number, number], ry: rnd(0, 6) }; });
      const cyl = new THREE.CylinderGeometry(0.78, 1, 1, 7); (cyl.attributes.uv as THREE.BufferAttribute).array.forEach((_, i, arr) => { if (i % 2) (arr as Float32Array)[i] *= 2; });
      this.instanced(cyl, mat({ map: strata, color: th.tint }), mesas); this.disposables.push(strata);
      const dunes = this.scatter(low ? 25 : 60, 30, 900, 40, 70, true, () => rnd(80, 200) * 1.25).map(([x, z, , r]) => ({ p: [x, -0.4, z] as [number, number, number], s: [r / 1.25, rnd(8, 22), r / 1.25] as [number, number, number], ry: rnd(0, 6), color: new THREE.Color(0xd9ae72).multiplyScalar(rnd(0.9, 1.08)) }));
      const ripple = grainTex(128, 64, 1400, g => { for (let y = 4; y < 64; y += 7) { g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,.14)'; g.beginPath(); for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x * 0.2 + y) * 2); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath(); for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + 2 + Math.sin(x * 0.2 + y) * 2); g.stroke(); } });
      this.disposables.push(ripple);
      this.instanced(scaleUv(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 3, 1), mat({ color: 0xffffff, map: ripple }), dunes);
      const cg: THREE.BufferGeometry[] = [], green = new THREE.Color(0x4f7a3a);
      cg.push(boxGeo(0.9, 5, 0.9, 0, 2.5, 0, 0, green), boxGeo(2.2, 0.7, 0.7, 1.4, 2.4, 0, 0, green), boxGeo(0.7, 1.8, 0.7, 2.4, 3.2, 0, 0, green), boxGeo(2, 0.7, 0.7, -1.3, 3.2, 0, 0, green), boxGeo(0.7, 1.6, 0.7, -2.2, 3.9, 0, 0, green));
      const cactus = mergeGeometries(cg); cg.forEach(o => o.dispose());
      const spine = grainTex(32, 32, 160, g => { for (let x = 3; x < 32; x += 6) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 2, 32); g.fillStyle = 'rgba(230,240,190,.5)'; for (let y = 2; y < 32; y += 5) g.fillRect(x - 1, y, 1, 1); } });
      this.disposables.push(spine);
      this.instanced(cactus, mat({ vertexColors: true, map: spine }), this.scatter(low ? 70 : 160, 9, 160, 14, 8).map(([x, z]) => { const s = rnd(0.8, 1.6); return { p: [x, -0.4, z] as [number, number, number], s: [s, s, s] as [number, number, number], ry: rnd(0, 6) }; }));
      // 길가 군사 초소(FRONTLINE 사막 기지와 같은 공용 소품)
      this.outposts = buildOutposts(this.scene, t, low); this.disposables.push(this.outposts);
      // 전봇대와 전선(오른쪽 길가)
      const pole = 55, ps: Array<[number, number, number]> = [];
      for (let i = 0; i < t.n; i += Math.round(pole / t.ds)) { const off = hw + 9; ps.push([t.x[i] - t.tz[i] * off, Math.max(-0.4, t.y[i] - (off - hw - 1.5) / Math.max(6, t.y[i] * 2.4 + 4) * (t.y[i] + 0.4)), t.z[i] + t.tx[i] * off]); }
      this.instanced(new THREE.BoxGeometry(0.45, 11, 0.45), mat({ color: 0x5a4430 }), ps.map(p => ({ p: [p[0], p[1] + 5.5, p[2]] as [number, number, number] })));
      const wires: number[] = []; for (let k = 0; k < ps.length; k++) { const a = ps[k], b = ps[(k + 1) % ps.length]; for (const dy of [10.4, 9.6, 8.8]) wires.push(a[0], a[1] + dy, a[2], b[0], b[1] + dy, b[2]); }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); const wl = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2b2420 })); wl.frustumCulled = false; this.scene.add(wl); this.disposables.push(wg, wl.material as THREE.Material);
    }
    this.decoOn = false; if (sceneryKind !== 'forest') this.addBackdrop(quality);
  }

  /** 코스 둘레 원경 지형(능선·산맥)과 산기슭 숲 */
  private addBackdrop(quality: 'high' | 'standard' | 'low', crown?: THREE.BufferGeometry, trunk?: THREE.BufferGeometry): void {
    const b = buildBackdrop(this.track, this.theme, quality, crown, trunk); if (!b) return;
    this.scene.add(b.group); this.disposables.push(b);
  }

  resize(w: number, h: number): void { this.viewH = h; this.vw = w; this.vh = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }
  kick(power: number): void { this.shake = Math.min(1, this.shake + power); }
  punchFov(v: number): void { this.punch = Math.min(1.2, this.punch + v); }
  worldOf(r: Racer): THREE.Vector3 { return new THREE.Vector3(r.car.x, r.car.y, r.car.z); }

  update(race: RaceState, dt: number, wallHit: number): { speedFrac: number } {
    this.time += dt; if ((this.frame++ & 3) === 0) this.lod.update(this.camera.position); const p = race.player.car, t = this.track, speed = Math.abs(p.vf), sf = Math.min(1, speed / 74), bst = boosting(p);
    for (const pad of this.pads) pad.tex.offset.x -= dt * 1.4;
    this.outposts?.update(this.time);
    for (const ch of this.crew) { ch.state.time += dt; ch.update(dt); }
    // 차량 배치
    for (const v of this.cars) {
      const c = v.racer.car, sample = t.n > 0 ? ((c.idx % t.n) + t.n) % t.n : 0, pitchRoad = t.pitch[sample] || 0, accel = (c.vf - v.lastV) / Math.max(dt, 1e-4); v.lastV = c.vf;
      const roll = Math.max(-0.09, Math.min(0.09, -c.yawRate * c.vf * 0.0028)) + c.slip * -0.08, pitch = pitchRoad - Math.max(-0.04, Math.min(0.04, accel * 0.0012));
      const pose = carEuler(roll, c.h, pitch);
      const gone = v.racer.out !== undefined; v.group.visible = !gone; v.shadow.visible = !gone; if (gone) continue; // 녹아웃 탈락 차량은 코스에서 사라집니다
      v.group.position.set(c.x, c.y + 0.02, c.z); v.group.rotation.set(pose.x, pose.y, pose.z, pose.order); v.shadow.position.set(c.x, c.y + 0.05, c.z); v.shadow.rotation.y = -c.h;
      for (const wheel of v.wheels) wheel.rotation.z -= c.vf * dt / 0.42;
      const fl = boosting(c), len = fl ? 1.0 + Math.sin(this.time * 90 + v.racer.id) * 0.25 + Math.min(0.9, speed / 90) : 0.001;
      for (const f of v.flames) { f.scale.x += (len - f.scale.x) * Math.min(1, dt * 20); f.visible = fl || f.scale.x > 0.08; (f.material as THREE.MeshBasicMaterial).color.setHex(v.racer.player ? 0x6ec6ff : 0xffa14a); }
      if (fl && Math.random() < 0.9) this.sparks.emit(c.x - Math.cos(c.h) * 2.4, c.y + 0.5, c.z - Math.sin(c.h) * 2.4, -Math.cos(c.h) * 8 + rnd(-2, 2), rnd(0, 2), -Math.sin(c.h) * 8 + rnd(-2, 2), 0.35, 0.4, 0.8, 1);
      // 타이어: 드리프트·옆미끄러짐·출발 휠스핀에서 연기와 스키드 마크가 남습니다.
      const wheelspin = v.racer.player && race.phase === 'racing' && c.boostT > 0 && Math.abs(c.vf) < 30 && Math.abs(c.vf) > 1;
      const sliding = Math.abs(c.vf) > 14 && (c.drifting || Math.abs(c.slip) > 0.2), tire = c.drifting ? 1 : Math.min(1, Math.abs(c.slip) * 3.2);
      for (const s of [-1, 1]) {
        const bx = c.x - Math.cos(c.h) * 1.4 - Math.sin(c.h) * 0.9 * s * -1, bz = c.z - Math.sin(c.h) * 1.4 + Math.cos(c.h) * 0.9 * s * -1, w = s < 0 ? 0 : 1;
        if (sliding || wheelspin) {
          const k = wheelspin ? 0.8 : tire;
          if (Math.random() < 0.55 + 0.45 * k) this.smoke.emit(bx, c.y + 0.35, bz, rnd(-1.5, 1.5) - c.vx * 0.12, rnd(0.6, 2.4), rnd(-1.5, 1.5) - c.vz * 0.12, 0.7 + 0.5 * k, 0.62, 0.6, 0.66);
          if (c.drifting && Math.random() < 0.5) this.sparks.emit(bx, c.y + 0.2, bz, rnd(-4, 4) - c.vx * 0.1, rnd(1, 4), rnd(-4, 4) - c.vz * 0.1, 0.4, 1, 0.75, 0.3);
          this.skids.mark(v.racer.id * 2 + w, bx, c.y + 0.07, bz, Math.min(0.55, 0.22 + k * 0.4));
        } else this.skids.lift(v.racer.id * 2 + w);
      }
      // 벽을 긁으며 달리면 불꽃이 계속 튑니다.
      if (v.racer.player && Math.abs(c.lat) > t.halfWidth - 1.65 && Math.abs(c.vf) > 22) {
        const sgn = Math.sign(c.lat) || 1, px = -t.tz[sample] * sgn, pz = t.tx[sample] * sgn;
        for (let k = 0; k < 3; k++) this.sparks.emit(c.x + px * 1.05, c.y + rnd(0.2, 0.7), c.z + pz * 1.05, -c.vx * 0.2 + rnd(-3, 3) - px * 3, rnd(1, 5), -c.vz * 0.2 + rnd(-3, 3) - pz * 3, 0.45, 1, 0.78, 0.3);
      }
      // 슬립스트림: 앞차 뒤에 붙으면 하늘색 바람 줄기가 차 옆으로 빨려 들어갑니다.
      if (c.draft > 0.35 && Math.random() < c.draft) for (const s of [-1, 1]) {
        const bx = c.x + Math.cos(c.h) * 3 - Math.sin(c.h) * 1.5 * s * -1, bz = c.z + Math.sin(c.h) * 3 + Math.cos(c.h) * 1.5 * s * -1;
        this.sparks.emit(bx, c.y + rnd(0.3, 1.3), bz, c.vx * 0.2, 0, c.vz * 0.2, 0.25, 0.7, 0.9, 1);
      }
      if (v.racer.player && wallHit > 0) for (let k = 0; k < 18; k++) this.sparks.emit(c.x, c.y + 0.5, c.z, rnd(-9, 9), rnd(1, 7), rnd(-9, 9), 0.5, 1, 0.8, 0.35);
    }
    this.skids.flush(); this.sparks.update(dt, 14, this.camera.position, 7); this.smoke.update(dt, -1.5, this.camera.position, 10);
    if (this.theme.rain) {
      const cp = this.camera.position, n = Math.round(34 * this.theme.rain * Math.min(2, dt * 60));
      for (let i = 0; i < n; i++) this.rainFx.emit(cp.x + rnd(-38, 38), cp.y + rnd(-1, 20), cp.z + rnd(-38, 38), rnd(-3, 3), rnd(-44, -36), rnd(-3, 3), 0.45, 0.62, 0.74, 0.88);
      this.rainFx.update(dt, 0);
    }
    // 카메라: 속도에 비례해 시야각만 넓히고, 위치 보간에는 흔들림을 넣지 않습니다.
    const hd = p.h; if (!this.camInit) { this.camH = hd; this.camInit = true; }
    this.camH += wrapAngle(hd - this.camH) * Math.min(1, dt * (p.drifting ? 3.2 : 7));
    this.punch = Math.max(0, this.punch - dt * 1.8); this.shake = Math.max(0, this.shake - dt * 2.4);
    const lift = this.chaseLift, narrow = Math.max(0, 1 - this.camera.aspect), dist = 7.4 + sf * 1.6 + (bst ? 0.9 : 0) + lift * 0.8 + narrow * 3.2, height = 2.55 + sf * 0.3 + lift * (this.viewH < 520 ? 1.55 : 1.05);
    const ahead = 8.2 - lift * 1.5, cx = p.x - Math.cos(this.camH) * dist, cz = p.z - Math.sin(this.camH) * dist, cy = p.y + height;
    stepChaseAnchor(this.camAnchor, cx, cy, cz, dt, sf, bst ? BOOST_LAG : 1);
    const sh = chaseShake(sf, bst, this.shake), tt = this.time;
    this.camera.position.set(this.camAnchor.x + Math.sin(tt * 53) * sh, this.camAnchor.y + Math.sin(tt * 61 + 1) * sh, this.camAnchor.z + Math.sin(tt * 47 + 2) * sh);
    const lookI = t.n > 0 ? ((p.idx % t.n) + t.n) % t.n : 0;
    this.camera.lookAt(p.x + Math.cos(this.camH) * ahead, p.y + 1.15 + lift * 0.35 + (t.pitch[lookI] || 0) * 8, p.z + Math.sin(this.camH) * ahead);
    const grind = Math.abs(p.lat) > t.halfWidth - 1.65 && speed > 22 ? 1 : 0, rum = chaseRumble(sf, bst, grind);
    this.camera.rotateZ(chaseRoll(p.yawRate, p.slip) + Math.sin(tt * 71) * rum); this.camera.rotateX(Math.sin(tt * 83 + 1.3) * rum * 0.8);
    const targetFov = chaseFov(sf, bst, this.punch); this.fov += (targetFov - this.fov) * Math.min(1, dt * fovRate(targetFov, this.fov)); this.camera.fov = this.fov; this.camera.updateProjectionMatrix();
    // 지면·태양광이 카메라를 따라감
    this.ground.position.x = Math.round(this.camera.position.x / 60) * 60; this.ground.position.z = Math.round(this.camera.position.z / 60) * 60;
    this.scene.getObjectByName('sky')?.position.copy(this.camera.position);
    this.sun.target.position.set(p.x, p.y, p.z); this.sun.position.set(p.x + this.sunDir.x * 120, p.y + this.sunDir.y * 120, p.z + this.sunDir.z * 120);
    this.updateGhost(race); this.post?.setSpeedBlur(this.reducedMotion ? 0 : Math.max(0, (sf - 0.42) * 0.1 + (bst ? 0.04 : 0)));
    this.updateStartLights(race);
    if (!this.reducedMotion) this.updateStreaks(dt, p, p.vx, p.vz, speed, bst);
    if (this.post) this.post.render(dt); else this.renderer.render(this.scene, this.camera);
    this.adaptive.tick();
    return { speedFrac: sf };
  }

  /** 공기 흐름: 차 앞쪽에서 생긴 바람 줄기가 차체 옆·지붕 위를 스치며 차 뒤로 빠르게 흘러갑니다. 줄기 위치는 모두 차 기준(앞뒤·좌우·높이)이라 중심은 항상 차이고, 월드에 고정되지 않습니다. */
  private updateStreaks(dt: number, car: { x: number; y: number; z: number }, vx: number, vz: number, speed: number, bst: boolean): void {
    const n = this.streakSeed.length / 3, mat = this.streak.material as THREE.LineBasicMaterial;
    const target = Math.min(1, Math.max(0, (speed - 30) / 40)) * (bst ? 1 : 0.7); mat.opacity += (target * 0.85 - mat.opacity) * Math.min(1, dt * 6);
    const dx = speed > 1 ? vx / speed : 1, dz = speed > 1 ? vz / speed : 0;
    // 차를 기준으로 뒤로 흐르는 속도(m/s): 달리는 속도보다 약간 빨라 바람이 차를 앞질러 스치는 느낌을 줍니다. 길이는 속도에 비례.
    const flow = 14 + speed * 0.95, len = Math.min(5.5, 1 + speed * (bst ? 0.07 : 0.045)), tailEnd = -3.4;
    // streakSeed: [차 기준 앞(+)/뒤(−) m, 좌우 m, 높이 m]. 좌우가 0 이면 아직 놓지 않은 줄기입니다.
    for (let i = 0; i < n; i++) {
      let ahead = this.streakSeed[i * 3], lat = this.streakSeed[i * 3 + 1], h = this.streakSeed[i * 3 + 2];
      ahead -= flow * dt * (0.85 + (i % 5) * 0.08);
      const fresh = lat === 0;
      if (fresh || ahead < tailEnd) {
        // 앞코 앞쪽에서 새로 생겨 차체 옆(1.2~3.4m)이나 지붕 위를 지나갑니다. 처음에는 차 전체 길이에 흩어 놓습니다.
        const roof = Math.random() < 0.25;
        lat = roof ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.15, 0.9) : (Math.random() < 0.5 ? -1 : 1) * rnd(1.15, 2.9);
        h = roof ? rnd(1.3, 1.9) : rnd(0.25, 1.5); ahead = fresh ? rnd(tailEnd, 6.5) : rnd(2.8, 6.5);
      }
      this.streakSeed[i * 3] = ahead; this.streakSeed[i * 3 + 1] = lat; this.streakSeed[i * 3 + 2] = h;
      // 머리(뒤쪽 끝)는 ahead, 꼬리(앞쪽)는 ahead+len. 차 뒤 tailEnd 보다 더 뒤로 나가지 않게 자릅니다.
      const head = Math.max(tailEnd, ahead), tail = Math.max(head, ahead + len);
      const bx = car.x - dz * lat, bz = car.z + dx * lat, y = car.y + h;
      this.streakPos.set([bx + dx * head, y, bz + dz * head, bx + dx * tail, y, bz + dz * tail], i * 6);
    }
    (this.streak.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  /** HUD 용: 화면 속도감 수치(0..1.4) */
  static intensity(race: RaceState): number { return Math.min(1.4, kmh(race.player.car) / 270 + (boosting(race.player.car) ? 0.25 : 0)); }

  dispose(): void {
    const seen = new Set<object>();
    const once = (d: { dispose(): void } | null | undefined): void => { if (!d || seen.has(d)) return; seen.add(d); d.dispose(); };
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) once(m.geometry);
      const mats = m.material == null ? [] : Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) { once(mat); const maps = mat as THREE.MeshBasicMaterial; once(maps.map); if (maps.alphaMap) once(maps.alphaMap); }
    });
    for (const d of this.disposables) once(d);
    this.carEnv?.dispose(); this.post?.dispose(); this.renderer.dispose();
  }
}
