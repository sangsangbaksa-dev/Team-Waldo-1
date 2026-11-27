import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bake } from '../../src/shared/character/bake';
import { districtAt, type WorldProp } from './domain';

const PROP_URL = new URL('../../public/assets/models/props.glb', import.meta.url).href;
const NAMES = ['tree_round', 'tree_pine', 'lamp', 'bench', 'bin', 'barrier', 'planter', 'street_sign', 'kiosk'] as const;
type Name = typeof NAMES[number];
export function sceneryModelFor(prop: WorldProp): Name | undefined {
  const district = districtAt(prop.x, prop.z).id;
  const choice: Partial<Record<WorldProp['kind'], Name>> = {
    tree: district === 'forest' ? (Math.floor(prop.x + prop.z) % 3 === 0 ? 'tree_round' : 'tree_pine') : 'tree_round',
    lamp: 'lamp', bench: 'bench', trash: 'bin', barricade: 'barrier',
    planter: 'planter', sign: 'street_sign', stall: 'kiosk',
  };
  return choice[prop.kind];
}

export function sceneryFit(prop: WorldProp, size: T.Vector3) {
  const sy = prop.h / size.y;
  // Tree crowns and lamp arms extend beyond their ground collision footprint.
  const natural = prop.kind === 'lamp' || prop.kind === 'sign';
  const sx = natural ? sy : (prop.kind === 'tree' ? Math.max(prop.w, prop.h * .48) : prop.w) / size.x;
  const sz = natural ? sy : (prop.kind === 'tree' ? Math.max(prop.d, prop.h * .48) : prop.d) / size.z;
  const yaw = prop.kind === 'tree' ? (prop.x * .19 + prop.z * .11) % (2 * Math.PI) : prop.yaw ?? 0;
  return { sx, sy, sz, yaw };
}

type AssetPart = { geometry: T.BufferGeometry; glow: boolean };
type Asset = { parts: AssetPart[]; size: T.Vector3 };
export type SceneryPart = AssetPart & { sx: number; sy: number; sz: number; yaw: number };

export class Scenery {
  private readonly assets = new Map<Name, Asset>();
  private disposed = false;

  async load(): Promise<boolean> {
    try {
      const gltf = await new GLTFLoader().loadAsync(PROP_URL);
      const sourceGeometries = new Set<T.BufferGeometry>(), sourceMaterials = new Set<T.Material>();
      gltf.scene.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        sourceGeometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) sourceMaterials.add(m);
      });
      try {
        if (this.disposed) return false;
        for (const name of NAMES) {
          const node = gltf.scene.getObjectByName(name);
          if (!node) continue;
          const baked = bake(node);
          const parts: AssetPart[] = [];
          for (const key of ['fixed', 'team', 'skin', 'glow'] as const) {
            const geometry = baked[key];
            if (!geometry) continue;
            // bake returns root-local coordinates; restore the glTF node's axes.
            geometry.applyMatrix4(node.matrixWorld);
            geometry.rotateY(-Math.PI / 2);
            geometry.computeBoundingBox();
            parts.push({ geometry, glow: key === 'glow' });
          }
          const bounds = new T.Box3();
          for (const part of parts) if (part.geometry.boundingBox) bounds.union(part.geometry.boundingBox);
          const size = bounds.getSize(new T.Vector3());
          if (!parts.length || !Number.isFinite(size.x + size.y + size.z) || Math.min(size.x, size.y, size.z) < .001) {
            for (const part of parts) part.geometry.dispose();
            continue;
          }
          const center = bounds.getCenter(new T.Vector3());
          for (const part of parts) {
            part.geometry.translate(-center.x, -bounds.min.y, -center.z);
            part.geometry.computeBoundingSphere();
          }
          this.assets.set(name, { parts, size });
        }
        return this.assets.size > 0;
      } finally {
        for (const g of sourceGeometries) g.dispose();
        for (const m of sourceMaterials) m.dispose();
      }
    } catch {
      this.disposeAssets();
      return false;
    }
  }

  parts(prop: WorldProp): SceneryPart[] | null {
    const name = sceneryModelFor(prop);
    const asset = name && this.assets.get(name);
    if (!asset) return null;
    const { size } = asset;
    const fit = sceneryFit(prop, size);
    return asset.parts.map(part => ({ ...part, ...fit }));
  }

  private disposeAssets(): void {
    for (const asset of this.assets.values()) for (const part of asset.parts) part.geometry.dispose();
    this.assets.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.disposeAssets();
  }
}
