import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/race/maps';
import { buildMapTrack } from '../../src/race/track';
import { createRace, updateRace } from '../../src/race/race';
import { decideWinner, encodeSnap, followSnap, parseSnap } from '../../src/race/netcar';

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

  it('스냅샷은 형식이 맞는 숫자일 때만 받는다', () => {
    expect(parseSnap([1, 2])).toBeNull();
    expect(parseSnap(Array(16).fill('x'))).toBeNull();
    expect(parseSnap([...Array(15).fill(0), Infinity])).toBeNull();
    expect(parseSnap(Array(16).fill(1))).toHaveLength(16);
    expect(parseSnap(null)).toBeNull();
  });

  it('너무 멀어진 상대는 바로 옮기고 가까우면 부드럽게 따라간다', () => {
    const car = createRace(track, 1, Infinity).player.car, link = { snap: parseSnap(encodeSnap({ ...car, x: car.x + 200 })), at: 0 };
    followSnap(car, link, 0, 1 / 90); expect(car.x).toBeCloseTo(link.snap![0], 5);
    const near = { snap: parseSnap(encodeSnap({ ...car, x: car.x + 4, vx: 0 })), at: 0 }, x0 = car.x;
    followSnap(car, near, 0, 1 / 90); expect(car.x).toBeGreaterThan(x0); expect(car.x).toBeLessThan(x0 + 4);
  });

  it('결승 기록이 더 빠른 쪽이 이기고 같으면 방장이 이긴다', () => {
    expect(decideWinner(50, 51, false)).toBe('me');
    expect(decideWinner(52, 51, true)).toBe('them');
    expect(decideWinner(50, 50, true)).toBe('me');
    expect(decideWinner(50, 50, false)).toBe('them');
  });
});
