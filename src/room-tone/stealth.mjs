export const SPEED = Object.freeze({walk:2.65,sprint:4.45,patrol:1.48,investigate:2.62,chase:3.72});
// Deterministically distribute cover against walls, away from mission equipment.
export function chooseHideouts(level,reserved=[]){
 const w=level.w, blocked=new Set([level.start,level.exit,level.nest,...level.items,...reserved]);
 const dirs=[[1,0],[-1,0],[0,1],[0,-1]], candidates=[];
 for(const cell of level.reachable){
  if(blocked.has(cell))continue;
  const x=cell%w,z=Math.floor(cell/w),walls=dirs.filter(([dx,dz])=>level.map[z+dz]?.[x+dx]==="#");
  if(!walls.length||walls.length>=3)continue;
  const [dx,dz]=walls[(x*3+z*5)%walls.length]; candidates.push({cell,dx,dz});
 }
 const selected=[], distance=(a,b)=>Math.abs(a%w-b%w)+Math.abs(Math.floor(a/w)-Math.floor(b/w));
 const anchors=[level.start,level.nest];
 while(selected.length<Math.max(6,Math.floor(w/3))&&candidates.length){
  let best=-1,score=-1;
  for(let i=0;i<candidates.length;i++){const spread=Math.min(...anchors.map(a=>distance(a,candidates[i].cell)));if(spread>score){score=spread;best=i;}}
  if(best<0||score<3)break;
  const c=candidates.splice(best,1)[0];selected.push({...c,kind:["locker","desk","booth"][selected.length%3]});anchors.push(c.cell);
 }
 return selected;
}
export function senseThreat({distance,clear,facing,flashFacing,lightOn,lit,moving,running,noise,hidden}){
 if(!Number.isFinite(distance)||distance<0)return {visual:false,heard:false,noise:0};
 const strength=Math.max(0,Number.isFinite(noise)?noise:0,hidden?0:moving?(running?14.5:5.8):0);
 const heard=strength>0&&distance<strength*(clear?1:.34);
 const visual=!hidden&&clear&&(distance<1.35||(facing>.44&&distance<(lit?10.5:lightOn?7.6:3.1))||(lightOn&&flashFacing>.8&&distance<15));
 return {visual,heard,noise:strength};
}
export function hidingCheck(compromised,distance,previous,dt){
 return compromised&&distance<=1.45?Math.max(0,previous)+Math.max(0,dt):0;
}
