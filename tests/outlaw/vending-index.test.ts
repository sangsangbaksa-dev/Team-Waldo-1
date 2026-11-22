import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { nearVending, buySnack } from '../../src/outlaw/services';

describe('OUTLAW indexed vending prompts', () => {
  it('finds the actual kiosk on a large generated city without scanning unrelated props', () => {
    const sim = new Sim(77), p=sim.player;
    const kiosk=sim.map.props.find(q=>q.kind==='kiosk'||q.kind==='vending')!;
    expect(kiosk).toBeDefined();
    p.x=kiosk.x; p.z=kiosk.z; p.hp=p.maxHp-50;
    for(let i=0;i<100;i++) expect(nearVending(sim)).toBe(true);
    const cash=sim.cash;
    expect(buySnack(sim)).toContain('음료 구입');
    expect(sim.cash).toBeLessThan(cash);
    expect(p.hp).toBeGreaterThan(p.maxHp-50);
    p.vehicle=1; expect(nearVending(sim)).toBe(false);
    p.vehicle=0; p.hp=p.maxHp; expect(nearVending(sim)).toBe(false);
  });
  it('invalidates its spatial index when static props are appended or replaced', () => {
    const sim=new Sim(81), p=sim.player;
    p.hp=p.maxHp-30;
    p.x=sim.map.half+100; p.z=sim.map.half+100;
    expect(nearVending(sim)).toBe(false);
    sim.map.props.push({kind:'vending',x:p.x,z:p.z,ry:0,r:0.25,scale:1});
    expect(nearVending(sim)).toBe(true);
    sim.map.props=[];
    expect(nearVending(sim)).toBe(false);
  });
});
