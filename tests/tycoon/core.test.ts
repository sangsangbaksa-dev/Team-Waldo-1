import { describe, expect, it } from 'vitest';
import { createCore, SPOTS } from '../../src/tycoon/core';
import type { TycoonCore } from '../../src/tycoon/core';

/** 활동이 끝날 때까지 시간을 흘린다 */
function finish(core: TycoonCore): void {
  for (let i = 0; i < 400 && core.state.activity; i++) core.tick(0.1);
}
function act(core: TycoonCore, spot: string, action: string): string {
  core.setPresence(spot);
  const r = core.perform(spot, action);
  expect(r.ok, r.message).toBe(true);
  finish(core);
  return r.message;
}
/** 게임 시각을 hh:00 으로 맞춘다 */
function setHour(core: ReturnType<typeof createCore>, hour: number): void {
  core.data.minute = hour * 60;
}

describe('타이쿤 코어: 시작과 빈털터리', () => {
  it('빈털터리로 06시 벤치에서 시작한다', () => {
    const core = createCore({ seed: 1 });
    const s = core.state;
    expect(s.stage).toBe('broke');
    expect(s.cash).toBe(0);
    expect(s.day).toBe(1);
    expect(s.clock).toBe('06:00');
    expect(s.energy).toBe(100);
    expect(core.spots().find(x => x.id === 'bench')?.locked).toBe(false);
    expect(core.spots().find(x => x.id === 'job_mart')?.locked).toBe(true);
  });

  it('스폿 id 는 유일하고 부지에는 크기가 있다', () => {
    expect(new Set(SPOTS.map(s => s.id)).size).toBe(SPOTS.length);
    for (const s of SPOTS) if (s.kind === 'lot') expect(s.size).toBeTruthy();
  });

  it('빈 병을 주워 팔면 돈이 생기고 50달러를 벌면 알바생이 된다', () => {
    const core = createCore({ seed: 2 });
    const stages: string[] = [];
    core.onEvent(e => { if (e.type === 'stage') stages.push(e.stage); });
    act(core, 'alley', 'collect');
    expect(core.state.bottles).toBe(3);
    expect(core.state.energy).toBe(96);
    act(core, 'junkyard', 'sell_bottles');
    expect(core.state.cash).toBe(6);
    expect(core.state.bottles).toBe(0);
    for (let i = 0; i < 30 && core.state.stage === 'broke'; i++) {
      const spot = core.actionsAt('alley')[0].enabled ? 'alley' : 'park';
      if (core.actionsAt(spot)[0].enabled) act(core, spot, 'collect');
      else core.tick(5);
      if (core.state.bottles >= 24) act(core, 'junkyard', 'sell_bottles');
      if (core.state.energy < 10) core.data.energy = 100;
    }
    if (core.state.stage === 'broke') act(core, 'junkyard', 'sell_bottles');
    expect(core.state.stage).toBe('parttime');
    expect(stages).toContain('parttime');
    expect(core.spots().find(x => x.id === 'job_mart')?.locked).toBe(false);
  });

  it('활동은 시간이 걸리고 다른 곳으로 가면 취소된다', () => {
    const core = createCore({ seed: 3 });
    core.setPresence('alley');
    expect(core.perform('alley', 'collect').ok).toBe(true);
    expect(core.state.activity?.label).toBe('빈 병 줍기');
    core.tick(0.2);
    expect(core.state.activity!.progress).toBeGreaterThan(0);
    expect(core.perform('alley', 'collect').ok).toBe(false);
    core.setPresence('park');
    expect(core.state.activity).toBeNull();
    expect(core.state.bottles).toBe(0);
  });

  it('지치면 일할 수 없고 먹거나 자면 회복한다(최대치는 늘지 않는다)', () => {
    const core = createCore({ seed: 4 });
    core.data.energy = 2;
    const a = core.actionsAt('alley').find(x => x.id === 'collect')!;
    expect(a.enabled).toBe(false);
    expect(a.disabledReason).toMatch(/지쳤/);
    core.data.cash = 100;
    act(core, 'snack', 'eat_feast');
    expect(core.state.energy).toBe(100);
    expect(core.actionsAt('snack').every(x => !x.enabled)).toBe(true);
  });

  it('밤에 벤치에서 자면 다음 날 06시에 깨어나고 에너지가 가득 찬다', () => {
    const core = createCore({ seed: 5 });
    setHour(core, 22);
    core.data.energy = 10;
    act(core, 'bench', 'sleep');
    expect(core.state.day).toBe(2);
    expect(core.state.clock).toMatch(/^06:0/);
    expect(core.state.energy).toBe(100);
    expect(core.state.lastReport?.day).toBe(1);
  });

  it('알바는 정해진 시간에만 하고 일당을 받는다', () => {
    const core = createCore({ seed: 6 });
    core.data.stage = 'parttime';
    setHour(core, 3);
    expect(core.actionsAt('job_mart')[0].enabled).toBe(false);
    setHour(core, 10);
    act(core, 'job_mart', 'work');
    expect(core.state.cash).toBe(28);
    expect(core.state.energy).toBe(86);
  });

  it('배달: 받은 뒤 목적지까지 가서 완료하면 보수를 받는다', () => {
    const core = createCore({ seed: 7 });
    core.data.stage = 'parttime';
    setHour(core, 10);
    act(core, 'job_delivery', 'accept');
    const task = core.state.task!;
    expect(task).toBeTruthy();
    expect(task.targetSpotId).not.toBe('job_delivery');
    expect(core.actionsAt(task.targetSpotId)[0].id).toBe('deliver');
    act(core, task.targetSpotId, 'deliver');
    expect(core.state.task).toBeNull();
    expect(core.state.cash).toBe(50); // 총알 배송 +25%
  });

  it('같은 시드와 같은 조작이면 결과가 같다', () => {
    const run = () => {
      const core = createCore({ seed: 99 });
      core.data.stage = 'parttime';
      core.data.cash = 5000;
      act(core, 'lot_m1', 'build_stall');
      act(core, 'lot_m1', 'hire_clerk');
      for (let i = 0; i < 4000; i++) core.tick(0.25);
      return JSON.stringify(core.serialize());
    };
    expect(run()).toBe(run());
  });
});
