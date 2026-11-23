// SPEED RUSH — distinguish globally shared model resources from scene-owned ones.
// CharacterKit, car templates and their cached materials are reused by other
// games. A local racing renderer must never dispose those borrowed resources.
import type * as THREE from 'three';

export interface DisposableResource { dispose(): void }

/** Mark geometry and materials borrowed from model/character caches. */
export function markBorrowedTree(root: THREE.Object3D, borrowed: Set<object>): void {
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) borrowed.add(mesh.geometry);
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material) borrowed.add(material);
      }
    }
  });
}

/** Dispose only locally created resources, once per object identity. */
export function disposeOwnedTree(
  scene: THREE.Object3D,
  extras: ReadonlyArray<DisposableResource>,
  borrowed: ReadonlySet<object>,
): void {
  const seen = new Set<object>();
  const once = (resource: DisposableResource | null | undefined): void => {
    if (!resource || seen.has(resource) || borrowed.has(resource)) return;
    seen.add(resource);
    resource.dispose();
  };
  scene.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) once(mesh.geometry);
    const materials = mesh.material == null ? [] : Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material || borrowed.has(material)) continue;
      once(material);
      const textured = material as THREE.MeshBasicMaterial;
      once(textured.map); once(textured.alphaMap);
    }
  });
  for (const extra of extras) once(extra);
}
