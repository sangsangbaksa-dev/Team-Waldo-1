import * as THREE from 'three';
type Disposable={dispose():void};
/** Dispose unique renderer-owned objects exactly once. Cached templates are retained. */
export function disposeRenderTrees(roots:readonly THREE.Object3D[],retain:(r:object)=>boolean=()=>false,extras:readonly Disposable[]=[]):void{
  const seen=new Set<object>();
  const once=(v:Disposable|null|undefined):void=>{if(!v||seen.has(v)||retain(v))return;seen.add(v);v.dispose();};
  const material=(m:THREE.Material):void=>{
    if(seen.has(m)||retain(m))return;
    // Includes non-color textures (normal/roughness/specular/alpha maps).
    for(const v of Object.values(m))if(v instanceof THREE.Texture)once(v);
    once(m);
  };
  for(const root of roots)root.traverse(o=>{
    const renderable=o as THREE.Mesh;
    if(renderable.geometry)once(renderable.geometry);
    if(o instanceof THREE.InstancedMesh)once(o);
    if(renderable.material)for(const m of Array.isArray(renderable.material)?renderable.material:[renderable.material])material(m);
  });
  for(const d of extras){if(d instanceof THREE.Material)material(d);else once(d);}
}
