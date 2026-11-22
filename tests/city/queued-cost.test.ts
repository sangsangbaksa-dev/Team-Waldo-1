import {describe,it,expect} from 'vitest';
import {World} from '../../src/city/world';

const make=()=>new World({seed:17,difficulty:'d4',klass:'tycoon',tutorial:true});
describe('LAST CITY queued-cost refund integrity',()=>{
  it('refunds the actual paid second-tier research cost when its laboratory is destroyed',()=>{
    const w=make(),f=w.factions[0],hq=w.hq(0)!;
    f.crystal=5000;f.cash=5000;
    const first=w.addStructure('lab',0,hq.x+230,hq.y,true);
    const second=w.addStructure('lab',0,hq.x+340,hq.y,true);
    const before={cash:f.cash,crystal:f.crystal};
    expect(w.research(0,'eco')).toBe('');
    expect(w.research(0,'eco')).toBe('');
    expect(first.queue.some(q=>q.research==='eco')).toBe(true);
    expect(second.queue.some(q=>q.research==='eco')).toBe(true);
    const spent=first.queue[0];
    expect(second.queue[0].paidCrystal).toBeGreaterThan(spent.paidCrystal!);
    w.hurtStruct(second,1e6,-1);
    expect(f.crystal).toBe(before.crystal-spent.paidCrystal!);
    expect(f.cash).toBe(before.cash-spent.paidCash!);
    expect(first.alive).toBe(true);
  });
  it('refunds unit training based on the price paid at queue time, not a later perk',()=>{
    const w=make(),f=w.factions[0],hq=w.hq(0)!;
    w.addStructure('barracks',0,hq.x+250,hq.y,true);
    f.crystal=3000;f.cash=3000;f.mods.cost=.65;
    const initial={cash:f.cash,crystal:f.crystal};
    expect(w.train(0,'rifle')).toBe('');
    const host=w.structures.find(s=>s.alive&&s.f===0&&s.queue.some(q=>q.unit==='rifle'))!;
    expect(host).toBeTruthy();
    const paid=host.queue.find(q=>q.unit==='rifle')!.paidCrystal!;
    expect(paid).toBe(Math.round(60*.65));
    f.mods.cost=1.8;w.hurtStruct(host,1e6,-1);
    expect(f.crystal).toBe(initial.crystal);
    expect(f.cash).toBe(initial.cash);
  });
});
