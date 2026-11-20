// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { GhostRecorder, sanitizeGhost, readGhost, writeGhost } from '../../src/race/ghost';
import { wheelPixels, editableTarget } from '../../src/shared/input';
import { FrameGate } from '../../src/shared/frame-gate';
import { renderPixelRatio } from '../../src/shared/render-budget';
import { CITY_KEY, RTS_KEY, RACE_KEY, readCityCareer, readRtsRecords, readRaceRecords } from '../../src/records';
import { isDifficulty } from '../../src/rts/config';
import { newGame } from '../../src/tycoon/core/model';
import { restoreGame } from '../../src/tycoon/core/save';
import { readResumePosition } from '../../src/tycoon/scene/resume';
import { Colliders } from '../../src/tycoon/scene/layout';
afterEach(() => { localStorage.clear(); document.body.replaceChildren(); });
const pose = {x:1,z:2,h:0,total:3};
describe('arcade runtime bug fixes', () => {
  it('bounds long ghost recordings', () => {
    const r = new GhostRecorder();
    for (let i=0;i<51_000;i++) r.tick(i*.1,pose);
    expect(r.data.length).toBeLessThanOrEqual(199_996);
    expect(sanitizeGhost(r.finish(5100,1,pose))).toBeNull();
  });
  it('replaces the final exact-time sample despite floating point drift', () => {
    const r = new GhostRecorder();
    for (let i=0;i<4;i++) r.tick(i*.1,pose);
    const g=r.finish(.3,1,{...pose,x:9});
    expect(g.data.length).toBe(16);
    expect(sanitizeGhost(g)).not.toBeNull();
    expect(g.data.at(-4)).toBe(9);
  });
  it('rejects a nonfinite finish pose without overwriting a good replay', () => {
    const r = new GhostRecorder(); r.tick(0,pose); r.tick(.1,pose);
    const good=r.finish(.1,1,pose); writeGhost('sunset',1,'gt',good);
    writeGhost('sunset',1,'gt',r.finish(.1,1,{...pose,x:NaN}));
    expect(readGhost('sunset',1,'gt')).toEqual(good);
  });
  it('rejects sparse replay arrays and mismatched lap counts', () => {
    expect(sanitizeGhost({time:1,laps:1,data:new Array(8)})).toBeNull();
    const r=new GhostRecorder(); r.tick(0,pose); r.tick(.1,pose);
    writeGhost('sunset',2,'gt',r.finish(.1,1,pose));
    expect(readGhost('sunset',2,'gt')).toBeNull();
  });
  it('uses a safe page-wheel scale and rejects converted overflow', () => {
    expect(wheelPixels(2,2,NaN)).toBe(240);
    expect(wheelPixels(1,2,Infinity)).toBe(120);
    expect(wheelPixels(Number.MAX_VALUE,1)).toBe(0);
  });
  it('honors noneditable islands inside editable elements', () => {
    const wrap=document.createElement('div'); wrap.setAttribute('contenteditable','true');
    const inner=document.createElement('span'); inner.setAttribute('contenteditable','false'); wrap.append(inner); document.body.append(wrap);
    expect(editableTarget(wrap)).toBe(true); expect(editableTarget(inner)).toBe(false);
  });
  it('recovers a frame gate after a clock rollback', () => {
    const gate=new FrameGate(100); expect(gate.due(1000)).toBe(true); expect(gate.due(1050)).toBe(false); expect(gate.due(20)).toBe(true); expect(gate.due(100)).toBe(false); expect(gate.due(120)).toBe(true);
  });
  it('obeys physical pixel budgets even at 8K with invalid dimensions handled', () => {
    expect(renderPixelRatio(Infinity,0,1,'high')).toBe(1);
    const ratio=renderPixelRatio(7680,4320,2,'low'); expect(7680*4320*ratio*ratio).toBeLessThanOrEqual(1_500_001);
  });
  it('caps corrupt city and RTS career counters', () => {
    for(const key of [CITY_KEY,RTS_KEY]) localStorage.setItem(key,JSON.stringify({matches:1e100,wins:1e100}));
    expect(readCityCareer().matches).toBe(1e9); expect(readRtsRecords().matches).toBe(1e9);
  });
  it('recovers a legacy racing record if the v2 JSON is corrupt', () => {
    localStorage.setItem(RACE_KEY,JSON.stringify({best:12,bestRace:40}));
    localStorage.setItem('waldo.race.v2','{');
    expect(readRaceRecords().bestLap.sunset).toBe(12); expect(readRaceRecords().bestRace['sunset:3']).toBe(40);
  });
  it('rejects inherited difficulty names', () => {
    expect(isDifficulty('constructor')).toBe(false); expect(isDifficulty('toString')).toBe(false); expect(isDifficulty('normal')).toBe(true);
  });
  it('deduplicates staff and avoids reusing restored staff or delivery IDs', () => {
    const g=newGame(1), staff={id:'st12',name:'A',role:'clerk',skill:1};
    const raw={...g,nextId:1,lots:{...g.lots,lot_s1:{owner:'player',shop:{kind:'stall',level:2,staff:[staff,staff]}}},task:{id:'task20',jobId:'delivery',from:'job_delivery',target:'bench',reward:1,deadline:800}};
    const restored=restoreGame(raw)!;
    expect(restored.lots.lot_s1.shop?.staff).toHaveLength(1); expect(restored.nextId).toBe(21);
  });
  it('does not restore a player location from an unsupported save version', () => {
    const raw={v:2,position:{x:0,z:0,yaw:0}};
    expect(readResumePosition(raw,new Colliders())).toBeNull();
  });
});
