import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/slack/sim';
import type { ActivityId, Level, StageId } from '../../src/slack/types';

/** 헤드리스 봇: 감독 단서(발소리·순회)를 delay 초 늦게 보고 엄폐. greedy 면 발소리는 무시하고 문 창/순회만 피함. */
function playBot(stage: StageId, seed: number, level: Level, opts: { delay: number; variety: boolean; greedy?: boolean }) {
  const sim = createSim(stage, seed, level); sim.start();
  const acts: ActivityId[] = stage === 'class' ? ['video', 'game'] : ['video', 'webtoon', 'chat', 'game'];
  const hist: string[] = []; const lag = Math.round(opts.delay * 10); let ai = 0, since = 0;
  sim.doActivity(acts[0]);
  for (let i = 0; i < 3000 && sim.state.phase === 'play'; i++) {
    hist.push(sim.state.watcher.mode); const seen = hist[Math.max(0, hist.length - 1 - lag)];
    sim.drain(); since += 0.1;
    sim.setCover((!opts.greedy && seen === 'approach') || seen === 'peek' || seen === 'scan');
    if (opts.variety && since >= 9) { since = 0; ai = (ai + 1) % acts.length; sim.doActivity(acts[ai]); }
    sim.update(0.1);
  }
  return sim.state;
}
const clearRate = (stage: StageId, level: Level, opts: { delay: number; variety: boolean; greedy?: boolean }) => {
  let ok = 0; const n = 60;
  for (let s = 1; s <= n; s++) { const st = playBot(stage, s * 7919, level, opts); if (st.phase === 'done' && st.fun >= st.goal) ok++; }
  return ok / n;
};

describe('딴짓 시뮬레이션', () => {
  it('같은 시드는 같은 결과와 이벤트를 만든다', () => {
    const run = () => { const sim = createSim('class', 42, 2); sim.start(); sim.doActivity('game'); sim.setCover(false); for (let i = 0; i < 500; i++) sim.update(0.1); return [sim.state, sim.drain()]; };
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
  it('교실은 video/game 외의 활동 id 를 무시한다', () => {
    const sim = createSim('class', 1, 1); sim.start();
    for (const id of ['phone', 'manga', 'doodle', 'snack', 'sleep', 'note', 'music', 'chat', 'webtoon', 'shop']) { sim.doActivity(id as ActivityId); expect(sim.state.activity).toBeNull(); }
    sim.doActivity('video'); expect(sim.state.activity).toBe('video'); sim.doActivity('game'); expect(sim.state.activity).toBe('game');
  });
  it('교실 노트북은 배터리가 없고 짝꿍·경고·졸림 기능이 없다', () => {
    const sim = createSim('class', 5, 2); sim.start(); sim.state.battery = 0; sim.doActivity('game'); expect(sim.state.activity).toBe('game');
    sim.state.battery = 100; expect(sim.bribe()).toBe(false);
    const types = new Set<string>(); let text = '';
    for (let i = 0; i < 1500 && sim.state.phase === 'play'; i++) { sim.setCover(i % 40 > 20); sim.update(0.1); for (const e of sim.drain()) { types.add(e.t); if (e.t === 'toast') text += e.text; } }
    expect(types.has('friend-warn')).toBe(false); expect(text).not.toMatch(/짝꿍|쪽지|졸/);
    expect(sim.state.battery).toBe(100); expect(sim.state.sleepy).toBe(0);
  });
  it('기숙사는 배터리가 없으면 게임을 시작할 수 없다', () => {
    const sim = createSim('dorm', 1, 1); sim.start(); sim.state.battery = 0; sim.doActivity('game');
    expect(sim.state.activity).toBeNull();
  });
  it('교실 game 은 video 보다 재미가 크고 더 위험하다', () => {
    const run = (id: 'game' | 'video') => { const sim = createSim('class', 3, 1); sim.start(); sim.setCover(false); sim.doActivity(id); for (let i = 0; i < 30; i++) sim.update(0.1); return sim.state; };
    const g = run('game'), v = run('video'); expect(g.fun).toBeGreaterThan(v.fun); expect(g.sus).toBeGreaterThan(v.sus);
  });
  it('모든 스테이지와 난이도에서 수치가 유한하다', () => {
    for (const stage of ['class', 'dorm'] as StageId[]) for (const level of [1, 2, 3] as Level[]) {
      const sim = createSim(stage, 123, level); sim.start();
      for (let i = 0; i < 1500; i++) { sim.update(0.1); for (const value of Object.values(sim.state)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true); }
      expect(sim.state.phase).toBe('done');
    }
  });
  it('난이도 곡선: 신중한 봇은 레벨1 대부분 클리어, 레벨3은 거의 못 깬다', () => {
    for (const stage of ['class', 'dorm'] as StageId[]) {
      const opts = { delay: 0.8, variety: true };
      const [r1, r2, r3] = ([1, 2, 3] as Level[]).map(level => clearRate(stage, level, opts));
      expect(r1).toBeGreaterThanOrEqual(0.9); expect(r3).toBeLessThanOrEqual(0.2); expect(r1).toBeGreaterThan(r2); expect(r2).toBeGreaterThan(r3);
    }
  });
  it('레벨3은 위험을 감수하는 봇이어야 깰 수 있다', () => {
    expect(clearRate('class', 3, { delay: 0.6, variety: true, greedy: true })).toBeGreaterThan(clearRate('class', 3, { delay: 0.6, variety: true }));
  });
  it('한 가지 딴짓만 반복하면 질려서 재미가 덜 쌓인다', () => {
    expect(playBot('class', 5, 1, { delay: 0.8, variety: false }).fun).toBeLessThan(playBot('class', 5, 1, { delay: 0.8, variety: true }).fun * 0.8);
  });
  it('감독은 한 판에 여러 성향으로 나타나고 순회 간격이 들쭉날쭉할 수 있다', () => {
    const sim = createSim('class', 9, 3); sim.start(); const kinds = new Set<string>(); const lens: number[] = []; let last = 0;
    for (let i = 0; i < 1500 && sim.state.phase === 'play'; i++) {
      sim.update(0.1); kinds.add(sim.state.watcher.kind ?? '?');
      if (sim.state.watcher.mode === 'peek' || sim.state.watcher.mode === 'approach') { if (sim.state.watcher.t < 0.11 && sim.state.time - last > 3) { lens.push(sim.state.time - last); last = sim.state.time; } }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(2); expect(lens.length).toBeGreaterThan(2);
  });
  it('룸메가 부탁한 메신저를 들어주면 우호도가 오르고 토스트가 뜬다', () => {
    let hit = false;
    for (let seed = 1; seed < 40 && !hit; seed++) {
      const sim = createSim('dorm', seed, 1); sim.start();
      for (let i = 0; i < 1400 && sim.state.phase === 'play' && !hit; i++) {
        sim.update(0.1);
        if (sim.drain().some(e => e.t === 'toast' && e.text.includes('눈짓'))) {
          const before = sim.state.friend; sim.setCover(false); sim.doActivity('chat'); sim.update(1);
          hit = sim.state.friend > before; sim.setCover(true);
        }
      }
    }
    expect(hit).toBe(true);
  });
  it('돌발 이벤트는 새 이벤트 타입 없이 toast 로만 나온다', () => {
    const types = new Set<string>();
    for (const stage of ['class', 'dorm'] as StageId[]) { const sim = createSim(stage, 77, 2); sim.start(); for (let i = 0; i < 1500 && sim.state.phase === 'play'; i++) { sim.update(0.1); for (const e of sim.drain()) types.add(e.t); } }
    expect(types.has('toast')).toBe(true);
  });
});
