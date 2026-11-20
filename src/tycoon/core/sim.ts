// 시간 흐름: 1게임분 단위 가게 영업, 자정 정산, 이벤트·라이벌·해외 시장, 단계 진행.
import {
  BUSINESS_SHOPS, CLOSE_HOUR, CONQUER_SHARE, CORP_TAX, DAY_MINUTES, DISTRICTS, EVENT_CHANCE, EVENTS, IPO_MIN_DISTRICTS,
  IPO_MIN_SHOPS, IPO_NET_WORTH, LEVEL_MULT, LOAN_RATE, LOT_KINDS, MANAGER_RESTOCK_FEE, OPEN_HOUR, OWNER_ENERGY_PER_HOUR,
  PARTTIME_EARNED, REGIONS, REGION_DECAY, REGION_YIELD, RIVALS, RIVAL_DISTRICT_CAP, RIVAL_EXPAND_CHANCE, RIVAL_PRESSURE,
  SELF_PRESSURE, SHOP_KINDS, SPOTS, STAGE_NAMES, STAGES, UPKEEP_RATE, WAGES, INCORPORATE_COST, stageAtLeast, stageIndex,
} from './data';
import {
  LOT_IDS, SCRAP_MAX, SPOT_BY_ID, buildTotal, demandCurve, lotPrice, emptyLedger, kindMult, netWorth, pick, playerShops,
  rand, retailShops, rivalMult, serveCapacity, stockCap, trafficMult, unitCost, wageMult, type GameData, type ShopData,
} from './model';
import type { CoreEvent, DayReport, District, GoalStep, GoalView, ShopKind, SpotDef, Stage } from './types';

export type Emit = (e: CoreEvent) => void;

export interface SimContext {
  /** 플레이어가 서 있는 스폿 */
  presence: string | null;
  /** 자는 중이면 사장이 가게를 못 본다 */
  asleep: boolean;
}

function competition(g: GameData, spot: SpotDef, kind: ShopKind, selfId: string): number {
  let rivals = 0, self = 0;
  for (const id of LOT_IDS) {
    if (id === selfId) continue;
    const s = SPOT_BY_ID.get(id)!;
    if (s.district !== spot.district) continue;
    const lot = g.lots[id];
    if (lot.owner === 'rival' && lot.rivalKind === kind) rivals += lot.rivalLevel ?? 1;
    else if (lot.owner === 'player' && lot.shop?.kind === kind) self++;
  }
  return 1 / (1 + RIVAL_PRESSURE * rivals * rivalMult(g, spot.district) + SELF_PRESSURE * self);
}

/** 가게 한 곳의 1분 영업. 반환: 이번 분 응대 수 */
export function shopMinute(g: GameData, id: string, spot: SpotDef, shop: ShopData, ownerHere: boolean, hour: number): number {
  if (shop.kind === 'factory') return 0;
  const def = SHOP_KINDS[shop.kind];
  const open = hour >= OPEN_HOUR && hour < CLOSE_HOUR;
  const owner = ownerHere && g.energy > 0;
  const cap = open ? serveCapacity(shop, owner) : 0;
  const manager = shop.staff.some(s => s.role === 'manager');
  if (manager) restockIfLow(g, shop, false);
  if (cap <= 0) { shop.busy *= 0.95; return 0; }
  const d = DISTRICTS[spot.district];
  const appeal = Math.min(2.2, Math.pow(shop.priceMult / d.wealth, -1.5));
  const ratingMult = 0.6 + shop.rating / 100 * 0.8;
  const demand = def.demand / 60 * LEVEL_MULT[shop.level] * d.traffic * demandCurve(def.curve, hour) * trafficMult(g, spot.district)
    * kindMult(g, shop.kind) * appeal * ratingMult * competition(g, spot, shop.kind, id);
  const served = Math.max(0, Math.min(demand, cap, shop.stock));
  const lost = Math.max(0, demand - served);
  const revenue = served * def.price * shop.priceMult;
  shop.stock -= served;
  g.cash += revenue;
  g.lifetimeEarned += revenue;
  shop.today.revenue += revenue;
  shop.today.customers += served;
  shop.today.lost += lost;
  g.ledger.revenue += revenue;
  g.ledger.customers += served;
  g.ledger.lost += lost;
  shop.busy = shop.busy * 0.9 + Math.min(1, demand / Math.max(0.2, cap)) * 0.1;
  if (demand > 0) {
    const satisfaction = served / demand;
    const target = Math.max(5, Math.min(100, 25 + 65 * satisfaction - (shop.priceMult - 1) * 25 + (manager ? 8 : 0)));
    shop.rating += (target - shop.rating) * 0.004;
  }
  if (owner && served > 0) g.energy = Math.max(0, g.energy - OWNER_ENERGY_PER_HOUR / 60);
  return served;
}

/** 매니저 자동 발주(수수료 붙음). force 면 비율과 상관없이 채운다 */
export function restockIfLow(g: GameData, shop: ShopData, force: boolean): void {
  const cap = stockCap(shop);
  if (!force && shop.stock > cap * 0.3) return;
  const price = unitCost(g, shop.kind) * (1 + MANAGER_RESTOCK_FEE);
  const want = Math.floor(cap - shop.stock);
  const afford = Math.floor(Math.max(0, g.cash) / price);
  const units = Math.min(want, afford);
  if (units <= 0) return;
  const cost = units * price;
  g.cash -= cost;
  shop.stock += units;
  shop.today.cost += cost;
  g.ledger.costOfGoods += cost;
}

export function advanceMinute(g: GameData, ctx: SimContext, emit: Emit): void {
  const hour = g.minute / 60;
  for (const { id, spot, shop } of playerShops(g)) shopMinute(g, id, spot, shop, !ctx.asleep && ctx.presence === id, hour);
  // 고물 재생(시간당 6개)
  if (g.minute % 10 === 0) for (const k of Object.keys(g.scrap)) g.scrap[k] = Math.min(SCRAP_MAX, g.scrap[k] + 1);
  g.minute++;
  if (g.minute >= DAY_MINUTES) endDay(g, emit);
  checkStage(g, emit);
}

// ── 자정 정산 ────────────────────────────────────────
export function endDay(g: GameData, emit: Emit): void {
  const wm = wageMult(g);
  let wages = 0, upkeep = 0, factoryIncome = 0;
  for (const { shop } of playerShops(g)) {
    const w = shop.staff.reduce((s, st) => s + WAGES[st.role], 0) * wm;
    const u = buildTotal(shop.kind, shop.level) * UPKEEP_RATE;
    let income = 0;
    if (shop.kind === 'factory') income = SHOP_KINDS.factory.buildCost * 0.025 * LEVEL_MULT[shop.level];
    wages += w; upkeep += u; factoryIncome += income;
    shop.lastProfit = Math.round(shop.today.revenue + income - shop.today.cost - w - u);
    shop.today = { revenue: 0, customers: 0, lost: 0, cost: 0 };
  }
  const interest = g.debt * LOAN_RATE;
  let worldIncome = 0;
  for (const r of REGIONS) worldIncome += r.size * (g.regions[r.id] ?? 0) * REGION_YIELD;
  const l = g.ledger;
  l.wages += wages; l.upkeep += upkeep; l.interest += interest;
  l.worldIncome += worldIncome; l.revenue += factoryIncome;
  g.cash += worldIncome + factoryIncome - wages - upkeep - interest;
  g.lifetimeEarned += worldIncome + factoryIncome;
  const preTax = l.revenue + l.worldIncome + l.jobIncome - l.costOfGoods - l.wages - l.upkeep - l.interest;
  if (g.incorporated && preTax > 0) {
    l.tax = preTax * CORP_TAX;
    g.cash -= l.tax;
  }
  const report: DayReport = { day: g.day, ...l, profit: Math.round(preTax - l.tax) };
  for (const k of Object.keys(report) as Array<keyof DayReport>) report[k] = Math.round(report[k]);
  g.lastReport = report;
  g.ledger = emptyLedger();
  if (g.cash < 0) {
    // 마이너스 통장: 부족분은 빚으로 넘어간다(게임 오버 없음)
    g.debt += -g.cash;
    emit({ type: 'toast', text: `잔고가 모자라 ${fmt(-g.cash)}이 빚으로 넘어갔습니다.`, tone: 'bad' });
    g.cash = 0;
  }
  g.day++;
  g.minute = 0;
  // 해외 점유율: 정복 전에는 현지 경쟁으로 조금씩 깎인다
  for (const r of REGIONS) {
    const s = g.regions[r.id] ?? 0;
    if (s > 0 && s < CONQUER_SHARE - 1e-9) g.regions[r.id] = Math.max(0.0001, s - REGION_DECAY);
  }
  tickEvents(g, emit);
  rivalsExpand(g, emit);
  // 구독자가 여기서 저장하므로 당일 모든 변경을 끝낸 뒤 알린다.
  emit({ type: 'day', text: `${report.day}일차 정산: 순이익 ${fmt(report.profit)}`, report });
}

function tickEvents(g: GameData, emit: Emit): void {
  for (const e of g.events) e.daysLeft--;
  g.events = g.events.filter(e => e.daysLeft > 0);
  if (rand(g) > EVENT_CHANCE) return;
  const pool = EVENTS.filter(e => stageAtLeast(g.stage, e.minStage) && !g.events.some(a => a.id === e.id));
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let roll = rand(g) * total;
  const def = pool.find(e => (roll -= e.weight) < 0);
  if (!def) return;
  const districts = (Object.keys(DISTRICTS) as District[]).filter(d => stageAtLeast(g.stage, DISTRICTS[d].minStage));
  const district = def.local ? pick(g, districts) : undefined;
  const where = district ? `[${DISTRICTS[district].name}] ` : '';
  if (def.instant) {
    const text = applyInstant(g, def.instant);
    if (text) emit({ type: 'toast', text: `${def.name}: ${text}`, tone: def.instant === 'viral' || def.instant === 'windfall' ? 'good' : 'bad' });
    return;
  }
  g.events.push({ id: def.id, daysLeft: def.days, district });
  emit({ type: 'toast', text: `${where}${def.name}: ${def.desc}`, tone: 'info' });
}

function applyInstant(g: GameData, kind: 'viral' | 'inspection' | 'audit' | 'windfall'): string | null {
  const shops = retailShops(g);
  if (kind === 'viral') {
    if (!shops.length) return null;
    const s = pick(g, shops);
    s.shop.rating = Math.min(100, s.shop.rating + 20);
    return `${s.shop.name} 평점 +20`;
  }
  if (kind === 'inspection') {
    const bad = shops.filter(s => s.shop.rating < 40);
    if (!bad.length) return '모든 가게 통과!';
    const fine = bad.reduce((sum, s) => sum + Math.round(SHOP_KINDS[s.shop.kind].buildCost * 0.05), 0);
    g.cash -= fine;
    return `${bad.length}곳 과태료 ${fmt(fine)}`;
  }
  if (kind === 'audit') {
    const fine = Math.round(Math.max(0, g.cash) * 0.03);
    g.cash -= fine;
    return `${fmt(fine)} 추징`;
  }
  const gift = 20 + Math.round(rand(g) * 40) + stageIndex(g.stage) * 30;
  g.cash += gift;
  g.lifetimeEarned += gift;
  return `사례금 ${fmt(gift)}`;
}

export function spotUnlocked(g: GameData, spot: SpotDef): boolean { return stageAtLeast(g.stage, spot.minStage); }

function rivalsExpand(g: GameData, emit: Emit): void {
  for (const r of RIVALS) {
    if (g.rivals[r.id]?.acquired) continue;
    // 플레이어가 클수록 라이벌도 공격적이다
    if (rand(g) > RIVAL_EXPAND_CHANCE * (0.5 + stageIndex(g.stage) * 0.15)) continue;
    const free = SPOTS.filter(s => s.kind === 'lot' && s.size !== 'I' && spotUnlocked(g, s) && g.lots[s.id].owner === 'none' && rivalRoom(g, s.district));
    if (!free.length) continue;
    const spot = pick(g, free);
    const kinds = LOT_KINDS[spot.size!].filter(k => k !== 'factory');
    const kind = pick(g, kinds);
    const level = 1 + Math.floor(rand(g) * Math.min(3, 1 + stageIndex(g.stage) / 2));
    g.lots[spot.id] = { owner: 'rival', rivalId: r.id, rivalKind: kind, rivalLevel: level };
    emit({ type: 'toast', text: `${r.name}이(가) ${spot.name}에 ${SHOP_KINDS[kind].name}을(를) 열었습니다.`, tone: 'bad' });
  }
}

function rivalRoom(g: GameData, district: District): boolean {
  const lots = SPOTS.filter(s => s.kind === 'lot' && s.district === district);
  const rival = lots.filter(s => g.lots[s.id].owner === 'rival').length;
  return rival + 1 <= Math.floor(lots.length * RIVAL_DISTRICT_CAP + 1e-9);
}

// ── 단계 ─────────────────────────────────────────────
function districtsOwned(g: GameData): number { return new Set(retailShops(g).map(s => s.spot.district)).size; }
function maxLevel(g: GameData): number { return Math.max(0, ...retailShops(g).map(s => s.shop.level)); }

export function ipoReady(g: GameData): string | null {
  if (!g.incorporated) return '먼저 법인을 세워야 합니다';
  if (retailShops(g).length < IPO_MIN_SHOPS) return `가게 ${IPO_MIN_SHOPS}곳이 필요합니다`;
  if (districtsOwned(g) < IPO_MIN_DISTRICTS) return `${IPO_MIN_DISTRICTS}개 구역에 가게가 필요합니다`;
  if (netWorth(g) < IPO_NET_WORTH) return `순자산 ${fmt(IPO_NET_WORTH)}이 필요합니다`;
  return null;
}

function stageReached(g: GameData, stage: Stage): boolean {
  switch (stage) {
    case 'broke': return true;
    case 'parttime': return g.lifetimeEarned >= PARTTIME_EARNED;
    case 'smallshop': return retailShops(g).length > 0;
    case 'bigshop': return maxLevel(g) >= 3;
    case 'business': return g.incorporated;
    case 'corp': return g.listed;
    case 'world': return REGIONS.some(r => (g.regions[r.id] ?? 0) > 0);
  }
}

export function checkStage(g: GameData, emit: Emit): void {
  let i = stageIndex(g.stage);
  while (i + 1 < STAGES.length && stageReached(g, STAGES[i + 1])) {
    i++;
    g.stage = STAGES[i];
    emit({ type: 'stage', text: `${STAGE_NAMES[g.stage]}(으)로 올라섰습니다!`, stage: g.stage });
  }
  if (!g.won && g.stage === 'world' && REGIONS.every(r => (g.regions[r.id] ?? 0) >= CONQUER_SHARE - 1e-9)) {
    g.won = true;
    emit({ type: 'win', text: '여섯 대륙을 모두 손에 넣었습니다. 세계 정복 완료!' });
  }
}

const step = (label: string, value: number, need: number): GoalStep =>
  ({ label, done: value >= need, progress: Math.max(0, Math.min(1, need > 0 ? value / need : 1)) });

export function goal(g: GameData): GoalView {
  const i = stageIndex(g.stage);
  const next = STAGES[i + 1] ?? null;
  let label = '';
  let steps: GoalStep[] = [];
  const shops = retailShops(g).length;
  switch (g.stage) {
    case 'broke':
      label = '빈 병을 주워 팔아 첫 밑천을 마련하세요';
      steps = [step(`번 돈 ${fmt(g.lifetimeEarned)} / ${fmt(PARTTIME_EARNED)}`, g.lifetimeEarned, PARTTIME_EARNED)];
      break;
    case 'parttime': {
      const cheapest = Math.min(...SPOTS.filter(s => s.kind === 'lot' && s.minStage === 'parttime' && g.lots[s.id].owner === 'none')
        .map(s => lotPrice(s) + SHOP_KINDS.stall.buildCost));
      const need = Number.isFinite(cheapest) ? cheapest : 500;
      label = '알바로 돈을 모아 첫 포장마차를 차리세요';
      steps = [step(`창업 자금 ${fmt(g.cash)} / ${fmt(need)}`, g.cash, need), step('빈 부지에 가게 열기', shops, 1)];
      break;
    }
    case 'smallshop':
      label = '카페나 편의점을 3레벨 큰 가게로 키우세요';
      steps = [step(`가장 큰 가게 Lv ${maxLevel(g)} / 3`, maxLevel(g), 3)];
      break;
    case 'bigshop':
      label = '가게를 늘리고 비즈니스 센터에서 법인을 세우세요';
      steps = [step(`가게 ${shops} / ${BUSINESS_SHOPS}곳`, shops, BUSINESS_SHOPS), step(`법인 설립 자금 ${fmt(g.cash)} / ${fmt(INCORPORATE_COST)}`, g.cash, INCORPORATE_COST), step('법인 설립', g.incorporated ? 1 : 0, 1)];
      break;
    case 'business': {
      const nw = netWorth(g);
      label = '체인을 넓혀 증시에 상장하세요';
      steps = [
        step(`가게 ${shops} / ${IPO_MIN_SHOPS}곳`, shops, IPO_MIN_SHOPS),
        step(`진출 구역 ${districtsOwned(g)} / ${IPO_MIN_DISTRICTS}`, districtsOwned(g), IPO_MIN_DISTRICTS),
        step(`순자산 ${fmt(nw)} / ${fmt(IPO_NET_WORTH)}`, nw, IPO_NET_WORTH),
        step('비즈니스 센터에서 상장', g.listed ? 1 : 0, 1),
      ];
      break;
    }
    case 'corp':
      label = '국제공항에서 첫 해외 시장에 진출하세요';
      steps = [step('해외 진출', 0, 1)];
      break;
    case 'world': {
      const conquered = REGIONS.filter(r => (g.regions[r.id] ?? 0) >= CONQUER_SHARE - 1e-9).length;
      label = g.won ? '세계 정복 완료! 제국을 계속 키워 보세요' : `여섯 대륙에서 점유율 ${Math.round(CONQUER_SHARE * 100)}%를 차지하세요`;
      steps = REGIONS.map(r => step(`${r.name} ${Math.round((g.regions[r.id] ?? 0) * 100)}%`, g.regions[r.id] ?? 0, CONQUER_SHARE - 1e-9));
      steps.unshift(step(`정복한 대륙 ${conquered} / ${REGIONS.length}`, conquered, REGIONS.length));
      break;
    }
  }
  const progress = steps.length ? steps.reduce((s, x) => s + x.progress, 0) / steps.length : 1;
  return { next, label, progress, steps };
}

export function fmt(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(Math.round(n));
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toLocaleString('en-US')}`;
}

