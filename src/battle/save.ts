import {
  createWar, MAP_HALF_SIZE, MAX_UNITS, UNIT_STATS,
  type EconomyPolicy, type Faction, type Outpost, type Unit, type War, type WarEvent,
} from './war';

export const WAR_SAVE_KEY='team-waldo-3d-war-v1';
const VERSION=1;
const isRecord=(x:unknown):x is Record<string,unknown> =>
  typeof x==='object'&&x!==null&&!Array.isArray(x);
const finite=(x:unknown,min=-Infinity,max=Infinity):x is number =>
  typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const integer=(x:unknown,min:number,max:number):x is number =>
  finite(x,min,max)&&Number.isInteger(x);
const factionId=(x:unknown):x is number|null=>x===null||integer(x,0,3);
const policy=(x:unknown):x is EconomyPolicy=>
  x==='balanced'||x==='growth'||x==='war';

function validFaction(candidate:unknown,reference:Faction):candidate is Faction {
 if(!isRecord(candidate))return false;
 const f=candidate;
 return f.id===reference.id&&f.x===reference.x&&f.z===reference.z&&
  integer(f.farm,1,4)&&integer(f.mine,1,4)&&
  integer(f.barracks,1,4)&&integer(f.fort,1,4)&&
  finite(f.maxHp,400,700)&&f.maxHp===400+(Number(f.fort)-1)*100&&
  finite(f.hp,0,Number(f.maxHp))&&finite(f.gold,0,1e9)&&finite(f.food,0,1e9)&&
  typeof f.alive==='boolean'&&factionId(f.target)&&
  (f.rally===null||integer(f.rally,0,8))&&
  (f.target===null||f.target!==f.id)&&
  (f.target===null||f.rally===null)&&
  integer(f.reserve,0,6)&&policy(f.policy)&&
  finite(f.aiTimer,-1,100000)&&finite(f.turretCooldown,0,100);
}
function validOutpost(candidate:unknown,reference:Outpost):candidate is Outpost {
 if(!isRecord(candidate))return false;
 const p=candidate;
 return p.id===reference.id&&p.x===reference.x&&p.z===reference.z&&
  factionId(p.owner)&&factionId(p.contender)&&finite(p.progress,0,100);
}
function validUnit(candidate:unknown,maxId:number):candidate is Unit {
 if(!isRecord(candidate))return false;
 const u=candidate;
 if(!integer(u.id,1,maxId)||!integer(u.owner,0,3)||
    (u.kind!=='infantry'&&u.kind!=='archer'&&u.kind!=='guardian'))return false;
 return finite(u.x,-MAP_HALF_SIZE,MAP_HALF_SIZE)&&
  finite(u.z,-MAP_HALF_SIZE,MAP_HALF_SIZE)&&
  finite(u.hp,0,UNIT_STATS[u.kind].hp)&&finite(u.cooldown,0,10);
}
function validEvent(candidate:unknown):candidate is WarEvent{
 if(!isRecord(candidate))return false;
 return finite(candidate.time,0,86400)&&
  typeof candidate.text==='string'&&candidate.text.length<=90;
}
/** Reject malformed, mismatched and oversized localStorage data before rendering it. */
export function decodeWar(raw:string|null):War|null {
 if(!raw||raw.length>150000)return null;
 try{
  const parsed:unknown=JSON.parse(raw);
  if(!isRecord(parsed)||parsed.version!==VERSION||!isRecord(parsed.war))return null;
  const w=parsed.war,initial=createWar();
  if(!Array.isArray(w.factions)||w.factions.length!==4||
     !Array.isArray(w.outposts)||w.outposts.length!==initial.outposts.length||
     !Array.isArray(w.units)||w.units.length>MAX_UNITS*4||
     !Array.isArray(w.events)||w.events.length>8||
     !finite(w.time,0,86400)||!finite(w.zone,24,MAP_HALF_SIZE-6)||
     !integer(w.nextUnit,17,100000)||
     typeof w.over!=='boolean'||!factionId(w.winner))return null;
  if(!w.factions.every((f,i)=>validFaction(f,initial.factions[i])))return null;
  if(!w.outposts.every((p,i)=>validOutpost(p,initial.outposts[i])))return null;
  if(!w.events.every(validEvent))return null;
  const ids=new Set<number>();
  const counts=[0,0,0,0];
  for(const u of w.units){
   if(!validUnit(u,Number(w.nextUnit)-1)||ids.has(u.id))return null;
   ids.add(u.id);counts[u.owner]++;
   if(counts[u.owner]>MAX_UNITS)return null;
   if(!w.factions[u.owner].alive)return null;
  }
  if(w.over&&w.factions.filter(f=>f.alive).length>1)return null;
  return w as unknown as War;
 }catch{return null;}
}
export function encodeWar(w:War):string {
 return JSON.stringify({version:VERSION,war:w});
}
export function loadWar():War|null {
 try{return decodeWar(localStorage.getItem(WAR_SAVE_KEY));}catch{return null;}
}
export function saveWar(w:War):boolean {
 try{localStorage.setItem(WAR_SAVE_KEY,encodeWar(w));return true;}catch{return false;}
}
export function deleteWarSave():void {
 try{localStorage.removeItem(WAR_SAVE_KEY);}catch{ /* storage may be disabled */ }
}
