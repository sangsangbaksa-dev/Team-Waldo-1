import { describe, expect, it, vi, afterEach } from 'vitest';
import { createWar, research, stepWar, trainSquad, upgrade, type War } from '../../src/battle/war';
import { decodeWar, encodeWar, loadWar, saveWar, WAR_SAVE_KEY } from '../../src/battle/save';

const snapshot=(mutate:(w:War)=>void) => {
  const w=createWar();mutate(w);return encodeWar(w);
};
afterEach(()=>vi.unstubAllGlobals());

describe('versioned research and statistics saves',()=>{
  it('round-trips a progressed hard match without resetting research or counters',()=>{
    const w=createWar({difficulty:'hard'});
    w.factions[0].gold=1000;w.factions[0].food=1000;
    upgrade(w,0,'barracks');research(w,0,'weapons');research(w,0,'logistics');
    trainSquad(w,0,'archer',3);
    for(let i=0;i<400;i++)stepWar(w,.1);
    expect(decodeWar(encodeWar(w))).toEqual(w);
    expect(JSON.parse(encodeWar(w)).version).toBe(3);
  });

  it('migrates an actual v1 snapshot and preserves its armies, resources, and orders',()=>{
    const w=createWar();
    w.factions[0].gold=1000;w.factions[0].food=1000;
    trainSquad(w,0,'infantry',3);
    w.factions[0].rally=8;
    const legacy=JSON.parse(JSON.stringify(w));
    delete legacy.difficulty;delete legacy.stats;
    for(const f of legacy.factions)delete f.research;
    const restored=decodeWar(JSON.stringify({version:1,war:legacy}));
    expect(restored).not.toBeNull();
    expect(restored?.difficulty).toBe('normal');
    expect(restored?.units).toEqual(w.units);
    expect(restored?.factions[0].gold).toBe(w.factions[0].gold);
    expect(restored?.factions[0].rally).toBe(8);
    expect(restored?.factions[0].research).toEqual({weapons:0,armor:0,logistics:0});
    expect(restored?.stats[0].peakArmy).toBe(7);
    expect(restored?.stats[0].trained).toBe(0);
    expect(decodeWar(encodeWar(restored!))).toEqual(restored);
  });

  it('rejects missing, impossible, and non-finite new fields',()=>{
    expect(decodeWar(snapshot(w=>{delete (w as Partial<War>).difficulty;}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.difficulty='impossible' as never;}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.factions[0].research.armor=4;}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.factions[0].research.armor=1;}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.stats[0].goldEarned=Infinity;}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.stats[0].kills=-1;}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.stats[0].peakArmy=1;}))).toBeNull();
  });

  it('rejects HTML event injection and inconsistent alive or winner state',()=>{
    expect(decodeWar(snapshot(w=>{w.events=[{time:0,text:'<img src=x onerror=alert(1)>'}];}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.events=[{time:1,text:'미래 기록'}];}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.factions[0].alive=false;}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.winner=0;}))).toBeNull();
    expect(decodeWar(snapshot(w=>{w.over=true;w.winner=0;}))).toBeNull();
  });

  it('never overwrites a valid save with unrestorable state',()=>{
    const store=new Map<string,string>();
    vi.stubGlobal('localStorage',{
      getItem:(key:string)=>store.get(key)??null,
      setItem:(key:string,value:string)=>store.set(key,value),
      removeItem:(key:string)=>store.delete(key),
    });
    const w=createWar();
    expect(saveWar(w)).toBe(true);
    const saved=store.get(WAR_SAVE_KEY);
    w.stats[0].kills=-1;
    expect(saveWar(w)).toBe(false);
    expect(store.get(WAR_SAVE_KEY)).toBe(saved);
    expect(loadWar()?.stats[0].kills).toBe(0);
  });

  it('restores finished battles with the correct winner and supports draws',()=>{
    const w=createWar();
    w.units=w.units.filter(unit=>unit.owner===0);
    for(const f of w.factions.slice(1)){f.hp=0;f.alive=false;f.target=null;f.rally=null;}
    w.over=true;w.winner=0;
    expect(decodeWar(encodeWar(w))?.winner).toBe(0);
    w.factions[0].hp=0;w.factions[0].alive=false;w.units=[];w.winner=null;
    expect(decodeWar(encodeWar(w))?.winner).toBeNull();
    w.winner=1;
    expect(decodeWar(encodeWar(w))).toBeNull();
  });
});
