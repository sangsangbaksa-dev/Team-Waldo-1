/** Pure real-time economy and combat simulation for the four-faction match. */
export type Upgrade = 'farm' | 'mine' | 'barracks' | 'fort';
export interface Faction { id:number; x:number; z:number; hp:number; maxHp:number; gold:number; food:number; farm:number; mine:number; barracks:number; fort:number; alive:boolean; target:number | null; aiTimer:number; }
export interface Unit { id:number; owner:number; x:number; z:number; hp:number; cooldown:number; }
export interface War { factions:Faction[]; units:Unit[]; time:number; zone:number; over:boolean; winner:number | null; nextUnit:number; }
export const NAMES=['나','적색','황색','보라'];
const CORNERS=[[-35,-35],[35,-35],[-35,35],[35,35]];
export function createWar():War {
 const factions= CORNERS.map(([x,z],id)=>({id,x,z,hp:400,maxHp:400,gold:140,food:100,farm:1,mine:1,barracks:1,fort:1,alive:true,target:null,aiTimer:4+id}));
 const w:War={factions,units:[],time:0,zone:68,over:false,winner:null,nextUnit:1};
 for(let id=0;id<4;id++)for(let i=0;i<4;i++) spawn(w,id);
 return w;
}
function spawn(w:War,id:number):void {const f=w.factions[id],n=w.nextUnit++; w.units.push({id:n,owner:id,x:f.x+(n%3-1)*2.5,z:f.z+4+Math.floor(n%4)*2,hp:45,cooldown:0});}
export function cost(f:Faction,k:Upgrade):{gold:number;food:number} {const lv=f[k];return {gold:Math.round((k==='fort'?80:60)*lv),food:k==='fort'?30*lv:20*lv};}
export function upgrade(w:War,id:number,k:Upgrade):boolean {const f=w.factions[id];if(!f?.alive||w.over||f[k]>=4)return false;const c=cost(f,k);if(f.gold<c.gold||f.food<c.food)return false;f.gold-=c.gold;f.food-=c.food;f[k]++;if(k==='fort'){f.maxHp+=100;f.hp=Math.min(f.maxHp,f.hp+100);}return true;}
export function train(w:War,id:number):boolean {const f=w.factions[id];if(!f?.alive||w.over||f.gold<25||f.food<20||w.units.filter(u=>u.owner===id).length>=15)return false;f.gold-=25;f.food-=20;spawn(w,id);return true;}
export function order(w:War,id:number,target:number|null):boolean {const f=w.factions[id];if(!f?.alive||w.over|| (target!==null && (target===id||!w.factions[target]?.alive)))return false;f.target=target;return true;}
function nearestEnemy(w:War,f:Faction):Faction|undefined{return w.factions.filter(e=>e.alive&&e.id!==f.id).sort((a,b)=>Math.hypot(a.x-f.x,a.z-f.z)-Math.hypot(b.x-f.x,b.z-f.z))[0];}
function go(u:Unit,x:number,z:number,dt:number):void {const dx=x-u.x,dz=z-u.z,d=Math.hypot(dx,dz);if(d>0.01){const n=Math.min(d,7*dt);u.x+=dx/d*n;u.z+=dz/d*n;}}
export function stepWar(w:War,dt:number):void {
 if(w.over||dt<=0)return;dt=Math.min(dt,.1);w.time+=dt;w.zone=Math.max(25,68-Math.max(0,w.time-90)*.22);
 for(const f of w.factions){if(!f.alive)continue;f.gold+=f.mine*1.5*dt;f.food+=f.farm*1.3*dt;
  if(Math.hypot(f.x,f.z)>w.zone) f.hp-=3*dt;
  if(f.id>0){f.aiTimer-=dt;if(f.aiTimer<=0){f.aiTimer=4;const count=w.units.filter(u=>u.owner===f.id).length;if(f.mine<3&&f.gold>100)upgrade(w,f.id,'mine');else if(f.farm<3&&f.food<100)upgrade(w,f.id,'farm');else if(f.barracks<3&&f.gold>120)upgrade(w,f.id,'barracks');else if(count<10)train(w,f.id);else if(f.fort<3)upgrade(w,f.id,'fort');if(count>=5||w.time>90)f.target=nearestEnemy(w,f)?.id??null;}}
 }
 for(const u of w.units){const f=w.factions[u.owner];if(!f.alive||u.hp<=0)continue;u.cooldown=Math.max(0,u.cooldown-dt);if(Math.hypot(u.x,u.z)>w.zone)u.hp-=1.5*dt;
  const enemies=w.units.filter(e=>e.owner!==u.owner&&e.hp>0&&w.factions[e.owner].alive);let enemy:Unit|undefined;let distance=Infinity;for(const e of enemies){const d=Math.hypot(e.x-u.x,e.z-u.z);if(d<distance){distance=d;enemy=e;}}
  if(enemy&&distance<9){if(u.cooldown===0){enemy.hp-=6+f.barracks*2;u.cooldown=.85;} if(distance>5)go(u,enemy.x,enemy.z,dt);}
  else {const target=f.target===null?undefined:w.factions[f.target];if(target?.alive){const d=Math.hypot(target.x-u.x,target.z-u.z);if(d>7)go(u,target.x,target.z,dt);else if(u.cooldown===0){target.hp-=5+f.barracks*2;u.cooldown=.85;}} else {f.target=null;const angle=u.id*2.4;const x=f.x+Math.cos(angle)*6,z=f.z+Math.sin(angle)*6;if(Math.hypot(x-u.x,z-u.z)>1)go(u,x,z,dt);}}
 }
 for(const f of w.factions) if(f.alive&&f.hp<=0){f.hp=0;f.alive=false;}
 w.units=w.units.filter(u=>u.hp>0&&w.factions[u.owner].alive);
 const alive=w.factions.filter(f=>f.alive);if(alive.length<=1){w.over=true;w.winner=alive[0]?.id??null;}
}
