// Dispose a game scene without touching geometry/materials from a shared asset kit.
import * as THREE from 'three';

export interface SceneCleanupOptions {
  /** Shared character/model materials survive a round so the next renderer can reuse them. */
  keepMaterial?: (material: THREE.Material) => boolean;
  /** Textures not attached directly to a scene material, e.g. particle atlas. */
  extraTextures?: readonly THREE.Texture[];
  /** Optional geometry retained by a scene object but not currently attached to it. */
  extraGeometries?: readonly THREE.BufferGeometry[];
}

/** Deduplicated release of scene-owned GPU resources, including lines, points and textures. */
export function disposeSceneResources(root: THREE.Object3D, options: SceneCleanupOptions = {}): void {
  const geometries = new Set<THREE.BufferGeometry>(options.extraGeometries ?? []);
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>(options.extraTextures ?? []);
  root.traverse(object => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    // THREE.Sprite uses a process-wide geometry shared by unrelated sprites.
    if (!(object instanceof THREE.Sprite) && renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
        if (!options.keepMaterial?.(material)) materials.add(material);
      }
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
      }
    }
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
