import '../shared/game-polish.css';
// ZERO ZONE — 배틀로열 총게임 화면: 출격 설정, 조작(키보드·마우스·터치), HUD, 솔로(AI 99명, 비행기 낙하)와 1대1 온라인 대전의 진행.
import './shooter.css';
import { readPreferences } from '../prefs';
import type { LoadingScreen } from '../loading';
import type { PvpSession, RoomSession } from '../net/lobby';
import { AIR, BOTS, FEEL, BR_PLAYERS, DIFFICULTIES, HELMET_NAMES, ARMOR_NAMES, HEAL, PARTS, PLAYER, VEHICLES, WEAPONS, adsSpread, partHandling, type Difficulty } from './config';
import { waterDepth } from './terrain';
import { Match, type Cause, type MatchEvent, type Player, type Vehicle } from './sim';
import { CAUSES, WorldSync, canAcceptRoomLoot, canAcceptVehicleDamageReport, easePuppet, encodeLoot, parseLoot } from './sync';
import type { NetMsg } from '../net/types';
import { ShooterView } from './view';
import { loadShooterAssets, type ShooterAssets } from './assets';
import { ShooterAudio } from './audio';
import { ShooterNet, decideDeath, nadeMsg, parseNade, seedOf, type Pose } from './net';
import { ShooterRoomNet, ROOM_MAX } from './room';
import { ChatBox } from './chat';
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
type Phase = 'setup' | 'loading' | 'countdown' | 'play' | 'dead' | 'over';
interface Room { s: RoomSession; net: ShooterRoomNet; remotes: Map<number, { p: Player; target: Pose | null }>; chat: ChatBox | null; done: boolean; seed: number; mine: number; shown: boolean; sync: WorldSync }
interface Pvp { s: PvpSession; net: ShooterNet; opp: Player | null; target: Pose | null; done: boolean; deadAt: number | null; oppDeadMt: number | null; seed: number; begun: boolean }

export interface OpenOptions { loading?: LoadingScreen }

export function openShooter(onExit: () => void, opts: OpenOptions = {}): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches, base = import.meta.env.BASE_URL;
  const root = document.createElement('div'); root.className = 'sz-root' + (touch ? ' touch' : '');
  root.innerHTML = `
    <canvas class="sz-canvas"></canvas>
    <div class="sz-hud" hidden>
      <div class="sz-vig" id="sz-vig"></div><div class="sz-zonefx" id="sz-zonefx"></div><div class="sz-redfx" id="sz-redfx"></div><div class="sz-scope" id="sz-scope"></div>
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
        <button data-act="fire" class="fire" type="button">사격</button><button data-act="ads" type="button">조준</button><button data-act="crouch" type="button">웅크림</button><button data-act="reload" type="button">장전</button><button data-act="interact" type="button">줍기</button><button data-act="swap" type="button">교체</button><button data-act="nade" type="button">수류탄</button><button data-act="heal1" type="button">붕대</button><button data-act="heal2" type="button">구급</button></div></div>
    </div>
    <div class="sz-setup" id="sz-setup"></div>
    <div class="sz-modal" id="sz-modal"></div>`;
  document.body.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  let canvas = q<HTMLCanvasElement>('.sz-canvas'); const hud = q('.sz-hud'), setupEl = q('#sz-setup'), modal = q('#sz-modal'), mapCv = q<HTMLCanvasElement>('#sz-map'), mapCtx = mapCv.getContext('2d')!;
  const audio = new ShooterAudio(); audio.enabled = prefs.sound;
  let career = readShooterCareer();
  let level: Difficulty = (DIFFICULTIES as string[]).includes(career.level) ? (career.level as Difficulty) : 'normal', pickMode: 'solo' | 'pvp' | 'room' = 'solo';

  let roomFill = 60;
  let phase: Phase = 'setup', closed = false, paused = false, match: Match | null = null, view: ShooterView | null = null, meIdx = 0, pvp: Pvp | null = null, room: Room | null = null, raf = 0, last = performance.now();
  let assets: ShooterAssets | null = null, assetState: 'loading' | 'ready' | 'failed' = 'loading', assetPct = 0;
  let countdown = 0, over = false, deadTimer = 0, resultShown = false, spectateId = -1;
  let soloRecorded = false;
  let lastLook = 0, yaw = 0, pitch = 0, locked = false, lockFail = false, hitT = 0, hitHead = false, hitKill = false, combo = 0, comboT = 0, rcP = 0, rcY = 0, rcIdle = 9, shotN = 0, stepAcc = 0, bannerT = 0, mapBase: HTMLCanvasElement | null = null;
  const keys = new Set<string>(), mouse = { fire: false, ads: false }, tc = { fire: false, ads: false, crouch: false, move: { x: 0, y: 0, id: -1, ox: 0, oy: 0 }, look: { id: -1, x: 0, y: 0 } };
  let healReq = 0, nadeReq = false, reloadReq = false, slotReq = -1, swapReq = false, interactHeld = false;
  const feed: Array<{ text: string; at: number; mine: boolean }> = [], told = new Set<number>();
  const cache = new Map<string, string>();
  const set = (el: HTMLElement, key: string, text: string): void => { if (cache.get(key) !== text) { cache.set(key, text); el.textContent = text; } };
  const html = (el: HTMLElement, key: string, v: string): void => { if (cache.get(key) !== v) { cache.set(key, v); el.innerHTML = v; } };
  const me = (): Player => match!.players[meIdx];

  // ---------- 자산(백그라운드로 받기) ----------
  const loading = opts.loading;
  void loadShooterAssets(base, f => {
    if (closed || Math.floor(f * 20) === Math.floor(assetPct * 20) && f < 1) return;
    assetPct = f;
    // Updating a small status label is cheaper than rebuilding the entire setup UI
    // for every network chunk (which also cancelled clicks on the start button).
    const status = setupEl.querySelector<HTMLElement>('#sz-asset-status');
    if (status) status.textContent = `3D 모델 준비 중 · ${Math.floor(f * 100)}%`;
  }).then(a => {
    if (!closed) { assets = a; assetState = 'ready'; view?.setAssets(a); }
  }).catch(() => {
    if (!closed) assetState = 'failed';
  }).finally(() => {
    if (!closed && phase === 'setup') paintSetup();
  });

  // ---------- 출격 설정 화면 ----------
  function paintSetup(): void {
    const b = BOTS[level], wait = assetState === 'loading';
    setupEl.hidden = false; setupEl.setAttribute('role', 'dialog'); setupEl.setAttribute('aria-label', 'ZERO ZONE 출격 설정');
    setupEl.innerHTML = `
      <div class="sz-setup-inner">
        <header><span class="sz-eyebrow">ZERO ZONE</span><h2>출격 설정</h2><p>줄어드는 자기장 안에서 마지막까지 살아남으세요. 총을 줍고, 엄폐하고, 쏩니다.</p></header>
        <section><h3>모드</h3><div class="sz-seg three">
          <button type="button" class="sz-opt ${pickMode === 'solo' ? 'on' : ''}" data-mode="solo" aria-pressed="${pickMode === 'solo'}"><b>솔로 배틀로열</b><em>나 + AI 99명 · 비행기에서 낙하산 강하 · 마지막 1명이 승리</em></button>
          ${PVP_ENABLED ? `<button type="button" class="sz-opt ${pickMode === 'pvp' ? 'on' : ''}" data-mode="pvp" aria-pressed="${pickMode === 'pvp'}"><b>1대1 온라인 대전</b><em>2인 PvP · 무작위 매칭 또는 방 코드</em></button>` : ''}
          ${PVP_ENABLED ? `<button type="button" class="sz-opt ${pickMode === 'room' ? 'on' : ''}" data-mode="room" aria-pressed="${pickMode === 'room'}"><b>멀티플레이 방</b><em>3~${ROOM_MAX}인 + AI · 방 코드 또는 공개 방 · 차량·폭격까지 함께</em></button>` : ''}</div></section>
        ${pickMode === 'room' ? `<section><h3>AI 채우기 <em class="sz-coin">방을 만들 때 적용</em></h3><div class="sz-seg four">${ROOM_FILLS.map(f => `<button type="button" class="sz-opt ${f === roomFill ? 'on' : ''}" data-fill="${f}" aria-pressed="${f === roomFill}"><b>${f ? `${f}명까지` : '사람만'}</b></button>`).join('')}</div>
          <p class="sz-note">${roomFill ? `빈자리를 AI로 채워 ${roomFill}명이 비행기에서 강하합니다. 차량·폭격·보급까지 모두에게 똑같이 보입니다(방장이 AI를 계산해 보냅니다).` : '사람끼리만 작은 지도에서 겨룹니다.'} 두 명만 모이면 1대1 랭크전으로 진행됩니다.</p></section>` : ''}
        <section class="${pickMode === 'pvp' || (pickMode === 'room' && !roomFill) ? 'dim' : ''}"><h3>AI 난이도</h3><div class="sz-seg four">${DIFFICULTIES.map(d => `<button type="button" class="sz-opt ${d === level ? 'on' : ''}" data-level="${d}" aria-pressed="${d === level}" ${pickMode === 'pvp' || (pickMode === 'room' && !roomFill) ? 'disabled' : ''}><b>${BOTS[d].label}</b></button>`).join('')}</div>
          <p class="sz-note">${pickMode === 'pvp' ? '1대1 대전은 사람끼리 겨루므로 AI가 나오지 않습니다.' : pickMode === 'room' && !roomFill ? '사람만 모이는 방에는 AI가 나오지 않습니다.' : `${b.blurb} (반응 ${b.react.toFixed(2)}초 · 시야 ${b.sight}m)${pickMode === 'room' ? ' · 방을 만든 사람의 난이도로 진행됩니다' : ''}`}</p></section>
        <section><h3>조작</h3><ul class="sz-help">${touch ? '<li>왼쪽 스틱 이동 · 오른쪽 드래그 시점</li><li>사격 · 조준 · 장전 · 줍기 · 교체 버튼 (비행기에서는 <b>줍기</b> 버튼이 점프·낙하산, 차 옆에서는 탑승·하차, 운전 중 <b>웅크림</b> 버튼은 핸드브레이크)</li>' : '<li><b>WASD</b> 이동 · <b>Shift</b> 달리기 · 마우스 시점</li><li><b>좌클릭</b> 사격 · <b>우클릭</b> 조준 · <b>R</b> 장전</li><li><b>Space</b> 비행기에서 뛰기 · 낙하산 펴기(자동 105m) · <b>W</b> 활강 방향</li><li><b>G</b> 수류탄 · <b>E</b> 무기 줍기 · <b>1 / 2 / 휠</b> 무기 교체 · <b>Esc</b> 일시정지</li><li><b>E</b> 차량 타기·내리기 · <b>WASD</b> 운전 · <b>Space</b> 핸드브레이크 · 폭격 구역(붉은 원)에서는 벗어나세요</li>'}<li>탄약·구급상자·방탄복은 닿으면 자동으로 줍습니다.</li></ul></section>
        <footer><button type="button" class="ghost" data-act="exit">메뉴로</button><span class="sz-sum">${career.matches ? `전적 ${career.matches}판 ${career.wins}승 · 최다 처치 ${career.bestKills}` : '첫 출격'}</span>
          <small id="sz-asset-status" aria-live="polite">${wait ? `3D 모델 준비 중 · ${Math.floor(assetPct * 100)}%` : assetState === 'ready' ? '고화질 3D 모델 준비 완료' : '경량 3D 모델로 플레이 가능'}</small>
          <button type="button" class="primary" data-act="start">${assetState === 'failed' && pickMode === 'solo' ? '경량 3D로 출격' : pickMode === 'solo' ? '출격' : pickMode === 'room' ? '방 찾기' : '상대 찾기'}</button></footer>
      </div>`;
  }
  setupEl.addEventListener('click', e => {
    const t = e.target as HTMLElement, mode = t.closest<HTMLElement>('[data-mode]'), lv = t.closest<HTMLElement>('[data-level]'), act = t.closest<HTMLElement>('[data-act]');
    const fillBtn = t.closest<HTMLElement>('[data-fill]'); if (fillBtn) { roomFill = Number(fillBtn.dataset.fill) || 0; paintSetup(); return; }
    if (mode) { pickMode = mode.dataset.mode as 'solo' | 'pvp' | 'room'; paintSetup(); } else if (lv) { level = lv.dataset.level as Difficulty; writeShooterCareer({ ...readShooterCareer(), level }); paintSetup(); }
    else if (act?.dataset.act === 'exit') exit(); else if (act?.dataset.act === 'start') { if (pickMode === 'solo') startSolo(); else openPvpLobby(pickMode === 'room'); }
  });
  paintSetup();
  // The setup is fully usable with procedural 3D models. Do not cover it with
  // a loading overlay while optional detailed character assets download.
  loading?.close();

  // ---------- 경기 시작 ----------
  function begin(m: Match, my: number): void {
    endMatch(); blur(); tc.ads = tc.crouch = false; root.querySelectorAll('.sz-tbuttons button.down').forEach(b => b.classList.remove('down')); locked = lockFail = false;
    // The previous renderer forces context loss on dispose. Never reuse its canvas.
    const fresh = document.createElement('canvas'); fresh.className = 'sz-canvas'; canvas.replaceWith(fresh); canvas = fresh; canvas.addEventListener('contextmenu', noMenu);
    hitT = combo = comboT = rcP = rcY = shotN = stepAcc = bannerT = lastLook = 0; hitHead = hitKill = false; rcIdle = 9; q('#sz-banner').classList.remove('show'); q('#sz-nums').replaceChildren(); q('#sz-dmgs').replaceChildren();
    match = m; meIdx = my; over = false; resultShown = false; soloRecorded = false; spectateId = -1; deadTimer = 0; cache.clear(); feed.length = 0; told.clear(); paused = false; modal.className = 'sz-modal'; modal.innerHTML = '';
    const p = m.players[my]; yaw = p.yaw; pitch = 0; countdown = 3.4; phase = 'countdown'; mapBase = null;
    try { view = new ShooterView(canvas, m, assets, prefs.quality); } catch { leavePvp(); leaveRoom(); endMatch(); phase = 'setup'; hud.hidden = true; setupEl.hidden = true; card('ZERO ZONE', '그래픽을 시작하지 못했어요', '<p>브라우저의 그래픽 가속을 확인한 뒤 다시 시도해 주세요.</p>', '<button class="primary" data-act="setup">설정으로</button><button data-act="exit">메뉴로</button>'); return; } resize(); setupEl.hidden = true; hud.hidden = false; buildSlots(); say(touch ? '왼쪽 스틱으로 이동' : '화면을 클릭해 조작 시작', 2.4);
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
    void import('../net/lobby').then(({ openLobby }) => openLobby({ game: 'shooter', maxPlayers: rooms ? ROOM_MAX : 2, config: () => (rooms && roomFill ? { seed: (Math.random() * 2 ** 31) >>> 0, mode: 'br', fill: roomFill, level } : { seed: (Math.random() * 2 ** 31) >>> 0, mode: 'duel' }), onMatch: startPvp, onRoom: startRoom, inGameChat: false, onClose: () => undefined }))
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
      onNade: n => { if (match && pvp?.opp) match.addNade(pvp.opp.id, n.x, n.y, n.z, n.vx, n.vy, n.vz); },
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
    if (match !== m || room !== r) return;
    r.chat = new ChatBox(hud, text => { r.chat?.add('나', me0, text, true, performance.now()); r.net.send({ t: 'ch', x: text }); }, () => { if (!touch && !locked && phase === 'play') lock(); });
  }
  /** 동기화 메시지(sync.ts 형식) */
  function roomData(id: string, msg: NetMsg): void {
    const r = room, m = match; if (!r || !m) return; const from = roomRemote(id), host = id === r.net.authority(), now = performance.now(), my = me();
    if (msg.t === 'ch') r.chat?.add(r.s.players.find(x => x.id === id)?.nickname ?? '참가자', id, msg.x, false, now);
    else if (msg.t === 'w') { if (host && !m.authority) r.sync.apply(msg, now); }
    else if (msg.t === 'bd') { if (host && !m.authority) r.sync.botDead(msg.i, msg.k, msg.c); }
    else if (msg.t === 'la') { const l = parseLoot(msg), senderIndex = r.net.list.indexOf(id); if (l && canAcceptRoomLoot(l, senderIndex, host, from?.p)) m.addLoot(l); }
    else if (msg.t === 'nd') { const n = parseNade(msg), o = typeof msg.o === 'number' && Number.isInteger(msg.o) ? m.players[msg.o] : undefined; if (n && o?.remote && o.alive && (o.bot ? host : o === from?.p)) m.addNade(o.id, n.x, n.y, n.z, n.vx, n.vy, n.vz); }
    else if (msg.t === 've') {
      // 손님이 차에 타려고 함: 방장만 판정합니다.
      const v = typeof msg.i === 'number' ? m.vehicles[msg.i] : undefined; if (!m.authority || !from || !v) return; const p = from.p;
      const ok = !v.wreck && v.driver < 0 && p.alive && !p.air && p.veh < 0 && m.vehicleNear(p) === v;
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
      const v = typeof msg.i === 'number' ? m.vehicles[msg.i] : undefined; if (!v || v.wreck || !from || v.driver !== from.p.id) return;
      const x = Number(msg.x), z = Number(msg.z), y = Number(msg.y), sp = Number(msg.s); if (![x, z, y, sp].every(Number.isFinite) || Math.abs(x) > 1000 || Math.abs(z) > 1000) return;
      if (m.authority) { if (v.remote) { r.sync.vehs.delete(v.id); v.x = x; v.z = z; v.yaw = y; v.speed = Math.max(-40, Math.min(40, sp)); reclaim(v); } }
      else if (v.remote) { if (v.driver === from.p.id) { from.p.veh = -1; v.driver = -1; } r.sync.vehicleState(v, x, z, y, sp, -1, true, now); }
    }
    else if (msg.t === 'vd') { const v = typeof msg.i === 'number' ? m.vehicles[msg.i] : undefined; if (v && canAcceptVehicleDamageReport(m.authority, v, from?.p, msg.d)) m.hurtVehicle(v, Math.min(400, msg.d), -1); }
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
      else if (e.t === 'nade' && e.stage === 'throw' && !e.remote && e.vx !== undefined) { const o = m.players[e.id]; if (o && !o.remote) r.net.send(nadeMsg({ x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy ?? 0, vz: e.vz ?? 0 }, o.id)); }
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
    card(`멀티플레이 방 · ${n}명`, win ? '최후의 1인' : `#${rank}`, `<p class="sz-big">${win ? '승리' : `${n}명 중 ${rank}위`}</p><div class="sz-stats"><div><b>${p.kills}</b><span>처치</span></div><div><b>${clock(win ? m.t : p.diedAt)}</b><span>생존 시간</span></div><div><b>${Math.round(p.dmgDealt)}</b><span>준 피해</span></div><div><b>${p.heads}</b><span>머리 명중</span></div></div>${win ? '' : killerLine(p, false)}`,
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
  function endMatch(): void { locked = false; if (document.pointerLockElement === canvas) document.exitPointerLock(); view?.dispose(); view = null; match = null; }

  // ---------- 조작 ----------
  const sens = (): number => 0.0023 / (view && me().ads ? Math.max(1, 78 / view.fov) * 0.9 : 1);
  function lock(): void { if (touch || locked || lockFail || closed || paused || !match) return; const target = canvas; try { const r = target.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => { if (canvas === target && !closed) lockFail = true; }); } catch { lockFail = true; } }
  document.addEventListener('pointerlockchange', onLock);
  function onLock(): void {
    const wasLocked = locked; locked = document.pointerLockElement === canvas;
    if (locked && (paused || closed || !match)) { document.exitPointerLock(); return; }
    if (!locked && wasLocked) blur();
    if (!locked && wasLocked && !paused && (phase === 'play' || phase === 'countdown') && !pvpRunning() && !closed) setPause(true);
    else if (!locked && wasLocked && pvpRunning() && !closed) say('클릭하면 조작이 돌아옵니다', 2);
  }
  const pvpRunning = (): boolean => ((!!pvp && !pvp.done) || (!!room && !room.done)) && !!match;
  function look(dx: number, dy: number): void { lastLook = performance.now(); const k = sens(); yaw += dx * k; pitch = clamp(pitch - dy * k, -1.4, 1.4); }
  const onMove = (e: MouseEvent): void => { if (!match || closed || paused) return; if (locked) look(e.movementX, e.movementY); else if (lockFail && (e.buttons & 2)) look(e.movementX, e.movementY); };
  const onDown = (e: MouseEvent): void => {
    if (closed || !match || paused || (phase !== 'play' && phase !== 'countdown') || e.target !== canvas) return; audio.unlock();
    if (!locked && !lockFail && !touch) { lock(); if (paused) setPause(false); return; }
    if (e.button === 0) mouse.fire = true; else if (e.button === 2) mouse.ads = true;
  };
  const onUp = (e: MouseEvent): void => { if (e.button === 0) mouse.fire = false; else if (e.button === 2) mouse.ads = false; };
  const onKey = (e: KeyboardEvent): void => {
    if (e.type === 'keyup') { keys.delete(e.code); if (e.code === 'KeyE') interactHeld = false; return; }
    if (closed || room?.chat?.typing || !match || (phase !== 'play' && phase !== 'countdown')) return;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.code === 'Escape' && !e.repeat && !pvpRunning()) { if (paused || !locked) { setPause(!paused); e.preventDefault(); } return; }
    if (paused) return;
    keys.add(e.code);
    if (e.repeat && ['KeyR', 'KeyE', 'KeyQ', 'KeyG', 'KeyH', 'KeyJ', 'Digit1', 'Digit2'].includes(e.code)) return;
    if (e.code === 'Enter' && room?.chat && !room.done && match && !paused) { keys.clear(); mouse.fire = mouse.ads = false; interactHeld = false; if (document.pointerLockElement === canvas) document.exitPointerLock(); room.chat.open(); e.preventDefault(); return; }
    if (e.code === 'KeyR') reloadReq = true; else if (e.code === 'KeyE') interactHeld = true; else if (e.code === 'Digit1') slotReq = 0; else if (e.code === 'Digit2') slotReq = 1; else if (e.code === 'KeyQ') swapReq = true; else if (e.code === 'KeyG') nadeReq = true; else if (e.code === 'KeyH') healReq = 1; else if (e.code === 'KeyJ') healReq = 2;
    else if (e.code === 'Escape' && phase === 'countdown') setPause(true);
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) && match) e.preventDefault();
  };
  const onWheel = (e: WheelEvent): void => { if (match && !closed && !paused && phase === 'play' && !room?.chat?.typing && (locked || e.target === canvas) && Math.abs(e.deltaY) > 4) swapReq = true; };
  const noMenu = (e: Event): void => e.preventDefault();
  window.addEventListener('mousemove', onMove); window.addEventListener('mousedown', onDown); window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); window.addEventListener('wheel', onWheel, { passive: true }); canvas.addEventListener('contextmenu', noMenu);
  const blur = (): void => { keys.clear(); mouse.fire = mouse.ads = false; interactHeld = reloadReq = swapReq = nadeReq = false; healReq = 0; slotReq = -1; tc.fire = false; tc.move.id = tc.look.id = -1; tc.move.x = tc.move.y = 0; stickEl.style.opacity = '0'; root.querySelectorAll('.sz-tbuttons button[data-act="fire"].down, .sz-tbuttons button[data-act="interact"].down').forEach(b => b.classList.remove('down')); }; window.addEventListener('blur', blur);
  const onVisibility = (): void => { if (document.hidden) blur(); }; document.addEventListener('visibilitychange', onVisibility);

  // 터치: 왼쪽 절반은 이동 스틱, 오른쪽 절반 드래그는 시점
  const stickEl = q('#sz-stick');
  function stickFrom(x: number, y: number): void { const m = tc.move, dx = x - m.ox, dy = y - m.oy, r = 56, d = Math.hypot(dx, dy), k = d > r ? r / d : 1; m.x = (dx * k) / r; m.y = (dy * k) / r; stickEl.firstElementChild!.setAttribute('style', `transform:translate(${dx * k}px,${dy * k}px)`); }
  const tStart = (e: PointerEvent): void => {
    if (!touch || e.pointerType !== 'touch' || !match || paused || phase !== 'play' || (e.target as HTMLElement).closest('button')) return; audio.unlock();
    if (e.clientX < innerWidth * 0.45 && tc.move.id < 0) { tc.move.id = e.pointerId; tc.move.ox = e.clientX; tc.move.oy = e.clientY; stickEl.style.cssText = `left:${e.clientX - 60}px;top:${e.clientY - 60}px;opacity:1`; stickFrom(e.clientX, e.clientY); }
    else if (e.clientX >= innerWidth * 0.45 && tc.look.id < 0) { tc.look.id = e.pointerId; tc.look.x = e.clientX; tc.look.y = e.clientY; }
    if (tc.move.id === e.pointerId || tc.look.id === e.pointerId) { try { root.setPointerCapture(e.pointerId); } catch { /* browser may deny capture */ } }
  };
  const tMove = (e: PointerEvent): void => { if (e.pointerId === tc.move.id) stickFrom(e.clientX, e.clientY); else if (e.pointerId === tc.look.id) { look((e.clientX - tc.look.x) * 1.6, (e.clientY - tc.look.y) * 1.6); tc.look.x = e.clientX; tc.look.y = e.clientY; } };
  const tEnd = (e: PointerEvent): void => { if (e.pointerId === tc.move.id) { tc.move.id = -1; tc.move.x = tc.move.y = 0; stickEl.style.opacity = '0'; } else if (e.pointerId === tc.look.id) tc.look.id = -1; };
  root.addEventListener('pointerdown', tStart); root.addEventListener('pointermove', tMove); root.addEventListener('pointerup', tEnd); root.addEventListener('pointercancel', tEnd); root.addEventListener('lostpointercapture', tEnd);
  root.querySelectorAll<HTMLButtonElement>('.sz-tbuttons button').forEach(b => {
    const act = b.dataset.act!;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio.unlock(); if (act === 'fire') tc.fire = true; else if (act === 'ads') tc.ads = !tc.ads; else if (act === 'crouch') tc.crouch = !tc.crouch; else if (act === 'reload') reloadReq = true; else if (act === 'interact') interactHeld = true; else if (act === 'swap') swapReq = true; else if (act === 'nade') nadeReq = true; else if (act === 'heal1') healReq = 1; else if (act === 'heal2') healReq = 2; if (act === 'crouch') b.classList.toggle('down', tc.crouch); else if (act === 'ads') b.classList.toggle('down', tc.ads); else b.classList.add('down'); });
    for (const n of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) b.addEventListener(n, () => { if (act === 'fire') tc.fire = false; else if (act === 'interact') interactHeld = false; if (act !== 'ads' && act !== 'crouch') b.classList.remove('down'); });
  });

  function applyInput(): void {
    const p = me(), i = p.input, kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), kz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const sx = tc.move.x, sy = -tc.move.y, active = phase === 'play';
    i.yaw = yaw; i.pitch = pitch; i.mx = active ? clamp(kx + sx, -1, 1) : 0; i.mz = active ? clamp(kz + sy, -1, 1) : 0;
    i.fire = active && (mouse.fire || tc.fire); i.ads = active && (mouse.ads || tc.ads); i.sprint = active && (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(sx, sy) > 0.92);
    i.crouch = active && (keys.has('KeyC') || tc.crouch); i.nade = active && nadeReq; nadeReq = false; i.heal = active ? healReq : 0; healReq = 0; i.reload = active && reloadReq; i.interact = active && interactHeld; i.jump = active && (keys.has('Space') || (p.air > 0 && interactHeld) || (p.veh >= 0 && tc.crouch)); reloadReq = false;
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

  function updateHud(dt: number): void {
    const m = match!, p = me(), z = m.zone, g = p.guns[p.cur], def = g ? WEAPONS[g.id] : null, now = performance.now();
    if (!p.alive) audio.engine(false, 0);
    set(q('#sz-alive'), 'alive', String(m.aliveCount())); set(q('#sz-kills'), 'kills', String(p.kills));
    const delay = m.zoneDelay > 0 && m.t < m.zoneDelay, zl = delay ? '자기장 활성화까지' : z.phase >= 6 ? '마지막 자기장' : z.shrinking ? `자기장 수축 중 · ${z.phase + 1}단계` : `자기장 수축까지 · ${z.phase + 1}단계`;
    set(q('#sz-ztime'), 'zt', delay ? clock(m.zoneDelay - m.t) : z.timeLeft > 0 ? clock(z.timeLeft) : '--'); set(q('#sz-zlabel'), 'zl', zl); q('#sz-zone').classList.toggle('shrink', z.shrinking);
    q('#sz-hp').style.width = `${clamp(p.hp, 0, 100)}%`; set(q('#sz-hpn'), 'hpn', String(Math.ceil(Math.max(0, p.hp)))); q('#sz-ar').style.width = `${clamp(p.armor, 0, 100)}%`; set(q('#sz-arn'), 'arn', String(Math.ceil(p.armor)));
    q('.sz-bl').classList.toggle('low', p.hp < 30);
    { const H = p.healKind === 'kit' ? HEAL.kit : HEAL.bandage, on = p.healT > 0; q('#sz-cast').classList.toggle('show', on); if (on) { set(q('#sz-castl'), 'castl', `${H.name} 사용 중`); q('#sz-castb').style.width = `${clamp((1 - p.healT / H.time) * 100, 0, 100)}%`; } }
    set(q('#sz-wname'), 'wn', def ? def.name + (p.reload > 0 ? ' · 장전 중' : '') : '맨손'); set(q('#sz-mag'), 'mag', g ? String(g.mag) : '-'); set(q('#sz-res'), 'res', g ? `/ ${g.reserve}` : '');
    const gear = [p.bandages > 0 ? `<span class="gear heal">붕대 ${p.bandages} <small>H</small></span>` : '', p.kits > 0 ? `<span class="gear heal">구급상자 ${p.kits} <small>J</small></span>` : '', p.armorLv > 0 ? `<span class="gear">${ARMOR_NAMES[p.armorLv]}</span>` : '', p.nades > 0 ? `<span class="gear">수류탄 ${p.nades}</span>` : '', p.helmet > 0 ? `<span class="gear">${HELMET_NAMES[p.helmet]}</span>` : '', p.boost > 0 ? `<span class="gear boost">부스트 ${Math.ceil(p.boost)}초</span>` : ''].join('');
    html(q('#sz-slots'), 'slots', gear + p.guns.map((x, i) => `<span class="${i === p.cur ? 'on' : ''}">${i + 1} ${x ? WEAPONS[x.id].name : '비어 있음'}${x && Object.keys(x.att).length ? `<small>${Object.values(x.att).map(a => PARTS[a].name.replace(' 조준경', '').replace(' 사이트', '')).join(' · ')}</small>` : ''}</span>`).join(''));
    // 조준선: 탄퍼짐에 맞춰 벌어집니다
    if (def && view) { const spread = def.spread * partHandling(g!.att).spread * (p.ads ? adsSpread(g!.att) : 1) * (1 + Math.min(1.6, p.speed / PLAYER.walk) * 0.5) * (1 + p.kick * 0.5), px = Math.tan(spread * (def.pellets > 1 ? 2 : 1)) / Math.tan((view.fov * Math.PI) / 360) * (canvas.clientHeight / 2); q('#sz-cross').style.setProperty('--gap', `${clamp(px, 4, 90).toFixed(1)}px`); }
    q('#sz-cross').classList.toggle('hide', p.ads && g?.id === 'sniper' || !p.alive);
    // 낙하 안내: 비행기 안·자유낙하·낙하산
    { const air = q('#sz-air'); let txt = '';
      if (p.alive && p.air && m.plane) {
        const jumpKey = touch ? '줍기 버튼' : 'Space', cs = m.map.compounds; let near = '', nd = Infinity; for (const c of cs) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < nd) { nd = d; near = c.name; } }
        const spot = near ? ` · 가장 가까운 곳 ${near} ${Math.round(nd)}m` : '';
        if (p.air === 1) txt = `<b>${jumpKey}</b> 뛰어내리기 · 비행기 ${Math.max(0, Math.ceil(m.plane.end - m.t))}초 뒤 자동 강하<small>지도에서 노란 항로를 보고 내릴 곳을 고르세요${spot}</small>`;
        else if (p.air === 2) txt = `자유낙하 · 고도 ${Math.round(p.alt)}m<small><b>${jumpKey}</b> 낙하산 펴기 (${AIR.manualOpen}m 아래부터, ${AIR.open}m 에서 자동) · W 활강 · Shift 급강하${spot}</small>`;
        else txt = `낙하산 · 고도 ${Math.round(p.alt)}m<small>W 앞으로 · Shift 빠르게${spot}</small>`;
      }
      air.classList.toggle('show', !!txt); html(air, 'air', txt); }
    // 줍기 안내
    let near: string | null = null; if (p.alive) for (const l of m.loot) { if (l.taken || (l.kind !== 'weapon' && l.kind !== 'attach')) continue; if (Math.hypot(l.x - p.x, l.z - p.z) < PLAYER.pickup) { if (l.kind === 'weapon') { near = WEAPONS[l.weapon!].name; break; } const t = m.partTarget(p, l.part!); if (t && t.fit === 'swap') { near = `${PARTS[l.part!].name} 교체`; break; } } }
    if (!near && p.alive && p.air === 0 && p.veh < 0) { const v = m.vehicleNear(p); if (v) near = `${VEHICLES[v.kind].name} 탑승`; }
    q('#sz-prompt').classList.toggle('show', !!near); set(q('#sz-prompt'), 'prompt', near ? `${touch ? '줍기 버튼' : 'E'} · ${near}` : '');
    // 자기장 밖
    const out = Math.hypot(p.x - z.cx, p.z - z.cz) > z.r && p.alive && !p.air && m.t >= m.zoneDelay; q('#sz-zonefx').classList.toggle('on', out); audio.danger(out ? 1 : 0);
    if (out) say(`자기장 밖 · 초당 -${z.dps.toFixed(1)}`, 0.4);
    // 차량 계기판 · 폭격 경고
    { const v = p.veh >= 0 ? m.vehicles[p.veh] : null; q('#sz-veh').classList.toggle('show', !!v && p.alive);
      if (v) { set(q('#sz-vname'), 'vname', VEHICLES[v.kind].name); set(q('#sz-vspd'), 'vspd', String(Math.round(Math.abs(v.speed) * 3.6))); q('#sz-vhp').style.width = `${clamp((v.hp / v.max) * 100, 0, 100)}%`; q('#sz-vbar').classList.toggle('low', v.hp < v.max * 0.35); set(q('#sz-vkeys'), 'vkeys', touch ? '줍기 버튼: 하차 · 웅크림 버튼: 핸드브레이크' : 'WASD 운전 · Space 핸드브레이크 · E 하차'); }
      q('.sz-br').classList.toggle('hide', !!v);
      audio.engine(!!v && p.alive, v ? Math.abs(v.speed) / VEHICLES[v.kind].top : 0);
      const red = p.alive && !p.air ? m.redAt(p.x, p.z) : null, hot = !!red && m.t >= red.call; q('#sz-redfx').classList.toggle('on', hot); if (hot) say(m.t >= red!.start ? '폭격 구역 · 지금 벗어나세요!' : '폭격 구역 · 곧 폭격이 시작됩니다', 0.4); }
    // 데미지 비네트
    q('#sz-vig').style.opacity = String(clamp(p.hurt * 1.4 + (p.hp < 30 && p.alive ? 0.35 + Math.sin(now / 160) * 0.12 : 0), 0, 0.9));
    q('#sz-scope').classList.toggle('on', p.ads && g?.id === 'sniper' && p.alive);
    // 명중 표시와 배너
    hitT = Math.max(0, hitT - dt); const hm = q('#sz-hitmark'); hm.style.opacity = String(hitT > 0 ? Math.min(1, hitT * 6) : 0); hm.classList.toggle('head', hitHead); hm.classList.toggle('kill', hitKill && hitT > 0);
    room?.chat?.tick(performance.now());
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) q('#sz-banner').classList.remove('show'); }
    // 처치 알림
    while (feed.length && now - feed[0].at > 6000) feed.shift();
    html(q('#sz-feed'), 'feed', feed.map(f => `<li class="${f.mine ? 'mine' : ''}">${esc(f.text)}</li>`).join(''));
    q('#sz-keys').classList.toggle('hide', phase !== 'countdown' || touch);
    html(q('#sz-keys'), 'keys', phase === 'countdown' && !touch ? '<span><b>WASD</b> 이동</span><span><b>좌클릭</b> 사격</span><span><b>우클릭</b> 조준</span><span><b>C</b> 웅크리기</span><span><b>E</b> 줍기</span>' : '');
    drawMap(m, p); drawCompass(m, p);
  }

  // ---------- 이벤트 처리 ----------
  function onEvents(events: MatchEvent[]): void {
    const m = match!, p = me();
    for (const e of events) {
      if (e.t === 'shot') {
        const s = m.players[e.id]; if (!s) continue; const dist = Math.hypot(s.x - p.x, s.z - p.z); audio.play(e.weapon, (e.id === p.id ? 0 : dist) + (e.sup ? 85 : 0));
        if (e.id === p.id && !e.remote) {
          const g = p.guns[p.cur], h = partHandling(g?.att), kk = WEAPONS[e.weapon].recoil * h.kick * (p.ads ? FEEL.adsKick : 1) * (1 + Math.min(1, p.speed / PLAYER.walk) * 0.25);
          const kp = kk * FEEL.kickPitch, ky = (Math.sin(shotN * 1.9) * 0.6 + (Math.random() - 0.5) * 0.8) * kk * FEEL.kickYaw; shotN++;
          pitch = clamp(pitch + kp, -1.4, 1.4); yaw += ky; rcP += kp; rcY += ky; rcIdle = 0;
        }
        if (e.id === p.id && !e.remote) { const sh = { w: e.weapon, ox: e.ox, oy: e.oy, oz: e.oz, ends: e.ends }; if (pvp?.net.started) pvp.net.sendShot(sh); else if (room?.net.started) room.net.sendShot(sh); }
      } else if (e.t === 'hit') {
        if (e.wall) continue;
        if (e.attacker === p.id && e.victim >= 0) {
          hitT = 0.3; hitHead = e.head; hitKill = false; combo = Math.min(6, combo + 1); comboT = 1.1; audio.play(e.head ? 'headshot' : 'hitmark', 0, combo);
          const hm = q('#sz-hitmark'); hm.classList.remove('pop'); void hm.offsetWidth; hm.classList.add('pop');
          const n = document.createElement('b'); n.textContent = String(e.dmg); n.className = e.head ? 'head' : ''; n.style.left = `${(Math.random() - 0.5) * 70}px`; q('#sz-nums').append(n); window.setTimeout(() => n.remove(), 700);
        }
        if (e.victim === p.id) {
          audio.play('hurt'); const rel = (m.players[e.attacker] ? Math.atan2(m.players[e.attacker].z - p.z, m.players[e.attacker].x - p.x) : p.hurtYaw) - yaw, d = document.createElement('i');
          d.style.transform = `rotate(${(rel * 180) / Math.PI + 90}deg)`; q('#sz-dmgs').append(d); window.setTimeout(() => d.remove(), 900);
          if (pvp && e.attacker >= 0) pvp.net.sendAck(e.dmg, e.head);
        }
      } else if (e.t === 'kill') {
        if (!pvp && !m.over) { const left = m.aliveCount(); for (const n of [50, 25, 10, 5, 3]) if (left <= n && !told.has(n)) { told.add(n); if (left === n || n >= 25) say(`${left}명 생존`, 1.6); } }
        const mine = e.attacker === p.id, text = e.attacker < 0 ? `${nameOf(e.victim)} ${e.weapon === 'zone' ? '자기장에' : e.weapon === 'bomb' ? '폭격에' : '차량 사고로'} 쓰러짐` : e.victim === e.attacker ? `${nameOf(e.victim)} 쓰러짐` : `${nameOf(e.attacker)} → ${nameOf(e.victim)}${e.weapon !== 'zone' ? ` [${causeName(e.weapon)}]` : ''}`;
        addFeed(text, mine || e.victim === p.id);
        if (mine) { audio.play('kill'); hitKill = true; hitT = 0.55; const hm = q('#sz-hitmark'); hm.classList.remove('pop'); void hm.offsetWidth; hm.classList.add('pop'); say(`처치 · ${nameOf(e.victim)}`, 1.4) }
        if (e.victim === p.id) onMyDeath(e.attacker);
      } else if (e.t === 'pickup') {
        if (e.id === p.id) { audio.play(e.kind === 'medkit' || e.kind === 'bandage' ? 'heal' : e.kind === 'armor' ? 'armor' : 'pickup'); say(e.kind === 'attach' && e.part ? `${PARTS[e.part].name} 장착` : e.kind === 'helmet' ? `${HELMET_NAMES[e.level ?? 1]} 착용` : e.kind === 'boost' ? '에너지 드링크 · 부스트' : e.kind === 'grenade' ? '수류탄 +2' : e.kind === 'weapon' ? `${WEAPONS[e.weapon!].name} 획득` : e.kind === 'bandage' ? `붕대 +${HEAL.bandage.pick}` : e.kind === 'medkit' ? '구급상자 +1' : e.kind === 'armor' ? `${ARMOR_NAMES[Math.max(1, Math.min(3, e.level || 2))]} 장착` : '탄약 +', 1.1); if (pvp && e.loot < m.map.loot.length) pvp.net.sendPickup(e.loot); else if (room) room.net.sendPickup(e.loot); }
      } else if (e.t === 'heal') { if (e.id === p.id) { if (e.stage === 'done') { audio.play('heal'); say(`${e.kind === 'kit' ? '구급상자' : '붕대'} 사용 완료`, 1.2); } else if (e.stage === 'cancel') say('치료 중단', 1); } }
      else if (e.t === 'drop') { if (e.stage === 'call') { say('보급 투하! 지도의 노란 표시를 확인하세요', 3); audio.play('armor'); } else say('보급 상자 착륙 · 최상급 전리품', 3); }
      else if (e.t === 'jump') { if (e.id === p.id) { audio.play('go'); say('강하 시작', 1.4); } }
      else if (e.t === 'chute') { if (e.id === p.id) { audio.play('pickup'); say('낙하산 펼침', 1.4); } }
      else if (e.t === 'land') { if (e.id === p.id) { audio.play('armor'); say('착지 · 총을 찾으세요', 2.4); } }
      else if (e.t === 'nade') { const dd = Math.hypot(e.x - p.x, e.z - p.z); audio.play(e.stage === 'boom' ? 'boom' : 'pistol', e.stage === 'boom' ? dd * 0.6 : dd + 30); }
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
      recordShooterMatch(win, p.kills);
      career = readShooterCareer();
      soloRecorded = true;
    }
    card('ZERO ZONE', win ? '최후의 1인' : `#${rank}`, `<p class="sz-big">${win ? '승리' : `${match.players.length}명 중 ${rank}위`}</p><div class="sz-stats"><div><b>${p.kills}</b><span>처치</span></div><div><b>${clock(win ? t : p.diedAt)}</b><span>생존 시간</span></div><div><b>${Math.round(p.dmgDealt)}</b><span>준 피해</span></div><div><b>${p.heads}</b><span>머리 명중</span></div><div><b>${BOTS[level].label}</b><span>난이도</span></div></div>${killerLine(p, win)}`,
      `<button class="primary" data-act="again">다시 출격</button>${!win && !match.over ? '<button data-act="spectate">관전 계속</button><button data-act="skip">결과까지 건너뛰기</button>' : ''}<button data-act="setup">설정으로</button><button data-act="exit">메뉴로</button>`, win ? 'win' : '');
  }

  /** 시뮬레이션을 화면 없이 끝까지 돌립니다(내가 쓰러진 뒤 결과만 보고 싶을 때). */
  function skip(maxSeconds = 600): void { const m = match; if (!m) return; for (let t = 0; t < maxSeconds && !m.over; t += 1 / 30) { m.step(1 / 30); m.drain(); } if (m.over) onOver(m.winner); }

  // ---------- 일시정지·메뉴 ----------
  function setPause(on: boolean): void {
    if (pvpRunning() || (phase !== 'play' && phase !== 'countdown') || closed || paused === on) return; paused = on;
    if (on) { blur(); if (document.pointerLockElement === canvas) document.exitPointerLock(); card('PAUSED', '일시정지', '', '<button class="primary" data-act="resume">계속하기</button><button data-act="again">처음부터</button><button data-act="setup">설정 변경</button><button data-act="exit">메뉴로</button>'); }
    else { modal.className = 'sz-modal'; modal.innerHTML = ''; if (!touch) lock(); }
  }
  q('#sz-pause').addEventListener('click', () => { if (pvpRunning()) { say('대전 중에는 멈출 수 없습니다', 1.4); return; } setPause(true); });
  modal.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act; if (!a) return; audio.unlock();
    if (a === 'resume') setPause(false);
    else if (a === 'again') { startSolo(); }
    else if (a === 'setup') { leavePvp(); leaveRoom(); endMatch(); hud.hidden = true; modal.className = 'sz-modal'; modal.innerHTML = ''; phase = 'setup'; paused = false; setupEl.hidden = false; paintSetup(); }
    else if (a === 'spectate') { modal.className = 'sz-modal'; modal.innerHTML = ''; resultShown = false; if (room) room.shown = true; }
    else if (a === 'skip') { modal.className = 'sz-modal'; resultShown = false; skip(); }
    else if (a === 'roomagain') { leaveRoom(); endMatch(); hud.hidden = true; modal.className = 'sz-modal'; modal.innerHTML = ''; phase = 'setup'; setupEl.hidden = false; pickMode = 'room'; paintSetup(); openPvpLobby(true); }
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
      if (countdown <= 0.4 && phase === 'countdown') { phase = 'play'; q('#sz-count').classList.remove('show'); audio.play('go'); say('마지막까지 살아남으세요', 2.2) }
      p.input.yaw = yaw; p.input.pitch = pitch;
    }
    if ((phase === 'play' || phase === 'dead' || phase === 'over') && !paused) {
      if (phase === 'play') {
        // 반동 복귀: 사격을 멈추면 튄 시점이 일부 되돌아옵니다(손으로 눌러 내린 만큼은 그대로)
        rcIdle += dt; if (rcIdle > 0.07 && (rcP !== 0 || rcY !== 0)) { const f = Math.min(1, dt * FEEL.recover), bp = rcP * f, by = rcY * f; rcP -= bp; rcY -= by; pitch = clamp(pitch - bp * FEEL.recoverShare, -1.4, 1.4); yaw -= by * FEEL.recoverShare; if (Math.abs(rcP) < 1e-4 && Math.abs(rcY) < 1e-4) rcP = rcY = 0; }
        comboT -= dt; if (comboT <= 0) combo = 0;
        if (p.alive && !p.air && p.speed > 2.2 && p.crouch < 0.4) { stepAcc += p.speed * dt; const stride = p.speed > 6 ? 2.3 : 1.85; if (stepAcc >= stride) { stepAcc -= stride; audio.play(waterDepth(m.map.terrain, p.x, p.z) ? 'splash' : p.speed > 6 ? 'stepRun' : 'step'); } } else stepAcc = Math.min(stepAcc, 1);
        applyInput();
        // 운전 중에는 마우스를 놓고 달리면 시점이 차의 정면으로 천천히 돌아옵니다
        if (p.veh >= 0) { const v = m.vehicles[p.veh]; if (v && Math.abs(v.speed) > 4 && performance.now() - lastLook > 900) { const d = Math.atan2(Math.sin(v.yaw - yaw), Math.cos(v.yaw - yaw)); yaw += d * Math.min(1, dt * 1.6); pitch += (0 - pitch) * Math.min(1, dt * 1.2); } }
      }
      // 고정 간격(1/60)으로 진행: 프레임이 느려도 시뮬레이션 속도는 같습니다
      let left = dt; while (left > 1e-6) { const s = Math.min(1 / 60, left); left -= s; if (pvp && pvp.opp) syncRemote(s); else if (room) syncRoom(s); m.step(s); }
      if (pvp?.net.started && phase === 'play') pvp.net.sendPose({ x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, armor: p.armor, w: p.guns[p.cur]?.id ?? 'pistol', speed: p.speed, ads: p.ads, reloading: p.reload > 0, crouch: p.crouch > 0.5 }, now);
      if (room?.net.started && phase === 'play') { const v = p.veh >= 0 ? m.vehicles[p.veh] : undefined; room.net.sendPose({ x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, armor: p.armor, w: p.guns[p.cur]?.id ?? 'pistol', speed: p.speed, ads: p.ads, reloading: p.reload > 0, crouch: p.crouch > 0.5, air: p.air, alt: p.alt, veh: p.veh, vs: v && !v.remote ? [v.x, v.z, v.yaw, v.speed] : undefined }, now); }
      const ev = m.drain(); if (ev.length) { view.handle(ev, p); onEvents(ev); }
      if (room) roomTick(ev, now);
      if (pvp?.net.started) for (const e of ev) if (e.t === 'nade' && e.stage === 'throw' && e.id === p.id && !e.remote && e.vx !== undefined) pvp.net.sendNade({ x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy ?? 0, vz: e.vz ?? 0 });
    }
    if (phase === 'dead') {
      deadTimer += dt;
      if (spectateId < 0 || !m.players[spectateId]?.alive) { const alive = m.players.filter(x => x.alive && x.id !== p.id); spectateId = alive.length ? alive[Math.floor(m.t) % alive.length].id : -1; }
      if (!pvp && !room && !soloRecorded && !over && deadTimer > 1.8) { resultShown = true; showResult(false); }
    }
    const spectate = phase === 'dead' || (phase === 'over' && !p.alive) ? m.players[spectateId] ?? null : null;
    const gun = p.guns[p.cur], zoom = p.ads && p.alive ? Math.max(gun?.id === 'sniper' ? 3.4 : gun?.id === 'rifle' ? 1.5 : 1.3, gun?.att.sight ? PARTS[gun.att.sight].zoom : 1) : 1;
    view.frame(dt, p, spectate && spectate.alive ? spectate : null, zoom / (p.veh >= 0 ? 1 + Math.min(0.14, p.speed * 0.004) : p.speed > 6.1 && !p.ads && p.alive && p.air === 0 ? FEEL.sprintFov : 1)); updateHud(dt); if (phase === 'dead' && !spectate) q('#sz-prompt').classList.remove('show');
  }
  /** 상대(원격) 선수를 마지막으로 받은 위치로 부드럽게 따라가게 합니다. */
  function syncRemote(dt: number): void {
    const o = pvp!.opp!, t = pvp!.target; if (!t || !o.alive) return; const k = Math.min(1, dt * 14);
    o.x += (t.x - o.x) * k; o.z += (t.z - o.z) * k; let dy = t.yaw - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * k; o.pitch += (t.pitch - o.pitch) * k;
    o.hp = t.hp; o.armor = t.armor; o.speed = t.speed; o.ads = t.ads; o.crouch += ((t.crouch ? 1 : 0) - o.crouch) * Math.min(1, dt * 12); o.reload = t.reloading ? 1 : 0;
    if (o.guns[0]?.id !== t.w) o.guns[0] = { id: t.w, mag: 1, reserve: 0, att: {} }; o.cur = 0;
  }

  function resize(): void { view?.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); }
  window.addEventListener('resize', resize);

  function exit(): void {
    if (closed) return; closed = true; window.clearInterval(bgTimer); cancelAnimationFrame(raf); leavePvp(); leaveRoom(); if (document.pointerLockElement === canvas) document.exitPointerLock(); loading?.close();
    for (const [t, f] of [['mousemove', onMove], ['mousedown', onDown], ['mouseup', onUp], ['keydown', onKey], ['keyup', onKey], ['wheel', onWheel], ['resize', resize], ['blur', blur]] as const) window.removeEventListener(t, f as EventListener);
    document.removeEventListener('pointerlockchange', onLock); document.removeEventListener('visibilitychange', onVisibility); endMatch(); audio.dispose(); root.remove(); onExit();
  }
  raf = requestAnimationFrame(frame);
}
