// ZERO ZONE — 병사 강화: 솔로 배틀로열에서 번 코인으로 네 가지 능력을 올립니다(온라인 대전·방에는 적용하지 않아 공정합니다).
import { PERK_MAX, readWallet, writeWallet, type PerkWallet } from '../shared/perks';

export type PerkId = 'speed' | 'reload' | 'steady' | 'tough';
export const PERK_IDS: readonly PerkId[] = ['speed', 'reload', 'steady', 'tough'];
export const PERK_INFO: Record<PerkId, { name: string; blurb: string }> = {
  speed:  { name: '기동력', blurb: '걷기·달리기 속도 +3% / 단계' },
  reload: { name: '손놀림', blurb: '재장전 시간 -8% / 단계' },
  steady: { name: '안정감', blurb: '반동·탄퍼짐 -6% / 단계' },
  tough:  { name: '맷집',   blurb: '받는 피해 -3% / 단계' },
};
export type Perks = Record<PerkId, number>;
export const noPerks = (): Perks => ({ speed: 0, reload: 0, steady: 0, tough: 0 });
/** 단계 → 배율. 단계가 범위를 벗어나도 안전합니다. */
const lv = (n: number): number => Math.max(0, Math.min(PERK_MAX, Math.floor(n || 0)));
export const perkMul = {
  speed: (p: Perks): number => 1 + 0.03 * lv(p.speed),
  reload: (p: Perks): number => 1 - 0.08 * lv(p.reload),
  steady: (p: Perks): number => 1 - 0.06 * lv(p.steady),
  tough: (p: Perks): number => 1 - 0.03 * lv(p.tough),
};

export const PERK_KEY = 'waldo.shooter.perks.v1';
export type ShooterWallet = PerkWallet<PerkId>;
export const readPerks = (): ShooterWallet => readWallet(PERK_KEY, PERK_IDS);
export const writePerks = (w: ShooterWallet): void => writeWallet(PERK_KEY, w);

/** 솔로 결과 보상: 순위(1이 최고)·인원·처치·승리 여부. 오래 살아남고 많이 쓰러뜨릴수록 많이 받습니다. */
export function rewardCoins(place: number, players: number, kills: number, win: boolean): number {
  const beaten = Math.max(0, players - Math.max(1, place)), raw = beaten * 1.3 + kills * 14 + (win ? 180 : 0);
  return Math.round(Math.max(10, raw) / 5) * 5;
}
