export type Obstacle={x:number;z:number;ry:number;halfWidth:number;halfDepth:number;visible:boolean};
export function exitWall(map:string[],cell:number):[number,number]|null;
export function propBlocks(x:number,z:number,r:number,rootX:number,rootZ:number,rotation:number,halfWidth:number,halfDepth:number):boolean;
export function clearanceAllows(x:number,z:number,oldX:number,oldZ:number,r:number,obstacles:Obstacle[]):boolean;
