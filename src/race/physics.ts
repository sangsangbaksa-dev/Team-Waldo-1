// SPEED RUSH — 아케이드 차량 물리. 조향은 요 속도로, 미끄러짐은 횡방향 그립으로 다루고 드리프트·니트로·벽 충돌을 포함합니다. (THREE 의존 없음)
import { idxDelta, nearest, type Track } from './track';

export interface CarInput { throttle: number; brake: number; steer: number; drift: boolean; nitro: boolean; /** 들고 있는 아이템 사용(솔로 레이스) */ item?: boolean }
export interface CarState {
  x: number; z: number; y: number; h: number; vx: number; vz: number;
  /** 진행 방향 속도(m/s, 후진은 음수)와 옆으로 미끄러지는 속도 */
  vf: number; vl: number; slip: number; steer: number; yawRate: number;
  idx: number; lat: number; total: number;
  nitro: number; boostT: number; drifting: boolean; driftT: number; padCd: number; wallT: number;
  /** 슬립스트림(앞차 뒤꽁무니) 충전도 0~1. 높을수록 가속·최고속이 늘어납니다. */
  draft: number;
}
export interface StepEvents { hit: number; driftBoost: number; pad: boolean }
/** 차량 성능. 기준 차량은 모두 1(top·accel·brake 는 절댓값)이고, turn·drift·nitro 는 배율입니다. */
export interface CarParams { top: number; accel: number; brake: number; grip: number; turn: number; drift: number; nitro: number }

export const PLAYER_PARAMS: CarParams = { top: 74, accel: 15, brake: 62, grip: 1, turn: 1, drift: 1, nitro: 1 };
export const BOOST_TOP = 1.36;
/** 슬립스트림 최대 효과: 최고속 +6%, 가속 +55% */
export const DRAFT_TOP = 0.06;
export const DRAFT_ACCEL = 0.55;
export const NITRO_SECONDS = 6.5;
/** 레이싱카 차체(race.glb)에 맞춘 충돌 반길이·반폭. 원은 옆으로는 너무 넓고 앞뒤로는 너무 짧습니다. */
export const BODY_HALF_LENGTH = 2.25;
export const BODY_HALF_WIDTH = 1.02;
/** 벽에 닿았을 때 차체 방향을 도로 쪽으로 되돌리는 속도(1/s). 크면 코너 벽에 붙습니다. */
export const WALL_HEADING_RATE = 1.2;
export const kmh = (c: Pick<CarState, 'vf'>): number => Math.abs(c.vf) * 3.6;
export const boosting = (c: CarState): boolean => c.boostT > 0;

export function newCar(t: Track, idx: number, lat: number): CarState {
  const i = ((idx % t.n) + t.n) % t.n, h = Math.atan2(t.tz[i], t.tx[i]);
  return { x: t.x[i] - t.tz[i] * lat, z: t.z[i] + t.tx[i] * lat, y: t.y[i], h, vx: 0, vz: 0, vf: 0, vl: 0, slip: 0, steer: 0, yawRate: 0, idx: i, lat, total: idxDelta(t, 0, i), nitro: 0.35, boostT: 0, drifting: false, driftT: 0, padCd: 0, wallT: 0, draft: 0 };
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const wrapAngle = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function stepCar(c: CarState, inp: CarInput, dt: number, t: Track, p: CarParams = PLAYER_PARAMS): StepEvents {
  const ev: StepEvents = { hit: 0, driftBoost: 0, pad: false };
  let fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;

  // 니트로를 누르고 있는 동안 탱크는 NITRO_SECONDS 만에 비고, 그 사이 부스트가 깜빡이지 않습니다.
  const nitroOn = inp.nitro && c.nitro > 0;
  if (nitroOn) c.nitro = Math.max(0, c.nitro - dt / (NITRO_SECONDS * p.nitro));
  c.boostT = Math.max(0, c.boostT - dt);
  if (nitroOn) c.boostT = Math.max(c.boostT, dt);
  // 버튼을 누르고 있는 동안에는 충전하지 않습니다. 충전하면 빈 탱크가 매 프레임 조금씩 차올라 부스트가 한 프레임씩 번갈아 켜져 사실상 무한이 됩니다.
  else if (!inp.nitro && c.boostT < 0.6) c.nitro = Math.min(1, c.nitro + dt * 0.018 * p.nitro);
  const boost = c.boostT > 0, dr = c.draft ?? 0, maxV = p.top * (boost ? BOOST_TOP : 1) * (1 + DRAFT_TOP * dr);

  // 종방향: 가속 · 브레이크 · 저항
  if (inp.throttle > 0) vf += p.accel * (boost ? 1.7 : 1) * (1 + DRAFT_ACCEL * dr) * inp.throttle * Math.max(0, 1 - Math.pow(Math.max(0, vf) / maxV, 2.6)) * dt;
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

  ev.hit = stayOnTrack(c, t, dt, true);
  // 벽에 붙은 채 미끄러지면 횡그립이 속도를 계속 보탭니다. 최고속은 넘기지 않되, 그 아래의 진행 속도는 깎지 않습니다.
  if (Math.abs(c.lat) >= t.halfWidth - BODY_HALF_WIDTH - 0.4) {
    const sp = Math.hypot(c.vx, c.vz);
    if (sp > maxV) { const s = maxV / sp; c.vx *= s; c.vz *= s; c.vf *= s; c.vl *= s; }
  }
  c.y += (t.y[c.idx] - c.y) * Math.min(1, dt * 18);

  // 부스트 패드
  c.padCd = Math.max(0, c.padCd - dt);
  if (c.padCd <= 0 && Math.abs(c.lat) < 7) for (const pad of t.pads) if (Math.abs(idxDelta(t, c.idx, pad)) <= 2) { c.boostT = Math.max(c.boostT, 2); c.padCd = 2; ev.pad = true; break; }
  return ev;
}

/** 중심선 진행도를 갱신하고 차체가 연석 밖으로 나가지 못하게 되돌립니다. progress 가 아니면 랩 거리는 더하지 않습니다. */
export function stayOnTrack(c: CarState, t: Track, dt: number, progress: boolean): number {
  const nr = nearest(t, c.x, c.z, c.idx, 40), delta = idxDelta(t, c.idx, nr.i);
  if (progress) { c.total += delta; c.idx = nr.i; c.wallT = Math.max(0, c.wallT - dt); }
  else if (Math.abs(delta) <= 8) c.idx = nr.i;
  c.lat = nr.lat;
  const limit = t.halfWidth - BODY_HALF_WIDTH - 0.28;
  let hit = 0;
  if (Math.abs(nr.lat) > limit) {
    const s = Math.sign(nr.lat) || 1, px = -t.tz[nr.i] * s, pz = t.tx[nr.i] * s, over = Math.abs(nr.lat) - limit;
    c.x -= px * over; c.z -= pz * over;
    // 바깥으로 나가는 성분만 없앱니다. 진행 속도까지 깎거나 차체를 급히 도로 방향으로 돌리면 벽에 붙은 채 속도가 죽습니다.
    const vn = c.vx * px + c.vz * pz;
    if (vn > 0) {
      c.vx -= px * vn; c.vz -= pz * vn; c.drifting = false; c.driftT = 0;
      if (vn > 2.5 && c.wallT <= 0) { hit = vn; c.wallT = 0.18; }
    }
    const want = Math.atan2(t.tz[nr.i], t.tx[nr.i]); c.h = wrapAngle(c.h + wrapAngle(want - c.h) * Math.min(1, WALL_HEADING_RATE * dt));
    c.lat = Math.sign(nr.lat) * limit;
  }
  return hit;
}

/** 두 차체를 길이·너비에 맞게 떼어 냅니다. 중심을 잇는 방향으로 밀므로 뒤쪽 충돌이 차를 코스 밖으로 밀어내지 않습니다. */
export function separateCars(a: CarState, b: CarState): number {
  const ahx = Math.cos(a.h), ahz = Math.sin(a.h), arx = -ahz, arz = ahx;
  const bhx = Math.cos(b.h), bhz = Math.sin(b.h), brx = -bhz, brz = bhx;
  const dx = b.x - a.x, dz = b.z - a.z; let dist = Math.hypot(dx, dz), nx = ahx, nz = ahz;
  if (dist > 1e-4) { nx = dx / dist; nz = dz / dist; } else dist = 0;
  const span = (hx: number, hz: number, rx: number, rz: number): number => Math.abs(hx * nx + hz * nz) * BODY_HALF_LENGTH + Math.abs(rx * nx + rz * nz) * BODY_HALF_WIDTH;
  const need = span(ahx, ahz, arx, arz) + span(bhx, bhz, brx, brz);
  if (dist >= need) return 0;
  const push = (need - dist) / 2;
  a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
  const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (rel > 0) { const imp = rel * 0.55; a.vx -= nx * imp; a.vz -= nz * imp; b.vx += nx * imp; b.vz += nz * imp; return rel; }
  return 0;
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
