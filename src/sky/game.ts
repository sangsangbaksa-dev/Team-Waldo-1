// SKY WAR — 전투기 공중전. 터치패드 우선 조작: 커서 위치가 곧 조종간(클릭 없이 조종), 자동 조준·자동 사격.
import * as THREE from 'three';
import '../shared/ui.css';
import './sky.css';
import { SkySim, DIFFS, forward, GUN_RANGE, LOCK_TIME, MAX_SPEED, MIN_SPEED, terrainY, type Difficulty, type Input, type Jet } from './sim';
import { SkyView } from './view';
import { SkyAudio } from './audio';
import { readSkyRecords, recordSkyRun } from './records';
import { readPreferences, writeSound } from '../prefs';
import type { LoadingScreen } from '../loading';
import { drawIcon, svgIcon } from './art';
import { AdaptiveQuality } from '../shared/adaptive';
import { advanceSkyQualityRecovery } from './quality';
import { planSkyFrame } from './timing';

const clamp = THREE.MathUtils.clamp;
const AIM_CONE = Math.cos(THREE.MathUtils.degToRad(5)), ASSIST_CONE = Math.cos(THREE.MathUtils.degToRad(9));

export function openSky(onExit: () => void, opts: { loading?: LoadingScreen } = {}): void {
  const scratch = new THREE.Vector3(), inverse = new THREE.Quaternion(), cameraLook = new THREE.Vector2();
  const prefs = readPreferences(); const audio = new SkyAudio(); audio.setEnabled(prefs.sound);
  const root = document.createElement('div'); root.className = 'sk-root';
  root.innerHTML = `<canvas class="sk-canvas"></canvas><canvas class="sk-ov"></canvas>
  <div class="sk-hud" hidden>
    <div class="sk-top"><div class="sk-score"><b id="sk-score">0</b><span id="sk-combo"></span></div><div class="sk-wave" id="sk-wave"></div><div class="sk-status" id="sk-status"></div></div>
    <div class="sk-bars"><div class="sk-brow">${svgIcon('hp')}<span class="sk-bl">기체</span><div class="sk-bar hp"><i id="sk-hp"></i></div></div><div class="sk-brow">${svgIcon('heat')}<span class="sk-bl">열</span><div class="sk-bar heat"><i id="sk-heat"></i></div></div><div class="sk-brow">${svgIcon('fuel')}<span class="sk-bl">연료</span><div class="sk-bar fuel"><i id="sk-fuel"></i></div></div></div>
    <div class="sk-gauges"><div>${svgIcon('speed')}속도 <b id="sk-spd">0</b></div><div>${svgIcon('alt')}고도 <b id="sk-alt">0</b></div><div>${svgIcon('missile')}미사일 <b id="sk-mis">0</b></div><div class="thr"><i id="sk-thr"></i></div></div>
    <div class="sk-alert" id="sk-alert"></div><div class="sk-banner" id="sk-banner"></div>
    <div class="sk-btns"><button id="sk-b-fire">${svgIcon('gun')}<span>기관포</span></button><button id="sk-b-mis">${svgIcon('missile')}<span>미사일</span></button><button id="sk-b-flare">${svgIcon('flare')}<span>플레어</span></button><button id="sk-b-boost">${svgIcon('boost')}<span>부스트</span></button></div>
    <button class="sk-pause" id="sk-pause" aria-label="일시정지">Ⅱ</button><button class="sk-camera" id="sk-camera" aria-label="조종석 시점으로 전환">${svgIcon('camera')}<span>시점</span></button><div class="sk-hint" id="sk-hint"></div>
  </div>
  <div class="sk-modal wd-screen" id="sk-title"><div class="sk-card wd-panel">
    <div class="sk-brand"><span class="sk-eyebrow wd-eyebrow">AIR COMBAT / ENDLESS WAVES</span><h1 class="wd-title">SKY WAR</h1></div><p class="sub wd-lead">하늘을 누비며 새로운 기록에 도전하세요.</p>
    <div class="wd-field"><div class="sk-section-label wd-label">난이도</div><div class="sk-diff wd-seg" id="sk-diff"></div></div>
    <div class="wd-field"><div class="sk-section-label wd-label">설정</div><div class="sk-ctl" id="sk-ctl"><label>조준 보조 <button data-k="assist"></button></label><label>감도 <button data-k="sens"></button></label><label>상하 <button data-k="inv"></button></label><label>커서 방식 <button data-k="lock"></button></label></div></div>
    <details class="sk-help" open><summary>조작 방법 보기</summary><ul class="sk-how"><li><b>커서/손가락 위치</b>로 조종 — 클릭 없이 움직이면 기체가 따라갑니다 (화면 가운데 = 직진). 커서 방식에서 잠금을 켜면 상대 이동으로 조종합니다.</li>
    <li><b>두 손가락 스크롤</b> = 스로틀 · <b>탭/클릭</b> = 기관포 · <b>두 손가락 탭(우클릭)</b> = 미사일</li>
    <li><b>조준 보조</b>는 위 설정에서 조절 (끔=직접 조준, 약=조준 끌어줌, 강=조준원 안의 적에게 자동 사격 · T로 자동 사격 토글) · 청록색 LEAD 표식을 향해 조준하세요 · 적을 가운데 두면 락온 후 미사일 발사</li>
    <li>키보드: WASD/방향키 · Q/E 러더 · C 조종석 시점 · Shift 부스트 · Ctrl 감속 · Space 기관포 · M 미사일 · F 플레어 · P 일시정지</li></ul></details>
    <div class="sk-record"><span class="sk-section-label">FLIGHT RECORD</span><div class="sk-rec" id="sk-rec"></div></div>
    <div class="sk-row wd-actions"><button class="wd-btn primary" id="sk-start">시작</button><button class="wd-btn ghost" id="sk-quit">게임 목록으로</button></div>
  </div></div>
  <div class="sk-modal sk-result wd-screen" id="sk-end" hidden><div class="sk-card wd-panel"><div class="wd-eyebrow">MISSION REPORT</div><h2 class="wd-title" id="sk-end-t"></h2><div id="sk-end-s"></div><div class="sk-row wd-actions"><button class="wd-btn primary" id="sk-again">다시 시작</button><button class="wd-btn ghost" id="sk-quit2">게임 목록으로</button></div></div></div>
  <div class="sk-modal sk-pause-modal wd-screen" id="sk-paused" hidden><div class="sk-card wd-panel"><div class="wd-eyebrow">FLIGHT SUSPENDED</div><h2 class="wd-title">일시정지</h2><p class="wd-lead">잠시 쉬어가세요.</p><div class="sk-row wd-actions"><button class="wd-btn primary" id="sk-resume">이어하기</button><button class="wd-btn ghost" id="sk-snd">소리 켜짐</button><button class="wd-btn" id="sk-restart">다시 시작</button><button class="wd-btn ghost" id="sk-quit3">게임 목록으로</button></div></div></div>`;
  document.body.appendChild(root);
  // Compact devices should show the launch button before the optional long controls guide.
  const help = root.querySelector<HTMLDetailsElement>('.sk-help');
  if (help && matchMedia('(max-width:600px)').matches) help.open = false;
  // HUD elements live for the whole sortie; caching avoids dozens of
  // querySelector traversals per frame and gives an immediate error on bad IDs.
  const elementCache = new Map<string, HTMLElement>();
  const $ = <T extends HTMLElement>(id: string): T => {
    let element = elementCache.get(id);
    if (!element) {
      element = root.querySelector<HTMLElement>('#' + id) ?? undefined;
      if (!element) throw new Error(`SKY WAR UI missing #${id}`);
      elementCache.set(id, element);
    }
    return element as T;
  };
  const canvas = root.querySelector<HTMLCanvasElement>('.sk-canvas')!, ov = root.querySelector<HTMLCanvasElement>('.sk-ov')!, octx = ov.getContext('2d')!;

  let adaptive: AdaptiveQuality | null = null; let stableQualitySeconds = 0;
  let titlePreviewRendered = false;
  let renderer: THREE.WebGLRenderer | null = null; let view: SkyView | null = null; let sim: SkySim | null = null;
  let diff: Difficulty = DIFFS[1]!; let state: 'title' | 'play' | 'paused' | 'over' = 'title'; let closed = false; let raf = 0; let last = 0; let saved = false;
  let mTap = false, fireTap = 0, hitT = 0, hitBy = 0, mBoost = false, bannerT = 0, alertT = 0, alertRank = 0, flare = false, mFire = false, mMissile = false, autoFire = false, throttle = 0.55, hintT = 8, cockpit = false;
  // 조작 설정(저장): 기본은 위치 기반 터치패드/마우스 조종, 필요하면 상대 이동 포인터 잠금 사용.
  const CTL_KEY = 'waldo-sky-ctl'; const ctl = { assist: 2, sens: 1, inv: false, pointerLock: false };
  try {
    const stored = JSON.parse(localStorage.getItem(CTL_KEY) || '{}') as Partial<typeof ctl> | null;
    if (stored && typeof stored === 'object') {
      if (typeof stored.assist === 'number' && Number.isInteger(stored.assist) && stored.assist >= 0 && stored.assist <= 2) ctl.assist = stored.assist;
      if (typeof stored.sens === 'number' && Number.isFinite(stored.sens)) ctl.sens = clamp(stored.sens, 0.6, 1.6);
      if (typeof stored.inv === 'boolean') ctl.inv = stored.inv;
      if (typeof stored.pointerLock === 'boolean') ctl.pointerLock = stored.pointerLock;
    }
  } catch { /* 잘못된 설정값은 기본값으로 복구 */ }
  const saveCtl = (): void => { try { localStorage.setItem(CTL_KEY, JSON.stringify(ctl)); } catch { /* 저장 실패 무시 */ } };
  autoFire = ctl.assist >= 2;
  const mouse = { x: 0, y: 0, active: false, touchId: -1, ox: 0, oy: 0,
    touchAt: 0, touchDragged: false, secondId: -1, secondOx: 0, secondOy: 0, secondAt: 0, secondDragged: false }; const keys = new Set<string>();

  // ── 입력 ─────────────────────────────────────────
  const steerFrom = (cx: number, cy: number, w: number, h: number): void => { // 화면 중심(또는 터치 시작점) 기준 -1..1
    const sx = Math.min(w, h * 1.4) * 0.34, sy = h * 0.32; mouse.x = clamp((cx - w / 2) / sx, -1, 1); mouse.y = clamp((cy - h / 2) / sy, -1, 1); mouse.active = true;
  };
  const onMove = (e: PointerEvent): void => {
    if (state !== 'play') return;
    if (e.pointerType === 'touch') {
      if (e.pointerId === mouse.secondId) {
        if (Math.hypot(e.clientX - mouse.secondOx, e.clientY - mouse.secondOy) > 16) mouse.secondDragged = true;
        return;
      }
      if (e.pointerId !== mouse.touchId) return;
      if (Math.hypot(e.clientX - mouse.ox, e.clientY - mouse.oy) > 16) mouse.touchDragged = true;
      mouse.x = clamp((e.clientX - mouse.ox) / 90, -1, 1);
      mouse.y = clamp((e.clientY - mouse.oy) / 90, -1, 1); mouse.active = true;
    }
    else if (locked) { const sx = Math.min(innerWidth, innerHeight * 1.4) * 0.34, sy = innerHeight * 0.32; mouse.x = clamp(mouse.x + e.movementX / sx, -1, 1); mouse.y = clamp(mouse.y + e.movementY / sy, -1, 1); mouse.active = true; }
    else steerFrom(e.clientX, e.clientY, innerWidth, innerHeight);
  };
  // 마우스는 화면 중앙에 고정(포인터 잠금): 움직임을 누적해 조종 입력으로 씁니다.
  let locked = false, lockLostAt = -Infinity;
  const lock = (): void => { if (!ctl.pointerLock || matchMedia('(pointer: coarse)').matches || document.pointerLockElement === canvas) return; try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => { /* 거절되면 기존 커서 조종 */ }); } catch { /* 미지원이면 기존 커서 조종 */ } };
  const unlock = (): void => { if (document.pointerLockElement) document.exitPointerLock(); };
  const onLock = (): void => {
    const wasLocked = locked;
    locked = document.pointerLockElement === canvas;
    // Ignore spurious lockchange events when no pointer lock was held.
    if (wasLocked && !locked && state === 'play') {
      lockLostAt = performance.now();
      togglePause();
    }
  };
  const onDown = (e: PointerEvent): void => {
    if (state !== 'play' || (e.target as HTMLElement).closest('button')) return; audio.unlock(); if (e.pointerType !== 'touch') lock();
    if (e.pointerType === 'touch') {
      if (mouse.touchId < 0) {
        mouse.touchId = e.pointerId; mouse.ox = e.clientX; mouse.oy = e.clientY;
        mouse.touchAt = performance.now(); mouse.touchDragged = false; mouse.x = mouse.y = 0;
      } else if (mouse.secondId < 0 && e.pointerId !== mouse.touchId) {
        // 두 손가락 탭은 미사일: 첫 손가락의 기관포 탭을 중복 발사하지 않습니다.
        mouse.secondId = e.pointerId; mouse.secondOx = e.clientX; mouse.secondOy = e.clientY;
        mouse.secondAt = performance.now(); mouse.secondDragged = false; mouse.touchDragged = true;
      }
      return;
    }
    if (e.button === 2) { mMissile = true; mTap = true; }
    else { mFire = true; fireTap = 0.14; }
  };
  const onUp = (e: PointerEvent): void => {
    // Pointer cancellation doesn't identify which mouse button was held in
    // every browser; release both weapons so a lost right-click cannot stick.
    if (e.type === 'pointercancel' && e.pointerType !== 'touch') {
      mFire = mMissile = mTap = false; fireTap = 0; return;
    }
    // A delayed release after opening the pause modal must not queue a shot.
    if (state !== 'play') return;
    if (e.pointerType === 'touch') {
      if (e.pointerId === mouse.secondId) {
        if (e.type === 'pointerup' && !mouse.secondDragged && performance.now() - mouse.secondAt < 400) mTap = true;
        mouse.secondId = -1;
      } else if (e.pointerId === mouse.touchId) {
        if (e.type === 'pointerup' && !mouse.touchDragged && performance.now() - mouse.touchAt < 400) fireTap = 0.14;
        mouse.touchId = -1; mouse.x = mouse.y = 0;
      }
    } else if (e.button === 2) mMissile = false; else mFire = false;
  };
  const onWheel = (e: WheelEvent): void => {
    if (state !== 'play') return;
    e.preventDefault();
    if (e.ctrlKey) return; // 터치패드 확대/축소 제스처는 스로틀을 건드리지 않음
    const deltaPx = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    throttle = clamp(throttle - deltaPx * 0.0016, 0, 1);
  }; // 두 손가락 스크롤/휠: 브라우저별 deltaMode 차이를 보정
  function toggleCockpit(): void {
    if (state !== 'play') return;
    cockpit = !cockpit;
    root.classList.toggle('cockpit', cockpit);
    view?.setCockpit(cockpit);
    const cameraButton = $<HTMLButtonElement>('sk-camera');
    cameraButton.setAttribute('aria-label', cockpit ? '3인칭 시점으로 전환' : '조종석 시점으로 전환');
    cameraButton.setAttribute('aria-pressed', String(cockpit));
    hint(cockpit ? '조종석 시점' : '3인칭 시점');
  }
  const onKey = (e: KeyboardEvent, down: boolean): void => {
    const k = e.key.toLowerCase();
    // Escape is also the browser's pointer-lock exit key. Leave that action
    // to pointerlockchange, otherwise one press can pause and immediately resume.
    if (down && k === 'escape' && locked) return;
    if (down && (k === 'escape' || k === 'p')) {
      e.preventDefault();
      if (!e.repeat && !(k === 'escape' && performance.now() - lockLostAt < 250)) togglePause();
      return;
    }
    if (!down) { keys.delete(k); if (k === 'm') mMissile = false; return; }
    if (state !== 'play') return;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (down) { keys.add(k); audio.unlock(); if (e.repeat) return; if (k === ' ') fireTap = 0.14; if (k === 't') { autoFire = !autoFire; hint(autoFire ? '자동 사격 ON' : '자동 사격 OFF'); } if (k === 'f') flare = true; if (k === 'c') toggleCockpit(); if (k === 'm') { mMissile = true; mTap = true; } }
    else { keys.delete(k); if (k === 'm') mMissile = false; }
  };
  const kd = (e: KeyboardEvent): void => onKey(e, true), ku = (e: KeyboardEvent): void => onKey(e, false);
  const noMenu = (e: Event): void => e.preventDefault();
  // Window blur, tab hiding and pause must all release held controls. Otherwise
  // lost keyup/pointerup events can leave the jet turning, firing or boosting on resume.
  const clearHeldInput = (): void => {
    keys.clear(); mouse.touchId = mouse.secondId = -1;
    mouse.x = mouse.y = 0; mouse.active = false;
    mouse.touchDragged = mouse.secondDragged = false;
    fireTap = 0; mTap = mFire = mMissile = mBoost = flare = false;
  };
  const onBlur = (): void => { clearHeldInput(); if (state === 'play') togglePause(); };
  addEventListener('blur', onBlur);
  const onVis = (): void => { if (document.hidden) onBlur(); };
  document.addEventListener('visibilitychange', onVis);
  addEventListener('pointermove', onMove); addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp); document.addEventListener('pointerlockchange', onLock);
  root.addEventListener('wheel', onWheel, { passive: false }); addEventListener('keydown', kd); addEventListener('keyup', ku); root.addEventListener('contextmenu', noMenu);

  function readInput(p: Jet, dt: number): Input {
    let pitch = 0, roll = 0;
    const dead = (v: number): number => { const a = Math.abs(v); return a < 0.06 ? 0 : Math.sign(v) * Math.pow((a - 0.06) / 0.94, 1.25); }; // 데드존+곡선: 작은 움직임은 부드럽게
    if (mouse.active) { roll = dead(mouse.x) * ctl.sens; pitch = -dead(mouse.y) * ctl.sens * (ctl.inv ? -1 : 1); }
    const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0), ky = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    if (kx) roll = kx; if (ky) pitch = ky * (ctl.inv ? -1 : 1);
    const yawIn = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
    if (keys.has('control')) throttle = Math.max(0, throttle - 0.6 * dt);
    // 조준 보조: 적이 조준원 안에 들면 조종간을 살짝 적쪽으로 끌어줍니다(터치패드 미세조준 보완)
    const t = ctl.assist > 0 ? sim!.bestTarget(p, ASSIST_CONE, GUN_RANGE) : null; const pull = ctl.assist >= 2 ? 0.3 : 0.1;
    if (t) {
      const lead = sim!.leadPoint(p, t, p.speed + 680, scratch); const l = lead.sub(p.pos).normalize().applyQuaternion(inverse.copy(p.q).invert());
      roll += clamp(l.x * 2.2, -pull, pull); pitch += clamp(l.y * 2.2, -pull, pull);
    }
    // 자동 사격: 조준원에 들어오면 발사(클릭/스페이스는 수동)
    const onTarget = !!sim!.bestTarget(p, AIM_CONE, GUN_RANGE * 0.95);
    return { yaw: yawIn, pitch: clamp(pitch, -1, 1), roll: clamp(roll, -1, 1), throttle, fire: fireTap > 0 || mFire || keys.has(' ') || (autoFire && onTarget), missile: mMissile || mTap, flare, boost: keys.has('shift') || keys.has('b') || mBoost };
  }

  // ── HUD ──────────────────────────────────────────
  function hint(t: string): void { const el = $('sk-hint'); el.textContent = t; hintT = 3; }
  function banner(t: string, sec = 2.2): void { const el = $('sk-banner'); el.textContent = t; el.classList.add('on'); bannerT = sec; }
  /** Safety alerts take precedence over pickups, lock messages and hints.
   * Rank 4: incoming missile; 3: collision/stall; 2: combat; 1: information. */
  function alertMsg(t: string, sec = 1, rank = 1): void {
    if (alertT > 0 && rank < alertRank) return;
    const el = $('sk-alert');
    el.textContent = t;
    el.dataset.level = rank >= 3 ? 'danger' : rank === 2 ? 'combat' : 'info';
    alertT = sec; alertRank = rank;
  }
  const html = new WeakMap<HTMLElement, string>(); const setHtml = (el: HTMLElement, v: string): void => { if (html.get(el) !== v) { html.set(el, v); el.innerHTML = v; } };
  // SVG strings never change between frames. Reuse them instead of creating
  // markup at 60 fps when only the player's missile count changes.
  const missileIcon = svgIcon('missile', 'sk-ic mini');
  const shieldIcon = svgIcon('shield'), boltIcon = svgIcon('bolt');
  const setText = (id: string, value: string): void => {
    const el = $(id);
    if (el.textContent !== value) el.textContent = value;
  };
  const setPercent = (id: string, value: number): void => {
    const el = $(id), width = `${Math.round(clamp(value, 0, 100))}%`;
    if (el.style.width !== width) el.style.width = width;
  };
  function hud(p: Jet, dt: number): void {
    setText('sk-score', String(sim!.score)); setText('sk-combo', sim!.combo > 1 ? ` ×${sim!.combo}` : '');
    setText('sk-wave', `WAVE ${Math.max(1, sim!.wave)} · 적 ${sim!.enemies().length}`);
    setPercent('sk-hp', p.hp / p.maxHp * 100); $('sk-hp').parentElement!.classList.toggle('low', p.hp < 30);
    setPercent('sk-heat', p.heat / 1.2 * 100); $('sk-heat').parentElement!.classList.toggle('hot', p.heat > 0.9);
    setText('sk-spd', String(Math.round(p.speed * 3.6)) + ' · ' + p.g.toFixed(1) + 'G'); setText('sk-alt', String(Math.round(p.pos.y))); setHtml($('sk-mis'), p.missiles > 0 ? missileIcon.repeat(Math.min(p.missiles, 12)) : '—');
    setHtml($('sk-status'), [sim!.shield > 0 ? `${shieldIcon}${Math.ceil(sim!.shield)}` : '', sim!.overdrive > 0 ? `${boltIcon}${sim!.overdrive.toFixed(1)}s` : ''].filter(Boolean).join(' '));
    setPercent('sk-fuel', p.fuel * 100);
    setPercent('sk-thr', throttle * 100);
    // Flare cooldown is visible instead of silently ignoring repeated touch input.
    const flareButton = $<HTMLButtonElement>('sk-b-flare');
    const flareReady = p.flare <= 0;
    flareButton.disabled = !flareReady;
    flareButton.classList.toggle('cooldown', !flareReady);
    const flareText = flareReady ? '플레어' : `${Math.ceil(p.flare)}초`;
    const flareSpan = flareButton.querySelector('span')!;
    if (flareSpan.textContent !== flareText) flareSpan.textContent = flareText;
    const flareLabel = flareReady ? '플레어 사용 가능' : `플레어 재사용까지 ${Math.ceil(p.flare)}초`;
    if (flareButton.getAttribute('aria-label') !== flareLabel) flareButton.setAttribute('aria-label', flareLabel);
    if (alertT > 0) {
      alertT -= dt;
      if (alertT <= 0) { $('sk-alert').textContent = ''; alertRank = 0; }
    }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('sk-banner').classList.remove('on'); }
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('sk-hint').textContent = ''; }
  }
  function overlay(p: Jet): void {
    const w = ov.width, h = ov.height, dpr = w / innerWidth; octx.clearRect(0, 0, w, h); octx.save(); octx.scale(dpr, dpr);
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2;
    // 기수 조준원 + 조종 커서
    octx.strokeStyle = 'rgba(160,255,200,.85)'; octx.lineWidth = 1.6; octx.beginPath(); octx.arc(cx, cy, 20, 0, 7); octx.moveTo(cx - 34, cy); octx.lineTo(cx - 12, cy); octx.moveTo(cx + 12, cy); octx.lineTo(cx + 34, cy); octx.stroke();
    { // 인공 수평선 + 피치 눈금(기체 롤/피치 반영)
      const pitchPx = H / 1.3; octx.save(); octx.translate(cx, cy); octx.rotate(p.roll); octx.strokeStyle = 'rgba(160,255,200,.35)'; octx.fillStyle = 'rgba(160,255,200,.6)'; octx.lineWidth = 1.2; octx.font = '600 10px system-ui';
      for (let d = -30; d <= 30; d += 10) { const y = (p.pitch - d * Math.PI / 180) * pitchPx; if (Math.abs(y) > H * 0.4) continue; const half = d === 0 ? 110 : 44; octx.beginPath(); octx.moveTo(-half, y); octx.lineTo(-18, y); octx.moveTo(18, y); octx.lineTo(half, y); octx.stroke(); if (d !== 0) { octx.fillText(String(Math.abs(d)), half + 6, y + 3); } }
      octx.restore();
    }
    if (mouse.active) { const sx = Math.min(W, H * 1.4) * 0.34, sy = H * 0.32, px = mouse.touchId >= 0 ? mouse.ox + mouse.x * 90 : cx + mouse.x * sx, py = mouse.touchId >= 0 ? mouse.oy + mouse.y * 90 : cy + mouse.y * sy; octx.fillStyle = 'rgba(255,255,255,.75)'; octx.beginPath(); octx.arc(px, py, 5, 0, 7); octx.fill(); octx.strokeStyle = 'rgba(255,255,255,.2)'; octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(px, py); octx.stroke(); }
    // 이동 목표의 예측 선행 조준점: 자동 사격을 끄더라도 직접 맞힐 수 있게 안내합니다.
    const leadTarget = sim!.bestTarget(p, ASSIST_CONE, GUN_RANGE);
    if (leadTarget) {
      const lead = sim!.leadPoint(p, leadTarget, p.speed + 680, scratch);
      const s = view!.project(lead);
      if (!s.behind && s.x > 0.04 && s.x < 0.96 && s.y > 0.04 && s.y < 0.96) {
        const lx = s.x * W, ly = s.y * H;
        octx.save(); octx.strokeStyle = 'rgba(120,255,218,.78)'; octx.fillStyle = 'rgba(120,255,218,.9)';
        octx.lineWidth = 1.3; octx.setLineDash([4, 4]); octx.beginPath(); octx.arc(lx, ly, 12, 0, Math.PI * 2); octx.stroke();
        octx.setLineDash([]); octx.font = '600 10px system-ui'; octx.fillText('LEAD', lx + 16, ly - 10);
        octx.restore();
      }
    }
    // 적 표시
    for (const e of sim!.jets) {
      if (!e.alive || e.team !== 'enemy') continue; const d = e.pos.distanceTo(p.pos); const s = view!.project(e.pos);
      const locked = p.lockId === e.id; const col = locked ? (p.lockT >= LOCK_TIME ? '#ff3b3b' : '#ffd23f') : '#ff8a6a';
      if (!s.behind && s.x > 0.02 && s.x < 0.98 && s.y > 0.02 && s.y < 0.98) {
        const x = s.x * W, y = s.y * H, r = clamp(900 / d * 14, 12, 34); octx.strokeStyle = col; octx.lineWidth = locked ? 2.6 : 1.6;
        octx.beginPath(); octx.moveTo(x - r, y - r + 7); octx.lineTo(x - r, y - r); octx.lineTo(x - r + 7, y - r); octx.moveTo(x + r - 7, y - r); octx.lineTo(x + r, y - r); octx.lineTo(x + r, y - r + 7); octx.moveTo(x - r, y + r - 7); octx.lineTo(x - r, y + r); octx.lineTo(x - r + 7, y + r); octx.moveTo(x + r - 7, y + r); octx.lineTo(x + r, y + r); octx.lineTo(x + r, y + r - 7); octx.stroke();
        octx.fillStyle = col; octx.font = '600 11px system-ui'; octx.fillText(`${Math.round(d)}m`, x + r + 4, y + 4);
        if (locked) { octx.fillRect(x - r, y + r + 5, 2 * r * Math.min(1, p.lockT / LOCK_TIME), 3); }
        octx.fillStyle = 'rgba(255,60,60,.8)'; octx.fillRect(x - r, y - r - 8, 2 * r * e.hp / e.maxHp, 3);
      } else { // 화면 밖 → 가장자리 화살표
        const a = Math.atan2(s.y - 0.5, s.x - 0.5) + (s.behind ? Math.PI : 0), rr = Math.min(W, H) * 0.42, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        octx.save(); octx.translate(x, y); octx.rotate(a); octx.fillStyle = 'rgba(255,120,80,.85)'; octx.beginPath(); octx.moveTo(12, 0); octx.lineTo(-8, -8); octx.lineTo(-8, 8); octx.fill(); octx.restore();
      }
    }
    // Incoming missile positions remain visible even when they approach from behind.
    const threats = sim!.missiles.filter(m => m.alive && m.target === p.id)
      .sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos)).slice(0, 3);
    for (const missile of threats) {
      const distance = missile.pos.distanceTo(p.pos);
      if (distance > 1500) continue;
      const s = view!.project(missile.pos);
      const onscreen = !s.behind && s.x > 0.08 && s.x < 0.92 && s.y > 0.08 && s.y < 0.92;
      const pulse = prefs.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(performance.now() / 100);
      octx.save(); octx.strokeStyle = `rgba(255,95,75,${pulse})`; octx.fillStyle = '#ffbaa6'; octx.lineWidth = 2;
      if (onscreen) {
        const x = s.x * W, y = s.y * H;
        octx.beginPath(); octx.arc(x, y, 19, -Math.PI / 2, Math.PI * 1.5); octx.stroke();
        octx.beginPath(); octx.moveTo(x - 29, y); octx.lineTo(x - 16, y);
        octx.moveTo(x + 16, y); octx.lineTo(x + 29, y); octx.stroke();
        octx.font = 'bold 10px system-ui'; octx.fillText(`MISSILE ${Math.round(distance)}m`, x + 24, y - 20);
      } else {
        const angle = Math.atan2(s.y - 0.5, s.x - 0.5) + (s.behind ? Math.PI : 0);
        const radius = Math.min(W, H) * 0.32;
        octx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); octx.rotate(angle);
        octx.beginPath(); octx.moveTo(20, 0); octx.lineTo(-5, -13); octx.lineTo(-5, 13); octx.closePath(); octx.fill();
        octx.fillStyle = '#3e0b0b'; octx.font = 'bold 13px system-ui'; octx.fillText('!', 0, 4);
      }
      octx.restore();
    }
    for (const k of sim!.pickups) { const s = view!.project(k.pos); if (s.behind || s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1) continue; octx.strokeStyle = k.kind === 'repair' ? '#5dff8f' : k.kind === 'shield' ? '#ffe27a' : '#6ab8ff'; octx.lineWidth = 2; octx.beginPath(); octx.arc(s.x * W, s.y * H, 14 + (prefs.reducedMotion ? 0 : 3 * Math.sin(performance.now() / 150)), 0, 7); octx.stroke(); octx.fillStyle = octx.strokeStyle; drawIcon(octx, k.kind === 'repair' ? 'hp' : k.kind === 'shield' ? 'shield' : 'missile', s.x * W, s.y * H, 15); }
    // 레이더(내 기수가 위쪽)
    const landscapeTouch = W > H && H <= 560 && matchMedia('(pointer:coarse)').matches;
    const R = landscapeTouch ? 43 : 58, rx = W - R - 16, ry = landscapeTouch ? H * 0.52 : H - R - 16; octx.fillStyle = 'rgba(8,30,20,.55)'; octx.strokeStyle = 'rgba(120,255,180,.5)'; octx.lineWidth = 1.4; octx.beginPath(); octx.arc(rx, ry, R, 0, 7); octx.fill(); octx.stroke(); octx.beginPath(); octx.arc(rx, ry, R / 2, 0, 7); octx.stroke();
    { const sw = prefs.reducedMotion ? 0 : performance.now() / 900 % (Math.PI * 2), g = octx.createRadialGradient(rx, ry, 0, rx, ry, R); g.addColorStop(0, 'rgba(120,255,180,0)'); g.addColorStop(1, 'rgba(120,255,180,.28)'); // 레이더 소인선 + 십자선
      octx.save(); octx.beginPath(); octx.arc(rx, ry, R, 0, 7); octx.clip(); octx.fillStyle = g; octx.beginPath(); octx.moveTo(rx, ry); octx.arc(rx, ry, R, sw - 0.7, sw); octx.closePath(); octx.fill(); octx.restore();
      octx.strokeStyle = 'rgba(120,255,180,.25)'; octx.beginPath(); octx.moveTo(rx - R, ry); octx.lineTo(rx + R, ry); octx.moveTo(rx, ry - R); octx.lineTo(rx, ry + R); octx.stroke(); octx.strokeStyle = 'rgba(120,255,180,.5)'; }
    const yaw = p.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw), range = 2400;
    for (const j of sim!.jets) { if (!j.alive || j === p) continue; const dx = j.pos.x - p.pos.x, dz = j.pos.z - p.pos.z; const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; // 로컬 x(오른쪽), z(뒤쪽)
      const k = R / range; let px = lx * k, py = lz * k; const m = Math.hypot(px, py); if (m > R - 3) { px *= (R - 3) / m; py *= (R - 3) / m; }
      octx.fillStyle = j.kind === 'ace' ? '#ffd23f' : '#ff5a4a'; octx.shadowColor = octx.fillStyle; octx.shadowBlur = 6; octx.beginPath(); octx.moveTo(rx + px, ry + py - 4); octx.lineTo(rx + px + 3.5, ry + py); octx.lineTo(rx + px, ry + py + 4); octx.lineTo(rx + px - 3.5, ry + py); octx.fill(); octx.shadowBlur = 0; }
    octx.fillStyle = '#9dffc4'; octx.beginPath(); octx.moveTo(rx, ry - 6); octx.lineTo(rx - 4, ry + 4); octx.lineTo(rx + 4, ry + 4); octx.fill();
    if (hitT > 0) { // 피격 표시: 화면 가장자리 붉은 번쩍임 + 공격자 방향 쐐기
      const a = hitT, g = octx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.7); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,40,30,${0.55 * a})`); octx.fillStyle = g; octx.fillRect(0, 0, W, H);
      const att = hitBy ? sim!.get(hitBy) : undefined; if (att && att.alive) {
        const s = view!.project(att.pos), ang = Math.atan2(s.y - 0.5, s.x - 0.5) + (s.behind ? Math.PI : 0), rr = Math.min(W, H) * 0.34;
        octx.save(); octx.translate(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); octx.rotate(ang); octx.globalAlpha = Math.min(1, a * 1.6); octx.fillStyle = '#ff4a3a'; octx.shadowColor = '#ff2a1a'; octx.shadowBlur = 14;
        octx.beginPath(); octx.moveTo(26, 0); octx.lineTo(-10, -17); octx.lineTo(-2, 0); octx.lineTo(-10, 17); octx.closePath(); octx.fill(); octx.restore();
      }
    }
    // 위험 테두리
    const dng = Math.max(p.hp < 30 ? 0.6 : 0, sim!.missiles.some(m => m.target === p.id) ? 0.8 : 0); if (dng > 0) { const g = octx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,30,${dng * (prefs.reducedMotion ? 0.35 : 0.35 + 0.25 * Math.sin(performance.now() / 90))})`); octx.fillStyle = g; octx.fillRect(0, 0, W, H); }
    octx.restore();
  }

  // ── 흐름 ─────────────────────────────────────────
  function resize(): void {
    if (!renderer || !view) return; const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    renderer.setSize(w, h, false); view.resize(w, h); ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); ov.style.width = w + 'px'; ov.style.height = h + 'px';
  }
  /** A menu/pause can last minutes; keep the selected quality without letting
   * the first gameplay frame count as a slow 250+ ms rendering frame. */
  function resetQualityClock(): void {
    stableQualitySeconds = 0;
    if (!adaptive || !renderer) return;
    const pr = adaptive.pr, level = adaptive.level;
    const maxPr = Math.min(prefs.quality === 'high' ? 2 : prefs.quality === 'standard' ? 1.5 : 1, devicePixelRatio || 1);
    adaptive = new AdaptiveQuality({
      max: maxPr, start: pr,
      setPixelRatio: next => { renderer?.setPixelRatio(next); resize(); },
      setLevel: next => view?.setLevel(next),
    });
    adaptive.level = level;
  }
  function start(d: Difficulty): void {
    // 일시정지 화면에서 재출격할 때도 이미 달성한 기록을 잃지 않습니다.
    if (state === 'paused' && sim && !saved && sim.time > 5) {
      recordSkyRun(sim.score, sim.wave, sim.kills, sim.bestCombo, sim.time);
      paintRec();
    }
    audio.pause(false); resetQualityClock(); last = performance.now();
    diff = d; sim = new SkySim(d); saved = false; state = 'play'; throttle = 0.55; mouse.x = mouse.y = 0; mouse.active = false; fireTap = 0; flare = mTap = mBoost = mFire = mMissile = false; mouse.touchId = mouse.secondId = -1; hitT = 0; hitBy = 0; keys.clear(); bannerT = alertT = alertRank = 0; cockpit = false; root.classList.remove('cockpit'); view?.setCockpit(false); const cameraButton = $<HTMLButtonElement>('sk-camera'); cameraButton.setAttribute('aria-pressed', 'false'); cameraButton.setAttribute('aria-label', '조종석 시점으로 전환'); autoFire = ctl.assist >= 2;
    $('sk-title').hidden = true; $('sk-end').hidden = true; $('sk-paused').hidden = true; $('sk-alert').textContent = ''; $('sk-banner').classList.remove('on'); root.querySelector<HTMLElement>('.sk-hud')!.hidden = false; audio.unlock(); lock(); hint(matchMedia('(pointer: coarse)').matches ? '화면을 드래그해 조종하세요' : ctl.pointerLock ? '상대 이동으로 조종 · Esc: 일시정지' : '커서를 화면 중앙 기준으로 움직여 조종 · P: 일시정지'); banner('출격!', 1.5);
    if (view) {
      view.resetSession();
      view.camera.position.copy(sim.player.pos).add(new THREE.Vector3(0, 10, 40));
      view.camera.up.set(0, 1, 0);
      view.camera.lookAt(sim.player.pos.clone().addScaledVector(forward(sim.player, new THREE.Vector3()), 120));
    }
  }
  function togglePause(): void {
    if (state === 'play') {
      clearHeldInput();
      audio.pause(true); state = 'paused'; $('sk-paused').hidden = false; unlock(); stableQualitySeconds = 0;
    } else if (state === 'paused') {
      state = 'play'; $('sk-paused').hidden = true; audio.pause(false); last = performance.now();
      resetQualityClock();
      lock();
    }
  }
  function finish(): void {
    state = 'over'; const prev = readSkyRecords(); if (!saved && sim) { saved = true; recordSkyRun(sim.score, sim.wave, sim.kills, sim.bestCombo, sim.time); }
    unlock(); audio.stopEngine(); audio.play('lose'); paintRec(); const s = sim!, acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0, newBest = s.score > prev.bestScore;
    const cell = (v: string | number, l: string, hi = false): string => `<div class="sk-stat${hi ? ' hi' : ''}"><b>${v}</b><span>${l}</span></div>`;
    $('sk-end-t').textContent = '격추당했습니다';
    $('sk-end-s').innerHTML = (newBest ? '<div class="sk-newrec">NEW RECORD</div>' : '') + `<div class="sk-stats">${cell(s.score, '점수', newBest)}${cell(s.wave, '웨이브')}${cell(s.kills, '격추')}${cell(acc + '%', '명중률')}${cell(Math.floor(s.time) + '초', '생존')}${cell(s.bestCombo > 0 ? '×' + s.bestCombo : '-', '최고 콤보')}</div><div class="sk-best">최고 기록 · 점수 ${Math.max(prev.bestScore, s.score)} · 콤보 ${Math.max(prev.bestCombo, s.bestCombo) > 0 ? '×' + Math.max(prev.bestCombo, s.bestCombo) : '-'} · 생존 ${Math.floor(Math.max(prev.longestTime, s.time))}초</div>`;
    $('sk-end').hidden = false;
  }
  function exit(): void {
    if (closed) return; closed = true; cancelAnimationFrame(raf); if (!saved && sim && sim.time > 5) { saved = true; recordSkyRun(sim.score, sim.wave, sim.kills, sim.bestCombo, sim.time); } delete (window as unknown as { __sky?: unknown }).__sky;
    document.removeEventListener('pointerlockchange', onLock); unlock(); removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVis); removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('resize', resize);
    audio.dispose(); try { view?.dispose(); } catch { /* 정리 실패 무시 */ } renderer?.dispose(); renderer?.forceContextLoss(); root.remove(); onExit();
  }

  // Title/result dialogs have a fully opaque background. Draw once behind
  // the title to warm GPU programs and textures, then stop burning GPU cycles
  // until the pilot starts. Pause freezes the last live frame as before.
  function shouldRenderFrame(): boolean {
    if (state === 'paused' || state === 'over') return false;
    if (state === 'title') {
      if (titlePreviewRendered) return false;
      titlePreviewRendered = true;
    }
    return true;
  }
  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame);
    const frameMs = now - last, plan = planSkyFrame(frameMs);
    const dt = Math.min(0.05, plan.elapsed);
    last = now; if (!renderer || !view || !sim) return;
    if (!shouldRenderFrame()) return;
    if (state === 'play') {
      const p = sim.player;
      const inp = readInput(p, plan.elapsed);
      const tapOnly = fireTap > 0 && !mFire && !keys.has(' ')
        && !(autoFire && sim.bestTarget(p, AIM_CONE, GUN_RANGE * 0.95));
      // A 70–200ms GPU frame must not slow the game's flight clock. Several
      // safe physics ticks catch up; stop if the pilot dies to preserve events.
      // Do not stretch a buffered micro-click through a whole slow frame.
      for (let tick = 0; tick < plan.steps; tick++) {
        const stepInput = tapOnly
          ? { ...inp, fire: tick * plan.stepDt < fireTap }
          : inp;
        sim.step(plan.stepDt, stepInput);
        if (sim.over) break;
      }
      flare = false; mTap = false;
      fireTap = Math.max(0, fireTap - plan.elapsed);
      hitT = Math.max(0, hitT - plan.elapsed);
      for (const ev of sim.events) {
        const mine = (id: number): boolean => id === p.id, dist = (pos: THREE.Vector3): number => pos.distanceTo(p.pos);
        switch (ev.t) {
          case 'gun': audio.play('gun', mine(ev.id) ? 0 : (sim.get(ev.id) ? dist(sim.get(ev.id)!.pos) : 900)); break;
          case 'missile': audio.play('missile', mine(ev.id) ? 0 : 300); break;
          case 'boom': view.boom(ev.pos, ev.big); audio.play('boom', dist(ev.pos)); break;
          case 'hit': { view.spark(ev.pos); if (mine(ev.id)) { audio.play('hurt'); view.kick(0.45); hitT = 1; hitBy = ev.by ?? 0; alertMsg('피격!', 0.7, 3); } else audio.play('hit', dist(ev.pos)); break; }
          case 'kill': if (ev.by === p.id) banner(`격추! +${ev.points ?? 0}점${(ev.combo ?? 0) > 1 ? ` · 콤보 ×${ev.combo}` : ''}${ev.combo === 3 ? ' · 미사일 +1' : ''}`, 1); break;
          case 'nolock': audio.play('lock'); alertMsg('락온 대상 없음 — 적을 조준원에 두세요', 1.2); break; case 'lock': audio.play('lock'); break; case 'lockdone': audio.play('lockdone'); alertMsg('락온 — 미사일 발사!', 1.2, 2); break;
          case 'warn': audio.play('warn'); alertMsg('⚠ 미사일 접근 — 플레어(F)/기동!', 1, 4); break;
          case 'wave': audio.play('wave'); banner(`WAVE ${ev.n}${ev.modifier ? ` · ${ev.modifier}` : ''}`, 2.4); break;
          case 'flare': {
            const plane = sim.get(ev.id);
            if (plane) view.deployFlares(plane.pos, plane.q);
            audio.play('flare');
            alertMsg('플레어 투하', 0.8, 2);
            break;
          }
          case 'pickup': audio.play('wave'); alertMsg(ev.kind === 'repair' ? `수리 +${ev.amount}` : ev.kind === 'shield' ? `방어막 +${ev.amount}` : `미사일 +${ev.amount}`, 1); break;
          case 'boss': banner('BOSS — 중폭격기 접근', 3); audio.play('warn'); break;
          case 'dodge': alertMsg(`아슬아슬 회피! +${ev.points}점 · 방어막 +5 · 콤보 연장`, 1.5, 2); audio.play('lockdone'); break;
          case 'stall': audio.play('warn'); alertMsg('STALL — 기수를 내려 속도 회복!', 1, 3); break;
          case 'overdrive': alertMsg('오버드라이브! 연사 강화 5초', 2, 2); audio.play('win'); break;
          case 'crash': break;
        }
      }
      sim.events.length = 0;
      // 경고
      const gy = terrainY(p.pos.x, p.pos.z), agl = p.pos.y - Math.max(0, gy);
      // 위치 경고는 비긴급 안내이므로 피격·미사일 접근·락온 등 중요한 경고를 덮지 않습니다.
      if (alertT <= 0.1) {
        if (agl < 140 && forward(p, scratch).y < 0.05) alertMsg('PULL UP!', 0.3, 3);
        else if (sim.edge(p) > 0.05) alertMsg('작전 구역 이탈 — 선회하세요!', 0.3);
      }
      // 구역 밖으로 나가면 서서히 기체를 안쪽으로 끌어줌
      if (sim.edge(p) > 0.9) { const toC = scratch.set(-p.pos.x, 0, -p.pos.z).normalize(); const wantYaw = Math.atan2(-toC.x, -toC.z); let dy = wantYaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += clamp(dy, -1, 1) * dt * 0.9; }
      audio.engine(true, throttle); audio.wind((p.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED));
      if (!p.alive) finish();
    }
    // Move the camera first. The sky dome, sea and sun are anchored to its
    // position in sync(); updating them before follow() caused a frame of lag.
    if (state === 'title') {
      const t = now / 4000; view.camera.position.set(Math.cos(t) * 900, 520, Math.sin(t) * 900); view.camera.lookAt(0, 250, 0);
    }
    if (state === 'play' || state === 'over') view.follow(sim.player, dt, cameraLook, clamp((throttle - 0.55) * 2, 0, 1));
    view.sync(sim, plan.elapsed, now / 1000);
    renderer.render(view.scene, view.camera);
    // Adaptive FPS measurements must exclude throttled title/result frames.
    if (state === 'play') adaptive?.tick();
    if (state === 'play' && adaptive) {
      const recovery = advanceSkyQualityRecovery(stableQualitySeconds, frameMs, dt, adaptive.level);
      stableQualitySeconds = recovery.stableSeconds;
      if (recovery.restore) { adaptive.level--; view.setLevel(adaptive.level); }
    } else stableQualitySeconds = 0;
    if (state === 'play') { hud(sim.player, plan.elapsed); overlay(sim.player); } else if (state === 'over') { octx.clearRect(0, 0, ov.width, ov.height); }
  }

  // 난이도/버튼
  const ASSIST_NAMES = ['끔 (직접 조준)', '약', '강 (자동 사격)'];
  const paintCtl = (): void => { root.querySelectorAll<HTMLButtonElement>('#sk-ctl button').forEach(b => { const k = b.dataset.k; b.textContent = k === 'assist' ? ASSIST_NAMES[ctl.assist]! : k === 'sens' ? ctl.sens.toFixed(1) + '×' : k === 'lock' ? (ctl.pointerLock ? '잠금 (상대)' : '자유 (위치)') : (ctl.inv ? '반전' : '기본'); }); };
  root.querySelectorAll<HTMLButtonElement>('#sk-ctl button').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; if (k === 'assist') { ctl.assist = (ctl.assist + 1) % 3; autoFire = ctl.assist >= 2; } else if (k === 'sens') { ctl.sens = ctl.sens >= 1.6 ? 0.6 : Math.round((ctl.sens + 0.2) * 10) / 10; } else if (k === 'lock') ctl.pointerLock = !ctl.pointerLock; else ctl.inv = !ctl.inv;
    saveCtl(); paintCtl();
  })); paintCtl();
  const dEl = $('sk-diff'); let sel = 1;
  DIFFS.forEach((d, i) => { const b = document.createElement('button'); b.textContent = ({ easy: '쉬움', normal: '보통', hard: '어려움' })[d.id]; b.className = i === sel ? 'on' : ''; b.setAttribute('aria-pressed', String(i === sel)); b.onclick = () => { sel = i; dEl.querySelectorAll('button').forEach((x, k) => { x.classList.toggle('on', k === i); x.setAttribute('aria-pressed', String(k === i)); }); }; dEl.appendChild(b); });
  function paintRec(): void { const rec = readSkyRecords(); $('sk-rec').textContent = rec.runs ? `최고 점수 ${rec.bestScore} · 최고 웨이브 ${rec.bestWave} · 누적 격추 ${rec.kills}` : '첫 출격을 기다립니다'; } paintRec();
  $('sk-camera').onclick = toggleCockpit;
  $('sk-start').onclick = () => start(DIFFS[sel]!); $('sk-again').onclick = () => start(DIFFS[sel]!); $('sk-resume').onclick = togglePause; $('sk-restart').onclick = () => start(DIFFS[sel]!); const paintSnd = (): void => { $('sk-snd').textContent = `소리 ${audio.enabled ? '켜짐' : '꺼짐'}`; }; $('sk-snd').onclick = () => { audio.setEnabled(!audio.enabled); writeSound(audio.enabled); paintSnd(); }; paintSnd(); $('sk-pause').onclick = togglePause;
  for (const id of ['sk-quit', 'sk-quit2', 'sk-quit3']) $(id).onclick = exit;
  const hold = (id: string, set: (v: boolean) => void): void => { const b = $(id); b.addEventListener('pointerdown', e => { e.stopPropagation(); audio.unlock(); set(true); b.setPointerCapture(e.pointerId); }); b.addEventListener('pointerup', () => set(false)); b.addEventListener('pointercancel', () => set(false)); b.addEventListener('lostpointercapture', () => set(false)); };
  hold('sk-b-boost', v => { mBoost = v; }); hold('sk-b-fire', v => { mFire = v; if (v) fireTap = 0.14; }); hold('sk-b-mis', v => { mMissile = v; if (v) mTap = true; }); $('sk-b-flare').addEventListener('pointerdown', e => { e.stopPropagation(); flare = true; });
  addEventListener('resize', resize);

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: prefs.quality !== 'low', powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    const maxPr = Math.min(prefs.quality === 'high' ? 2 : prefs.quality === 'standard' ? 1.5 : 1, devicePixelRatio || 1);
    adaptive = new AdaptiveQuality({ max: maxPr, setPixelRatio: pr => { renderer?.setPixelRatio(pr); resize(); }, setLevel: l => view?.setLevel(l) });
    renderer.setPixelRatio(adaptive.pr);
    view = new SkyView(renderer); sim = new SkySim(diff); sim.intermission = 1e9; resize();
  } catch (err) { console.error(err); opts.loading?.close(); exit(); return; }
  opts.loading?.close(); last = performance.now(); raf = requestAnimationFrame(frame);
  (window as unknown as { __sky?: unknown }).__sky = { get sim() { return sim; }, get renderer() { return renderer; }, get view() { return view; }, start };
}
