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
