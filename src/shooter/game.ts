// ZERO ZONE — 배틀로열 총게임 화면: 출격 설정, 조작(키보드·마우스·터치), HUD, 솔로(AI 99명)와 1대1 온라인 대전의 진행.
import './shooter.css';
import { readPreferences } from '../prefs';
import type { LoadingScreen } from '../loading';
import type { PvpSession } from '../net/lobby';
import { BOTS, BR_FILL, DIFFICULTIES, PLAYER, WEAPONS, type Difficulty } from './config';
import { Match, type MatchEvent, type Player } from './sim';
import { ShooterView } from './view';
import { loadShooterAssets, type ShooterAssets } from './assets';
import { ShooterAudio } from './audio';
import { ShooterNet, decideDeath, seedOf, type Pose } from './net';
import { readShooterCareer, recordShooterMatch, writeShooterCareer } from './records';

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
type Phase = 'setup' | 'loading' | 'countdown' | 'play' | 'dead' | 'over';
interface Pvp { s: PvpSession; net: ShooterNet; opp: Player | null; target: Pose | null; done: boolean; deadAt: number | null; oppDeadMt: number | null; seed: number; begun: boolean }

export interface OpenOptions { loading?: LoadingScreen }

export function openShooter(onExit: () => void, opts: OpenOptions = {}): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches, base = import.meta.env.BASE_URL;
  const root = document.createElement('div'); root.className = 'sz-root' + (touch ? ' touch' : '');
  root.innerHTML = `
    <canvas class="sz-canvas"></canvas>
    <div class="sz-hud" hidden>
      <div class="sz-vig" id="sz-vig"></div><div class="sz-zonefx" id="sz-zonefx"></div><div class="sz-scope" id="sz-scope"></div>
      <div class="sz-tl"><div class="sz-stat"><b id="sz-alive">${BR_FILL}</b><span>생존</span></div><div class="sz-stat"><b id="sz-kills">0</b><span>처치</span></div></div>
      <div class="sz-tc" id="sz-zone"><b id="sz-ztime">0:00</b><span id="sz-zlabel">자기장</span></div>
      <div class="sz-tr"><canvas id="sz-map" width="300" height="300"></canvas><ul class="sz-feed" id="sz-feed"></ul></div>
      <div class="sz-cross" id="sz-cross"><i></i><i></i><i></i><i></i></div><div class="sz-hitmark" id="sz-hitmark"><i></i><i></i><i></i><i></i></div>
      <div class="sz-dmgs" id="sz-dmgs"></div>
      <div class="sz-banner" id="sz-banner"></div><div class="sz-count" id="sz-count"></div><div class="sz-prompt" id="sz-prompt"></div>
      <div class="sz-bl"><div class="sz-bar hp"><i id="sz-hp"></i><b id="sz-hpn">100</b></div><div class="sz-bar ar"><i id="sz-ar"></i><b id="sz-arn">0</b></div></div>
      <div class="sz-br"><div class="sz-wname" id="sz-wname"></div><div class="sz-ammo"><b id="sz-mag">0</b><span id="sz-res">/ 0</span></div><div class="sz-slots" id="sz-slots"></div></div>
      <div class="sz-keys" id="sz-keys"></div>
      <div class="sz-tbtn"><button id="sz-pause" type="button" aria-label="일시정지">Ⅱ</button></div>
      <div class="sz-touchpad"><div class="sz-stick" id="sz-stick"><i></i></div><div class="sz-tbuttons">
        <button data-act="fire" class="fire" type="button">사격</button><button data-act="ads" type="button">조준</button><button data-act="reload" type="button">장전</button><button data-act="interact" type="button">줍기</button><button data-act="swap" type="button">교체</button><button data-act="jump" type="button">점프</button><button data-act="crouch" type="button">앉기</button></div></div>
    </div>
    <div class="sz-setup" id="sz-setup"></div>
    <div class="sz-modal" id="sz-modal"></div>`;
  document.body.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const canvas = q<HTMLCanvasElement>('.sz-canvas'), hud = q('.sz-hud'), setupEl = q('#sz-setup'), modal = q('#sz-modal'), mapCv = q<HTMLCanvasElement>('#sz-map'), mapCtx = mapCv.getContext('2d')!;
  const audio = new ShooterAudio(); audio.enabled = prefs.sound;
  const career = readShooterCareer();
  let level: Difficulty = (DIFFICULTIES as string[]).includes(career.level) ? (career.level as Difficulty) : 'normal', pickMode: 'solo' | 'pvp' = 'solo';

  let phase: Phase = 'setup', closed = false, paused = false, match: Match | null = null, view: ShooterView | null = null, meIdx = 0, pvp: Pvp | null = null, raf = 0, last = performance.now();
  let assets: ShooterAssets | null = null, assetState: 'loading' | 'ready' | 'failed' = 'loading', assetPct = 0;
  let countdown = 0, over = false, deadTimer = 0, resultShown = false, spectateId = -1;
  let yaw = 0, pitch = 0, locked = false, lockFail = false, hitT = 0, hitHead = false, bannerT = 0, mapBase: HTMLCanvasElement | null = null;
  const keys = new Set<string>(), mouse = { fire: false, ads: false }, tc = { fire: false, ads: false, jump: false, crouch: false, move: { x: 0, y: 0, id: -1, ox: 0, oy: 0 }, look: { id: -1, x: 0, y: 0 } };
  let reloadReq = false, slotReq = -1, swapReq = false, interactHeld = false;
  const feed: Array<{ text: string; at: number; mine: boolean }> = [];
  const cache = new Map<string, string>();
  const set = (el: HTMLElement, key: string, text: string): void => { if (cache.get(key) !== text) { cache.set(key, text); el.textContent = text; } };
  const html = (el: HTMLElement, key: string, v: string): void => { if (cache.get(key) !== v) { cache.set(key, v); el.innerHTML = v; } };
  const me = (): Player => match!.players[meIdx];

  // ---------- 자산(백그라운드로 받기) ----------
  const loading = opts.loading;
  void loadShooterAssets(base, f => { assetPct = f; loading?.progress(f, '3D 모델을 불러오는 중'); if (phase === 'setup') paintSetup(); }, n => loading?.note(n)).then(a => { assets = a; assetState = 'ready'; }).catch(() => { assetState = 'failed'; }).finally(() => { loading?.close(); if (phase === 'setup') paintSetup(); });

  // ---------- 출격 설정 화면 ----------
  function paintSetup(): void {
    const b = BOTS[level], wait = assetState === 'loading';
    setupEl.hidden = false; setupEl.setAttribute('role', 'dialog'); setupEl.setAttribute('aria-label', 'ZERO ZONE 출격 설정');
    setupEl.innerHTML = `
      <div class="sz-setup-inner">
        <header><span class="sz-eyebrow">ZERO ZONE</span><h2>출격 설정</h2><p>줄어드는 자기장 안에서 마지막까지 살아남으세요. 총을 줍고, 엄폐하고, 쏩니다.</p></header>
        <section><h3>모드</h3><div class="sz-seg two">
          <button type="button" class="sz-opt ${pickMode === 'solo' ? 'on' : ''}" data-mode="solo" aria-pressed="${pickMode === 'solo'}"><b>솔로 배틀로열</b><em>나 + AI ${BR_FILL - 1}명 · 마지막 1명이 승리</em></button>
          <button type="button" class="sz-opt ${pickMode === 'pvp' ? 'on' : ''}" data-mode="pvp" aria-pressed="${pickMode === 'pvp'}"><b>1대1 온라인 대전</b><em>2인 PvP · 무작위 매칭 또는 방 코드</em></button></div></section>
        <section class="${pickMode === 'pvp' ? 'dim' : ''}"><h3>AI 난이도</h3><div class="sz-seg four">${DIFFICULTIES.map(d => `<button type="button" class="sz-opt ${d === level ? 'on' : ''}" data-level="${d}" aria-pressed="${d === level}" ${pickMode === 'pvp' ? 'disabled' : ''}><b>${BOTS[d].label}</b></button>`).join('')}</div>
          <p class="sz-note">${pickMode === 'pvp' ? '온라인 대전은 사람끼리 겨루므로 AI가 나오지 않습니다.' : `${b.blurb} (반응 ${b.react.toFixed(2)}초 · 시야 ${b.sight}m)`}</p></section>
        <section><h3>조작</h3><ul class="sz-help">${touch ? '<li>왼쪽 스틱 이동 · 오른쪽 드래그 시점</li><li>사격 · 조준 · 장전 · 줍기 · 교체 버튼</li>' : '<li><b>WASD</b> 이동 · <b>Shift</b> 달리기 · 마우스 시점</li><li><b>좌클릭</b> 사격 · <b>우클릭</b> 조준 · <b>R</b> 장전</li><li><b>Space</b> 점프(수송기에서는 뛰어내리기) · <b>C</b> 앉기 · <b>E</b> 무기 줍기 · <b>1 / 2 / 휠</b> 무기 교체 · <b>Esc</b> 일시정지</li><li>낙하 중 <b>W</b> 앞으로 · 마우스를 아래로 + <b>W</b> 급강하 · 땅이 가까워지면 낙하산이 저절로 펴집니다.</li>'}<li>탄약·구급상자·방탄복은 닿으면 자동으로 줍습니다.</li></ul></section>
        <footer><button type="button" class="ghost" data-act="exit">메뉴로</button><span class="sz-sum">${career.matches ? `전적 ${career.matches}판 ${career.wins}승 · 최다 처치 ${career.bestKills}` : '첫 출격'}</span>
          <button type="button" class="primary" data-act="start" ${wait ? 'disabled' : ''}>${assetState === 'failed' ? '도형 모드로 출격' : wait ? `불러오는 중 ${Math.floor(assetPct * 100)}%` : pickMode === 'solo' ? '출격' : '상대 찾기'}</button></footer>
      </div>`;
  }
  setupEl.addEventListener('click', e => {
    const t = e.target as HTMLElement, mode = t.closest<HTMLElement>('[data-mode]'), lv = t.closest<HTMLElement>('[data-level]'), act = t.closest<HTMLElement>('[data-act]');
    if (mode) { pickMode = mode.dataset.mode as 'solo' | 'pvp'; paintSetup(); } else if (lv) { level = lv.dataset.level as Difficulty; writeShooterCareer({ ...readShooterCareer(), level }); paintSetup(); }
    else if (act?.dataset.act === 'exit') exit(); else if (act?.dataset.act === 'start') { if (pickMode === 'solo') startSolo(); else openPvpLobby(); }
  });
  paintSetup();

  // ---------- 경기 시작 ----------
  function begin(m: Match, my: number): void {
    endMatch(); match = m; meIdx = my; over = false; resultShown = false; spectateId = -1; deadTimer = 0; cache.clear(); feed.length = 0; paused = false; modal.className = 'sz-modal'; modal.innerHTML = '';
    const p = m.players[my]; yaw = p.yaw; pitch = 0; countdown = 3.4; phase = 'countdown'; mapBase = null;
    view = new ShooterView(canvas, m, assets, prefs.quality); resize(); setupEl.hidden = true; hud.hidden = false; buildSlots(); say(touch ? '왼쪽 스틱으로 이동' : '화면을 클릭해 조작 시작', 2.4);
    if (!touch) lock(); audio.unlock();
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__zz = { get match() { return match; }, get phase() { return phase; }, me, skip, view, go: () => { countdown = Math.min(countdown, 0.45); }, fire: (on: boolean) => { mouse.fire = on; }, ads: (on: boolean) => { mouse.ads = on; }, look: (y: number, p: number) => { yaw = y; pitch = p; } };
  }
  function startSolo(): void {
    audio.unlock(); pvp = null; const seed = (Math.random() * 2 ** 31) >>> 0;
    begin(new Match({ seed, mode: 'br', difficulty: level, humans: [{ name: '나' }] }), 0);
  }

  // ---------- 1대1 대전 ----------
  function openPvpLobby(): void {
    void import('../net/lobby').then(({ openLobby }) => openLobby({ game: 'shooter', config: () => ({ seed: (Math.random() * 2 ** 31) >>> 0, mode: 'duel' }), onMatch: startPvp, onClose: () => undefined }))
      .catch(() => { setupEl.querySelector('.sz-note')!.textContent = '대전 화면을 불러오지 못했습니다. 네트워크를 확인해 주세요.'; });
  }
  function card(eyebrow: string, title: string, body = '', actions = '<button data-act="exit">메뉴로</button>', cls = ''): void {
    modal.className = 'sz-modal show'; modal.innerHTML = `<div class="sz-card ${cls}"><span class="sz-eyebrow">${eyebrow}</span><h2>${title}</h2>${body}<div class="sz-actions">${actions}</div></div>`;
  }
  function startPvp(s: PvpSession): void {
    endPvp(); endMatch(); setupEl.hidden = true; hud.hidden = true; phase = 'loading';
    card('1대1 대전', `${esc(s.opponent.nickname)} 님과 연결하는 중…`, '<p class="sz-sub">상대가 들어오면 바로 시작합니다.</p>', '<button data-act="exit">나가기</button>');
    const seed = seedOf(s.match.config, s.match.id);
    const net: ShooterNet = new ShooterNet(s, {
      onStart: () => beginPvp(),
      onPose: p => { if (pvp) pvp.target = p; },
      onShot: sh => {
        if (!pvp?.opp || !match) return; const aims: Array<[number, number]> = [];
        for (let i = 0; i + 2 < sh.ends.length; i += 3) { const dx = sh.ends[i] - sh.ox, dy = sh.ends[i + 1] - sh.oy, dz = sh.ends[i + 2] - sh.oz; aims.push([Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz))]); }
        pvp.opp.muzzle = 0.06; pvp.opp.kick = Math.min(1, pvp.opp.kick + 0.3); match.remoteShot(pvp.opp.id, sh.w, sh.ox, sh.oy, sh.oz, aims);
      },
      onHitAck: () => { /* 명중 표시는 내 쪽 판정으로 이미 보여 줬습니다 */ },
      onPickup: id => { match?.removeLoot(id); },
      onDead: mt => { if (!pvp || !match || !pvp.opp) return; pvp.oppDeadMt = mt; if (pvp.opp.alive) match.kill(pvp.opp, me().id, 'rifle'); if (pvp.deadAt !== null) settleTie(); else void conclude(pvp.s.me.id, '상대를 쓰러뜨렸습니다'); },
      onGone: reason => { if (pvp && !pvp.done) void conclude(pvp.s.me.id, reason === 'never' ? '상대가 접속하지 않았습니다' : '상대와의 연결이 끊어졌습니다'); },
    });
    pvp = { s, net, opp: null, target: null, done: false, deadAt: null, oppDeadMt: null, seed, begun: false };
  }
  function beginPvp(): void {
    if (!pvp || closed || pvp.begun) return; pvp.begun = true; const s = pvp.s, host = s.host;
    const names = host ? [s.me.nickname, s.opponent.nickname] : [s.opponent.nickname, s.me.nickname];
    const m = new Match({ seed: pvp.seed, mode: 'duel', difficulty: 'normal', humans: [{ name: names[0], remote: !host }, { name: names[1], remote: host }] });
    pvp.opp = m.players[host ? 1 : 0]; begin(m, host ? 0 : 1);
  }
  /** 내가 쓰러진 뒤 상대 소식을 잠깐 기다려 동시 사망을 가립니다. */
  function settleTie(): void {
    if (!pvp || pvp.done || pvp.deadAt === null) return;
    if (pvp.oppDeadMt === null) { window.setTimeout(() => { if (pvp && !pvp.done && pvp.oppDeadMt === null) void conclude(pvp.s.opponent.id, '상대의 탄에 쓰러졌습니다'); }, 1100); return; }
    const w = decideDeath(pvp.deadAt, pvp.oppDeadMt, pvp.s.host); void conclude(w === 'me' ? pvp.s.me.id : pvp.s.opponent.id, '두 선수가 거의 동시에 쓰러졌습니다');
  }
  /** 승자를 서버에 보고하고 확정된 레이팅 변화를 보여 줍니다(승리 보고는 상대의 보고나 15초 뒤에 확정). */
  async function conclude(winner: string, why: string): Promise<void> {
    if (!pvp || pvp.done) return; pvp.done = true; over = true; phase = 'over'; const p = pvp, win = winner === p.s.me.id, eyebrow = `1대1 대전 · vs ${esc(p.s.opponent.nickname)}`;
    audio.play(win ? 'win' : 'lose'); if (document.pointerLockElement) document.exitPointerLock();
    const show = (extra: string, actions = '', voided = false, won = win): void => { if (!closed && pvp === p) card(eyebrow, voided ? '무효' : won ? '승리' : '패배', `<p class="sz-sub">${why}</p><p class="sz-sub">${extra}</p>`, actions || '<button data-act="exit">메뉴로</button>', won && !voided ? 'win' : ''); };
    show('결과를 기록하는 중…');
    try {
      let row = await p.s.backend.report(p.s.match.id, winner);
      for (let i = 0; i < 8 && row.status === 'playing' && pvp === p && !closed; i++) { await new Promise(r => window.setTimeout(r, 3000)); row = await p.s.backend.settle(p.s.match.id); }
      if (closed || pvp !== p) return;
      const d = p.s.host ? row.host_delta : row.guest_delta, after = row.status === 'finished' && d !== null ? `레이팅 ${d >= 0 ? '+' : ''}${d}` : row.status === 'void' ? '두 쪽의 보고가 달라 이 대전은 기록되지 않았습니다.' : '결과가 아직 확정되지 않았습니다.';
      show(after, '<button class="primary" data-act="rematch">다시 대전</button><button data-act="exit">메뉴로</button>', row.status === 'void', row.status === 'finished' ? row.winner_id === p.s.me.id : win);
    } catch { show('기록을 저장하지 못했습니다. 네트워크를 확인해 주세요.'); }
  }
  function leavePvp(): void {
    const p = pvp; if (!p) return;
    if (!p.done && p.net.started) { p.net.bye(); void p.s.backend.report(p.s.match.id, p.s.opponent.id).catch(() => undefined); } else if (!p.done) void p.s.backend.cancelMatch(p.s.match.id).catch(() => undefined);
    endPvp();
  }
  function endPvp(): void { pvp?.net.dispose(); pvp = null; }
  function endMatch(): void { view?.dispose(); view = null; match = null; }

  // ---------- 조작 ----------
  const sens = (): number => 0.0023 / (view && me().ads ? Math.max(1, 78 / view.fov) * 0.9 : 1);
  function lock(): void { if (touch || locked || lockFail || closed) return; try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => { lockFail = true; }); } catch { lockFail = true; } }
  document.addEventListener('pointerlockchange', onLock);
  function onLock(): void {
    locked = document.pointerLockElement === canvas;
    if (!locked && (phase === 'play' || phase === 'countdown') && !pvpRunning() && !closed) setPause(true);
    else if (!locked && pvpRunning() && !closed) say('클릭하면 조작이 돌아옵니다', 2);
  }
  const pvpRunning = (): boolean => !!pvp && !pvp.done && !!match;
  function look(dx: number, dy: number): void { const k = sens(); yaw += dx * k; pitch = clamp(pitch - dy * k, -1.4, 1.4); }
  const onMove = (e: MouseEvent): void => { if (!match || closed || paused) return; if (locked) look(e.movementX, e.movementY); else if (lockFail && (e.buttons & 2)) look(e.movementX, e.movementY); };
  const onDown = (e: MouseEvent): void => {
    if (closed || !match || e.target !== canvas) return; audio.unlock();
    if (!locked && !lockFail && !touch) { lock(); if (paused) setPause(false); return; }
    if (e.button === 0) mouse.fire = true; else if (e.button === 2) mouse.ads = true;
  };
  const onUp = (e: MouseEvent): void => { if (e.button === 0) mouse.fire = false; else if (e.button === 2) mouse.ads = false; };
  const onKey = (e: KeyboardEvent): void => {
    if (closed || e.repeat && e.type === 'keydown' && ['KeyR', 'KeyE'].includes(e.code)) return;
    if (e.type === 'keyup') { keys.delete(e.code); if (e.code === 'KeyE') interactHeld = false; return; }
    keys.add(e.code);
    if (e.code === 'KeyR') reloadReq = true; else if (e.code === 'KeyE') interactHeld = true; else if (e.code === 'Digit1') slotReq = 0; else if (e.code === 'Digit2') slotReq = 1; else if (e.code === 'KeyQ') swapReq = true;
    else if (e.code === 'Escape' && phase === 'countdown') setPause(true);
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) && match) e.preventDefault();
  };
  const onWheel = (e: WheelEvent): void => { if (match && !paused && Math.abs(e.deltaY) > 4) swapReq = true; };
  const noMenu = (e: Event): void => e.preventDefault();
  window.addEventListener('mousemove', onMove); window.addEventListener('mousedown', onDown); window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); window.addEventListener('wheel', onWheel, { passive: true }); canvas.addEventListener('contextmenu', noMenu);
  const blur = (): void => { keys.clear(); mouse.fire = mouse.ads = false; }; window.addEventListener('blur', blur);

  // 터치: 왼쪽 절반은 이동 스틱, 오른쪽 절반 드래그는 시점
  const stickEl = q('#sz-stick');
  function stickFrom(x: number, y: number): void { const m = tc.move, dx = x - m.ox, dy = y - m.oy, r = 56, d = Math.hypot(dx, dy), k = d > r ? r / d : 1; m.x = (dx * k) / r; m.y = (dy * k) / r; stickEl.firstElementChild!.setAttribute('style', `transform:translate(${dx * k}px,${dy * k}px)`); }
  const tStart = (e: PointerEvent): void => {
    if (!touch || e.pointerType !== 'touch' || !match || (e.target as HTMLElement).closest('button')) return; audio.unlock();
    if (e.clientX < innerWidth * 0.45 && tc.move.id < 0) { tc.move.id = e.pointerId; tc.move.ox = e.clientX; tc.move.oy = e.clientY; stickEl.style.cssText = `left:${e.clientX - 60}px;top:${e.clientY - 60}px;opacity:1`; stickFrom(e.clientX, e.clientY); }
    else if (e.clientX >= innerWidth * 0.45 && tc.look.id < 0) { tc.look.id = e.pointerId; tc.look.x = e.clientX; tc.look.y = e.clientY; }
  };
  const tMove = (e: PointerEvent): void => { if (e.pointerId === tc.move.id) stickFrom(e.clientX, e.clientY); else if (e.pointerId === tc.look.id) { look((e.clientX - tc.look.x) * 1.6, (e.clientY - tc.look.y) * 1.6); tc.look.x = e.clientX; tc.look.y = e.clientY; } };
  const tEnd = (e: PointerEvent): void => { if (e.pointerId === tc.move.id) { tc.move.id = -1; tc.move.x = tc.move.y = 0; stickEl.style.opacity = '0'; } else if (e.pointerId === tc.look.id) tc.look.id = -1; };
  root.addEventListener('pointerdown', tStart); root.addEventListener('pointermove', tMove); root.addEventListener('pointerup', tEnd); root.addEventListener('pointercancel', tEnd);
  root.querySelectorAll<HTMLButtonElement>('.sz-tbuttons button').forEach(b => {
    const act = b.dataset.act!;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio.unlock(); if (act === 'fire') tc.fire = true; else if (act === 'ads') tc.ads = !tc.ads; else if (act === 'reload') reloadReq = true; else if (act === 'interact') interactHeld = true; else if (act === 'swap') swapReq = true; else if (act === 'jump') tc.jump = true; else if (act === 'crouch') tc.crouch = !tc.crouch; b.classList.add('down'); });
    for (const n of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(n, () => { if (act === 'fire') tc.fire = false; else if (act === 'interact') interactHeld = false; else if (act === 'jump') tc.jump = false; if (act !== 'ads' && act !== 'crouch') b.classList.remove('down'); });
  });

  function applyInput(): void {
    const p = me(), i = p.input, kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), kz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const sx = tc.move.x, sy = -tc.move.y, active = phase === 'play';
    i.yaw = yaw; i.pitch = pitch; i.mx = active ? clamp(kx + sx, -1, 1) : 0; i.mz = active ? clamp(kz + sy, -1, 1) : 0;
    i.fire = active && (mouse.fire || tc.fire); i.ads = active && (mouse.ads || tc.ads); i.sprint = active && (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(sx, sy) > 0.92);
    i.reload = active && reloadReq; i.interact = active && interactHeld; reloadReq = false;
    i.jump = active && (keys.has('Space') || tc.jump); i.crouch = active && (keys.has('KeyC') || keys.has('ControlLeft') || tc.crouch);
    if (swapReq) { slotReq = p.guns[1 - p.cur] ? 1 - p.cur : -1; swapReq = false; } i.slot = active ? slotReq : -1; slotReq = -1;
  }

  // ---------- HUD ----------
  const say = (text: string, sec = 1.8): void => { const b = q('#sz-banner'); b.textContent = text; b.classList.add('show'); bannerT = sec; };
  function buildSlots(): void { html(q('#sz-slots'), 'slots-init', ''); }
  function addFeed(text: string, mine: boolean): void { feed.push({ text, at: performance.now(), mine }); if (feed.length > 5) feed.shift(); }
  function nameOf(id: number): string { return id < 0 ? '자기장' : match?.players[id]?.name ?? '?'; }

  function drawMap(m: Match, p: Player): void {
    const S = mapCv.width, half = m.map.half, k = S / (half * 2), px = (x: number): number => (x + half) * k, pz = (z: number): number => (z + half) * k, g = mapCtx;
    if (!mapBase) {
      mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = S; const b = mapBase.getContext('2d')!;
      b.fillStyle = '#26301f'; b.fillRect(0, 0, S, S); b.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 1; i < 8; i++) { b.fillRect((S / 8) * i, 0, 1, S); b.fillRect(0, (S / 8) * i, S, 1); }
      b.fillStyle = '#8f8c80'; for (const bd of m.map.buildings) b.fillRect(px(bd.x - bd.w / 2), pz(bd.z - bd.d / 2), Math.max(3, bd.w * k), Math.max(3, bd.d * k));
      b.fillStyle = '#3d5a2c'; for (const t of m.map.trees) b.fillRect(px(t.x) - 1, pz(t.z) - 1, 2, 2);
    }
    const z = m.zone; g.clearRect(0, 0, S, S); g.drawImage(mapBase, 0, 0);
    g.save(); g.beginPath(); g.rect(0, 0, S, S); g.arc(px(z.cx), pz(z.cz), z.r * k, 0, Math.PI * 2, true); g.fillStyle = 'rgba(40,110,255,.30)'; g.fill('evenodd'); g.restore();
    g.strokeStyle = '#6fb2ff'; g.lineWidth = 2; g.beginPath(); g.arc(px(z.cx), pz(z.cz), z.r * k, 0, Math.PI * 2); g.stroke();
    if (z.nextR < z.r - 0.5) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.arc(px(z.nextCx), pz(z.nextCz), z.nextR * k, 0, Math.PI * 2); g.stroke(); }
    for (const s of m.sounds) { if (s.by === p.id || m.t - s.t > 1.6) continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d > 110) continue; g.fillStyle = `rgba(255,70,60,${1 - (m.t - s.t) / 1.6})`; g.beginPath(); g.arc(px(s.x), pz(s.z), 5, 0, Math.PI * 2); g.fill(); }
    if (pvp?.opp?.alive && m.mode === 'duel') { /* 상대 위치는 알려 주지 않습니다 */ }
    if (m.flight) { const f = m.flight, pl = m.planeAt(m.t); g.strokeStyle = 'rgba(255,255,255,.45)'; g.setLineDash([6, 5]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(px(f.ax), pz(f.az)); g.lineTo(px(f.bx), pz(f.bz)); g.stroke(); g.setLineDash([]); if (pl) { g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(px(pl.x), pz(pl.z), 5, 0, Math.PI * 2); g.fill(); } }
    g.save(); g.translate(px(p.x), pz(p.z)); g.rotate(p.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -6); g.lineTo(-4, 0); g.lineTo(-7, 6); g.closePath(); g.stroke(); g.fill(); g.restore();
  }

  function updateHud(dt: number): void {
    const m = match!, p = me(), z = m.zone, g = p.guns[p.cur], def = g ? WEAPONS[g.id] : null, now = performance.now();
    set(q('#sz-alive'), 'alive', String(m.aliveCount())); set(q('#sz-kills'), 'kills', String(p.kills));
    const zl = m.t < m.zoneStart ? '수송기 비행 · 자기장 대기' : z.phase >= 6 ? '마지막 자기장' : z.shrinking ? `자기장 수축 중 · ${z.phase + 1}단계` : `자기장 수축까지 · ${z.phase + 1}단계`;
    set(q('#sz-ztime'), 'zt', z.timeLeft > 0 ? clock(z.timeLeft) : '--'); set(q('#sz-zlabel'), 'zl', zl); q('#sz-zone').classList.toggle('shrink', z.shrinking);
    q('#sz-hp').style.width = `${clamp(p.hp, 0, 100)}%`; set(q('#sz-hpn'), 'hpn', String(Math.ceil(Math.max(0, p.hp)))); q('#sz-ar').style.width = `${clamp(p.armor, 0, 100)}%`; set(q('#sz-arn'), 'arn', String(Math.ceil(p.armor)));
    q('.sz-bl').classList.toggle('low', p.hp < 30);
    set(q('#sz-wname'), 'wn', def ? def.name + (p.reload > 0 ? ' · 장전 중' : '') : '맨손'); set(q('#sz-mag'), 'mag', g ? String(g.mag) : '-'); set(q('#sz-res'), 'res', g ? `/ ${g.reserve}` : '');
    html(q('#sz-slots'), 'slots', p.guns.map((x, i) => `<span class="${i === p.cur ? 'on' : ''}">${i + 1} ${x ? WEAPONS[x.id].name : '비어 있음'}</span>`).join(''));
    // 조준선: 탄퍼짐에 맞춰 벌어집니다
    if (def && view) { const spread = def.spread * (p.ads ? 0.4 : 1) * (1 + Math.min(1.6, p.speed / PLAYER.walk) * 0.5) * (1 + p.kick * 0.5), px = Math.tan(spread * (def.pellets > 1 ? 2 : 1)) / Math.tan((view.fov * Math.PI) / 360) * (canvas.clientHeight / 2); q('#sz-cross').style.setProperty('--gap', `${clamp(px, 4, 90).toFixed(1)}px`); }
    q('#sz-cross').classList.toggle('hide', p.ads && g?.id === 'sniper' || !p.alive || p.air !== 0);
    // 줍기 안내
    let near: string | null = null; if (p.alive) for (const l of m.loot) { if (l.taken || l.kind !== 'weapon') continue; if (Math.hypot(l.x - p.x, l.z - p.z) < PLAYER.pickup && Math.abs(l.y - p.y) < 1.3) { near = WEAPONS[l.weapon!].name; break; } }
    q('#sz-prompt').classList.toggle('show', !!near); set(q('#sz-prompt'), 'prompt', near ? `${touch ? '줍기 버튼' : 'E'} · ${near}` : '');
    // 자기장 밖
    const out = p.air === 0 && Math.hypot(p.x - z.cx, p.z - z.cz) > z.r && p.alive; q('#sz-zonefx').classList.toggle('on', out); audio.danger(out ? 1 : 0);
    if (out) say(`자기장 밖 · 초당 -${z.dps.toFixed(1)}`, 0.4);
    // 데미지 비네트
    q('#sz-vig').style.opacity = String(clamp(p.hurt * 1.4 + (p.hp < 30 && p.alive ? 0.35 + Math.sin(now / 160) * 0.12 : 0), 0, 0.9));
    q('#sz-scope').classList.toggle('on', p.ads && g?.id === 'sniper' && p.alive);
    // 명중 표시와 배너
    hitT = Math.max(0, hitT - dt); const hm = q('#sz-hitmark'); hm.style.opacity = String(hitT > 0 ? Math.min(1, hitT * 6) : 0); hm.classList.toggle('head', hitHead);
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) q('#sz-banner').classList.remove('show'); }
    // 처치 알림
    while (feed.length && now - feed[0].at > 6000) feed.shift();
    html(q('#sz-feed'), 'feed', feed.map(f => `<li class="${f.mine ? 'mine' : ''}">${esc(f.text)}</li>`).join(''));
    q('#sz-keys').classList.toggle('hide', phase !== 'countdown' || touch);
    html(q('#sz-keys'), 'keys', phase === 'countdown' && !touch ? '<span><b>WASD</b> 이동</span><span><b>좌클릭</b> 사격</span><span><b>우클릭</b> 조준</span><span><b>E</b> 줍기</span>' : '');
    drawMap(m, p);
  }

  // ---------- 이벤트 처리 ----------
  function onEvents(events: MatchEvent[]): void {
    const m = match!, p = me();
    for (const e of events) {
      if (e.t === 'shot') {
        const s = m.players[e.id]; if (!s) continue; const dist = Math.hypot(s.x - p.x, s.z - p.z); audio.play(e.weapon, e.id === p.id ? 0 : dist);
        if (e.id === p.id && pvp?.net.started && !e.remote) pvp.net.sendShot({ w: e.weapon, ox: e.ox, oy: e.oy, oz: e.oz, ends: e.ends });
      } else if (e.t === 'hit') {
        if (e.wall) continue;
        if (e.attacker === p.id && e.victim >= 0) { hitT = 0.28; hitHead = e.head; audio.play(e.head ? 'headshot' : 'hitmark'); }
        if (e.victim === p.id) {
          audio.play('hurt'); const rel = (m.players[e.attacker] ? Math.atan2(m.players[e.attacker].z - p.z, m.players[e.attacker].x - p.x) : p.hurtYaw) - yaw, d = document.createElement('i');
          d.style.transform = `rotate(${(rel * 180) / Math.PI + 90}deg)`; q('#sz-dmgs').append(d); window.setTimeout(() => d.remove(), 900);
          if (pvp && e.attacker >= 0) pvp.net.sendAck(e.dmg, e.head);
        }
      } else if (e.t === 'kill') {
        const mine = e.attacker === p.id, text = e.attacker < 0 ? `${nameOf(e.victim)} 자기장에 쓰러짐` : e.victim === e.attacker ? `${nameOf(e.victim)} 쓰러짐` : `${nameOf(e.attacker)} → ${nameOf(e.victim)}${e.weapon !== 'zone' ? ` [${WEAPONS[e.weapon].name}]` : ''}`;
        addFeed(text, mine || e.victim === p.id);
        if (mine) { audio.play('kill'); say(`처치 · ${nameOf(e.victim)}`, 1.4) }
        if (e.victim === p.id) onMyDeath(e.attacker);
      } else if (e.t === 'pickup') {
        if (e.id === p.id) { audio.play(e.kind === 'medkit' ? 'heal' : e.kind === 'armor' ? 'armor' : 'pickup'); say(e.kind === 'weapon' ? `${WEAPONS[e.weapon!].name} 획득` : e.kind === 'medkit' ? '구급상자 +' : e.kind === 'armor' ? '방탄복 +' : '탄약 +', 1.1); if (pvp && e.loot < m.map.loot.length) pvp.net.sendPickup(e.loot); }
      } else if (e.t === 'reload') { if (e.id === p.id) audio.play('reload'); }
      else if (e.t === 'empty') { if (e.id === p.id) audio.play('empty'); }
      else if (e.t === 'jump') { if (e.id === p.id) say('자유 낙하 · W 로 앞으로, 마우스를 아래로 + W 로 급강하', 2.6); }
      else if (e.t === 'chute') { if (e.id === p.id) say('낙하산 펼침 · W 로 활공, A/D 로 방향 조절', 2.8); }
      else if (e.t === 'land') { if (e.id === p.id) say('착지 · E 로 무기를 줍고 자기장 안으로', 2.4); }
      else if (e.t === 'over') { onOver(e.winner); }
    }
  }
  function onMyDeath(by: number): void {
    phase = 'dead'; deadTimer = 0; spectateId = by >= 0 && match!.players[by]?.alive ? by : -1; mouse.fire = mouse.ads = false; tc.fire = false; audio.play('lose');
    if (pvp) { pvp.deadAt = match!.t; pvp.net.sendDead(match!.t); settleTie(); }
  }
  function onOver(winner: number): void {
    over = true; if (pvp) return;
    const p = me(); if (phase !== 'dead') phase = 'over'; const win = winner === p.id; if (win) audio.play('win');
    if (!resultShown) { resultShown = true; window.setTimeout(() => showResult(win), win ? 1400 : 300); }
  }
  function showResult(win: boolean): void {
    if (closed || !match) return; const p = me(), t = match.t, rank = win ? 1 : p.place; if (document.pointerLockElement) document.exitPointerLock();
    recordShooterMatch(win, p.kills);
    card('ZERO ZONE', win ? '최후의 1인' : `#${rank}`, `<p class="sz-big">${win ? '승리' : `${match.players.length}명 중 ${rank}위`}</p><div class="sz-stats"><div><b>${p.kills}</b><span>처치</span></div><div><b>${clock(win ? t : p.diedAt)}</b><span>생존 시간</span></div><div><b>${BOTS[level].label}</b><span>난이도</span></div></div>`,
      `<button class="primary" data-act="again">다시 출격</button>${!win && !match.over ? '<button data-act="spectate">관전 계속</button><button data-act="skip">결과까지 건너뛰기</button>' : ''}<button data-act="setup">설정으로</button><button data-act="exit">메뉴로</button>`, win ? 'win' : '');
  }

  /** 시뮬레이션을 화면 없이 끝까지 돌립니다(내가 쓰러진 뒤 결과만 보고 싶을 때). */
  function skip(maxSeconds = 600): void { const m = match; if (!m) return; for (let t = 0; t < maxSeconds && !m.over; t += 1 / 30) { m.step(1 / 30); m.drain(); } if (m.over) onOver(m.winner); }

  // ---------- 일시정지·메뉴 ----------
  function setPause(on: boolean): void {
    if (pvpRunning() || (phase !== 'play' && phase !== 'countdown') || closed) return; paused = on;
    if (on) { mouse.fire = mouse.ads = false; card('PAUSED', '일시정지', '', '<button class="primary" data-act="resume">계속하기</button><button data-act="again">처음부터</button><button data-act="setup">설정 변경</button><button data-act="exit">메뉴로</button>'); }
    else { modal.className = 'sz-modal'; modal.innerHTML = ''; if (!touch) lock(); }
  }
  q('#sz-pause').addEventListener('click', () => { if (pvpRunning()) { say('대전 중에는 멈출 수 없습니다', 1.4); return; } setPause(true); });
  modal.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act; if (!a) return; audio.unlock();
    if (a === 'resume') setPause(false);
    else if (a === 'again') { startSolo(); }
    else if (a === 'setup') { endMatch(); hud.hidden = true; modal.className = 'sz-modal'; modal.innerHTML = ''; phase = 'setup'; paused = false; setupEl.hidden = false; paintSetup(); }
    else if (a === 'spectate') { modal.className = 'sz-modal'; modal.innerHTML = ''; resultShown = false; }
    else if (a === 'skip') { modal.className = 'sz-modal'; skip(); }
    else if (a === 'rematch') { leavePvpSilently(); endMatch(); hud.hidden = true; modal.className = 'sz-modal'; modal.innerHTML = ''; phase = 'setup'; setupEl.hidden = false; pickMode = 'pvp'; paintSetup(); openPvpLobby(); }
    else if (a === 'exit') exit();
  });
  function leavePvpSilently(): void { endPvp(); }

  // ---------- 매 프레임 ----------
  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!match || !view) return;
    const m = match, p = me();
    if (phase === 'countdown' && !paused) {
      countdown -= dt; const c = Math.ceil(countdown - 0.4), el = q('#sz-count');
      if (c > 0) { set(el, 'cd', String(c)); el.classList.add('show'); } else { set(el, 'cd', '출격'); }
      if (countdown <= 0.4 && phase === 'countdown') { phase = 'play'; q('#sz-count').classList.remove('show'); audio.play('go'); say(m.flight ? 'Space 로 수송기에서 뛰어내리세요' : '마지막까지 살아남으세요', 3) }
      p.input.yaw = yaw; p.input.pitch = pitch;
    }
    if ((phase === 'play' || phase === 'dead' || phase === 'over') && !paused) {
      if (phase === 'play') applyInput();
      // 고정 간격(1/60)으로 진행: 프레임이 느려도 시뮬레이션 속도는 같습니다
      let left = dt; while (left > 1e-6) { const s = Math.min(1 / 60, left); left -= s; if (pvp && pvp.opp) syncRemote(s); m.step(s); }
      if (pvp?.net.started && phase === 'play') pvp.net.sendPose({ x: p.x, z: p.z, y: p.y, crouch: p.crouch, yaw: p.yaw, pitch: p.pitch, hp: p.hp, armor: p.armor, w: p.guns[p.cur]?.id ?? 'pistol', speed: p.speed, ads: p.ads, reloading: p.reload > 0 }, now);
      const ev = m.drain(); if (ev.length) { view.handle(ev, p); onEvents(ev); }
    }
    if (phase === 'dead') {
      deadTimer += dt;
      if (spectateId < 0 || !m.players[spectateId]?.alive) { const alive = m.players.filter(x => x.alive && x.id !== p.id); spectateId = alive.length ? alive[Math.floor(m.t) % alive.length].id : -1; }
      if (!pvp && !resultShown && !over && deadTimer > 1.8) { resultShown = true; showResult(false); }
    }
    const spectate = phase === 'dead' || (phase === 'over' && !p.alive) ? m.players[spectateId] ?? null : null;
    const gun = p.guns[p.cur], zoom = p.ads && p.alive ? (gun?.id === 'sniper' ? 3.4 : gun?.id === 'rifle' ? 1.5 : 1.3) : 1;
    view.frame(dt, p, spectate && spectate.alive ? spectate : null, zoom); updateHud(dt); if (phase === 'dead' && !spectate) q('#sz-prompt').classList.remove('show');
  }
  /** 상대(원격) 선수를 마지막으로 받은 위치로 부드럽게 따라가게 합니다. */
  function syncRemote(dt: number): void {
    const o = pvp!.opp!, t = pvp!.target; if (!t || !o.alive) return; const k = Math.min(1, dt * 14);
    o.x += (t.x - o.x) * k; o.z += (t.z - o.z) * k; o.y += (t.y - o.y) * k; o.crouch = t.crouch; let dy = t.yaw - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * k; o.pitch += (t.pitch - o.pitch) * k;
    o.hp = t.hp; o.armor = t.armor; o.speed = t.speed; o.walk += t.speed * dt; o.ads = t.ads; o.reload = t.reloading ? 1 : 0;
    if (o.guns[0]?.id !== t.w) o.guns[0] = { id: t.w, mag: 1, reserve: 0 }; o.cur = 0;
  }

  function resize(): void { view?.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); }
  window.addEventListener('resize', resize);

  function exit(): void {
    if (closed) return; closed = true; cancelAnimationFrame(raf); leavePvp(); if (document.pointerLockElement) document.exitPointerLock(); loading?.close();
    for (const [t, f] of [['mousemove', onMove], ['mousedown', onDown], ['mouseup', onUp], ['keydown', onKey], ['keyup', onKey], ['wheel', onWheel], ['resize', resize], ['blur', blur]] as const) window.removeEventListener(t, f as EventListener);
    document.removeEventListener('pointerlockchange', onLock); endMatch(); audio.dispose(); root.remove(); onExit();
  }
  raf = requestAnimationFrame(frame);
}
