// Architectural details are emitted as small boxes and merged into existing city chunks.
import type { Building } from './types';

export type DetailMaterial = 'trim' | 'glass' | 'light';
export interface ArchitecturalBox { x: number; y: number; z: number; w: number; h: number; d: number; tint: number; material: DetailMaterial }
type Quality = 'low' | 'standard' | 'high';

export function architectureDetails(b: Building, quality: Quality, landmark = false): ArchitecturalBox[] {
  const out: ArchitecturalBox[] = [];
  if (quality === 'low' && !landmark) return out;
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, tint: number, material: DetailMaterial = 'trim') => {
    if (w > 0 && h > 0 && d > 0) out.push({ x, y, z, w, h, d, tint, material });
  };
  const front = b.z - b.d / 2, base = 0.15, top = b.h + base;
  const industrial = ['warehouse', 'garage', 'factory'].includes(b.kind);
  const commercial = landmark || b.kind === 'shop' || b.kind === 'office';
  const dark = industrial ? 0x4a5558 : b.kind === 'house' ? 0x786e62 : 0x5e6971;
  const frame = b.kind === 'tower' || b.kind === 'office' ? 0xa7b4bc : industrial ? 0x7f8a8b : 0xc0b1a0;
  // A plinth and cornice add depth without creating new walkable obstacles.
  add(b.x, base + 0.21, b.z, b.w + 0.08, 0.42, b.d + 0.08, dark);
  if (b.roof !== 'gable') {
    for (const s of [-1, 1]) {
      add(b.x, top + 0.48, b.z + s * (b.d / 2 - 0.18), b.w, 0.55, 0.36, frame);
      add(b.x + s * (b.w / 2 - 0.18), top + 0.48, b.z, 0.36, 0.55, b.d - 0.72, frame);
    }
  }
  if (industrial) {
    const width = Math.min(5.8, b.w * 0.24), height = Math.min(4.4, b.h - 1);
    for (const a of [-1, 1]) {
      const x = b.x + a * (width / 2 + 0.6);
      add(x, base + height / 2, front - 0.055, width + 0.32, height + 0.24, 0.12, dark);
      add(x, base + height / 2, front - 0.13, width, height, 0.08, 0x879093);
      if (quality !== 'low') for (let k = 1; k <= 4; k++) add(x, base + height * k / 5, front - 0.19, width, 0.045, 0.035, 0x4c5357);
      add(x, base + height + 0.35, front - 0.14, 0.7, 0.16, 0.13, 0xffc583, 'light');
    }
  } else if (commercial) {
    const bay = Math.min(3.8, b.w * 0.18), height = Math.min(2.5, b.h - 0.7);
    // The entrance and flanking windows have actual frame thickness and glass.
    add(b.x, base + height / 2, front - 0.095, 2.35, height + 0.14, 0.2, dark);
    add(b.x, base + height / 2, front - 0.21, 1.98, height - 0.13, 0.045, 0x516977, 'glass');
    add(b.x, base + height / 2, front - 0.25, 0.075, height, 0.04, frame);
    for (const s of [-1, 1]) {
      const x = b.x + s * (bay / 2 + 1.5);
      add(x, base + height / 2 + 0.2, front - 0.06, bay + 0.18, height - 0.22, 0.13, dark);
      add(x, base + height / 2 + 0.2, front - 0.145, bay, height - 0.4, 0.055, 0x678797, 'glass');
      add(x, base + height + 0.3, front - 0.14, Math.min(1.4, bay), 0.09, 0.11, landmark ? 0x9deaff : 0xffd7a2, 'light');
    }
    add(b.x, base + height + 0.5, front - 0.13, Math.min(b.w - 0.5, bay * 2 + 3.5), 0.16, 0.3, frame);
  } else if (b.kind === 'house' || b.kind === 'apartment') {
    add(b.x, base + 1.05, front - 0.07, 1.45, 2.1, 0.14, dark);
    add(b.x, base + 1.05, front - 0.16, 1.19, 1.92, 0.08, 0x80634e);
    add(b.x + 0.42, base + 1.03, front - 0.215, 0.09, 0.1, 0.06, 0xd7be8d);
    if (b.kind === 'apartment' && quality === 'high') {
      for (let y = base + 3.4; y < top - 1 && y < 18; y += 6.6) {
        add(b.x, y, front - 0.11, b.w - 0.45, 0.2, 0.25, frame);
      }
    }
  }
  if (quality !== 'low' && (b.kind === 'tower' || b.kind === 'office')) {
    // Four structural pilasters break up the flat silhouette, with a restrained crown.
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      add(b.x + s * (b.w / 2 - 0.24), base + b.h / 2, b.z + t * (b.d / 2 - 0.24), 0.58, b.h, 0.58, frame);
    }
    const crownY = top - Math.min(1.6, b.h * 0.09);
    add(b.x, crownY, b.z, b.w + 0.17, 0.24, b.d + 0.17, dark);
    if (quality === 'high' && b.kind === 'tower' && b.id % 3 === 0) {
      for (const s of [-1, 1]) add(b.x, crownY + 0.4, b.z + s * (b.d / 2 + 0.06), b.w * 0.8, 0.12, 0.13, 0x8ad9ff, 'light');
    }
  }
  return out;
}
