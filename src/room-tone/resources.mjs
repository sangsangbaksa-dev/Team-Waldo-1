/**
 * Dispose a detached chapter group and every unique GPU resource it owns.
 * Materials can share textures and meshes can share geometry, so each
 * resource is collected once before disposal. Clearing children makes this
 * operation idempotent and releases stale scene references immediately.
 */
export function disposeGroup(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  root.removeFromParent();
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  root.clear();
}
