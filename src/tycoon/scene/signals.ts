// Traffic phasing adapted from OUTLAW CITY's signal logic, scaled to HUSTLE's grid.
import * as THREE from 'three';
import { GRID, HALF, PITCH, ROAD } from './layout';
import { GeoBuilder } from './geo';

type Axis = 'x' | 'z';
export type SignalAspect = 'red' | 'yellow' | 'green';
export const ROAD_CENTERS = Array.from({ length: GRID + 1 }, (_, i) => i * PITCH - (HALF * PITCH + PITCH / 2));
const CYCLE = 24;
export function signalAspect(t: number, x: number, z: number, axis: Axis): SignalAspect {
  const offset = Math.round(x / PITCH + z / PITCH) * 3;
  const phase = ((t + offset) % CYCLE + CYCLE) % CYCLE;
  const local = axis === 'x' ? phase : (phase + CYCLE / 2) % CYCLE;
  return local < 8 ? 'green' : local < 10 ? 'yellow' : 'red';
}
/** Stop before the intersection; cars already inside finish crossing. */
export function intersectionFactor(t: number, axis: Axis, line: number, pos: number, dir: 1 | -1, length: number): number {
  const edge = ROAD / 2 + 1.35 + length / 2;
  for (const cross of ROAD_CENTERS) {
    const forward = (cross - pos) * dir, gap = forward - edge;
    if (gap < -.12 || gap > 15) continue;
    const x = axis === 'x' ? cross : line, z = axis === 'z' ? cross : line;
    if (signalAspect(t, x, z, axis) !== 'green') return Math.max(0, Math.min(1, (gap - .15) / 12));
  }
  return 1;
}
interface SignalHead { x: number; z: number; cx: number; cz: number; nx: number; nz: number; axis: Axis }
export class IntersectionLights {
  readonly group = new THREE.Group();
  private lamps: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private poles: THREE.Mesh;
  private heads: SignalHead[] = [];
  private last = -Infinity;
  private color = new THREE.Color();
  private disposed = false;
  constructor() {
    const g = new GeoBuilder();
    for (const x of ROAD_CENTERS.slice(1,-1)) for (const z of ROAD_CENTERS.slice(1,-1)) {
      for (const dir of [-1, 1]) {
        this.heads.push({ x: x - dir * 8.0, z: z + dir * 7.65, cx: x, cz: z, nx: -dir, nz: 0, axis: 'x' });
        this.heads.push({ x: x - dir * 7.65, z: z - dir * 8.0, cx: x, cz: z, nx: 0, nz: -dir, axis: 'z' });
      }
    }
    for (const h of this.heads) {
      g.solid(h.x, .18, h.z, .16, 3.75, .16, 0x687278);
      g.solid(h.x, .18, h.z, .39, .22, .39, 0x858783);
      g.solid(h.x, 3.1, h.z, h.nx ? .30 : .48, .92, h.nz ? .30 : .48, 0x212a2d);
      for (let k = 0; k < 3; k++) g.solid(h.x + h.nx * .14, 3.76 - k * .25, h.z + h.nz * .14, h.nx ? .28 : .40, .065, h.nz ? .28 : .40, 0x1a2125);
    }
    this.poles = new THREE.Mesh(g.build()!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .76, metalness: .2 }));
    this.group.add(this.poles);
    this.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(.105, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), this.heads.length * 3);
    const o = new THREE.Object3D();
    this.heads.forEach((h,i)=>{ for(let k=0;k<3;k++){
      o.position.set(h.x+h.nx*.205, 3.64-k*.25, h.z+h.nz*.205); o.updateMatrix(); this.lamps.setMatrixAt(i*3+k,o.matrix);
      this.lamps.setColorAt(i*3+k,this.color.setHex(0x131a1c));
    } });
    this.lamps.computeBoundingSphere(); this.group.add(this.lamps);
    this.update(0);
  }
  update(t: number): void {
    const tick = Math.floor(t * 4); if (tick === this.last || this.disposed) return; this.last = tick;
    const colors = [0xff4545,0xffd34a,0x4bf49c];
    this.heads.forEach((h,i)=> {
      const a = signalAspect(t,h.cx,h.cz,h.axis), on = a === 'red' ? 0 : a === 'yellow' ? 1 : 2;
      for(let k=0;k<3;k++) this.lamps.setColorAt(i*3+k,this.color.setHex(k===on?colors[k]:0x141c1f));
    });
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.group.removeFromParent(); this.lamps.dispose(); this.lamps.geometry.dispose(); this.lamps.material.dispose();
    this.poles.geometry.dispose(); (this.poles.material as THREE.Material).dispose(); this.group.clear();
  }
}
