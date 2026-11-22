// OUTLAW CITY의 청크 도시·거리 소품·네온과 시간에 따라 변하는 하늘 및 조명을 그립니다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bake } from '../city/models';
import { makeRng, type CityMap, type Prop, type PropKind } from './types';
import { signal } from './world';
import * as tex from './textures';
import type { OutlawAssets } from './assets';
import { makeEnvironment } from '../shared/gfx';

export type Quality = 'high' | 'standard' | 'low';
type Batch = Map<THREE.Material, THREE.BufferGeometry[]>;
interface Chunk { root: THREE.Group; x: number; z: number; batch: Batch }
interface Lamps { mesh: THREE.InstancedMesh; groups: number[]; lamps: number[] }
const UP = new THREE.Vector3(0, 1, 0);
/** 태양 그림자 상자 반폭(m)·맵 해상도·시선 앞쪽으로 미는 거리. 상자 밖은 그림자가 없어 경계가 보이므로 넉넉히 잡습니다. */
const SHADOW_HALF = 150, SHADOW_MAP = 3072, SHADOW_LEAD = 60;
/** 한 변의 청크 수. 청크가 작을수록 시야·그림자 절두체 컬링으로 건너뛰는 지오메트리가 늘어납니다(드로우콜은 청크 수만큼 늘어남). */
const CHUNKS = 8;

// shooter/view.ts의 worldBox/buildBuildings처럼 월드 UV와 재질별 병합으로 건물 수와 드로우콜을 분리합니다.
function surface(g: THREE.BufferGeometry, tile = 4, tint = 0xffffff, facade = false): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g; if (flat !== g) g.dispose();
  const p = flat.getAttribute('position'), n = flat.getAttribute('normal'), uv = new Float32Array(p.count * 2), color = new Float32Array(p.count * 3), c = new THREE.Color(tint);
  for (let i = 0; i < p.count; i++) {
    const vertical = Math.abs(n.getY(i)) < .5;
    uv[i * 2] = (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / (facade && vertical ? 18 : tile);
    uv[i * 2 + 1] = (vertical ? p.getY(i) : p.getZ(i)) / (facade && vertical ? 3.3 : tile);
    const shade = n.getY(i) > .5 ? 1 : n.getY(i) < -.5 ? .65 : Math.abs(n.getX(i)) > .5 ? .82 : .92;
    color.set([c.r * shade, c.g * shade, c.b * shade], i * 3);
  }
  flat.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); flat.setAttribute('color', new THREE.BufferAttribute(color, 3)); flat.clearGroups(); return flat;
}
function box(x: number, y: number, z: number, w: number, h: number, d: number, tile = 4, tint = 0xffffff, facade = false): THREE.BufferGeometry {
  return surface(new THREE.BoxGeometry(w, h, d).translate(x, y, z), tile, tint, facade);
}
function plane(x: number, y: number, z: number, w: number, d: number, tile = 4): THREE.BufferGeometry {
  return surface(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z), tile);
}
function wedge(w: number, d: number, h: number, gable: boolean): THREE.BufferGeometry {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(gable ? 0 : d / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, steps: 1 });
  // 단면의 가로를 z, 압출축을 x에 놓습니다.
  g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0); return g;
}
// GLB의 색과 실루엣을 유지하며 정점 군집화합니다. 수천 개 소품의 원본 고밀도 면을 그대로 복제하지 않습니다.
function propGeometry(source: THREE.BufferGeometry, budget: number): THREE.BufferGeometry {
  const count = source.index ? source.index.count : source.getAttribute('position').count; if (count / 3 <= budget) return source;
  source.computeBoundingBox(); const bounds = source.boundingBox!, size = bounds.getSize(new THREE.Vector3());
  const p = source.getAttribute('position'), c = source.getAttribute('color'); let result: THREE.BufferGeometry | null = null;
  for (let cells = 12; cells >= 1; cells--) {
    const clusters = new Map<string, number>(), remap: number[] = [], sums: number[][] = [];
    for (let i = 0; i < p.count; i++) {
      const key = [Math.round((p.getX(i) - bounds.min.x) / Math.max(size.x, .001) * cells), Math.round((p.getY(i) - bounds.min.y) / Math.max(size.y, .001) * cells), Math.round((p.getZ(i) - bounds.min.z) / Math.max(size.z, .001) * cells)].join(',');
      let id = clusters.get(key); if (id === undefined) { id = sums.length; clusters.set(key, id); sums.push([0, 0, 0, 0, 0, 0, 0]); }
      remap[i] = id; const a = sums[id]; a[0] += p.getX(i); a[1] += p.getY(i); a[2] += p.getZ(i); a[3] += c ? c.getX(i) : 1; a[4] += c ? c.getY(i) : 1; a[5] += c ? c.getZ(i) : 1; a[6]++;
    }
    const indices: number[] = [], seen = new Set<string>();
    for (let i = 0; i < count; i += 3) {
      const a = remap[source.index ? source.index.getX(i) : i], b = remap[source.index ? source.index.getX(i + 1) : i + 1], c = remap[source.index ? source.index.getX(i + 2) : i + 2];
      if (a === b || b === c || a === c) continue; const key = [a, b, c].sort((x, y) => x - y).join(','); if (seen.has(key)) continue; seen.add(key); indices.push(a, b, c);
    }
    result?.dispose(); result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(sums.flatMap(a => a.slice(0, 3).map(v => v / a[6])), 3)); result.setAttribute('color', new THREE.Float32BufferAttribute(sums.flatMap(a => a.slice(3, 6).map(v => v / a[6])), 3)); result.setIndex(indices); result.computeVertexNormals();
    if (indices.length / 3 <= budget) break;
  }
  source.dispose(); return result!;
}
export class CityView {
  night = 0;
  private root = new THREE.Group();
  private chunks: Chunk[] = [];
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private facades: THREE.MeshStandardMaterial[] = [];
  private neon: THREE.MeshStandardMaterial[] = [];
  private reflections: THREE.MeshBasicMaterial[] = [];
  private poolMap: THREE.Texture | null = null;
  private sky = tex.makeSkyDome();
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private moon = new THREE.DirectionalLight(0x8faedb, .2);
  private fog = new THREE.FogExp2(0xb9cbd0, .0018);
  private oldFog: THREE.Scene['fog'];
  private oldBackground: THREE.Scene['background'];
  private oldEnvironment: THREE.Scene['environment'];
  private environment: THREE.Texture | null = null;
  private asphalt: THREE.MeshStandardMaterial | null = null;
  private oldRenderer: { tone: THREE.ToneMapping; exposure: number; shadows: boolean; shadowType: THREE.ShadowMapType };
  private bulbs = new THREE.MeshBasicMaterial({ color: 0xffdfaa });
  private glow = new THREE.MeshBasicMaterial({ color: 0xffd39b, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  private lampHeads: THREE.InstancedMesh[] = [];
  private lampPools: THREE.InstancedMesh[] = [];
  /** 적응형 화질이 줄이는 그리기 거리 배율(1 = 기본). */
  private drawScale = 1;
  private signals: Lamps | null = null;
  private signalTick = -Infinity;
  private disposed = false;
  private scratch = new THREE.Vector3(); private lookDir = new THREE.Vector3(0, 0, -1);
  private matrix = new THREE.Object3D();

  constructor(readonly scene: THREE.Scene, readonly renderer: THREE.WebGLRenderer, readonly map: CityMap, readonly assets: OutlawAssets | null, readonly quality: Quality) {
    this.oldFog = scene.fog; this.oldBackground = scene.background; this.oldEnvironment = scene.environment;
    this.oldRenderer = { tone: renderer.toneMapping, exposure: renderer.toneMappingExposure, shadows: renderer.shadowMap.enabled, shadowType: renderer.shadowMap.type };
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = quality === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.fog = this.fog; this.root.name = 'OUTLAW CITY / static'; scene.add(this.root);
    if (quality === 'high') { this.environment = makeEnvironment(renderer, { top: 0x7396bd, horizon: 0xe5c2a5, ground: 0x30383a, sun: 0xffdfb3, sunDir: [0.5, 0.7, 0.3], sunPower: 4 }); scene.environment = this.environment; }
    this.root.add(this.sky.mesh, this.hemi, this.sun, this.sun.target, this.moon, this.moon.target);
    this.materials.add(this.sky.mesh.material as THREE.Material); this.materials.add(this.bulbs); this.materials.add(this.glow);
    this.sun.castShadow = quality === 'high'; const shadow = this.sun.shadow;
    shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP); Object.assign(shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 650 });
    shadow.bias = -.00025; shadow.normalBias = .12; shadow.camera.updateProjectionMatrix();
    const size = map.half * 2 / CHUNKS;
    for (let z = 0; z < CHUNKS; z++) for (let x = 0; x < CHUNKS; x++) {
      const root = new THREE.Group(); root.name = `city chunk ${x},${z}`; this.root.add(root);
      this.chunks.push({ root, x: -map.half + (x + .5) * size, z: -map.half + (z + .5) * size, batch: new Map() });
    }
    for (let i = 0; i < 6; i++) { const f = tex.facadeTexture(i); this.facades.push(this.mat({ map: this.texture(f.map), emissiveMap: this.texture(f.emissive), emissive: 0xffe5be, emissiveIntensity: 0, roughness: i === 0 ? .36 : .82, metalness: i === 0 ? .25 : .02, vertexColors: true })); }
    this.buildGround(); this.buildBuildings(); this.buildRamps(); this.buildProps(); this.buildSignals(); this.buildHorizon();
    for (const c of this.chunks) this.flush(c.batch, c.root);
    // 처음 렌더하기 전에도 황혼 조명이 준비됩니다.
    this.lighting(16.6, new THREE.Vector3(), 0);
  }
  private texture(source: THREE.Texture): THREE.Texture {
    // textures.ts의 캐시는 다른 뷰도 사용하므로 소유권을 분리합니다.
    const copy = source.clone(); copy.needsUpdate = true; this.textures.add(copy); return copy;
  }
  private poolTexture(): THREE.Texture {
    if (this.poolMap) return this.poolMap;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,.8)'); grad.addColorStop(.35, 'rgba(255,255,255,.23)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(canvas); this.textures.add(t); this.poolMap = t; return t;
  }  private mat(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial { const m = new THREE.MeshStandardMaterial(p); this.materials.add(m); return m; }
  private chunk(x: number, z: number): Chunk { const s = this.map.half * 2 / CHUNKS; return this.chunks[THREE.MathUtils.clamp(Math.floor((z + this.map.half) / s), 0, CHUNKS - 1) * CHUNKS + THREE.MathUtils.clamp(Math.floor((x + this.map.half) / s), 0, CHUNKS - 1)]; }
  private put(x: number, z: number, m: THREE.Material, g: THREE.BufferGeometry): void { const b = this.chunk(x, z).batch; const a = b.get(m); if (a) a.push(g); else b.set(m, [g]); }
  private flush(batch: Batch, root: THREE.Group): void {
    for (const [m, list] of batch) {
      const g = mergeGeometries(list, false); for (const part of list) part.dispose();
      if (!g) throw new Error('City geometry attributes do not match');
      g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true;
      mesh.castShadow = !(m.transparent || m.userData.ground); mesh.frustumCulled = true; root.add(mesh);
    } batch.clear();
  }
  private buildGround(): void {
    const asphalt = this.mat({ map: this.texture(tex.asphaltTexture()), color: 0x9ca7ac, roughness: .78, metalness: .08 }); asphalt.userData.ground = true; this.asphalt = asphalt;
    const ground = new THREE.Mesh(plane(0, -.025, 0, 4400, 4400, 12), asphalt); ground.receiveShadow = true; this.root.add(ground);
    const walk = this.mat({ map: this.texture(tex.sidewalkTexture()), roughness: .93 }); walk.userData.ground = true;
    const grass = this.mat({ map: this.texture(tex.grassTexture()), roughness: 1 }); grass.userData.ground = true;
    const dirt = this.mat({ map: this.texture(tex.dirtTexture()), roughness: 1 }); dirt.userData.ground = true;
    const paint = this.mat({ color: 0xe1dbc3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); paint.userData.ground = true;
    const yellow = this.mat({ color: 0xe6bb57, polygonOffset: true, polygonOffsetFactor: -2 }); yellow.userData.ground = true;
    const crossing = this.mat({ map: this.texture(tex.crosswalkTexture()), transparent: true, alphaTest: .1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const { gx, roadW, sidewalkW } = this.map;
    for (let iz = 0; iz < gx.length - 1; iz++) for (let ix = 0; ix < gx.length - 1; ix++) {
      const x = (gx[ix] + gx[ix + 1]) / 2, z = (gx[iz] + gx[iz + 1]) / 2, w = gx[ix + 1] - gx[ix] - roadW, d = gx[iz + 1] - gx[iz] - roadW;
      this.put(x, z, walk, box(x, .055, z, w, .19, d, 8));
      // 경계석 안쪽은 어둡게 하여 차도와의 높이 차를 드러냅니다.
      this.put(x, z, dirt, plane(x, .154, z, w - sidewalkW * 2, d - sidewalkW * 2, 10));
    }
    for (const p of this.map.parks) {
      this.put(p.x, p.z, grass, plane(p.x, .17, p.z, p.w, p.d, 8));
      this.put(p.x, p.z, walk, plane(p.x, .18, p.z, p.w, 4, 8)); this.put(p.x, p.z, walk, plane(p.x, .18, p.z, 4, p.d, 8));
      const r = makeRng(this.map.seed + p.x + p.z); const blades: THREE.BufferGeometry[] = [];
      for (let i = 0; i < (this.quality === 'low' ? 90 : 180); i++) { const x = p.x + (r() - .5) * p.w, z = p.z + (r() - .5) * p.d; if (Math.abs(x - p.x) < 3 || Math.abs(z - p.z) < 3) continue; blades.push(surface(new THREE.ConeGeometry(.22, .6, 3).translate(x, .45, z))); }
      for (const g of blades) this.put(p.x, p.z, grass, g);
    }
    for (const road of this.map.roads) {
      const dx = road.bx - road.ax, dz = road.bz - road.az, len = Math.hypot(dx, dz), x = (road.ax + road.bx) / 2, z = (road.az + road.bz) / 2, horizontal = Math.abs(dx) > Math.abs(dz);
      for (let n = 14; n < len - 12; n += 9) { const px = road.ax + dx * n / len, pz = road.az + dz * n / len; this.put(x, z, yellow, plane(px, .014, pz, horizontal ? 4 : .15, horizontal ? .15 : 4)); }
      for (const s of [-1, 1]) {
        const px = x + (horizontal ? 0 : s * 6.4), pz = z + (horizontal ? s * 6.4 : 0);
        this.put(x, z, paint, plane(px, .012, pz, horizontal ? len - 22 : .12, horizontal ? .12 : len - 22));
      }
    }
    for (const x of gx) for (const z of gx) for (let s = 0; s < 4; s++) {
      const a = s * Math.PI / 2, px = x + Math.cos(a) * 10, pz = z + Math.sin(a) * 10;
      const g = new THREE.PlaneGeometry(roadW - 1, 3).rotateX(-Math.PI / 2).rotateY(a + Math.PI / 2).translate(px, .02, pz);
      const f = surface(g); const uv = f.getAttribute('uv'); const pos = f.getAttribute('position');
      for (let i = 0; i < uv.count; i++) { const xx = pos.getX(i) - px, zz = pos.getZ(i) - pz; uv.setXY(i, .5 + (-xx * Math.sin(a) + zz * Math.cos(a)) / (roadW - 1), .5 + (xx * Math.cos(a) + zz * Math.sin(a)) / 3); }
      this.put(x, z, crossing, f);
      this.put(x, z, paint, plane(x + Math.cos(a) * 12.3 - Math.sin(a) * 3.5, .018, z + Math.sin(a) * 12.3 + Math.cos(a) * 3.5, s % 2 ? 6 : .4, s % 2 ? .4 : 6));
    }
  }
  private buildBuildings(): void {
    const roof = this.mat({ map: this.texture(tex.roofTexture()), vertexColors: true, roughness: .9 });
    const tile = this.mat({ map: this.texture(tex.tileRoofTexture()), vertexColors: true, roughness: .9 });
    const equipment = this.mat({ color: 0x8c9598, roughness: .73, metalness: .24, vertexColors: true });
    const trim = this.mat({ color: 0x777975, roughness: .78, metalness: .12, vertexColors: true });
    const darkTrim = this.mat({ color: 0x303a40, roughness: .55, metalness: .32, vertexColors: true });
    const glass = this.mat({ color: 0x78909a, roughness: .24, metalness: .38, vertexColors: true });
    const signMats = new Map<string, THREE.MeshStandardMaterial>(); const signBatch: Batch = new Map(), poolBatch: Batch = new Map();
    const pools = new Map<string, THREE.MeshBasicMaterial>();
    const names: Record<string, string> = { gunshop: 'GUN SHOP', bank: 'BANK', casino: 'CASINO', club: 'BLUE HOUR', paynspray: 'PAY N SPRAY', hospital: 'HOSPITAL', police: 'POLICE', safehouse: 'OAK ST.', garage: 'MOTOR WORKS', chopshop: 'IRON YARD', dealer: 'PRESTIGE MOTORS', gym: 'STEEL GYM', arena: 'THE PIT' };
    for (const b of this.map.buildings) {
      this.put(b.x, b.z, this.facades[b.tex % 6], box(b.x, b.h / 2 + .15, b.z, b.w, b.h, b.d, 4, new THREE.Color(b.color).lerp(new THREE.Color(0xffffff), .65).getHex(), true));
      this.put(b.x, b.z, roof, box(b.x, b.h + .2, b.z, b.w + .45, .3, b.d + .45));
      // Street-level plinths, cornices and recessed entrances break up the flat facade.
      const front = b.z - b.d / 2;
      this.put(b.x, b.z, trim, box(b.x, .45, front - .09, b.w + .16, .58, .22));
      this.put(b.x, b.z, trim, box(b.x, Math.min(b.h - .4, 4.1), front - .11, b.w + .22, .18, .28));
      this.put(b.x, b.z, trim, box(b.x, b.h - .35, front - .1, b.w + .25, .24, .24));
      if (b.h > 7 && b.w > 7) {
        const doorW = Math.min(2.3, b.w * .22);
        this.put(b.x, b.z, darkTrim, box(b.x, 1.75, front - .15, doorW + .36, 3.2, .18));
        this.put(b.x, b.z, glass, box(b.x, 1.9, front - .26, doorW, 2.7, .06));
        this.put(b.x, b.z, trim, box(b.x, 1.9, front - .3, .07, 2.7, .08));
        for (const side of [-1, 1]) {
          this.put(b.x, b.z, trim, box(b.x + side * (b.w / 2 - .22), b.h / 2, front - .1, .24, b.h - .5, .24));
          this.put(b.x, b.z, darkTrim, box(b.x + side * (doorW / 2 + .15), 3.45, front - .3, .18, .25, .28));
        }
      }
      if (this.quality !== 'low' && b.h > 12) {
        for (let y = 7; y < b.h - 2; y += 9.9) this.put(b.x, b.z, trim, box(b.x, y, front - .06, b.w, .1, .14));
      }
      if (b.roof === 'gable') this.put(b.x, b.z, tile, surface(wedge(b.w + .8, b.d + .8, Math.min(b.w, b.d) * .22, true).translate(b.x, b.h + .35, b.z)));
      else {
        this.put(b.x, b.z, equipment, box(b.x - b.w * .2, b.h + 1, b.z, 2.7, 1.5, 2));
        this.put(b.x, b.z, equipment, box(b.x + b.w * .25, b.h + 2, b.z + b.d * .2, .09, 3.7, .09));
        if (b.roof === 'tank') {
          this.put(b.x, b.z, equipment, surface(new THREE.CylinderGeometry(1.8, 1.8, 3.2, 10).translate(b.x + b.w * .2, b.h + 2.4, b.z)));
          for (const s of [-1, 1]) this.put(b.x, b.z, equipment, box(b.x + b.w * .2 + s, b.h + .55, b.z, .16, 1, 2.2));
        }
        if (b.kind === 'factory') this.put(b.x, b.z, roof, box(b.x, b.h + 5, b.z, 1.8, 10, 1.8));
        if (b.kind === 'tower') this.put(b.x, b.z, equipment, box(b.x, b.h + 1.2, b.z, b.w * .58, 2, b.d * .58));
      }
      const poi = this.map.pois.find(p => p.building === b.id && names[p.kind]); if (!b.neon && !poi) continue;
      const label = poi ? names[poi.kind] : b.id % 2 ? 'NIGHTLINE' : 'AFTER HOURS';
      const color = poi?.kind === 'hospital' || poi?.kind === 'police' || b.id % 2 ? '#3df2ff' : '#ff3d81';
      const key = label + color; let m = signMats.get(key);
      if (!m) { const t = this.texture(tex.neonSignTexture(label, color)); m = this.mat({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: .2, roughness: .4, side: THREE.DoubleSide }); signMats.set(key, m); this.neon.push(m); }
      const small = poi?.kind === 'safehouse', w = small ? 3.6 : Math.min(b.w * .9, label.length > 8 ? 17 : 14), h = small ? 1.5 : 3.7;
      const g = new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(b.x, Math.min(b.h - 1, small ? 3 : 6), b.z - b.d / 2 - .06);
            if (this.quality !== 'low' && !small) {
        let pool = pools.get(color);
        if (!pool) { pool = new THREE.MeshBasicMaterial({ map: this.poolTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }); pools.set(color, pool); this.materials.add(pool); this.reflections.push(pool); }
        const reflection = new THREE.PlaneGeometry(w * 1.5, 11).rotateX(-Math.PI / 2).translate(b.x, .193, b.z - b.d / 2 - 4.5);
        const parts = poolBatch.get(pool); if (parts) parts.push(reflection); else poolBatch.set(pool, [reflection]);
      }
      const list = signBatch.get(m); if (list) list.push(g); else signBatch.set(m, [g]);
    }
    this.flush(signBatch, this.root); this.flush(poolBatch, this.root);
  }
  private buildRamps(): void {
    const metal = this.mat({ color: 0x333940, roughness: .7, side: THREE.DoubleSide, vertexColors: true });
    const yellow = this.mat({ color: 0xffcc39, vertexColors: true, roughness: .6 });
    for (const r of this.map.ramps) {
      // world.ts의 지면 높이와 일치하도록 +x 방향으로 올라갑니다.
      this.put(r.x, r.z, metal, surface(wedge(r.w, r.len, r.h, false).rotateY(Math.PI / 2).translate(r.x, .03, r.z)));
      for (const s of [-1, 1]) for (let k = 0; k < r.len; k += 1.5) {
        const g = new THREE.BoxGeometry(.75, .07, .22).rotateZ(Math.atan2(r.h, r.len)).translate(r.x - r.len / 2 + k + .375, .09 + r.h * (k + .375) / r.len, r.z + s * (r.w / 2 - .15)); this.put(r.x, r.z, yellow, surface(g));
      }
    }
  }
  // city/render3d.ts처럼 같은 소품은 행렬만 갖는 인스턴스로 묶되, 청크별로 나눠 절두체·거리 컬링이 먹히게 합니다(전부 한 덩어리면 도시 전체가 매 프레임 그려집니다).
  private instances(g: THREE.BufferGeometry, m: THREE.Material, props: readonly Prop[]): THREE.InstancedMesh[] {
    const groups = new Map<Chunk, Prop[]>();
    for (const p of props) { const c = this.chunk(p.x, p.z), a = groups.get(c); if (a) a.push(p); else groups.set(c, [p]); }
    const meshes: THREE.InstancedMesh[] = [];
    for (const [c, list] of groups) {
      const mesh = new THREE.InstancedMesh(g, m, list.length);
      list.forEach((p, i) => { this.matrix.position.set(p.x, .15, p.z); this.matrix.rotation.set(0, -p.ry, 0); this.matrix.scale.setScalar(p.scale); this.matrix.updateMatrix(); mesh.setMatrixAt(i, this.matrix.matrix); });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = !(m instanceof THREE.MeshBasicMaterial); mesh.receiveShadow = true; c.root.add(mesh); meshes.push(mesh);
    }
    return meshes;
  }
  private buildProps(): void {
    const groups = new Map<PropKind, Prop[]>();
    this.map.props.forEach((p, i) => { if (this.quality === 'low' && i % 2) return; const a = groups.get(p.kind); if (a) a.push(p); else groups.set(p.kind, [p]); });
    const fixed = this.mat({ vertexColors: true, roughness: .83 });
    const lit = new THREE.MeshBasicMaterial({ vertexColors: true }); this.materials.add(lit);
    for (const [kind, props] of groups) {
      const source = this.assets?.props[kind];
      if (source) { const baked = bake(source); for (const [part, g] of Object.entries(baked)) if (g) this.instances(propGeometry(g, props.length > 1000 ? 64 : 130), part === 'glow' ? lit : fixed, props); }
      else {
        const parts: THREE.BufferGeometry[] = [], add = (g: THREE.BufferGeometry, color: number): void => { parts.push(surface(g, 4, color)); };
        if (kind.startsWith('tree')) {
          add(new THREE.CylinderGeometry(.18, .28, 3.3, 5).translate(0, 1.65, 0), 0x665346);
          add((kind === 'tree_pine' ? new THREE.ConeGeometry(1.8, 5, 7) : new THREE.IcosahedronGeometry(2.1, 1)).translate(0, 4.3, 0), 0x536b4c);
        } else if (kind === 'lamp') {
          add(new THREE.CylinderGeometry(.07, .14, 7, 6).translate(0, 3.5, 0), 0x3c454b); add(new THREE.BoxGeometry(1.8, .14, .15).translate(.8, 7, 0), 0x3c454b);
        } else if (kind === 'bench' || kind === 'bus_stop') {
          add(new THREE.BoxGeometry(2.7, .15, .65).translate(0, .65, 0), 0x94745b); add(new THREE.BoxGeometry(2.7, .6, .12).translate(0, 1, -.3), 0x94745b);
          for (const s of [-1, 1]) add(new THREE.BoxGeometry(.12, .65, .5).translate(s, .33, 0), 0x3e484a);
          if (kind === 'bus_stop') { add(new THREE.BoxGeometry(3.5, .15, 1.7).translate(0, 2.7, 0), 0x46545a); for (const s of [-1, 1]) add(new THREE.BoxGeometry(.1, 2.7, .1).translate(s * 1.6, 1.35, -.7), 0x46545a); }
        } else if (kind === 'billboard') {
          add(new THREE.BoxGeometry(.35, 5, .35).translate(0, 2.5, 0), 0x454c51); add(new THREE.BoxGeometry(7, 3.5, .2).translate(0, 5, 0), 0x272c33);
        } else if (kind === 'food_cart') {
          add(new THREE.BoxGeometry(2.1, .9, 1.1).translate(0, .85, 0), 0xc9522f); add(new THREE.BoxGeometry(2.2, .12, 1.2).translate(0, 1.35, 0), 0xe8e2d2);
          add(new THREE.BoxGeometry(2.5, .1, 1.7).translate(0, 2.35, 0), 0xd8b23a); for (const sx of [-1, 1]) add(new THREE.BoxGeometry(.08, 1.2, .08).translate(sx * 1.1, 1.8, .5), 0x3c454b);
          for (const sx of [-.8, .8]) add(new THREE.CylinderGeometry(.32, .32, .12, 8).rotateX(Math.PI / 2).translate(sx, .32, .6), 0x25292c);
        } else if (kind === 'bike_rack') {
          for (let i = -2; i <= 2; i++) add(new THREE.TorusGeometry(.3, .035, 4, 8, Math.PI).translate(i * .5, .3, 0), 0x8d979c);
          add(new THREE.BoxGeometry(2.6, .05, .08).translate(0, .06, 0), 0x3c454b);
        } else if (kind === 'newsstand') {
          add(new THREE.BoxGeometry(1.8, 2.2, 1.1).translate(0, 1.1, 0), 0x3f6b5a); add(new THREE.BoxGeometry(2.1, .12, 1.4).translate(0, 2.3, 0), 0xb34b45);
          add(new THREE.BoxGeometry(1.5, .9, .08).translate(0, 1.3, .58), 0xe3d7b0);
        } else if (kind === 'cone') add(new THREE.ConeGeometry(.3, .8, 6).translate(0, .4, 0), 0xd68543);
        else {
          const wide = ['kiosk', 'dumpster', 'barrier'].includes(kind), tall = ['phone_booth', 'kiosk', 'vending'].includes(kind), color = kind === 'hydrant' ? 0xa45d46 : kind === 'mailbox' ? 0x45637d : 0x65716c;
          add(new THREE.BoxGeometry(wide ? 2 : .55, tall ? 2.3 : .9, wide ? 1 : .55).translate(0, tall ? 1.15 : .45, 0), color);
        }
        const g = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); this.instances(g, fixed, props);
      }
      if (kind === 'billboard') {
        const m = this.mat({ map: this.texture(tex.billboardTexture(2)), side: THREE.DoubleSide, roughness: .8 }); this.instances(new THREE.PlaneGeometry(6.7, 3.2).translate(0, 5, .12), m, props);
      }
      if (kind === 'lamp') {
        this.lampHeads = this.instances(new THREE.SphereGeometry(.28, 6, 4).translate(1.55, 6.9, 0), this.bulbs, props);
        if (this.quality !== 'low') {
          this.glow.map = this.poolTexture();
          this.lampPools = this.instances(new THREE.PlaneGeometry(12, 9).rotateX(-Math.PI / 2).translate(1.55, -.115, 0), this.glow, props);
        }
      }
    }
  }
  private buildSignals(): void {
    const props: Prop[] = [], groups: number[] = [], lamps: number[] = [];
    for (const x of this.map.gx) for (const z of this.map.gx) for (let corner = 0; corner < 4; corner++) {
      const sx = corner < 2 ? -1 : 1, sz = corner % 2 ? -1 : 1, group = corner % 2;
      props.push({ kind: 'lamp', x: x + sx * 8.1, z: z + sz * 8.1, ry: group ? (sz > 0 ? Math.PI / 2 : -Math.PI / 2) : sx > 0 ? 0 : Math.PI, r: 0, scale: 1 }); groups.push(group);
    }
    const pieces = [box(0, 2, 0, .12, 4, .12), box(0, 3.9, 0, .4, 1.2, .35)], pole = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose());
    this.instances(pole, this.mat({ color: 0x30373b }), props);
    const bulbs: Prop[] = [];
    props.forEach(p => { for (let n = 0; n < 3; n++) { bulbs.push(p); lamps.push(n); } });
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); this.materials.add(m);
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 6, 4), m, bulbs.length);
    props.forEach((p, i) => { for (let n = 0; n < 3; n++) { this.matrix.position.set(p.x + Math.cos(p.ry) * .24, 4.4 - n * .35, p.z + Math.sin(p.ry) * .24); this.matrix.scale.setScalar(1); this.matrix.rotation.set(0, 0, 0); this.matrix.updateMatrix(); mesh.setMatrixAt(i * 3 + n, this.matrix.matrix); mesh.setColorAt(i * 3 + n, new THREE.Color(0x111111)); } });
    mesh.computeBoundingSphere(); this.root.add(mesh); this.signals = { mesh, groups, lamps };
  }
  private buildHorizon(): void {
    const r = makeRng(this.map.seed + 824), hills: THREE.BufferGeometry[] = [], skyline: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2, distance = this.map.half + 260 + r() * 350, x = Math.cos(a) * distance, z = Math.sin(a) * distance;
      hills.push(surface(new THREE.ConeGeometry(90 + r() * 160, 45 + r() * 100, 5).translate(x, -8, z)));
      if (i % 2) skyline.push(box(x * .8, 10, z * .8, 18 + r() * 24, 20 + r() * 60, 20));
    }
    const batch: Batch = new Map([[this.mat({ color: 0x4b5963, flatShading: true }), hills], [this.mat({ color: 0x48515e }), skyline]]); this.flush(batch, this.root);
  }
  /** 폭풍우 번개: 섬광 세기(0~1)와 다음 낙뢰까지 시간. 천둥 소리는 game 쪽이 지연시켜 재생합니다. */
  private bolt = 0; private nextBolt = 9; onLightning: ((thunderDelay: number) => void) | null = null;
  private lightning(dt: number, rain: number): void {
    this.bolt = Math.max(0, this.bolt - dt * 4.2);
    if (rain < .55) { this.nextBolt = Math.max(this.nextBolt, 6); return; }
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) { this.nextBolt = 6 + Math.random() * 15; this.bolt = 1; setTimeout(() => { if (!this.disposed) this.bolt = Math.max(this.bolt, .8); }, 110); this.onLightning?.(.5 + Math.random() * 2.6); }
  }
  private rainLines: THREE.LineSegments | null = null;
  private rainFx(dt: number, pos: THREE.Vector3, rain: number): void {
    if (!this.rainLines) {
      const n = this.quality === 'low' ? 700 : 1800, g = new THREE.BufferGeometry(), a = new Float32Array(n * 6), r = makeRng(77);
      for (let i = 0; i < n; i++) { a[i * 6] = (r() - .5) * 70; a[i * 6 + 1] = r() * 36; a[i * 6 + 2] = (r() - .5) * 70; }
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      this.rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaec4d6, transparent: true, opacity: 0, depthWrite: false })); this.rainLines.frustumCulled = false; this.root.add(this.rainLines); this.materials.add(this.rainLines.material as THREE.Material);
    }
    const l = this.rainLines; l.visible = rain > .02; if (!l.visible) return; (l.material as THREE.LineBasicMaterial).opacity = .1 + rain * .35;
    const a = (l.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, n = a.length / 6, fall = 34 * dt;
    const wrap = (v: number, c: number): number => v - 70 * Math.round((v - c) / 70);
    for (let i = 0; i < n; i++) {
      const y0 = a[i * 6 + 1]! - fall, y = y0 < 0 ? y0 + 36 : y0, x = wrap(a[i * 6]!, pos.x), z = wrap(a[i * 6 + 2]!, pos.z);
      a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z; a[i * 6 + 3] = x - .1; a[i * 6 + 4] = y + .9; a[i * 6 + 5] = z;
    }
    l.position.set(0, Math.max(0, pos.y - 18), 0);
    (l.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
  private lighting(clock: number, position: THREE.Vector3, rain: number, look?: THREE.Vector3): void {
    const c = tex.skyColors(clock); this.night = c.night; this.sky.update(c); this.sky.mesh.position.copy(position);
    this.fog.color.copy(c.fog).lerp(new THREE.Color(0x56606a), rain * .75).lerp(new THREE.Color(0xdce6ff), this.bolt * .55); this.fog.density = .00165 + c.night * .00055 + rain * .0042; this.scene.background = this.fog.color;
    this.hemi.color.copy(c.hemiSky).lerp(new THREE.Color(0x9aaccb), c.night * .4); this.hemi.groundColor.copy(c.hemiGround); this.hemi.intensity = (c.hemiIntensity * 1.35 + c.night * .5) * (1 - rain * .3) + this.bolt * 4;
    this.sun.color.copy(c.sun); this.sun.intensity = c.sunIntensity * 2.2 * (1 - rain * .78);
    this.moon.intensity = c.night * .48; this.moon.position.copy(position).addScaledVector(c.moonDir, 280); this.moon.target.position.copy(position);
    // 광원 좌표계의 그림자 텍셀에 맞춰 카메라 이동 시 떨림을 줄입니다.
    const dir = this.scratch.copy(c.sunDir); if (dir.y < .045) dir.y = .045; dir.normalize();
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize(), up = new THREE.Vector3().crossVectors(dir, right), step = SHADOW_HALF * 2 / SHADOW_MAP;
    // 그림자 상자(±SHADOW_HALF)를 시선 앞쪽으로 밀어, 보이는 쪽 그림자가 중간에 뚝 끊기지 않게 합니다.
    const target = position.clone(); target.y = 0; if (look) target.addScaledVector(look, SHADOW_LEAD);
    target.addScaledVector(right, Math.round(target.dot(right) / step) * step - target.dot(right)); target.addScaledVector(up, Math.round(target.dot(up) / step) * step - target.dot(up));
    this.sun.target.position.copy(target); this.sun.position.copy(target).addScaledVector(dir, 300);
    for (const f of this.facades) f.emissiveIntensity = c.night * 1.15;
    for (const n of this.neon) n.emissiveIntensity = .25 + c.night * 2.8;
    for (const m of this.lampHeads) m.visible = c.night > .4;
    for (const m of this.lampPools) m.visible = c.night > .4;
    this.glow.opacity = .16 + c.night * .24;
    for (const m of this.reflections) m.opacity = Math.min(.55, c.night * .3 + rain * .3);
    if (this.asphalt) { this.asphalt.roughness = Math.max(.3, .78 - rain * .4 - c.night * .08); this.asphalt.metalness = .08 + rain * .16; }
  }
  /** 적응형 화질: 단계가 오를수록 그리기 거리를 줄이고(1단계 0.85, 2단계 이상 0.7) 2단계부터 그림자를 끕니다. 0이면 원래대로. */
  setDetail(level: number): void {
    this.drawScale = level >= 2 ? .7 : level >= 1 ? .85 : 1;
    if (this.quality === 'high') this.sun.castShadow = level < 2;
  }
  update(dt: number, camera: THREE.PerspectiveCamera, clock: number, t: number, rain = 0): void {
    if (this.disposed) return; this.lightning(dt, rain); camera.getWorldDirection(this.lookDir); this.lookDir.y = 0; if (this.lookDir.lengthSq() > 1e-4) this.lookDir.normalize(); this.lighting(clock, camera.position, rain, this.lookDir); this.rainFx(dt, camera.position, rain);
    const radius = (this.quality === 'low' ? 610 : 810) * this.drawScale, halfChunk = this.map.half / CHUNKS;
    for (const c of this.chunks) { const dx = Math.max(0, Math.abs(camera.position.x - c.x) - halfChunk), dz = Math.max(0, Math.abs(camera.position.z - c.z) - halfChunk); c.root.visible = dx * dx + dz * dz < radius * radius; }
    if (this.signals && (Math.abs(t - this.signalTick) >= .25 || this.signalTick === -Infinity)) {
      this.signalTick = t; const { mesh, groups, lamps } = this.signals, colors = [0xff4545, 0xffd23f, 0x5dff8f];
      for (let i = 0; i < lamps.length; i++) { const state = signal(t, groups[Math.floor(i / 3)]), active = state === 'red' ? 0 : state === 'yellow' ? 1 : 2; mesh.setColorAt(i, new THREE.Color(lamps[i] === active ? colors[active] : 0x11181b)); }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; const geometries = new Set<THREE.BufferGeometry>();
    this.root.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); if (o instanceof THREE.InstancedMesh) o.dispose(); } });
    for (const g of geometries) g.dispose(); for (const m of this.materials) m.dispose(); for (const t of this.textures) t.dispose();
    this.sun.shadow.dispose(); this.moon.shadow.dispose(); this.root.removeFromParent(); this.root.clear();
    if (this.scene.fog === this.fog) this.scene.fog = this.oldFog;
    this.scene.background = this.oldBackground;
    if (this.scene.environment === this.environment) this.scene.environment = this.oldEnvironment;
    this.environment?.dispose();
    this.renderer.toneMapping = this.oldRenderer.tone; this.renderer.toneMappingExposure = this.oldRenderer.exposure;
    this.renderer.shadowMap.enabled = this.oldRenderer.shadows; this.renderer.shadowMap.type = this.oldRenderer.shadowType;
    this.chunks.length = 0; this.materials.clear(); this.textures.clear();
  }
}
