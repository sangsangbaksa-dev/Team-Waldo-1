// TYCOON(HUSTLE) — 게임 조립: 3D 도시·플레이어·HUD·장소 패널·입력·저장. 경제 규칙은 core/ 가 맡습니다.
import * as THREE from 'three';
import '../shared/ui.css';
import './tycoon.css';
import './ui/map-directory.css';
import './ui/teleport.css';
import './ui/casino.css';
import { readPreferences, writePreferences } from '../prefs';
import type { LoadingScreen } from '../loading';
import { loadCharacterKit, type CharacterKit } from '../shared/character';
import { makePost, type PostFx } from '../postfx';
import { clearTycoon, createCore, formatMoney, loadTycoon, readTycoonSummary, saveTycoon } from './core';
import { STAGE_NAMES } from './core/data';
import type { CoreEvent, SpotDef, TycoonCore, TycoonState } from './core/types';
import { buildLayout, PITCH, type Colliders, WORLD_HALF, type Layout } from './scene/layout';
import { CityView, type Quality, type SpotView } from './scene/city';
import { Atmosphere } from './scene/sky';
import { Player } from './scene/player';
import { Rides } from './scene/rides';
import { WayfindingMarker } from './scene/wayfinding';
import { findTeleportLanding } from './scene/teleport';
import { readSessionPosition, type SessionPosition } from './scene/session-position';
import { clearTouch, createTouch, beginCanvasPointer, beginBrake, endPointer, lookDelta, stickOffset } from './scene/touch';
import { driveCommand } from './scene/driving';
import { Crowd, Traffic } from './scene/people';
import { TycoonAudio } from './audio';
import { drawMap, pointFromMapClick } from './ui/minimap';
import { streetDistance } from './ui/road-route';
import { esc, failHtml, ladderHtml, mapDirectoryHtml, menuHtml, spotPanelHtml, statusHtml, titleHtml, winHtml, type CasinoOutcome } from './ui/render';

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
    <div class="ty-warp-flash" aria-hidden="true"></div>
    <div class="ty-hud" id="ty-hud" hidden>
      <div class="ty-top">
        <div class="ty-cash"><svg class="ty-ico coin" viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="tyg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#ffcf5a"/><stop offset="1" stop-color="#b9801c"/></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#tyg)" stroke="#7a4f10" stroke-width="1.5"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#b9801c" stroke-width="1"/><path d="M12 7v10M14.4 9.4c-.6-.9-4.8-1-4.8.9 0 2.2 4.8 1 4.8 3.3 0 1.9-4.2 1.9-4.8.9" fill="none" stroke="#7a4f10" stroke-width="1.5" stroke-linecap="round"/></svg><span class="lbl">현금</span><b id="ty-cash">$0</b><small id="ty-debt"></small></div>
        <div class="ty-stagebox"><b id="ty-stage"></b><div id="ty-ladder"></div></div>
        <div class="ty-clock"><span id="ty-sun">낮</span><b id="ty-clock">06:00</b><em id="ty-day">1일차</em>
          <div class="ty-speed" id="ty-speed"><button type="button" data-speed="1" aria-label="1배속">1×</button><button type="button" data-speed="2" aria-label="2배속">2×</button><button type="button" data-speed="4" aria-label="4배속">4×</button></div></div>
        <div class="ty-tools"><button type="button" id="ty-b-status" aria-label="현황">현황</button><button type="button" id="ty-b-map" aria-label="지도">지도</button><button type="button" id="ty-b-menu" aria-label="메뉴">Ⅱ</button></div>
      </div>
      <div class="ty-left">
        <div class="ty-energy"><svg class="ty-ico bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13.5h6L9.5 22 19 9.8h-6.2z" fill="#5be3a0" stroke="#1d7a52" stroke-width="1.4" stroke-linejoin="round"/></svg><label>체력</label><div class="ty-bar"><i id="ty-energy"></i></div><b id="ty-energy-n">100</b></div>
        <div class="ty-carry" id="ty-carry"></div>
        <div class="ty-goal" id="ty-goal"></div>
      </div>
      <div class="ty-task" id="ty-task" hidden><i id="ty-arrow">➤</i><div><b id="ty-task-label"></b><span id="ty-task-sub"></span></div></div>
      <div class="ty-waypoint" id="ty-waypoint" hidden><i>▲</i><span></span></div>
      <div class="ty-earnings" id="ty-earnings"></div>
      <div class="ty-hint" id="ty-hint" hidden></div>
      <div class="ty-activity" id="ty-activity" hidden><b id="ty-act-label"></b><div class="ty-bar gold"><i id="ty-act-bar"></i></div><small>움직이면 취소됩니다</small></div>
      <button type="button" class="ty-prompt" id="ty-prompt" hidden></button>
      <ul class="ty-toasts" id="ty-toasts" aria-live="polite" aria-relevant="additions"></ul>
      <div class="ty-mini"><canvas id="ty-minimap" width="220" height="220"></canvas></div>
      <div class="ty-banner" id="ty-banner"></div>
      <div class="ty-route" id="ty-route" hidden><span class="ty-route-mark" id="ty-route-mark">➤</span><div><b>내 목적지</b><span id="ty-route-distance">0m</span></div><button type="button" id="ty-route-clear" aria-label="목적지 제거">✕</button></div>
      <div class="ty-drive" id="ty-drive" hidden><span id="ty-drive-name"></span><strong><em id="ty-drive-gear" aria-label="기어">N</em><b id="ty-drive-speed">0</b><small>km/h</small></strong><span>W 가속 · S 후진 · A/D 조향 · Space 브레이크 · H 경적 · F 하차</span></div>
      <div class="ty-touchpad"><div class="ty-stick" id="ty-stick"><i></i></div>
        <div class="ty-tfoot"><button type="button" data-t="ride" id="ty-t-ride">탑승</button><button type="button" data-t="use" class="big">행동</button><button type="button" data-t="run" id="ty-t-run">달리기</button><button type="button" data-t="view">시점</button></div></div>
    </div>
    <div class="ty-modal" id="ty-modal" hidden></div>
    <div class="ty-title wd-screen" id="ty-title" hidden></div>`;
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
  let rides: Rides | null = null, waypointMarker: WayfindingMarker | null = null;
  const resolveParked = (x: number, z: number, r: number, out: { x: number; z: number }): void => {
    if (rides) rides.resolveWalker(x, z, r, out);
    else { out.x = x; out.z = z; }
  };
  let renderer: THREE.WebGLRenderer | null = null; const unsub: Array<() => void> = [];
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(66, 1, 0.2, 2400); let colliders!: Colliders;
  const keys = new Set<string>(); const tc = createTouch(); let drag = -1, dragX = 0, dragY = 0, locked = false;
  let near: { id: string; spot: SpotView; dist: number } | null = null, spotViews: SpotView[] = [], lastStage = -1, lastCarry = '', hudDirty = true;
  const toastList: Array<{ el: HTMLElement; at: number }> = [];
  let tutorialTime = -1;
  let lastBet: CasinoOutcome | null = null;
  let resumePosition: SessionPosition | null = null;
  const waypointVector = new THREE.Vector3();
  let lastCrashAt = -100, lastHonkAt = -1000;
  let modalTrigger: HTMLElement | null = null;
  let waypoint: { x: number; z: number } | null = null;

  // ---------- 알림 ----------
  function toast(text: string, tone: 'info' | 'good' | 'bad' = 'info', sec = 3.4): void {
    const li = document.createElement('li'); li.className = tone; li.textContent = text; q('#ty-toasts').append(li); toastList.push({ el: li, at: performance.now() + sec * 1000 });
    while (toastList.length > 5) toastList.shift()!.el.remove();
  }
  function banner(title: string, sub: string, ms = 3200): void {
    const b = q('#ty-banner'); b.innerHTML = `<h2>${esc(title)}</h2><p>${esc(sub)}</p>`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); window.setTimeout(() => b.classList.remove('show'), ms);
  }

  // ---------- 저장 ----------
  const save = (): void => {
    if (!core || phase !== 'play') return;
    const world: SessionPosition = {
      x: player.pos.x, z: player.pos.z, yaw: player.camYaw - Math.PI,
      waypoint, ride: rides?.snapshot() ?? null,
    };
    saveTycoon({ serialize: () => ({ ...core.serialize(), world }) });
  };

  // ---------- 모달 ----------
  const paused = (): boolean => modal !== null;
  let modalHtml = '', confirmRestart = false;
  function renderModal(): void {
    if (!modal) { modalEl.hidden = true; modalEl.innerHTML = ''; modalHtml = ''; return; }
    let h = '';
    switch (modal.kind) {
      case 'spot': h = spotPanelHtml(core, modal.id, !!city.spotView(modal.id)?.locked, lastBet); break;
      case 'status': h = statusHtml(core.state); break;
      case 'menu': h = menuHtml(audio.enabled, player.firstPerson, confirmRestart); break;
      case 'win': h = winHtml(core.state); break;
      case 'map': {
        const cars = (rides?.positions() ?? []).map(car => ({
          name: car.name, active: car.active,
          // Road travel is free; business access remains gated by the economy.
          reachable: true,
          distance: streetDistance(player.pos, car),
        }));
        h = mapDirectoryHtml(cars, waypoint !== null, teleportBlock());
        break;
      }
    }
    if (h !== modalHtml || modalEl.hidden) { // 내용이 바뀔 때만 교체합니다(누르는 도중 버튼이 바뀌면 클릭이 사라집니다)
      const keep = modalEl.querySelector('.ty-panel')?.scrollTop ?? 0;
      const active = document.activeElement;
      const action = active instanceof HTMLButtonElement && modalEl.contains(active) ? active.dataset.act : undefined;
      modalEl.innerHTML = h; modalHtml = h; modalEl.hidden = false;
      const p = modalEl.querySelector('.ty-panel'); if (p) p.scrollTop = keep;
      if (action) {
        const actions = [...modalEl.querySelectorAll<HTMLButtonElement>('[data-act]:not(:disabled)')];
        (actions.find(button => button.dataset.act === action) ?? actions[0] ?? modalEl.querySelector<HTMLButtonElement>('[data-close]'))?.focus({ preventScroll: true });
      }
    }
    if (modal.kind === 'map') drawBig();
  }
  function drawBig(): void {
    const c = modalEl.querySelector<HTMLCanvasElement>('#ty-bigmap');
    if (c) drawMap(c, layout, { stage: core.state.stageIndex, spots: spotViews, px: player.pos.x, pz: player.pos.z, yaw: player.facing, target: core.state.task?.targetSpotId ?? null, time: performance.now() / 1000, names: true, waypoint, vehicles: rides?.positions() });
  }
  function placeMapPin(point: { x: number; z: number }): void {
    const roadX = Math.round((point.x - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
    const roadZ = Math.round((point.z - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
    const snap = Math.abs(point.x - roadX) < Math.abs(point.z - roadZ)
      ? { x: roadX, z: point.z } : { x: point.x, z: roadZ };
    waypoint = { x: clamp(snap.x, -WORLD_HALF + 4, WORLD_HALF - 4), z: clamp(snap.z, -WORLD_HALF + 4, WORLD_HALF - 4) };
    hudDirty = true;
    renderModal();
  }

  function openModal(m: Modal): void {
    if (!modal) modalTrigger = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    modal = m; if (m && document.pointerLockElement === canvas) document.exitPointerLock(); resetInput(); renderModal();
    modalEl.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); audio.open();
  }
  function closeModal(relock = false): void { modal = null; confirmRestart = false; renderModal(); modalTrigger?.focus({ preventScroll: true }); modalTrigger = null; if (phase === 'play' && relock) lock(); }
  function openSpot(id: string): void { if (phase !== 'play') return; const spot = core.spot(id); if (!spot) return; openModal({ kind: 'spot', id }); }
  function interact(): void { if (phase !== 'play' || modal || rides?.driving) return; if (near && !core.state.activity) openSpot(near.id); }
  function toggleRide(): void {
    if (phase !== 'play' || modal || !rides) return;
    if (core.state.activity) { toast('진행 중인 작업을 끝낸 뒤 차량을 이용하세요', 'bad'); return; }
    const wasDriving = rides.driving;
    const result = rides.toggle(player);
    if (rides.driving !== wasDriving) { resetInput(); hudDirty = true; if (!player.firstPerson && document.pointerLockElement === canvas) document.exitPointerLock(); }
    toast(result.message, result.ok ? 'info' : 'bad');
  }
  function teleportBlock(): string | undefined {
    if (rides?.driving) return '차량에서 내린 뒤 사용할 수 있어요.';
    if (core.state.activity) return '진행 중인 작업을 마치면 사용할 수 있어요.';
    return undefined;
  }

  function safeArrival(target: { x: number; z: number }): { x: number; z: number } | null {
    const radius = 0.9;
    const scratch = { x: 0, z: 0 };
    return findTeleportLanding(target, ({ x, z }) =>
      !colliders.resolve(x, z, radius, scratch) &&
      !rides?.blocksTraffic(x, z, radius) &&
      !traffic?.blocks(x, z, radius) &&
      !crowd?.blocks(x, z, radius),
    );
  }

  function teleportToPin(): void {
    if (phase !== 'play' || modal?.kind !== 'map' || !waypoint) return;
    const blocked = teleportBlock();
    if (blocked) { audio.deny(); toast(blocked, 'bad'); return; }
    const point = safeArrival(waypoint);
    if (!point) { audio.deny(); toast('착지할 공간이 없습니다. 핀을 다른 곳에 놓아 주세요.', 'bad'); return; }

    player.teleport(point.x, point.z, player.camYaw - Math.PI);
    waypoint = null;
    near = null;
    core.setPresence(null);
    hudDirty = true;
    resetInput();
    closeModal();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      q('.ty-warp-flash').animate([{ opacity: 0.35 }, { opacity: 0 }], { duration: 440, easing: 'ease-out' });
    }
    audio.open();
    save();
    toast('핀 근처로 순간이동했습니다', 'good');
  }

  function honk(): void {
    if (!rides?.driving || modal || phase !== 'play') return;
    const now = performance.now();
    if (now - lastHonkAt < 400) return;
    lastHonkAt = now; audio.honk();
  }
  function toggleView(): void {
    player.setFirstPerson(!player.firstPerson);
    if (rides?.driving && player.rig) player.rig.root.visible = false;
    if (player.firstPerson && !modal) lock();
    else if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  modalEl.addEventListener('click', e => {
    const t = e.target as HTMLElement; audio.unlock();
    if (t.closest('[data-close]') || t === modalEl || t.matches('.ty-pause-screen, .ty-win-screen')) { closeModal(); return; }
    if (t.closest('[data-waypoint-teleport]')) { teleportToPin(); return; }
    if (t.closest('[data-waypoint-clear]')) { waypoint = null; hudDirty = true; renderModal(); toast('자유 이동 목적지를 해제했습니다'); return; }
    const vehicleTarget = t.closest<HTMLButtonElement>('[data-vehicle-target]');
    if (vehicleTarget && modal?.kind === 'map' && !vehicleTarget.disabled) {
      const index = Number(vehicleTarget.dataset.vehicleTarget);
      const fleet = rides?.positions() ?? [];
      const car = Number.isInteger(index) ? fleet[index] : undefined;
      if (!car || car.active) return;
      waypoint = { x: car.x, z: car.z };
      hudDirty = true; renderModal(); toast(`${car.name} 위치를 목적지로 설정했습니다`, 'good'); return;
    }

    const mapCanvas = t.closest<HTMLCanvasElement>('#ty-bigmap');
    if (mapCanvas && modal?.kind === 'map' && e instanceof MouseEvent) {
      placeMapPin(pointFromMapClick(e.clientX, e.clientY, mapCanvas.getBoundingClientRect()));
      toast('목적지를 지도에 표시했습니다', 'good'); return;
    }
    const act = t.closest<HTMLElement>('[data-act]');
    if (act && modal?.kind === 'spot') { doAction(modal.id, act.dataset.act!); return; }
    const menu = t.closest<HTMLElement>('[data-menu]')?.dataset.menu;
    if (menu) { menuAction(menu); return; }
    const title = t.closest<HTMLElement>('[data-title]')?.dataset.title;
    if (title === 'keep') closeModal(); else if (title === 'exit') exit();
  });
  function doAction(spotId: string, actionId: string): void {
    const before = core.state.cash, r = core.perform(spotId, actionId);
    if (!r.ok) { audio.deny(); toast(r.message, 'bad'); renderModal(); return; }
    const delta = core.state.cash - before;
    const spent = delta < 0;
    const bet = spotId === 'casino' && actionId.startsWith('casino_flip_');
    audio.click(); if (spent) audio.spend();
    if (bet) { lastBet = { delta, message: r.message }; save(); }
    if (core.state.activity) { closeModal(); toast(r.message); }
    else { toast(r.message, bet && spent ? 'bad' : 'good'); renderModal(); }
    hudDirty = true;
  }
  /** 저장을 지우고 빈털터리 첫날부터 다시 시작합니다(메뉴에서 두 번 눌러야 실행). */
  function restartGame(): void {
    resumePosition = null;
    clearTycoon(); bindCore(createCore());
    modal = null; confirmRestart = false; renderModal(); toastList.length = 0; q('#ty-toasts').replaceChildren(); q('#ty-banner').classList.remove('show');
    waypoint = null; lastBet = null; cineT = 0; lastCarry = ''; lastStage = -1; cache.clear(); hudDirty = true;
    syncCity(false);
    if (rides?.driving) player.dist = 7.5;
    rebuildFleet();
    player.setFirstPerson(player.firstPerson);
    startPlay(); save();
  }
  function menuAction(m: string): void {
    if (m !== 'restart') confirmRestart = false;
    if (m === 'resume') closeModal();
    else if (m === 'restart') { if (confirmRestart) restartGame(); else { confirmRestart = true; renderModal(); } }
    else if (m === 'save') { save(); toast('저장했습니다', 'good'); }
    else if (m === 'view') { toggleView(); renderModal(); }
    else if (m === 'sound') { audio.enabled = !audio.enabled; writePreferences({ ...readPreferences(), sound: audio.enabled }); renderModal(); }
    else if (m === 'exit') exit();
  }

  // ---------- 입력 ----------
  function resetInput(): void { keys.clear(); clearTouch(tc); q('#ty-t-run').classList.remove('on'); q('#ty-t-run').setAttribute('aria-pressed', 'false'); drag = -1; q('#ty-stick').style.opacity = '0'; (q('#ty-stick').firstElementChild as HTMLElement).style.transform = ''; }
  function lock(): void { if (touch || !player?.firstPerson || locked) return; try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => undefined); } catch { /* 선택 사항 */ } }
  const onLock = (): void => { locked = document.pointerLockElement === canvas; if (!locked) resetInput(); };
  document.addEventListener('pointerlockchange', onLock);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    audio.unlock();
    if (phase === 'title') { if (player && e.code === 'Enter') titleAction(readTycoonSummary().has ? 'continue' : 'new'); return; }
    if (phase !== 'play') return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) {
        if (modal) closeModal(true);
        else openModal({ kind: 'menu' });
      }
      return;
    }
    if (modal?.kind === 'map') {
      if (e.code === 'KeyM' && !e.repeat) { closeModal(true); return; }
      if (e.target instanceof HTMLCanvasElement && e.target.id === 'ty-bigmap' && (e.code.startsWith('Arrow') || e.code === 'Enter')) {
        e.preventDefault();
        const point = waypoint ?? player.pos;
        const x = point.x + (Number(e.code === 'ArrowRight') - Number(e.code === 'ArrowLeft')) * PITCH;
        const z = point.z + (Number(e.code === 'ArrowDown') - Number(e.code === 'ArrowUp')) * PITCH;
        placeMapPin({ x, z });
        modalEl.querySelector<HTMLCanvasElement>('#ty-bigmap')?.focus({ preventScroll: true });
      }
      return;
    }
    if (modal) {
      if (modal.kind === 'spot' && /^Digit[1-9]$/.test(e.code)) { const a = core.actionsAt(modal.id)[Number(e.code.slice(5)) - 1]; if (a && !e.repeat) doAction(modal.id, a.id); e.preventDefault(); }
      else if ((e.code === 'KeyE' || e.code === 'Tab') && modal.kind !== 'menu') { e.preventDefault(); closeModal(true); }
      return;
    }
    if (e.code === 'Tab') { e.preventDefault(); openModal({ kind: 'status' }); return; }
    if (e.code === 'KeyM') { openModal({ kind: 'map' }); return; }
    if (e.code === 'KeyF') { e.preventDefault(); toggleRide(); return; }
    if (e.code === 'KeyH') { e.preventDefault(); honk(); return; }
    if (e.code === 'KeyE' || e.code === 'Enter') { interact(); return; }
    if (e.code === 'KeyV') { toggleView(); return; }
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { core.setSpeed(e.code === 'Digit1' ? 1 : e.code === 'Digit2' ? 2 : 4); hudDirty = true; return; }
    if (e.code.startsWith('Arrow') || (e.code === 'Space' && rides?.driving)) e.preventDefault();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.code); };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', resetInput); const onVisibility = (): void => { resetInput(); if (document.hidden && phase === 'play' && !modal) openModal({ kind: 'menu' }); };
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('pointerdown', e => {
    audio.unlock(); if (phase !== 'play' || modal) return;
    if (e.pointerType === 'touch') {
      const claim = beginCanvasPointer(tc, e.pointerId, e.clientX, e.clientY, innerWidth);
      if (claim === 'move') { const st = q('#ty-stick'); st.style.cssText = `left:${e.clientX - 60}px;top:${e.clientY - 60}px;opacity:1`; try { canvas.setPointerCapture(e.pointerId); } catch { /* 창 리스너가 이어 받습니다. */ } }
    } else { drag = e.pointerId; dragX = e.clientX; dragY = e.clientY; lock(); }
  });
  const onMove = (e: PointerEvent): void => {
    const stick = stickOffset(tc, e.pointerId, e.clientX, e.clientY);
    if (stick) { (q('#ty-stick').firstElementChild as HTMLElement).style.transform = `translate(${stick.x}px,${stick.y}px)`; return; }
    const look = lookDelta(tc, e.pointerId, e.clientX, e.clientY);
    if (look) player.look(look.x * 0.0055, look.y * 0.0045);
    else if (locked && phase === 'play' && !modal) player.look(e.movementX * 0.0024, e.movementY * 0.002);
    else if (e.pointerId === drag && !modal) { player.look((e.clientX - dragX) * 0.005, (e.clientY - dragY) * 0.004); dragX = e.clientX; dragY = e.clientY; }
  };
  const onUp = (e: PointerEvent): void => {
    const ended = endPointer(tc, e.pointerId);
    if (ended === 'move') { q('#ty-stick').style.opacity = '0'; (q('#ty-stick').firstElementChild as HTMLElement).style.transform = ''; }
    if (ended === 'brake') { q('#ty-t-run').classList.remove('on'); q('#ty-t-run').setAttribute('aria-pressed', 'false'); }
    if (e.pointerId === drag) drag = -1;
  };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  const onWheel = (e: WheelEvent): void => { if (phase === 'play' && !modal && !player.firstPerson) player.dist = clamp(player.dist + e.deltaY * 0.01, 3.5, 14); };
  window.addEventListener('wheel', onWheel, { passive: true });
  q('.ty-touchpad').addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]'); if (!b) return; audio.unlock(); e.preventDefault();
    const t = b.dataset.t; if (t === 'ride') toggleRide(); else if (t === 'use') { if (rides?.driving) honk(); else interact(); } else if (t === 'run') {
      if (rides?.driving) { if (beginBrake(tc, e.pointerId)) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); try { b.setPointerCapture(e.pointerId); } catch { /* 손을 떼면 창에서 해제됩니다. */ } } }
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
    rides = new Rides(scene, layout, colliders, (x, z, r) => traffic?.blocks(x, z, r) ?? false, (x, z, r) => crowd?.blocks(x, z, r) ?? false);
  }
  function bindCore(c: TycoonCore): void {
    for (const u of unsub.splice(0)) u();
    core = c; unsub.push(c.subscribe(() => { hudDirty = true; }), c.onEvent(onEvent));
  }
  function onEvent(e: CoreEvent): void {
    hudDirty = true;
    switch (e.type) {
      case 'cash': if (e.amount > 0) { audio.coin(e.amount); player?.celebrate(); const el = document.createElement('span'); el.textContent = `+${formatMoney(e.amount)}`; q('#ty-earnings').append(el); window.setTimeout(() => el.remove(), 1600); } break;
      case 'toast': toast(e.text, e.tone ?? 'info'); if (e.tone === 'bad') audio.bad(); else if (e.tone === 'good') audio.good(); break;
      case 'stage': banner(STAGE_NAMES[e.stage], e.text); audio.stageUp(); cineT = 0.001; syncCity(true); applyStageLook(); save(); break;
      case 'day': audio.day(); toast(`${core.state.day}일차 아침 — 어제 순이익 ${formatMoney(e.report.profit)}`, e.report.profit >= 0 ? 'good' : 'bad', 5); save(); break;
      case 'task': if (e.task) toast(e.text); break;
      case 'win': banner('세계 정복', e.text, 6000); window.setTimeout(() => { if (!closed && phase === 'play') openModal({ kind: 'win' }); }, 3200); break;
    }
  }
  function syncCity(animate: boolean): void {
    if (!city) return;
    spotViews = core.spots() as SpotView[]; city.sync(core.state.stage, spotViews, animate); city.setTarget(core.state.task?.targetSpotId ?? null);
  }
  function applyStageLook(): void {
    const si = core.state.stageIndex; player.setOutfit(si); if (rides?.driving && player.rig) player.rig.root.visible = false; crowd?.setStage(si); traffic?.setStage(si); lastStage = si; attachCarry(true);
  }
  function attachCarry(force = false): void {
    const s = core.state, key = `${s.cargo?.units ? s.cargo.kind : ''}${s.cargo?.units ?? 0}|${s.bottles}`; if (!force && key === lastCarry) return; lastCarry = key;
    const rig = player?.rig; if (!rig) return; const old = rig.torso.getObjectByName('carry'); if (old) rig.torso.remove(old);
    if (!s.cargo?.units && !s.bottles) return;
    const g = new THREE.Group(); g.name = 'carry';
    if (s.cargo?.units) { const sz = 0.3 + Math.min(0.35, s.cargo.units / 120); const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, sz, sz * 1.3), new THREE.MeshLambertMaterial({ color: 0xb98a4a })); m.position.set(-0.32, 1.12, 0); g.add(m); }
    if (s.bottles) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.14 + Math.min(0.14, s.bottles / 120), 10, 8), new THREE.MeshLambertMaterial({ color: 0x8ab6a4, transparent: true, opacity: 0.9 })); m.position.set(0.02, 0.72, 0.34); g.add(m); }
    rig.torso.add(g);
  }

  // ---------- 제목/시작 ----------
  function showTitle(): void {
    const sm = readTycoonSummary();
    titleEl.innerHTML = titleHtml(sm.has, sm.has ? `${STAGE_NAMES[sm.stage]} · ${sm.day}일차 · ${formatMoney(sm.cash)}` : '', confirmNew); titleEl.hidden = false; hudEl.hidden = true;
  }
  titleEl.addEventListener('click', e => { audio.unlock(); const b = (e.target as HTMLElement).closest<HTMLElement>('[data-title]'); if (b) titleAction(b.dataset.title!); });
  let confirmNew = false;
  function titleAction(a: string): void {
    if (a === 'exit') { exit(); return; }
    if (a === 'new' && readTycoonSummary().has && !confirmNew) { confirmNew = true; showTitle(); return; } // 저장이 있으면 한 번 더 눌러야 지워집니다
    confirmNew = false;
    if (a === 'new') { waypoint = null; resumePosition = null; clearTycoon(); bindCore(createCore()); syncCity(false); rebuildFleet(); }
    else if (a === 'continue') { /* 제목 화면에서 이미 저장본으로 만든 코어를 씁니다 */ }
    startPlay();
  }
  function startPlay(): void {
    phase = 'play'; titleEl.hidden = true; hudEl.hidden = false; resetInput(); applyStageLook();
    const sp = layout.spawn, s = core.state; const bench = s.presence ? city.doorOf(s.presence) : null;
    tutorialTime = s.day === 1 && s.minutes < 6 * 60 + 30 && s.cash <= 20 ? 0 : -1;
    const saved = resumePosition; resumePosition = null;
    const point = saved && safeArrival(saved);
    if (saved?.ride && rides?.restore(saved.ride, player)) {
      player.camYaw = saved.yaw + Math.PI;
      player.camPitch = 0.35; player.dist = 10;
    } else if (point && saved) player.teleport(point.x, point.z, saved.yaw);
    else if (bench) player.teleport(bench.x + bench.fx * 2.5 + (bench.fz ? 2 : 0), bench.z + bench.fz * 2.5 + (bench.fx ? 2 : 0), Math.atan2(-bench.fx, -bench.fz));
    else player.teleport(sp.x, sp.z, sp.yaw);
    if (saved) waypoint = saved.waypoint;
    if (!saved && s.day === 1 && s.minutes < 6 * 60 + 30 && s.cash <= 20) { banner('빈털터리', '벤치에서 눈을 떴습니다. 병을 주워 팔고, 일을 찾아 걸어가 보세요.', 5000); toast('E 로 장소와 상호작용 · 지도(M)로 길을 찾으세요', 'info', 6); }
    audio.unlock(); core.tick(0.0001);
  }

  // ---------- 루프 ----------
  function resize(): void { if (!renderer) return; const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); post?.setSize(w, h); camera.aspect = w / h; camera.fov = h > w ? 74 : 66; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize);

  function readMove(): { mx: number; mz: number; run: boolean } {
    let mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), mz = (keys.has('KeyW') || keys.has('ArrowUp') && false ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
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
    const playing = phase === 'play', s = core.state;
    const worldDt = playing && (paused() || document.hidden) ? 0 : dt;
    if (playing && !paused() && !document.hidden) core.tick(dt);
    const st = core.state;
    // 입력 → 이동
    const mv = readMove(), frozen = !playing || paused() || !!st.activity?.lockMovement;
    if (playing && !paused()) {
      const turn = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0), tilt = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      if (turn || tilt) player.look(-turn * dt * 1.8, tilt * dt * 1.2);
      if (st.activity?.lockMovement && Math.hypot(mv.mx, mv.mz) > 0.35) { core.cancelActivity(); toast('중단했습니다'); }
    }
    if (playing) { player.update(dt, mv, colliders, frozen || !!rides?.driving, resolveParked);
      const command = driveCommand({
        left: keys.has('KeyA'), right: keys.has('KeyD'), forward: keys.has('KeyW'), back: keys.has('KeyS'),
        brake: keys.has('Space') || tc.brake,
      }, tc.mx, tc.my);
      const impact = rides?.update(dt, command, player, frozen);
      if (impact && !frozen && nowS - lastCrashAt > 0.7) { lastCrashAt = nowS; audio.impact(); }
    }
    // 가까운 장소
    near = playing && !rides?.driving ? city.nearestSpot(player.pos.x, player.pos.z, PROMPT_RANGE) : null;
    if (playing) { const id = near && !near.spot.locked ? near.id : null; core.setPresence(id); }
    if (playing && !paused() && !rides?.driving) audio.step(player.speed, nowS);
    // 월드 갱신
    const minutes = playing ? st.minutes : 17.4 * 60, focus = playing ? player.pos : titleFocus;
    const sky = atmo.update(worldDt, camera, focus, minutes, st.day);
    city.setNight(sky.night); city.setWet(sky.wet); rides?.setLighting(sky.night); renderer.toneMappingExposure = atmo.exposure();
    city.update(worldDt, focus);
    waypointMarker?.update(worldDt, player.pos, playing ? waypoint : null);
    crowd?.update(worldDt, focus, sky.night, sky.wet, (i, j) => city.blockOpen(i, j)); traffic?.update(worldDt, focus, player.pos, sky.night, (x, z, radius) => rides?.blocksTraffic(x, z, radius) ?? false);
    if (st.stageIndex !== lastStage && playing) applyStageLook();
    // 카메라
    if (playing) {
      player.placeCamera(camera, dt, colliders);
      rides?.positionDriverCamera(camera, player);
      const fov = (innerHeight > innerWidth ? 74 : 66) + (rides?.driving ? Math.min(8, rides.speed * 0.36) : 0);
      if (Math.abs(camera.fov - fov) > 0.08) { camera.fov = fov; camera.updateProjectionMatrix(); }
      if (cineT > 0) { cineT += dt; const k = Math.sin(Math.min(1, cineT / 4.2) * Math.PI), vx = player.pos.x + 20, vz = player.pos.z + 46, vy = 46 + 30 * k; camera.position.lerp(new THREE.Vector3(vx, vy, vz), k * 0.88); camera.lookAt(player.pos.x - 10 * k, 4 + 6 * k, player.pos.z - 6 * k); if (cineT > 4.2) cineT = 0; }
    } else {
      titleAngle += dt * 0.07; const cx = titleFocus.x, cz = titleFocus.z; camera.position.set(cx + Math.cos(titleAngle) * 52, 26 + Math.sin(titleAngle * 0.7) * 3, cz + Math.sin(titleAngle) * 52); camera.lookAt(cx, 3, cz);
    }
    if (playing) {
      const marker = q('#ty-waypoint'), target = st.task && city.doorOf(st.task.targetSpotId);
      marker.hidden = !target || !!modal;
      if (target && !modal) {
        camera.updateMatrixWorld();
        waypointVector.set(target.x, 3, target.z).project(camera);
        let x = waypointVector.x, y = -waypointVector.y;
        const behind = waypointVector.z > 1;
        if (behind) { x = -x; y = -y; if (Math.abs(x) + Math.abs(y) < 0.01) y = 1; }
        const limit = Math.min(0.84 / Math.max(Math.abs(x), 0.001), 0.72 / Math.max(Math.abs(y), 0.001));
        const scale = behind ? limit : Math.min(1, limit);
        const edge = scale < 1 || behind;
        marker.style.left = `${50 + x * scale * 50}%`; marker.style.top = `${50 + y * scale * 50}%`;
        const icon = marker.firstElementChild as HTMLElement;
        icon.style.transform = edge ? `rotate(${Math.atan2(x, -y)}rad)` : '';
        marker.classList.toggle('edge', edge);
        marker.lastElementChild!.textContent = `${Math.round(Math.hypot(target.x - player.pos.x, target.z - player.pos.z))} m`;
      }
      if (tutorialTime >= 0 && !paused()) { tutorialTime += dt; if (tutorialTime < 20 && Math.hypot(mv.mx, mv.mz) > 0.2) tutorialTime = 20; }
      const hint = q('#ty-hint');
      hint.hidden = tutorialTime < 0 || tutorialTime >= 60 || !!modal;
      if (!hint.hidden) hint.textContent = tutorialTime < 20 ? (touch ? '왼쪽을 밀어 이동하고 오른쪽을 움직여 둘러보세요' : 'WASD로 이동 · 마우스로 둘러보기') : tutorialTime < 40 ? (touch ? '장소에 가까이 가서 행동 버튼을 누르세요' : '장소에 가까이 가서 E를 누르세요') : (touch ? '지도를 열어 목적지와 주변 장소를 확인하세요' : 'M으로 지도 열기 · Shift로 달리기');
    }
    // 주기 작업
    syncT += dt; if (syncT > SYNC_EVERY) { syncT = 0; syncCity(false); attachCarry(); }
    saveT += dt; if (saveT > 25) { saveT = 0; save(); }
    audio.ambience(sky.daylight, sky.wet, 0); if (sky.wet > 0.8 && Math.random() < dt * 0.04) audio.thunder();
    const fl = q('#ty-flash'); void fl;
    audio.drive(rides?.speed ?? 0, playing && !!rides?.driving && !paused() && !document.hidden);
    // 토스트 정리
    const nowMs = performance.now(); while (toastList.length && toastList[0].at < nowMs) toastList.shift()!.el.remove();
    // HUD
    hudT += dt; if (playing && (hudDirty || hudT > 0.25)) { hudDirty = false; hudT = 0; updateHud(st); }
    if (playing && modal?.kind === 'spot' && hudT === 0) renderModal();
    if (playing && modal?.kind === 'status' && Math.floor(nowS * 2) % 4 === 0 && hudT === 0) renderModal();
    clockT += dt; if (playing && clockT > 0.1) { clockT = 0; drawMap(mini, layout, { stage: st.stageIndex, spots: spotViews, px: player.pos.x, pz: player.pos.z, yaw: player.facing, target: st.task?.targetSpotId ?? null, time: nowS, names: false, waypoint, vehicles: rides?.positions() }); if (modal?.kind === 'map') drawBig(); }
    void s;
    govern(dt);
    if (++shadowTick >= shadowEvery) { shadowTick = 0; renderer.shadowMap.needsUpdate = true; } // 그림자 맵은 몇 프레임에 한 번만 다시 그립니다
    if (post && postOn) post.render(dt); else renderer.render(scene, camera);
  }
  // 적응형 화질: 프레임 시간(지수평균)이 길면 해상도 → 그림자 갱신 빈도 → 후처리 → 그림자 순으로 줄입니다. 규칙·시뮬레이션에는 영향이 없습니다.
  let prMax = 1, pr = 1, frameMs = 16, prCool = 3, postOn = true, shadowEvery = 2, shadowTick = 0;
  function govern(dt: number): void {
    if (!renderer || phase === 'load' || dt <= 0.001) return;
    frameMs += (dt * 1000 - frameMs) * 0.08; prCool -= dt; if (prCool > 0 || frameMs < 26) return;
    const floor = Math.min(0.75, prMax);
    if (pr > floor + 0.001) { pr = Math.max(floor, pr - 0.25); renderer.setPixelRatio(pr); resize(); }
    else if (shadowEvery < 4) shadowEvery = 4;
    else if (post && postOn) postOn = false;
    else if (atmo.sun.castShadow) atmo.sun.castShadow = false;
    prCool = 4; frameMs = 16;
  }
  const titleFocus = new THREE.Vector3();

  function updateHud(s: TycoonState): void {
    const route = q('#ty-route');
    if (modal?.kind !== 'map' && waypoint && Math.hypot(player.pos.x - waypoint.x, player.pos.z - waypoint.z) < 8) { waypoint = null; toast('목적지에 도착했습니다', 'good'); }
    route.hidden = !waypoint;
    route.classList.toggle('has-task', !!s.task);
    if (waypoint) {
      set('route-distance', '도로 기준 약 ' + Math.round(streetDistance(player.pos, waypoint)) + 'm');
      const bearing = Math.atan2(waypoint.x - player.pos.x, waypoint.z - player.pos.z);
      const angle = player.camYaw - bearing + Math.PI / 2;
      style('route-mark', 'transform', 'rotate(' + Math.round(angle * 180 / Math.PI) + 'deg)');
    }
    const cashText = formatMoney(s.cash), cashEl = q('#ty-cash');
    if (cache.has('cash') && cache.get('cash') !== cashText && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cashEl.getAnimations().forEach(animation => animation.cancel());
      cashEl.animate([{ transform: 'translateY(0)', filter: 'brightness(1)' }, { transform: 'translateY(-2px)', filter: 'brightness(1.5)' }, { transform: 'translateY(0)', filter: 'brightness(1)' }], { duration: 360, easing: 'ease-out' });
    }
    set('cash', cashText); set('debt', s.debt ? `빚 ${formatMoney(s.debt)}` : ''); set('stage', s.stageName); html('ladder', ladderHtml(s.stage));
    set('clock', s.clock); set('day', `${s.day}일차`); set('sun', s.night ? '밤' : '낮');
    for (const b of q('#ty-speed').children) (b as HTMLElement).classList.toggle('on', Number((b as HTMLElement).dataset.speed) === s.speed);
    style('energy', 'width', `${s.energy}%`); set('energy-n', String(s.energy)); q('#ty-energy').parentElement!.classList.toggle('low', s.energy < 25);
    html('carry', `${s.cargo?.units ? `<span>재료 ${s.cargo.units}</span>` : ''}${s.bottles ? `<span>빈 병 ${s.bottles}</span>` : ''}`);
    html('goal', `<b>${esc(s.goal.label)}</b><div class="ty-bar gold"><i style="width:${Math.round(s.goal.progress * 100)}%"></i></div>${s.goal.steps.filter(x => !x.done).slice(0, 3).map(x => `<small>○ ${esc(x.label)}</small>`).join('')}`);
    // 활동·과제
    const a = s.activity; q('#ty-activity').hidden = !a; if (a) { set('act-label', a.label); style('act-bar', 'width', `${Math.round(a.progress * 100)}%`); }
    const t = s.task; q('#ty-task').hidden = !t;
    if (t) {
      const d = city.doorOf(t.targetSpotId); set('task-label', t.label); set('task-sub', `${formatMoney(t.reward)} · ${t.minutesLeft > 0 ? `${Math.floor(t.minutesLeft / 60)}시간 ${t.minutesLeft % 60}분 남음` : '지각 — 보수 절반'}`);
      if (d) { const ang = Math.atan2(d.x - player.pos.x, d.z - player.pos.z), rel = -(ang + player.camYaw) + Math.PI / 2 + Math.PI; style('arrow', 'transform', `rotate(${(rel * 180 / Math.PI).toFixed(0)}deg)`); }
    }
    // 프롬프트
    const p = q<HTMLButtonElement>('#ty-prompt');
    if (rides?.driving && !modal) { p.hidden = false; html('prompt', rides.speed > 1 ? '<b>정차한 뒤 하차하세요</b>' : '<kbd>F</kbd><b>차량에서 내리기</b>'); } else if (rides?.nearby(player.pos.x, player.pos.z) && !modal && !s.activity) { p.hidden = false; html('prompt', `<kbd>F</kbd><b>${esc(rides.nearby(player.pos.x, player.pos.z)!.name)} 탑승</b>${near ? `<em>E · ${esc(near.spot.name)}</em>` : ''}`); } else if (near && !modal && !s.activity) { p.hidden = false; const v = near.spot; const key = touch ? '' : '<kbd>E</kbd>'; const txt = `${key}<b>${esc(v.name)}</b>${v.locked ? `<em>${esc(STAGE_NAMES[v.minStage])} 단계에 열림</em>` : ''}`; html('prompt', txt); } else p.hidden = true;
    const actionButton = q<HTMLButtonElement>('[data-t="use"]');
    actionButton.textContent = rides?.driving ? '경적' : '행동';
    actionButton.classList.toggle('horn', !!rides?.driving);
    actionButton.setAttribute('aria-label', rides?.driving ? '차량 경적 울리기' : '가까운 장소와 상호작용');
    const runButton = q<HTMLButtonElement>('#ty-t-run');
    runButton.textContent = rides?.driving ? '브레이크' : '달리기';
    runButton.setAttribute('aria-label', rides?.driving ? '길게 눌러 차량 브레이크' : '달리기 전환');
    runButton.classList.toggle('brake', !!rides?.driving);
    const rideButton = q<HTMLButtonElement>('#ty-t-ride');
    const nearbyRide = rides?.nearby(player.pos.x, player.pos.z);
    rideButton.textContent = rides?.driving ? (rides.speed > 1 ? '정차 후 하차' : '하차') : '탑승';
    rideButton.disabled = !nearbyRide || !!s.activity || (!!rides?.driving && rides.speed > 1);
    rideButton.setAttribute('aria-label', rides?.driving ? '차량에서 내리기' : '가까운 차량 탑승');
    const drive = q('#ty-drive'); drive.hidden = !rides?.driving;
    if (rides?.driving) { set('drive-speed', String(Math.round(rides.speed * 3.6))); set('drive-gear', rides.gear); set('drive-name', rides.name ?? '차량'); }
  }

  // ---------- 종료 ----------
  function exit(): void {
    if (closed) return; save(); closed = true; cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', resetInput); document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); window.removeEventListener('wheel', onWheel); window.removeEventListener('resize', resize); document.removeEventListener('pointerlockchange', onLock);
    if (document.pointerLockElement) document.exitPointerLock();
    for (const u of unsub) u();
    try { waypointMarker?.dispose(); rides?.dispose(); crowd?.dispose(); traffic?.dispose(); player?.dispose(); city?.dispose(); atmo?.dispose(); } catch { /* 정리 실패는 무시 */ }
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
      prMax = pr = Math.min(quality === 'high' ? 2 : quality === 'standard' ? 1.5 : 1, devicePixelRatio || 1); renderer.setPixelRatio(pr);
      renderer.shadowMap.enabled = quality !== 'low'; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
      const stored = loadTycoon();
      resumePosition = readSessionPosition(stored);
      bindCore(createCore({ save: stored }));
      layout = buildLayout(core.spots() as SpotDef[]);
      city = new CityView(layout, quality); scene.add(city.group); colliders = city.colliders;
      // Build occupied lots and their colliders before choosing safe parked car locations.
      syncCity(false);
      waypointMarker = new WayfindingMarker(scene);
      atmo = new Atmosphere(scene, renderer, quality);
      player = new Player(scene, kit);
      rebuildFleet();
      if (kit) { crowd = new Crowd(scene, kit, quality); traffic = new Traffic(scene, quality); } else traffic = new Traffic(scene, quality);
      post = makePost(quality, renderer, scene, camera, { strength: 0.42, radius: 0.55, threshold: 0.84, vignette: 0.32, saturation: 1.1, contrast: 1.06 });
      applyStageLook(); resize();
      const bench = layout.spotLots.get('bench') ?? [...layout.spotLots.values()][0]; titleFocus.set(bench?.cx ?? layout.spawn.x, 0, bench?.cz ?? layout.spawn.z);
    } catch (err) { console.error(err); opts.loading?.close(); phase = 'title'; titleEl.innerHTML = failHtml(); titleEl.hidden = false; return; }
    phase = 'title'; showTitle(); opts.loading?.close(); raf = requestAnimationFrame(frame);
    if (import.meta.env.DEV) {
      const dbg = { get core() { return core; }, get city() { return city; }, get player() { return player; }, get rides() { return rides; }, get cam() { return camera; }, get phase() { return phase; }, layout, start: (a: string) => titleAction(a), openSpot, syncCity, atmo: () => atmo, info: () => ({ calls: renderer?.info.render.calls, tris: renderer?.info.render.triangles, geos: renderer?.info.memory.geometries }), hud: hudEl, closeModal, openModal: (k: string) => openModal({ kind: k } as Modal) };
      (window as unknown as { __ty: typeof dbg }).__ty = dbg;
    }
  })();
  void WORLD_HALF;
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
