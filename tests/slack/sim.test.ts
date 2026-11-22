import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/slack/sim';
import type { Level, StageId } from '../../src/slack/types';

describe('딴짓 시뮬레이션', () => {
  it('같은 시드는 같은 결과와 이벤트를 만든다', () => {
    const run = () => { const sim = createSim('class', 42, 2); sim.start(); sim.doActivity('manga'); sim.setCover(false); for (let i = 0; i < 500; i++) sim.update(0.1); return [sim.state, sim.drain()]; };
    expect(run()).toEqual(run());
  });
  it('엄폐만 하면 들키지 않고 시간 종료 후 등급을 받는다', () => {
    const sim = createSim('class', 1, 3); sim.start(); sim.update(150);
    expect(sim.state.phase).toBe('done'); expect(sim.state.strikes).toBe(0); expect(sim.state.grade).toBeTruthy();
  });
  it('순회 중 활동하면 경고를 받고 세 번이면 잡힌다', () => {
    const sim = createSim('dorm', 3, 3); sim.start(); sim.doActivity('game');
    for (let i = 0; i < 1500 && sim.state.phase === 'play'; i++) {
      if (sim.state.watcher.mode === 'scan') sim.setCover(false);
      else sim.setCover(true);
      sim.update(0.1);
    }
    expect(sim.state.strikes).toBe(3); expect(sim.state.phase).toBe('caught');
    expect(sim.drain().filter(event => event.t === 'strike')).toHaveLength(3);
  });
  it('배터리가 없으면 휴대폰을 시작할 수 없다', () => {
    const sim = createSim('class', 1, 1); sim.start(); sim.state.battery = 0; sim.doActivity('phone');
    expect(sim.state.activity).toBeNull();
  });
  it('모든 스테이지와 난이도에서 수치가 유한하다', () => {
    for (const stage of ['class', 'dorm'] as StageId[]) for (const level of [1, 2, 3] as Level[]) {
      const sim = createSim(stage, 123, level); sim.start();
      for (let i = 0; i < 1500; i++) { sim.update(0.1); for (const value of Object.values(sim.state)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true); }
      expect(sim.state.phase).toBe('done');
    }
  });
});
