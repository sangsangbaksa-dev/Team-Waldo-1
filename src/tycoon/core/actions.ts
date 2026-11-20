// 스폿별 행동 목록과 실행. 플레이어가 직접 걸어가서 하는 모든 일이 여기 있다.
import {
  BOTTLE_CAP, BOTTLE_PRICE, BUSINESS_SHOPS, BUYOUT_PREMIUM, CARGO_CAP, CLERKS_PER_LEVEL, CONQUER_SHARE, DELIVERY_MINUTES,
  DISTRICTS, ENERGY_MAX, INCORPORATE_COST, IPO_RAISE, JOBS, LOAN_LIMIT_RATE, LOAN_MIN_LIMIT, LOAN_STEPS, LOT_KINDS, NIGHT_FROM,
  NIGHT_TO, REGIONS, REGION_STEP, REGION_STEP_COST, RIVALS, SHOP_KINDS, SPOTS, STAGE_NAMES, TAKEOVER_PREMIUM, WAGES,
  stageAtLeast,
} from './data';
import {
  LOT_IDS, SPOT_BY_ID, absMinute, buildTotal, earn, expandCost, lotPrice, makeStaff, netWorth, nextId, pick,
  retailShops, rivalShopValue, shopValue, stockCap, unitCost, type GameData, type ShopData,
} from './model';
import { checkStage, fmt, ipoReady, spotUnlocked, type Emit } from './sim';
import type { ActionDef, ShopKind, SpotDef } from './types';

export interface ActionCtx {
  g: GameData;
  emit: Emit;
  /** 잠들어서 시간을 건너뛴다(가게는 계속 돈다) */
  skipMinutes: (minutes: number) => void;
}

export interface ActionSpec extends ActionDef {
  lockMovement: boolean;
  run: () => string;
}

const JOB_AT: Record<string, string> = { job_mart: 'mart_shift', job_cafe: 'cafe_shift', job_delivery: 'delivery', job_dock: 'dock' };
const FOOD = [
  { id: 'ramen', label: '컵라면', cost: 3, energy: 20, sec: 1.5 },
  { id: 'gimbap', label: '김밥 정식', cost: 9, energy: 50, sec: 2.5 },
  { id: 'feast', label: '든든한 한상', cost: 25, energy: 100, sec: 3.5 },
];

function spec(p: Partial<ActionSpec> & Pick<ActionSpec, 'id' | 'label' | 'run'>, ctx: ActionCtx): ActionSpec {
  const a: ActionSpec = { desc: '', cost: 0, reward: 0, energy: 0, durationSec: 0, enabled: true, lockMovement: false, ...p };
  if (a.enabled && a.cost > 0 && ctx.g.cash + 1e-9 < a.cost) { a.enabled = false; a.disabledReason = `돈이 모자랍니다 (${fmt(a.cost)})`; }
  if (a.enabled && a.energy > 0 && ctx.g.energy < a.energy) { a.enabled = false; a.disabledReason = '너무 지쳤습니다. 먹거나 자세요'; }
  return a;
}

function off(reason: string) { return { enabled: false, disabledReason: reason }; }

export function shopName(g: GameData, spot: SpotDef, kind: ShopKind): string {
  const prefix = g.stage === 'broke' || g.stage === 'parttime' ? '빈털터리' : g.incorporated ? 'HUSTLE' : DISTRICTS[spot.district].name;
  return `${prefix} ${SHOP_KINDS[kind].name}`;
}

export function buildActions(ctx: ActionCtx, spotId: string): ActionSpec[] {
  const { g } = ctx;
  const spot = SPOT_BY_ID.get(spotId);
  if (!spot) return [];
  if (!spotUnlocked(g, spot)) {
    return [spec({ id: 'locked', label: '아직 닫혀 있음', run: () => '', ...off(`${STAGE_NAMES[spot.minStage]} 단계에 열립니다`) }, ctx)];
  }
  const out: ActionSpec[] = [];
  if (g.task && g.task.target === spotId) out.push(deliverAction(ctx));
  switch (spot.kind) {
    case 'home': out.push(sleepAction(ctx)); break;
    case 'scrap': out.push(scrapAction(ctx, spotId)); break;
    case 'recycle': out.push(recycleAction(ctx)); break;
    case 'food': for (const f of FOOD) out.push(foodAction(ctx, f)); break;
    case 'job': out.push(jobAction(ctx, spotId)); break;
    case 'market': out.push(...marketActions(ctx)); break;
    case 'bank': out.push(...bankActions(ctx)); break;
    case 'office': out.push(...officeActions(ctx)); break;
    case 'airport': out.push(...airportActions(ctx)); break;
    case 'lot': out.push(...lotActions(ctx, spot)); break;
  }
  return out;
}

// ── 생존 ─────────────────────────────────────────────
function sleepAction(ctx: ActionCtx): ActionSpec {
  const { g } = ctx;
  const h = g.minute / 60;
  const night = h >= NIGHT_FROM || h < NIGHT_TO;
  if (night) {
    const until = h >= NIGHT_FROM ? 24 * 60 - g.minute + NIGHT_TO * 60 : NIGHT_TO * 60 - g.minute;
    return spec({
      id: 'sleep', label: '아침까지 자기', desc: '06시까지 잔다. 에너지가 가득 찬다. 자는 동안에도 직원이 있는 가게는 돌아간다.', energy: -(ENERGY_MAX - g.energy), durationSec: 2.5, lockMovement: true,
      run: () => { ctx.skipMinutes(until); g.energy = ENERGY_MAX; return '푹 잤습니다. 새 아침이에요.'; },
    }, ctx);
  }
  return spec({
    id: 'nap', label: '낮잠 (2시간)', desc: '에너지 +30. 그동안 시간이 흐른다.', energy: -30, durationSec: 1.5, lockMovement: true,
    run: () => { ctx.skipMinutes(120); g.energy = Math.min(ENERGY_MAX, g.energy + 30); return '잠깐 눈을 붙였습니다.'; },
  }, ctx);
}

function scrapAction(ctx: ActionCtx, spotId: string): ActionSpec {
  const { g } = ctx;
  const left = Math.floor(g.scrap[spotId] ?? 0);
  const take = Math.min(3, left, BOTTLE_CAP - g.bottles);
  const reason = left <= 0 ? '다 주웠습니다. 나중에 다시 오세요' : g.bottles >= BOTTLE_CAP ? '더 들 수 없습니다. 고물상에 파세요' : undefined;
  return spec({
    id: 'collect', label: '빈 병 줍기', desc: `빈 병 ${take}개 (남은 병 ${left}). 고물상에서 개당 ${fmt(BOTTLE_PRICE)}`, energy: 4, durationSec: 2.5, lockMovement: true,
    reward: take * BOTTLE_PRICE, ...(reason ? off(reason) : {}),
    run: () => {
      const n = Math.min(3, Math.floor(g.scrap[spotId] ?? 0), BOTTLE_CAP - g.bottles);
      g.scrap[spotId] -= n; g.bottles += n; g.energy -= 4;
      return `빈 병 ${n}개를 주웠습니다 (${g.bottles}/${BOTTLE_CAP})`;
    },
  }, ctx);
}

function recycleAction(ctx: ActionCtx): ActionSpec {
  const { g } = ctx;
  return spec({
    id: 'sell_bottles', label: '빈 병 팔기', desc: `개당 ${fmt(BOTTLE_PRICE)}`, reward: g.bottles * BOTTLE_PRICE,
    ...(g.bottles <= 0 ? off('팔 빈 병이 없습니다') : {}),
    run: () => {
      const pay = g.bottles * BOTTLE_PRICE;
      earn(g, pay); g.ledger.jobIncome += pay; g.bottles = 0;
      ctx.emit({ type: 'cash', text: `+${fmt(pay)}`, amount: pay });
      return `빈 병을 팔아 ${fmt(pay)}을 벌었습니다`;
    },
  }, ctx);
}

function foodAction(ctx: ActionCtx, f: typeof FOOD[number]): ActionSpec {
  const { g } = ctx;
  const full = g.energy >= ENERGY_MAX - 1;
  return spec({
    id: `eat_${f.id}`, label: f.label, desc: `에너지 +${f.energy}`, cost: f.cost, energy: -f.energy, durationSec: f.sec, lockMovement: true,
    ...(full ? off('배가 부릅니다') : {}),
    run: () => { g.cash -= f.cost; g.energy = Math.min(ENERGY_MAX, g.energy + f.energy); return `${f.label}을(를) 먹었습니다`; },
  }, ctx);
}

// ── 알바 ─────────────────────────────────────────────
function jobAction(ctx: ActionCtx, spotId: string): ActionSpec {
  const { g } = ctx;
  const job = JOBS[JOB_AT[spotId]];
  const h = g.minute / 60;
  const hours = h >= job.fromHour && h < job.toHour;
  const closed = hours ? undefined : `${job.fromHour}시~${job.toHour}시에만 일합니다`;
  if (job.delivery) {
    const busy = g.task ? '이미 배달 중입니다' : undefined;
    return spec({
      id: 'accept', label: '배달 받기', desc: `${job.desc} 제한 ${DELIVERY_MINUTES / 60}시간, 기본 ${fmt(job.pay)}`, reward: job.pay, energy: job.energy, durationSec: job.durationSec,
      ...((closed ?? busy) ? off((closed ?? busy)!) : {}),
      run: () => {
        const targets = SPOTS.filter(s => s.id !== spotId && spotUnlocked(g, s) && (s.kind !== 'lot' || g.lots[s.id].owner !== 'none') && s.kind !== 'job');
        const target = pick(g, targets);
        g.energy -= job.energy;
        g.task = { id: nextId(g, 'task'), jobId: job.id, from: spotId, target: target.id, reward: job.pay, deadline: absMinute(g) + DELIVERY_MINUTES };
        ctx.emit({ type: 'task', text: `${target.name}(으)로 배달하세요`, task: { id: g.task.id, label: `${target.name}(으)로 배달`, fromSpotId: spotId, targetSpotId: target.id, reward: job.pay, minutesLeft: DELIVERY_MINUTES } });
        return `${target.name}까지 배달하세요!`;
      },
    }, ctx);
  }
  return spec({
    id: 'work', label: `${job.name} 하기`, desc: job.desc, reward: job.pay, energy: job.energy, durationSec: job.durationSec, lockMovement: true,
    ...(closed ? off(closed) : {}),
    run: () => {
      g.energy -= job.energy;
      earn(g, job.pay); g.ledger.jobIncome += job.pay; g.jobsDone++;
      ctx.emit({ type: 'cash', text: `+${fmt(job.pay)}`, amount: job.pay });
      return `${job.name} 끝! ${fmt(job.pay)}`;
    },
  }, ctx);
}

function deliverAction(ctx: ActionCtx): ActionSpec {
  const { g } = ctx;
  const t = g.task!;
  const left = t.deadline - absMinute(g);
  const pay = Math.round(left < 0 ? t.reward * 0.5 : left > DELIVERY_MINUTES / 2 ? t.reward * 1.25 : t.reward);
  return spec({
    id: 'deliver', label: '배달 완료', desc: left < 0 ? '늦었다... 절반만 받는다' : left > DELIVERY_MINUTES / 2 ? '총알 배송 보너스 +25%' : '제시간 배달', reward: pay,
    run: () => {
      g.task = null;
      earn(g, pay); g.ledger.jobIncome += pay; g.jobsDone++;
      ctx.emit({ type: 'cash', text: `+${fmt(pay)}`, amount: pay });
      ctx.emit({ type: 'task', text: '배달 완료', task: null });
      return `배달 완료! ${fmt(pay)}`;
    },
  }, ctx);
}

// ── 도매시장 ─────────────────────────────────────────
function marketActions(ctx: ActionCtx): ActionSpec[] {
  const { g } = ctx;
  const kinds = [...new Set(retailShops(g).map(s => s.shop.kind))];
  const out = kinds.map(kind => {
    const def = SHOP_KINDS[kind];
    const price = unitCost(g, kind);
    const held = g.cargo?.kind === kind ? g.cargo.units : 0;
    const other = g.cargo && g.cargo.kind !== kind ? `${SHOP_KINDS[g.cargo.kind].name} 재료를 먼저 가게에 넣으세요` : undefined;
    const room = CARGO_CAP - held;
    const units = Math.max(0, Math.min(room, Math.floor(g.cash / price)));
    const reason = other ?? (room <= 0 ? '더 들 수 없습니다' : units <= 0 ? `돈이 모자랍니다 (개당 ${fmt(price)})` : undefined);
    return spec({
      id: `buy_${kind}`, label: `${def.name} 재료 ${units || room}개`, desc: `개당 ${fmt(price)}. 매니저 자동 발주보다 싸다. 직접 가게까지 들고 가야 한다`, cost: Math.ceil(units * price), durationSec: 1.5, lockMovement: true,
      ...(reason ? off(reason) : {}),
      run: () => {
        const n = Math.max(0, Math.min(CARGO_CAP - (g.cargo?.kind === kind ? g.cargo.units : 0), Math.floor(g.cash / price)));
        const cost = n * price;
        g.cash -= cost; g.ledger.costOfGoods += cost;
        g.cargo = { kind, units: (g.cargo?.kind === kind ? g.cargo.units : 0) + n };
        return `${def.name} 재료 ${n}개를 샀습니다 (${fmt(cost)})`;
      },
    }, ctx);
  });
  if (!kinds.length) out.push(spec({ id: 'none', label: '재료 사기', run: () => '', ...off('먼저 가게를 여세요') }, ctx));
  if (g.cargo) out.push(spec({
    id: 'discard_cargo', label: `${SHOP_KINDS[g.cargo.kind].name} 재료 ${g.cargo.units}개 비우기`, desc: '환불 없이 보유 재료를 버립니다. 다른 업종의 재료를 사려면 먼저 비우세요.',
    run: () => { g.cargo = null; return '보유 재료를 비웠습니다.'; },
  }, ctx));
  return out;
}

// ── 은행 ─────────────────────────────────────────────
export function loanLimit(g: GameData): number {
  const base = stageAtLeast(g.stage, 'smallshop') ? LOAN_MIN_LIMIT : 300;
  return Math.max(0, Math.floor(Math.max(base, netWorth(g) * LOAN_LIMIT_RATE) - g.debt));
}

function bankActions(ctx: ActionCtx): ActionSpec[] {
  const { g } = ctx;
  const limit = loanLimit(g);
  const out: ActionSpec[] = [];
  for (const amt of LOAN_STEPS) {
    if (amt > Math.max(limit, LOAN_STEPS[0]) && out.length) break;
    out.push(spec({
      id: `loan_${amt}`, label: `${fmt(amt)} 대출`, desc: `하루 이자 1.5%. 한도 ${fmt(limit)}`, reward: amt,
      ...(amt > limit ? off(`대출 한도 ${fmt(limit)}`) : {}),
      run: () => { g.cash += amt; g.debt += amt; return `${fmt(amt)}을 빌렸습니다. 빚 ${fmt(g.debt)}`; },
    }, ctx));
  }
  const pay = Math.max(0, Math.min(g.debt, g.cash));
  out.push(spec({
    id: 'repay', label: pay >= g.debt ? '빚 전부 갚기' : `${fmt(pay)} 갚기`, desc: `남은 빚 ${fmt(g.debt)}`, cost: pay,
    ...(g.debt <= 0 ? off('갚을 빚이 없습니다') : pay <= 0 ? off('현금이 없습니다') : {}),
    run: () => { const p = Math.max(0, Math.min(g.debt, g.cash)); g.cash -= p; g.debt = Math.max(0, g.debt - p); return `${fmt(p)}을 갚았습니다`; },
  }, ctx));
  return out;
}

// ── 비즈니스 센터 ───────────────────────────────────
export function rivalValue(g: GameData, rivalId: string): { shops: number; value: number } {
  let shops = 0, value = 0;
  for (const id of LOT_IDS) {
    const lot = g.lots[id];
    if (lot.owner === 'rival' && lot.rivalId === rivalId) { shops++; value += rivalShopValue(SPOT_BY_ID.get(id)!, lot.rivalKind!, lot.rivalLevel ?? 1); }
  }
  return { shops, value };
}
export function takeoverCost(g: GameData, rivalId: string): number {
  const { value } = rivalValue(g, rivalId);
  return Math.round(Math.max(200000, value * 3) * TAKEOVER_PREMIUM);
}

function officeActions(ctx: ActionCtx): ActionSpec[] {
  const { g } = ctx;
  const out: ActionSpec[] = [];
  const shops = retailShops(g).length;
  if (!g.incorporated) {
    out.push(spec({
      id: 'incorporate', label: '법인 설립', desc: '주식회사를 세운다. 직원 매니저·공장·대형 업종·라이벌 가게 인수가 열린다. 이익에 법인세 12%', cost: INCORPORATE_COST,
      ...(shops < BUSINESS_SHOPS ? off(`가게 ${BUSINESS_SHOPS}곳이 필요합니다 (${shops})`) : {}),
      run: () => {
        g.cash -= INCORPORATE_COST; g.incorporated = true;
        for (const s of retailShops(g)) if (s.shop.name.startsWith('빈털터리') || s.shop.name.startsWith(DISTRICTS[s.spot.district].name)) s.shop.name = shopName(g, s.spot, s.shop.kind);
        return '(주)HUSTLE 설립! 이제 사업가입니다';
      },
    }, ctx));
    return out;
  }
  if (!g.listed) {
    const why = ipoReady(g);
    const raise = Math.round(netWorth(g) * IPO_RAISE);
    out.push(spec({
      id: 'ipo', label: '증시 상장(IPO)', desc: `주식을 팔아 약 ${fmt(raise)}을 모은다. 대기업이 된다`, reward: raise,
      ...(why ? off(why) : {}),
      run: () => { const r = Math.round(netWorth(g) * IPO_RAISE); g.cash += r; g.listed = true; return `상장 성공! ${fmt(r)} 유입`; },
    }, ctx));
  }
  for (const r of RIVALS) {
    const acquired = g.rivals[r.id]?.acquired;
    if (acquired) continue;
    const cost = takeoverCost(g, r.id);
    out.push(spec({
      id: `takeover_${r.id}`, label: `${r.name} 적대적 인수`, desc: `가게 ${rivalValue(g, r.id).shops}곳을 통째로 삼킨다. 다시는 확장하지 않는다`, cost,
      ...(!g.listed ? off('상장한 대기업만 할 수 있습니다') : {}),
      run: () => {
        g.cash -= cost;
        g.rivals[r.id] = { acquired: true };
        for (const id of LOT_IDS) {
          const lot = g.lots[id];
          if (lot.owner !== 'rival' || lot.rivalId !== r.id) continue;
          const spot = SPOT_BY_ID.get(id)!;
          g.lots[id] = { owner: 'player', shop: newShop(g, spot, lot.rivalKind!, lot.rivalLevel ?? 1, lotPrice(spot) + buildTotal(lot.rivalKind!, lot.rivalLevel ?? 1)) };
        }
        return `${r.name}을(를) 집어삼켰습니다!`;
      },
    }, ctx));
  }
  return out;
}

// ── 공항 ─────────────────────────────────────────────
export function regionInvestCost(g: GameData, regionId: string): number {
  const r = REGIONS.find(x => x.id === regionId)!;
  return Math.round(r.size * REGION_STEP_COST * (1 + (g.regions[regionId] ?? 0)));
}

function airportActions(ctx: ActionCtx): ActionSpec[] {
  const { g } = ctx;
  return REGIONS.map(r => {
    const share = g.regions[r.id] ?? 0;
    const cost = regionInvestCost(g, r.id);
    const done = share >= CONQUER_SHARE - 1e-9;
    return spec({
      id: `invest_${r.id}`, label: share > 0 ? `${r.name} 점유율 +10%p` : `${r.name} 진출`, desc: `현재 ${Math.round(share * 100)}%. ${Math.round(CONQUER_SHARE * 100)}%면 정복. 정복 전엔 매일 1%p씩 밀린다`, cost, durationSec: 1,
      ...(done ? off('이미 정복했습니다') : !g.listed ? off('상장한 대기업만 해외에 나갈 수 있습니다') : {}),
      run: () => {
        g.cash -= cost;
        g.regions[r.id] = Math.min(1, (g.regions[r.id] ?? 0) + REGION_STEP);
        checkStage(g, ctx.emit);
        return `${r.name} 점유율 ${Math.round(g.regions[r.id] * 100)}%`;
      },
    }, ctx);
  });
}

// ── 부지/가게 ───────────────────────────────────────
export function newShop(g: GameData, spot: SpotDef, kind: ShopKind, level: number, invested: number): ShopData {
  g.shopsOpened++;
  return {
    kind, name: shopName(g, spot, kind), level, priceMult: 1, stock: kind === 'factory' ? 0 : Math.round(SHOP_KINDS[kind].stock * 0.5), rating: 50, staff: [], invested,
    today: { revenue: 0, customers: 0, lost: 0, cost: 0 }, lastProfit: 0, busy: 0,
  };
}

function lotActions(ctx: ActionCtx, spot: SpotDef): ActionSpec[] {
  const { g } = ctx;
  const lot = g.lots[spot.id];
  if (lot.owner === 'none') {
    const land = lotPrice(spot);
    return LOT_KINDS[spot.size!].map(kind => {
      const def = SHOP_KINDS[kind];
      const cost = land + def.buildCost;
      const locked = !stageAtLeast(g.stage, def.minStage) ? `${STAGE_NAMES[def.minStage]} 단계에 열립니다` : kind === 'factory' && !g.incorporated ? '법인이 있어야 합니다' : undefined;
      return spec({
        id: `build_${kind}`, label: `${def.icon} ${def.name} 열기`, desc: kind === 'factory' ? `모든 가게 재료비를 낮추고 납품 수익을 낸다. 부지 ${fmt(land)} + 건축 ${fmt(def.buildCost)}` : `부지 ${fmt(land)} + 건축 ${fmt(def.buildCost)}. 손님 1명당 ${fmt(def.price)}`, cost, durationSec: 2, lockMovement: true,
        ...(locked ? off(locked) : {}),
        run: () => {
          g.cash -= cost;
          g.lots[spot.id] = { owner: 'player', shop: newShop(g, spot, kind, 1, cost) };
          checkStage(g, ctx.emit);
          return kind === 'factory' ? `${def.name} 가동!` : `${g.lots[spot.id].shop!.name} 개업! 가게에 서 있으면 직접 장사합니다`;
        },
      }, ctx);
    });
  }
  if (lot.owner === 'rival') {
    const rival = RIVALS.find(r => r.id === lot.rivalId)!;
    const kind = lot.rivalKind!, level = lot.rivalLevel ?? 1;
    const cost = Math.round(rivalShopValue(spot, kind, level) * BUYOUT_PREMIUM / 0.7);
    return [spec({
      id: 'buyout', label: `${rival.name} ${SHOP_KINDS[kind].name} 인수`, desc: `Lv ${level}. 가게째 사들여 내 것으로 만든다`, cost,
      ...(!g.incorporated ? off('법인을 세워야 인수할 수 있습니다') : {}),
      run: () => {
        g.cash -= cost;
        g.lots[spot.id] = { owner: 'player', shop: newShop(g, spot, kind, level, cost) };
        checkStage(g, ctx.emit);
        return `${rival.name}의 가게를 인수했습니다`;
      },
    }, ctx)];
  }
  return shopActions(ctx, spot, lot.shop!);
}

function shopActions(ctx: ActionCtx, spot: SpotDef, shop: ShopData): ActionSpec[] {
  const { g } = ctx;
  const def = SHOP_KINDS[shop.kind];
  const out: ActionSpec[] = [];
  const factory = shop.kind === 'factory';
  if (!factory) {
    const cap = stockCap(shop);
    const space = Math.max(0, Math.floor(cap - shop.stock));
    const carry = g.cargo?.kind === shop.kind ? g.cargo.units : 0;
    out.push(spec({
      id: 'restock', label: `재료 채우기 (+${Math.min(space, carry)})`, desc: `재고 ${Math.floor(shop.stock)}/${cap}. 도매시장에서 사 온 재료를 넣는다`, durationSec: 1.5, lockMovement: true,
      ...(carry <= 0 ? off(`도매시장에서 ${def.name} 재료를 사 오세요`) : space <= 0 ? off('재고가 가득 찼습니다') : {}),
      run: () => {
        const n = Math.min(Math.floor(cap - shop.stock), g.cargo?.units ?? 0);
        shop.stock += n;
        g.cargo!.units -= n;
        if (g.cargo!.units <= 0) g.cargo = null;
        return `재료 ${n}개를 채웠습니다`;
      },
    }, ctx));
    out.push(spec({
      id: 'price_up', label: `가격 올리기 (${Math.round(shop.priceMult * 100)}%)`, desc: '손님은 줄고 1명당 이익은 커진다. 너무 비싸면 평점이 떨어진다',
      ...(shop.priceMult >= 2 - 1e-9 ? off('더 올릴 수 없습니다') : {}),
      run: () => { shop.priceMult = Math.min(2, Math.round((shop.priceMult + 0.1) * 10) / 10); return `가격 ${Math.round(shop.priceMult * 100)}%`; },
    }, ctx));
    out.push(spec({
      id: 'price_down', label: '가격 내리기', desc: '손님이 늘고 평점이 오른다',
      ...(shop.priceMult <= 0.5 + 1e-9 ? off('더 내릴 수 없습니다') : {}),
      run: () => { shop.priceMult = Math.max(0.5, Math.round((shop.priceMult - 0.1) * 10) / 10); return `가격 ${Math.round(shop.priceMult * 100)}%`; },
    }, ctx));
    const clerks = shop.staff.filter(s => s.role === 'clerk').length;
    const maxClerks = shop.level * CLERKS_PER_LEVEL;
    out.push(spec({
      id: 'hire_clerk', label: `점원 고용 (${clerks}/${maxClerks})`, desc: `일당 ${fmt(WAGES.clerk)}. 사장이 없어도 손님을 받는다`,
      ...(clerks >= maxClerks ? off('점원 자리가 꽉 찼습니다. 가게를 넓히세요') : {}),
      run: () => { const s = makeStaff(g, 'clerk'); shop.staff.push(s); return `점원 ${s.name} 채용 (실력 ${Math.round(s.skill * 100)}%)`; },
    }, ctx));
    if (clerks > 0) out.push(spec({
      id: 'fire_clerk', label: '점원 한 명 내보내기', desc: '실력이 가장 낮은 점원',
      run: () => {
        const list = shop.staff.filter(s => s.role === 'clerk').sort((a, b) => a.skill - b.skill);
        shop.staff = shop.staff.filter(s => s !== list[0]);
        return `${list[0].name} 퇴사`;
      },
    }, ctx));
    const manager = shop.staff.find(s => s.role === 'manager');
    if (!manager) out.push(spec({
      id: 'hire_manager', label: '매니저 고용', desc: `일당 ${fmt(WAGES.manager)}. 재고가 떨어지면 수수료 20%를 얹어 알아서 발주하고 평점을 챙긴다`,
      ...(!stageAtLeast(g.stage, 'bigshop') ? off('큰 가게 사장부터 고용할 수 있습니다') : {}),
      run: () => { const s = makeStaff(g, 'manager'); shop.staff.push(s); return `매니저 ${s.name} 채용`; },
    }, ctx));
    else out.push(spec({ id: 'fire_manager', label: `매니저 ${manager.name} 내보내기`, desc: '', run: () => { shop.staff = shop.staff.filter(s => s !== manager); return `${manager.name} 퇴사`; } }, ctx));
  }
  if (shop.level < def.maxLevel) {
    const cost = expandCost(shop);
    out.push(spec({
      id: 'expand', label: `가게 넓히기 → Lv ${shop.level + 1}`, desc: factory ? '원가 절감과 납품 수익이 커진다' : '손님·재고·점원 자리가 늘어난다', cost, durationSec: 2, lockMovement: true,
      run: () => { g.cash -= cost; shop.level++; shop.invested += cost; checkStage(g, ctx.emit); return `${shop.name} Lv ${shop.level}!`; },
    }, ctx));
  }
  const value = shopValue(shop);
  out.push(spec({
    id: 'sell', label: `가게 팔기 (+${fmt(value)})`, desc: '되돌릴 수 없다. 재고는 사라진다', reward: value,
    run: () => {
      g.cash += value;
      g.lots[spot.id] = { owner: 'none' };
      return `${shop.name}을(를) ${fmt(value)}에 팔았습니다`;
    },
  }, ctx));
  return out;
}

