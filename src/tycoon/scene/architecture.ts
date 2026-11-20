// Real 3D trim, mullions and shopfronts, batched through GeoBuilder.
import type { GeoBuilder } from './geo';

export interface FacadeDetailSpec {
  x: number; z: number; w: number; d: number; height: number;
  nx: number; nz: number; depth: number; along: number;
  style: 'slum' | 'shop' | 'office' | 'glass'; accent: number;
  landmark: boolean; awning: boolean; industrial: boolean; setback: boolean;
  quality: 'low' | 'standard' | 'high';
}
export function addFacadeDetails(detail: GeoBuilder, glass: GeoBuilder, glow: GeoBuilder, f: FacadeDetailSpec): void {
  const { x, z, w, d, height: H, nx, nz, depth, along } = f;
  if (f.quality === 'low' && !f.landmark) return;
  const frame = f.style === 'slum' ? 0x9b8c7c : f.style === 'shop' ? 0xc9bbab : 0x9cabb8;
  const dark = f.industrial ? 0x536067 : 0x354550;
  // local front coordinates: a along the wall, offset outward; solids use bottom y.
  const front = (g: GeoBuilder, a: number, y: number, ww: number, hh: number, thickness: number, offset: number, color: number) => {
    if (ww <= 0 || hh <= 0 || thickness <= 0) return;
    g.solid(x + nz * a + nx * (depth / 2 + offset), y, z - nx * a + nz * (depth / 2 + offset), nx ? thickness : ww, hh, nz ? thickness : ww, color);
  };
  detail.solid(x, 0.19, z, w + 0.04, 0.18, d + 0.04, dark);
  if (!f.setback) {
    for (const s of [-1, 1]) {
      detail.solid(x, H, z + s * (d / 2 - 0.13), w, 0.4, 0.26, frame);
      detail.solid(x + s * (w / 2 - 0.13), H, z, 0.26, 0.4, d - 0.52, frame);
    }
  }
  if (f.industrial) {
    const bay = Math.min(3.8, along - 1);
    front(detail, 0, 0.2, bay + 0.24, 3.0, 0.12, 0.06, dark);
    front(detail, 0, 0.25, bay, 2.8, 0.1, 0.14, 0x869399);
    for (let i = 1; i < 5; i++) front(detail, 0, 0.25 + i * 0.52, bay, 0.035, 0.04, 0.21, dark);
    front(glow, 0, 3.35, 0.7, 0.11, 0.06, 0.17, 0xffbe75);
  } else {
    const doorW = Math.min(1.65, along * 0.28), bay = Math.min(2.4, (along - doorW - 0.76) / 2);
    front(detail, 0, 0.18, doorW + 0.16, 2.45, 0.16, 0.08, dark);
    front(glass, 0, 0.25, doorW, 2.25, 0.06, 0.2, f.style === 'slum' ? 0x826858 : 0x658897);
    front(detail, 0, 0.25, 0.055, 2.25, 0.06, 0.25, frame);
    if (f.landmark || f.style === 'shop' || f.style === 'glass') for (const s of [-1, 1]) {
      const a = s * (doorW / 2 + 0.22 + bay / 2);
      front(detail, a, 0.55, bay + 0.14, 1.85, 0.12, 0.06, dark);
      front(glass, a, 0.63, bay, 1.69, 0.05, 0.16, 0x6c91a4);
      front(detail, a, 0.63, 0.055, 1.69, 0.04, 0.2, frame);
      if (f.landmark) front(glow, a, 2.51, Math.min(bay, 0.85), 0.09, 0.05, 0.14, 0xffdfac);
    }
  }
  if (f.awning) {
    const aw = Math.min(along - 1, 8);
    const stripes = Math.max(3, Math.floor(aw / 0.55));
    for (let i = 0; i < stripes; i++) if (i % 2 === 0) {
      front(detail, (i + 0.5) * aw / stripes - aw / 2, 3.225, aw / stripes - 0.015, 0.025, 1.55, 0.8, 0xe6e0d4);
    }
    front(detail, 0, 2.92, aw, 0.13, 0.08, 1.6, f.accent);
  }
  if (f.quality !== 'low' && (f.style === 'office' || f.style === 'glass')) {
    // The base of setback towers retains a full footprint; upper trim stays on the narrower tower.
    const facadeHeight = f.setback ? Math.floor(H / 3.2 * 0.62) * 3.2 : H;
    for (const s of [-1, 1]) {
      front(detail, s * (along / 2 - 0.2), 0.18, 0.28, facadeHeight - 0.18, 0.16, 0.08, frame);
    }
    for (let y = 6.4; y < facadeHeight - 0.25; y += f.quality === 'high' ? 9.6 : 16) {
      front(detail, 0, y, along, 0.16, 0.16, 0.08, dark);
    }
    if (f.landmark && H >= 12.8) front(glow, 0, facadeHeight - 0.5, along * 0.72, 0.12, 0.07, 0.12, f.accent);
  }
}
