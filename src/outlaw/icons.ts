// HUD 무기 아이콘: 글자/빈 네모 대신 면 음영이 있는 작은 그림. 그라디언트 id 충돌을 피하려고 단색 면만 씁니다.
import type { WeaponId } from './types';

const O = '#10151a', ST = '#8f9aa6', DK = '#3b434c', HI = '#dbe3ea', WD = '#94603a', WD2 = '#5e3b22', RD = '#d94a3d', GN = '#6f8a52';
const p = (d: string, fill: string, w = 1): string => `<path d="${d}" fill="${fill}" stroke="${O}" stroke-width="${w}" stroke-linejoin="round"/>`;
const r = (x: number, y: number, w: number, h: number, fill: string, rx = 1): string => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${O}" stroke-width="1"/>`;
const line = (x1: number, y1: number, x2: number, y2: number, c: string): string => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${c}" stroke-width="1" stroke-linecap="round"/>`;

const BODY: Record<WeaponId, string> = {
  fist: p('M9 8h14l4 2 3 3v6l-3 3H12l-4-4z', '#e0b48d') + p('M14 8v6M18 8v6M22 9v5', '#c18f68') + r(6, 12, 5, 10, '#6c7a8a', 2) + line(12, 10, 21, 10, '#f6dcc3'),
  pistol: p('M6 6h24v6H19l-2 2v6l-3 3h-4l1-9H6z', DK) + r(6, 5, 24, 5, ST, 1) + line(8, 6.6, 28, 6.6, HI) + r(30, 6, 5, 3, DK, 1) + p('M14 12h4v3h-4z', DK),
  smg: r(3, 8, 28, 6, ST) + line(5, 9.4, 29, 9.4, HI) + r(31, 9, 6, 3, DK) + p('M13 14h4v9h-4z', DK) + p('M22 14h4l1 6h-4z', DK) + r(2, 10, 6, 5, WD2) + r(11, 7, 8, 2, DK),
  shotgun: r(11, 8, 26, 3, ST) + r(11, 11, 26, 3, DK) + line(12, 9, 36, 9, HI) + p('M2 11l9-3v8l-3 2H4z', WD) + line(3, 12, 10, 10, '#c88d58') + r(19, 14, 9, 3, WD2),
  rifle: r(9, 8, 28, 3, ST) + line(10, 9, 36, 9, HI) + r(12, 11, 14, 4, DK) + p('M2 9l7-1v8l-2 2H3z', GN) + p('M17 15h4v6h-4z', DK) + r(14, 5, 9, 3, DK),
  sniper: r(10, 10, 29, 2, ST) + line(11, 10.8, 38, 10.8, HI) + r(14, 12, 12, 3, DK) + p('M2 11l8-1v6l-2 2H3z', WD) + r(15, 5, 12, 4, DK, 2) + r(14, 9, 2, 2, DK) + r(25, 9, 2, 2, DK) + line(16, 6.4, 26, 6.4, '#6fb0ff'),
  rocket: r(3, 8, 30, 7, GN, 3) + line(6, 9.5, 31, 9.5, '#a9c28a') + p('M33 8l5 3.5-5 3.5z', RD) + r(10, 15, 4, 6, DK) + r(18, 5, 6, 3, DK) + r(3, 9, 3, 5, DK, 1),
  bat: p('M4 20L24 6l8-2 4 4-2 8L9 22z', WD) + line(8, 18, 31, 5, '#c88d58') + r(3, 18, 5, 4, DK, 2),
  grenade: r(15, 3, 9, 4, DK) + p('M24 4l6 1-1 3-5-1z', ST) + `<ellipse cx="20" cy="15" rx="9" ry="8" fill="${GN}" stroke="${O}" stroke-width="1"/>` + line(14, 11, 26, 11, '#a9c28a') + line(13, 15, 27, 15, '#4c6038') + line(14, 19, 26, 19, '#4c6038') + line(20, 7, 20, 23, '#4c6038'),
  minigun: r(2, 7, 7, 10, DK) + r(9, 6, 24, 3, ST) + r(9, 10, 24, 3, DK) + r(9, 14, 24, 3, ST) + line(10, 7.2, 32, 7.2, HI) + r(33, 5, 4, 13, DK, 2) + r(12, 17, 7, 6, WD2) + line(2, 12, 9, 12, '#aab4be'),
  railgun: r(3, 8, 30, 8, '#2a3a63') + line(5, 9.4, 31, 9.4, '#7aa4ff') + r(8, 10, 22, 3, '#58d6ff', 1.5) + p('M33 7l5 5-5 5z', '#c9d6ff') + r(12, 16, 6, 6, DK) + r(5, 6, 6, 2, '#58d6ff', 1),
};

/** 무기 한 자루를 40x24 그림으로. 글자 높이(1em)에 맞춰 커집니다. */
export function weaponIcon(id: WeaponId): string {
  return `<svg class="ol-wi" viewBox="0 0 40 24" aria-hidden="true" focusable="false">${BODY[id]}</svg>`;
}
