import { describe, expect, it } from 'vitest';
import { START_MINERALS, TICK, UNITS } from '../../src/rts/config';
import { RtsSim } from '../../src/rts/sim';

describe('FRONTLINE 기본 능력치와 경기 내 연구', () => {
  it('이전 무기고 옵션은 시작 광물에 영향을 주지 않는다', () => {
    const sim = new RtsSim({ edge: [{ dmg: 2, def: 0.5, speed: 2, minerals: 180 }, {}] } as never);
    expect(sim.players[0].minerals).toBe(START_MINERALS);
    expect(sim.players[1].minerals).toBe(START_MINERALS);
  });
  it('기동 훈련은 전투 유닛에만 적용된다', () => {
    const sim = new RtsSim();
    sim.players[0].up.speed = true;
    const hq = sim.buildings.find(b => b.owner === 0 && b.kind === 'hq')!;
    const jeep = sim.spawn(0, 'jeep', hq), worker = sim.spawn(0, 'worker', hq);
    jeep.x = worker.x = 30; jeep.y = 30; worker.y = 34;
    sim.apply(0, { k: 'move', ids: [jeep.id], x: 48, y: 30 });
    sim.apply(0, { k: 'move', ids: [worker.id], x: 48, y: 34 });
    for (let i = 0; i < TICK; i++) sim.step();
    expect(jeep.x - 30).toBeCloseTo(UNITS.jeep.speed * 1.12);
    expect(worker.x - 30).toBeCloseTo(UNITS.worker.speed);
  });
});
