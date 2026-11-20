// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ShooterNet, parsePose, parseShot} from '../../src/shooter/net';
import {ShooterRoomNet} from '../../src/shooter/room';
import {RacePvp} from '../../src/race/pvp';
import {RaceMulti} from '../../src/race/multi';
import {parseSnap, followSnap} from '../../src/race/netcar';
import {parseLoot} from '../../src/shooter/sync';
import type {PvpSession, RoomSession} from '../../src/net/lobby';
import type {NetMsg} from '../../src/net/types';
import type {CarState} from '../../src/race/physics';
const disposers: (()=>void)[]=[];
afterEach(()=>{ for(const f of disposers.splice(0))f(); vi.useRealTimers(); });
function link(host=false) {
 let incoming:(m:NetMsg)=>void=()=>{};
 const sent:NetMsg[]=[];
 const value={host,me:{id:host?'a':'b'},room:{host_id:'a'},players:[{id:'a'},{id:'b'},{id:'c'}],
 open:(on:(m:NetMsg)=>void)=>{incoming=on;return {ready:Promise.resolve(),send:(m:NetMsg)=>sent.push(m),close:vi.fn()}}};
 return {pvp:value as unknown as PvpSession,room:value as unknown as RoomSession,sent,receive:(m:NetMsg)=>incoming(m)};
}
const shooterHooks=()=>({onStart:vi.fn(),onPose:vi.fn(),onShot:vi.fn(),onHitAck:vi.fn(),onPickup:vi.fn(),onDead:vi.fn(),onGone:vi.fn()});
const roomHooks=()=>({onStart:vi.fn(),onPose:vi.fn(),onShot:vi.fn(),onPickup:vi.fn(),onDead:vi.fn(),onGone:vi.fn(),onAbort:vi.fn(),onData:vi.fn()});
const raceHooks=()=>({onStart:vi.fn(),onSnap:vi.fn(),onFinish:vi.fn(),onGone:vi.fn(),onAbort:vi.fn()});
const pose:NetMsg={t:'p',x:0,z:0,yaw:0,pitch:0,hp:100,ar:0,w:'pistol',sp:0};
const shot:NetMsg={t:'sh',w:'pistol',ox:0,oy:1,oz:0,e:[1,1,0]};
describe('network lifecycle and packet regressions',()=>{
 it('resends a lost shooter start packet without starting the host twice',()=>{
  const l=link(true),h=shooterHooks(),n=new ShooterNet(l.pvp,h);disposers.push(()=>n.dispose());
  l.receive({t:'hello'});l.receive({t:'hello'});
  expect(l.sent.filter(m=>m.t==='start')).toHaveLength(2);expect(h.onStart).toHaveBeenCalledTimes(1);
 });
 it('notifies a shooter peer who leaves before the match begins',()=>{
  const l=link(),h=shooterHooks(),n=new ShooterNet(l.pvp,h);disposers.push(()=>n.dispose());
  l.receive({t:'bye'});expect(h.onGone).toHaveBeenCalledWith('bye');
 });
 it('ignores shooter packets and pending ready callback after disposal',async()=>{
  const l=link(),h=shooterHooks(),n=new ShooterNet(l.pvp,h);n.dispose();await Promise.resolve();
  l.receive({t:'start'});l.receive(pose);n.sendPickup(1);expect(h.onStart).not.toHaveBeenCalled();expect(h.onPose).not.toHaveBeenCalled();expect(l.sent).toEqual([]);
 });
 it('rejects sparse shots and vehicle poses',()=>{
  expect(parseShot({...shot,e:new Array(3)})).toBeNull();expect(parsePose({...pose,vs:new Array(4)})?.vs).toBeUndefined();
 });
 it('ignores fractional pickup identifiers',()=>{
  const l=link(),h=shooterHooks(),n=new ShooterNet(l.pvp,h);disposers.push(()=>n.dispose());l.receive({t:'start'});
  l.receive({t:'pk',i:1.5});l.receive({t:'pk',i:2});expect(h.onPickup).toHaveBeenCalledTimes(1);expect(h.onPickup).toHaveBeenCalledWith(2);
 });
 it('rejects duplicate, missing-host and wrong-authority shooter rosters',()=>{
  const l=link(),h=roomHooks(),n=new ShooterRoomNet(l.room,h);disposers.push(()=>n.dispose());
  for(const list of [['a','b','b'],['b','c'],['b','a']])l.receive({t:'start',f:'a',list});
  expect(h.onStart).not.toHaveBeenCalled();l.receive({t:'start',f:'a',list:['a','b']});expect(h.onStart).toHaveBeenCalledTimes(1);
 });
 it('excludes nonselected room participants from damage, movement and world data',()=>{
  const l=link(),h=roomHooks(),n=new ShooterRoomNet(l.room,h);disposers.push(()=>n.dispose());l.receive({t:'start',f:'a',list:['a','b']});
  l.receive({...pose,f:'c'});l.receive({...shot,f:'c'});l.receive({t:'w',f:'c'});l.receive({t:'pk',f:'a',i:1.5});
  expect(h.onPose).not.toHaveBeenCalled();expect(h.onShot).not.toHaveBeenCalled();expect(h.onData).not.toHaveBeenCalled();expect(h.onPickup).not.toHaveBeenCalled();
 });
 it('ignores packets arriving after a shooter room closes',async()=>{
  const l=link(),h=roomHooks(),n=new ShooterRoomNet(l.room,h);n.dispose();await Promise.resolve();
  l.receive({t:'start',f:'a',list:['a','b']});expect(h.onStart).not.toHaveBeenCalled();expect(l.sent).toEqual([]);
 });
 it('keeps a racing duel alive between frame updates',()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});
  const l=link(),h=raceHooks(),n=new RacePvp(l.pvp,'arc',h);disposers.push(()=>n.dispose());l.receive({t:'start',car:'arc'});
  vi.advanceTimersByTime(2500);expect(l.sent.some(m=>m.t==='ka')).toBe(true);expect(h.onGone).not.toHaveBeenCalled();
 });
 it('keeps a racing room alive between frame updates',()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});
  const l=link(),h=raceHooks(),n=new RaceMulti(l.room,'arc',h);disposers.push(()=>n.dispose());l.receive({t:'start',f:'a',list:[{id:'a',car:'arc'},{id:'b',car:'arc'}]});
  vi.advanceTimersByTime(2500);expect(l.sent.some(m=>m.t==='ka')).toBe(true);
  l.receive({t:'s',f:'c',c:Array(16).fill(0)});l.receive({t:'bye',f:'c'});expect(h.onSnap).not.toHaveBeenCalled();expect(h.onGone).not.toHaveBeenCalled();
 });
 it('does not include departed participants in a racing room start',()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});
  const l=link(true),h=raceHooks(),n=new RaceMulti(l.room,'arc',h);disposers.push(()=>n.dispose());
  l.receive({t:'hello',f:'b',car:'arc'});l.receive({t:'bye',f:'b'});l.receive({t:'hello',f:'c',car:'arc'});
  vi.advanceTimersByTime(13000);expect(h.onStart).toHaveBeenCalledWith([{id:'a',car:'arc'},{id:'c',car:'arc'}]);expect(h.onGone).not.toHaveBeenCalled();
 });
 it('rejects sparse and out-of-range race snapshots',()=>{
  expect(parseSnap(new Array(16))).toBeNull();
  const s=Array(16).fill(0);s[13]=2;expect(parseSnap(s)).toBeNull();s[13]=1;s[14]=-1;expect(parseSnap(s)).toBeNull();s[14]=0;s[15]=2;expect(parseSnap(s)).toBeNull();
 });
 it('ignores negative or nonfinite interpolation time',()=>{
  const car={x:1,z:2} as CarState;const before={...car};
  followSnap(car,{at:0,snap:Array(16).fill(0)},0,-1);followSnap(car,{at:0,snap:Array(16).fill(0)},NaN,1);expect(car).toEqual(before);
 });
 it('rejects malformed attachment containers and nonstring item IDs',()=>{
  const loot:NetMsg={t:'la',i:1,k:'weapon',w:'pistol',p:null,x:0,z:0};
  expect(parseLoot({...loot,a:[]})).toBeNull();expect(parseLoot({...loot,a:'invalid'})).toBeNull();expect(parseLoot({...loot,p:{toString:()=> 'red_dot'}})).toBeNull();expect(parseLoot(loot)).not.toBeNull();
 });
});
