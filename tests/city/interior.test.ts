import { describe, expect, it } from 'vitest';
import { BIZ, type BizKind } from '../../src/city/defs';
import { INTERIORS, PLAYER_R, nearCounter, nearDoor, resolveInterior } from '../../src/city/interior';
import { SHOP, canBuy, itemPrice } from '../../src/city/shop';
import { World, type Actor } from '../../src/city/world';

const make = (seed = 5): World => new World({ seed, difficulty: 'd4', klass: 'warlord', tutorial: true });
const KINDS = Object.keys(BIZ) as BizKind[];
/** 보스를 사업체 패드에 세우고 안으로 들어간 뒤 카운터 앞에 세웁니다. */
function enter(w: World, kind: BizKind): ReturnType<World['insideBiz']> & object {
  const z = w.businesses.find(q => q.kind === kind && q.owner < 0)!, b = w.boss(0)!; b.x = z.x; b.y = z.y;
  expect(w.interact(0)).toBe('enter'); const lay = INTERIORS[kind]; w.inside!.x = lay.counterSpot.x; w.inside!.y = lay.counterSpot.y; return z;
}
const run = (w: World, s: number): void => { for (let i = 0; i < s * 30 && !w.over; i++) { w.step(1 / 30); w.events.length = 0; } };

describe('주유소 제거', () => {
  it('사업체 종류에 주유소가 없고 도시에도 생기지 않습니다', () => {
    expect(KINDS).not.toContain('gas' as BizKind);
    for (const seed of [1, 5, 9]) expect(make(seed).businesses.every(z => (BIZ as Record<string, unknown>)[z.kind])).toBe(true);
  });
});

describe('사업체 내부 배치', () => {
  it('모든 업종에서 출입문·카운터 앞에 설 수 있고 서로 이어져 있습니다', () => {
    for (const kind of KINDS) {
      const lay = INTERIORS[kind];
      for (const spot of [lay.spawn, lay.door, lay.counterSpot]) { const p = { x: spot.x, y: spot.y }; resolveInterior(lay, p); expect(Math.hypot(p.x - spot.x, p.y - spot.y), `${kind} 위치가 가구와 겹침`).toBeLessThan(1); }
      expect(nearDoor(lay, lay.spawn.x, lay.spawn.y + 30) || nearDoor(lay, lay.door.x, lay.door.y)).toBe(true); expect(nearCounter(lay, lay.counterSpot.x, lay.counterSpot.y)).toBe(true);
      // 출입문에서 카운터까지 걸어서 도달 가능한지(격자 탐색)
      const G = 8, key = (x: number, y: number): string => `${x},${y}`, seen = new Set<string>([key(Math.round(lay.door.x / G), Math.round(lay.door.y / G))]), q = [[Math.round(lay.door.x / G), Math.round(lay.door.y / G)]];
      let reached = false;
      while (q.length && !reached) {
        const [gx, gy] = q.pop()!; if (nearCounter(lay, gx * G, gy * G)) reached = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = gx + dx, ny = gy + dy, p = { x: nx * G, y: ny * G }; resolveInterior(lay, p); if (Math.hypot(p.x - nx * G, p.y - ny * G) > 0.5 || nx < 0 || ny < 0 || seen.has(key(nx, ny))) continue; seen.add(key(nx, ny)); q.push([nx, ny]); }
      }
      expect(reached, `${kind} 카운터에 닿을 수 없음`).toBe(true);
    }
  });
  it('벽과 가구를 뚫고 나가지 못합니다', () => {
    const lay = INTERIORS.store, p = { x: -50, y: -50 }; resolveInterior(lay, p); expect(p.x).toBeGreaterThanOrEqual(PLAYER_R); expect(p.y).toBeGreaterThanOrEqual(PLAYER_R);
    const c = lay.solids.find(s => s.style === 'counter')!, q = { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 }; resolveInterior(lay, q); expect(q.x < c.x0 || q.x > c.x1 || q.y < c.y0 || q.y > c.y1).toBe(true);
  });
});

describe('건물 입장과 구매', () => {
  it('패드에서 E 를 누르면 안으로 들어가고, 안에서는 표적이 되지 않으며 문으로 나옵니다', () => {
    const w = make(), z = enter(w, 'store'), b = w.boss(0)!; expect(w.insideBiz()).toBe(z); expect(w.hidden(b)).toBe(true);
    const hp = b.hp; w.hurtActor(b, 50, 1); expect(b.hp).toBe(hp);
    const lay = w.insideLayout()!; w.inside!.x = lay.door.x; w.inside!.y = lay.door.y; expect(w.interactInside(0)).toBe('exit'); expect(w.inside).toBeNull();
    expect(Math.hypot(b.x - z.x, b.y - z.y)).toBeLessThan(40); w.hurtActor(b, 50, 1); expect(b.hp).toBeLessThan(hp);
  });
  it('이동 입력으로 안에서 걸을 수 있고 보스는 도시에서 움직이지 않습니다', () => {
    const w = make(), b = w.boss(0)!; enter(w, 'club'); const bx = b.x, by = b.y, s0 = { ...w.inside! }; w.input.mx = 1; w.input.my = 0; w.input.ax = s0.x + 100; w.input.ay = s0.y; run(w, 0.5);
    expect(w.inside!.x).toBeGreaterThan(s0.x - 1); expect(b.x).toBe(bx); expect(b.y).toBe(by); w.input.mx = 0;
  });
  it('카운터 앞이 아니면 거래할 수 없습니다', () => {
    const w = make(); enter(w, 'store'); const lay = w.insideLayout()!; w.inside!.x = lay.door.x; w.inside!.y = lay.door.y;
    expect(w.buyHere(0)).toContain('카운터'); expect(w.shop(0, 'medkit').ok).toBe(false);
  });
  it('카운터에서 사업체를 사고 올리면 돈이 줄고 소유가 바뀝니다', () => {
    const w = make(), z = enter(w, 'store'), f = w.factions[0]; f.cash = 5000; const price = w.bizPrice(f, z);
    expect(w.buyHere(0)).toBe(''); expect(z.owner).toBe(0); expect(f.cash).toBe(5000 - price);
    expect(w.buyHere(0)).toBe(''); expect(z.level).toBe(2); f.cash = 0; expect(w.buyHere(0)).toContain('부족');
  });
  it('적 사업체에는 들어갈 수 없습니다', () => {
    const w = make(), z = w.businesses.find(q => q.kind === 'store')!, b = w.boss(0)!; z.owner = 2; b.x = z.x; b.y = z.y; expect(w.interact(0)).toContain('적 사업체'); expect(w.inside).toBeNull();
  });
  it('업종별 상품: 편의점 키트·탄약·음료', () => {
    const w = make(), f = w.factions[0], b = w.boss(0)!; enter(w, 'store'); f.cash = 1000; const kits = f.medkits;
    expect(w.shop(0, 'medkit').ok).toBe(true); expect(f.medkits).toBe(kits + 1); expect(f.cash).toBe(880);
    b.hp = b.maxHp - 60; expect(w.shop(0, 'energy').ok).toBe(true); expect(b.hp).toBe(b.maxHp - 25); expect(w.shop(0, 'ammo').ok).toBe(false);
    f.medkits = 5; expect(w.shop(0, 'medkit').ok).toBe(false); f.cash = 10; b.hp = 1; expect(w.shop(0, 'energy').ok).toBe(false);
  });
  it('무기상: 무기와 방탄복', () => {
    const w = make(), f = w.factions[0]; enter(w, 'gunshop'); f.cash = 3000; expect(w.shop(0, 'gun:rifle').ok).toBe(true); expect(f.slots.some(s => s.id === 'rifle')).toBe(true); expect(f.cash).toBe(2000);
    expect(w.shop(0, 'armor').ok).toBe(true); expect(f.armor).toBe(100); expect(w.shop(0, 'armor').ok).toBe(false); expect(w.shop(0, 'item')).toEqual({ ok: false, msg: '살 수 없는 물건입니다' });
  });
  it('클럽: 용병 고용과 샴페인', () => {
    const w = make(), f = w.factions[0]; enter(w, 'club'); f.cash = 1000; expect(w.shop(0, 'mercs').ok).toBe(true); expect(w.actors.filter(a => a.alive && a.f === 0 && a.kind === 'merc')).toHaveLength(3);
    expect(w.shop(0, 'champagne').ok).toBe(true); expect(f.buffT).toBe(8); expect(f.cash).toBe(1000 - 350 - 200);
  });
  it('정제 공장·은행: 크리스탈 거래, 카지노: 베팅', () => {
    const w = make(), f = w.factions[0]; enter(w, 'plant'); f.cash = 5000; const c = f.crystal; expect(w.shop(0, 'crystal:50').ok).toBe(true); expect(f.crystal).toBe(c + 50);
    w.exitBiz(0); enter(w, 'bank'); f.crystal = 120; expect(w.shop(0, 'sell:all').ok).toBe(true); expect(f.crystal).toBe(0); expect(w.shop(0, 'sell:all').ok).toBe(false);
    w.exitBiz(0); enter(w, 'casino'); f.cash = 1000; let wins = 0, loss = 0; for (let k = 0; k < 20; k++) { const before = f.cash, r = w.shop(0, 'bet:100'); expect(r.ok).toBe(true); if (f.cash > before) wins++; else loss++; }
    expect(wins).toBeGreaterThan(0); expect(loss).toBeGreaterThan(0); w.shop(0, 'bet:1000'); f.cash = 50; expect(w.shop(0, 'bet:100').ok).toBe(false);
  });
  it('모든 상품은 가격이 있고 canBuy 가 자금에 반응합니다', () => {
    const w = make(); enter(w, 'store'); const f = w.factions[0];
    for (const kind of KINDS) for (const it of SHOP[kind]) { expect(it.name.length).toBeGreaterThan(0); expect(itemPrice(w, it)).toBeGreaterThanOrEqual(0); }
    f.cash = 0; expect(canBuy(w, 0, SHOP.store[0])).toBe(false); f.cash = 999; expect(canBuy(w, 0, SHOP.store[0])).toBe(true);
  });
  it('안에 있는 동안 보스가 쓰러지지 않고, 죽으면 내부 상태가 풀립니다', () => {
    const w = make(), b = w.boss(0)!; enter(w, 'bank'); run(w, 20); expect(b.alive).toBe(true); w.killActor(b, 1); expect(w.inside).toBeNull();
  });
});

describe('경비병', () => {
  it('업그레이드한 사업체의 경비병은 본부에서 나와 걸어서 도착합니다', () => {
    const w = make(11), z = w.businesses.filter(q => q.kind === 'store').sort((a, c) => { const h = w.hq(1)!; return Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(c.x - h.x, c.y - h.y); })[0], hq = w.hq(1)!;
    z.owner = 1; z.level = 2; z.guardT = 0; w.factions[1].cash = 0;
    let guard: Actor | undefined; for (let i = 0; i < 30 * 4 && !guard; i++) { w.step(1 / 30); w.events.length = 0; guard = w.actors.find(a => a.alive && a.kind === 'guard' && a.home === z.id); }
    expect(guard, '경비병이 생성되지 않음').toBeTruthy(); const g = guard!;
    expect(g.x).toBeGreaterThan(hq.x - 40); expect(g.x).toBeLessThan(hq.x + hq.w + 40); expect(g.y).toBeGreaterThan(hq.y); expect(g.y).toBeLessThan(hq.y + hq.h + 60);
    const d0 = Math.hypot(g.x - z.x, g.y - z.y); expect(d0).toBeGreaterThan(150);
    let moved = 0; for (let i = 0; i < 30 * 8; i++) { w.step(1 / 30); w.events.length = 0; moved = Math.max(moved, d0 - Math.hypot(g.x - z.x, g.y - z.y)); } expect(moved, '걸어가지 않음').toBeGreaterThan(80);
    for (let i = 0; i < 30 * 160 && g.alive && Math.hypot(g.order.x - g.x, g.order.y - g.y) > 60; i++) { w.step(1 / 30); w.events.length = 0; }
    if (g.alive) expect(Math.hypot(g.x - z.x, g.y - z.y)).toBeLessThan(140);
  }, 60000);
  it('본부가 없으면 경비병을 보내지 못합니다', () => {
    const w = make(11), z = w.businesses.find(q => q.kind === 'store')!, hq = w.hq(1)!; z.owner = 1; z.level = 3; z.guardT = 0; hq.alive = false; w.factions[1].hq = -1;
    run(w, 6); expect(w.actors.some(a => a.kind === 'guard' && a.home === z.id)).toBe(false);
  });
});
