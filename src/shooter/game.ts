// ZERO ZONE — 배틀로열 총게임 화면: 출격 설정, 조작(키보드·마우스·터치), HUD, 솔로(AI 99명, 비행기 낙하)와 1대1 온라인 대전의 진행.
import '../shared/ui.css';
import './shooter.css';
import { readPreferences, writeSound } from '../prefs';
import { loadModule, type LoadingScreen } from '../loading';
import type { PvpSession, RoomSession } from '../net/lobby';
import { AIR, BAG_MAX, BOTS, FEEL, BR_PLAYERS, DIFFICULTIES, HELMET_NAMES, ARMOR_NAMES, HEAL, PARTS, PLAYER, VEHICLES, WEAPONS, adsSpread, partHandling, type Difficulty } from './config';
import { waterDepth } from './terrain';
import { Match, type Cause, type MatchEvent, type Player, type Vehicle } from './sim';
import { CAUSES, WorldSync, easePuppet, encodeLoot, parseLoot } from './sync';
import type { NetMsg } from '../net/types';
import { ShooterView } from './view';
import { loadShooterAssets, type ShooterAssets } from './assets';
import { ShooterAudio } from './audio';
import { ShooterNet, decideDeath, nadeMsg, parseNade, seedOf, type Pose } from './net';
import { ShooterRoomNet, ROOM_MAX } from './room';
import { ChatBox } from './chat';
import { openGunsmith } from './gunsmith';
import { ICON_DEFS, gearIcon } from './icons';
import { readShooterCareer, recordShooterMatch, writeShooterCareer } from './records';
import { PVP_ENABLED } from '../net/config';

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const CAUSE_NAME = { zone: '자기장', grenade: '수류탄', vehicle: '차량', bomb: '폭격' } as const;
/** 처치 알림·결과 화면에 쓰는 이름: 무기 이름 또는 자기장·수류탄·차량·폭격 */
const causeName = (w: Cause): string => (w in CAUSE_NAME ? CAUSE_NAME[w as keyof typeof CAUSE_NAME] : WEAPONS[w as keyof typeof WEAPONS].name);
/** 멀티플레이 방의 AI 채우기 선택지(0 = 사람만) */
const ROOM_FILLS = [0, 30, 60, 100] as const;
const CLICK_HINT = '클릭하여 조작 시작';
type Phase = 'setup' | 'loading' | 'countdown' | 'play' | 'dead' | 'over';
interface Room { s: RoomSession; net: ShooterRoomNet; remotes: Map<number, { p: Player; target: Pose | null }>; chat: ChatBox | null; done: boolean; seed: number; mine: number; shown: boolean; sync: WorldSync }
interface Pvp { s: PvpSession; net: ShooterNet; opp: Player | null; target: Pose | null; done: boolean; deadAt: number | null; oppDeadMt: number | null; seed: number; begun: boolean }

export interface OpenOptions { loading?: LoadingScreen }

export function openShooter(onExit: () => void, opts: OpenOptions = {}): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches, base = import.meta.env.BASE_URL;
  const root = document.createElement('div'); root.className = 'sz-root' + (touch ? ' touch' : ''); root.style.setProperty('--wd-hue', '#b8cf91');
  root.innerHTML = `
    ${ICON_DEFS}<canvas class="sz-canvas"></canvas>
    <div class="sz-hud" hidden>
      <div class="sz-vig" id="sz-vig"></div><div class="sz-zonefx" id="sz-zonefx"></div><div class="sz-redfx" id="sz-redfx"></div><div class="sz-flashfx" id="sz-flashfx"></div><div class="sz-scope" id="sz-scope"></div>
      <div class="sz-tl"><div class="sz-stat"><b id="sz-alive">100</b><span>생존</span></div><div class="sz-stat"><b id="sz-kills">0</b><span>처치</span></div></div>
      <canvas class="sz-compass" id="sz-compass" width="420" height="34"></canvas><div class="sz-tc" id="sz-zone"><b id="sz-ztime">0:00</b><span id="sz-zlabel">자기장</span></div>
      <div class="sz-tr"><canvas id="sz-map" width="300" height="300"></canvas><ul class="sz-feed" id="sz-feed"></ul></div>
      <div class="sz-cross" id="sz-cross"><i></i><i></i><i></i><i></i></div><div class="sz-hitmark" id="sz-hitmark"><i></i><i></i><i></i><i></i></div><div class="sz-nums" id="sz-nums"></div>
      <div class="sz-dmgs" id="sz-dmgs"></div>
      <div class="sz-air" id="sz-air"></div><div class="sz-banner" id="sz-banner"></div><div class="sz-count" id="sz-count"></div><div class="sz-prompt" id="sz-prompt"></div><div class="sz-cast" id="sz-cast"><span id="sz-castl"></span><i><b id="sz-castb"></b></i></div>
      <div class="sz-bl"><div class="sz-bar hp"><i id="sz-hp"></i><b id="sz-hpn">100</b></div><div class="sz-bar ar"><i id="sz-ar"></i><b id="sz-arn">0</b></div></div>
      <div class="sz-br"><div class="sz-wname" id="sz-wname"></div><div class="sz-ammo"><b id="sz-mag">0</b><span id="sz-res">/ 0</span></div><div class="sz-slots" id="sz-slots"></div></div>
      <div class="sz-veh" id="sz-veh"><div class="nm" id="sz-vname"></div><div class="spd"><span id="sz-vspd">0</span><small>km/h</small></div><div class="bar" id="sz-vbar"><i id="sz-vhp"></i></div><small class="keys" id="sz-vkeys"></small></div>
      <div class="sz-keys" id="sz-keys"></div>
      <div class="sz-tbtn"><button id="sz-pause" type="button" aria-label="일시정지">Ⅱ</button></div>
      <div class="sz-touchpad"><div class="sz-stick" id="sz-stick"><i></i></div><div class="sz-tbuttons">
        <button data-act="fire" class="fire" type="button">사격</button><button data-act="ads" type="button">조준</button><button data-act="crouch" type="button">웅크림</button><button data-act="reload" type="button">장전</button><button data-act="interact" type="button">줍기</button><button data-act="smith" type="button">조립</button><button data-act="swap" type="button">교체</button><button data-act="nade" type="button">수류탄</button><button data-act="smoke" type="button">연막</button><button data-act="flash" type="button">섬광</button><button data-act="heal1" type="button">붕대</button><button data-act="heal2" type="button">구급</button></div></div>
    </div>
    <div class="sz-setup wd-screen" id="sz-setup" style="--wd-hue:#b8cf91"></div>
    <div class="sz-modal" id="sz-modal"></div>`;
  document.body.append(root);
  const elements = new Map<string, HTMLElement>();
  const q = <T extends HTMLElement>(sel: string): T => { const cached = elements.get(sel); if (cached?.isConnected) return cached as T; const el = root.querySelector<T>(sel)!; if (el) elements.set(sel, el); return el; };
  let canvas = q<HTMLCanvasElement>('.sz-canvas'); const hud = q('.sz-hud'), setupEl = q('#sz-setup'), modal = q('#sz-modal'), mapCv = q<HTMLCanvasElement>('#sz-map'), mapCtx = mapCv.getContext('2d')!;
  const audio = new ShooterAudio(); audio.enabled = prefs.sound;
  let career = readShooterCareer();
  let level: Difficulty = (DIFFICULTIES as string[]).includes(career.level) ? (career.level as Difficulty) : 'normal', pickMode: 'solo' | 'pvp' | 'room' = 'solo';

  let roomFill = 60;
  let phase: Phase = 'setup', closed = false, paused = false, match: Match | null = null, view: ShooterView | null = null, meIdx = 0, pvp: Pvp | null = null, room: Room | null = null, raf = 0, last = performance.now();
  let assets: ShooterAssets | null = null, assetState: 'loading' | 'ready' | 'failed' = 'loading', assetPct = 0;
  let countdown = 0, over = false, deadTimer = 0, resultShown = false, spectateId = -1;
  let soloRecorded = false;
  let shotsFired = 0, shotsHit = 0, newKillRecord = false, zoneWarningPhase = -1, zoneTick = -1;
  const otherSteps = new Map<number, number>();
  let lastLook = 0, yaw = 0, pitch = 0, locked = false, lockFail = false, hitT = 0, hitHead = false, hitKill = false, combo = 0, comboT = 0, rcP = 0, rcY = 0, rcIdle = 9, shotN = 0, stepAcc = 0, bannerT = 0, mapBase: HTMLCanvasElement | null = null;
  const keys = new Set<string>(), mouse = { fire: false, ads: false }, tc = { fire: false, ads: false, crouch: false, move: { x: 0, y: 0, id: -1, ox: 0, oy: 0 }, look: { id: -1, x: 0, y: 0 } };
  let closeSmith: (() => void) | null = null, smithPaused = false;
  let jumpQueued = false, pausedAt = 0;
  let healReq = 0, nadeReq = false, smokeReq = false, flashReq = false, reloadReq = false, slotReq = -1, swapReq = false, interactHeld = false;
  const feed: Array<{ text: string; weapon: string; at: number; mine: boolean }> = [], told = new Set<number>();
  const cache = new Map<string, string>();
  const set = (el: HTMLElement, key: string, text: string): void => { if (cache.get(key) !== text) { cache.set(key, text); el.textContent = text; } };
  const html = (el: HTMLElement, key: string, v: string): void => { if (cache.get(key) !== v) { cache.set(key, v); el.innerHTML = v; } };
  const me = (): Player => match!.players[meIdx];

  // ---------- 자산(백그라운드로 받기) ----------
  const loading = opts.loading;
  loading?.close();
  void loadShooterAssets(base, f => { assetPct = f; loading?.progress(f, '3D 모델을 불러오는 중'); if (phase === 'setup') paintSetup(); }, n => loading?.note(n)).then(a => { assets = a; assetState = 'ready'; }).catch(() => { assetState = 'failed'; }).finally(() => { loading?.close(); if (phase === 'setup') paintSetup(); });

  // ---------- 출격 설정 화면 ----------
  function paintSetup(): void {
    const b = BOTS[level], wait = assetState === 'loading';
    setupEl.hidden = false; setupEl.setAttribute('role', 'dialog'); setupEl.setAttribute('aria-label', 'ZERO ZONE 출격 설정');
    setupEl.innerHTML = `
      <div class="sz-setup-inner wd-panel">
        <header><span class="sz-eyebrow wd-eyebrow">배틀로열</span><h2 class="wd-title">ZERO ZONE</h2><p class="wd-lead">줄어드는 자기장 안에서 최후의 1인까지 생존.</p></header>
        <section class="wd-field"><h3 class="wd-label">모드 선택</h3><div class="sz-seg three">
          <button type="button" class="sz-opt ${pickMode === 'solo' ? 'on' : ''}" data-mode="solo" aria-pressed="${pickMode === 'solo'}"><b>솔로 배틀로열</b><em>나 + AI 99명 · 비행기에서 낙하산 강하 · 마지막 1명이 승리</em></button>
          ${PVP_ENABLED ? `<button type="button" class="sz-opt ${pickMode === 'pvp' ? 'on' : ''}" data-mode="pvp" aria-pressed="${pickMode === 'pvp'}"><b>1대1 온라인 대전</b><em>2인 PvP · 무작위 매칭 또는 방 코드</em></button>` : ''}
          ${PVP_ENABLED ? `<button type="button" class="sz-opt ${pickMode === 'room' ? 'on' : ''}" data-mode="room" aria-pressed="${pickMode === 'room'}"><b>멀티플레이 방</b><em>3~${ROOM_MAX}인 + AI · 방 코드 또는 공개 방 · 차량·폭격까지 함께</em></button>` : ''}</div></section>
        ${pickMode === 'room' ? `<section><h3>AI 채우기 <em class="sz-coin">방을 만들 때 적용</em></h3><div class="sz-seg four">${ROOM_FILLS.map(f => `<button type="button" class="sz-opt ${f === roomFill ? 'on' : ''}" data-fill="${f}" aria-pressed="${f === roomFill}"><b>${f ? `${f}명까지` : '사람만'}</b></button>`).join('')}</div>
          <p class="sz-note">${roomFill ? `빈자리를 AI로 채워 ${roomFill}명이 비행기에서 강하합니다. 차량·폭격·보급까지 모두에게 똑같이 보입니다(방장이 AI를 계산해 보냅니다).` : '사람끼리만 작은 지도에서 겨룹니다.'} 두 명만 모이면 1대1 랭크전으로 진행됩니다.</p></section>` : ''}
        <section class="${pickMode === 'pvp' || (pickMode === 'room' && !roomFill) ? 'dim' : ''}"><h3>AI 난이도</h3><div class="sz-seg four">${DIFFICULTIES.map(d => `<button type="button" class="sz-opt ${d === level ? 'on' : ''}" data-level="${d}" aria-pressed="${d === level}" ${pickMode === 'pvp' || (pickMode === 'room' && !roomFill) ? 'disabled' : ''}><b>${BOTS[d].label}</b></button>`).join('')}</div>
          <p class="sz-note">${pickMode === 'pvp' ? '1대1 대전은 사람끼리 겨루므로 AI가 나오지 않습니다.' : pickMode === 'room' && !roomFill ? '사람만 모이는 방에는 AI가 나오지 않습니다.' : `${b.blurb} (반응 ${b.react.toFixed(2)}초 · 시야 ${b.sight}m)${pickMode === 'room' ? ' · 방을 만든 사람의 난이도로 진행됩니다' : ''}`}</p></section>
        <section><h3>조작</h3>${controlsHtml()}</section>
        <footer class="wd-actions"><button type="button" class="ghost wd-btn" data-act="exit">게임 목록으로</button>${career.matches ? `<span class="sz-sum">전적 ${career.matches}판 ${career.wins}승 · 최다 처치 ${career.bestKills}</span>` : '<span class="sz-sum"></span>'}
          <button type="button" class="primary wd-btn" data-act="start" >${assetState === 'failed' ? '도형 모드로 시작' : wait ? `불러오는 중 ${Math.floor(assetPct * 100)}%` : pickMode === 'solo' ? '시작' : pickMode === 'room' ? '방 찾기' : '상대 찾기'}</button></footer>
      </div>`;
  }
  /** 조작법: 꼭 필요한 6개만 먼저 보이고, 나머지는 '전체 조작 보기'를 펼쳐 봅니다. Space 는 공중에서만 쓰고 차량 키는 운전할 때 화면에 따로 뜹니다. */
  function controlsHtml(): string {
    const row = (k: string, v: string): string => `<li><b>${k}</b><span>${v}</span></li>`;
    const main = touch
      ? [row('왼쪽 스틱', '이동'), row('오른쪽 화면', '시점'), row('사격 · 조준', '버튼'), row('줍기', '무기 줍기 · 차 타기 · 뛰어내리기'), row('장전', '버튼'), row('Ⅱ', '일시정지')]
      : [row('WASD', '이동'), row('마우스', '시점 · 좌클릭 사격 · 우클릭 조준'), row('J · K', '사격 · 누르는 동안 조준'), row('K + 방향키', '조준 방향 이동'), row('Shift', '달리기'), row('E', '줍기 · 차 타고 내리기'), row('R', '장전'), row('Esc', '일시정지')];
    const more = touch
      ? [row('웅크림', '웅크리기 · 차 핸드브레이크'), row('교체', '무기 바꾸기'), row('수류탄 · 연막 · 섬광', '투척'), row('붕대 · 구급', '회복'), row('조립', '총기 파츠 조립')]
      : [row('Space', '비행기에서 뛰어내리기 · 낙하산 펴기'), row('C', '웅크리기'), row('1 / 2 · 휠', '무기 바꾸기'), row('G · B · V', '수류탄 · 연막 · 섬광'), row('H · U', '붕대 · 구급상자'), row('Tab', '총기 조립 · 배낭')];
    return `<ul class="sz-help sz-help-main">${main.join('')}</ul><details class="sz-more"><summary>전체 조작 · 낙하 요령</summary><ul class="sz-help">${more.join('')}</ul>
      <p class="sz-help-note">낙하 중 W 로 앞으로 활강하고 Shift 로 급강하합니다. 낙하산은 ${AIR.open}m 에서 자동으로 펴집니다. 탄약·회복·방탄복은 닿으면 자동으로 줍고, 총기 파츠는 가방에 담겨 ${touch ? '<b>조립</b> 버튼' : '<b>Tab</b>'}으로 끼웁니다. 붉은 원은 폭격 구역입니다. 한 판 약 12분.</p></details>`;
  }
  setupEl.addEventListener('click', e => {
    const t = e.target as HTMLElement, mode = t.closest<HTMLElement>('[data-mode]'), lv = t.closest<HTMLElement>('[data-level]'), act = t.closest<HTMLElement>('[data-act]');
    const fillBtn = t.closest<HTMLElement>('[data-fill]'); if (fillBtn) { roomFill = Number(fillBtn.dataset.fill) || 0; paintSetup(); return; }
    if (mode) { pickMode = mode.dataset.mode as 'solo' | 'pvp' | 'room'; paintSetup(); } else if (lv) { level = lv.dataset.level as Difficulty; writeShooterCareer({ ...readShooterCareer(), level }); paintSetup(); }
    else if (act?.dataset.act === 'exit') exit(); else if (act?.dataset.act === 'start') { if (pickMode === 'solo') startSolo(); else openPvpLobby(pickMode === 'room'); }
  });
  paintSetup();

  // ---------- 경기 시작 ----------
  function begin(m: Match, my: number): void {
    endMatch(); match = m; meIdx = my; over = false; resultShown = false; soloRecorded = false; shotsFired = shotsHit = 0; newKillRecord = false; zoneWarningPhase = zoneTick = -1; otherSteps.clear(); spectateId = -1; deadTimer = 0; cache.clear(); feed.length = 0; told.clear(); paused = false; modal.className = 'sz-modal'; modal.innerHTML = '';
    keys.clear(); mouse.fire = mouse.ads = false; tc.fire = tc.ads = tc.crouch = false; tc.move.id = tc.look.id = -1; tc.move.x = tc.move.y = 0; interactHeld = reloadReq = swapReq = nadeReq = smokeReq = flashReq = jumpQueued = false; healReq = 0; slotReq = -1; hitT = combo = comboT = rcP = rcY = shotN = stepAcc = bannerT = 0; rcIdle = 9; hitHead = hitKill = false;
    const p = m.players[my]; yaw = p.yaw; pitch = 0; countdown = 3.4; phase = 'countdown'; mapBase = null; lastMapDraw = 0;
    // 지난 경기의 WebGL 컨텍스트는 dispose 에서 끝났으므로, 같은 캔버스를 다시 쓰면 렌더러가 죽은 컨텍스트를 받습니다(다시 시작이 안 됨). 경기마다 새 캔버스를 씁니다.
    const fresh = document.createElement('canvas'); fresh.className = 'sz-canvas'; fresh.addEventListener('contextmenu', noMenu); if (document.pointerLockElement === canvas) { swapUnlock = true; locked = false; } canvas.replaceWith(fresh); canvas = fresh;
    view = new ShooterView(canvas, m, assets, prefs.quality); resize(); setupEl.hidden = true; hud.hidden = false; buildSlots(); say(touch ? '왼쪽 스틱으로 이동' : CLICK_HINT, 2.4);
    if (!touch) lock(); audio.unlock();
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__zz = { get match() { return match; }, get phase() { return phase; }, me, skip, view, go: () => { countdown = Math.min(countdown, 0.45); }, advance: (sec: number) => { const m = match; if (!m) return; let now = performance.now(); for (let t = 0; t < sec && !m.over; t += 1 / 30) { if (room) syncRoom(1 / 30); m.step(1 / 30); now += 1000 / 30; const ev = m.drain(); onEvents(ev); if (room) roomTick(ev, now); } }, fire: (on: boolean) => { mouse.fire = on; }, ads: (on: boolean) => { mouse.ads = on; }, look: (y: number, p: number) => { yaw = y; pitch = p; } };
  }
  function startSolo(): void {
    audio.unlock(); pvp = null; const seed = (Math.random() * 2 ** 31) >>> 0;
    begin(new Match({ seed, mode: 'br', difficulty: level, humans: [{ name: '나' }], fill: BR_PLAYERS, air: true, vehicles: true, bombs: true }), 0);
  }

  // ---------- 1대1 대전 ----------
  function openPvpLobby(rooms = false): void {
    if (!PVP_ENABLED) return;
    void loadModule(() => import('../net/lobby'), { cancelled: () => closed, onNote: text => { if (text) setupEl.querySelector('.sz-note')!.textContent = text; } }).then(({ openLobby }) => openLobby({ game: 'shooter', maxPlayers: rooms ? ROOM_MAX : 2, config: () => (rooms && roomFill ? { seed: (Math.random() * 2 ** 31) >>> 0, mode: 'br', fill: roomFill, level } : { seed: (Math.random() * 2 ** 31) >>> 0, mode: 'duel' }), onMatch: startPvp, onRoom: startRoom, inGameChat: false, onClose: () => undefined }))
      .catch(() => { setupEl.querySelector('.sz-note')!.textContent = '대전 화면을 여는 중 문제가 생겼습니다. 페이지를 새로고침해 주세요.'; });
  }
  function card(eyebrow: string, title: string, body = '', actions = '<button data-act="exit">메뉴로</button>', cls = ''): void {
    modal.className = 'sz-modal show wd-screen'; modal.style.setProperty('--wd-hue', '#b8cf91'); modal.innerHTML = `<div class="sz-card wd-panel ${cls}"><span class="sz-eyebrow wd-eyebrow">${eyebrow}</span><h2 class="wd-title">${title}</h2>${body}<div class="sz-actions wd-actions">${actions}</div></div>`;
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
      onNade: n => { if (match && pvp?.opp) match.addNade(pvp.opp.id, n.x, n.y, n.z, n.vx, n.vy, n.vz, n.smoke, n.flash); },
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
  // ---------- 멀티플레이 방(3인 이상) ----------
  // AI 를 채운 방은 배틀로열 지도에서 비행기로 시작하고, 방장(명단의 첫 사람)이 AI·차량·차 내구도를 계산해 보냅니다(sync.ts).
  function startRoom(s: RoomSession): void {
    endPvp(); endRoom(); endMatch(); setupEl.hidden = true; hud.hidden = true; phase = 'loading';
    card('멀티플레이 방', `${s.players.length}명이 모이는 중…`, '<p class="sz-sub">모두 연결되면 바로 시작합니다.</p>', '<button data-act="exit">나가기</button>');
    const net: ShooterRoomNet = new ShooterRoomNet(s, {
      onStart: ids => beginRoom(ids),
      onPose: (id, p) => { const r = roomRemote(id); if (r) { r.target = p; if (p.vs && match && p.veh !== undefined && p.veh >= 0) { const v = match.vehicles[p.veh]; if (v) room!.sync.vehicleState(v, p.vs[0], p.vs[1], p.vs[2], p.vs[3], r.p.id, true, performance.now()); } } },
      onShot: (id, sh) => {
        const r = roomRemote(id); if (!r || !match) return; const aims: Array<[number, number]> = [];
        for (let i = 0; i + 2 < sh.ends.length; i += 3) { const dx = sh.ends[i] - sh.ox, dy = sh.ends[i + 1] - sh.oy, dz = sh.ends[i + 2] - sh.oz; aims.push([Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz))]); }
        r.p.muzzle = 0.06; r.p.kick = Math.min(1, r.p.kick + 0.3); match.remoteShot(r.p.id, sh.w, sh.ox, sh.oy, sh.oz, aims);
      },
      onPickup: id => { match?.removeLoot(id); },
      onDead: (id, _mt, killer, cause) => { const r = roomRemote(id); if (r && match && r.p.alive) { if (r.target) { r.p.x = r.target.x; r.p.z = r.target.z; } match.kill(r.p, killer, CAUSES[cause] ?? 'rifle'); } },
      onGone: id => {
        const r = roomRemote(id); if (!r || !match || !room) return;
        if (r.p.alive) { match.kill(r.p, -1, 'zone'); say(`${r.p.name} 님의 연결이 끊어졌습니다`, 2); }
        // 방장이 나가면 남은 사람 중 명단의 첫 사람이 AI 와 차량을 넘겨받습니다.
        if (!match.authority && room.net.authority() === room.s.me.id) { match.takeAuthority(v => humanDriver(v)); say('방장이 나가 이제 내 브라우저가 AI를 계산합니다', 3); }
        if (match.authority) for (const v of match.vehicles) if (v.remote && v.driver === r.p.id) reclaim(v);
      },
      onAbort: () => { if (room && !room.done) { room.done = true; card('멀티플레이 방', '시작하지 못했습니다', '<p class="sz-sub">다른 참가자와 연결하지 못했습니다.</p>', '<button data-act="exit">메뉴로</button>'); } },
      onData: (id, msg) => roomData(id, msg),
    });
    room = { s, net, remotes: new Map(), chat: null, done: false, seed: seedOf(s.room.config, s.room.id), mine: 0, shown: false, sync: null as unknown as WorldSync };
  }
  function roomRemote(id: string): { p: Player; target: Pose | null } | undefined { const i = room?.net.list.indexOf(id) ?? -1; return room?.remotes.get(i); }
  /** 사람(다른 참가자)이 몰고 있는 차인지 */
  function humanDriver(v: Vehicle): boolean { const d = match?.players[v.driver]; return !!d && !d.bot && d.remote && d.alive; }
  /** 손님이 몰다 사라진 차를 방장이 넘겨받아 세웁니다. */
  function reclaim(v: Vehicle): void { const m = match; if (!m || v.wreck) return; const d = m.players[v.driver]; if (d && d.veh === v.id) d.veh = -1; v.driver = -1; v.remote = false; v.moving = true; }
  /** 방 설정에서 AI 채우기를 읽습니다: 0 이면 예전처럼 사람끼리 작은 지도. */
  function roomFillOf(config: Record<string, unknown>, humans: number): number { const f = config.fill; return typeof f === 'number' && Number.isFinite(f) && f > 0 ? Math.max(humans, Math.min(BR_PLAYERS, Math.floor(f))) : 0; }
  function beginRoom(ids: string[]): void {
    if (!room || closed || match) return; const r = room, me0 = r.s.me.id, idx = ids.indexOf(me0); if (idx < 0) return;
    const nick = new Map(r.s.players.map(p => [p.id, p.nickname] as const)), cfg = r.s.room.config, fill = roomFillOf(cfg, ids.length);
    const diff = (DIFFICULTIES as string[]).includes(cfg.level as string) ? (cfg.level as Difficulty) : 'normal', authority = ids[0] === me0;
    const humans = ids.map(id => ({ name: nick.get(id) ?? '참가자', remote: id !== me0 }));
    const m = fill ? new Match({ seed: r.seed, mode: 'br', difficulty: diff, humans, fill, air: true, vehicles: true, bombs: true, authority, lootBase: (idx + 1) * 1_000_000 })
      : new Match({ seed: r.seed, mode: 'duel', difficulty: 'normal', humans, lootBase: (idx + 1) * 1_000_000 });
    ids.forEach((id, i) => { if (id !== me0) r.remotes.set(i, { p: m.players[i], target: null }); });
    r.mine = idx; r.sync = new WorldSync(m); begin(m, idx);
    r.chat = new ChatBox(hud, text => { r.chat?.add('나', me0, text, true, performance.now()); r.net.send({ t: 'ch', x: text }); }, () => { if (!touch && !locked && phase === 'play') lock(); });
  }
  /** 동기화 메시지(sync.ts 형식) */
  function roomData(id: string, msg: NetMsg): void {
    const r = room, m = match; if (!r || !m) return; const from = roomRemote(id), host = id === r.net.authority(), now = performance.now(), my = me();
    if (msg.t === 'ch') r.chat?.add(r.s.players.find(x => x.id === id)?.nickname ?? '참가자', id, msg.x, false, now);
    else if (msg.t === 'w') { if (host && !m.authority) r.sync.apply(msg, now); }
    else if (msg.t === 'bd') { if (host && !m.authority) r.sync.botDead(msg.i, msg.k, msg.c); }
    else if (msg.t === 'la') { const l = parseLoot(msg); if (l) m.addLoot(l); }
    else if (msg.t === 'nd') { const n = parseNade(msg), o = typeof msg.o === 'number' && Number.isInteger(msg.o) ? m.players[msg.o] : undefined; if (n && o?.remote) m.addNade(o.id, n.x, n.y, n.z, n.vx, n.vy, n.vz, n.smoke, n.flash); }
    else if (msg.t === 've') {
      // 손님이 차에 타려고 함: 방장만 판정합니다.
      const v = typeof msg.i === 'number' ? m.vehicles[msg.i] : undefined; if (!m.authority || !from || !v) return; const p = from.p;
      const ok = !v.wreck && v.driver < 0 && p.alive && !p.air && Math.hypot(p.x - v.x, p.z - v.z) < 9;
      if (ok) { m.enterVehicle(p, v); v.remote = true; r.sync.vehs.set(v.id, { x: v.x, z: v.z, yaw: v.yaw, speed: 0, at: now }); }
      r.net.send({ t: ok ? 'vg' : 'vn', i: v.id, d: p.id });
    }
    else if (msg.t === 'vg' || msg.t === 'vn') {
      const v = typeof msg.i === 'number' ? m.vehicles[msg.i] : undefined, d = typeof msg.d === 'number' ? m.players[msg.d] : undefined; if (!host || !v || !d || v.wreck) return;
      if (msg.t === 'vn') { if (d === my) say('다른 사람이 먼저 탔습니다', 1.4); return; }
      if (d === my) {
        if (!my.alive || my.air || my.veh >= 0) { r.net.send({ t: 'vx', i: v.id, x: v.x, z: v.z, y: v.yaw, s: 0 }); return; }
        r.sync.vehs.delete(v.id); v.remote = false; m.enterVehicle(my, v); // 이제 이 차는 내 브라우저가 굴립니다(탑승 소리·안내는 다음 프레임의 사건으로)
      } else if (d.remote && !m.authority) { v.driver = d.id; d.veh = v.id; if (!v.moving) { v.moving = true; m.parkBox(v, false); } }
    }
    else if (msg.t === 'vx') {
      // 손님이 내린(또는 쓰러진) 차: 방장이 받아 굴리고, 나머지는 운전자만 비웁니다.
      const v = typeof msg.i === 'number' ? m.vehicles[msg.i] : undefined; if (!v || v.wreck || !from) return;
      const x = Number(msg.x), z = Number(msg.z), y = Number(msg.y), sp = Number(msg.s); if (![x, z, y, sp].every(Number.isFinite) || Math.abs(x) > 1000 || Math.abs(z) > 1000) return;
      if (m.authority) { if (v.remote) { r.sync.vehs.delete(v.id); v.x = x; v.z = z; v.yaw = y; v.speed = Math.max(-40, Math.min(40, sp)); reclaim(v); } }
      else if (v.remote) { if (v.driver === from.p.id) { from.p.veh = -1; v.driver = -1; } r.sync.vehicleState(v, x, z, y, sp, -1, true, now); }
    }
    else if (msg.t === 'vd') { const v = typeof msg.i === 'number' ? m.vehicles[msg.i] : undefined, d = Number(msg.d); if (m.authority && v && from && Number.isFinite(d) && d > 0) m.hurtVehicle(v, Math.min(400, d), -1); }
  }
  /** 매 시뮬레이션 단계 전에: 다른 사람·AI·차를 받은 상태로 옮깁니다. */
  function syncRoom(dt: number): void {
    if (!room || !match) return; const m = match;
    for (const { p: o, target: t } of room.remotes.values()) {
      if (!t || !o.alive) continue;
      const veh = t.veh ?? -1;
      if (veh !== o.veh) {
        const old = m.vehicles[o.veh]; if (old && old.driver === o.id) old.driver = -1;
        const nu = m.vehicles[veh]; if (nu && !nu.wreck && (nu.driver < 0 || nu.driver === o.id) && nu.remote) { o.veh = veh; nu.driver = o.id; if (!nu.moving) { nu.moving = true; m.parkBox(nu, false); } } else o.veh = -1;
      }
      easePuppet(o, { x: t.x, z: t.z, yaw: t.yaw, pitch: t.pitch, speed: t.speed, air: t.air ?? 0, alt: t.alt ?? 0, hp: t.hp, w: t.w, ads: t.ads, crouch: !!t.crouch, reload: t.reloading }, dt);
      o.armor = t.armor;
    }
    room.sync.step(dt);
  }
  /** 프레임마다 한 번: 방장은 세계 상태를 보내고, 손님은 놓친 차를 정리합니다. */
  function roomTick(events: MatchEvent[], now: number): void {
    const r = room, m = match; if (!r || !m || !r.net.started) return; const my = me();
    const interest: Array<{ x: number; z: number }> = []; for (const { p } of r.remotes.values()) if (!r.net.isGone(r.net.list[p.id])) interest.push(p);
    for (const e of events) {
      if (e.t === 'loot') r.net.send(encodeLoot(e.loot));
      else if (e.t === 'pickup') { const who = m.players[e.id]; if (who && who !== my && who.bot && m.authority) r.net.send({ t: 'pk', i: e.loot }); }
      else if (e.t === 'nade' && e.stage === 'throw' && !e.remote && e.vx !== undefined) { const o = m.players[e.id]; if (o && !o.remote) r.net.send(nadeMsg({ x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy ?? 0, vz: e.vz ?? 0, smoke: e.smoke, flash: e.flash }, o.id)); }
      else if (e.t === 'kill') { const v = m.players[e.victim]; if (v?.bot && m.authority) r.net.send({ t: 'bd', i: v.id, k: e.attacker, c: Math.max(0, CAUSES.indexOf(e.weapon)) }); }
      else if (e.t === 'vreq') r.net.send({ t: 've', i: e.id });
      else if (e.t === 'vhurt') r.net.send({ t: 'vd', i: e.id, d: Math.round(e.dmg) });
      else if (e.t === 'veh' && e.stage === 'exit' && !m.authority) {
        // 내가 몰던 차에서 내림(또는 쓰러짐): 남은 움직임은 방장에게 넘깁니다.
        const v = m.vehicles[e.id]; if (v && !v.remote && !v.wreck && v.driver < 0) { v.remote = true; r.net.send({ t: 'vx', i: v.id, x: Math.round(v.x * 100) / 100, z: Math.round(v.z * 100) / 100, y: Math.round(v.yaw * 100) / 100, s: Math.round(v.speed * 10) / 10 }); r.sync.vehs.set(v.id, { x: v.x, z: v.z, yaw: v.yaw, speed: v.speed, at: now }); }
      }
    }
    if (m.authority) {
      r.sync.collect(events, interest);
      const w = r.sync.world(now, interest); if (w) r.net.send(w);
      // 운전자가 3초 넘게 소식이 없으면 그 차는 방장이 넘겨받습니다.
      for (const v of r.sync.staleVehicles(now, 3000)) if (v.remote) { r.sync.vehs.delete(v.id); reclaim(v); }
    }
  }
  /** 방장 탭이 백그라운드로 가면 화면 프레임이 멈추므로 타이머로 경기를 계속 돌립니다(AI 가 멈추지 않게). */
  let bgLast = 0;
  const bgTimer = window.setInterval(() => {
    const m = match; if (!document.hidden || !room || !m || !m.authority || closed || (phase !== 'play' && phase !== 'dead' && phase !== 'over')) { bgLast = performance.now(); return; }
    const now = performance.now(), dt = Math.min(1.5, (now - (bgLast || now)) / 1000); bgLast = now; if (dt <= 0) return;
    let left = dt; while (left > 1e-6) { const s = Math.min(1 / 30, left); left -= s; syncRoom(s); m.step(s); }
    const ev = m.drain(); if (ev.length) onEvents(ev); roomTick(ev, now);
  }, 250);
  function roomResult(): void {
    const r = room, m = match; if (!r || !m || closed) return; const p = me(), win = m.over && m.winner === p.id; if (document.pointerLockElement) document.exitPointerLock();
    if (m.over) r.done = true;
    const rank = win ? 1 : p.place || m.players.length, n = m.players.length;
    audio.play(win ? 'win' : 'lose');
    card(`멀티플레이 방 · ${n}명`, win ? '최후의 1인' : `#${rank}`, `<p class="sz-big">${win ? '승리' : `${n}명 중 ${rank}위`}</p><div class="sz-stats"><div><b>${p.kills}</b><span>처치</span></div><div><b>${Math.round(p.dmgDealt)}</b><span>준 피해</span></div><div><b>${clock(win ? m.t : p.diedAt)}</b><span>생존 시간</span></div><div><b>${shotsFired ? Math.round(shotsHit / shotsFired * 100) + '%' : '—'}</b><span>명중률</span></div></div>${win ? '' : killerLine(p, false)}`,
      `${!m.over ? '<button data-act="spectate">관전 계속</button>' : '<button class="primary" data-act="roomagain">다시 방 찾기</button>'}<button data-act="exit">메뉴로</button>`, win ? 'win' : '');
  }
  function leaveRoom(): void { const r = room; if (!r) return; if (r.net.started && !r.done) r.net.bye(); endRoom(); }
  function endRoom(): void { room?.chat?.dispose(); room?.net.dispose(); room = null; }

  /** 내가 쓰러진 뒤 상대 소식을 잠깐 기다려 동시 사망을 가립니다. */
  function settleTie(): void {
    if (!pvp || pvp.done || pvp.deadAt === null) return;
    if (pvp.oppDeadMt === null) { const p = pvp; window.setTimeout(() => { if (!closed && pvp === p && !p.done && p.oppDeadMt === null) void conclude(p.s.opponent.id, '상대의 탄에 쓰러졌습니다'); }, 1100); return; }
    const w = decideDeath(pvp.deadAt, pvp.oppDeadMt, pvp.s.host); void conclude(w === 'me' ? pvp.s.me.id : pvp.s.opponent.id, '두 선수가 거의 동시에 쓰러졌습니다');
  }
  /** 승자를 서버에 보고하고 확정된 레이팅 변화를 보여 줍니다(승리 보고는 상대의 보고나 15초 뒤에 확정). */
  async function conclude(winner: string, why: string): Promise<void> {
    if (!pvp || pvp.done) return; pvp.done = true; over = true; phase = 'over'; const p = pvp, win = winner === p.s.me.id, eyebrow = `1대1 대전 · vs ${esc(p.s.opponent.nickname)}`;
    audio.play(win ? 'win' : 'lose'); if (document.pointerLockElement) document.exitPointerLock();
    const show = (extra: string, actions = '', voided = false, won = win): void => { if (!closed && pvp === p && match) { const player = me(); card(eyebrow, voided ? '무효' : won ? '승리' : '패배', `<p class="sz-sub">${why}</p><p class="sz-big">${won ? '1위' : '2위'}</p><div class="sz-stats"><div><b>${player.kills}</b><span>처치</span></div><div><b>${Math.round(player.dmgDealt)}</b><span>준 피해</span></div><div><b>${clock(player.alive ? match.t : player.diedAt)}</b><span>생존 시간</span></div><div><b>${shotsFired ? Math.round(shotsHit / shotsFired * 100) + '%' : '—'}</b><span>명중률</span></div></div><p class="sz-sub">${extra}</p>`, actions || '<button data-act="exit">메뉴로</button>', won && !voided ? 'win' : ''); } };
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
  function endMatch(): void { closeSmith?.(); view?.dispose(); view = null; match = null; }

  // ---------- 조작 ----------
  const sens = (): number => 0.0023 / (view && me().ads ? Math.max(1, 78 / view.fov) * 0.9 : 1);
  // 포인터 잠금이 거절돼도 곧바로 '잠금 불가'로 굳히지 않습니다: 시작 직후(클릭 효력이 지난 뒤)나 Esc 직후 1초 안의 요청은 브라우저가 거절하는데,
  // 이때 굳혀 버리면 이후 마우스를 움직여도 시점이 돌지 않고 오른쪽 버튼을 누른 채로만 돌았습니다. 클릭으로 요청했다가 연달아 두 번 거절될 때만 대체 조작(오른쪽 버튼 드래그)으로 넘어갑니다.
  let lockFailN = 0, lockRejected = false, swapUnlock = false;
  function lock(byClick = false): void {
    if (touch || locked || closed) return;
    const fail = (): void => { lockRejected = true; if (byClick && ++lockFailN >= 2) lockFail = true; };
    try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(fail); } catch { fail(); }
  }
  document.addEventListener('pointerlockchange', onLock);
  function onLock(): void {
    locked = document.pointerLockElement === canvas;
    // 경기마다 캔버스를 바꾸므로, 잠겨 있던 옛 캔버스가 사라지며 오는 잠금 해제 알림은 일시정지로 보지 않습니다.
    if (!locked && swapUnlock) { swapUnlock = false; return; }
    if (locked) { lockFailN = 0; lockFail = lockRejected = false; const b = q('#sz-banner'); if (b.textContent === CLICK_HINT) { b.classList.remove('show'); bannerT = 0; } }
    if (closeSmith) return;
    if (!locked && (phase === 'play' || phase === 'countdown') && !pvpRunning() && !closed) setPause(true);
    else if (!locked && pvpRunning() && !closed) say('클릭하면 조작이 돌아옵니다', 2);
  }
  const pvpRunning = (): boolean => ((!!pvp && !pvp.done) || (!!room && !room.done)) && !!match;
  function look(dx: number, dy: number): void { lastLook = performance.now(); const k = sens(); yaw += dx * k; pitch = clamp(pitch - dy * k, -1.4, 1.4); }
  const onMove = (e: MouseEvent): void => { if (!match || closed || paused) return; if (locked) look(e.movementX, e.movementY); else if ((lockFail || lockRejected) && (e.buttons & 3)) look(e.movementX, e.movementY); /* 잠금이 거절된 동안은 버튼을 누른 채 끌어서 시점을 돌립니다 */ };
  const onDown = (e: MouseEvent): void => {
    if (closed || !match || paused || closeSmith || e.target !== canvas || (phase !== 'play' && phase !== 'countdown')) return; audio.unlock();
    if (!locked && !touch) { lock(true); if (!lockFail) return; }
    if (e.button === 0) mouse.fire = true; else if (e.button === 2) mouse.ads = true;
  };
  const onUp = (e: MouseEvent): void => { if (e.button === 0) mouse.fire = false; else if (e.button === 2) mouse.ads = false; };
  const onKey = (e: KeyboardEvent): void => {
    if (e.type === 'keyup') { keys.delete(e.code); if (e.code === 'KeyE') interactHeld = false; return; }
    if (closed || room?.chat?.typing || !match || (phase !== 'play' && phase !== 'countdown') || closeSmith || (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.code === 'Escape') { if (!e.repeat) onEsc(); return; }
    if (paused || (e.repeat && ['KeyR', 'KeyE', 'KeyL', 'Tab', 'KeyQ', 'KeyG', 'KeyB', 'KeyV', 'KeyH', 'KeyU', 'Digit1', 'Digit2'].includes(e.code))) return;
    keys.add(e.code);
    if (e.code === 'Enter' && room?.chat && !room.done && match && !paused && !closeSmith) { keys.clear(); mouse.fire = mouse.ads = false; interactHeld = false; if (document.pointerLockElement) document.exitPointerLock(); room.chat.open(); e.preventDefault(); return; }
    if (e.code === 'KeyR') reloadReq = true; else if (e.code === 'KeyE') interactHeld = true; else if (e.code === 'Digit1') slotReq = 0; else if (e.code === 'Digit2') slotReq = 1; else if (e.code === 'KeyQ') swapReq = true; else if (e.code === 'KeyG') nadeReq = true; else if (e.code === 'KeyB') smokeReq = true; else if (e.code === 'KeyV') flashReq = true; else if (e.code === 'KeyL' || e.code === 'Tab') openSmith(); else if (e.code === 'KeyH') healReq = 1; else if (e.code === 'KeyU') healReq = 2;
    else if (e.code === 'Space' && phase === 'countdown' && match && me().air === 1) queueJump();
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) && match) e.preventDefault();
  };
  // Esc: 포인터가 잠겨 있으면 브라우저가 잠금을 풀며 onLock 이 일시정지를 띄우지만, 잠기지 않은 채(잠금 거절·드래그 시점) 놀 때는 키 입력만 옵니다. 그때도 곧바로 멈춥니다.
  function onEsc(): void {
    if (!match || closeSmith || (phase !== 'play' && phase !== 'countdown')) return;
    if (pvpRunning()) { say('대전 중에는 멈출 수 없습니다', 1.4); return; }
    if (!paused) setPause(true); else if (performance.now() - pausedAt > 400) setPause(false);
  }
  /** 카운트다운 중 Space(또는 줍기 버튼): 출격 신호와 동시에 뛰어내리도록 예약합니다. */
  function queueJump(): void { if (jumpQueued) return; jumpQueued = true; say('출격 신호와 함께 바로 뛰어내립니다', 1.6); }
  const onWheel = (e: WheelEvent): void => { if (!match || paused || closed || phase !== 'play' || (!locked && e.target !== canvas)) return; if (e.cancelable) e.preventDefault(); if (Math.abs(e.deltaY) > 4) swapReq = true; };
  const noMenu = (e: Event): void => e.preventDefault();
  window.addEventListener('mousemove', onMove); window.addEventListener('mousedown', onDown); window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); window.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('contextmenu', noMenu);
  const blur = (): void => { keys.clear(); mouse.fire = mouse.ads = false; interactHeld = false; tc.fire = false; if (!pvpRunning() && !paused && !closeSmith) setPause(true); }; window.addEventListener('blur', blur);
  const onHidden = (): void => { if (document.hidden) blur(); }; document.addEventListener('visibilitychange', onHidden);

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
  // 손가락을 창 밖·결과 창 위에서 떼도 스틱·시점 손가락이 남아 이후 터치가 먹히지 않는 일이 없게 창 전체에서도 끝을 받습니다.
  const tReset = (): void => { tc.fire = false; interactHeld = false; root.querySelectorAll('.sz-tbuttons button.down:not([data-act=ads]):not([data-act=crouch])').forEach(b => b.classList.remove('down')); tc.look.id = -1; tc.move.id = -1; tc.move.x = tc.move.y = 0; stickEl.style.opacity = '0'; };
  window.addEventListener('pointerup', tEnd); window.addEventListener('pointercancel', tEnd); window.addEventListener('blur', tReset); document.addEventListener('visibilitychange', tReset);
  root.querySelectorAll<HTMLButtonElement>('.sz-tbuttons button').forEach(b => {
    const act = b.dataset.act!;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio.unlock(); if (act === 'fire') tc.fire = true; else if (act === 'ads') tc.ads = !tc.ads; else if (act === 'crouch') tc.crouch = !tc.crouch; else if (act === 'reload') reloadReq = true; else if (act === 'interact') { interactHeld = true; if (phase === 'countdown' && match && me().air === 1) queueJump(); } else if (act === 'swap') swapReq = true; else if (act === 'smith') openSmith(); else if (act === 'nade') nadeReq = true; else if (act === 'smoke') smokeReq = true; else if (act === 'flash') flashReq = true; else if (act === 'heal1') healReq = 1; else if (act === 'heal2') healReq = 2; if (act === 'crouch') b.classList.toggle('down', tc.crouch); else b.classList.add('down'); });
    for (const n of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(n, () => { if (act === 'fire') tc.fire = false; else if (act === 'interact') interactHeld = false; if (act !== 'ads' && act !== 'crouch') b.classList.remove('down'); });
  });

  /** L: 가방에 있는 파츠로 들고 있는 총을 조립합니다. 혼자 하는 경기는 그동안 멈추고, 온라인은 시간이 계속 흐릅니다. */
  function openSmith(): void {
    if (closeSmith || !match || closed || phase !== 'play' || paused) return; const m = match, p = me();
    if (!p.alive || p.veh >= 0) { say(p.veh >= 0 ? '차에서 내려야 조립할 수 있습니다' : '조립할 수 없습니다', 1.4); return; }
    if (!p.guns.some(g => g)) { say('조립할 총이 없습니다', 1.4); return; }
    keys.clear(); mouse.fire = mouse.ads = tc.fire = tc.ads = false; interactHeld = false;
    const live = pvpRunning(); smithPaused = !live; if (smithPaused) paused = true;
    const done = (): void => { closeSmith = null; if (smithPaused) { smithPaused = false; paused = false; last = performance.now(); } if (!touch) lock(); };
    closeSmith = openGunsmith(root, { assets, touch, live, me, equip: (gi, slot, part) => { const ok = m.equipPart(me(), gi, slot, part); if (ok) audio.play('pickup'); return ok; }, onClose: done });
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function applyInput(dt: number): void {
    const p = me(), i = p.input, keyboardAim = keys.has('KeyK');
    const axis = (positive: string, negative: string): number => Number(keys.has(positive)) - Number(keys.has(negative));
    const lookX = axis('ArrowRight', 'ArrowLeft'), lookY = axis('ArrowUp', 'ArrowDown');
    const sx = tc.move.x, sy = -tc.move.y, active = phase === 'play' && !closeSmith;
    if (active && keyboardAim && (lookX || lookY)) {
      yaw += lookX * dt * 0.8;
      pitch = clamp(pitch + lookY * dt * 0.8, -1.4, 1.4);
      lastLook = performance.now();
    }
    const kx = Number(keys.has('KeyD') || (!keyboardAim && keys.has('ArrowRight'))) - Number(keys.has('KeyA') || (!keyboardAim && keys.has('ArrowLeft')));
    const kz = Number(keys.has('KeyW') || (!keyboardAim && keys.has('ArrowUp'))) - Number(keys.has('KeyS') || (!keyboardAim && keys.has('ArrowDown')));
    i.yaw = yaw; i.pitch = pitch; i.mx = active ? clamp(kx + sx, -1, 1) : 0; i.mz = active ? clamp(kz + sy, -1, 1) : 0;
    i.fire = active && (mouse.fire || tc.fire || keys.has('KeyJ')); i.ads = active && (mouse.ads || tc.ads || keys.has('KeyK')); i.sprint = active && (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(sx, sy) > 0.92);
    i.crouch = active && (keys.has('KeyC') || tc.crouch); i.nade = active && nadeReq; nadeReq = false; i.smoke = active && smokeReq; smokeReq = false; i.flash = active && flashReq; flashReq = false; i.heal = active ? healReq : 0; healReq = 0; i.reload = active && reloadReq; i.interact = active && interactHeld; i.jump = active && (keys.has('Space') || jumpQueued || (p.air > 0 && interactHeld) || (p.veh >= 0 && tc.crouch)); if (active) jumpQueued = false; reloadReq = false;
    if (swapReq) { slotReq = p.guns[1 - p.cur] ? 1 - p.cur : -1; swapReq = false; } i.slot = active ? slotReq : -1; slotReq = -1;
  }

  // ---------- HUD ----------
  const say = (text: string, sec = 1.8): void => { const b = q('#sz-banner'); b.textContent = text; b.classList.add('show'); bannerT = sec; };
  function buildSlots(): void { html(q('#sz-slots'), 'slots-init', ''); }
  function addFeed(text: string, weapon: string, mine: boolean): void { feed.push({ text, weapon, at: performance.now(), mine }); if (feed.length > 5) feed.shift(); }
  function nameOf(id: number): string { return id < 0 ? '자기장' : match?.players[id]?.name ?? '?'; }

  function drawMap(m: Match, p: Player): void {
    const S = mapCv.width, half = m.map.half, k = S / (half * 2), px = (x: number): number => (x + half) * k, pz = (z: number): number => (z + half) * k, g = mapCtx;
    if (!mapBase) {
      mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = S; const b = mapBase.getContext('2d')!;
      b.fillStyle = '#26301f'; b.fillRect(0, 0, S, S); b.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 1; i < 8; i++) { b.fillRect((S / 8) * i, 0, 1, S); b.fillRect(0, (S / 8) * i, S, 1); }
      { // 지형: 숲·구릉·절벽·물
        const t = m.map.terrain; b.fillStyle = 'rgba(40,75,35,.75)'; for (const f of t.forests) { b.beginPath(); b.arc(px(f.x), pz(f.z), f.r * k, 0, Math.PI * 2); b.fill(); }
        b.fillStyle = '#6d6a60'; for (const h of t.hills) { b.beginPath(); b.arc(px(h.x), pz(h.z), h.r * k, 0, Math.PI * 2); b.fill(); } for (const c of t.cliffs) b.fillRect(px(c.x0), pz(c.z0), Math.max(2, (c.x1 - c.x0) * k), Math.max(2, (c.z1 - c.z0) * k));
        for (const p of t.ponds) { b.fillStyle = p.swamp ? '#59693a' : '#3a78a0'; b.beginPath(); b.ellipse(px(p.x), pz(p.z), p.rx * k, p.rz * k, p.ry, 0, Math.PI * 2); b.fill(); }
        b.strokeStyle = '#3a78a0'; b.lineWidth = Math.max(2, 9 * k); b.lineJoin = 'round'; for (const r of t.rivers) { b.beginPath(); r.pts.forEach(([x, z], i) => (i ? b.lineTo(px(x), pz(z)) : b.moveTo(px(x), pz(z)))); b.stroke(); }
        b.strokeStyle = '#a07a45'; b.lineWidth = 2; for (const br of t.bridges) { b.beginPath(); b.moveTo(px(br.x - Math.cos(br.ry) * br.len / 2), pz(br.z - Math.sin(br.ry) * br.len / 2)); b.lineTo(px(br.x + Math.cos(br.ry) * br.len / 2), pz(br.z + Math.sin(br.ry) * br.len / 2)); b.stroke(); }
      }
      b.fillStyle = '#8f8c80'; for (const bd of m.map.buildings) b.fillRect(px(bd.x - bd.w / 2), pz(bd.z - bd.d / 2), Math.max(3, bd.w * k), Math.max(3, bd.d * k));
      const tint = { urban: '#a9a69b', industrial: '#7b8085', military: '#8a8466', farm: '#a08f6c', village: '#9a9588' } as const;
      for (const c of m.map.compounds) { b.fillStyle = 'rgba(255,255,255,.07)'; b.beginPath(); b.arc(px(c.x), pz(c.z), c.r * k, 0, Math.PI * 2); b.fill(); }
      for (const bd of m.map.buildings) { const c = m.map.compounds.find(o => Math.hypot(o.x - bd.x, o.z - bd.z) < o.r); b.fillStyle = c ? tint[c.theme] : '#8f8c80'; b.fillRect(px(bd.x - bd.w / 2), pz(bd.z - bd.d / 2), Math.max(3, bd.w * k), Math.max(3, bd.d * k)); }
      b.fillStyle = '#5b5f66'; for (const pr of m.map.props) if (pr.kind === 'container') b.fillRect(px(pr.x) - 1.5, pz(pr.z) - 1, 3, 2);
      b.font = '10px sans-serif'; b.textAlign = 'center'; b.fillStyle = 'rgba(255,255,255,.55)'; for (const c of m.map.compounds) b.fillText(c.name, px(c.x), pz(c.z) - c.r * k - 3);
      b.fillStyle = '#3d5a2c'; for (const t of m.map.trees) b.fillRect(px(t.x) - 1, pz(t.z) - 1, 2, 2);
    }
    const z = m.zone; g.clearRect(0, 0, S, S); g.drawImage(mapBase, 0, 0);
    g.save(); g.beginPath(); g.rect(0, 0, S, S); g.arc(px(z.cx), pz(z.cz), z.r * k, 0, Math.PI * 2, true); g.fillStyle = 'rgba(40,110,255,.30)'; g.fill('evenodd'); g.restore();
    g.strokeStyle = '#6fb2ff'; g.lineWidth = 2; g.beginPath(); g.arc(px(z.cx), pz(z.cz), z.r * k, 0, Math.PI * 2); g.stroke();
    if (z.nextR < z.r - 0.5) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.arc(px(z.nextCx), pz(z.nextCz), z.nextR * k, 0, Math.PI * 2); g.stroke(); }
    for (const r of m.reds) if (r.called && m.t < r.end + 2) { g.fillStyle = 'rgba(255,40,30,.3)'; g.beginPath(); g.arc(px(r.x), pz(r.z), r.r * k, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#ff4a3a'; g.lineWidth = 2; g.stroke(); }
    for (const v of m.vehicles) if (!v.wreck && v.driver < 0 && Math.hypot(v.x - p.x, v.z - p.z) < 140) { g.fillStyle = '#7ee0ff'; g.strokeStyle = '#000'; g.lineWidth = 1; g.fillRect(px(v.x) - 2.5, pz(v.z) - 2.5, 5, 5); g.strokeRect(px(v.x) - 2.5, pz(v.z) - 2.5, 5, 5); }
    if (m.plane && m.t < m.plane.end + 10) {
      const pl = m.plane, a = { x: pl.x0, z: pl.z0 }, b = { x: pl.x0 + pl.dx * pl.len, z: pl.z0 + pl.dz * pl.len }, at = m.planeAt(m.t);
      g.save(); g.strokeStyle = 'rgba(255,211,77,.85)'; g.lineWidth = 2; g.setLineDash([7, 5]); g.beginPath(); g.moveTo(px(a.x), pz(a.z)); g.lineTo(px(b.x), pz(b.z)); g.stroke(); g.setLineDash([]);
      g.translate(px(at.x), pz(at.z)); g.rotate(Math.atan2(pl.dz, pl.dx)); g.fillStyle = '#ffd34d'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -7); g.lineTo(-3, 0); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    for (const d of m.drops) if (d.called && m.t < d.at + 150) { const x = px(d.x), y = pz(d.z), pulse = 6 + Math.sin(m.t * 5) * 1.5; g.fillStyle = '#ffd34d'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - pulse); g.lineTo(x + pulse, y); g.lineTo(x, y + pulse); g.lineTo(x - pulse, y); g.closePath(); g.fill(); g.stroke(); }
    for (const s of m.sounds) { if (s.quiet || s.by === p.id || m.t - s.t > 1.6) continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d > 110) continue; g.fillStyle = `rgba(255,70,60,${1 - (m.t - s.t) / 1.6})`; g.beginPath(); g.arc(px(s.x), pz(s.z), 5, 0, Math.PI * 2); g.fill(); }
    if (pvp?.opp?.alive && m.mode === 'duel') { /* 상대 위치는 알려 주지 않습니다 */ }
    g.save(); g.translate(px(p.x), pz(p.z)); g.rotate(p.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -6); g.lineTo(-4, 0); g.lineTo(-7, 6); g.closePath(); g.stroke(); g.fill(); g.restore();
  }

  /** 위쪽 나침반: 방위(N·E·S·W)와 자기장 중심·보급 상자 방향을 띄웁니다. 시야 앞뒤 ±65° 를 보여 줍니다. */
  const compassCv = q<HTMLCanvasElement>('#sz-compass'), compassCtx = compassCv.getContext('2d')!;
  function drawCompass(m: Match, p: Player): void {
    const g = compassCtx, W = compassCv.width, Hh = compassCv.height, span = 65, per = W / (span * 2), D = 180 / Math.PI;
    const bearing = (dx: number, dz: number): number => Math.atan2(dx, -dz) * D, head = bearing(Math.cos(p.yaw), Math.sin(p.yaw)), at = (b: number): number => { let d = b - head; d = ((d + 540) % 360) - 180; return W / 2 + d * per; };
    g.clearRect(0, 0, W, Hh); g.fillStyle = 'rgba(10,12,14,.5)'; g.fillRect(0, 0, W, Hh); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 13px sans-serif';
    for (let b = 0; b < 360; b += 15) {
      const x = at(b); if (x < 0 || x > W) continue; const card = b % 90 === 0; g.fillStyle = card ? '#fff' : 'rgba(255,255,255,.55)';
      if (card) g.fillText(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[b], x, 12); else g.fillRect(x - 0.5, b % 45 === 0 ? 4 : 8, 1, b % 45 === 0 ? 14 : 8);
      if (b % 45 === 0 && !card) { g.font = '10px sans-serif'; g.fillText(String(b), x, 12); g.font = '700 13px sans-serif'; }
    }
    const z = m.zone, mark = (x: number, zz: number, color: string): void => { const b = bearing(x - p.x, zz - p.z), px = Math.max(8, Math.min(W - 8, at(b))); g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, 20); g.lineTo(px + 6, 27); g.lineTo(px, 33); g.lineTo(px - 6, 27); g.closePath(); g.fill(); g.stroke(); };
    mark(z.nextR < z.r - 0.5 ? z.nextCx : z.cx, z.nextR < z.r - 0.5 ? z.nextCz : z.cz, '#6fb2ff');
    for (const d of m.drops) if (d.called && !d.landed) mark(d.x, d.z, '#ffd34d');
    g.fillStyle = '#ff5a3c'; g.beginPath(); g.moveTo(W / 2, 20); g.lineTo(W / 2 + 5, 14); g.lineTo(W / 2 - 5, 14); g.closePath(); g.fill();
  }

  let lastMapDraw = 0;
  function updateHud(dt: number): void {
    const m = match!, p = me(), z = m.zone, g = p.guns[p.cur], def = g ? WEAPONS[g.id] : null, now = performance.now();
    if (!p.alive) audio.engine(false, 0);
    set(q('#sz-alive'), 'alive', String(m.aliveCount())); set(q('#sz-kills'), 'kills', String(p.kills));
    const delay = m.zoneDelay > 0 && m.t < m.zoneDelay, zl = delay ? '자기장 활성화까지' : z.phase >= 6 ? '마지막 자기장' : z.shrinking ? `자기장 수축 중 · ${z.phase + 1}단계` : `자기장 수축까지 · ${z.phase + 1}단계`;
    set(q('#sz-ztime'), 'zt', delay ? clock(m.zoneDelay - m.t) : z.timeLeft > 0 ? clock(z.timeLeft) : '--'); set(q('#sz-zlabel'), 'zl', zl); q('#sz-zone').classList.toggle('shrink', z.shrinking);
    // 비행기 안에서는 '자동 강하' 타이머 하나만 보입니다(자기장 타이머는 뛰어내린 뒤부터).
    q('#sz-zone').classList.toggle('hide', p.alive && p.air === 1 && !!m.plane);
    q('#sz-zone').classList.toggle('warning', !delay && !z.shrinking && z.timeLeft > 0 && z.timeLeft <= 10);
    if (phase === 'play' && p.alive && !delay && !z.shrinking && z.timeLeft > 0 && z.timeLeft <= 10 && z.nextR < z.r && zoneWarningPhase !== z.phase) { zoneWarningPhase = z.phase; say(`자기장 수축 ${Math.ceil(z.timeLeft)}초 전`, 3); audio.play('zone'); }
    q('#sz-hp').style.width = `${clamp(p.hp, 0, 100)}%`; set(q('#sz-hpn'), 'hpn', String(Math.ceil(Math.max(0, p.hp)))); q('#sz-ar').style.width = `${clamp(p.armor, 0, 100)}%`; set(q('#sz-arn'), 'arn', String(Math.ceil(p.armor)));
    q('.sz-bl').classList.toggle('low', p.hp < 30);
    { const H = p.healKind === 'kit' ? HEAL.kit : HEAL.bandage, on = p.healT > 0; q('#sz-cast').classList.toggle('show', on); if (on) { set(q('#sz-castl'), 'castl', `${H.name} 사용 중`); q('#sz-castb').style.width = `${clamp((1 - p.healT / H.time) * 100, 0, 100)}%`; } }
    set(q('#sz-wname'), 'wn', def ? def.name + (p.reload > 0 ? ' · 장전 중' : '') : '맨손'); set(q('#sz-mag'), 'mag', g ? String(g.mag) : '-'); set(q('#sz-res'), 'res', g ? `/ ${g.reserve}` : ''); q('#sz-mag').classList.toggle('low', !!g && g.mag <= Math.max(2, Math.ceil(WEAPONS[g.id].mag * 0.2))); q('#sz-mag').classList.toggle('reloading', p.reload > 0);
    const ic = (svg: string): string => `<i class="gi">${svg}</i>`;
    const gear = [p.bandages > 0 ? `<span class="gear heal">${ic(gearIcon.bandage())}붕대 ${p.bandages} <small>H</small></span>` : '', p.kits > 0 ? `<span class="gear heal">${ic(gearIcon.medkit())}구급상자 ${p.kits} <small>U</small></span>` : '', p.armorLv > 0 ? `<span class="gear">${ic(gearIcon.vest(p.armorLv))}${ARMOR_NAMES[p.armorLv]}</span>` : '', p.nades > 0 ? `<span class="gear">${ic(gearIcon.nade())}수류탄 ${p.nades} <small>G</small></span>` : '', p.smokes > 0 ? `<span class="gear">${ic(gearIcon.smoke())}연막탄 ${p.smokes} <small>B</small></span>` : '', p.flashes > 0 ? `<span class="gear">${ic(gearIcon.flash())}섬광탄 ${p.flashes} <small>V</small></span>` : '', p.helmet > 0 ? `<span class="gear">${ic(gearIcon.helmet(p.helmet))}${HELMET_NAMES[p.helmet]}</span>` : '', p.boost > 0 ? `<span class="gear boost">${ic(gearIcon.boost())}부스트 ${Math.ceil(p.boost)}초</span>` : '', p.parts.length > 0 ? `<span class="gear heal">${ic(gearIcon.parts())}파츠 ${p.parts.length} <small>${touch ? '조립' : 'L'}</small></span>` : ''].join('');
    html(q('#sz-slots'), 'slots', gear + p.guns.map((x, i) => `<span class="${i === p.cur ? 'on' : ''}">${i + 1} ${x ? WEAPONS[x.id].name : '비어 있음'}${x && Object.keys(x.att).length ? `<small>${Object.values(x.att).map(a => PARTS[a].name.replace(' 조준경', '').replace(' 사이트', '')).join(' · ')}</small>` : ''}</span>`).join(''));
    // 조준선: 탄퍼짐에 맞춰 벌어집니다
    if (def && view) { const spread = def.spread * partHandling(g!.att).spread * (p.ads ? adsSpread(g!.att) : 1) * (1 + Math.min(1.6, p.speed / PLAYER.walk) * 0.5) * (1 + p.kick * 0.5), px = Math.tan(spread * (def.pellets > 1 ? 2 : 1)) / Math.tan((view.fov * Math.PI) / 360) * (canvas.clientHeight / 2); q('#sz-cross').style.setProperty('--gap', `${clamp(px, 4, 90).toFixed(1)}px`); }
    q('#sz-cross').classList.toggle('hide', p.ads && g?.id === 'sniper' || !p.alive);
    // 낙하 안내: 비행기 안·자유낙하·낙하산
    { const air = q('#sz-air'); let txt = '';
      if (p.alive && p.air && m.plane) {
        const jumpKey = touch ? '줍기 버튼' : 'Space', cs = m.map.compounds; let near = '', nd = Infinity; for (const c of cs) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < nd) { nd = d; near = c.name; } }
        const spot = near ? ` · 가장 가까운 곳 ${near} ${Math.round(nd)}m` : '';
        if (p.air === 1 && phase === 'countdown') txt = `${jumpQueued ? '출격 신호와 함께 뛰어내립니다' : '출격 신호 뒤 뛰어내릴 수 있습니다'}<small>${jumpQueued ? '착지할 곳은 지도에서 고르세요' : `지금 <b>${jumpKey}</b> 를 누르면 신호와 동시에 뛰어내립니다`}</small>`;
        else if (p.air === 1) txt = `<b>${jumpKey}</b> 뛰어내리기 · 비행기 ${Math.max(0, Math.ceil(m.plane.end - m.t))}초 뒤 자동 강하<small>지도에서 노란 항로를 보고 내릴 곳을 고르세요${spot}</small>`;
        else if (p.air === 2) txt = `자유낙하 · 고도 ${Math.round(p.alt)}m<small><b>${jumpKey}</b> 낙하산 펴기 (${AIR.manualOpen}m 아래부터, ${AIR.open}m 에서 자동) · W 활강 · Shift 급강하${spot}</small>`;
        else txt = `낙하산 · 고도 ${Math.round(p.alt)}m<small>W 앞으로 · Shift 빠르게${spot}</small>`;
      }
      air.classList.toggle('show', !!txt); html(air, 'air', txt); }
    // 줍기 안내
    let near: string | null = null; if (p.alive) for (const l of m.loot) { if (l.taken || (l.kind !== 'weapon' && l.kind !== 'attach')) continue; if (Math.hypot(l.x - p.x, l.z - p.z) < PLAYER.pickup) { if (l.kind === 'weapon') { near = WEAPONS[l.weapon!].name; break; } if (p.parts.length >= BAG_MAX) { near = '파츠 가방이 가득 찼습니다'; break; } } }
    if (!near && p.alive && p.air === 0 && p.veh < 0) { const v = m.vehicleNear(p); if (v) near = `${VEHICLES[v.kind].name} 탑승`; }
    q('#sz-prompt').classList.toggle('show', !!near); set(q('#sz-prompt'), 'prompt', near ? `${touch ? '줍기 버튼' : 'E'} · ${near}` : '');
    // 자기장 밖
    const out = Math.hypot(p.x - z.cx, p.z - z.cz) > z.r && p.alive && !p.air && m.t >= m.zoneDelay; q('#sz-zonefx').classList.toggle('on', out); audio.danger(out ? 1 : 0);
    if (out && !paused && phase === 'play' && Math.floor(m.t) !== zoneTick) { zoneTick = Math.floor(m.t); const fx = q('#sz-zonefx'); fx.classList.remove('tick'); void fx.offsetWidth; fx.classList.add('tick'); }
    if (out) say(`자기장 밖 · 초당 -${z.dps.toFixed(1)}`, 0.4);
    // 차량 계기판 · 폭격 경고
    { const v = p.veh >= 0 ? m.vehicles[p.veh] : null; q('#sz-veh').classList.toggle('show', !!v && p.alive);
      if (v) { set(q('#sz-vname'), 'vname', VEHICLES[v.kind].name); set(q('#sz-vspd'), 'vspd', String(Math.round(Math.abs(v.speed) * 3.6))); q('#sz-vhp').style.width = `${clamp((v.hp / v.max) * 100, 0, 100)}%`; q('#sz-vbar').classList.toggle('low', v.hp < v.max * 0.35); set(q('#sz-vkeys'), 'vkeys', touch ? '줍기 버튼: 하차 · 웅크림 버튼: 핸드브레이크' : 'WASD 운전 · Space 핸드브레이크 · E 하차'); }
      q('.sz-br').classList.toggle('hide', !!v || (p.alive && p.air > 0)); // 비행기·낙하 중에는 무기 HUD 를 숨깁니다
      audio.engine(!!v && p.alive, v ? Math.abs(v.speed) / VEHICLES[v.kind].top : 0);
      const red = p.alive && !p.air ? m.redAt(p.x, p.z) : null, hot = !!red && m.t >= red.call; q('#sz-redfx').classList.toggle('on', hot); if (hot) say(m.t >= red!.start ? '폭격 구역 · 지금 벗어나세요!' : '폭격 구역 · 곧 폭격이 시작됩니다', 0.4); }
    // 데미지 비네트
    q('#sz-flashfx').style.opacity = String(p.alive ? clamp(p.blind / 1.6, 0, 1) : 0);
    q('#sz-vig').style.opacity = String(clamp(p.hurt * 1.4 + (p.hp < 30 && p.alive ? 0.35 + Math.sin(now / 160) * 0.12 : 0), 0, 0.9));
    q('#sz-scope').classList.toggle('on', p.ads && g?.id === 'sniper' && p.alive);
    // 명중 표시와 배너
    hitT = Math.max(0, hitT - dt); const hm = q('#sz-hitmark'); hm.style.opacity = String(hitT > 0 ? Math.min(1, hitT * 6) : 0); hm.classList.toggle('head', hitHead); hm.classList.toggle('kill', hitKill && hitT > 0);
    room?.chat?.tick(performance.now());
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) q('#sz-banner').classList.remove('show'); }
    // 처치 알림
    while (feed.length && now - feed[0].at > 6000) feed.shift();
    html(q('#sz-feed'), 'feed', feed.map(f => `<li class="${f.mine ? 'mine' : ''}"><span>${esc(f.text)}</span><b>${esc(f.weapon)}</b></li>`).join(''));
    q('#sz-keys').classList.toggle('hide', phase !== 'countdown' || touch);
    html(q('#sz-keys'), 'keys', phase === 'countdown' && !touch ? '<span><b>WASD</b> 이동</span><span><b>J / 좌클릭</b> 사격</span><span><b>K / 우클릭</b> 조준</span><span><b>C</b> 웅크리기</span><span><b>E</b> 줍기</span>' : '');
    if (now - lastMapDraw >= 150) { drawMap(m, p); lastMapDraw = now; } drawCompass(m, p);
  }

  // ---------- 이벤트 처리 ----------
  function onEvents(events: MatchEvent[]): void {
    const m = match!, p = me();
    for (const e of events) {
      if (e.t === 'shot') {
        const s = m.players[e.id]; if (!s) continue; const dist = Math.hypot(s.x - p.x, s.z - p.z); audio.play(e.weapon, (e.id === p.id ? 0 : dist) + (e.sup ? 85 : 0));
        if (e.id === p.id && !e.remote) { shotsFired++; if (e.hit) shotsHit++; }
        if (e.id === p.id && !e.remote) {
          const g = p.guns[p.cur], h = partHandling(g?.att), kk = WEAPONS[e.weapon].recoil * h.kick * (p.ads ? FEEL.adsKick : 1) * (1 + Math.min(1, p.speed / PLAYER.walk) * 0.25);
          const kp = kk * FEEL.kickPitch, ky = (Math.sin(shotN * 1.9) * 0.6 + (Math.random() - 0.5) * 0.8) * kk * FEEL.kickYaw; shotN++;
          pitch = clamp(pitch + kp, -1.4, 1.4); yaw += ky; rcP += kp; rcY += ky; rcIdle = 0;
        }
        if (e.id === p.id && !e.remote) { const sh = { w: e.weapon, ox: e.ox, oy: e.oy, oz: e.oz, ends: e.ends }; if (pvp?.net.started) pvp.net.sendShot(sh); else if (room?.net.started) room.net.sendShot(sh); }
      } else if (e.t === 'hit') {
        if (e.wall) continue;
        if (e.attacker === p.id && e.victim >= 0) {
          hitT = 0.3; hitHead = e.head; hitKill = false; combo = Math.min(6, combo + 1); comboT = 1.8; audio.play(e.head ? 'headshot' : 'hitmark', 0, combo);
          const hm = q('#sz-hitmark'); hm.classList.remove('pop'); void hm.offsetWidth; hm.classList.add('pop');
          const n = document.createElement('b'); n.textContent = `${e.dmg}${combo > 1 ? ` / ${combo} HIT` : ''}`; n.className = e.head ? 'head' : ''; n.style.left = `${(Math.random() - 0.5) * 70}px`; q('#sz-nums').append(n); window.setTimeout(() => n.remove(), 700);
        }
        if (e.victim === p.id) {
          audio.play('hurt'); const rel = (m.players[e.attacker] ? Math.atan2(m.players[e.attacker].z - p.z, m.players[e.attacker].x - p.x) : p.hurtYaw) - yaw, d = document.createElement('i');
          d.style.transform = `rotate(${(rel * 180) / Math.PI + 90}deg)`; q('#sz-dmgs').append(d); window.setTimeout(() => d.remove(), 900);
          if (pvp && e.attacker >= 0) pvp.net.sendAck(e.dmg, e.head);
        }
      } else if (e.t === 'kill') {
        if (!pvp && !m.over) { const left = m.aliveCount(); for (const n of [50, 25, 10, 5, 3]) if (left <= n && !told.has(n)) { told.add(n); if (left === n || n >= 25) say(`${left}명 생존`, 1.6); } }
        const mine = e.attacker === p.id, text = e.attacker < 0 || e.victim === e.attacker ? `${nameOf(e.victim)} 쓰러짐` : `${nameOf(e.attacker)} → ${nameOf(e.victim)}`;
        addFeed(text, causeName(e.weapon), mine || e.victim === p.id);
        if (mine) { audio.play('kill'); hitKill = true; hitT = 0.55; const hm = q('#sz-hitmark'); hm.classList.remove('pop'); void hm.offsetWidth; hm.classList.add('pop'); say(`처치 · ${nameOf(e.victim)}`, 1.4) }
        if (e.victim === p.id) onMyDeath(e.attacker);
      } else if (e.t === 'pickup') {
        if (e.id === p.id) { audio.play(e.kind === 'medkit' || e.kind === 'bandage' ? 'heal' : e.kind === 'armor' ? 'armor' : 'pickup'); say(e.kind === 'attach' && e.part ? `${PARTS[e.part].name} 획득 · ${touch ? '조립 버튼' : 'L'} 으로 조립` : e.kind === 'helmet' ? `${HELMET_NAMES[e.level ?? 1]} 착용` : e.kind === 'boost' ? '에너지 드링크 · 부스트' : e.kind === 'grenade' ? '수류탄 +2' : e.kind === 'smoke' ? '연막탄 +1 · B 로 던지기' : e.kind === 'flash' ? '섬광탄 +1 · V 로 던지기' : e.kind === 'weapon' ? `${WEAPONS[e.weapon!].name} 획득` : e.kind === 'bandage' ? `붕대 +${HEAL.bandage.pick}` : e.kind === 'medkit' ? '구급상자 +1' : e.kind === 'armor' ? `${ARMOR_NAMES[Math.max(1, Math.min(3, e.level || 2))]} 장착` : '탄약 +', 1.1); if (pvp && e.loot < m.map.loot.length) pvp.net.sendPickup(e.loot); else if (room) room.net.sendPickup(e.loot); }
      } else if (e.t === 'heal') { if (e.id === p.id) { if (e.stage === 'done') { audio.play('heal'); say(`${e.kind === 'kit' ? '구급상자' : '붕대'} 사용 완료`, 1.2); } else if (e.stage === 'cancel') say('치료 중단', 1); } }
      else if (e.t === 'bagfull') { if (e.id === p.id) say('파츠 가방이 가득 찼습니다', 1.4); }
      else if (e.t === 'equip') { /* 조립 화면이 이미 반영합니다 */ }
      else if (e.t === 'drop') { if (e.stage === 'call') { say('보급 투하! 지도의 노란 표시를 확인하세요', 3); audio.play('armor'); } else say('보급 상자 착륙 · 최상급 전리품', 3); }
      else if (e.t === 'jump') { if (e.id === p.id) { audio.play('go'); say('강하 시작', 1.4); } }
      else if (e.t === 'chute') { if (e.id === p.id) { audio.play('pickup'); say('낙하산 펼침', 1.4); } }
      else if (e.t === 'land') { if (e.id === p.id) { audio.play('armor'); say('착지 · 총을 찾으세요', 2.4); } }
      else if (e.t === 'nade') { if (e.stage === 'boom' && e.smoke) continue; const dd = Math.hypot(e.x - p.x, e.z - p.z); audio.play(e.stage === 'boom' ? 'boom' : 'pistol', e.stage === 'boom' ? dd * 0.6 : dd + 30); }
      else if (e.t === 'veh') {
        const dd = Math.hypot(e.x - p.x, e.z - p.z), v = m.vehicles[e.id];
        if (e.stage === 'enter' && v?.driver === p.id) { audio.play('go'); say(`${VEHICLES[v.kind].name} 탑승 · WASD 운전 · E 하차`, 2.2); yaw = v.yaw; pitch = 0; }
        else if (e.stage === 'exit' && v && p.veh < 0 && !p.air) { if (dd < 5) audio.play('pickup'); }
        else if (e.stage === 'crash') audio.play('crash', dd);
      }
      else if (e.t === 'red') { if (e.stage === 'call') { say('폭격 경고! 지도의 붉은 구역에서 벗어나세요', 3.4); audio.play('siren'); } }
      else if (e.t === 'reload') { if (e.id === p.id) audio.play('reload'); }
      else if (e.t === 'empty') { if (e.id === p.id) audio.play('empty'); }
      else if (e.t === 'over') { onOver(e.winner); }
    }
  }
  function onMyDeath(by: number): void {
    phase = 'dead'; deadTimer = 0; spectateId = by >= 0 && match!.players[by]?.alive ? by : -1; mouse.fire = mouse.ads = false; tc.fire = false; audio.play('lose');
    if (pvp) { pvp.deadAt = match!.t; pvp.net.sendDead(match!.t); settleTie(); }
    else if (room) { const r = room, m = match; r.net.sendDead(m!.t, by, Math.max(0, CAUSES.indexOf(me().killedWeapon ?? 'zone'))); window.setTimeout(() => { if (!closed && room === r && match === m && !r.shown && !m?.over) { r.shown = true; roomResult(); } }, 1600); }
  }
  function onOver(winner: number): void {
    over = true; if (pvp) return;
    if (room) { const r = room, m = match; window.setTimeout(() => { if (!closed && room === r && match === m) roomResult(); }, me().alive ? 1400 : 500); return; }
    const p = me(); if (phase !== 'dead') phase = 'over'; const win = winner === p.id; if (win) audio.play('win');
    if (!resultShown) {
      resultShown = true;
      const finished = match;
      window.setTimeout(() => { if (match === finished) showResult(win); }, win ? 1400 : 300);
    }
  }
  function killerLine(p: Player, win: boolean): string {
    if (win) return '<p class="sz-killer">마지막까지 살아남았습니다</p>';
    if (p.killedWeapon === 'zone') return '<p class="sz-killer">자기장 밖에서 쓰러졌습니다</p>';
    if (p.killedBy < 0) return p.killedWeapon === 'bomb' ? '<p class="sz-killer">폭격에 쓰러졌습니다</p>' : p.killedWeapon === 'vehicle' ? '<p class="sz-killer">차량 사고로 쓰러졌습니다</p>' : '';
    const k = match!.players[p.killedBy], w = p.killedWeapon ? causeName(p.killedWeapon) : '';
    return k ? `<p class="sz-killer">${k.name}에게 쓰러짐 · ${w}${k.alive ? ` · 상대 체력 ${Math.ceil(k.hp)}` : ''}</p>` : '';
  }
  function showResult(win: boolean): void {
    if (closed || !match) return; const p = me(), t = match.t, rank = win ? 1 : p.place; if (document.pointerLockElement) document.exitPointerLock();
    if (!soloRecorded) {
      newKillRecord = p.kills > career.bestKills;
      recordShooterMatch(win, p.kills);
      career = readShooterCareer();
      soloRecorded = true;
    }
    card('ZERO ZONE · 전투 결과', win ? '최후의 1인' : `#${rank}`, `<p class="sz-big">${win ? '승리' : `${match.players.length}명 중 ${rank}위`}</p><div class="sz-stats"><div class="${newKillRecord ? 'record' : ''}"><b>${p.kills}</b><span>처치${newKillRecord ? ' · 신기록' : ''}</span></div><div><b>${Math.round(p.dmgDealt)}</b><span>준 피해</span></div><div><b>${clock(win ? t : p.diedAt)}</b><span>생존 시간</span></div><div><b>${shotsFired ? Math.round(shotsHit / shotsFired * 100) + '%' : '—'}</b><span>명중률</span></div></div>${killerLine(p, win)}`,
      `<button class="primary" data-act="again">다시 출격</button>${!win && !match.over ? '<button data-act="spectate">관전 계속</button><button data-act="skip">결과까지 건너뛰기</button>' : ''}<button data-act="setup">설정으로</button><button data-act="exit">메뉴로</button>`, win ? 'win' : '');
  }

  /** 시뮬레이션을 화면 없이 끝까지 돌립니다(내가 쓰러진 뒤 결과만 보고 싶을 때). */
  function skip(maxSeconds = 600): void { const m = match; if (!m) return; for (let t = 0; t < maxSeconds && !m.over; t += 1 / 30) { m.step(1 / 30); m.drain(); } if (m.over) onOver(m.winner); }

  // ---------- 일시정지·메뉴 ----------
  function setPause(on: boolean): void {
    if (pvpRunning() || (phase !== 'play' && phase !== 'countdown') || closed) return; paused = on; if (on) pausedAt = performance.now();
    if (on) { keys.clear(); interactHeld = false; tReset(); reloadReq = swapReq = nadeReq = smokeReq = flashReq = jumpQueued = false; healReq = 0; slotReq = -1; mouse.fire = mouse.ads = false; if (document.pointerLockElement === canvas) document.exitPointerLock(); card('ZERO ZONE', '일시정지', '', `<button class="primary" data-act="resume">이어하기</button><button data-act="again">다시 시작</button><button data-act="sound">소리 ${audio.enabled ? '켜짐' : '꺼짐'}</button><button data-act="setup">설정</button><button data-act="exit">게임 목록으로</button>`); }
    else { modal.className = 'sz-modal'; modal.innerHTML = ''; if (!touch) lock(); }
  }
  q('#sz-pause').addEventListener('click', () => { if (pvpRunning()) { say('대전 중에는 멈출 수 없습니다', 1.4); return; } setPause(true); });
  modal.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act; if (!a) return; audio.unlock();
    if (a === 'resume') setPause(false);
    else if (a === 'sound') { audio.setEnabled(!audio.enabled); writeSound(audio.enabled); setPause(true); }
    else if (a === 'again') { startSolo(); }
    else if (a === 'setup') { endMatch(); hud.hidden = true; modal.className = 'sz-modal'; modal.innerHTML = ''; phase = 'setup'; paused = false; setupEl.hidden = false; paintSetup(); }
    else if (a === 'spectate') { modal.className = 'sz-modal'; modal.innerHTML = ''; resultShown = false; if (room) room.shown = true; }
    else if (a === 'skip') { modal.className = 'sz-modal'; resultShown = false; skip(); }
    else if (a === 'roomagain') { leaveRoom(); endMatch(); hud.hidden = true; modal.className = 'sz-modal'; modal.innerHTML = ''; phase = 'setup'; setupEl.hidden = false; pickMode = 'room'; paintSetup(); openPvpLobby(true); }
    else if (a === 'rematch') { leavePvpSilently(); endMatch(); hud.hidden = true; modal.className = 'sz-modal'; modal.innerHTML = ''; phase = 'setup'; setupEl.hidden = false; pickMode = 'pvp'; paintSetup(); openPvpLobby(); }
    else if (a === 'exit') exit();
  });
  function leavePvpSilently(): void { endPvp(); }

  // ---------- 매 프레임 ----------
  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame); audio.setPaused(paused);
    const real = Math.min(0.5, Math.max(0, (now - last) / 1000)), dt = Math.min(0.05, real); last = now;
    if (!match || !view) return;
    const m = match, p = me();
    if (phase === 'countdown' && !paused) {
      countdown -= real; const c = Math.ceil(countdown - 0.4), el = q('#sz-count');
      if (c > 0) { set(el, 'cd', String(c)); el.classList.add('show'); } else { set(el, 'cd', '출격'); }
      if (countdown <= 0.4 && phase === 'countdown') { phase = 'play'; q('#sz-count').classList.remove('show'); audio.play('go'); say('마지막까지 살아남으세요', 2.2) }
      p.input.yaw = yaw; p.input.pitch = pitch;
    }
    if ((phase === 'play' || phase === 'dead' || phase === 'over') && !paused) {
      if (phase === 'play') {
        // 반동 복귀: 사격을 멈추면 튄 시점이 일부 되돌아옵니다(손으로 눌러 내린 만큼은 그대로)
        rcIdle += dt; if (rcIdle > 0.07 && (rcP !== 0 || rcY !== 0)) { const f = Math.min(1, dt * FEEL.recover), bp = rcP * f, by = rcY * f; rcP -= bp; rcY -= by; pitch = clamp(pitch - bp * FEEL.recoverShare, -1.4, 1.4); yaw -= by * FEEL.recoverShare; if (Math.abs(rcP) < 1e-4 && Math.abs(rcY) < 1e-4) rcP = rcY = 0; }
        comboT -= dt; if (comboT <= 0) combo = 0;
        if (p.alive && !p.air && p.speed > 2.2 && p.crouch < 0.4) { stepAcc += p.speed * dt; const stride = p.speed > 6 ? 2.3 : 1.85; if (stepAcc >= stride) { stepAcc -= stride; audio.play(waterDepth(m.map.terrain, p.x, p.z) ? 'splash' : p.speed > 6 ? 'stepRun' : 'step'); } } else stepAcc = Math.min(stepAcc, 1);
        for (const other of m.players) { if (other.id === p.id || !other.alive || other.air || other.veh >= 0 || other.speed <= 2.2 || other.crouch >= 0.4) { otherSteps.delete(other.id); continue; } const dist = Math.hypot(other.x - p.x, other.z - p.z); if (dist > 35) { otherSteps.delete(other.id); continue; } const acc = (otherSteps.get(other.id) ?? 0) + other.speed * dt, stride = other.speed > 6 ? 2.3 : 1.85; if (acc >= stride) audio.play(other.speed > 6 ? 'stepRun' : 'step', dist * 4); otherSteps.set(other.id, acc % stride); }
        applyInput(dt);
        // 운전 중에는 마우스를 놓고 달리면 시점이 차의 정면으로 천천히 돌아옵니다
        if (p.veh >= 0) { const v = m.vehicles[p.veh]; if (v && Math.abs(v.speed) > 4 && performance.now() - lastLook > 900) { const d = Math.atan2(Math.sin(v.yaw - yaw), Math.cos(v.yaw - yaw)); yaw += d * Math.min(1, dt * 1.6); pitch += (0 - pitch) * Math.min(1, dt * 1.2); } }
      }
      // 고정 간격(1/60)으로 진행: 프레임이 느려도 시뮬레이션 속도는 같습니다
      let left = dt; while (left > 1e-6) { const s = Math.min(1 / 60, left); left -= s; if (pvp && pvp.opp) syncRemote(s); else if (room) syncRoom(s); m.step(s); }
      if (pvp?.net.started && phase === 'play') pvp.net.sendPose({ x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, armor: p.armor, w: p.guns[p.cur]?.id ?? 'pistol', speed: p.speed, ads: p.ads, reloading: p.reload > 0, crouch: p.crouch > 0.5 }, now);
      if (room?.net.started && phase === 'play') { const v = p.veh >= 0 ? m.vehicles[p.veh] : undefined; room.net.sendPose({ x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, armor: p.armor, w: p.guns[p.cur]?.id ?? 'pistol', speed: p.speed, ads: p.ads, reloading: p.reload > 0, crouch: p.crouch > 0.5, air: p.air, alt: p.alt, veh: p.veh, vs: v && !v.remote ? [v.x, v.z, v.yaw, v.speed] : undefined }, now); }
      const ev = m.drain(); if (ev.length) { view.handle(ev, p); onEvents(ev); }
      if (room) roomTick(ev, now);
      if (pvp?.net.started) for (const e of ev) if (e.t === 'nade' && e.stage === 'throw' && e.id === p.id && !e.remote && e.vx !== undefined) pvp.net.sendNade({ x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy ?? 0, vz: e.vz ?? 0, smoke: e.smoke, flash: e.flash });
    }
    if (phase === 'dead') {
      deadTimer += dt;
      if (spectateId < 0 || !m.players[spectateId]?.alive) { const alive = m.players.filter(x => x.alive && x.id !== p.id); spectateId = alive.length ? alive[Math.floor(m.t) % alive.length].id : -1; }
      if (!pvp && !room && !soloRecorded && !over && deadTimer > 1.8) { resultShown = true; showResult(false); }
    }
    const spectate = phase === 'dead' || (phase === 'over' && !p.alive) ? m.players[spectateId] ?? null : null;
    const gun = p.guns[p.cur], zoom = p.ads && p.alive ? Math.max(gun?.id === 'sniper' ? 3.4 : gun?.id === 'rifle' ? 1.5 : 1.3, gun?.att.sight ? PARTS[gun.att.sight].zoom : 1) : 1;
    view.frame(dt, p, spectate && spectate.alive ? spectate : null, zoom / (p.veh >= 0 ? 1 + Math.min(0.14, p.speed * 0.004) : p.speed > 6.1 && !p.ads && p.alive && p.air === 0 ? FEEL.sprintFov : 1)); updateHud(real); if (phase === 'dead' && !spectate) q('#sz-prompt').classList.remove('show');
  }
  /** 상대(원격) 선수를 마지막으로 받은 위치로 부드럽게 따라가게 합니다. */
  function syncRemote(dt: number): void {
    const o = pvp!.opp!, t = pvp!.target; if (!t || !o.alive) return; const k = Math.min(1, dt * 14);
    o.x += (t.x - o.x) * k; o.z += (t.z - o.z) * k; let dy = t.yaw - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * k; o.pitch += (t.pitch - o.pitch) * k;
    o.hp = t.hp; o.armor = t.armor; o.speed = t.speed; o.walk += t.speed * dt; o.ads = t.ads; o.crouch += ((t.crouch ? 1 : 0) - o.crouch) * Math.min(1, dt * 12); o.reload = t.reloading ? 1 : 0;
    if (o.guns[0]?.id !== t.w) o.guns[0] = { id: t.w, mag: 1, reserve: 0, att: {} }; o.cur = 0;
  }

  function resize(): void { view?.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); }
  window.addEventListener('resize', resize);

  function exit(): void {
    if (closed) return; closed = true; closeSmith?.(); window.clearInterval(bgTimer); cancelAnimationFrame(raf); leavePvp(); leaveRoom(); if (document.pointerLockElement) document.exitPointerLock(); loading?.close();
    for (const [t, f] of [['mousemove', onMove], ['mousedown', onDown], ['mouseup', onUp], ['keydown', onKey], ['keyup', onKey], ['wheel', onWheel], ['resize', resize], ['blur', blur], ['pointerup', tEnd], ['pointercancel', tEnd], ['blur', tReset]] as const) window.removeEventListener(t, f as EventListener); document.removeEventListener('visibilitychange', tReset); document.removeEventListener('visibilitychange', onHidden);
    document.removeEventListener('pointerlockchange', onLock); endMatch(); audio.dispose(); root.remove(); onExit();
  }
  raf = requestAnimationFrame(frame);
}
