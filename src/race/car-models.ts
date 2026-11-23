// SPEED RUSH — share parsed GLB templates between re-entries.
// Three.js scene instances still clone the meshes. A rejected network fetch
// must be retriable rather than caching a permanent placeholder.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class RetriableAssetCache<T> {
  private pending: Promise<T | null> | null = null;
  load(fetch: () => Promise<T>): Promise<T | null> {
    if (!this.pending) {
      this.pending = Promise.resolve().then(fetch).catch(() => {
        this.pending = null;
        return null;
      });
    }
    return this.pending;
  }
}

/** Never leave the setup screen blocked by a stalled asset request.
 * Late successful assets can still be used on the next race restart. */
export function withAssetDeadline<T>(request: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void request.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

const carAssets = new RetriableAssetCache<Record<string, THREE.Object3D>>();
/** Parse once per browser tab; local view instances own their own render
 * materials and borrow these templates' shared geometry, not their lifecycle.
 */
export function loadRaceCars(baseUrl: string): Promise<Record<string, THREE.Object3D> | null> {
  return carAssets.load(async () => {
    const gltf = await new GLTFLoader().loadAsync(`${baseUrl}assets/models/race.glb`);
    const found: Record<string, THREE.Object3D> = {};
    gltf.scene.traverse(obj => {
      if (obj.name === 'gt' || obj.name === 'wide' || obj.name === 'long') found[obj.name] = obj;
    });
    if (Object.keys(found).length === 0) throw new Error('SPEED RUSH car models missing');
    return found;
  });
}
