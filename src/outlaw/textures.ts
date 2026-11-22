// OUTLAW CITY의 절차적 도시 질감과 시간대별 하늘.
import * as THREE from 'three';
import { makeRng } from './types';

const cache = new Map<string, THREE.CanvasTexture>();
function texture(key: string, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = true, size = 256): THREE.CanvasTexture {
  const old = cache.get(key); if (old) return old;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(1, 1); cache.set(key, t); return t;
}
function grain(g: CanvasRenderingContext2D, s: number, seed: number, count: number, alpha = .12): void {
  const r = makeRng(seed);
  for (let i = 0; i < count; i++) { g.fillStyle = r() < .5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`; g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2); }
}
function base(g: CanvasRenderingContext2D, s: number, color: string, seed: number): void { g.fillStyle = color; g.fillRect(0, 0, s, s); grain(g, s, seed, 2400, .25); }
export function asphaltTexture(): THREE.CanvasTexture { return texture('asphalt', (g, s) => {
  base(g, s, '#454747', 1); const r = makeRng(3);
  g.strokeStyle = 'rgba(15,16,17,.19)'; g.lineWidth = 12; for (const x of [70, 171]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, s); g.stroke(); }
  g.lineWidth = 1; g.strokeStyle = 'rgba(20,20,20,.35)'; for (let i = 0; i < 7; i++) { let x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (r() - .5) * 16; y += (r() - .5) * 18; g.lineTo(x, y); } g.stroke(); }
}); }
/** Seamless, neutral roughness variation: repeatable patches are more matte than puddles. */
export function asphaltRoughnessTexture(): THREE.CanvasTexture {
  const t = texture('asphaltRoughness', (g, s) => {
    g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, s, s);
    const r = makeRng(913);
    for (let k = 0; k < 22; k++) {
      const x = r() * s, y = r() * s, radius = 12 + r() * 27;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const px = x + dx * s, py = y + dy * s;
        const grad = g.createRadialGradient(px, py, 0, px, py, radius); grad.addColorStop(0, 'rgba(70,70,70,.65)'); grad.addColorStop(1, 'rgba(70,70,70,0)'); g.fillStyle = grad; g.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      }
    }
  });
  t.colorSpace = THREE.NoColorSpace; return t;
}
export function crosswalkTexture(): THREE.CanvasTexture { return texture('crosswalk', (g, s) => { g.fillStyle = 'rgba(230,228,211,.92)'; for (let x = 12; x < s; x += 64) g.fillRect(x, 18, 38, s - 36); }, false); }
export function laneLineTexture(): THREE.CanvasTexture { return texture('lane', (g, s) => { g.fillStyle = 'rgba(222,203,144,.9)'; g.fillRect(s * .45, s * .15, s * .1, s * .55); }); }
export function concreteTexture(): THREE.CanvasTexture { return texture('concrete', (g, s) => base(g, s, '#a7a49b', 5)); }
export function sidewalkTexture(): THREE.CanvasTexture { return texture('sidewalk', (g, s) => { base(g, s, '#aaa99f', 6); g.strokeStyle = 'rgba(58,58,55,.4)'; g.lineWidth = 2; for (let x = 0; x < s; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.moveTo(0, x); g.lineTo(s, x); g.stroke(); } }); }
export function grassTexture(): THREE.CanvasTexture { return texture('grass', (g, s) => { base(g, s, '#647452', 7); const r = makeRng(8); for (let i = 0; i < 500; i++) { g.fillStyle = r() < .5 ? 'rgba(39,61,35,.18)' : 'rgba(161,167,103,.18)'; g.fillRect(r() * s, r() * s, 3 + r() * 8, 1 + r() * 4); } }); }
export function dirtTexture(): THREE.CanvasTexture { return texture('dirt', (g, s) => base(g, s, '#85745c', 9)); }
export function roofTexture(): THREE.CanvasTexture { return texture('roof', (g, s) => base(g, s, '#555550', 10)); }
export function tileRoofTexture(): THREE.CanvasTexture { return texture('roofTile', (g, s) => { base(g, s, '#805449', 11); g.strokeStyle = 'rgba(40,24,20,.45)'; for (let y = 0; y < s; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); for (let x = (y / 32 % 2) * 16; x < s; x += 32) { g.moveTo(x, y); g.lineTo(x, y + 32); } g.stroke(); } }); }

type Facade = { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture };
const facades = new Map<number, Facade>();
export function facadeTexture(variant: number, _night = false): Facade {
  const v = ((Math.floor(variant) % 6) + 6) % 6; const old = facades.get(v); if (old) return old;
  const colors = ['#425966', '#a29f93', '#b3aa98', '#92594d', '#beb7a5', '#797f7e'];
  const windows: Array<{x:number; y:number; w:number; h:number; lit:boolean; warm:boolean}> = [];
  const rng = makeRng(200 + v); const count = v === 0 ? 8 : v === 4 ? 3 : v === 5 ? 4 : 5;
  for (let i = 0; i < count; i++) windows.push({ x: i * 256 / count + 5, y: v === 5 ? 43 : 45, w: 256 / count - 10, h: v === 5 ? 48 : v === 4 ? 88 : 105, lit: rng() < .4, warm: rng() < .65 });
  const map = texture(`facade${v}`, (g, s) => {
    base(g, s, colors[v], 30 + v);
    if (v === 3) { g.strokeStyle = 'rgba(55,32,29,.35)'; for (let y = 0; y < s; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); for (let x = (y / 16 % 2) * 16; x < s; x += 32) { g.moveTo(x, y); g.lineTo(x, y + 16); } g.stroke(); } }
    if (v === 4 || v === 5) { g.strokeStyle = 'rgba(36,40,39,.25)'; for (let n = 0; n < s; n += v === 4 ? 16 : 12) { g.beginPath(); if (v === 4) { g.moveTo(0, n); g.lineTo(s, n); } else { g.moveTo(n, 0); g.lineTo(n, s); } g.stroke(); } }
    if (v === 2) { g.fillStyle = '#685f53'; g.fillRect(0, 190, s, 28); g.fillStyle = '#c1b29a'; g.fillRect(0, 190, s, 3); }
    for (const w of windows) { g.fillStyle = '#333c3d'; g.fillRect(w.x - 3, w.y - 3, w.w + 6, w.h + 6); const grad = g.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h); grad.addColorStop(0, '#78909a'); grad.addColorStop(.5, '#344956'); grad.addColorStop(1, '#273741'); g.fillStyle = grad; g.fillRect(w.x, w.y, w.w, w.h); g.fillStyle = 'rgba(190,199,196,.45)'; g.fillRect(w.x + w.w / 2, w.y, 2, w.h); if (v === 1 || v === 3) g.fillRect(w.x, w.y + w.h / 2, w.w, 2); if (v === 3) { g.fillStyle = '#655a52'; g.fillRect(w.x - 4, w.y + w.h + 8, w.w + 8, 7); g.fillStyle = '#373d3d'; g.fillRect(w.x - 3, w.y + w.h - 10, w.w + 6, 3); } }
    g.fillStyle = 'rgba(30,32,32,.2)'; g.fillRect(0, 0, s, 3);
  });
  const emissive = texture(`facadeLight${v}`, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); for (const w of windows) if (w.lit) { g.fillStyle = w.warm ? '#eac985' : '#c8d7db'; g.fillRect(w.x, w.y, w.w, w.h); g.fillStyle = '#000'; g.fillRect(w.x + w.w / 2, w.y, 2, w.h); if (v === 1 || v === 3) g.fillRect(w.x, w.y + w.h / 2, w.w, 2); } });
  const result = { map, emissive }; facades.set(v, result); return result;
}
export function neonSignTexture(text: string, color: string): THREE.CanvasTexture { return texture(`neon:${JSON.stringify([text, color])}`, (g, s) => { g.fillStyle = '#171b20'; g.fillRect(0, 0, s, s); g.strokeStyle = '#444952'; g.lineWidth = 3; g.strokeRect(4, 52, s - 8, 152); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 36px sans-serif'; g.shadowColor = color; g.shadowBlur = 16; g.fillStyle = color; g.fillText(text, s / 2, s / 2, s - 24); g.shadowBlur = 0; }, false); }
export function billboardTexture(variant: number): THREE.CanvasTexture { const v = ((Math.floor(variant) % 5) + 5) % 5; const brands = ['NOVA TRANSIT', 'CITRUS WAVE', 'SUMMIT BANK', 'NORTHLINE', 'ORBIT RADIO']; const colors = ['#426173', '#bc7951', '#53675d', '#796457', '#595875']; return texture(`billboard${v}`, (g, s) => { g.fillStyle = colors[v]; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(20,24,27,.3)'; g.fillRect(0, 170, s, 86); g.fillStyle = '#eee9d8'; g.textAlign = 'center'; g.font = 'bold 25px sans-serif'; g.fillText(brands[v], s / 2, 115, s - 24); g.font = '14px sans-serif'; g.fillText(['MOVE WITH THE CITY', 'A LITTLE BRIGHTER', 'BUILD TOMORROW', 'MADE FOR THE ROAD', 'FIND YOUR FREQUENCY'][v], s / 2, 204, s - 24); }, false); }

type SkyPalette = { top: number; horizon: number; fog: number; sun: number; hemiSky: number; hemiGround: number; sunIntensity: number; hemiIntensity: number; night: number };
const palettes: Array<{ hour: number; p: SkyPalette }> = [
  { hour: 0, p: { top: 0x071126, horizon: 0x263047, fog: 0x263044, sun: 0x869aba, hemiSky: 0x415578, hemiGround: 0x292a31, sunIntensity: 0, hemiIntensity: .18, night: 1 } },
  { hour: 4, p: { top: 0x101831, horizon: 0x514454, fog: 0x45404b, sun: 0xe49a72, hemiSky: 0x60617a, hemiGround: 0x383339, sunIntensity: 0, hemiIntensity: .22, night: .9 } },
  { hour: 5, p: { top: 0x414565, horizon: 0xd18a70, fog: 0x9d8581, sun: 0xffb176, hemiSky: 0xb2a6a3, hemiGround: 0x685951, sunIntensity: .2, hemiIntensity: .38, night: .5 } },
  { hour: 8, p: { top: 0x6287ad, horizon: 0xcbd1cf, fog: 0xb9c3c3, sun: 0xffe1b5, hemiSky: 0xc6d9e8, hemiGround: 0x777668, sunIntensity: .85, hemiIntensity: .7, night: 0 } },
  { hour: 12, p: { top: 0x4e7bab, horizon: 0xc5d4dc, fog: 0xb9cbd0, sun: 0xfff2db, hemiSky: 0xd4e6f4, hemiGround: 0x807f73, sunIntensity: 1.1, hemiIntensity: .85, night: 0 } },
  { hour: 17, p: { top: 0x647b9e, horizon: 0xe1b49a, fog: 0xc4aaa3, sun: 0xffd0a1, hemiSky: 0xd6d1ce, hemiGround: 0x827168, sunIntensity: .75, hemiIntensity: .65, night: 0 } },
  { hour: 19, p: { top: 0x534968, horizon: 0xe09270, fog: 0xa67978, sun: 0xffad73, hemiSky: 0xaaa1b1, hemiGround: 0x625052, sunIntensity: .15, hemiIntensity: .35, night: .55 } },
  { hour: 21, p: { top: 0x0d1730, horizon: 0x34364f, fog: 0x303448, sun: 0x9a9cba, hemiSky: 0x4b5978, hemiGround: 0x303039, sunIntensity: 0, hemiIntensity: .2, night: .95 } },
  { hour: 24, p: { top: 0x071126, horizon: 0x263047, fog: 0x263044, sun: 0x869aba, hemiSky: 0x415578, hemiGround: 0x292a31, sunIntensity: 0, hemiIntensity: .18, night: 1 } },
];
export interface SkyColors {
  top: THREE.Color; horizon: THREE.Color; fog: THREE.Color; sun: THREE.Color;
  hemiSky: THREE.Color; hemiGround: THREE.Color;
  sunIntensity: number; hemiIntensity: number; night: number; stars: number;
  sunDir: THREE.Vector3; moonDir: THREE.Vector3;
}
type PaletteColorKey = 'top' | 'horizon' | 'fog' | 'sun' | 'hemiSky' | 'hemiGround';
const COLOR_KEYS: readonly PaletteColorKey[] = ['top', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround'];
const PALETTE_COLORS = palettes.map(({ p }) => ({
  top: new THREE.Color(p.top), horizon: new THREE.Color(p.horizon),
  fog: new THREE.Color(p.fog), sun: new THREE.Color(p.sun),
  hemiSky: new THREE.Color(p.hemiSky), hemiGround: new THREE.Color(p.hemiGround),
}));
const blankSky = (): SkyColors => ({
  top: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(),
  sun: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
  sunIntensity: 0, hemiIntensity: 0, night: 0, stars: 0,
  sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(),
});
/** 24-hour lighting values. Optional out reuses all Color/Vector buffers;
 * the default call creates an independent palette for immutable consumers. */
export function skyColors(clock: number, out: SkyColors = blankSky()): SkyColors {
  const h = ((clock % 24) + 24) % 24;
  let i = 0;
  while (i < palettes.length - 2 && h >= palettes[i + 1].hour) i++;
  const a = palettes[i].p, b = palettes[i + 1].p;
  let t = (h - palettes[i].hour) / (palettes[i + 1].hour - palettes[i].hour);
  t = t * t * (3 - 2 * t);
  const p0 = PALETTE_COLORS[i], p1 = PALETTE_COLORS[i + 1];
  for (const key of COLOR_KEYS) out[key].copy(p0[key]).lerp(p1[key], t);
  out.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
  out.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t);
  out.night = THREE.MathUtils.lerp(a.night, b.night, t);
  out.stars = THREE.MathUtils.smoothstep(out.night, .5, .95);
  const angle = h < 5 ? Math.PI + (h + 5) * Math.PI / 10
    : h < 19 ? (h - 5) * Math.PI / 14 : Math.PI + (h - 19) * Math.PI / 10;
  out.sunDir.set(Math.cos(angle), Math.sin(angle), .25).normalize();
  out.moonDir.copy(out.sunDir).negate();
  return out;
}
/** 역면 구와 매 프레임 갱신할 수 있는 셰이더. */
export function makeSkyDome(): { mesh: THREE.Mesh; update: (colors: SkyColors, dt?: number) => void } {
  const initial = skyColors(12);
  const uniforms = { top: { value: initial.top }, horizon: { value: initial.horizon }, sunColor: { value: initial.sun }, sunDir: { value: initial.sunDir }, moonDir: { value: initial.moonDir }, night: { value: initial.night }, stars: { value: initial.stars }, time: { value: 0 } };
  const material = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 top,horizon,sunColor,sunDir,moonDir; uniform float night,stars,time;
      float hash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      void main(){ vec3 d=normalize(vDir); float h=max(d.y,0.0); vec3 c=mix(horizon,top,smoothstep(0.0,.8,h));
        float sd=dot(d,normalize(sunDir)); float md=dot(d,normalize(moonDir));
        c+=sunColor*(smoothstep(.9994,.9997,sd)*1.2+pow(max(sd,0.0),64.0)*.32)*(1.0-night);
        c+=vec3(.76,.81,.87)*smoothstep(.99955,.99975,md)*night;
        vec3 cell=floor(d*420.0); float star=step(.9975,hash(cell))*pow(max(0.0,1.0-length(fract(d*420.0)-.5)*2.0),3.0);
        c+=vec3(star*stars*smoothstep(.02,.25,h));
        vec2 uv=d.xz/max(d.y+.25,.25)*3.0+vec2(time*.002,0.0); vec2 f=fract(uv), id=floor(uv); f=f*f*(3.0-2.0*f);
        float n=mix(mix(hash(vec3(id,0.0)),hash(vec3(id+vec2(1,0),0.0)),f.x),mix(hash(vec3(id+vec2(0,1),0.0)),hash(vec3(id+vec2(1,1),0.0)),f.x),f.y);
        c=mix(c,mix(vec3(.22,.25,.30),vec3(.87,.87,.85),1.0-night),smoothstep(.58,.78,n)*.25*smoothstep(.03,.22,h));
        gl_FragColor=vec4(c,1.0); #include <tonemapping_fragment> #include <colorspace_fragment> }`.replace(/ #include/g, '\n#include').replace(/ }$/, '\n}') });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material); mesh.renderOrder = -10; mesh.frustumCulled = false;
  // Shader clouds obey the actual game-frame clock, not performance.now():
  // when a pause menu opens, the weather and procedural sky should both freeze.
  let time = 0;
  return { mesh, update: (c, dt = 0) => {
    uniforms.top.value.copy(c.top); uniforms.horizon.value.copy(c.horizon);
    uniforms.sunColor.value.copy(c.sun); uniforms.sunDir.value.copy(c.sunDir);
    uniforms.moonDir.value.copy(c.moonDir); uniforms.night.value = c.night;
    uniforms.stars.value = c.stars;
    if (Number.isFinite(dt) && dt > 0) time += Math.min(dt, 0.25);
    uniforms.time.value = time;
  } };
}
