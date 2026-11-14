import { describe, expect, it } from 'vitest';
import { CARS, LAP_OPTIONS, LEVELS, STAT_BUDGET, STAT_KEYS, carParams, sanitizeSetup } from '../../src/race/config';
import { MAPS } from '../../src/race/maps';
import { aiInput, newCar, stepCar } from '../../src/race/physics';
import { COUNTDOWN, createRace, currentLap, updateRace } from '../../src/race/race';
import { buildMapTrack, idxDelta } from '../../src/race/track';

const DT = 1 / 90;

describe('코스', () => {
  it('네 곳이고 사막 고속도로가 포함된다', () => {
    expect(MAPS.map(m => m.id)).toEqual(['sunset', 'harbor', 'alpine', 'desert']);
  });
  for (const m of MAPS) {
    const t = buildMapTrack(m);
    it(`${m.id}: 닫힌 서킷이고 코너가 달릴 수 있는 반경이다`, () => {
      expect(t.length).toBeGreaterThan(2400); expect(t.length).toBeLessThan(4600);
      let minR = Infinity; for (let i = 0; i < t.n; i++) minR = Math.min(minR, 1 / Math.max(1e-6, Math.abs(t.k[i])));
      expect(minR).toBeGreaterThan(28);
      expect(Math.hypot(t.x[0] - t.x[t.n - 1], t.z[0] - t.z[t.n - 1])).toBeLessThan(t.ds * 1.5);
    });
    it(`${m.id}: 도로가 서로 겹치지 않는다`, () => {
      let min = Infinity;
      for (let i = 0; i < t.n; i += 3) for (let j = i + 1; j < t.n; j += 3) { const gap = Math.min(j - i, t.n - (j - i)); if (gap > 40) min = Math.min(min, Math.hypot(t.x[i] - t.x[j], t.z[i] - t.z[j])); }
      expect(min).toBeGreaterThan(t.halfWidth * 4);
    });
    it(`${m.id}: 부스트 패드가 서로 떨어져 있다`, () => {
      expect(t.pads.length).toBe(m.pads.length);
      for (let a = 0; a < t.pads.length; a++) for (let b = a + 1; b < t.pads.length; b++) expect(Math.abs(idxDelta(t, t.pads[a], t.pads[b]))).toBeGreaterThan(10);
    });
  }
  it('사막 하이웨이는 거의 직선이고 가장 길다', () => {
    const t = buildMapTrack(MAPS.find(m => m.id === 'desert')!);
    let straight = 0, minR = Infinity; for (let i = 0; i < t.n; i++) { const k = Math.abs(t.k[i]); if (k < 1 / 800) straight++; minR = Math.min(minR, 1 / Math.max(1e-6, k)); }
    expect(straight / t.n).toBeGreaterThan(0.5); expect(minR).toBeGreaterThan(130);
    for (const other of MAPS.filter(m => m.id !== 'desert')) expect(t.length).toBeGreaterThan(buildMapTrack(other).length);
  });
});

describe('차량', () => {
  it('여섯 대이고 능력치 합계가 모두 같다', () => {
    expect(CARS).toHaveLength(6);
    for (const c of CARS) { expect(STAT_KEYS.reduce((s, k) => s + c.points[k], 0), c.id).toBe(STAT_BUDGET); for (const k of STAT_KEYS) { expect(c.points[k]).toBeGreaterThanOrEqual(1); expect(c.points[k]).toBeLessThanOrEqual(5); } }
  });
  it('성격이 모두 다르다', () => {
    expect(new Set(CARS.map(c => JSON.stringify(c.points))).size).toBe(CARS.length);
    expect(new Set(CARS.map(c => c.color)).size).toBe(CARS.length);
    const top = (id: string): number => carParams(CARS.find(c => c.id === id)!).top, acc = (id: string): number => carParams(CARS.find(c => c.id === id)!).accel;
    expect(top('velox')).toBeGreaterThan(top('arc')); expect(top('arc')).toBeGreaterThan(top('bolt'));
    expect(acc('bolt')).toBeGreaterThan(acc('arc')); expect(acc('arc')).toBeGreaterThan(acc('velox'));
    expect(carParams(CARS.find(c => c.id === 'orbit')!).turn).toBeGreaterThan(1); expect(carParams(CARS.find(c => c.id === 'slide')!).drift).toBeGreaterThan(1); expect(carParams(CARS.find(c => c.id === 'fuse')!).nitro).toBeGreaterThan(1);
  });
  it('균형형은 이전 버전의 기본 성능과 같다', () => {
    expect(carParams(CARS[0])).toEqual({ top: 74, accel: 15, brake: 62, grip: 1, turn: 1, drift: 1, nitro: 1 });
  });
  it('자동 주행 랩 타임 차이가 코스마다 10% 안쪽이다(실력이 아닌 성능 차이만 본다)', () => {
    for (const m of MAPS) {
      const t = buildMapTrack(m), times = CARS.map(car => {
        const p = carParams(car), c = newCar(t, 0, 0), h = p.grip * p.turn; let time = 0, first = 0;
        while (c.total < t.n * 2 && time < 300) { stepCar(c, aiInput(c, t, { lane: 0, top: p.top * 0.99, grip: 38 * h * h, skill: 1, line: 1, nitro: 0.02 }), DT, t, p); time += DT; if (!first && c.total >= t.n) first = time; }
        return time - first;
      });
      expect(Math.max(...times) / Math.min(...times) - 1, m.id).toBeLessThan(0.1);
    }
  }, 60000);
});

describe('난이도', () => {
  it('다섯 단계이고 단계가 오를수록 라이벌이 강해진다', () => {
    expect(LEVELS.map(l => l.name)).toEqual(['쉬움', '보통', '어려움', '매우 어려움', '극한']);
    for (let i = 1; i < LEVELS.length; i++) { const a = LEVELS[i - 1], b = LEVELS[i]; expect(b.topMul).toBeGreaterThan(a.topMul); expect(b.gripMul).toBeGreaterThan(a.gripMul); expect(b.bandHi).toBeGreaterThanOrEqual(a.bandHi); expect(b.bandLo).toBeGreaterThanOrEqual(a.bandLo); expect(b.line).toBeGreaterThanOrEqual(a.line); }
  });
  it('1단계(쉬움)는 이전 버전 라이벌과 같다', () => {
    // 플레이어가 마지막 차량이면 첫 라이벌이 균형형(ARC)이라 이전 버전의 수치가 그대로 나온다.
    const r = createRace(buildMapTrack(MAPS[0]), 3, Infinity, { level: 1, car: 'fuse' });
    expect(r.racers[1].ai.top).toBeCloseTo(70.5, 6); expect(r.racers[1].ai.grip).toBeCloseTo(37, 6); expect(r.racers[1].ai.nitro).toBeUndefined(); expect(r.racers[1].ai.line).toBe(0);
    expect([LEVELS[0].bandLo, LEVELS[0].bandHi, LEVELS[0].bandK]).toEqual([0.93, 1.07, 0.00022]);
  });
  it('라이벌은 플레이어와 다른 차량을 탄다', () => {
    for (const c of CARS) { const colors = createRace(buildMapTrack(MAPS[0]), 1, Infinity, { car: c.id }).racers.map(k => k.color); expect(new Set(colors).size).toBe(4); }
  });
  it('높은 난이도 라이벌이 더 빨리 달린다', () => {
    const t = buildMapTrack(MAPS[0]), avg = (level: number): number => { const r = createRace(t, 1, Infinity, { level, car: 'arc' }); let time = 0; while (r.phase !== 'done' && time < 200) { const ev = updateRace(r, DT, aiInput(r.player.car, t, { lane: 0, top: 70, grip: 36, skill: 1 })); time += DT; void ev; if (r.racers.slice(1).every(k => k.finishTime !== null)) break; } return r.racers.slice(1).reduce((s, k) => s + (k.finishTime ?? 999), 0) / 3; };
    expect(avg(5)).toBeLessThan(avg(1));
  }, 60000);
});

describe('선택 값 검증', () => {
  it('깨진 값은 기본 선택으로 되돌린다', () => {
    expect(sanitizeSetup(null)).toEqual({ map: 'sunset', laps: 3, level: 1, car: 'arc' });
    expect(sanitizeSetup({ map: 'nope', laps: 9, level: 0, car: 7 })).toEqual({ map: 'sunset', laps: 3, level: 1, car: 'arc' });
    expect(sanitizeSetup({ map: 'desert', laps: 2, level: 5, car: 'fuse' })).toEqual({ map: 'desert', laps: 2, level: 5, car: 'fuse' });
  });
});

describe('종목별 완주', () => {
  for (const m of MAPS) for (const laps of LAP_OPTIONS) {
    it(`${m.id} ${laps}랩: 랩이 한 번씩 세어지고 완주한다`, () => {
      const t = buildMapTrack(m), r = createRace(t, laps, Infinity, { level: 3, car: 'velox' }), seen: number[] = []; let time = 0, finish = 0;
      const drive = { lane: 0, top: 71, grip: 37, skill: 1, line: 1 };
      while (r.phase !== 'done' && time < COUNTDOWN + 60 * laps + 60) {
        for (const e of updateRace(r, DT, aiInput(r.player.car, t, drive))) { if (e.type === 'lap') seen.push(e.lap); if (e.type === 'finish') finish = e.place; }
        time += DT;
      }
      expect(r.phase).toBe('done'); expect(seen).toEqual(Array.from({ length: laps }, (_, i) => i + 1)); expect(finish).toBeGreaterThanOrEqual(1); expect(currentLap(r)).toBe(laps);
    }, 60000);
  }
});
