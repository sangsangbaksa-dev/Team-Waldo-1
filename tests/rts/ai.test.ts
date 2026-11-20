import { describe, expect, it } from 'vitest';
import { RtsAi } from '../../src/rts/ai';
import { DIFFICULTIES, LEVELS, TICK, type Difficulty } from '../../src/rts/config';
import { RtsSim } from '../../src/rts/sim';

function play(a: Difficulty | null, b: Difficulty | null, minutes: number): RtsSim {
  const s = new RtsSim({ income: [a ? LEVELS[a].income : 1, b ? LEVELS[b].income : 1] }); s.record = false;
  const ais = [a ? new RtsAi(0, a) : null, b ? new RtsAi(1, b) : null];
  while (s.winner === -1 && s.tick < minutes * 60 * TICK) { s.step(); for (const ai of ais) if (ai && s.tick % ai.interval === (ai.me * 3) % ai.interval) ai.think(s); }
  return s;
}
const count = (s: RtsSim, p: number, kind: string): number => s.buildings.filter(b => b.owner === p && b.kind === kind).length;

describe('FRONTLINE AI', () => {
  it('어려움 AI는 차량이 모이면 공병을 뽑고, 쉬움 AI는 뽑지 않는다', () => {
    let seen = 0, cap = 0;
    const s = new RtsSim({ income: [1, 1] }); s.record = false; const ai = new RtsAi(1, 'hard');
    while (s.winner === -1 && s.tick < 12 * 60 * TICK) { s.step(); if (s.tick % ai.interval === 3 % ai.interval) ai.think(s); if (s.tick % 100 === 0) { const n = s.units.filter(u => u.owner === 1 && u.kind === 'engineer').length; seen = Math.max(seen, n); cap = Math.max(cap, n); } }
    expect(seen).toBeGreaterThanOrEqual(1); expect(cap).toBeLessThanOrEqual(2);
    expect(play(null, 'easy', 8).units.filter(u => u.kind === 'engineer').length).toBe(0);
  });
  it('난이도는 쉬움부터 매우 어려움까지 네 단계다', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard', 'brutal']);
    expect(LEVELS.easy.think).toBeGreaterThan(LEVELS.normal.think); expect(LEVELS.normal.think).toBeGreaterThan(LEVELS.hard.think);
    expect(LEVELS.easy.workers).toBeLessThan(LEVELS.hard.workers); expect(LEVELS.easy.attackAfter).toBeGreaterThan(LEVELS.hard.attackAfter);
    expect(LEVELS.brutal.income).toBeGreaterThan(1); expect(LEVELS.hard.income).toBe(1);
  });
  it.each(DIFFICULTIES)('%s: 5분 동안 일꾼을 늘리고 병영을 지어 병력을 만든다', d => {
    const s = play(null, d, 5);
    expect(s.units.filter(u => u.owner === 1 && u.kind === 'worker').length).toBeGreaterThanOrEqual(8);
    expect(count(s, 1, 'barracks')).toBeGreaterThanOrEqual(1); expect(count(s, 1, 'depot')).toBeGreaterThanOrEqual(1);
    expect(s.players[1].made).toBeGreaterThan(12);
  });
  it('어려운 AI일수록 더 크게 자란다', () => {
    const easy = play(null, 'easy', 5), hard = play(null, 'hard', 5);
    expect(hard.players[1].mined).toBeGreaterThan(easy.players[1].mined);
    expect(count(hard, 1, 'barracks') + count(hard, 1, 'factory')).toBeGreaterThan(count(easy, 1, 'barracks') + count(easy, 1, 'factory'));
  });
  it('가만히 있는 상대는 결국 무너뜨린다(보통)', () => {
    const s = play(null, 'normal', 25);
    expect(s.winner).toBe(1);
  });
  it('쉬운 AI는 어려운 AI에게 진다', () => {
    const s = play('hard', 'easy', 20);
    expect(s.winner).toBe(0);
  });
});
