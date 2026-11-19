// 공용 조각 모음: 같은 색끼리 하나의 메시로 합쳐 그리기 호출을 줄이는 도구. ZERO ZONE 소품과 공용 차량 모델이 함께 씁니다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
/** 이동·회전(라디안, XYZ 순서)으로 행렬을 만듭니다. */
export function xf(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 { return new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), ONE); }

/** 같은 색(과 투명 여부)끼리 모으는 상자. 새 지오메트리를 복사해 두므로 원본 프리미티브는 그대로 재사용합니다. */
export class Pieces {
  private buckets = new Map<string, { color: number; tr: boolean; geos: THREE.BufferGeometry[] }>();
  add(geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4 | null, tr = false): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
    if (m) g.applyMatrix4(m);
    const k = `${color}${tr ? 't' : ''}`; let b = this.buckets.get(k); if (!b) { b = { color, tr, geos: [] }; this.buckets.set(k, b); } b.geos.push(g);
  }
  /** 직육면체: 중심 (x,y,z), 크기 (w,h,d). base 행렬을 먼저 곱합니다. */
  box(w: number, h: number, d: number, color: number, base: THREE.Matrix4, x = 0, y = 0, z = 0, tr = false): void { this.add(new THREE.BoxGeometry(w, h, d), color, base.clone().multiply(xf(x, y, z)), tr); }
  mesh(shadow = true): THREE.Group {
    const out = new THREE.Group();
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const mat = b.tr ? new THREE.MeshLambertMaterial({ color: b.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }) : new THREE.MeshLambertMaterial({ color: b.color });
      const m = new THREE.Mesh(mergeGeometries(b.geos, false), mat); m.castShadow = shadow && !b.tr; m.receiveShadow = true; out.add(m);
    }
    return out;
  }
}

export const shade = (c: number, k: number): number => { const col = new THREE.Color(c); col.multiplyScalar(k); return col.getHex(); };
export const CYL = (r: number, h: number, seg = 10): THREE.CylinderGeometry => new THREE.CylinderGeometry(r, r, h, seg);
export const GLASS = 0x1c2a38, BLACK = 0x1a1b1e, STEEL = 0x8b9096, LIGHT = 0xffe9a8, RED = 0xb02a24;

