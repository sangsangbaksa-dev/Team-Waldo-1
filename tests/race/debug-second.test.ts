// @vitest-environment happy-dom
import {describe,it,expect,vi} from 'vitest';
import {RacePvp} from '../../src/race/pvp';
import {RaceMulti} from '../../src/race/multi';
import type {PvpSession,RoomSession} from '../../src/net/lobby';
import type {NetMsg} from '../../src/net/types';
import {createRace,standings} from '../../src/race/race';
import {buildTrack} from '../../src/race/track';
import {buySkin,rewardFor} from '../../src/race/garage';
import {encodeSnap} from '../../src/race/netcar';
const track=buildTrack();
function channel(){let recv:(m:NetMsg)=>void=()=>{};const send=vi.fn();return {send,receive:(m:NetMsg)=>recv(m),open:(fn:(m:NetMsg)=>void)=>{recv=fn;return {send,close:vi.fn(),ready:Promise.resolve()};}};}
function duel(){const ch=channel(),hooks={onStart:vi.fn(),onSnap:vi.fn(),onFinish:vi.fn(),onGone:vi.fn()};const p=new RacePvp({host:true,open:ch.open} as unknown as PvpSession,'arc',hooks);return {ch,hooks,p};}
function room(){const ch=channel(),hooks={onStart:vi.fn(),onSnap:vi.fn(),onFinish:vi.fn(),onGone:vi.fn(),onAbort:vi.fn()};const p=new RaceMulti({host:false,me:{id:'me'},players:['host','me','other'].map(id=>({id})),room:{host_id:'host'},open:ch.open} as unknown as RoomSession,'arc',hooks);return {ch,hooks,p};}
const list=(...ids:string[])=>ids.map(id=>({id,car:'arc'}));
describe('SPEED RUSH second debugging pass',()=>{
it('retransmits a lost start message without starting the host twice',()=>{const {ch,hooks,p}=duel();try{ch.receive({t:'hello',car:'arc'});ch.receive({t:'hello',car:'arc'});expect(hooks.onStart).toHaveBeenCalledTimes(1);expect(ch.send.mock.calls.filter(([m])=>m.t==='start')).toHaveLength(2);}finally{p.dispose();}});
it('ignores premature and duplicate finish packets in duels',()=>{const {ch,hooks,p}=duel();try{ch.receive({t:'fin',time:10});expect(hooks.onFinish).not.toHaveBeenCalled();ch.receive({t:'hello'});ch.receive({t:'fin',time:12});ch.receive({t:'fin',time:1});expect(hooks.onFinish).toHaveBeenCalledExactlyOnceWith(12);}finally{p.dispose();}});
it('does not send or process messages after disposal',async()=>{const {ch,hooks,p}=duel();p.dispose();ch.receive({t:'hello'});p.sendFinish(10);await Promise.resolve();expect(ch.send).not.toHaveBeenCalled();expect(hooks.onStart).not.toHaveBeenCalled();});
it('rejects duplicate and hostless room rosters',()=>{const {ch,hooks,p}=room();try{ch.receive({t:'start',f:'host',list:list('host','me','me')});ch.receive({t:'start',f:'host',list:list('me','other')});expect(hooks.onStart).not.toHaveBeenCalled();ch.receive({t:'start',f:'host',list:list('host','me')});expect(hooks.onStart).toHaveBeenCalledTimes(1);}finally{p.dispose();}});
it('does not accept snapshots and finishes from excluded players',()=>{const {ch,hooks,p}=room();try{ch.receive({t:'start',f:'host',list:list('host','me')});ch.receive({t:'s',f:'other',c:encodeSnap(createRace(track).player.car)});ch.receive({t:'fin',f:'other',time:10});expect(hooks.onSnap).not.toHaveBeenCalled();expect(hooks.onFinish).not.toHaveBeenCalled();}finally{p.dispose();}});
it('does not overwrite a room finish or accept late data after departure',()=>{const {ch,hooks,p}=room();try{ch.receive({t:'start',f:'host',list:list('host','me','other')});ch.receive({t:'fin',f:'host',time:10});ch.receive({t:'fin',f:'host',time:1});ch.receive({t:'bye',f:'other'});ch.receive({t:'fin',f:'other',time:2});expect(hooks.onFinish).toHaveBeenCalledExactlyOnceWith('host',10);}finally{p.dispose();}});
it('rejects room finish before start and ignores packets after disposal',()=>{const {ch,hooks,p}=room();ch.receive({t:'fin',f:'host',time:10});p.dispose();ch.receive({t:'start',f:'host',list:list('host','me')});expect(hooks.onStart).not.toHaveBeenCalled();expect(hooks.onFinish).not.toHaveBeenCalled();});
it('allocates distinct grid slots for an invalid local slot',()=>{const r=createRace(track,1,Infinity,{multi:{slot:99,players:[{id:'a',nickname:'a',car:'arc'}]}});expect(r.player.car.z===r.racers[1].car.z&&r.player.car.x===r.racers[1].car.x).toBe(false);});
it('caps and deduplicates the starting field',()=>{const players=Array.from({length:9},(_,i)=>({id:String(i%7),nickname:'x',car:'arc'}));const r=createRace(track,1,Infinity,{multi:{slot:0,players}});expect(r.racers.length).toBe(6);expect(new Set(r.racers.slice(1).map(p=>p.peer)).size).toBe(5);});
it('normalizes invalid lap counts',()=>{expect(createRace(track,0).laps).toBe(1);expect(createRace(track,NaN).laps).toBe(3);});
it('ranks actual finishers above arbitrary unfinished totals',()=>{const r=createRace(track);r.racers[1].finishTime=60;r.player.car.total=1e10;expect(standings(r)[0]).toBe(r.racers[1]);});
it('does not buy a skin with a corrupted coin balance',()=>{expect(buySkin({coins:NaN,skins:[]},'night')).toBeNull();});
it('never issues a nonfinite or negative race reward',()=>{expect(rewardFor(1,NaN,1,false)).toBe(0);expect(rewardFor(1,1,-2,false)).toBe(0);});
});
