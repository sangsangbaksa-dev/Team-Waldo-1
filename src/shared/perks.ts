// 공용 강화 규칙: 게임에서 번 코인으로 능력치를 단계별로 올립니다(SPEED RUSH 차고와 같은 비용표). 화면·저장과 무관한 순수 로직이라 어느 게임이든 키 목록만 바꿔 씁니다.
export const PERK_MAX = 3;
/** 다음 단계(1→3단계)로 올리는 비용 */
export const PERK_COST: ReadonlyArray<number> = [150, 320, 560];
export interface PerkWallet<K extends string> { coins: number; levels: Record<K, number> }

export const emptyWallet = <K extends string>(keys: readonly K[]): PerkWallet<K> => ({ coins: 0, levels: Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number> });
export function perkCost<K extends string>(w: PerkWallet<K>, key: K): number | null { const lv = w.levels[key]; return lv >= PERK_MAX ? null : PERK_COST[lv]; }
/** 하나를 사고 새 지갑을 돌려줍니다. 코인이 모자라거나 최대 단계면 null. */
export function buyPerk<K extends string>(w: PerkWallet<K>, key: K): PerkWallet<K> | null {
  const cost = perkCost(w, key); if (cost === null || w.coins < cost) return null;
  return { coins: w.coins - cost, levels: { ...w.levels, [key]: w.levels[key] + 1 } };
}
const int = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
/** 저장된 값이 깨져 있어도 항상 쓸 수 있는 지갑으로 되돌립니다. */
export function sanitizeWallet<K extends string>(raw: unknown, keys: readonly K[]): PerkWallet<K> {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>, w = emptyWallet(keys), lv = (typeof r.levels === 'object' && r.levels !== null ? r.levels : {}) as Record<string, unknown>;
  w.coins = int(r.coins, 1e9); for (const k of keys) w.levels[k] = int(lv[k], PERK_MAX); return w;
}
export function readWallet<K extends string>(storageKey: string, keys: readonly K[]): PerkWallet<K> {
  try { return sanitizeWallet(JSON.parse(localStorage.getItem(storageKey) ?? 'null'), keys); } catch { return emptyWallet(keys); }
}
export function writeWallet<K extends string>(storageKey: string, w: PerkWallet<K>): void { try { localStorage.setItem(storageKey, JSON.stringify(w)); } catch { /* 저장하지 못해도 계속할 수 있습니다. */ } }
