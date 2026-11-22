import { describe, expect, it } from 'vitest';
import { CARS, LEVELS } from '../../src/race/config';
import { GRAZE_LIMIT, aiInput, kmh, newCar, stayOnTrack, stepCar, type CarInput } from '../../src/race/physics';
import { createRace, rivalBand, updateRace } from '../../src/race/race';
import { MAPS } from '../../src/race/maps';
import { buildMapTrack } from '../../src/race/track';

const DT = 1 / 90;
const hold = (steer: number): CarInput => ({ throttle: 1, brake: 0, steer, drift: false, nitro: false });

describe('벽과 조향', () => {
  it('조향을 끝까지 잡고 6초 달려도 벽에 붙어 속도가 죽지 않는다(양쪽 모두, 모든 코스)', () => {
    for (const m of MAPS) for (const steer of [1, -1]) {
      const t = buildMapTrack(m), c = newCar(t, t.n - 8, 0);
      for (let i = 0; i < 90 * 6; i++) { stepCar(c, hold(steer), DT, t); stayOnTrack(c, t, DT, false); }
      expect(kmh(c), `${m.id} ${steer}`).toBeGreaterThan(80);
      expect(kmh(c), `${m.id} ${steer}`).toBeLessThan(190); // 벽을 타는 것이 정상 주행보다 빠르면 안 된다
    }
  });

  it('스치기(약한 충돌)는 부스트와 드리프트를 유지하고 세게 박으면 모두 잃는다', () => {
    const t = buildMapTrack(MAPS[0]);
    const mk = (outward: number) => {
      const c = newCar(t, 40, 0), i = c.idx, px = -t.tz[i], pz = t.tx[i], lim = t.halfWidth - 1.02 - 0.28;
      c.x += px * (lim + 0.2); c.z += pz * (lim + 0.2); c.vx = t.tx[i] * 30 + px * outward; c.vz = t.tz[i] * 30 + pz * outward;
      c.boostT = 1.5; c.drifting = true; c.driftT = 1;
      stayOnTrack(c, t, DT, true);
      return c;
    };
    const graze = mk(6), crash = mk(GRAZE_LIMIT + 6);
    expect(graze.boostT).toBeGreaterThan(1);
    expect(graze.drifting).toBe(true);
    expect(crash.boostT).toBe(0);
    expect(crash.drifting).toBe(false);
  });
});

describe('코스와 난이도', () => {
  it('데저트 하이웨이에는 왼쪽 커브도 충분히 있다', () => {
    const t = buildMapTrack(MAPS.find(m => m.id === 'desert')!);
    let left = 0, right = 0;
    for (let i = 0; i < t.n; i++) { if (t.k[i] < -0.0015) left++; if (t.k[i] > 0.0015) right++; }
    expect(left).toBeGreaterThan(t.n * 0.1);
    expect(right).toBeGreaterThan(t.n * 0.1);
  });

  it('녹아웃에서는 앞선 라이벌이 거리에 따라 더 많이 속도를 줄인다', () => {
    const lv = LEVELS[0];
    expect(rivalBand(lv, 200, true)).toBeLessThan(rivalBand(lv, 200, false));
    expect(rivalBand(lv, 200, true)).toBeGreaterThanOrEqual(lv.koFloor);
    expect(rivalBand(lv, -200, true)).toBe(rivalBand(lv, -200, false)); // 뒤처진 라이벌은 그대로
  });

  it('쉬움 녹아웃은 괜찮은 라인으로 달리면 모든 차량이 마지막 랩까지 살아남는다', () => {
    const t = buildMapTrack(MAPS[0]);
    for (const car of CARS) {
      const r = createRace(t, 3, Infinity, { map: MAPS[0].id, level: 1, car: car.id, knockout: true });
      let t0 = 0;
      while (r.phase !== 'done' && t0 < 400) {
        const c = r.player.car, ai = aiInput(c, t, { lane: 0, top: r.player.params.top * 0.97, grip: 38, skill: 1, line: 1 });
        updateRace(r, DT, { ...ai, nitro: c.nitro > 0.5 && Math.abs(t.k[c.idx]) < 0.002 }); t0 += DT;
      }
      expect(r.player.out, car.id).toBeUndefined();
    }
  });
});

describe('시계', () => {
  it('시계는 시뮬레이션만 움직이고 카운트다운 뒤 출발한다', () => {
    const t = buildMapTrack(MAPS[0]), r = createRace(t, 3, Infinity, { map: MAPS[0].id });
    const evs: string[] = [];
    for (let i = 0; i < 90 * 3.2; i++) for (const e of updateRace(r, DT, hold(0))) evs.push(e.type);
    expect(evs.filter(e => e === 'count')).toHaveLength(3);
    expect(evs).toContain('go');
    expect(evs).toContain('launch'); // 카운트다운 내내 가속을 누르고 있어도 출발 부스트
    expect(r.phase).toBe('racing');
  });
});
