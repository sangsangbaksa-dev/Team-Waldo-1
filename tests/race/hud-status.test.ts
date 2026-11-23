import { describe, expect, it } from 'vitest';
import { raceHudSubtitle } from '../../src/race/hud-status';

describe('SPEED RUSH persistent HUD mode label', () => {
  it('keeps the opponent identity visible on an online duel', () => {
    expect(raceHudSubtitle({ kind: 'online-duel', opponent: '민수' })).toBe('VS 민수');
    expect(raceHudSubtitle({ kind: 'online-duel', opponent: 'MINT' })).toBe('VS MINT');
  });

  it('keeps the participant count visible in multiplayer rooms', () => {
    for (const players of [3, 4, 5, 6]) {
      expect(raceHudSubtitle({ kind: 'online-room', players })).toBe(`${players}인 레이스`);
    }
  });

  it('formats time trial and solo labels without displaying invalid best times', () => {
    expect(raceHudSubtitle({ kind: 'race', bestLap: Infinity })).toBe('');
    expect(raceHudSubtitle({ kind: 'race', bestLap: 72.345 })).toBe('BEST 1:12.345');
    expect(raceHudSubtitle({ kind: 'time-trial', ghostTime: null, delta: null })).toContain('첫 기록');
    expect(raceHudSubtitle({ kind: 'time-trial', ghostTime: 52.35, delta: null })).toBe('GHOST 0:52.350');
    expect(raceHudSubtitle({ kind: 'time-trial', ghostTime: 52.35, delta: -1.25 })).toBe('GHOST -1.25');
    expect(raceHudSubtitle({ kind: 'time-trial', ghostTime: 52.35, delta: 0.1 })).toBe('GHOST +0.10');
  });
});
