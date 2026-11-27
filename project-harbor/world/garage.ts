import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { terrainHeight } from './domain';
import type { Ride } from './traffic';

// Blender source: tools/blender/cars.py and world.py. The shared asset is
// read-only; Harbor does not change any models used by the other games.
const VEHICLE_URL = new URL('../../public/assets/models/vehicles.glb', import.meta.url).href;
const MODEL: Record<string, string> = {
  sedan: 'sedan', sport: 'sports', truck: 'truck', jeep: 'suv', police: 'police',
};
type Visual = { root: T.Group; fallback: T.Group; door: T.Group; model: T.Group | null };
export class CityGarage {
  private readonly groups = new Map<number, Visual>();
  private readonly paint = new Map<number, T.MeshStandardMaterial>();
  private readonly wheel = new T.MeshStandardMaterial({ color: 0x202124, roughness: .93 });
  private readonly glass = new T.MeshStandardMaterial({ color: 0x344c59, roughness: .24, metalness: .25 });
  private readonly metal = new T.MeshStandardMaterial({ color: 0x9aa1a4, roughness: .3, metalness: .78 });
  private readonly seat = new T.MeshStandardMaterial({ color: 0x25272a, roughness: .88 });
  private readonly wheelShape = new T.CylinderGeometry(1, 1, 1, 24);
  private readonly wheelHub = new T.CylinderGeometry(.62, .62, 1.1, 20);
  private readonly templates = new Map<string, T.Object3D>();
  private readonly ownedGeometry = new Set<T.BufferGeometry>();
  private readonly ownedMaterial = new Set<T.Material>();
  private disposed = false;

  constructor(private readonly scene: T.Scene) {
    void new GLTFLoader().loadAsync(VEHICLE_URL).then(gltf => {
      gltf.scene.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        this.ownedGeometry.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.ownedMaterial.add(m);
      });
      if (this.disposed) { this.releaseAssets(); return; }
      for (const name of Object.values(MODEL)) {
        const model = gltf.scene.getObjectByName(name);
        if (model) this.templates.set(name, model);
      }
    }).catch(() => { /* The independent fallback remains playable. */ });
  }

  sync(rides: readonly Ride[]) {
    const live = new Set<number>();
    for (const ride of rides) {
      if (Math.abs(ride.x) + Math.abs(ride.z) > 1e7) continue;
      live.add(ride.id);
      let visual = this.groups.get(ride.id);
      if (!visual) {
        visual = this.build(ride);
        this.groups.set(ride.id, visual);
        this.scene.add(visual.root);
      }
      if (!visual.model) {
        const template = this.templates.get(MODEL[ride.type] ?? '');
        if (template) {
          visual.model = this.model(template, ride);
          if (visual.model) visual.root.add(visual.model);
        }
      }
      const opening = Math.max(0, Math.min(1, ride.door ?? 0));
      visual.root.position.set(ride.x, terrainHeight(ride.x, ride.z) + .12, ride.z);
      visual.root.rotation.y = ride.yaw;
      visual.root.rotation.z = ride.type === 'bike' ? -ride.steer * Math.min(Math.hypot(ride.vx, ride.vz) * .018, .32) : 0;
      visual.fallback.visible = !visual.model;
      // Keep the independent door cue while boarding; the GLB body is fused.
      visual.door.rotation.y = -opening * .9;
      visual.door.visible = ride.type !== 'bike' && (!visual.model || opening > .015);
      if (visual.model) visual.model.visible = true;
    }
    for (const [id, visual] of this.groups) {
      if (live.has(id)) continue;
      visual.root.removeFromParent();
      this.release(visual);
      this.groups.delete(id);
    }
  }

  dispose() {
    this.disposed = true;
    for (const visual of this.groups.values()) {
      visual.root.removeFromParent();
      this.release(visual);
    }
    this.groups.clear();
    for (const material of this.paint.values()) material.dispose();
    this.paint.clear();
    this.wheelShape.dispose();
    this.wheelHub.dispose();
    for (const m of [this.wheel, this.glass, this.metal, this.seat]) m.dispose();
    this.releaseAssets();
  }

  private releaseAssets() {
    for (const g of this.ownedGeometry) g.dispose();
    for (const m of this.ownedMaterial) m.dispose();
    this.ownedGeometry.clear();
    this.ownedMaterial.clear();
    this.templates.clear();
  }

  private release(visual: Visual) {
    for (const group of [visual.fallback, visual.door]) group.traverse(o => {
      if (o instanceof T.Mesh && o.geometry !== this.wheelShape && o.geometry !== this.wheelHub) o.geometry.dispose();
    });
  }

  private material(color: number) {
    let material = this.paint.get(color);
    if (!material) {
      material = new T.MeshStandardMaterial({ color, roughness: .37, metalness: .38 });
      this.paint.set(color, material);
    }
    return material;
  }

  private model(template: T.Object3D, ride: Ride): T.Group | null {
    const clone = template.clone(true);
    const oriented = new T.Group();
    oriented.add(clone);
    // Blender +X forward -> Harbor +Z forward; glTF already converts Z-up to Y-up.
    oriented.rotation.y = -Math.PI / 2;
    oriented.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(oriented);
    const size = bounds.getSize(new T.Vector3());
    if (!Number.isFinite(size.x + size.y + size.z) || Math.min(size.x, size.y, size.z) < .01) return null;
    const center = bounds.getCenter(new T.Vector3());
    const root = new T.Group(), fit = new T.Group();
    root.add(fit);
    fit.add(oriented);
    oriented.position.set(-center.x, -bounds.min.y, -center.z);
    fit.scale.set(ride.spec.width / size.x, 1, ride.spec.length / size.z);
    clone.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      const swap = (m: T.Material) => m.name === 'Paint' ? this.material(ride.spec.color) : m;
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    return root;
  }

  private build(ride: Ride): Visual {
    const root = new T.Group(), fallback = new T.Group(), door = new T.Group();
    root.add(fallback, door);
    const { length: l, width: w, color } = ride.spec;
    const paint = this.material(color);
    const bike = ride.type === 'bike';
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, material: T.Material, parent = fallback) => {
      const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), material);
      m.position.set(x, y, z); parent.add(m); return m;
    };
    const tire = (x: number, z: number, r: number, width: number) => {
      const axle = new T.Group(); axle.position.set(x, r, z); axle.rotation.z = Math.PI / 2;
      const t = new T.Mesh(this.wheelShape, this.wheel); t.scale.set(r, width, r);
      const h = new T.Mesh(this.wheelHub, this.metal); h.scale.set(r, width, r);
      axle.add(t, h); fallback.add(axle);
    };
    if (bike) {
      const r = .34;
      for (const z of [-l * .33, l * .33]) tire(0, z, r, .17);
      const tank = new T.Mesh(new T.SphereGeometry(1, 20, 12), paint);
      tank.scale.set(.27, .24, .43); tank.position.set(0, .84, .25); fallback.add(tank);
      const seat = new T.Mesh(new T.SphereGeometry(1, 16, 10), this.seat);
      seat.scale.set(.23, .09, .43); seat.position.set(0, .87, -.38); fallback.add(seat);
      box(.39, .39, .48, 0, .48, .01, this.metal);
      for (const side of [-1, 1]) {
        const fork = box(.06, .78, .06, side * .12, .68, l * .28, this.metal);
        fork.rotation.x = -.26;
        box(.075, .08, .8, side * .23, .41, -.38, this.metal);
      }
      box(.64, .065, .065, 0, 1.16, .55, this.metal);
      const lamp = new T.Mesh(new T.SphereGeometry(1, 16, 10), this.glass);
      lamp.scale.set(.15, .12, .09); lamp.position.set(0, 1.01, .69); fallback.add(lamp);
    } else {
      const r = ride.type === 'truck' ? .47 : .34;
      box(w, .58, l, 0, r + .23, 0, paint);
      box(w * .79, .53, l * .45, 0, r + .78, -l * .06, this.glass);
      box(w * .82, .08, l * .43, 0, r + 1.08, -l * .06, paint);
      door.position.set(w * .5, r + .31, l * .12);
      box(.055, .49, l * .32, 0, 0, -l * .12, paint, door);
      for (const side of [-1, 1]) for (const axle of [-1, 1]) tire(side * w * .47, axle * l * .32, r, .24);
    }
    return { root, fallback, door, model: null };
  }
}
