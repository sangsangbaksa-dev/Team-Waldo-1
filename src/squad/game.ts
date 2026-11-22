import '../shared/ui.css';
import { spriteUrl } from './sprites';
import { ICON, leftRail, rightRail, updateRoster } from './rails';
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
import { roundLabel } from './round';

export function openSquad(onExit: () => void, opts: { loading?: LoadingScreen } = {}): void {
  const root = document.createElement('div'); root.className = 'sq-root wd-screen'; root.style.setProperty('--wd-hue', '#6ebcff'); document.body.appendChild(root); opts.loading?.close();
  const DEPLOY_MS = 90000, esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
  interface Online { s: PvpSession; net: SquadPvp; mine: Side; incoming: Map<number, Placement[]>; sent: number; deadline: number; leaving: number; done: boolean; result: string; settleTimer: number; wakeSettle: (() => void) | null }
  const audio = new SquadAudio(); audio.enabled = readPreferences().sound;
  let online: Online | null = null, lobby: { close(): void } | undefined;
  type SquadStage = 'menu' | 'cover' | 'deploy' | 'wait' | 'battle' | 'round' | 'result' | 'pause';
  let mode: 'ai' | 'local' | 'online' = 'ai', difficulty: Difficulty = 'normal', stage: SquadStage = 'menu';
  let previous: 'deploy' | 'battle' = 'deploy', side: Side = 0, armies: Placement[][] = [[], []], selected: UnitType = 'guard', battle: Battle | null = null, score = [0, 0], round = 1, speed = 1, hover: { x: number; y: number } | null = null, drag: { x: number; y: number; pointerId: number } | null = null, raf = 0, last = 0, accumulator = 0, closed = false;
  let totals = [{ kills: 0, damage: 0, survivors: 0, gold: 0 }, { kills: 0, damage: 0, survivors: 0, gold: 0 }];
  let lastRosterTime = -Infinity, lastDrawTick = -1, lastBattleSecond = -1, onlineTimer = 0, toastTimer = 0;
  let renderedStage: SquadStage | null = null;
  const cost = (s: Side) => armies[s]!.reduce((n, p) => n + UNITS[p.type].cost, 0);
  const button = (id: string, text: string, cls = '') => `<button id="${id}" class="wd-btn ${cls}"${id.startsWith('speed') ? ` aria-pressed="${speed === Number(id.slice(5))}"` : ''}>${text}</button>`;
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
    // Replacing the DOM also removes active toasts: never retain their timers.
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = 0; }
    // A full view rebuild invalidates the pointer-capturing canvas. A stale
    // drag must never block the next canvas from accepting pointer input.
    drag = null;
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
    else if (stage === 'cover') root.innerHTML = `<main class="wd-panel sq-card sq-cover">${title}<span class="sq-round">${roundLabel(round)}</span><h2>${side === 0 ? 'P1 배치 중' : 'P2에게 넘겨주세요'}</h2><p>${side === 0 ? 'P2는 화면을 보지 마세요.' : 'P1의 배치가 가려졌습니다. P1은 화면을 보지 마세요.'}</p>${button('uncover', side === 0 ? 'P1 배치 시작' : 'P2 배치 시작', 'primary')}</main>`;
    else if (stage === 'deploy' || stage === 'battle') {
      root.innerHTML = `${leftRail()}<main class="sq-arena"><header class="sq-top"><div><span class="sq-kicker">SQUAD CLASH</span><h2>${stage === 'deploy' ? `P${side + 1} 진형 배치${online ? ' · <span id="sq-timer"></span>' : ''}` : '전투 진행 중'}</h2></div><div class="sq-score"><img src="${spriteUrl('guard', 0)}" alt=""><b>${score[0]}</b><span>${roundLabel(round)}${round <= 3 ? ' / 3' : ''}</span><b>${score[1]}</b><img src="${spriteUrl('guard', 1)}" alt=""></div>${button('pause', online ? '나가기' : '일시정지')}</header><div class="sq-field"><canvas id="sq-field-canvas" tabindex="${stage === 'deploy' ? 0 : -1}" width="600" height="1000" ${stage === 'deploy' ? 'aria-describedby="sq-kb-pos" aria-label="전장. 방향키로 칸 이동, Enter 또는 스페이스로 병사 배치·제거, Delete로 제거"' : 'role="img" aria-label="SQUAD CLASH 전투 진행 화면"'}></canvas><div class="sq-field-label"><span>파랑 · ${online ? esc((online.mine === 0 ? online.s.me : online.s.opponent).nickname) : 'P1'}${online?.mine === 0 ? ' (나)' : ''}</span><span>빨강 · ${online ? esc((online.mine === 1 ? online.s.me : online.s.opponent).nickname) : mode === 'ai' ? 'AI' : 'P2'}${online?.mine === 1 ? ' (나)' : ''}</span></div></div>${stage === 'deploy' ? `<div class="sq-deploy"><div class="sq-budget"><span>남은 골드</span><strong>${ICON.coin}${BUDGET - cost(side)} <small>G</small></strong><div><i style="width:${cost(side) / 10}%"></i></div></div><div class="sq-palette">${TYPES.map((t, i) => `<button data-unit="${t}" aria-pressed="${selected === t}" class="${selected === t ? 'active' : ''}"><span><img src="${spriteUrl(t, side)}" alt=""></span><b>${i + 1}. ${UNITS[t].name} <em>${ICON.coin}${UNITS[t].cost}G</em></b><small>${UNITS[t].role}</small></button>`).join('')}</div><div class="sq-actions">${button('auto', '자동 배치')}${button('clear', '초기화')}${button('ready', '배치 완료', 'primary')}</div><p class="sq-hint">병종을 고르고 전장을 누르세요. 드래그로 이동, 다시 누르거나 우클릭으로 삭제할 수 있습니다. 키보드는 전장에 초점을 맞춘 뒤 방향키로 이동하고 Enter로 배치·제거하세요.</p><span id="sq-kb-pos" class="sq-sr-only" role="status" aria-live="polite"></span></div>` : `<div class="sq-battlebar"><span>경과 ${Math.floor((battle?.tick || 0) / 30)}초 / 60초</span><span id="sq-battle-status" class="sq-sr-only" role="status" aria-live="polite" aria-atomic="true"></span><div>${[1, 2, 4].map(n => button('speed' + n, n + '배속', speed === n ? 'active' : '')).join('')}${button('skip', '결과 보기')}</div></div>`}</main>${rightRail(stage, battle)}`;
      const canvas = root.querySelector('canvas')!; draw(canvas, armies, side, battle, UNITS[selected].range, hover, selected);
      if (stage === 'deploy') setupCanvas(canvas);
    } else if (stage === 'round' || stage === 'result') {
      const result = battle?.winner === 'draw' ? '무승부' : online ? (battle?.winner === online.mine ? '라운드 승리' : '라운드 패배') : `${battle?.winner === 0 ? 'P1' : mode === 'ai' ? 'AI' : 'P2'} 승리`;
      root.innerHTML = `<main class="wd-panel sq-card sq-result"><span class="sq-kicker">${stage === 'result' ? '최종 결과' : `${roundLabel(round)} 결과`}</span><h2>${stage === 'result' ? (online ? (score[online.mine]! > score[1 - online.mine]! ? '최종 승리' : '최종 패배') : score[0] > score[1] ? 'P1 최종 승리' : mode === 'ai' ? 'AI 최종 승리' : 'P2 최종 승리') : result}</h2><div class="sq-final-score"><b class="sq-s0">${score[0]}</b> <span>:</span> <b class="sq-s1">${score[1]}</b></div><div class="sq-stats"><div></div><b>P1</b><b>${mode === 'ai' ? 'AI' : 'P2'}</b>${(['kills', 'damage', 'survivors', 'gold'] as const).map((k, i) => `<span>${[ICON.sword, ICON.drop, ICON.shield, ICON.coin][i]}${['처치', '피해량', '생존 병사', '골드 효율'][i]}</span>${totals.map(t => `<strong>${k === 'gold' ? (t.gold ? (t.damage / t.gold).toFixed(2) : '0') : Math.round(t[k])}</strong>`).join('')}`).join('')}</div><p class="sq-note">골드 효율 = 누적 피해량 ÷ 사용 골드</p>${online?.result ? `<p class="sq-note sq-online-note">${esc(online.result)}</p>` : ''}<div class="sq-actions">${button('next', stage === 'result' ? (online ? '메뉴로' : '다시 대전') : '다음 라운드', 'primary')}${online ? '' : button('menu', '메뉴로')}</div></main>`;
    } else if (stage === 'wait') root.innerHTML = `<main class="wd-panel sq-card sq-cover">${title}<span class="sq-round">${roundLabel(round)}</span><h2>상대 배치를 기다리는 중</h2><p>내 진형을 제출했습니다. 상대가 배치를 마치면 바로 전투가 시작됩니다.</p><p class="sq-note">오랫동안 응답이 없으면 나가기를 두 번 눌러 기권할 수 있습니다.</p><div class="sq-actions">${button('leave', '대기 취소 · 나가기', 'ghost')}</div></main>`;
    else root.innerHTML = `<main class="wd-panel sq-card"><h2>일시정지</h2><div class="sq-actions">${button('resume', '이어하기', 'primary')}${button('menu', '모드 선택')}${button('exit', '게임 목록으로', 'ghost')}</div></main>`;
    bind();
    if (stageChanged) {
      const first = stage === 'menu' ? '#start' : stage === 'cover' ? '#uncover' : stage === 'deploy' ? '[data-unit]'
        : stage === 'battle' ? '#pause' : stage === 'pause' ? '#resume'
        : stage === 'wait' ? '#leave' : stage === 'result' || stage === 'round' ? '#next' : null;
      if (first) root.querySelector<HTMLElement>(first)?.focus({ preventScroll: true });
    } else if (keepFocus) root.querySelector<HTMLElement>(keepFocus)?.focus({ preventScroll: true });
    scheduleFrame();
  }
  function beginRound(): void { lastRosterTime = -Infinity; lastDrawTick = -1; lastBattleSecond = -1; armies = [[], []]; side = 0; battle = null; hover = null; if (online) { side = online.mine; online.sent = 0; online.deadline = Date.now() + DEPLOY_MS; online.net.clearArmy(); } stage = mode === 'local' ? 'cover' : 'deploy'; render(); if (online) { if (onlineTimer) window.clearInterval(onlineTimer); onlineTimer = window.setInterval(tickOnline, 500); tickOnline(); } }
  function startMatch(): void { score = [0, 0]; round = 1; totals = [{ kills: 0, damage: 0, survivors: 0, gold: 0 }, { kills: 0, damage: 0, survivors: 0, gold: 0 }]; beginRound(); }
  function ready(): void { if (stage !== 'deploy') return; if (!armies[side]!.length) { toast('병사를 1명 이상 배치하세요'); return; } if (online) { audio.ready(); sendArmy(); return; } if (side === 0 && mode === 'local') { side = 1; stage = 'cover'; render(); return; } if (mode === 'ai') armies[1] = buildArmy(1, difficulty, armies[0]); battle = new Battle(armies[0]!, armies[1]!, round); stage = 'battle'; audio.start(); last = 0; accumulator = 0; render(); }
  function finish(): void { if (!battle || battle.winner === null || stage !== 'battle') return; if (battle.winner !== 'draw') score[battle.winner]!++; for (const s of [0, 1] as const) { const units = battle.units.filter(u => u.side === s); totals[s]!.kills += units.reduce((n, u) => n + u.kills, 0); totals[s]!.damage += units.reduce((n, u) => n + u.damage, 0); totals[s]!.survivors += units.filter(u => u.hp > 0).length; totals[s]!.gold += cost(s); } stage = score.some(n => n >= 2) ? 'result' : 'round'; if (stage === 'result') { if (mode !== 'local') saveResult(online ? score[online.mine]! > score[1 - online.mine]! : score[0]! > score[1]!); if (online) void concludeOnline(); } const mine = online ? online.mine : 0; if (battle?.winner === 'draw') audio.click(); else if (battle?.winner === mine) audio.win(); else audio.lose(); render(); }
  function setupCanvas(canvas: HTMLCanvasElement): void {
    const cell = (e: PointerEvent | MouseEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * 12), y: Math.floor((e.clientY - r.top) / r.height * 20) }; };
    const legal = (p: { x: number; y: number }) => p.y >= (side ? 0 : 10) && p.y < (side ? 10 : 20) && p.x >= 0 && p.x < 12;
    const announce = (text: string) => { const status = root.querySelector('#sq-kb-pos'); if (status) status.textContent = text; };
    const activeCanvas = () => stage === 'deploy' && canvas.isConnected;
    let captured = false;
    // Keyboard deployment is independent of pointer capture and follows the same
    // budget, team-zone and occupancy rules as mouse/touch deployment.
    canvas.onkeydown = e => {
      if (!activeCanvas()) return;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      const move = moves[e.key], action = e.key === 'Enter' || e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace';
      if (!move && !action) return;
      e.preventDefault(); e.stopPropagation();
      // Holding Enter/Space must not alternate a deployed soldier on every key repeat.
      if (action && e.repeat) return;
      const p = hover && legal(hover) ? hover : { x: 5, y: side ? 4 : 15 };
      if (move) {
        hover = { x: Math.max(0, Math.min(11, p.x + move[0])), y: Math.max(side ? 0 : 10, Math.min(side ? 9 : 19, p.y + move[1])) };
        draw(canvas, armies, side, null, UNITS[selected].range, hover, selected);
        announce(`${hover.x + 1}열 ${hover.y + 1}행`);
        return;
      }
      hover = p;
      const before = armies[side]!;
      const existing = before.find(u => u.x === p.x && u.y === p.y);
      if (existing) {
        armies[side] = before.filter(u => u !== existing);
        audio.remove(); render(); announce(`${p.x + 1}열 ${p.y + 1}행 병사 제거됨`);
      } else if (e.key !== 'Delete' && e.key !== 'Backspace') {
        if (cost(side) + UNITS[selected].cost > BUDGET) { audio.deny(); announce('남은 골드가 부족합니다.'); return; }
        before.push({ type: selected, ...p });
        audio.place(); render(); announce(`${p.x + 1}열 ${p.y + 1}행 ${UNITS[selected].name} 배치됨`);
      } else announce(`${p.x + 1}열 ${p.y + 1}행 빈 칸입니다.`);
    };
    canvas.oncontextmenu = e => { e.preventDefault(); if (!activeCanvas()) return; const p = cell(e), before = armies[side]!; const next = before.filter(u => u.x !== p.x || u.y !== p.y); if (next.length === before.length) return; armies[side] = next; audio.remove(); render(); };
    canvas.onpointerdown = e => {
      if (!activeCanvas() || e.button !== 0 || drag) return;
      const p = cell(e);
      if (!legal(p)) { toast(side ? '위쪽 진영에만 배치할 수 있어요' : '아래쪽 아군 진영에만 배치할 수 있어요'); return; }
      captured = false;
      try { canvas.setPointerCapture?.(e.pointerId); captured = !!canvas.setPointerCapture; }
      catch { /* Some trackpads may deny capture: clicks still work on canvas. */ }
      drag = { ...p, pointerId: e.pointerId };
    };
    canvas.onpointermove = e => { if (!activeCanvas() || (drag && drag.pointerId !== e.pointerId)) return; const next = cell(e); if (next.x < 0 || next.x >= 12 || next.y < 0 || next.y >= 20) { if (hover) { hover = null; draw(canvas, armies, side, null, UNITS[selected].range, null, selected); } return; } if (hover?.x === next.x && hover?.y === next.y) return; hover = next; draw(canvas, armies, side, null, UNITS[selected].range, hover, selected); };
    canvas.onpointerleave = e => {
      if (!activeCanvas() || (drag && drag.pointerId !== e.pointerId)) return;
      if (drag && !captured) drag = null; // No pointer capture: avoid a stuck drag.
      hover = null; draw(canvas, armies, side, null, UNITS[selected].range, null);
    };
    canvas.onpointercancel = e => { if (drag?.pointerId !== e.pointerId) return; drag = null; captured = false; hover = null; if (activeCanvas()) draw(canvas, armies, side, null, UNITS[selected].range, null); };
    canvas.onlostpointercapture = e => { if (drag?.pointerId === e.pointerId) { drag = null; captured = false; } };
    canvas.onpointerup = e => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (!activeCanvas()) { drag = null; captured = false; return; }
      captured = false;
      const before = armies[side]!.length;
      const p = cell(e), from = armies[side]!.find(u => u.x === drag!.x && u.y === drag!.y);
      let changed = false;
      if (legal(p)) {
        const at = armies[side]!.find(u => u.x === p.x && u.y === p.y);
        if (from && (p.x !== drag.x || p.y !== drag.y)) {
          if (!at) { from.x = p.x; from.y = p.y; changed = true; }
        } else if (at) {
          armies[side] = armies[side]!.filter(u => u !== at); changed = true;
        } else if (cost(side) + UNITS[selected].cost <= BUDGET) {
          armies[side]!.push({ type: selected, ...p }); changed = true;
        }
      }
      drag = null;
      if (!changed) { draw(canvas, armies, side, null, UNITS[selected].range, hover, selected); return; }
      const after = armies[side]!.length;
      if (after > before) audio.place(); else if (after < before) audio.remove();
      render();
    };
  }
  /** Choosing a unit changes only the palette and preview, not the whole battlefield canvas. */
  function chooseUnit(type: UnitType): void {
    if (stage !== 'deploy' || selected === type) return;
    selected = type;
    root.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach(b => {
      const active = b.dataset.unit === selected;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    const canvas = root.querySelector('canvas');
    if (canvas) draw(canvas, armies, side, null, UNITS[selected].range, hover, selected);
  }
  /** Switch battle speed without replacing the canvas, scoreboard or keyboard focus. */
  function chooseSpeed(value: number): void {
    if (stage !== 'battle' || speed === value) return;
    speed = value;
    root.querySelectorAll<HTMLButtonElement>('[id^="speed"]').forEach(b => {
      const active = b.id === 'speed' + value;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }
  /** Bind only the controls present in the current screen. Callbacks guard
   * their expected stage because detached buttons can still receive events. */
  function bind(): void {
    const on = (id: string, fn: () => void) =>
      root.querySelector<HTMLButtonElement>('#' + id)?.addEventListener('click', fn);

    on('exit', exit);
    on('sound', () => {
      if (stage !== 'menu') return;
      audio.enabled = !audio.enabled;
      writePreferences({ ...readPreferences(), sound: audio.enabled });
      audio.click();
      render();
    });
    on('menu', () => {
      if (stage !== 'pause' && stage !== 'round' && stage !== 'result') return;
      audio.setPaused(false);
      stage = 'menu';
      battle = null;
      render();
    });
    on('start', () => {
      if (stage !== 'menu') return;
      if (mode === 'online') void openOnline();
      else startMatch();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      button.onclick = () => {
        if (stage !== 'menu') return;
        mode = button.dataset.mode as typeof mode;
        audio.click();
        render();
      };
    });
    root.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach(button => {
      button.onclick = () => {
        if (stage !== 'menu') return;
        difficulty = button.dataset.diff as Difficulty;
        audio.click();
        render();
      };
    });
    on('uncover', () => {
      if (stage !== 'cover') return;
      stage = 'deploy';
      render();
    });
    on('ready', ready);
    on('auto', () => {
      if (stage !== 'deploy') return;
      armies[side] = autoArmy(side);
      audio.place();
      render();
    });
    on('clear', () => {
      if (stage !== 'deploy') return;
      armies[side] = [];
      render();
    });
    on('pause', pause);
    on('leave', leaveClick);
    on('resume', () => {
      if (stage !== 'pause') return;
      audio.setPaused(false);
      stage = previous;
      last = 0;
      render();
    });
    on('next', () => {
      if (stage !== 'result' && stage !== 'round') return;
      if (stage === 'round') { round++; beginRound(); return; }
      if (!online) { startMatch(); return; }
      quitOnline();
      stage = 'menu';
      battle = null;
      render();
    });
    on('skip', () => {
      if (stage !== 'battle' || !battle) return;
      while (battle.winner === null) battle.step();
      finish();
    });
    for (const speed of [1, 2, 4]) on('speed' + speed, () => chooseSpeed(speed));
    root.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach(button => {
      button.onclick = () => chooseUnit(button.dataset.unit as UnitType);
    });
  }
  function toast(text: string): void { root.querySelector('.sq-toast')?.remove(); if (toastTimer) window.clearTimeout(toastTimer); const d = document.createElement('div'); d.className = 'sq-toast'; d.textContent = text; root.append(d); toastTimer = window.setTimeout(() => { d.remove(); toastTimer = 0; }, 3000); }
  async function openOnline(): Promise<void> {
    try {
      const { openLobby } = await import('../net/lobby');
      // The user can switch modes or quit while the networking module loads.
      if (closed || lobby || mode !== 'online' || stage !== 'menu') return;
      lobby = openLobby({ game: 'squad', onClose: () => { lobby = undefined; }, onMatch: s => startOnline(s) });
    } catch {
      if (!closed && mode === 'online' && stage === 'menu') toast('온라인 대전을 불러오지 못했습니다. 다시 시도해 주세요.');
    }
  }
  function startOnline(s: PvpSession): void {
    if (closed || stage !== 'menu' || mode !== 'online') return;
    // The matchmaking lobby closes itself on match, without invoking onClose.
    // Forget its stale handle so the player can queue again after this match.
    lobby = undefined;
    quitOnline();
    let net: SquadPvp;
    try {
      net = new SquadPvp(s, {
        onArmy: (r, a) => { const o = online; if (o?.net === net && !o.incoming.has(r)) { o.incoming.set(r, a); tryStart(); } },
        onGone: why => { if (online?.net === net) handleGone(why); },
      });
    } catch {
      toast('온라인 연결을 열지 못했습니다. 다시 시도해 주세요.');
      return;
    }
    online = { s, net, mine: s.host ? 0 : 1, incoming: new Map(), sent: 0, deadline: 0, leaving: -Infinity, done: false, result: '', settleTimer: 0, wakeSettle: null };
    mode = 'online'; startMatch();
  }
  /** 내 배치를 제출하고, 상대 배치가 이미 와 있으면 바로 전투를 시작합니다. */
  function sendArmy(): void {
    const o = online; if (!o || stage !== 'deploy' || o.sent === round) return;
    o.sent = round; if (onlineTimer) window.clearInterval(onlineTimer); onlineTimer = 0; o.net.setArmy(round, armies[o.mine]!); stage = 'wait'; render(); tryStart();
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
    if (onlineTimer) window.clearInterval(onlineTimer); onlineTimer = 0;
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
      for (let i = 0; i < 8 && row.status === 'playing' && online === o && !closed; i++) {
        await new Promise<void>(resolve => {
          o.wakeSettle = resolve;
          o.settleTimer = window.setTimeout(() => {
            o.settleTimer = 0; o.wakeSettle = null; resolve();
          }, 3000);
        });
        // Leaving the match must cancel retries without sending another request.
        if (online !== o || closed) return;
        row = await o.s.backend.settle(o.s.match.id);
      }
      const delta = o.s.host ? row.host_delta : row.guest_delta;
      show(row.status === 'finished' && delta !== null ? `레이팅 ${delta >= 0 ? '+' : ''}${delta}` : row.status === 'void' ? '두 쪽의 보고가 달라 이 대전은 기록되지 않았습니다.' : '결과가 아직 확정되지 않았습니다.');
    } catch { show('기록을 저장하지 못했습니다. 네트워크를 확인해 주세요.'); }
  }
  function leaveOnline(finished: boolean): void {
    const o = online; online = null;
    if (onlineTimer) window.clearInterval(onlineTimer);
    onlineTimer = 0;
    if (!o) return;
    if (o.settleTimer) window.clearTimeout(o.settleTimer);
    o.settleTimer = 0; const wake = o.wakeSettle; o.wakeSettle = null;
    wake?.();
    o.net.dispose(finished);
  }
  /** 온라인에서 나갑니다. 끝나기 전에 나가면 기권패로 보고합니다. */
  function quitOnline(): void {
    const o = online; if (!o) return;
    const fin = stage === 'result' || o.done;
    if (!fin && o.net.heard) void o.s.backend.report(o.s.match.id, o.s.opponent.id).catch(() => undefined);
    leaveOnline(fin);
  }
  function leaveClick(): void {
    const o = online; if (!o) return;
    const now = performance.now();
    if (now - o.leaving < 3000) { quitOnline(); stage = 'menu'; battle = null; render(); return; }
    o.leaving = now; toast(o.done || stage === 'result' ? '한 번 더 누르면 메뉴로 나갑니다.' : '한 번 더 누르면 기권하고 나갑니다.');
  }
  function pause(): void { if (online && stage !== 'menu') { leaveClick(); return; } if (stage !== 'deploy' && stage !== 'battle') return; previous = stage; stage = 'pause'; audio.setPaused(true); render(); }
  function key(e: KeyboardEvent): void {
    if (e.repeat || e.defaultPrevented || (e.target instanceof Element && e.target.closest('.pvp-root, input, textarea, select, [contenteditable="true"]'))) return;
    if (e.key === 'Escape') { e.preventDefault(); if (stage === 'pause') { audio.setPaused(false); stage = previous; last = 0; render(); } else if (stage === 'menu') exit(); else pause(); } else if (stage === 'deploy' && /^[1-5]$/.test(e.key)) { chooseUnit(TYPES[Number(e.key) - 1]!); } else if (stage === 'deploy' && (e.key === ' ' || e.key === 'Enter') && !(e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, [contenteditable]'))) { e.preventDefault(); ready(); } }
  function exit(): void { if (closed) return; closed = true; audio.dispose(); quitOnline(); lobby?.close(); if (toastTimer) window.clearTimeout(toastTimer); toastTimer = 0; cancelAnimationFrame(raf); window.removeEventListener('keydown', key); root.remove(); onExit(); }
  function paintBattleStatus(b: Battle): void {
    const seconds = Math.floor(b.tick / 30);
    if (seconds === lastBattleSecond) return;
    lastBattleSecond = seconds;
    const label = root.querySelector('.sq-battlebar span');
    const text = `경과 ${seconds}초 / 60초`;
    if (label && label.textContent !== text) label.textContent = text;

    // Screen readers get a concise soldier count, no more than once per five seconds.
    if (seconds % 5 !== 0) return;
    const counts = [0, 0];
    for (const soldier of b.units) if (soldier.hp > 0) counts[soldier.side]!++;
    const status = root.querySelector('#sq-battle-status');
    const report = `전투 ${seconds}초, 파랑 ${counts[0]}명, 빨강 ${counts[1]}명 생존`;
    if (status && status.textContent !== report) status.textContent = report;
  }
  function paintBattleFrame(b: Battle, now: number): void {
    const canvas = root.querySelector('canvas');
    if (canvas && b.tick !== lastDrawTick) {
      draw(canvas, armies, side, b, 0, null);
      lastDrawTick = b.tick;
    }
    // Updating by real time keeps the DOM refresh at 5 Hz, even at 4× speed.
    if (now - lastRosterTime >= 200) {
      lastRosterTime = now;
      const roster = root.querySelector<HTMLElement>('.sq-roster');
      if (roster) updateRoster(roster, b);
    }
    paintBattleStatus(b);
  }
  function frame(now: number): void {
    raf = 0;
    if (closed) return;
    if (stage !== 'battle' || !battle) {
      last = 0;
      scheduleFrame();
      return;
    }
    if (!Number.isFinite(now)) { scheduleFrame(); return; }
    const activeBattle = battle;
    if (last && now > last) accumulator += Math.min(0.1, (now - last) / 1000) * speed;
    last = now;
    while (accumulator >= STEP && activeBattle.winner === null) {
      activeBattle.step();
      accumulator -= STEP;
      audio.battle(activeBattle.effects, now);
    }
    if (activeBattle.winner !== null) {
      finish(); // Transitions to the result screen and stops animation.
      return;
    }
    paintBattleFrame(activeBattle, now);
    scheduleFrame();
  }
  window.addEventListener('keydown', key); render();
}
