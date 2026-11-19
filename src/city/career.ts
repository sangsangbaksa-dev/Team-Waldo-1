// LAST CITY — 블랙마켓 보급: 판이 끝날 때 받는 크레딧으로 보스를 영구 강화합니다. SPEED RUSH 차고(race/garage)의 단계·비용 규칙을 그대로 씁니다.
// DOM 비의존 순수 로직(저장 제외).
import { DIFFICULTY_ORDER, type Difficulty, type Mods } from './defs';
import { UPGRADE_COST, UPGRADE_MAX } from '../race/garage';

export { UPGRADE_COST, UPGRADE_MAX };
export type CareerStat = 'hp' | 'dmg' | 'speed' | 'income' | 'cash' | 'armor';
export const CAREER_STATS: readonly CareerStat[] = ['hp', 'dmg', 'speed', 'income', 'cash', 'armor'];
export const CAREER_INFO: Record<CareerStat, { name: string; desc: string }> = {
  hp: { name: '강화 장기', desc: '보스 최대 체력 +20 / 단계' },
  dmg: { name: '개조 탄약', desc: '보스 무기 피해 +5% / 단계' },
  speed: { name: '러너스 부츠', desc: '이동 속도 +3% / 단계' },
  income: { name: '장부 조작', desc: '사업 수입 +6% / 단계' },
  cash: { name: '비상 자금', desc: '시작 자금 +$150 / 단계' },
  armor: { name: '방탄 안감', desc: '받는 피해 -2.5% / 단계' },
};
export type CareerLevels = Record<CareerStat, number>;
export interface Career { credits: number; levels: CareerLevels }

export const zeroLevels = (): CareerLevels => ({ hp: 0, dmg: 0, speed: 0, income: 0, cash: 0, armor: 0 });
export const emptyCareer = (): Career => ({ credits: 0, levels: zeroLevels() });

export function nextCost(c: Career, stat: CareerStat): number | null {
  const lv = c.levels[stat]; return lv >= UPGRADE_MAX ? null : UPGRADE_COST[lv];
}
/** 업그레이드를 사고 새 상태를 돌려줍니다. 크레딧이 모자라거나 최대 단계면 null. */
export function buyCareer(c: Career, stat: CareerStat): Career | null {
  const cost = CAREER_STATS.includes(stat) ? nextCost(c, stat) : null;
  if (cost === null || c.credits < cost) return null;
  return { credits: c.credits - cost, levels: { ...c.levels, [stat]: c.levels[stat] + 1 } };
}

/** 게임 시작 때 보스(조직 0)에 능력치를 더합니다. 시작 자금을 돌려줍니다. */
export function applyCareer(mods: Mods, lv: CareerLevels): number {
  mods.hp += 20 * lv.hp; mods.dmg += 0.05 * lv.dmg; mods.speed += 0.03 * lv.speed; mods.income += 0.06 * lv.income; mods.armor += 0.025 * lv.armor;
  return 150 * lv.cash;
}

export interface MatchSummary { place: number; win: boolean; kills: number; eventsDone: number; earned: number; difficulty: Difficulty }
/** 판 보상: 순위·처치·부업·수익에 비례하고 난이도가 높을수록 늘어납니다. */
export function creditsFor(m: MatchSummary): number {
  const PLACE = [300, 200, 140, 100, 70, 50, 40, 30];
  const base = PLACE[Math.max(0, Math.min(7, m.place - 1))] + (m.win ? 150 : 0) + m.kills * 3 + m.eventsDone * 25 + Math.floor(m.earned / 200);
  const d = Math.max(0, DIFFICULTY_ORDER.indexOf(m.difficulty));
  return Math.round(base * (1 + 0.15 * d) / 5) * 5;
}

const int = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
export function sanitizeCareer(raw: unknown): Career {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>, c = emptyCareer();
  c.credits = int(r.credits, 1e9);
  const src = typeof r.levels === 'object' && r.levels !== null ? r.levels as Record<string, unknown> : {};
  for (const k of CAREER_STATS) c.levels[k] = int(src[k], UPGRADE_MAX);
  return c;
}
export const CAREER_KEY = 'waldo.city.career.v1';
export function readCareer(): Career {
  try { return sanitizeCareer(JSON.parse(localStorage.getItem(CAREER_KEY) ?? 'null')); } catch { return emptyCareer(); }
}
export function writeCareer(c: Career): void {
  try { localStorage.setItem(CAREER_KEY, JSON.stringify(c)); } catch { /* 저장 불가 환경 */ }
}
