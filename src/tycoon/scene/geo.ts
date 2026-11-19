// TYCOON — 지오메트리 조립기. 같은 재질의 면을 한 버퍼에 모아 그리기 호출을 줄입니다.
import * as THREE from 'three';
import { FACADE_H, FACADE_W } from './textures';

const C = new THREE.Color();
export class GeoBuilder {
  private pos: number[] = []; private nor: number[] = []; private uv: number[] = []; private col: number[] = []; private idx: number[] = [];
  get empty(): boolean { return this.idx.length === 0; }
  /** 사각형 하나(네 꼭짓점 a b c d 는 반시계). uv 는 꼭짓점별로 직접 줍니다. */
  quad(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like, color: number, uv: [number, number, number, number, number, number, number, number]): void {
    const n = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).cross(new THREE.Vector3(d.x - a.x, d.y - a.y, d.z - a.z)).normalize(), base = this.pos.length / 3;
    C.set(color);
    for (const [v, k] of [[a, 0], [b, 2], [c, 4], [d, 6]] as Array<[THREE.Vector3Like, number]>) { this.pos.push(v.x, v.y, v.z); this.nor.push(n.x, n.y, n.z); this.uv.push(uv[k], uv[k + 1]); this.col.push(C.r, C.g, C.b); }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** 바닥에 놓인 사각형(위를 봄). uv 는 미터 단위 × scale. */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, color: number, uvScale = 1 / 3): void {
    this.quad({ x: x0, y, z: z1 }, { x: x1, y, z: z1 }, { x: x1, y, z: z0 }, { x: x0, y, z: z0 }, color, [x0 * uvScale, z1 * uvScale, x1 * uvScale, z1 * uvScale, x1 * uvScale, z0 * uvScale, x0 * uvScale, z0 * uvScale]);
  }
  /** 상자(아래면 제외). 옆면은 외벽 질감 칸에 맞춰 uv 를 잡고, 윗면은 roof 빌더에 넣습니다. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, roof?: GeoBuilder | null, roofColor = color, floorH = FACADE_H / 4): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const uw = w / FACADE_W, ud = d / FACADE_W, v0 = y0 / (floorH * 4), v1 = y1 / (floorH * 4);
    // +z, +x, -z, -x 면
    this.quad({ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }, color, [0, v0, uw, v0, uw, v1, 0, v1]);
    this.quad({ x: x1, y: y0, z: z1 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, color, [0, v0, ud, v0, ud, v1, 0, v1]);
    this.quad({ x: x1, y: y0, z: z0 }, { x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, color, [0, v0, uw, v0, uw, v1, 0, v1]);
    this.quad({ x: x0, y: y0, z: z0 }, { x: x0, y: y0, z: z1 }, { x: x0, y: y1, z: z1 }, { x: x0, y: y1, z: z0 }, color, [0, v0, ud, v0, ud, v1, 0, v1]);
    (roof ?? this).floor(x0, z0, x1, z1, y1, roofColor, 0.2);
  }
  /** 질감 없는 단색 상자(5면). */
  solid(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h, uv: [number, number, number, number, number, number, number, number] = [0, 0, 1, 0, 1, 1, 0, 1];
    this.quad({ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }, color, uv);
    this.quad({ x: x1, y: y0, z: z1 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, color, uv);
    this.quad({ x: x1, y: y0, z: z0 }, { x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, color, uv);
    this.quad({ x: x0, y: y0, z: z0 }, { x: x0, y: y0, z: z1 }, { x: x0, y: y1, z: z1 }, { x: x0, y: y1, z: z0 }, color, uv);
    this.quad({ x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 }, color, uv);
  }
  /** 세로로 선 판(문·간판·울타리): 중심 (cx,cy,cz), 법선 방향 (nx,nz). */
  panel(cx: number, cy: number, cz: number, w: number, h: number, nx: number, nz: number, color: number): void {
    const tx = nz, tz = -nx, hw = w / 2, hh = h / 2;
    this.quad({ x: cx - tx * hw, y: cy - hh, z: cz - tz * hw }, { x: cx + tx * hw, y: cy - hh, z: cz + tz * hw }, { x: cx + tx * hw, y: cy + hh, z: cz + tz * hw }, { x: cx - tx * hw, y: cy + hh, z: cz - tz * hw }, color, [0, 0, 1, 0, 1, 1, 0, 1]);
  }
  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setIndex(this.idx);
    g.computeBoundingSphere(); return g;
  }
}
