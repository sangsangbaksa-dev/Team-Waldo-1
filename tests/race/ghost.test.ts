import { describe, expect, it } from 'vitest';
import { GHOST_DT, GhostRecorder, ghostAt, ghostDelta, ghostTimeAt, sanitizeGhost } from '../../src/race/ghost';
import { createRace, updateRace } from '../../src/race/race';
import { buildMapTrack } from '../../src/race/track';
import { MAPS } from '../../src/race/maps';
import { buySkin, emptyGarage, ownsSkin, sanitizeGarage } from '../../src/race/garage';
import { CARS, paintOf, sanitizeSetup } from '../../src/race/config';

const line = () => { const r = new GhostRecorder(); for (let i = 0; i <= 50; i++) r.tick(i * GHOST_DT + 1e-6, { x: i, z: 0, h: 0, total: i * 2 }); return r.finish(5, 1); };

describe('고스트', () => {
  it('0.1초마다 한 번씩만 기록한다', () => {
    const r = new GhostRecorder(); for (let t = 0; t < 1; t += 1 / 90) r.tick(t, { x: t, z: 0, h: 0, total: t });
    expect(r.data.length / 4).toBeGreaterThanOrEqual(10); expect(r.data.length / 4).toBeLessThanOrEqual(11);
  });
  it('시각에 맞는 위치를 보간하고 끝나면 null', () => {
    const g = line(); expect(ghostAt(g, 0.25)!.x).toBeCloseTo(2.5, 1); expect(ghostAt(g, 99)).toBeNull();
  });
  it('진행 거리에서 시각을, 내 기록과의 차이를 구한다', () => {
    const g = line(); expect(ghostTimeAt(g, 20)).toBeCloseTo(1, 1); expect(ghostDelta(g, 20, 1.5)).toBeCloseTo(0.5, 1); expect(ghostTimeAt(g, 1e6)).toBeNull();
  });
  it('깨진 저장값은 버린다', () => {
    expect(sanitizeGhost(null)).toBeNull(); expect(sanitizeGhost({ time: 5, laps: 1, data: [1, 2, 3] })).toBeNull(); expect(sanitizeGhost(line())).not.toBeNull();
  });
});

describe('타임어택', () => {
  it('혼자 달리고 주행이 기록된다', () => {
    const r = createRace(buildMapTrack(MAPS[0]), 1, Infinity, { trial: true, ghost: null });
    expect(r.racers).toHaveLength(1); expect(r.trial).toBe(true);
    for (let i = 0; i < 90 * 5; i++) updateRace(r, 1 / 90, { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false });
    expect(r.rec!.data.length).toBeGreaterThan(4);
  });
});

describe('스킨', () => {
  it('코인으로 사고 보유가 저장·복원된다', () => {
    let g = { ...emptyGarage(), coins: 300 }; expect(buySkin(g, 'gold')).toBeNull(); const n = buySkin(g, 'night')!; expect(n.coins).toBe(80); expect(ownsSkin(n, 'night')).toBe(true); expect(buySkin(n, 'night')).toBeNull();
    g = sanitizeGarage(JSON.parse(JSON.stringify(n))); expect(g.skins).toEqual(['night']); expect(sanitizeGarage({ skins: ['zzz', 'night'] }).skins).toEqual(['night']);
  });
  it('스킨은 내 차의 색만 바꾼다', () => {
    const r = createRace(buildMapTrack(MAPS[0]), 1, Infinity, { skin: 'neon' }); expect(r.player.color).toBe(paintOf(CARS[0], 'neon').color); expect(r.racers[1].color).not.toBe(r.player.color);
    expect(sanitizeSetup({ skin: 'nope' }).skin).toBe('stock');
  });
});
