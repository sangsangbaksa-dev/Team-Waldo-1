import { expect, it } from 'vitest';
import { Match } from '../../src/shooter/sim';

it('이전 병사 강화 옵션이 플레이어에게 전달되지 않는다', () => {
  const legacy = new Match({ seed: 7, mode: 'br', difficulty: 'normal', humans: [{ name: '나' }], fill: 2, perks: { speed: 3, reload: 3, steady: 3, tough: 3 } } as never);
  expect(legacy.players[0]).not.toHaveProperty('perks');
});
