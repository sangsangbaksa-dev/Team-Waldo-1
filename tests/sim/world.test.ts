import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data';
import { TICK_RATE, createWorld, hashWorld, step, type World } from '../../src/sim';
import { botCommands } from '../../tools/bot';

const data = loadGameData();

function run(seed: number, ticks: number): World {
  const world = createWorld(data, seed);
  for (let i = 0; i < ticks && !world.over; i++) step(world, botCommands(world));
  return world;
}

describe('world', () => {
  it('같은 시드와 같은 입력이면 결과가 같다 (결정성)', () => {
    const a = run(123, TICK_RATE * 120);
    const b = run(123, TICK_RATE * 120);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(hashWorld(a)).not.toBe(hashWorld(run(124, TICK_RATE * 120)));
  });

  it('코어 루프가 돈다: 적이 나오고, 죽고, 레벨이 오른다', () => {
    const w = run(1, TICK_RATE * 120);
    expect(w.stats.kills).toBeGreaterThan(10);
    expect(w.player.level).toBeGreaterThan(1);
  });

  it('레벨업 선택 대기 중에는 시간이 멈추고, 선택하면 다시 흐른다', () => {
    const w = createWorld(data, 5);
    w.player.xp = w.player.xpToNext;
    step(w, []);
    expect(w.pendingChoices).not.toBeNull();
    expect(w.pendingChoices!.length).toBeLessThanOrEqual(data.balance.choicesPerLevel);
    const tick = w.tick;
    step(w, []);
    expect(w.tick).toBe(tick);
    step(w, [{ t: 'choose', index: 0 }]);
    expect(w.pendingChoices).toBeNull();
    expect(w.tick).toBe(tick + 1);
  });

  it('체력이 0이 되면 판이 끝나고 runEnd 이벤트가 나온다', () => {
    const w = createWorld(data, 9);
    w.player.hp = 0;
    step(w, []);
    expect(w.over).toBe(true);
    expect(w.events.some((e) => e.t === 'runEnd' && !e.victory)).toBe(true);
  });
});
