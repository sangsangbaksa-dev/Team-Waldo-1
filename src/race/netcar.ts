// SPEED RUSH 1대1 — 상대 차량의 위치 동기화. 화면과 무관한 순수 로직입니다.
import { wrapAngle, type CarState } from './physics';

/** 15Hz 로 보내는 차량 스냅샷. 숫자 배열이라 메시지가 작습니다. 순서: x z y h vx vz vf vl slip steer yawRate total idx nitro boostT drifting */
export type Snap = number[];
export const SNAP_LEN = 16;
const r2 = (v: number): number => Math.round(v * 100) / 100;

export function encodeSnap(c: CarState): Snap {
  return [r2(c.x), r2(c.z), r2(c.y), Math.round(c.h * 1000) / 1000, r2(c.vx), r2(c.vz), r2(c.vf), r2(c.vl), r2(c.slip), r2(c.steer), r2(c.yawRate), r2(c.total), c.idx, r2(c.nitro), r2(c.boostT), c.drifting ? 1 : 0];
}
/** 형식이 맞지 않거나 숫자가 아닌 값이 있으면 버립니다(상대가 보낸 데이터는 믿지 않습니다). */
export function parseSnap(raw: unknown): Snap | null {
  if (!Array.isArray(raw) || raw.length !== SNAP_LEN) return null;
  return raw.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e7) ? (raw as Snap) : null;
}

export interface RemoteLink { snap: Snap | null; at: number }

/** 마지막 스냅샷을 속도로 조금 앞질러 예측한 위치로 부드럽게 따라갑니다. 너무 멀어지면 바로 옮깁니다. */
export function followSnap(car: CarState, link: RemoteLink, now: number, dt: number): void {
  const s = link.snap; if (!s) return;
  const age = Math.min(0.25, Math.max(0, (now - link.at) / 1000)), tx = s[0] + s[4] * age, tz = s[1] + s[5] * age, far = Math.hypot(tx - car.x, tz - car.z) > 30;
  const k = far ? 1 : Math.min(1, dt * 14);
  car.x += (tx - car.x) * k; car.z += (tz - car.z) * k; car.y += (s[2] - car.y) * Math.min(1, dt * 14);
  car.h = wrapAngle(car.h + wrapAngle(s[3] + s[10] * age - car.h) * k);
  car.vx = s[4]; car.vz = s[5]; car.vf = s[6]; car.vl = s[7]; car.slip = s[8]; car.steer = s[9]; car.yawRate = s[10];
  car.total = s[11]; car.idx = Math.round(s[12]); car.nitro = s[13]; car.boostT = s[14]; car.drifting = s[15] === 1;
}

/** 두 선수의 결승 기록으로 승자를 정합니다. 더 빠른 쪽이 이기고, 같으면 방장이 이깁니다. */
export function decideWinner(mine: number, theirs: number, iAmHost: boolean): 'me' | 'them' {
  if (mine < theirs) return 'me'; if (mine > theirs) return 'them'; return iAmHost ? 'me' : 'them';
}
