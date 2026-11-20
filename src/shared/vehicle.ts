// 공용 차량 모델: 세단·지프·픽업·밴·버스를 코드로 만듭니다(앞이 +x). 게임마다 가져다 쓰도록 ZERO ZONE 밖에 둡니다.
import * as THREE from 'three';
import { BLACK, CYL, GLASS, LIGHT, Pieces, RED, STEEL, shade, xf } from './pieces';

export type VehicleKind = 'car' | 'jeep' | 'truck' | 'van' | 'bus';
/** 차량 하나를 그리는 데 필요한 값: 크기(w 길이·d 폭·h 높이), 차체 색, 변형(v), 부서진 모양 여부 */
export interface VehicleSpec { kind: string; w: number; d: number; h: number; c: number; v: number; wreck: boolean }

// ---------- 차량 ----------
function wheel(p: Pieces, base: THREE.Matrix4, x: number, z: number, r: number, wid: number): void {
  p.add(CYL(r, wid, 12), BLACK, base.clone().multiply(xf(x, r, z, Math.PI / 2)));
  p.add(CYL(r * 0.5, wid + 0.02, 8), STEEL, base.clone().multiply(xf(x, r, z, Math.PI / 2)));
}
export function vehicle(p: Pieces, pr: VehicleSpec, base: THREE.Matrix4): void {
  const { w, d, h } = pr, c = pr.wreck ? shade(pr.c, 0.42) : pr.c, dark = pr.wreck ? 0x201f1d : BLACK, hw = d / 2;
  const b = (sx: number, sy: number, sz: number, col: number, x: number, y: number, z: number, tr = false): void => p.box(sx, sy, sz, col, base, x, y, z, tr);
  switch (pr.kind) {
    case 'car': {
      b(w, 0.62, d, c, 0, 0.55, 0); b(w * 0.52, 0.5, d * 0.9, GLASS, -0.25, 1.1, 0); b(w * 0.46, 0.1, d * 0.86, c, -0.25, 1.4, 0);
      b(0.06, 0.16, 0.34, LIGHT, w / 2, 0.62, hw * 0.6); b(0.06, 0.16, 0.34, LIGHT, w / 2, 0.62, -hw * 0.6); b(0.06, 0.14, 0.34, RED, -w / 2, 0.62, hw * 0.6); b(0.06, 0.14, 0.34, RED, -w / 2, 0.62, -hw * 0.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(p, base, sx * w * 0.32, sz * (hw - 0.05), 0.36, 0.26);
      break;
    }
    case 'jeep': {
      b(w, 0.78, d, c, 0, 0.78, 0); b(w * 0.56, 0.72, d * 0.96, GLASS, -0.3, 1.52, 0); b(w * 0.56, 0.08, d, c, -0.3, 1.92, 0);
      b(0.06, 0.2, 0.4, LIGHT, w / 2, 0.9, hw * 0.6); b(0.06, 0.2, 0.4, LIGHT, w / 2, 0.9, -hw * 0.6); b(0.5, 0.06, d, dark, w / 2 - 0.1, 0.42, 0);
      p.add(CYL(0.42, 0.22, 12), dark, base.clone().multiply(xf(-w / 2 - 0.1, 1.05, 0, 0, 0, Math.PI / 2)));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(p, base, sx * w * 0.31, sz * (hw - 0.02), 0.44, 0.3);
      break;
    }
    case 'truck': { // 픽업트럭: 앞은 운전석, 뒤는 짐칸
      const cab = w * 0.38; b(cab, 1.0, d, c, w / 2 - cab / 2, 1.0, 0); b(cab * 0.8, 0.5, d * 0.92, GLASS, w / 2 - cab * 0.55, 1.35, 0);
      b(w - cab, 0.16, d, dark, -cab / 2, 0.68, 0); b(w - cab, 0.55, 0.1, c, -cab / 2, 1.0, hw - 0.05); b(w - cab, 0.55, 0.1, c, -cab / 2, 1.0, -hw + 0.05); b(0.1, 0.55, d, c, -w / 2 + 0.05, 1.0, 0);
      if (pr.v === 1) b(w - cab - 0.3, 0.9, d - 0.3, 0x5c6b4a, -cab / 2, 1.2, 0);
      b(0.06, 0.2, 0.4, LIGHT, w / 2, 0.8, hw * 0.6); b(0.06, 0.2, 0.4, LIGHT, w / 2, 0.8, -hw * 0.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(p, base, sx * w * 0.32, sz * (hw - 0.02), 0.42, 0.3);
      break;
    }
    case 'van': {
      b(w, 1.55, d, c, 0, 1.2, 0); b(0.1, 0.65, d * 0.9, GLASS, w / 2 - 0.02, 1.62, 0); b(w * 0.5, 0.5, d + 0.02, GLASS, -0.3, 1.62, 0); b(w, 0.1, d, shade(c, 0.85), 0, 2.0, 0);
      b(0.06, 0.2, 0.4, LIGHT, w / 2, 0.9, hw * 0.6); b(0.06, 0.2, 0.4, LIGHT, w / 2, 0.9, -hw * 0.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(p, base, sx * w * 0.32, sz * (hw - 0.02), 0.4, 0.28);
      break;
    }
    case 'bus': {
      b(w, 2.3, d, c, 0, 1.55, 0); b(w * 0.9, 0.78, d + 0.04, GLASS, 0, 2.2, 0); b(w, 0.1, d, shade(c, 0.8), 0, 2.74, 0); b(0.1, 1.0, d * 0.9, GLASS, w / 2, 2.1, 0);
      b(w, 0.18, d + 0.04, shade(c, 0.6), 0, 0.7, 0);
      for (const sx of [-1, 1, 0]) for (const sz of [-1, 1]) wheel(p, base, sx * w * 0.34, sz * (hw - 0.05), 0.5, 0.34);
      break;
    }
    default: break;
  }
  void h;
}

/** 차량 한 대의 메시(원점 기준, 앞이 +x). 부서지면 같은 모양을 어둡게 만듭니다. */
export function makeVehicleMesh(v: VehicleSpec): THREE.Group {
  const p = new Pieces(); vehicle(p, v, new THREE.Matrix4()); return p.mesh();
}
