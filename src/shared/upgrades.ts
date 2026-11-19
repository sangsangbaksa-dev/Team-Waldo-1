// 게임 공용 코인 업그레이드 규칙 — SPEED RUSH 차고와 FRONTLINE 무기고가 같은 단계·가격표와 정리 함수를 씁니다.
// 화면·저장과 무관한 순수 로직입니다.

/** 능력치 하나당 올릴 수 있는 최대 단계 */
export const UPGRADE_MAX = 3;
/** 다음 단계(1→3단계)로 올리는 비용 */
export const UPGRADE_COST: ReadonlyArray<number> = [150, 320, 560];

/** 현재 단계에서 다음 단계 비용. 최대 단계면 null. */
export const tierCost = (level: number): number | null => (level >= UPGRADE_MAX ? null : UPGRADE_COST[Math.max(0, level)]);

/** 저장값 정리: 유한한 0 이상 정수만 받고 max 로 자릅니다. */
export const clampInt = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);

/** 코인과 단계를 받아 한 단계 올린 결과를 돌려줍니다. 살 수 없으면 null. */
export function buyTier(coins: number, level: number): { coins: number; level: number } | null {
  const cost = tierCost(level); return cost === null || coins < cost ? null : { coins: coins - cost, level: level + 1 };
}
