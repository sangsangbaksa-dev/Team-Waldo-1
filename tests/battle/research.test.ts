import { describe, expect, it } from 'vitest';
import {
  captureOrder, createWar, getIncome, research, researchCost, RESEARCH,
  setPolicy, stepWar, stormDamage, train, trainSquad, upgrade,
} from '../../src/battle/war';

const rich = () => {
  const w=createWar(),f=w.factions[0];
  f.gold=10000;f.food=10000;
  w.factions.slice(1).forEach(other=>{other.aiTimer=9999;});
  return w;
};
const duel = () => {
  const w=createWar();
  const a=w.units.find(u=>u.owner===0)!,b=w.units.find(u=>u.owner===1)!;
  w.units=[a,b];a.x=0;a.z=0;b.x=2;b.z=0;
  for(const f of w.factions){f.aiTimer=9999;f.barracks=2;f.gold=10000;f.food=10000;}
  return w;
};

describe('kingdom research and match statistics',()=>{
  it('requires a level-two barracks, charges escalating costs, and caps each technology',()=>{
    const w=rich(),f=w.factions[0];
    expect(research(w,0,'weapons')).toBe(false);
    expect(f.gold).toBe(10000);
    expect(upgrade(w,0,'barracks')).toBe(true);
    const first=researchCost(f,'weapons'),gold=f.gold,food=f.food;
    expect(first).toEqual({gold:80,food:50});
    expect(research(w,0,'weapons')).toBe(true);
    expect(f.gold).toBe(gold-first.gold);
    expect(f.food).toBe(food-first.food);
    expect(researchCost(f,'weapons')).toEqual({gold:160,food:100});
    expect(research(w,0,'weapons')).toBe(true);
    expect(research(w,0,'weapons')).toBe(true);
    const cappedGold=f.gold;
    expect(research(w,0,'weapons')).toBe(false);
    expect(f.gold).toBe(cappedGold);
    expect(f.research.weapons).toBe(RESEARCH.weapons.maxLevel);
    expect(w.stats[0].researches).toBe(3);
  });

  it('rejects unaffordable, invalid, eliminated, and finished research atomically',()=>{
    const w=rich(),f=w.factions[0];f.barracks=2;f.gold=0;
    const snapshot=JSON.stringify(w);
    expect(research(w,0,'armor')).toBe(false);
    expect(research(w,0,'__proto__' as never)).toBe(false);
    expect(research(w,99,'armor')).toBe(false);
    expect(JSON.stringify(w)).toBe(snapshot);
    f.gold=1000;f.alive=false;
    expect(research(w,0,'armor')).toBe(false);
    f.alive=true;w.over=true;
    expect(research(w,0,'armor')).toBe(false);
  });

  it('increases actual unit damage by 12 percent for each weapons level',()=>{
    const baseline=duel(),improved=duel();
    expect(research(improved,0,'weapons')).toBe(true);
    const before=baseline.units[1].hp;
    stepWar(baseline,.05);stepWar(improved,.05);
    const regularDamage=before-baseline.units[1].hp;
    const advancedDamage=before-improved.units[1].hp;
    expect(advancedDamage).toBeCloseTo(regularDamage*1.12);
    expect(improved.stats[0].damageDealt).toBeCloseTo(advancedDamage);
  });

  it('reduces actual incoming combat damage by 8 percent for each armor level',()=>{
    const baseline=duel(),improved=duel();
    expect(research(improved,1,'armor')).toBe(true);
    expect(research(improved,1,'armor')).toBe(true);
    const before=baseline.units[1].hp;
    stepWar(baseline,.05);stepWar(improved,.05);
    expect(before-improved.units[1].hp).toBeCloseTo((before-baseline.units[1].hp)*.84);
  });

  it('applies logistics bonuses to movement and every income source',()=>{
    const baseline=rich(),improved=rich();
    for(const w of [baseline,improved]){
      w.factions[0].barracks=2;
      w.units=w.units.filter(u=>u.owner===0);
      w.outposts[0].owner=0;
      captureOrder(w,0,4);setPolicy(w,0,'growth');
    }
    expect(research(improved,0,'logistics')).toBe(true);
    const initial={x:baseline.units[0].x,z:baseline.units[0].z};
    expect(getIncome(improved,0).gold).toBeCloseTo(getIncome(baseline,0).gold*1.06);
    expect(getIncome(improved,0).food).toBeCloseTo(getIncome(baseline,0).food*1.06);
    stepWar(baseline,.1);stepWar(improved,.1);
    const moved=(w:typeof baseline)=>Math.hypot(w.units[0].x-initial.x,w.units[0].z-initial.z);
    expect(moved(improved)).toBeCloseTo(moved(baseline)*1.08);
  });

  it('counts purchased units and investments without counting starting resources',()=>{
    const w=rich();
    expect(w.stats[0].trained).toBe(0);
    expect(w.stats[0].goldEarned).toBe(0);
    expect(trainSquad(w,0,'infantry',3)).toBe(true);
    expect(w.stats[0].trained).toBe(3);
    expect(w.stats[0].peakArmy).toBe(7);
    expect(upgrade(w,0,'mine')).toBe(true);
    expect(w.stats[0].upgrades).toBe(1);
    const income=getIncome(w,0);
    stepWar(w,.1);
    expect(w.stats[0].goldEarned).toBeCloseTo(income.gold*.1);
    expect(w.stats[0].foodEarned).toBeCloseTo(income.food*.1);
  });

  it('credits a kill once and excludes overkill from damage statistics',()=>{
    const w=duel();w.units[1].hp=1;
    stepWar(w,.05);
    expect(w.stats[0].kills).toBe(1);
    expect(w.stats[0].damageDealt).toBe(1);
    expect(w.stats[1].lost).toBe(1);
    stepWar(w,.05);
    expect(w.stats[0].kills).toBe(1);
    expect(w.stats[1].lost).toBe(1);
  });

  it('credits captures and protects HQs with diminishing, capped territory supply',()=>{
    const w=rich(),post=w.outposts[4];
    w.units=w.units.filter(u=>u.owner===0);
    for(const unit of w.units){unit.x=post.x;unit.z=post.z;}
    captureOrder(w,0,4);post.progress=99.5;post.contender=0;
    stepWar(w,.1);
    expect(w.stats[0].captures).toBe(1);
    w.time=200;w.zone=100;
    expect(stormDamage(w,0)).toBeCloseTo(3.5*.88);
    for(const p of w.outposts)p.owner=0;
    expect(stormDamage(w,0)).toBeCloseTo(3.5*.4);
    w.zone=400;
    expect(stormDamage(w,0)).toBe(0);
  });

  it('does not credit a last-moment capture to an army whose HQ has already fallen',()=>{
    const w=rich(),post=w.outposts[4];
    w.time=900;w.factions[0].hp=.001;
    post.progress=99.9;post.contender=0;
    for(const unit of w.units.filter(u=>u.owner===0)){unit.x=post.x;unit.z=post.z;}
    stepWar(w,.1);
    expect(w.factions[0].alive).toBe(false);
    expect(post.owner).toBeNull();
    expect(post.contender).toBeNull();
    expect(w.stats[0].captures).toBe(0);
    expect(w.stats[0].lost).toBe(4);
  });

  it('does not allow malformed upgrades or unit kinds to poison the economy',()=>{
    const w=rich(),before=JSON.stringify(w);
    expect(upgrade(w,0,'invalid' as never)).toBe(false);
    expect(train(w,0,'__proto__' as never)).toBe(false);
    expect(trainSquad(w,0,'constructor' as never,3)).toBe(false);
    expect(JSON.stringify(w)).toBe(before);
  });
});

describe('transparent deterministic difficulty',()=>{
  it('gives every faction equal starting resources and modifies only AI income and decisions',()=>{
    const easy=createWar({difficulty:'easy'}),normal=createWar(),hard=createWar({difficulty:'hard'});
    for(const w of [easy,normal,hard]){
      expect(w.factions.every(f=>f.gold===140&&f.food===100)).toBe(true);
      expect(w.units).toHaveLength(16);
      expect(getIncome(w,0).gold).toBeCloseTo(w.difficulty==='easy'?1.5*1.35:1.5);
      expect(getIncome(w,0).food).toBeCloseTo(w.difficulty==='easy'?1.3*1.35:1.3);
    }
    expect(getIncome(easy,1).gold).toBeCloseTo(1.5*.55);
    expect(getIncome(hard,1).gold).toBeCloseTo(1.5*1.2);
    expect(easy.factions[1].aiTimer).toBeCloseTo(normal.factions[1].aiTimer*1.7);
    expect(hard.factions[1].aiTimer).toBeCloseTo(normal.factions[1].aiTimer*.8);
  });

  it('has repeatable outcomes across long identical command sequences',()=>{
    const a=createWar({difficulty:'hard'}),b=createWar({difficulty:'hard'});
    for(let tick=0;tick<2000;tick++){
      for(const w of [a,b]){
        if(tick%200===0)train(w,0);
        if(tick===10)captureOrder(w,0,5);
        if(tick===400)upgrade(w,0,'barracks');
        if(tick===800)research(w,0,'logistics');
        stepWar(w,.1);
      }
    }
    expect(a).toEqual(b);
    expect(a.stats[1].goldEarned).toBeGreaterThan(100);
    expect(a.outposts.some(post=>post.owner!==null)).toBe(true);
  });
});
