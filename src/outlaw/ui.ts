// OUTLAW CITY — 주인공 선택·휴대폰·자동차 매장·카지노 화면. HTML 문자열을 만들고 버튼 동작을 시뮬레이션에 연결합니다.
import type { Sim } from './sim';
import { OUTFITS, ACHIEVEMENTS, CAR_SHOP, HEROES, PROPERTIES, heroById } from './life';
import { VEHICLES } from './types';
import { JOB_LIST, cancelJob, jobBlock, startJob } from './jobs';
import { bribe, setOutfit, buyCar, buyProperty, callCar, collectProperties, vehicleName } from './services';
import { Blackjack, HILO_STEP, SLOT_SYMBOLS, cardLabel, coinFlip, handValue, hiloDeal, hiloGuess, hiloValue, rouletteColor, rouletteSpin, slotSpin, type HiLo, type RouletteBet } from './casino';
import { MISSION_LIST } from './missions';

const CLOTH = [0x616b78, 0x8a7066, 0x585e57, 0x857b69, 0x595569, 0x6b7b7b, 0x805d60, 0x414651];
const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');
const money = (n: number): string => '$' + Math.floor(n).toLocaleString('en-US');
const esc = (s: string): string => s.replace(/[&<>]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;');

export interface Outcome { toast?: string; kind?: string; begin?: boolean; close?: boolean; sound?: string }
export type PhoneTab = 'jobs' | 'garage' | 'estate' | 'me' | 'medals';
const TABS: Array<[PhoneTab, string]> = [['jobs', '일거리'], ['garage', '차고'], ['estate', '부동산'], ['me', '내 정보'], ['medals', '업적']];
const BETS = [10, 50, 100, 500, 1000, 5000];
const CASINO_TABS = ['slots', 'bj', 'roulette', 'coin', 'hilo'] as const;
const ROULETTE_TYPES = ['red', 'black', 'odd', 'even', 'low', 'high', 'number'] as const;
const phoneTab = (id: string): id is PhoneTab => TABS.some(([tab]) => tab === id);
const casinoTab = (id: string): id is typeof CASINO_TABS[number] => CASINO_TABS.some(tab => tab === id);
const rouletteType = (id: string): id is RouletteBet['type'] => ROULETTE_TYPES.some(type => type === id);

export class OutlawUi {
  tab: PhoneTab = 'jobs'; casinoTab: 'slots' | 'bj' | 'roulette' | 'coin' | 'hilo' = 'slots'; hilo: HiLo | null = null; bet = 50; bj: Blackjack | null = null; bjSettled = false; note = '';
  reels: string[] = ['7', '7', '7']; rbet: RouletteBet['type'] = 'red'; rnum = 7; heroSel = 'h0';
  constructor(private getSim: () => Sim | null) {}
  private get sim(): Sim { return this.getSim()!; }

  render(kind: string): string {
    if (kind === 'hero') return this.hero(); if (kind === 'phone') return this.phone(); if (kind === 'dealer') return this.dealer(); if (kind === 'casino') return this.casino();
    return '';
  }

  // ---------- 주인공 선택 ----------
  private hero(): string {
    const cards = HEROES.map(h => `<button class="hero-card${h.id === this.heroSel ? ' sel' : ''}" data-ui="hero" data-id="${h.id}" type="button">
      <i class="sw" style="background:${hex(CLOTH[h.variant]!)}">${esc(h.name.slice(-2, -1) || h.name[0]!)}</i><b>${esc(h.name)}</b><em>${esc(h.job)}</em><span>${esc(h.perkText)}</span></button>`).join('');
    const sel = heroById(this.heroSel);
    return `<h2>누구로 시작할까?</h2><p class="sub">이 도시에 사는 평범한 시민 중 한 명이 주인공이 됩니다.</p><div class="hero-grid">${cards}</div>
      <p class="hero-bio"><b>${esc(sel.name)}</b> · ${esc(sel.job)} — ${esc(sel.bio)}</p>
      <div class="ol-btns"><button data-ui="start" type="button">이 사람으로 시작</button><button data-k="resume" type="button" class="ghost">뒤로</button></div>`;
  }

  // ---------- 휴대폰 ----------
  private phone(): string {
    const s = this.sim, tabs = TABS.map(([id, name]) => `<button class="tab${id === this.tab ? ' on' : ''}" data-ui="tab" data-id="${id}" type="button">${name}</button>`).join('');
    return `<div class="phone-head"><h2>📱 휴대폰</h2><b class="cash">${money(s.cash)}</b></div><div class="tabs">${tabs}</div><div class="phone-body">${this[this.tab](s)}</div>
      <div class="ol-btns"><button data-k="resume" type="button">닫기 (P)</button></div>`;
  }
  private jobs(s: Sim): string {
    let h = ''; if (s.job.active) h += `<div class="notice">진행 중 · <b>${esc(s.job.title)}</b><br><small>${esc(s.job.text)}</small><button data-ui="cancel" type="button" class="danger">포기</button></div>`;
    for (const j of JOB_LIST) {
      const why = jobBlock(s, j.id), off = !!why && j.id !== 'fight'; const fight = j.id === 'fight' && !!why;
      h += `<div class="row2"><div><b>${esc(j.name)}</b><small>${esc(j.giver)} · ${esc(j.pay)}</small><p>${esc(j.desc)}</p>${why ? `<em>${esc(fight ? '격투장 앞에서 휴대폰으로 시작' : why)}</em>` : ''}</div>
        <button data-ui="job" data-id="${j.id}" type="button"${off || fight ? ' disabled' : ''}>시작</button></div>`;
    }
    return h;
  }
  private garage(s: Sim): string {
    const cars = s.life.cars; if (!cars.length) return '<p class="empty">보유한 차량이 없습니다. 자동차 매장 PRESTIGE MOTORS 에서 구입하면 이곳에 등록되고, 언제든 호출할 수 있습니다.</p>';
    return cars.map((c, i) => `<div class="row2"><div><b>${esc(VEHICLES[c.kind].name)}</b><small>최고 ${Math.round(VEHICLES[c.kind].top * 3.6)} km/h</small><span class="chip" style="background:${hex(c.color)}"></span></div>
      <button data-ui="call" data-id="${i}" type="button">호출 ${money(s.price(150))}</button></div>`).join('') + '<p class="empty">호출하면 근처 도로로 대리 기사가 차를 가져옵니다. 수배 중에는 올 수 없습니다.</p>';
  }
  private estate(s: Sim): string {
    const l = s.life, rate = l.props.length ? Math.round(l.props.reduce((a, id) => a + (PROPERTIES.find(p => p.id === id)?.income ?? 0), 0) * s.perk.biz) : 0;
    let h = `<div class="notice">쌓인 수입 <b>${money(l.propBank)}</b> · 분당 ${money(rate)}<button data-ui="collect" type="button">수금</button></div>`;
    for (const p of PROPERTIES) { const own = l.props.includes(p.id); h += `<div class="row2"><div><b>${esc(p.name)}</b><small>${money(p.price)} · 분당 ${money(p.income * s.perk.biz)}</small><p>${esc(p.desc)}</p></div>${own ? '<em class="own">소유 중</em>' : `<button data-ui="buyprop" data-id="${p.id}" type="button">인수</button>`}</div>`; }
    return h;
  }
  private me(s: Sim): string {
    const h = heroById(s.life.hero), c = s.life.counters;
    const st: Array<[string, string]> = [['보유 현금', money(s.cash)], ['쓰러뜨린 수', String(s.kills)], ['완료한 의뢰', `${s.mission.completed.length}/${MISSION_LIST.length}`], ['스턴트 점프', `${s.activity.stunts.length}/12`],
      ['숨겨진 꾸러미', `${s.collected.size}/30`], ['스타일 누적', money(s.activity.style.total)], ['택시 손님', String(c.taxi ?? 0)], ['배달', String(c.courier ?? 0)], ['응급 이송', String(c.paramedic ?? 0)], ['자경단', String(c.vigilante ?? 0)],
      ['현상 의뢰', String(c.contracts ?? 0)], ['격투 승리', String(c.fights ?? 0)], ['소매치기', String(c.pickpocket ?? 0)], ['카지노 총 판돈', money(c.wagered ?? 0)], ['플레이 시간', `${Math.floor(s.playSec / 60)}분`]];
    const fee = s.price(900 * Math.max(1, s.wanted.stars));
    return `<div class="herobox"><i class="sw" style="background:${hex(CLOTH[h.variant]!)}">${esc(h.name.slice(-2, -1))}</i><div><b>${esc(h.name)}</b> · ${esc(h.job)}<small>${esc(h.perkText)}</small></div></div>
      <h3>기록</h3><div class="stats">${st.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>
      <h3>옷장 (${money(s.price(60))})</h3><div class="outfits">${OUTFITS.map((c, i) => `<button class="sw-b${s.life.outfit === i ? ' on' : ''}" data-ui="outfit" data-id="${i}" type="button" style="background:${hex(c)}" aria-label="옷 ${i + 1}"></button>`).join('')}</div>
      <h3>서비스</h3><div class="row2"><div><b>경찰 매수</b><small>${s.wanted.stars ? `수배 ${s.wanted.stars}★ · ${money(fee)} (경찰 시야 밖에서)` : '수배 중일 때 사용'}</small></div><button data-ui="bribe" type="button"${s.wanted.stars ? '' : ' disabled'}>뇌물</button></div>`;
  }
  private medals(s: Sim): string {
    const got = new Set(s.life.ach); return `<p class="empty">${got.size}/${ACHIEVEMENTS.length} 달성</p>` + ACHIEVEMENTS.map(a => `<div class="row2 ${got.has(a.id) ? 'done' : ''}"><div><b>${got.has(a.id) ? '✔ ' : ''}${esc(a.name)}</b><small>${esc(a.desc)}</small></div><em class="own">${money(a.reward)}</em></div>`).join('');
  }

  // ---------- 자동차 매장·체육관 ----------
  private dealer(): string {
    const s = this.sim, rows = CAR_SHOP.map((o, i) => { const own = s.life.cars.some(c => c.kind === o.kind), d = VEHICLES[o.kind]; return `<button class="row" data-ui="buycar" data-id="${i}" type="button"${own ? ' disabled' : ''}><b>${esc(d.name)}</b><span>최고 ${Math.round(d.top * 3.6)} km/h · 내구 ${d.hp}</span><em>${own ? '보유 중' : money(s.price(o.price))}</em></button>`; }).join('');
    return `<h2>PRESTIGE MOTORS</h2><p class="cash">보유 ${money(s.cash)}</p><div class="ol-list">${rows}</div><div class="ol-btns"><button data-k="resume" type="button">나가기</button></div>`;
  }
  // ---------- 카지노 ----------
  private casino(): string {
    const s = this.sim, tabs = ([['slots', '슬롯'], ['bj', '블랙잭'], ['roulette', '룰렛'], ['coin', '동전'], ['hilo', '하이로']] as const).map(([id, n]) => `<button class="tab${id === this.casinoTab ? ' on' : ''}" data-ui="ctab" data-id="${id}" type="button">${n}</button>`).join('');
    const chips = BETS.map(b => `<button class="chip-b${b === this.bet ? ' on' : ''}" data-ui="bet" data-id="${b}" type="button">${money(b)}</button>`).join('');
    let body = '';
    if (this.casinoTab === 'slots') body = `<div class="reels">${this.reels.map(r => `<i>${r}</i>`).join('')}</div><div class="ol-btns"><button data-ui="spin" type="button">돌리기 ${money(this.bet)}</button></div>`;
    else if (this.casinoTab === 'coin') body = `<div class="ol-btns"><button data-ui="coin" data-id="heads" type="button">앞면</button><button data-ui="coin" data-id="tails" type="button">뒷면</button></div><p class="empty">맞히면 1.9배</p>`;
    else if (this.casinoTab === 'hilo') {
      const g = this.hilo, live = !!g && g.state === 'play';
      if (!g) body = `<div class="ol-btns"><button data-ui="hdeal" type="button">카드 받기 ${money(this.bet)}</button></div><p class="empty">다음 카드가 높을지 낮을지 맞히세요 · 연속 적중마다 ×${HILO_STEP} · 같은 숫자는 틀림 · A 가 가장 낮음</p>`;
      else body = `<div class="hand"><small>연속 ${g.streak} · 지금 받을 금액 ${money(hiloValue(g))}</small><i class="card ${g.card.suit === 1 || g.card.suit === 2 ? 'red' : ''}">${cardLabel(g.card)}</i></div>
        <div class="ol-btns">${live ? `<button data-ui="hhi" type="button">더 높음</button><button data-ui="hlo" type="button">더 낮음</button>${g.streak > 0 ? `<button data-ui="hcash" type="button" class="ghost">그만 ${money(hiloValue(g))}</button>` : ''}` : `<button data-ui="hdeal" type="button">다시 ${money(this.bet)}</button>`}</div>`;
    }
    else if (this.casinoTab === 'roulette') {
      const types: Array<[RouletteBet['type'], string]> = [['red', '빨강 ×2'], ['black', '검정 ×2'], ['odd', '홀 ×2'], ['even', '짝 ×2'], ['low', '1-18 ×2'], ['high', '19-36 ×2'], ['number', `숫자 ${this.rnum} ×36`]];
      body = `<div class="ol-btns">${types.map(([id, n]) => `<button class="tab${this.rbet === id ? ' on' : ''}" data-ui="rbet" data-id="${id}" type="button">${n}</button>`).join('')}</div>
        <div class="ol-btns"><button data-ui="rnum" data-id="-1" type="button" class="ghost">숫자 −</button><button data-ui="rnum" data-id="1" type="button" class="ghost">숫자 +</button><button data-ui="rspin" type="button">돌리기 ${money(this.bet)}</button></div>`;
    } else {
      const g = this.bj;
      if (!g) body = `<div class="ol-btns"><button data-ui="deal" type="button">카드 받기 ${money(this.bet)}</button></div><p class="empty">21에 가깝게 · 블랙잭 ×2.5 · 딜러는 17 이상에서 멈춤</p>`;
      else {
        const dealer = g.over ? g.dealer : [g.dealer[0]!], show = (cs: typeof g.player): string => cs.map(c => `<i class="card ${c.suit === 1 || c.suit === 2 ? 'red' : ''}">${cardLabel(c)}</i>`).join('') + (g.over ? '' : '');
        body = `<div class="hand"><small>딜러 ${g.over ? handValue(g.dealer) : '?'}</small>${show(dealer)}${g.over ? '' : '<i class="card back">?</i>'}</div><div class="hand"><small>나 ${handValue(g.player)}</small>${show(g.player)}</div>
          <div class="ol-btns">${g.over ? '<button data-ui="deal" type="button">다시 ' + money(this.bet) + '</button>' : `<button data-ui="hit" type="button">히트</button><button data-ui="stand" type="button">스탠드</button>${g.player.length === 2 ? '<button data-ui="double" type="button">더블</button>' : ''}`}</div>`;
      }
    }
    return `<h2>MIRAGE CASINO</h2><div class="phone-head"><b class="cash">${money(s.cash)}</b></div><div class="tabs">${tabs}</div><div class="bets">${chips}</div>${body}<p class="note">${esc(this.note)}</p><div class="ol-btns"><button data-k="resume" type="button" class="ghost">나가기</button></div>`;
  }

  // ---------- 동작 ----------
  private take(): boolean { const s = this.sim; if (!BETS.includes(this.bet)) { this.note = '잘못된 판돈입니다'; return false; } if (s.cash < this.bet) { this.note = '돈이 부족합니다'; return false; } s.addCash(-this.bet); s.count('wagered', this.bet); return true; }
  click(ds: DOMStringMap): Outcome {
    const s = this.sim, id = ds.id ?? '', k = ds.ui, me = (kind: string, toast?: string): Outcome => ({ kind, toast });
    switch (k) {
      case 'hero': if (HEROES.some(h => h.id === id)) this.heroSel = id; return me('hero');
      case 'start': s.applyHero(this.heroSel); return { begin: true, close: true };
      case 'tab': if (phoneTab(id)) this.tab = id; return me('phone');
      case 'job': { const r = startJob(s, id); return r ? me('phone', r) : { close: true, sound: 'mission_start' }; }
      case 'cancel': cancelJob(s); return me('phone');
      case 'call': { const r = callCar(s, Number(id)); return r.includes('도착') ? { close: true, toast: r } : me('phone', r); }
      case 'buyprop': return me('phone', buyProperty(s, id));
      case 'collect': return me('phone', collectProperties(s));
      case 'outfit': return me('phone', setOutfit(s, Number(id)));
      case 'bribe': return me('phone', bribe(s));
      case 'buycar': return me('dealer', buyCar(s, Number(id)));
      case 'ctab': if (casinoTab(id)) { this.casinoTab = id; this.note = ''; } return me('casino');
      case 'bet': if (BETS.includes(Number(id))) this.bet = Number(id); return me('casino');
      case 'spin': { if (!this.take()) return me('casino'); const r = slotSpin(s.rng, this.bet); this.reels = r.reels; if (r.payout) s.addCash(r.payout); if (r.jackpot) s.count('jackpot'); this.note = r.payout ? `${r.note} · +${money(r.payout)}` : r.note; return { kind: 'casino', sound: r.payout ? 'cash' : undefined }; }
      case 'coin': { if (id !== 'heads' && id !== 'tails') return me('casino'); if (!this.take()) return me('casino'); const r = coinFlip(s.rng, this.bet, id); if (r.payout) s.addCash(r.payout); this.note = `${r.side === 'heads' ? '앞면' : '뒷면'} · ${r.payout ? '+' + money(r.payout) : '꽝'}`; return me('casino'); }
      case 'hdeal': { if (this.hilo?.state === 'play' || !this.take()) return me('casino'); this.hilo = hiloDeal(s.rng, this.bet); this.note = ''; return me('casino'); }
      case 'hhi': case 'hlo': {
        const g = this.hilo; if (!g || g.state !== 'play') return me('casino'); const before = g.streak; hiloGuess(g, s.rng, k === 'hhi' ? 'hi' : 'lo');
        this.note = g.streak === before ? `틀렸습니다 -${money(g.bet)}` : `적중! 연속 ${g.streak}`; return me('casino');
      }
      case 'hcash': { const g = this.hilo; if (!g || g.state !== 'play' || g.streak < 1) return me('casino'); const pay = hiloValue(g); g.state = 'cashed'; s.addCash(pay); this.note = `정산 +${money(pay - g.bet)}`; return me('casino'); }
      case 'rbet': if (rouletteType(id)) this.rbet = id; return me('casino');
      case 'rnum': if (id === '-1' || id === '1') { this.rnum = (this.rnum + Number(id) + 37) % 37; this.rbet = 'number'; } return me('casino');
      case 'rspin': { if (!rouletteType(this.rbet) || !Number.isInteger(this.rnum) || this.rnum < 0 || this.rnum > 36) return me('casino'); if (!this.take()) return me('casino'); const on: RouletteBet = this.rbet === 'number' ? { type: 'number', n: this.rnum } : { type: this.rbet }; const r = rouletteSpin(s.rng, this.bet, on); if (r.payout) s.addCash(r.payout); this.note = `${r.n} ${rouletteColor(r.n) === 'red' ? '빨강' : rouletteColor(r.n) === 'black' ? '검정' : '초록'} · ${r.payout ? '+' + money(r.payout) : '꽝'}`; return me('casino'); }
      case 'deal': { if (this.bj && !this.bj.over || !this.take()) return me('casino'); this.bj = new Blackjack(s.rng, this.bet); this.bjSettled = false; this.settle(); return me('casino'); }
      case 'hit': this.bj?.hit(); this.settle(); return me('casino');
      case 'stand': this.bj?.stand(); this.settle(); return me('casino');
      case 'double': { const g = this.bj; if (!g || g.over || g.player.length !== 2) return me('casino'); if (s.cash < g.bet) { this.note = '더블할 돈이 부족합니다'; return me('casino'); } s.addCash(-g.bet); s.count('wagered', g.bet); g.double(); this.settle(); return me('casino'); }
      default: return {};
    }
  }
  private settle(): void {
    const g = this.bj, s = this.sim; if (!g || !g.over || this.bjSettled) return; this.bjSettled = true;
    if (g.payout) s.addCash(g.payout); const net = g.payout - g.bet;
    this.note = g.state === 'blackjack' ? `블랙잭! +${money(net)}` : g.state === 'win' ? `승리 +${money(net)}` : g.state === 'push' ? '무승부' : `패배 -${money(g.bet)}`;
  }
}
void vehicleName; void SLOT_SYMBOLS;
