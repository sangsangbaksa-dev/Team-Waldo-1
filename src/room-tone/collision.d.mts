export interface GridPosition {x:number; z:number;}
export function canOccupy(map:string[],tile:number,x:number,z:number,radius?:number):boolean;
export function moveWithCollision(map:string[],tile:number,position:GridPosition,dx:number,dz:number,radius?:number):void;
export function lineOfSight(map:string[],tile:number,a:GridPosition,b:GridPosition):boolean;
