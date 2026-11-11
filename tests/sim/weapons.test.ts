import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/data';
import { createWorld, step, type World } from '../../src/sim';
import { spawnEnemy } from '../../src/sim/spawn';

const data = loadGameData();

/** 스폰이 섞이지 않게 웨이브를 비운 월드에 지정한 무기만 들려 준다. */
function worldWith(weaponId: string): World {
  const d = structuredClone(data);
  for (const s of d.stages.stages) {
    s.waves = [];
    s.miniboss = undefined;
  }
  const w = createWorld(d, 1);
  w.player.weapons = [{ def: d.weaponIndex[weaponId], level: 1, cooldown: 0 }];
  return w;
}

describe('weapon patterns', () => {
  it('orbit: 구슬이 플레이어 주위를 돌며 닿은 적을 때리고, 수명이 끝나면 사라진다', () => {
    const w = worldWith('guardian_orb');
    const lv = w.data.weapons[w.player.weapons[0].def].levels[0];
    const golem = w.data.enemyIndex['golem_stone'];
    w.data.enemies[golem].speed = 0;
    spawnEnemy(w, golem, lv.range, 0);
    const hp0 = w.enemies.hp[0];

    step(w, []);
    expect(w.projectiles.count).toBe(lv.count);
    const dist = Math.hypot(w.projectiles.x[0] - w.player.x, w.projectiles.y[0] - w.player.y);
    expect(dist).toBeCloseTo(lv.range, 3);

    for (let i = 0; i < 60; i++) step(w, []);
    expect(w.enemies.hp[0]).toBeLessThan(hp0);

    for (let i = 0; i < 30 * (lv.life - 1); i++) step(w, []);
    // 쿨다운(5초)이 수명(3초)보다 길어서 그 사이에는 구슬이 없다
    expect(w.projectiles.count).toBe(0);
  });

  it('aura: 반경 안의 적만 피해를 입는다', () => {
    const w = worldWith('frost_aura');
    const golem = w.data.enemyIndex['golem_stone'];
    spawnEnemy(w, golem, 20, 0);
    spawnEnemy(w, golem, 200, 0);
    const hp0 = w.enemies.hp[0];
    step(w, []);
    expect(w.enemies.hp[0]).toBeLessThan(hp0);
    expect(w.enemies.hp[1]).toBe(hp0);
  });

  it('겹친 적은 서로 밀려난다', () => {
    const w = worldWith('frost_aura');
    w.player.weapons = [];
    const slime = w.data.enemyIndex['slime_green'];
    spawnEnemy(w, slime, 150, 0);
    spawnEnemy(w, slime, 150.5, 0);
    for (let i = 0; i < 30; i++) step(w, []);
    const d = Math.hypot(w.enemies.x[0] - w.enemies.x[1], w.enemies.y[0] - w.enemies.y[1]);
    expect(d).toBeGreaterThan(3);
  });
});
