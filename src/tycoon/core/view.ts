// 내부 상태 → 씬/HUD 가 읽는 스냅샷.
import { CLOSE_HOUR, CONQUER_SHARE, EVENTS, NIGHT_FROM, NIGHT_TO, OPEN_HOUR, REGIONS, REGION_YIELD, RIVALS, SHOP_KINDS, STAGE_NAMES, WAGES, stageIndex } from './data';
import { regionInvestCost, rivalValues, takeoverCostForValue } from './actions';
import { SPOT_BY_ID, absMinute, clock, lotPrice, netWorth, playerShops, serveCapacity, shopValue, stockCap, type ActivityData, type GameData, type ShopData } from './model';
import { goal } from './sim';
import type { LotView, ShopView, SpotDef, TycoonState } from './types';

export function shopView(g: GameData, spotId: string, shop: ShopData, presence: string | null): ShopView {
  const def = SHOP_KINDS[shop.kind];
  const h = g.minute / 60;
  const open = h >= OPEN_HOUR && h < CLOSE_HOUR;
  return {
    spotId,
    kind: shop.kind,
    kindName: def.name,
    name: shop.name,
    level: shop.level,
    maxLevel: def.maxLevel,
    priceMult: shop.priceMult,
    stock: Math.floor(shop.stock),
    stockCap: stockCap(shop),
    rating: Math.round(shop.rating),
    staff: shop.staff.map(s => ({ ...s, wage: WAGES[s.role] })),
    serving: shop.kind !== 'factory' && open && shop.stock >= 1 && serveCapacity(shop, presence === spotId && g.energy > 0) > 0,
    todayRevenue: Math.round(shop.today.revenue),
    todayCustomers: Math.floor(shop.today.customers),
    todayLost: Math.floor(shop.today.lost),
    profitPerDay: shop.lastProfit,
    value: shopValue(shop),
    busy: Math.max(0, Math.min(1, shop.busy)),
  };
}

export function lotView(g: GameData, spot: SpotDef, presence: string | null): LotView {
  const lot = g.lots[spot.id];
  const v: LotView = { ...spot, kind: 'lot', size: spot.size!, price: lotPrice(spot), owner: lot.owner };
  if (lot.owner === 'player' && lot.shop) v.shop = shopView(g, spot.id, lot.shop, presence);
  if (lot.owner === 'rival') {
    const r = RIVALS.find(x => x.id === lot.rivalId)!;
    v.rival = { rivalId: r.id, rivalName: r.name, color: r.color, kind: lot.rivalKind!, kindName: SHOP_KINDS[lot.rivalKind!].name, level: lot.rivalLevel ?? 1 };
  }
  return v;
}

export function buildState(g: GameData, extra: { presence: string | null; activity: ActivityData | null; speed: number }): TycoonState {
  const shops = playerShops(g);
  const retail = shops.filter(s => s.shop.kind !== 'factory');
  const values = rivalValues(g);
  const h = g.minute / 60;
  return {
    day: g.day,
    minutes: g.minute,
    clock: clock(g.minute),
    night: h >= NIGHT_FROM || h < NIGHT_TO,
    cash: Math.floor(g.cash),
    debt: Math.round(g.debt),
    energy: Math.round(g.energy),
    stage: g.stage,
    stageIndex: stageIndex(g.stage),
    stageName: STAGE_NAMES[g.stage],
    reputation: retail.length ? Math.round(retail.reduce((s, x) => s + x.shop.rating, 0) / retail.length) : 0,
    netWorth: netWorth(g),
    bottles: g.bottles,
    cargo: g.cargo ? { ...g.cargo } : null,
    owned: shops.map(s => shopView(g, s.id, s.shop, extra.presence)),
    activity: extra.activity ? {
      spotId: extra.activity.spotId, actionId: extra.activity.actionId, label: extra.activity.label,
      progress: Math.min(1, extra.activity.elapsed / extra.activity.duration), lockMovement: extra.activity.lockMovement,
    } : null,
    task: g.task ? {
      id: g.task.id, label: `${SPOT_BY_ID.get(g.task.target)?.name ?? ''}(으)로 배달`, fromSpotId: g.task.from, targetSpotId: g.task.target,
      reward: g.task.reward, minutesLeft: g.task.deadline - absMinute(g),
    } : null,
    goal: goal(g),
    rivals: RIVALS.map(r => {
      const { shops: n, value } = values.get(r.id) ?? { shops: 0, value: 0 };
      return { id: r.id, name: r.name, color: r.color, shops: n, value, takeoverCost: takeoverCostForValue(value), acquired: !!g.rivals[r.id]?.acquired };
    }),
    regions: REGIONS.map(r => {
      const share = g.regions[r.id] ?? 0;
      return { id: r.id, name: r.name, share, conquered: share >= CONQUER_SHARE - 1e-9, incomePerDay: Math.round(r.size * share * REGION_YIELD), investCost: regionInvestCost(g, r.id) };
    }),
    events: g.events.map(e => {
      const def = EVENTS.find(d => d.id === e.id)!;
      return { id: e.id, name: def.name, desc: def.desc, daysLeft: e.daysLeft, district: e.district };
    }),
    lastReport: g.lastReport,
    presence: extra.presence,
    incorporated: g.incorporated,
    listed: g.listed,
    won: g.won,
    speed: extra.speed,
  };
}
