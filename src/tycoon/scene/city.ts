// TYCOON — 도시 렌더링. 구획 단위로 건물을 합쳐 그리고, 단계가 오르면 해당 구획만 다시 지어 솟아오르게 합니다.
import * as THREE from 'three';
import type { LotView, ShopKind, SpotDef, Stage } from '../core/types';
import { stageIndex } from '../core/data';
import { GeoBuilder } from './geo';
import { addFacadeDetails } from './architecture';
import { addStreetProps } from './street';
import { IntersectionLights } from './signals';
import { EnvironmentPlumes, type PlumeEmitter } from '../../outlaw/environment-fx';
import { Colliders, GRID, HALF, PITCH, ROAD, BLOCK, WORLD_HALF, blockTier, blockUnlocked, hash01, recycleFenceSegments, type Block, type Box, type Layout, type Lot } from './layout';
import { asphaltTexture, dirtTexture, facadeMaps, grassTexture, kindColor, puddleTexture, ringTexture, sidewalkTexture, signTexture, type FacadeStyle } from './textures';

export type Quality = 'high' | 'standard' | 'low';
/** 코어가 알려 주는 장소 정보(잠김 여부 포함). */
export type SpotView = (SpotDef | LotView) & { locked: boolean };
const FLOOR = 3.2;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const pick = <T,>(arr: readonly T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
const WALL_TINTS: Record<number, number[]> = {
  0: [0xd8c0a6, 0xc7a98f, 0xb89c88, 0xcdb7a0, 0xa89583, 0xd1a894],
  1: [0xf0e0c8, 0xe6d3b6, 0xd7c9b4, 0xe9d5c0, 0xd9b99a],
  2: [0xe0e0dc, 0xd3d6d9, 0xc9cdd2, 0xdcd5c8],
  3: [0xeaeaea, 0xdfe6ee, 0xd2d9e0],
  4: [0xffffff, 0xe9f1fb, 0xdce9f5],
};
const ROOF_COLORS = [0x4a4d52, 0x55585d, 0x6b6e72, 0x3d3f43];

interface BSpec { floors: number | [number, number, number]; style?: FacadeStyle; w: number; d: number; awning?: boolean; extra?: 'chimney' | 'tower' | 'containers' | 'tank' | 'columns' | 'terminal' | 'warehouse' }
/** 건물이 되는 일반 장소. 잠자리·골목·고물상은 열린 터(OPEN)로 그립니다. */
const KIND_SPEC: Record<string, BSpec> = {
  food: { floors: 2, style: 'shop', w: 9, d: 9, awning: true },
  job: { floors: 2, style: 'shop', w: 12, d: 9, awning: true },
  market: { floors: 2, style: 'shop', w: 12, d: 12, awning: true, extra: 'warehouse' },
  bank: { floors: 5, style: 'office', w: 12, d: 12, extra: 'columns' },
  office: { floors: 14, style: 'glass', w: 12, d: 12, extra: 'tower' },
  airport: { floors: 3, style: 'glass', w: 12, d: 12, extra: 'terminal' },
};
const SHOP_SPEC: Record<ShopKind, BSpec> = {
  stall: { floors: [1, 1, 2], style: 'shop', w: 6, d: 6, awning: true },
  cafe: { floors: [2, 3, 3], style: 'shop', w: 9, d: 9, awning: true },
  mart: { floors: [2, 3, 4], style: 'shop', w: 12, d: 9, awning: true },
  restaurant: { floors: [3, 4, 5], style: 'shop', w: 12, d: 12, awning: true },
  boutique: { floors: [4, 6, 8], style: 'office', w: 12, d: 9 },
  tech: { floors: [6, 9, 12], style: 'glass', w: 12, d: 12, extra: 'tower' },
  factory: { floors: [2, 3, 4], style: 'office', w: 12, d: 12, extra: 'chimney' },
};
const OPEN_KINDS = new Set(['home', 'scrap', 'recycle']);
const isLot = (v: SpotView | undefined): v is LotView & { locked: boolean } => v?.kind === 'lot';
const spotSig = (v: SpotView | undefined): string => !v ? '-' : isLot(v) ? `L${v.locked ? 1 : 0}${v.owner}${v.shop ? `${v.shop.kind}${v.shop.level}${v.shop.name}` : ''}${v.rival ? `${v.rival.rivalId}${v.rival.kind}${v.rival.level}` : ''}` : `${v.kind}${v.locked ? 1 : 0}`;
export const spotColor = (v: SpotView): string => {
  if (v.locked) return '#7a8088';
  if (isLot(v)) return v.owner === 'player' ? '#35c48a' : v.owner === 'rival' ? (v.rival?.color ?? '#d9534f') : '#f2c94c';
  return kindColor(v.kind);
};

interface LotGeo { walls: Record<FacadeStyle, GeoBuilder>; roofs: GeoBuilder; detail: GeoBuilder; glazing: GeoBuilder; glow: GeoBuilder; grass: GeoBuilder; dirt: GeoBuilder; boxes: Box[] }
class BlockView {
  group = new THREE.Group(); bld = new THREE.Group(); disposables: THREE.BufferGeometry[] = [];
  key = ''; rise = 1; riseDelay = 0; crane: THREE.Object3D | null = null; emitters: PlumeEmitter[] = [];
}

/** Release no-longer-visible storefront sign textures after dynamic lot rebuilds. */
export function pruneUnusedSignMaterials(cache: Map<string, THREE.MeshBasicMaterial>, scene: THREE.Object3D): number {
  const visible = new Set<THREE.Material>();
  scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (Array.isArray(node.material)) for (const m of node.material) visible.add(m);
    else visible.add(node.material);
  });
  let freed = 0;
  for (const [key, mat] of cache) {
    if (visible.has(mat)) continue;
    mat.map?.dispose();
    mat.dispose();
    cache.delete(key);
    freed++;
  }
  return freed;
}

export class CityView {
  readonly group = new THREE.Group();
  readonly colliders = new Colliders();
  private views = new Map<Block, BlockView>();
  /** Numeric grid index keeps crowd path checks O(1), without scanning 49 blocks per neighbor. */
  private blocksByIndex = new Map<number, Block>();
  private readonly orderedBlocks: Block[];
  private facade: Record<FacadeStyle, THREE.MeshStandardMaterial>;
  private roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  private detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  private glazingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.21, metalness: 0.32 });
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private walkMat: THREE.MeshStandardMaterial; private dirtMat: THREE.MeshStandardMaterial; private grassMat: THREE.MeshStandardMaterial; private roadMat: THREE.MeshStandardMaterial;
  private wetU = { value: 0 };
  private signMats = new Map<string, THREE.MeshBasicMaterial>();
  private beacons = new Map<string, { group: THREE.Group; ring: THREE.Mesh; beam: THREE.Mesh; lot: Lot; open: boolean }>();
  private stage = -1; private time = 0; private night = 0; private wet = 0;
  private plumes: EnvironmentPlumes;
  private signals: IntersectionLights; private targetId: string | null = null; private spotViews = new Map<string, SpotView>();
  private lampMesh!: THREE.InstancedMesh; private lampGlow!: THREE.InstancedMesh; private poolMesh!: THREE.InstancedMesh;
  private trunkMesh!: THREE.InstancedMesh; private crownMesh!: THREE.InstancedMesh;
  private tmp = new THREE.Object3D();
  private skyline!: THREE.InstancedMesh; private skylineData: Array<{ x: number; z: number; w: number; d: number; h: number; k: number }> = [];
  private construction = new Set<BlockView>();
  private globe: THREE.Group | null = null;
  private ringTex = ringTexture();
  private disposed = false;

  constructor(private layout: Layout, private quality: Quality) {
    for (const b of layout.blocks) this.blocksByIndex.set((b.i + HALF) * GRID + b.j + HALF, b);
    // Rebuilding a block does not change its grid coordinate, so ordering is
    // stable for the lifetime of this city and only needs sorting once.
    this.orderedBlocks = [...layout.blocks].sort((a, b) => a.ring - b.ring || Math.abs(a.i) + Math.abs(a.j) - Math.abs(b.i) - Math.abs(b.j));
    const mk = (style: FacadeStyle, rough: number, metal: number): THREE.MeshStandardMaterial => {
      const m = facadeMaps(style);
      return new THREE.MeshStandardMaterial({ map: m.map, emissiveMap: m.emissive, emissive: 0xffffff, emissiveIntensity: 0.05, vertexColors: true, roughness: rough, metalness: metal });
    };
    this.facade = { slum: mk('slum', 0.95, 0), shop: mk('shop', 0.88, 0), office: mk('office', 0.7, 0.1), glass: mk('glass', 0.18, 0.55) };
    const sw = sidewalkTexture(); this.walkMat = new THREE.MeshStandardMaterial({ map: sw, vertexColors: true, roughness: 0.92 });
    const dt = dirtTexture(); this.dirtMat = new THREE.MeshStandardMaterial({ map: dt, vertexColors: true, roughness: 1 });
    const gt = grassTexture(); this.grassMat = new THREE.MeshStandardMaterial({ map: gt, vertexColors: true, roughness: 1 });
    const at = asphaltTexture(), pt = puddleTexture(); at.repeat.set(WORLD_HALF / 6, WORLD_HALF / 6); pt.repeat.set(WORLD_HALF / 8, WORLD_HALF / 8);
    this.roadMat = new THREE.MeshStandardMaterial({ map: at, roughnessMap: pt, roughness: 0.92, metalness: 0.0 });
    this.roadMat.onBeforeCompile = shader => {
      shader.uniforms.uWet = this.wetU;
      shader.fragmentShader = 'uniform float uWet;\n' + shader.fragmentShader.replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
  roughnessFactor *= mix(1.0, texelRoughness.g * 0.85, uWet);
#endif`);
    };
    this.plumes = new EnvironmentPlumes(quality); this.signals = new IntersectionLights(); this.group.add(this.plumes.group, this.signals.group);
    this.buildGround(); this.buildRoadMarks(); this.buildProps(); this.buildBeacons(); this.buildBackdrop();
  }

  // ---------- 정적 지형 ----------
  private buildGround(): void {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2 + 40, WORLD_HALF * 2 + 40), this.roadMat);
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true;
    const uv = g.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (WORLD_HALF / 6) * 2, uv.getY(k) * (WORLD_HALF / 6) * 2);
    this.roadMat.map!.repeat.set(1, 1); this.roadMat.roughnessMap!.repeat.set(1, 1);
    const uv2 = g.geometry.attributes.uv; void uv2;
    this.group.add(g);
    // 바깥 어두운 땅
    const outer = new THREE.Mesh(new THREE.CircleGeometry(1400, 48), new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.15; this.group.add(outer);
  }
  private buildRoadMarks(): void {
    const roads: number[] = []; for (let k = 0; k <= GRID; k++) roads.push(k * PITCH - (HALF * PITCH + PITCH / 2));
    const dashes: Array<[number, number, boolean]> = [], stripes: Array<[number, number, boolean]> = [];
    for (const r of roads) for (let t = -WORLD_HALF + 4; t < WORLD_HALF - 4; t += 6) {
      const nearX = roads.some(o => Math.abs(t + 1.5 - o) < ROAD / 2 + 1.2);
      if (nearX) continue; dashes.push([r, t + 1.5, true], [t + 1.5, r, false]);
    }
    for (const rx of roads) for (const rz of roads) for (let s = -2.5; s <= 2.5; s += 1) for (const side of [-1, 1]) {
      stripes.push([rx + s * 1.1, rz + side * (ROAD / 2 + 1.1), true], [rx + side * (ROAD / 2 + 1.1), rz + s * 1.1, false]);
    }
    const mk = (list: Array<[number, number, boolean]>, w: number, l: number, color: number, y: number, op: number): void => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, opacity: op }), list.length);
      list.forEach(([x, z, vert], i) => { this.tmp.position.set(x, y, z); this.tmp.scale.set(vert ? w : l, 1, vert ? l : w); this.tmp.updateMatrix(); m.setMatrixAt(i, this.tmp.matrix); });
      m.receiveShadow = true; this.group.add(m);
    };
    mk(dashes, 0.25, 3.2, 0xe9c34a, 0.025, 0.9);
    mk(stripes.filter(s => s[2]), 0.55, 3.4, 0xe8e8e8, 0.03, 0.85);
    mk(stripes.filter(s => !s[2]), 0.55, 3.4, 0xe8e8e8, 0.03, 0.85);
  }
  private buildProps(): void {
    // 가로등(기둥+팔), 머리, 바닥 빛무리
    const lamps: Array<[number, number, number]> = [];
    for (const b of this.layout.blocks) for (const sx of [-1, 1]) for (const sz of [-1, 1]) lamps.push([b.cx + sx * 16.9, b.cz + sz * 16.9, Math.atan2(-sx, -sz)]);
    const pole = new THREE.CylinderGeometry(0.1, 0.14, 7, 6); pole.translate(0, 3.5, 0);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 1.6); arm.translate(0, 7, 0.7);
    const footing = new THREE.CylinderGeometry(0.23, 0.31, 0.38, 8); footing.translate(0, 0.19, 0);
    const hood = new THREE.BoxGeometry(0.56, 0.21, 0.97); hood.translate(0, 7.02, 1.4);
    const poleGeo = mergeSimple([pole, arm, footing, hood]);
    pole.dispose(); arm.dispose(); footing.dispose(); hood.dispose();
    this.lampMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.6 }), lamps.length);
    this.lampGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), lamps.length);
    const pool = new THREE.PlaneGeometry(1, 1); pool.rotateX(-Math.PI / 2);
    this.poolMesh = new THREE.InstancedMesh(pool, new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffcf8a, toneMapped: false }), lamps.length);
    lamps.forEach(([x, z, yaw], i) => {
      const o = this.tmp; o.rotation.set(0, yaw, 0); o.scale.setScalar(1); o.position.set(x, 0.18, z); o.updateMatrix(); this.lampMesh.setMatrixAt(i, o.matrix);
      const dx = Math.sin(yaw) * 1.5, dz = Math.cos(yaw) * 1.5;
      o.position.set(x + dx, 7.06, z + dz); o.updateMatrix(); this.lampGlow.setMatrixAt(i, o.matrix);
      o.rotation.set(0, 0, 0); o.scale.set(13, 1, 13); o.position.set(x + dx, 0.2, z + dz); o.updateMatrix(); this.poolMesh.setMatrixAt(i, o.matrix);
    });
    this.lampMesh.castShadow = false; this.group.add(this.lampMesh, this.lampGlow, this.poolMesh);
    // 나무: 줄기 + 수관(단계에 따라 다시 채움)
    const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6); trunk.translate(0, 1.3, 0);
    this.trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4d3a2a, roughness: 1 }), 700);
    const crown = new THREE.IcosahedronGeometry(1.7, 1); crown.translate(0, 3.6, 0);
    this.crownMesh = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), 700);
    this.trunkMesh.count = this.crownMesh.count = 0; this.trunkMesh.castShadow = this.crownMesh.castShadow = this.quality !== 'low';
    this.group.add(this.trunkMesh, this.crownMesh);
  }
  private refillTrees(): void {
    let n = 0; const col = new THREE.Color();
    const add = (x: number, z: number, s: number, h: number): void => {
      if (n >= 700) return; const o = this.tmp; o.rotation.set(0, h * 6, 0); o.scale.setScalar(s); o.position.set(x, 0.18, z); o.updateMatrix();
      this.trunkMesh.setMatrixAt(n, o.matrix); this.crownMesh.setMatrixAt(n, o.matrix);
      col.setHSL(0.24 + h * 0.08, 0.38 + h * 0.2, 0.2 + h * 0.12); this.crownMesh.setColorAt(n, col); n++;
    };
    const st = this.stage;
    for (const b of this.layout.blocks) {
      if (!blockUnlocked(b, st)) continue;
      const tier = blockTier(b, st);
      if (tier <= 1) for (const [dx, dz] of [[-6, 17], [6, -17], [17, 6], [-17, -6]] as const) { const h = hash01(b.i * 31 + b.j, dx + dz); if (h < 0.45) add(b.cx + dx, b.cz + dz, 0.8 + h, h); }
      else for (const [dx, dz] of [[-9, 17.4], [9, 17.4], [-9, -17.4], [9, -17.4], [17.4, 9], [17.4, -9], [-17.4, 9], [-17.4, -9]] as const) add(b.cx + dx, b.cz + dz, 0.9 + hash01(b.i + dx, b.j + dz) * 0.3, hash01(dx, dz * b.i));
      for (const lot of b.lots) if (lot.kind === 'park') for (let k = 0; k < 4; k++) add(lot.cx + (k % 2 ? 1 : -1) * (4.8 + hash01(lot.id, k) * 0.5), lot.cz + (k < 2 ? 1 : -1) * (5.1 + hash01(lot.id, k + 9) * 0.5), 0.82 + hash01(lot.id, k + 4) * 0.4, hash01(lot.id, k + 20));
    }
    this.trunkMesh.count = this.crownMesh.count = n;
    this.trunkMesh.instanceMatrix.needsUpdate = this.crownMesh.instanceMatrix.needsUpdate = true; if (this.crownMesh.instanceColor) this.crownMesh.instanceColor.needsUpdate = true;
    this.trunkMesh.computeBoundingSphere(); this.crownMesh.computeBoundingSphere();
  }
  private buildBeacons(): void {
    // Every beacon has independent color/opacity, but all share immutable geometry and textures.
    const ringGeometry = new THREE.PlaneGeometry(4.2, 4.2);
    const beamGeometry = new THREE.CylinderGeometry(0.9, 0.9, 11, 16, 1, true);
    const beamMap = beamTexture();
    for (const [id, lot] of this.layout.spotLots) {
      const col = new THREE.Color(kindColor(lot.spot!.kind)), g = new THREE.Group(); g.position.set(lot.doorX, 0.22, lot.doorZ);
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ map: this.ringTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2;
      const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ map: beamMap, color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
      beam.position.y = 5.5; g.add(ring, beam); this.group.add(g); this.beacons.set(id, { group: g, ring, beam, lot, open: true });
    }
  }
  private buildBackdrop(): void {
    // 먼 산 능선
    const seg = 96, pos: number[] = [], idx: number[] = [], R = 1000;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, h = 70 + Math.sin(a * 5) * 40 + Math.sin(a * 13 + 1) * 22 + hash01(k, 3) * 24;
      pos.push(Math.cos(a) * R, -5, Math.sin(a) * R, Math.cos(a) * (R + 60), h, Math.sin(a) * (R + 60));
      if (k < seg) idx.push(k * 2, k * 2 + 1, k * 2 + 3, k * 2, k * 2 + 3, k * 2 + 2);
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx); mg.computeVertexNormals();
    const hills = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0x1b2430, side: THREE.DoubleSide, fog: true })); this.group.add(hills); this.hills = hills;
    // 먼 도심 고층 군(단계가 오르면 높아짐)
    const data: Array<{ x: number; z: number; w: number; d: number; h: number; k: number }> = [];
    for (let k = 0; k < 140; k++) {
      const a = hash01(k, 11) * Math.PI * 2, r = WORLD_HALF + 60 + hash01(k, 12) * 360; data.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 14 + hash01(k, 13) * 22, d: 14 + hash01(k, 14) * 22, h: 40 + hash01(k, 15) * 150 * (1 - (r - WORLD_HALF) / 520), k });
    }
    this.skylineData = data;
    const t = this.facade.office.map!.clone(); t.repeat.set(5, 9); t.needsUpdate = true;
    const em = this.facade.office.emissiveMap!.clone(); em.repeat.set(5, 9); em.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.8, color: 0xb8c4d2 }); this.skylineMat = mat;
    this.skyline = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, data.length); this.group.add(this.skyline);
  }
  private hills!: THREE.Mesh; private skylineMat!: THREE.MeshStandardMaterial;
  private refillSkyline(): void {
    const s = Math.max(0, this.stage), f = 0.35 + s * 0.14;
    this.skylineData.forEach((d, i) => { const o = this.tmp; o.rotation.set(0, 0, 0); o.position.set(d.x, 0, d.z); o.scale.set(d.w, d.h * f, d.d); o.updateMatrix(); this.skyline.setMatrixAt(i, o.matrix); });
    this.skyline.instanceMatrix.needsUpdate = true;
    // Tier growth changes skyline instance heights; stale bounds can incorrectly cull towers.
    this.skyline.computeBoundingSphere();
  }

  // ---------- 상태 갱신 ----------
  /** 단계·장소 상태가 바뀌면 달라진 구획만 다시 짓습니다. animate=true 면 새로 열리거나 자란 구획이 솟아오릅니다. */
  sync(stage: Stage, views: SpotView[], animate: boolean): void {
    const si = stageIndex(stage), changed = this.stage !== si; this.stage = si;
    this.spotViews.clear(); for (const v of views) this.spotViews.set(v.id, v);
    let order = 0, rebuilt = false;
    for (const b of this.orderedBlocks) {
      const key = `${blockUnlocked(b, si) ? 1 : 0}${blockTier(b, si)}|${b.lots.map(l => spotSig(l.spot ? this.spotViews.get(l.spot.id) : undefined)).join(',')}`;
      let v = this.views.get(b);
      if (v && v.key === key) continue;
      const fresh = !v || v.key.slice(0, 2) !== key.slice(0, 2);
      if (!v) { v = new BlockView(); this.views.set(b, v); this.group.add(v.group); } else this.clearBlock(v);
      v.key = key; this.buildBlock(b, v, si); rebuilt = true;
      if (animate && fresh && blockUnlocked(b, si)) { v.rise = 0.02; v.riseDelay = order++ * 0.05; v.bld.scale.y = 0.02; }
    }
    if (changed) { this.refillTrees(); this.refillSkyline(); } this.recolorBeacons();
    if (rebuilt) {
      this.refreshPlumes();
      // A shop can change brand or level repeatedly. Reclaim the retired
      // canvas textures instead of retaining every historic sign in the GPU.
      pruneUnusedSignMaterials(this.signMats, this.group);
    }
    if (this.globeAnchor && !this.globe) this.addGlobe(this.globeAnchor.x, this.globeAnchor.y, this.globeAnchor.z);
    if (this.globe) this.globe.visible = si >= 6;
  }
  private recolorBeacons(): void {
    for (const [id, b] of this.beacons) {
      const view = this.spotViews.get(id), unlocked = blockUnlocked(b.lot.block, this.stage);
      b.open = !!view && !view.locked; b.group.visible = unlocked;
      const col = id === this.targetId ? '#ffffff' : view ? spotColor(view) : '#7a8088';
      for (const m of [b.ring, b.beam]) (m.material as THREE.MeshBasicMaterial).color.set(col);
    }
  }
  /** 배달 목적지 같은 강조 표지(흰색, 더 밝게). */
  setTarget(id: string | null): void { if (id !== this.targetId) { this.targetId = id; this.recolorBeacons(); } }
  blockOpen(i: number, j: number): boolean {
    if (!Number.isInteger(i) || !Number.isInteger(j) || Math.abs(i) > HALF || Math.abs(j) > HALF) return false;
    const b = this.blocksByIndex.get((i + HALF) * GRID + j + HALF);
    return !!b && blockUnlocked(b, this.stage);
  }
  spotView(id: string): SpotView | undefined { return this.spotViews.get(id); }
  /** 문 앞 표지 위치(없으면 null). */
  doorOf(id: string): { x: number; z: number; fx: number; fz: number } | null { const l = this.layout.spotLots.get(id); return l ? { x: l.doorX, z: l.doorZ, fx: l.fx, fz: l.fz } : null; }
  setNight(n: number): void {
    this.night = n;
    const e = 0.04 + n * 0.85;
    for (const m of Object.values(this.facade)) m.emissiveIntensity = e;
    this.skylineMat.emissiveIntensity = 0.04 + n * 0.8;
    (this.lampGlow.material as THREE.MeshBasicMaterial).color.setRGB(0.25 + n * 1.42, 0.21 + n * 1.15, 0.14 + n * 0.74);
    (this.poolMesh.material as THREE.MeshBasicMaterial).opacity = n * 0.85;
    (this.hills.material as THREE.MeshBasicMaterial).color.setHSL(0.6, 0.3, lerp(0.14, 0.05, n));
  }
  setWet(w: number): void {
    this.wet = w;
    this.wetU.value = w; this.roadMat.roughness = lerp(0.92, 0.5, w); this.roadMat.metalness = lerp(0, 0.35, w);
    this.walkMat.roughness = lerp(0.92, 0.55, w);
    for (const m of Object.values(this.facade)) m.roughness = lerp(m === this.facade.glass ? 0.18 : 0.9, 0.35, w * 0.5);
  }
  update(dt: number, player: THREE.Vector3): void {
    this.time += dt;
    let finishedRise = false;
    for (const v of this.views.values()) if (v.rise < 1) {
      if (v.riseDelay > 0) { v.riseDelay -= dt; continue; }
      v.rise = Math.min(1, v.rise + dt / 1.6); const e = 1 - Math.pow(1 - v.rise, 3); v.bld.scale.y = Math.max(0.02, e); if (v.rise === 1) finishedRise = true;
    }
    if (finishedRise) this.refreshPlumes();
    this.plumes.update(this.time, player, this.night, this.wet); this.signals.update(this.time);
    for (const v of this.construction) if (v.crane) v.crane.rotation.y += dt * 0.12;
    for (const b of this.beacons.values()) {
      if (!b.group.visible) continue;
      const d = Math.hypot(player.x - b.lot.doorX, player.z - b.lot.doorZ), near = THREE.MathUtils.clamp(1 - (d - 4) / 40, 0.25, 1), pulse = 0.85 + Math.sin(this.time * 3 + b.lot.id) * 0.15;
      (b.ring.material as THREE.MeshBasicMaterial).opacity = (b.open ? 0.95 : 0.45) * pulse; b.ring.scale.setScalar(1 + Math.sin(this.time * 2 + b.lot.id) * 0.06);
      (b.beam.material as THREE.MeshBasicMaterial).opacity = (b.open ? 0.5 : 0.2) * near * (d < 5 ? 0.45 : 1) * (b.lot.spot!.id === this.targetId ? 1.8 : 1); { const sc = b.lot.spot!.id === this.targetId ? 2.6 : 1; b.beam.scale.y = sc; b.beam.position.y = 5.5 * sc; }
    }
    if (this.globe) { this.globe.rotation.y += dt * 0.5; this.globe.children[1].rotation.x += dt * 0.7; }
  }
  /** 문 앞 표지와 가장 가까운 열린 장소(range 이내). */
  nearestSpot(x: number, z: number, range: number): { id: string; spot: SpotView; dist: number } | null {
    let best: { id: string; spot: SpotView; dist: number } | null = null;
    for (const [id, b] of this.beacons) {
      if (!b.group.visible) continue; const d = Math.hypot(x - b.lot.doorX, z - b.lot.doorZ);
      const sv = this.spotViews.get(id); if (sv && d < range && (!best || d < best.dist)) best = { id, spot: sv, dist: d };
    }
    return best;
  }

  // ---------- 구획 짓기 ----------
  private refreshPlumes(): void { this.plumes.setEmitters([...this.views.values()].filter(v => v.rise === 1).flatMap(v => v.emitters)); }
  private clearBlock(v: BlockView): void {
    this.construction.delete(v); v.emitters.length = 0; v.rise = 1; v.riseDelay = 0;
    if (v.crane) { const mats = new Set<THREE.Material>(); v.crane.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m); }); for (const m of mats) m.dispose(); }
    v.crane = null;
    for (const g of v.disposables) g.dispose(); v.disposables = [];
    v.group.clear(); v.bld = new THREE.Group();
  }
  private addMesh(v: BlockView, parent: THREE.Object3D, gb: GeoBuilder, mat: THREE.Material, cast = true): void {
    const g = gb.build(); if (!g) return; v.disposables.push(g);
    const m = new THREE.Mesh(g, mat); m.castShadow = cast && this.quality !== 'low'; m.receiveShadow = true; parent.add(m);
  }
  private buildBlock(b: Block, v: BlockView, si: number): void {
    const unlocked = blockUnlocked(b, si), tier = blockTier(b, si);
    v.group.add(v.bld);
    const slab = new GeoBuilder(), slabMat = unlocked ? this.walkMat : this.dirtMat, h = BLOCK / 2;
    slab.floor(b.cx - h, b.cz - h, b.cx + h, b.cz + h, 0.18, unlocked ? 0xffffff : 0xc9bda8, unlocked ? 1 / 3 : 1 / 4);
    const curb = unlocked ? 0xb9b8b2 : 0x8a7d6a;
    slab.panel(b.cx, 0.09, b.cz + h, BLOCK, 0.18, 0, 1, curb); slab.panel(b.cx, 0.09, b.cz - h, BLOCK, 0.18, 0, -1, curb); slab.panel(b.cx + h, 0.09, b.cz, BLOCK, 0.18, 1, 0, curb); slab.panel(b.cx - h, 0.09, b.cz, BLOCK, 0.18, -1, 0, curb);
    this.addMesh(v, v.group, slab, slabMat, false);
    if (!unlocked) { this.buildConstruction(b, v); return; }
    const g: LotGeo = { walls: { slum: new GeoBuilder(), shop: new GeoBuilder(), office: new GeoBuilder(), glass: new GeoBuilder() }, roofs: new GeoBuilder(), detail: new GeoBuilder(), glazing: new GeoBuilder(), glow: new GeoBuilder(), grass: new GeoBuilder(), dirt: new GeoBuilder(), boxes: [] };
    for (const lot of b.lots) this.buildLot(lot, tier, g, v);
    g.boxes.push(...addStreetProps(g.detail, g.glow, b, this.quality));
    for (const s of ['slum', 'shop', 'office', 'glass'] as FacadeStyle[]) this.addMesh(v, v.bld, g.walls[s], this.facade[s]);
    this.addMesh(v, v.bld, g.roofs, this.roofMat); this.addMesh(v, v.bld, g.detail, this.detailMat); this.addMesh(v, v.bld, g.glazing, this.glazingMat, false); this.addMesh(v, v.bld, g.glow, this.glowMat, false);
    this.addMesh(v, v.group, g.grass, this.grassMat, false); this.addMesh(v, v.group, g.dirt, this.dirtMat, false);
    this.colliders.set(b, g.boxes);
  }
  private signMat(text: string, color: string, sub: string, dim: boolean): THREE.MeshBasicMaterial {
    const key = `${text}|${color}|${sub}|${dim ? 1 : 0}`; let m = this.signMats.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ map: signTexture(text, color, sub), toneMapped: false }); if (dim) m.color.setScalar(0.4); this.signMats.set(key, m); }
    return m;
  }
  private signPlane(v: BlockView, w: number, hgt: number, x: number, y: number, z: number, nx: number, nz: number, mat: THREE.Material): void {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), mat); sign.position.set(x, y, z); sign.rotation.y = Math.atan2(nx, nz); v.bld.add(sign); v.disposables.push(sign.geometry);
  }
  /** 필지 하나를 종류에 맞게 짓습니다. */
  private buildLot(lot: Lot, tier: number, g: LotGeo, v: BlockView): void {
    const view = lot.spot ? this.spotViews.get(lot.spot.id) : undefined, spot = lot.spot;
    if (!spot) { if (lot.kind === 'park') this.buildPark(lot, g); else this.buildBuilding(lot, tier, g, v, null); return; }
    if (isLot(view) || (spot.kind === 'lot' && !view)) {
      const lv = view as (LotView & { locked: boolean }) | undefined;
      if (lv?.locked) { this.buildPlot(lot, g, v, '공사 중', '#e07a2c', `${spot.name}`, true); return; }
      if (!lv || lv.owner === 'none') { this.buildPlot(lot, g, v, '분양 중', '#d6a02e', `${spot.name} · ${lv?.size ?? 'S'}`, false); return; }
      const sk = (lv.owner === 'player' ? lv.shop?.kind : lv.rival?.kind) ?? 'stall', lvl = Math.max(1, Math.min(3, (lv.owner === 'player' ? lv.shop?.level : lv.rival?.level) ?? 1));
      const text = lv.owner === 'player' ? (lv.shop?.name ?? spot.name) : (lv.rival?.rivalName ?? '라이벌'), sub = lv.owner === 'player' ? `${lv.shop?.kindName ?? ''} Lv${lvl}` : `${lv.rival?.kindName ?? ''} Lv${lvl}`;
      this.buildBuilding(lot, tier, g, v, { spec: SHOP_SPEC[sk], level: lvl, text, sub, color: spotColor(lv), dim: false });
      return;
    }
    if (OPEN_KINDS.has(spot.kind)) { this.buildOpen(lot, spot, g, v); return; }
    this.buildBuilding(lot, tier, g, v, { spec: KIND_SPEC[spot.kind] ?? KIND_SPEC.job, level: 1, text: spot.name, sub: '', color: kindColor(spot.kind), dim: !!view?.locked });
  }
  private buildPark(lot: Lot, g: LotGeo): void {
    g.grass.floor(lot.cx - 7, lot.cz - 7, lot.cx + 7, lot.cz + 7, 0.22, 0xffffff, 1 / 3);
    const { cx, cz } = lot;
    // Cross paths, raised planted beds and seating, rather than a single plain slab.
    g.detail.floor(cx - 7, cz - 0.95, cx + 7, cz + 0.95, 0.235, 0xbdb7ab);
    g.detail.floor(cx - 0.95, cz - 7, cx + 0.95, cz + 7, 0.236, 0xbdb7ab);
    for (const s of [-1, 1]) {
      const bz = cz + s * 2.0;
      g.detail.solid(cx, 0.22, bz, 2.5, 0.47, 0.18, 0x4d5557);
      g.detail.solid(cx, 0.69, bz, 2.8, 0.14, 0.68, 0x8b6848);
      g.detail.solid(cx, 0.8, bz + s * 0.29, 2.8, 0.52, 0.13, 0x967456);
      g.boxes.push({ x0: cx - 1.4, x1: cx + 1.4, z0: bz - 0.36, z1: bz + 0.36 });
      for (const t of [-1, 1]) {
        const px = cx + t * 3.5, pz = cz + s * 3.8;
        g.detail.solid(px, 0.22, pz, 2.6, 0.28, 1.35, 0x85867e);
        g.detail.solid(px, 0.50, pz, 2.3, 0.24, 1.05, 0x4e744b);
        if (this.quality !== 'low') for (let k = 0; k < 5; k++) g.detail.solid(px - 0.8 + k * 0.4, 0.74, pz, 0.16, 0.09, 0.16, (k + lot.id) % 2 ? 0xd6a66e : 0xb76b82);
        g.boxes.push({ x0: px - 1.3, x1: px + 1.3, z0: pz - 0.675, z1: pz + 0.675 });
      }
    }
  }
  /** 울타리 둘러친 땅(분양 중/공사 중). */
  private buildPlot(lot: Lot, g: LotGeo, v: BlockView, text: string, color: string, sub: string, building: boolean): void {
    const x0 = lot.cx - 7, x1 = lot.cx + 7, z0 = lot.cz - 7, z1 = lot.cz + 7, fc = building ? 0xe07a2c : 0xc7b27a;
    g.dirt.floor(x0, z0, x1, z1, 0.2, 0xffffff, 1 / 4);
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) { const px = lot.cx + nx * 6.8, pz = lot.cz + nz * 6.8; g.detail.panel(px, 0.8, pz, 13.6, 1.6, nx, nz, fc); g.detail.panel(px, 0.8, pz, 13.6, 1.6, -nx, -nz, fc); }
    for (let k = 0; k < 3; k++) g.detail.solid(lot.cx - 3 + k * 3, 0.2, lot.cz - 2 + hash01(lot.id, k) * 4, 2 + hash01(k, lot.id) * 1.5, 1.2 + k * 0.4, 2, [0x777f88, 0xb04a3a, 0x3f6fa0][k]);
    if (building) { g.detail.solid(lot.cx, 0.2, lot.cz + 3, 4, 3, 4, 0x8c8f93); g.glow.solid(lot.cx, 3.2, lot.cz + 3, 0.5, 0.5, 0.5, 0xff8a3a); }
    g.boxes.push({ x0: x0 + 0.3, x1: x1 - 0.3, z0: z0 + 0.3, z1: z1 - 0.3 });
    g.detail.solid(lot.cx + lot.fx * 6.6, 0.2, lot.cz + lot.fz * 6.6, lot.fx ? 0.3 : 0.3, 3.6, 0.3, 0x55595e);
    this.signPlane(v, 5.6, 1.4, lot.cx + lot.fx * 6.8, 3.4, lot.cz + lot.fz * 6.8, lot.fx, lot.fz, this.signMat(text, color, sub, false));
  }
  /** 열린 터: 쉼터 벤치, 쓰레기 골목/공원, 고물상. */
  private buildOpen(lot: Lot, spot: SpotDef, g: LotGeo, v: BlockView): void {
    const cx = lot.cx, cz = lot.cz, ax = lot.fz ? 1 : 0, az = lot.fx ? 1 : 0; // 정면에 평행한 방향
    const at = (a: number, d: number): [number, number] => [cx + ax * a + lot.fx * d, cz + az * a + lot.fz * d];
    const sx = (w: number, d: number): [number, number] => [ax ? w : d, az ? w : d];
    const box = (a: number, d: number, w: number, hh: number, dd: number, col: number, y = 0.18, collide = true): void => { const [x, z] = at(a, d), [bw, bd] = sx(w, dd); g.detail.solid(x, y, z, bw, hh, bd, col); if (collide) g.boxes.push({ x0: x - bw / 2, x1: x + bw / 2, z0: z - bd / 2, z1: z + bd / 2 }); };
    const label = (text: string, color: string, sub: string): void => this.signPlane(v, 5.6, 1.4, ...(([x, z]) => [x, 3.3, z] as [number, number, number])(at(0, 6.7)), lot.fx, lot.fz, this.signMat(text, color, sub, false));
    if (spot.kind === 'home') {
      g.grass.floor(cx - 7, cz - 7, cx + 7, cz + 7, 0.2, 0xffffff, 1 / 3);
      for (const a of [-3.5, 3.5]) { box(a, 2, 2.6, 0.12, 0.8, 0x7a5c3a, 0.65, true); box(a, 1.5, 2.6, 0.5, 0.12, 0x6a4c2c, 0.9, false); box(a - 1.1, 2, 0.15, 0.5, 0.6, 0x333, 0.18, false); box(a + 1.1, 2, 0.15, 0.5, 0.6, 0x333, 0.18, false); }
      box(-3.5, -2.4, 3, 1.6, 2.2, 0xa88458); box(-3.5, -2.4, 3.1, 0.15, 2.3, 0x8f6d44, 1.7, false); box(2.2, -3.5, 1.1, 1.0, 1.1, 0x5f7a5c);
      g.glow.solid(...(([x, z]) => [x, 0.22, z] as [number, number, number])(at(-3.5, -1.2)), 0.5, 0.08, 0.5, 0xffd9a0);
      label(spot.name, kindColor('home'), '오늘 밤은 여기서');
    } else if (spot.kind === 'scrap') {
      const alley = spot.name.includes('골목');
      if (alley) {
        g.dirt.floor(cx - 7, cz - 7, cx + 7, cz + 7, 0.2, 0xcfc4b0, 1 / 3);
        for (const [a, d, c] of [[-4, -3, 0x3d6a4a], [-1, -3.4, 0x34557a], [3, -3.1, 0x6a4a3a]] as Array<[number, number, number]>) { box(a, d, 2.4, 1.5, 1.2, c); box(a, d, 2.5, 0.12, 1.3, 0x222, 1.68, false); }
        for (let k = 0; k < 7; k++) box(-5 + k * 1.6, 0.5 + hash01(lot.id, k) * 3, 0.7, 0.6, 0.7, 0x16181a, 0.2, false);
        box(0, -6.3, 13.4, 5, 0.6, 0x7a6858); // 골목 뒤 담
      } else {
        g.grass.floor(cx - 7, cz - 7, cx + 7, cz + 7, 0.22, 0xffffff, 1 / 3);
        box(-3, -2, 0.18, 2.6, 0.18, 0xc0392b, 0.2); box(-1.4, -2, 0.18, 2.6, 0.18, 0xc0392b, 0.2); box(-2.2, -2, 1.9, 0.16, 0.16, 0xc0392b, 2.6, false);
        box(3.5, -1.5, 1.2, 1.6, 4, 0x3a7ac8, 0.2); box(3.5, -4.2, 3, 0.3, 3, 0xd9c28a, 0.2, false);
        box(0, 2.5, 2.4, 0.5, 0.6, 0x7a5c3a, 0.2, true);
      }
      label(spot.name, kindColor('scrap'), '빈 병이 굴러다닌다');
    } else { // recycle
      g.dirt.floor(cx - 7, cz - 7, cx + 7, cz + 7, 0.2, 0xb9ad98, 1 / 3);
      for (const wall of recycleFenceSegments(lot)) {
        g.detail.solid((wall.x0 + wall.x1) / 2, .18, (wall.z0 + wall.z1) / 2, wall.x1 - wall.x0, 2.8, wall.z1 - wall.z0, 0x6d747c);
        g.boxes.push(wall);
      }
      for (let k = 0; k < 9; k++) { const c = [0x8a4b2a, 0x5f6b74, 0x9a8b3a, 0x3f6f8a, 0x777][k % 5]; box(-4.5 + (k % 3) * 2.2, -4 + Math.floor(k / 3) * 1.8, 2 + hash01(k, lot.id) * 1.2, 0.8 + hash01(lot.id, k) * 1.8, 1.6, c, 0.2, false); }
      box(2.5, -3, 4.5, 3.2, 3.4, 0x6d6f73); g.glow.solid(...(([x, z]) => [x, 3.4, z] as [number, number, number])(at(2.5, -3)), 0.5, 0.3, 0.5, 0xff8a3a);
      box(-2, 1, 1.6, 0.6, 1.6, 0x7a4a2a);
      label(spot.name, kindColor('recycle'), '병·캔 매입');
    }
  }
  private buildBuilding(lot: Lot, tier: number, g: LotGeo, v: BlockView, d: { spec: BSpec; level: number; text: string; sub: string; color: string; dim: boolean } | null): void {
    const spec = d?.spec ?? null, r = (k: number): number => hash01(lot.id * 13 + k, tier);
    let floors: number, style: FacadeStyle, w: number, dep: number;
    if (spec) {
      const fl = Array.isArray(spec.floors) ? spec.floors[(d?.level ?? 1) - 1] : spec.floors + Math.floor(tier * (spec.extra === 'tower' ? 1.2 : 0.35));
      floors = fl; style = spec.style ?? 'shop'; w = spec.w; dep = spec.d;
      if (style === 'shop' && tier >= 3) style = 'office';
    } else {
      w = pick([9, 12, 12, 9, 6], r(1)); dep = pick([9, 12, 12, 9], r(2));
      switch (tier) {
        case 0: floors = 2 + Math.floor(r(3) * 2); style = 'slum'; break;
        case 1: floors = 3 + Math.floor(r(3) * 3); style = r(4) < 0.6 ? 'shop' : 'slum'; break;
        case 2: floors = 6 + Math.floor(r(3) * 6); style = r(4) < 0.7 ? 'office' : 'shop'; break;
        case 3: floors = 10 + Math.floor(r(3) * 10); style = r(4) < 0.5 ? 'glass' : 'office'; break;
        default: floors = 18 + Math.floor(r(3) * 18); style = r(4) < 0.7 ? 'glass' : 'office';
      }
    }
    // 정면(fx,fz) 쪽으로 붙여 배치: 정면 면이 필지 가장자리에서 0.6 안쪽
    const fw = lot.fx ? dep : w, fd = lot.fx ? w : dep;
    const front = 7 - 0.6, depth = lot.fx ? fw : fd, along = lot.fx ? fd : fw;
    const offAlong = spec ? 0 : (r(5) - 0.5) * Math.max(0, 14 - along - 1);
    const cx = lot.cx + lot.fx * (front - depth / 2) + (lot.fz ? offAlong : 0), cz = lot.cz + lot.fz * (front - depth / 2) + (lot.fx ? offAlong : 0);
    const H = floors * FLOOR, tints = WALL_TINTS[Math.min(4, style === 'glass' ? 4 : style === 'office' ? Math.max(2, tier) : style === 'shop' ? 1 : 0)], tint = pick(tints, r(6)), roofCol = pick(ROOF_COLORS, r(7));
    const wallB = g.walls[style], setback = floors >= 14 && !spec?.extra;
    if (spec?.extra === 'warehouse') { g.dirt.floor(lot.cx - 7, lot.cz - 7, lot.cx + 7, lot.cz + 7, 0.2, 0xb9ad98, 1 / 3); }
    if (setback) {
      const h1 = Math.floor(floors * 0.62) * FLOOR;
      wallB.box(cx, 0, cz, fw, h1, fd, tint, g.roofs, roofCol); wallB.box(cx, h1, cz, fw - 3, H - h1, fd - 3, tint, g.roofs, roofCol);
      g.detail.solid(cx, H, cz, 1, 3 + r(8) * 6, 1, 0x888e96); g.glow.solid(cx, H + 3 + r(8) * 6, cz, 0.5, 0.5, 0.5, 0xff3030);
    } else wallB.box(cx, 0, cz, fw, H, fd, tint, g.roofs, roofCol);
    g.boxes.push({ x0: cx - fw / 2 - 0.1, x1: cx + fw / 2 + 0.1, z0: cz - fd / 2 - 0.1, z1: cz + fd / 2 + 0.1 });
    if (!setback) {
      if (r(9) < 0.6) g.detail.solid(cx + (r(10) - 0.5) * (fw - 3), H, cz + (r(11) - 0.5) * (fd - 3), 1.8, 1.0, 1.4, 0x8a8f94);
      if (tier <= 1 && r(12) < 0.5) { g.detail.solid(cx - fw / 4, H, cz, 1.7, 1.8, 1.7, 0x6d5a48); g.detail.solid(cx - fw / 4, H + 1.8, cz, 2, 0.3, 2, 0x45392d); }
    }
    const nx = lot.fx, nz = lot.fz, fxp = cx + nx * (depth / 2 + 0.04), fzp = cz + nz * (depth / 2 + 0.04);
    if (!spec && r(13) < 0.6 && this.quality === 'low') g.glow.panel(fxp + nx * 0.02, 1.35, fzp + nz * 0.02, 2.2, 2.5, nx, nz, spec ? 0xffd99a : 0xcaa56a);
    if (tier >= 1 && !spec && r(14) < 0.5 && this.quality === 'low') g.glow.panel(fxp + nx * 0.03, 1.7, fzp + nz * 0.03, Math.min(along - 2, 7), 2.2, nx, nz, pick([0xffc27a, 0x9fd9ff, 0xff9ec1, 0xd5ffb0], r(15)));
    const awning = !!(spec?.awning || (!spec && tier <= 2 && r(16) < 0.4));
    const ac = d ? parseInt(d.color.slice(1), 16) : pick([0xc0443c, 0x3c76c0, 0x3fa56a, 0xd09a2e], r(17));
    if (awning) {
      const aw = Math.min(along - 1, 8);
      g.detail.solid(cx + nx * (depth / 2 + 0.8), 3.0, cz + nz * (depth / 2 + 0.8), nx ? 1.6 : aw, 0.22, nz ? 1.6 : aw, ac);
    }
    addFacadeDetails(g.detail, g.glazing, g.glow, { x: cx, z: cz, w: fw, d: fd, height: H, nx, nz, depth, along, style, accent: ac, landmark: !!spec, industrial: spec?.extra === 'chimney' || spec?.extra === 'warehouse', awning, setback, quality: this.quality });
    if (!d || !spec) return;
    const sw = Math.min(7.6, Math.max(4, along - 0.8));
    this.signPlane(v, sw, sw / 4, cx + nx * (depth / 2 + 0.1), Math.min(H - 1.2, 4.7), cz + nz * (depth / 2 + 0.1), nx, nz, this.signMat(d.text, d.color, d.sub, d.dim));
    const ex = spec.extra;
    if (ex === 'chimney') { g.detail.solid(cx - fw / 4, H, cz - fd / 4, 1.6, 10, 1.6, 0x6b5f57); g.glow.solid(cx - fw / 4, H + 10, cz - fd / 4, 1.0, 0.3, 1.0, 0xff8a3a); v.emitters.push({ x: cx - fw / 4, y: H + 10.35, z: cz - fd / 4, rise: 9, spread: 2.6, smoke: true }); }
    if (ex === 'tower') { g.detail.solid(cx, H, cz, 3, 6, 3, 0x9aa4b0); g.glow.solid(cx, H + 6, cz, 0.4, 0.4, 0.4, 0xff3030); if (d.level >= 3 || spec.floors === 14) g.glow.solid(cx, H + 0.5, cz + nz * (depth / 2 - 0.2), nx ? 0.4 : fw - 1, 0.5, nz ? 0.4 : fd - 1, 0x59b9ff); }
    if (ex === 'columns') for (const k of [-2, -1, 1, 2]) {
      const x = cx + (nz ? k * 2.2 : 0) + nx * (depth / 2 + .5), z = cz + (nx ? k * 2.2 : 0) + nz * (depth / 2 + .5);
      g.detail.solid(x, .2, z, .5, 4.2, .5, 0xe5e1d6); g.boxes.push({ x0: x-.25, x1:x+.25, z0:z-.25, z1:z+.25 });
    }
    if (ex === 'warehouse') for (const k of [-3.4, 3.4]) {
      const x = cx + nz*k + nx*(depth/2+1.05), z = cz + nx*k + nz*(depth/2+1.05);
      g.detail.solid(x,.2,z,1.5,1.5,1.5,0x9a7a4a); g.detail.solid(x,1.7,z,1.35,.75,1.35,0xb07a3a);
      g.boxes.push({x0:x-.75,x1:x+.75,z0:z-.75,z1:z+.75});
    }
    if (ex === 'terminal') {
      g.detail.solid(cx - nz * 3, H, cz + nx * 3, 3, 8, 3, 0xb9c0c8); g.glow.solid(cx - nz * 3, H + 8, cz + nx * 3, 3.4, 0.8, 3.4, 0x59d0ff);
      for (let k = 0; k < 2; k++) { const px = cx - nx * (depth / 2 + 2.5) * 0 + (nz ? (k ? 3 : -3) : 0), pz = cz + (nx ? (k ? 3 : -3) : 0); g.detail.solid(px, H + 0.1, pz, 5, 0.7, 0.7, 0xe8eaee); g.detail.solid(px, H + 0.1, pz, 0.7, 0.4, 3.6, 0xe8eaee); }
    }
    if (spec.style === 'glass' && spec.extra === 'tower' && spec.floors === 14) this.globeAnchor = { x: cx, y: H + 12, z: cz };
  }
  private globeAnchor: { x: number; y: number; z: number } | null = null;
  private addGlobe(x: number, y: number, z: number): void {
    if (this.globe) return;
    const g = new THREE.Group(); g.position.set(x, y, z);
    const sph = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: 0x4bb0ff, wireframe: true, transparent: true, opacity: 0.85, toneMapped: false }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.18, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd24a, toneMapped: false }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0x1b6fd0, toneMapped: false }));
    g.add(sph, ring, core); g.visible = this.stage >= 6; this.group.add(g); this.globe = g;
  }
  private buildConstruction(b: Block, v: BlockView): void {
    const detail = new GeoBuilder(), glow = new GeoBuilder(), fence = new GeoBuilder(), cx = b.cx, cz = b.cz, e = 15.6;
    // 울타리(공사 가림막)와 기둥
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const len = e * 2;
      const px = cx + nx * e, pz = cz + nz * e;
      fence.panel(px, 1.1, pz, len, 2.2, nx, nz, 0xe07a2c); fence.panel(px, 1.1, pz, len, 2.2, -nx, -nz, 0xc86a22);
      for (let k = -2; k <= 2; k++) { glow.solid(px + (nz ? k * 6 : 0), 2.2, pz + (nx ? k * 6 : 0), 0.35, 0.18, 0.35, k % 2 ? 0xffb340 : 0xff7a2a); }
    }
    // 무너진 터에 쌓인 자재와 컨테이너
    for (let k = 0; k < 5; k++) { const rx = (hash01(b.i * 7 + k, b.j) - 0.5) * 22, rz = (hash01(b.j * 5 + k, b.i + 3) - 0.5) * 22, cc = [0x3f6fa0, 0xb04a3a, 0xc29a2a, 0x4a7a5a, 0x777f88][k % 5]; detail.solid(cx + rx, 0.18, cz + rz, 2.4 + hash01(k, b.i) * 1.5, 2.1, 2.4 + hash01(k, b.j) * 3, cc); }
    detail.solid(cx + 5, 0.18, cz - 4, 6, 1.0, 5, 0x6f6455); // 모래더미
    this.addMesh(v, v.group, fence, this.detailMat, false); this.addMesh(v, v.group, detail, this.detailMat); this.addMesh(v, v.group, glow, this.glowMat, false);
    // 크레인
    const crane = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0xf0b830, roughness: 0.6, metalness: 0.2 });
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.1, 30, 1.1), steel); mast.position.y = 15; crane.add(mast);
    const jibPivot = new THREE.Group(); jibPivot.position.y = 30; const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 0.9, 0.9), steel); jib.position.x = 9; const cw = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2), new THREE.MeshStandardMaterial({ color: 0x555a60 })); cw.position.x = -6.5;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false })); lamp.position.set(22, 0.9, 0);
    jibPivot.add(jib, cw, lamp); crane.add(jibPivot); crane.position.set(cx - 7, 0.18, cz + 6); crane.rotation.y = hash01(b.i, b.j) * 6; v.group.add(crane); v.crane = crane; this.construction.add(v);
    v.disposables.push(mast.geometry, jib.geometry, cw.geometry, lamp.geometry);
    // 안내판(구획당 하나지만 텍스처는 공유)
    if (!this.constructionSign) this.constructionSign = new THREE.MeshBasicMaterial({ map: signTexture('재개발 예정 구역', '#e07a2c', '레벨을 올리면 열립니다'), toneMapped: false });
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), this.constructionSign); sg.position.set(cx, 3.4, cz + 15.7); v.group.add(sg); v.disposables.push(sg.geometry);
    const sg2 = sg.clone(); sg2.position.set(cx, 3.4, cz - 15.7); sg2.rotation.y = Math.PI; v.group.add(sg2);
    this.colliders.set(b, [{ x0: cx - e, x1: cx + e, z0: cz - e, z1: cz + e }]);
  }
  private constructionSign: THREE.MeshBasicMaterial | null = null;

  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.plumes.dispose(); this.signals.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>([...Object.values(this.facade), this.roofMat, this.detailMat, this.glazingMat, this.glowMat, this.walkMat, this.dirtMat, this.grassMat, this.roadMat, ...this.signMats.values()]);
    if (this.constructionSign) materials.add(this.constructionSign);
    const textures = new Set<THREE.Texture>([this.ringTex]);
    this.group.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); if (o instanceof THREE.InstancedMesh) o.dispose(); } });
    for (const v of this.views.values()) for (const g of v.disposables) geometries.add(g);
    for (const m of materials) { const t = m as THREE.MeshStandardMaterial; for (const tex of [t.map, t.emissiveMap, t.roughnessMap]) if (tex) textures.add(tex); m.dispose(); }
    for (const g of geometries) g.dispose(); for (const t of textures) t.dispose();
    this.group.removeFromParent(); this.group.clear(); this.views.clear(); this.blocksByIndex.clear(); this.signMats.clear(); this.beacons.clear(); this.construction.clear();
  }
}

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = []; let base = 0;
  for (const g0 of geos) { const g = g0.index ? g0 : g0; const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); base += p.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setIndex(idx); return out;
}
function poolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,.9)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); return new THREE.CanvasTexture(c);
}
