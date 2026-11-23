export interface PropCollider {
  x: number; z: number; rotation: number; halfWidth: number; halfDepth: number;
  visible?: boolean; root?: { visible: boolean };
}
export function circleHitsProp(x:number,z:number,radius:number,obstacle:PropCollider):boolean;
export function propClearance(x:number,z:number,oldX:number,oldZ:number,radius:number,obstacles:PropCollider[]):boolean;
