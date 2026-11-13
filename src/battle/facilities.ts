import { walkable } from './terrain';
import { MAP_HALF_SIZE, UNIT_STATS, type War } from './war';
export const FACILITY_LIMIT = 30; // Includes the headquarters.
export const FACILITY_TYPES = {
  mine: {label:'금광 채굴소',gold:80,food:25,hp:240,seconds:12,incomeGold:1.5,incomeFood:0},
  farm: {label:'농장',gold:65,food:20,hp:180,seconds:10,incomeGold:0,incomeFood:1.6},
  city: {label:'도시 주거지',gold:120,food:80,hp:350,seconds:20,incomeGold:.9,incomeFood:.5},
  barracks: {label:'전진 병영',gold:100,food:60,hp:300,seconds:16,incomeGold:0,incomeFood:0},
  market: {label:'수출 교역소',gold:110,food:50,hp:220,seconds:15,incomeGold:1.2,incomeFood:0},
  tower: {label:'방어 포탑',gold:95,food:45,hp:320,seconds:14,incomeGold:0,incomeFood:0},
 hospital: {label:'병원',gold:140,food:90,hp:260,seconds:20,incomeGold:0,incomeFood:0},
 school: {label:'학교',gold:110,food:65,hp:220,seconds:18,incomeGold:0.6,incomeFood:0},
 university: {label:'연구소',gold:180,food:110,hp:250,seconds:25,incomeGold:0,incomeFood:0},
 workshop: {label:'군수 공방',gold:150,food:100,hp:280,seconds:22,incomeGold:0,incomeFood:0},
 warehouse: {label:'물류 창고',gold:90,food:50,hp:300,seconds:15,incomeGold:0.8,incomeFood:0.4},
 granary: {label:'곡물 저장고',gold:85,food:45,hp:240,seconds:15,incomeGold:0,incomeFood:1.2},
 housing: {label:'주거 구역',gold:100,food:70,hp:260,seconds:18,incomeGold:0.9,incomeFood:0},
 waterworks: {label:'급수 시설',gold:90,food:70,hp:250,seconds:16,incomeGold:0,incomeFood:0.7},
 powerplant: {label:'동력 시설',gold:160,food:90,hp:300,seconds:24,incomeGold:1.3,incomeFood:0},
 academy: {label:'사관학교',gold:170,food:100,hp:280,seconds:24,incomeGold:0,incomeFood:0},
 clinic: {label:'보급 의무소',gold:100,food:65,hp:220,seconds:16,incomeGold:0,incomeFood:0},
 wall: {label:'내부 방호벽',gold:120,food:70,hp:400,seconds:18,incomeGold:0,incomeFood:0},
} as const;
export type FacilityKind = keyof typeof FACILITY_TYPES;
export interface Facility {id:number;owner:number;kind:FacilityKind;x:number;z:number;hp:number;remaining:number;cooldown:number;interior?:{baseId:number;col:number;row:number};}
export const facilitiesFor = (w:War,id:number) => (w.facilities??[]).filter(b=>b.owner===id&&b.hp>0);
export function facilityIncome(w:War,id:number):{gold:number;food:number}{
 return facilitiesFor(w,id).filter(b=>b.remaining===0).reduce((sum,b)=>{
  const d=FACILITY_TYPES[b.kind];sum.gold+=d.incomeGold;sum.food+=d.incomeFood;return sum;
 },{gold:0,food:0});
}
export function buildFacility(w:War,id:number,kind:FacilityKind,x:number,z:number):boolean {
 const f=w.factions[id];
 if(!Object.hasOwn(FACILITY_TYPES,kind)||!f?.alive||w.over||!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>MAP_HALF_SIZE-12||Math.abs(z)>MAP_HALF_SIZE-12)return false;
 const list=w.facilities??[], d=FACILITY_TYPES[kind];
 if(INTERIOR_KINDS.includes(kind as InteriorKind))return false;
 if(facilitiesFor(w,id).length>=FACILITY_LIMIT-1||f.gold<d.gold||f.food<d.food)return false;
 // Build within supply range of the HQ, a captured post or a completed forward barracks.
 const supplied=Math.hypot(x-f.x,z-f.z)<=90||w.outposts.some(p=>p.owner===id&&Math.hypot(x-p.x,z-p.z)<=60)||list.some(b=>b.owner===id&&b.hp>0&&b.kind==='barracks'&&b.remaining===0&&Math.hypot(x-b.x,z-b.z)<=60);
 if(!walkable(x,z,10)||!supplied||w.factions.some(base=>Math.hypot(x-base.x,z-base.z)<20)||w.outposts.some(p=>Math.hypot(x-p.x,z-p.z)<13)||list.some(b=>b.hp>0&&Math.hypot(x-b.x,z-b.z)<13))return false;
 f.gold-=d.gold;f.food-=d.food;
 const next=(w.nextFacility??1);w.nextFacility=next+1;
 (w.facilities??=[]).push({id:next,owner:id,kind,x,z,hp:d.hp,remaining:d.seconds,cooldown:0});return true;
}
export function autoBuildFacility(w:War,id:number,kind:FacilityKind,site?:{x:number;z:number}):boolean {
 const f=site??w.factions[id];if(!f)return false;
 for(let ring=1;ring<=3;ring++)for(let slot=0;slot<16;slot++){
  const a=slot*Math.PI/8;
  if(buildFacility(w,id,kind,f.x+Math.cos(a)*ring*25,f.z+Math.sin(a)*ring*25))return true;
 }
 return false;
}
export function stepFacilities(w:War,dt:number):void {
 for(const f of w.factions){
  f.researchDiscount=Math.min(.25,completedFacilities(w,f.id,'university')*.05);
  const hospitals=(w.facilities??[]).filter(b=>b.owner===f.id&&b.remaining===0&&b.hp>0&&(b.kind==='hospital'||b.kind==='clinic'));
  for(const u of w.units)if(u.owner===f.id&&u.hp>0&&hospitals.some(b=>Math.hypot(u.x-b.x,u.z-b.z)<45))u.hp=Math.min(UNIT_STATS[u.kind].hp,u.hp+dt*1.5);
 }
 for(const b of w.facilities??[]){
  if(!w.factions[b.owner].alive||(b.interior&&b.interior.baseId!==0&&!(w.facilities??[]).some(anchor=>anchor.id===b.interior!.baseId&&anchor.owner===b.owner&&anchor.hp>0))){b.hp=0;continue;}
  b.remaining=Math.max(0,b.remaining-dt);b.cooldown=Math.max(0,b.cooldown-dt);
  if(b.hp<=0)continue;
  const enemies=w.units.filter(u=>u.hp>0&&u.owner!==b.owner&&w.factions[u.owner].alive&&Math.hypot(u.x-b.x,u.z-b.z)<(b.kind==='tower'&&b.remaining===0?23:9));
  if(b.kind==='tower'&&b.remaining===0&&b.cooldown===0&&enemies.length){
   const target=enemies[0];const damage=Math.min(target.hp,18);target.hp-=damage;w.stats[b.owner].damageDealt+=damage;if(target.hp<=0)w.stats[b.owner].kills++;b.cooldown=1.4;
  }
  // Sieges damage production too; completed defenses provide a reason to guard the economy.
  for(const u of enemies)if(Math.hypot(u.x-b.x,u.z-b.z)<9&&u.hp>0)b.hp-=dt*3;
 }
 w.facilities=(w.facilities??[]).filter(b=>b.hp>0);
}
export function validFacilities(value:unknown,next:unknown):value is Facility[]{
 if(!Array.isArray(value)||value.length>116||!Number.isInteger(next)||Number(next)<1||Number(next)>1e7)return false;
 const ids=new Set<number>(),counts=[0,0,0,0];
 return value.every(b=>{
  if(!b||!Number.isInteger(b.id)||b.id<1||b.id>=Number(next)||ids.has(b.id)||!Number.isInteger(b.owner)||b.owner<0||b.owner>3||!Object.hasOwn(FACILITY_TYPES,b.kind))return false;
  ids.add(b.id);if(++counts[b.owner]>29)return false;
  const d=FACILITY_TYPES[b.kind as FacilityKind];
  if(b.interior!==undefined&&(!b.interior||!Number.isInteger(b.interior.baseId)||b.interior.baseId<0||!Number.isInteger(b.interior.col)||b.interior.col<0||b.interior.col>=6||!Number.isInteger(b.interior.row)||b.interior.row<0||b.interior.row>=5||!INTERIOR_KINDS.includes(b.kind)))return false;
  return Number.isFinite(b.x)&&Math.abs(b.x)<=MAP_HALF_SIZE-12&&Number.isFinite(b.z)&&Math.abs(b.z)<=MAP_HALF_SIZE-12&&Number.isFinite(b.hp)&&b.hp>0&&b.hp<=d.hp&&Number.isFinite(b.remaining)&&b.remaining>=0&&b.remaining<=d.seconds&&Number.isFinite(b.cooldown)&&b.cooldown>=0&&b.cooldown<=1.4;
 });
}

export const INTERIOR_KINDS=['hospital','school','university','workshop','warehouse','granary','housing','waterworks','powerplant','academy','clinic','wall'] as const;
export type InteriorKind=typeof INTERIOR_KINDS[number];
export const INTERIOR_EFFECTS:Record<InteriorKind,string>={hospital:'45범위 내 아군 체력 +1.5/초',school:'세금 금 +0.6/초',university:'연구 비용 −5% (최대 −25%)',workshop:'아군 병사 공격력 +6%',warehouse:'금 +0.8/초 · 식량 +0.4/초',granary:'식량 +1.2/초',housing:'세금 금 +0.9/초',waterworks:'식량 +0.7/초',powerplant:'금 +1.3/초',academy:'아군 이동 속도 +4%',clinic:'45범위 내 아군 체력 +1.5/초 (중복 회복 없음)',wall:'본부 폭풍 피해 −8% (최대 −40%)'};
export const completedFacilities=(w:War,id:number,kind:FacilityKind)=>facilitiesFor(w,id).filter(b=>b.kind===kind&&b.remaining===0).length;
export function buildInterior(w:War,id:number,kind:InteriorKind,baseId:number,col:number,row:number):boolean{
 const f=w.factions[id];
 if(!f?.alive||w.over||!INTERIOR_KINDS.includes(kind)||!Number.isInteger(col)||col<0||col>=6||!Number.isInteger(row)||row<0||row>=5||facilitiesFor(w,id).length>=29)return false;
 const anchor=baseId===0?f:(w.facilities??[]).find(b=>b.id===baseId&&b.owner===id&&b.hp>0&&b.remaining===0&&b.kind==='barracks'&&!b.interior);
 if(!anchor||(w.facilities??[]).some(b=>b.owner===id&&b.interior?.baseId===baseId&&b.interior.col===col&&b.interior.row===row))return false;
 const d=FACILITY_TYPES[kind];if(f.gold<d.gold||f.food<d.food)return false;
 f.gold-=d.gold;f.food-=d.food;const next=w.nextFacility??1;w.nextFacility=next+1;
 (w.facilities??=[]).push({id:next,owner:id,kind,x:anchor.x,z:anchor.z,hp:d.hp,remaining:d.seconds,cooldown:0,interior:{baseId,col,row}});return true;
}
