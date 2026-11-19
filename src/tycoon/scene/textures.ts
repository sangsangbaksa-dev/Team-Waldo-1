// TYCOON — 캔버스로 그리는 질감(외벽 창문·아스팔트·보도·간판). 파일을 받지 않아 가볍습니다.
import * as THREE from 'three';

function rng(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!]; };
function tex(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
}

export type FacadeStyle = 'slum' | 'shop' | 'office' | 'glass';
export interface FacadeMaps { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture }
/** 한 장이 가로 4칸 × 세로 4층(12 m × 12.8 m) — 건물 폭을 3 m 배수로 맞추면 칸이 잘리지 않습니다. */
export const FACADE_W = 12, FACADE_H = 12.8;

export function facadeMaps(style: FacadeStyle): FacadeMaps {
  const S = 512, cell = S / 4, [c, g] = canvas(S, S), [e, eg] = canvas(S, S), r = rng(style.length * 977 + 13);
  eg.fillStyle = '#000'; eg.fillRect(0, 0, S, S);
  // 바탕
  if (style === 'glass') { const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#5f86a6'); gr.addColorStop(1, '#2f4b66'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
  else { g.fillStyle = style === 'slum' ? '#b29a86' : style === 'shop' ? '#d3c7b6' : '#bdbdb6'; g.fillRect(0, 0, S, S); }
  // 얼룩/질감
  const specks = style === 'slum' ? 2600 : 900;
  for (let k = 0; k < specks; k++) { const x = r() * S, y = r() * S, a = r() * 0.12; g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`; g.fillRect(x, y, 1 + r() * 3, 1 + r() * (style === 'slum' ? 22 : 4)); }
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const x = col * cell, y = row * cell, lit = r() < (style === 'slum' ? 0.34 : style === 'shop' ? 0.46 : style === 'office' ? 0.58 : 0.42);
    const warm = style === 'slum' || style === 'shop', litCol = warm ? `hsl(${34 + r() * 14}, 95%, ${62 + r() * 12}%)` : `hsl(${r() < 0.7 ? 48 : 200}, ${r() < 0.7 ? 50 : 40}%, ${78 + r() * 10}%)`;
    let wx: number, wy: number, ww: number, wh: number;
    if (style === 'slum') { ww = cell * 0.46; wh = cell * 0.5; wx = x + (cell - ww) / 2; wy = y + cell * 0.2; }
    else if (style === 'shop') { ww = cell * 0.62; wh = cell * 0.56; wx = x + (cell - ww) / 2; wy = y + cell * 0.18; }
    else if (style === 'office') { ww = cell * 0.9; wh = cell * 0.5; wx = x + cell * 0.05; wy = y + cell * 0.22; }
    else { ww = cell * 0.9; wh = cell * 0.84; wx = x + cell * 0.05; wy = y + cell * 0.08; }
    // 창틀
    g.fillStyle = style === 'glass' ? '#1d2c3a' : style === 'office' ? '#4a4d52' : '#554a42'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    if (lit) {
      g.fillStyle = litCol; g.fillRect(wx, wy, ww, wh); eg.fillStyle = litCol; eg.fillRect(wx, wy, ww, wh);
      if (style !== 'glass') { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(wx, wy, ww, wh * (0.12 + r() * 0.3)); eg.fillStyle = 'rgba(0,0,0,.28)'; eg.fillRect(wx, wy, ww, wh * 0.18); }
      if (r() < 0.25) { g.fillStyle = 'rgba(20,16,12,.55)'; g.fillRect(wx + ww * (0.2 + r() * 0.4), wy + wh * 0.35, ww * 0.18, wh * 0.65); } // 사람 그림자
    } else {
      const gl = g.createLinearGradient(wx, wy, wx + ww, wy + wh); gl.addColorStop(0, style === 'glass' ? '#9fc0da' : '#3b4a5a'); gl.addColorStop(1, style === 'glass' ? '#47627c' : '#1a222c'); g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(wx, wy + wh * 0.6); g.lineTo(wx + ww * 0.55, wy); g.lineTo(wx + ww, wy); g.lineTo(wx, wy + wh); g.fill();
    }
    if (style === 'glass') { g.strokeStyle = 'rgba(15,25,35,.55)'; g.lineWidth = 3; g.strokeRect(wx, wy, ww, wh); g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke(); }
    if (style === 'slum' && r() < 0.4) { g.fillStyle = 'rgba(60,70,80,.7)'; g.fillRect(x + cell * 0.1, y + cell * 0.74, cell * 0.8, 5); g.fillStyle = `hsl(${r() * 360},40%,${40 + r() * 20}%)`; g.fillRect(x + cell * 0.2 + r() * cell * 0.4, y + cell * 0.78, 10, 18); } // 빨래
    if (style !== 'glass') { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + cell - 6, cell, 6); } // 층 구분
  }
  return { map: tex(c), emissive: tex(e) };
}

export function asphaltTexture(): THREE.CanvasTexture {
  const S = 512, [c, g] = canvas(S, S), r = rng(99);
  g.fillStyle = '#34373c'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 9000; k++) { const v = Math.floor(30 + r() * 50); g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + r() * 0.4})`; g.fillRect(r() * S, r() * S, 1 + r() * 2.4, 1 + r() * 2.4); }
  g.strokeStyle = 'rgba(10,10,12,.55)'; g.lineWidth = 1.2;
  for (let k = 0; k < 7; k++) { g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let n = 0; n < 12; n++) { x += (r() - 0.4) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  for (let k = 0; k < 5; k++) { const x = r() * S, y = r() * S, rad = 30 + r() * 60, gr = g.createRadialGradient(x, y, 2, x, y, rad); gr.addColorStop(0, 'rgba(8,8,10,.35)'); gr.addColorStop(1, 'rgba(8,8,10,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  return tex(c);
}
/** 젖은 정도 지도: 밝을수록 매끈(물웅덩이) */
export function puddleTexture(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S, S), r = rng(5);
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 34; k++) { const x = r() * S, y = r() * S, rad = 8 + r() * 30, gr = g.createRadialGradient(x, y, 1, x, y, rad); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  return tex(c, true, false);
}
export function sidewalkTexture(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S, S), r = rng(31);
  g.fillStyle = '#9b9a95'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 2500; k++) { const v = 120 + Math.floor(r() * 60); g.fillStyle = `rgba(${v},${v},${v - 4},.35)`; g.fillRect(r() * S, r() * S, 2, 2); }
  g.strokeStyle = 'rgba(40,40,40,.55)'; g.lineWidth = 2; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * 128, 0); g.lineTo(k * 128, S); g.stroke(); g.beginPath(); g.moveTo(0, k * 128); g.lineTo(S, k * 128); g.stroke(); }
  return tex(c);
}
export function grassTexture(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S, S), r = rng(77);
  g.fillStyle = '#3f6a35'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 4000; k++) { g.fillStyle = `hsla(${90 + r() * 30},${40 + r() * 20}%,${22 + r() * 20}%,.5)`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 2 + r() * 4); }
  return tex(c);
}
export function dirtTexture(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S, S), r = rng(55);
  g.fillStyle = '#6f6556'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 3500; k++) { const v = 70 + Math.floor(r() * 60); g.fillStyle = `rgba(${v + 15},${v + 5},${v - 10},.45)`; g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3); }
  return tex(c);
}

export const KIND_COLORS: Record<string, string> = { home: '#6c8cff', job: '#f2b233', food: '#ff7a4d', shop: '#35c48a', market: '#8bd13b', bank: '#4bb0e8', office: '#8f7bff', factory: '#e0733a', hq: '#ffd24a', port: '#3ad0d0' };
export const kindColor = (k: string): string => KIND_COLORS[k] ?? '#d0d6e0';

/** 간판 텍스처(가로 4 : 세로 1). 글자가 길면 줄여 맞춥니다. */
export function signTexture(text: string, color: string, sub = ''): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, color); gr.addColorStop(1, '#101418'); g.fillStyle = '#101418'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = gr; g.globalAlpha = 0.9; g.fillRect(6, 6, 500, 116); g.globalAlpha = 1;
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.strokeRect(10, 10, 492, 108);
  let size = 62; g.font = `800 ${size}px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif`;
  while (g.measureText(text).width > 440 && size > 26) { size -= 3; g.font = `800 ${size}px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6; g.fillText(text, 256, sub ? 52 : 66);
  if (sub) { g.shadowBlur = 0; g.font = '600 26px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(sub, 256, 98); }
  return tex(c, false);
}
/** 바닥 표지(둥근 빛 고리) 텍스처 */
export function ringTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256), gr = g.createRadialGradient(128, 128, 20, 128, 128, 124);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.78, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.86, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return tex(c, false);
}
