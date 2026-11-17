// ZERO ZONE — 코드로 그리는 질감(땅·벽·바닥·하늘). 외부 이미지 파일 없이 캔버스로 만들어 첫 로딩을 가볍게 둡니다.
import * as THREE from 'three';
import { makeRng } from './config';

export function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!; draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; return t;
}
const speckle = (g: CanvasRenderingContext2D, s: number, n: number, rng: () => number, light: string, dark: string, a = 0.12): void => {
  for (let i = 0; i < n; i++) { g.fillStyle = rng() < 0.5 ? light : dark; g.globalAlpha = a * (0.4 + rng()); const w = 1 + rng() * 3; g.fillRect(rng() * s, rng() * s, w, w * (0.5 + rng())); }
  g.globalAlpha = 1;
};

/** 땅: 풀밭 질감(세밀한 반복 무늬). 큰 색 변화는 정점 색으로 따로 입힙니다. */
export function groundTexture(): THREE.CanvasTexture {
  return canvasTex(512, (g, s) => {
    const rng = makeRng(11); g.fillStyle = '#8a9a58'; g.fillRect(0, 0, s, s);
    speckle(g, s, 9000, rng, '#a7b86c', '#5f7040', 0.35);
    for (let i = 0; i < 700; i++) { g.strokeStyle = rng() < 0.5 ? '#73863f' : '#a9b86a'; g.globalAlpha = 0.35; g.beginPath(); const x = rng() * s, y = rng() * s; g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 5, y - 3 - rng() * 5); g.stroke(); }
    g.globalAlpha = 1;
  });
}
export function dirtTexture(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => { const rng = makeRng(23); g.fillStyle = '#9b8663'; g.fillRect(0, 0, s, s); speckle(g, s, 5000, rng, '#b9a47d', '#6f5d42', 0.4); });
}

export function concreteTexture(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    const rng = makeRng(41); g.fillStyle = '#a7a498'; g.fillRect(0, 0, s, s); speckle(g, s, 6000, rng, '#c4c1b5', '#7c796e', 0.3);
    g.strokeStyle = 'rgba(70,68,60,.55)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2); g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(60,58,50,.35)'; g.lineWidth = 1; g.beginPath(); let x = rng() * s, y = rng() * s; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  });
}

type WallStyle = { base: string; line: string; win: string; frame: string; kind: 'brick' | 'plain' | 'siding' | 'block' };
const STYLES: WallStyle[] = [
  { base: '#b7b3a8', line: '#9a968b', win: '#27384a', frame: '#e6e2d6', kind: 'block' },
  { base: '#a1523f', line: '#7d3d2e', win: '#1f2c3a', frame: '#e8dcc6', kind: 'brick' },
  { base: '#d2bf98', line: '#bba884', win: '#2a3b4c', frame: '#f1ead9', kind: 'plain' },
  { base: '#7c8d99', line: '#657682', win: '#1d2a36', frame: '#d6dde2', kind: 'siding' },
];
/** 벽 질감 한 장 = 가로세로 3.2m. 창문이 가운데 높이(1.0~2.3m)에 들어가도록 그립니다. */
export function wallTexture(i: number): THREE.CanvasTexture {
  const st = STYLES[i % STYLES.length];
  return canvasTex(256, (g, s) => {
    const rng = makeRng(100 + i); g.fillStyle = st.base; g.fillRect(0, 0, s, s); speckle(g, s, 3500, rng, '#ffffff', '#000000', 0.07);
    g.strokeStyle = st.line; g.lineWidth = 1.5;
    if (st.kind === 'brick') { for (let y = 0; y < s; y += 11) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); const off = (y / 11) % 2 ? 0 : 16; for (let x = off; x < s; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 11); g.stroke(); } } }
    else if (st.kind === 'siding') { for (let y = 0; y < s; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); } }
    else if (st.kind === 'block') { for (let y = 0; y < s; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); } for (let x = 0; x < s; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); } }
    // 창: v=1.0~2.3m → 캔버스 y 는 위가 0 이라 (3.2-2.3)/3.2*256=72 ~ 112+...
    const x0 = 78, x1 = 178, y0 = 72, y1 = 150; g.fillStyle = st.frame; g.fillRect(x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12);
    const grad = g.createLinearGradient(x0, y0, x1, y1); grad.addColorStop(0, '#56738c'); grad.addColorStop(0.5, st.win); grad.addColorStop(1, '#0f1822'); g.fillStyle = grad; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = st.frame; g.fillRect((x0 + x1) / 2 - 2, y0, 4, y1 - y0); g.fillRect(x0, (y0 + y1) / 2 - 2, x1 - x0, 4);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0 + 28, y0); g.lineTo(x0 + 44, y0); g.lineTo(x0 + 16, y1); g.fill();
    // 아랫단 얼룩
    const sh = g.createLinearGradient(0, s * 0.8, 0, s); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.28)'); g.fillStyle = sh; g.fillRect(0, s * 0.8, s, s * 0.2);
  });
}
export function floorTexture(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    const rng = makeRng(77); g.fillStyle = '#8c6d4a'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) { g.fillStyle = `hsl(${28 + rng() * 6}, ${28 + rng() * 10}%, ${34 + rng() * 10}%)`; g.fillRect(0, y, s, 30); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 30, s, 2); }
    speckle(g, s, 1500, rng, '#d8b98a', '#3b2a18', 0.2);
  });
}
export function crateTexture(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    const rng = makeRng(5); g.fillStyle = '#9a7442'; g.fillRect(0, 0, s, s); speckle(g, s, 900, rng, '#c79d62', '#4e3a1c', 0.25);
    g.strokeStyle = '#5b4222'; g.lineWidth = 6; g.strokeRect(5, 5, s - 10, s - 10); g.lineWidth = 4; g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.moveTo(s - 8, 8); g.lineTo(8, s - 8); g.stroke();
  });
}
export function glowTexture(): THREE.CanvasTexture {
  return canvasTex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, false);
}

/** 하늘 돔: 흐린 폭풍우 하늘(어두운 철회색 구름), 지평선은 안개빛. 번개가 칠 때 flash(0~1)가 한쪽 하늘을 밝힙니다. */
export function makeSky(sunDir: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir.clone().normalize() }, flash: { value: 0 }, bolt: { value: new THREE.Vector3(0.6, 0.35, -0.7).normalize() }, t: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sun; uniform vec3 bolt; uniform float flash; uniform float t;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
      void main(){ float h = clamp(vDir.y, -0.1, 1.0); vec3 top = vec3(0.07, 0.09, 0.13), mid = vec3(0.2, 0.25, 0.3), hor = vec3(0.47, 0.53, 0.55);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h)); c = mix(c, top, smoothstep(0.15, 0.8, h));
        vec2 uv = vDir.xz / (vDir.y + 0.35) * 1.6 + vec2(t * 0.012, 0.0); float cl = vn(uv * 2.0) * 0.55 + vn(uv * 4.3) * 0.3 + vn(uv * 9.0) * 0.15; c *= 0.72 + cl * 0.55;
        float s = max(dot(normalize(vDir), sun), 0.0); c += vec3(0.9, 0.78, 0.6) * pow(s, 18.0) * 0.18;
        float b = max(dot(normalize(vDir), bolt), 0.0); c += vec3(0.55, 0.62, 1.0) * flash * (pow(b, 6.0) * 1.6 + 0.25);
        c = mix(c, vec3(0.4, 0.44, 0.44), smoothstep(0.0, -0.1, vDir.y));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat); m.renderOrder = -10; m.frustumCulled = false; return m;
}
