// ZERO ZONE — 지형 그리기: 강·호수·늪·구릉·절벽·다리, 그리고 마을 바닥·길이 풀밭에 자연스럽게 번지게 하는 부드러운 가장자리.
import * as THREE from 'three';
import { makeRng } from './config';
import type { GameMap } from './world';
import { CLIFF_T } from './terrain';
import { concreteTexture, dirtTexture, fadeDiscTexture, fadeRoadTexture, waterTexture } from './textures';

const smooth = (t: number): number => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
function valueNoise(seed: number): (x: number, z: number) => number {
  const r = makeRng(seed), grid = new Float32Array(64 * 64); for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (x: number, z: number): number => grid[((z & 63) << 6) | (x & 63)];
  return (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = smooth(x - xi), fz = smooth(z - zi); return (at(xi, zi) * (1 - fx) + at(xi + 1, zi) * fx) * (1 - fz) + (at(xi, zi + 1) * (1 - fx) + at(xi + 1, zi + 1) * fx) * fz; };
}

const TOWN = new THREE.Color(1.02, 0.97, 0.84), FOREST = new THREE.Color(0.58, 0.7, 0.46), MUD = new THREE.Color(0.66, 0.64, 0.4), SAND = new THREE.Color(1.22, 1.08, 0.82), ROCKY = new THREE.Color(0.9, 0.86, 0.76);
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)); return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
/** 풀밭 정점 색에 지형 영향을 섞습니다: 마을 둘레는 흙빛으로, 숲은 어둡게, 늪은 진흙빛, 물가는 모래, 바위 곁은 회갈색. */
export function tintGround(map: GameMap, x: number, z: number, c: THREE.Color): void {
  const t = map.terrain;
  for (const k of map.compounds) { const d = Math.hypot(x - k.x, z - k.z) - k.r; if (d < 26) c.lerp(TOWN, 0.55 * smooth(1 - Math.max(0, d) / 26)); }
  for (const f of t.forests) { const d = Math.hypot(x - f.x, z - f.z) / f.r; if (d < 1.2) c.lerp(FOREST, 0.85 * smooth((1.2 - d) / 0.55)); }
  for (const p of t.ponds) {
    const cs = Math.cos(p.ry), sn = Math.sin(p.ry), dx = x - p.x, dz = z - p.z, u = (dx * cs + dz * sn) / p.rx, v = (-dx * sn + dz * cs) / p.rz, q = Math.hypot(u, v);
    if (p.swamp) { if (q < 1.7) c.lerp(MUD, 0.8 * smooth((1.7 - q) / 0.8)); } else if (q < 1.35) c.lerp(SAND, 0.75 * smooth((1.35 - q) / 0.35));
  }
  for (const r of t.rivers) { let e = Infinity; for (let i = 0; i + 1 < r.pts.length; i++) e = Math.min(e, segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) - r.w / 2); if (e < 14) c.lerp(SAND, 0.7 * smooth(1 - Math.max(0, e) / 14)); }
  for (const h of t.hills) { const d = Math.hypot(x - h.x, z - h.z) / h.r; if (d < 1.5) c.lerp(ROCKY, 0.7 * smooth((1.5 - d) / 0.6)); }
  for (const w of t.cliffs) { const d = Math.max(Math.abs(x - (w.x0 + w.x1) / 2) - (w.x1 - w.x0) / 2, Math.abs(z - (w.z0 + w.z1) / 2) - (w.z1 - w.z0) / 2); if (d < 9) c.lerp(ROCKY, 0.75 * smooth(1 - Math.max(0, d) / 9)); }
}

/** 단위 원판(XZ 평면)을 겹겹의 고리로 만들고 정점 알파를 줍니다. stops = [반지름 비율, 알파] 의 목록. */
function discGeo(stops: Array<[number, number]>, seg = 40): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (const [r, a] of stops) for (let i = 0; i < seg; i++) { const t = (i / seg) * Math.PI * 2; pos.push(Math.cos(t) * r, 0, Math.sin(t) * r); col.push(1, 1, 1, a); }
  for (let s = 0; s + 1 < stops.length; s++) for (let i = 0; i < seg; i++) { const a = s * seg + i, b = s * seg + ((i + 1) % seg), c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
/** 길 따라 뻗는 띠(폭 w, 가운데 알파 1, 가장자리 알파 0). uv.x 는 길이 방향으로 uvPerM 씩 늘어납니다. */
function ribbonGeo(pts: Array<[number, number]>, w: number, uvPerM: number, edgeAlpha: number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = []; let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    if (i > 0) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (const [s, al] of [[-1, edgeAlpha], [0, 1], [1, edgeAlpha]] as const) { pos.push(pts[i][0] + nx * (w / 2) * s, 0, pts[i][1] + nz * (w / 2) * s); col.push(1, 1, 1, al); uv.push(len * uvPerM, (s + 1) / 2); }
    if (i > 0) for (let k = 0; k < 2; k++) { const a0 = (i - 1) * 3 + k, a1 = a0 + 1, b0 = i * 3 + k, b1 = b0 + 1; idx.push(a0, a1, b0, a1, b1, b0); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const n: number[] = []; for (let i = 0; i < pos.length / 3; i++) n.push(0, 1, 0); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); return g;
}

export class TerrainView {
  readonly group = new THREE.Group(); private flow: THREE.Texture[] = []; private time = 0;
  constructor(private map: GameMap, private low: boolean) {
    this.group.name = 'terrain'; this.buildTowns(); this.buildRoads(); this.buildWater(); this.buildHills(); this.buildCliffs(); this.buildBridges();
  }
  /** 물결을 흘립니다. */
  update(dt: number): void { this.time += dt; for (let i = 0; i < this.flow.length; i++) { this.flow[i].offset.x = -this.time * (0.03 + i * 0.01); this.flow[i].offset.y = Math.sin(this.time * 0.4 + i) * 0.01; } }

  private soft(geo: THREE.BufferGeometry, color: number, map: THREE.Texture | null, alphaMap: THREE.Texture | null, y: number, order: number, opacity = 1): THREE.Mesh {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, map, alphaMap, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order }));
    m.position.y = y; m.renderOrder = order; m.receiveShadow = true; this.group.add(m); return m;
  }
  /** 마을 바닥: 가장자리가 흙빛으로 번지며 풀과 섞이는 울퉁불퉁한 원 + 둘레의 흙 얼룩. */
  private buildTowns(): void {
    const tints: Record<string, number> = { urban: 0xffffff, industrial: 0xb4b8bc, military: 0xd2c6a0, farm: 0xc8b894, village: 0xeae4d4 }, rng = makeRng(this.map.seed + 17), dirt = dirtTexture();
    const alpha = [fadeDiscTexture(3, 0.62), fadeDiscTexture(8, 0.62), fadeDiscTexture(13, 0.62)], skirt = fadeDiscTexture(21, 0.2), blot = [fadeDiscTexture(31, 0.15), fadeDiscTexture(37, 0.15)];
    this.map.compounds.forEach((c, i) => {
      const tex = concreteTexture(); tex.repeat.set((c.r + 6) / 3, (c.r + 6) / 3);
      const sk = this.soft(new THREE.PlaneGeometry((c.r + 20) * 2, (c.r + 20) * 2).rotateX(-Math.PI / 2), 0xfff0c8, dirt.clone(), skirt, 0.02, 1, 0.38); sk.position.x = c.x; sk.position.z = c.z; (sk.material as THREE.MeshLambertMaterial).map!.repeat.set((c.r + 20) / 4, (c.r + 20) / 4); (sk.material as THREE.MeshLambertMaterial).map!.needsUpdate = true;
      const pad = this.soft(new THREE.PlaneGeometry((c.r + 6) * 2, (c.r + 6) * 2).rotateX(-Math.PI / 2), tints[c.theme] ?? 0xffffff, tex, alpha[i % 3], 0.04, 2); pad.position.x = c.x; pad.position.z = c.z; pad.rotation.y = rng() * 6.28;
      if (!this.low) for (let k = 0; k < 9; k++) { // 둘레의 흙·자갈 얼룩
        const a = rng() * Math.PI * 2, r = c.r * (0.78 + rng() * 0.55), s = 4 + rng() * 8, b = this.soft(new THREE.PlaneGeometry(s * 2, s * 2).rotateX(-Math.PI / 2), rng() < 0.5 ? 0xfff0c8 : 0xe8e4d6, dirt, blot[k % 2], 0.03, 1, 0.5);
        b.position.x = c.x + Math.cos(a) * r; b.position.z = c.z + Math.sin(a) * r; b.rotation.y = rng() * 6.28;
      }
    });
  }
  /** 마을을 잇는 흙길: 양 가장자리가 흐려져 풀밭과 섞입니다. */
  private buildRoads(): void {
    const dirt = dirtTexture(), fade = fadeRoadTexture(), cs = this.map.compounds;
    for (const [i, j] of this.map.roads) {
      const a = cs[i], b = cs[j], d = Math.hypot(b.x - a.x, b.z - a.z), tex = dirt.clone(); tex.repeat.set(d / 4, 1); tex.needsUpdate = true;
      const af = fade.clone(); af.repeat.set(Math.max(1, d / 40), 1); af.needsUpdate = true;
      const road = this.soft(new THREE.PlaneGeometry(d, 6.4).rotateX(-Math.PI / 2), 0xd9cdb4, tex, af, 0.025, 1); road.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); road.position.x = (a.x + b.x) / 2; road.position.z = (a.z + b.z) / 2;
    }
  }
  private water(color: number, opacity: number, y: number): THREE.MeshPhongMaterial {
    const t = waterTexture(); t.repeat.set(1, 1); this.flow.push(t);
    return new THREE.MeshPhongMaterial({ color, map: t, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false, shininess: 90, specular: 0x9fb8c4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 + y * 0 });
  }
  private buildWater(): void {
    const t = this.map.terrain, rng = makeRng(this.map.seed + 29), bank = (g: THREE.BufferGeometry, color: number, y: number, order: number): void => {
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.position.y = y; m.renderOrder = order; m.receiveShadow = true; this.group.add(m);
    };
    for (const r of t.rivers) {
      bank(ribbonGeo(r.pts, r.w + 16, 0, 0), 0xc9b78a, 0.035, 1);
      const m = new THREE.Mesh(ribbonGeo(r.pts, r.w + 1.5, 1 / 9, 0.45), this.water(0x4a8fae, 0.88, 0)); m.position.y = 0.07; m.renderOrder = 3; this.group.add(m);
    }
    for (const p of t.ponds) {
      const sc = (m: THREE.Mesh): void => { m.scale.set(p.rx, 1, p.rz); m.rotation.y = -p.ry; m.position.x = p.x; m.position.z = p.z; };
      const shore = new THREE.Mesh(discGeo(p.swamp ? [[0, 1], [1.05, 0.9], [1.3, 0.35], [1.6, 0]] : [[0, 1], [1.0, 1], [1.2, 0.9], [1.45, 0]]), new THREE.MeshLambertMaterial({ color: p.swamp ? 0x8a7d52 : 0xcbb98b, vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      shore.position.y = 0.035; shore.renderOrder = 1; sc(shore); this.group.add(shore);
      const w = new THREE.Mesh(discGeo(p.swamp ? [[0, 0.92], [0.7, 0.88], [0.97, 0.5], [1.03, 0]] : [[0, 0.95], [0.6, 0.92], [0.92, 0.7], [1.02, 0]], 48), this.water(p.swamp ? 0x7f9a62 : 0x3d84a6, p.swamp ? 0.92 : 0.9, 0));
      w.position.y = 0.07; w.renderOrder = 3; sc(w); const mp = (w.material as THREE.MeshPhongMaterial).map!; mp.repeat.set(p.rx / 9, p.rz / 9); this.group.add(w);
      if (p.swamp && !this.low) { // 갈대
        const n = 170, g = new THREE.ConeGeometry(0.07, 1.7, 4); g.translate(0, 0.85, 0); const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x8a9440 }), n), d = new THREE.Object3D();
        for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, q = 0.45 + rng() * 0.8, lx = Math.cos(a) * q * p.rx, lz = Math.sin(a) * q * p.rz, c = Math.cos(p.ry), s = Math.sin(p.ry); d.position.set(p.x + lx * c - lz * s, 0, p.z + lx * s + lz * c); d.rotation.set((rng() - 0.5) * 0.25, rng() * 6, (rng() - 0.5) * 0.25); d.scale.set(1, 0.7 + rng() * 0.9, 1); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); }
        this.group.add(mesh);
      }
    }
  }
  /** 구릉: 가파른 옆면과 평평한 풀 윗면의 큰 언덕(충돌 상자는 world.ts). */
  private buildHills(): void {
    const n = valueNoise(this.map.seed + 41), top = new THREE.Color(0.5, 0.64, 0.3), rock = new THREE.Color(0.52, 0.49, 0.43), foot = new THREE.Color(0.6, 0.58, 0.46), c = new THREE.Color();
    for (const h of this.map.terrain.hills) {
      const prof = [[1.1, 0.0], [1.0, h.h * 0.22], [0.9, h.h * 0.62], [0.76, h.h * 0.93], [0.5, h.h * 0.995], [0.001, h.h]].map(([r, y]) => new THREE.Vector2(r * h.r, y)), g = new THREE.LatheGeometry(prof, 26, 0, Math.PI * 2), p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z), k = 1 + (n((x + h.x) / 6, (z + h.z) / 6) - 0.5) * 0.16 * Math.min(1, r / h.r); p.setXYZ(i, x * k, y * (1 + (n((x + h.x) / 5 + 9, (z + h.z) / 5) - 0.5) * 0.12), z * k);
        const t = y / h.h; c.copy(foot).lerp(rock, smooth(t * 3)).lerp(top, smooth((t - 0.6) * 4)).multiplyScalar(0.7 + n(x / 2.5 + 40, z / 2.5) * 0.14); col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); m.position.set(h.x, 0, h.z); m.castShadow = true; m.receiveShadow = true; this.group.add(m);
    }
  }
  /** 절벽: 층층이 갈라진 바위 벽. */
  private buildCliffs(): void {
    const n = valueNoise(this.map.seed + 53), geos: THREE.BufferGeometry[] = [], c = new THREE.Color(), dark = new THREE.Color(0.4, 0.37, 0.33), light = new THREE.Color(0.66, 0.6, 0.52), moss = new THREE.Color(0.48, 0.56, 0.3);
    for (const w of this.map.terrain.cliffs) {
      const lx = w.x1 - w.x0, lz = w.z1 - w.z0, g = new THREE.BoxGeometry(lx, w.h, lz, Math.max(1, Math.round(lx / 2.5)), 4, Math.max(1, Math.round(lz / 2.5))), p = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(p.count * 3);
      g.translate((w.x0 + w.x1) / 2, w.h / 2, (w.z0 + w.z1) / 2);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = y / w.h, up = nor.getY(i) > 0.7, f = Math.min(1, 0.35 + t);
        p.setXYZ(i, x + (n(x / 3 + 7, z / 3 + y / 3) - 0.5) * 1.3 * f, y + (t > 0.9 ? (n(x / 2, z / 2) - 0.5) * 0.9 : 0), z + (n(x / 3 + 31, z / 3 + y / 3 + 5) - 0.5) * 1.3 * f);
        c.copy(dark).lerp(light, 0.5 + 0.5 * Math.sin(y * 2.7 + n(x / 4, z / 4) * 5)).multiplyScalar(0.85 + n(x / 1.5 + 3, z / 1.5 + y) * 0.3); if (up) c.lerp(moss, 0.7); col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); geos.push(g);
    }
    if (!geos.length) return; void CLIFF_T;
    const merged = geos.length === 1 ? geos[0] : mergeGeos(geos); merged.computeVertexNormals();
    const m = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); m.castShadow = true; m.receiveShadow = true; this.group.add(m);
  }
  /** 길이 물을 건너는 나무 다리. */
  private buildBridges(): void {
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5a38 }), dark = new THREE.MeshLambertMaterial({ color: 0x4d3a24 });
    for (const b of this.map.terrain.bridges) {
      const g = new THREE.Group(), deck = new THREE.Mesh(new THREE.BoxGeometry(b.len, 0.16, 4.4), wood); deck.position.y = 0.16; deck.receiveShadow = true; g.add(deck);
      for (let i = -1; i <= 1; i += 2) { const rail = new THREE.Mesh(new THREE.BoxGeometry(b.len, 0.14, 0.14), dark); rail.position.set(0, 1.0, i * 2.15); g.add(rail); for (let x = -b.len / 2 + 0.6; x < b.len / 2; x += 3) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), dark); post.position.set(x, 0.55, i * 2.15); g.add(post); } }
      g.position.set(b.x, 0, b.z); g.rotation.y = -b.ry; this.group.add(g);
    }
  }
}

function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = []; let base = 0;
  for (const g of list) { const p = g.attributes.position, c = g.attributes.color, ix = g.index!; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(c.getX(i), c.getY(i), c.getZ(i)); } for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base); base += p.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
}
