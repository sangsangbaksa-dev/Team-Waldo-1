// 공용 캐릭터 — 순수 포즈 계산(렌더러와 무관해서 테스트할 수 있습니다). 모델은 +X 를 보고, 관절 회전은 Z 축이며 +가 앞쪽입니다.
export const HIP = 0.9, KNEE = 0.44, LEG_Z = 0.11, AIM = 1.42;

export interface PoseState {
  /** 이동 속도(m/s). 걷기 0~3.2, 달리기 4.6~7.2 근처를 기준으로 진폭이 정해집니다. */
  speed: number;
  /** 걸음 위상(라디안 비슷한 누적값). 호출 쪽이 speed 에 비례해 더해 줍니다. */
  walk: number;
  /** 시계(초) — 숨쉬기·자세 흔들림용 */
  time: number;
  /** 0~1: 총을 겨눈 정도 */ aim: number;
  /** 0~1: 웅크린 정도 */ crouch: number;
  /** 0~1: 발사 반동(발사 직후 1에서 감쇠) */ recoil: number;
  /** 0~1: 피격 반응(맞은 직후 1에서 감쇠) */ hit: number;
  /** 0~1: 쓰러지는 정도 */ dead: number;
  /** 0~1: 좌석에 앉은 정도(차량·의자) */ seat: number;
  /** 0~1: 두 손을 핸들에 올린 정도(seat 와 함께) */ drive: number;
  /** 0~1: 팔 흔들며 환호/손 흔들기 */ wave: number;
}
export const calmState = (): PoseState => ({ speed: 0, walk: 0, time: 0, aim: 0, crouch: 0, recoil: 0, hit: 0, dead: 0, seat: 0, drive: 0, wave: 0 });

export interface Pose {
  rootY: number; rootPitch: number; scaleY: number;
  torsoLean: number; torsoTwist: number; torsoRoll: number;
  thighL: number; thighR: number; shinL: number; shinR: number;
  armL: number; armR: number;
  /** 머리 쪽(몸통) 위로 얹힌 숨쉬기 정도 — 팔 회전에 이미 더해져 있어 참고용 */
  breathe: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** 상태 → 관절 각도. idle/걷기/달리기/겨누기/반동/웅크리기/피격/사망/앉기를 한 곳에서 섞습니다. */
export function computePose(s: PoseState, out: Pose = blankPose()): Pose {
  const amp = clamp01(s.speed / 3.2), run = clamp01((s.speed - 4.6) / 2.6), ph = s.walk * 1.35, sn = Math.sin(ph), cs = Math.cos(ph);
  const aim = clamp01(s.aim), crouch = clamp01(s.crouch), dead = clamp01(s.dead), seat = clamp01(s.seat), drive = clamp01(s.drive) * seat;
  const moving = amp * (1 - seat) * (1 - dead), idle = 1 - amp;
  const breathe = Math.sin(s.time * 1.9) * 0.025 * idle;
  // 걷기 다리
  let thighL = sn * -1 * (0.5 + 0.2 * run) * moving + 0.12 * run * moving;
  let thighR = sn * (0.5 + 0.2 * run) * moving + 0.12 * run * moving;
  let shinL = -moving * (0.12 + (0.6 + 0.5 * run) * Math.max(0, cs * -1));
  let shinR = -moving * (0.12 + (0.6 + 0.5 * run) * Math.max(0, cs));
  // 웅크리기: 무릎을 굽히고 몸을 낮춤
  const cb = crouch * (1 - seat);
  thighL += cb * 0.9; thighR += cb * 0.9; shinL -= cb * 1.5; shinR -= cb * 1.5;
  // 앉기: 허벅지 앞으로, 정강이 아래로
  thighL = lerp(thighL, 1.5, seat); thighR = lerp(thighR, 1.45, seat); shinL = lerp(shinL, -1.5, seat); shinR = lerp(shinR, -1.42, seat);
  // 팔: 걷기 흔들기 → 겨누기 → 운전
  let armL = -sn * -1 * 0.55 * moving + breathe * 2, armR = -sn * 0.55 * moving - breathe * 2;
  armL = lerp(armL, AIM * 0.82, aim); armR = lerp(armR, AIM, aim);
  armL = lerp(armL, 1.2, drive); armR = lerp(armR, 1.2, drive);
  if (s.wave > 0) { armR = lerp(armR, 2.7 + Math.sin(s.time * 9) * 0.3, clamp01(s.wave)); }
  // 반동: 겨눈 팔이 위로 튀고 몸통이 뒤로 젖혀짐
  const rc = clamp01(s.recoil);
  armR += rc * 0.14; armL += rc * 0.1;
  // 피격: 몸이 뒤로 휘청 + 팔이 벌어짐
  const hit = clamp01(s.hit), flinch = Math.sin(hit * Math.PI) * hit;
  let torsoLean = -(0.04 * amp + 0.1 * run) * moving + cb * 0.22 + seat * 0.05 - rc * 0.05 + flinch * 0.32 + breathe * 0.6;
  if (hit > 0) { armL += flinch * 0.8; armR += flinch * 0.6; }
  // 사망: 뒤로 눕고 팔다리가 늘어짐
  const fall = dead * dead * (3 - 2 * dead);
  armL = lerp(armL, 0.4, dead); armR = lerp(armR, -0.2, dead); thighL = lerp(thighL, 0.1, dead); thighR = lerp(thighR, -0.15, dead);
  shinL = lerp(shinL, 0, dead); shinR = lerp(shinR, -0.2, dead); torsoLean = lerp(torsoLean, 0, dead);
  out.torsoLean = torsoLean; out.torsoTwist = -sn * 0.07 * moving; out.torsoRoll = 0;
  out.thighL = thighL; out.thighR = thighR; out.shinL = shinL; out.shinR = shinR; out.armL = armL; out.armR = armR;
  out.rootPitch = fall * 1.5; // 뒤로 눕기(+Z 회전, 발끝 기준)
  out.rootY = Math.abs(sn) * moving * 0.04 + fall * 0.12 - seat * 0.0; out.scaleY = 1 - 0.3 * crouch * (1 - seat) * 0.6;
  out.breathe = breathe;
  return out;
}
export const blankPose = (): Pose => ({ rootY: 0, rootPitch: 0, scaleY: 1, torsoLean: 0, torsoTwist: 0, torsoRoll: 0, thighL: 0, thighR: 0, shinL: 0, shinR: 0, armL: 0, armR: 0, breathe: 0 });
