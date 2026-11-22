// 공용 청크 + 거리 LOD: 가까운 칸만 제대로 그리고, 먼 칸은 네모 덩어리(프록시)로, 안개 너머는 아예 끈다. 시야 밖 칸은 three 의 프러스텀 컬링이 걸러낸다.
// 쓰는 법: splitInstanced 로 큰 InstancedMesh 를 칸으로 쪼개고 → LodSet.add 로 칸마다 (가까울 때 그릴 것, 멀 때 그릴 것) 을 등록 → 매 프레임 set.update(camera.position).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 거리 단계: 0=제대로, 1=네모 프록시, 2=끔 */
export type LodState = 0 | 1 | 2;

export interface LodEntryInit {
  /** 칸 중심(월드 xz)과 칸을 감싸는 반경 */
  x: number; z: number; r: number;
  /** 가까울 때만 켜지는 오브젝트(제대로 된 모델) */
  full?: THREE.Object3D[];
  /** 멀 때만 켜지는 오브젝트(네모 프록시). 없으면 멀어지면 그냥 꺼진다 */
  proxy?: THREE.Object3D[];
  /** 이 칸만의 거리 배율(작은 소품은 일찍 끄려고 <1) */
  scale?: number;
}
interface LodEntry extends Required<Omit<LodEntryInit, 'scale'>> { scale: number; state: LodState }

export interface LodRanges { near: number; far: number }

/** 칸들의 거리 단계를 관리한다. near 안: full, near~far: proxy, far 밖: 둘 다 끔. 경계에서 깜빡이지 않게 hysteresis(기본 6%)를 둔다. */
export class LodSet {
  readonly entries: LodEntry[] = [];
  /** 품질·기기 성능에 따라 모든 거리를 줄이거나 늘린다(1=기본) */
  scale = 1;
  private off = false;
  /** false 로 두면 모든 칸을 끈 채 고정한다(화질을 가장 낮출 때 장식을 통째로 숨기는 용도) */
  get enabled(): boolean { return !this.off; }
  set enabled(v: boolean) { this.off = !v; if (this.off) for (const e of this.entries) { for (const o of e.full) o.visible = false; for (const o of e.proxy) o.visible = false; } else for (const e of this.entries) this.apply(e, e.state, true); }
  constructor(public ranges: LodRanges, private readonly hysteresis = 0.06) {}

  add(e: LodEntryInit): LodEntry {
    const entry: LodEntry = { x: e.x, z: e.z, r: e.r, full: e.full ?? [], proxy: e.proxy ?? [], scale: e.scale ?? 1, state: 0 };
    this.apply(entry, 0, true); this.entries.push(entry); return entry;
  }

  /** 카메라 위치(월드)를 넣으면 모든 칸의 단계를 갱신한다. 켜짐/꺼짐이 실제로 바뀐 칸 수를 돌려준다. */
  update(cam: { x: number; z: number }): number {
    let changed = 0; if (this.off) return 0;
    for (const e of this.entries) {
      const next = this.classify(e, Math.hypot(e.x - cam.x, e.z - cam.z) - e.r);
      if (next !== e.state) { this.apply(e, next); changed++; }
    }
    return changed;
  }

  /** 가장자리까지의 거리 d 로 단계를 정한다. 이미 그 단계면 hysteresis 만큼 경계를 넓혀 잡는다. */
  classify(e: { scale: number; state: LodState }, d: number): LodState {
    const s = this.scale * e.scale, h = this.hysteresis;
    const near = this.ranges.near * s * (e.state === 0 ? 1 + h : 1 - h), far = this.ranges.far * s * (e.state === 2 ? 1 - h : 1 + h);
    return d < near ? 0 : d < far ? 1 : 2;
  }

  private apply(e: LodEntry, s: LodState, force = false): void {
    if (!force && s === e.state) return; e.state = s;
    for (const o of e.full) o.visible = s === 0;
    for (const o of e.proxy) o.visible = s === 1;
  }

  /** 현재 단계별 칸 수 [제대로, 프록시, 꺼짐] — 측정·디버그용 */
  counts(): [number, number, number] { const c: [number, number, number] = [0, 0, 0]; for (const e of this.entries) c[e.state]++; return c; }
}

export interface SplitCell { mesh: THREE.InstancedMesh; x: number; z: number; r: number }

/** 큰 InstancedMesh 하나를 cell×cell 격자 칸으로 쪼갠다(원본은 scene 에서 빼고 dispose). 한 덩어리면 프러스텀·그림자 컬링이 안 먹어 지도 전체를 매 프레임 그린다. */
export function splitInstanced(src: THREE.InstancedMesh, cell: number, parent: THREE.Object3D): SplitCell[] {
  const a = src.instanceMatrix.array, col = src.instanceColor?.array, cells = new Map<number, number[]>(), out: SplitCell[] = [];
  for (let i = 0; i < src.count; i++) {
    const k = (Math.floor(a[i * 16 + 12] / cell) + 4096) * 8192 + Math.floor(a[i * 16 + 14] / cell) + 4096;
    const list = cells.get(k); if (list) list.push(i); else cells.set(k, [i]);
  }
  for (const list of cells.values()) {
    const m = new THREE.InstancedMesh(src.geometry, src.material, list.length);
    if (col) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    list.forEach((i, j) => { m.instanceMatrix.array.set(a.subarray(i * 16, i * 16 + 16), j * 16); if (col) m.instanceColor!.array.set(col.subarray(i * 3, i * 3 + 3), j * 3); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow; m.renderOrder = src.renderOrder; m.layers.mask = src.layers.mask; m.userData = { ...src.userData };
    m.computeBoundingSphere(); parent.add(m);
    const bs = m.boundingSphere!; out.push({ mesh: m, x: bs.center.x, z: bs.center.z, r: bs.radius });
  }
  parent.remove(src); src.dispose();
  return out;
}

/** 네모(박스)만 모아 한 번에 그리는 프록시 지오메트리 빌더: 먼 건물·소품을 단색 덩어리로 대신한다. */
export class BoxProxy {
  private readonly parts: THREE.BufferGeometry[] = [];
  /** x0..x1 × y0..y1 × z0..z1 박스 하나 */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: THREE.Color | number): this {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed(), c = new THREE.Color(color), n = g.getAttribute('position').count, arr = new Float32Array(n * 3);
    g.deleteAttribute('uv'); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); this.parts.push(g); return this;
  }
  get count(): number { return this.parts.length; }
  /** 모든 박스를 한 지오메트리로 합친다(박스가 없으면 null) */
  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null; const g = mergeGeometries(this.parts, false); for (const p of this.parts) p.dispose(); this.parts.length = 0; return g;
  }
}

/** 프록시용 재질: 정점 색만 쓰는 값싼 재질(안개는 그대로 받는다) */
export function proxyMaterial(): THREE.MeshLambertMaterial { return new THREE.MeshLambertMaterial({ vertexColors: true }); }

export interface HeightTile { x: number; z: number; r: number; full: THREE.BufferGeometry; coarse: THREE.BufferGeometry }

/** 정사각 격자 지형(PlaneGeometry(size,size,segs,segs) 를 눕히고 높이·색을 채운 것)을 tiles×tiles 칸으로 자른다. 칸마다 원본 해상도(full)와 stride 배 성긴 해상도(coarse)를 만들고,
 *  서로 다른 해상도 칸 사이의 틈은 가장자리 치마(skirt, 아래로 드리운 벽)가 가린다. segs 는 tiles 와 stride 의 배수여야 한다. position/normal/uv/color 는 원본 값을 그대로 옮겨 모양과 색이 같다. */
export function tileHeightfield(src: THREE.BufferGeometry, segs: number, tiles: number, stride: number, skirt: number): HeightTile[] {
  if (segs % tiles || (segs / tiles) % stride) throw new Error('segs 는 tiles·stride 의 배수여야 합니다');
  const g1 = segs + 1, per = segs / tiles, pos = src.getAttribute('position'), nor = src.getAttribute('normal'), uv = src.getAttribute('uv'), col = src.getAttribute('color');
  const attrs = [pos, nor, uv, col].filter((a): a is THREE.BufferAttribute => !!a);
  const out: HeightTile[] = [];
  const make = (i0: number, j0: number, step: number): THREE.BufferGeometry => {
    const n = per / step + 1, idx: number[] = [], base = attrs.map(() => [] as number[]);
    const push = (vi: number, dy = 0): number => { attrs.forEach((a, k) => { for (let c = 0; c < a.itemSize; c++) base[k].push(a.array[vi * a.itemSize + c] + (a === pos && c === 1 ? dy : 0)); }); return base[0].length / 3 - 1; };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) push((j0 * per + j * step) * g1 + i0 * per + i * step);
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = i + n * j, b = i + n * (j + 1), c = i + 1 + n * (j + 1), d = i + 1 + n * j; idx.push(a, b, d, b, c, d); }
    // 치마: 가장자리 정점을 복제해 skirt 만큼 내리고, 바깥쪽을 향하게 이어 붙인다
    const border: [number[], number, number][] = [
      [Array.from({ length: n }, (_, i) => i), 0, -1], [Array.from({ length: n }, (_, i) => i + n * (n - 1)), 0, 1],
      [Array.from({ length: n }, (_, j) => j * n), -1, 0], [Array.from({ length: n }, (_, j) => j * n + n - 1), 1, 0],
    ];
    const P = base[0], at = (v: number): THREE.Vector3 => new THREE.Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    for (const [list, ox, oz] of border) {
      const drop = list.map(v => { const k = base[0].length / 3; attrs.forEach((a, m) => { for (let c = 0; c < a.itemSize; c++) base[m].push(base[m][v * a.itemSize + c] - (a === pos && c === 1 ? skirt : 0)); }); return k; });
      for (let s = 0; s < list.length - 1; s++) {
        const a = list[s], b = list[s + 1], a2 = drop[s], b2 = drop[s + 1], nrm = new THREE.Vector3().crossVectors(at(b).sub(at(a)), at(a2).sub(at(a)));
        if (nrm.x * ox + nrm.z * oz >= 0) idx.push(a, b, a2, b, b2, a2); else idx.push(a, a2, b, b, a2, b2);
      }
    }
    const g = new THREE.BufferGeometry(); attrs.forEach((a, k) => g.setAttribute(attrName(a, src), new THREE.BufferAttribute(new Float32Array(base[k]), a.itemSize))); g.setIndex(idx); g.computeBoundingSphere(); return g;
  };
  for (let tj = 0; tj < tiles; tj++) for (let ti = 0; ti < tiles; ti++) {
    const full = make(ti, tj, 1), coarse = make(ti, tj, stride), bs = full.boundingSphere!;
    out.push({ x: bs.center.x, z: bs.center.z, r: bs.radius, full, coarse });
  }
  return out;
}
function attrName(a: THREE.BufferAttribute, src: THREE.BufferGeometry): string { for (const k of Object.keys(src.attributes)) if (src.attributes[k] === a) return k; return 'position'; }
