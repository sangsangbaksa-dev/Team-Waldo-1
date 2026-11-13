/** Deterministic, renderer-independent economy, territory and combat simulation. */
import type { SquadCommand } from './squads';
import { createBaseState, getBaseState, generalBonus, incomeGeneralBonus, workshopLevel, type BaseState } from './base';
import { battlefieldCoverAt, resolveBattlefieldStep } from './battlefieldLayout';
export type Upgrade = 'farm' | 'mine' | 'barracks' | 'fort';
export type EconomyPolicy = 'balanced' | 'growth' | 'war';
export type UnitKind = 'infantry' | 'archer' | 'guardian' | 'cavalry';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Research = 'weapons' | 'armor' | 'logistics';
export interface Faction {
  id: number; x: number; z: number; hp: number; maxHp: number;
  gold: number; food: number; farm: number; mine: number; barracks: number; fort: number;
  alive: boolean; target: number | null; rally: number | null;
  reserve: number; policy: EconomyPolicy;
  research: Record<Research, number>;
  aiTimer: number; turretCooldown: number;
}
export interface Unit {
  id: number; owner: number; kind: UnitKind; x: number; z: number;
  hp: number; cooldown: number; squad?: 0 | 1 | 2;
}
export interface Outpost {
  id: number; x: number; z: number; owner: number | null;
  contender: number | null; progress: number;
}
export interface WarEvent { time: number; text: string; }
/** Starting troops and starting resources are not counted as purchases or income. */
export interface WarStats {
  trained: number; kills: number; lost: number; captures: number;
  goldEarned: number; foodEarned: number; damageDealt: number;
  researches: number; upgrades: number; peakArmy: number;
}
export interface War {
  factions: Faction[]; units: Unit[]; outposts: Outpost[]; events: WarEvent[];
  time: number; zone: number; over: boolean; winner: number | null; nextUnit: number;
  difficulty: Difficulty; stats: WarStats[];
  squadOrders?: [SquadCommand | null, SquadCommand | null, SquadCommand | null];
  /** Legacy small-match saves remain loadable; new menu campaigns are grand battles. */
  grandBattle?: boolean;
  /** Player's home-base layout and hired generals; legacy saves initialize on load. */
  base?: BaseState;
}
export const DIFFICULTIES: Record<Difficulty, {label:string;description:string;aiIncome:number;aiInterval:number;aiAttackAfter:number}> = {
  easy: {label:'입문',description:'아군 자원 +35% · AI 생산 45% 감소 · AI 본부 공세 260초 이후 · 폭풍 6분 이후',aiIncome:.55,aiInterval:1.7,aiAttackAfter:260},
  normal: {label:'보통',description:'같은 시작 자원 · 기본 AI 생산과 판단 속도 · AI 본부 공세는 105초 이후',aiIncome:1,aiInterval:1,aiAttackAfter:105},
  hard: {label:'도전',description:'AI 자원 생산 20% 증가 · 판단 간격 20% 감소 · AI 본부 공세 대기 없음',aiIncome:1.2,aiInterval:.8,aiAttackAfter:0},
};
export const RESEARCH: Record<Research, {label:string;description:string;maxLevel:number;requiredBarracks:number;gold:number;food:number}> = {
  weapons: {label:'강철 무기',description:'단계마다 병사 공격력 +12%',maxLevel:3,requiredBarracks:2,gold:80,food:50},
  armor: {label:'강화 갑옷',description:'단계마다 병사 전투 피해 8% 감소',maxLevel:3,requiredBarracks:2,gold:65,food:65},
  logistics: {label:'보급 체계',description:'단계마다 이동 속도 +8% · 자원 생산 +6%',maxLevel:3,requiredBarracks:2,gold:60,food:80},
};
export const NAMES = ['나', '적색', '황색', '보라'] as const;
export const OUTPOST_NAMES = ['북부 광산', '동부 시장', '남부 곡창', '서부 항구', '중앙 요새', '북서부 관문', '북동부 초소', '남서부 요새', '남동부 교역소'] as const;
/** Specialty income is added on top of mine and farm production. */
export const OUTPOST_BONUSES: ReadonlyArray<{gold:number;food:number}> = [
  {gold:3.1,food:.3}, {gold:2.5,food:1.6}, {gold:.3,food:3.4},
  {gold:2.1,food:2.1}, {gold:1.15,food:.9}, {gold:1.1,food:1.7},
  {gold:1.8,food:.8}, {gold:.7,food:2.3}, {gold:2.4,food:1.2},
];
export const MAP_HALF_SIZE = 260;
export const MAP_SIZE = MAP_HALF_SIZE * 2;
export const STORM_START = 130;
export const stormStartFor = (w: War) => w.grandBattle ? (w.difficulty === 'easy' ? 360 : 270) : w.difficulty === 'easy' ? 180 : STORM_START;
export const STORM_HQ_DAMAGE = 3.5;
const CORNERS = [[-112,-112],[112,-112],[-112,112],[112,112]] as const;
const OUTPOSTS = [[0,-95],[95,0],[0,95],[-95,0],[0,0],[-62,-62],[62,-62],[-62,62],[62,62]] as const;
export const UNIT_STATS: Record<UnitKind, {
  label: string; gold: number; food: number; hp: number;
  damage: number; range: number; speed: number; cooldown: number; unlock: number;
}> = {
  infantry: { label: '보병', gold: 25, food: 20, hp: 52, damage: 8, range: 3.5, speed: 8.4, cooldown: .9, unlock: 1 },
  archer: { label: '궁병', gold: 45, food: 30, hp: 36, damage: 7, range: 15, speed: 7, cooldown: 1.2, unlock: 2 },
  guardian: { label: '중장병', gold: 75, food: 45, hp: 125, damage: 14, range: 4, speed: 5.5, cooldown: 1.45, unlock: 3 },
  cavalry: { label: '기병', gold: 65, food: 55, hp: 82, damage: 12, range: 4, speed: 13.5, cooldown: .95, unlock: 3 },
};
export const MAX_UNITS = 18;
export const GRAND_MAX_UNITS = 400;
/** Rival expansion caps preserve the 100 vs 500 opening while making easy sustainable. */
export const GRAND_AI_ARMY_LIMITS: Record<Difficulty, number> = {easy:225,normal:300,hard:400};
export const GRAND_INITIAL_FORCES = [100, 167, 167, 166] as const;
export const maxUnitsFor = (w: War) => w.grandBattle ? GRAND_MAX_UNITS : MAX_UNITS;
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
 const f=w.factions[id];
 if(!f?.alive||w.over||!Object.hasOwn(UNIT_STATS,kind))return false;
 const unit=UNIT_STATS[kind];
 if(!Number.isInteger(amount)||amount<1||
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
function addEvent(w:War,text:string):void {
 w.events.unshift({time:Math.floor(w.time),text});
 if(w.events.length>8)w.events.length=8;
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
  const f=w.factions[id];
  if (!f?.alive||w.over||!Object.hasOwn(UNIT_STATS,kind))return false;
  const s=UNIT_STATS[kind];
  if (f.barracks<s.unlock||f.gold<s.gold||
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
  return w.factions.filter(e=>e.alive&&e.id!==f.id)
    .sort((a,b)=>distance(a.x,a.z,f.x,f.z)-distance(b.x,b.z,f.x,f.z))[0];
}
function count(w: War,id: number): number {
  return w.units.filter(u=>u.owner===id&&u.hp>0).length;
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
  else if (army<(w.grandBattle?GRAND_AI_ARMY_LIMITS[w.difficulty]:16)&&
    (w.grandBattle?trainSquad(w,f.id,
      f.barracks>=3&&army%5===0?'cavalry':f.barracks>=2&&army%3===0?'archer':'infantry',
      Math.min(10,GRAND_AI_ARMY_LIMITS[w.difficulty]-army)):
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
function moveToward(w:War,u:Unit,x:number,z:number,dt:number):void {
  const d=distance(u.x,u.z,x,z);
  if (d<.01) return;
  const speed=UNIT_STATS[u.kind].speed*(1+w.factions[u.owner].research.logistics*.08)*(1+generalBonus(w,u,'speed'));
  const step=Math.min(d,speed*dt);
  const next=resolveBattlefieldStep(u.x,u.z,u.x+(x-u.x)/d*step,u.z+(z-u.z)/d*step,x,z);
  u.x=next.x;u.z=next.z;
}
function updateOutposts(w: War,dt:number):void {
  for (const p of w.outposts) {
    const groups=new Map<number,number>();
    for (const u of w.units) {
      if (u.hp>0&&w.factions[u.owner].alive&&w.factions[u.owner].hp>0&&distance(u.x,u.z,p.x,p.z)<7.5)
        groups.set(u.owner,(groups.get(u.owner)??0)+1);
    }
    if (groups.size!==1) {
      p.progress=Math.max(0,p.progress-3*dt);
      if (p.progress===0) p.contender=null;
      continue;
    }
    const [id,amount]=[...groups][0];
    if (p.owner===id) { p.progress=0;p.contender=null;continue; }
    if (p.contender!==id) {
      p.progress=Math.max(0,p.progress-8*dt);
      if (p.progress===0) p.contender=id;
      continue;
    }
    p.progress+=dt*(2.5+Math.min(amount,w.grandBattle?24:5)*1.8);
    if (p.progress>=100) {
      const previous=p.owner;
      p.owner=id;p.contender=null;p.progress=0;
      if(previous!==id){
        w.stats[id].captures++;
        addEvent(w,`${NAMES[id]} 세력이 ${OUTPOST_NAMES[p.id]} 점령`);
      }
    }
  }
}
/** Player-controlled capture presence; rival troops contest the flag. */
export function captureHeroPost(w: War, x: number, z: number, dt: number): Outpost | null {
  if (w.over || !w.factions[0].alive || !Number.isFinite(dt) || dt <= 0) return null;
  const p = w.outposts.find(post => post.owner !== 0 && distance(x, z, post.x, post.z) < 7.5);
  if (!p) return null;
  const contested = w.units.some(u => u.owner !== 0 && u.hp > 0 &&
    w.factions[u.owner].alive && distance(u.x, u.z, p.x, p.z) < 8.5);
  if (contested) return null;
  if (p.contender !== 0) { p.contender = 0; p.progress = 0; }
  p.progress = Math.min(100, p.progress + dt * 11);
  if (p.progress >= 100) {
    p.owner = 0; p.contender = null; p.progress = 0;
    w.stats[0].captures++;
    addEvent(w, NAMES[0] + ' 세력이 ' + OUTPOST_NAMES[p.id] + ' 점령');
  }
  return p;
}

/** Armor mitigates combat only. Storm damage bypasses armor. */
function attack(w:War,attacker:number,target:Unit,damage:number):void {
  if(target.hp<=0)return;
  const cover=battlefieldCoverAt(target.x,target.z);
  const actual=damage*(w.difficulty==='easy'&&attacker!==0?.72:1)*(1-w.factions[target.owner].research.armor*.08)*(1-cover)*(1-generalBonus(w,target,'armor'));
  w.stats[attacker].damageDealt+=Math.min(target.hp,actual);
  target.hp-=actual;
  if(target.hp<=0)w.stats[attacker].kills++;
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
  // Siege towers protect their own base; fort upgrades also increase their damage.
  for (const f of w.factions) {
    if (!f.alive||f.hp<=0||f.turretCooldown>0) continue;
    const invaders=w.units.filter(u=>u.hp>0&&u.owner!==f.id&&
      w.factions[u.owner].alive&&w.factions[u.owner].hp>0&&distance(u.x,u.z,f.x,f.z)<13);
    if (invaders.length) {
      invaders.sort((a,b)=>distance(a.x,a.z,f.x,f.z)-distance(b.x,b.z,f.x,f.z));
      // A massed siege needs a limited, fort-scaled defensive salvo.
      const targets=w.grandBattle?Math.min(invaders.length,2+f.fort):1;
      for(let i=0;i<targets;i++)
        attack(w,f.id,invaders[i],5+3*f.fort+(f.id===0?workshopLevel(w,'fort')*2.5:0));
      f.turretCooldown=1.6;
    }
  }
  // Deterministic veteran reservation avoids stripping the HQ of all defenders.
  const reserveIds=new Set<number>();
  for(const f of w.factions){
    const home=w.units.filter(u=>u.owner===f.id&&u.hp>0&&(f.id!==0||(u.squad??0)===0)).sort((a,b)=>a.id-b.id);
    for(const u of home.slice(0,f.reserve))reserveIds.add(u.id);
  }
  // Spatial grid limits enemy lookups to 9 neighboring cells, avoiding O(N²)
  // scans when the 100 vs 500 battle starts (and as armies recruit).
  const cellSize=22, spatial=new Map<number,Unit[]>();
  const column=(value:number)=>Math.floor((value+MAP_HALF_SIZE)/cellSize);
  const cellKey=(cx:number,cz:number)=>cx*128+cz;
  for(const unit of w.units){
    if(unit.hp<=0||!w.factions[unit.owner].alive)continue;
    const key=cellKey(column(unit.x),column(unit.z));
    const bucket=spatial.get(key);
    if(bucket)bucket.push(unit);else spatial.set(key,[unit]);
  }
  for (const u of w.units) {
    const f=w.factions[u.owner];
    if (!f.alive||f.hp<=0||u.hp<=0) continue;
    const s=UNIT_STATS[u.kind];
    const combatMultiplier=(f.policy==='war'?1.18:1)*(1+f.research.weapons*.12)*(1+generalBonus(w,u,'damage'))*(u.owner===0?1+workshopLevel(w,'barracks')*.09:1);
    u.cooldown=Math.max(0,u.cooldown-dt);
    if (distance(u.x,u.z,0,0)>w.zone) u.hp-=1.8*dt;
    if (u.hp<=0) continue;
    let enemy:Unit|undefined;
    const noticeRange=Math.max(12,s.range+3);
    let nearestSq=noticeRange*noticeRange;
    const cx=column(u.x),cz=column(u.z);
    for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++){
      const bucket=spatial.get(cellKey(cx+ix,cz+iz));
      if(!bucket)continue;
      for(const e of bucket){
        if(e.hp<=0||e.owner===u.owner||!w.factions[e.owner].alive||w.factions[e.owner].hp<=0)continue;
        const dx=u.x-e.x,dz=u.z-e.z,d2=dx*dx+dz*dz;
        if(d2<nearestSq){nearestSq=d2;enemy=e;}
      }
    }
    if (enemy) {
      const nearest=Math.sqrt(nearestSq);
      if (nearest<=s.range) {
        if (u.cooldown<=0) {attack(w,u.owner,enemy,(s.damage+f.barracks*1.5)*combatMultiplier);u.cooldown=s.cooldown;}
      } else moveToward(w,u,enemy.x,enemy.z,dt);
      continue;
    }
    // Reserved troops defend a fixed ring around the HQ instead of marching out.
    if(reserveIds.has(u.id)){
      const angle=u.id*2.399,rx=f.x+Math.cos(angle)*9,rz=f.z+Math.sin(angle)*9;
      if(distance(u.x,u.z,rx,rz)>1.25)moveToward(w,u,rx,rz,dt);
      continue;
    }
    // Independent player squads never inherit the main army's destination.
    // An uncommanded split squad holds near HQ until explicitly moved.
    const squad = u.owner === 0 ? (u.squad === 1 || u.squad === 2 ? u.squad : 0) : 0;
    const independent = u.owner === 0 && (squad !== 0 || Boolean(w.squadOrders?.[0]));
    if (independent) {
      const command = w.squadOrders?.[squad] ?? { kind: 'home' as const };
      const destination = command.kind === 'move' ? command :
        command.kind === 'home' ? f :
        command.kind === 'outpost' ? w.outposts[command.id] : w.factions[command.id];
      if (destination) {
        if (command.kind === 'faction') {
          const opponent = w.factions[command.id];
          if (opponent?.alive && opponent.hp > 0) {
            if (distance(u.x,u.z,opponent.x,opponent.z) > Math.max(5,s.range))
              moveToward(w,u,opponent.x,opponent.z,dt);
            else if (u.cooldown <= 0) {
              const damage = (s.damage*.9+f.barracks*1.5)*combatMultiplier*(w.grandBattle?.075:1);
              w.stats[u.owner].damageDealt += Math.min(opponent.hp,damage);
              opponent.hp -= damage; u.cooldown = s.cooldown;
            }
          }
        } else {
          const spread = command.kind === 'outpost' ? (w.grandBattle?1.7:2) : (w.grandBattle?2.3:3.4);
          const grid=w.grandBattle?12:3;
          const dx = ((u.id % grid) - (grid-1)/2) * spread;
          const dz = ((Math.floor(u.id / grid) % grid) - (grid-1)/2) * spread;
          if (distance(u.x,u.z,destination.x+dx,destination.z+dz) > 1.8)
            moveToward(w,u,destination.x+dx,destination.z+dz,dt);
        }
      }
      continue;
    }
    const target=f.target===null?undefined:w.factions[f.target];
    if (target?.alive&&target.hp>0) {
      const d=distance(u.x,u.z,target.x,target.z);
      if (d>Math.max(5,s.range)) moveToward(w,u,target.x,target.z,dt);
      else if (u.cooldown<=0) {
        const damage=(s.damage*.9+f.barracks*1.5)*combatMultiplier*(w.difficulty==='easy'&&u.owner!==0?.72:1)*(w.grandBattle?.075:1);
        w.stats[u.owner].damageDealt+=Math.min(target.hp,damage);
        target.hp-=damage;u.cooldown=s.cooldown;
      }
    } else if (f.rally!==null&&w.outposts[f.rally]) {
      const p=w.outposts[f.rally],offset=w.grandBattle?(u.id%13-6)*1.5:(u.id%5)*1.3-2.6;
      const offsetZ=w.grandBattle?(Math.floor(u.id/13)%11-5)*1.5:offset*.5;
      if (distance(u.x,u.z,p.x+offset,p.z+offsetZ)>2)
        moveToward(w,u,p.x+offset,p.z+offsetZ,dt);
    } else {
      if (f.target!==null) f.target=null;
      const angle=u.id*2.4,x=f.x+Math.cos(angle)*6,z=f.z+Math.sin(angle)*6;
      if (distance(u.x,u.z,x,z)>1) moveToward(w,u,x,z,dt);
    }
  }
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
