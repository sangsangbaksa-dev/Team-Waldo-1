/** Deterministic, renderer-independent economy, territory and combat simulation. */
export type Upgrade = 'farm' | 'mine' | 'barracks' | 'fort';
export type EconomyPolicy = 'balanced' | 'growth' | 'war';
export type UnitKind = 'infantry' | 'archer' | 'guardian' | 'cavalry';
export interface Faction {
  id: number; x: number; z: number; hp: number; maxHp: number;
  gold: number; food: number; farm: number; mine: number; barracks: number; fort: number;
  alive: boolean; target: number | null; rally: number | null;
  reserve: number; policy: EconomyPolicy;
  aiTimer: number; turretCooldown: number;
}
export interface Unit {
  id: number; owner: number; kind: UnitKind; x: number; z: number;
  hp: number; cooldown: number;
}
export interface Outpost {
  id: number; x: number; z: number; owner: number | null;
  contender: number | null; progress: number;
}
export interface WarEvent { time: number; text: string; }
export interface War {
  factions: Faction[]; units: Unit[]; outposts: Outpost[]; events: WarEvent[];
  time: number; zone: number; over: boolean; winner: number | null; nextUnit: number;
}
export const NAMES = ['나', '적색', '황색', '보라'] as const;
export const OUTPOST_NAMES = ['북부 광산', '동부 시장', '남부 곡창', '서부 항구', '중앙 요새', '북서부 관문', '북동부 초소', '남서부 요새', '남동부 교역소'] as const;
/** Specialty income is added on top of mine and farm production. */
export const OUTPOST_BONUSES: ReadonlyArray<{gold:number;food:number}> = [
  {gold:3.1,food:.3}, {gold:2.5,food:1.6}, {gold:.3,food:3.4},
  {gold:2.1,food:2.1}, {gold:1.15,food:.9}, {gold:1.1,food:1.7},
  {gold:1.8,food:.8}, {gold:.7,food:2.3}, {gold:2.4,food:1.2},
];
export const MAP_HALF_SIZE = 185;
export const MAP_SIZE = MAP_HALF_SIZE * 2;
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
export function createWar(): War {
  const factions: Faction[] = CORNERS.map(([x,z],id) => ({
    id,x,z,hp:400,maxHp:400,gold:140,food:100,
    farm:1,mine:1,barracks:1,fort:1,alive:true,target:null,rally:null,
    reserve:id===0?0:2,policy:'balanced' as EconomyPolicy,
    aiTimer:2.5+id*.6,turretCooldown:0,
  }));
  const outposts: Outpost[] = OUTPOSTS.map(([x,z],id) => ({
    id,x,z,owner:null,contender:null,progress:0,
  }));
  const war: War = { factions,units:[],outposts,events:[],time:0,zone:MAP_HALF_SIZE-6,over:false,winner:null,nextUnit:1 };
  for (let id=0;id<4;id++) for (let i=0;i<4;i++) spawn(war,id,'infantry');
  return war;
}
function spawn(w: War, id: number, kind: UnitKind): void {
  const f=w.factions[id], n=w.nextUnit++;
  w.units.push({
    id:n,owner:id,kind,x:f.x+((n*3)%5-2)*1.6,
    z:f.z+4+(n%4)*1.8,hp:UNIT_STATS[kind].hp,cooldown:0,
  });
}
/** Restore a damaged stronghold using the shared economy. */
export function repair(w:War,id:number):boolean {
 const f=w.factions[id];
 if(!f?.alive||w.over||f.hp>=f.maxHp-1||f.gold<45||f.food<25)return false;
 f.gold-=45;f.food-=25;f.hp=Math.min(f.maxHp,f.hp+100);return true;
}
/** Queue a small squad atomically; never charge for units that cannot spawn. */
export function trainSquad(w:War,id:number,kind:UnitKind='infantry',amount=3):boolean {
 const f=w.factions[id],unit=UNIT_STATS[kind];
 if(!f?.alive||w.over||!unit||!Number.isInteger(amount)||amount<1||
   amount>5||f.barracks<unit.unlock||count(w,id)+amount>MAX_UNITS||
   f.gold<unit.gold*amount||f.food<unit.food*amount)return false;
 for(let i=0;i<amount;i++)train(w,id,kind);
 return true;
}
/** Keep a defensive detachment at home during offensive orders. */
export function setReserve(w:War,id:number,amount:number):boolean {
 const f=w.factions[id];
 if(!f?.alive||w.over||!Number.isInteger(amount)||amount<0||amount>6)return false;
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
  const f=w.factions[id]; if (!f?.alive||w.over||f[k]>=4) return false;
  const c=cost(f,k); if (f.gold<c.gold||f.food<c.food) return false;
  f.gold-=c.gold;f.food-=c.food;f[k]++;
  if (k==='fort') { f.maxHp+=100;f.hp=Math.min(f.maxHp,f.hp+100); }
  return true;
}
export function train(w: War,id: number,kind: UnitKind='infantry'): boolean {
  const f=w.factions[id],s=UNIT_STATS[kind];
  if (!f?.alive||w.over||!s||f.barracks<s.unlock||f.gold<s.gold||
      f.food<s.food||w.units.filter(u=>u.owner===id).length>=MAX_UNITS) return false;
  f.gold-=s.gold;f.food-=s.food;spawn(w,id,kind);return true;
}
export function order(w: War,id: number,target: number|null): boolean {
  const f=w.factions[id];
  if (!f?.alive||w.over||(target!==null&&(target===id||!w.factions[target]?.alive))) return false;
  f.target=target;f.rally=null;return true;
}
export function captureOrder(w: War,id: number,postId: number): boolean {
  const f=w.factions[id];
  if (!f?.alive||w.over||!Number.isInteger(postId)||!w.outposts[postId]) return false;
  f.target=null;f.rally=postId;return true;
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
  f.reserve=army>10?2:Math.min(2,Math.floor(army/3));
  // Keep economies operational before investing in expensive elite troops.
  if (army<6&&train(w,f.id,'infantry')) { /* early defense */ }
  else if (f.mine<3&&f.gold<140&&upgrade(w,f.id,'mine')) { /* cash flow */ }
  else if (f.farm<3&&f.food<115&&upgrade(w,f.id,'farm')) { /* supplies */ }
  else if (f.barracks<3&&w.time>36&&upgrade(w,f.id,'barracks')) { /* tech */ }
  else if (army<16&&train(w,f.id,f.barracks>=3&&army%5===0?'cavalry':f.barracks>=3&&army%4===0?'guardian':f.barracks>=2&&army%3===0?'archer':'infantry')) { /* recruit */ }
  else if (f.hp<f.maxHp*.65&&repair(w,f.id)) { /* emergency repairs */ }
  else if (f.fort<3&&f.hp<f.maxHp*.85) upgrade(w,f.id,'fort');
  const free=w.outposts.filter(p=>p.owner!==f.id);
  free.sort((a,b)=>distance(a.x,a.z,f.x,f.z)-distance(b.x,b.z,f.x,f.z));
  if (army>=9&&(w.time>180||owned>=3)) {
    const target=nearestEnemy(w,f);
    if (target) { f.target=target.id;f.rally=null; }
  } else if (free.length) {
    f.target=null;f.rally=free[0].id;
  } else if (army>=8) {
    f.target=nearestEnemy(w,f)?.id??null;f.rally=null;
  }
}
function moveToward(u: Unit,x:number,z:number,dt:number):void {
  const d=distance(u.x,u.z,x,z);
  if (d<.01) return;
  const step=Math.min(d,UNIT_STATS[u.kind].speed*dt);
  u.x+=(x-u.x)/d*step;u.z+=(z-u.z)/d*step;
}
function updateOutposts(w: War,dt:number):void {
  for (const p of w.outposts) {
    const groups=new Map<number,number>();
    for (const u of w.units) {
      if (u.hp>0&&w.factions[u.owner].alive&&distance(u.x,u.z,p.x,p.z)<7.5)
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
    p.progress+=dt*(2.5+Math.min(amount,5)*1.8);
    if (p.progress>=100) {
      const previous=p.owner;
      p.owner=id;p.contender=null;p.progress=0;
      if(previous!==id)addEvent(w,`${NAMES[id]} 세력이 ${OUTPOST_NAMES[p.id]} 점령`);
    }
  }
}
function attack(a: Unit,damage:number):void {a.hp-=damage;}
export function stepWar(w: War,dt: number):void {
  if (w.over||!Number.isFinite(dt)||dt<=0) return;
  dt=Math.min(dt,.1); w.time+=dt;
  w.zone=Math.max(24,MAP_HALF_SIZE-6-Math.max(0,w.time-130)*.48);
  for (const f of w.factions) {
    if (!f.alive) continue;
    const owned=w.outposts.filter(p=>p.owner===f.id);
    const incomeGold=owned.reduce((a,p)=>a+OUTPOST_BONUSES[p.id].gold,f.mine*1.5);
    const incomeFood=owned.reduce((a,p)=>a+OUTPOST_BONUSES[p.id].food,f.farm*1.3);
    const multiplier=f.policy==='growth'?1.25:f.policy==='war'?.88:1;
    f.gold+=incomeGold*multiplier*dt;
    f.food+=incomeFood*multiplier*dt;
    if (distance(f.x,f.z,0,0)>w.zone) f.hp-=3.5*dt;
    f.turretCooldown=Math.max(0,f.turretCooldown-dt);
    if (f.id>0) {
      f.aiTimer-=dt;
      if (f.aiTimer<=0) {f.aiTimer=3+f.id*.35;aiTurn(w,f);}
    }
  }
  // Siege towers protect their own base; fort upgrades also increase their damage.
  for (const f of w.factions) {
    if (!f.alive||f.turretCooldown>0) continue;
    const invaders=w.units.filter(u=>u.hp>0&&u.owner!==f.id&&
      w.factions[u.owner].alive&&distance(u.x,u.z,f.x,f.z)<13);
    if (invaders.length) {
      invaders.sort((a,b)=>distance(a.x,a.z,f.x,f.z)-distance(b.x,b.z,f.x,f.z));
      attack(invaders[0],5+3*f.fort);f.turretCooldown=1.6;
    }
  }
  // Deterministic veteran reservation avoids stripping the HQ of all defenders.
  const reserveIds=new Set<number>();
  for(const f of w.factions){
    const home=w.units.filter(u=>u.owner===f.id&&u.hp>0).sort((a,b)=>a.id-b.id);
    for(const u of home.slice(0,f.reserve))reserveIds.add(u.id);
  }
  for (const u of w.units) {
    const f=w.factions[u.owner];
    if (!f.alive||u.hp<=0) continue;
    const s=UNIT_STATS[u.kind];
    const combatMultiplier=f.policy==='war'?1.18:1;
    u.cooldown=Math.max(0,u.cooldown-dt);
    if (distance(u.x,u.z,0,0)>w.zone) u.hp-=1.8*dt;
    if (u.hp<=0) continue;
    let enemy:Unit|undefined,nearest=Infinity;
    for (const e of w.units) {
      if (e.hp<=0||e.owner===u.owner||!w.factions[e.owner].alive) continue;
      const d=distance(u.x,u.z,e.x,e.z);
      if (d<nearest) {nearest=d;enemy=e;}
    }
    if (enemy&&nearest<Math.max(12,s.range+3)) {
      if (nearest<=s.range) {
        if (u.cooldown<=0) { attack(enemy,(s.damage+f.barracks*1.5)*combatMultiplier);u.cooldown=s.cooldown; }
      } else moveToward(u,enemy.x,enemy.z,dt);
      continue;
    }
    // Reserved troops defend a fixed ring around the HQ instead of marching out.
    if(reserveIds.has(u.id)){
      const angle=u.id*2.399,rx=f.x+Math.cos(angle)*9,rz=f.z+Math.sin(angle)*9;
      if(distance(u.x,u.z,rx,rz)>1.25)moveToward(u,rx,rz,dt);
      continue;
    }
    const target=f.target===null?undefined:w.factions[f.target];
    if (target?.alive) {
      const d=distance(u.x,u.z,target.x,target.z);
      if (d>Math.max(5,s.range)) moveToward(u,target.x,target.z,dt);
      else if (u.cooldown<=0) {
        target.hp-=(s.damage*.9+f.barracks*1.5)*combatMultiplier;u.cooldown=s.cooldown;
      }
    } else if (f.rally!==null&&w.outposts[f.rally]) {
      const p=w.outposts[f.rally],offset=(u.id%5)*1.3-2.6;
      if (distance(u.x,u.z,p.x+offset,p.z+offset*.5)>2)
        moveToward(u,p.x+offset,p.z+offset*.5,dt);
    } else {
      if (f.target!==null) f.target=null;
      const angle=u.id*2.4,x=f.x+Math.cos(angle)*6,z=f.z+Math.sin(angle)*6;
      if (distance(u.x,u.z,x,z)>1) moveToward(u,x,z,dt);
    }
  }
  updateOutposts(w,dt);
  for (const f of w.factions) {
    if (f.alive&&f.hp<=0) {f.hp=0;f.alive=false;f.target=null;f.rally=null;
      addEvent(w,`${NAMES[f.id]} 세력 본부 함락`);
    }
  }
  w.units=w.units.filter(u=>u.hp>0&&w.factions[u.owner].alive);
  for (const p of w.outposts) {
    if (p.owner!==null&&!w.factions[p.owner].alive) p.owner=null;
    if (p.contender!==null&&!w.factions[p.contender].alive) {p.contender=null;p.progress=0;}
  }
  const survivors=w.factions.filter(f=>f.alive);
  if (survivors.length<=1) {w.over=true;w.winner=survivors[0]?.id??null;}
}
