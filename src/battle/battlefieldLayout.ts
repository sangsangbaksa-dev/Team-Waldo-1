import { WORLD_HALF,KINGDOM_CORNERS,STRATEGIC_POSTS,walkable } from './terrain';
/**
 * Deterministic, authored + procedural battlefield layout.
 * All coordinates use the same flat X/Z plane as the strategy simulation.
 * Geometry consumes these records; simulation consumes ONLY collision/cover data.
 * No copyrighted game meshes or textures are required.
 */
export type BattlefieldFeatureKind =
  | 'bunker' | 'hangar' | 'refinery' | 'radar' | 'tower' | 'generator'
  | 'cargo' | 'barricade' | 'pylon' | 'pipeline' | 'wreck'
  | 'outcrop' | 'crater' | 'trench' | 'crystal'
  | 'pine' | 'deadwood' | 'scrap' | 'solar';

export interface BattlefieldFeature {
  id: number;
  kind: BattlefieldFeatureKind;
  x: number;
  z: number;
  rotation: number;
  scale: number;
  /** Radius of solid ground footprint; 0 means a scenic, non-blocking prop. */
  radius: number;
  /** Protection from 0 to 1 available immediately adjacent to this feature. */
  cover: number;
}

const HALF = WORLD_HALF;
const HQ = KINGDOM_CORNERS;
const POSTS = STRATEGIC_POSTS;
const RAND_KINDS: BattlefieldFeatureKind[] = [
  'outcrop', 'outcrop', 'crater', 'barricade', 'cargo', 'trench',
  'pine', 'pine', 'pine', 'deadwood', 'deadwood', 'crystal',
  'wreck', 'scrap', 'scrap', 'pipeline', 'pylon', 'solar',
];
const SIZES: Record<BattlefieldFeatureKind, [number, number]> = {
  bunker: [6.5, .24], hangar: [10, .16], refinery: [8, .2],
  radar: [4.5, .16], tower: [3.4, .2], generator: [5.5, .17],
  cargo: [5.8, .2], barricade: [3.2, .29], pylon: [2.3, .11],
  pipeline: [4.2, .13], wreck: [3.6, .18], outcrop: [3.3, .17],
  crater: [0, .06], trench: [0, .21], crystal: [2.0, .12],
  pine: [0, 0], deadwood: [0, 0], scrap: [0, 0], solar: [2.0, .08],
};

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function nearStrategicLocation(x: number, z: number, padding: number): boolean {
  return HQ.some(([a, b]) => distance(x, z, a, b) < 47 + padding) ||
    POSTS.some(([a, b]) => distance(x, z, a, b) < 17 + padding);
}

/** Keep the main roads and assault lanes open for the 100-vs-500 battle. */
function inAssaultLane(x: number, z: number): boolean {
  return Math.abs(x) < 11 || Math.abs(z) < 11 ||
    Math.abs(x - z) < 9 || Math.abs(x + z) < 9;
}

/** Rebuilt from a fixed seed, not stored in saves. */
export function createBattlefieldLayout(seed = 0x7a11d0): BattlefieldFeature[] {
  const rng = random(seed);
  const features: BattlefieldFeature[] = [];
  function add(kind: BattlefieldFeatureKind, x: number, z: number,
    scale = 1, rotation = rng() * Math.PI * 2): void {
    if (Math.abs(x) > HALF - 13 || Math.abs(z) > HALF - 13) return;
    const [baseRadius, cover] = SIZES[kind];
    if(!walkable(x,z,baseRadius*scale+4))return;
    features.push({
      id: features.length, kind, x, z, scale, rotation,
      radius: baseRadius * scale,
      cover,
    });
  }

  // Each faction controls a distinct occupied military-industrial compound.
  // Infrastructure is placed behind the reinforcement-spawn directions.
  for (let team = 0; team < HQ.length; team++) {
    const [x, z] = HQ[team];
    const sx = Math.sign(x), sz = Math.sign(z);
    add('hangar', x + sx * 33, z + sz * 22, 1.08, team * Math.PI / 2);
    add('refinery', x + sx * 6, z + sz * 40, .95, team * Math.PI / 2);
    add('radar', x + sx * 39, z - sz * 11, 1.05);
    add('bunker', x - sx * 34, z + sz * 24, 1.1);
    add('generator', x + sx * 37, z + sz * 41, .95);
    add('tower', x - sx * 38, z + sz * 3, 1.1);
    add('cargo', x + sx * 20, z + sz * 43, 1.2);
    add('pylon', x - sx * 25, z + sz * 39, 1.1);
  }

  // Nine capture points become recognisable tactical installations.
  const postTypes: BattlefieldFeatureKind[] = [
    'refinery', 'cargo', 'hangar', 'radar', 'generator',
    'bunker', 'tower', 'bunker', 'refinery',
  ];
  for (let index = 0; index < POSTS.length; index++) {
    const [x, z] = POSTS[index];
    const angle = (index * 2.399) % (Math.PI * 2);
    const dx = Math.cos(angle), dz = Math.sin(angle);
    add(postTypes[index%postTypes.length], x + dx * 26, z + dz * 26, .76 + (index % 3) * .08, angle);
    add('barricade', x - dx * 19, z - dz * 19, .9, angle);
    add('pylon', x + dx * 20 - dz * 9, z + dz * 20 + dx * 9, .85, angle);
  }

  // Larger recognizable landmarks make scouting the map meaningful.
  const settlements: ReadonlyArray<readonly [number, number, BattlefieldFeatureKind]> = [
    [-199, -66, 'hangar'], [-192, 74, 'refinery'], [201, -67, 'generator'],
    [193, 78, 'hangar'], [-66, -192, 'radar'], [71, -193, 'bunker'],
    [-72, 191, 'refinery'], [66, 193, 'radar'],
    [-180, -192, 'tower'], [183, -185, 'cargo'],
    [-181, 186, 'generator'], [181, 182, 'tower'],
    [-143, 23, 'solar'], [141, -24, 'solar'],
    [-27, -147, 'pipeline'], [27, 150, 'pipeline'],
  ];
  for (const [x, z, kind] of settlements) {
    add(kind, x, z, .85 + rng() * .2);
    add('cargo', x + 16, z + 15, .8);
    add('barricade', x - 14, z - 12, .85);
  }

  // Clusters of scorched rock, dead forest, mineral seams and abandoned hardware.
  // Try a broad distribution, but preserve maneuvering corridors and spawn areas.
  for (let attempt = 0; attempt < 1250 && features.length < 525; attempt++) {
    const x = (rng() * 2 - 1) * (HALF - 16);
    const z = (rng() * 2 - 1) * (HALF - 16);
    const kind = RAND_KINDS[Math.floor(rng() * RAND_KINDS.length)];
    const scale = .65 + rng() * 1.28;
    const radius = SIZES[kind][0] * scale;
    if (nearStrategicLocation(x, z, radius + 6) ||
      inAssaultLane(x, z) ||
      features.some(f => f.radius && distance(x, z, f.x, f.z) < radius + f.radius + 4)) continue;
    add(kind, x, z, scale);
  }
  return features;
}

export const BATTLEFIELD_FEATURES: ReadonlyArray<BattlefieldFeature> =
  createBattlefieldLayout();

const CELL = 18;
const collisionGrid = new Map<string, BattlefieldFeature[]>();
const coverGrid = new Map<string, BattlefieldFeature[]>();
const cell = (x: number, z: number) => String(Math.floor(x / CELL)) + ':' + String(Math.floor(z / CELL));
for (const feature of BATTLEFIELD_FEATURES) {
  if (!feature.radius && !feature.cover) continue;
  const max = feature.radius + 6;
  for (let ix = Math.floor((feature.x - max) / CELL); ix <= Math.floor((feature.x + max) / CELL); ix++) {
    for (let iz = Math.floor((feature.z - max) / CELL); iz <= Math.floor((feature.z + max) / CELL); iz++) {
      const key = String(ix) + ':' + String(iz);
      if (feature.radius > 0) {
        const bucket = collisionGrid.get(key) ?? [];
        bucket.push(feature);
        collisionGrid.set(key, bucket);
      }
      if (feature.cover > 0) {
        const bucket = coverGrid.get(key) ?? [];
        bucket.push(feature);
        coverGrid.set(key, bucket);
      }
    }
  }
}

export function isBattlefieldBlocked(x: number, z: number, unitRadius = .7): boolean {
  return (collisionGrid.get(cell(x, z)) ?? []).some(f =>
    (x - f.x) ** 2 + (z - f.z) ** 2 < (f.radius + unitRadius) ** 2);
}

/** Return a deterministic sidestep around physical terrain rather than crossing it. */
export function resolveBattlefieldStep(
  x: number, z: number, nextX: number, nextZ: number, goalX: number, goalZ: number,
): { x: number; z: number } {
  if (!isBattlefieldBlocked(nextX, nextZ)) return { x: nextX, z: nextZ };
  const vx = nextX - x, vz = nextZ - z;
  const len = Math.hypot(vx, vz);
  if (len < 1e-6) return { x, z };
  const nx = vx / len, nz = vz / len;
  const candidates = [
    { x: x - nz * len, z: z + nx * len },
    { x: x + nz * len, z: z - nx * len },
    { x: x + (nx - nz) * len * .7071, z: z + (nz + nx) * len * .7071 },
    { x: x + (nx + nz) * len * .7071, z: z + (nz - nx) * len * .7071 },
  ];
  const valid = candidates.filter(p => !isBattlefieldBlocked(p.x, p.z));
  if (!valid.length) return { x, z };
  valid.sort((a, b) =>
    distance(a.x, a.z, goalX, goalZ) - distance(b.x, b.z, goalX, goalZ));
  return valid[0];
}

/** Physical obstacles shelter nearby infantry, without increasing stored unit state. */
export function battlefieldCoverAt(x: number, z: number): number {
  let cover = 0;
  for (const f of coverGrid.get(cell(x, z)) ?? []) {
    const range = f.radius + 5.5;
    const d = distance(x, z, f.x, f.z);
    if (d >= f.radius + .5 && d <= range) cover = Math.max(cover, f.cover);
  }
  return cover;
}
