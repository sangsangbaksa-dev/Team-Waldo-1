// SPEED RUSH — 레이스 진행(카운트다운·랩·순위·AI·차량 간 충돌). 화면과 무관한 순수 로직입니다.
import { CARS, carById, carParams, levelById, type CarDef, type LevelDef } from './config';
import { aiInput, newCar, stepCar, type AiProfile, type CarInput, type CarParams, type CarState, type StepEvents } from './physics';
import { type Track } from './track';

export interface Racer {
  id: number; name: string; color: string; player: boolean; car: CarState; ai: AiProfile; params: CarParams; model: CarDef['model']; accent: string;
  lapTimes: number[]; lapStart: number; finishTime: number | null; lastEv: StepEvents;
}
export type RaceEvent =
  | { type: 'count'; n: number } | { type: 'go' } | { type: 'launch' }
  | { type: 'lap'; lap: number; time: number; best: boolean } | { type: 'finish'; place: number; time: number }
  | { type: 'hit'; power: number } | { type: 'driftBoost'; secs: number } | { type: 'pad' } | { type: 'bump'; power: number };
export interface RaceState {
  track: Track; laps: number; clock: number; phase: 'countdown' | 'racing' | 'done'; racers: Racer[]; player: Racer;
  thrDownAt: number | null; thrPrev: boolean; bestLap: number; lastCount: number; level: LevelDef;
}
export const COUNTDOWN = 3;
/** 라이벌 세 명: 이름, 고정 차선, 자기 차량 최고속 대비 목표 속도 비율, 코너 한계. 1단계 값은 이전 버전과 같습니다. */
const FIELD = [
  { name: 'VIPER', lane: -5, frac: 70.5 / 74, grip: 37 },
  { name: 'SOLAR', lane: 5, frac: 68 / 74, grip: 35 },
  { name: 'MINT', lane: 0, frac: 65.5 / 74, grip: 33 },
];
const SLOTS: Array<[number, number]> = [[-3, -5], [-3, 5], [-8, -5], [-8, 5]];
export interface RaceOptions { level?: number; car?: string }

export function createRace(track: Track, laps = 3, bestLap = Infinity, opts: RaceOptions = {}): RaceState {
  const level = levelById(opts.level ?? 1), mine = carById(opts.car ?? CARS[0].id), at = CARS.indexOf(mine);
  const mk = (id: number, name: string, def: CarDef, player: boolean, slot: [number, number], ai: AiProfile): Racer =>
    ({ id, name, color: def.color, player, car: newCar(track, track.n + slot[0], slot[1]), ai, params: carParams(def), model: def.model, accent: def.accent, lapTimes: [], lapStart: 0, finishTime: null, lastEv: { hit: 0, driftBoost: 0, pad: false } });
  const player = mk(0, 'YOU', mine, true, SLOTS[2], { lane: 0, top: 58, grip: 30, skill: 1 });
  const rivals = FIELD.map((f, i) => {
    const def = CARS[(at + 1 + i) % CARS.length], p = carParams(def), handling = p.grip * p.turn;
    const ai: AiProfile = { lane: f.lane, top: p.top * f.frac * level.topMul, grip: f.grip * handling * handling * level.gripMul, skill: 1, line: level.line, nitro: level.nitro };
    return mk(i + 1, f.name, def, false, [SLOTS[0], SLOTS[1], SLOTS[3]][i], ai);
  });
  return { track, laps, clock: -COUNTDOWN, phase: 'countdown', racers: [player, ...rivals], player, thrDownAt: null, thrPrev: false, bestLap, lastCount: COUNTDOWN + 1, level };
}

const score = (r: Racer): number => (r.finishTime !== null ? 1e9 - r.finishTime : r.car.total);
export function standings(r: RaceState): Racer[] { return [...r.racers].sort((a, b) => score(b) - score(a)); }
export const placeOf = (r: RaceState, who: Racer = r.player): number => standings(r).indexOf(who) + 1;
export const currentLap = (r: RaceState, who: Racer = r.player): number => Math.min(r.laps, Math.max(1, Math.floor(who.car.total / r.track.n) + 1));
/** 플레이어와 racer 사이의 거리(m). 양수면 racer 가 앞. */
export const gapMeters = (r: RaceState, who: Racer): number => (who.car.total - r.player.car.total) * r.track.ds;

const IDLE: CarInput = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };

export function updateRace(r: RaceState, dt: number, input: CarInput): RaceEvent[] {
  const ev: RaceEvent[] = [], t = r.track;
  r.clock += dt;
  const pressed = input.throttle > 0.05;
  if (r.phase === 'countdown') {
    const n = Math.ceil(-r.clock); if (n < r.lastCount && n >= 1) { r.lastCount = n; ev.push({ type: 'count', n }); }
    if (pressed && !r.thrPrev) r.thrDownAt = r.clock;
    if (!pressed) r.thrDownAt = null;
    if (r.clock >= 0) {
      r.phase = 'racing'; ev.push({ type: 'go' });
      if (pressed && r.thrDownAt !== null && r.thrDownAt >= -0.5) { r.player.car.boostT = 1.4; ev.push({ type: 'launch' }); }
      r.clock = 0; for (const k of r.racers) k.lapStart = 0;
    }
  }
  r.thrPrev = pressed;
  const racing = r.phase !== 'countdown';
  for (const k of r.racers) {
    let inp: CarInput = IDLE;
    if (racing) {
      if (k.player && k.finishTime === null) inp = input;
      else {
        const gap = k.player ? 0 : (k.car.total - r.player.car.total) * t.ds, band = Math.max(r.level.bandLo, Math.min(r.level.bandHi, 1 - gap * r.level.bandK));
        inp = aiInput(k.car, t, { ...k.ai, top: k.ai.top * band, grip: k.ai.grip * band * band });
      }
    }
    k.lastEv = stepCar(k.car, inp, dt, t, k.params);
    if (k.player) {
      if (k.lastEv.hit > 0) ev.push({ type: 'hit', power: k.lastEv.hit });
      if (k.lastEv.driftBoost > 0) ev.push({ type: 'driftBoost', secs: k.lastEv.driftBoost });
      if (k.lastEv.pad) ev.push({ type: 'pad' });
    }
  }
  // 차량 간 충돌(원형 근사)
  for (let i = 0; i < r.racers.length; i++) for (let j = i + 1; j < r.racers.length; j++) {
    const a = r.racers[i].car, b = r.racers[j].car, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 3.3;
    if (d < min && d > 1e-3) {
      const nx = dx / d, nz = dz / d, push = (min - d) / 2; a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel > 0) { const imp = rel * 0.55; a.vx -= nx * imp; a.vz -= nz * imp; b.vx += nx * imp; b.vz += nz * imp; if ((i === 0 || j === 0) && rel > 3) ev.push({ type: 'bump', power: rel }); }
    }
  }
  // 랩·결승
  for (const k of r.racers) {
    if (k.finishTime !== null) continue;
    const lapDone = Math.floor(k.car.total / t.n);
    while (k.lapTimes.length < Math.min(lapDone, r.laps)) {
      const lt = r.clock - k.lapStart; k.lapTimes.push(lt); k.lapStart = r.clock;
      if (k.player) { const best = lt < r.bestLap; if (best) r.bestLap = lt; ev.push({ type: 'lap', lap: k.lapTimes.length, time: lt, best }); }
    }
    if (k.lapTimes.length >= r.laps) {
      k.finishTime = r.clock;
      if (k.player) { r.phase = 'done'; ev.push({ type: 'finish', place: standings(r).indexOf(k) + 1, time: r.clock }); }
    }
  }
  return ev;
}
