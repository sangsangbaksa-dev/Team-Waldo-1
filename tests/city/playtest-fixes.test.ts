import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { DIFFICULTY, DIFFICULTY_ORDER } from '../../src/city/defs';
import { missionLog } from '../../src/city/missions';

describe('플레이테스트 수정(2026-11-22)', () => {
  it('부활 직후에는 보호 시간 동안 피해를 입지 않고, 지나면 다시 맞는다', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord' }), f = w.factions[0];
    w.hurtActor(w.boss(0)!, 99999, 1);
    expect(w.boss(0)).toBeFalsy();
    for (let i = 0; i < 600 && !w.boss(0); i++) w.step(1 / 30);
    const b = w.boss(0)!;
    expect(b).toBeTruthy();
    expect(f.shieldT).toBeGreaterThan(3);
    const full = b.hp;
    w.hurtActor(b, 100, 1);
    expect(b.hp).toBe(full);
    for (let i = 0; i < 150; i++) w.step(1 / 30);
    expect(f.shieldT).toBe(0);
    w.hurtActor(b, 100, 1);
    expect(b.hp).toBeLessThan(full);
  });
  it('난이도가 낮을수록 초반 유예 시간이 길다', () => {
    const g = DIFFICULTY_ORDER.map(d => DIFFICULTY[d].grace);
    expect(g.every(x => x > 0)).toBe(true);
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeLessThan(g[i - 1]);
  });
  it('첫 임무 안내는 출입문으로 들어가 카운터에서 거래하는 방식으로 통일돼 있다', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord' });
    const first = missionLog(w)[0];
    expect(first.objective).toContain('카운터');
    expect(first.hint).toContain('카운터');
    expect(first.hint).not.toContain('패드 위에서');
  });
});
