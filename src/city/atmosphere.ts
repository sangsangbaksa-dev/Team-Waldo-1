// LAST CITY — 하늘·안개·빛·젖은 도시의 분위기. 도시 시각(0~24)과 날씨만으로 정해지는 순수 함수라 헤드리스 테스트가 가능하고,
// 렌더러(render3d.ts)·스카이돔·스카이라인이 같은 값을 읽어 한 장면의 색을 맞춥니다.
import type { Weather } from './clock';

export type Rgb = [number, number, number];
export interface Atmosphere {
  /** 하늘 돔 위·중간·지평선 색, 안개색(지평선 색과 같아야 먼 곳이 하늘에 녹아듭니다) */
  skyTop: Rgb; skyMid: Rgb; skyLow: Rgb; fog: Rgb; fogNear: number; fogFar: number;
  /** 반구광(하늘/땅 색, 세기)과 해·달빛(색, 세기)과 채움광 세기, 톤매핑 노출 */
  hemiSky: Rgb; hemiGround: Rgb; hemiI: number; sunColor: Rgb; sunI: number; fillI: number; exposure: number;
  /** 해의 고도(-1~1, 0 아래면 달빛으로 바뀜)와 방위(라디안). 하늘 표시용 */
  sunElev: number; sunAz: number;
  /** 0~1: 구름 덮임, 별, 해 원반 가시성 */
  cloud: number; stars: number; sunVis: number;
  /** 창문·네온·가로등 발광 배율(낮 ≈ 0.05, 밤 ≈ 1) */
  windows: number; neon: number; lamps: number;
  /** 0~1: 도로의 젖은 정도(웅덩이 불투명도·반사 세기), 빗줄기 농도·기울기 */
  wet: number; rain: number; wind: number;
  /** 구름 색(구름 돔에 곱해짐), 증기·연기 색 */
  cloudColor: Rgb; steam: Rgb;
  /** 0~1: 밤의 정도(별·도시 불빛 번짐·붉은 경고등에 씀) */
  night: number;
}

const hex = (h: number): Rgb => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const lum = (c: Rgb): number => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const rgbHex = (c: Rgb): number => (Math.round(clamp01(c[0]) * 255) << 16) | (Math.round(clamp01(c[1]) * 255) << 8) | Math.round(clamp01(c[2]) * 255);

/** 맑은 날 시각별 기준 색(비·폭풍우는 여기서 흐리게 가공합니다) */
interface Key { h: number; top: number; mid: number; low: number; fog: number; hs: number; hg: number; hi: number; sun: number; si: number; ex: number }
const KEYS: Key[] = [
  { h: 0, top: 0x04060f, mid: 0x0b1226, low: 0x23203a, fog: 0x151a2c, hs: 0x4a5f9a, hg: 0x1c1a28, hi: 0.78, sun: 0x8fa8ff, si: 0.7, ex: 1.2 },
  { h: 4.5, top: 0x060a1c, mid: 0x131d3c, low: 0x3a2f4a, fog: 0x1c2238, hs: 0x5468a8, hg: 0x1f1c2a, hi: 0.8, sun: 0x93aaff, si: 0.65, ex: 1.2 },
  { h: 6.2, top: 0x283f78, mid: 0xd4806a, low: 0xf2b08a, fog: 0xc79681, hs: 0xa9b9e0, hg: 0x7a5a4a, hi: 0.88, sun: 0xffb98a, si: 1.3, ex: 1.08 },
  { h: 9, top: 0x3f6db8, mid: 0x9fc0e0, low: 0xd6dde2, fog: 0xc0cbd8, hs: 0xbfd2f0, hg: 0x8a7a6c, hi: 0.98, sun: 0xfff0dc, si: 2.0, ex: 1.04 },
  { h: 13, top: 0x2f63b8, mid: 0x86b4e0, low: 0xcfdbe6, fog: 0xbccbdc, hs: 0xc3d6f5, hg: 0x8f8274, hi: 1.0, sun: 0xffffff, si: 2.3, ex: 1.02 },
  { h: 16.8, top: 0x3a5a9a, mid: 0xe0a888, low: 0xf0c096, fog: 0xcfa58e, hs: 0xb7c6e8, hg: 0x8a6450, hi: 0.95, sun: 0xffd4a8, si: 2.05, ex: 1.06 },
  { h: 19, top: 0x2b3a78, mid: 0xe4764e, low: 0xf0a070, fog: 0xb4806e, hs: 0x9aa8d8, hg: 0x6a4a42, hi: 0.82, sun: 0xff9a60, si: 1.5, ex: 1.08 },
  { h: 20.5, top: 0x121a46, mid: 0x6a3a5a, low: 0xa5545a, fog: 0x5e4458, hs: 0x6a78b8, hg: 0x3a2e3a, hi: 0.76, sun: 0xff7a60, si: 0.6, ex: 1.14 },
  { h: 22, top: 0x05081a, mid: 0x0d1530, low: 0x2a2038, fog: 0x161b2e, hs: 0x4a5f9a, hg: 0x1c1a28, hi: 0.78, sun: 0x8fa8ff, si: 0.7, ex: 1.2 },
  { h: 24, top: 0x04060f, mid: 0x0b1226, low: 0x23203a, fog: 0x151a2c, hs: 0x4a5f9a, hg: 0x1c1a28, hi: 0.78, sun: 0x8fa8ff, si: 0.7, ex: 1.2 },
];

/** 비·폭풍우 하늘: 채도를 빼고 청록 회색으로 가라앉힌다. */
const OVERCAST: Rgb = [0.78, 0.9, 1.0];
function gray(c: Rgb, k: number, dim: number): Rgb { const l = lum(c) * dim; return mix(c, [l * OVERCAST[0], l * OVERCAST[1], l * OVERCAST[2]], k); }

/** 도시 시각(0~24)·날씨 → 장면 분위기 */
export function atmosphereAt(hour: number, weather: Weather): Atmosphere {
  const h = ((hour % 24) + 24) % 24;
  let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = smooth(0, 1, (h - a.h) / (b.h - a.h));
  const m = (x: number, y: number): Rgb => mix(hex(x), hex(y), k);
  // 낮의 정도(해 고도로 구함): 해는 6시에 뜨고 18시에 진다.
  const az = (h - 6) / 12 * Math.PI, elev = Math.sin(az), day = smooth(-0.12, 0.3, elev), night = 1 - smooth(-0.35, 0.05, elev);
  const kw = weather === 'storm' ? 1 : weather === 'rain' ? 0.82 : 0, dim = weather === 'storm' ? 0.5 : weather === 'rain' ? 0.72 : 1;
  let top = m(a.top, b.top), mid = m(a.mid, b.mid), low = m(a.low, b.low), fog = m(a.fog, b.fog);
  const hemiSky = m(a.hs, b.hs), hemiGround = m(a.hg, b.hg), sun = m(a.sun, b.sun);
  let hemiI = lerp(a.hi, b.hi, k), sunI = lerp(a.si, b.si, k);
  if (kw > 0) {
    top = gray(top, kw, dim * 0.9); mid = gray(mid, kw, dim); low = gray(low, kw * 0.9, dim); fog = gray(fog, kw, dim);
    // 비 오는 밤: 구름 밑면이 도시 불빛(붉은 주황)을 받아 지평선이 달아오른다.
    const glow = night * kw; low = mix(low, hex(0x5c3340), glow * 0.55); fog = mix(fog, hex(0x2c2234), glow * 0.4); mid = mix(mid, hex(0x2a2030), glow * 0.35);
    sunI *= weather === 'storm' ? 0.12 : 0.22; hemiI *= weather === 'storm' ? 0.92 : 1.02;
  }
  const fogNear = weather === 'storm' ? 220 : weather === 'rain' ? 380 : 900, fogFar = weather === 'storm' ? 2100 : weather === 'rain' ? 2900 : 4700;
  const sunColor = kw > 0 ? gray(sun, kw * 0.8, 1) : sun, wet = weather === 'clear' ? 0.55 : 1;
  const cloudBase = kw > 0 ? gray(mix(low, mid, 0.5), 0.6, 0.95) : scale(mix(low, top, 0.2), 1.05);
  const lit = Math.max(night, 0.35 * (1 - day));
  return {
    skyTop: top, skyMid: mid, skyLow: low, fog, fogNear, fogFar,
    hemiSky, hemiGround, hemiI, sunColor, sunI, fillI: lerp(0.5, 0.3, night) * (weather === 'storm' ? 0.8 : 1), exposure: lerp(a.ex, b.ex, k) * (weather === 'storm' ? 0.96 : 1),
    sunElev: elev, sunAz: az, cloud: weather === 'storm' ? 1 : weather === 'rain' ? 0.9 : 0.28, stars: weather === 'clear' ? clamp01(night * 1.2) : 0, sunVis: weather === 'clear' ? day : 0,
    windows: lerp(0.08, 1.0, lit), neon: lerp(0.3, 1.45, lit), lamps: lerp(0.35, 1.5, lit), wet, rain: weather === 'storm' ? 1 : weather === 'rain' ? 0.75 : 0.12, wind: weather === 'storm' ? 1 : weather === 'rain' ? 0.35 : 0.1,
    cloudColor: cloudBase, steam: mix(scale(mix(fog, [1, 1, 1], 0.4), 0.95), hex(0xff8a60), night * 0.28), night,
  };
}

/** 두 분위기를 섞는다(날씨가 바뀔 때 갑자기 색이 튀지 않도록 렌더러가 부드럽게 따라가게 하는 데 씁니다). */
export function blendAtmosphere(a: Atmosphere, b: Atmosphere, k: number): Atmosphere {
  const out = { ...b } as Record<string, unknown>;
  for (const key of Object.keys(b) as (keyof Atmosphere)[]) {
    const x = a[key], y = b[key];
    if (typeof x === 'number' && typeof y === 'number') out[key] = lerp(x, y, k);
    else if (Array.isArray(x) && Array.isArray(y)) out[key] = mix(x as Rgb, y as Rgb, k);
  }
  return out as unknown as Atmosphere;
}

const EAST = { x: 0.84, z: 0.55 };
const norm3 = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
/** 해가 하늘에서 실제로 있는 방향(지평선 아래도 포함). 해 원반을 그리는 데 씁니다. */
export function sunDirection(hour: number): [number, number, number] {
  const az = ((((hour % 24) + 24) % 24) - 6) / 12 * Math.PI;
  return norm3(EAST.x * Math.cos(az), Math.sin(az), EAST.z * Math.cos(az) - 0.35 * Math.sin(az));
}
/** 빛(해·달)이 오는 방향. 해는 지평선 근처에서 비스듬히 머물다 밤이 오면 달빛으로 서서히 넘어가 그림자가 튀지 않습니다. */
export function lightDirection(hour: number): [number, number, number] {
  const h = ((hour % 24) + 24) % 24, s = sunDirection(h), m = sunDirection(h + 12);
  const k = h < 6.2 ? 1 - smooth(3, 6.2, h) : h > 19.5 ? smooth(19.5, 23.5, h) : 0;
  // 해(지평선 위로 끌어올림)와 달 사이를 방위각·고도로 돌려 넘긴다(반대편 벡터를 그대로 섞으면 방향이 뒤집히며 튄다).
  const sa = Math.atan2(s[2], s[0]);   // 달은 해의 정반대편이므로 항상 한쪽으로 반 바퀴만 돈다
  const az = sa + Math.PI * k, el = lerp(Math.max(0.22, s[1]), Math.max(0.5, m[1]), k), c = Math.sqrt(Math.max(0, 1 - el * el));
  return [Math.cos(az) * c, el, Math.sin(az) * c];
}
