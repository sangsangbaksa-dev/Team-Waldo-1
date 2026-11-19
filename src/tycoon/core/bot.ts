// 밸런스 확인용 자동 플레이어. 실제 플레이처럼 스폿 사이를 "걸어 다니며" 공개 API 만 쓴다.
// tools/tycoon-sim.ts 와 tests/tycoon 이 쓴다. 게임 본체는 import 하지 않는다.
import { DISTRICTS, RIVALS, SHOP_KINDS } from './data';
import type { LotView, ShopKind, Stage, TycoonCore } from './types';

export interface BotOptions {
  /** 스폿 사이를 걷는 데 드는 실시간 초 */
  walkSec?: number;
  /** 이 날짜가 지나면 멈춘다 */
  maxDays?: number;
  /** 이 단계에 닿으면 멈춘다 */
  until?: Stage | 'win';
}

export interface BotResult {
  /** 단계 → 처음 도달한 날(소수점 = 하루 중 시각) */
  reached: Partial<Record<Stage | 'win', number>>;
  days: number;
  realSeconds: number;
}

const STEP = 0.25;

export function runBot(core: TycoonCore, opts: BotOptions = {}): BotResult {
  const walkSec = opts.walkSec ?? 6;
  const maxDays = opts.maxDays ?? 80;
  const reached: BotResult['reached'] = { broke: 0 };
  let real = 0;
  let here: string | null = null;
  const dayf = () => core.state.day - 1 + core.state.minutes / 1440;
  const done = () => {
    const s = core.state;
    if (s.day > maxDays) return true;
    if (opts.until === 'win') return s.won;
    return !!opts.until && s.stageIndex >= stageIdx(opts.until);
  };
  const stageIdx = (st: Stage) => ['broke', 'parttime', 'smallshop', 'bigshop', 'business', 'corp', 'world'].indexOf(st);
  const unsub = core.onEvent(e => {
    if (e.type === 'stage' && reached[e.stage] === undefined) reached[e.stage] = dayf();
    if (e.type === 'win' && reached.win === undefined) reached.win = dayf();
  });

  const wait = (sec: number) => {
    for (let t = 0; t < sec; t += STEP) { core.tick(STEP); real += STEP; }
  };
  const go = (spotId: string) => {
    if (here === spotId) return;
    core.setPresence(null);
    wait(walkSec);
    here = spotId;
    core.setPresence(spotId);
  };
  const doAt = (spotId: string, actionId: string): boolean => {
    go(spotId);
    const r = core.perform(spotId, actionId);
    if (!r.ok) return false;
    while (core.state.activity) wait(STEP);
    return true;
  };
  const can = (spotId: string, actionId: string) => core.actionsAt(spotId).find(a => a.id === actionId)?.enabled ?? false;
  const lots = () => core.spots().filter((s): s is LotView & { locked: boolean } => s.kind === 'lot');
  const mine = () => lots().filter(l => l.owner === 'player' && l.shop);
  const hour = () => core.state.minutes / 60;

  const bestBuild = (budget: number): { lot: string; kind: ShopKind; cost: number } | null => {
    let best: { lot: string; kind: ShopKind; cost: number; score: number } | null = null;
    const owned = mine();
    for (const l of lots()) {
      if (l.locked || l.owner !== 'none') continue;
      for (const a of core.actionsAt(l.id)) {
        if (!a.enabled || !a.id.startsWith('build_') || a.cost > budget) continue;
        const kind = a.id.slice(6) as ShopKind;
        if (kind === 'stall' && core.state.stageIndex >= 2 && owned.some(o => o.shop!.kind === 'stall')) continue;
        const def = SHOP_KINDS[kind];
        const d = DISTRICTS[l.district];
        let score: number;
        if (kind === 'factory') {
          score = owned.length >= 4 && !owned.some(o => o.shop!.kind === 'factory') ? 1e9 : -1;
        } else {
          const rivals = lots().filter(x => x.district === l.district && x.owner === 'rival' && x.rival?.kind === kind).length;
          const self = owned.filter(x => x.district === l.district && x.shop!.kind === kind).length;
          score = def.demand * d.traffic * (def.price - def.unitCost) / (1 + 0.45 * rivals + 0.25 * self) / Math.sqrt(a.cost);
          if (!owned.some(o => o.district === l.district)) score *= 1.5;
        }
        if (!best || score > best.score) best = { lot: l.id, kind, cost: a.cost, score };
      }
    }
    return best && best.score > 0 ? best : null;
  };

  let guard = 0;
  while (!done() && guard++ < 200000) {
    const s = core.state;
    const h = hour();
    const shops = mine();
    // 1) 잠/식사
    if ((h >= 21 || h < 5) && s.energy < 80) { doAt('bench', 'sleep'); continue; }
    if (s.energy < 25) {
      if (s.cash >= 25 && can('snack', 'eat_feast')) { doAt('snack', 'eat_feast'); continue; }
      if (s.cash >= 9 && can('snack', 'eat_gimbap')) { doAt('snack', 'eat_gimbap'); continue; }
      if (can('bench', 'nap') || can('bench', 'sleep')) { doAt('bench', can('bench', 'nap') ? 'nap' : 'sleep'); continue; }
    }
    // 2) 배달 중이면 끝낸다
    if (s.task) { doAt(s.task.targetSpotId, 'deliver'); continue; }
    // 3) 빈털터리: 병 줍기
    if (s.stage === 'broke') {
      if (s.bottles >= 24 || (!can('alley', 'collect') && !can('park', 'collect') && s.bottles > 0)) { doAt('junkyard', 'sell_bottles'); continue; }
      if (can('alley', 'collect')) { doAt('alley', 'collect'); continue; }
      if (can('park', 'collect')) { doAt('park', 'collect'); continue; }
      wait(2); continue;
    }
    // 4) 큰 결정(돈 쓰기)
    if (spend(s.cash)) continue;
    // 5) 재고 보충(매니저 없는 가게)
    const needy = shops.filter(l => l.shop!.kind !== 'factory' && !l.shop!.staff.some(x => x.role === 'manager') && l.shop!.stock < l.shop!.stockCap * 0.35)
      .sort((a, b) => a.shop!.stock / a.shop!.stockCap - b.shop!.stock / b.shop!.stockCap)[0];
    if (needy && s.cash > 30) {
      const kind = needy.shop!.kind;
      if (!s.cargo || s.cargo.kind !== kind) {
        if (s.cargo) { const tgt = shops.find(l => l.shop!.kind === s.cargo!.kind && can(l.id, 'restock')); if (tgt) { doAt(tgt.id, 'restock'); continue; } }
        if (!s.cargo && doAt('wholesale', `buy_${kind}`)) continue;
      } else { doAt(needy.id, 'restock'); continue; }
    }
    if (s.cargo) { const tgt = shops.find(l => l.shop!.kind === s.cargo!.kind && can(l.id, 'restock')); if (tgt) { doAt(tgt.id, 'restock'); continue; } }
    // 6) 점원 없는 영업 중 가게가 있으면 직접 장사
    const open = h >= 7 && h < 23;
    const unstaffed = shops.find(l => l.shop!.kind !== 'factory' && l.shop!.staff.length === 0 && l.shop!.stock > 5);
    if (open && unstaffed && s.energy > 10) { go(unstaffed.id); wait(10); continue; }
    // 7) 알바(초반)
    if (s.stageIndex <= 2 && s.energy > 30) {
      if (can('job_dock', 'work')) { doAt('job_dock', 'work'); continue; }
      if (can('job_cafe', 'work')) { doAt('job_cafe', 'work'); continue; }
      if (can('job_mart', 'work')) { doAt('job_mart', 'work'); continue; }
    }
    if (s.stageIndex <= 1 && s.energy > 15) {
      if (can('alley', 'collect')) { doAt('alley', 'collect'); continue; }
      if (s.bottles > 0) { doAt('junkyard', 'sell_bottles'); continue; }
    }
    // 8) 할 일 없으면 가게를 지키거나 기다린다
    if (open && shops.length) { const best = [...shops].filter(l => l.shop!.kind !== 'factory').sort((a, b) => b.shop!.busy - a.shop!.busy)[0]; if (best) { go(best.id); wait(10); continue; } }
    wait(5);
  }
  unsub();
  return { reached, days: core.state.day, realSeconds: real };

  function spend(cash: number): boolean {
    const s = core.state;
    const shops = mine();
    // 해외/인수(대기업)
    if (s.listed) {
      for (const r of RIVALS) {
        const rv = s.rivals.find(x => x.id === r.id)!;
        if (!rv.acquired && rv.shops > 0 && cash > rv.takeoverCost * 1.5 && can('office', `takeover_${r.id}`)) return doAt('office', `takeover_${r.id}`);
      }
      const regions = [...s.regions].filter(r => !r.conquered).sort((a, b) => a.investCost - b.investCost);
      for (const r of regions) if (cash > r.investCost * 1.05 && can('airport', `invest_${r.id}`)) return doAt('airport', `invest_${r.id}`);
    }
    if (s.incorporated && !s.listed && can('office', 'ipo')) return doAt('office', 'ipo');
    if (!s.incorporated && can('office', 'incorporate')) return doAt('office', 'incorporate');
    // 빚 갚기
    if (s.debt > 0 && cash > s.debt * 2 && can('bank', 'repay')) return doAt('bank', 'repay');
    // 매니저/점원
    for (const l of shops) {
      const sh = l.shop!;
      if (sh.kind === 'factory') continue;
      const clerks = sh.staff.filter(x => x.role === 'clerk').length;
      if (clerks < sh.level && cash > 200 + clerks * 150 && can(l.id, 'hire_clerk') && sh.todayCustomers + sh.todayLost > 5) return doAt(l.id, 'hire_clerk');
      if (!sh.staff.some(x => x.role === 'manager') && cash > 1500 && can(l.id, 'hire_manager')) return doAt(l.id, 'hire_manager');
    }
    const reserve = Math.max(150, s.netWorth * 0.05);
    // 확장: 단계 목표(3레벨) 우선
    const expandable = shops.filter(l => can(l.id, 'expand')).map(l => ({ l, cost: core.actionsAt(l.id).find(a => a.id === 'expand')!.cost }))
      .filter(x => x.l.shop!.kind !== 'stall' || s.stageIndex >= 4).sort((a, b) => a.cost - b.cost);
    const b = bestBuild(cash - reserve);
    const bigOwned = shops.some(l => l.shop!.kind !== 'stall' && l.shop!.kind !== 'factory');
    const wantShops = s.stage === 'smallshop' ? !bigOwned : true;
    if (expandable.length && cash - reserve > expandable[0].cost && (!b || !wantShops || expandable[0].cost < b.cost)) return doAt(expandable[0].l.id, 'expand');
    if (b && wantShops) return doAt(b.lot, `build_${b.kind}`);
    // 법인 앞두고 라이벌 가게 인수
    if (s.incorporated && cash > 50000) {
      for (const l of lots()) if (l.owner === 'rival' && !l.locked) {
        const a = core.actionsAt(l.id).find(x => x.id === 'buyout');
        if (a?.enabled && cash - reserve > a.cost * 1.5) return doAt(l.id, 'buyout');
      }
    }
    return false;
  }
}

