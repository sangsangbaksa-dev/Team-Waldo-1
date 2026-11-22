// SPEED RUSH — 레이스 진행(카운트다운·랩·순위·AI·차량 간 충돌). 화면과 무관한 순수 로직입니다.
import { CARS, carById, carParams, levelById, paintOf, type CarDef, type LevelDef } from './config';
import { aiInput, newCar, separateCars, stayOnTrack, stepCar, type AiProfile, type CarInput, type CarParams, type CarState, type StepEvents } from './physics';
import { followSnap, type RemoteLink } from './netcar';
import { type Track } from './track';
import { mapById } from './maps';
import { GhostRecorder, type Ghost } from './ghost';
import { createDrift, flushDrift, nitroForChain, stepDrift, type DriftScore } from './driftscore';

export interface Racer {
  id: number; name: string; color: string; player: boolean; car: CarState; ai: AiProfile; params: CarParams; model: CarDef['model']; accent: string;
  lapTimes: number[]; lapStart: number; finishTime: number | null; lastEv: StepEvents;
  /** Single mutable AI control buffer, owned by this racer (not by the shared input). */
  aiControl?: CarInput;
  /** 1대1 대전의 상대 차량: 물리 대신 네트워크 스냅샷을 따라갑니다. */
  link?: RemoteLink;
  /** 멀티플레이 방에서 이 차량을 모는 사람의 계정 id */
  peer?: string;
}
export type RaceEvent =
  | { type: 'count'; n: number } | { type: 'go' } | { type: 'launch' }
  | { type: 'lap'; lap: number; time: number; best: boolean } | { type: 'finish'; place: number; time: number }
  | { type: 'hit'; power: number } | { type: 'driftBoost'; secs: number } | { type: 'pad' } | { type: 'bump'; power: number }
  | { type: 'driftBank'; points: number; mult: number } | { type: 'driftLost'; points: number };
export interface RaceState {
  track: Track; laps: number; clock: number; phase: 'countdown' | 'racing' | 'done'; racers: Racer[]; player: Racer;
  thrDownAt: number | null; thrPrev: boolean; bestLap: number; lastCount: number; level: LevelDef;
  /** 타임어택: 혼자 달리며 ghost(내 최고 기록)와 겨룹니다. rec 는 이번 주행 기록 */
  trial?: boolean; ghost?: Ghost | null; rec?: GhostRecorder;
  /** 드리프트 점수(모든 모드) */
  drift: DriftScore;
}
export const COUNTDOWN = 3;
/** 라이벌 세 명: 이름, 고정 차선, 자기 차량 최고속 대비 목표 속도 비율, 코너 한계. 1단계 값은 이전 버전과 같습니다. */
const FIELD = [
  { name: 'VIPER', lane: -5, frac: 70.5 / 74, grip: 37 },
  { name: 'SOLAR', lane: 5, frac: 68 / 74, grip: 35 },
  { name: 'MINT', lane: 0, frac: 65.5 / 74, grip: 33 },
];
export const SLOTS: Array<[number, number]> = [[-3, -5], [-3, 5], [-8, -5], [-8, 5], [-13, -5], [-13, 5]];
/** 1대1 대전 설정: 방장 여부(출발 칸), 상대 닉네임과 차량 */
export interface PvpOptions { host: boolean; opponent: string; opponentCar: string }
/** 멀티플레이 방 설정: 내 출발 칸(0~5)과 나를 뺀 참가자(입장 순서). 모두 네트워크 스냅샷으로 움직입니다. */
export interface MultiOptions { slot: number; players: Array<{ id: string; nickname: string; car: string }> }
export interface RaceOptions { level?: number; car?: string; pvp?: PvpOptions; multi?: MultiOptions; /** 코스 번호(날씨에 따른 그립 보정) */ map?: string; /** 도장(스킨) id — 내 차량의 색만 바꿉니다 */ skin?: string; /** 타임어택(혼자 달리기) */ trial?: boolean; ghost?: Ghost | null; }
/** 빗길에서 줄어드는 그립 배율 */
export const wetGrip = (rain: number | undefined): number => 1 - 0.22 * (rain ?? 0);

export function createRace(track: Track, laps = 3, bestLap = Infinity, opts: RaceOptions = {}): RaceState {
  laps=Number.isFinite(laps)?Math.max(1,Math.min(3,Math.floor(laps))):3;
  const wet = wetGrip(mapById(opts.map ?? '').theme.rain), level = levelById(opts.level ?? 1), mine = carById(opts.car ?? CARS[0].id), at = CARS.indexOf(mine);
  const mk = (id: number, name: string, def: CarDef, player: boolean, slot: [number, number], ai: AiProfile): Racer =>
    ({ id, name, color: def.color, player, car: newCar(track, track.n + slot[0], slot[1]), ai: { ...ai, grip: ai.grip * wet }, params: { ...carParams(def), grip: carParams(def).grip * wet }, model: def.model, accent: def.accent, lapTimes: [], lapStart: 0, finishTime: null, lastEv: { hit: 0, driftBoost: 0, pad: false } });
  if (opts.pvp) {
    // 같은 줄의 왼쪽·오른쪽 칸에서 나란히 출발합니다. 상대는 AI 가 아니라 네트워크 스냅샷으로 움직입니다.
    const them = carById(opts.pvp.opponentCar), ai: AiProfile = { lane: 0, top: 58, grip: 30, skill: 1 };
    const me = mk(0, 'YOU', mine, true, SLOTS[opts.pvp.host ? 0 : 1], ai), rival = mk(1, opts.pvp.opponent, them, false, SLOTS[opts.pvp.host ? 1 : 0], ai);
    rival.link = { snap: null, at: 0 };
    return { track, laps, clock: -COUNTDOWN, phase: 'countdown', racers: [me, rival], player: me, thrDownAt: null, thrPrev: false, bestLap, lastCount: COUNTDOWN + 1, level, drift: createDrift() };
  }
  if (opts.multi) {
    const slot=Number.isInteger(opts.multi.slot)&&opts.multi.slot>=0&&opts.multi.slot<SLOTS.length?opts.multi.slot:0;
    const ai: AiProfile = { lane: 0, top: 58, grip: 30, skill: 1 }, me = mk(0, 'YOU', mine, true, SLOTS[slot], ai);
    const free = SLOTS.map((_, i) => i).filter(i => i !== slot);
    const unique=[...new Map(opts.multi.players.filter(p=>p.id).map(p=>[p.id,p])).values()].slice(0,free.length);
    const others = unique.map((pl, i) => { const r = mk(i + 1, pl.nickname, carById(pl.car), false, SLOTS[free[i]] ?? SLOTS[0], ai); r.link = { snap: null, at: 0 }; r.peer = pl.id; return r; });
    return { track, laps, clock: -COUNTDOWN, phase: 'countdown', racers: [me, ...others], player: me, thrDownAt: null, thrPrev: false, bestLap, lastCount: COUNTDOWN + 1, level, drift: createDrift() };
  }
  const player = mk(0, 'YOU', mine, true, SLOTS[2], { lane: 0, top: 58, grip: 30, skill: 1 });
  if (opts.skin) Object.assign(player, paintOf(mine, opts.skin));
  if (opts.trial) return { track, laps, clock: -COUNTDOWN, phase: 'countdown', racers: [player], player, thrDownAt: null, thrPrev: false, bestLap, lastCount: COUNTDOWN + 1, level, drift: createDrift(), trial: true, ghost: opts.ghost ?? null, rec: new GhostRecorder() };
  const rivals = FIELD.map((f, i) => {
    const def = CARS[(at + 1 + i) % CARS.length], p = carParams(def), handling = p.grip * p.turn;
    const ai: AiProfile = { lane: f.lane, top: p.top * f.frac * level.topMul, grip: f.grip * handling * handling * level.gripMul, skill: 1, line: level.line, nitro: level.nitro };
    return mk(i + 1, f.name, def, false, [SLOTS[0], SLOTS[1], SLOTS[3]][i], ai);
  });
  return { track, laps, clock: -COUNTDOWN, phase: 'countdown', racers: [player, ...rivals], player, thrDownAt: null, thrPrev: false, bestLap, lastCount: COUNTDOWN + 1, level, drift: createDrift()};
}

export function compareRacers(a:Racer,b:Racer):number{
  if(a.finishTime!==null&&b.finishTime!==null)return a.finishTime-b.finishTime;
  if(a.finishTime!==null)return -1;
  if(b.finishTime!==null)return 1;
  return b.car.total-a.car.total;
}
export function standings(r: RaceState): Racer[] { return [...r.racers].sort(compareRacers); }
/** 앞선 라이벌은 속도를 깎지 않습니다. 뒤처진 차만 bandHi 까지 따라잡습니다. */
export function rivalBand(level: LevelDef, gapMeters: number): number {
  const raw = 1 - gapMeters * level.bandK;
  const floor = gapMeters > 0 ? Math.max(1, level.bandLo) : level.bandLo;
  return Math.max(floor, Math.min(level.bandHi, raw));
}
export function placeOf(r:RaceState,who:Racer=r.player):number{
  const index=r.racers.indexOf(who);if(index<0)return 0;
  let place=1;
  // Native Array.sort is stable: break equal-rank ties by original grid order.
  for(let i=0;i<r.racers.length;i++)if(i!==index){const diff=compareRacers(r.racers[i],who);if(diff<0||(diff===0&&i<index))place++;}
  return place;
}
export const currentLap = (r: RaceState, who: Racer = r.player): number => Math.min(r.laps, Math.max(1, Math.floor(who.car.total / r.track.n) + 1));
/** 플레이어와 racer 사이의 거리(m). 양수면 racer 가 앞. */
export const gapMeters = (r: RaceState, who: Racer): number => (who.car.total - r.player.car.total) * r.track.ds;

/** 슬립스트림: 앞차 뒤 3~32m, 옆으로 2.6m 이내에서 빠르게 달리면 충전되고 벗어나면 식습니다. */
export const DRAFT_NEAR = 3, DRAFT_FAR = 32, DRAFT_SIDE = 2.6, DRAFT_MIN_SPEED = 24;
export function inSlipstream(me: CarState, others: ReadonlyArray<CarState>): boolean {
  if (me.vf < DRAFT_MIN_SPEED) return false;
  const fx = Math.cos(me.h), fz = Math.sin(me.h);
  for (const o of others) {
    if (o === me || o.vf < DRAFT_MIN_SPEED * 0.8) continue;
    // Opposing or sideways traffic cannot provide a drafting boost.
    if (Math.cos(o.h - me.h) < 0.5) continue;
    const dx = o.x - me.x, dz = o.z - me.z, ahead = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
    if (ahead > DRAFT_NEAR && ahead < DRAFT_FAR && side < DRAFT_SIDE + ahead * 0.03) return true;
  }
  return false;
}
const draftLineups = new WeakMap<RaceState, CarState[]>();
function updateDraft(r: RaceState, dt: number): void {
  // Roster is immutable during a race: allocate the slipstream lineup once, not at 90Hz.
  let cars=draftLineups.get(r);
  if (!cars){cars=r.racers.map(k=>k.car);draftLineups.set(r,cars);}
  for (const k of r.racers) if (!k.link) k.car.draft = Math.max(0, Math.min(1, k.car.draft + (inSlipstream(k.car, cars) ? dt * 0.55 : -dt * 1.4)));
}

const IDLE: CarInput = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };

export function updateRace(r: RaceState, dt: number, input: CarInput, now = 0, output?: RaceEvent[]): RaceEvent[] {
  // UI runs physics at 90Hz. Reuse its buffer while retaining the old fresh-array public API.
  const ev: RaceEvent[] = output ?? [], t = r.track;
  if(output)output.length=0;
  if(!Number.isFinite(dt)||dt<=0)return ev;
  const clockBefore=r.clock;
  if (r.phase !== 'done') r.clock += dt;
  const pressed = input.throttle > 0.05;
  if (r.phase === 'countdown') {
    const n = Math.ceil(-r.clock); if (n < r.lastCount && n >= 1) { r.lastCount = n; ev.push({ type: 'count', n }); }
    if (pressed && !r.thrPrev) r.thrDownAt = r.clock;
    if (!pressed) r.thrDownAt = null;
    if (r.clock >= 0) {
      r.phase = 'racing'; ev.push({ type: 'go' });
      if (pressed && r.thrDownAt !== null && r.thrDownAt >= -0.5) { r.player.car.boostT = 1.4; ev.push({ type: 'launch' }); }
      // Simulate only the part of this tick after the starting light changes.
      dt=Math.max(0,clockBefore+dt); r.clock=dt; for (const k of r.racers) k.lapStart = 0;
      r.rec?.tick(0,r.player.car);
    }
  }
  r.thrPrev = pressed;
  if(r.phase==='countdown'||dt<=1e-10)return ev;
  const racing = true;
  if (r.phase === 'racing') updateDraft(r, dt);
  for (const k of r.racers) {
    if (k.link) {
      followSnap(k.car, k.link, now, dt);
      const n = t.n; k.car.idx = n > 0 ? ((Math.round(k.car.idx) % n) + n) % n : 0;
      continue;
    }
    let inp: CarInput = IDLE;
    if (racing) {
      if (k.player && k.finishTime === null) inp = input;
      else {
        const gap = k.player ? 0 : (k.car.total - r.player.car.total) * t.ds, band = k.player ? 1 : rivalBand(r.level, gap);
        inp = aiInput(k.car, t, k.ai, band, k.aiControl ??= { ...IDLE });
      }
    }
        k.lastEv = stepCar(k.car, inp, dt, t, k.params);
    if (k.player) {
      if (k.lastEv.hit > 0) ev.push({ type: 'hit', power: k.lastEv.hit });
      if (r.phase === 'racing') {
        const de = stepDrift(r.drift, k.car, dt, k.lastEv.hit > 0);
        if (de?.type === 'bank') { k.car.nitro = Math.min(1, k.car.nitro + nitroForChain(de.points)); ev.push({ type: 'driftBank', points: de.points, mult: de.mult }); }
        else if (de?.type === 'lost') ev.push({ type: 'driftLost', points: de.points });
      }
      if (k.lastEv.driftBoost > 0) ev.push({ type: 'driftBoost', secs: k.lastEv.driftBoost });
      if (k.lastEv.pad) ev.push({ type: 'pad' });
    }
  }
  // 차량 간 충돌(차체 길이에 맞춘 캡슐). 밀린 뒤에는 다시 도로 안으로 붙입니다.
  for (let i = 0; i < r.racers.length; i++) for (let j = i + 1; j < r.racers.length; j++) {
    if (r.racers[i].link || r.racers[j].link) continue; // 상대 차량은 겹쳐 달립니다(충돌 동기화 없음)
    const mine = i === 0 || j === 0, rel = separateCars(r.racers[i].car, r.racers[j].car);
    if (mine && rel > 3) ev.push({ type: 'bump', power: rel });
  }
  for (const k of r.racers) if (!k.link) { const hit = stayOnTrack(k.car, t, dt, false); if (k.player && hit > 0) { ev.push({ type: 'hit', power: hit }); if(r.phase==='racing'){const lost=stepDrift(r.drift,k.car,0,true);if(lost?.type==='lost')ev.push({type:'driftLost',points:lost.points});} } }
  // Keep the final result stable during the AI-driven finish animation.
  if (r.phase !== 'racing') return ev;
  // 랩·결승
  if (r.rec) r.rec.tick(r.clock, r.player.car);
  for (const k of r.racers) {
    if (k.finishTime !== null || k.link) continue;
    const lapDone = Math.floor(k.car.total / t.n);
    while (k.lapTimes.length < Math.min(lapDone, r.laps)) {
      const lt = r.clock - k.lapStart; k.lapTimes.push(lt); k.lapStart = r.clock;
      if (k.player) { const best = lt < r.bestLap; if (best) r.bestLap = lt; ev.push({ type: 'lap', lap: k.lapTimes.length, time: lt, best }); }
    }
    if (k.lapTimes.length >= r.laps) {
      k.finishTime = r.clock;

    }
  }
  // Resolve all cars that crossed in this simulation step before reporting place.
  if (r.player.finishTime !== null) {
    const fl = flushDrift(r.drift);
    if (fl?.type === 'bank') ev.push({ type: 'driftBank', points: fl.points, mult: fl.mult });
    r.phase = 'done'; ev.push({ type: 'finish', place: placeOf(r), time: r.player.finishTime });
  }
  return ev;
}
