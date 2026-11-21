// SKY WAR — 손으로 그린 캔버스 텍스처(기체 도장·지형·바다·구름·불꽃)와 아이콘 경로. 외부 이미지 없음.
import * as THREE from 'three';
import type { Kind } from './sim';

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
const cache = new Map<string, THREE.CanvasTexture>();
const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function tex(key: string, w: number, h: number, draw: Draw, o: { repeat?: boolean; srgb?: boolean } = {}): THREE.CanvasTexture {
  const hit = cache.get(key); if (hit) return hit;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(canvas);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  cache.set(key, t); return t;
}

/** 캔버스 텍스처 전부 해제(게임 종료 시). */
export function disposeArt(): void { for (const t of cache.values()) t.dispose(); cache.clear(); }

// ── 아이콘(24x24 경로, SVG 와 캔버스 Path2D 공용) ──
export const ICON = {
  hp: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  heat: 'M12 2c1 4 5.5 6 5.5 11a5.5 5.5 0 0 1-11 0c0-2 1-3.6 2.2-4.6.1 2 1 3 2.3 3C10.200 7 10 5 12 2z',
  fuel: 'M12 2.500C9 7 6 10.500 6 14.500a6 6 0 0 0 12 0C18 10.500 15 7 12 2.500z',
  speed: 'M12 4a9 9 0 0 0-8.500 12h3.100A6 6 0 1 1 17.400 16h3.100A9 9 0 0 0 12 4zm3.500 4.500l-3.200 5.200a1.800 1.800 0 1 0 1.500 1z',
  alt: 'M2 20l6.500-11 4 6.500 3-4.500L22 20z',
  missile: 'M12 2c2 3 3 6 3 10v5H9v-5c0-4 1-7 3-10zM9 16l-4.500 4.500V15L9 12.500zM15 16l4.500 4.500V15L15 12.500zM10.500 18h3v4h-3z',
  gun: 'M6.500 3h3.500v9H6.500zM14 3h3.500v9H14zM5.500 14h5.500v7H5.500zM13 14h5.500v7H13z',
  flare: 'M12 2l2.300 7.200L21.500 12l-7.200 2.800L12 22l-2.300-7.200L2.500 12l7.200-2.800z',
  boost: 'M3.500 12.500L12 4l8.500 8.500h-4L12 8l-4.500 4.500zM3.500 20.500L12 12l8.500 8.500h-4L12 16l-4.500 4.500z',
  shield: 'M12 2l8 3v6c0 5-3.500 9-8 11-4.500-2-8-6-8-11V5z',
  bolt: 'M13 2L5 14h6l-1 8 9-13h-6z',
} as const;
export type IconName = keyof typeof ICON;
const paths = new Map<string, Path2D>();
export function drawIcon(c: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number): void {
  let p = paths.get(name); if (!p) { p = new Path2D(ICON[name]); paths.set(name, p); }
  c.save(); c.translate(x - size / 2, y - size / 2); c.scale(size / 24, size / 24); c.fill(p); c.restore();
}
export const svgIcon = (name: IconName, cls = 'sk-ic'): string => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;

/** 픽업 링 안의 아이콘 스프라이트용 텍스처. */
export function pickupIcon(kind: string): THREE.CanvasTexture {
  const col = kind === 'repair' ? '#5dff8f' : kind === 'shield' ? '#ffe27a' : '#6ab8ff';
  const icon: IconName = kind === 'repair' ? 'hp' : kind === 'shield' ? 'shield' : 'missile';
  return tex('pk-' + kind, 128, 128, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 8, w / 2, w / 2, w / 2); g.addColorStop(0, col + 'aa'); g.addColorStop(.6, col + '33'); g.addColorStop(1, col + '00'); c.fillStyle = g; c.fillRect(0, 0, w, w);
    c.shadowColor = col; c.shadowBlur = 14; c.fillStyle = '#ffffff'; drawIcon(c, icon, w / 2, w / 2, 62);
    c.shadowBlur = 0; c.globalCompositeOperation = 'source-atop'; c.fillStyle = col + '66'; c.fillRect(0, w / 2, w, w / 2);
  });
}

// ── 기체 도장: 패널 라인·리벳·줄무늬·국적 마크(원통 UV: u=둘레, v=길이) ──
export function jetSkin(kind: Kind, team: 'player' | 'enemy', body: number, accent: number): THREE.CanvasTexture {
  return tex(`jet-${kind}-${team}`, 256, 256, (c, w, h) => {
    const r = rng(kind.length * 977 + (team === 'player' ? 11 : 37));
    c.fillStyle = hex(body); c.fillRect(0, 0, w, h);
    if (team === 'enemy' && kind !== 'boss') { // 얼룩무늬 위장
      for (let i = 0; i < 26; i++) { c.fillStyle = r() < .5 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.08)'; c.beginPath(); c.ellipse(r() * w, r() * h, 14 + r() * 30, 8 + r() * 16, r() * 3, 0, 7); c.fill(); }
    } else { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(.5, 'rgba(0,0,0,.0)'); g.addColorStop(1, 'rgba(0,0,0,.22)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
    c.fillStyle = hex(accent); c.fillRect(0, h * .2, w, 9); c.fillRect(0, h * .2 + 14, w, 3); // 몸통 줄무늬
    if (kind === 'ace' || kind === 'boss') { c.fillRect(0, h * .72, w, 7); }
    c.lineWidth = 1;
    for (let y = 16; y < h; y += 32 + (y % 3) * 4) { c.strokeStyle = 'rgba(0,0,0,.38)'; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.moveTo(0, y + 1); c.lineTo(w, y + 1); c.stroke(); }
    for (let x = 0; x < w; x += 64) { c.strokeStyle = 'rgba(0,0,0,.32)'; c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, h); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.35)'; for (let y = 16; y < h; y += 32) for (let x = 6; x < w; x += 10) c.fillRect(x, y + 4, 1.5, 1.5); // 리벳
    for (const ux of [w * .25, w * .75]) { // 국적 마크
      c.fillStyle = team === 'player' ? '#ffffff' : '#e8e0d0'; c.beginPath(); c.arc(ux, h * .5, 17, 0, 7); c.fill();
      c.fillStyle = team === 'player' ? '#2f7bff' : '#a82424'; c.beginPath(); c.arc(ux, h * .5, 12, 0, 7); c.fill();
      c.fillStyle = team === 'player' ? '#ffffff' : '#e8e0d0'; c.beginPath(); c.arc(ux, h * .5, 5, 0, 7); c.fill();
    }
    for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(20,16,10,${.05 + r() * .08})`; c.fillRect(r() * w, r() * h, 2 + r() * 8, 1); } // 그을음
  });
}

/** 미사일 몸통: 흰 바탕 + 빨간 띠. */
export function missileSkin(): THREE.CanvasTexture {
  return tex('missile', 64, 64, (c, w, h) => {
    c.fillStyle = '#e9edf2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d63a3a'; c.fillRect(0, h * .15, w, 7); c.fillRect(0, h * .72, w, 9);
    c.fillStyle = '#2a323c'; c.fillRect(0, h * .45, w, 4);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(w * .62, 0, w * .38, h);
  });
}

// ── 지형 · 바다 ──
export function terrainDetail(): THREE.CanvasTexture {
  return tex('terrain', 256, 256, (c, w, h) => {
    const r = rng(7); c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, w, h);
    const put = (x: number, y: number, draw: () => void): void => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { c.save(); c.translate(x + dx, y + dy); draw(); c.restore(); } };
    for (let i = 0; i < 700; i++) { const v = 150 + r() * 105 | 0; put(r() * w, r() * h, () => { c.fillStyle = `rgba(${v},${v},${v},.35)`; c.beginPath(); c.ellipse(0, 0, 2 + r() * 9, 1.5 + r() * 5, r() * 3, 0, 7); c.fill(); }); }
    for (let i = 0; i < 900; i++) put(r() * w, r() * h, () => { c.strokeStyle = `rgba(${r() < .5 ? '255,255,255' : '90,90,90'},.18)`; c.beginPath(); c.moveTo(0, 0); c.lineTo((r() - .5) * 6, -3 - r() * 7); c.stroke(); }); // 풀잎 결
  }, { repeat: true });
}

export function seaNormal(): THREE.CanvasTexture {
  return tex('sea', 128, 128, (c, w, h) => {
    const r = rng(3), waves = Array.from({ length: 6 }, (_, i) => ({ kx: 1 + (i * 3) % 5, ky: ((i * 5) % 7) - 3 || 2, a: .5 + r() * .5, p: r() * 6.3 }));
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let gx = 0, gy = 0;
      for (const v of waves) { const ph = 2 * Math.PI * (v.kx * x / w + v.ky * y / h) + v.p, d = Math.cos(ph) * v.a; gx += d * v.kx; gy += d * v.ky; }
      const nx = -gx * .22, ny = -gy * .22, il = 1 / Math.hypot(nx, ny, 1), o = (y * w + x) * 4;
      img.data[o] = (nx * il * .5 + .5) * 255; img.data[o + 1] = (ny * il * .5 + .5) * 255; img.data[o + 2] = (il * .5 + .5) * 255; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, { repeat: true, srgb: false });
}

// ── 구름 · 불꽃 · 연기 · 빛망울 ──
export function cloudSprite(): THREE.CanvasTexture {
  return tex('cloud', 256, 256, c => {
    const lobes: [number, number, number][] = [[68, 145, 58], [107, 112, 66], [158, 106, 62], [198, 142, 48], [127, 156, 70], [178, 164, 52], [88, 168, 44]];
    for (const lit of [false, true]) for (const [x, y, rad] of lobes) {
      const cy = lit ? y - rad * .14 : y + rad * .16, rr = lit ? rad * .86 : rad;
      const g = c.createRadialGradient(x, cy, 0, x, cy, rr), col = lit ? '255,248,236' : '150,162,190';
      g.addColorStop(0, `rgba(${col},${lit ? .5 : .34})`); g.addColorStop(.6, `rgba(${col},${lit ? .3 : .18})`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.fillRect(x - rr, cy - rr, rr * 2, rr * 2);
    }
  });
}

export function fireSprite(): THREE.CanvasTexture {
  return tex('fire', 128, 128, c => {
    const r = rng(5), blob = (x: number, y: number, rad: number, a: number): void => {
      const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(255,255,236,${a})`); g.addColorStop(.28, `rgba(255,214,130,${a * .85})`); g.addColorStop(.6, `rgba(255,120,40,${a * .45})`); g.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    blob(64, 64, 62, .7); for (let i = 0; i < 7; i++) { const a = r() * 6.3, d = 14 + r() * 16; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 20 + r() * 14, .6); } blob(64, 64, 22, 1);
  });
}

export function smokeSprite(): THREE.CanvasTexture {
  return tex('smoke', 128, 128, c => {
    const r = rng(9);
    for (let i = 0; i < 11; i++) {
      const a = r() * 6.3, d = r() * 28, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * .8, rad = 20 + r() * 20, g = c.createRadialGradient(x, y, 0, x, y, rad), hi = y < 64;
      g.addColorStop(0, hi ? 'rgba(150,152,158,.42)' : 'rgba(78,78,84,.5)'); g.addColorStop(.6, hi ? 'rgba(130,132,138,.2)' : 'rgba(64,64,70,.24)'); g.addColorStop(1, 'rgba(70,70,76,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
}

export function glowSprite(inner: string, outer: string): THREE.CanvasTexture {
  return tex(`glow-${inner}-${outer}`, 64, 64, c => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(1, outer); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
}
