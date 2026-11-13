import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface StaticBatch {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
}

/** Collapse rigid primitives by material; animated parts remain separate. */
export function batchStaticChildren(
  parent: THREE.Group,
  exclude: ReadonlySet<THREE.Object3D> = new Set(),
  cached?: readonly StaticBatch[],
): readonly StaticBatch[] {
  const candidates = parent.children.filter((child): child is THREE.Mesh =>
    child instanceof THREE.Mesh && !exclude.has(child) && !Array.isArray(child.material));
  const batches: readonly StaticBatch[] = cached ?? (() => {
    const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
    for (const mesh of candidates) {
      const material = mesh.material as THREE.Material;
      const group = byMaterial.get(material) ?? [];
      group.push(mesh); byMaterial.set(material, group);
    }
    return [...byMaterial].map(([material, meshes]) => {
      // Three.js can only merge buffers with identical index and attribute layouts.
      // Roof wedges are non-indexed and have no UVs, while stock primitives are
      // indexed with UVs. Standardize both before merging to prevent a real
      // WebGL startup failure in the castle, outposts, and unit batches.
      const transformed = meshes.map(mesh => {
        mesh.updateMatrix();
        const source = mesh.geometry;
        const normalized = source.index ? source.toNonIndexed() : source.clone();
        for (const attribute of Object.keys(normalized.attributes)) {
          if (attribute !== 'position' && attribute !== 'normal') normalized.deleteAttribute(attribute);
        }
        if (!normalized.getAttribute('normal')) normalized.computeVertexNormals();
        return normalized.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(transformed, false);
      transformed.forEach(part => part.dispose());
      if (!geometry) throw new Error('Unable to batch battlefield geometry');
      return { geometry, material, castShadow: meshes.some(mesh => mesh.castShadow),
        receiveShadow: meshes.some(mesh => mesh.receiveShadow) };
    });
  })();
  candidates.forEach(mesh => parent.remove(mesh));
  for (const batch of batches) {
    const mesh = new THREE.Mesh(batch.geometry, batch.material);
    mesh.castShadow = batch.castShadow;
    mesh.receiveShadow = batch.receiveShadow;
    parent.add(mesh);
  }
  return batches;
}
