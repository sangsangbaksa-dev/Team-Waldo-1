import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { terrainHeight } from './domain';
import type { Ride } from './traffic';
import { MotorcycleParts, type MotorcycleVisual } from './motorcycle';

// Blender source: tools/blender/cars.py and world.py. The shared asset is
// read-only; Harbor does not change any models used by the other games.
const VEHICLE_URL = new URL('../../public/assets/models/vehicles.glb', import.meta.url).href;
const RACE_URL = new URL('../../public/assets/models/race.glb', import.meta.url).href;
const SPORT_VARIANTS = ['gt', 'wide', 'long'] as const;
const MODEL: Record<string, string> = {
  sedan: 'sedan', sport: 'sports', truck: 'truck', jeep: 'suv', police: 'police',
};
type Visual = { root: T.Group; fallback: T.Group; door: T.Group; model: T.Group | null; modelName: string; paint: T.MeshStandardMaterial; bike: MotorcycleVisual | null; shadow: T.Mesh };
export class CityGarage {
  private readonly groups = new Map<number, Visual>();
  private readonly paint = new Map<number, T.MeshStandardMaterial>();
  private readonly wheel = new T.MeshStandardMaterial({ color: 0x202124, roughness: .93 });
  private readonly glass = new T.MeshStandardMaterial({ color: 0x344c59, roughness: .24, metalness: .25 });
  private readonly metal = new T.MeshStandardMaterial({ color: 0x9aa1a4, roughness: .3, metalness: .78 });
  private readonly wheelShape = new T.CylinderGeometry(1, 1, 1, 24);
  private readonly wheelHub = new T.CylinderGeometry(.62, .62, 1.1, 20);
  private readonly motorcycle = new MotorcycleParts();
  private readonly shadowShape = new T.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  private readonly shadowTexture = (() => {
    const size=32,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1);
      const i=(y*size+x)*4;
      data[i+3]=Math.round(Math.max(0,1-r*r)**2*150);
    }
    const texture=new T.DataTexture(data,size,size);texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
  })();
  private readonly shadowMaterial=new T.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  private readonly damageColor=new T.Color(0x373a38);
  private readonly templates = new Map<string, T.Object3D>();
  private readonly ownedGeometry = new Set<T.BufferGeometry>();
  private readonly ownedMaterial = new Set<T.Material>();
  private disposed = false;

  constructor(private readonly scene: T.Scene) {
    this.loadLibrary(VEHICLE_URL,Object.values(MODEL));
    this.loadLibrary(RACE_URL,SPORT_VARIANTS);
  }

  private loadLibrary(url:string,names:readonly string[]) {
    void new GLTFLoader().loadAsync(url).then(gltf => {
      gltf.scene.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        this.ownedGeometry.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.ownedMaterial.add(m);
      });
      if (this.disposed) { this.releaseAssets(); return; }
      for (const name of names) {
        const model = gltf.scene.getObjectByName(name);
        if (model) this.templates.set(name, model);
      }
    }).catch(() => { /* The independent fallback remains playable. */ });
  }

  sync(rides: readonly Ride[], dt = 0) {
    const live = new Set<number>();
    for (const ride of rides) {
      if (Math.abs(ride.x) + Math.abs(ride.z) > 1e7) continue;
      live.add(ride.id);
      let visual = this.groups.get(ride.id);
      if (!visual) {
        visual = this.build(ride);
        this.groups.set(ride.id, visual);
        this.scene.add(visual.root,visual.shadow);
      }
      const sportName=SPORT_VARIANTS[Math.abs(ride.id)%SPORT_VARIANTS.length]!;
      const name=ride.type==='sport'&&this.templates.has(sportName)?sportName:MODEL[ride.type]??'';
      if (name && visual.modelName!==name) {
        const template=this.templates.get(name);
        if(template){
          const model=this.model(template,ride,visual.paint);
          if(model){
            visual.model?.removeFromParent();
            visual.model=model;visual.modelName=name;visual.root.add(model);
          }
        }
      }
      visual.paint.color.setHex(ride.spec.color).lerp(this.damageColor,(1-T.MathUtils.clamp(ride.health/100,0,1))*.75);
      visual.paint.roughness=.37+(1-T.MathUtils.clamp(ride.health/100,0,1))*.4;
      if(visual.bike)this.motorcycle.update(visual.bike,ride,dt);
      visual.shadow.position.set(ride.x,terrainHeight(ride.x,ride.z)+.025,ride.z);
      visual.shadow.rotation.y=ride.yaw;
      visual.shadow.visible=true;
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
      visual.shadow.removeFromParent();
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
    for (const m of [this.wheel, this.glass, this.metal,this.shadowMaterial]) m.dispose();
    this.shadowShape.dispose();this.shadowTexture.dispose();this.motorcycle.dispose();
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
    visual.paint.dispose();
    if(visual.bike){visual.bike.brake.dispose();visual.bike.root.removeFromParent();}
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

  private model(template: T.Object3D, ride: Ride, paint:T.MeshStandardMaterial): T.Group | null {
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
      const swap = (m: T.Material) => m.name === 'Paint' ? paint : m;
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    return root;
  }

  private build(ride: Ride): Visual {
    const root = new T.Group(), fallback = new T.Group(), door = new T.Group();
    root.add(fallback, door);
    const { length: l, width: w, color } = ride.spec;
    const paint = this.material(color).clone();
    const bike = ride.type === 'bike';
    let motorcycle:MotorcycleVisual|null=null;
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
      motorcycle=this.motorcycle.create(paint);
      fallback.add(motorcycle.root);
    } else {
      const r = ride.type === 'truck' ? .47 : .34;
      box(w, .58, l, 0, r + .23, 0, paint);
      box(w * .79, .53, l * .45, 0, r + .78, -l * .06, this.glass);
      box(w * .82, .08, l * .43, 0, r + 1.08, -l * .06, paint);
      door.position.set(w * .5, r + .31, l * .12);
      box(.055, .49, l * .32, 0, 0, -l * .12, paint, door);
      for (const side of [-1, 1]) for (const axle of [-1, 1]) tire(side * w * .47, axle * l * .32, r, .24);
    }
    const shadow=new T.Mesh(this.shadowShape,this.shadowMaterial);
    shadow.scale.set(w*1.65,1,l*1.35);
    return { root, fallback, door, model: null, modelName:'',paint,bike:motorcycle,shadow };
  }
}
