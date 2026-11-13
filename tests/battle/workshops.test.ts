import { describe, expect, it } from 'vitest';
import { upgradeWorkshop, workshopCost, workshopLevel } from '../../src/battle/base';
import { interiorOption, performInteriorAction } from '../../src/battle/interiorActions';
import { decodeWar, encodeWar } from '../../src/battle/save';
import { createWar, getIncome, stepWar, upgrade } from '../../src/battle/war';

describe('permanent facility workshops',()=>{
  it('spends resources once, increases income and persists interior upgrades',()=>{
    const w=createWar(),before=getIncome(w,0),f=w.factions[0];
    expect(workshopCost(w,'mine')).toEqual({gold:75,food:30});
    expect(interiorOption(w,'mine','workshop')?.enabled).toBe(true);
    expect(performInteriorAction(w,'mine','workshop')).toBe(true);
    expect(workshopLevel(w,'mine')).toBe(1);
    expect(getIncome(w,0).gold).toBeCloseTo(before.gold+.8);
    expect(f.gold).toBe(65);
    expect(f.food).toBe(70);
    expect(performInteriorAction(w,'mine','workshop')).toBe(false);
    expect(f.gold).toBe(65);
    expect(decodeWar(encodeWar(w))).toEqual(w);
    f.gold=1000;f.food=1000;
    expect(upgrade(w,0,'mine')).toBe(true);
    expect(upgradeWorkshop(w,'mine')).toBe(true);
    expect(workshopLevel(w,'mine')).toBe(2);
    expect(decodeWar(encodeWar(w))?.base?.workshopLevels?.mine).toBe(2);
  });
  it('adds specialized farm production on top of policies and logistics',()=>{
    const w=createWar(),before=getIncome(w,0);
    expect(upgradeWorkshop(w,'farm')).toBe(true);
    expect(getIncome(w,0).food).toBeCloseTo(before.food+.75);
    expect(getIncome(w,1).food).toBeCloseTo(createWar().factions[1].farm*1.3);
  });
  it('boosts soldier damage and fort turret damage in the actual simulation',()=>{
    const base=createWar(),powered=createWar();
    powered.factions[0].gold=1000;powered.factions[0].food=1000;
    expect(upgradeWorkshop(powered,'barracks')).toBe(true);
    for(const w of [base,powered]){
      const ally=w.units.find(u=>u.owner===0)!;
      const enemy=w.units.find(u=>u.owner===1)!;
      ally.x=0;ally.z=0;ally.cooldown=0;
      enemy.x=1;enemy.z=0;enemy.cooldown=5;
      w.units=[ally,enemy];
      w.factions.forEach(f=>{f.aiTimer=100;f.turretCooldown=100});
    }
    stepWar(base,.025);stepWar(powered,.025);
    expect(powered.units.find(u=>u.owner===1)!.hp).toBeLessThan(base.units.find(u=>u.owner===1)!.hp);

    const unmodified=createWar(),fortified=createWar();
    fortified.factions[0].gold=1000;fortified.factions[0].food=1000;
    expect(upgradeWorkshop(fortified,'fort')).toBe(true);
    for(const w of [unmodified,fortified]){
      const foe=w.units.find(u=>u.owner===1)!;
      foe.x=w.factions[0].x+4;foe.z=w.factions[0].z+4;foe.cooldown=8;
      w.units=[foe];w.factions.forEach(f=>{f.aiTimer=100;f.turretCooldown=f.id===0?0:100});
    }
    stepWar(unmodified,.025);stepWar(fortified,.025);
    expect(fortified.units[0].hp).toBeLessThan(unmodified.units[0].hp);
  });
  it('retains old saves and rejects invalid workshop tiers',()=>{
    const w=createWar();
    const old=JSON.parse(encodeWar(w));
    delete old.war.base.workshopLevels;
    const restored=decodeWar(JSON.stringify(old));
    expect(restored).not.toBeNull();
    expect(workshopLevel(restored!,'mine')).toBe(0);
    for(const value of [-1,3,99,'3',null]){
      const payload=JSON.parse(encodeWar(w));
      payload.war.base.workshopLevels.mine=value;
      expect(decodeWar(JSON.stringify(payload))).toBeNull();
    }
    const before=encodeWar(w);
    expect(upgradeWorkshop(w,'factory' as never)).toBe(false);
    expect(encodeWar(w)).toBe(before);
  });
});