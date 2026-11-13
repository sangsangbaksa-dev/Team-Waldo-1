import type { MapBiome } from './maps';

/** A single authored palette keeps terrain, landmarks and atmospheric light coherent. */
export interface BiomePalette {
  sky: number; fog: number; ambientSky: number; ambientGround: number; sunlight: number;
  terrainLow: number; terrainHigh: number; water: number; road: number;
  stone: number; stoneDark: number; armor: number; steel: number; sand: number;
  vegetation: number; vegetationLight: number; grass: number; grassLight: number;
  bark: number; dust: number; crystal: number; accent: number;
  weather: string; minimap: string; minimapLand: string;
}

export const BIOME_PALETTES: Readonly<Record<MapBiome, BiomePalette>> = {
  industrial: {
    sky: 0x344951, fog: 0x344951, ambientSky: 0xb7d5dc, ambientGround: 0x263c34, sunlight: 0xffdda7,
    terrainLow: 0x344c42, terrainHigh: 0x61765d, water: 0x254e62, road: 0x6c7166,
    stone: 0x76838a, stoneDark: 0x344653, armor: 0x405b6b, steel: 0x92aab4, sand: 0x798272,
    vegetation: 0x30584b, vegetationLight: 0x62816b, grass: 0x6b8658, grassLight: 0x93a377,
    bark: 0x5e4c3d, dust: 0x91b6bc, crystal: 0x59d6dd, accent: 0x75e1cd,
    weather: '옅은 안개 · 산업 지대', minimap: '#142a31', minimapLand: '#254d45',
  },
  desert: {
    sky: 0x5b5159, fog: 0x756159, ambientSky: 0xe9d5c0, ambientGround: 0x604638, sunlight: 0xffd0a0,
    terrainLow: 0x83664f, terrainHigh: 0xc1a075, water: 0x40666d, road: 0xa18865,
    stone: 0xb79d82, stoneDark: 0x6d6156, armor: 0x5c6869, steel: 0xa5aaa1, sand: 0xc3a379,
    vegetation: 0x677759, vegetationLight: 0x96a377, grass: 0x9c9a66, grassLight: 0xc7b986,
    bark: 0x7b6149, dust: 0xf0c595, crystal: 0xefa557, accent: 0xf3c78d,
    weather: '석양 · 사막 바람', minimap: '#332924', minimapLand: '#65513b',
  },
  tundra: {
    sky: 0x394f69, fog: 0x6e899f, ambientSky: 0xd5e9fa, ambientGround: 0x526675, sunlight: 0xe4f4ff,
    terrainLow: 0x8aabbc, terrainHigh: 0xd5e2e2, water: 0x47758d, road: 0x7b99aa,
    stone: 0xb6c9d1, stoneDark: 0x587186, armor: 0x54758a, steel: 0xb6d6df, sand: 0xd6e4e7,
    vegetation: 0x4e7276, vegetationLight: 0xb7d0ce, grass: 0x8dafb5, grassLight: 0xd3e6e7,
    bark: 0x61747b, dust: 0xf0faff, crystal: 0x85d7f2, accent: 0xa6dbff,
    weather: '백야 · 가벼운 눈', minimap: '#1e3245', minimapLand: '#486b80',
  },
};
