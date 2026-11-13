import { describe, expect, it } from 'vitest';
import { createWar, getIncome, upgrade, type War } from '../../src/battle/war';
import { decodeWar, encodeWar } from '../../src/battle/save';
import {
  BASE_BUILDINGS, GENERAL_CATALOG, HQ_SLOT, assignGeneral, baseBuildingPrice,
  activateGeneralAbility, canPlaceBuilding, generalAbilityState, generalBonus, getBaseState,
  incomeGeneralBonus, placeBaseBuilding, recruitGeneral, relocateBaseBuilding,
} from '../../src/battle/base';

describe('buildable home base',()=>{
  it('starts with a central keep and four faithfully placed starting facilities',()=>{
    const w=createWar(),base=getBaseState(w);
    expect(HQ_SLOT).toBe(12);
    expect(base.structures).toHaveLength(4);
    expect(new Set(base.structures.map(x=>x.slot)).size).toBe(4);
    expect(new Set(base.structures.map(x=>x.kind))).toEqual(new Set(BASE_BUILDINGS.map(x=>x.kind)));
    expect(base.generals).toHaveLength(0);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('charges the actual economy price once and immediately increases production',()=>{
    const w=createWar(),f=w.factions[0],before=getIncome(w,0).gold;
    expect(baseBuildingPrice(w,'mine')).toEqual({gold:60,food:20});
    expect(canPlaceBuilding(w,'mine',0)).toBe(true);
    expect(placeBaseBuilding(w,'mine',0)).toBe(true);
    expect(f.gold).toBe(80);
    expect(f.food).toBe(80);
    expect(f.mine).toBe(2);
    expect(getIncome(w,0).gold).toBeCloseTo(before+1.5);
    expect(w.stats[0].upgrades).toBe(1);
    expect(getBaseState(w).structures.some(s=>s.kind==='mine'&&s.slot===0)).toBe(true);
    expect(placeBaseBuilding(w,'mine',0)).toBe(false);
    expect(f.gold).toBe(80);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('rejects occupied, central, out-of-bounds, unaffordable, and max-level slots',()=>{
    const w=createWar();
    for(const slot of [HQ_SLOT,-1,25,1.5,6]){
      const gold=w.factions[0].gold;
      expect(placeBaseBuilding(w,'farm',slot)).toBe(false);
      expect(w.factions[0].gold).toBe(gold);
    }
    w.factions[0].gold=0;
    expect(placeBaseBuilding(w,'farm',0)).toBe(false);
    w.factions[0].gold=3000;w.factions[0].food=3000;
    expect(placeBaseBuilding(w,'fort',0)).toBe(true);
    expect(w.factions[0].maxHp).toBe(500);
    expect(w.factions[0].hp).toBe(500);
    expect(placeBaseBuilding(w,'fort',1)).toBe(true);
    expect(placeBaseBuilding(w,'fort',2)).toBe(true);
    expect(w.factions[0].fort).toBe(4);
    expect(placeBaseBuilding(w,'fort',3)).toBe(false);
  });

  it('keeps the older economy tab aligned to the physical blueprint',()=>{
    const w=createWar();w.factions[0].gold=1000;w.factions[0].food=1000;
    expect(upgrade(w,0,'farm')).toBe(true);
    expect(getBaseState(w).structures.filter(s=>s.kind==='farm')).toHaveLength(2);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('recruits four unique generals, assigns them to single squads and applies buffs',()=>{
    const w=createWar();w.factions[0].gold=3000;w.factions[0].food=3000;
    expect(GENERAL_CATALOG).toHaveLength(4);
    expect(recruitGeneral(w,'leon')).toBe(true);
    expect(recruitGeneral(w,'leon')).toBe(false);
    expect(recruitGeneral(w,'sora')).toBe(true);
    expect(recruitGeneral(w,'mira')).toBe(true);
    expect(assignGeneral(w,'leon',0)).toBe(true);
    expect(assignGeneral(w,'sora',1)).toBe(true);
    expect(assignGeneral(w,'mira',2)).toBe(true);
    const player=w.units.filter(u=>u.owner===0);
    const sword=player[0];
    expect(generalBonus(w,sword,'damage')).toBe(.18);
    expect(generalBonus(w,sword,'speed')).toBe(0);
    sword.squad=1;
    expect(generalBonus(w,sword,'speed')).toBe(.20);
    sword.squad=2;
    expect(generalBonus(w,sword,'armor')).toBe(.15);
    expect(assignGeneral(w,'leon',1)).toBe(true);
    expect(getBaseState(w).generals.find(g=>g.id==='sora')?.squad).toBeNull();
    expect(assignGeneral(w,'leon',null)).toBe(true);
    expect(generalBonus(w,sword,'damage')).toBe(0);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('applies the logistics general globally without allowing military assignment',()=>{
    const w=createWar(),before=getIncome(w,0);
    expect(recruitGeneral(w,'han')).toBe(false);
    w.factions[0].gold=2000;w.factions[0].food=2000;
    expect(recruitGeneral(w,'han')).toBe(true);
    expect(incomeGeneralBonus(w,0)).toBe(.12);
    expect(incomeGeneralBonus(w,1)).toBe(0);
    expect(getIncome(w,0).gold).toBeCloseTo(before.gold*1.12);
    expect(getIncome(w,0).food).toBeCloseTo(before.food*1.12);
    expect(assignGeneral(w,'han',0)).toBe(false);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('moves an existing structure without paying or changing its economic output',()=>{
    const w=createWar(),before=JSON.stringify(w.factions[0]),income=getIncome(w,0);
    expect(relocateBaseBuilding(w,6,0)).toBe(true);
    expect(w.base!.structures.find(s=>s.kind==='mine')?.slot).toBe(0);
    expect(relocateBaseBuilding(w,0,8)).toBe(false);
    expect(relocateBaseBuilding(w,0,12)).toBe(false);
    expect(relocateBaseBuilding(w,0,25)).toBe(false);
    expect(relocateBaseBuilding(w,0,0)).toBe(false);
    expect(relocateBaseBuilding(w,6,4)).toBe(false);
    expect(JSON.stringify(w.factions[0])).toBe(before);
    expect(getIncome(w,0)).toEqual(income);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('activates combat tactics only for assigned generals with timed effects and cooldowns',()=>{
    const w=createWar();w.factions[0].gold=2000;w.factions[0].food=2000;
    expect(activateGeneralAbility(w,'leon')).toBe(false);
    expect(recruitGeneral(w,'leon')).toBe(true);
    expect(activateGeneralAbility(w,'leon')).toBe(false);
    expect(assignGeneral(w,'leon',1)).toBe(true);
    const soldier=w.units[0];soldier.squad=1;
    expect(generalAbilityState(w,'leon').ready).toBe(true);
    expect(activateGeneralAbility(w,'leon')).toBe(true);
    expect(generalBonus(w,soldier,'damage')).toBeCloseTo(.43);
    expect(activateGeneralAbility(w,'leon')).toBe(false);
    expect(generalAbilityState(w,'leon').activeFor).toBe(10);
    w.time=10;
    expect(generalBonus(w,soldier,'damage')).toBe(.18);
    expect(generalAbilityState(w,'leon').cooldownFor).toBe(30);
    expect(activateGeneralAbility(w,'leon')).toBe(false);
    w.time=40;
    expect(activateGeneralAbility(w,'leon')).toBe(true);
    expect(generalAbilityState(w,'leon').activeFor).toBe(10);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('boosts logistics income temporarily and rejects forged ability timers',()=>{
    const w=createWar();w.factions[0].gold=3000;w.factions[0].food=3000;
    const before=getIncome(w,0);
    expect(recruitGeneral(w,'han')).toBe(true);
    expect(activateGeneralAbility(w,'han')).toBe(true);
    expect(incomeGeneralBonus(w,0)).toBeCloseTo(.30);
    expect(getIncome(w,0).gold).toBeCloseTo(before.gold*1.30);
    w.time=12;
    expect(incomeGeneralBonus(w,0)).toBeCloseTo(.12);
    expect(activateGeneralAbility(w,'han')).toBe(false);
    const tamper=(change:(w:War)=>void)=>{
      const saved=JSON.parse(encodeWar(w)) as {war:War};
      change(saved.war);return decodeWar(JSON.stringify(saved));
    };
    expect(tamper(x=>{x.base!.generals[0].readyAt=Infinity;})).toBeNull();
    expect(tamper(x=>{x.base!.generals[0].activeUntil=999;})).toBeNull();
    expect(tamper(x=>{delete x.base!.generals[0].readyAt;})).toBeNull();
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('migrates v2 normal and grand saves while retaining purchased upgrades',()=>{
    for(const grandBattle of [false,true]){
      const w=createWar({grandBattle});
      w.factions[0].gold=5000;w.factions[0].food=5000;
      expect(upgrade(w,0,'mine')).toBe(true);
      const legacy=JSON.parse(encodeWar(w));
      legacy.version=2;delete legacy.war.base;
      const restored=decodeWar(JSON.stringify(legacy));
      expect(restored).not.toBeNull();
      expect(restored!.factions[0].mine).toBe(w.factions[0].mine);
      for(const key of ['mine','farm','barracks','fort'] as const)
        expect(getBaseState(restored!).structures.filter(x=>x.kind===key)).toHaveLength(w.factions[0][key]);
      expect(decodeWar(encodeWar(restored!))).toEqual(restored);
    }
  });

  it('rejects corrupted structure placements and duplicate commanders in v3 saves',()=>{
    const w=createWar();w.factions[0].gold=5000;w.factions[0].food=5000;
    recruitGeneral(w,'leon');recruitGeneral(w,'sora');assignGeneral(w,'leon',0);assignGeneral(w,'sora',1);
    const mutate=(change:(clone:War)=>void)=>{
      const copy=JSON.parse(encodeWar(w)) as {version:number;war:War};
      change(copy.war);return decodeWar(JSON.stringify(copy));
    };
    expect(mutate(x=>{x.base!.structures[0].slot=12;})).toBeNull();
    expect(mutate(x=>{x.base!.structures[0].slot=x.base!.structures[1].slot;})).toBeNull();
    expect(mutate(x=>{x.base!.structures.pop();})).toBeNull();
    expect(mutate(x=>{x.base!.generals.push({id:'leon',squad:2});})).toBeNull();
    expect(mutate(x=>{x.base!.generals[1].squad=0;})).toBeNull();
  });
});
