// SPEED RUSH — 아케이드 차량 물리. 조향은 요 속도로, 미끄러짐은 횡방향 그립으로 다루고 드리프트·니트로·벽 충돌을 포함합니다. (THREE 의존 없음)
import { idxDelta, nearest, type Track } from './track';

export interface CarInput { throttle: number; brake: number; steer: number; drift: boolean; nitro: boolean }
export interface CarState {
  x: number; z: number; y: number; h: number; vx: number; vz: number;
  /** 진행 방향 속도(m/s, 후진은 음수)와 옆으로 미끄러지는 속도 */
  vf: number; vl: number; slip: number; steer: number; yawRate: number;
  idx: number; lat: number; total: number;
  nitro: number; boostT: number; drifting: boolean; driftT: number; padCd: number; wallT: number;
}
export interface StepEvents { hit: number; driftBoost: number; pad: boolean }
/** 차량 성능. 기준 차량은 모두 1(top·accel·brake 는 절댓값)이고, turn·drift·nitro 는 배율입니다. */
export interface CarParams { top: number; accel: number; brake: number; grip: number; turn: number; drift: number; nitro: number }

export const PLAYER_PARAMS: CarParams = { top: 74, accel: 15, brake: 62, grip: 1, turn: 1, drift: 1, nitro: 1 };
export const BOOST_TOP = 1.36;
export const NITRO_SECONDS = 3.2;
export const kmh = (c: Pick<CarState, 'vf'>): number => Math.abs(c.vf) * 3.6;
export const boosting = (c: CarState): boolean => c.boostT > 0;

export function newCar(t: Track, idx: number, lat: number): CarState {
  const i = ((idx % t.n) + t.n) % t.n, h = Math.atan2(t.tz[i], t.tx[i]);
  return { x: t.x[i] - t.tz[i] * lat, z: t.z[i] + t.tx[i] * lat, y: t.y[i], h, vx: 0, vz: 0, vf: 0, vl: 0, slip: 0, steer: 0, yawRate: 0, idx: i, lat, total: idxDelta(t, 0, i), nitro: 0.35, boostT: 0, drifting: false, driftT: 0, padCd: 0, wallT: 0 };
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const wrapAngle = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function stepCar(c: CarState, inp: CarInput, dt: number, t: Track, p: CarParams = PLAYER_PARAMS): StepEvents {
  const ev: StepEvents = { hit: 0, driftBoost: 0, pad: false };
  let fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;

  // 니트로·부스트 타이머
  if (inp.nitro && c.nitro > 0 && c.boostT <= 0.05) { c.nitro = Math.max(0, c.nitro - dt / (NITRO_SECONDS * p.nitro)); c.boostT = Math.max(c.boostT, 0.12); }
  else { c.boostT = Math.max(0, c.boostT - dt); if (c.boostT < 0.6 && !inp.nitro) c.nitro = Math.min(1, c.nitro + dt * 0.018 * p.nitro); }
  const boost = c.boostT > 0, maxV = p.top * (boost ? BOOST_TOP : 1);

  // 종방향: 가속 · 브레이크 · 저항
  if (inp.throttle > 0) vf += p.accel * (boost ? 1.7 : 1) * inp.throttle * Math.max(0, 1 - Math.pow(Math.max(0, vf) / maxV, 2.6)) * dt;
  if (inp.brake > 0) { if (vf > 1) vf = Math.max(0, vf - p.brake * inp.brake * dt); else vf = Math.max(-13, vf - 16 * inp.brake * dt); }
  if (inp.throttle <= 0 && inp.brake <= 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.6 + 0.0016 * vf * vf) * dt);
  if (vf > maxV) vf = Math.max(maxV, vf - 26 * dt);
  if (inp.drift && c.drifting) vf -= Math.min(Math.max(vf, 0), 2.2 * dt);

  // 드리프트 상태: 핸드브레이크를 누른 채 속도와 조향이 충분할 때 시작
  const wasDrift = c.drifting;
  if (!c.drifting && inp.drift && Math.abs(vf) > 20 && Math.abs(inp.steer) > 0.25) c.drifting = true;
  if (c.drifting && (!inp.drift || Math.abs(vf) < 12)) c.drifting = false;

  // 조향: 속도에 따라 최소 회전 반경이 커집니다. 드리프트 중에는 차체가 더 많이 돌아갑니다.
  c.steer += (inp.steer - c.steer) * Math.min(1, dt * (Math.abs(inp.steer) > Math.abs(c.steer) ? 8 : 12));
  const av = Math.abs(vf), rmin = 7 + (av * av) / 54, yawMax = (av / rmin) * p.turn * (c.drifting ? 1 + 0.38 * p.drift : 1) * Math.min(1, av / 3);
  const yawTarget = c.steer * yawMax * (vf >= 0 ? 1 : -1);
  c.yawRate += (yawTarget - c.yawRate) * Math.min(1, dt * (c.drifting ? 7 : 11));
  c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
  c.h = wrapAngle(c.h + c.yawRate * dt);
  fx = Math.cos(c.h); fz = Math.sin(c.h); rx = -fz; rz = fx;
  // 속도 벡터는 그대로이므로 차체가 돌면 옆으로 미끄러지는 성분이 생깁니다.
  vf = c.vx * fx + c.vz * fz; vl = c.vx * rx + c.vz * rz;

  // 횡방향 그립
  const grip = (c.drifting ? 1.5 : 9.5) * p.grip, nl = vl * Math.exp(-grip * dt), lost = Math.abs(vl) - Math.abs(nl);
  vf += lost * (c.drifting ? 0.18 : 0.62) * (vf >= 0 ? 1 : -1); vl = nl;
  c.slip = Math.atan2(vl, Math.max(Math.abs(vf), 1)); c.vf = vf; c.vl = vl;

  // 드리프트 충전 → 해제 시 미니 터보
  if (c.drifting) c.driftT += dt * (0.5 + Math.min(1.5, Math.abs(c.slip) * 5)) * p.drift;
  if (wasDrift && !c.drifting) {
    if (c.driftT > 0.9) { ev.driftBoost = Math.min(c.driftT * 0.5, 2.2); c.boostT = Math.max(c.boostT, ev.driftBoost); c.nitro = Math.min(1, c.nitro + c.driftT * 0.07); }
    c.driftT = 0;
  }
  c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
  c.x += c.vx * dt; c.z += c.vz * dt;

  // 트랙 경계(벽)
  const nr = nearest(t, c.x, c.z, c.idx, 40), delta = idxDelta(t, c.idx, nr.i);
  c.idx = nr.i; c.total += delta; c.lat = nr.lat; c.wallT = Math.max(0, c.wallT - dt);
  const limit = t.halfWidth - 1.7;
  if (Math.abs(nr.lat) > limit) {
    const s = Math.sign(nr.lat), px = -t.tz[nr.i] * s, pz = t.tx[nr.i] * s, over = Math.abs(nr.lat) - limit;
    c.x -= px * over; c.z -= pz * over;
    const vn = c.vx * px + c.vz * pz;
    if (vn > 0) {
      c.vx -= px * vn * 1.22; c.vz -= pz * vn * 1.22;
      const k = 1 - Math.min(0.32, vn * 0.011); c.vx *= k; c.vz *= k; c.drifting = false; c.driftT = 0;
      if (vn > 2.5 && c.wallT <= 0) { ev.hit = vn; c.wallT = 0.18; }
    }
    c.vx *= 1 - 0.9 * dt; c.vz *= 1 - 0.9 * dt;
    const want = Math.atan2(t.tz[nr.i], t.tx[nr.i]); c.h = wrapAngle(c.h + wrapAngle(want - c.h) * Math.min(1, 5 * dt));
    c.lat = Math.sign(nr.lat) * limit;
  }
  c.y += (t.y[c.idx] - c.y) * Math.min(1, dt * 18);

  // 부스트 패드
  c.padCd = Math.max(0, c.padCd - dt);
  if (c.padCd <= 0 && Math.abs(c.lat) < 7) for (const pad of t.pads) if (Math.abs(idxDelta(t, c.idx, pad)) <= 2) { c.boostT = Math.max(c.boostT, 1.5); c.padCd = 1.5; ev.pad = true; break; }
  return ev;
}

/** line: 0 이면 고정 차선, 1 이면 코너 안쪽을 파고드는 레이싱 라인. nitro: 이 값을 넘는 니트로 잔량만 쓴다(없으면 안 씀). */
export interface AiProfile { lane: number; top: number; grip: number; skill: number; line?: number; nitro?: number }
/** 중심선을 따라가는 단순 AI. 앞쪽 곡률로 목표 속도를 정합니다. */
export function aiInput(c: CarState, t: Track, ai: AiProfile): CarInput {
  const speed = Math.max(c.vf, 0), la = Math.round((11 + speed * 0.42) / t.ds), ti = (c.idx + la) % t.n;
  const line = ai.line ?? 0, inside = clamp(t.k[(ti + 8) % t.n] * 1400, -1, 1) * (t.halfWidth - 7), lane = ai.lane * (1 - line) + inside * line;
  const tx = t.x[ti] - t.tz[ti] * lane, tz = t.z[ti] + t.tx[ti] * lane;
  const err = wrapAngle(Math.atan2(tz - c.z, tx - c.x) - c.h), steer = clamp(err * 2.6, -1, 1);
  const look = Math.max(12, Math.round((speed * 1.7) / t.ds)); let kmax = 0;
  for (let o = 0; o <= look; o += 2) kmax = Math.max(kmax, Math.abs(t.k[(c.idx + o) % t.n]));
  const top = ai.top * (c.boostT > 0 ? BOOST_TOP : 1), target = Math.min(top, Math.sqrt(ai.grip / Math.max(kmax, 1e-4)));
  const over = speed - target, straight = kmax < 0.005 && speed > 35 && over < 2;
  return { throttle: over < 0 ? 1 : 0, brake: over > 4 ? Math.min(1, over / 12) : 0, steer, drift: false, nitro: ai.nitro !== undefined && straight && c.nitro > ai.nitro };
}
