import { describe, expect, it } from 'vitest';
import { activeRacers, createRace, knockoutsLeft, placeOf, standings, updateRace, type RaceEvent, type RaceState } from '../../src/race/race';
import { aiInput, type CarInput } from '../../src/race/physics';
import { buildMapTrack } from '../../src/race/track';
import { MAPS } from '../../src/race/maps';
import { sanitizeSetup } from '../../src/race/config';

const STEP = 1 / 90, IDLE: CarInput = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
function run(r: RaceState, drive: (r: RaceState) => CarInput, maxSec = 600): RaceEvent[] {
  const all: RaceEvent[] = [];
  for (let t = 0; t < maxSec && r.phase !== 'done'; t += STEP) all.push(...updateRace(r, STEP, drive(r)));
  return all;
}

describe('녹아웃 모드', () => {
  it('설정 값으로 knockout 을 받아들인다', () => {
    expect(sanitizeSetup({ mode: 'knockout' }).mode).toBe('knockout');
    expect(sanitizeSetup({ mode: 'elim' }).mode).toBe('race');
  });

  it('출발하지 않으면 1랩이 끝날 때 꼴찌인 내가 탈락하고 레이스가 끝난다', () => {
    const r = createRace(buildMapTrack(MAPS[0]), 3, Infinity, { map: MAPS[0].id, knockout: true });
    expect(knockoutsLeft(r)).toBe(2);
    const ev = run(r, () => IDLE);
    const ko = ev.filter(e => e.type === 'knockout');
    expect(ko).toHaveLength(1);
    expect(ko[0]).toMatchObject({ player: true, place: 4, left: 3 });
    expect(r.phase).toBe('done'); expect(r.player.out).toBe(4); expect(placeOf(r)).toBe(4);
  });

  it('잘 달리면 두 대가 차례로 탈락하고 남은 둘이 결승을 치른다', () => {
    const r = createRace(buildMapTrack(MAPS[0]), 3, Infinity, { map: MAPS[0].id, knockout: true, level: 1 });
    r.racers.slice(1).forEach((k, i) => { k.ai = { ...k.ai, top: k.ai.top * (0.86 - i * 0.03) }; }); // 라이벌 간격을 벌려 결과를 예측 가능하게
    const drive = (s: RaceState): CarInput => { const c = s.player.car; return { ...aiInput(c, s.track, { lane: 0, top: s.player.params.top * 0.99, grip: 40, skill: 1, line: 1 }), nitro: c.nitro > 0.4 }; };
    const ev = run(r, drive);
    const ko = ev.filter((e): e is Extract<RaceEvent, { type: 'knockout' }> => e.type === 'knockout');
    expect(ko.map(e => e.place)).toEqual([4, 3]);
    expect(ko.every(e => !e.player)).toBe(true);
    expect(activeRacers(r)).toHaveLength(2); expect(knockoutsLeft(r)).toBe(0);
    const fin = ev.find(e => e.type === 'finish');
    expect(fin && fin.type === 'finish' && fin.place).toBeLessThanOrEqual(2);
    // 탈락한 차는 순위표 맨 뒤(먼저 탈락한 차가 더 아래)
    const order = standings(r); expect(order[3].out).toBe(4); expect(order[2].out).toBe(3);
  });

  it('일반 레이스에서는 아무도 탈락하지 않는다', () => {
    const r = createRace(buildMapTrack(MAPS[0]), 2, Infinity, { map: MAPS[0].id });
    const ev = run(r, () => IDLE, 200);
    expect(ev.some(e => e.type === 'knockout')).toBe(false); expect(knockoutsLeft(r)).toBe(0);
  });
});
