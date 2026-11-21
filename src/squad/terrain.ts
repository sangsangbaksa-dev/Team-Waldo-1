// SQUAD CLASH 전장 배경: 돌바닥 · 풀 · 자갈 · 중앙 바리케이드를 한 번만 그려 캐시합니다(파일 없음).
let cached: HTMLCanvasElement | null = null;

function rng(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function team(c: CanvasRenderingContext2D, w: number, h: number, y0: number, hue: [number, number, number], r: () => number): void {
  const cw = w / 12, ch = h / 20, rows = 10;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < 12; gx++) {
    const x = gx * cw, y = y0 + gy * ch, k = (r() - .5) * 14;
    c.fillStyle = `rgb(${hue[0] + k},${hue[1] + k},${hue[2] + k})`; c.fillRect(x, y, cw, ch);
    c.fillStyle = '#ffffff0b'; c.fillRect(x, y, cw, 2); c.fillRect(x, y, 2, ch);
    c.fillStyle = '#0000001c'; c.fillRect(x, y + ch - 2, cw, 2); c.fillRect(x + cw - 2, y, 2, ch);
    if (r() < .22) { c.strokeStyle = '#00000030'; c.lineWidth = 1.2; c.beginPath(); const sx = x + r() * cw, sy = y + r() * ch; c.moveTo(sx, sy); c.lineTo(sx + (r() - .5) * 26, sy + (r() - .3) * 22); c.lineTo(sx + (r() - .5) * 34, sy + r() * 30); c.stroke(); }
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = y0 + r() * ch * rows;
    if (r() < .55) { c.strokeStyle = '#4d8a4acc'; c.lineWidth = 1.5; for (let b = -1; b <= 1; b++) { c.beginPath(); c.moveTo(x + b * 2.5, y); c.lineTo(x + b * 5, y - 6 - r() * 4); c.stroke(); } }
    else { c.fillStyle = `rgba(${150 + r() * 60},${150 + r() * 60},${160 + r() * 50},.35)`; c.beginPath(); c.ellipse(x, y, 2 + r() * 3, 1.6 + r() * 2, r() * 3, 0, Math.PI * 2); c.fill(); }
  }
}

function barricade(c: CanvasRenderingContext2D, w: number, h: number, r: () => number): void {
  const cy = h / 2, band = 30;
  const g = c.createLinearGradient(0, cy - band, 0, cy + band); g.addColorStop(0, '#0000'); g.addColorStop(.5, '#2a1c14dd'); g.addColorStop(1, '#0000'); c.fillStyle = g; c.fillRect(0, cy - band, w, band * 2);
  for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${90 + r() * 60},${70 + r() * 40},${55 + r() * 30},.55)`; c.beginPath(); c.ellipse(r() * w, cy + (r() - .5) * band * 1.6, 2 + r() * 4, 1.5 + r() * 3, r() * 3, 0, Math.PI * 2); c.fill(); }
  c.lineCap = 'round';
  for (let x = 14; x < w; x += 34) {
    const tilt = (r() - .5) * .25;
    c.save(); c.translate(x, cy); c.rotate(tilt);
    c.fillStyle = '#00000055'; c.beginPath(); c.ellipse(5, 10, 9, 3, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(-5, 8); c.lineTo(-5, -12); c.lineTo(0, -19); c.lineTo(5, -12); c.lineTo(5, 8); c.closePath();
    const wood = c.createLinearGradient(-5, 0, 5, 0); wood.addColorStop(0, '#b7864f'); wood.addColorStop(.5, '#8a5d33'); wood.addColorStop(1, '#4e3219'); c.fillStyle = wood; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#1a1008'; c.stroke();
    c.restore();
  }
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, cy - 3); c.lineTo(w, cy - 3); c.stroke(); c.strokeStyle = '#1a1008'; c.lineWidth = 1; c.stroke();
}

function banner(c: CanvasRenderingContext2D, x: number, y: number, col: string, dir: number): void {
  c.strokeStyle = '#1a1008'; c.lineWidth = 5; c.beginPath(); c.moveTo(x, y + 46); c.lineTo(x, y - 6); c.stroke(); c.strokeStyle = '#c9a15a'; c.lineWidth = 3; c.stroke();
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + dir * 22, y + 4, x + dir * 38, y - 2); c.lineTo(x + dir * 30, y + 14); c.lineTo(x + dir * 38, y + 26); c.quadraticCurveTo(x + dir * 22, y + 28, x, y + 24); c.closePath();
  c.fillStyle = col; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#1a1008'; c.stroke();
  c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(x + dir * 14, y + 12, 4, 0, Math.PI * 2); c.fill();
}

/** 600x1000(12x20칸) 기준 배경. 크기가 같으면 같은 캔버스를 돌려줍니다. */
export function terrain(w: number, h: number): HTMLCanvasElement {
  if (cached && cached.width === w && cached.height === h) return cached;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d')!; const r = rng(20241121);
  team(c, w, h, 0, [58, 38, 48], r); team(c, w, h, h / 2, [30, 52, 74], r);
  barricade(c, w, h, r);
  banner(c, 20, 18, '#d6454f', 1); banner(c, w - 20, 18, '#d6454f', -1); banner(c, 20, h - 66, '#3f8fe0', 1); banner(c, w - 20, h - 66, '#3f8fe0', -1);
  const v = c.createRadialGradient(w / 2, h / 2, h * .25, w / 2, h / 2, h * .72); v.addColorStop(0, '#0000'); v.addColorStop(1, '#0009'); c.fillStyle = v; c.fillRect(0, 0, w, h);
  cached = cv; return cv;
}
