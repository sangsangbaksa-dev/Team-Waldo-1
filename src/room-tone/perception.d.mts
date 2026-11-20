export interface PerceptionInput { distance:number; visible:boolean; facing:number; lightOn:boolean; running:boolean; crouched:boolean; moving:boolean; corridorDistance:number }
export function enemyPerception(input:PerceptionInput):{sight:boolean;heard:boolean};
export function cellDistance(distance:number|undefined,cellSize:number):number;
export function patrolGoal(reachable:number[],distances:ArrayLike<number>,anchor:number,start:number,avoid:number,random?:()=>number):number;
