/** Shared terrain data: renderers and pathfinding use the same impassable footprint. */
export const WORLD_HALF = 520;
export const MOUNTAINS = [
 {x:-100,z:0,radius:42,height:65},{x:100,z:0,radius:42,height:65},
 {x:0,z:-100,radius:42,height:65},{x:0,z:100,radius:42,height:65},
 {x:-370,z:-160,radius:34,height:48},{x:370,z:160,radius:34,height:48},
 {x:-160,z:370,radius:34,height:48},{x:160,z:-370,radius:34,height:48},
 {x:-370,z:160,radius:30,height:52},{x:370,z:-160,radius:30,height:52},
 {x:160,z:370,radius:30,height:52},{x:-160,z:-370,radius:30,height:52},
] as const;
export function walkable(x:number,z:number,padding=2):boolean {
 return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=WORLD_HALF-5&&Math.abs(z)<=WORLD_HALF-5&&!MOUNTAINS.some(m=>Math.hypot(x-m.x,z-m.z)<m.radius+padding);
}
const CELL=20,N=Math.ceil(WORLD_HALF*2/CELL),CACHE_LIMIT=100;
const fields=new Map<number,Int16Array>();
const at=(x:number,z:number)=>[Math.max(0,Math.min(N-1,Math.floor((x+WORLD_HALF)/CELL))),Math.max(0,Math.min(N-1,Math.floor((z+WORLD_HALF)/CELL)))] as const;
const center=(n:number)=>-WORLD_HALF+(n+.5)*CELL;
const gridWalk=(x:number,z:number)=>x>=0&&z>=0&&x<N&&z<N&&walkable(center(x),center(z),5);
const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function clearLine(x:number,z:number,tx:number,tz:number):boolean{
 const steps=Math.ceil(Math.hypot(tx-x,tz-z)/6);
 for(let i=1;i<=steps;i++)if(!walkable(x+(tx-x)*i/steps,z+(tz-z)*i/steps))return false;
 return true;
}
function field(gx:number,gz:number):Int16Array{
 const key=gz*N+gx,existing=fields.get(key);if(existing)return existing;
 const result=new Int16Array(N*N).fill(-1),queue=new Int32Array(N*N);let head=0,tail=0;
 // Objectives are kept out of mountains, but a chased unit may stand at a grid edge.
 if(!gridWalk(gx,gz)){
  let found=false;
  for(let r=1;r<6&&!found;r++)for(let dx=-r;dx<=r&&!found;dx++)for(let dz=-r;dz<=r;dz++)if(gridWalk(gx+dx,gz+dz)){gx+=dx;gz+=dz;found=true;break;}
 }
 result[gz*N+gx]=0;queue[tail++]=gz*N+gx;
 while(head<tail){const p=queue[head++],x=p%N,z=Math.floor(p/N);
  for(const [dx,dz] of directions){const nx=x+dx,nz=z+dz,index=nz*N+nx;if(!gridWalk(nx,nz)||result[index]!==-1||!gridWalk(x+dx,z)||!gridWalk(x,z+dz))continue;result[index]=result[p]+1;queue[tail++]=index;}
 }
 if(fields.size>=CACHE_LIMIT)fields.delete(fields.keys().next().value!);fields.set(key,result);return result;
}
export function moveAcrossTerrain(x:number,z:number,tx:number,tz:number,step:number):{x:number;z:number}{
 if(!Number.isFinite(step)||step<=0)return{x,z};
 if(!clearLine(x,z,tx,tz)){
  const [gx,gz]=at(tx,tz),[cx,cz]=at(x,z),distances=field(gx,gz);let best=Infinity,bx=x,bz=z;
  for(const [dx,dz] of directions){const nx=cx+dx,nz=cz+dz;if(!gridWalk(nx,nz))continue;
   const d=distances[nz*N+nx];if(d<0||d>=best||!clearLine(x,z,center(nx),center(nz)))continue;
   best=d;bx=center(nx);bz=center(nz);
  }
  tx=bx;tz=bz;
 }
 const distance=Math.hypot(tx-x,tz-z);if(distance<.01)return{x,z};
 const amount=Math.min(step,distance),nx=x+(tx-x)/distance*amount,nz=z+(tz-z)/distance*amount;
 return walkable(nx,nz)?{x:nx,z:nz}:{x,z};
}
