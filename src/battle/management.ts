import { getIncome, cost, maxUnitsFor, type War, type Upgrade } from './war';
import { CONTRACTS, storageCap } from './economy';
import { queuedUnits } from './recruitment';

/** Shared estimates are based on the same net rates used by simulation ticks. */
export function affordability(w: War, gold: number, food: number, id = 0): { gold: number; food: number; seconds: number } {
  const f = w.factions[id], rate = getIncome(w, id), cap = storageCap(w, id);
  const missingGold = Math.max(0, gold - f.gold), missingFood = Math.max(0, food - f.food);
  const wait = (missing: number, income: number, target: number) => missing === 0 ? 0 : income <= 0 || target > cap ? Infinity : missing / income;
  return { gold: Math.ceil(missingGold), food: Math.ceil(missingFood), seconds: Math.ceil(Math.max(wait(missingGold, rate.gold, gold), wait(missingFood, rate.food, food))) };
}
export function upgradePreview(w: War, key: Upgrade, id = 0): { gold: number; food: number; payback: number } {
  const before = getIncome(w, id), f = w.factions[id];
  const factions = w.factions.map(other => other.id === id ? { ...other, [key]: Math.min(4, f[key] + 1) } : other);
  const after = getIncome({ ...w, factions }, id), price = cost(f, key);
  return { gold: after.gold - before.gold, food: after.food - before.food,
    payback: key === 'mine' ? price.gold / (after.gold - before.gold) : key === 'farm' ? price.food / (after.food - before.food) : Infinity };
}
export function economicForecast(w: War, id = 0) {
  const f = w.factions[id], e = w.economy[id], rate = getIncome(w, id), cap = storageCap(w, id);
  const contract = e.contract ? CONTRACTS[e.contract.key] : null;
  return { ...rate,
    foodSeconds: rate.food < 0 ? Math.ceil(f.food / -rate.food) : Infinity,
    goldFullSeconds: rate.gold > 0 ? Math.max(0, Math.ceil((cap - f.gold) / rate.gold)) : Infinity,
    foodFullSeconds: rate.food > 0 ? Math.max(0, Math.ceil((cap - f.food) / rate.food)) : Infinity,
    deliverySeconds: contract ? affordability(w, contract.resource === 'gold' ? contract.amount : 0, contract.resource === 'food' ? contract.amount : 0, id).seconds : 0,
  };
}
export interface Milestone { title: string; description: string; tab: string; control: string; }
export function tutorialProgress(w: War): boolean[] {
  const f = w.factions[0];
  return [f.mine >= 2 && f.farm >= 2, w.stats[0].captures > 0,
    w.economyCampaign ? w.economy[0].completed > 0 : w.stats[0].researches > 0];
}
export function nextMilestone(w: War): Milestone {
  const f = w.factions[0], e = w.economy[0], count = w.units.filter(u => u.owner === 0).length;
  if (f.mine < 2 || f.farm < 2) return { title: '풍요로운 영지의 시작', description: '① 생산 확보 · 금광과 농장을 Lv.2로 강화하세요.', tab: 'economy', control: f.mine < 2 ? '#build-mine' : '#build-farm' };
  if (!w.stats[0].captures) {
    if (count < 6) return { title: '첫 원정대를 준비하세요', description: count + queuedUnits(w.recruitment[0]) >= 6 ? '② 첫 거점 · 훈련 중입니다. 완료 후 북서부 관문으로 출전하세요.' : '② 첫 거점 · 보병을 모집해 6명 이상의 원정대를 준비하세요.', tab: 'army', control: count + queuedUnits(w.recruitment[0]) >= 6 ? '#training-status' : '#train-infantry' };
    return { title: '첫 번째 깃발을 세우세요', description: '② 첫 거점 · 북서부 관문을 점령해 생산과 보급을 확보하세요.', tab: 'orders', control: '#outpost-5' };
  }
  if (w.economyCampaign && !e.completed) {
    if (e.market < 1) return { title: '첫 교역을 준비하세요', description: '③ 첫 계약 · 도시 탭에서 시장을 건설하세요.', tab: 'city', control: '#civil-build-market' };
    return { title: e.contract ? '첫 납품 계약을 완수하세요' : '첫 납품 계약을 체결하세요', description: e.contract ? '③ 첫 계약 · 자원을 모아 기한 안에 납품 버튼을 누르세요.' : '③ 첫 계약 · 상단 식량 조달을 수락하고 식량 120을 준비하세요.', tab: 'trade', control: e.contract ? '#active-contract' : '#contract-provisions' };
  }
  if (!w.economyCampaign && (f.barracks < 2 || !w.stats[0].researches)) return { title: '왕국의 기술을 발전시키세요', description: '③ 첫 연구 · 병영 Lv.2를 달성하고 첫 연구를 완료하세요.', tab: f.barracks < 2 ? 'economy' : 'research', control: f.barracks < 2 ? '#build-barracks' : '#research-weapons' };
  return w.economyCampaign ? { title: '교역으로 경제 패권을 이루세요', description: '도시 Lv.4 · 계약 3건 · 평판 80 · 거점 3개를 달성하세요.', tab: 'trade', control: '#economic-goal' }
    : { title: '마지막 왕국으로 남으세요', description: `병력 한도 ${maxUnitsFor(w)}명 · 남은 적 본부를 함락하세요.`, tab: 'orders', control: '#targets' };
}
