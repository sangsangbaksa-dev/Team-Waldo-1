import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Bucket { mesh: THREE.InstancedMesh; used: number }

/** Sources remain on the animated rig. Only their draw submission is shared. */
export class ActorBatches {
  private buckets = new Map<string, Bucket>();
  private parts = new Map<string, THREE.BufferGeometry>();
  private coatings = new Map<string, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>();
  private white = new THREE.Color(0xffffff);

  constructor(private parent: THREE.Group) {}

  begin(): void { for (const bucket of this.buckets.values()) bucket.used = 0; }

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, shadow: boolean, tint = this.white): void {
    const key = geometry.id + '/' + material.id + '/' + Number(shadow);
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.used === bucket.mesh.instanceMatrix.count) {
      const old = bucket?.mesh;
      const mesh = new THREE.InstancedMesh(geometry, material, old ? old.instanceMatrix.count * 2 : 8);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.white);
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      if (old) {
        mesh.instanceMatrix.array.set(old.instanceMatrix.array);
        mesh.instanceColor!.array.set(old.instanceColor!.array);
        old.removeFromParent();
        old.dispose();
      }
      mesh.castShadow = shadow;
      this.parent.add(mesh);
      bucket = { mesh, used: bucket?.used ?? 0 };
      this.buckets.set(key, bucket);
    }
    bucket.mesh.setMatrixAt(bucket.used, matrix);
    bucket.mesh.setColorAt(bucket.used++, tint);
  }

  end(): void {
    for (const { mesh, used } of this.buckets.values()) {
      mesh.count = used;
      mesh.visible = used > 0;
      if (!used) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  /** Bake the stationary wheel pose once per vehicle model and material slot. */
  carParts(kind: string, body: THREE.Object3D, animated: THREE.Object3D[]): { sources: THREE.Mesh[]; parts: THREE.Mesh[] } {
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    const slots = new Map<THREE.Object3D, number>();
    body.updateWorldMatrix(true, true);
    const inverse = body.parent!.matrixWorld.clone().invert();
    const visit = (o: THREE.Object3D): void => {
      if (animated.includes(o) || o.name === 'rear-lamps' || !o.visible) return;
      if (o instanceof THREE.Mesh && !Array.isArray(o.material) && !o.material.transparent && o.matrixWorld.determinant() > 0) {
        slots.set(o, slots.size);
        const source = o.material;
        let material = source;
        // instantiate() gives vehicle shells untextured paint, metal and emissive trim.
        if (source.name !== 'Paint' && (source instanceof THREE.MeshBasicMaterial || source instanceof THREE.MeshStandardMaterial) && !source.map) {
          const key = source.type + '/' + source.side + (source instanceof THREE.MeshStandardMaterial
            ? '/' + [source.roughness, source.metalness, source.emissive.getHex(), source.emissiveIntensity, source.envMapIntensity].join('/') : '');
          let coating = this.coatings.get(key);
          if (!coating) {
            coating = source.clone();
            coating.color.setHex(0xffffff);
            coating.vertexColors = true;
            this.coatings.set(key, coating);
          }
          material = coating;
        }
        let meshes = groups.get(material);
        if (!meshes) groups.set(material, meshes = []);
        meshes.push(o);
      }
      o.children.forEach(visit);
    };
    visit(body);
    const parts: THREE.Mesh[] = [], sources: THREE.Mesh[] = [];
    for (const [material, meshes] of groups) {
      const key = kind + '/' + meshes.map(m => slots.get(m)).join(',');
      let geo = this.parts.get(key);
      if (!geo) {
        const list = meshes.map(m => {
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          if (m.material !== material) {
            const color = (m.material as THREE.MeshBasicMaterial).color;
            const count = g.getAttribute('position').count;
            const colors = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3);
            for (let i = 0; i < count; i++) colors.setXYZ(i, color.r, color.g, color.b);
            for (const attr of Object.keys(g.attributes)) if (attr !== 'position' && attr !== 'normal') g.deleteAttribute(attr);
            g.setAttribute('color', colors);
          }
          return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld));
        });
        const merged = mergeGeometries(list);
        list.forEach(g => g.dispose());
        if (!merged) continue;
        geo = merged;
        this.parts.set(key, geo);
      }
      const part = new THREE.Mesh(geo, material);
      part.castShadow = meshes[0].castShadow;
      parts.push(part);
      sources.push(...meshes);
    }
    return { parts, sources };
  }

  dispose(): void {
    for (const { mesh } of this.buckets.values()) { mesh.removeFromParent(); mesh.dispose(); }
    for (const g of this.parts.values()) g.dispose();
    for (const material of this.coatings.values()) material.dispose();
    this.coatings.clear();
    this.buckets.clear();
    this.parts.clear();
  }
}
