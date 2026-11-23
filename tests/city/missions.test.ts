import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { missionLog, missionSummary } from '../../src/city/missions';

describe('Last City 작전 지령', () => {
  it('기존 7개 보상 목표와 최종 생존 목표를 8단계로 보여준다', () => {
    const world = new World({ seed: 42, difficulty: 'd4', klass: 'warlord' });
    const items = missionLog(world);
    const summary = missionSummary(items);
    expect(items).toHaveLength(world.quests.length + 1);
    expect(summary.total).toBe(8);
    expect(summary.active?.title).toBe('첫 수익원 확보');
    expect(items[7].target).toBe(7);
    expect(items[7].current).toBe(0);
    expect(items[7].reward).toBe(0);
  });

  it('shows touch controls on mobile while keeping desktop keyboard hints', () => {
    const w = new World({ seed: 42, difficulty: 'd4', klass: 'warlord' });
    const desktop = missionLog(w), mobile = missionLog(w, true);
    expect(desktop[0].objective).toContain('E');
    expect(desktop[1].hint).toContain('Tab');
    expect(mobile[0].objective).toContain('상호작용 버튼');
    expect(mobile[0].hint).toContain('상호작용 버튼');
    expect(mobile[1].objective).toContain('지휘 패널 → 건설');
    expect(mobile[1].hint).not.toContain('Tab');
    expect(mobile[2].hint).toContain('지휘 패널 → 생산');
    expect(mobile[3].hint).toContain('상호작용 버튼');
    expect(mobile[7].hint).toContain('지도 버튼');
    expect(mobile[7].hint).not.toContain('(Tab)');
    expect(mobile.map(x => [x.current, x.target, x.reward, x.done]))
      .toEqual(desktop.map(x => [x.current, x.target, x.reward, x.done]));
  });

  it('달성한 임무는 완료 상태와 진행률을 유지한다', () => {
    const world = new World({ seed: 42, difficulty: 'd4', klass: 'tycoon' });
    world.quests[0].done = true;
    const items = missionLog(world);
    const summary = missionSummary(items);
    expect(items[0].done).toBe(true);
    expect(items[0].current).toBe(items[0].target);
    expect(summary.completed).toBe(1);
    expect(summary.active?.title).toBe('병영 가동');
  });
});
