import '../shared/ui.css';
import { spriteUrl } from './sprites';
import { ICON, leftRail, rightRail, rosterHtml } from './rails';
import './squad.css';
import type { LoadingScreen } from '../loading';
import { Battle, BUDGET, STEP, validArmy, type Placement, type Side } from './sim';
import { SquadPvp } from './net';
import { SquadAudio } from './audio';
import { readPreferences, writePreferences } from '../prefs';
import { PVP_ENABLED } from '../net/config';
import type { PvpSession } from '../net/lobby';
import { autoArmy, buildArmy, type Difficulty } from './ai';
import { TYPES, UNITS, type UnitType } from './units';
import { readRecords, saveResult } from './records';
import { draw } from './view';

export function openSquad(onExit: () => void, opts: { loading?: LoadingScreen } = {}): void {
  const root = document.createElement('div'); root.className = 'sq-root wd-screen'; root.style.setProperty('--wd-hue', '#6ebcff'); document.body.appendChild(root); opts.loading?.close();
  const DEPLOY_MS = 90000, esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
  interface Online { s: PvpSession; net: SquadPvp; mine: Side; incoming: Map<number, Placement[]>; sent: number; deadline: number; leaving: number; done: boolean; result: string }
  const audio = new SquadAudio(); audio.enabled = readPreferences().sound;
  let online: Online | null = null, lobby: { close(): void } | undefined;
  let mode: 'ai' | 'local' | 'online' = 'ai', difficulty: Difficulty = 'normal', stage: 'menu' | 'cover' | 'deploy' | 'wait' | 'battle' | 'round' | 'result' | 'pause' = 'menu';
  let previous: 'deploy' | 'battle' = 'deploy', side: Side = 0, armies: Placement[][] = [[], []], selected: UnitType = 'guard', battle: Battle | null = null, score = [0, 0], round = 1, speed = 1, hover: { x: number; y: number } | null = null, drag: { x: number; y: number } | null = null, raf = 0, last = 0, accumulator = 0, closed = false;
  let totals = [{ kills: 0, damage: 0, survivors: 0, gold: 0 }, { kills: 0, damage: 0, survivors: 0, gold: 0 }];
  let lastRosterTick = 0, lastDrawTick = -1, onlineTimer = 0;
  let renderedStage: typeof stage | null = null;
  const cost = (s: Side) => armies[s]!.reduce((n, p) => n + UNITS[p.type].cost, 0);
  const button = (id: string, text: string, cls = '') => `<button id="${id}" class="wd-btn ${cls}">${text}</button>`;
  const seg = (key: string, items: Array<[string, string]>, cur: string) => items.map(([v, t]) => `<button type="button" data-${key}="${v}" aria-pressed="${cur === v}">${t}</button>`).join('');
  const recordLine = (): string => { const r = readRecords(); return `<p class="sq-record">${r.matches ? `전적 <b>${r.matches}전 ${r.wins}승 ${r.matches - r.wins}패</b>` : '아직 기록 없음'}</p>`; };
  // No animation is needed in menus, deployment, pauses, or results.
  // Online deployment uses a low-frequency timer for its countdown instead.
  function scheduleFrame(): void {
    if (closed || stage !== 'battle' || !battle) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; last = 0;
      return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function render(): void {
    const active = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    // Re-rendered controls used to lose keyboard focus after every selection.
    const keepFocus = active?.id ? `#${active.id}`
      : active?.dataset.unit ? `[data-unit="${active.dataset.unit}"]`
      : active?.dataset.mode ? `[data-mode="${active.dataset.mode}"]`
      : active?.dataset.diff ? `[data-diff="${active.dataset.diff}"]` : null;
    const stageChanged = renderedStage !== stage;
    renderedStage = stage;
    root.classList.toggle('wd-has-rails', stage === 'deploy' || stage === 'battle');
    const title = `<p class="wd-eyebrow">배치 전략 · Formation</p><h1 class="wd-title">SQUAD CLASH</h1>`;
    if (stage === 'menu') root.innerHTML = `<main class="wd-panel sq-card">${title}<p class="wd-lead">같은 예산, 다른 진형. 배치가 승부를 가릅니다.</p><div class="wd-field"><span class="wd-label">모드</span><div class="wd-seg" role="group" aria-label="모드">${seg('mode', [['ai', 'AI 대전'], ['local', '한 화면 2인'], ...(PVP_ENABLED ? [['online', '온라인'] as [string, string]] : [])], mode)}</div></div>${mode === 'ai' ? `<div class="wd-field"><span class="wd-label">난이도</span><div class="wd-seg" role="group" aria-label="난이도">${seg('diff', [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']], difficulty)}</div></div>` : ''}<ul class="wd-facts"><li>1,000G 예산</li><li>3판 2선승</li><li>1–5 병사 선택</li><li>드래그 이동 · 우클릭 삭제</li></ul>${recordLine()}<div class="wd-actions">${button('start', mode === 'online' ? '매치 찾기' : '시작', 'primary')}<div class="wd-row">${button('sound', audio.enabled ? '소리 켜짐' : '소리 꺼짐', 'ghost')}${button('exit', '게임 목록으로', 'ghost')}</div></div></main>`;
    else if (stage === 'cover') root.innerHTML = `<main class="wd-panel sq-card sq-cover">${title}<span class="sq-round">라운드 ${round}</span><h2>${side === 0 ? 'P1 배치 중' : 'P2에게 넘겨주세요'}</h2><p>${side === 0 ? 'P2는 화면을 보지 마세요.' : 'P1의 배치가 가려졌습니다. P1은 화면을 보지 마세요.'}</p>${button('uncover', side === 0 ? 'P1 배치 시작' : 'P2 배치 시작', 'primary')}</main>`;
    else if (stage === 'deploy' || stage === 'battle') {
      root.innerHTML = `${leftRail()}<main class="sq-arena"><header class="sq-top"><div><span class="sq-kicker">SQUAD CLASH</span><h2>${stage === 'deploy' ? `P${side + 1} 진형 배치${online ? ' · <span id="sq-timer"></span>' : ''}` : '전투 진행 중'}</h2></div><div class="sq-score"><img src="${spriteUrl('guard', 0)}" alt=""><b>${score[0]}</b><span>${round > 3 ? `연장전 ${round - 3}` : `라운드 ${round} / 3`}</span><b>${score[1]}</b><img src="${spriteUrl('guard', 1)}" alt=""></div>${button('pause', online ? '나가기' : '일시정지')}</header><div class="sq-field"><canvas width="600" height="1000" aria-label="12칸 곱하기 20칸 전장"></canvas><div class="sq-field-label"><span>파랑 · ${online ? esc((online.mine === 0 ? online.s.me : online.s.opponent).nickname) : 'P1'}${online?.mine === 0 ? ' (나)' : ''}</span><span>빨강 · ${online ? esc((online.mine === 1 ? online.s.me : online.s.opponent).nickname) : mode === 'ai' ? 'AI' : 'P2'}${online?.mine === 1 ? ' (나)' : ''}</span></div></div>${stage === 'deploy' ? `<div class="sq-deploy"><div class="sq-budget"><span>남은 골드</span><strong>${ICON.coin}${BUDGET - cost(side)} <small>G</small></strong><div><i style="width:${cost(side) / 10}%"></i></div></div><div class="sq-palette">${TYPES.map((t, i) => `<button data-unit="${t}" class="${selected === t ? 'active' : ''}"><span><img src="${spriteUrl(t, side)}" alt=""></span><b>${i + 1}. ${UNITS[t].name} <em>${ICON.coin}${UNITS[t].cost}G</em></b><small>${UNITS[t].role}</small></button>`).join('')}</div><div class="sq-actions">${button('auto', '자동 배치')}${button('clear', '초기화')}${button('ready', '배치 완료', 'primary')}</div><p class="sq-hint">병사를 선택하고 내 진영을 누르세요. 병사를 끌어서 이동하거나 다시 눌러 삭제합니다.</p></div>` : `<div class="sq-battlebar"><span>경과 ${Math.floor((battle?.tick || 0) / 30)}초 / 60초</span><div>${[1, 2, 4].map(n => button('speed' + n, n + '배속', speed === n ? 'active' : '')).join('')}${button('skip', '결과 보기')}</div></div>`}</main>${rightRail(stage, battle)}`;
      const canvas = root.querySelector('canvas')!; draw(canvas, armies, side, battle, UNITS[selected].range, hover, selected);
      if (stage === 'deploy') setupCanvas(canvas);
    } else if (stage === 'round' || stage === 'result') {
      const result = battle?.winner === 'draw' ? '무승부' : online ? (battle?.winner === online.mine ? '라운드 승리' : '라운드 패배') : `${battle?.winner === 0 ? 'P1' : mode === 'ai' ? 'AI' : 'P2'} 승리`;
      root.innerHTML = `<main class="wd-panel sq-card sq-result"><span class="sq-kicker">${stage === 'result' ? '최종 결과' : `라운드 ${round} 결과`}</span><h2>${stage === 'result' ? (online ? (score[online.mine]! > score[1 - online.mine]! ? '최종 승리' : '최종 패배') : score[0] > score[1] ? 'P1 최종 승리' : mode === 'ai' ? 'AI 최종 승리' : 'P2 최종 승리') : result}</h2><div class="sq-final-score"><b class="sq-s0">${score[0]}</b> <span>:</span> <b class="sq-s1">${score[1]}</b></div><div class="sq-stats"><div></div><b>P1</b><b>${mode === 'ai' ? 'AI' : 'P2'}</b>${(['kills', 'damage', 'survivors', 'gold'] as const).map((k, i) => `<span>${[ICON.sword, ICON.drop, ICON.shield, ICON.coin][i]}${['처치', '피해량', '생존 병사', '골드 효율'][i]}</span>${totals.map(t => `<strong>${k === 'gold' ? (t.gold ? (t.damage / t.gold).toFixed(2) : '0') : Math.round(t[k])}</strong>`).join('')}`).join('')}</div><p class="sq-note">골드 효율 = 누적 피해량 ÷ 사용 골드</p>${online?.result ? `<p class="sq-note sq-online-note">${esc(online.result)}</p>` : ''}<div class="sq-actions">${button('next', stage === 'result' ? (online ? '메뉴로' : '다시 대전') : '다음 라운드', 'primary')}${online ? '' : button('menu', '메뉴로')}</div></main>`;
    } else if (stage === 'wait') root.innerHTML = `<main class="wd-panel sq-card sq-cover">${title}<span class="sq-round">라운드 ${round}</span><h2>상대 배치를 기다리는 중</h2><p>내 진형을 제출했습니다. 상대가 배치를 마치면 바로 전투가 시작됩니다.</p></main>`;
    else root.innerHTML = `<main class="wd-panel sq-card"><h2>일시정지</h2><div class="sq-actions">${button('resume', '이어하기', 'primary')}${button('menu', '모드 선택')}${button('exit', '게임 목록으로', 'ghost')}</div></main>`;
    bind();
    if (stageChanged) {
      const first = stage === 'menu' ? '#start' : stage === 'cover' ? '#uncover' : stage === 'deploy' ? '[data-unit]'
        : stage === 'battle' ? '#pause' : stage === 'pause' ? '#resume'
        : stage === 'result' || stage === 'round' ? '#next' : null;
      if (first) root.querySelector<HTMLElement>(first)?.focus({ preventScroll: true });
    } else if (keepFocus) root.querySelector<HTMLElement>(keepFocus)?.focus({ preventScroll: true });
    scheduleFrame();
  }
  function beginRound(): void { lastRosterTick = 0; lastDrawTick = -1; armies = [[], []]; side = 0; battle = null; hover = null; if (online) { side = online.mine; online.sent = 0; online.deadline = Date.now() + DEPLOY_MS; online.net.clearArmy(); } stage = mode === 'local' ? 'cover' : 'deploy'; render(); if (online) tickOnline(); }
  function startMatch(): void { score = [0, 0]; round = 1; totals = [{ kills: 0, damage: 0, survivors: 0, gold: 0 }, { kills: 0, damage: 0, survivors: 0, gold: 0 }]; beginRound(); }
  function ready(): void { if (stage !== 'deploy') return; if (!armies[side]!.length) { toast('병사를 1명 이상 배치하세요'); return; } if (online) { audio.ready(); sendArmy(); return; } if (side === 0 && mode === 'local') { side = 1; stage = 'cover'; render(); return; } if (mode === 'ai') armies[1] = buildArmy(1, difficulty, armies[0]); battle = new Battle(armies[0]!, armies[1]!, round); stage = 'battle'; audio.start(); last = 0; accumulator = 0; render(); }
  function finish(): void { if (!battle || battle.winner === null || stage !== 'battle') return; if (battle.winner !== 'draw') score[battle.winner]!++; for (const s of [0, 1] as const) { const units = battle.units.filter(u => u.side === s); totals[s]!.kills += units.reduce((n, u) => n + u.kills, 0); totals[s]!.damage += units.reduce((n, u) => n + u.damage, 0); totals[s]!.survivors += units.filter(u => u.hp > 0).length; totals[s]!.gold += cost(s); } stage = score.some(n => n >= 2) ? 'result' : 'round'; if (stage === 'result') { if (mode !== 'local') saveResult(online ? score[online.mine]! > score[1 - online.mine]! : score[0]! > score[1]!); if (online) void concludeOnline(); } const mine = online ? online.mine : 0; if (battle?.winner === 'draw') audio.click(); else if (battle?.winner === mine) audio.win(); else audio.lose(); render(); }
  function setupCanvas(canvas: HTMLCanvasElement): void {
    const cell = (e: PointerEvent | MouseEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * 12), y: Math.floor((e.clientY - r.top) / r.height * 20) }; };
    const legal = (p: { x: number; y: number }) => p.y >= (side ? 0 : 10) && p.y < (side ? 10 : 20) && p.x >= 0 && p.x < 12;
    canvas.oncontextmenu = e => { e.preventDefault(); const p = cell(e); const n = armies[side]!.length; armies[side] = armies[side]!.filter(u => u.x !== p.x || u.y !== p.y); if (armies[side]!.length < n) audio.remove(); render(); };
    canvas.onpointerdown = e => { if (e.button !== 0) return; const p = cell(e); if (!legal(p)) { toast(side ? '위쪽 진영에만 배치할 수 있어요' : '아래쪽 아군 진영에만 배치할 수 있어요'); return; } drag = p; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = e => { const next = cell(e); if (hover?.x === next.x && hover?.y === next.y) return; hover = next; draw(canvas, armies, side, null, UNITS[selected].range, hover, selected); };
    canvas.onpointerleave = () => { hover = null; draw(canvas, armies, side, null, UNITS[selected].range, null); };
    canvas.onpointercancel = () => { drag = null; hover = null; draw(canvas, armies, side, null, UNITS[selected].range, null); };
    canvas.onpointerup = e => { if (!drag) return; const before = armies[side]!.length; const p = cell(e), from = armies[side]!.find(u => u.x === drag!.x && u.y === drag!.y); if (legal(p)) { const at = armies[side]!.find(u => u.x === p.x && u.y === p.y); if (from && (p.x !== drag.x || p.y !== drag.y)) { if (!at) { from.x = p.x; from.y = p.y; } } else if (at) armies[side] = armies[side]!.filter(u => u !== at); else if (cost(side) + UNITS[selected].cost <= BUDGET) armies[side]!.push({ type: selected, ...p }); } drag = null; const after = armies[side]!.length; if (after > before) audio.place(); else if (after < before) audio.remove(); render(); };
  }
  function bind(): void {
    const on = (id: string, fn: () => void) => root.querySelector<HTMLButtonElement>('#' + id)?.addEventListener('click', fn);
    on('exit', exit); on('sound', () => { audio.enabled = !audio.enabled; writePreferences({ ...readPreferences(), sound: audio.enabled }); audio.click(); render(); }); on('menu', () => { stage = 'menu'; battle = null; render(); }); on('start', () => { if (mode === 'online') void openOnline(); else startMatch(); });
    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode as typeof mode; audio.click(); render(); });
    root.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach(b => b.onclick = () => { difficulty = b.dataset.diff as Difficulty; audio.click(); render(); }); on('uncover', () => { stage = 'deploy'; render(); }); on('ready', ready); on('auto', () => { armies[side] = autoArmy(side); audio.place(); render(); }); on('clear', () => { armies[side] = []; render(); }); on('pause', pause); on('resume', () => { stage = previous; last = 0; render(); }); on('next', () => { if (stage === 'result') { if (online) { quitOnline(); stage = 'menu'; battle = null; render(); } else startMatch(); } else { round++; beginRound(); } }); on('skip', () => { if (!battle) return; while (battle.winner === null) battle.step(); finish(); });
    for (const n of [1, 2, 4]) on('speed' + n, () => { speed = n; render(); });
    root.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach(b => b.onclick = () => { selected = b.dataset.unit as UnitType; render(); });
  }
  function toast(text: string): void { root.querySelectorAll('.sq-toast').forEach(t => t.remove()); const d = document.createElement('div'); d.className = 'sq-toast'; d.textContent = text; root.append(d); window.setTimeout(() => d.remove(), 3000); }
  async function openOnline(): Promise<void> {
    const { openLobby } = await import('../net/lobby'); if (closed || lobby) return;
    lobby = openLobby({ game: 'squad', onClose: () => { lobby = undefined; }, onMatch: s => startOnline(s) });
  }
  function startOnline(s: PvpSession): void {
    quitOnline();
    const net: SquadPvp = new SquadPvp(s, {
      onArmy: (r, a) => { const o = online; if (o?.net === net && !o.incoming.has(r)) { o.incoming.set(r, a); tryStart(); } },
      onGone: why => { if (online?.net === net) handleGone(why); },
    });
    online = { s, net, mine: s.host ? 0 : 1, incoming: new Map(), sent: 0, deadline: 0, leaving: 0, done: false, result: '' };
    onlineTimer = window.setInterval(tickOnline, 500);
    mode = 'online'; startMatch();
  }
  /** 내 배치를 제출하고, 상대 배치가 이미 와 있으면 바로 전투를 시작합니다. */
  function sendArmy(): void {
    const o = online; if (!o || stage !== 'deploy' || o.sent === round) return;
    o.sent = round; o.net.setArmy(round, armies[o.mine]!); stage = 'wait'; render(); tryStart();
  }
  function tryStart(): void {
    const o = online, theirs = o?.incoming.get(round); if (!o || stage !== 'wait' || o.sent !== round || !theirs) return;
    const opp = (1 - o.mine) as Side;
    if (!theirs.length || !validArmy(theirs, opp)) { endByForfeit('상대의 배치가 규칙에 맞지 않아 승리했습니다.'); return; }
    armies[opp] = theirs; battle = new Battle(armies[0]!, armies[1]!, round); stage = 'battle'; audio.start(); last = 0; accumulator = 0; render();
  }
  /** 배치 제한 시간(온라인)과 남은 시간 표시. */
  function tickOnline(): void {
    const o = online; if (!o || stage !== 'deploy' || o.sent === round) return;
    const left = Math.max(0, Math.ceil((o.deadline - Date.now()) / 1000)), el = root.querySelector('#sq-timer'), text = `남은 시간 ${left}초`;
    if (el && el.textContent !== text) el.textContent = text;
    if (!left) { if (!armies[o.mine]!.length) armies[o.mine] = autoArmy(o.mine); sendArmy(); }
  }
  /** 상대가 나갔거나 끊겨서 내가 이긴 것으로 끝냅니다. */
  function endByForfeit(reason: string): void {
    const o = online; if (!o || o.done || stage === 'result') return;
    const opp = 1 - o.mine; if (score[o.mine]! < 2) score[o.mine] = 2; if (score[opp]! >= 2) score[opp] = 1;
    o.result = reason; stage = 'result'; battle = null; saveResult(true); void concludeOnline(); render();
  }
  function handleGone(why: 'bye' | 'silent' | 'never'): void {
    const o = online; if (!o || o.done) return;
    if (why === 'never') { quitOnline(); stage = 'menu'; battle = null; render(); toast('상대와 연결하지 못했습니다.'); return; }
    endByForfeit(why === 'bye' ? '상대가 나갔습니다.' : '상대와 연결이 끊겼습니다.');
  }
  /** 승자를 서버에 보고하고 확정된 레이팅 변화를 보여 줍니다(보고 규칙은 SPEED RUSH 와 같습니다). */
  async function concludeOnline(): Promise<void> {
    const o = online; if (!o || o.done) return; o.done = true;
    const note = o.result ? o.result + ' ' : '', winner = score[o.mine]! > score[1 - o.mine]! ? o.s.me.id : o.s.opponent.id;
    const show = (t: string): void => { if (online === o && !closed) { o.result = note + t; if (stage === 'result') render(); } };
    show('결과를 기록하는 중…');
    try {
      let row = await o.s.backend.report(o.s.match.id, winner);
      for (let i = 0; i < 8 && row.status === 'playing' && online === o && !closed; i++) { await new Promise(r => window.setTimeout(r, 3000)); row = await o.s.backend.settle(o.s.match.id); }
      const delta = o.s.host ? row.host_delta : row.guest_delta;
      show(row.status === 'finished' && delta !== null ? `레이팅 ${delta >= 0 ? '+' : ''}${delta}` : row.status === 'void' ? '두 쪽의 보고가 달라 이 대전은 기록되지 않았습니다.' : '결과가 아직 확정되지 않았습니다.');
    } catch { show('기록을 저장하지 못했습니다. 네트워크를 확인해 주세요.'); }
  }
  function leaveOnline(finished: boolean): void { const o = online; online = null; if (onlineTimer) window.clearInterval(onlineTimer); onlineTimer = 0; o?.net.dispose(finished); }
  /** 온라인에서 나갑니다. 끝나기 전에 나가면 기권패로 보고합니다. */
  function quitOnline(): void {
    const o = online; if (!o) return;
    const fin = stage === 'result' || o.done;
    if (!fin && o.net.heard) void o.s.backend.report(o.s.match.id, o.s.opponent.id).catch(() => undefined);
    leaveOnline(fin);
  }
  function leaveClick(): void {
    const o = online; if (!o) return;
    if (Date.now() - o.leaving < 3000) { quitOnline(); stage = 'menu'; battle = null; render(); return; }
    o.leaving = Date.now(); toast(o.done || stage === 'result' ? '한 번 더 누르면 메뉴로 나갑니다.' : '한 번 더 누르면 기권하고 나갑니다.');
  }
  function pause(): void { if (online && stage !== 'menu') { leaveClick(); return; } if (stage !== 'deploy' && stage !== 'battle') return; previous = stage; stage = 'pause'; render(); }
  function key(e: KeyboardEvent): void { if (e.key === 'Escape') { e.preventDefault(); if (stage === 'pause') { stage = previous; last = 0; render(); } else if (stage === 'menu') exit(); else pause(); } else if (stage === 'deploy' && /^[1-5]$/.test(e.key)) { selected = TYPES[Number(e.key) - 1]!; render(); } else if (stage === 'deploy' && (e.key === ' ' || e.key === 'Enter') && !(e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, [contenteditable]'))) { e.preventDefault(); ready(); } }
  function exit(): void { closed = true; audio.dispose(); quitOnline(); lobby?.close(); cancelAnimationFrame(raf); window.removeEventListener('keydown', key); root.remove(); onExit(); }
  function frame(time: number): void { raf = 0; if (closed) return; if (stage === 'battle' && battle) { if (last) accumulator += Math.min(.1, (time - last) / 1000) * speed; last = time; while (accumulator >= STEP && battle.winner === null) { battle.step(); accumulator -= STEP; audio.battle(battle.effects.filter(e => e.age === 0), time); } if (battle.winner !== null) finish(); else { const canvas = root.querySelector('canvas'); if (canvas && battle.tick !== lastDrawTick) { draw(canvas, armies, side, battle, 0, null); lastDrawTick = battle.tick; } if (battle.tick - lastRosterTick >= 6) { lastRosterTick = battle.tick; const ro = root.querySelector('.sq-roster'); if (ro) ro.innerHTML = rosterHtml(battle); } const label = root.querySelector('.sq-battlebar span'); if (label) label.textContent = `경과 ${Math.floor(battle.tick / 30)}초 / 60초`; } } else last = 0; scheduleFrame(); }
  window.addEventListener('keydown', key); render();
}
