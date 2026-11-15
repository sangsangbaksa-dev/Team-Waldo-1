import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data';
import { TICK_RATE, createWorld, step, type SimEvent } from '../../src/sim';
import { spawnEnemy } from '../../src/sim/spawn';
import { stage } from '../../src/sim/systems/stage';

/** 구간을 2초로 줄인 데이터로 한 판의 진행(구간 전환 → 미니보스 → 보스 → 클리어)을 확인한다. */
function shortRunData() {
  const data = loadGameData();
  for (const s of data.stages.stages) {
    s.duration = 2;
    if (s.miniboss) s.miniboss.at = 1;
  }
  return data;
}

describe('stage', () => {
  it('구간이 순서대로 넘어가고, 마지막에 보스가 나오며, 보스를 잡으면 클리어한다', () => {
    const data = shortRunData();
    const world = createWorld(data, 11);
    const events: SimEvent[] = [];
    const run = (ticks: number) => {
      for (let i = 0; i < ticks && !world.over; i++) {
        world.player.hp = world.player.stats.maxHp; // 진행만 보려고 죽지 않게 한다
        step(world, world.pendingChoices ? [{ t: 'choose', index: 0 }] : []);
        events.push(...world.events);
      }
    };

    run(TICK_RATE * 7);
    const stageCount = data.stages.stages.length;
    expect(events.filter((e) => e.t === 'stageStart').map((e) => e.t === 'stageStart' && e.index)).toEqual([1, 2]);
    expect(events.filter((e) => e.t === 'bossSpawn' && e.miniboss).length).toBe(stageCount);
    expect(world.stage.bossSpawned).toBe(true);
    expect(world.over).toBe(false);

    // 보스를 찾아 쓰러뜨린다
    const e = world.enemies;
    let found = false;
    for (let i = 0; i < e.count; i++) {
      if (e.id[i] === world.stage.bossId) {
        e.hp[i] = 0;
        found = true;
      }
    }
    expect(found).toBe(true);
    run(1);
    expect(world.over).toBe(true);
    expect(world.stats.victory).toBe(true);
    expect(events.some((ev) => ev.t === 'runEnd' && ev.victory)).toBe(true);
  });
  it('keeps miniboss and final boss spawns pending until the enemy pool has a free slot', () => {
    const data = shortRunData();
    const fill = (w: ReturnType<typeof createWorld>) => {
      const slime = data.enemyIndex['slime_green'];
      for (let i = 0; i < w.enemies.capacity; i++) spawnEnemy(w, slime, 1000 + i, 1000);
      expect(w.enemies.count).toBe(w.enemies.capacity);
    };

    const mini = createWorld(data, 17);
    fill(mini);
    mini.stage.time = 0.99;
    stage(mini);
    expect(mini.stage.minibossSpawned).toBe(false);
    expect(mini.events.some(e => e.t === 'bossSpawn')).toBe(false);
    mini.enemies.count--;
    stage(mini);
    expect(mini.stage.minibossSpawned).toBe(true);
    expect(mini.events.filter(e => e.t === 'bossSpawn' && e.miniboss)).toHaveLength(1);

    const final = createWorld(data, 19);
    final.stage.index = data.stages.stages.length - 1;
    final.stage.time = 2;
    fill(final);
    stage(final);
    expect(final.stage.bossSpawned).toBe(false);
    expect(final.stage.bossId).toBe(0);
    expect(final.events).toHaveLength(0);
    final.enemies.count--;
    stage(final);
    expect(final.stage.bossSpawned).toBe(true);
    expect(final.stage.bossId).toBeGreaterThan(0);
    expect(final.events.filter(e => e.t === 'bossSpawn' && !e.miniboss)).toHaveLength(1);
  });
});
