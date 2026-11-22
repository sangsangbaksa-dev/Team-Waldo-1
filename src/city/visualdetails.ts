import * as THREE from 'three';
import { BLOCK } from './defs';

type Block = { x: number; y: number };

/** Decorative street furniture. Every part is batched by material and geometry. */
export class CityDetails {
  private group = new THREE.Group();
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private glowMat: THREE.MeshBasicMaterial;
  private coneMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, blocks: readonly Block[], glow: THREE.Texture, quality: 'high' | 'standard' | 'low') {
    const high = quality === 'high', low = quality === 'low';
    const metal = this.material(new THREE.MeshStandardMaterial({ color: 0x343d46, metalness: 0.7, roughness: 0.42 }));
    const dark = this.material(new THREE.MeshStandardMaterial({ color: 0x171e25, metalness: 0.4, roughness: 0.58 }));
    const red = this.material(new THREE.MeshStandardMaterial({ color: 0xa5322b, metalness: 0.35, roughness: 0.5 }));
    const pale = this.material(new THREE.MeshStandardMaterial({ color: 0xb5a990, metalness: 0.3, roughness: 0.65 }));
    const lit = this.material(new THREE.MeshStandardMaterial({ color: 0xffd494, emissive: 0xff9b40, emissiveIntensity: 2, roughness: 0.5 }));
    this.glowMat = this.material(new THREE.MeshBasicMaterial({ map: glow, color: 0xffbd72, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.coneMat = this.material(new THREE.MeshBasicMaterial({ color: 0xffc783, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    const box = this.geometry(new THREE.BoxGeometry(1, 1, 1));
    const cylinder = this.geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
    const sphere = this.geometry(new THREE.SphereGeometry(1, 8, 6));
    const cone = this.geometry(new THREE.CylinderGeometry(1, 0.05, 1, 12, 1, true));
    const plane = this.geometry(new THREE.PlaneGeometry(1, 1));
    type Part = { geo: THREE.BufferGeometry; mat: THREE.Material; transforms: THREE.Matrix4[] };
    const parts = new Map<string, Part>();
    const d = new THREE.Object3D();
    const add = (key: string, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0): void => {
      let part = parts.get(key); if (!part) { part = { geo, mat, transforms: [] }; parts.set(key, part); }
      d.position.set(x, y, z); d.rotation.set(rx, ry, 0); d.scale.set(sx, sy, sz); d.updateMatrix(); part.transforms.push(d.matrix.clone());
    };
    blocks.forEach((b, i) => {
      if (low && i % 2) return;
      const x = b.x + 9, z = b.y + 9;
      // Lamp bases, arms and glass give the silhouette detail at street level.
      add('lampbase', cylinder, dark, x, 5, z, 4, 10, 4);
      add('lamppole', cylinder, metal, x, 48, z, 1.8, 82, 1.8);
      add('lampring', cylinder, pale, x, 19, z, 2.4, 2, 2.4);
      add('lamparm', box, metal, x - 8, 89, z, 17, 2, 2);
      add('lampcap', box, dark, x - 16, 88, z, 12, 3, 8);
      add('lampglass', box, lit, x - 16, 85.5, z, 9, 1.5, 6);
      if (!low) add('halo', plane, this.glowMat, x - 16, 84, z, 44, 44, 1);
      if (high) add('cone', cone, this.coneMat, x - 16, 43, z, 31, 82, 31);
      // Hydrants are made from separate instanced castings and caps.
      const hx = b.x + BLOCK - 14, hz = b.y + 13;
      add('hydrant', cylinder, red, hx, 8, hz, 3.5, 15, 3.5);
      add('hydrantfoot', cylinder, dark, hx, 1.5, hz, 5, 3, 5);
      add('hydranttop', sphere, red, hx, 16, hz, 3.6, 3, 3.6);
      add('hydrantcap', cylinder, pale, hx, 10, hz, 2, 9, 2, 0, Math.PI / 2);
      if (low) return;
      const bx = b.x + 18, bz = b.y + BLOCK - 15;
      add('bin', cylinder, dark, bx, 9, bz, 5, 18, 5);
      add('binrim', cylinder, metal, bx, 18, bz, 5.5, 2, 5.5);
      add('binband', cylinder, pale, bx, 12, bz, 5.1, 1, 5.1);
      // A compact intersection signal and its three separate lenses.
      const tx = b.x + BLOCK - 10, tz = b.y + BLOCK - 10;
      add('signalpole', cylinder, metal, tx, 29, tz, 1.6, 58, 1.6);
      add('signalbox', box, dark, tx, 59, tz, 8, 20, 5);
      add('signalred', sphere, red, tx, 65, tz - 3, 2, 2, 0.8);
      add('signalamber', sphere, pale, tx, 59, tz - 3, 2, 2, 0.8);
      add('signalgreen', sphere, lit, tx, 53, tz - 3, 2, 2, 0.8);
      // Bollards define the curb without adding separate draw calls per object.
      for (let j = 0; j < 3; j++) {
        const px = b.x + 45 + j * 18;
        add('bollard', cylinder, dark, px, 6, b.y + 7, 2, 12, 2);
        add('bollardstripe', cylinder, pale, px, 9, b.y + 7, 2.1, 1.5, 2.1);
      }
    });
    for (const part of parts.values()) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, part.transforms.length);
      part.transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      mesh.castShadow = high && part.mat !== this.glowMat && part.mat !== this.coneMat;
      this.group.add(mesh);
    }
    scene.add(this.group);
  }

  private material<T extends THREE.Material>(m: T): T { this.materials.push(m); return m; }
  private geometry<T extends THREE.BufferGeometry>(g: T): T { this.geometries.push(g); return g; }
  /** 적응형 화질에서 장식 인스턴스를 통째로 끕니다. */
  setVisible(v: boolean): void { this.group.visible = v; }
  update(lamps: number, t: number, reduced: boolean): void {
    const intensity = Math.max(0, Math.min(1, lamps));
    this.glowMat.opacity = intensity * (reduced ? 0.48 : 0.48 + Math.sin(t * 0.8) * 0.025);
    this.coneMat.opacity = intensity * 0.035;
  }
  dispose(): void { this.group.removeFromParent(); for (const g of this.geometries) g.dispose(); for (const m of this.materials) m.dispose(); }
}
