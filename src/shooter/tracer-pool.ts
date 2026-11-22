// ZERO ZONE: reuse short-lived bullet tracer geometry, meshes and materials.
// Individual materials are required because each trace fades independently.
import * as THREE from 'three';

export type TracerMesh = THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;

export class TracerPool {
  private readonly geometry = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true);
  private readonly available: TracerMesh[] = [];
  private readonly created: TracerMesh[] = [];

  acquire(color: number): TracerMesh {
    const mesh = this.available.pop() ?? this.create();
    mesh.material.color.setHex(color);
    mesh.material.opacity = 0.9;
    mesh.visible = true;
    return mesh;
  }

  release(mesh: TracerMesh): void {
    mesh.removeFromParent();
    mesh.visible = false;
    this.available.push(mesh);
  }

  private create(): TracerMesh {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const mesh = new THREE.Mesh(this.geometry, material);
    this.created.push(mesh);
    return mesh;
  }

  dispose(): void {
    for (const mesh of this.created) {
      mesh.removeFromParent();
      mesh.material.dispose();
    }
    this.geometry.dispose();
    this.created.length = 0;
    this.available.length = 0;
  }

  /** Number of GPU-backed tracer objects ever allocated in this pool. */
  get allocated(): number { return this.created.length; }
}
