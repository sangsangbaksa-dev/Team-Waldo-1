// SPEED RUSH — 추적 카메라와 차체 자세의 순수 계산. THREE 에 의존하지 않습니다.
// 흔들림은 따라가기 위치에 섞지 않습니다. 섞으면 고속에서 다음 프레임의 보간이 흔들림을 되먹여 화면이 떨립니다.

export interface ChaseAnchor { x: number; y: number; z: number; ready: boolean }

/** 니트로는 위치를 흔들지 않습니다. 속도감은 아주 작은 오프셋과 시야각·속도선으로만 냅니다. */
export const NITRO_SHAKE = 0;
/** 최고속에서 니트로가 더하는 시야각(도). */
export const BOOST_FOV = 3;
const SPEED_SHAKE = 0.008;
const IMPACT_SHAKE = 0.5;
/** 코너에서 카메라를 기울이는 양. 크면 왼쪽 코너가 고개 숙이듯 보입니다. */
export const CHASE_YAW_LEAN = 0.012;
export const CHASE_SLIP_LEAN = 0.04;

/** 한 프레임만 더하는 카메라 오프셋(m). 니트로여도 SPEED_SHAKE 를 넘지 않습니다. kick 은 벽 충돌입니다. */
export function chaseShake(speedFrac: number, boosting: boolean, kick: number): number {
  return speedFrac * speedFrac * SPEED_SHAKE + (boosting ? NITRO_SHAKE : 0) + Math.max(0, kick) * IMPACT_SHAKE;
}

/** 추적 시야각(도). 니트로는 약 3도만 넓힙니다. */
export function chaseFov(speedFrac: number, boosting: boolean, punch: number): number {
  return 60 + speedFrac * speedFrac * 18 + (boosting ? BOOST_FOV : 0) + punch * 8;
}

/** 카메라 롤(라디안). 오른쪽 회전(yawRate>0)이 음수입니다. */
export function chaseRoll(yawRate: number, slip: number): number {
  return -yawRate * CHASE_YAW_LEAN - slip * CHASE_SLIP_LEAN;
}

/**
 * 따라가기 위치만 지수 보간합니다. 반환 위치에 흔들림을 더해 다시 넣으면 고속에서 떨립니다.
 * 직선으로 멀어지는 목표를 지나치지 않습니다.
 */
export function stepChaseAnchor(anchor: ChaseAnchor, x: number, y: number, z: number, dt: number, speedFrac: number): void {
  if (!anchor.ready) { anchor.x = x; anchor.y = y; anchor.z = z; anchor.ready = true; return; }
  const k = 1 - Math.exp(-Math.max(0, dt) * (16 + Math.max(0, speedFrac) * 10));
  anchor.x += (x - anchor.x) * k; anchor.y += (y - anchor.y) * k; anchor.z += (z - anchor.z) * k;
}

export interface CarEuler { x: number; y: number; z: number; order: 'YXZ' }

/**
 * 차체 자세. 이 차의 코는 로컬 +X 이고 오일러 순서는 YXZ 라서
 * x 가 롤(좌우로 기울기), z 가 피치(고개)입니다. 둘을 바꾸면 코너에서 고개만 끄덕입니다.
 */
export function carEuler(roll: number, heading: number, pitch: number): CarEuler {
  return { x: roll, y: -heading, z: pitch, order: 'YXZ' };
}

/** 코너 셰브론. yaw 로 세우면 운전자를 보고, 왼쪽 코너(곡률<0)는 화살표를 좌우 반전합니다. */
export function chevronFacing(tx: number, tz: number, curvature: number): { yaw: number; mirror: boolean } {
  return { yaw: Math.atan2(-tx, -tz), mirror: curvature < 0 };
}
