// FRONTLINE 무기고 — AI 대전 보상 코인으로 군 전체 능력을 올립니다(SPEED RUSH 차고와 같은 단계·가격표를 공용 모듈에서 씁니다).
// 온라인 대전과 라인전 방에서는 적용하지 않습니다(서로 같은 조건으로 싸우도록). 화면·저장과 무관한 순수 로직 + 저장 함수.
import { UPGRADE_MAX, buyTier, clampInt, tierCost } from '../shared/upgrades';
import type { Difficulty } from './config';
import { NO_EDGE, type Edge } from './sim';

export type ArmoryStat = 'dmg' | 'def' | 'speed' | 'cash';
export const ARMORY_KEYS: ReadonlyArray<ArmoryStat> = ['dmg', 'def', 'speed', 'cash'];
export interface ArmoryDef { name: string; role: string; per: string }
export const ARMORY: Record<ArmoryStat, ArmoryDef> = {
  dmg: { name: '화력 증강', role: '모든 유닛·방어탑 공격력', per: '+6%' },
  def: { name: '복합 장갑', role: '모든 유닛·건물이 받는 피해', per: '-5%' },
  speed: { name: '기동 개량', role: '모든 유닛 이동 속도', per: '+5%' },
  cash: { name: '보급 물자', role: '시작 광물', per: '+60' },
};
export interface Armory { coins: number; levels: Record<ArmoryStat, number> }
export const emptyArmory = (): Armory => ({ coins: 0, levels: { dmg: 0, def: 0, speed: 0, cash: 0 } });
export { UPGRADE_MAX };

export const nextCost = (a: Armory, s: ArmoryStat): number | null => tierCost(a.levels[s]);
/** 업그레이드를 사고 새 무기고를 돌려줍니다. 코인이 모자라거나 최대 단계면 null. */
export function buyArmory(a: Armory, s: ArmoryStat): Armory | null {
  const r = buyTier(a.coins, a.levels[s]); return r ? { coins: r.coins, levels: { ...a.levels, [s]: r.level } } : null;
}
/** 시뮬레이션에 넘길 배율. */
export function edgeOf(a: Armory): Edge {
  const l = a.levels; return { dmg: 1 + 0.06 * l.dmg, def: 1 - 0.05 * l.def, speed: 1 + 0.05 * l.speed, minerals: 60 * l.cash };
}
export const edgeIsNone = (e: Edge): boolean => e.dmg === NO_EDGE.dmg && e.def === NO_EDGE.def && e.speed === NO_EDGE.speed && e.minerals === NO_EDGE.minerals;

const WIN_COINS: Record<Difficulty, number> = { easy: 110, normal: 200, hard: 300, brutal: 420 };
/** 판이 끝난 뒤 받는 코인: 승리는 난이도별 기본값에 시간이 길수록·많이 처치할수록 보너스, 패배도 조금 받습니다. */
export function rewardFor(win: boolean, level: Difficulty, seconds: number, kills: number): number {
  const base = win ? WIN_COINS[level] : Math.round(WIN_COINS[level] * 0.3), time = Math.min(1, Math.max(0, seconds) / 600), fight = Math.min(60, Math.max(0, kills) * 1.5);
  return Math.round((base * (0.8 + 0.4 * time) + fight) / 5) * 5;
}

export function sanitizeArmory(raw: unknown): Armory {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>, a = emptyArmory(); a.coins = clampInt(r.coins, 1e9);
  const lv = (typeof r.levels === 'object' && r.levels !== null ? r.levels : {}) as Record<string, unknown>; for (const k of ARMORY_KEYS) a.levels[k] = clampInt(lv[k], UPGRADE_MAX);
  return a;
}
export const ARMORY_KEY = 'waldo.rts.armory.v1';
export function readArmory(): Armory { try { return sanitizeArmory(JSON.parse(localStorage.getItem(ARMORY_KEY) ?? 'null')); } catch { return emptyArmory(); } }
export function writeArmory(a: Armory): void { try { localStorage.setItem(ARMORY_KEY, JSON.stringify(a)); } catch { /* 저장 불가 환경 */ } }
