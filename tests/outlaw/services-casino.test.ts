import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { callCar, spawnOwned } from '../../src/outlaw/services';
import { collideBox } from '../../src/outlaw/world';
import { VEHICLES } from '../../src/outlaw/types';
import { Blackjack, handValue } from '../../src/outlaw/casino';
import { OutlawUi } from '../../src/outlaw/ui';

describe('owned vehicle dispatch', () => {
  it('does not charge or destroy the existing vehicle when no spawn location is available', () => {
    const s = new Sim(7); s.cash = 1000; s.life.cars = [{kind:'sedan',color:0xffffff}];
    const old = s.spawnVehicle('sedan',s.player.x+10,s.player.z,0,{tag:'owned',aux:100});
    s.map.lanes = [];
    expect(callCar(s,0)).not.toContain('도착'); expect(s.cash).toBe(1000); expect(s.vehicles).toContain(old);
  });
  it('spawns clear of buildings and other vehicles and refuses to delete an occupied car', () => {
    const s = new Sim(7); s.life.cars = [{kind:'sedan',color:0xffffff}]; expect(spawnOwned(s,0)).toBe(true);
    const v = s.vehicles.find(v=>v.tag==='owned')!, d=VEHICLES[v.kind];
    expect(collideBox(s.map,v.x,v.z,v.h,d.halfL,d.halfW)).toBeNull();
    v.driver=999; expect(spawnOwned(s,0)).toBe(false); expect(s.vehicles).toContain(v);
  });
});
describe('casino transaction state', () => {
  it('resolves natural dealer blackjack immediately across deterministic deck shuffles', () => {
    let found=0;
    for(let k=1;k<500;k++){
      let seed=k; const g=new Blackjack(()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},50);
      if(handValue(g.dealer)===21 && g.dealer.length===2){found++;expect(g.state).toBe(handValue(g.player)===21?'push':'lose');}
    }
    expect(found).toBeGreaterThan(0);
  });
  it('rejects invalid wagers and stale deal/double actions without deducting money',()=>{
    const s=new Sim(8); s.cash=10000; const ui=new OutlawUi(()=>s);
    ui.click({ui:'bet',id:'NaN'});expect(ui.bet).toBe(50);
    ui.bet=-50;ui.click({ui:'spin'});expect(s.cash).toBe(10000);
    ui.bet=50;ui.hilo={card:{rank:3,suit:1},streak:0,bet:50,state:'play'};ui.click({ui:'hdeal'});expect(s.cash).toBe(10000);
    const b=new Blackjack(()=>.5,50);b.state='lose';ui.bj=b;ui.click({ui:'double'});expect(s.cash).toBe(10000);
    b.state='play';ui.click({ui:'deal'});expect(s.cash).toBe(10000);
  });
});
