// SPEED RUSH — 드리프트 점수. 미끄러지는 동안 점수가 쌓이고, 끊기지 않고 이어 가면 배율이 오릅니다. (THREE·DOM 의존 없음)
// 영구적인 보상은 없습니다: 점수는 기록(최고 점수)으로만 남고, 체인을 끝낼 때 니트로를 아주 조금 채워 줍니다.
import type { CarState } from './physics';

export interface DriftScore {
  /** 지금 이어지는 체인에 쌓인 점수(아직 확정 전) */
  chain: number;
  /** 체인 배율 1~MAX_MULT. 드리프트를 이어 갈수록 오릅니다. */
  mult: number;
  /** 체인에서 지금까지 미끄러진 시간(초) */
  held: number;
  /** 드리프트를 풀고 나서 체인이 살아 있는 남은 시간(초) */
  grace: number;
  /** 확정된 점수 합계 */
  total: number;
  /** 한 번에 확정한 가장 큰 체인 */
  bestChain: number;
}
export type DriftEvent = { type: 'bank'; points: number; mult: number } | { type: 'lost'; points: number };

export const MAX_MULT = 5;
/** 드리프트를 풀어도 이 시간 안에 다시 걸면 체인이 이어집니다. */
export const GRACE = 1.1;
/** 배율이 한 단계 오르는 데 필요한 미끄러진 시간(초) */
export const MULT_EVERY = 1.6;
const MIN_SPEED = 18;

export const createDrift = (): DriftScore => ({ chain: 0, mult: 1, held: 0, grace: 0, total: 0, bestChain: 0 });
export const driftLive = (d: DriftScore): boolean => d.chain > 0 || d.grace > 0;

/** 체인 점수를 확정하고 상태를 비웁니다. */
function bank(d: DriftScore): DriftEvent | null {
  const points = Math.round(d.chain / 5) * 5, mult = d.mult;
  d.chain = 0; d.mult = 1; d.held = 0; d.grace = 0;
  if (points <= 0) return null;
  d.total += points; d.bestChain = Math.max(d.bestChain, points);
  return { type: 'bank', points, mult };
}

/** 한 스텝만큼 드리프트 점수를 갱신합니다. 벽에 부딪히면(crash) 체인이 날아갑니다. */
export function stepDrift(d: DriftScore, c: Pick<CarState, 'drifting' | 'vf' | 'slip'>, dt: number, crash: boolean): DriftEvent | null {
  if (crash && driftLive(d)) { const points = Math.round(d.chain / 5) * 5; d.chain = 0; d.mult = 1; d.held = 0; d.grace = 0; return { type: 'lost', points }; }
  if (c.drifting && c.vf > MIN_SPEED) {
    d.grace = GRACE; d.held += dt; d.mult = Math.min(MAX_MULT, 1 + Math.floor(d.held / MULT_EVERY));
    // 각도가 클수록, 빠를수록 점수가 많이 쌓입니다. 실제 드리프트의 미끄럼각은 0.05~0.2rad 정도라 그 범위에서 초당 100~300점 × 배율이 됩니다.
    d.chain += Math.min(0.5, Math.max(0.05, Math.abs(c.slip))) * c.vf * 24 * d.mult * dt;
    return null;
  }
  if (d.chain > 0) {
    d.grace -= dt;
    if (d.grace <= 0) return bank(d);
  }
  return null;
}

/** 레이스가 끝날 때 남은 체인을 확정합니다. */
export const flushDrift = (d: DriftScore): DriftEvent | null => (d.chain > 0 ? bank(d) : null);

/** 체인을 확정할 때 돌려주는 니트로(0~0.2). 큰 체인일수록 많지만 상한이 있습니다. */
export const nitroForChain = (points: number): number => Math.min(0.2, points / 6000);

// ---- 코스별 최고 점수 기록(브라우저 localStorage, 읽기·쓰기가 실패해도 게임은 계속됩니다) ----
export const DRIFT_KEY = 'waldo.race.drift.v1';
export type DriftBests = Record<string, number>;
export function readDriftBests(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): DriftBests {
  try {
    const raw = storage?.getItem(DRIFT_KEY); if (!raw) return {};
    const obj = JSON.parse(raw) as unknown, out: DriftBests = {};
    if (typeof obj === 'object' && obj !== null) for (const [k, v] of Object.entries(obj)) if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e9) out[k] = Math.round(v);
    return out;
  } catch { return {}; }
}
export function writeDriftBests(b: DriftBests, storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  try { storage?.setItem(DRIFT_KEY, JSON.stringify(b)); } catch { /* 저장 공간이 없어도 기록만 못 남깁니다. */ }
}
