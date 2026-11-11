import { describe, expect, it } from 'vitest';
import { buildGameData, loadGameData } from '../../src/data';
import balance from '../../data/balance.json';
import enemies from '../../data/enemies.json';
import passives from '../../data/passives.json';
import stages from '../../data/stages.json';
import weapons from '../../data/weapons.json';

describe('data', () => {
  it('data/*.json이 스키마와 id 참조를 통과한다', () => {
    expect(() => loadGameData()).not.toThrow();
  });

  it('없는 적을 참조하면 어느 파일인지 알려 주며 실패한다', () => {
    const broken = structuredClone(stages);
    broken.boss.enemy = 'no_such_enemy';
    expect(() => buildGameData({ enemies, weapons, passives, stages: broken, balance })).toThrow(/stages\.json/);
  });

  it('잘못된 값은 필드 경로와 함께 실패한다', () => {
    const broken = structuredClone(enemies);
    broken[0].hp = -1;
    expect(() => buildGameData({ enemies: broken, weapons, passives, stages, balance })).toThrow(/enemies\.json → 0\.hp/);
  });
});
