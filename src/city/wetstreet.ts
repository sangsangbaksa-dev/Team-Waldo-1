// LAST CITY — 젖은 거리: 아스팔트 위에 얹는 반사 웅덩이 층. 고화질에서는 카메라 주변 도시를 작은 큐브맵으로 구워 웅덩이가 건물·하늘·네온을 비추게 합니다.
import * as THREE from 'three';
import { BLOCK, BLOCKS, PITCH, ROAD, SIZE } from './defs';
import type { Atmosphere } from './atmosphere';

const rngOf = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** 웅덩이 마스크: 도로 전체는 은은하게 젖고(회색), 군데군데 고인 물(흰색)은 거울처럼 번득인다. 블록 안(보도·잔디)은 거의 젖지 않는다. */
function puddleMask(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d')!, k = n / SIZE, rng = rngOf(1119);
  g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, n, n); g.scale(k, k);
  g.fillStyle = '#5a5a5a';
  for (let i = 0; i <= BLOCKS; i++) { g.fillRect(i * PITCH, 0, ROAD, SIZE); g.fillRect(0, i * PITCH, SIZE, ROAD); }
  // 보도는 살짝만 젖는다.
  g.fillStyle = '#2a2a2a'; for (let j = 0; j < BLOCKS; j++) for (let i = 0; i < BLOCKS; i++) { const x = i * PITCH + ROAD, y = j * PITCH + ROAD; g.fillRect(x - 3, y - 3, BLOCK + 6, BLOCK + 6); g.fillStyle = '#121212'; g.fillRect(x + 4, y + 4, BLOCK - 8, BLOCK - 8); g.fillStyle = '#2a2a2a'; }
  const pool = (x: number, y: number, rx: number, ry: number, v: number): void => {
    const gr = g.createRadialGradient(x, y, 0, x, y, 1); gr.addColorStop(0, `rgba(255,255,255,${v})`); gr.addColorStop(0.62, `rgba(255,255,255,${v * 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); g.translate(x, y); g.rotate(rng() * 3.14); g.scale(rx, ry); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 1, 0, 6.29); g.fill(); g.restore();
  };
  for (let q = 0; q < 1500; q++) {
    const horiz = rng() < 0.5, lane = Math.floor(rng() * (BLOCKS + 1)), along = rng() * SIZE, off = ROAD * 0.1 + rng() * ROAD * 0.8;
    const x = horiz ? along : lane * PITCH + off, y = horiz ? lane * PITCH + off : along, r = 5 + rng() * 26;
    pool(x, y, r * (1.2 + rng()), r * (0.5 + rng() * 0.5), 0.8 + rng() * 0.2);
  }
  for (let q = 0; q < 260; q++) pool(rng() * SIZE, rng() * SIZE, 6 + rng() * 14, 4 + rng() * 8, 0.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t;
}

/** 반사 프로브가 그리는 층: 하늘·스카이라인·건물·조명만 올린다(소품·사람·입자는 96픽셀 큐브맵에서 보이지도 않는다). */
export const PROBE_LAYER = 1;

export class WetStreet {
  readonly mesh: THREE.Mesh; private mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; private rt: THREE.WebGLCubeRenderTarget | null = null; private cube: THREE.CubeCamera | null = null; private since = 99; /** 적응형 화질이 반사를 끄면 false */ probe = true; private rendered = false;

  constructor(quality: 'high' | 'standard' | 'low') {
    const tex = puddleMask(quality === 'low' ? 1024 : 2048);
    if (quality === 'high') {
      this.rt = new THREE.WebGLCubeRenderTarget(96, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      this.cube = new THREE.CubeCamera(4, 5200, this.rt); this.cube.layers.set(PROBE_LAYER);
      this.mat = new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.05, metalness: 0.0, alphaMap: tex, transparent: true, opacity: 0.9, envMap: this.rt.texture, envMapIntensity: 1.6, depthWrite: false });
    } else {
      // 가벼운 화질: 하늘색으로 반짝이는 어두운 막(실제 반사 없음)
      this.mat = new THREE.MeshBasicMaterial({ color: 0x1c2230, alphaMap: tex, transparent: true, opacity: 0.55, depthWrite: false });
    }
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), this.mat); this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.set(SIZE / 2, 0.35, SIZE / 2); this.mesh.renderOrder = 1; this.mesh.name = 'wetstreet';
  }

  /** 분위기에 맞춰 젖은 정도·반사 세기를 바꾸고, 고화질이면 주변 도시를 몇 초마다 다시 굽는다. */
  update(dt: number, atm: Atmosphere, cam: THREE.Vector3, renderer: THREE.WebGLRenderer, scene: THREE.Scene, hide: THREE.Object3D[]): void {
    const wet = atm.wet; this.mesh.visible = wet > 0.04;
    if (this.mat instanceof THREE.MeshStandardMaterial) { this.mat.opacity = 0.35 + wet * 0.6; this.mat.envMapIntensity = 0.9 + wet * 1.4; this.mat.color.setRGB(...atm.fog).multiplyScalar(0.05); }
    else { this.mat.opacity = wet * 0.55; this.mat.color.setRGB(...atm.fog).multiplyScalar(0.35); }
    if (!this.cube || (!this.probe && this.rendered) || !this.mesh.visible) return;
    this.since += dt; if (this.since < 1.3) return; this.since = 0;
    // 프로브는 그림자 패스를 6번 더 돌리지 않는다(그림자 맵은 본 패스 것을 그대로 쓴다).
    const vis = hide.map(o => o.visible), sa = renderer.shadowMap.autoUpdate, sn = renderer.shadowMap.needsUpdate; this.mesh.visible = false; renderer.shadowMap.needsUpdate = false; // 프로브 카메라는 층이 달라 그림자 맵을 잘못 채우므로 갱신 요청을 잠시 미룬다
    hide.forEach(o => { o.visible = false; }); renderer.shadowMap.autoUpdate = false;
    this.cube.position.set(cam.x, Math.max(14, cam.y * 0.6), cam.z); this.cube.update(renderer, scene);
    renderer.shadowMap.autoUpdate = sa; renderer.shadowMap.needsUpdate = sn; this.rendered = true; hide.forEach((o, i) => { o.visible = vis[i]; }); this.mesh.visible = true;
  }
}
