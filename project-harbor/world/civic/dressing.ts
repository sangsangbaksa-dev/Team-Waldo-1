import { CHUNK, blocked, districtAt, propsFor, randomFor, roadDistance, roadHalf, type District, type PropKind, type WorldProp } from '../domain';
import { PROFILES } from './regions';

interface Recipe { kind: PropKind; w: number; d: number; h: number; color: number; glow?: boolean }

const RECIPES: Record<District, Recipe[]> = {
  forest: [
    { kind: 'plant', w: 1.4, d: 1.4, h: 1.6, color: 0x3f6a40 },
    { kind: 'plant', w: 1.1, d: 1.1, h: 1.2, color: 0x4e7a48 },
    { kind: 'bench', w: 1.8, d: 0.6, h: 0.9, color: 0x6b5340 },
    { kind: 'lamp', w: 0.4, d: 0.4, h: 3.2, color: 0x3e4642, glow: true },
    { kind: 'sign', w: 0.9, d: 0.2, h: 1.8, color: 0x8a6a45 },
  ],
  city: [
    { kind: 'lamp', w: 0.35, d: 0.35, h: 4.2, color: 0x3a4146, glow: true },
    { kind: 'bench', w: 1.8, d: 0.55, h: 0.85, color: 0x5c656b },
    { kind: 'stall', w: 2.4, d: 1.6, h: 2.4, color: 0x8ea0aa },
    { kind: 'trash', w: 0.55, d: 0.45, h: 0.8, color: 0x3e4748 },
    { kind: 'planter', w: 1.2, d: 1.2, h: 0.7, color: 0x6d7570 },
    { kind: 'sign', w: 1.2, d: 0.16, h: 2.2, color: 0xd5d8dc },
  ],
  rich: [
    { kind: 'lamp', w: 0.32, d: 0.32, h: 3.1, color: 0x2f3a34, glow: true },
    { kind: 'bench', w: 1.7, d: 0.55, h: 0.8, color: 0xefe6d4 },
    { kind: 'planter', w: 1.3, d: 1.3, h: 0.65, color: 0xc8bfa8 },
    { kind: 'plant', w: 1.2, d: 1.2, h: 1.5, color: 0x4f7a49 },
    { kind: 'sign', w: 0.8, d: 0.12, h: 1.5, color: 0xf4efe4 },
  ],
  desert: [
    { kind: 'stall', w: 2.6, d: 1.8, h: 2.2, color: 0xc4a074 },
    { kind: 'sign', w: 1.1, d: 0.16, h: 1.7, color: 0xe6d2a4 },
    { kind: 'plant', w: 1.3, d: 1.3, h: 0.8, color: 0x8a9a58 },
    { kind: 'trash', w: 0.7, d: 0.7, h: 0.9, color: 0x8d5a32 },
    { kind: 'lamp', w: 0.3, d: 0.3, h: 3.4, color: 0x6a543c, glow: true },
  ],
  slum: [
    { kind: 'trash', w: 0.8, d: 0.7, h: 0.7, color: 0x5c5148 },
    { kind: 'stall', w: 2.2, d: 1.5, h: 2.1, color: 0xa68458 },
    { kind: 'lamp', w: 0.3, d: 0.3, h: 3.3, color: 0x4a4038, glow: true },
    { kind: 'sign', w: 1, d: 0.14, h: 1.8, color: 0xd8a640 },
    { kind: 'bench', w: 1.6, d: 0.5, h: 0.75, color: 0x6e5a48 },
  ],
  base: [
    { kind: 'barricade', w: 2.4, d: 0.4, h: 1, color: 0xc4b15a },
    { kind: 'sandbag', w: 1.4, d: 0.7, h: 0.55, color: 0x8a8460 },
    { kind: 'lamp', w: 0.35, d: 0.35, h: 4.6, color: 0x4e5344, glow: true },
    { kind: 'sign', w: 1.1, d: 0.12, h: 1.6, color: 0xd7d3b0 },
  ],
};

function faceRoad(x: number, z: number): number {
  const rx = Math.round((x - 64) / 256) * 256 + 64;
  const rz = Math.round((z - 64) / 256) * 256 + 64;
  const hx = roadHalf('x', rx);
  const hz = roadHalf('z', rz);
  if (hx && (!hz || Math.abs(x - rx) < Math.abs(z - rz))) return x >= rx ? Math.PI / 2 : -Math.PI / 2;
  if (hz) return z >= rz ? 0 : Math.PI;
  return 0;
}

/** Small repeated props. Buildings stay in propsFor. Near LOD only when rendered. */
export function detailsFor(cx: number, cz: number): WorldProp[] {
  const rand = randomFor(cx + 401, cz + 91);
  const id = districtAt(cx * CHUNK + 64, cz * CHUNK + 64).id;
  const buildings = propsFor(cx, cz);
  const recipes = RECIPES[id];
  const out: WorldProp[] = [];
  const limit = Math.round(recipes.length * (id === 'city' || id === 'slum' ? 1.4 : 1));
  for (let n = 0; n < limit * 6 && out.length < limit; n++) {
    const recipe = recipes[Math.floor(rand() * recipes.length)]!;
    const x = cx * CHUNK + 8 + rand() * (CHUNK - 16);
    const z = cz * CHUNK + 8 + rand() * (CHUNK - 16);
    const prop: WorldProp = {
      kind: recipe.kind, x, z, w: recipe.w, d: recipe.d, h: recipe.h, color: recipe.color,
      yaw: faceRoad(x, z) + (recipe.kind === 'plant' ? rand() * 0.4 : 0),
      detail: true, glow: recipe.glow,
    };
    if (roadDistance(x, z) < Math.max(prop.w, prop.d) / 2 + 3) continue;
    if (Math.hypot(x - 1536, z - 576) < 18) continue;
    if (x - prop.w / 2 < cx * CHUNK + 2 || x + prop.w / 2 > (cx + 1) * CHUNK - 2) continue;
    if (z - prop.d / 2 < cz * CHUNK + 2 || z + prop.d / 2 > (cz + 1) * CHUNK - 2) continue;
    if (blocked(x, z, buildings, Math.max(prop.w, prop.d) / 2)) continue;
    if (out.some(other => Math.abs(other.x - x) < (other.w + prop.w) / 2 + 1.2 && Math.abs(other.z - z) < (other.d + prop.d) / 2 + 1.2)) continue;
    out.push(prop);
  }
  return out;
}

export function detailSignature(id: District): string {
  return PROFILES[id].props.join(',');
}
