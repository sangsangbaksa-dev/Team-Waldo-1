// ZERO ZONE — 3D 장면: 지형·건물·나무·전리품·병사·자기장 벽·1인칭 총과 사격 효과. 경기 상태(Match)를 읽기만 합니다.
import * as THREE from 'three';
import { makeEnvironment, standardize } from '../shared/gfx';
import { readPreferences } from '../prefs';
import { makePost, type PostFx } from '../postfx';
import { AdaptiveQuality } from '../shared/adaptive';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AIR, PARTS, RED, WEAPONS, makeRng, type WeaponId } from './config';
import { buildGun, lootPart, muzzleTip } from './gunbuild';
import { bake, instantiate } from '../city/models';
import { SMOKE, eyeOf, type Match, type MatchEvent, type Player } from './sim';
import type { ShooterAssets } from './assets';
import type { CharacterRig } from '../shared/character';
import { SOLDIER_KINDS } from './assets';
import type { Box, Loot } from './world';
import { buildProps, buildRoofs, makeDropCrate, makePlane, makeVehicleMesh, partMesh } from './props';
import { TerrainView, tintGround } from './terrainview';
import { groundHeight } from './relief';
import { CACHE_RADIUS } from './field-cache';
import { WeatherFx } from './weatherfx';
import { waterDepth } from './terrain';
import { FLOOR_Y } from './ground-surfaces';
import { LodSet, tileHeightfield } from '../shared/lod';
import { chuteTexture, crateTexture, concreteTexture, floorTexture, glowTexture, groundTexture, leafTexture, lootCaseTexture, makeSky, rockTexture, setTextureAnisotropy, wallTexture } from './textures';

export type Quality = 'high' | 'standard' | 'low';
const LOOT_COLOR: Record<string, number> = { weapon: 0xeaf6ff, ammo: 0xffa53a, medkit: 0x52f08a, armor: 0x5aa8ff, bandage: 0xf2f2f2, attach: 0xc59bff, helmet: 0xffd34d, boost: 0x39e6ff, smoke: 0xb8c0c8, flash: 0xfff2a0 };

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

interface Rig { chute: THREE.Group; root: THREE.Group; ch: CharacterRig | null; low: THREE.Mesh; flash: THREE.Sprite; aim: number; lastHurt: number; lastMuzzle: number }
interface Fx { mesh: THREE.Mesh; life: number; max: number }

export class ShooterView {
  post: PostFx | null = null; renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(78, 1, 0.08, 2400);
  private vmScene = new THREE.Scene(); private vmCam = new THREE.PerspectiveCamera(64, 1, 0.5, 200);
  private sun: THREE.DirectionalLight; private glow = glowTexture(); private rigs = new Map<number, Rig>(); private lootNodes = new Map<number, THREE.Object3D>();
  private zoneWall: THREE.Mesh; private zoneNext: THREE.Mesh; private tracers: Fx[] = []; private sparks: THREE.Points; private sparkData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; r: number; g: number; b: number }[] = [];
  private vm: THREE.Object3D | null = null; private vmId = ''; private vmParts = ''; private vmSwap = 0; private vmFlash: THREE.Sprite; private bob = 0; private shake = 0; private terrainView: TerrainView | null = null; private fovPunch = 0; private flashKick = 0; private roll = 0; private sprintT = 0; private time = 0;
  private mats = new Map<string, THREE.Material>(); private tmpCol = new THREE.Color(); private beams: THREE.InstancedMesh;
  private camPos = new THREE.Vector3(); fov = 78; frames = 0;
  /** 적응형 화질: 프레임이 길면 해상도 → 후처리 → 그림자 → 원거리 장식 순으로 낮춥니다 */
  private adapt: AdaptiveQuality; level = 0; private vw = 0; private vh = 0;
  private readonly groundLod = new LodSet({ near: 150, far: 1e9 }); private cullSets: Array<{ m: THREE.InstancedMesh; x: number; z: number; r: number; far: number; grass: boolean }> = []; private tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true);
  private environment: THREE.Texture | null = null; private reducedMotion = readPreferences().reducedMotion;
  /** 폭풍우 하늘: 번개(flash)가 가끔 하늘과 안개를 밝힙니다 */
  private wfx: WeatherFx | null = null; private sky: THREE.Mesh; private hemi: THREE.HemisphereLight; private flash = 0; private nextBolt = 6; private carrier: THREE.Group | null = null; private fogBase = new THREE.Color(0x76828a);

  constructor(readonly canvas: HTMLCanvasElement, readonly match: Match, private assets: ShooterAssets | null, readonly quality: Quality) {
    const hi = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(hi ? 2 : quality === 'standard' ? 1.75 : 1, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = hi; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true; // 그림자 맵은 두 프레임에 한 번 갱신(frame)
    this.adapt = new AdaptiveQuality({ max: this.renderer.getPixelRatio(), start: this.renderer.getPixelRatio(), setPixelRatio: pr => { this.renderer.setPixelRatio(pr); this.applySize(); }, setLevel: l => this.setLevel(l) }); this.renderer.setPixelRatio(this.adapt.pr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05; this.renderer.autoClear = false;
    const sc = this.scene, sunDir = new THREE.Vector3(0.55, 0.62, 0.38);
    if (hi) { this.environment = makeEnvironment(this.renderer, { top: 0x637e9b, horizon: 0xc9c5b4, ground: 0x43463b, sun: 0xffe4bc, sunDir: [0.55, 0.62, 0.38], sunPower: 3 }); sc.environment = this.environment; this.vmScene.environment = this.environment; }
    sc.fog = new THREE.FogExp2(0x76828a, 0.0042); this.sky = makeSky(sunDir); sc.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xa9bccf, 0x5d5a48, 0.82); sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xdbe4ee, 1.8); this.sun.position.copy(sunDir).multiplyScalar(120); sc.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight(0x8aaed0, 0.3); rim.position.set(-80, 35, -100); sc.add(rim);
    if (hi) { this.sun.castShadow = true; const s = this.sun.shadow; s.mapSize.set(2048, 2048); s.camera.left = s.camera.bottom = -60; s.camera.right = s.camera.top = 60; s.camera.near = 20; s.camera.far = 320; s.bias = -0.0004; s.normalBias = 0.05; }
    this.post = makePost(quality, this.renderer, this.scene, this.camera, { strength: 0.42, radius: 0.55, threshold: 0.88, vignette: 0.3 });
    setTextureAnisotropy(quality === 'low' ? 2 : this.renderer.capabilities.getMaxAnisotropy());
    this.buildGround(); this.buildBuildings(); this.buildScatter();
    for (const cache of match.fieldCaches) {
      const marker = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x727766 }));
      pole.position.y = 1.3; marker.add(pole);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.48, 0.12), new THREE.MeshLambertMaterial({ color: 0xd4e1c4 }));
      panel.position.y = 2.4; marker.add(panel);
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 48 }, (_, i) => {
        const a = i / 48 * Math.PI * 2, dx = Math.cos(a) * CACHE_RADIUS, dz = Math.sin(a) * CACHE_RADIUS;
        return new THREE.Vector3(dx, groundHeight(match.seed, match.map, cache.x + dx, cache.z + dz) - groundHeight(match.seed, match.map, cache.x, cache.z) + 0.08, dz);
      })), new THREE.LineBasicMaterial({ color: 0xd4e1c4 }));
      marker.add(ring);
      marker.position.set(cache.x, groundHeight(match.seed, match.map, cache.x, cache.z), cache.z);
      this.cacheMarkers.push(marker); sc.add(marker);
    }
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
    this.vmScene.add(new THREE.HemisphereLight(0xdbe6ff, 0x6a5a50, 1.9)); const vs = new THREE.DirectionalLight(0xffe2b8, 2.4); vs.position.set(2, 4, 3); this.vmScene.add(vs);
    this.vmFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd98a, blending: THREE.AdditiveBlending, depthTest: false, transparent: true })); this.vmFlash.scale.set(0.3, 0.3, 1); this.vmFlash.visible = false; this.vmFlash.renderOrder = 10;
    for (const p of match.players) this.makeRig(p);
  }

  private mat(key: string, make: () => THREE.Material): THREE.Material { let m = this.mats.get(key); if (!m) { m = make(); this.mats.set(key, m); } return m; }

  // ---------- 지형 ----------
  private buildGround(): void {
    const half = this.match.map.half, size = half * 2 + 900, segs = this.quality === 'low' ? 120 : 240, geo = new THREE.PlaneGeometry(size, size, segs, segs); geo.rotateX(-Math.PI / 2);
    const n1 = noise2(this.match.seed), n2 = noise2(this.match.seed + 9), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const rockCol = new THREE.Color(0.82, 0.8, 0.74), green = new THREE.Color(0.96, 1.02, 0.84), dry = new THREE.Color(1.2, 1.0, 0.7), dark = new THREE.Color(0.72, 0.82, 0.62), gravel = new THREE.Color(1.03, 0.98, 0.85);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), a = n1(x / 90 + 32, z / 90 + 32), b = n2(x / 28 + 32, z / 28 + 32);
      const out = Math.max(Math.abs(x), Math.abs(z)) - half, rim = out > 8 ? this.rimHeight(x, z, out) : 0;
      const height = groundHeight(this.match.seed, this.match.map, x, z) + rim; pos.setY(i, height);
      c.copy(green).lerp(dry, Math.min(1, Math.max(0, a - 0.4) * 3)).lerp(dark, Math.min(1, Math.max(0, 0.5 - b) * 2.2)).lerp(gravel, Math.max(0, n2(x / 170 + 12, z / 170 + 12) - 0.62) * 1.8).lerp(dark, Math.min(0.85, Math.max(0, out) / 70)); tintGround(this.match.map, x, z, c);
      // 섬 밖은 숲 언덕이 솟아 바위 능선으로 이어집니다(위에서 내려다볼 때 잘라 낸 판처럼 보이지 않게)
      if (rim > 0) c.lerp(rockCol, Math.min(1, Math.max(0, rim - 34) / 50) * (0.55 + a * 0.45));
      c.multiplyScalar(1 + Math.min(height, 3) * 0.035);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.computeVertexNormals();
    const normals = geo.attributes.normal; for (let i = 0; i < pos.count; i++) { const shade = 1 - Math.min(0.22, (1 - normals.getY(i)) * 2); col[i * 3] *= shade; col[i * 3 + 1] *= shade; col[i * 3 + 2] *= shade; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const t = groundTexture(); t.repeat.set(size / 6, size / 6);
    // 지형을 8×8 칸으로 잘라 시야 밖 칸은 그리지 않고, 먼 칸은 성긴 격자로 대신한다(공용 src/shared/lod.ts). 한 장이면 섬 전체 11만 삼각형을 매 프레임 그렸다.
    const gmat = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 1 });
    for (const tile of tileHeightfield(geo, segs, 8, 3, 4)) {
      const mk = (g: THREE.BufferGeometry, on: boolean): THREE.Mesh => { const m = new THREE.Mesh(g, gmat); m.receiveShadow = true; m.visible = on; this.scene.add(m); return m; };
      this.groundLod.add({ x: tile.x, z: tile.z, r: tile.r, full: [mk(tile.full, true)], proxy: [mk(tile.coarse, false)] });
    }
    geo.dispose();
    this.buildRange(half);
    // 마을 바닥·흙길·물·구릉·절벽·다리
    this.terrainView = new TerrainView(this.match.map, this.quality === 'low'); this.scene.add(this.terrainView.group);
    this.wfx = new WeatherFx(this.match.map, this.glow, this.quality); this.scene.add(this.wfx.group);
  }

  /** 섬 바깥 땅의 높이: 경계에서 조금 떨어진 곳부터 언덕이 솟아 수백 m 밖에서 산줄기가 됩니다. 들어갈 수 없는 곳이라 화면에만 씁니다. */
  private rimHeight(x: number, z: number, out: number): number {
    const n = this.rimNoise ??= noise2(this.match.seed + 31), m = this.rimNoise2 ??= noise2(this.match.seed + 47);
    const ridge = 1 - Math.abs(n(x / 70 + 5, z / 70 + 5) * 2 - 1), rise = Math.min(1, Math.max(0, (out - 8) / 150));
    return rise * rise * (3 - 2 * rise) * (18 + ridge * 52 + m(x / 23 + 9, z / 23 + 9) * 12) + Math.max(0, out - 160) * 0.12;
  }
  private rimNoise: ((x: number, z: number) => number) | undefined; private rimNoise2: ((x: number, z: number) => number) | undefined;
  /** 지평선을 닫는 먼 산맥: 땅판 끝(경계에서 450m) 너머로 둥글게 둘러 서서 비행기에서 봐도 판 끝이 보이지 않습니다. 안개가 푸르게 덮습니다. */
  private buildRange(half: number): void {
    const seg = this.quality === 'low' ? 96 : 180, rows = 6, r0 = half + 380, r1 = half + 1500, n = noise2(this.match.seed + 77), pos: number[] = [], col: number[] = [], idx: number[] = [];
    const near = new THREE.Color(0.25, 0.32, 0.23), far = new THREE.Color(0.36, 0.42, 0.46), rock = new THREE.Color(0.5, 0.49, 0.46), c = new THREE.Color();
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, t = j / rows, r = r0 + (r1 - r0) * t, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const peak = 1 - Math.abs(n(Math.cos(a) * 9 + 20 + t * 3, Math.sin(a) * 9 + 20) * 2 - 1), h = j === 0 ? 40 : j === rows ? 30 : 60 + peak * 160 * Math.sin(t * Math.PI) ** 0.7 + n(i * 0.9, j * 2.3) * 40;
      pos.push(x, h, z); c.copy(near).lerp(far, t).lerp(rock, Math.min(1, Math.max(0, h - 150) / 90) * 0.6); col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const range = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide })); range.name = 'range'; this.scene.add(range);
  }

  private buildBuildings(): void {
    const map = this.match.map, byTex: THREE.BufferGeometry[][] = [[], [], [], []], crates: Box[] = [];
    for (const b of map.boxes) { if (b.kind === 'wall') byTex[b.tex % 4].push(worldBox(b)); else if (b.kind === 'crate') crates.push(b); }
    byTex.forEach((list, i) => {
      if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshStandardMaterial({ map: wallTexture(i), roughness: 0.88 }));
      m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    });
    const floors: THREE.BufferGeometry[][] = [[], []];
    for (const b of map.buildings) {
      const wood = b.type === 'house' || b.type === 'cabin' || b.type === 'barn' || b.type === 'church';
      const f = new THREE.PlaneGeometry(b.w, b.d); f.rotateX(-Math.PI / 2); f.translate(b.x, FLOOR_Y, b.z);
      const uv = f.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * b.w / 3, uv.getY(i) * b.d / 3);
      floors[wood ? 0 : 1].push(f);
    }
    floors.forEach((list, i) => {
      if (!list.length) return;
      const g = mergeGeometries(list, false)!; list.forEach(f => f.dispose());
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: i === 0 ? floorTexture() : concreteTexture(), depthWrite: true }));
      m.name = 'interior-floor'; m.receiveShadow = true; this.scene.add(m);
    });
    this.scene.add(buildRoofs(map, rngOf(this.match.seed + 3)), buildProps(map, new Set(this.match.vehicles.map(v => v.box))));
    if (crates.length) {
      const ct = crateTexture(), geos = crates.map(b => worldBox(b, 1.2)); const m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshLambertMaterial({ map: ct })); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    }
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
      const n = this.quality === 'low' ? 3000 : map.mode === 'br' ? 14000 : 5000, mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2b3618 }), n); let k = 0;
      const flowerCount = this.quality === 'low' ? 250 : 1000, flowers = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.28, 5).translate(0, 0.4, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), flowerCount);
      for (let tries = 0; k < n && tries < n * 3; tries++) {
        const x = (r() * 2 - 1) * (map.half + 20), z = (r() * 2 - 1) * (map.half + 20); if (map.compounds.some(c => Math.hypot(c.x - x, c.z - z) < c.r - 5) || map.sites.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 1) || waterDepth(map.terrain, x, z) || map.terrain.hills.some(h => Math.hypot(h.x - x, h.z - z) < h.r * 1.05)) continue;
        d.position.set(x, groundHeight(this.match.seed, map, x, z), z); d.rotation.set(0, r() * 6.28, 0); d.scale.setScalar(0.8 + r() * 0.7); d.updateMatrix(); mesh.setMatrixAt(k, d.matrix); if (k < flowerCount) { flowers.setMatrixAt(k, d.matrix); flowers.setColorAt(k, this.tmpCol.setHex(k % 3 === 0 ? 0xe5bb63 : k % 3 === 1 ? 0xe3dccc : 0xb99cbb)); } k++;
      }
      flowers.count = Math.min(k, flowerCount); this.chunk(flowers, 90, 150, true);
      mesh.count = k; mesh.receiveShadow = false; this.chunk(mesh, 90, 150, true);
    }
    // 덤불
    { const bushes = map.props.filter(q => q.kind === 'bush');
      if (bushes.length) {
        const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.82 + 0.3 * Math.sin(i * 12.9898) ** 2; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.computeVertexNormals();
        const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ map: leafTexture(), flatShading: true }), bushes.length);
        bushes.forEach((q, i) => { d.position.set(q.x, q.h * 0.35 + groundHeight(this.match.seed, map, q.x, q.z), q.z); d.rotation.set(0, q.ry, 0); d.scale.set(q.w * 0.5, q.h * 0.55, q.w * 0.5); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); mesh.setColorAt(i, this.tmpCol.setHex(q.c)); });
        mesh.castShadow = true; this.chunk(mesh, 100, 260);
      } }
    // 바위
    if (map.rocks.length) {
      const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, n = noise2(3);
      for (let i = 0; i < p.count; i++) { const k = 0.78 + 0.4 * n(p.getX(i) * 2 + 20, p.getZ(i) * 2 + p.getY(i) * 2 + 20); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.9, p.getZ(i) * k); }
      g.computeVertexNormals();
      const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x9a978f, map: rockTexture(), roughness: 0.95, flatShading: true }), map.rocks.length);
      map.rocks.forEach((k, i) => { d.position.set(k.x, k.sy * 0.28 + groundHeight(this.match.seed, map, k.x, k.z), k.z); d.rotation.set(0, k.ry, 0); d.scale.set(k.sx, k.sy, k.sz); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); mesh.setColorAt(i, this.tmpCol.setScalar(0.8 + r() * 0.4)); });
      mesh.castShadow = true; mesh.receiveShadow = true; this.chunk(mesh, 120, 480);
      const count = Math.min(map.rocks.length, this.quality === 'low' ? 100 : 350), clusters = new THREE.InstancedMesh(g, mesh.material, count * 2);
      for (let i = 0; i < count * 2; i++) {
        const rock = map.rocks[i % count], angle = r() * Math.PI * 2, distance = 1.5 + r() * 2.5, x = rock.x + Math.cos(angle) * distance, z = rock.z + Math.sin(angle) * distance;
        const scale = 0.3 + r() * 0.65; d.position.set(x, groundHeight(this.match.seed, map, x, z) + scale * 0.28, z); d.rotation.set(0, r() * Math.PI * 2, 0); d.scale.set(scale * 1.2, scale, scale); d.updateMatrix(); clusters.setMatrixAt(i, d.matrix);
      }
      this.chunk(clusters, 120, 400);
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
        geos = [[trunk, new THREE.MeshLambertMaterial({ color: 0x5b4126 })], [crown, new THREE.MeshLambertMaterial({ color: pine ? 0x3a7446 : 0x66994a, map: leafTexture() })]];
      }
      let top = 1; if (baked) { const bb = new THREE.Box3(); for (const [g] of geos) { g.computeBoundingBox(); bb.union(g.boundingBox!); } top = Math.max(0.5, bb.max.y); }
      for (const [g, m] of geos) {
        const mesh = new THREE.InstancedMesh(g, m, list.length);
        list.forEach((t, i) => { const h = (baked ? (pine ? 9 : 7.5) / top : 1) * t.s; d.position.set(t.x, groundHeight(this.match.seed, map, t.x, t.z), t.z); d.rotation.set(0, r() * 6.28, 0); d.scale.setScalar(h); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); const hue = pine ? 0x819477 : (Math.sin(t.x * 0.028 + t.z * 0.019) > 0.72 ? 0xd7a45c : 0xb6c99c); mesh.setColorAt(i, this.tmpCol.setHex(hue)); });
        mesh.castShadow = true; mesh.receiveShadow = false; this.chunk(mesh, 140, 520);
      }
    }
  }

  /** 정적 인스턴스를 격자 칸으로 쪼갭니다: 한 덩어리면 프러스텀·그림자 컬링이 안 먹어 지도 전체를 매 프레임 그렸습니다. far 밖의 칸은 frame 에서 숨깁니다(안개에 묻히는 거리). */
  private chunk(src: THREE.InstancedMesh, cell: number, far: number, grass = false): void {
    const a = src.instanceMatrix.array, col = src.instanceColor?.array, cells = new Map<number, number[]>();
    for (let i = 0; i < src.count; i++) { const k = (Math.floor(a[i * 16 + 12] / cell) + 512) * 1024 + Math.floor(a[i * 16 + 14] / cell) + 512; let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(i); }
    for (const list of cells.values()) {
      const m = new THREE.InstancedMesh(src.geometry, src.material, list.length); let sx = 0, sz = 0;
      if (col) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      list.forEach((i, j) => { m.instanceMatrix.array.set(a.subarray(i * 16, i * 16 + 16), j * 16); if (col) m.instanceColor!.array.set(col.subarray(i * 3, i * 3 + 3), j * 3); sx += a[i * 16 + 12]; sz += a[i * 16 + 14]; });
      m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow; m.computeBoundingSphere(); this.scene.add(m);
      this.cullSets.push({ m, x: sx / list.length, z: sz / list.length, r: cell * 0.75, far, grass });
    }
  }
  private applySize(): void { if (!this.vw) return; this.renderer.setSize(this.vw, this.vh, false); this.post?.setSize(this.vw, this.vh); }
  private setLevel(l: number): void { this.level = l; if (l >= 2) this.sun.castShadow = false; }

  // ---------- 병사 ---------- (공용 캐릭터 리그: src/shared/character)
  private makeRig(p: Player): void {
    const root = new THREE.Group(); let ch: CharacterRig | null = null;
    const s = this.assets?.kit;
    if (s) { ch = s.create(SOLDIER_KINDS[p.id % SOLDIER_KINDS.length], { team: p.color, skin: p.skin, height: 0.97 + (p.id % 5) * 0.015, width: 1 }); root.add(ch.root); }
    else { // 모델을 못 받았을 때의 단순한 병사
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: p.color })); body.position.y = 1.0; body.castShadow = true; root.add(body);
    }
    const low = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.9, 2, 5), new THREE.MeshLambertMaterial({ color: p.color })); low.position.y = 0.9; low.visible = false; root.add(low);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd98a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); flash.scale.set(0.8, 0.8, 1); flash.visible = false; root.add(flash);
    const chute = new THREE.Group(), cm = this.mat(`chute${p.color}`, () => new THREE.MeshLambertMaterial({ color: p.color, map: chuteTexture(), side: THREE.DoubleSide, emissive: 0x111111 })), canopy = new THREE.Mesh(new THREE.SphereGeometry(3.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.15), cm);
    canopy.scale.set(1, 0.62, 1); canopy.position.y = 5.2; chute.add(canopy);
    const lm = this.mat('chuteline', () => new THREE.LineBasicMaterial({ color: 0xd9d4c4 })), pts: THREE.Vector3[] = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 2.9, 5.1, Math.sin(a) * 2.9), new THREE.Vector3(0, 1.6, 0)); }
    chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm)); chute.visible = false; root.add(chute);
    root.visible = false; this.scene.add(root); this.rigs.set(p.id, { chute, root, ch, low, flash, aim: 0, lastHurt: 0, lastMuzzle: 0 });
  }
  private poseRig(p: Player, dt: number, dist: number): void {
    const rig = this.rigs.get(p.id)!, ch = rig.ch; rig.aim += (1 - rig.aim) * Math.min(1, dt * 8);
    rig.root.position.set(p.x, 0, p.z); rig.root.rotation.set(0, -p.yaw, 0);
    const far = !!ch && dist > 75 && p.air !== 2;
    rig.low.visible = far; if (ch) ch.root.visible = !far;
    rig.low.scale.y = p.alive ? (p.crouch ? 0.65 : 1) : 0.28; rig.low.position.y = 0.9 * rig.low.scale.y;
    if (ch && !far) {
      const st = ch.state; st.speed = p.speed; st.walk = p.walk; st.time += dt; st.aim = rig.aim; st.crouch = p.crouch; st.dead = p.alive ? 0 : 1;
      if (p.muzzle > 0 && rig.lastMuzzle <= 0) ch.fire(); rig.lastMuzzle = p.muzzle; st.recoil = Math.max(0, st.recoil - dt * 8);
      if (p.hurt > rig.lastHurt) ch.hurt(); rig.lastHurt = p.hurt; st.hit = Math.max(0, st.hit - dt * 2.5);
      ch.setDetail(dist > 90 ? 2 : dist > 45 ? 1 : 0);
      // 낙하: 자유낙하는 배를 아래로 펴고, 낙하산은 똑바로 매달려 다리를 늘어뜨립니다
      if (p.air === 2) { st.aim = 0; ch.root.rotation.z = -1.25; ch.update(dt); ch.root.rotation.z = -1.25; ch.state.wave = 0; }
      else { ch.root.rotation.z = 0; ch.update(dt); }
    }
    rig.flash.position.set(0.95, 1.32, 0.1); rig.flash.visible = p.muzzle > 0;
    rig.chute.visible = p.air === 3;
    if (p.air === 2) { rig.root.position.set(p.x, p.alt + 0.6, p.z); rig.root.rotation.set(0, -p.yaw, 0); }
    else if (p.air === 3) { rig.root.position.set(p.x, p.alt, p.z); rig.root.rotation.set(0, -p.yaw, 0); }
  }

  // ---------- 보급 투하 ----------
  private cacheMarkers: THREE.Group[] = [];
  private dropNodes = new Map<number, { g: THREE.Group; smoke: THREE.Sprite[] }>(); private plane: THREE.Group | null = null;
  private syncDrops(): void {
    const m = this.match, t = m.t; if (!m.drops.length) return;
    m.drops.forEach((d, i) => {
      const call = d.at - d.fall; let n = this.dropNodes.get(i);
      if (!n && d.called) {
        const g = makeDropCrate(); g.position.set(d.x, 130, d.z); this.scene.add(g);
        const smoke: THREE.Sprite[] = []; for (let k = 0; k < 14; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xff3a2a, transparent: true, depthWrite: false, opacity: 0.5, fog: false })); sp.visible = false; this.scene.add(sp); smoke.push(sp); }
        n = { g, smoke }; this.dropNodes.set(i, n);
      }
      if (!n) return;
      const k = Math.min(1, Math.max(0, (t - call) / d.fall)); n.g.position.y = 130 * (1 - k) + 0.0; n.g.rotation.y = Math.sin(t * 0.8 + i) * 0.2 * (1 - k);
      const chute = n.g.getObjectByName('chute'); if (chute) { chute.visible = !d.landed; chute.scale.setScalar(1 + Math.sin(t * 2.4) * 0.03); }
      const live = t < d.at + 150;
      n.smoke.forEach((sp, j) => { sp.visible = live; if (!live) return; const ph = ((t * 0.28 + j / n!.smoke.length) % 1), y = n!.g.position.y + 1.2 + ph * 70; sp.position.set(d.x + Math.sin(ph * 5 + j) * 2 * ph, y, d.z + Math.cos(ph * 4 + j) * 2 * ph); sp.scale.setScalar(2.2 + ph * 9); (sp.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - ph); });
      // 비행기: 호출 시각에 상자 위를 지나갑니다
      const dt = t - call; if (Math.abs(dt) < 11 && !d.landed) {
        if (!this.plane) { this.plane = makePlane(); this.scene.add(this.plane); }
        const ang = i * 1.9 + 0.6, dx = Math.cos(ang), dz = Math.sin(ang); this.plane.visible = true; this.plane.position.set(d.x + dx * dt * 85, 134, d.z + dz * dt * 85); this.plane.rotation.y = -ang;
      } else if (this.plane && dt > 11 && i === m.drops.length - 1) this.plane.visible = false;
    });
    if (this.plane && !m.drops.some(d => d.called && !d.landed && Math.abs(t - (d.at - d.fall)) < 11)) this.plane.visible = false;
  }

  /** 100명을 태우고 지도를 가로지르는 수송기 */
  private syncCarrier(): void {
    const m = this.match, pl = m.plane; if (!pl) return;
    if (m.t > pl.end + 8) { if (this.carrier) this.carrier.visible = false; return; }
    if (!this.carrier) { this.carrier = makePlane(); this.carrier.scale.setScalar(1.8); this.scene.add(this.carrier); }
    const at = m.planeAt(m.t); this.carrier.visible = true; this.carrier.position.set(at.x, AIR.alt + 1.5, at.z); this.carrier.rotation.y = -Math.atan2(pl.dz, pl.dx);
  }
  /** 흐린 하늘과 가끔 치는 번개 */
  private weather(dt: number): void {
    this.nextBolt -= dt; if (this.nextBolt <= 0) { this.flash = 1; this.nextBolt = 7 + Math.random() * 14; (this.sky.material as THREE.ShaderMaterial).uniforms.bolt.value.set(Math.random() - 0.5, 0.25 + Math.random() * 0.3, Math.random() - 0.5).normalize(); }
    const f = Math.max(0, this.flash), tw = f > 0.55 ? 1 : f > 0.3 ? 0.35 : f; this.flash = Math.max(0, this.flash - dt * 2.2);
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms; u.flash.value = tw; u.t.value = this.time; this.hemi.intensity = 0.82 + tw * 1.6;
    (this.scene.fog as THREE.FogExp2).color.copy(this.fogBase).lerp(this.tmpCol.setHex(0xc4cee8), tw * 0.5);
  }

  // ---------- 전리품 ----------
  private lootNode(l: Loot): THREE.Object3D {
    const g = new THREE.Group(), color = LOOT_COLOR[l.kind];
    if (l.kind === 'weapon' && l.weapon && this.assets?.groundGuns[l.weapon]) { const m = instantiate(this.assets.groundGuns[l.weapon]); m.scale.setScalar(1.25); m.position.y = 0.9; g.add(m); }
    else if (l.kind === 'attach' && l.part && this.assets?.weaponNodes && lootPart(this.assets.weaponNodes, l.part, PARTS[l.part].slot)) { const m = lootPart(this.assets.weaponNodes, l.part, PARTS[l.part].slot)!; m.scale.setScalar(PARTS[l.part].slot === 'mag' || PARTS[l.part].slot === 'stock' ? 1.7 : 2.4); m.position.y = 0.95; g.add(m); }
    else if (l.kind === 'attach' && l.part) { const m = partMesh(l.part, 0.5); m.scale.setScalar(1.9); m.position.set(-0.5, 0.95 + (l.part === 'extmag' ? 0.3 : l.part === 'grip' ? 0.08 : -0.12), 0); g.add(m); }
    else if (l.kind === 'helmet') {
      const col = [0, 0x7a8a5a, 0x3a3d44, 0xd9b24a][l.level ?? 1], m = new THREE.MeshStandardMaterial({ color: col, roughness: l.level === 3 ? 0.3 : 0.6, metalness: l.level === 3 ? 0.8 : 0.25, emissive: col, emissiveIntensity: 0.06 }), dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.position.y = 0.82; dome.castShadow = true; g.add(dome);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 14), new THREE.MeshLambertMaterial({ color: 0x222428 })); rim.position.y = 0.82; g.add(rim);
    }
    else if (l.kind === 'boost') {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 12), new THREE.MeshLambertMaterial({ color: 0x28c8ff, emissive: 0x0a5a7a })); can.position.y = 0.9; can.castShadow = true; g.add(can);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.04, 12), new THREE.MeshLambertMaterial({ color: 0xcfd6da })); top.position.y = 1.07; g.add(top);
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.095), new THREE.MeshBasicMaterial({ color: 0xffe14a })); bolt.position.set(0, 0.9, 0); g.add(bolt);
    }
    else if (l.kind === 'flash') {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 12), new THREE.MeshLambertMaterial({ color: 0x2c3138, emissive: 0x14171a })); can.position.y = 0.9; can.castShadow = true; g.add(can);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.05, 12), new THREE.MeshBasicMaterial({ color: 0xfff2a0 })); band.position.y = 0.93; g.add(band);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xb0b6ba, roughness: 0.3, metalness: 0.9 })); cap.position.y = 1.05; g.add(cap);
    }
    else if (l.kind === 'smoke') {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 12), new THREE.MeshLambertMaterial({ color: 0x8a949c, emissive: 0x2a3036 })); can.position.y = 0.9; can.castShadow = true; g.add(can);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.05, 12), new THREE.MeshLambertMaterial({ color: 0xe8d23a })); band.position.y = 0.92; g.add(band);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xb0b6ba, roughness: 0.3, metalness: 0.9 })); cap.position.y = 1.06; g.add(cap);
    }
    else if (l.kind === 'grenade') {
      const sph = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshLambertMaterial({ color: 0x3b4a2a, emissive: 0x2a3a10 })); sph.position.y = 0.9; sph.castShadow = true; g.add(sph);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8), new THREE.MeshStandardMaterial({ color: 0xb0b6ba, roughness: 0.3, metalness: 0.9 })); cap.position.y = 1.06; g.add(cap);
    }
    else {
      const face = lootCaseTexture(l.kind === 'medkit' ? 'medkit' : l.kind === 'armor' ? 'armor' : 'ammo');
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, l.kind === 'armor' ? 0.55 : 0.34, l.kind === 'armor' ? 0.28 : 0.4), new THREE.MeshStandardMaterial({ map: face, roughness: l.kind === 'medkit' ? 0.45 : 0.7, metalness: l.kind === 'ammo' ? 0.35 : 0.1, emissive: color, emissiveIntensity: 0.08 })); body.position.y = 0.9; body.castShadow = true; g.add(body);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; ring.renderOrder = 4; g.add(ring);
    g.position.set(l.x, 0, l.z); this.scene.add(g); return g;
  }
  private syncLoot(cam: THREE.Vector3): void {
    const live = new Set<number>(); let nb = 0; const d = new THREE.Object3D();
    for (const l of this.match.loot) {
      if (l.taken) continue; live.add(l.id); let n = this.lootNodes.get(l.id); if (!n) { n = this.lootNode(l); this.lootNodes.set(l.id, n); }
      const dist = Math.hypot(l.x - cam.x, l.z - cam.z); n.visible = dist < 150; if (!n.visible) continue;
      n.children[0].rotation.y = this.time * 1.4 + l.id; n.children[0].position.y = (l.kind === 'weapon' ? 0 : 0) + Math.sin(this.time * 2 + l.id) * 0.06;
      if (nb < 400) { d.position.set(l.x, 3.6, l.z); d.scale.set(1, 1, 1); d.updateMatrix(); this.beams.setMatrixAt(nb, d.matrix); this.beams.setColorAt(nb, this.tmpCol.setHex(LOOT_COLOR[l.kind])); nb++; }
    }
    this.beams.count = nb; this.beams.instanceMatrix.needsUpdate = true; if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    for (const [id, n] of this.lootNodes) if (!live.has(id)) { this.scene.remove(n); this.lootNodes.delete(id); }
  }

  // ---------- 효과 ----------
  private spark(x: number, y: number, z: number, n: number, rgb: [number, number, number], speed: number): void {
    const limit = this.quality === 'low' ? 80 : 240;
    for (let i = 0; i < (this.quality === 'low' ? Math.ceil(n / 2) : n) && this.sparkData.length < limit; i++) {
      const a = Math.random() * 6.28, up = Math.random() * 0.9 + 0.1, s = speed * (0.4 + Math.random());
      this.sparkData.push({ x, y, z, vx: Math.cos(a) * s * (1 - up * 0.4), vy: up * s * 1.2, vz: Math.sin(a) * s * (1 - up * 0.4), life: 0.35 + Math.random() * 0.35, r: rgb[0], g: rgb[1], b: rgb[2] });
    }
  }
  private tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number): void {
    const len = Math.hypot(bx - ax, by - ay, bz - az); if (len < 1 || this.tracers.length >= (this.quality === 'low' ? 24 : 100)) return;
    const mesh = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
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
        for (let i = 0; i + 2 < e.ends.length; i += this.quality === 'low' && WEAPONS[e.weapon].pellets > 1 ? 6 : 3) this.tracer(mx, my, mz, e.ends[i], e.ends[i + 1], e.ends[i + 2], e.sup ? 0x8a8f96 : WEAPONS[e.weapon].pellets > 1 ? 0xffd9a0 : 0xfff0b8);
        if (isMe) { this.shake = Math.min(1, this.shake + WEAPONS[e.weapon].recoil * 9); this.fovPunch = Math.min(1, this.fovPunch + WEAPONS[e.weapon].recoil * 7); this.flashKick = 1; }
      } else if (e.t === 'nade') {
        if (e.stage === 'boom' && e.smoke) { this.burst(e.x, e.z); }
        else if (e.stage === 'boom' && e.flash) { this.spark(e.x, Math.max(0.6, e.y), e.z, 26, [1, 1, 0.9], 9); }
        else if (e.stage === 'boom') { this.boom(e.x, e.y, e.z); const dd = Math.hypot(e.x - me.x, e.z - me.z); if (dd < 25) this.shake = Math.min(1, this.shake + (1 - dd / 25) * 0.9); }
      } else if (e.t === 'veh') {
        if (e.stage === 'crash') { const dd = Math.hypot(e.x - me.x, e.z - me.z); this.spark(e.x, 1, e.z, 12, [1, 0.8, 0.45], 4); if (dd < 30) this.shake = Math.min(1, this.shake + (1 - dd / 30) * 0.5); }
        else if (e.stage === 'boom') { for (let k = 0; k < 6; k++) this.puff(e.x + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, e.z + (Math.random() - 0.5) * 3, 0x2a2a2a, 3, 3.4, 3, 3.2, 0.65); }
      } else if (e.t === 'hit') {
        if (e.victim === me.id && !e.wall) this.shake = Math.min(1, this.shake + 0.35 + Math.min(0.5, e.dmg / 120));
        if (e.wall || e.victim < 0) this.spark(e.x, e.y, e.z, 7, [1, 0.8, 0.45], 3.5);
        else this.spark(e.x, e.y, e.z, e.head ? 14 : 9, [1, 0.12, 0.08], 2.8);
      }
    }
  }
  private nadeMeshes = new Map<number, THREE.Mesh>(); private booms: Array<{ s: THREE.Sprite; t: number }> = [];
  private boom(x: number, y: number, z: number): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.position.set(x, Math.max(1, y + 0.6), z); s.scale.setScalar(2); this.scene.add(s); this.booms.push({ s, t: 0 });
    this.spark(x, y + 0.4, z, 36, [1, 0.62, 0.22], 9); this.flash = Math.max(this.flash, 0.25);
  }
  // 연막탄: 터진 자리에 회색 연기 덩어리를 깔고, 연막이 걷힐 때까지 천천히 일렁이게 합니다.
  private smokeNodes = new Map<number, { s: THREE.Sprite; bx: number; by: number; bz: number; sc: number; ph: number }[]>();
  private burst(x: number, z: number): void { this.spark(x, 0.6, z, 10, [0.8, 0.82, 0.85], 3); }
  private updateClouds(dt: number): void {
    const live = new Set<number>(), t = this.match.t, R = SMOKE.radius;
    for (const c of this.match.clouds) {
      live.add(c.id); let ps = this.smokeNodes.get(c.id);
      if (!ps) {
        ps = []; const n = 34;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * R * 0.85, mat = new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color().setScalar(0.68 + Math.random() * 0.2), transparent: true, depthWrite: false, opacity: 0.7 });
          const s = new THREE.Sprite(mat); this.scene.add(s); ps.push({ s, bx: c.x + Math.cos(a) * d, by: 0.8 + Math.random() * 4.4, bz: c.z + Math.sin(a) * d, sc: 5 + Math.random() * 3.5, ph: Math.random() * 6.28 });
        }
        this.smokeNodes.set(c.id, ps);
      }
      const k = this.match.cloudStrength(c);
      for (const p of ps) { p.s.position.set(p.bx + Math.sin(t * 0.4 + p.ph) * 0.6, p.by + Math.sin(t * 0.3 + p.ph) * 0.25, p.bz + Math.cos(t * 0.35 + p.ph) * 0.6); p.s.scale.setScalar(p.sc * (0.4 + 0.6 * k)); (p.s.material as THREE.SpriteMaterial).opacity = 0.7 * Math.min(1, k * 1.4); }
    }
    for (const [id, ps] of this.smokeNodes) if (!live.has(id)) { for (const p of ps) { this.scene.remove(p.s); (p.s.material as THREE.Material).dispose(); } this.smokeNodes.delete(id); }
    void dt;
  }
  private updateNades(dt: number): void {
    this.updateClouds(dt);
    const live = new Set<number>(); for (const n of this.match.nades) { live.add(n.id); let m = this.nadeMeshes.get(n.id); if (!m) { m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshLambertMaterial({ color: n.smoke ? 0x9aa3ab : n.flash ? 0xe8e4b0 : 0x3b4a2a, emissive: 0xff3010, emissiveIntensity: 0.2 })); this.scene.add(m); this.nadeMeshes.set(n.id, m); } m.position.set(n.x, n.y, n.z); (m.material as THREE.MeshLambertMaterial).emissiveIntensity = n.fuse < 1 ? 0.2 + Math.abs(Math.sin(this.time * 24)) * 1.2 : 0.2; }
    for (const [id, m] of this.nadeMeshes) if (!live.has(id)) { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); this.nadeMeshes.delete(id); }
    for (let i = this.booms.length - 1; i >= 0; i--) { const b = this.booms[i]; b.t += dt; b.s.scale.setScalar(2 + b.t * 16); (b.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - b.t * 3); if (b.t > 0.35) { this.scene.remove(b.s); (b.s.material as THREE.Material).dispose(); this.booms.splice(i, 1); } }
  }
  // ---------- 차량 · 폭격 ----------
  private vehNodes = new Map<number, { g: THREE.Group; wreck: boolean; puffT: number; fire: THREE.Sprite | null }>();
  private redNodes = new Map<number, THREE.Group>(); private shellNodes = new Map<number, THREE.Group>();
  private puffs: Array<{ s: THREE.Sprite; t: number; life: number; vy: number; grow: number; a: number }> = [];
  private puff(x: number, y: number, z: number, color: number, size: number, life: number, vy: number, grow: number, a = 0.5, add = false): void {
    if (this.puffs.length > 140) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: a, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !add }));
    s.position.set(x, y, z); s.scale.setScalar(size); this.scene.add(s); this.puffs.push({ s, t: 0, life, vy, grow, a });
  }
  private freeNode(o: THREE.Object3D): void { this.scene.remove(o); o.traverse(c => { const m = c as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose(); }); }
  private syncVehicles(dt: number, vx: number, vz: number): void {
    for (const v of this.match.vehicles) {
      let n = this.vehNodes.get(v.id);
      if (!n || n.wreck !== v.wreck) {
        if (n) { this.freeNode(n.g); if (n.fire) { this.scene.remove(n.fire); n.fire.material.dispose(); } }
        const g = makeVehicleMesh({ kind: v.kind, w: v.w, d: v.d, h: v.h, c: v.c, v: v.v, wreck: v.wreck }); this.scene.add(g);
        let fire: THREE.Sprite | null = null; if (v.wreck) { fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); fire.scale.setScalar(3); this.scene.add(fire); g.rotation.z = 0.04; }
        n = { g, wreck: v.wreck, puffT: 0, fire }; this.vehNodes.set(v.id, n);
      }
      const dist = Math.abs(v.x - vx) + Math.abs(v.z - vz); n.g.visible = dist < 420; if (n.fire) n.fire.visible = n.g.visible; if (!n.g.visible) continue;
      n.g.position.set(v.x, 0, v.z); n.g.rotation.y = -v.yaw;
      if (!v.wreck) { // 달릴 때 차체가 살짝 기웃: 가속하면 뒤로, 핸들 꺾으면 바깥으로 기웁니다
        const sp = Math.abs(v.speed), top = 36, pitch = -Math.sign(v.speed) * Math.min(1, sp / top) * 0.012; n.g.rotation.z += (pitch - n.g.rotation.z) * Math.min(1, dt * 6);
      }
      n.puffT -= dt;
      if (n.puffT <= 0 && dist < 160) {
        const sp = Math.abs(v.speed);
        if (sp > 9 && !v.wreck) { n.puffT = 0.07; this.puff(v.x - Math.cos(v.yaw) * v.w * 0.45 * Math.sign(v.speed), 0.35, v.z - Math.sin(v.yaw) * v.w * 0.45 * Math.sign(v.speed), 0x8a8270, 1.4 + sp * 0.03, 0.9, 0.5, 2.2, 0.28); }
        else if (v.wreck || v.hp < v.max * 0.35) { n.puffT = v.wreck ? 0.16 : 0.25; this.puff(v.x + (Math.random() - 0.5) * 0.8, v.h + 0.2, v.z + (Math.random() - 0.5) * 0.8, v.wreck ? 0x202020 : 0x4a4a4a, 1.6, 2.2, 2.4, 2.6, v.wreck ? 0.6 : 0.4); }
      }
      if (n.fire) { n.fire.position.set(v.x, v.h * 0.8, v.z); const k = 2.2 + Math.sin(this.time * 17 + v.id) * 0.5 + Math.random() * 0.3; n.fire.scale.set(k, k * 1.3, 1); (n.fire.material as THREE.SpriteMaterial).opacity = 0.5 + Math.random() * 0.25; }
    }
  }
  private syncReds(): void {
    const m = this.match;
    m.reds.forEach((r, i) => {
      const active = r.called && m.t < r.end + RED.fall; let n = this.redNodes.get(i);
      if (!active) { if (n) { this.freeNode(n); this.redNodes.delete(i); } return; }
      if (!n) {
        n = new THREE.Group(); const wall = new THREE.Mesh(new THREE.CylinderGeometry(r.r, r.r, 150, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); wall.position.y = 75;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(r.r, 64), new THREE.MeshBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.25;
        n.add(wall, disc); n.position.set(r.x, 0, r.z); this.scene.add(n); this.redNodes.set(i, n);
      }
      const warn = m.t < r.start, pulse = 0.5 + 0.5 * Math.sin(this.time * (warn ? 9 : 4)); ((n.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.05 + pulse * (warn ? 0.13 : 0.07); ((n.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.06 + pulse * 0.08;
    });
    const live = new Set<number>();
    for (const sh of m.shells) {
      live.add(sh.id); let g = this.shellNodes.get(sh.id); const frac = Math.min(1, (m.t - sh.t0) / (sh.land - sh.t0));
      if (!g) {
        g = new THREE.Group(); const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.24, 18, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 24), new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
        const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffb050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); head.scale.setScalar(5);
        g.add(streak, ring, head); g.position.set(sh.x, 0, sh.z); this.scene.add(g); this.shellNodes.set(sh.id, g);
      }
      g.children[0].position.y = 9 + 190 * (1 - frac); g.children[2].position.y = 190 * (1 - frac); g.children[1].scale.setScalar(1 + (1 - frac) * 2.2);
    }
    for (const [id, g] of this.shellNodes) if (!live.has(id)) { this.freeNode(g); this.shellNodes.delete(id); }
  }
  private updateFx(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) { const f = this.puffs[i]; f.t += dt; f.s.position.y += f.vy * dt; f.s.scale.addScalar(f.grow * dt); (f.s.material as THREE.SpriteMaterial).opacity = Math.max(0, f.a * (1 - f.t / f.life)); if (f.t >= f.life) { this.scene.remove(f.s); (f.s.material as THREE.Material).dispose(); this.puffs.splice(i, 1); } }
    this.updateNades(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) { const f = this.tracers[i]; f.life -= dt; (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / f.max) * 0.9; if (f.life <= 0) { this.scene.remove(f.mesh); (f.mesh.material as THREE.Material).dispose(); this.tracers.splice(i, 1); } }
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute, col = this.sparks.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = this.sparkData.length - 1; i >= 0; i--) { const s = this.sparkData[i]; s.life -= dt; s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.y < 0.02) { s.y = 0.02; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6; } if (s.life <= 0) this.sparkData.splice(i, 1); }
    this.sparkData.forEach((s, i) => { pos.setXYZ(i, s.x, s.y, s.z); const k = Math.min(1, s.life * 2.5); col.setXYZ(i, s.r * k, s.g * k, s.b * k); });
    this.sparks.geometry.setDrawRange(0, this.sparkData.length); pos.needsUpdate = true; col.needsUpdate = true;
  }

  // ---------- 1인칭 총 ----------
  private viewmodel(p: Player, show: boolean, dt: number): void {
    const gun = p.guns[p.cur], id = gun?.id ?? '';
    const pk = id + JSON.stringify(gun?.att ?? {});
    if (pk !== this.vmParts) {
      const swapped = id !== this.vmId; this.vmId = id; this.vmParts = pk; if (this.vm) this.vmScene.remove(this.vm); this.vm = null; if (swapped) this.vmSwap = 0.35;
      const nodes = this.assets?.weaponNodes;
      if (id && nodes?.[`n_${id}`]) {
        this.vm = buildGun(nodes, id as WeaponId, gun?.att, true); standardize(this.vm, { roughness: 0.48, metalness: 0.48, envMapIntensity: 0.8 }); this.vm.traverse(o => { (o as THREE.Mesh).castShadow = false; });
        const tip = muzzleTip(id as WeaponId, gun?.att); this.vm.add(this.vmFlash); this.vmFlash.position.set(tip.x, tip.y, 0); this.vmScene.add(this.vm);
      }
    }
    if (!this.vm) return;
    this.vm.visible = show; if (!show) return;
    this.vmSwap = Math.max(0, this.vmSwap - dt); const sw = this.vmSwap / 0.35, moving = Math.min(1, p.speed / 5), reloading = p.reload > 0, recoil = p.kick, ads = p.ads ? 1 : 0;
    const bob = Math.sin(this.bob * 1.1) * 0.35 * moving * (1 - ads * 0.8), sway = Math.cos(this.bob * 0.55) * 0.25 * moving * (1 - ads * 0.8), big = id === 'sniper' ? 11 : 12.5;
    const sprint = !ads && !reloading && p.speed > 6.1 ? 1 : 0; this.sprintT += (sprint - this.sprintT) * Math.min(1, dt * 10);
    this.vm.scale.setScalar(big); this.vm.rotation.set(recoil * 0.2 - (reloading ? 0.7 : 0) - sw * 0.8 - this.sprintT * 0.35, Math.PI / 2 + recoil * 0.05 + this.sprintT * 0.5, this.sprintT * 0.12);
    this.vm.position.set(4.6 * (1 - ads * 0.9) + sway, -4.4 * (1 - ads * 0.25) + bob - (reloading ? 3 : 0) - sw * 5 - this.sprintT * 1.2, -9.5 + recoil * 2.4 + this.sprintT * 0.8);
    this.vmFlash.visible = p.muzzle > 0 && gun?.att.muzzle !== 'suppressor'; this.vmFlash.material.rotation = this.time * 40; this.flashKick = Math.max(0, this.flashKick - dt * 14); const fs = 0.3 + this.flashKick * 0.45 * (0.7 + Math.random() * 0.6); this.vmFlash.scale.set(fs, fs, 1);
  }

  resize(w: number, h: number): void { this.vw = w; this.vh = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  /** 매 프레임: 장면을 경기 상태에 맞추고 그립니다. spectate 가 있으면 그 선수 뒤에서 따라갑니다(내가 쓰러진 뒤). */
  frame(dt: number, me: Player, spectate: Player | null, zoom: number): void {
    this.time += dt; this.frames++; const m = this.match, z = m.zone, cam = this.camera, view = spectate ?? me;
    const vx = view.x, vz = view.z;
    for (const p of m.players) { const rig = this.rigs.get(p.id)!; const hide = (!spectate && p.id === me.id) || p.air === 1 || p.veh >= 0 || Math.abs(p.x - vx) + Math.abs(p.z - vz) > (p.air ? 520 : this.level >= 3 ? 120 : 190); rig.root.visible = !hide; if (hide) continue; this.poseRig(p, dt, Math.abs(p.x - vx) + Math.abs(p.z - vz)); if (!p.alive) rig.flash.visible = false; }
    // 카메라
    this.bob += view.speed * dt * 1.7; this.shake = Math.max(0, this.shake - dt * 6);
    const drv = view.veh >= 0 ? m.vehicles[view.veh] ?? null : null;
    if (drv) {
      // 운전 중: 차 뒤 위에서 따라가는 시점(마우스로 둘러보고, 달리면 천천히 정면으로 돌아옵니다)
      const yc = spectate ? drv.yaw : view.yaw, dist = 6.4 + drv.w * 0.42, cp = Math.max(-0.5, Math.min(0.7, view.pitch)), sp = Math.abs(drv.speed);
      cam.position.set(drv.x - Math.cos(yc) * dist, Math.max(0.7, drv.h + 1.35 + dist * 0.17 - Math.sin(cp) * 3.2), drv.z - Math.sin(yc) * dist); cam.rotation.order = 'YXZ';
      this.roll += (0 - this.roll) * Math.min(1, dt * 9);
      cam.rotation.set(-0.13 + cp * 0.55 + (Math.random() - 0.5) * sp * 0.0007, -yc - Math.PI / 2 + (Math.random() - 0.5) * sp * 0.0007, this.roll);
    } else if (spectate) {
      const back = 3.6, cx = view.x - Math.cos(view.yaw) * back, cz = view.z - Math.sin(view.yaw) * back; cam.position.set(cx, 2.3 + view.alt, cz); cam.rotation.order = 'YXZ'; cam.rotation.set(-0.12, -view.yaw - Math.PI / 2, 0);
    } else {
      const bobY = Math.sin(this.bob) * 0.035 * Math.min(1, view.speed / 5); cam.position.set(view.x, eyeOf(view) + view.alt + bobY, view.z); cam.rotation.order = 'YXZ';
      if (view.air === 1 && m.plane) { const pl = m.plane; cam.position.set(view.x - pl.dx * 58, AIR.alt + 15, view.z - pl.dz * 58); } // 수송기 뒤 위에서 항로를 내려다봅니다
      const lat = view.vx * -Math.sin(view.yaw) + view.vz * Math.cos(view.yaw); this.roll += ((view.air === 0 ? -lat * 0.0022 : 0) - this.roll) * Math.min(1, dt * 9);
      cam.rotation.set(view.pitch + view.kick * 0.03 + (Math.random() - 0.5) * this.shake * 0.012, -view.yaw - Math.PI / 2 + (Math.random() - 0.5) * this.shake * 0.012, this.roll + (Math.random() - 0.5) * this.shake * 0.006);
    }
    this.terrainView?.update(dt); this.wfx?.update(dt, this.time, cam.position, view.alt > 40 ? 0.35 : 1); this.fovPunch = Math.max(0, this.fovPunch - dt * 6); const targetFov = 78 / zoom - this.fovPunch * (zoom > 1.6 ? 0.6 : 2.2); this.fov += (targetFov - this.fov) * Math.min(1, dt * 14); if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.camPos.copy(cam.position);
    // 해와 그림자는 카메라를 따라 이동
    (this.scene.fog as THREE.FogExp2).density = 0.0042 / (1 + view.alt / 110);
    this.sun.position.set(view.x + 66, 92, view.z + 46); this.sun.target.position.set(view.x, 0, view.z); this.sun.target.updateMatrixWorld(); this.renderer.shadowMap.needsUpdate = this.frames < 3 || (this.frames & 1) === 0;
    this.groundLod.scale = Math.min(3, 1 + view.alt / 110); this.groundLod.update({ x: vx, z: vz });
    const mult = Math.min(3, 1 + view.alt / 110); for (const c of this.cullSets) c.m.visible = !(c.grass && this.level >= 3) && Math.hypot(c.x - vx, c.z - vz) < c.far * mult + c.r;
    // 자기장
    this.zoneWall.scale.set(z.r, 1, z.r); this.zoneWall.position.x = z.cx; this.zoneWall.position.z = z.cz; (this.zoneWall.material as THREE.ShaderMaterial).uniforms.t.value = this.time;
    this.zoneNext.visible = z.nextR < z.r - 0.5; this.zoneNext.scale.set(z.nextR, z.nextR, 1); this.zoneNext.position.x = z.nextCx; this.zoneNext.position.z = z.nextCz;
    for (let i = 0; i < this.cacheMarkers.length; i++) this.cacheMarkers[i].visible = !m.fieldCaches[i].claimed && !m.fieldCaches[i].expired;
    this.syncLoot(cam.position); this.syncDrops(); this.syncVehicles(dt, vx, vz); this.syncReds(); this.updateFx(dt);
    this.syncCarrier(); this.weather(dt);
    if (!this.reducedMotion) for (const aircraft of [this.plane, this.carrier]) if (aircraft?.visible) aircraft.traverse(o => { if (o.name === 'propeller') o.rotation.x += dt * 24; });
    this.viewmodel(view, !spectate && me.alive && !me.air && me.veh < 0, dt);
    // 그리기: 월드 → 깊이 지우고 1인칭 총
    if (this.frames > 60) this.adapt.tick();
    if (this.post && this.level < 1) { this.post.setCamera(cam); this.post.render(dt); } else { this.renderer.clear(); this.renderer.render(this.scene, cam); }
    if (this.vm && this.vm.visible) { this.vmCam.fov = cam.fov > 60 ? 64 : 64 * (cam.fov / 60); this.vmCam.aspect = cam.aspect; this.vmCam.updateProjectionMatrix(); this.renderer.clearDepth(); this.renderer.render(this.vmScene, this.vmCam); }
  }

  /** 월드 좌표를 화면 픽셀로. 카메라 뒤면 null. */
  project(x: number, y: number, z: number): { x: number; y: number; dist: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera); if (v.z > 1 || v.z < -1) return null;
    const r = this.canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, dist: this.camPos.distanceTo(new THREE.Vector3(x, y, z)) };
  }

  dispose(): void {
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose(); });
    this.vmFlash.material.dispose(); this.tracerGeo.dispose(); this.glow.dispose();
    this.environment?.dispose(); this.post?.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
