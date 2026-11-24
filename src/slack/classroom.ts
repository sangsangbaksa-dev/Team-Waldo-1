import './classroom.css';
import type { CreateView, SlackEvent } from './types';
import { createBattle, resizeBattleCanvas, W, H, COST } from './lapgame';

// 교실 딴짓은 노트북 하나: video = 다리 점령전 하이라이트 영상, game = 같은 전술 게임 직접 플레이. 수업 자료는 보스키(cover) 화면.
type Pick = 'video' | 'game';
const picks: { id: Pick; icon: string; name: string }[] = [
  { id: 'video', icon: '▶', name: '전략 영상' },
  { id: 'game', icon: '◆', name: '전략 게임' },
];
const KIDS = [10, 27, 60, 77].map((x, i) => `<div class="sl-kid" style="left:${x}%;--s:${1 + (i % 2) * 0.06}"><i class="hd"></i><i class="bd"></i></div>`).join('');
const KEYS = Array.from({ length: 4 }, () => '<i></i>').join('');

export const createClassroomView: CreateView = (sim, audio) => {
  const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
  const el = document.createElement('div');
  el.className = 'sl-class';
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="sl-room" aria-label="저녁 자습 교실" data-view="doc">
      <div class="sl-world">
        <div class="sl-ceiling"><div class="sl-light"></div><div class="sl-light"></div></div>
        <div class="sl-wall"><div class="sl-clock">10:24</div><div class="sl-board"><small>오늘의 자습</small><span>조용히, 끝까지.</span><i>수고했어, 오늘도.</i></div>
          <div class="sl-doorframe"><div class="sl-doorway"></div><div class="sl-door"><div class="sl-window"><div class="sl-shadow"></div><div class="sl-face"><i></i><i></i></div></div><div class="sl-handle"></div><div class="sl-gap"><i></i><i></i></div></div></div>
        <div class="sl-rows">${KIDS}</div>
        <div class="sl-teacher"><div class="sl-teacher-head"></div><div class="sl-teacher-body"></div><i class="sl-leg l"></i><i class="sl-leg r"></i></div>
        <div class="sl-desk"></div>
        <div class="sl-laptop">
          <div class="sl-lid"><div class="sl-screen">
            <div class="sl-win doc"><div class="sl-tb"><i></i><span>EduPlus 학습마당 · 중2 수학 문제집</span></div>
              <div class="sl-docbody"><aside><b>단원</b><u>1. 일차방정식</u><u class="on">2. 연립방정식</u><u>3. 일차함수</u><u>4. 도형의 성질</u></aside>
                <article><div class="sl-pdfbar"><span>‹ 37 / 120 ›</span><span>100%</span><span>★ 북마크</span></div><h4>p.37 연립방정식의 풀이</h4><p>1. 다음 연립방정식을 가감법으로 풀어 보시오.</p><div class="eq">x + y = 12<br>2x − y = 3</div><p>2. 두 수의 합이 25, 차가 7일 때 두 수를 구하시오.</p><div class="ans"></div><p>3. 대입법을 이용하여 해를 구하시오.</p><div class="eq">y = 2x − 1<br>3x + y = 14</div></article></div></div>
            <div class="sl-win vid"><div class="sl-tb"><i></i><span>전술 영상 · 다리 점령전 하이라이트</span></div>
              <div class="sl-wbody"><canvas width="${W}" height="${H}"></canvas><div class="sl-sub"></div></div>
              <div class="sl-pbar"><b>▶</b><span class="sl-track"><i></i></span><em>00:00</em></div></div>
            <div class="sl-win gm"><div class="sl-tb"><i></i><span>다리 점령전 · 지휘 모드</span></div>
              <div class="sl-wbody"><canvas width="${W}" height="${H}"></canvas><div class="sl-end"></div></div>
              <div class="sl-gbar"><span class="sl-res">광물 <b data-ore>0</b></span><button type="button" data-train="w">일꾼 ${COST.w}</button><button type="button" data-train="i">보병 ${COST.i}</button><button type="button" data-train="t">전차 ${COST.t}</button><span class="sl-sc">점수 <b data-sc>0</b></span></div></div>
            <div class="sl-task"><b class="sl-start"></b><span data-w="doc">문제집</span><span data-w="video">영상</span><span data-w="game">게임</span><em class="sl-tbat">100%</em><em>10:24</em></div>
          </div><i class="sl-label">○○고 학교자산 NO.0231</i></div>
          <div class="sl-deck"><i class="sl-trk"></i><div class="sl-keys">${KEYS}</div><i class="sl-res1"></i><i class="sl-res2"></i></div>
          <div class="sl-hand l"><i class="sl-sleeve"></i><i class="sl-cuff"></i><i class="sl-palm"></i></div>
          <div class="sl-hand r"><i class="sl-sleeve"></i><i class="sl-cuff"></i><i class="sl-palm"></i></div>
        </div>
      </div>
      <div class="sl-cast"></div><div class="sl-flick"></div><div class="sl-spill"></div><div class="sl-hush"><span>…</span></div>
      <div class="sl-pop"></div><div class="sl-relief">휴…</div><div class="sl-strike"><span>거기, 지금 뭐 하고 있니?</span></div>
    </div>
    <div class="sl-controls"><div class="sl-activities" aria-label="딴짓 선택">${picks.map((a, i) => `<button type="button" class="sl-action" data-activity="${a.id}" aria-label="${a.name}${coarse ? '' : ` (${i + 1})`}"><span>${a.icon}</span><small>${a.name}${coarse ? '' : ` (${i + 1})`}</small></button>`).join('')}</div><button type="button" class="sl-cover">수업 자료 <small>${coarse ? '길게 누르기' : '길게 누르기 · 스페이스'}</small></button></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const room = q('.sl-room');
  const cover = q<HTMLButtonElement>('.sl-cover');
  const actions = Array.from(el.querySelectorAll<HTMLButtonElement>('.sl-action'));
  const pop = q('.sl-pop');
  const vcv = q<HTMLCanvasElement>('.vid canvas'), gcv = q<HTMLCanvasElement>('.gm canvas');
  const vctx = vcv.getContext('2d'), gctx = gcv.getContext('2d');
  const sizes = new Map<Element, DOMRectReadOnly>();
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    for (const entry of entries) sizes.set(entry.target, entry.contentRect);
  });
  resize?.observe(vcv); resize?.observe(gcv);
  const draw = (ctx: CanvasRenderingContext2D | null, battle: ReturnType<typeof createBattle>) => {
    if (!ctx) return;
    const size = sizes.get(ctx.canvas);
    if (size) resizeBattleCanvas(ctx.canvas, size.width, size.height, window.devicePixelRatio);
    battle.draw(ctx);
  };
  const gameWindow = q('.sl-win.gm');
  const sub = q('.sl-sub'), track = q('.sl-track i'), vtime = q('.vid em'), batEl = q('.sl-tbat');
  const oreEl = q('[data-ore]'), scEl = q('[data-sc]'), endEl = q('.sl-end');
  const trainBtns = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-train]'));
  const cache = new Map<string, string>();
  const put = (target: HTMLElement, key: string, v: string) => { const k = (target === room ? 'r.' : 'x.') + key; if (cache.get(k) !== v) { cache.set(k, v); target.dataset[key] = v; } };
  const css = (k: string, v: string) => { if (cache.get('$' + k) !== v) { cache.set('$' + k, v); room.style.setProperty(k, v); } };
  const txt = (n: HTMLElement, v: string) => { if (n.textContent !== v) n.textContent = v; };
  const restart = (n: HTMLElement, cls: string) => { n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); };
  // 영상 창은 양쪽 AI 가 싸우는 장면, 게임 창은 청군을 내가 지휘한다(점수는 창 안에서만 씀)
  const vid = createBattle(false);
  const game = createBattle(true, e => { if (e === 'train') audio.play('key', 0.4); else if (e === 'order') audio.play('click', 0.3); else if (e === 'hq') audio.play('fun', 0.4); else if (e === 'win') audio.play('chime'); else if (e === 'lose') audio.play('click', 0.5); });
  let coverKey = false, coverPointer: number | null = null;
  let step = 0, stepLv = 0, relief = 0, popT = 0, quiet = 0, strike = 0, vt = 0, gHand = 0.5;
  const syncCover = () => sim.setCover(coverKey || coverPointer !== null || !sim.state.activity);
  const choose = (id: Pick) => {
    audio.resume();
    const next = sim.state.activity === id ? null : id;
    sim.doActivity(next);
    syncCover();
    if (next && sim.state.activity === next) audio.play('click', 0.5);
  };
  const view = () => (sim.state.cover || !sim.state.activity ? 'doc' : sim.state.activity === 'video' ? 'video' : 'game');
  const train = (k: 'w' | 'i' | 't') => { audio.resume(); if (view() === 'game') game.train(k); };
  const keydown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Space') {
      if (event.target instanceof HTMLButtonElement && event.target !== cover) return;
      event.preventDefault();
      if (!event.repeat) { audio.resume(); coverKey = true; syncCover(); }
    } else if (!event.repeat && (event.key === '1' || event.key === '2')) {
      event.preventDefault(); choose(picks[Number(event.key) - 1].id);
    } else if (!event.repeat && view() === 'game' && /^[qwe]$/i.test(event.key)) train(({ q: 'w', w: 'i', e: 't' } as const)[event.key.toLowerCase() as 'q' | 'w' | 'e']);
  };
  const keyup = (event: KeyboardEvent) => { if (coverKey && event.code === 'Space') { event.preventDefault(); coverKey = false; syncCover(); } };
  const release = () => {
    if (!coverKey && coverPointer === null) return;
    const pointer = coverPointer; coverKey = false; coverPointer = null; syncCover();
    if (pointer !== null && cover.hasPointerCapture(pointer)) cover.releasePointerCapture(pointer);
  };
  const focusout = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node) || !el.contains(event.relatedTarget)) release(); };
  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || coverPointer !== null) return;
    event.preventDefault(); cover.focus({ preventScroll: true }); audio.resume();
    coverPointer = event.pointerId;
    try { cover.setPointerCapture(event.pointerId); } catch { /* window-level release below covers browsers without capture */ }
    syncCover();
  };
  const pointerUp = (event: PointerEvent) => { if (coverPointer === event.pointerId) { coverPointer = null; syncCover(); } };
  const actionClick = (event: MouseEvent) => {
    const t = event.target as HTMLElement;
    const button = t.closest<HTMLButtonElement>('[data-activity]');
    if (button) { if (event.detail > 0) el.focus({ preventScroll: true }); choose(button.dataset.activity as Pick); return; }
    const tb = t.closest<HTMLButtonElement>('[data-train]');
    if (tb) { if (event.detail > 0) el.focus({ preventScroll: true }); train(tb.dataset.train as 'w' | 'i' | 't'); }
  };
  const gpos = (e: PointerEvent) => { const r = gcv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, (e.clientX - r.left) / r.width] as const; };
  const gDown = (e: PointerEvent) => { if (e.button !== 0 || view() !== 'game') return; el.focus({ preventScroll: true }); audio.resume(); const [x, y] = gpos(e); game.command(x, y); };
  const gMove = (e: PointerEvent) => { gHand = gpos(e)[2]; };
  el.addEventListener('keydown', keydown);
  el.addEventListener('keyup', keyup);
  el.addEventListener('focusout', focusout);
  window.addEventListener('blur', release);
  cover.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  cover.addEventListener('lostpointercapture', pointerUp);
  gcv.addEventListener('pointerdown', gDown);
  gcv.addEventListener('pointermove', gMove);
  el.addEventListener('click', actionClick);
  return {
    el,
    frame(dt) {
      const s = sim.state, v = view();
      if (gameWindow.inert !== (v !== 'game')) {
        if (v !== 'game' && gameWindow.contains(document.activeElement)) el.focus({ preventScroll: true });
        gameWindow.inert = v !== 'game';
      }
      step = Math.max(0, step - dt); relief = Math.max(0, relief - dt); popT = Math.max(0, popT - dt); quiet = Math.max(0, quiet - dt); strike = Math.max(0, strike - dt);
      put(room, 'view', v);
      put(room, 'hint', String(s.watcher.hint));
      put(room, 'scan', String(s.watcher.mode === 'scan'));
      put(room, 'step', String(step > 0 ? stepLv : 0));
      put(room, 'mode', s.watcher.mode);
      room.classList.toggle('is-cover', s.cover);
      room.classList.toggle('is-quiet', quiet > 0);
      room.classList.toggle('is-strike', strike > 0);
      room.classList.toggle('is-watched', s.watcher.hint === 2 || s.watcher.mode === 'scan');
      room.classList.toggle('is-relief', relief > 0);
      room.classList.toggle('is-lowbat', s.battery < 20);
      css('--near', Math.max(0, Math.min(1, s.watcher.near)).toFixed(2));
      for (let i = 0; i < actions.length; i++) { const b = actions[i], on = b.dataset.activity === s.activity; if (b.classList.contains('is-active') !== on) { b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); } }
      cover.classList.toggle('is-active', s.cover);
      txt(batEl, `${Math.round(s.battery)}%`);
      // 게임은 창을 가려도 계속 진행(실시간), 영상은 보는 동안만 흐른다
      game.update(dt);
      let fl = v === 'doc' ? 0.1 : 0;
      if (v === 'video') {
        vid.update(dt); draw(vctx, vid); vt += dt; fl = vid.flash;
        txt(sub, vid.capT > 0 ? vid.cap : ''); sub.classList.toggle('on', vid.capT > 0);
        const sec = Math.floor(vt), m = `${String(Math.floor(sec / 60) % 100).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; txt(vtime, m);
        track.style.transform = `scaleX(${(vt % 90) / 90})`;
      } else if (v === 'game') {
        draw(gctx, game); fl = game.flash;
        txt(oreEl, String(game.ore)); txt(scEl, String(game.score));
        for (const b of trainBtns) { const c = COST[b.dataset.train as 'w' | 'i' | 't'], off = game.ore < c || game.prod > 0 || game.over !== null; if (b.disabled !== off) b.disabled = off; }
        txt(endEl, game.over === null ? '' : game.over === 0 ? '승리! 적 본진 파괴' : '패배… 본진이 무너졌다'); endEl.classList.toggle('on', game.over !== null);
      }
      css('--flash', (Math.round(fl * 12) / 12).toFixed(2));
      css('--hx', (Math.round(gHand * 20) / 20).toFixed(2));
    },
    onEvent(ev: SlackEvent) {
      switch (ev.t) {
        case 'footstep': audio.play('footstep', ev.vol); step = 1.3; stepLv = ev.vol < 0.34 ? 1 : ev.vol < 0.68 ? 2 : 3; if (ev.vol > 0.5) restart(room, 'is-thump'); break;
        case 'door': audio.play(ev.open ? 'doorOpen' : 'doorClose'); room.classList.toggle('is-door', ev.open); break;
        case 'peek': audio.play('peek'); break;
        case 'quiet': quiet = 3; break;
        case 'strike': strike = 2; break;
        case 'leave': relief = 2; break;
        case 'fun': if (ev.amount >= 1 && popT <= 0) { popT = 0.8; pop.textContent = `+${Math.round(ev.amount)} 재미`; restart(pop, 'on'); } break;
      }
    },
    dispose() {
      resize?.disconnect();
      el.removeEventListener('keydown', keydown); el.removeEventListener('keyup', keyup); el.removeEventListener('focusout', focusout); window.removeEventListener('blur', release);
      cover.removeEventListener('pointerdown', pointerDown); window.removeEventListener('pointerup', pointerUp); window.removeEventListener('pointercancel', pointerUp); cover.removeEventListener('lostpointercapture', pointerUp);
      gcv.removeEventListener('pointerdown', gDown); gcv.removeEventListener('pointermove', gMove);
      el.removeEventListener('click', actionClick);
      release();
    },
  };
};
