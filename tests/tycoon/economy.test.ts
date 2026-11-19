import { describe, expect, it } from 'vitest';
import { createCore, REGIONS } from '../../src/tycoon/core';
import type { LotView, TycoonCore } from '../../src/tycoon/core';
import { runBot } from '../../src/tycoon/core/bot';

function finish(core: TycoonCore): void {
  for (let i = 0; i < 400 && core.state.activity; i++) core.tick(0.1);
}
function act(core: TycoonCore, spot: string, action: string): void {
  core.setPresence(spot);
  const r = core.perform(spot, action);
  expect(r.ok, r.message).toBe(true);
  finish(core);
}
function shopCore(cash = 5000) {
  const core = createCore({ seed: 11 });
  core.data.stage = 'parttime';
  core.data.cash = cash;
  core.data.minute = 11 * 60;
  return core;
}
const lot = (core: TycoonCore, id: string) => core.spot(id) as LotView;
/** 게임 분 단위로 시간을 흘린다(1분 = 1/6초) */
const minutes = (core: TycoonCore, n: number) => { for (let i = 0; i < n; i++) core.tick(1 / 6); };

describe('타이쿤 경제: 가게', () => {
  it('부지를 사서 포장마차를 열면 작은 가게 사장이 된다', () => {
    const core = shopCore();
    act(core, 'lot_s1', 'build_stall');
    const l = lot(core, 'lot_s1');
    expect(l.owner).toBe('player');
    expect(l.shop?.kind).toBe('stall');
    expect(core.state.stage).toBe('smallshop');
    expect(core.state.cash).toBeGreaterThanOrEqual(5000 - 200 - 300);
    expect(core.state.cash).toBeLessThan(5000 - 200 - 300 + 30);
  });

  it('사장도 점원도 없으면 문을 닫고, 사장이 서 있으면 직접 판다', () => {
    const core = shopCore();
    act(core, 'lot_m1', 'build_stall');
    core.data.lots.lot_m1.shop!.stock = 999;
    core.setPresence(null);
    const before = core.data.cash;
    minutes(core, 60);
    expect(core.data.cash).toBeCloseTo(before, 5);
    expect(lot(core, 'lot_m1').shop!.serving).toBe(false);
    core.setPresence('lot_m1');
    minutes(core, 60);
    expect(core.data.cash).toBeGreaterThan(before + 20);
    expect(lot(core, 'lot_m1').shop!.serving).toBe(true);
  });

  it('점원을 두면 사장이 없어도 팔고, 자정에 일당이 나간다', () => {
    const core = shopCore();
    act(core, 'lot_m1', 'build_stall');
    act(core, 'lot_m1', 'hire_clerk');
    core.setPresence(null);
    const before = core.data.cash;
    minutes(core, 120);
    expect(core.data.cash).toBeGreaterThan(before);
    minutes(core, 24 * 60 - core.data.minute + 1);
    expect(core.state.lastReport!.wages).toBe(50);
  });

  it('재고가 떨어지면 못 팔고, 도매시장에서 사 온 재료로 채운다', () => {
    const core = shopCore();
    act(core, 'lot_m1', 'build_stall');
    core.data.lots.lot_m1.shop!.stock = 0;
    core.setPresence('lot_m1');
    const before = core.data.cash;
    minutes(core, 30);
    expect(core.data.cash).toBeCloseTo(before, 5);
    expect(core.actionsAt('lot_m1').find(a => a.id === 'restock')!.enabled).toBe(false);
    act(core, 'wholesale', 'buy_stall');
    expect(core.state.cargo).toEqual({ kind: 'stall', units: 60 });
    act(core, 'lot_m1', 'restock');
    expect(lot(core, 'lot_m1').shop!.stock).toBeGreaterThan(55);
    expect(core.state.cargo).toBeNull();
  });

  it('가격을 올리면 손님은 줄고 손님 1명당 매출은 커진다', () => {
    const run = (ups: number) => {
      const core = shopCore();
      act(core, 'lot_m1', 'build_stall');
      for (let i = 0; i < ups; i++) act(core, 'lot_m1', 'price_up');
      core.data.lots.lot_m1.shop!.stock = 999;
      minutes(core, 120);
      const t = core.data.lots.lot_m1.shop!.today;
      return { customers: t.customers + t.lost, perHead: t.revenue / t.customers };
    };
    const cheap = run(0), pricey = run(5);
    expect(pricey.customers).toBeLessThan(cheap.customers);
    expect(pricey.perHead).toBeGreaterThan(cheap.perHead * 1.4);
  });

  it('같은 구역 같은 업종 라이벌이 있으면 손님이 준다', () => {
    const run = (rival: boolean) => {
      const core = shopCore();
      if (!rival) core.data.lots.lot_m2 = { owner: 'none' };
      act(core, 'lot_m1', 'build_stall');
      core.data.lots.lot_m1.shop!.stock = 999;
      minutes(core, 120);
      const t = core.data.lots.lot_m1.shop!.today;
      return t.customers + t.lost;
    };
    expect(run(true)).toBeLessThan(run(false) * 0.8);
  });

  it('카페를 3레벨까지 넓히면 큰 가게 사장이 되고 매니저를 쓸 수 있다', () => {
    const core = shopCore(50000);
    core.data.stage = 'smallshop';
    act(core, 'lot_m3', 'build_cafe');
    expect(core.actionsAt('lot_m3').find(a => a.id === 'hire_manager')!.enabled).toBe(false);
    act(core, 'lot_m3', 'expand');
    act(core, 'lot_m3', 'expand');
    expect(lot(core, 'lot_m3').shop!.level).toBe(3);
    expect(core.state.stage).toBe('bigshop');
    expect(core.actionsAt('lot_m3').find(a => a.id === 'expand')).toBeUndefined();
    act(core, 'lot_m3', 'hire_manager');
    // 매니저는 재고가 떨어지면 알아서 발주한다
    core.data.lots.lot_m3.shop!.stock = 0;
    core.setPresence(null);
    minutes(core, 2);
    expect(core.data.lots.lot_m3.shop!.stock).toBeGreaterThan(100);
  });

  it('가게를 팔면 투자금의 70%를 돌려받는다', () => {
    const core = shopCore();
    act(core, 'lot_s1', 'build_stall');
    const cash = core.data.cash;
    act(core, 'lot_s1', 'sell');
    expect(core.data.cash).toBe(cash + 350);
    expect(lot(core, 'lot_s1').owner).toBe('none');
  });

  it('잔고가 마이너스가 되면 빚으로 넘어가고 게임은 계속된다', () => {
    const core = shopCore(0);
    core.data.cash = -500;
    minutes(core, 24 * 60);
    expect(core.data.cash).toBeGreaterThanOrEqual(0);
    expect(core.state.debt).toBeGreaterThanOrEqual(500);
  });

  it('은행 대출은 한도 안에서만 되고 이자가 붙는다', () => {
    const core = shopCore(1000);
    core.data.stage = 'smallshop';
    const loans = core.actionsAt('bank');
    expect(loans.find(a => a.id === 'loan_500')!.enabled).toBe(true);
    expect(loans.find(a => a.id === 'loan_50000')?.enabled ?? false).toBe(false);
    act(core, 'bank', 'loan_500');
    expect(core.state.debt).toBe(500);
    minutes(core, 24 * 60);
    expect(core.state.lastReport!.interest).toBe(8);
    act(core, 'bank', 'repay');
    expect(core.state.debt).toBe(0);
  });
});

describe('타이쿤 경제: 사업 → 대기업 → 세계', () => {
  it('가게 3곳이 있어야 법인을 세울 수 있다', () => {
    const core = shopCore(100000);
    core.data.stage = 'bigshop';
    expect(core.actionsAt('office')[0].enabled).toBe(false);
    act(core, 'lot_s1', 'build_stall');
    act(core, 'lot_s2', 'build_stall');
    act(core, 'lot_m1', 'build_stall');
    act(core, 'office', 'incorporate');
    expect(core.state.stage).toBe('business');
    expect(core.state.incorporated).toBe(true);
  });

  it('상장하면 대기업, 해외 진출하면 세계 단계, 여섯 대륙 정복이면 승리', () => {
    const core = createCore({ seed: 12 });
    core.data.stage = 'business';
    core.data.incorporated = true;
    core.data.cash = 1e8;
    const wins: string[] = [];
    core.onEvent(e => { if (e.type === 'win') wins.push(e.text); });
    const lots = ['lot_s1', 'lot_s2', 'lot_m1', 'lot_m3', 'lot_d3', 'lot_h3', 'lot_u1', 'lot_s3'];
    for (const id of lots) act(core, id, id === 'lot_d3' ? 'build_mart' : 'build_cafe');
    act(core, 'office', 'ipo');
    expect(core.state.stage).toBe('corp');
    expect(core.actionsAt('airport').every(a => a.enabled)).toBe(true);
    act(core, 'airport', 'invest_asia');
    expect(core.state.stage).toBe('world');
    for (const r of REGIONS) while (!core.state.regions.find(x => x.id === r.id)!.conquered) act(core, 'airport', `invest_${r.id}`);
    expect(core.state.won).toBe(true);
    expect(wins).toHaveLength(1);
  });

  it('대기업은 라이벌 회사를 통째로 인수하고, 그 라이벌은 더 이상 확장하지 않는다', () => {
    const core = createCore({ seed: 13 });
    Object.assign(core.data, { stage: 'corp', incorporated: true, listed: true, cash: 1e7 });
    act(core, 'office', 'takeover_daebak');
    expect(lot(core, 'lot_m2').owner).toBe('player');
    expect(lot(core, 'lot_d2').owner).toBe('player');
    expect(core.state.rivals.find(r => r.id === 'daebak')!.acquired).toBe(true);
    for (let d = 0; d < 20; d++) minutes(core, 1440);
    expect(core.spots().some(s => s.kind === 'lot' && (s as LotView).rival?.rivalId === 'daebak')).toBe(false);
  });
});

describe('타이쿤 밸런스(봇)', () => {
  it('걸어 다니는 봇이 2일 안에 첫 가게, 70일 안에 세계 정복에 닿는다', () => {
    const core = createCore({ seed: 2024 });
    const r = runBot(core, { walkSec: 8, maxDays: 70, until: 'win' });
    expect(r.reached.smallshop).toBeLessThan(3);
    expect(r.reached.bigshop).toBeLessThan(15);
    expect(r.reached.business).toBeLessThan(22);
    expect(r.reached.corp).toBeLessThan(40);
    expect(r.reached.win).toBeLessThan(70);
    // 각 단계는 앞 단계보다 뒤에 온다
    const order = ['parttime', 'smallshop', 'bigshop', 'business', 'corp', 'world', 'win'] as const;
    for (let i = 1; i < order.length; i++) expect(r.reached[order[i]]!).toBeGreaterThanOrEqual(r.reached[order[i - 1]]!);
  }, 60000);
});
