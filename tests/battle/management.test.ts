import { describe, expect, it } from 'vitest';
import { createWar, stepWar, train, trainSquad, cancelTraining, setRecruitRally, order, captureOrder, getIncome } from '../../src/battle/war';
import { queuedUnits, queuedSeconds, TRAINING_SECONDS } from '../../src/battle/recruitment';
import { affordability, economicForecast, upgradePreview, nextMilestone, tutorialProgress } from '../../src/battle/management';
import { dispatchExport, assignWorker, exportDestination, exportPosition } from '../../src/battle/economy';
import { encodeWar, decodeWar } from '../../src/battle/save';
const scenario=()=>{
 const w=createWar({economyCampaign:true});w.factions[0].gold=1000;w.factions[0].food=1000;
 w.factions.slice(1).forEach(f=>{f.aiTimer=99999;});return w;
};
const advance=(w:ReturnType<typeof createWar>,seconds:number)=>{for(let i=0;i<Math.round(seconds*10);i++)stepWar(w,.1);};

describe('timed recruitment and rally orders',()=>{
 it('charges a complete batch up front, reserves supply, and spawns soldiers sequentially',()=>{
  const w=scenario();expect(trainSquad(w,0,'infantry',3)).toBe(true);
  expect(w.factions[0].gold).toBe(925);expect(w.factions[0].food).toBe(940);
  expect(w.units.filter(u=>u.owner===0)).toHaveLength(4);expect(w.stats[0].trained).toBe(0);
  expect(queuedUnits(w.recruitment[0])).toBe(3);expect(queuedSeconds(w.recruitment[0])).toBe(12);
  advance(w,3.9);expect(w.stats[0].trained).toBe(0);
  advance(w,.1);expect(w.stats[0].trained).toBe(1);expect(queuedUnits(w.recruitment[0])).toBe(2);
  advance(w,8);expect(w.stats[0].trained).toBe(3);expect(w.recruitment[0].queue).toEqual([]);
 });
 it('enforces supply and six queue slots before spending resources',()=>{
  const w=scenario();for(let i=0;i<6;i++)expect(train(w,0)).toBe(true);
  const state=encodeWar(w);expect(train(w,0)).toBe(false);expect(encodeWar(w)).toBe(state);
  const supply=scenario();trainSquad(supply,0,'infantry',5);trainSquad(supply,0,'infantry',5);trainSquad(supply,0,'infantry',4);
  expect(queuedUnits(supply.recruitment[0])).toBe(14);expect(train(supply,0)).toBe(false);
 });
 it('refunds only unspawned soldiers when a partly completed batch is cancelled',()=>{
  const w=scenario();trainSquad(w,0,'infantry',3);advance(w,4);
  const gold=w.factions[0].gold,food=w.factions[0].food,earned=w.stats[0].goldEarned;
  expect(cancelTraining(w,0,0)).toBe(true);
  expect(w.factions[0].gold).toBe(gold+50);expect(w.factions[0].food).toBe(food+40);
  expect(w.stats[0].goldEarned).toBe(earned);expect(w.stats[0].trained).toBe(1);
  expect(cancelTraining(w,0,0)).toBe(false);advance(w,20);expect(w.stats[0].trained).toBe(1);
 });
 it('uses per-class training times and validates unlocks without charging',()=>{
  const w=scenario();expect(train(w,0,'archer')).toBe(false);
  w.factions[0].barracks=3;expect(train(w,0,'guardian')).toBe(true);
  advance(w,TRAINING_SECONDS.guardian-.1);expect(w.stats[0].trained).toBe(0);
  advance(w,.1);expect(w.units.filter(u=>u.owner===0&&u.kind==='guardian')).toHaveLength(1);
 });
 it('moves new soldiers to the rally point and keeps them there until an explicit order',()=>{
  const w=scenario();setRecruitRally(w,0,{x:-90,z:-90});train(w,0);advance(w,15);
  const recruit=w.units.find(u=>u.id===17)!;expect(Math.hypot(recruit.x+90,recruit.z+90)).toBeLessThan(1.9);
  const position={x:recruit.x,z:recruit.z};advance(w,5);expect({x:recruit.x,z:recruit.z}).toEqual(position);
  expect(order(w,0,null)).toBe(true);expect(recruit.rallyPoint).toBeUndefined();advance(w,1);expect(recruit.x).not.toBe(position.x);
 });
 it('clears rally movement when a capture order is issued, and rejects invalid rally locations',()=>{
  const w=scenario();expect(setRecruitRally(w,0,{x:Infinity,z:0})).toBe(false);expect(setRecruitRally(w,0,{x:256,z:0})).toBe(false);
  setRecruitRally(w,0,{x:0,z:0});train(w,0);advance(w,4);captureOrder(w,0,5);
  expect(w.units.every(u=>!u.rallyPoint)).toBe(true);
  expect(setRecruitRally(createWar(),0,{x:0,z:0})).toBe(false);
 });
 it('retains instant training for conquest and grand battle saves',()=>{
  for(const options of [{},{grandBattle:true}]){
   const w=createWar(options);expect(train(w,0)).toBe(true);expect(w.stats[0].trained).toBe(1);expect(queuedUnits(w.recruitment[0])).toBe(0);
  }
 });
 it('round trips in-flight production and rally movement without resetting time or prepaid costs',()=>{
  const w=scenario();setRecruitRally(w,0,{x:-90,z:-80});trainSquad(w,0,'infantry',3);advance(w,6);
  const restored=decodeWar(encodeWar(w));expect(restored).toEqual(w);advance(w,7);advance(restored!,7);expect(restored).toEqual(w);
 });
 it('migrates v3 saves and rejects forged queues, supply overflow and off-map rally points',()=>{
  const w=scenario(),old=JSON.parse(encodeWar(w));old.version=3;delete old.war.recruitment;
  expect(decodeWar(JSON.stringify(old))?.recruitment).toEqual(createWar().recruitment);
  const check=(change:(war:ReturnType<typeof createWar>)=>void)=>{const state=scenario();change(state);expect(decodeWar(encodeWar(state))).toBeNull();};
  check(w=>{w.recruitment[0].queue=[{kind:'archer',amount:1,remaining:6}];});
  check(w=>{w.recruitment[0].queue=[{kind:'infantry',amount:5,remaining:9}];});
  check(w=>{w.recruitment[0].rally={x:260,z:0};});
  check(w=>{w.recruitment[0].queue=Array.from({length:3},()=>({kind:'infantry',amount:5,remaining:4}));});
 });
});

describe('economy forecasts and progressive objectives',()=>{
 it('estimates affordability from net production and identifies unreachable purchases',()=>{
  const w=scenario();w.factions[0].gold=0;w.factions[0].food=0;
  expect(affordability(w,15,13)).toEqual({gold:15,food:13,seconds:10});
  w.economy[0].workers.farm=0;w.economy[0].workers.idle=6;
  expect(affordability(w,0,10).seconds).toBe(Infinity);expect(affordability(w,1500,0).seconds).toBe(Infinity);
 });
 it('previews actual policy-adjusted returns without mutating state',()=>{
  const w=scenario();w.factions[0].policy='growth';const before=encodeWar(w),baseline=getIncome(w,0);
  const preview=upgradePreview(w,'mine');expect(encodeWar(w)).toBe(before);
  w.factions[0].mine++;expect(preview.gold).toBeCloseTo(getIncome(w,0).gold-baseline.gold);expect(preview.payback).toBeCloseTo(60/preview.gold);
 });
 it('predicts famine and a missed contract using the same net food rate',()=>{
  const w=scenario(),e=w.economy[0];e.workers.idle=12;e.workers.farm=0;e.city=2;e.market=1;w.factions[0].food=6;
  expect(economicForecast(w).foodSeconds).toBe(9);
  e.contract={key:'provisions',deadline:50};expect(economicForecast(w).deliverySeconds).toBe(Infinity);
 });
 it('guides production, territory and the first contract, preserving completed milestones after losing territory',()=>{
  const w=scenario();expect(nextMilestone(w).control).toBe('#build-mine');
  w.factions[0].mine=2;w.factions[0].farm=2;expect(nextMilestone(w).control).toBe('#train-infantry');
  trainSquad(w,0,'infantry',3);expect(nextMilestone(w).control).toBe('#training-status');advance(w,12);
  expect(nextMilestone(w).control).toBe('#outpost-5');w.stats[0].captures=1;
  expect(nextMilestone(w).tab).toBe('city');w.economy[0].market=1;expect(nextMilestone(w).control).toBe('#contract-provisions');
  w.economy[0].contract={key:'provisions',deadline:w.time+75};expect(nextMilestone(w).control).toBe('#active-contract');
  w.economy[0].completed=1;expect(tutorialProgress(w)).toEqual([true,true,true]);expect(nextMilestone(w).control).toBe('#economic-goal');
 });
});

describe('scaled trade convoys and secured gateway visualization',()=>{
 it('requires matching market capacity and merchants, then debits and credits a grouped convoy once',()=>{
  const w=scenario(),e=w.economy[0];e.market=2;
  assignWorker(w,0,'mine',-1);assignWorker(w,0,'trade',1);
  expect(dispatchExport(w,0,'caravan',2)).toBe(false);
  assignWorker(w,0,'mine',-1);assignWorker(w,0,'trade',1);
  const food=w.factions[0].food;expect(dispatchExport(w,0,'caravan',2)).toBe(true);expect(w.factions[0].food).toBe(food-80);
  expect(e.shipment?.reward).toBe(116);advance(w,20);expect(e.tradeGold).toBe(116);expect(e.exports).toBe(1);
 });
 it('pauses a convoy if its reserved merchant count is no longer staffed',()=>{
  const w=scenario(),e=w.economy[0];e.market=2;e.workers.mine=4;e.workers.trade=2;
  dispatchExport(w,0,'caravan',2);advance(w,5);assignWorker(w,0,'trade',-1);const remaining=e.shipment!.remaining;
  advance(w,10);expect(e.shipment!.remaining).toBe(remaining);assignWorker(w,0,'trade',1);advance(w,15);expect(e.shipment).toBeNull();
 });
 it('draws sea cargo toward the secured southeast gateway rather than an unowned western port',()=>{
  const w=scenario(),e=w.economy[0];e.city=2;e.market=1;e.port=1;e.workers.mine=5;e.workers.trade=1;w.outposts[8].owner=0;
  expect(exportDestination(w,0,'overseas').id).toBe(8);dispatchExport(w,0,'overseas');advance(w,17.5);
  const cargo=exportPosition(w,0)!;expect(cargo.x).toBeCloseTo((w.factions[0].x+w.outposts[8].x)/2);expect(cargo.z).toBeCloseTo((w.factions[0].z+w.outposts[8].z)/2);
  expect(decodeWar(encodeWar(w))).toEqual(w);
 });
});

describe('combined base and public-city save compatibility',()=>{
 it('migrates public v3 cities with their original contract escrow and export cooldown',()=>{
  const parsed=JSON.parse(encodeWar(createWar()));parsed.version=3;
  delete parsed.war.economy;delete parsed.war.recruitment;delete parsed.war.base;delete parsed.war.economyCampaign;
  parsed.war.time=30;
  for(const f of parsed.war.factions){
   f.aiTimer=99999;
   f.economy={city:1,market:0,miners:2,farmers:2,construction:null,contract:null,cooldown:0,completed:0,failed:0,exports:0};
  }
  const f=parsed.war.factions[0];f.gold=200;f.food=300;
  f.economy={city:2,market:1,miners:3,farmers:3,construction:null,contract:{kind:'relief',deadline:100},cooldown:15,completed:2,failed:1,exports:4};
  const w=decodeWar(JSON.stringify(parsed));expect(w).not.toBeNull();
  expect(w!.factions[0].gold).toBe(200);expect(w!.economy[0].workers).toEqual({mine:9,farm:9,trade:0,idle:0});
  expect(w!.economy[0].contract).toMatchObject({key:'harvest',deadline:100,escrow:80,legacy:true});
  expect(w!.economy[0].exportReadyAt).toBe(45);expect(w!.economy[0].exports).toBe(4);expect(w!.base).toBeDefined();
  expect(decodeWar(encodeWar(w!))).toEqual(w);
 });
 it('returns a public contract’s full paid deposit after migration, even with a level-one market',async()=>{
  const {migrateFactionEconomy,fulfillContract}=await import('../../src/battle/economy');
  const w=scenario();w.factions[0].gold=200;w.factions[0].food=300;
  w.economy[0]=migrateFactionEconomy({city:2,market:1,miners:3,farmers:3,construction:null,contract:{kind:'relief',deadline:90},cooldown:0,completed:0,failed:0,exports:0},0)!;
  expect(fulfillContract(w,0)).toBe(true);expect(w.factions[0].gold).toBe(760);expect(w.factions[0].food).toBe(40);
  expect(w.economy[0].tradeGold).toBe(480);
 });
 it('rejects corrupt prototype economies rather than replacing them with a fresh city',()=>{
  const parsed=JSON.parse(encodeWar(createWar()));parsed.version=3;delete parsed.war.economy;
  parsed.war.factions[0].economy={city:1,market:0,miners:8,farmers:8,construction:null,contract:null,cooldown:0,completed:0,failed:0,exports:0};
  expect(decodeWar(JSON.stringify(parsed))).toBeNull();
 });
});
