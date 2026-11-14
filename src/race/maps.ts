// SPEED RUSH — 코스 목록. 중심선 제어점과 화면 테마(색·소품 종류)만 담은 데이터이며 THREE 에 의존하지 않습니다.
import type { ControlPoint } from './track';

type RGB = readonly [number, number, number];
export type Scenery = 'city' | 'harbor' | 'forest' | 'desert';

export interface Theme {
  scenery: Scenery;
  sky: { top: RGB; mid: RGB; low: RGB; hor: RGB; sun: RGB; sunColor: RGB; stars: number };
  fog: { color: number; near: number; far: number };
  ground: { base: string; line: string; grid: string; noise: boolean };
  light: { sky: number; ground: number; hemi: number; sun: number; sunPower: number };
  road: { base: string; edge: string; center: string; lane: string; centerDouble: boolean };
  curb: readonly [RGB, RGB];
  wall: { inner: RGB; a: RGB; b: RGB };
  arch: { big: number; a: number; b: number; count: number };
  lamp: { kind: 'lamp' | 'pole'; a: number; b: number };
  banner: { bg: string; fg: string; accent: string };
  pad: string;
  /** 건물·컨테이너·나무·바위 등 배경 소품의 색 */
  tint: number;
}

export interface MapDef {
  id: string; name: string; place: string; blurb: string;
  points: ReadonlyArray<ControlPoint>;
  halfWidth: number;
  /** 부스트 패드 위치(한 바퀴 중 비율) */
  pads: readonly number[];
  theme: Theme;
}

const SUNSET: Theme = {
  scenery: 'city',
  sky: { top: [0.07, 0.04, 0.25], mid: [0.65, 0.14, 0.52], low: [1.0, 0.55, 0.32], hor: [0.85, 0.31, 0.56], sun: [0.25, 0.1, -1], sunColor: [1.0, 0.82, 0.5], stars: 0.9 },
  fog: { color: 0xd8508f, near: 140, far: 1500 },
  ground: { base: '#1a0c36', line: '#ff4fd8', grid: 'rgba(80,220,255,.35)', noise: false },
  light: { sky: 0xffd2e8, ground: 0x2a1b52, hemi: 1.15, sun: 0xffb27a, sunPower: 1.5 },
  road: { base: '#2b2d3d', edge: '#f2f2ff', center: '#ff5fd2', lane: 'rgba(255,255,255,.07)', centerDouble: false },
  curb: [[0.95, 0.12, 0.2], [0.95, 0.95, 1]],
  wall: { inner: [0.12, 0.1, 0.22], a: [1, 0.25, 0.8], b: [0.2, 0.95, 1] },
  arch: { big: 0xffffff, a: 0x33f0ff, b: 0xff4fd8, count: 14 },
  lamp: { kind: 'lamp', a: 0x44f6ff, b: 0xff5ad8 },
  banner: { bg: '#0c0820', fg: '#ffffff', accent: '#ff4fd8' },
  pad: '#7dffe6',
  tint: 0xb8a6ff,
};

const HARBOR: Theme = {
  scenery: 'harbor',
  sky: { top: [0.01, 0.03, 0.09], mid: [0.04, 0.12, 0.26], low: [0.1, 0.28, 0.42], hor: [0.12, 0.3, 0.4], sun: [-0.4, 0.25, -1], sunColor: [0.75, 0.88, 1.0], stars: 1.4 },
  fog: { color: 0x1d4a66, near: 120, far: 1300 },
  ground: { base: '#06182b', line: '#17476b', grid: 'rgba(120,200,255,.18)', noise: false },
  light: { sky: 0x9cc8ff, ground: 0x0b1d33, hemi: 1.0, sun: 0xaecbff, sunPower: 0.9 },
  road: { base: '#262b36', edge: '#f4f4f0', center: '#ffd23f', lane: 'rgba(255,255,255,.06)', centerDouble: false },
  curb: [[0.95, 0.55, 0.1], [0.95, 0.95, 0.92]],
  wall: { inner: [0.1, 0.12, 0.18], a: [0.95, 0.62, 0.1], b: [0.85, 0.87, 0.9] },
  arch: { big: 0xffffff, a: 0xffb23f, b: 0x7fd4ff, count: 10 },
  lamp: { kind: 'lamp', a: 0xffd58a, b: 0xffd58a },
  banner: { bg: '#07121f', fg: '#ffffff', accent: '#ffb23f' },
  pad: '#7fd4ff',
  tint: 0xffffff,
};

const ALPINE: Theme = {
  scenery: 'forest',
  sky: { top: [0.22, 0.42, 0.78], mid: [0.52, 0.7, 0.9], low: [0.98, 0.84, 0.62], hor: [0.92, 0.82, 0.72], sun: [0.5, 0.28, -1], sunColor: [1.0, 0.92, 0.72], stars: 0 },
  fog: { color: 0xd9cfc0, near: 160, far: 1700 },
  ground: { base: '#33452c', line: '#3b5232', grid: 'rgba(0,0,0,0)', noise: true },
  light: { sky: 0xdfe9ff, ground: 0x4a5a3a, hemi: 1.1, sun: 0xffe2b0, sunPower: 1.6 },
  road: { base: '#3a3c40', edge: '#f1f1ea', center: '#f1f1ea', lane: 'rgba(255,255,255,.05)', centerDouble: false },
  curb: [[0.82, 0.2, 0.16], [0.95, 0.95, 0.92]],
  wall: { inner: [0.2, 0.2, 0.22], a: [0.72, 0.74, 0.76], b: [0.86, 0.86, 0.84] },
  arch: { big: 0xf2efe6, a: 0xcfc7b4, b: 0xcfc7b4, count: 8 },
  lamp: { kind: 'pole', a: 0x6b4a2f, b: 0x6b4a2f },
  banner: { bg: '#1c2a1b', fg: '#ffffff', accent: '#e8b04a' },
  pad: '#fff2a8',
  tint: 0x2f5d34,
};

const DESERT: Theme = {
  scenery: 'desert',
  sky: { top: [0.16, 0.42, 0.82], mid: [0.5, 0.72, 0.94], low: [0.95, 0.88, 0.74], hor: [0.94, 0.84, 0.7], sun: [0.3, 0.55, -1], sunColor: [1.0, 0.97, 0.88], stars: 0 },
  fog: { color: 0xe6d3b4, near: 260, far: 2600 },
  ground: { base: '#d3a468', line: '#c99858', grid: 'rgba(0,0,0,0)', noise: true },
  light: { sky: 0xfff1da, ground: 0xb98a55, hemi: 1.25, sun: 0xfff0d0, sunPower: 1.6 },
  road: { base: '#3c3d42', edge: '#f2f2ea', center: '#f2c230', lane: 'rgba(255,255,255,.05)', centerDouble: true },
  curb: [[0.88, 0.5, 0.15], [0.95, 0.94, 0.88]],
  wall: { inner: [0.55, 0.45, 0.33], a: [0.78, 0.78, 0.76], b: [0.9, 0.9, 0.88] },
  arch: { big: 0xf0ede4, a: 0xcfc9bb, b: 0xcfc9bb, count: 6 },
  lamp: { kind: 'pole', a: 0x4b3a28, b: 0x4b3a28 },
  banner: { bg: '#2a1c10', fg: '#ffffff', accent: '#f2c230' },
  pad: '#fff6c8',
  tint: 0xc77a3e,
};

/** 첫 점이 출발선입니다. 출발선 직전은 곧게 뻗은 구간이어야 합니다. */
export const MAPS: ReadonlyArray<MapDef> = [
  {
    id: 'sunset', name: '선셋 서킷', place: '도심 · 해 질 녘', blurb: '넓은 코너와 긴 직선이 이어지는 기본 서킷', halfWidth: 13, pads: [0.1, 0.3, 0.52, 0.74, 0.9], theme: SUNSET,
    points: [
      [-60, 0, 0], [240, 0, 5], [480, 10, 13], [620, 110, 22], [670, 270, 25], [640, 430, 19], [540, 530, 11],
      [420, 520, 6], [330, 600, 2], [200, 610, 0], [100, 510, 0], [-20, 540, 3], [-130, 610, 6],
      [-290, 570, 9], [-420, 430, 13], [-440, 250, 14], [-410, 90, 9], [-330, 10, 3],
    ],
  },
  {
    id: 'harbor', name: '나이트 하버', place: '항구 · 밤', blurb: '헤어핀과 시케인이 많은 짧고 기술적인 코스', halfWidth: 12, pads: [0.08, 0.34, 0.6, 0.86], theme: HARBOR,
    points: [
      [0, 0, 0], [256, 0, 0], [461, 13, 1], [576, 90, 1], [589, 205, 2], [512, 294, 2], [397, 320, 2],
      [320, 397, 1], [371, 486, 1], [486, 525, 1], [550, 614, 0], [486, 704, 0], [333, 717, 0],
      [192, 666, 1], [77, 576, 2], [-13, 486, 3], [-154, 461, 3], [-256, 512, 2], [-320, 422, 1], [-282, 307, 1],
      [-166, 243, 0], [-192, 128, 0], [-128, 38, 0],
    ],
  },
  {
    id: 'alpine', name: '알파인 패스', place: '산악 · 오전', blurb: '오르내림과 헤어핀이 이어지는 산길', halfWidth: 12, pads: [0.1, 0.3, 0.5, 0.7, 0.88], theme: ALPINE,
    points: [
      [0, 0, 0], [250, 0, 1], [430, -10, 4], [520, 0, 8], [573, 22, 12], [595, 75, 16], [573, 128, 20], [520, 150, 24],
      [400, 152, 27], [250, 172, 30], [120, 150, 33], [67, 172, 36], [45, 225, 38], [67, 278, 40], [120, 300, 42],
      [250, 312, 44], [400, 300, 46], [500, 322, 46], [580, 380, 42], [570, 480, 34], [470, 560, 24],
      [300, 575, 16], [100, 545, 10], [-100, 520, 6], [-250, 440, 4], [-290, 300, 3], [-260, 150, 2], [-200, 50, 1], [-100, 8, 0],
    ],
  },
  {
    id: 'desert', name: '데저트 하이웨이', place: '사막 · 한낮', blurb: '거의 곧은 고속도로. 완만한 커브만 있어 최고속으로 달립니다', halfWidth: 14, pads: [0.1, 0.22, 0.3, 0.6, 0.72, 0.8], theme: DESERT,
    points: [
      [0, 0, 0], [260, 6, 1], [520, -6, 3], [780, 6, 2], [1040, -4, 0], [1300, 0, 1],
      [1420, 32, 2], [1508, 120, 3], [1540, 240, 3], [1508, 360, 3], [1420, 448, 2],
      [1300, 480, 2], [1040, 474, 0], [780, 486, -1], [520, 474, 0], [260, 482, 2], [0, 480, 2],
      [-120, 448, 2], [-208, 360, 2], [-240, 240, 1], [-208, 120, 0], [-120, 32, 0],
    ],
  },
];
export type MapId = (typeof MAPS)[number]['id'];
export const mapById = (id: string): MapDef => MAPS.find(m => m.id === id) ?? MAPS[0];
