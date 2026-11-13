import type { Upgrade, Unit, War } from './model';

/** A compact, persistent plan of the player's 5x5 home-base district. */
export type GeneralId = 'leon' | 'sora' | 'mira' | 'han';
export type GeneralSpecialty = 'damage' | 'speed' | 'armor' | 'income';
export type SquadIndex = 0 | 1 | 2;
export interface PlacedStructure { kind: Upgrade; slot: number; }
export interface RecruitedGeneral {
  id: GeneralId; squad: SquadIndex | null;
  /** Absolute simulation timestamps; absent in older saves. */
  activeUntil?: number; readyAt?: number;
}
export interface BaseState {
  structures: PlacedStructure[];
  generals: RecruitedGeneral[];
  /** Permanent interior upgrades shared by each kind of facility. Older saves omit this. */
  workshopLevels?: Record<Upgrade, number>;
}
export const BASE_WIDTH = 5;
export const HQ_SLOT = 12;
export const BASE_BUILDINGS: ReadonlyArray<{kind:Upgrade; name:string; glyph:string; effect:string}> = [
  {kind:'mine',name:'금광',glyph:'⛏',effect:'금 생산 +1.5/초'},
  {kind:'farm',name:'농장',glyph:'🌾',effect:'식량 생산 +1.3/초'},
  {kind:'barracks',name:'병영',glyph:'⚔',effect:'병종·연구 해금 / 병사 공격력 향상'},
  {kind:'fort',name:'방어탑',glyph:'♜',effect:'본부 최대 체력 +100 / 포탑 공격력 향상'},
];
export const GENERAL_CATALOG: ReadonlyArray<{
  id:GeneralId; name:string; title:string; glyph:string; specialty:GeneralSpecialty;
  bonus:number; gold:number; food:number; description:string;
}> = [
  {id:'leon',name:'레온 발렌',title:'철혈의 선봉장',glyph:'⚔',specialty:'damage',bonus:.18,gold:165,food:90,description:'배속 부대 공격력 +18%'},
  {id:'sora',name:'소라 하인',title:'질풍의 기동장',glyph:'➶',specialty:'speed',bonus:.20,gold:145,food:105,description:'배속 부대 이동 속도 +20%'},
  {id:'mira',name:'미라 카엘',title:'불굴의 수호장',glyph:'♜',specialty:'armor',bonus:.15,gold:175,food:115,description:'배속 부대가 받는 전투 피해 −15%'},
  {id:'han',name:'한 유진',title:'왕국 병참총감',glyph:'◆',specialty:'income',bonus:.12,gold:190,food:130,description:'모든 자원 수입 +12% (모집 즉시 적용)'},
];
/** Active tactical orders complement the generals' permanent passive specialties. */
export const GENERAL_ABILITIES: Record<GeneralId, {
  name:string; effect:string; duration:number; cooldown:number; bonus:number;
}> = {
  leon:{name:'전장의 함성',effect:'10초 동안 지휘 부대 공격력 추가 +25%',duration:10,cooldown:40,bonus:.25},
  sora:{name:'질풍 진군',effect:'10초 동안 지휘 부대 이동 속도 추가 +25%',duration:10,cooldown:40,bonus:.25},
  mira:{name:'철벽 방진',effect:'10초 동안 지휘 부대가 받는 피해 추가 −20%',duration:10,cooldown:40,bonus:.20},
  han:{name:'긴급 보급',effect:'12초 동안 모든 자원 생산 추가 +18%',duration:12,cooldown:45,bonus:.18},
};
const STARTER_STRUCTURES: PlacedStructure[] = [
  {kind:'mine',slot:6},{kind:'farm',slot:8},
  {kind:'barracks',slot:16},{kind:'fort',slot:18},
];
const kinds:Upgrade[]=['mine','farm','barracks','fort'];
export const WORKSHOP_UPGRADES: Record<Upgrade,{
  name:string;effect:string;maxLevel:number;gold:number;food:number;goldStep:number;foodStep:number;
}> = {
  mine:{name:'동력 시추기',effect:'금 생산 +0.8/초 (단계당)',maxLevel:3,gold:75,food:30,goldStep:40,foodStep:20},
  farm:{name:'자동 관개 설비',effect:'식량 생산 +0.75/초 (단계당)',maxLevel:3,gold:60,food:40,goldStep:40,foodStep:25},
  barracks:{name:'전술 훈련 시뮬레이터',effect:'아군 병사 공격력 +9% (단계당)',maxLevel:3,gold:95,food:65,goldStep:65,foodStep:35},
  fort:{name:'정밀 방어 포대',effect:'본부 방어탑 공격 피해 +2.5 (단계당)',maxLevel:3,gold:90,food:50,goldStep:60,foodStep:30},
};
const freshWorkshops=():Record<Upgrade,number>=>({mine:0,farm:0,barracks:0,fort:0});
/** Missing workshop state is treated as an unmodified legacy base. */
export const workshopLevel=(w:War,kind:Upgrade):number=>w.base?.workshopLevels?.[kind]??0;
export function workshopCost(w:War,kind:Upgrade):{gold:number;food:number}{
  const def=WORKSHOP_UPGRADES[kind],level=workshopLevel(w,kind);
  return {gold:def.gold+level*def.goldStep,food:def.food+level*def.foodStep};
}
/** A workshop tier requires its matching building tier and is purchased atomically. */
export function upgradeWorkshop(w:War,kind:Upgrade):boolean{
  if(!kinds.includes(kind)||w.over||!w.factions[0].alive)return false;
  const level=workshopLevel(w,kind),definition=WORKSHOP_UPGRADES[kind],f=w.factions[0];
  if(level>=definition.maxLevel||f[kind]<=level)return false;
  const price=workshopCost(w,kind);
  if(f.gold<price.gold||f.food<price.food)return false;
  const base=getBaseState(w);
  base.workshopLevels ??= freshWorkshops();
  f.gold-=price.gold;f.food-=price.food;
  base.workshopLevels[kind]=level+1;
  w.stats[0].upgrades++;
  w.events.unshift({time:Math.floor(w.time),text:definition.name+' 개량 · Lv.'+(level+1)});
  w.events.length=Math.min(8,w.events.length);
  return true;
}
const validSlot=(slot:number)=>Number.isInteger(slot)&&slot>=0&&slot<BASE_WIDTH*BASE_WIDTH&&slot!==HQ_SLOT;

export function createBaseState(): BaseState {
  return {structures:STARTER_STRUCTURES.map(s=>({...s})),generals:[],workshopLevels:freshWorkshops()};
}
/** Older saves and the classic economy tab both use the same physical blueprint. */
export function getBaseState(w:War): BaseState {
  if(!w.base) w.base=createBaseState();
  const occupied=new Set(w.base.structures.map(s=>s.slot));
  for(const kind of kinds) {
    let actual=w.base.structures.filter(s=>s.kind===kind).length;
    while(actual<w.factions[0][kind]) {
      const slot=Array.from({length:25},(_,i)=>i).find(i=>validSlot(i)&&!occupied.has(i));
      if(slot===undefined)break;
      w.base.structures.push({kind,slot}); occupied.add(slot); actual++;
    }
  }
  return w.base;
}
export function baseBuildingPrice(w:War,kind:Upgrade):{gold:number;food:number} {
  const level=w.factions[0][kind];
  return {gold:Math.round((kind==='fort'?80:60)*level),food:(kind==='fort'?30:20)*level};
}
export function canPlaceBuilding(w:War,kind:Upgrade,slot:number):boolean {
  if(!kinds.includes(kind)||!validSlot(slot)||w.over||!w.factions[0].alive)return false;
  const base=getBaseState(w),f=w.factions[0],price=baseBuildingPrice(w,kind);
  return !base.structures.some(s=>s.slot===slot)&&f[kind]<4&&f.gold>=price.gold&&f.food>=price.food;
}
/** Construction is atomic: invalid slots and unaffordable requests never spend resources. */
export function placeBaseBuilding(w:War,kind:Upgrade,slot:number):boolean {
  if(!canPlaceBuilding(w,kind,slot))return false;
  const f=w.factions[0], price=baseBuildingPrice(w,kind);
  const base=getBaseState(w); // Resolve layout before the faction level increments.
  f.gold-=price.gold;f.food-=price.food;f[kind]++;
  if(kind==='fort'){f.maxHp+=100;f.hp=Math.min(f.maxHp,f.hp+100);}
  base.structures.push({kind,slot});
  w.stats[0].upgrades++;
  const name=BASE_BUILDINGS.find(b=>b.kind===kind)!.name;
  w.events.unshift({time:Math.floor(w.time),text:name+' 건설 완료 · Lv.'+f[kind]});
  w.events.length=Math.min(w.events.length,8);
  return true;
}
/** Move a completed facility without changing its tier, cost, or economic output. */
export function relocateBaseBuilding(w:War,from:number,to:number):boolean {
  if(w.over||!w.factions[0].alive||!validSlot(from)||!validSlot(to)||from===to)return false;
  const base=getBaseState(w),building=base.structures.find(s=>s.slot===from);
  if(!building||base.structures.some(s=>s.slot===to))return false;
  building.slot=to;
  w.events.unshift({time:Math.floor(w.time),text:BASE_BUILDINGS.find(b=>b.kind===building.kind)!.name+' 부지 이전 완료'});
  w.events.length=Math.min(w.events.length,8);
  return true;
}
export function recruitGeneral(w:War,id:GeneralId):boolean {
  const def=GENERAL_CATALOG.find(g=>g.id===id),f=w.factions[0],base=getBaseState(w);
  if(!def||!f.alive||w.over||base.generals.some(g=>g.id===id)||
    f.gold<def.gold||f.food<def.food)return false;
  f.gold-=def.gold;f.food-=def.food;
  base.generals.push({id,squad:null});
  w.events.unshift({time:Math.floor(w.time),text:def.name+' 장군 모집 완료'});
  w.events.length=Math.min(w.events.length,8);
  return true;
}
/** One general may command one squad; assigning a new one benches its predecessor. */
export function assignGeneral(w:War,id:GeneralId,squad:SquadIndex|null):boolean {
  if(w.over||!w.factions[0].alive||!(squad===null||squad===0||squad===1||squad===2))return false;
  const base=getBaseState(w),general=base.generals.find(g=>g.id===id);
  if(!general||id==='han'&&squad!==null)return false;
  if(squad!==null)for(const other of base.generals)if(other.squad===squad)other.squad=null;
  general.squad=squad;
  return true;
}
/** These timers use game time, so pause, save/resume and speed changes stay deterministic. */
export function generalAbilityState(w:War,id:GeneralId):{activeFor:number;cooldownFor:number;ready:boolean} {
  const general=getBaseState(w).generals.find(g=>g.id===id);
  const activeFor=Math.max(0,(general?.activeUntil??0)-w.time);
  const cooldownFor=Math.max(0,(general?.readyAt??0)-w.time);
  return {activeFor,cooldownFor,ready:Boolean(general&&!w.over&&w.factions[0].alive&&
    (id==='han'||general.squad!==null)&&cooldownFor===0)};
}
export function activateGeneralAbility(w:War,id:GeneralId):boolean {
  if(!GENERAL_CATALOG.some(g=>g.id===id)||!generalAbilityState(w,id).ready)return false;
  const general=getBaseState(w).generals.find(g=>g.id===id)!;
  const ability=GENERAL_ABILITIES[id];
  general.activeUntil=w.time+ability.duration;
  general.readyAt=w.time+ability.cooldown;
  w.events.unshift({time:Math.floor(w.time),text:ability.name+' 발동 · '+GENERAL_CATALOG.find(g=>g.id===id)!.name});
  w.events.length=Math.min(w.events.length,8);
  return true;
}
export function generalBonus(w:War,unit:Unit,specialty:'damage'|'speed'|'armor'):number {
  if(unit.owner!==0||!w.base)return 0;
  const group=unit.squad===1||unit.squad===2?unit.squad:0;
  const member=w.base.generals.find(g=>g.squad===group);
  const definition=GENERAL_CATALOG.find(g=>g.id===member?.id);
  return definition?.specialty===specialty?definition.bonus+(member?.activeUntil!==undefined&&member.activeUntil>w.time?GENERAL_ABILITIES[definition.id].bonus:0):0;
}
export function incomeGeneralBonus(w:War,id:number):number {
  if(id!==0)return 0;
  const general=w.base?.generals.find(g=>g.id==='han');
  return general ? .12+(general.activeUntil!==undefined&&general.activeUntil>w.time?GENERAL_ABILITIES.han.bonus:0) : 0;
}
/** Extra fields are validated rather than blindly trusting user-controlled localStorage. */
export function validBaseState(candidate:unknown,w:War):candidate is BaseState {
  if(typeof candidate!=='object'||candidate===null||Array.isArray(candidate))return false;
  const b=candidate as Record<string,unknown>;
  if(!Array.isArray(b.structures)||b.structures.length>16||
     !Array.isArray(b.generals)||b.generals.length>GENERAL_CATALOG.length)return false;
  if(b.workshopLevels!==undefined){
    if(typeof b.workshopLevels!=='object'||b.workshopLevels===null||Array.isArray(b.workshopLevels))return false;
    const levels=b.workshopLevels as Record<string,unknown>;
    if(Object.keys(levels).length!==kinds.length||kinds.some(kind=>
      !Number.isInteger(levels[kind])||(levels[kind] as number)<0||
      (levels[kind] as number)>WORKSHOP_UPGRADES[kind].maxLevel||
      (levels[kind] as number)>w.factions[0][kind]))return false;
  }
  const slots=new Set<number>(),counts:Record<Upgrade,number>={mine:0,farm:0,barracks:0,fort:0};
  for(const s of b.structures) {
    if(typeof s!=='object'||s===null||Array.isArray(s))return false;
    const obj=s as Record<string,unknown>;
    if(!kinds.includes(obj.kind as Upgrade)||!validSlot(obj.slot as number)||slots.has(obj.slot as number))return false;
    slots.add(obj.slot as number);counts[obj.kind as Upgrade]++;
  }
  if(kinds.some(kind=>counts[kind]!==w.factions[0][kind]))return false;
  const ids=new Set<GeneralId>(),squads=new Set<number>();
  for(const g of b.generals){
    if(typeof g!=='object'||g===null||Array.isArray(g))return false;
    const obj=g as Record<string,unknown>;
    if(!GENERAL_CATALOG.some(def=>def.id===obj.id)||ids.has(obj.id as GeneralId))return false;
    ids.add(obj.id as GeneralId);
    if(obj.squad!==null){
      if(obj.id==='han'||(obj.squad!==0&&obj.squad!==1&&obj.squad!==2)||
        squads.has(obj.squad as number))return false;
      squads.add(obj.squad as number);
    }
    // Optional timestamps are accepted for pre-ability saves only when both are absent.
    if((obj.activeUntil===undefined)!==(obj.readyAt===undefined))return false;
    if(obj.activeUntil!==undefined){
      const ability=GENERAL_ABILITIES[obj.id as GeneralId];
      const active=obj.activeUntil,ready=obj.readyAt;
      if(typeof active!=='number'||!Number.isFinite(active)||active<0||
         typeof ready!=='number'||!Number.isFinite(ready)||ready<active||
         active>w.time+ability.duration+.001||ready>w.time+ability.cooldown+.001)return false;
    }
  }
  return true;
}
