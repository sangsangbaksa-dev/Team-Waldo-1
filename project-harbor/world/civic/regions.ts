import { districtAt, type District } from '../domain';

/**
 * The design note used downtown / harbor / residential / market / industrial / beach.
 * This map's districts are the ones below. Ground colors stay the shipped district colors.
 * downtown → city, residential → rich, market crowd → slum,
 * industrial → base, arid sun and wind → desert, woodland → forest.
 */
export interface RegionProfile {
  id: District;
  pedestrian: number;
  traffic: number;
  props: string[];
  daySky: number;
  nightSky: number;
  fog: number;
  fogDensity: number;
  sun: number;
  hemi: number;
  ground: number;
  lamp: number;
  window: number;
  roof: number;
  ambient: 'canopy' | 'traffic' | 'garden' | 'wind' | 'crowd' | 'machine';
}

export const PROFILES: Record<District, RegionProfile> = {
  forest: {
    id: 'forest', pedestrian: 0.55, traffic: 0.35,
    props: ['plant', 'bench', 'lamp', 'sign'],
    daySky: 0x9eb8a4, nightSky: 0x101c18, fog: 0xa8c0ae, fogDensity: 0.0034,
    sun: 0xffe6c4, hemi: 0xc5dcc8, ground: 0x3d5340, lamp: 0xffd7a1,
    window: 0x6e8f78, roof: 0x5c4636, ambient: 'canopy',
  },
  city: {
    id: 'city', pedestrian: 1, traffic: 1,
    props: ['lamp', 'bench', 'stall', 'trash', 'planter', 'sign'],
    daySky: 0xa9b7c4, nightSky: 0x141a28, fog: 0xa9b7c5, fogDensity: 0.0022,
    sun: 0xf2f4f8, hemi: 0xc5d0dc, ground: 0x4a524f, lamp: 0xf4f1ea,
    window: 0x8eb4c9, roof: 0x3e484e, ambient: 'traffic',
  },
  rich: {
    id: 'rich', pedestrian: 0.6, traffic: 0.55,
    props: ['lamp', 'bench', 'planter', 'plant', 'sign'],
    daySky: 0xc5d2b4, nightSky: 0x1a1c28, fog: 0xb8c4b1, fogDensity: 0.0016,
    sun: 0xffe1b8, hemi: 0xe4ecd4, ground: 0x6d624c, lamp: 0xffe0a4,
    window: 0xd7efe8, roof: 0x6a5348, ambient: 'garden',
  },
  desert: {
    id: 'desert', pedestrian: 0.45, traffic: 0.5,
    props: ['stall', 'sign', 'plant', 'trash'],
    daySky: 0xe4c89a, nightSky: 0x24180f, fog: 0xd2b48a, fogDensity: 0.0028,
    sun: 0xffd2a0, hemi: 0xf0d7b4, ground: 0x8a6844, lamp: 0xffb15a,
    window: 0xc9b08a, roof: 0x8a5a3c, ambient: 'wind',
  },
  slum: {
    id: 'slum', pedestrian: 1.15, traffic: 0.4,
    props: ['trash', 'stall', 'lamp', 'sign', 'bench'],
    daySky: 0xcbb8a4, nightSky: 0x1c1412, fog: 0xbca89a, fogDensity: 0.0031,
    sun: 0xffd8b0, hemi: 0xe2d0be, ground: 0x5c463c, lamp: 0xffb06a,
    window: 0xc9844a, roof: 0x5a4038, ambient: 'crowd',
  },
  base: {
    id: 'base', pedestrian: 0.4, traffic: 0.7,
    props: ['barricade', 'sandbag', 'lamp', 'sign'],
    daySky: 0xb7b8aa, nightSky: 0x141612, fog: 0x969b98, fogDensity: 0.0025,
    sun: 0xf0f0e4, hemi: 0xd5d6c8, ground: 0x4e5244, lamp: 0xffc56a,
    window: 0x9aa58a, roof: 0x5c624c, ambient: 'machine',
  },
};

export interface Climate {
  sky: number;
  fog: number;
  fogDensity: number;
  sun: number;
  hemi: number;
  ground: number;
  night: number;
  profile: RegionProfile;
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const ch = (from: number, to: number) => Math.round(from + (to - from) * t);
  return (ch(ar, br) << 16) + (ch(ag, bg) << 8) + ch(ab, bb);
}

function shift(x: number, z: number): { x: number; z: number } {
  const ex = Math.min(x % 1024, 1024 - (x % 1024));
  const ez = Math.min(z % 1024, 1024 - (z % 1024));
  if (ex <= ez) return { x: x + (x % 1024 < 512 ? -80 : 80), z };
  return { x, z: z + (z % 1024 < 512 ? -80 : 80) };
}

/** Day/night plus a 70m blend across district borders. */
export function climateAt(x: number, z: number, hours: number): Climate {
  const here = PROFILES[districtAt(x, z).id];
  const edge = Math.min(x % 1024, 1024 - (x % 1024), z % 1024, 1024 - (z % 1024));
  const otherPoint = shift(x, z);
  const other = PROFILES[districtAt(otherPoint.x, otherPoint.z).id];
  const t = edge >= 70 ? 1 : Math.max(0, edge / 70);
  const night = hours < 5 || hours >= 20 ? 1 : hours < 7 ? (7 - hours) / 2 : hours >= 18 ? (hours - 18) / 2 : 0;
  return {
    sky: mix(mix(other.daySky, here.daySky, t), mix(other.nightSky, here.nightSky, t), night),
    fog: mix(other.fog, here.fog, t),
    fogDensity: other.fogDensity + (here.fogDensity - other.fogDensity) * t,
    sun: mix(other.sun, here.sun, t),
    hemi: mix(other.hemi, here.hemi, t),
    ground: mix(other.ground, here.ground, t),
    night,
    profile: here,
  };
}

export function bandOf(hours: number): 0 | 1 | 2 | 3 | 4 {
  if (hours < 5) return 0;
  if (hours < 8) return 1;
  if (hours < 17) return 2;
  if (hours < 21) return 3;
  return 4;
}
