import * as THREE from 'three';
import { hash01, type Layout } from './layout';
import type { Quality } from './city';

// Shared geometry keeps the extra street furniture to a handful of draw calls.
export class StreetDetail {
  readonly group = new THREE.Group();
  private reflections: THREE.InstancedMesh;
  private reflectionMaterial: THREE.MeshBasicMaterial;
  private resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  constructor(layout: Layout, quality: Quality) {
    const dummy = new THREE.Object3D();
    const positions = layout.blocks.flatMap(b => {
      const h = hash01(b.i * 17, b.j * 31);
      return [
        { x: b.cx - 12, z: b.cz + 17, yaw: 0, h },
        { x: b.cx + 12, z: b.cz - 17, yaw: Math.PI, h: 1 - h },
        { x: b.cx + 17, z: b.cz + 9, yaw: Math.PI / 2, h: hash01(b.i + 91, b.j) },
      ];
    });
    const mat = (color: number, metalness = 0, roughness = 0.7): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, metalness, roughness }); this.resources.push(m); return m;
    };
    const create = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh => {
      this.resources.push(geometry); const m = new THREE.InstancedMesh(geometry, material, count); this.group.add(m); return m;
    };
    const metal = mat(0x343c46, 0.75, 0.38), dark = mat(0x17232c, 0.45, 0.6), warm = mat(0xb89668, 0.45, 0.42);
    const bin = create(new THREE.CylinderGeometry(0.37, 0.32, 1.05, 8), metal, positions.length);
    const binLid = create(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 8), dark, positions.length);
    const bollard = create(new THREE.CylinderGeometry(0.09, 0.12, 0.85, 8), dark, positions.length * 2);
    const caps = create(new THREE.CylinderGeometry(0.105, 0.105, 0.08, 8), warm, positions.length * 2);
    const utility = create(new THREE.BoxGeometry(0.85, 1.2, 0.38), metal, positions.length);
    const vent = create(new THREE.BoxGeometry(0.62, 0.035, 0.02), dark, positions.length * 4);
    const place = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1): void => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
    };
    positions.forEach((p, i) => {
      const dx = Math.cos(p.yaw), dz = -Math.sin(p.yaw), nx = Math.sin(p.yaw), nz = Math.cos(p.yaw);
      place(bin, i, p.x, 0.72, p.z, p.yaw); place(binLid, i, p.x, 1.27, p.z, p.yaw);
      place(utility, i, p.x + dx * 2.5, 0.78, p.z + dz * 2.5, p.yaw);
      for (let j = 0; j < 4; j++) place(vent, i * 4 + j, p.x + dx * 2.5 + nx * 0.2, 0.72 + j * 0.13, p.z + dz * 2.5 + nz * 0.2, p.yaw);
      for (let j = 0; j < 2; j++) {
        const x = p.x + dx * (4 + j * 2.4), z = p.z + dz * (4 + j * 2.4);
        place(bollard, i * 2 + j, x, 0.6, z); place(caps, i * 2 + j, x, 1.04, z);
      }
    });

    // Soft, broken-up pools suggest neon and lamp reflections without another render pass.
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d')!; const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,.72)'); gradient.addColorStop(0.35, 'rgba(255,255,255,.28)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.scale(1, 2); g.fillStyle = gradient; g.fillRect(0, 0, 128, 128); g.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 30; i++) { const y = hash01(i, 63) * 256; g.clearRect(0, y, 128, 1 + hash01(i, 64) * 4); }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; this.resources.push(texture);
    this.reflectionMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }); this.resources.push(this.reflectionMaterial);
    const rg = new THREE.PlaneGeometry(1, 1); rg.rotateX(-Math.PI / 2);
    const count = quality === 'high' ? positions.length : quality === 'standard' ? Math.ceil(positions.length / 2) : 0;
    this.reflections = create(rg, this.reflectionMaterial, count);
    const colors = [0xffa65c, 0x59cce5, 0xf36a9d, 0xf5d58a]; const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = positions[i]; const nx = Math.sin(p.yaw), nz = Math.cos(p.yaw);
      place(this.reflections, i, p.x + nx * 3, 0.045, p.z + nz * 3, p.yaw, 2.4 + p.h * 2, 1, 7 + p.h * 5);
      this.reflections.setColorAt(i, color.setHex(colors[Math.floor(p.h * colors.length) % colors.length]));
    }
  }
  setWeather(night: number, wet: number): void { this.reflectionMaterial.opacity = wet * (0.12 + night * 0.35); }
  dispose(): void { this.group.removeFromParent(); for (const resource of this.resources) resource.dispose(); }
}
