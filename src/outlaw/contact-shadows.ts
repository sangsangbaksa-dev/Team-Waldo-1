// SPEED RUSH uses a lightweight soft footprint beneath cars. Batch that
// approach here to support crowded open-world traffic in both cities.
import * as THREE from 'three';
export interface ShadowFootprint { x: number; y: number; z: number; yaw: number; length: number; width: number; gap?: number }
export const shadowScale = (gap: number) => 1 + Math.max(0, Math.min(2, gap)) * .16;
export function contactShadowTexture(size = 32): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = (i + .5) / size * 2 - 1, v = (j + .5) / size * 2 - 1;
    const a = Math.max(0, 1 - Math.max(Math.abs(u), Math.abs(v)) ** 2) ** 2;
    const k = (j * size + i) * 4;
    data[k + 3] = Math.round(a * 255);
  }
  const t = new THREE.DataTexture(data, size, size); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
export class ContactShadows {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly texture = contactShadowTexture();
  private readonly tmp = new THREE.Object3D();
  private count = 0;
  private disposed = false;
  constructor(private capacity: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.texture, color: 0x101018, transparent: true, opacity: .38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), capacity);
    this.mesh.name = 'soft vehicle contact shadows'; this.mesh.count = 0;
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  begin(night: number): void { this.count = 0; this.mesh.material.opacity = .38 - .14 * Math.max(0, Math.min(1, night)); }
  add(f: ShadowFootprint): boolean {
    if (this.disposed || this.count >= this.capacity || ![f.x, f.y, f.z, f.yaw, f.length, f.width, f.gap ?? 0].every(Number.isFinite) || f.length <= 0 || f.width <= 0 || (f.gap ?? 0) > 2.5) return false;
    const o = this.tmp, scale = shadowScale(f.gap ?? 0);
    o.position.set(f.x, f.y, f.z); o.rotation.set(0, f.yaw, 0); o.scale.set(f.length * scale, 1, f.width * scale); o.updateMatrix();
    this.mesh.setMatrixAt(this.count++, o.matrix); return true;
  }
  end(): void { this.mesh.count = this.count; this.mesh.visible = this.count > 0; if (this.count) this.mesh.instanceMatrix.needsUpdate = true; }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.mesh.removeFromParent(); this.mesh.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.texture.dispose();
  }
}
