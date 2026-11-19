// LAST CITY — 하늘: 시각·날씨에 맞춰 색이 변하는 돔, 흘러가는 구름, 밤의 별, 해와 달.
import * as THREE from 'three';
import { sunDirection, type Atmosphere, type Rgb } from './atmosphere';

const R = 4800;
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const hash = (x: number, y: number): number => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** 가로·세로로 이어 붙는 구름 무늬(여러 겹의 값 잡음). 작은 캔버스라 한 번만 만들면 됩니다. */
function cloudTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d')!, img = g.createImageData(n, n);
  const octave = (u: number, v: number, cells: number): number => {
    const x = u * cells, y = v * cells, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), w = (i: number, j: number): number => hash((i + cells) % cells, (j + cells) % cells);
    const a = w(x0, y0), b = w(x0 + 1, y0), d = w(x0, y0 + 1), e = w(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (d - a) * sy + (a - b - d + e) * sx * sy;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n; let s = 0, amp = 0.5, tot = 0;
    for (let o = 0, cells = 4; o < 5; o++, cells *= 2, amp *= 0.5) { s += octave(u, v, cells) * amp; tot += amp; }
    s /= tot; const a = Math.max(0, Math.min(1, (s - 0.36) * 3.2)), i = (y * n + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class SkyDome {
  readonly group = new THREE.Group(); private skyGeo: THREE.SphereGeometry; private cols: Float32Array; private sunDisc: THREE.Mesh; private moon: THREE.Mesh; private halos: THREE.Sprite[] = [];
  private clouds: THREE.Mesh | null = null; private cloudTex: THREE.CanvasTexture | null = null; private stars: THREE.Points; private starMat: THREE.PointsMaterial;

  constructor(glow: THREE.Texture, quality: 'high' | 'standard' | 'low') {
    this.skyGeo = new THREE.SphereGeometry(R, 32, 18); this.cols = new Float32Array(this.skyGeo.attributes.position.count * 3); this.skyGeo.setAttribute('color', new THREE.BufferAttribute(this.cols, 3));
    const sky = new THREE.Mesh(this.skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -3; sky.name = 'skydome'; this.group.add(sky);
    // 별
    const sp = new Float32Array(700 * 3); for (let i = 0; i < 700; i++) { const a = hash(i, 1) * 6.283, e = Math.asin(0.08 + hash(i, 2) * 0.92), r = R * 0.97; sp.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.renderOrder = -2; this.group.add(this.stars);
    // 해·달과 후광
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(190, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false })); this.sunDisc.renderOrder = -2; this.group.add(this.sunDisc);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(120, 16, 8), new THREE.MeshBasicMaterial({ color: 0xcfd9f2, fog: false })); this.moon.renderOrder = -2; this.group.add(this.moon);
    for (const size of [1500, 3600]) { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); h.scale.set(size, size, 1); h.renderOrder = -2; this.halos.push(h); this.group.add(h); }
    // 구름층: 하늘 높이 떠서 카메라를 따라다니는 큰 판. 가장자리는 투명하게 사라져 지평선의 안개색과 이어집니다.
    if (quality !== 'low') {
      this.cloudTex = cloudTexture(quality === 'high' ? 512 : 256); this.cloudTex.repeat.set(3, 3);
      const geo = new THREE.PlaneGeometry(9400, 9400, 28, 28); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position, col = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)) / 4700, a = Math.max(0, Math.min(1, (1 - d) * 2.2)); col.set([1, 1, 1, a * a], i * 4); }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      this.clouds = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.cloudTex, vertexColors: true, transparent: true, depthWrite: false, fog: false, opacity: 0.4 })); this.clouds.position.y = 2300; this.clouds.renderOrder = -1; this.clouds.name = 'clouds'; this.group.add(this.clouds);
    }
  }

  update(atm: Atmosphere, cam: THREE.Vector3, t: number, flash: number): void {
    this.group.position.set(cam.x, 0, cam.z);
    const top = mix(atm.skyTop, [0.7, 0.78, 1], flash * 0.55), mid = mix(atm.skyMid, [0.62, 0.7, 0.95], flash * 0.5), low = mix(atm.skyLow, [0.55, 0.62, 0.85], flash * 0.35), p = this.skyGeo.attributes.position, c = this.cols;
    for (let i = 0; i < p.count; i++) {
      const k = Math.max(0, p.getY(i) / R), v: Rgb = k < 0.2 ? mix(low, mid, k / 0.2) : mix(mid, top, Math.min(1, (k - 0.2) / 0.65)), j = i * 3; c[j] = v[0]; c[j + 1] = v[1]; c[j + 2] = v[2];
    }
    (this.skyGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    // 해와 달
    const hour = (atm.sunAz / Math.PI) * 12 + 6, s = sunDirection(hour), above = atm.sunElev > -0.08;
    this.sunDisc.visible = atm.sunVis > 0.02 && above; this.sunDisc.position.set(s[0] * 3900, s[1] * 3900, s[2] * 3900);
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.setRGB(...atm.sunColor).multiplyScalar(1.6);
    const mo = -atm.sunElev; this.moon.visible = atm.stars > 0.05 && mo > 0.05; this.moon.position.set(-s[0] * 3900, -s[1] * 3900, -s[2] * 3900);
    for (const [i, h] of this.halos.entries()) { const m = h.material as THREE.SpriteMaterial; h.visible = this.sunDisc.visible || this.moon.visible; const useSun = this.sunDisc.visible; h.position.copy(useSun ? this.sunDisc.position : this.moon.position).multiplyScalar(0.98); { const hc: Rgb = useSun ? atm.sunColor : [0.55, 0.65, 0.95]; m.color.setRGB(hc[0], hc[1], hc[2]); } m.opacity = (useSun ? [0.34, 0.2][i] * atm.sunVis : [0.14, 0.07][i] * atm.stars); }
    this.starMat.opacity = atm.stars * 0.9; this.stars.visible = atm.stars > 0.02;
    // 구름
    if (this.clouds && this.cloudTex) {
      const m = this.clouds.material as THREE.MeshBasicMaterial; this.cloudTex.offset.set(t * 0.0016 * (0.6 + atm.wind), t * 0.0007); m.opacity = Math.min(1, atm.cloud * 0.95);
      m.color.setRGB(...mix(atm.cloudColor, [0.85, 0.9, 1], flash * 0.7)); this.clouds.visible = atm.cloud > 0.05;
    }
  }
}
