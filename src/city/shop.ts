// LAST CITY — 사업체 내부 상점 품목과 구매 규칙. DOM 비의존.
import { WEAPONS, type BizKind, type WeaponId } from './defs';
import type { Business, World } from './world';

export interface ShopItem { id: string; name: string; desc: string; price: number; icon: string }
export interface ShopResult { ok: boolean; msg: string }

const MAX_MEDKITS = 5;
const BETS = [100, 500, 1000] as const;
export const WIN_CHANCE = 0.46;

const GUN_IDS: WeaponId[] = ['smg', 'shotgun', 'rifle', 'sniper', 'rocket'];
const wpn = (id: WeaponId): ShopItem => { const d = WEAPONS[id]; return { id: `gun:${id}`, name: d.name, desc: `피해 ${d.dmg}${d.pellets > 1 ? '×' + d.pellets : ''} · 연사 ${d.rate}/s · 사거리 ${d.range}`, price: d.price, icon: '🔫' }; };

/** 사업체 종류별로 파는 물건. 매입·업그레이드는 별도(buyBiz/upgradeBiz)입니다. */
export const SHOP: Record<BizKind, ShopItem[]> = {
  store: [
    { id: 'medkit', name: '구급 키트', desc: `체력 +70 (H) · 최대 ${MAX_MEDKITS}개`, price: 120, icon: '🩹' },
    { id: 'ammo', name: '탄약 세트', desc: '들고 있는 모든 무기의 탄약을 가득 채움', price: 90, icon: '📦' },
    { id: 'energy', name: '에너지 드링크', desc: '체력 +35 즉시 회복', price: 50, icon: '🥤' },
  ],
  club: [
    { id: 'mercs', name: '경호 용병 3명', desc: '인구를 차지하지 않는 현금 병력 (최대 9명)', price: 350, icon: '🕶️' },
    { id: 'champagne', name: 'VIP 샴페인', desc: '8초간 보스와 주변 부하의 연사 속도 +60%', price: 200, icon: '🍾' },
  ],
  plant: [
    { id: 'crystal:50', name: '정제 크리스탈 50개', desc: '현재 시세 +8% 에 즉시 구매', price: 0, icon: '◆' },
    { id: 'crystal:200', name: '정제 크리스탈 200개', desc: '대량 구매는 시세를 올립니다', price: 0, icon: '◆' },
  ],
  casino: BETS.map(b => ({ id: `bet:${b}`, name: `룰렛 · $${b} 베팅`, desc: `${Math.round(WIN_CHANCE * 100)}% 확률로 판돈의 두 배, 아니면 잃습니다`, price: b, icon: '🎰' })),
  bank: [
    { id: 'sell:50', name: '크리스탈 50개 환전', desc: '현재 시세 −8% 로 현금화', price: 0, icon: '💱' },
    { id: 'sell:all', name: '크리스탈 전량 환전', desc: '가진 크리스탈을 모두 현금으로', price: 0, icon: '💱' },
  ],
  gunshop: [
    ...GUN_IDS.map(wpn),
    { id: 'armor', name: '방탄복', desc: '방어도 100 (피해 60% 흡수)', price: 300, icon: '🦺' },
    { id: 'medkit', name: '회복 키트', desc: '체력 +70 (H)', price: 150, icon: '🩹' },
  ],
};

/** 화면에 보여줄 가격(시세에 따라 바뀌는 크리스탈 품목 포함). */
export function itemPrice(w: World, item: ShopItem): number {
  if (item.id.startsWith('crystal:')) return Math.ceil(Number(item.id.slice(8)) * w.price * 1.08);
  return item.price;
}
/** 카운터 앞에서 지금 이 물건을 살 수 있는지(자금·상태 포함). */
export function canBuy(w: World, fi: number, item: ShopItem): boolean {
  const f = w.factions[fi], b = w.boss(fi); if (!f || !b) return false;
  if (item.id.startsWith('sell:')) return f.crystal >= 1;
  if (item.id === 'medkit') return f.medkits < MAX_MEDKITS && f.cash >= item.price;
  if (item.id === 'energy') return b.hp < b.maxHp && f.cash >= item.price;
  return f.cash >= itemPrice(w, item);
}

/** 아이템 구매. 성공 시 ok=true 와 알림 문구를 돌려줍니다. */
export function purchase(w: World, fi: number, biz: Business, id: string): ShopResult {
  const f = w.factions[fi], b = w.boss(fi), item = SHOP[biz.kind].find(s => s.id === id);
  if (!f || !b || !item) return { ok: false, msg: '살 수 없는 물건입니다' };
  const fail = (msg: string): ShopResult => ({ ok: false, msg }), done = (msg: string): ShopResult => ({ ok: true, msg });
  const price = itemPrice(w, item);
  if (id.startsWith('sell:')) {
    const n = id === 'sell:all' ? Math.floor(f.crystal) : 50; const e = w.market(fi, true, n); return e ? fail(e) : done(`크리스탈 ${n}개 환전`);
  }
  if (id.startsWith('crystal:')) { const n = Number(id.slice(8)), e = w.market(fi, false, n); return e ? fail(e) : done(`크리스탈 ${n}개 구매`); }
  if (id.startsWith('bet:')) {
    if (f.cash < price) return fail('자금이 부족합니다');
    const win = w.rng() < WIN_CHANCE; f.cash += win ? price : -price; w.fx('cash', biz.x, biz.y, win ? price : -price, undefined, fi);
    return win ? done(`룰렛 적중! +$${price}`) : done(`룰렛 꽝… -$${price}`);
  }
  if (f.cash < price) return fail('자금이 부족합니다');
  if (id === 'medkit') { if (f.medkits >= MAX_MEDKITS) return fail(`키트는 최대 ${MAX_MEDKITS}개입니다`); f.cash -= price; f.medkits++; return done('구급 키트 구매'); }
  if (id === 'energy') { if (b.hp >= b.maxHp) return fail('이미 체력이 가득합니다'); f.cash -= price; b.hp = Math.min(b.maxHp, b.hp + 35); w.fx('heal', b.x, b.y); return done('체력 회복'); }
  if (id === 'ammo') {
    let changed = false;
    for (const s of f.slots) { const d = WEAPONS[s.id]; if (d.ammo > 0 ? s.ammo < d.ammo : s.mag < d.mag) { changed = true; s.ammo = d.ammo > 0 ? d.ammo : s.ammo; s.mag = d.ammo > 0 ? Math.min(d.mag, s.ammo) : d.mag; } }
    if (!changed) return fail('탄약이 이미 가득합니다'); f.cash -= price; return done('탄약 보충 완료');
  }
  if (id === 'mercs') { const e = w.hireMercs(fi); return e ? fail(e) : done('용병 3명 고용'); }
  if (id === 'champagne') { f.cash -= price; f.buffT = 8; w.fx('roar', b.x, b.y, 0, undefined, fi); return done('건배! 8초간 연사 속도 +60%'); }
  if (id === 'armor') { if (f.armor >= 100) return fail('방탄복이 이미 가득합니다'); f.cash -= price; f.armor = 100; return done('방탄복 착용'); }
  if (id.startsWith('gun:')) { const wid = id.slice(4) as WeaponId; if (!WEAPONS[wid]) return fail('살 수 없는 물건입니다'); f.cash -= price; w.giveWeapon(f, wid); return done(`${WEAPONS[wid].name} 구매`); }
  return fail('살 수 없는 물건입니다');
}
