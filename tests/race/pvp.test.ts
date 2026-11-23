import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/race/maps';
import { CARS, paintOf } from '../../src/race/config';
import { buildMapTrack } from '../../src/race/track';
import { createRace, updateRace } from '../../src/race/race';
import { decideWinner, eligibleForForfeit, encodeSnap, followSnap, parseSnap, plausibleFinishTime, validFinishTime } from '../../src/race/netcar';

const track = buildMapTrack(MAPS[0]);
const idle = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };

describe('SPEED RUSH 1대1 레이스', () => {
  it('플레이어와 상대 두 대만 나란히 출발한다', () => {
    const host = createRace(track, 2, Infinity, { pvp: { host: true, opponent: '민수', opponentCar: 'bolt' } });
    const guest = createRace(track, 2, Infinity, { pvp: { host: false, opponent: '지아', opponentCar: 'arc' } });
    expect(host.racers.map(r => r.name)).toEqual(['YOU', '민수']);
    expect(host.racers[1].link).toBeDefined();
    // 두 클라이언트에서 서로의 출발 칸이 맞아떨어진다.
    expect(host.racers[0].car.x).toBeCloseTo(guest.racers[1].car.x, 5);
    expect(host.racers[0].car.z).toBeCloseTo(guest.racers[1].car.z, 5);
    expect(host.racers[1].car.x).toBeCloseTo(guest.racers[0].car.x, 5);
    expect(host.racers[1].car.z).toBeCloseTo(guest.racers[0].car.z, 5);
  });

  it('applies a selected purely cosmetic paint in online duels without painting opponents', () => {
    const car = CARS.find(c => c.id === 'nova')!;
    const r = createRace(track, 1, Infinity, {
      car: car.id, skin: 'neon',
      pvp: { host: true, opponent: 'B', opponentCar: 'arc' },
    });
    expect(r.player.color).toBe(paintOf(car, 'neon').color);
    expect(r.player.accent).toBe(paintOf(car, 'neon').accent);
    expect(r.racers[1].color).toBe(CARS[0].color);
    expect(r.player.params).toEqual(createRace(track, 1, Infinity, {
      car: car.id, pvp: { host: true, opponent: 'B', opponentCar: 'arc' },
    }).player.params);
  });

  it('uses the same purchased cosmetic paint on the multiplayer start grid', () => {
    const r = createRace(track, 2, Infinity, {
      car: 'nova', skin: 'royal',
      multi: { slot: 2, players: [{ id: 'peer-a', nickname: 'Alpha', car: 'bolt' }, { id: 'peer-b', nickname: 'Beta', car: 'arc' }] },
    });
    const car = CARS.find(c => c.id === 'nova')!;
    expect(r.player.color).toBe(paintOf(car, 'royal').color);
    expect(r.player.accent).toBe(paintOf(car, 'royal').accent);
    expect(r.racers.slice(1).map(x => x.color)).toEqual([CARS.find(c => c.id === 'bolt')!.color, CARS[0].color]);
  });

  it('상대 차량은 AI 가 아니라 받은 스냅샷을 따라간다', () => {
    const race = createRace(track, 1, Infinity, { pvp: { host: true, opponent: 'B', opponentCar: 'arc' } });
    const rival = race.racers[1], me = race.racers[0];
    for (let i = 0; i < 90 * 5; i++) updateRace(race, 1 / 90, idle, i * 11);
    expect(rival.car.vf).toBe(0); // 스냅샷이 없으면 제자리
    const src = structuredClone(me.car); src.x += 40; src.z += 9; src.vx = 30; src.vf = 30; src.total = 12;
    rival.link = { snap: parseSnap(encodeSnap(src)), at: 5000 };
    for (let i = 0; i < 90 * 2; i++) updateRace(race, 1 / 90, idle, 5000 + i * 11);
    expect(Math.hypot(rival.car.x - (src.x + 30 * 0.25), rival.car.z - src.z)).toBeLessThan(3);
    expect(rival.car.total).toBe(12);
    expect(rival.lapTimes).toEqual([]);
  });

  it('rejects an out-of-range network sample index instead of reading off the track', () => {
    const race = createRace(track, 1, Infinity, { pvp: { host: true, opponent: 'B', opponentCar: 'arc' } });
    const src = encodeSnap(race.player.car); src[12] = 999999;
    race.racers[1].link = { snap: src, at: 1000 };
    updateRace(race, 1 / 90, idle, 1000);
    expect(race.racers[1].car.idx).toBeGreaterThanOrEqual(0);
    expect(race.racers[1].car.idx).toBeLessThan(track.n);
  });

  it('스냅샷은 형식이 맞는 숫자일 때만 받는다', () => {
    expect(parseSnap([1, 2])).toBeNull();
    expect(parseSnap(Array(16).fill('x'))).toBeNull();
    expect(parseSnap([...Array(15).fill(0), Infinity])).toBeNull();
    expect(parseSnap(Array(16).fill(1))).toHaveLength(16);
    expect(parseSnap(null)).toBeNull();
  });

  it('rejects sparse or fractional-index snapshots that could poison the renderer', () => {
    const src = encodeSnap(createRace(track, 1).player.car);
    const missing = src.slice() as Array<number | undefined>;
    delete missing[0];
    expect(missing.length).toBe(16);
    expect(parseSnap(missing)).toBeNull();
    const badIndex = src.slice(); badIndex[12] = 2.5;
    expect(parseSnap(badIndex)).toBeNull();
    const negativeIndex = src.slice(); negativeIndex[12] = -1;
    expect(parseSnap(negativeIndex)).toBeNull();
  });

  it('never updates a remote car from a nonfinite interpolation clock', () => {
    const car = createRace(track, 1, Infinity).player.car;
    const base = structuredClone(car);
    const remote = encodeSnap({ ...car, x: car.x + 10, vx: 25 });
    const link = { snap: parseSnap(remote), at: 100 };
    for (const [now, dt] of [[Infinity, 1 / 90], [NaN, 1 / 90], [100, NaN], [100, 0], [100, -1]]) {
      followSnap(car, link, now, dt);
      expect(car).toEqual(base);
    }
    followSnap(car, { snap: remote, at: Infinity }, 100, 1 / 90);
    expect(car).toEqual(base);
  });

  it('rejects malicious remote angles and out-of-range car physics before rendering', () => {
    const src = encodeSnap(createRace(track, 1).player.car);
    expect(parseSnap(src)).toEqual(src);
    for (const [field, value] of [
      [0, 1_000_000], [3, 1_000_000], [10, 100_000],
      [9, 2], [11, 1_000_000], [13, -0.5], [13, 2], [14, -1], [15, 2],
    ]) {
      const invalid = src.slice();
      invalid[field] = value;
      expect(parseSnap(invalid)).toBeNull();
    }
  });

  it('너무 멀어진 상대는 바로 옮기고 가까우면 부드럽게 따라간다', () => {
    const car = createRace(track, 1, Infinity).player.car, link = { snap: parseSnap(encodeSnap({ ...car, x: car.x + 200 })), at: 0 };
    followSnap(car, link, 0, 1 / 90); expect(car.x).toBeCloseTo(link.snap![0], 5);
    const near = { snap: parseSnap(encodeSnap({ ...car, x: car.x + 4, vx: 0 })), at: 0 }, x0 = car.x;
    followSnap(car, near, 0, 1 / 90); expect(car.x).toBeGreaterThan(x0); expect(car.x).toBeLessThan(x0 + 4);
  });

  it('accepts real online lap times and rejects invalid or implausible peer finish packets', () => {
    expect(validFinishTime(0.001)).toBe(true);
    expect(validFinishTime(49.654)).toBe(true);
    expect(validFinishTime(3599)).toBe(true);
    for (const value of [0, -1, 3601, Infinity, -Infinity, NaN, null, '42', {}, []]) {
      expect(validFinishTime(value)).toBe(false);
    }
  });

  it('does not award wins or losses from a network handshake before the GO signal', () => {
    expect(eligibleForForfeit(false, 'racing')).toBe(false);
    expect(eligibleForForfeit(false, 'countdown')).toBe(false);
    expect(eligibleForForfeit(true, 'countdown')).toBe(false);
    expect(eligibleForForfeit(true, 'racing')).toBe(true);
    expect(eligibleForForfeit(true, 'done')).toBe(true);
  });

  it('rejects impossible peer lap times for each race length while retaining valid sprints', () => {
    expect(validFinishTime(0.001)).toBe(true); // generic packet format is unchanged
    for (const laps of [1, 2, 3]) {
      const physicalMinimum = track.length * laps / 180;
      expect(plausibleFinishTime(0.001, track.length, laps)).toBe(false);
      expect(plausibleFinishTime(physicalMinimum - 0.01, track.length, laps)).toBe(false);
      expect(plausibleFinishTime(physicalMinimum + 0.01, track.length, laps)).toBe(true);
      expect(plausibleFinishTime(physicalMinimum * 2, track.length, laps)).toBe(true);
    }
    for (const x of [NaN, Infinity, -1, 0]) expect(plausibleFinishTime(50, x, 1)).toBe(false);
    for (const laps of [-1, 0, 1.5, NaN]) expect(plausibleFinishTime(50, track.length, laps)).toBe(false);
  });

  it('결승 기록이 더 빠른 쪽이 이기고 같으면 방장이 이긴다', () => {
    expect(decideWinner(50, 51, false)).toBe('me');
    expect(decideWinner(52, 51, true)).toBe('them');
    expect(decideWinner(50, 50, true)).toBe('me');
    expect(decideWinner(50, 50, false)).toBe('them');
  });
});
