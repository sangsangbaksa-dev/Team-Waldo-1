import type { EntityId } from "./types";

/**
 * 타입별 SoA 엔티티 풀. 0..count-1이 살아 있는 엔티티이고, 제거는 swap-remove라서
 * 인덱스는 틱 사이에 바뀔 수 있다. 바깥에서 엔티티를 추적할 때는 id를 쓴다.
 *
 * a, b, c는 풀마다 뜻이 다른 범용 필드다.
 *   enemies:     timer = AI 타이머, a = 회전형 무기에 다시 맞기까지 남은 시간
 *   projectiles: a = 데미지, timer = 남은 수명, hp = 모드(PROJ_LINEAR | PROJ_ORBIT)
 *                직선형: b = 남은 관통 수, c = 마지막으로 맞힌 적 id
 *                회전형: vx = 현재 각도, vy = 각속도, c = 플레이어로부터의 거리
 *   pickups:     a = 경험치 값
 */
export interface Pool {
  capacity: number;
  count: number;
  id: Uint32Array;
  kind: Uint16Array;
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  r: Float32Array;
  hp: Float32Array;
  timer: Float32Array;
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
}

export const PROJ_LINEAR = 0;
export const PROJ_ORBIT = 1;
export const PROJ_HOSTILE = 2;
export const PROJ_BOOMERANG = 3;

const FLOAT_FIELDS = [
  "x",
  "y",
  "px",
  "py",
  "vx",
  "vy",
  "r",
  "hp",
  "timer",
  "a",
  "b",
  "c",
] as const;

export function createPool(capacity: number): Pool {
  const f = () => new Float32Array(capacity);
  return {
    capacity,
    count: 0,
    id: new Uint32Array(capacity),
    kind: new Uint16Array(capacity),
    x: f(),
    y: f(),
    px: f(),
    py: f(),
    vx: f(),
    vy: f(),
    r: f(),
    hp: f(),
    timer: f(),
    a: f(),
    b: f(),
    c: f(),
  };
}

/** 새 슬롯을 0으로 초기화해 돌려준다. 가득 차면 -1. */
export function spawn(
  pool: Pool,
  id: EntityId,
  kind: number,
  x: number,
  y: number,
): number {
  if (pool.count >= pool.capacity) return -1;
  const i = pool.count++;
  for (const k of FLOAT_FIELDS) pool[k][i] = 0;
  pool.id[i] = id;
  pool.kind[i] = kind;
  pool.x[i] = pool.px[i] = x;
  pool.y[i] = pool.py[i] = y;
  return i;
}

/** i를 제거하고 마지막 엔티티를 그 자리로 옮긴다. 뒤에서 앞으로 순회하면서 호출할 것. */
export function remove(pool: Pool, i: number): void {
  const last = --pool.count;
  if (i === last) return;
  pool.id[i] = pool.id[last];
  pool.kind[i] = pool.kind[last];
  for (const k of FLOAT_FIELDS) pool[k][i] = pool[k][last];
}
