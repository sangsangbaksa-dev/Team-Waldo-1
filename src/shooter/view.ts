// ZERO ZONE — 3D 장면: 지형·건물·나무·전리품·병사·자기장 벽·1인칭 총과 사격 효과. 경기 상태(Match)를 읽기만 합니다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PLAYER, WEAPONS, makeRng } from './config';
import { bake, instantiate } from '../city/models';
import type { Match, MatchEvent, Player } from './sim';
import type { ShooterAssets, Soldier } from './assets';
import { SOLDIER_KINDS } from './assets';
import { gunStats } from './attachments';
import { disposeModel, makeModularGun, makePart, mountPoints } from './gunmodel';
import { groundAt, terrainHeight, type Box, type Loot } from './world';
import { concreteTexture, crateTexture, dirtTexture, floorTexture, glowTexture, groundTexture, makeSky, wallTexture } from './textures';

export type Quality = 'high' | 'standard' | 'low';
const HIP = 0.9, KNEE = 0.44, LEG_Z = 0.11, AIM = 1.42;
const LOOT_COLOR: Record<string, number> = { weapon: 0xeaf6ff, ammo: 0xffa53a, medkit: 0x52f08a, armor: 0x5aa8ff, helmet: 0xd9b84a, attachment: 0xbac995 };

const rngOf = (seed: number): (() => number) => makeRng(seed);
/** 부드러운 2차원 값 잡음(지형 색 변화용) */
function noise2(seed: number): (x: number, z: number) => number {
  const r = rngOf(seed), grid = new Float32Array(64 * 64); for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (x: number, z: number): number => grid[((z & 63) << 6) | (x & 63)];
  return (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz); return (at(xi, zi) * (1 - sx) + at(xi + 1, zi) * sx) * (1 - sz) + (at(xi, zi + 1) * (1 - sx) + at(xi + 1, zi + 1) * sx) * sz; };
}

/** 상자(월드 좌표)를 만들고 UV 를 월드 위치 기준(3.2m 당 한 장)으로 계산합니다. 벽 질감이 이어지고 창 높이가 맞습니다. */
function worldBox(b: Box, tile = 3.2): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0); g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, x / tile, z / tile); else if (nx > 0.5) uv.setXY(i, z / tile, y / tile); else uv.setXY(i, x / tile, y / tile);
  }
  return g;
}

interface Rig { root: THREE.Group; torsoJ: THREE.Group; legs: THREE.Group[]; shins: THREE.Group[]; armL: THREE.Group | null; armR: THREE.Group | null; flash: THREE.Sprite; aim: number }
interface Fx { mesh: THREE.Mesh; life: number; max: number }

export class ShooterView {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(78, 1, 0.08, 1400);
  private vmScene = new THREE.Scene(); private vmCam = new THREE.PerspectiveCamera(64, 1, 0.5, 200);
  private weaponEnvironment: THREE.WebGLRenderTarget;
  private sun: THREE.DirectionalLight; private glow = glowTexture(); private rigs = new Map<number, Rig>(); private lootNodes = new Map<number, THREE.Object3D>();
  private zoneWall: THREE.Mesh; private zoneNext: THREE.Mesh; private tracers: Fx[] = []; private sparks: THREE.Points; private sparkData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; r: number; g: number; b: number }[] = [];
  private vm: THREE.Object3D | null = null; private vmId = ''; private vmSwap = 0; private vmFlash: THREE.Sprite; private bob = 0; private shake = 0; private time = 0;
  private mats = new Map<string, THREE.Material>(); private tmpCol = new THREE.Color(); private beams: THREE.InstancedMesh;
  private camPos = new THREE.Vector3(); private water: THREE.Mesh | null = null; private eyeNow = PLAYER.eye; private plane: THREE.Group | null = null; private chutes = new Map<number, THREE.Object3D>(); fov = 78; frames = 0;
  private chuteGeo: THREE.BufferGeometry | null = null; private chuteLines: THREE.BufferGeometry | null = null; private chuteTopY = 0; private chuteHands = new THREE.Group(); private vmShown = false;

  constructor(readonly canvas: HTMLCanvasElement, readonly match: Match, private assets: ShooterAssets | null, readonly quality: Quality) {
    const hi = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(hi ? 2 : quality === 'standard' ? 1.5 : 1, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = hi; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05; this.renderer.autoClear = false;
    const sc = this.scene, sunDir = new THREE.Vector3(0.55, 0.62, 0.38);
    sc.fog = new THREE.FogExp2(0xd6cdb8, 0.0034); sc.add(makeSky(sunDir));
    sc.add(new THREE.HemisphereLight(0xcfe2ff, 0x84764f, 1.15));
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.9); this.sun.position.copy(sunDir).multiplyScalar(120); sc.add(this.sun, this.sun.target);
    if (hi) { this.sun.castShadow = true; const s = this.sun.shadow; s.mapSize.set(2048, 2048); s.camera.left = s.camera.bottom = -62; s.camera.right = s.camera.top = 62; s.camera.near = 20; s.camera.far = 320; s.bias = -0.0004; s.normalBias = 0.05; }
    this.buildGround(); this.buildBuildings(); this.buildScatter();
    this.beams = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 7, 8, 1, true), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }), 400);
    this.beams.count = 0; this.beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3); this.beams.frustumCulled = false; sc.add(this.beams);
    // 자기장 벽: 파란 반투명 원통과 다음 원을 알리는 바닥 고리
    this.zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 90, 128, 1, true), new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec3 vP; varying float vH; void main(){ vP = position; vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; varying float vH; uniform float t;
        void main(){ float a = atan(vP.z, vP.x); float band = 0.5 + 0.5 * sin(a * 90.0 + vH * 0.35 - t * 1.4); float rows = 0.5 + 0.5 * sin(vH * 0.9 - t * 2.2);
          float fade = smoothstep(45.0, -5.0, vH) * 0.85 + 0.12; vec3 col = mix(vec3(0.08, 0.35, 1.0), vec3(0.45, 0.85, 1.0), band * rows); gl_FragColor = vec4(col, (0.18 + 0.2 * band * rows) * fade); }`,
    }));
    this.zoneWall.position.y = 45; this.zoneWall.frustumCulled = false; sc.add(this.zoneWall);
    this.zoneNext = new THREE.Mesh(new THREE.RingGeometry(0.992, 1, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    this.zoneNext.rotation.x = -Math.PI / 2; this.zoneNext.position.y = 0.12; this.zoneNext.frustumCulled = false; sc.add(this.zoneNext);
    // 불꽃 입자
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3)); sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(240 * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: this.glow, sizeAttenuation: true })); this.sparks.frustumCulled = false; sc.add(this.sparks);
    // 1인칭 총 장면
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
    this.weaponEnvironment = pmrem.fromScene(room, 0.04); this.vmScene.environment = this.weaponEnvironment.texture; room.dispose(); pmrem.dispose();
    this.vmScene.add(new THREE.HemisphereLight(0xdbe6ff, 0x6a5a50, 1.9)); const vs = new THREE.DirectionalLight(0xffe2b8, 2.4); vs.position.set(2, 4, 3); this.vmScene.add(vs);
    this.vmFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd98a, blending: THREE.AdditiveBlending, depthTest: false, transparent: true })); this.vmFlash.scale.set(0.3, 0.3, 1); this.vmFlash.visible = false; this.vmFlash.renderOrder = 10;
    this.buildChuteHands();
    for (const p of match.players) this.makeRig(p);
  }

  /** 낙하산을 탄 동안 1인칭 화면에 보이는 두 팔: 위로 뻗어 라이저(줄)를 잡고 있습니다. */
  private buildChuteHands(): void {
    const sleeve = new THREE.MeshLambertMaterial({ color: 0x4b5a2e }), glove = new THREE.MeshLambertMaterial({ color: 0x24262a }), cord = new THREE.LineBasicMaterial({ color: 0xe8e4d8 });
    for (const side of [-1, 1]) {
      const hand = new THREE.Vector3(side * 3.6, 0.6, -10), from = new THREE.Vector3(side * 6.6, -8.5, -9), dir = hand.clone().sub(from), len = dir.length();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, len, 10), sleeve); arm.position.copy(from).addScaledVector(dir, 0.5); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), glove); fist.position.copy(hand);
      const riser = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([hand.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(side * 1.6, 9, -12)]), cord);
      this.chuteHands.add(arm, fist, riser);
    }
    this.chuteHands.visible = false; this.vmScene.add(this.chuteHands);
  }

  /** 줄무늬 캐노피와 12가닥 서스펜션 라인을 가진 낙하산. 원점이 멜빵(어깨) 위치입니다. */
  private makeChute(color: number): THREE.Group {
    const R = 3.6, L = 4.7, THETA = Math.PI / 2.15, W = 24, H = 10;
    if (!this.chuteGeo || !this.chuteLines) {
      const g = new THREE.SphereGeometry(R, W, H, 0, Math.PI * 2, 0, THETA), n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const k = Math.floor((i % (W + 1)) / 2) % 2 === 0 ? 1 : 0.42; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); this.chuteGeo = g;
      const rr = R * Math.sin(THETA), pts: THREE.Vector3[] = [];
      for (let i = 0; i < 12; i++) { const phi = (i * 2 / W) * Math.PI * 2; pts.push(new THREE.Vector3(-Math.cos(phi) * rr, L, Math.sin(phi) * rr), new THREE.Vector3(0, 0, 0)); }
      this.chuteLines = new THREE.BufferGeometry().setFromPoints(pts); this.chuteTopY = L - R * Math.cos(THETA) * 0.62;
    }
    const cg = new THREE.Group(), dome = new THREE.Mesh(this.chuteGeo, this.mat(`chute${color}`, () => new THREE.MeshLambertMaterial({ color, vertexColors: true, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.12 })));
    dome.scale.y = 0.62; dome.position.y = this.chuteTopY; dome.castShadow = true; cg.add(dome);
    cg.add(new THREE.LineSegments(this.chuteLines, this.mat('chuteLine', () => new THREE.LineBasicMaterial({ color: 0xe8e4d8 })))); cg.rotation.order = 'YXZ'; return cg;
  }
  /** 낙하산 위치·흔들림. 펼친 동안만 보입니다. */
  private placeChute(p: Player): void {
    const ch = this.chutes.get(p.id); if (!ch) return; ch.visible = p.alive && p.air === 3; if (!ch.visible) return;
    ch.position.set(p.x, p.y + 1.5, p.z); ch.rotation.set(Math.sin(this.time * 1.1 + p.id) * 0.04, -p.yaw, Math.sin(this.time * 0.9 + p.id * 2) * 0.05 - Math.min(0.2, p.speed * 0.01));
  }

  private mat(key: string, make: () => THREE.Material): THREE.Material { let m = this.mats.get(key); if (!m) { m = make(); this.mats.set(key, m); } return m; }

  // ---------- 지형 ----------
  private buildGround(): void {
    const map = this.match.map, t = map.terrain, half = map.half, ext = half + 140, STEP = 4, segs = Math.ceil((ext * 2) / STEP), size = segs * STEP, geo = new THREE.PlaneGeometry(size, size, segs, segs); geo.rotateX(-Math.PI / 2);
    const n1 = noise2(this.match.seed), n2 = noise2(this.match.seed + 9), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const green = new THREE.Color(0.9, 1.0, 0.78), dry = new THREE.Color(1.15, 0.98, 0.7), dark = new THREE.Color(0.66, 0.8, 0.58), sand = new THREE.Color(1.25, 1.12, 0.84), rock = new THREE.Color(0.92, 0.9, 0.86), snow = new THREE.Color(1.4, 1.42, 1.5), mud = new THREE.Color(0.8, 0.72, 0.56);
    const W = t.water;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = groundAt(t, x, z), a = n1(x / 90 + 32, z / 90 + 32), b = n2(x / 28 + 32, z / 28 + 32);
      const slope = Math.abs(groundAt(t, x + 3, z) - groundAt(t, x - 3, z)) + Math.abs(groundAt(t, x, z + 3) - groundAt(t, x, z - 3));
      c.copy(green).lerp(dry, Math.max(0, a - 0.4) * 3).lerp(dark, Math.max(0, 0.5 - b) * 2.2);
      c.lerp(sand, 1 - Math.min(1, Math.max(0, (y - W) / 1.1))).lerp(mud, Math.max(0, 1 - Math.abs(y - W - 0.2) * 1.4) * 0.35);
      c.lerp(rock, Math.min(1, Math.max(0, (slope - 4) / 5))).lerp(snow, Math.min(1, Math.max(0, (y - 38) / 12)) * 0.9);
      col.set([c.r, c.g, c.b], i * 3); pos.setY(i, y);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const tex = groundTexture(); tex.repeat.set(size / 6, size / 6);
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true })); ground.receiveShadow = true; this.scene.add(ground);
    // 물: 강과 호수가 채워지는 높이에 반투명 면 하나
    const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.72, roughness: 0.18, metalness: 0.15, depthWrite: false }));
    water.rotation.x = -Math.PI / 2; water.position.y = W; this.water = water; this.scene.add(water);
    // 마을을 잇는 흙길: 땅 높이를 따라가도록 짧은 조각으로 나눕니다
    const dirt = dirtTexture(), cs = map.compounds;
    for (const [ax, az, bx, bz] of map.roads) {
      const len = Math.hypot(bx - ax, bz - az), pieces = Math.max(1, Math.ceil(len / 24)), ang = -Math.atan2(bz - az, bx - ax);
      for (let k = 0; k < pieces; k++) {
        const t0 = k / pieces, t1 = (k + 1) / pieces, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2, d = len / pieces, tx = dirt.clone(); tx.repeat.set(d / 4, 1); tx.needsUpdate = true;
        const road = new THREE.Mesh(new THREE.PlaneGeometry(d + 0.5, 4.6), new THREE.MeshLambertMaterial({ map: tx, color: 0xd9cdb4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        const h0 = groundAt(t, ax + (bx - ax) * t0, az + (bz - az) * t0), h1 = groundAt(t, ax + (bx - ax) * t1, az + (bz - az) * t1);
        road.rotation.order = 'YXZ'; road.rotation.set(-Math.PI / 2 + Math.atan2(h1 - h0, d) * 0, ang, 0); road.position.set(mx, (h0 + h1) / 2 + 0.07, mz); road.receiveShadow = true; this.scene.add(road);
      }
    }
    // 마을 바닥(콘크리트 광장). 마을은 평평하게 골라져 있습니다.
    for (const c0 of cs) {
      const ptex = c0.kind === 'farm' || c0.kind === 'ruins' ? dirtTexture() : concreteTexture(); ptex.repeat.set((c0.r + 3) / 3, (c0.r + 3) / 3);
      const m = new THREE.Mesh(new THREE.CircleGeometry(c0.r + 3, 40), new THREE.MeshLambertMaterial({ map: ptex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.rotation.x = -Math.PI / 2; m.position.set(c0.x, c0.g + 0.06, c0.z); m.receiveShadow = true; this.scene.add(m);
    }
  }

  /** 맞배지붕: 용마루가 긴 변을 따라가는 삼각기둥 */
  private prism(w: number, d: number, h: number, alongX: boolean, x: number, y: number, z: number): THREE.BufferGeometry {
    const hw = w / 2, hd = d / 2, g = new THREE.BufferGeometry(), v: number[] = [];
    const quad = (a: number[], b: number[], c: number[], e: number[]): void => { v.push(...a, ...b, ...c, ...a, ...c, ...e); }, tri = (a: number[], b: number[], c: number[]): void => { v.push(...a, ...b, ...c); };
    if (alongX) { const r0 = [-hw, h, 0], r1 = [hw, h, 0]; quad([-hw, 0, -hd], [hw, 0, -hd], r1, r0); quad([hw, 0, hd], [-hw, 0, hd], r0, r1); tri([-hw, 0, hd], [-hw, 0, -hd], r0); tri([hw, 0, -hd], [hw, 0, hd], r1); }
    else { const r0 = [0, h, -hd], r1 = [0, h, hd]; quad([-hw, 0, hd], [-hw, 0, -hd], r0, r1); quad([hw, 0, -hd], [hw, 0, hd], r1, r0); tri([-hw, 0, -hd], [hw, 0, -hd], r0); tri([hw, 0, hd], [-hw, 0, hd], r1); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); g.translate(x, y, z); return g;
  }

  private buildBuildings(): void {
    const map = this.match.map, byTex: THREE.BufferGeometry[][] = [[], [], [], []], by = new Map<string, THREE.BufferGeometry[]>();
    const put = (k: string, g: THREE.BufferGeometry): void => { const l = by.get(k); if (l) l.push(g); else by.set(k, [g]); };
    for (const b of map.boxes) {
      switch (b.kind) {
        case 'wall': byTex[b.tex % 4].push(worldBox(b)); break;
        case 'crate': put('crate', worldBox(b, 1.2)); break;
        case 'slab': put(b.tex === 0 ? 'floor' : 'concrete', worldBox(b, 3)); break;
        case 'step': put('concrete', worldBox(b, 2)); break;
        case 'roof': put('roof', worldBox(b)); break;
        case 'rail': case 'post': put('rail', worldBox(b)); break;
        case 'hay': put('hay', worldBox(b, 1.2)); break;
        case 'sandbag': put('sand', worldBox(b, 1)); break;
        case 'container': put(`cont${b.tex % 4}`, worldBox(b, 3)); break;
        default: break;
      }
    }
    byTex.forEach((list, i) => {
      if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshLambertMaterial({ map: wallTexture(i) }));
      m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    });
    const mats: Record<string, THREE.Material> = {
      crate: new THREE.MeshLambertMaterial({ map: crateTexture() }), floor: new THREE.MeshLambertMaterial({ map: floorTexture() }), concrete: new THREE.MeshLambertMaterial({ map: concreteTexture() }),
      roof: new THREE.MeshLambertMaterial({ color: 0x4d5258 }), rail: new THREE.MeshLambertMaterial({ color: 0x6d5a40 }), hay: new THREE.MeshLambertMaterial({ color: 0xc9a84a }), sand: new THREE.MeshLambertMaterial({ color: 0xa89868 }),
      cont0: new THREE.MeshLambertMaterial({ color: 0x9c3b2e }), cont1: new THREE.MeshLambertMaterial({ color: 0x2f5f8c }), cont2: new THREE.MeshLambertMaterial({ color: 0x4d7a3a }), cont3: new THREE.MeshLambertMaterial({ color: 0xc58b2a }),
    };
    for (const [k, list] of by) { const m = new THREE.Mesh(mergeGeometries(list, false), mats[k]); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
    // 맞배지붕, 창문 유리, 옥상 설비
    const gables: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], units: THREE.BufferGeometry[] = [], r = rngOf(this.match.seed + 3);
    for (const b of map.buildings) {
      const top = b.g + b.h + 0.25;
      if (b.roof === 'gable') gables.push(this.prism(b.w + 0.6, b.d + 0.6, Math.min(b.w, b.d) * 0.32, b.w >= b.d, b.x, top, b.z));
      else if (b.roof === 'flat' && b.kind !== 'shed' && r() < 0.7) { const g = new THREE.BoxGeometry(1.4, 0.9, 1.1); g.translate(b.x + (r() - 0.5) * b.w * 0.5, top + 0.45, b.z + (r() - 0.5) * b.d * 0.5); units.push(g); }
      for (let i = 0; i + 5 < b.windows.length; i += 6) {
        const [x, y, z, axis, w, h] = b.windows.slice(i, i + 6), g = axis === 0 ? new THREE.BoxGeometry(w, h, 0.08) : new THREE.BoxGeometry(0.08, h, w); g.translate(x, y, z); glass.push(g);
      }
    }
    if (gables.length) { const m = new THREE.Mesh(mergeGeometries(gables, false), new THREE.MeshLambertMaterial({ color: 0x7a3f2e, side: THREE.DoubleSide })); m.castShadow = true; this.scene.add(m); }
    if (units.length) { const m = new THREE.Mesh(mergeGeometries(units, false), new THREE.MeshLambertMaterial({ color: 0xb6babd })); m.castShadow = true; this.scene.add(m); }
    if (glass.length) this.scene.add(new THREE.Mesh(mergeGeometries(glass, false), new THREE.MeshStandardMaterial({ color: 0x8fb4cc, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.4, depthWrite: false })));
  }

  private buildScatter(): void {
    const map = this.match.map, r = rngOf(this.match.seed + 5), d = new THREE.Object3D();
    // 풀 다발: 가는 잎 여러 장을 부채꼴로 세운 작은 덤불을 들판에 뿌립니다
    {
      const pos: number[] = [], col: number[] = [], base = new THREE.Color(0x58742c), tip = new THREE.Color(0xc4d47c), rr = rngOf(91);
      for (let b = 0; b < 9; b++) {
        const a = rr() * Math.PI * 2, off = 0.05 + rr() * 0.14, ox = Math.cos(a) * off, oz = Math.sin(a) * off, lean = 0.1 + rr() * 0.2, h = 0.24 + rr() * 0.26, w = 0.035 + rr() * 0.025, px = -Math.sin(a), pz = Math.cos(a);
        for (const [x, y, c, l] of [[-w, 0, 0, 0], [w, 0, 0, 0], [0, h, 1, lean]] as const) { pos.push(ox + px * x + Math.cos(a) * l, y, oz + pz * x + Math.sin(a) * l); const k = new THREE.Color().copy(base).lerp(tip, c); col.push(k.r, k.g, k.b); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      const n = this.quality === 'low' ? 3000 : map.mode === 'br' ? 22000 : 5000, mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2b3618 }), n); let k = 0;
      for (let tries = 0; k < n && tries < n * 3; tries++) {
        const x = (r() * 2 - 1) * (map.half + 20), z = (r() * 2 - 1) * (map.half + 20); if (map.compounds.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2)) continue;
        const gy = terrainHeight(this.match.map, x, z);
        d.position.set(x, gy, z); d.rotation.set(0, r() * 6.28, 0); d.scale.setScalar(0.8 + r() * 0.7); d.updateMatrix(); mesh.setMatrixAt(k++, d.matrix);
      }
      mesh.count = k; mesh.receiveShadow = false; this.scene.add(mesh);
    }
    // 바위
    if (map.rocks.length) {
      const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, n = noise2(3);
      for (let i = 0; i < p.count; i++) { const k = 0.78 + 0.4 * n(p.getX(i) * 2 + 20, p.getZ(i) * 2 + p.getY(i) * 2 + 20); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.9, p.getZ(i) * k); }
      g.computeVertexNormals();
      const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x8d8a82, flatShading: true }), map.rocks.length);
      map.rocks.forEach((k, i) => { const gy = terrainHeight(this.match.map, k.x, k.z); d.position.set(k.x, gy + k.sy * 0.28, k.z); d.rotation.set(0, k.ry, 0); d.scale.set(k.sx, k.sy, k.sz); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); mesh.setColorAt(i, this.tmpCol.setScalar(0.8 + r() * 0.4)); });
      mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
    }
    // 나무: 모델이 있으면 Blender 나무, 없으면 단순한 원뿔
    for (const pine of [false, true]) {
      const list = map.trees.filter(t => t.pine === pine); if (!list.length) continue;
      const tpl = this.assets?.props[pine ? 'tree_pine' : 'tree_round'], baked = tpl ? bake(tpl) : null; let geos: Array<[THREE.BufferGeometry, THREE.Material]> = [];
      if (baked) {
        const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
        for (const part of [baked.fixed, baked.team, baked.skin]) if (part) geos.push([part, lam]);
      } else {
        const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 6); trunk.translate(0, 1.5, 0); const crown = new THREE.ConeGeometry(1.8, 5, 8); crown.translate(0, 5, 0);
        geos = [[trunk, new THREE.MeshLambertMaterial({ color: 0x5b4126 })], [crown, new THREE.MeshLambertMaterial({ color: pine ? 0x2c5a35 : 0x4f7a37 })]];
      }
      let top = 1; if (baked) { const bb = new THREE.Box3(); for (const [g] of geos) { g.computeBoundingBox(); bb.union(g.boundingBox!); } top = Math.max(0.5, bb.max.y); }
      for (const [g, m] of geos) {
        const mesh = new THREE.InstancedMesh(g, m, list.length);
        list.forEach((t, i) => { const h = (baked ? (pine ? 9 : 7.5) / top : 1) * t.s; const gy = terrainHeight(this.match.map, t.x, t.z); d.position.set(t.x, gy, t.z); d.rotation.set(0, r() * 6.28, 0); d.scale.setScalar(h); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); });
        mesh.castShadow = true; mesh.receiveShadow = false; this.scene.add(mesh);
      }
    }
  }

  // ---------- 병사 ----------
  private partGroup(b: Soldier['body'], team: number, skin: number): THREE.Group {
    const g = new THREE.Group(), add = (geo: THREE.BufferGeometry | null, m: THREE.Material): void => { if (!geo) return; const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; g.add(mesh); };
    add(b.fixed, this.mat('fixed', () => new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x23262b }))); add(b.team, this.mat(`team${team}`, () => new THREE.MeshLambertMaterial({ vertexColors: true, color: team })));
    add(b.skin, this.mat(`skin${skin}`, () => new THREE.MeshLambertMaterial({ vertexColors: true, color: skin }))); add(b.glow, this.mat('glow', () => new THREE.MeshBasicMaterial({ vertexColors: true })));
    return g;
  }
  private makeRig(p: Player): void {
    const root = new THREE.Group(), torsoJ = new THREE.Group(), torso = new THREE.Group(), legs: THREE.Group[] = [], shins: THREE.Group[] = []; let armL: THREE.Group | null = null, armR: THREE.Group | null = null;
    const s = this.assets?.soldiers[SOLDIER_KINDS[p.id % SOLDIER_KINDS.length]];
    if (s) {
      torsoJ.position.y = HIP; torso.position.y = -HIP; torsoJ.rotation.order = 'ZYX'; torsoJ.add(torso); root.add(torsoJ); torso.add(this.partGroup(s.body, p.color, p.skin));
      for (const side of [-1, 1]) {
        const lg = new THREE.Group(); lg.position.set(0, HIP, side * LEG_Z); lg.add(this.partGroup(s.leg, p.color, p.skin)); legs.push(lg);
        if (s.shin) { const sg = new THREE.Group(); sg.position.y = -KNEE; sg.add(this.partGroup(s.shin, p.color, p.skin)); lg.add(sg); shins.push(sg); } root.add(lg);
      }
      if (s.armL) { armL = new THREE.Group(); armL.position.copy(s.armL.pivot); armL.add(this.partGroup(s.armL.geo, p.color, p.skin)); torso.add(armL); }
      if (s.armR) { armR = new THREE.Group(); armR.position.copy(s.armR.pivot); armR.add(this.partGroup(s.armR.geo, p.color, p.skin)); torso.add(armR); }
    } else { // 모델을 못 받았을 때의 단순한 병사
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: p.color })); body.position.y = 1.0; body.castShadow = true; root.add(body);
    }
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd98a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); flash.scale.set(0.8, 0.8, 1); flash.visible = false; root.add(flash);
    root.visible = false; this.scene.add(root); this.rigs.set(p.id, { root, torsoJ, legs, shins, armL, armR, flash, aim: 0 });
  }
  private poseRig(p: Player, dt: number): void {
    const rig = this.rigs.get(p.id)!, amp = Math.min(1, p.speed / 3.2), run = Math.min(1, Math.max(0, (p.speed - 4.6) / 2.6)), ph = p.walk * 1.35, sn = Math.sin(ph), cs = Math.cos(ph);
    const gy = p.y;
    rig.root.position.set(p.x, gy + Math.abs(sn) * amp * 0.04 * (p.grounded ? 1 : 0), p.z); rig.root.rotation.set(0, -p.yaw, 0); rig.root.scale.set(1, p.crouch ? 0.72 : 1, 1);
    if (p.air === 2) { rig.root.rotation.set(0, -p.yaw, 1.35); rig.root.position.y = gy + 0.9; }
    rig.torsoJ.rotation.z = -(0.04 * amp + 0.1 * run); rig.torsoJ.rotation.y = -sn * 0.07 * amp;
    rig.legs.forEach((l, i) => { const side = i === 0 ? -1 : 1; l.rotation.z = sn * side * (0.5 + 0.2 * run) * amp + 0.12 * run; const sh = rig.shins[i]; if (sh) sh.rotation.z = -amp * (0.12 + (0.6 + 0.5 * run) * Math.max(0, cs * side)); });
    rig.aim += (1 - rig.aim) * Math.min(1, dt * 8);
    if (rig.armR) rig.armR.rotation.z = AIM * rig.aim; if (rig.armL) rig.armL.rotation.z = AIM * 0.82 * rig.aim;
    if (p.air === 3) { // 낙하산: 두 팔로 줄을 잡고 다리를 늘어뜨립니다
      if (rig.armR) rig.armR.rotation.z = 2.75; if (rig.armL) rig.armL.rotation.z = 2.75;
      rig.legs.forEach((l, i) => { l.rotation.z = 0.2; const sh = rig.shins[i]; if (sh) sh.rotation.z = -0.55 + (i ? 0.12 : 0); });
    }
    rig.flash.position.set(0.95, 1.32, 0.1);
    rig.flash.visible = p.muzzle > 0;
  }

  // ---------- 전리품 ----------
  private lootNode(l: Loot): THREE.Object3D {
    const g = new THREE.Group(), color = LOOT_COLOR[l.kind];
    if (l.kind === 'attachment' && l.part) { const m = makePart(l.part); m.scale.setScalar(3); m.position.y = 0.18; g.add(m); }
    else if (l.kind === 'weapon' && l.weapon && this.assets?.groundGuns[l.weapon]) { const m = instantiate(this.assets.groundGuns[l.weapon]); m.scale.setScalar(1.25); m.position.y = 0.9; g.add(m); }
    else {
      const body = new THREE.Mesh(l.kind === 'helmet' ? new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8) : new THREE.BoxGeometry(0.5, l.kind === 'armor' ? 0.55 : 0.34, l.kind === 'armor' ? 0.28 : 0.4), new THREE.MeshLambertMaterial({ color: l.kind === 'medkit' ? 0xf4f6f4 : l.kind === 'armor' ? 0x3f7fd8 : l.kind === 'helmet' ? 0x56603a : 0x6c7a3c, emissive: color, emissiveIntensity: 0.18 })); body.position.y = 0.9; body.castShadow = true; g.add(body);
      if (l.kind === 'medkit') { const m = new THREE.MeshBasicMaterial({ color: 0xd8232a }); const a = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.06), m), b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.06), m); a.position.set(0, 0.9, 0.21); b.position.set(0, 0.9, 0.21); g.add(a, b); }
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
    g.position.set(l.x, l.y, l.z); this.scene.add(g); return g;
  }
  /** 수송기와 낙하산 */
  private syncSky(view: Player): void {
    const m = this.match, pl = m.planeAt(m.t);
    if (!this.plane) {
      const g = new THREE.Group(), body = new THREE.MeshLambertMaterial({ color: 0x6b7480 }), wing = new THREE.MeshLambertMaterial({ color: 0x8a929c });
      const fus = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 38, 10), body); fus.rotation.z = Math.PI / 2; g.add(fus);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 10), body); nose.rotation.z = -Math.PI / 2; nose.position.x = 22; g.add(nose);
      const w = new THREE.Mesh(new THREE.BoxGeometry(9, 0.7, 62), wing); w.position.set(2, -0.8, 0); g.add(w);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 18), wing); tail.position.set(-17, 0.5, 0); g.add(tail); const fin = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 0.5), wing); fin.position.set(-17, 4.5, 0); g.add(fin);
      g.visible = false; this.scene.add(g); this.plane = g;
    }
    if (pl && m.flight) { this.plane.visible = view.air !== 1; this.plane.position.set(pl.x, 320, pl.z); this.plane.rotation.y = -Math.atan2(m.flight.dz, m.flight.dx); } else this.plane.visible = false;
    for (const p of m.players) if (p.air === 3 && !this.chutes.has(p.id)) {
      const cg = this.makeChute(p.color); cg.visible = false; this.scene.add(cg); this.chutes.set(p.id, cg);
    }
  }
  private syncLoot(cam: THREE.Vector3): void {
    const live = new Set<number>(); let nb = 0; const d = new THREE.Object3D();
    for (const l of this.match.loot) {
      if (l.taken) continue; live.add(l.id); let n = this.lootNodes.get(l.id); if (!n) { n = this.lootNode(l); this.lootNodes.set(l.id, n); }
      const dist = Math.hypot(l.x - cam.x, l.z - cam.z); n.visible = dist < 150; if (!n.visible) continue;
      n.children[0].rotation.y = this.time * 0.7 + l.id; n.children[0].position.y = (l.kind === 'attachment' ? 0.3 : 0.9) + Math.sin(this.time * 2 + l.id) * 0.06;
      if (nb < 400) { d.position.set(l.x, l.y + 3.4, l.z); d.scale.set(1, 1, 1); d.updateMatrix(); this.beams.setMatrixAt(nb, d.matrix); this.beams.setColorAt(nb, this.tmpCol.setHex(LOOT_COLOR[l.kind])); nb++; }
    }
    this.beams.count = nb; this.beams.instanceMatrix.needsUpdate = true; if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    for (const [id, n] of this.lootNodes) if (!live.has(id)) { this.scene.remove(n); if (this.match.lootOf(id)?.kind === 'attachment') disposeModel(n); this.lootNodes.delete(id); }
  }

  // ---------- 효과 ----------
  private spark(x: number, y: number, z: number, n: number, rgb: [number, number, number], speed: number): void {
    for (let i = 0; i < n && this.sparkData.length < 240; i++) {
      const a = Math.random() * 6.28, up = Math.random() * 0.9 + 0.1, s = speed * (0.4 + Math.random());
      this.sparkData.push({ x, y, z, vx: Math.cos(a) * s * (1 - up * 0.4), vy: up * s * 1.2, vz: Math.sin(a) * s * (1 - up * 0.4), life: 0.35 + Math.random() * 0.35, r: rgb[0], g: rgb[1], b: rgb[2] });
    }
  }
  private tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number): void {
    const len = Math.hypot(bx - ax, by - ay, bz - az); if (len < 1) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const mid = new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); mesh.position.copy(mid); mesh.scale.set(1, Math.min(len, 60), 1);
    // 앞부분만 짧게(총알이 날아가는 느낌): 끝점 쪽 60m 구간
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az).normalize(); if (len > 60) mesh.position.set(bx - dir.x * 30, by - dir.y * 30, bz - dir.z * 30);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); this.scene.add(mesh); this.tracers.push({ mesh, life: 0.09, max: 0.09 });
  }
  handle(events: MatchEvent[], me: Player): void {
    for (const e of events) {
      if (e.t === 'shot') {
        const shooter = this.match.players[e.id]; if (!shooter) continue;
        const fx = Math.cos(shooter.yaw), fz = Math.sin(shooter.yaw), isMe = e.id === me.id;
        const mx = e.ox + (isMe ? fx * 0.7 - fz * 0.22 : fx * 0.9), my = isMe ? e.oy - 0.16 : e.oy - 0.25, mz = e.oz + (isMe ? fz * 0.7 + fx * 0.22 : fz * 0.9);
        for (let i = 0; i + 2 < e.ends.length; i += 3) this.tracer(mx, my, mz, e.ends[i], e.ends[i + 1], e.ends[i + 2], WEAPONS[e.weapon].pellets > 1 ? 0xffd9a0 : 0xfff0b8);
        if (isMe) { const gun = this.match.gun(me); this.shake = Math.min(1, this.shake + (gun ? gunStats(gun).recoil : WEAPONS[e.weapon].recoil) * 6); }
      } else if (e.t === 'hit') {
        if (e.wall || e.victim < 0) this.spark(e.x, e.y, e.z, 7, [1, 0.8, 0.45], 3.5);
        else this.spark(e.x, e.y, e.z, e.head ? 14 : 9, [1, 0.12, 0.08], 2.8);
      }
    }
  }
  private updateFx(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) { const f = this.tracers[i]; f.life -= dt; (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / f.max) * 0.9; if (f.life <= 0) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose(); this.tracers.splice(i, 1); } }
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute, col = this.sparks.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = this.sparkData.length - 1; i >= 0; i--) { const s = this.sparkData[i]; s.life -= dt; s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.y < 0.02) { s.y = 0.02; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6; } if (s.life <= 0) this.sparkData.splice(i, 1); }
    this.sparkData.forEach((s, i) => { pos.setXYZ(i, s.x, s.y, s.z); const k = Math.min(1, s.life * 2.5); col.setXYZ(i, s.r * k, s.g * k, s.b * k); });
    this.sparks.geometry.setDrawRange(0, this.sparkData.length); pos.needsUpdate = true; col.needsUpdate = true;
  }

  // ---------- 1인칭 총 ----------
  private viewmodel(p: Player, show: boolean, dt: number): void {
    const gun = p.guns[p.cur], id = gun?.id ?? '';
    if (show && !this.vmShown) this.vmSwap = 0.35; // 착지해서 총을 다시 꺼낼 때
    this.vmShown = show;
    const signature = JSON.stringify([id, gun?.parts]);
    if (signature !== this.vmId) {
      this.vmId = signature;
      if (this.vm) { this.vm.remove(this.vmFlash); this.vmScene.remove(this.vm); disposeModel(this.vm); }
      this.vm = null; this.vmSwap = 0.35;
      if (gun) { this.vm = makeModularGun(gun); this.vm.add(this.vmFlash); this.vmFlash.position.copy(mountPoints(gun.id).muzzle); if (gun.parts?.muzzle === 'suppressor') this.vmFlash.position.x += 0.32; this.vmScene.add(this.vm); }
    }
    if (!this.vm) return; this.vm.visible = show; if (!show) return;
    this.vmSwap = Math.max(0, this.vmSwap - dt); const sw = this.vmSwap / 0.35, moving = Math.min(1, p.speed / 5), reloading = p.reload > 0, recoil = p.kick, ads = p.ads ? 1 : 0;
    const bob = Math.sin(this.bob * 1.1) * 0.35 * moving * (1 - ads * 0.8), sway = Math.cos(this.bob * 0.55) * 0.25 * moving * (1 - ads * 0.8), big = id === 'pistol' ? 12 : 8;
    this.vm.scale.setScalar(big); this.vm.rotation.set(recoil * 0.1 - (reloading ? 0.7 : 0) - sw * 0.8, Math.PI / 2 + recoil * 0.02, 0);
    const sightY = gun ? (mountPoints(gun.id).optic.y + (gun.parts?.optic === 'scope4' ? 0.12 : gun.parts?.optic === 'redDot' ? 0.095 : 0)) * big : 1.6;
    this.vm.position.set(3.8 * (1 - ads) + sway, -4.4 * (1 - ads) - sightY * ads + bob - (reloading ? 3 : 0) - sw * 5, -9.5 + recoil * 1.4);
    this.vmFlash.visible = p.muzzle > 0; this.vmFlash.material.rotation = this.time * 40;
  }

  resize(w: number, h: number): void { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  /** 매 프레임: 장면을 경기 상태에 맞추고 그립니다. spectate 가 있으면 그 선수 뒤에서 따라갑니다(내가 쓰러진 뒤). */
  frame(dt: number, me: Player, spectate: Player | null, zoom: number): void {
    this.time += dt; this.frames++; const m = this.match, z = m.zone, cam = this.camera, view = spectate ?? me;
    for (const p of m.players) { const rig = this.rigs.get(p.id)!; const hide = (!spectate && p.id === me.id); rig.root.visible = !hide && p.air !== 1; this.placeChute(p); if (hide) continue; this.poseRig(p, dt); if (!p.alive) { rig.root.rotation.set(0, -p.yaw, -Math.PI / 2); rig.root.position.y = p.y + 0.28; rig.flash.visible = false; } }
    // 카메라
    this.bob += view.speed * dt * 1.7; this.shake = Math.max(0, this.shake - dt * 5);
    if (spectate) {
      const back = 3.6, cx = view.x - Math.cos(view.yaw) * back, cz = view.z - Math.sin(view.yaw) * back, specY = Math.max(view.y, groundAt(this.match.map.terrain, cx, cz));
      cam.position.set(cx, specY + 2.3, cz); cam.rotation.order = 'YXZ'; cam.rotation.set(-0.12, -view.yaw - Math.PI / 2, 0);
    } else {
      const bobY = Math.sin(this.bob) * 0.035 * Math.min(1, view.speed / 5), groundY = view.y, eyeH = view.crouch ? PLAYER.crouchEye : PLAYER.eye; this.eyeNow += (eyeH - this.eyeNow) * Math.min(1, dt * 12);
      cam.position.set(view.x, groundY + this.eyeNow + (view.air === 1 ? 0 : bobY), view.z); cam.rotation.order = 'YXZ';
      cam.rotation.set(view.pitch + view.kick * 0.03 + (Math.random() - 0.5) * this.shake * 0.004, -view.yaw - Math.PI / 2 + (Math.random() - 0.5) * this.shake * 0.004, 0);
    }
    const targetFov = 78 / zoom; this.fov += (targetFov - this.fov) * Math.min(1, dt * 14); if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.camPos.copy(cam.position);
    // 해와 그림자는 카메라를 따라 이동
    this.sun.position.set(view.x + 66, 92, view.z + 46); this.sun.target.position.set(view.x, 0, view.z); this.sun.target.updateMatrixWorld();
    // 자기장
    this.zoneWall.scale.set(z.r, 1, z.r); this.zoneWall.position.x = z.cx; this.zoneWall.position.z = z.cz; (this.zoneWall.material as THREE.ShaderMaterial).uniforms.t.value = this.time;
    this.zoneNext.visible = z.nextR < z.r - 0.5; this.zoneNext.scale.set(z.nextR, z.nextR, 1); this.zoneNext.position.x = z.nextCx; this.zoneNext.position.z = z.nextCz;
    if (this.water) { this.water.position.x = view.x; this.water.position.z = view.z; this.water.position.y = this.match.map.terrain.water + Math.sin(this.time * 0.8) * 0.04; }
    this.syncSky(view); this.syncLoot(cam.position); this.updateFx(dt);
    this.chuteHands.visible = !spectate && me.alive && me.air === 3;
    this.viewmodel(view, !spectate && me.alive && me.air === 0, dt);
    // 그리기: 월드 → 깊이 지우고 1인칭 총
    this.renderer.clear(); this.renderer.render(this.scene, cam);
    if ((this.vm && this.vm.visible) || this.chuteHands.visible) { this.vmCam.fov = cam.fov > 60 ? 64 : 64 * (cam.fov / 60); this.vmCam.aspect = cam.aspect; this.vmCam.updateProjectionMatrix(); this.renderer.clearDepth(); this.renderer.render(this.vmScene, this.vmCam); }
  }

  /** 월드 좌표를 화면 픽셀로. 카메라 뒤면 null. */
  project(x: number, y: number, z: number): { x: number; y: number; dist: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera); if (v.z > 1 || v.z < -1) return null;
    const r = this.canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, dist: this.camPos.distanceTo(new THREE.Vector3(x, y, z)) };
  }

  dispose(): void {
    this.weaponEnvironment.dispose();
    if (this.vm) { this.vm.remove(this.vmFlash); disposeModel(this.vm); this.vm = null; }
    this.vmFlash.material.dispose();
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose(); });
    this.chuteHands.traverse(o => { (o as THREE.Mesh).geometry?.dispose(); }); // 총 모델은 에셋과 공유하므로 건드리지 않습니다
    this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
