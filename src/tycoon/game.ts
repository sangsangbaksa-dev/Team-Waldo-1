import { renderPixelRatio } from '../shared/render-budget';
import '../shared/game-polish.css';
// TYCOON(HUSTLE) — 게임 조립: 3D 도시·플레이어·HUD·장소 패널·입력·저장. 경제 규칙은 core/ 가 맡습니다.
import * as THREE from 'three';
import './tycoon.css';
import { readPreferences, writePreferences } from '../prefs';
import type { LoadingScreen } from '../loading';
import { loadCharacterKit, type CharacterKit } from '../shared/character';
import { makePost, type PostFx } from '../postfx';
import { clearTycoon, createCore, formatMoney, loadTycoon, readTycoonSummary, saveTycoon } from './core';
import { STAGE_NAMES } from './core/data';
import { readTycoonPosition, type TycoonPosition } from './core/save';
import type { CoreEvent, SpotDef, TycoonCore, TycoonState } from './core/types';
import { buildLayout, blockUnlocked, PITCH, type Colliders, WORLD_HALF, type Layout } from './scene/layout';
import { CityView, type Quality, type SpotView } from './scene/city';
import { Atmosphere } from './scene/sky';
import { Player } from './scene/player';
import { Rides } from './scene/rides';
import { Crowd, Traffic } from './scene/people';
import { TycoonAudio } from './audio';
import { drawMap, pointFromMapClick } from './ui/minimap';
import { streetDistance } from './ui/road-route';
import { esc, ladderHtml, menuHtml, spotPanelHtml, statusHtml, titleHtml, winHtml } from './ui/render';

interface OpenOptions { loading?: LoadingScreen }
type Phase = 'load' | 'title' | 'play';
type Modal = { kind: 'spot'; id: string } | { kind: 'status' } | { kind: 'menu' } | { kind: 'map' } | { kind: 'win' } | null;
const PROMPT_RANGE = 6.5, SYNC_EVERY = 0.5;

export function openTycoon(onExit: () => void, opts: OpenOptions = {}): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches, base = import.meta.env.BASE_URL, quality: Quality = prefs.quality;
  const root = document.createElement('div'); root.className = 'ty-root' + (touch ? ' touch' : '');
  root.innerHTML = `
    <canvas class="ty-canvas"></canvas>
    <div class="ty-fx"><div class="ty-vig"></div></div>
    <div class="ty-hud" id="ty-hud" hidden>
      <div class="ty-top">
        <div class="ty-cash"><span class="lbl">현금</span><b id="ty-cash">$0</b><small id="ty-debt"></small></div>
        <div class="ty-stagebox"><b id="ty-stage"></b><div id="ty-ladder"></div></div>
        <div class="ty-clock"><span id="ty-sun">☀</span><b id="ty-clock">06:00</b><em id="ty-day">1일차</em>
          <div class="ty-speed" id="ty-speed"><button type="button" data-speed="1" aria-label="1배속">1×</button><button type="button" data-speed="2" aria-label="2배속">2×</button><button type="button" data-speed="4" aria-label="4배속">4×</button></div></div>
        <div class="ty-tools"><button type="button" id="ty-b-status" aria-label="현황">현황</button><button type="button" id="ty-b-map" aria-label="지도">지도</button><button type="button" id="ty-b-menu" aria-label="메뉴">Ⅱ</button></div>
      </div>
      <div class="ty-left">
        <div class="ty-energy"><label>체력</label><div class="ty-bar"><i id="ty-energy"></i></div><b id="ty-energy-n">100</b></div>
        <div class="ty-carry" id="ty-carry"></div>
        <div class="ty-goal" id="ty-goal"></div>
      </div>
      <div class="ty-task" id="ty-task" hidden><i id="ty-arrow">➤</i><div><b id="ty-task-label"></b><span id="ty-task-sub"></span></div></div>
      <div class="ty-activity" id="ty-activity" hidden><b id="ty-act-label"></b><div class="ty-bar gold"><i id="ty-act-bar"></i></div><small>움직이면 취소됩니다</small></div>
      <button type="button" class="ty-prompt" id="ty-prompt" hidden></button>
      <ul class="ty-toasts" id="ty-toasts" role="status" aria-live="polite"></ul>
      <div class="ty-mini"><canvas id="ty-minimap" width="220" height="220"></canvas></div>
      <div class="ty-banner" id="ty-banner"></div>
      <div class="ty-route" id="ty-route" hidden><span class="ty-route-mark"></span><div><b>내 목적지</b><span id="ty-route-distance">0m</span></div><button type="button" id="ty-route-clear" aria-label="목적지 제거">✕</button></div>
      <div class="ty-drive" id="ty-drive" hidden><span id="ty-drive-name"></span><strong><b id="ty-drive-speed">0</b><small>km/h</small></strong><span>W 가속 · S 후진 · A/D 조향 · F 하차</span></div>
      <div class="ty-touchpad"><div class="ty-stick" id="ty-stick"><i></i></div>
        <div class="ty-tfoot"><button type="button" data-t="ride" id="ty-t-ride">탑승</button><button type="button" data-t="use" class="big">행동</button><button type="button" data-t="run" id="ty-t-run">달리기</button><button type="button" data-t="view">시점</button></div></div>
    </div>
    <div class="ty-modal" id="ty-modal" hidden></div>
    <div class="ty-title" id="ty-title" hidden></div>`;
  document.body.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const canvas = q<HTMLCanvasElement>('.ty-canvas'), hudEl = q('#ty-hud'), modalEl = q('#ty-modal'), titleEl = q('#ty-title'), mini = q<HTMLCanvasElement>('#ty-minimap');
  const cache = new Map<string, string>();
  const set = (id: string, text: string): void => { if (cache.get(id) !== text) { cache.set(id, text); q(`#ty-${id}`).textContent = text; } };
  const html = (id: string, h: string): void => { if (cache.get(id) !== h) { cache.set(id, h); q(`#ty-${id}`).innerHTML = h; } };
  const style = (id: string, prop: 'width' | 'transform', v: string): void => { const k = id + prop; if (cache.get(k) !== v) { cache.set(k, v); q(`#ty-${id}`).style[prop] = v; } };

  const audio = new TycoonAudio(); audio.enabled = prefs.sound;
  let closed = false, raf = 0, last = performance.now(), phase: Phase = 'load', modal: Modal = null, clockT = 0, syncT = 0, hudT = 0, saveT = 0, titleAngle = 0, cineT = 0;
  let core!: TycoonCore, layout!: Layout, city!: CityView, atmo!: Atmosphere, player!: Player, crowd: Crowd | null = null, traffic: Traffic | null = null, post: PostFx | null = null, kit: CharacterKit | null = null;
  let rides: Rides | null = null;
  const resolveParked = (x: number, z: number, r: number, out: { x: number; z: number }): void => {
    if (rides) rides.resolveWalker(x, z, r, out);
    else { out.x = x; out.z = z; }
  };
  let renderer: THREE.WebGLRenderer | null = null; const unsub: Array<() => void> = [];
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(66, 1, 0.2, 2400); let colliders!: Colliders;
  const keys = new Set<string>(); const tc = { moveId: -1, mx: 0, my: 0, ox: 0, oy: 0, lookId: -1, lx: 0, ly: 0, run: false, brakeId: -1, brake: false }; let drag = -1, dragX = 0, dragY = 0, locked = false;
  let near: { id: string; spot: SpotView; dist: number } | null = null, spotViews: SpotView[] = [], lastStage = -1, lastCarry = '', hudDirty = true;
  const toastList: Array<{ el: HTMLElement; at: number }> = [];
  let bannerTimer = 0, winTimer = 0, lastCrashAt = -100;
  let carryGroup: THREE.Group | null = null;
  let modalTrigger: HTMLElement | null = null;
  let resumePosition: TycoonPosition | null = null;
  let waypoint: { x: number; z: number } | null = null;

  // ---------- 알림 ----------
  function toast(text: string, tone: 'info' | 'good' | 'bad' = 'info', sec = 3.4): void {
    const li = document.createElement('li'); li.className = tone; li.textContent = text; q('#ty-toasts').append(li); toastList.push({ el: li, at: performance.now() + sec * 1000 });
    while (toastList.length > 5) toastList.shift()!.el.remove();
  }
  function banner(title: string, sub: string, ms = 3200): void {
    const b = q('#ty-banner'); b.innerHTML = `<h2>${esc(title)}</h2><p>${esc(sub)}</p>`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); b.style.animationDuration = `${ms}ms`; window.clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => b.classList.remove('show'), ms);
  }

  // ---------- 저장 ----------
  const save = (): boolean => !!core && !!player && phase === 'play' && saveTycoon(core, undefined, {
    x: player.pos.x, z: player.pos.z, facing: player.facing, yaw: player.camYaw,
    pitch: player.camPitch, distance: player.dist, firstPerson: player.firstPerson,
    ride: rides?.snapshot() ?? null,
  });
  const persistOnHide = (): void => { if (document.hidden) { save(); resetInput(); } };
  const persistOnPageHide = (): void => { save(); };
  document.addEventListener('visibilitychange', persistOnHide);
  window.addEventListener('pagehide', persistOnPageHide);

  // ---------- 모달 ----------
  const paused = (): boolean => modal !== null;
  let modalHtml = '';
  function renderModal(): void {
    if (!modal) { modalEl.hidden = true; modalEl.innerHTML = ''; modalHtml = ''; return; }
    let h = '';
    switch (modal.kind) {
      case 'spot': h = spotPanelHtml(core, modal.id, !!city.spotView(modal.id)?.locked); break;
      case 'status': h = statusHtml(core.state); break;
      case 'menu': h = menuHtml(audio.enabled, player.firstPerson); break;
      case 'win': h = winHtml(core.state); break;
      case 'map': h = '<div class="ty-bigmap" role="dialog" aria-modal="true" aria-label="도시 지도"><button type="button" class="ty-x" data-close aria-label="닫기">✕</button><canvas id="ty-bigmap" width="720" height="720" aria-label="장소를 터치하거나 클릭해 목적지를 지정"></canvas><div class="ty-map-caption">지도 터치: 자유 목적지 · 점선: 도로 참고 경로 · 흰 화살표: 현재 위치</div><button type="button" class="ty-clear-waypoint" data-waypoint-clear>내 목적지 지우기</button></div>'; break;
    }
    if (h !== modalHtml || modalEl.hidden) { // 내용이 바뀔 때만 교체합니다(누르는 도중 버튼이 바뀌면 클릭이 사라집니다)
      const keep = modalEl.querySelector('.ty-panel')?.scrollTop ?? 0;
      const focused = document.activeElement instanceof HTMLElement && modalEl.contains(document.activeElement) ? document.activeElement : null;
      const focusKey = focused?.dataset.act ?? focused?.dataset.menu ?? focused?.dataset.title;
      modalEl.innerHTML = h; modalHtml = h; modalEl.hidden = false;
      const p = modalEl.querySelector('.ty-panel'); if (p) p.scrollTop = keep;
      if (focused) { const buttons = Array.from(modalEl.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const matching = focusKey ? buttons.find(b => (b.dataset.act ?? b.dataset.menu ?? b.dataset.title) === focusKey) : undefined; (matching ?? buttons[0])?.focus({ preventScroll: true }); }
    }
    if (modal.kind === 'map') drawBig();
  }
  function drawBig(): void {
    const c = modalEl.querySelector<HTMLCanvasElement>('#ty-bigmap');
    if (c) drawMap(c, layout, { stage: core.state.stageIndex, spots: spotViews, px: player.pos.x, pz: player.pos.z, yaw: player.facing, target: core.state.task?.targetSpotId ?? null, time: performance.now() / 1000, names: true, waypoint, vehicles: rides?.positions() });
  }
  function openModal(m: Modal): void {
    if (!modal) modalTrigger = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    modal = m; if (m && document.pointerLockElement === canvas) document.exitPointerLock(); resetInput(); renderModal();
    modalEl.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); audio.open();
  }
  function closeModal(): void { modal = null; renderModal(); modalTrigger?.focus({ preventScroll: true }); modalTrigger = null; if (phase === 'play') lock(); }
  function openSpot(id: string): void { if (phase !== 'play') return; const spot = core.spot(id); if (!spot) return; openModal({ kind: 'spot', id }); }
  function interact(): void { if (phase !== 'play' || modal || rides?.driving) return; if (near && !core.state.activity) openSpot(near.id); }
  function toggleRide(): void {
    if (phase !== 'play' || modal || !rides || core.state.activity?.lockMovement) return;
    const wasDriving = rides.driving;
    const result = rides.toggle(player);
    if (rides.driving !== wasDriving) { resetInput(); hudDirty = true; if (!player.firstPerson && document.pointerLockElement === canvas) document.exitPointerLock(); }
    toast(result.message, result.ok ? 'info' : 'bad');
  }
  function toggleView(): void {
    player.setFirstPerson(!player.firstPerson);
    if (rides?.driving && player.rig) player.rig.root.visible = false;
    if (player.firstPerson && !modal) lock();
    else if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  modalEl.addEventListener('click', e => {
    const t = e.target as HTMLElement; audio.unlock();
    if (t.closest('[data-close]') || t === modalEl) { closeModal(); return; }
    if (t.closest('[data-waypoint-clear]')) { waypoint = null; hudDirty = true; closeModal(); toast('자유 이동 목적지를 해제했습니다'); return; }
    const mapCanvas = t.closest<HTMLCanvasElement>('#ty-bigmap');
    if (mapCanvas && modal?.kind === 'map' && e instanceof MouseEvent) {
      const point = pointFromMapClick(e.clientX, e.clientY, mapCanvas.getBoundingClientRect());
      const block = layout.blocks.reduce((best, b) => Math.hypot(b.cx - point.x, b.cz - point.z) < Math.hypot(best.cx - point.x, best.cz - point.z) ? b : best);
      if (!blockUnlocked(block, core.state.stageIndex)) { toast('아직 열리지 않은 도시 구역입니다', 'bad'); return; }
      const roadX = Math.round((point.x - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
      const roadZ = Math.round((point.z - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
      const snap = Math.abs(point.x - roadX) < Math.abs(point.z - roadZ)
        ? { x: roadX, z: point.z } : { x: point.x, z: roadZ };
      waypoint = { x: clamp(snap.x, -WORLD_HALF + 4, WORLD_HALF - 4), z: clamp(snap.z, -WORLD_HALF + 4, WORLD_HALF - 4) };
      hudDirty = true; closeModal(); toast('목적지를 지도에 표시했습니다', 'good'); return;
    }
    const act = t.closest<HTMLElement>('[data-act]');
    if (act && modal?.kind === 'spot') { doAction(modal.id, act.dataset.act!); return; }
    const menu = t.closest<HTMLElement>('[data-menu]')?.dataset.menu;
    if (menu) menuAction(menu);
    const title = t.closest<HTMLElement>('[data-title]')?.dataset.title;
    if (title === 'keep') closeModal(); else if (title === 'exit') exit();
  });
  function doAction(spotId: string, actionId: string): void {
    if (actionId === 'sell' && !window.confirm('가게를 매각할까요? 재고와 직원은 사라집니다.')) return;
    if (actionId === 'discard_cargo' && !window.confirm('보유 재료를 환불 없이 버릴까요?')) return;
    const before = core.state.cash, r = core.perform(spotId, actionId);
    if (!r.ok) { audio.deny(); toast(r.message, 'bad'); renderModal(); return; }
    audio.click(); if (core.state.cash < before) audio.spend();
    if (core.state.activity) { closeModal(); toast(r.message); } else { save(); toast(r.message, 'good'); renderModal(); }
    hudDirty = true;
  }
  function menuAction(m: string): void {
    if (m === 'resume') closeModal();
    else if (m === 'save') { const ok = save(); toast(ok ? '저장했습니다' : '저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.', ok ? 'good' : 'bad', 5); }
    else if (m === 'view') { toggleView(); renderModal(); }
    else if (m === 'sound') { audio.enabled = !audio.enabled; writePreferences({ ...readPreferences(), sound: audio.enabled }); renderModal(); }
    else if (m === 'exit') exit();
  }

  // ---------- 입력 ----------
  function resetInput(): void { keys.clear(); tc.moveId = tc.lookId = -1; tc.mx = tc.my = 0; tc.run = false; tc.brake = false; tc.brakeId = -1; q('#ty-t-run').classList.remove('on'); q('#ty-t-run').setAttribute('aria-pressed', 'false'); drag = -1; q('#ty-stick').style.opacity = '0'; (q('#ty-stick').firstElementChild as HTMLElement).style.transform = ''; }
  function lock(): void { if (touch || !player?.firstPerson || locked) return; try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => undefined); } catch { /* 선택 사항 */ } }
  const onLock = (): void => { locked = document.pointerLockElement === canvas; if (!locked) resetInput(); };
  document.addEventListener('pointerlockchange', onLock);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.repeat) return;
    if (e.target instanceof HTMLElement && e.target.closest('button,a') && (e.code === 'Enter' || e.code === 'Space')) return;
    audio.unlock();
    if (phase === 'title') { if (e.code === 'Enter') titleAction(readTycoonSummary().has ? 'continue' : 'new'); return; }
    if (phase !== 'play') return;
    if (e.code === 'Escape') { e.preventDefault(); if (modal) closeModal(); else openModal({ kind: 'menu' }); return; }
    if (modal) {
      if (e.code === 'Tab') {
        const buttons = Array.from(modalEl.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if (buttons.length) { const i = buttons.indexOf(document.activeElement as HTMLButtonElement); if (i === -1 || (e.shiftKey ? i === 0 : i === buttons.length - 1)) { e.preventDefault(); (e.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus(); } }
        return;
      }
      if (modal.kind === 'spot' && /^Digit[1-9]$/.test(e.code)) { const a = core.actionsAt(modal.id)[Number(e.code.slice(5)) - 1]; if (a?.enabled) doAction(modal.id, a.id); e.preventDefault(); }
      else if (e.code === 'KeyE' && modal.kind !== 'menu') { e.preventDefault(); closeModal(); }
      return;
    }
    if (e.code === 'Tab') { e.preventDefault(); openModal({ kind: 'status' }); return; }
    if (e.code === 'KeyM') { openModal({ kind: 'map' }); return; }
    if (e.code === 'KeyF') { e.preventDefault(); toggleRide(); return; }
    if (e.code === 'KeyE' || e.code === 'Enter') { interact(); return; }
    if (e.code === 'KeyV') { toggleView(); return; }
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { core.setSpeed(e.code === 'Digit1' ? 1 : e.code === 'Digit2' ? 2 : 4); hudDirty = true; return; }
    if (e.code.startsWith('Arrow') || (e.code === 'Space' && rides?.driving)) e.preventDefault();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.code); };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', resetInput); document.addEventListener('visibilitychange', resetInput);
  canvas.addEventListener('pointerdown', e => {
    audio.unlock(); if (phase !== 'play' || modal) return;
    if (e.pointerType === 'touch') {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer may have ended */ }
      if (e.clientX < innerWidth * 0.45 && tc.moveId < 0) { tc.moveId = e.pointerId; tc.ox = e.clientX; tc.oy = e.clientY; const st = q('#ty-stick'); st.style.cssText = `left:${e.clientX - 60}px;top:${e.clientY - 60}px;opacity:1`; }
      else if (tc.lookId < 0) { tc.lookId = e.pointerId; tc.lx = e.clientX; tc.ly = e.clientY; }
    } else if (e.button === 0) { try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer may have ended */ } drag = e.pointerId; dragX = e.clientX; dragY = e.clientY; if (player.firstPerson) lock(); }
  });
  const onMove = (e: PointerEvent): void => {
    if (e.pointerId === tc.moveId) { const dx = clamp((e.clientX - tc.ox) / 55, -1, 1), dy = clamp((e.clientY - tc.oy) / 55, -1, 1); tc.mx = dx; tc.my = dy; (q('#ty-stick').firstElementChild as HTMLElement).style.transform = `translate(${dx * 38}px,${dy * 38}px)`; }
    else if (e.pointerId === tc.lookId) { player.look((e.clientX - tc.lx) * 0.0055, (e.clientY - tc.ly) * 0.0045); tc.lx = e.clientX; tc.ly = e.clientY; }
    else if (locked && phase === 'play' && !modal) player.look(e.movementX * 0.0024, e.movementY * 0.002);
    else if (e.pointerId === drag && !modal) { player.look((e.clientX - dragX) * 0.005, (e.clientY - dragY) * 0.004); dragX = e.clientX; dragY = e.clientY; }
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId === tc.moveId) { tc.moveId = -1; tc.mx = tc.my = 0; q('#ty-stick').style.opacity = '0'; (q('#ty-stick').firstElementChild as HTMLElement).style.transform = ''; }
    if (e.pointerId === tc.lookId) tc.lookId = -1;
    if (e.pointerId === tc.brakeId) { tc.brakeId = -1; tc.brake = false; q('#ty-t-run').classList.remove('on'); q('#ty-t-run').setAttribute('aria-pressed', 'false'); }
    if (e.pointerId === drag) drag = -1;
  };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp); canvas.addEventListener('lostpointercapture', onUp);
  const onWheel = (e: WheelEvent): void => { if (phase === 'play' && !modal && !player.firstPerson) player.dist = clamp(player.dist + e.deltaY * 0.01, 3.5, 14); };
  window.addEventListener('wheel', onWheel, { passive: true });
  q('.ty-touchpad').addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]'); if (!b) return; audio.unlock(); e.preventDefault();
    const t = b.dataset.t; if (t === 'ride') toggleRide(); else if (t === 'use') interact(); else if (t === 'run') {
      if (rides?.driving) { tc.brakeId = e.pointerId; tc.brake = true; b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
      else { tc.run = !tc.run; b.classList.toggle('on', tc.run); b.setAttribute('aria-pressed', String(tc.run)); }
    } else if (t === 'view') { toggleView(); }
  });
  q('#ty-prompt').addEventListener('click', () => { audio.unlock(); if (rides?.driving || rides?.nearby(player.pos.x, player.pos.z)) toggleRide(); else interact(); });
  q('#ty-route-clear').addEventListener('click', () => { waypoint = null; hudDirty = true; toast('목적지를 해제했습니다'); });
  q('#ty-b-status').addEventListener('click', () => { audio.unlock(); if (!modal) openModal({ kind: 'status' }); });
  q('#ty-b-map').addEventListener('click', () => { audio.unlock(); if (!modal) openModal({ kind: 'map' }); });
  q('#ty-b-menu').addEventListener('click', () => { audio.unlock(); if (!modal) openModal({ kind: 'menu' }); });
  q('#ty-speed').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-speed]'); if (b) { core.setSpeed(Number(b.dataset.speed) as 1 | 2 | 4); hudDirty = true; audio.click(); } });
  mini.addEventListener('click', () => { if (!modal && phase === 'play') openModal({ kind: 'map' }); });

  // ---------- 코어 연결 ----------
  function rebuildFleet(): void {
    rides?.dispose();
    rides = new Rides(scene, layout, colliders);
    rides.setTrafficBlocker((x, z, r) => traffic?.blocks(x, z, r) ?? false);
  }
  function bindCore(c: TycoonCore): void {
    for (const u of unsub.splice(0)) u();
    core = c; unsub.push(c.subscribe(() => { hudDirty = true; }), c.onEvent(onEvent));
  }
  function onEvent(e: CoreEvent): void {
    hudDirty = true;
    switch (e.type) {
      case 'cash': if (e.amount > 0) { audio.coin(e.amount); player?.celebrate(); toast(`+${formatMoney(e.amount)}`, 'good', 2.2); } break;
      case 'toast': toast(e.text, e.tone ?? 'info'); if (e.tone === 'bad') audio.bad(); else if (e.tone === 'good') audio.good(); break;
      case 'stage': banner(STAGE_NAMES[e.stage], e.text); audio.stageUp(); cineT = 0.001; syncCity(true); applyStageLook(); save(); break;
      case 'day': audio.day(); toast(`${core.state.day}일차 아침 — 어제 순이익 ${formatMoney(e.report.profit)}`, e.report.profit >= 0 ? 'good' : 'bad', 5); save(); break;
      case 'task': if (e.task) toast(e.text); break;
      case 'win': banner('세계 정복', e.text, 6000); window.clearTimeout(winTimer); winTimer = window.setTimeout(() => { if (!closed && phase === 'play') openModal({ kind: 'win' }); }, 3200); break;
    }
  }
  function syncCity(animate: boolean): void {
    if (!city) return;
    spotViews = core.spots() as SpotView[]; city.sync(core.state.stage, spotViews, animate); city.setTarget(core.state.task?.targetSpotId ?? null);
  }
  function disposeCarry(): void {
    if (!carryGroup) return;
    carryGroup.removeFromParent();
    carryGroup.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; for (const material of materials) material.dispose(); } });
    carryGroup = null;
  }
  function applyStageLook(): void {
    disposeCarry();
    const si = core.state.stageIndex; player.setOutfit(si); if (rides?.driving && player.rig) player.rig.root.visible = false; crowd?.setStage(si); traffic?.setStage(si); lastStage = si; attachCarry(true);
  }
  function attachCarry(force = false): void {
    const s = core.state, key = `${s.cargo?.units ? s.cargo.kind : ''}${s.cargo?.units ?? 0}|${s.bottles}`; if (!force && key === lastCarry) return; lastCarry = key;
    disposeCarry();
    const rig = player?.rig; if (!rig) return;
    if (!s.cargo?.units && !s.bottles) return;
    const g = new THREE.Group(); g.name = 'carry';
    if (s.cargo?.units) { const sz = 0.3 + Math.min(0.35, s.cargo.units / 120); const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, sz, sz * 1.3), new THREE.MeshLambertMaterial({ color: 0xb98a4a })); m.position.set(-0.32, 1.12, 0); g.add(m); }
    if (s.bottles) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.14 + Math.min(0.14, s.bottles / 120), 10, 8), new THREE.MeshLambertMaterial({ color: 0x8ab6a4, transparent: true, opacity: 0.9 })); m.position.set(0.02, 0.72, 0.34); g.add(m); }
    rig.torso.add(g); carryGroup = g;
  }

  // ---------- 제목/시작 ----------
  function showTitle(): void {
    const sm = readTycoonSummary();
    titleEl.innerHTML = titleHtml(sm.has, sm.has ? `${STAGE_NAMES[sm.stage]} · ${sm.day}일차 · ${formatMoney(sm.cash)}` : ''); titleEl.hidden = false; hudEl.hidden = true;
  }
  titleEl.addEventListener('click', e => { audio.unlock(); const b = (e.target as HTMLElement).closest<HTMLElement>('[data-title]'); if (b) titleAction(b.dataset.title!); });
  function titleAction(a: string): void {
    if (a === 'exit') { exit(); return; }
    if (a === 'new') { waypoint = null; if (readTycoonSummary().has && !window.confirm('기존 저장 기록을 지우고 새로 시작할까요?')) return; clearTycoon(); resumePosition = null; bindCore(createCore()); syncCity(false); rebuildFleet(); }
    else if (a === 'continue') { /* 제목 화면에서 이미 저장본으로 만든 코어를 씁니다 */ }
    startPlay();
  }
  function startPlay(): void {
    phase = 'play'; titleEl.hidden = true; hudEl.hidden = false; resetInput(); applyStageLook();
    const sp = layout.spawn, s = core.state, restored = resumePosition;
    resumePosition = null;
    const valid = restored && Math.abs(restored.x) <= WORLD_HALF - 2 && Math.abs(restored.z) <= WORLD_HALF - 2;
    let restoredAtSavedPlace = false;
    if (valid && restored) {
      const safe = { x: restored.x, z: restored.z };
      colliders.resolve(restored.x, restored.z, 0.45, safe);
      if (Math.hypot(safe.x - restored.x, safe.z - restored.z) <= 3) {
        player.teleport(safe.x, safe.z, restored.facing);
        player.setFirstPerson(restored.firstPerson);
        player.camYaw = restored.yaw; player.camPitch = clamp(restored.pitch, restored.firstPerson ? -1.3 : -0.1, restored.firstPerson ? 1.3 : 1.2); player.dist = restored.distance;
        restoredAtSavedPlace = true;
      } else player.teleport(sp.x, sp.z, sp.yaw);
    } else player.teleport(sp.x, sp.z, sp.yaw);
    if (restoredAtSavedPlace && restored?.ride) rides?.restore(restored.ride, player);
    if (s.day === 1 && s.minutes < 6 * 60 + 30 && s.cash <= 20) { banner('빈털터리', '벤치에서 눈을 떴습니다. 병을 주워 팔고, 일을 찾아 걸어가 보세요.', 5000); toast('E 로 장소와 상호작용 · 지도(M)로 길을 찾으세요', 'info', 6); }
    audio.unlock(); core.tick(0.0001); if (player.firstPerson) lock();
  }

  // ---------- 루프 ----------
  function resize(): void { if (!renderer) return; const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), ratio = renderPixelRatio(w, h, devicePixelRatio, quality); if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio); renderer.setSize(w, h, false); post?.setSize(w, h); camera.aspect = w / h; camera.fov = h > w ? 74 : 66; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize);

  function readMove(): { mx: number; mz: number; run: boolean } {
    let mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), mz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    if (touch || tc.moveId >= 0) { mx += tc.mx; mz += -tc.my; }
    const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    return { mx, mz, run: keys.has('ShiftLeft') || keys.has('ShiftRight') || tc.run };
  }

  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try { tick(dt, now / 1000); } catch (err) { console.error(err); }
  }
  function tick(dt: number, nowS: number): void {
    if (!renderer || !core) return;
    const playing = phase === 'play', beforeTick = core.state;
    if (playing && !paused() && !document.hidden) { const hadActivity = !!beforeTick.activity; core.tick(dt); if (hadActivity && !core.state.activity) save(); }
    const st = core.state;
    // 입력 → 이동
    const mv = readMove(), frozen = !playing || paused() || document.hidden || !!st.activity?.lockMovement;
    if (playing && !paused() && !document.hidden) {
      const turn = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0), tilt = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      if (turn || tilt) player.look(-turn * dt * 1.8, tilt * dt * 1.2);
      if (st.activity?.lockMovement && Math.hypot(mv.mx, mv.mz) > 0.35) { core.cancelActivity(); toast('중단했습니다'); }
    }
    if (playing) { player.update(dt, mv, colliders, frozen || !!rides?.driving, resolveParked);
      const steer = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0) - tc.mx;
      const throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - tc.my;
      const impact = rides?.update(dt, { throttle, steer, brake: keys.has('Space') || tc.brake }, player, frozen);
      if (impact && !frozen && nowS - lastCrashAt > 0.7) { lastCrashAt = nowS; audio.impact(); }
    }
    // 가까운 장소
    near = playing && !rides?.driving ? city.nearestSpot(player.pos.x, player.pos.z, PROMPT_RANGE) : null;
    if (playing) { const id = near && !near.spot.locked ? near.id : null; core.setPresence(id); }
    if (playing && !paused() && !rides?.driving) audio.step(player.speed, nowS);
    // 월드 갱신
    const minutes = playing ? st.minutes : 17.4 * 60, focus = playing ? player.pos : titleFocus;
    const sky = atmo.update(dt, camera, focus, minutes, st.day);
    city.setNight(sky.night); city.setWet(sky.wet); rides?.setLighting(sky.night); renderer.toneMappingExposure = atmo.exposure();
    city.update(dt, focus);
    crowd?.update(dt, focus, sky.night, sky.wet, (i, j) => city.blockOpen(i, j)); traffic?.update(dt, focus, player.pos, sky.night);
    if (st.stageIndex !== lastStage && playing) applyStageLook();
    // 카메라
    if (playing) {
      player.placeCamera(camera, dt, colliders);
      const fov = (innerHeight > innerWidth ? 74 : 66) + (rides?.driving ? Math.min(8, rides.speed * 0.36) : 0);
      if (Math.abs(camera.fov - fov) > 0.08) { camera.fov = fov; camera.updateProjectionMatrix(); }
      if (cineT > 0) { cineT += dt; const k = Math.sin(Math.min(1, cineT / 4.2) * Math.PI), vx = player.pos.x + 20, vz = player.pos.z + 46, vy = 46 + 30 * k; camera.position.lerp(new THREE.Vector3(vx, vy, vz), k * 0.88); camera.lookAt(player.pos.x - 10 * k, 4 + 6 * k, player.pos.z - 6 * k); if (cineT > 4.2) cineT = 0; }
    } else {
      titleAngle += dt * 0.07; const cx = titleFocus.x, cz = titleFocus.z; camera.position.set(cx + Math.cos(titleAngle) * 52, 26 + Math.sin(titleAngle * 0.7) * 3, cz + Math.sin(titleAngle) * 52); camera.lookAt(cx, 3, cz);
    }
    // 주기 작업
    syncT += dt; if (syncT > SYNC_EVERY) { syncT = 0; syncCity(false); attachCarry(); }
    saveT += dt; if (saveT > 25) { saveT = 0; if (playing && !save()) toast('자동 저장 실패 — 저장 공간을 확인하세요.', 'bad', 5); }
    audio.ambience(sky.daylight, sky.wet, 0);
    audio.drive(rides?.speed ?? 0, playing && !!rides?.driving && !paused() && !document.hidden);
    if (sky.wet > 0.8 && Math.random() < dt * 0.04) audio.thunder();
    // 토스트 정리
    const nowMs = performance.now(); for (let i = toastList.length - 1; i >= 0; i--) if (toastList[i].at <= nowMs) { toastList[i].el.remove(); toastList.splice(i, 1); }
    // HUD
    hudT += dt; if (playing && (hudDirty || hudT > 0.25)) { hudDirty = false; hudT = 0; updateHud(st); }
    if (playing && modal?.kind === 'spot' && hudT === 0) renderModal();
    if (playing && modal?.kind === 'status' && Math.floor(nowS * 2) % 4 === 0 && hudT === 0) renderModal();
    clockT += dt; if (playing && clockT > 0.1) { clockT = 0; drawMap(mini, layout, { stage: st.stageIndex, spots: spotViews, px: player.pos.x, pz: player.pos.z, yaw: player.facing, target: st.task?.targetSpotId ?? null, time: nowS, names: false, waypoint, vehicles: rides?.positions() }); if (modal?.kind === 'map') drawBig(); }
    if (post) post.render(dt); else renderer.render(scene, camera);
  }
  const titleFocus = new THREE.Vector3();

  function updateHud(s: TycoonState): void {
    const route = q('#ty-route');
    if (waypoint && Math.hypot(player.pos.x - waypoint.x, player.pos.z - waypoint.z) < 8) { waypoint = null; toast('목적지에 도착했습니다', 'good'); }
    route.hidden = !waypoint;
    route.classList.toggle('has-task', !!s.task);
    if (waypoint) set('route-distance', '도로 기준 약 ' + Math.round(streetDistance(player.pos, waypoint)) + 'm');
    set('cash', formatMoney(s.cash)); set('debt', s.debt ? `빚 ${formatMoney(s.debt)}` : ''); set('stage', s.stageName); html('ladder', ladderHtml(s.stage));
    set('clock', s.clock); set('day', `${s.day}일차`); set('sun', s.night ? '☾' : '☀');
    for (const b of q('#ty-speed').children) { const button = b as HTMLElement, active = Number(button.dataset.speed) === s.speed; button.classList.toggle('on', active); button.setAttribute('aria-pressed', String(active)); }
    style('energy', 'width', `${s.energy}%`); set('energy-n', String(s.energy)); q('#ty-energy').parentElement!.classList.toggle('low', s.energy < 25);
    html('carry', `${s.cargo?.units ? `<span>📦 재료 ${s.cargo.units}</span>` : ''}${s.bottles ? `<span>🍾 빈 병 ${s.bottles}</span>` : ''}`);
    html('goal', `<b>${esc(s.goal.label)}</b><div class="ty-bar gold"><i style="width:${Math.round(s.goal.progress * 100)}%"></i></div>${s.goal.steps.filter(x => !x.done).slice(0, 3).map(x => `<small>○ ${esc(x.label)}</small>`).join('')}`);
    // 활동·과제
    const a = s.activity; q('#ty-activity').hidden = !a; if (a) { set('act-label', a.label); style('act-bar', 'width', `${Math.round(a.progress * 100)}%`); }
    const t = s.task; q('#ty-task').hidden = !t;
    if (t) {
      const d = city.doorOf(t.targetSpotId); set('task-label', t.label);
      const distance = d ? ` · 도로 기준 약 ${Math.round(streetDistance(player.pos, d))}m` : '';
      set('task-sub', `기본 ${formatMoney(t.reward)} · ${t.minutesLeft >= 0 ? `${Math.floor(t.minutesLeft / 60)}시간 ${t.minutesLeft % 60}분 남음` : '지각 — 보수 절반'}${distance}`);
      if (d) { const ang = Math.atan2(d.x - player.pos.x, d.z - player.pos.z), rel = player.camYaw - ang + Math.PI / 2; style('arrow', 'transform', `rotate(${(rel * 180 / Math.PI).toFixed(0)}deg)`); }
    }
    // 프롬프트
    const p = q<HTMLButtonElement>('#ty-prompt');
    if (rides?.driving && !modal) { p.hidden = false; html('prompt', '<kbd>F</kbd><b>차량에서 내리기</b>'); } else if (rides?.nearby(player.pos.x, player.pos.z) && !modal && !s.activity) { p.hidden = false; html('prompt', `<kbd>F</kbd><b>${esc(rides.nearby(player.pos.x, player.pos.z)!.name)} 탑승</b>`); } else if (near && !modal && !s.activity) { p.hidden = false; const v = near.spot; const key = touch ? '' : '<kbd>E</kbd>'; const txt = `${key}<span class="ico">${esc(v.icon)}</span><b>${esc(v.name)}</b>${v.locked ? `<em>🔒 ${esc(STAGE_NAMES[v.minStage])} 단계에 열림</em>` : ''}`; html('prompt', txt); } else p.hidden = true;
    const runButton = q<HTMLButtonElement>('#ty-t-run');
    runButton.textContent = rides?.driving ? '브레이크' : '달리기';
    runButton.setAttribute('aria-label', rides?.driving ? '길게 눌러 차량 브레이크' : '달리기 전환');
    runButton.classList.toggle('brake', !!rides?.driving);
    const rideButton = q<HTMLButtonElement>('#ty-t-ride');
    const nearbyRide = rides?.nearby(player.pos.x, player.pos.z);
    rideButton.textContent = rides?.driving ? '하차' : '탑승';
    rideButton.disabled = !nearbyRide || !!s.activity?.lockMovement;
    rideButton.setAttribute('aria-label', rides?.driving ? '차량에서 내리기' : '가까운 차량 탑승');
    const drive = q('#ty-drive'); drive.hidden = !rides?.driving;
    if (rides?.driving) { set('drive-speed', String(Math.round(rides.speed * 3.6))); set('drive-name', rides.name ?? '차량'); }
  }

  // ---------- 종료 ----------
  function exit(): void {
    if (closed) return; if (phase === 'play' && !save() && !window.confirm('저장하지 못했습니다. 그래도 허브로 나갈까요?')) return; closed = true; cancelAnimationFrame(raf);
    window.clearTimeout(bannerTimer); window.clearTimeout(winTimer); disposeCarry();
    document.removeEventListener('visibilitychange', persistOnHide); window.removeEventListener('pagehide', persistOnPageHide);
    window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', resetInput); document.removeEventListener('visibilitychange', resetInput);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); window.removeEventListener('wheel', onWheel); window.removeEventListener('resize', resize); document.removeEventListener('pointerlockchange', onLock);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    for (const u of unsub) u();
    try { rides?.dispose(); crowd?.dispose(); traffic?.dispose(); player?.dispose(); city?.dispose(); atmo?.dispose(); } catch { /* 정리 실패는 무시 */ }
    audio.dispose(); post?.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); root.remove(); onExit();
  }

  // ---------- 부팅 ----------
  void (async () => {
    opts.loading?.progress(0, '도시를 준비하는 중');
    try { kit = await loadCharacterKit(base, f => opts.loading?.progress(f * 0.85, '사람들을 불러오는 중')); } catch (err) { console.error(err); kit = null; }
    if (closed) { opts.loading?.close(); return; }
    opts.loading?.progress(0.9, '도시를 짓는 중'); await new Promise(r => setTimeout(r, 30)); if (closed) { opts.loading?.close(); return; }
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
      renderer.setPixelRatio(renderPixelRatio(innerWidth, innerHeight, devicePixelRatio, quality));
      renderer.shadowMap.enabled = quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
      const saved = loadTycoon(); resumePosition = readTycoonPosition(saved);
      bindCore(createCore({ save: saved }));
      layout = buildLayout(core.spots() as SpotDef[]);
      city = new CityView(layout, quality); scene.add(city.group); colliders = city.colliders;
      // Build occupied lots and their colliders before choosing safe parked car locations.
      syncCity(false);
      atmo = new Atmosphere(scene, renderer, quality);
      player = new Player(scene, kit);
      rebuildFleet();
      if (kit) { crowd = new Crowd(scene, kit, quality); traffic = new Traffic(scene, quality); } else traffic = new Traffic(scene, quality);
      post = makePost(quality, renderer, scene, camera, { strength: 0.42, radius: 0.55, threshold: 0.84, vignette: 0.32, saturation: 1.1, contrast: 1.06 });
      applyStageLook(); resize();
      const bench = layout.spotLots.get('bench') ?? [...layout.spotLots.values()][0]; titleFocus.set(bench?.cx ?? layout.spawn.x, 0, bench?.cz ?? layout.spawn.z);
    } catch (err) { console.error(err); opts.loading?.close(); exit(); return; }
    phase = 'title'; showTitle(); opts.loading?.close(); raf = requestAnimationFrame(frame);
    if (import.meta.env.DEV) {
      const dbg = { get core() { return core; }, get city() { return city; }, get player() { return player; }, get cam() { return camera; }, get phase() { return phase; }, layout, start: (a: string) => titleAction(a), openSpot, syncCity, atmo: () => atmo, info: () => ({ calls: renderer?.info.render.calls, tris: renderer?.info.render.triangles, geos: renderer?.info.memory.geometries }), hud: hudEl, closeModal, openModal: (k: string) => openModal({ kind: k } as Modal) };
      (window as unknown as { __ty: typeof dbg }).__ty = dbg;
    }
  })();

}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
