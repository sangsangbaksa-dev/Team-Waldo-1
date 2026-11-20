// SPEED RUSH — 코스를 둘러싼 원경 지형(능선·산맥·구릉)과 그 위 숲. 코스 바깥으로 갈수록 높아지는 높이맵이며,
// 태양 방향으로 음영을 구워 넣고 거리에 따라 안개(공기 원근)에 잠기도록 합니다. 원경이 안개에 완전히 지워지지 않게
// 안개 깊이를 줄이고 최대 농도를 제한한 전용 안개를 씁니다.
import * as THREE from 'three';
import { type Track } from './track';
import { type Theme } from './maps';

/** 지형 모양(장면 종류마다 다름) */
interface Relief {
  /** 코스에서 지형이 시작되는 여유 거리(m) */
  clear: number;
  /** 가까운 구릉 높이, 먼 산맥 높이 */
  hill: number; peak: number;
  /** 능선 노이즈 크기(m) */
  scale: number;
  /** 계단식(메사) 지형 */
  terrace: boolean;
  /** 눈선(0~1, 최고 높이 대비). 없으면 눈 없음 */
  snow: number | null;
  /** 낮은 곳(숲)·중간(바위)·높은 곳 색 */
  low: number; rock: number; high: number;
  /** 산기슭에 심는 나무 수(고품질 기준) */
  trees: number;
}

function reliefFor(th: Theme): Relief | null {
  const rock = th.mountain;
  switch (th.scenery) {
    case 'forest': return { clear: 150, hill: 70, peak: th.snow ? 520 : 470, scale: 520, terrace: false, snow: th.snow ? 0.22 : 0.55, low: th.tint, rock, high: 0xf2f5fa, trees: 900 };
    case 'desert': return { clear: 420, hill: 30, peak: 230, scale: 640, terrace: true, snow: null, low: 0xc9955c, rock: 0xb0643a, high: 0xd88f55, trees: 0 };
    case 'harbor': return { clear: 360, hill: 40, peak: 210, scale: 560, terrace: false, snow: null, low: 0x1c2b26, rock: rock, high: 0x2c3a48, trees: 0 };
    case 'city': return { clear: 520, hill: 10, peak: 260, scale: 700, terrace: false, snow: null, low: 0x2a1d4a, rock: rock, high: 0x5a3f8a, trees: 0 };
  }
}

// 결정적 값 노이즈(코스마다 같은 지형이 나오도록 Math.random 을 쓰지 않습니다)
const hash = (x: number, y: number): number => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x: number, y: number, oct = 5): number => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < oct; k++) { s += a * vnoise(x * f + k * 17.3, y * f - k * 9.1); f *= 2.03; a *= 0.5; } return s; };
/** 날카로운 능선(1-|n|) 노이즈 */
const ridged = (x: number, y: number): number => { let s = 0, a = 0.55, f = 1, w = 1; for (let k = 0; k < 5; k++) { let n = 1 - Math.abs(vnoise(x * f + k * 31.7, y * f + k * 5.3) * 2 - 1); n *= n * w; w = Math.min(1, n * 1.6); s += n * a; f *= 2.1; a *= 0.5; } return s; };
const smooth = (a: number, b: number, v: number): number => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 원경을 안개에 덜 잠기게 하는 안개(깊이 축소 + 최대 농도 제한). 같은 공기 원근을 공유하도록 숲 재질에도 씁니다. */
export function distantFog(mat: THREE.Material, depthScale = 0.5, maxFog = 0.84): void {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth * ${depthScale.toFixed(3)} ) * ${maxFog.toFixed(3)};
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
    #endif`);
  };
  mat.customProgramCacheKey = () => `distantFog${depthScale}:${maxFog}`;
}

export interface Backdrop { group: THREE.Group; dispose(): void }

/** 코스 둘레에 원경 지형을 만듭니다. 장면 종류에 맞는 지형이 없으면 null. */
export function buildBackdrop(t: Track, th: Theme, quality: 'high' | 'standard' | 'low', treeCrown?: THREE.BufferGeometry, trunk?: THREE.BufferGeometry): Backdrop | null {
  const rl = reliefFor(th); if (!rl || t.n === 0) return null;
  const low = quality === 'low', A = low ? 160 : 288, R = low ? 34 : 56, depth = 1700;
  let cx = 0, cz = 0; for (let i = 0; i < t.n; i++) { cx += t.x[i]; cz += t.z[i]; } cx /= t.n; cz /= t.n;
  // 방향마다 코스가 가장 멀리 뻗은 거리 → 지형은 그 바깥에서 시작합니다(코스를 덮지 않음).
  const reach = new Float32Array(A);
  for (let i = 0; i < t.n; i++) {
    const dx = t.x[i] - cx, dz = t.z[i] - cz, a = Math.floor(((Math.atan2(dz, dx) / (Math.PI * 2)) + 1) % 1 * A) % A, d = Math.hypot(dx, dz) + t.halfWidth + 20;
    for (let k = -3; k <= 3; k++) { const j = (a + k + A) % A; reach[j] = Math.max(reach[j], d * Math.cos(k * (Math.PI * 2 / A))); }
  }
  // 이웃 방향과 부드럽게(지형 안쪽 경계가 들쭉날쭉하지 않게)
  const base = new Float32Array(A); for (let a = 0; a < A; a++) { let m = 0; for (let k = -6; k <= 6; k++) m = Math.max(m, reach[(a + k + A) % A]); base[a] = Math.max(260, m) + rl.clear; }
  for (let pass = 0; pass < 3; pass++) for (let a = 0; a < A; a++) base[a] = Math.max(base[a], (base[(a + A - 1) % A] + base[a] + base[(a + 1) % A]) / 3);

  const sun = new THREE.Vector3(...th.sky.sun); sun.y = Math.max(0.28, sun.y + 0.25); sun.normalize();
  const cLow = new THREE.Color(rl.low), cRock = new THREE.Color(rl.rock), cHigh = new THREE.Color(rl.high), cGround = new THREE.Color(th.ground.base), cSun = new THREE.Color(th.light.sun), cSky = new THREE.Color(th.light.sky).multiplyScalar(0.55);
  const W = A + 1, pos = new Float32Array(W * R * 3), heights = new Float32Array(W * R), us = new Float32Array(W * R);
  const heightAt = (x: number, z: number, u: number): number => {
    const s = rl.scale, near = smooth(0, 260, u) * rl.hill * (0.35 + fbm(x / (s * 0.35), z / (s * 0.35), 4));
    let far = smooth(120, 900, u) * rl.peak * (0.18 + 1.05 * ridged(x / s, z / s) * (0.55 + 0.6 * fbm(x / (s * 2.6) + 7, z / (s * 2.6) - 3, 3)));
    if (rl.terrace) { const step = 34, q = far / step, f = q - Math.floor(q); far = (Math.floor(q) + smooth(0.72, 1, f)) * step; }
    return near + far;
  };
  for (let j = 0; j < R; j++) for (let a = 0; a <= A; a++) {
    const ang = (a / A) * Math.PI * 2, b = base[a % A], u = depth * Math.pow(j / (R - 1), 1.55), r = b + u, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
    const h = j === 0 ? -0.4 : heightAt(x, z, u) - 0.4, k = j * W + a; pos.set([x, h, z], k * 3); heights[k] = h; us[k] = u;
  }
  const idx: number[] = []; for (let j = 0; j < R - 1; j++) for (let a = 0; a < A; a++) { const p = j * W + a, q = p + W; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // 음영·재질 색을 정점에 굽습니다: 낮은 곳은 숲(또는 모래), 가파른 곳은 바위, 높은 곳은 눈.
  const nor = g.attributes.normal as THREE.BufferAttribute, col = new Float32Array(W * R * 3), c = new THREE.Color(), n = new THREE.Vector3(), top = rl.peak + rl.hill;
  for (let k = 0; k < W * R; k++) {
    n.fromBufferAttribute(nor, k); const h = heights[k], u = us[k], x = pos[k * 3], z = pos[k * 3 + 2], hn = h / top, slope = 1 - n.y, jitter = fbm(x / 90, z / 90, 3) - 0.5;
    c.copy(cLow).lerp(cRock, smooth(0.25, 0.55, slope + jitter * 0.3 + hn * 0.35));
    if (rl.terrace) c.lerp(cHigh, 0.5 + 0.5 * Math.sin(h * 0.19 + jitter * 3));
    if (rl.snow !== null) c.lerp(cHigh, smooth(rl.snow - 0.06, rl.snow + 0.06, hn + jitter * 0.18 - slope * 0.25));
    c.lerp(cGround, 1 - smooth(10, 90, u));
    const lit = Math.max(0, n.dot(sun)), ao = 0.72 + 0.28 * smooth(-0.1, 0.6, hn);
    const r = c.r * (cSky.r + cSun.r * lit * 1.05) * ao, gg = c.g * (cSky.g + cSun.g * lit * 1.05) * ao, bb = c.b * (cSky.b + cSun.b * lit * 1.05) * ao;
    col.set([Math.min(1, r), Math.min(1, gg), Math.min(1, bb)], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('normal');
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true }); distantFog(mat);
  const group = new THREE.Group(), mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; group.add(mesh);
  const disposables: Array<{ dispose(): void }> = [g, mat];

  // 산기슭 숲: 완만하고 낮은 곳에만, 지형 높이에 맞춰 심습니다.
  if (treeCrown && trunk && rl.trees > 0) {
    const want = Math.round(rl.trees * (low ? 0.3 : quality === 'standard' ? 0.65 : 1)), crownMat = new THREE.MeshBasicMaterial({ vertexColors: true }), trunkMat = new THREE.MeshBasicMaterial({ color: 0x3a2a1c });
    distantFog(crownMat); distantFog(trunkMat);
    const crowns = new THREE.InstancedMesh(treeCrown, crownMat, want), trunks = new THREE.InstancedMesh(trunk, trunkMat, want), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), tint = new THREE.Color(th.tint);
    let count = 0, seed = 1;
    const rand = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let tries = 0; tries < want * 8 && count < want; tries++) {
      const a = rand() * A, ai = Math.floor(a), u = 30 + Math.pow(rand(), 1.4) * 620, r = base[ai % A] + u, ang = (a / A) * Math.PI * 2, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      const h = heightAt(x, z, u) - 0.4, hx = heightAt(x + 6, z, u) - 0.4, hz = heightAt(x, z + 6, u) - 0.4, steep = Math.hypot(hx - h, hz - h) / 6;
      if (steep > 0.75 || (rl.snow !== null && h / top > rl.snow - 0.04) || fbm(x / 140, z / 140, 3) < 0.38) continue; // 가파르거나 눈 덮인 곳, 숲 사이 빈터는 건너뜀
      const sc = 1.3 + rand() * 1.9; p.set(x, h - 0.6, z); q.setFromEuler(e.set(0, rand() * 6.28, 0)); s.set(sc, sc * (0.9 + rand() * 0.5), sc); m4.compose(p, q, s);
      crowns.setMatrixAt(count, m4); trunks.setMatrixAt(count, m4); crowns.setColorAt(count, c.copy(tint).multiplyScalar(0.55 + rand() * 0.45)); count++;
    }
    crowns.count = trunks.count = count; crowns.frustumCulled = trunks.frustumCulled = false; group.add(trunks, crowns); disposables.push(crownMat, trunkMat);
  }
  return { group, dispose: () => disposables.forEach(d => d.dispose()) };
}
