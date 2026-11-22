// TYCOON(HUSTLE) — 게임 조립: 3D 도시·플레이어·HUD·장소 패널·입력·저장. 경제 규칙은 core/ 가 맡습니다.
import * as THREE from 'three';
import '../shared/ui.css';
import './tycoon.css';
import { readPreferences, writePreferences } from '../prefs';
import type { LoadingScreen } from '../loading';
import { loadCharacterKit, type CharacterKit } from '../shared/character';
import { makePost, type PostFx } from '../postfx';
import { clearTycoon, createCore, formatMoney, loadTycoon, readTycoonSummary, saveTycoon } from './core';
import { STAGE_NAMES } from './core/data';
import type { CoreEvent, SpotDef, TycoonCore, TycoonState } from './core/types';
import { buildLayout, type Colliders, WORLD_HALF, type Layout } from './scene/layout';
import { CityView, type Quality, type SpotView } from './scene/city';
import { Atmosphere } from './scene/sky';
import { Player } from './scene/player';
import { Crowd, Traffic } from './scene/people';
import { TycoonAudio } from './audio';
import { drawMap } from './ui/minimap';
import { esc, failHtml, ladderHtml, menuHtml, spotPanelHtml, statusHtml, titleHtml, winHtml } from './ui/render';

interface OpenOptions { loading?: LoadingScreen }
type Phase = 'load' | 'title' | 'play';
type Modal = { kind: 'spot'; id: string } | { kind: 'status' } | { kind: 'menu' } | { kind: 'map' } | { kind: 'win' } | null;
const PROMPT_RANGE = 6.5, SYNC_EVERY = 0.5;

export function openTycoon(onExit: () => void, opts: OpenOptions = {}): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches, base = import.meta.env.BASE_URL, quality: Quality = prefs.quality;
  const root = document.createElement('div'); root.className = 'ty-root' + (touch ? ' touch' : '');
  root.innerHTML = `
    <canvas class="ty-canvas"></canvas>
    <div class="ty-fx"><div class="ty-vig"></div><div class="ty-flash" id="ty-flash"></div></div>
    <div class="ty-hud" id="ty-hud" hidden>
      <div class="ty-top">
        <div class="ty-cash"><svg class="ty-ico coin" viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="tyg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#ffcf5a"/><stop offset="1" stop-color="#b9801c"/></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#tyg)" stroke="#7a4f10" stroke-width="1.5"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#b9801c" stroke-width="1"/><path d="M12 7v10M14.4 9.4c-.6-.9-4.8-1-4.8.9 0 2.2 4.8 1 4.8 3.3 0 1.9-4.2 1.9-4.8.9" fill="none" stroke="#7a4f10" stroke-width="1.5" stroke-linecap="round"/></svg><span class="lbl">현금</span><b id="ty-cash">$0</b><small id="ty-debt"></small></div>
        <div class="ty-stagebox"><b id="ty-stage"></b><div id="ty-ladder"></div></div>
        <div class="ty-clock"><span id="ty-sun">☀</span><b id="ty-clock">06:00</b><em id="ty-day">1일차</em>
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
      <ul class="ty-toasts" id="ty-toasts"></ul>
      <div class="ty-mini"><canvas id="ty-minimap" width="220" height="220"></canvas></div>
      <div class="ty-banner" id="ty-banner"></div>
      <div class="ty-touchpad"><div class="ty-stick" id="ty-stick"><i></i></div>
        <div class="ty-tfoot"><button type="button" data-t="use" class="big">행동</button><button type="button" data-t="run" id="ty-t-run">달리기</button><button type="button" data-t="view">시점</button></div></div>
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
  let closed = false, raf = 0, last = performance.now(), phase: Phase = 'load', modal: Modal = null, clockT = 0, syncT = 0, hudT = 0, saveT = 0, titleAngle = 0, cineT = 0, rainSound = 0;
  let core!: TycoonCore, layout!: Layout, city!: CityView, atmo!: Atmosphere, player!: Player, crowd: Crowd | null = null, traffic: Traffic | null = null, post: PostFx | null = null, kit: CharacterKit | null = null;
  let renderer: THREE.WebGLRenderer | null = null; const unsub: Array<() => void> = [];
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(66, 1, 0.2, 2400); let colliders!: Colliders;
  const keys = new Set<string>(); const tc = { moveId: -1, mx: 0, my: 0, ox: 0, oy: 0, lookId: -1, lx: 0, ly: 0, run: false }; let drag = -1, dragX = 0, dragY = 0, locked = false;
  let near: { id: string; spot: SpotView; dist: number } | null = null, spotViews: SpotView[] = [], lastStage = -1, lastCarry = '', hudDirty = true;
  const toastList: Array<{ el: HTMLElement; at: number }> = [];
  let tutorialTime = -1;
  const waypointVector = new THREE.Vector3();

  // ---------- 알림 ----------
  function toast(text: string, tone: 'info' | 'good' | 'bad' = 'info', sec = 3.4): void {
    const li = document.createElement('li'); li.className = tone; li.textContent = text; q('#ty-toasts').append(li); toastList.push({ el: li, at: performance.now() + sec * 1000 });
    while (toastList.length > 5) toastList.shift()!.el.remove();
  }
  function banner(title: string, sub: string, ms = 3200): void {
    const b = q('#ty-banner'); b.innerHTML = `<h2>${esc(title)}</h2><p>${esc(sub)}</p>`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); window.setTimeout(() => b.classList.remove('show'), ms);
  }

  // ---------- 저장 ----------
  const save = (): void => { if (core && phase === 'play') saveTycoon(core); };

  // ---------- 모달 ----------
  const paused = (): boolean => modal !== null;
  let modalHtml = '', confirmRestart = false;
  function renderModal(): void {
    if (!modal) { modalEl.hidden = true; modalEl.innerHTML = ''; modalHtml = ''; return; }
    let h = '';
    switch (modal.kind) {
      case 'spot': h = spotPanelHtml(core, modal.id, !!city.spotView(modal.id)?.locked); break;
      case 'status': h = statusHtml(core.state); break;
      case 'menu': h = menuHtml(audio.enabled, player.firstPerson, confirmRestart); break;
      case 'win': h = winHtml(core.state); break;
      case 'map': h = '<div class="ty-bigmap"><button type="button" class="ty-x" data-close aria-label="닫기">✕</button><canvas id="ty-bigmap" width="720" height="720"></canvas></div>'; break;
    }
    if (h !== modalHtml || modalEl.hidden) { // 내용이 바뀔 때만 교체합니다(누르는 도중 버튼이 바뀌면 클릭이 사라집니다)
      const keep = modalEl.querySelector('.ty-panel')?.scrollTop ?? 0; modalEl.innerHTML = h; modalHtml = h; modalEl.hidden = false;
      const p = modalEl.querySelector('.ty-panel'); if (p) p.scrollTop = keep;
    }
    if (modal.kind === 'map') drawBig();
  }
  function drawBig(): void { const c = modalEl.querySelector<HTMLCanvasElement>('#ty-bigmap'); if (c) drawMap(c, layout, { stage: core.state.stageIndex, spots: spotViews, px: player.pos.x, pz: player.pos.z, yaw: player.facing, target: core.state.task?.targetSpotId ?? null, time: performance.now() / 1000, names: true }); }
  function openModal(m: Modal): void { modal = m; confirmRestart = false; if (m && document.pointerLockElement) document.exitPointerLock(); resetInput(); renderModal(); audio.open(); }
  /** 창을 닫습니다. 마우스 클릭으로 닫을 땐 커서를 다시 잠그지 않아 HUD 버튼을 계속 누를 수 있고, 키보드(E·Tab·Esc)로 닫을 때만 시점 조작을 위해 잠급니다. */
  function closeModal(relock = false): void { modal = null; confirmRestart = false; renderModal(); if (phase === 'play' && relock) lock(); }
  function openSpot(id: string): void { if (phase !== 'play') return; const spot = core.spot(id); if (!spot) return; openModal({ kind: 'spot', id }); }
  function interact(): void { if (phase !== 'play' || modal) return; if (near) openSpot(near.id); }

  modalEl.addEventListener('click', e => {
    const t = e.target as HTMLElement; audio.unlock();
    if (t.closest('[data-close]') || t === modalEl || t.matches('.ty-pause-screen, .ty-win-screen')) { closeModal(); return; }
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
    audio.click(); if (core.state.cash < before) audio.spend();
    const def = core.actionsAt(spotId).find(a => a.id === actionId); void def;
    if (core.state.activity) { closeModal(); toast(r.message); } else { toast(r.message, 'good'); renderModal(); }
    hudDirty = true;
  }
  /** 저장을 지우고 빈털터리 첫날부터 다시 시작합니다(메뉴에서 두 번 눌러야 실행). */
  function restartGame(): void {
    clearTycoon(); bindCore(createCore());
    modal = null; confirmRestart = false; renderModal(); toastList.length = 0; q('#ty-toasts').replaceChildren(); q('#ty-banner').classList.remove('show');
    cineT = 0; lastCarry = ''; lastStage = -1; cache.clear(); hudDirty = true; syncCity(false); startPlay(); save();
  }
  function menuAction(m: string): void {
    if (m !== 'restart') confirmRestart = false;
    if (m === 'resume') closeModal();
    else if (m === 'restart') { if (confirmRestart) restartGame(); else { confirmRestart = true; renderModal(); } }
    else if (m === 'save') { save(); toast('저장했습니다', 'good'); }
    else if (m === 'view') { player.setFirstPerson(!player.firstPerson); renderModal(); }
    else if (m === 'sound') { audio.enabled = !audio.enabled; writePreferences({ ...readPreferences(), sound: audio.enabled }); renderModal(); }
    else if (m === 'exit') exit();
  }

  // ---------- 입력 ----------
  function resetInput(): void { keys.clear(); tc.moveId = tc.lookId = -1; tc.mx = tc.my = 0; drag = -1; q('#ty-stick').style.opacity = '0'; (q('#ty-stick').firstElementChild as HTMLElement).style.transform = ''; }
  function lock(): void { if (touch || !player || locked) return; try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => undefined); } catch { /* 선택 사항 */ } }
  const onLock = (): void => { const wasLocked = locked; locked = document.pointerLockElement === canvas; if (wasLocked && !locked && phase === 'play' && !modal) openModal({ kind: 'menu' }); };
  document.addEventListener('pointerlockchange', onLock);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    audio.unlock();
    if (phase === 'title') { if (player && e.code === 'Enter') titleAction(readTycoonSummary().has ? 'continue' : 'new'); return; }
    if (phase !== 'play') return;
    if (e.code === 'Escape') { e.preventDefault(); if (modal?.kind === 'menu') closeModal(true); else openModal({ kind: 'menu' }); return; }
    if (modal) {
      if (modal.kind === 'spot' && /^Digit[1-9]$/.test(e.code)) { const a = core.actionsAt(modal.id)[Number(e.code.slice(5)) - 1]; if (a) doAction(modal.id, a.id); e.preventDefault(); }
      else if ((e.code === 'KeyE' || e.code === 'Tab') && modal.kind !== 'menu') { e.preventDefault(); closeModal(true); }
      return;
    }
    if (e.code === 'Tab') { e.preventDefault(); openModal({ kind: 'status' }); return; }
    if (e.code === 'KeyM') { openModal({ kind: 'map' }); return; }
    if (e.code === 'KeyE' || e.code === 'Enter') { interact(); return; }
    if (e.code === 'KeyV') { player.setFirstPerson(!player.firstPerson); lock(); return; }
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { core.setSpeed(e.code === 'Digit1' ? 1 : e.code === 'Digit2' ? 2 : 4); hudDirty = true; return; }
    if (e.code.startsWith('Arrow')) e.preventDefault();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.code); };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', resetInput); const onVisibility = (): void => { resetInput(); if (document.hidden && phase === 'play' && !modal) openModal({ kind: 'menu' }); };
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('pointerdown', e => {
    audio.unlock(); if (phase !== 'play' || modal) return;
    if (e.pointerType === 'touch') {
      if (e.clientX < innerWidth * 0.45 && tc.moveId < 0) { tc.moveId = e.pointerId; tc.ox = e.clientX; tc.oy = e.clientY; const st = q('#ty-stick'); st.style.cssText = `left:${e.clientX - 60}px;top:${e.clientY - 60}px;opacity:1`; }
      else if (tc.lookId < 0) { tc.lookId = e.pointerId; tc.lx = e.clientX; tc.ly = e.clientY; }
    } else { drag = e.pointerId; dragX = e.clientX; dragY = e.clientY; lock(); }
  });
  const onMove = (e: PointerEvent): void => {
    if (e.pointerId === tc.moveId) { const dx = clamp((e.clientX - tc.ox) / 55, -1, 1), dy = clamp((e.clientY - tc.oy) / 55, -1, 1); tc.mx = dx; tc.my = dy; (q('#ty-stick').firstElementChild as HTMLElement).style.transform = `translate(${dx * 38}px,${dy * 38}px)`; }
    else if (e.pointerId === tc.lookId) { player.look((e.clientX - tc.lx) * 0.0055, (e.clientY - tc.ly) * 0.0045); tc.lx = e.clientX; tc.ly = e.clientY; }
    else if (locked && phase === 'play' && !modal) player.look(e.movementX * 0.0024, e.movementY * 0.002);
    else if (e.pointerId === drag && !modal) { player.look((e.clientX - dragX) * 0.005, (e.clientY - dragY) * 0.004); dragX = e.clientX; dragY = e.clientY; }
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId === tc.moveId) { tc.moveId = -1; tc.mx = tc.my = 0; q('#ty-stick').style.opacity = '0'; (q('#ty-stick').firstElementChild as HTMLElement).style.transform = ''; }
    if (e.pointerId === tc.lookId) tc.lookId = -1; if (e.pointerId === drag) drag = -1;
  };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  const onWheel = (e: WheelEvent): void => { if (phase === 'play' && !modal && !player.firstPerson) player.dist = clamp(player.dist + e.deltaY * 0.01, 3.5, 14); };
  window.addEventListener('wheel', onWheel, { passive: true });
  q('.ty-touchpad').addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]'); if (!b) return; audio.unlock(); e.preventDefault();
    const t = b.dataset.t; if (t === 'use') interact(); else if (t === 'run') { tc.run = !tc.run; b.classList.toggle('on', tc.run); } else if (t === 'view') { player.setFirstPerson(!player.firstPerson); }
  });
  q('#ty-prompt').addEventListener('click', () => { audio.unlock(); interact(); });
  q('#ty-b-status').addEventListener('click', () => { audio.unlock(); if (!modal) openModal({ kind: 'status' }); });
  q('#ty-b-map').addEventListener('click', () => { audio.unlock(); if (!modal) openModal({ kind: 'map' }); });
  q('#ty-b-menu').addEventListener('click', () => { audio.unlock(); if (!modal) openModal({ kind: 'menu' }); });
  q('#ty-speed').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-speed]'); if (b) { core.setSpeed(Number(b.dataset.speed) as 1 | 2 | 4); hudDirty = true; audio.click(); } });
  mini.addEventListener('click', () => { if (!modal && phase === 'play') openModal({ kind: 'map' }); });

  // ---------- 코어 연결 ----------
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
    const si = core.state.stageIndex; player.setOutfit(si); crowd?.setStage(si); traffic?.setStage(si); lastStage = si; attachCarry(true);
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
    if (a === 'new') { clearTycoon(); bindCore(createCore()); syncCity(false); }
    else if (a === 'continue') { /* 제목 화면에서 이미 저장본으로 만든 코어를 씁니다 */ }
    startPlay();
  }
  function startPlay(): void {
    phase = 'play'; titleEl.hidden = true; hudEl.hidden = false; resetInput(); applyStageLook();
    const sp = layout.spawn, s = core.state; const bench = s.presence ? city.doorOf(s.presence) : null;
    tutorialTime = s.day === 1 && s.minutes < 6 * 60 + 30 && s.cash <= 20 ? 0 : -1;
    if (bench) player.teleport(bench.x + bench.fx * 2.5 + (bench.fz ? 2 : 0), bench.z + bench.fz * 2.5 + (bench.fx ? 2 : 0), Math.atan2(-bench.fx, -bench.fz)); else player.teleport(sp.x, sp.z, sp.yaw);
    if (s.day === 1 && s.minutes < 6 * 60 + 30 && s.cash <= 20) { banner('빈털터리', '벤치에서 눈을 떴습니다. 병을 주워 팔고, 일을 찾아 걸어가 보세요.', 5000); toast('E 로 장소와 상호작용 · 지도(M)로 길을 찾으세요', 'info', 6); }
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
    if (playing && !paused()) core.tick(dt);
    const st = core.state;
    // 입력 → 이동
    const mv = readMove(), frozen = !playing || paused() || !!st.activity?.lockMovement;
    if (playing && !paused()) {
      const turn = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0), tilt = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      if (turn || tilt) player.look(-turn * dt * 1.8, tilt * dt * 1.2);
      if (st.activity?.lockMovement && Math.hypot(mv.mx, mv.mz) > 0.35) { core.cancelActivity(); toast('중단했습니다'); }
    }
    if (playing) player.update(dt, mv, colliders, frozen);
    // 가까운 장소
    near = playing ? city.nearestSpot(player.pos.x, player.pos.z, PROMPT_RANGE) : null;
    if (playing) { const id = near && !near.spot.locked ? near.id : null; core.setPresence(id); }
    if (playing && !paused()) audio.step(player.speed, nowS);
    // 월드 갱신
    const minutes = playing ? st.minutes : 17.4 * 60, focus = playing ? player.pos : titleFocus;
    const sky = atmo.update(dt, camera, focus, minutes, st.day);
    city.setNight(sky.night); city.setWet(sky.wet); renderer.toneMappingExposure = atmo.exposure();
    city.update(dt, focus);
    crowd?.update(dt, focus, sky.night, sky.wet, (i, j) => city.blockOpen(i, j)); traffic?.update(dt, focus, player.pos, sky.night);
    if (st.stageIndex !== lastStage && playing) applyStageLook();
    // 카메라
    if (playing) {
      player.placeCamera(camera, dt, colliders);
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
    audio.ambience(sky.daylight, sky.wet, 0); if (sky.wet > 0.8 && Math.random() < dt * 0.04) audio.thunder(); rainSound = sky.wet; void rainSound;
    const fl = q('#ty-flash'); void fl;
    // 토스트 정리
    const nowMs = performance.now(); while (toastList.length && toastList[0].at < nowMs) toastList.shift()!.el.remove();
    // HUD
    hudT += dt; if (playing && (hudDirty || hudT > 0.25)) { hudDirty = false; hudT = 0; updateHud(st); }
    if (playing && modal?.kind === 'spot' && hudT === 0) renderModal();
    if (playing && modal?.kind === 'status' && Math.floor(nowS * 2) % 4 === 0 && hudT === 0) renderModal();
    clockT += dt; if (playing && clockT > 0.1) { clockT = 0; drawMap(mini, layout, { stage: st.stageIndex, spots: spotViews, px: player.pos.x, pz: player.pos.z, yaw: player.facing, target: st.task?.targetSpotId ?? null, time: nowS, names: false }); if (modal?.kind === 'map') drawBig(); }
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
    const cashText = formatMoney(s.cash), cashEl = q('#ty-cash');
    if (cache.has('cash') && cache.get('cash') !== cashText && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cashEl.getAnimations().forEach(animation => animation.cancel());
      cashEl.animate([{ transform: 'translateY(0)', filter: 'brightness(1)' }, { transform: 'translateY(-2px)', filter: 'brightness(1.5)' }, { transform: 'translateY(0)', filter: 'brightness(1)' }], { duration: 360, easing: 'ease-out' });
    }
    set('cash', cashText); set('debt', s.debt ? `빚 ${formatMoney(s.debt)}` : ''); set('stage', s.stageName); html('ladder', ladderHtml(s.stage));
    set('clock', s.clock); set('day', `${s.day}일차`); set('sun', s.night ? '☾' : '☀');
    for (const b of q('#ty-speed').children) (b as HTMLElement).classList.toggle('on', Number((b as HTMLElement).dataset.speed) === s.speed);
    style('energy', 'width', `${s.energy}%`); set('energy-n', String(s.energy)); q('#ty-energy').parentElement!.classList.toggle('low', s.energy < 25);
    html('carry', `${s.cargo?.units ? `<span>📦 재료 ${s.cargo.units}</span>` : ''}${s.bottles ? `<span>🍾 빈 병 ${s.bottles}</span>` : ''}`);
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
    if (near && !modal && !s.activity) { p.hidden = false; const v = near.spot; const key = touch ? '' : '<kbd>E</kbd>'; const txt = `${key}<span class="ico">${esc(v.icon)}</span><b>${esc(v.name)}</b>${v.locked ? `<em>🔒 ${esc(STAGE_NAMES[v.minStage])} 단계에 열림</em>` : ''}`; html('prompt', txt); } else p.hidden = true;
  }

  // ---------- 종료 ----------
  function exit(): void {
    if (closed) return; save(); closed = true; cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', resetInput); document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); window.removeEventListener('wheel', onWheel); window.removeEventListener('resize', resize); document.removeEventListener('pointerlockchange', onLock);
    if (document.pointerLockElement) document.exitPointerLock();
    for (const u of unsub) u();
    try { crowd?.dispose(); traffic?.dispose(); player?.dispose(); city?.dispose(); atmo?.dispose(); } catch { /* 정리 실패는 무시 */ }
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
      bindCore(createCore({ save: loadTycoon() }));
      layout = buildLayout(core.spots() as SpotDef[]);
      city = new CityView(layout, quality); scene.add(city.group); colliders = city.colliders;
      atmo = new Atmosphere(scene, renderer, quality);
      player = new Player(scene, kit);
      if (kit) { crowd = new Crowd(scene, kit, quality); traffic = new Traffic(scene, quality); } else traffic = new Traffic(scene, quality);
      post = makePost(quality, renderer, scene, camera, { strength: 0.42, radius: 0.55, threshold: 0.84, vignette: 0.32, saturation: 1.1, contrast: 1.06 });
      syncCity(false); applyStageLook(); resize();
      const bench = layout.spotLots.get('bench') ?? [...layout.spotLots.values()][0]; titleFocus.set(bench?.cx ?? layout.spawn.x, 0, bench?.cz ?? layout.spawn.z);
    } catch (err) { console.error(err); opts.loading?.close(); phase = 'title'; titleEl.innerHTML = failHtml(); titleEl.hidden = false; return; }
    phase = 'title'; showTitle(); opts.loading?.close(); raf = requestAnimationFrame(frame);
    if (import.meta.env.DEV) {
      const dbg = { get core() { return core; }, get city() { return city; }, get player() { return player; }, get cam() { return camera; }, get phase() { return phase; }, layout, start: (a: string) => titleAction(a), openSpot, syncCity, atmo: () => atmo, renderer: () => renderer, info: () => ({ calls: renderer?.info.render.calls, tris: renderer?.info.render.triangles, geos: renderer?.info.memory.geometries }), hud: hudEl, closeModal, openModal: (k: string) => openModal({ kind: k } as Modal) };
      (window as unknown as { __ty: typeof dbg }).__ty = dbg;
    }
  })();
  void WORLD_HALF;
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
