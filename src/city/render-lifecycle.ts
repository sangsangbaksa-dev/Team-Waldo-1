import * as THREE from 'three';
import {disposeRenderTrees} from '../shared/scene-disposal';
import {isSharedModelResource} from './models';

/** Render-only ownership ledger: never release cached GLB or shared procedural resources early. */
export class CityRenderLifetime {
  private readonly retained=new WeakSet<object>();
  retain<T extends object>(resource:T):T{this.retained.add(resource);return resource;}
  remove(parent:THREE.Object3D,group:THREE.Object3D):void{
    parent.remove(group);
    disposeRenderTrees([group],r=>this.retained.has(r)||isSharedModelResource(r));
  }
}
