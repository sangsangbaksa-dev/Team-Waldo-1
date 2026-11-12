import { describe, expect, it } from 'vitest';
import { createWar, stepWar, upgrade, train, order } from '../../src/battle/war';
describe('경영 전쟁',()=>{
 it('생산과 업그레이드가 자원을 바꾸고 비용이 부족하면 실패한다',()=>{const w=createWar(),f=w.factions[0];expect(upgrade(w,0,'mine')).toBe(true);expect(f.mine).toBe(2);f.gold=0;expect(upgrade(w,0,'farm')).toBe(false);stepWar(w,.1);expect(f.gold).toBeCloseTo(.3);});
 it('병사를 훈련하고 살아 있는 적에게만 공격 명령을 내린다',()=>{const w=createWar();expect(train(w,0)).toBe(true);expect(w.units.filter(u=>u.owner===0)).toHaveLength(5);expect(order(w,0,0)).toBe(false);expect(order(w,0,1)).toBe(true);expect(w.factions[0].target).toBe(1);});
 it('전투로 본부를 파괴하면 탈락하고 마지막 세력이 승리한다',()=>{const w=createWar();for(const id of [2,3])w.factions[id].alive=false;w.factions[1].hp=1;for(const u of w.units.filter(u=>u.owner===0)){u.x=w.factions[1].x;u.z=w.factions[1].z;}w.units=w.units.filter(u=>u.owner===0);order(w,0,1);stepWar(w,.05);expect(w.factions[1].alive).toBe(false);expect(w.over).toBe(true);expect(w.winner).toBe(0);});
 it('시간이 지나면 안전지대 밖 본부가 피해를 받는다',()=>{const w=createWar();w.time=380;const hp=w.factions[0].hp;stepWar(w,.1);expect(w.zone).toBeLessThan(50);expect(w.factions[0].hp).toBeLessThan(hp);});
});
