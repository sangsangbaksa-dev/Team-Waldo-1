// SQUAD CLASH 병사 그래픽: 병종마다 캐릭터를 캔버스 경로로 그려 한 번만 만들고 재사용합니다(파일 없음).
import type { UnitType } from './units';
import type { Side } from './sim';

const S = 128;
const TEAM = [
  { main: '#4fa8ff', dark: '#1b5aa6', deep: '#0f2f57', light: '#bfe3ff', glow: '#4aa8ff' },
  { main: '#ff6a70', dark: '#a82b3a', deep: '#561423', light: '#ffc7c2', glow: '#ff5a5a' },
] as const;
type Team = (typeof TEAM)[number];
const cache = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();

type Ctx = CanvasRenderingContext2D;
const grad = (c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: string[]): CanvasGradient => {
  const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / Math.max(1, stops.length - 1), s)); return g;
};
const steel = (c: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient => grad(c, x0, y0, x1, y1, ['#f1f5f9', '#aab4c0', '#69747f']);
const skin = (c: Ctx, x: number, y: number, r: number): CanvasGradient => {
  const g = c.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r); g.addColorStop(0, '#ffe3c4'); g.addColorStop(1, '#e0a77c'); return g;
};
const ink = '#0b1018';

function shadow(c: Ctx): void {
  c.fillStyle = '#0006'; c.beginPath(); c.ellipse(64, 114, 36, 9, 0, 0, Math.PI * 2); c.fill();
}
function stroke(c: Ctx, w = 2.5): void { c.lineWidth = w; c.strokeStyle = ink; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function legs(c: Ctx, t: Team, spread: number): void {
  for (const dx of [-spread, spread]) { c.beginPath(); c.roundRect(64 + dx - 7, 92, 14, 20, 5); c.fillStyle = grad(c, 0, 92, 0, 112, [t.dark, t.deep]); c.fill(); stroke(c, 2); }
}

function guard(c: Ctx, t: Team): void {
  legs(c, t, 11);
  c.beginPath(); c.roundRect(38, 56, 52, 44, 12); c.fillStyle = grad(c, 38, 56, 90, 100, [t.main, t.dark]); c.fill(); stroke(c);
  c.beginPath(); c.moveTo(48, 62); c.lineTo(80, 62); c.lineTo(80, 70); c.lineTo(48, 70); c.closePath(); c.fillStyle = steel(c, 48, 62, 80, 70); c.fill(); stroke(c, 2);
  c.beginPath(); c.arc(64, 38, 21, 0, Math.PI * 2); c.fillStyle = steel(c, 44, 18, 84, 58); c.fill(); stroke(c);
  c.beginPath(); c.roundRect(48, 33, 32, 9, 4); c.fillStyle = ink; c.fill();
  c.beginPath(); c.moveTo(64, 17); c.quadraticCurveTo(88, 8, 94, 36); c.quadraticCurveTo(78, 24, 64, 26); c.closePath(); c.fillStyle = t.main; c.fill(); stroke(c, 2);
  c.beginPath(); c.moveTo(14, 54); c.lineTo(56, 54); c.lineTo(56, 80); c.quadraticCurveTo(54, 104, 35, 118); c.quadraticCurveTo(16, 104, 14, 80); c.closePath();
  c.fillStyle = grad(c, 14, 54, 56, 118, [t.light, t.main, t.dark]); c.fill(); stroke(c, 3);
  c.beginPath(); c.arc(35, 78, 8.5, 0, Math.PI * 2); c.fillStyle = steel(c, 27, 70, 43, 86); c.fill(); stroke(c, 2);
  c.beginPath(); c.moveTo(35, 56); c.lineTo(35, 112); c.strokeStyle = '#ffffff40'; c.lineWidth = 2; c.stroke();
  c.beginPath(); c.moveTo(100, 100); c.lineTo(100, 52); c.lineWidth = 6; c.strokeStyle = ink; c.stroke(); c.lineWidth = 3.5; c.strokeStyle = '#dfe6ee'; c.stroke();
  c.beginPath(); c.roundRect(92, 88, 16, 6, 2); c.fillStyle = '#c99b3d'; c.fill(); stroke(c, 2);
}

function striker(c: Ctx, t: Team): void {
  c.save(); c.translate(64, 64); c.rotate(-.1); c.translate(-64, -64);
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(8, 50 + i * 14); c.lineTo(34, 54 + i * 14); c.strokeStyle = t.light + '66'; c.lineWidth = 2.5; c.lineCap = 'round'; c.stroke(); }
  legs(c, t, 12);
  c.beginPath(); c.moveTo(46, 58); c.lineTo(82, 58); c.lineTo(76, 98); c.lineTo(52, 98); c.closePath(); c.fillStyle = grad(c, 46, 58, 82, 98, [t.main, t.dark]); c.fill(); stroke(c);
  c.beginPath(); c.moveTo(46, 60); c.quadraticCurveTo(26, 62, 14, 84); c.lineTo(22, 90); c.quadraticCurveTo(34, 76, 48, 72); c.closePath(); c.fillStyle = t.light; c.fill(); stroke(c, 2);
  c.beginPath(); c.arc(64, 38, 17, 0, Math.PI * 2); c.fillStyle = skin(c, 64, 38, 17); c.fill(); stroke(c);
  c.beginPath(); c.moveTo(47, 34); c.lineTo(81, 34); c.lineTo(81, 43); c.lineTo(47, 43); c.closePath(); c.fillStyle = t.dark; c.fill(); stroke(c, 2);
  c.beginPath(); c.moveTo(47, 38); c.quadraticCurveTo(30, 30, 24, 44); c.quadraticCurveTo(36, 42, 47, 43); c.closePath(); c.fillStyle = t.dark; c.fill(); stroke(c, 2);
  c.fillStyle = ink; c.beginPath(); c.arc(70, 40, 2.2, 0, Math.PI * 2); c.arc(58, 40, 2.2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(80, 66); c.lineTo(112, 34); c.lineWidth = 7; c.strokeStyle = ink; c.stroke(); c.lineWidth = 4; c.strokeStyle = t.dark; c.stroke();
  c.beginPath(); c.moveTo(106, 40); c.quadraticCurveTo(120, 20, 118, 6); c.quadraticCurveTo(108, 24, 100, 36); c.closePath(); c.fillStyle = steel(c, 100, 6, 120, 40); c.fill(); stroke(c, 2);
  c.beginPath(); c.moveTo(50, 70); c.lineTo(22, 52); c.lineWidth = 7; c.strokeStyle = ink; c.stroke(); c.lineWidth = 4; c.strokeStyle = t.dark; c.stroke();
  c.beginPath(); c.moveTo(24, 54); c.quadraticCurveTo(6, 52, 4, 38); c.quadraticCurveTo(14, 46, 28, 46); c.closePath(); c.fillStyle = steel(c, 4, 38, 28, 54); c.fill(); stroke(c, 2);
  c.restore();
}

function archer(c: Ctx, t: Team): void {
  legs(c, t, 9);
  c.beginPath(); c.moveTo(64, 50); c.quadraticCurveTo(26, 62, 30, 104); c.lineTo(98, 104); c.quadraticCurveTo(102, 62, 64, 50); c.closePath(); c.fillStyle = grad(c, 30, 50, 98, 104, [t.main, t.dark]); c.fill(); stroke(c);
  c.beginPath(); c.moveTo(34, 100); c.quadraticCurveTo(64, 112, 94, 100); c.strokeStyle = t.light + '88'; c.lineWidth = 3; c.stroke();
  c.beginPath(); c.moveTo(64, 14); c.quadraticCurveTo(92, 22, 90, 54); c.lineTo(38, 54); c.quadraticCurveTo(36, 22, 64, 14); c.closePath(); c.fillStyle = grad(c, 38, 14, 90, 54, [t.dark, t.deep]); c.fill(); stroke(c);
  c.beginPath(); c.ellipse(64, 42, 17, 15, 0, 0, Math.PI * 2); c.fillStyle = skin(c, 64, 42, 17); c.fill(); stroke(c, 2);
  c.beginPath(); c.moveTo(47, 40); c.quadraticCurveTo(64, 22, 81, 40); c.quadraticCurveTo(64, 32, 47, 40); c.closePath(); c.fillStyle = t.deep; c.fill();
  c.fillStyle = ink; c.beginPath(); c.arc(70, 46, 2.2, 0, Math.PI * 2); c.arc(58, 46, 2.2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.roundRect(34, 52, 12, 34, 5); c.fillStyle = '#7b4a26'; c.fill(); stroke(c, 2);
  for (const x of [38, 42]) { c.beginPath(); c.moveTo(x, 52); c.lineTo(x - 2, 40); c.strokeStyle = '#e5e8ec'; c.lineWidth = 2; c.stroke(); c.fillStyle = t.main; c.fillRect(x - 4, 38, 4, 5); }
  c.beginPath(); c.moveTo(102, 18); c.quadraticCurveTo(132, 64, 102, 112); c.lineWidth = 7; c.strokeStyle = ink; c.stroke(); c.lineWidth = 4; c.strokeStyle = '#a8703a'; c.stroke();
  c.beginPath(); c.moveTo(102, 18); c.lineTo(102, 112); c.lineWidth = 1.5; c.strokeStyle = '#f4f1e8'; c.stroke();
  c.beginPath(); c.moveTo(70, 66); c.lineTo(112, 66); c.lineWidth = 2.5; c.strokeStyle = '#e5e8ec'; c.stroke();
  c.beginPath(); c.moveTo(118, 66); c.lineTo(108, 61); c.lineTo(108, 71); c.closePath(); c.fillStyle = '#dfe6ee'; c.fill();
  c.beginPath(); c.moveTo(70, 66); c.lineTo(100, 66); c.lineWidth = 7; c.strokeStyle = t.dark; c.stroke();
}

function medic(c: Ctx, t: Team): void {
  const g = c.createRadialGradient(100, 28, 2, 100, 28, 30); g.addColorStop(0, '#87efb7aa'); g.addColorStop(1, '#87efb700'); c.fillStyle = g; c.fillRect(66, 0, 62, 62);
  legs(c, t, 9);
  c.beginPath(); c.moveTo(46, 52); c.lineTo(82, 52); c.lineTo(94, 106); c.lineTo(34, 106); c.closePath(); c.fillStyle = grad(c, 34, 52, 94, 106, ['#ffffff', '#cdd8e2']); c.fill(); stroke(c);
  c.beginPath(); c.moveTo(34, 106); c.lineTo(94, 106); c.lineWidth = 7; c.strokeStyle = t.main; c.stroke();
  c.beginPath(); c.moveTo(44, 56); c.lineTo(84, 56); c.lineWidth = 6; c.strokeStyle = t.dark; c.stroke();
  c.beginPath(); c.arc(64, 78, 13, 0, Math.PI * 2); c.fillStyle = t.main; c.fill(); stroke(c, 2);
  c.fillStyle = '#fff'; c.fillRect(61, 69, 6, 18); c.fillRect(55, 75, 18, 6);
  c.beginPath(); c.arc(64, 36, 17, 0, Math.PI * 2); c.fillStyle = skin(c, 64, 36, 17); c.fill(); stroke(c);
  c.beginPath(); c.moveTo(46, 32); c.quadraticCurveTo(64, 8, 82, 32); c.lineTo(46, 32); c.closePath(); c.fillStyle = '#fff'; c.fill(); stroke(c, 2);
  c.fillStyle = t.main; c.fillRect(60, 18, 8, 3); c.fillRect(62, 16, 4, 7);
  c.fillStyle = ink; c.beginPath(); c.arc(70, 40, 2.2, 0, Math.PI * 2); c.arc(58, 40, 2.2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(100, 112); c.lineTo(100, 38); c.lineWidth = 6; c.strokeStyle = ink; c.stroke(); c.lineWidth = 3.5; c.strokeStyle = '#c99b3d'; c.stroke();
  c.beginPath(); c.arc(100, 28, 10, 0, Math.PI * 2); c.fillStyle = grad(c, 92, 18, 108, 38, ['#d8ffe9', '#3ed985']); c.fill(); stroke(c, 2);
  c.beginPath(); c.arc(97, 25, 3, 0, Math.PI * 2); c.fillStyle = '#ffffffcc'; c.fill();
}

function siege(c: Ctx, t: Team): void {
  c.beginPath(); c.roundRect(24, 78, 80, 22, 6); c.fillStyle = grad(c, 0, 78, 0, 100, [t.main, t.dark]); c.fill(); stroke(c);
  c.save(); c.translate(52, 78); c.rotate(-.55);
  c.beginPath(); c.roundRect(-8, -14, 66, 28, 12); c.fillStyle = grad(c, 0, -14, 0, 14, ['#4b5560', '#9aa6b2', '#2e3640']); c.fill(); stroke(c, 3);
  c.beginPath(); c.roundRect(52, -17, 12, 34, 4); c.fillStyle = steel(c, 52, -17, 64, 17); c.fill(); stroke(c, 2.5);
  c.beginPath(); c.ellipse(64, 0, 3, 9, 0, 0, Math.PI * 2); c.fillStyle = '#05080c'; c.fill();
  c.beginPath(); c.arc(4, 0, 7, 0, Math.PI * 2); c.fillStyle = t.main; c.fill(); stroke(c, 2);
  c.restore();
  for (const x of [38, 90]) {
    c.beginPath(); c.arc(x, 100, 17, 0, Math.PI * 2); c.fillStyle = grad(c, x - 17, 83, x + 17, 117, ['#9a6a3a', '#4f3118']); c.fill(); stroke(c, 3);
    c.beginPath(); c.arc(x, 100, 5, 0, Math.PI * 2); c.fillStyle = '#c9ccd1'; c.fill();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(x + Math.cos(a) * 5, 100 + Math.sin(a) * 5); c.lineTo(x + Math.cos(a) * 15, 100 + Math.sin(a) * 15); c.lineWidth = 2; c.strokeStyle = '#3a2412'; c.stroke(); }
  }
  c.beginPath(); c.arc(106, 76, 6, 0, Math.PI * 2); c.fillStyle = grad(c, 100, 70, 112, 82, ['#7e8794', '#232a33']); c.fill(); stroke(c, 2);
  c.beginPath(); c.moveTo(22, 78); c.lineTo(22, 40); c.lineWidth = 3; c.strokeStyle = ink; c.stroke();
  c.beginPath(); c.moveTo(22, 40); c.lineTo(44, 47); c.lineTo(22, 56); c.closePath(); c.fillStyle = t.light; c.fill(); stroke(c, 2);
}

const DRAW: Record<UnitType, (c: Ctx, t: Team) => void> = { guard, striker, archer, medic, siege };

/** 병종·진영별 스프라이트(정사각형 128px). 같은 입력은 같은 캔버스를 돌려줍니다. */
export function sprite(type: UnitType, side: Side): HTMLCanvasElement {
  const key = `${type}:${side}`; let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d')!; shadow(c); DRAW[type](c, TEAM[side]); cache.set(key, cv);
  }
  return cv;
}

/** 팔레트·안내 화면에서 <img> 로 쓰는 데이터 주소. */
export function spriteUrl(type: UnitType, side: Side = 0): string {
  const key = `${type}:${side}`; let u = urls.get(key);
  if (!u) { u = sprite(type, side).toDataURL('image/png'); urls.set(key, u); }
  return u;
}
