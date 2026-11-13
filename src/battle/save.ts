import {
  createWar, createWarStats, DIFFICULTIES, GRAND_MAX_UNITS, UNIT_STATS,
  type Difficulty, type EconomyPolicy, type Faction, type Outpost, type Unit, type War, type WarEvent, type WarStats,
} from './war';
import { getBaseState, validBaseState } from './base';
import { getMap, isMapId } from './maps';
import { createOperationsState, validOperationsState } from './operations';

// Retain the original key so an upgrade can discover and migrate v1 saves.
export const WAR_SAVE_KEY='team-waldo-3d-war-v1';
const VERSION=4;
const isRecord=(x:unknown):x is Record<string,unknown> =>
  typeof x==='object'&&x!==null&&!Array.isArray(x);
const finite=(x:unknown,min=-Infinity,max=Infinity):x is number =>
  typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const integer=(x:unknown,min:number,max:number):x is number =>
  finite(x,min,max)&&Number.isInteger(x);
const factionId=(x:unknown):x is number|null=>x===null||integer(x,0,3);
const policy=(x:unknown):x is EconomyPolicy=>
  x==='balanced'||x==='growth'||x==='war';
const difficulty=(x:unknown):x is Difficulty=>
  typeof x==='string'&&Object.hasOwn(DIFFICULTIES,x);

function validFaction(candidate:unknown,reference:Faction,reserveLimit=6,postCount=9):candidate is Faction {
 if(!isRecord(candidate))return false;
 const f=candidate;
 return f.id===reference.id&&f.x===reference.x&&f.z===reference.z&&
  integer(f.farm,1,4)&&integer(f.mine,1,4)&&
  integer(f.barracks,1,4)&&integer(f.fort,1,4)&&
  finite(f.maxHp,400,700)&&f.maxHp===400+(Number(f.fort)-1)*100&&
  finite(f.hp,0,Number(f.maxHp))&&finite(f.gold,0,1e9)&&finite(f.food,0,1e9)&&
  typeof f.alive==='boolean'&&f.alive===(Number(f.hp)>0)&&factionId(f.target)&&
  (f.rally===null||integer(f.rally,0,postCount-1))&&
  (f.target===null||f.target!==f.id)&&
  (f.target===null||f.rally===null)&&
  (f.alive||(f.target===null&&f.rally===null))&&
  integer(f.reserve,0,reserveLimit)&&policy(f.policy)&&
  isRecord(f.research)&&integer(f.research.weapons,0,3)&&
  integer(f.research.armor,0,3)&&integer(f.research.logistics,0,3)&&
  (Number(f.barracks)>=2||Object.values(f.research).every(value=>value===0))&&
  finite(f.aiTimer,-1,100000)&&finite(f.turretCooldown,0,100);
}
function validOutpost(candidate:unknown,reference:Outpost):candidate is Outpost {
 if(!isRecord(candidate))return false;
 const p=candidate;
 return p.id===reference.id&&p.x===reference.x&&p.z===reference.z&&
  factionId(p.owner)&&factionId(p.contender)&&finite(p.progress,0,100)&&
  (p.contender!==null||p.progress===0);
}
function validUnit(candidate:unknown,maxId:number,halfSize:number):candidate is Unit {
 if(!isRecord(candidate))return false;
 const u=candidate;
 if(!integer(u.id,1,maxId)||!integer(u.owner,0,3)||
    (u.kind!=='infantry'&&u.kind!=='archer'&&u.kind!=='guardian'&&u.kind!=='cavalry'))return false;
 return finite(u.x,-halfSize,halfSize)&&
  finite(u.z,-halfSize,halfSize)&&
  finite(u.hp,Number.MIN_VALUE,UNIT_STATS[u.kind].hp)&&finite(u.cooldown,0,10)&&
  (u.squad===undefined||integer(u.squad,0,2));
}
function validSquadOrder(value: unknown, w: Record<string,unknown>,halfSize:number,postCount:number): boolean {
  if(value===null)return true;
  if(!isRecord(value)||typeof value.kind!=='string')return false;
  if(value.kind==='home')return true;
  if(value.kind==='move')return finite(value.x,-halfSize+5,halfSize-5)&&
      finite(value.z,-halfSize+5,halfSize-5);
  if(value.kind==='outpost')return integer(value.id,0,postCount-1);
  if(value.kind==='faction')return integer(value.id,1,3)&&
    Array.isArray(w.factions)&&isRecord(w.factions[value.id])&&w.factions[value.id].alive===true;
  return false;
}
function validEvent(candidate:unknown,time:number):candidate is WarEvent{
 if(!isRecord(candidate))return false;
 return finite(candidate.time,0,time)&&typeof candidate.text==='string'&&
  candidate.text.length<=90&&!/[<>\u0000-\u001f\u007f]/u.test(candidate.text);
}
function validStats(candidate:unknown):candidate is WarStats {
 if(!isRecord(candidate))return false;
 return ['trained','kills','lost','captures','researches','upgrades'].every(key=>integer(candidate[key],0,1e7))&&
  ['goldEarned','foodEarned','damageDealt'].every(key=>finite(candidate[key],0,1e12))&&
  integer(candidate.peakArmy,0,GRAND_MAX_UNITS);
}
/** Reject malformed and inconsistent localStorage data before it reaches the game. */
export function decodeWar(raw:string|null):War|null {
 if(!raw||raw.length>450000)return null;
 try{
  const parsed:unknown=JSON.parse(raw);
  if(!isRecord(parsed)||(parsed.version!==1&&parsed.version!==2&&parsed.version!==3&&parsed.version!==VERSION)||!isRecord(parsed.war))return null;
  const w=parsed.war,legacy=parsed.version===1;
  if(parsed.version!==VERSION){
   // Earlier save formats describe the original map only.
   if(w.mapId!==undefined&&w.mapId!=='classic')return null;
   w.mapId='classic';
   if(w.operations===undefined)w.operations=createOperationsState();
  }
  if(!isMapId(w.mapId))return null;
  const map=getMap(w.mapId),initial=createWar({mapId:w.mapId});
  if(w.grandBattle!==undefined&&typeof w.grandBattle!=='boolean')return null;
  const grand=w.grandBattle===true,limit=grand?GRAND_MAX_UNITS:map.normalArmyLimit;
  if(!Array.isArray(w.factions)||w.factions.length!==4||
     !Array.isArray(w.outposts)||w.outposts.length!==initial.outposts.length||
     !Array.isArray(w.units)||w.units.length>limit*4||
     !Array.isArray(w.events)||w.events.length>8||
     !finite(w.time,0,86400)||!finite(w.zone,24,map.halfSize-6)||
     !integer(w.nextUnit,17,100000)||
     typeof w.over!=='boolean'||!factionId(w.winner))return null;
  if(legacy){
   if(w.difficulty===undefined)w.difficulty='normal';
   if(w.stats===undefined)w.stats=Array.from({length:4},createWarStats);
   for(const f of w.factions){
    if(isRecord(f)&&f.research===undefined)f.research={weapons:0,armor:0,logistics:0};
   }
  }
  if(!difficulty(w.difficulty)||!Array.isArray(w.stats)||w.stats.length!==4||!w.stats.every(validStats))return null;
  if(w.stats.some((stats:WarStats)=>stats.peakArmy>limit))return null;
  if(w.squadOrders!==undefined&&(!Array.isArray(w.squadOrders)||w.squadOrders.length!==3||
     !w.squadOrders.every(value=>validSquadOrder(value,w,map.halfSize,map.outposts.length))))return null;
  if(!w.factions.every((f,i)=>validFaction(f,initial.factions[i],grand?60:Math.floor(limit/3),map.outposts.length)))return null;
  if(!w.outposts.every((p,i)=>validOutpost(p,initial.outposts[i])))return null;
  if(!w.events.every(event=>validEvent(event,Number(w.time))))return null;
  const ids=new Set<number>();
  const counts=[0,0,0,0];
  for(const u of w.units){
   if(!validUnit(u,Number(w.nextUnit)-1,map.halfSize)||ids.has(u.id))return null;
   ids.add(u.id);counts[u.owner]++;
   if(counts[u.owner]>limit||!w.factions[u.owner].alive)return null;
  }
  for(const f of w.factions){
   // v1 could leave a stale offensive order after the target's last unit died.
   if(f.target!==null&&!w.factions[f.target].alive){
    if(legacy)f.target=null;else return null;
   }
   if(legacy)w.stats[f.id].peakArmy=Math.max(w.stats[f.id].peakArmy,counts[f.id]);
   else if(w.stats[f.id].peakArmy<counts[f.id])return null;
  }
  for(const p of w.outposts){
   if(p.owner!==null&&!w.factions[p.owner].alive)return null;
   if(p.contender!==null&&!w.factions[p.contender].alive)return null;
  }
  // Version 1/2 had upgrades but no placeable base layout: migrate without losing progress.
  if((parsed.version===1||parsed.version===2)&&w.base===undefined)getBaseState(w as unknown as War);
  if(!validBaseState(w.base,w as unknown as War))return null;
  if(!validOperationsState(w.operations,w as unknown as War))return null;
  const survivors=w.factions.filter(f=>f.alive);
  if(w.over){
   if(survivors.length>1||w.winner!==(survivors[0]?.id??null))return null;
  }else if(w.winner!==null||survivors.length<=1)return null;
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
 try{
  const encoded=encodeWar(w);
  // Never overwrite a usable snapshot with a state that cannot be restored.
  if(!decodeWar(encoded))return false;
  localStorage.setItem(WAR_SAVE_KEY,encoded);return true;
 }catch{return false;}
}
export function deleteWarSave():void {
 try{localStorage.removeItem(WAR_SAVE_KEY);}catch{ /* storage may be disabled */ }
}
