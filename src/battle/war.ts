/** Deterministic, renderer-independent economy, territory and combat simulation. */
import { createBaseState, getBaseState, incomeGeneralBonus, workshopLevel } from './base';
import type { Difficulty, EconomyPolicy, Faction, Outpost, Research, UnitKind, Upgrade, War, WarStats } from './model';
import { CORNERS, OUTPOSTS, DIFFICULTIES, RESEARCH, NAMES, OUTPOST_BONUSES,
  MAP_HALF_SIZE, STORM_HQ_DAMAGE, UNIT_STATS, GRAND_INITIAL_FORCES, GRAND_MAX_UNITS,
  maxUnitsFor, stormStartFor } from './rules';
import { addEvent } from './events';
import { updateCombat } from './combat';
import { updateOutposts } from './territory';

// Keep existing consumers and saved-game code on the stable public API.
export type * from './model';
export { DIFFICULTIES, RESEARCH, NAMES, OUTPOST_NAMES, OUTPOST_BONUSES, MAP_HALF_SIZE,
  MAP_SIZE, STORM_START, stormStartFor, STORM_HQ_DAMAGE, UNIT_STATS, MAX_UNITS,
  GRAND_MAX_UNITS, GRAND_INITIAL_FORCES, maxUnitsFor } from './rules';
export { captureHeroPost } from './territory';

export function createWarStats():WarStats {
  return {trained:0,kills:0,lost:0,captures:0,goldEarned:0,foodEarned:0,damageDealt:0,researches:0,upgrades:0,peakArmy:4};
}
export function createWar(options:{difficulty?:Difficulty;grandBattle?:boolean}={}): War {
  const grandBattle=options.grandBattle===true;
  const difficulty=options.difficulty && Object.hasOwn(DIFFICULTIES,options.difficulty)?options.difficulty:'normal';
  const factions: Faction[] = CORNERS.map(([x,z],id) => ({
    id,x,z,hp:grandBattle?600:400,maxHp:grandBattle?600:400,
    gold:grandBattle?(id===0?8500:6500):140,food:grandBattle?(id===0?7500:6000):100,
    farm:grandBattle?3:1,mine:grandBattle?3:1,barracks:grandBattle?3:1,
    fort:grandBattle?3:1,alive:true,target:null,rally:null,
    reserve:id===0?0:grandBattle?12:2,policy:'balanced' as EconomyPolicy,
    research:{weapons:0,armor:0,logistics:0},
    aiTimer:(2.5+id*.6)*DIFFICULTIES[difficulty].aiInterval,turretCooldown:0,
  }));
  const outposts: Outpost[] = OUTPOSTS.map(([x,z],id) => ({
    id,x,z,owner:null,contender:null,progress:0,
  }));
  const war: War = {
    factions,units:[],outposts,events:[],time:0,zone:MAP_HALF_SIZE-6,over:false,winner:null,nextUnit:1,
    difficulty,stats:Array.from({length:4},createWarStats),squadOrders:[null,null,null],grandBattle,
    base:createBaseState(),
  };
  for(let id=0;id<4;id++){
    const total=grandBattle?GRAND_INITIAL_FORCES[id]:4;
    for(let i=0;i<total;i++){
      const kind:UnitKind=!grandBattle?'infantry':
        i%10===0?'guardian':i%10===1?'cavalry':i%4===0?'archer':'infantry';
      spawn(war,id,kind);
    }
  }
  getBaseState(war);
  return war;
}
function spawn(w: War, id: number, kind: UnitKind): void {
  const f=w.factions[id], n=w.nextUnit++;
  const index=w.grandBattle?w.units.reduce((total,u)=>total+(u.owner===id?1:0),0):0;
  const x=w.grandBattle?f.x+(index%16-7.5)*2.8:f.x+((n*3)%5-2)*1.6;
  const z=w.grandBattle?f.z+(f.z<0?1:-1)*(20+Math.floor(index/16)*3.1):f.z+4+(n%4)*1.8;
  w.units.push({id:n,owner:id,kind,x,z,hp:UNIT_STATS[kind].hp,cooldown:0,squad:0});
  w.stats[id].peakArmy=Math.max(w.stats[id].peakArmy,count(w,id));
}
/** One source of truth for economy previews, AI difficulty and the simulation. */
export function getIncome(w:War,id:number):{gold:number;food:number} {
  const f=w.factions[id];
  if(!f?.alive)return {gold:0,food:0};
  const owned=w.outposts.filter(p=>p.owner===id);
  const policy=f.policy==='growth'?1.25:f.policy==='war'?.88:1;
  const multiplier=policy*(1+f.research.logistics*.06)*(1+incomeGeneralBonus(w,id))*(id===0?(w.difficulty==='easy'?1.35:1):DIFFICULTIES[w.difficulty].aiIncome);
  return {
    gold:owned.reduce((a,p)=>a+OUTPOST_BONUSES[p.id].gold,f.mine*1.5+(id===0?workshopLevel(w,'mine')*.8:0))*multiplier,
    food:owned.reduce((a,p)=>a+OUTPOST_BONUSES[p.id].food,f.farm*1.3+(id===0?workshopLevel(w,'farm')*.75:0))*multiplier,
  };
}
/** Captured supply points protect immobile HQs: 12% each, up to 60%. */
export function stormDamage(w:War,id:number):number {
  const f=w.factions[id];
  if(!f?.alive||distance(f.x,f.z,0,0)<=w.zone)return 0;
  return STORM_HQ_DAMAGE*(1-Math.min(5,w.outposts.filter(p=>p.owner===id).length)*.12);
}
export function researchCost(f:Faction,key:Research):{gold:number;food:number} {
  const definition=RESEARCH[key],level=f.research[key]+1;
  return {gold:definition.gold*level,food:definition.food*level};
}
export function research(w:War,id:number,key:Research):boolean {
  const f=w.factions[id];
  if(!f?.alive||w.over||!Object.hasOwn(RESEARCH,key))return false;
  const definition=RESEARCH[key];
  if(f.research[key]>=definition.maxLevel||f.barracks<definition.requiredBarracks)return false;
  const price=researchCost(f,key);
  if(f.gold<price.gold||f.food<price.food)return false;
  f.gold-=price.gold;f.food-=price.food;f.research[key]++;w.stats[id].researches++;
  addEvent(w,`${NAMES[id]} 세력 ${definition.label} ${f.research[key]}단계 연구`);
  return true;
}
/** Restore a damaged stronghold using the shared economy. */
export function repair(w:War,id:number):boolean {
 const f=w.factions[id];
 if(!f?.alive||w.over||f.hp>=f.maxHp-1||f.gold<45||f.food<25)return false;
 f.gold-=45;f.food-=25;f.hp=Math.min(f.maxHp,f.hp+100);return true;
}
/** Train a small squad atomically; never charge for units that cannot spawn. */
export function trainSquad(w:War,id:number,kind:UnitKind='infantry',amount=3):boolean {
 const f=w.factions[id],unit=UNIT_STATS[kind];
 if(!f?.alive||w.over||!Object.hasOwn(UNIT_STATS,kind)||!Number.isInteger(amount)||amount<1||
   amount>(w.grandBattle?50:5)||f.barracks<unit.unlock||count(w,id)+amount>maxUnitsFor(w)||
   f.gold<unit.gold*amount||f.food<unit.food*amount)return false;
 for(let i=0;i<amount;i++)train(w,id,kind);
 return true;
}
/** Keep a defensive detachment at home during offensive orders. */
export function setReserve(w:War,id:number,amount:number):boolean {
 const f=w.factions[id];
 if(!f?.alive||w.over||!Number.isInteger(amount)||amount<0||amount>(w.grandBattle?60:6))return false;
 f.reserve=amount;return true;
}
export function setPolicy(w:War,id:number,policy:EconomyPolicy):boolean {
 const f=w.factions[id];
 if(!f?.alive||w.over||!(['balanced','growth','war'] as string[]).includes(policy))return false;
 f.policy=policy;return true;
}
export function cost(f: Faction,k: Upgrade): {gold:number;food:number} {
  const lv=f[k]; return { gold:Math.round((k==='fort'?80:60)*lv),food:(k==='fort'?30:20)*lv };
}
export function upgrade(w: War,id: number,k: Upgrade): boolean {
  const f=w.factions[id];
  if (!f?.alive||w.over||!(['farm','mine','barracks','fort'] as string[]).includes(k)||f[k]>=4) return false;
  const c=cost(f,k); if (f.gold<c.gold||f.food<c.food) return false;
  f.gold-=c.gold;f.food-=c.food;f[k]++;w.stats[id].upgrades++;
  if (k==='fort') { f.maxHp+=100;f.hp=Math.min(f.maxHp,f.hp+100); }
  if(id===0)getBaseState(w);
  return true;
}
export function train(w: War,id: number,kind: UnitKind='infantry'): boolean {
  const f=w.factions[id],s=UNIT_STATS[kind];
  if (!f?.alive||w.over||!Object.hasOwn(UNIT_STATS,kind)||f.barracks<s.unlock||f.gold<s.gold||
      f.food<s.food||count(w,id)>=maxUnitsFor(w)) return false;
  f.gold-=s.gold;f.food-=s.food;spawn(w,id,kind);w.stats[id].trained++;return true;
}
export function order(w: War,id: number,target: number|null): boolean {
  const f=w.factions[id];
  if (!f?.alive||w.over||(target!==null&&(!Number.isInteger(target)||target===id||!w.factions[target]?.alive))) return false;
  f.target=target;f.rally=null;if(id===0&&w.squadOrders)w.squadOrders[0]=null;return true;
}
export function captureOrder(w: War,id: number,postId: number): boolean {
  const f=w.factions[id];
  if (!f?.alive||w.over||!Number.isInteger(postId)||!w.outposts[postId]) return false;
  f.target=null;f.rally=postId;if(id===0&&w.squadOrders)w.squadOrders[0]=null;return true;
}
function distance(ax:number,az:number,bx:number,bz:number):number {
  return Math.hypot(ax-bx,az-bz);
}
function nearestEnemy(w: War,f: Faction): Faction|undefined {
  let nearest: Faction | undefined, range = Infinity;
  for (const enemy of w.factions) {
    if (!enemy.alive || enemy.id === f.id) continue;
    const d = distance(enemy.x,enemy.z,f.x,f.z);
    if (d < range) { nearest = enemy; range = d; }
  }
  return nearest;
}
function count(w: War,id: number): number {
  let total = 0;
  for (const unit of w.units) if (unit.owner === id && unit.hp > 0) total++;
  return total;
}
function aiTurn(w: War,f: Faction): void {
  const army=count(w,f.id),owned=w.outposts.filter(p=>p.owner===f.id).length;
  f.policy=army<8&&w.time<160?'growth':(army>=11||w.time>220)?'war':'balanced';
  f.reserve=w.grandBattle?Math.min(24,Math.floor(army/12)):army>10?2:Math.min(2,Math.floor(army/3));
  // Repair before purchasing when the HQ is critically damaged.
  if (f.hp<f.maxHp*.35&&repair(w,f.id)) { /* immediate survival */ }
  else if (army<6&&train(w,f.id,'infantry')) { /* early defense */ }
  else if (f.mine<3&&f.gold<140&&upgrade(w,f.id,'mine')) { /* cash flow */ }
  else if (f.farm<3&&f.food<115&&upgrade(w,f.id,'farm')) { /* supplies */ }
  else if (f.barracks<3&&w.time>36&&upgrade(w,f.id,'barracks')) { /* unlock units and research */ }
  else if (army>=8&&f.barracks>=2&&f.research.logistics<1&&research(w,f.id,'logistics')) { /* field supplies */ }
  else if (army>=12&&f.research.weapons<2&&research(w,f.id,'weapons')) { /* attack specialization */ }
  else if (army>=12&&f.research.armor<1&&research(w,f.id,'armor')) { /* sustain troops */ }
  else if (army<(w.grandBattle?GRAND_MAX_UNITS-10:16)&&
    (w.grandBattle?trainSquad(w,f.id,
      f.barracks>=3&&army%5===0?'cavalry':f.barracks>=2&&army%3===0?'archer':'infantry',10):
      train(w,f.id,f.barracks>=3&&army%5===0?'cavalry':f.barracks>=3&&army%4===0?'guardian':f.barracks>=2&&army%3===0?'archer':'infantry'))) { /* recruit */ }
  else if (f.hp<f.maxHp*.65&&repair(w,f.id)) { /* emergency repairs */ }
  else if (f.fort<3&&f.hp<f.maxHp*.85) upgrade(w,f.id,'fort');
  const free=w.outposts.filter(p=>p.owner!==f.id);
  free.sort((a,b)=>distance(a.x,a.z,f.x,f.z)-distance(b.x,b.z,f.x,f.z));
  // Stage early AI armies around objectives before committing to HQ sieges.
  const canSiege=w.time>=DIFFICULTIES[w.difficulty].aiAttackAfter;
  if (army>=9&&canSiege&&(w.time>180||owned>=3)) {
    const target=nearestEnemy(w,f);
    if (target) { f.target=target.id;f.rally=null; }
  } else if (free.length) {
    f.target=null;f.rally=free[0].id;
  } else if (army>=8&&canSiege) {
    f.target=nearestEnemy(w,f)?.id??null;f.rally=null;
  } else if (!canSiege) {
    f.target=null;f.rally=null;
  }
}
export function stepWar(w: War,dt: number):void {
  if (w.over||!Number.isFinite(dt)||dt<=0) return;
  dt=Math.min(dt,.1); w.time+=dt;
  w.zone=Math.max(24,MAP_HALF_SIZE-6-Math.max(0,w.time-stormStartFor(w))*.48);
  for (const f of w.factions) {
    if (!f.alive) continue;
    const income=getIncome(w,f.id);
    f.gold+=income.gold*dt;f.food+=income.food*dt;
    w.stats[f.id].goldEarned+=income.gold*dt;w.stats[f.id].foodEarned+=income.food*dt;
    f.hp-=stormDamage(w,f.id)*dt;
    f.turretCooldown=Math.max(0,f.turretCooldown-dt);
    if (f.id>0&&f.hp>0) {
      f.aiTimer-=dt;
      if (f.aiTimer<=0) {f.aiTimer=(3+f.id*.35)*DIFFICULTIES[w.difficulty].aiInterval;aiTurn(w,f);}
    }
  }
  updateCombat(w,dt);
  updateOutposts(w,dt);
  for (const f of w.factions) {
    if (f.alive&&f.hp<=0) {f.hp=0;f.alive=false;f.target=null;f.rally=null;
      addEvent(w,`${NAMES[f.id]} 세력 본부 함락`);
    }
  }
  for(const u of w.units){if(u.hp<=0||!w.factions[u.owner].alive)w.stats[u.owner].lost++;}
  w.units=w.units.filter(u=>u.hp>0&&w.factions[u.owner].alive);
  for(const f of w.factions){if(f.target!==null&&!w.factions[f.target].alive)f.target=null;}
  if(w.squadOrders)for(let i=0;i<w.squadOrders.length;i++){
    const command=w.squadOrders[i];
    if(command?.kind==='faction'&&!w.factions[command.id]?.alive)w.squadOrders[i]=null;
  }
  for (const p of w.outposts) {
    if (p.owner!==null&&!w.factions[p.owner].alive) p.owner=null;
    if (p.contender!==null&&!w.factions[p.contender].alive) {p.contender=null;p.progress=0;}
  }
  const survivors=w.factions.filter(f=>f.alive);
  if (survivors.length<=1) {w.over=true;w.winner=survivors[0]?.id??null;}
}
