// Adapted from LAST CITY's streetfx.ts age-bucketed point plumes.
// Independent of either city's scale, renderer and atmosphere implementation.
import * as THREE from 'three';

export interface PlumeEmitter { x: number; y: number; z: number; rise: number; spread: number; smoke: boolean }
export type PlumeQuality = 'low' | 'standard' | 'high';
export const plumeBudget = (quality: PlumeQuality): number => quality === 'high' ? 32 : quality === 'standard' ? 14 : 0;
const fract = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export function plumeSample(e: PlumeEmitter, t: number, index: number, count: number, wet: number): { x: number; y: number; z: number; alpha: number; age: number } {
  const seed = fract(Math.sin(e.x * .127 + e.z * .311 + index * 17.17) * 43758.5453);
  const age = fract(t / (3.8 + seed * 1.7) + index / count + seed * .3);
  const wind = .4 + clamp01(wet) * 1.1;
  return { x: e.x + age * (Math.sin(t * .7 + seed * 6.28) * e.spread + wind * 2.1),
    y: e.y + age * e.rise, z: e.z + age * (Math.cos(t * .55 + seed * 11) * e.spread + wind * .85),
    alpha: Math.sin(age * Math.PI) * (e.smoke ? .27 : .23 + clamp01(wet) * .11), age };
}

function puffTexture(): THREE.DataTexture {
  const n = 32, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + .5) / n * 2 - 1, v = (y + .5) / n * 2 - 1;
    const a = Math.max(0, 1 - u * u - v * v) ** 2.7;
    const i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(a * 255);
  }
  const tex = new THREE.DataTexture(data, n, n); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true; return tex;
}
interface Layer { points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>; positions: Float32Array; colors: Float32Array; count: number }
const PER_EMITTER = 6;
export class EnvironmentPlumes {
  readonly group = new THREE.Group();
  private emitters: readonly PlumeEmitter[] = [];
  private layers: Layer[] = [];
  private tex: THREE.DataTexture | null = null;
  private budget: number;
  private selected: { e: PlumeEmitter; distance: number }[] = [];
  private disposed = false;
  constructor(quality: PlumeQuality) {
    this.budget = plumeBudget(quality); this.group.name = 'environment plumes';
    if (!this.budget) return;
    this.tex = puffTexture();
    for (const size of [1.15, 2.1, 3.4]) {
      const capacity = this.budget * PER_EMITTER, positions = new Float32Array(capacity * 3), colors = new Float32Array(capacity * 4);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      const m = new THREE.PointsMaterial({ size, map: this.tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, fog: true });
      const points = new THREE.Points(g, m); points.frustumCulled = false; this.group.add(points);
      this.layers.push({ points, positions, colors, count: 0 });
    }
  }
  setEmitters(emitters: readonly PlumeEmitter[]): void { this.emitters = emitters; }
  update(time: number, focus: THREE.Vector3, night: number, wet: number): void {
    if (this.disposed || !this.budget) return;
    const maxR = 190, selected = this.selected; selected.length = 0;
    for (const e of this.emitters) {
      const distance = (e.x - focus.x) ** 2 + (e.z - focus.z) ** 2;
      if (distance < maxR * maxR) selected.push({ e, distance });
    }
    selected.sort((a, b) => a.distance - b.distance);
    for (const l of this.layers) l.count = 0;
    const light = 1 - .53 * clamp01(night), steam = .74 * light, smoke = .34 * light;
    for (let i = 0; i < Math.min(this.budget, selected.length); i++) {
      const { e, distance } = selected[i], fade = Math.min(1, (maxR - Math.sqrt(distance)) / 35);
      for (let p = 0; p < PER_EMITTER; p++) {
        const v = plumeSample(e, time, p, PER_EMITTER, wet);
        const l = this.layers[v.age < .28 ? 0 : v.age < .63 ? 1 : 2], k = l.count++;
        l.positions.set([v.x, v.y, v.z], k * 3);
        const c = e.smoke ? smoke : steam;
        l.colors.set([c * .91, c * .96, c, v.alpha * fade], k * 4);
      }
    }
    for (const l of this.layers) {
      l.points.visible = l.count > 0; l.points.geometry.setDrawRange(0, l.count);
      if (l.count) { l.points.geometry.attributes.position.needsUpdate = true; l.points.geometry.attributes.color.needsUpdate = true; }
    }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const l of this.layers) { l.points.geometry.dispose(); l.points.material.dispose(); }
    this.tex?.dispose(); this.group.removeFromParent(); this.group.clear(); this.layers.length = 0; this.selected.length = 0; this.emitters = [];
  }
}
