// LAST CITY — 게임 루프, 입력, HUD
import '../shared/ui.css';
import './city.css';
import { BIZ, BUILD_ORDER, CLASSES, DIFFICULTY, DIFFICULTY_ORDER, FACTIONS, PERKS, RESEARCH, STRUCTS, UNITS, WEAPONS, type ClassId, type Difficulty, type ResearchId, type StructKind, type UnitId, type WeaponId } from './defs';
import { World, type Actor } from './world';
import { Renderer, type Ghost } from './render';
import { Renderer3D } from './render3d';
import { loadModels, type Models } from './models';
import { showLoading, type LoadingScreen } from '../loading';
import { STEPS, TUT_KEY, advance, newCounters, newTutState, type Counters, type TutState } from './tutorial';
import { CityAudio } from './audio';
import { reload, switchWeapon } from './actors';
import { ACTORS, BLOCKS, PITCH, ROAD } from './defs';
import { applyLook, doorFacingYaw, isLookSpike, mapPointerToWorld } from './uiMath';
import { DEMOLISH_REFUND_RATE, snapBuildCoord } from './placement';
import { SHOP, canBuy, itemPrice } from './shop';
import { PHASE_LABEL, WEATHER_ICON, WEATHER_LABEL, clockLabel } from './clock';
import { missionLog, missionSummary, sideJobs } from './missions';
import { EVENT_INFO } from './events';
import { readPreferences, recordMatch, writePreferences } from '../prefs';
import type { PvpSession, RoomSession } from '../net/lobby';
import { arenaInfo, arenaOf } from './arena';
import { CityRoom, ROOM_LIVES, ROOM_TIME, roomRanking, roomWinner } from './room';
import { CityDuel, TARGET_KILLS, TIME_LIMIT, duelOutcome } from './duel';
import { DuelArmy, parseArmy } from './duelarmy';
import { CITY_KEY, readCityCareer } from '../records';
import { PVP_ENABLED } from '../net/config';
import { ChatLimiter, cleanChat, pushChat, visibleChat, type ChatLine } from './chat';
import { gemIcon, starIcon } from '../shared/glyphs';
import { cityIcon, hudIcon } from './icons';

const $ = (n: number): string => Math.floor(n).toLocaleString('en-US');
const clock = (t: number): string => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

function readTutDone(): boolean { try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return false; } }
export function openCity(onExit: () => void, options: { difficulty?: string; loading?: LoadingScreen } = {}): void {
  let diffSel: Difficulty = 'd4'; try { const sv = localStorage.getItem('waldo-city-diff'); if (sv && sv in DIFFICULTY) diffSel = sv as Difficulty; } catch { /* 저장 불가 환경 */ }
  void options;
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches;
  const root = document.createElement('div'); root.className = 'city-root' + (touch ? ' touch' : ''); root.style.setProperty('--wd-hue', '#d8bc80');
  root.innerHTML = `<canvas class="city-canvas3d"></canvas><canvas class="city-canvas" hidden></canvas><div class="c-layer" id="c-layer"></div><div class="c-hurt" id="c-hurt"></div><div class="c-cross" id="c-cross"><i></i><b></b></div>
  <div class="city-hud" hidden><div class="c-damage" id="c-damage"></div><div class="c-income" id="c-income"></div>
    <div class="c-tl"><div class="c-res" id="c-res"></div><div class="c-quest" id="c-quest"></div></div>
    <div class="c-tc" id="c-zone"></div>
    <div class="c-tr"><canvas id="c-mini" width="200" height="200" aria-label="미니맵"></canvas><div id="c-wanted"></div><div class="c-topbtns"><button data-act="view" id="c-view" title="시점 전환 (V)">${hudIcon('eye')}1인칭</button><button data-act="missions" title="작전 지령 (J)">${hudIcon('clip')}임무</button><button data-act="map" title="전술 지도 (M)">${hudIcon('map')}지도</button><button data-act="chat" id="c-chatbtn" title="채팅 (Enter)" hidden>${hudIcon('chat')}채팅</button><button data-act="pause" title="일시정지 (Esc)" aria-label="일시정지">${hudIcon('pause')}</button></div></div>
    <div class="c-target" id="c-target"></div><aside class="c-tut" id="c-tut" hidden></aside><div class="c-area" id="c-area"></div><div class="c-feed" id="c-feed"></div><div class="c-chat" id="c-chat" aria-live="polite"></div><form class="c-chatin" id="c-chatin" hidden><input id="c-chatbox" maxlength="80" autocomplete="off" placeholder="메시지 입력 후 Enter · Esc 취소" aria-label="채팅 입력"></form><div class="c-banner" id="c-banner"></div><div class="c-prompt" id="c-prompt"></div><div class="c-toast" id="c-toast"></div>
    <div class="c-bl" id="c-boss"></div>
    <div class="c-bc" id="c-cmd"></div>
    <div class="c-place" id="c-place" hidden><div class="c-place-info"><b id="c-place-name"></b><span id="c-place-msg"></span><small>시선을 돌려 위치 조절 · 우클릭/Esc 취소 · Shift 연속 설치</small></div><div class="c-place-btns"><button data-act="placeok" class="ok">설치</button><button data-act="placecancel">취소</button></div></div>
    <aside class="c-panel" id="c-panel" hidden></aside>
    <aside class="c-missions" id="c-missions" hidden aria-label="작전 지령 목록"><header><div><span>OPERATIONS / LAST CITY</span><h2>도시 작전 지령</h2></div><button data-act="closemissions" aria-label="작전 지령 닫기">닫기 ✕</button></header><div class="c-mission-summary" id="c-mission-summary"></div><div class="c-mission-list" id="c-mission-list"></div><footer>임무를 완료하면 보상이 자동 지급됩니다 · <kbd>J</kbd> 닫기</footer></aside>
    <div class="c-bigmap" id="c-bigmap" hidden><div><canvas id="c-big" width="620" height="620"></canvas><p>지도를 누르면 전 병력이 그 지점으로 <b>돌격</b>합니다 · M 닫기</p></div></div>
    <button class="c-fire" id="c-fire">사격</button><div class="c-touch" id="c-touch"><button data-act="interact">E</button><button data-act="vehicle">차량</button><button data-act="skill">스킬</button><button data-act="dash">대시</button><button data-act="weapon">무기</button><button data-act="medkit">회복</button><button data-act="charge">돌격</button><button data-act="order:follow">집결</button><button data-act="panel">지휘</button></div>
  </div>
  <div class="c-modal" id="c-modal"></div>`;
  document.body.append(root);
  const q = <T extends HTMLElement>(s: string): T => root.querySelector<T>(s)!;
  const canvas = q<HTMLCanvasElement>('.city-canvas'), canvas3 = q<HTMLCanvasElement>('.city-canvas3d'), layer = q('#c-layer'), cross = q('#c-cross'), hurtEl = q('#c-hurt'), hud = q('.city-hud'), modal = q('#c-modal'), panel = q('#c-panel'), bigmap = q('#c-bigmap');
  const audio = new CityAudio(); audio.enabled = prefs.sound;
  type View = 'fp' | 'tp' | 'top';
  let preView: View = 'fp', tut: { s: TutState; c: Counters } | null = null, tutSig = '', tutDone = readTutDone(), lastPos = { x: 0, y: 0 }, lastYaw = 0, tutInfoLock = false;
  let models: Models | null = null, R3: Renderer3D | null = null, view: View = 'fp', locked = false, lockFail = false, expectUnlock = false, touchFire = false, hurt = 0, lastLook = 0, hitT = 0;
  const tags: HTMLElement[] = [], marks: HTMLElement[] = []; let area = '', areaT = 0, sirenT = 0, heartbeatT = 0;
  let world: World | null = null, R: Renderer | null = null, raf = 0, last = 0, acc = 0, paused = false, closed = false, ghost: Ghost | null = null, tab = 'train', hudT = 0, toastT = 0, bannerT = 0, shopOpen = false, resultShown = false, userZoom = 1, combat = 0, klass: ClassId = 'warlord';
  let demolishArmed: { id: number; at: number } | null = null;
  /** 1대1 결투 진행 상태. null 이면 혼자 하는 게임입니다. */
  interface Duel { s: PvpSession; net: CityDuel; army: DuelArmy; oppHqDown: boolean; hqSent: boolean; myDeaths: number; oppDeaths: number; done: boolean; pose: { x: number; y: number; a: number; hp: number; mh: number; w: WeaponId } | null; rx: number; ry: number; seed: number; oppKlass: string; started: boolean; graceAt: number }
  let duel: Duel | null = null;
  // ---------- 채팅(결투·멀티 방) ----------
  const chatLog: ChatLine[] = [], chatLim = new ChatLimiter(); let chatOpen = false, chatSent = -1e9;
  const chatForm = (): HTMLFormElement => q('#c-chatin') as HTMLFormElement, chatBox = (): HTMLInputElement => q('#c-chatbox') as HTMLInputElement;
  const chatLive = (): boolean => !!((duel && duel.started && !duel.done) || (room && room.started && !room.done));
  const chatNow = (): number => performance.now() / 1000;
  function addChat(name: string, text: string, mine: boolean): void { pushChat(chatLog, { name, text, t: chatNow(), mine }); if (!mine) audio.play('click'); }
  function openChat(): void {
    if (!chatLive() || chatOpen || !world || world.over) return;
    chatOpen = true; keys.clear(); mouse.down = false; touchFire = false; unlock(); chatForm().hidden = false; chatBox().value = ''; chatBox().focus();
  }
  function closeChat(send: boolean): void {
    if (!chatOpen) return; chatOpen = false; const text = cleanChat(chatBox().value); chatBox().value = ''; chatForm().hidden = true; chatBox().blur();
    if (send && text) {
      const now = performance.now();
      if (now - chatSent < 1200) toast('너무 빨리 보냈습니다. 잠시 후 다시 보내세요'); else if (chatLive()) { chatSent = now; if (room) room.net.sendChat(text); else if (duel) duel.net.sendChat(text); addChat('나', text, true); }
    }
    if (!paused && !(world && world.over) && panel.hidden && bigmap.hidden) lock();
  }
  /** 3인 이상 방(영웅 난투전) 진행 상태. */
  interface Room { s: RoomSession; net: CityRoom; ids: string[]; names: Map<string, string>; fac: Map<string, number>; poses: Map<string, { p: { x: number; y: number; a: number; hp: number; mh: number; w: WeaponId }; rx: number; ry: number }>; deaths: Map<string, number>; out: Set<string>; hqSent: boolean; myDeaths: number; done: boolean; seed: number; started: boolean; graceAt: number }
  let room: Room | null = null;
  const keys = new Set<string>(), mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
  const sticks = { move: { id: -1, ox: 0, oy: 0, x: 0, y: 0 }, aim: { id: -1, ox: 0, oy: 0, x: 0, y: 0 } };

  const toast = (text: string, bad = true): void => { if (!text) return; const el = q('#c-toast'); el.textContent = text; el.className = 'c-toast show' + (bad ? ' bad' : ''); toastT = 2.2; audio.play(bad ? 'error' : 'click'); };
  const banner = (text: string): void => { const el = q('#c-banner'); el.textContent = text; el.className = 'c-banner show'; bannerT = 3; };
  const res = (e: string): void => { if (e && e !== 'shop') toast(e); else if (!e) audio.play('click'); };

  function setup(): void {
    modal.innerHTML = `<section class="c-setup wd-panel"><div class="c-kicker wd-eyebrow">WALDO · LAST CITY</div><h2 class="wd-title">LAST CITY <small>최후의 왕국</small></h2>
      <p class="c-lead">여덟 왕국이 한 도시에 떨어졌습니다. 직접 총을 들고 뛰고, 차를 빼앗고, 사업체를 사들여 돈을 벌고, 군대를 길러 <b>자기장이 닫히기 전 마지막 왕국</b>이 되세요. <b>J</b>에서 8단계 도시 작전과 보상을 확인할 수 있습니다.</p>
      <button class="c-tutcard${tutDone ? '' : ' rec'}" data-act="tutorial"><span>${tutDone ? '다시 연습' : '처음이라면 추천 · 약 5분'}</span><b>튜토리얼 시작</b><p>이동·사격·사업체·기지 건설·병력 지휘·차량·시장까지 한 단계씩 안전하게 익힙니다. 연습장에서는 자기장과 라이벌이 멈춰 있습니다.</p></button>
      <div class="c-sub">${tutDone ? '바로 시작할 영웅을 고르세요' : '또는 바로 시작할 영웅을 고르세요'}</div>
      <div class="c-classes">${(Object.keys(CLASSES) as ClassId[]).map(k => `<button class="c-class" data-act="class:${k}"><span>${CLASSES[k].tag}</span><b>${CLASSES[k].name}</b><p>${CLASSES[k].desc}</p><em>Q · ${CLASSES[k].skill}</em><small>${CLASSES[k].skillDesc}</small></button>`).join('')}</div>
      <details class="c-setup-details"><summary>조작법</summary><div class="c-keys">${touch ? '<span>왼쪽 드래그 이동</span><span>오른쪽 드래그 시점</span><span>사격 버튼</span><span>버튼으로 상호작용·지휘</span>' : '<span><b>WASD</b> 이동</span><span><b>마우스</b> 시점·사격</span><span><b>V</b> 1인칭/3인칭/전술뷰</span><span><b>E</b> 매입·줍기</span><span><b>F</b> 차량 탑승</span><span><b>Tab</b> 지휘 패널</span><span><b>우클릭</b> 병력 돌격</span><span><b>Z/X</b> 집결·사수</span><span><b>Space</b> 대시</span><span><b>M</b> 지도</span><span><b>Delete</b> 철거</span>'}</div></details>
      ${PVP_ENABLED ? `<details class="c-setup-details"><summary>온라인 대전</summary><div class="c-sub">1대1 결투 · 멀티 방(3~6인) · 로그인 필요</div><div class="c-diffs">${(Object.keys(CLASSES) as ClassId[]).map(k => `<button class="c-diff" data-act="duel:${k}" title="${CLASSES[k].desc}">${CLASSES[k].name}으로 대전·방 만들기</button>`).join('')}</div><p class="c-lead c-diffdesc">같은 도시에서 둘만 남아 ${TARGET_KILLS}킬을 먼저 채우면 승리합니다. 병력을 뽑고 건물을 지어 싸우세요. 상대 본부를 무너뜨리면 즉시 승리하고, 내 본부가 무너지면 패배합니다. 제한 시간은 ${clock(TIME_LIMIT)}입니다. 방 만들기로 3~6명이 모이면 병력 없이 영웅끼리 싸우는 난투전(목숨 ${ROOM_LIVES}개, 마지막 생존자 우승)이 열립니다.</p></details>` : ''}
      <div class="c-sub wd-label">난이도</div><div class="c-diffs wd-seg" role="group" aria-label="난이도">${DIFFICULTY_ORDER.map(d => `<button class="c-diff${d === diffSel ? ' on' : ''}" data-act="diff:${d}" aria-pressed="${d === diffSel}" title="${DIFFICULTY[d].desc}">${DIFFICULTY[d].label}</button>`).join('')}</div><p class="c-lead c-diffdesc">${DIFFICULTY[diffSel].desc}</p>
      <div class="c-setup-foot"><span>난이도 · ${DIFFICULTY[diffSel].label}</span><button data-act="exit" class="c-ghost wd-btn ghost">게임 목록으로</button></div></section>`;
  }
  function start(k: ClassId, tutorial = false, dl: Duel | null = null, rm: Room | null = null): void {
    klass = k; modal.innerHTML = ''; hud.hidden = false; resultShown = false; paused = false; ghost = null; shopOpen = false; panel.hidden = true; bigmap.hidden = true; q('#c-missions').hidden = true;
    // A retry must not inherit held keys, touch gestures, firing or frame debt.
    keys.clear(); mouse.down = false; touchFire = false; acc = 0; killStreak = 0; lastKillAt = 0; looks.clear(); chatLog.length = 0; chatOpen = false; chatForm().hidden = true;
    for (const stick of [sticks.move, sticks.aim]) { stick.id = -1; stick.x = 0; stick.y = 0; }
    world = new World({ seed: dl ? dl.seed : rm ? rm.seed : (Math.random() * 2 ** 31) | 0, difficulty: diffSel, klass: k, tutorial: tutorial || !!dl || !!rm, duel: dl ? { side: dl.s.host ? 0 : 1, name: dl.s.opponent.nickname, arena: arenaOf(dl.seed) } : rm ? { side: 0, name: '', room: { seats: roomSeats(rm), names: roomNames(rm) } } : undefined });
    if (rm) { const r = rm; world.onShot = (x, y, a, wid, mul) => r.net.sendShot({ x, y, a, w: wid, m: mul }); }
    if (dl) { const d = dl; world.onShot = (x, y, a, wid, mul) => d.net.sendShot({ x, y, a, w: wid, m: mul }); }
    tut = tutorial ? { s: newTutState(), c: newCounters() } : null;  tutSig = ''; q('#c-tut').hidden = true; tutInfoLock = false;
    R = new Renderer(canvas, world); R.reduced = prefs.reducedMotion; const b = world.boss(0)!; R.cam.x = b.x; R.cam.y = b.y; R.cam.zoom = 0.6;
    R3?.dispose(); R3 = null; layer.innerHTML = ''; tags.length = 0; marks.length = 0;
    try { R3 = new Renderer3D(canvas3, world, prefs.quality, layer, models); R3.reduced = prefs.reducedMotion; const hq = world.hq(0); if (hq) R3.yaw = Math.atan2(hq.y + 60 - b.y, hq.x + 60 - b.x) + Math.PI; R3.camPos.set(b.x, 46, b.y); }
    catch { R3 = null; toast('3D를 사용할 수 없어 전술 뷰로 시작합니다'); }
    lastYaw = R3 ? R3.yaw : 0; lastPos = { x: b.x, y: b.y };
    setView(R3 ? (view === 'top' ? 'fp' : view) : 'top'); lock();
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__city = { world, renderer: R, r3: R3 };
    audio.unlock(); if (rm) banner(`멀티 방 ${rm.ids.length}명 · 영웅 난투전 · 목숨 ${ROOM_LIVES}개 · 마지막까지 살아남으세요`); else if (dl) banner(`${dl.s.opponent.nickname} 님과 1대1 · ${arenaInfo(arenaOf(dl.seed)).name} · ${TARGET_KILLS}킬 선취 · 제한 ${Math.round(TIME_LIMIT / 60)}분`); else if (!tutorial) banner('작전 지령 01 · 첫 사업체를 확보하세요 · J 전체 임무');
    renderCmd(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  let everLocked = false, lockErrors = 0, lookMuteUntil = 0, killStreak = 0, lastKillAt = 0;
  function onLockErr(): void { if (!everLocked && ++lockErrors >= 2) lockFail = true; }
  function lock(): void { if (touch || view === 'top' || locked) return; try { const r = canvas3.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(onLockErr); } catch { onLockErr(); } }
  function unlock(): void { if (document.pointerLockElement) { expectUnlock = true; document.exitPointerLock(); } }
  function setView(v: View): void {
    view = v; canvas.hidden = v !== 'top'; canvas3.hidden = v === 'top'; cross.hidden = v === 'top'; layer.hidden = v === 'top'; if (R3 && v !== 'top') R3.mode = v; if (v === 'top') unlock(); else { R3?.resize(); }
    R?.resize(); q('#c-view').innerHTML = hudIcon('eye') + (v === 'fp' ? '1인칭' : v === 'tp' ? '3인칭' : '전술뷰');
  }
  const onLock = (): void => { locked = document.pointerLockElement === canvas3; if (locked) { expectUnlock = false; everLocked = true; lockFail = false; lockErrors = 0; lookMuteUntil = performance.now() + 220; return; } mouse.down = false; if (world) world.input.fire = false; const was = expectUnlock; expectUnlock = false; if (!was && view !== 'top' && world && !world.over && !paused && panel.hidden && bigmap.hidden && q('#c-missions').hidden && world.factions[0].pending === 0) pause(); };

  const onMouseMove = (e: MouseEvent): void => {
    if (!R3 || view === 'top' || paused) return;
    if (!(locked || (lockFail && mouse.down))) return;
    // A placement click must not also rotate the camera, and pointer-lock
    // acquisition can inject a huge movementY that buries the view in the ground.
    if (ghost && (e.buttons & 1)) return;
    if (performance.now() < lookMuteUntil || isLookSpike(e.movementX, e.movementY)) return;
    const look = applyLook(R3.yaw, R3.pitch, e.movementX, e.movementY);
    R3.yaw = look.yaw; R3.pitch = look.pitch; lastLook = performance.now();
  };
  document.addEventListener('pointerlockchange', onLock); document.addEventListener('pointerlockerror', onLockErr); document.addEventListener('mousemove', onMouseMove);
  function exit(): void {
    if (closed) return; closed = true; cancelAnimationFrame(raf); leaveDuel(); endRoom(); audio.dispose(); unlock(); R3?.dispose(); root.remove();
    document.removeEventListener('pointerlockchange', onLock); document.removeEventListener('pointerlockerror', onLockErr); document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('resize', onResize); window.removeEventListener('blur', onBlur); window.removeEventListener('pointerup', onWindowPointerEnd); window.removeEventListener('pointercancel', onWindowPointerEnd); document.removeEventListener('visibilitychange', onBlur);
    onExit();
  }

  // ---------- 동작 ----------
  function act(code: string, ev?: Event): void {
    const [a, ...rest] = code.split(':'), arg = rest.join(':'), w = world; audio.unlock();
    if (a === 'diff') { diffSel = arg as Difficulty; try { localStorage.setItem('waldo-city-diff', arg); } catch { /* 무시 */ } setup(); audio.play('click'); return; }
    if (a === 'chat') { openChat(); return; }
    if (a === 'sq') { if (w) { w.selectSquad(Number(arg)); put(q('#c-squads'), squadBar(w)); toast(w.squadSel ? `${w.squadSel}분대 선택 — 명령이 이 분대에만 적용됩니다` : '전체 병력 선택', false); if (!panel.hidden) renderPanel(); } return; }
    if (a === 'squadsplit') { if (w) { w.splitSquads(0, Number(arg)); put(q('#c-squads'), squadBar(w)); toast(Number(arg) > 1 ? `${arg}개 분대로 편성` : '분대 편성 해제', false); renderPanel(); } return; }
    if (a === 'squadall') { if (w) { w.assignAllTo(0, Number(arg)); w.selectSquad(Number(arg)); put(q('#c-squads'), squadBar(w)); renderPanel(); } return; }
    if (a === 'squadpull') { if (w) { w.moveUnassigned(0, Number(arg)); renderPanel(); } return; }
    if (a === 'class') { start(arg as ClassId); return; }
    if (a === 'duel') { klass = arg as ClassId; openRoomLobby(); return; }
    if (a === 'rematch') { endDuel(); endRoom(); setup(); openRoomLobby(); return; }
    if (a === 'tutorial') { klass = 'warlord'; start('warlord', true); return; }
    if (a === 'tutdone') { tut = null; setup(); return; }
    if (a === 'exit') { exit(); return; }
    if (a === 'retry') { start(klass); return; }
    if (!w) return; const f = w.factions[0];
    if (a === 'resume') { paused = false; modal.innerHTML = ''; last = performance.now(); lock(); return; }
    if (a === 'pause') { pause(); return; }
    if (a === 'sound') { prefs.sound = !prefs.sound; writePreferences(prefs); audio.setEnabled(prefs.sound); pause(); return; }
    if (a === 'perk') { w.pickPerk(Number(arg)); audio.play('levelup'); modal.innerHTML = ''; last = performance.now(); if (f.pending === 0) lock(); return; }
    if (a === 'tutnext') { if (tut) { tut.c.acked = true; lock(); } return; }
    if (a === 'tutskip') { finishTutorial(true); return; }
    if (a === 'view') { if (world?.inside) return; if (tut) tut.c.viewSwitches++; setView(view === 'fp' ? 'tp' : view === 'tp' ? (duel || room ? 'fp' : 'top') : R3 ? 'fp' : 'top'); if (!paused) lock(); audio.play('click'); return; }
    if (paused || w.over) return;
    if (a === 'missions') {
      const board = q('#c-missions');
      board.hidden = !board.hidden;
      if (!board.hidden) { panel.hidden = true; bigmap.hidden = true; shopOpen = false; renderMissions(); unlock(); }
      else lock();
      audio.play('click'); return;
    }
    if (a === 'closemissions') { q('#c-missions').hidden = true; lock(); audio.play('click'); return; }
    if (a === 'tab') { tab = arg; renderPanel(); audio.play('click'); }
    else if (a === 'panel') { q('#c-missions').hidden = true; panel.hidden = !panel.hidden; shopOpen = false; if (!panel.hidden) { renderPanel(); unlock(); } else lock(); audio.play('click'); }
    else if (a === 'closepanel') { panel.hidden = true; shopOpen = false; lock(); }
    else if (a === 'map') { q('#c-missions').hidden = true; bigmap.hidden = !bigmap.hidden; if (bigmap.hidden) lock(); else unlock(); }
    else if (a === 'train') res(w.train(0, arg as UnitId));
    else if (a === 'build') { ghost = { kind: arg as StructKind, x: 0, y: 0, ok: false }; if (view !== 'top' || innerWidth < 900) { panel.hidden = true; lock(); } }
    else if (a === 'placeok') place();
    else if (a === 'placecancel') ghost = null;
    else if (a === 'demolish') requestDemolish(Number(arg));
    else if (a === 'research') res(w.research(0, arg as ResearchId));
    else if (a === 'sell') { const e = w.market(0, true, arg === 'all' ? f.crystal : Number(arg)); res(e); if (!e && tut) tut.c.sells++; }
    else if (a === 'buy') res(w.market(0, false, Number(arg)));
    else if (a === 'upg') { const z = w.businesses.find(b => b.id === Number(arg)); if (z) { const e = w.upgradeBiz(0, z); if (e) toast(e); else audio.play('cash'); } }
    else if (a === 'shop') { const r = w.shop(0, arg); if (r.ok) { audio.play('cash'); toast(r.msg, false); } else toast(r.msg); }
    else if (a === 'bizbuy') { const e = w.buyHere(0); if (e) toast(e); else audio.play('cash'); }
    else if (a === 'bribe') res(w.bribe(0));
    else if (a === 'mercs') res(w.hireMercs(0));
    else if (a === 'order') { const b = w.boss(0); if (b) { w.order(0, arg as 'follow' | 'hold', b.x, b.y); toast(arg === 'follow' ? '전 병력 집결 — 나를 따르라' : '현 위치 사수', false); } }
    else if (a === 'charge') { const b = w.boss(0); if (b) w.order(0, 'amove', b.x + Math.cos(b.ang) * 480, b.y + Math.sin(b.ang) * 480); }
    else if (a === 'interact') interact();
    else if (a === 'vehicle') { w.toggleVehicle(0); }
    else if (a === 'skill') res(w.useSkill(0));
    else if (a === 'dash') { w.input.dash = true; setTimeout(() => { if (world === w) w.input.dash = false; }, 80); }
    else if (a === 'weapon') switchWeapon(w, 0, (f.cur + 1) % f.slots.length);
    else if (a === 'slot') switchWeapon(w, 0, Number(arg));
    else if (a === 'medkit') w.useMedkit(0);
    if (!panel.hidden && a !== 'tab') renderPanel();
    ev?.preventDefault();
  }
  function interact(): void {
    const w = world!;
    if (w.inside) {
      const z = w.insideBiz(), out = z && w.nearInsideDoor() ? w.doorOut(z) : null;
      const r = w.interactInside(0);
      if (r === 'exit') leaveBuilding(out ?? undefined); else if (r === 'shop') { shopOpen = true; panel.hidden = false; renderPanel(); unlock(); audio.play('click'); } else toast('카운터 앞이나 출입문 앞에서 E 를 누르세요', false);
      return;
    }
    const e = w.interact(0);
    if (e === 'enter') enterBuilding(); else if (e) toast(e, e.includes('부족') || e.includes('없'));
  }
  /** 사업체 안으로: 내부는 1인칭으로만 보여 줍니다. */
  function enterBuilding(): void {
    const w = world!, z = w.insideBiz(); if (!z) return;
    if (!R3) { w.exitBiz(0); toast('3D 시점에서만 안에 들어갈 수 있습니다'); return; }
    preView = view === 'top' ? 'fp' : view; if (view !== 'fp') setView('fp');
    R3.yaw = w.inside!.ang; R3.pitch = 0; panel.hidden = true; shopOpen = false; touchFire = false; mouse.down = false; audio.play('door'); banner(`${BIZ[z.kind].name} 내부`);
    if (tut) tut.c.entered = true;
  }
  function leaveBuilding(out?: { x: number; y: number }): void {
    shopOpen = false; panel.hidden = true; if (view !== preView) setView(preView);
    if (R3) { if (out) R3.yaw = doorFacingYaw(out.x, out.y); R3.pitch = -0.05; }
    audio.play('door'); lock();
  }
  function pause(): void {
    if (!world || world.over || duel || room) return; paused = true; keys.clear(); mouse.down = false; unlock();
    modal.innerHTML = `<section class="c-pause wd-panel"><div class="c-kicker wd-eyebrow">LAST CITY</div><h2 class="wd-title">일시정지</h2>
      <div class="c-help"><div><b>보스 조작</b><p>WASD 이동 · 마우스 시점/사격 · V 시점 전환(1인칭·3인칭·전술뷰) · R 재장전 · 1~3 무기 · Space 대시 · H 회복 키트 · Q 고유 스킬</p></div><div><b>도시</b><p>E 사업체 매입·업그레이드·무기 줍기 · F 차량 탑승/하차 · 적 사업체 패드 위에서 6초 버티면 적대적 인수</p></div><div><b>지휘</b><p>Tab 지휘 패널(생산·건설·연구·시장) · 우클릭/지도 클릭 돌격 · Z 집결 · X 사수</p></div><div><b>승리</b><p>자기장은 점점 줄어듭니다. 적 본부를 부수면 그 보스는 부활하지 못합니다. 마지막까지 살아남는 왕국이 승리합니다.</p></div></div>
      <div class="c-actions wd-actions"><button data-act="resume" class="c-primary wd-btn primary">이어하기</button><button data-act="sound" class="wd-btn">소리 ${prefs.sound ? '켬' : '끔'}</button><button data-act="retry" class="wd-btn">다시 시작</button><button data-act="exit" class="wd-btn ghost">게임 목록으로</button></div></section>`;
  }

  // ---------- HUD ----------
  function squadBar(w: World): string {
    const n = (i: number): number => w.squadMembers(0, i).length, tot = n(0);
    return `<button data-act="sq:0" class="${w.squadSel === 0 ? 'on' : ''}" title="전체 (Shift+0)">전체 <small>${tot}</small></button>` + [1, 2, 3, 4, 5].map(i => `<button data-act="sq:${i}" class="${w.squadSel === i ? 'on' : ''}" title="${i}분대 (Shift+${i})">${i}<small>${n(i)}</small></button>`).join('');
  }
  function renderCmd(): void {
    q('#c-cmd').innerHTML = `<div class="c-squads" id="c-squads"></div><button data-act="order:follow"><kbd>Z</kbd>집결</button><button data-act="order:hold"><kbd>X</kbd>사수</button><button data-act="charge"><kbd>우클릭</kbd>돌격</button><button data-act="missions"><kbd>J</kbd>임무</button><button data-act="panel" class="c-cmd-main"><kbd>Tab</kbd>지휘 패널</button>`;
  }
  function renderPanel(): void {
    const w = world!, f = w.factions[0]; let body = '';
    const cost = (c: number, m: number): string => `${c ? `<i class="cr">${gemIcon()}${w.cost(f, c)}</i>` : ''}${m ? `<i class="ca">$${w.cost(f, m)}</i>` : ''}`;
    if (shopOpen) {
      const z = w.insideBiz(), near = w.nearInsideCounter();
      if (z) {
        const d = BIZ[z.kind], rows: string[] = [];
        if (z.owner < 0 && z.kind !== 'gunshop') rows.push(`<button class="c-row c-hl" data-act="bizbuy" ${near && f.cash >= w.bizPrice(f, z) ? '' : 'disabled'}><b>${d.name} 매입</b><span>초당 +$${d.income}${d.crystal ? ` · 크리스탈 +${d.crystal}/s` : ''} · 업그레이드하면 경비병이 본부에서 출동</span><i class="ca">$${w.bizPrice(f, z)}</i></button>`);
        else if (z.owner === 0) rows.push(`<button class="c-row c-hl" data-act="bizbuy" ${near && z.level < 3 && f.cash >= w.upgradePrice(z) ? '' : 'disabled'}><b>${d.name} ${starIcon(true).repeat(z.level)}${starIcon(false).repeat(3 - z.level)}</b><span>${z.level < 3 ? '업그레이드 → 수입 증가 + 경비병 배치' : '최고 등급입니다'}</span>${z.level < 3 ? `<i class="ca">$${w.upgradePrice(z)}</i>` : ''}</button>`);
        for (const it of SHOP[z.kind]) { const p = itemPrice(w, it); rows.push(`<button class="c-row" data-act="shop:${it.id}" ${near && canBuy(w, 0, it) ? '' : 'disabled'}><b>${cityIcon(it.icon)} ${it.name}</b><span>${it.desc}</span><i class="ca">$${$(p)}</i></button>`); }
        body = `<h3>${d.name} <small>${near ? '카운터에서 거래 중' : '(카운터 앞에서만 거래 가능)'}</small></h3>` + rows.join('');
      } else body = '<p class="c-note">거래할 수 없습니다.</p>';
    } else if (tab === 'train') {
      const has = (k: StructKind): boolean => w.structures.some(s => s.alive && s.f === 0 && s.kind === k && s.built >= 1);
      body = `<h3>병력 생산 <small>인구 ${f.supply}/${f.supplyMax}</small></h3>` + (Object.keys(UNITS) as UnitId[]).map(id => { const u = UNITS[id], ok = has(u.from) && (!u.needLab || has('lab')); return `<button class="c-row" data-act="train:${id}" ${ok ? '' : 'disabled'}><b>${ACTORS[id].name}</b><span>${ok ? u.desc : `${STRUCTS[u.from].name}${u.needLab ? '·연구소' : ''} 필요`} · 인구 ${u.supply}</span>${cost(u.crystal, u.cash)}</button>`; }).join('')
        + `<button class="c-row" data-act="mercs" ${f.cash >= 350 ? '' : 'disabled'}><b>용병 3명 즉시 고용</b><span>인구를 차지하지 않는 현금 병력</span><i class="ca">$350</i></button>`
        + `<p class="c-note">대기열: ${w.structures.filter(s => s.f === 0 && s.queue.length).map(s => `${STRUCTS[s.kind].name} ${s.queue.length}`).join(' · ') || '없음'}</p>`;
    } else if (tab === 'build') {
      const mine = w.structures.filter(s => s.alive && s.f === 0 && s.kind !== 'hq' && s.temp <= 0);
        const rows = BUILD_ORDER.map(k => `<button class="c-row" data-act="build:${k}"><b>${STRUCTS[k].name}</b><span>${STRUCTS[k].desc}</span>${cost(STRUCTS[k].crystal, STRUCTS[k].cash)}</button>`).join('');
        const demo = mine.length ? `<p class="c-note">아군 건물 철거 · 건설비 ${Math.round(DEMOLISH_REFUND_RATE * 100)}% 환급 · 대기열은 전액 · <kbd>Delete</kbd> 로 조준한 건물</p>` + mine.map(s => { const ref = w.demolishRefundOf(0, s.kind), armed = demolishArmed?.id === s.id; return `<button class="c-row" data-act="demolish:${s.id}"><b>${armed ? '확인: ' : ''}철거 · ${STRUCTS[s.kind].name}</b><span>${armed ? '한 번 더 누르면 철거합니다' : '건설비 절반과 대기 중 훈련·연구 비용을 돌려받습니다'}</span><i class="cr">${gemIcon()}${ref.crystal}</i>${ref.cash ? `<i class="ca">$${ref.cash}</i>` : ''}</button>`; }).join('') : '';
        body = '<h3>건설 <small>본부 반경·아군 건물·보유 사업체 주변</small></h3>' + rows + demo;
    } else if (tab === 'research') {
      const lab = w.structures.some(s => s.alive && s.f === 0 && s.kind === 'lab' && s.built >= 1);
      body = `<h3>연구 ${lab ? '' : '<small>연구소 필요</small>'}</h3>` + (Object.keys(RESEARCH) as ResearchId[]).map(id => { const lv = f.up[id]; return `<button class="c-row" data-act="research:${id}" ${lab && lv < 3 ? '' : 'disabled'}><b>${RESEARCH[id].name} ${'●'.repeat(lv)}${'○'.repeat(3 - lv)}</b><span>${RESEARCH[id].desc}</span>${lv < 3 ? `<i class="cr">${gemIcon()}${RESEARCH[id].crystal * (lv + 1)}</i><i class="ca">$${RESEARCH[id].cash * (lv + 1)}</i>` : ''}</button>`; }).join('');
    } else if (tab === 'market') {
      const h = w.priceHistory, max = Math.max(14, ...h), pts = h.map((v, i) => `${(i / Math.max(1, h.length - 1) * 280).toFixed(1)},${(64 - v / max * 60).toFixed(1)}`).join(' ');
      body = `<h3>크리스탈 거래소 <small>시세 $${w.price.toFixed(1)}</small></h3><svg class="c-chart" viewBox="0 0 280 66"><polyline points="${pts}" fill="none" stroke="${w.price >= 10 ? '#7dffb0' : '#ff9d9d'}" stroke-width="2"/></svg>
        <div class="c-grid"><button data-act="sell:50">50 판매<small>+$${$(50 * w.price * 0.92)}</small></button><button data-act="sell:200">200 판매<small>+$${$(200 * w.price * 0.92)}</small></button><button data-act="sell:all">전부 판매</button><button data-act="buy:50">50 구매<small>-$${$(50 * w.price * 1.08)}</small></button><button data-act="buy:200">200 구매<small>-$${$(200 * w.price * 1.08)}</small></button></div>
        <p class="c-note">평균 시세는 $10. 급등 뉴스가 뜨면 팔고, 폭락하면 사 두세요. 대량 거래는 시세를 움직입니다.</p>`;
    } else if (tab === 'assets') {
      const own = w.businesses.filter(b => b.owner === 0);
      body = `<h3>자산 <small>초당 +$${$(f.income)} · 순자산 $${$(w.netWorth(f))}</small></h3>` + (own.length ? own.map(b => `<button class="c-row" data-act="upg:${b.id}" ${b.level < 3 && f.cash >= w.upgradePrice(b) ? '' : 'disabled'}><b>${BIZ[b.kind].name} ${starIcon(true).repeat(b.level)}</b><span>${b.level < 3 ? `업그레이드 → 수입 증가 + 경비원` : '최고 등급'}</span>${b.level < 3 ? `<i class="ca">$${w.upgradePrice(b)}</i>` : ''}</button>`).join('') : '<p class="c-note">아직 보유한 사업체가 없습니다. 흰 점선 원 위에서 E로 매입하세요.</p>')
        + (f.wanted >= 1 ? `<button class="c-row" data-act="bribe"><b>경찰 매수</b><span>수배 즉시 해제</span><i class="ca">$${Math.ceil(f.wanted) * 300}</i></button>` : '');
    } else if (tab === 'squad') {
      const KIND = (m: Actor[]): string => { const c: Record<string, number> = {}; for (const a of m) c[a.kind] = (c[a.kind] ?? 0) + 1; return Object.entries(c).map(([k, v]) => `${ACTORS[k as keyof typeof ACTORS]?.name ?? k} ${v}`).join(' · ') || '비어 있음'; };
      const un = w.squadMembers(0, 0).filter(a => a.sq === 0).length;
      body = `<h3>분대 편성 <small>최대 5개 · 명령은 선택한 분대에만</small></h3><div class="c-grid">${[2, 3, 4, 5].map(n => `<button data-act="squadsplit:${n}">${n}개로 나누기</button>`).join('')}<button data-act="squadsplit:1">편성 해제</button></div>`
        + `<button class="c-row ${w.squadSel === 0 ? 'on' : ''}" data-act="sq:0"><b>전체 병력</b><span>미편성 ${un}명 포함 · 총 ${w.squadMembers(0, 0).length}명</span></button>`
        + [1, 2, 3, 4, 5].map(i => { const m = w.squadMembers(0, i); return `<button class="c-row ${w.squadSel === i ? 'on' : ''}" data-act="sq:${i}"><b>${i}분대 <small>Shift+${i}</small></b><span>${KIND(m)}</span><i class="ca">${m.length}명</i></button>`; }).join('')
        + (w.squadSel > 0 ? `<div class="c-grid"><button data-act="squadpull:${w.squadSel}">미편성 → ${w.squadSel}분대</button><button data-act="squadall:${w.squadSel}">전원 → ${w.squadSel}분대</button></div>` : '')
        + '<p class="c-note">분대를 고르고 Z 집결 · X 사수 · C/우클릭 돌격을 하면 그 분대만 움직입니다. 새로 생산한 병력은 선택한 분대에 들어갑니다. Shift+0 은 전체.</p>';
    } else {
      const rows = [...w.factions].sort((a, b) => Number(b.alive) - Number(a.alive) || w.netWorth(b) - w.netWorth(a));
      body = '<h3>왕국 순위</h3><table class="c-rank"><tr><th>왕국</th><th>순자산</th><th>병력</th><th>사업</th><th>Lv</th></tr>' + rows.map(r => `<tr class="${r.alive ? '' : 'dead'}"><td><i style="background:${r.color}"></i>${r.name}${w.hq(r.id) ? '' : r.alive ? ' <small>본부 없음</small>' : ''}</td><td>${r.alive ? '$' + $(w.netWorth(r)) : '궤멸'}</td><td>${w.armyOf(r.id).length}</td><td>${w.businesses.filter(b => b.owner === r.id).length}</td><td>${r.level}</td></tr>`).join('') + '</table>';
    }
    const tabs = ([['train', '생산'], ['build', '건설'], ['research', '연구'], ['market', '시장'], ['assets', '자산'], ['squad', '분대'], ['rank', '순위']] as [string, string][]).filter(([k]) => !((duel || room) && k === 'rank'));
    const head = `<header>${shopOpen ? `<b>${w.insideBiz() ? BIZ[w.insideBiz()!.kind].name : '상점'}</b>` : tabs.map(([k, n]) => `<button data-act="tab:${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}<button data-act="closepanel" class="c-x" aria-label="닫기">✕</button></header>`;
    const cur = panel.querySelector<HTMLElement>('.c-body');
    if (cur && panel.dataset.head === head) { const top = cur.scrollTop; put(cur, body); cur.scrollTop = top; return; }   // 본문만 갱신: 스크롤 위치·스크롤바 드래그 유지
    panel.dataset.head = head; panel.innerHTML = `${head}<div class="c-body">${body}</div>`;
  }
  /** innerHTML 통째 교체 대신 DOM 을 제자리에서 맞춰 갱신(버튼이 매 틱 새로 생겨 깜박이는 것 방지). */
  function sync(a: Node, b: Node): void {
    const ak = Array.from(a.childNodes), bk = Array.from(b.childNodes);
    for (let i = 0; i < bk.length; i++) {
      const x = ak[i], y = bk[i];
      if (!x) { a.appendChild(y.cloneNode(true)); continue; }
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y.cloneNode(true), x); continue; }
      if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
      const ex = x as Element, ey = y as Element;
      for (const at of Array.from(ex.attributes)) if (!ey.hasAttribute(at.name)) ex.removeAttribute(at.name);
      for (const at of Array.from(ey.attributes)) if (ex.getAttribute(at.name) !== at.value) ex.setAttribute(at.name, at.value);
      sync(ex, ey);
    }
    for (let i = ak.length - 1; i >= bk.length; i--) a.removeChild(ak[i]);
  }
  function put(el: HTMLElement, html: string): void {
    const t = document.createElement('div'); t.innerHTML = html; sync(el, t);
  }

  function renderMissions(): void {
    const entries = missionLog(world!), summary = missionSummary(entries);
    put(q('#c-mission-summary'), `<div><span>완료한 작전</span><strong>${summary.completed}<small> / ${summary.total}</small></strong></div><div class="c-overall-progress" role="progressbar" aria-label="전체 작전 진행률" aria-valuemin="0" aria-valuemax="${summary.total}" aria-valuenow="${summary.completed}"><i style="width:${summary.completed / Math.max(1, summary.total) * 100}%"></i></div><p>사업체 확보 → 전력 증강 → 도시 장악 → 최후의 생존</p>`);
    put(q('#c-mission-list'), entries.map((entry, i) => {
      const current = entry === summary.active;
      const state = entry.done ? '완료' : current ? '현재 임무' : '진행 가능';
      return `<article class="c-mission-card${entry.done ? ' complete' : ''}${current ? ' active' : ''}">
        <div class="c-mission-top"><span>${entry.chapter}</span><b>${state}</b></div>
        <h3>${String(i + 1).padStart(2, '0')}. ${entry.title}</h3>
        <p>${entry.objective}</p>
        <div class="c-mission-bar" role="progressbar" aria-label="${entry.title} 진행률" aria-valuemin="0" aria-valuemax="${entry.target}" aria-valuenow="${entry.current}"><i style="width:${entry.current / entry.target * 100}%"></i></div>
        <div class="c-mission-meta"><span>${entry.done ? '완료됨' : entry.current + ' / ' + entry.target}</span><span>${entry.reward ? '보상 $' + $(entry.reward) : '최종 승리'}</span></div>
        ${current ? '<div class="c-mission-hint"><b>전술 안내</b> ' + entry.hint + '</div>' : ''}
      </article>`;
    }).join('') + sideBoard());
  }
  function sideBoard(): string {
    const sj = sideJobs(world!);
    return `<h3 class="c-side-h">도시 부업 <small>사건 ${sj.done}건 완료${sj.streak > 1 ? ` · 연속 ${sj.streak}회 보너스 ×${(1 + Math.min(5, sj.streak - 1) * 0.1).toFixed(1)}` : ''}</small></h3>` + sj.items.map(it => `<article class="c-side-card${it.done ? ' complete' : ''}"><div class="c-mission-top"><span>부업 이정표</span><b>${it.done ? '완료' : '진행 중'}</b></div><h3>${it.title}</h3><p>${it.objective}</p><div class="c-mission-bar"><i style="width:${it.current / it.target * 100}%"></i></div><div class="c-mission-meta"><span>${it.current} / ${it.target}</span><span>보상 $${$(it.reward)}</span></div></article>`).join('');
  }

  function renderHud(): void {
    const w = world!, f = w.factions[0], b = w.boss(0), z = w.zone;
    put(q('#c-res'), `<span class="ca" title="자금">${hudIcon('cash')} <b>${$(f.cash)}</b><small>+${$(f.income)}/s</small></span><span class="cr" title="크리스탈">${gemIcon()} <b>${$(f.crystal)}</b></span><span title="인구">${hudIcon('troops')} 병력 <b>${f.supply}/${f.supplyMax}</b></span>`);
    const entries = tut || duel || room ? [] : missionLog(w), summary = missionSummary(entries), current = summary.active;
    put(q('#c-quest'), tut || duel || room ? '' : current ? `<div class="c-quest-head"><span>작전 지령 <b>${summary.completed}/${summary.total}</b></span><button data-act="missions" aria-label="전체 작전 지령 보기"><kbd>J</kbd>전체 보기</button></div><strong>${current.title}</strong><p>${current.objective}</p><div class="c-quest-progress" role="progressbar" aria-label="${current.title} 진행률" aria-valuemin="0" aria-valuemax="${current.target}" aria-valuenow="${current.current}"><i style="width:${current.current / current.target * 100}%"></i></div><small>${current.current}/${current.target}${current.reward ? ' · 완료 보상 $' + $(current.reward) : ' · 최종 작전'}</small>` : '<div class="c-quest-head"><span>작전 지령 완료</span><button data-act="missions">전체 보기</button></div><strong>최후의 왕국!</strong>');
    if (!q('#c-missions').hidden) renderMissions();
    void z; if (room) { const alive = room.ids.filter(id => !room!.out.has(id) && (room!.deaths.get(id) ?? 0) < ROOM_LIVES).length; put(q('#c-zone'), `<b>${clock(Math.max(0, ROOM_TIME - w.time))}</b><span>남은 목숨 <b>${Math.max(0, ROOM_LIVES - room.myDeaths)}</b>/${ROOM_LIVES}</span><span>생존 <b>${alive}</b>/${room.ids.length}명</span>`); } else if (duel) put(q('#c-zone'), `<b>${clock(Math.max(0, TIME_LIMIT - w.time))}</b><span>나 <b>${duel.oppDeaths}</b> : <b>${duel.myDeaths}</b> ${duel.s.opponent.nickname.replace(/[<>&"]/g, '')}</span><span>${TARGET_KILLS}킬 선취</span>`); else if (tut) put(q('#c-zone'), `<b>튜토리얼</b><span>연습장 · 라이벌 정지</span><span>${Math.min(tut.s.i, STEPS.length - 1) + 1}/${STEPS.length}</span>`); else put(q('#c-zone'), `<b>${clock(w.time)}</b><span>생존 왕국 <b>${w.aliveCount()}</b>/8</span><span class="c-citytime" title="밤에는 클럽·카지노, 낮에는 편의점·공장 수입이 늘고 폭풍우에는 줄어듭니다">${cityIcon(WEATHER_ICON[w.weather])} ${clockLabel(w.hour)} · ${PHASE_LABEL[w.phase]} · ${WEATHER_LABEL[w.weather]}</span>`);
    put(q('#c-wanted'), f.wanted >= 1 ? `<span class="stars">${starIcon(true).repeat(Math.floor(f.wanted))}${starIcon(false).repeat(5 - Math.floor(f.wanted))}</span> 수배 중` : '');
    { const live = chatLive(); (q('#c-chatbtn') as HTMLElement).hidden = !live; put(q('#c-chat'), live ? visibleChat(chatLog, chatNow(), chatOpen).map(l => `<div class="${l.mine ? 'me' : ''}"><b>${esc(l.name)}</b> ${esc(l.text)}</div>`).join('') : ''); }
    put(q('#c-feed'), w.feed.filter(x => w.time - x.t < 7).slice(-5).map(x => `<div style="border-color:${x.color}">${x.text}</div>`).join(''));
    const army = w.armyOf(0).length; put(q('#c-squads'), squadBar(w));
    if (b) {
      const s = f.slots[f.cur], wd = WEAPONS[s.id];
      put(q('#c-boss'), `<div class="c-bars"><div class="hp"><i style="width:${Math.max(0, b.hp / b.maxHp * 100)}%"></i><span>${Math.ceil(b.hp)} / ${b.maxHp}</span></div><div class="ar"><i style="width:${f.armor}%"></i></div><div class="xp"><i style="width:${f.xp / w.xpNeed(f.level) * 100}%"></i></div></div>
        <div class="c-slots">${f.slots.map((x, i) => `<button data-act="slot:${i}" class="${i === f.cur ? 'on' : ''}"><kbd>${i + 1}</kbd>${hudIcon('w:' + x.id)}${WEAPONS[x.id].name}</button>`).join('')}</div>
        <div class="c-ammo"><b>${f.reloadT > 0 ? '재장전…' : s.mag}</b><small>/ ${wd.ammo > 0 ? s.ammo - s.mag : '∞'}</small><span>Lv.${f.level} · 병력 ${army} · ${hudIcon('kit')} ${f.medkits}</span></div>
        <div class="c-skills"><span class="${f.skillCd > 0 ? 'cd' : ''}"><kbd>Q</kbd>${CLASSES[f.klass].skill}${f.skillCd > 0 ? ' ' + Math.ceil(f.skillCd) : ''}</span><span class="${f.dashCd > 0 ? 'cd' : ''}"><kbd>␣</kbd>대시</span></div>`);
    } else put(q('#c-boss'), `<div class="c-down"><b>쓰러짐</b> ${f.respawnT > 0 ? `${Math.ceil(f.respawnT)}초 후 본부에서 부활` : '…'}</div>`);
    // 상호작용 안내
    let prompt = '';
    if (w.inside) {
      const zi = w.insideBiz(); prompt = w.nearInsideDoor() ? '<kbd>E</kbd> 밖으로 나가기' : w.nearInsideCounter() ? `<kbd>E</kbd> ${zi ? BIZ[zi.kind].name : ''} 카운터 — 거래하기` : '카운터로 가서 <kbd>E</kbd> · 출입문으로 걸어가 <kbd>E</kbd> 나가기';
      if (shopOpen && !w.nearInsideCounter()) { shopOpen = false; panel.hidden = true; lock(); }
    } else if (b && !b.inVeh) {
      const l = w.loot.find(x => x.alive && x.type === 'weapon' && x.fall <= 0 && Math.hypot(x.x - b.x, x.y - b.y) < 46);
      const zb = w.businesses.find(x => Math.hypot(x.x - b.x, x.y - b.y) < 64);
      const v = w.vehicles.find(x => x.alive && x.burn <= 0 && x.ai !== 'chase' && Math.hypot(x.x - b.x, x.y - b.y) - x.r < 78);
      if (l) prompt = `<kbd>E</kbd> ${WEAPONS[l.weapon!].name} 줍기`;
      else if (zb) prompt = zb.kind === 'gunshop' ? '무기상 — 문으로 걸어 들어가기' : zb.owner < 0 ? `${BIZ[zb.kind].name} — 문으로 걸어 들어가기 · 매입 <b>$${w.bizPrice(f, zb)}</b> · 초당 +$${BIZ[zb.kind].income}` : zb.owner === 0 ? `${BIZ[zb.kind].name} — 문으로 걸어 들어가기 ${starIcon(true).repeat(zb.level)}` : `${FACTIONS[zb.owner].name}의 ${BIZ[zb.kind].name} — 적대적 인수 ${Math.max(0, 6 - zb.cap).toFixed(1)}초${zb.cap <= 0.05 ? ' (경비 제거 필요)' : ''}`;
      else if (v) prompt = `<kbd>F</kbd> ${v.kind === 'tank' ? '전차 탈취' : v.kind === 'police' ? `경찰차 탈취 (수배 ${starIcon(true)})` : v.driver ? '차량 강탈' : `${v.kind === 'sports' ? '스포츠카' : v.kind === 'truck' ? '트럭' : '세단'} 탑승`}`;
    } else if (b) prompt = '<kbd>F</kbd> 하차 · <kbd>Space</kbd> 핸드브레이크';
    const pe = q('#c-prompt'); put(pe, prompt); pe.className = 'c-prompt' + (prompt ? ' show' : '');
    if (!panel.hidden && (tab === 'market' || tab === 'rank' || tab === 'assets' || tab === 'train' || tab === 'squad' || shopOpen)) renderPanel();
    const head = view !== 'top' && R3 ? R3.yaw : null; R!.minimap(q<HTMLCanvasElement>('#c-mini'), false, head); if (!bigmap.hidden) R!.minimap(q<HTMLCanvasElement>('#c-big'), true, head);
  }
  function showPerks(): void {
    const f = world!.factions[0];
    unlock();
    modal.innerHTML = `<section class="c-perks"><div class="c-kicker">LEVEL ${f.level}</div><h2>특성을 선택하세요</h2><div class="c-classes">${f.choices.map((c, i) => `<button class="c-class" data-act="perk:${i}"><span>${cityIcon(PERKS[c].icon)}</span><b>${PERKS[c].name}</b><p>${PERKS[c].desc}</p><small>${i + 1} 키</small></button>`).join('')}</div></section>`;
  }
  // ---------- 1대1 결투 ----------
  const duelCard = (title: string, body: string, actions: string): void => { modal.innerHTML = `<section class="c-pause"><div class="c-kicker">1대1 결투</div><h2>${title}</h2>${body}<div class="c-actions">${actions}</div></section>`; };
  const esc = (t: string): string => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
  function startDuel(s: PvpSession): void {
    endDuel(); hud.hidden = true; unlock();
    const raw = s.match.config.seed; let seed = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < 2 ** 31 ? raw : 0;
    if (!seed) for (const ch of s.match.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 1;
    duelCard(`${esc(s.opponent.nickname)} 님과 연결하는 중…`, `<p class="c-lead">${CLASSES[klass].name} · ${TARGET_KILLS}킬 선취</p>`, '<button data-act="exit">나가기</button>');
    const d = { s, army: new DuelArmy(), oppHqDown: false, hqSent: false, myDeaths: 0, oppDeaths: 0, done: false, pose: null, rx: 0, ry: 0, seed, oppKlass: 'warlord', started: false, graceAt: 0 } as unknown as Duel;
    duel = d;
    d.net = new CityDuel(s, klass, {
      onStart: oppKlass => { if (duel !== d || closed) return; d.oppKlass = oppKlass; d.started = true; start(klass, false, d); },
      onPose: p => { if (!d.pose) { d.rx = p.x; d.ry = p.y; } d.pose = p; },
      onShot: sh => { if (d.started && !d.done && world) world.remoteShot(sh.x, sh.y, sh.a, sh.w, sh.m); },
      onDeaths: n => { d.oppDeaths = Math.max(d.oppDeaths, n); },
      onArmy: m => { const a = parseArmy(m); if (a && d.started && !d.done && world) d.army.receive(world, a); },
      onHqDown: () => { d.oppHqDown = true; },
      onChat: text => { if (duel === d && d.started && !d.done && chatLim.allow('opp', performance.now())) addChat(s.opponent.nickname, text, false); },
      onGone: reason => { if (!d.done) void concludeDuel(s.me.id, reason === 'never' ? '상대가 접속하지 않았습니다' : reason === 'bye' ? '상대가 나갔습니다' : '상대와의 연결이 끊어졌습니다'); },
    });
  }
  // ---------- 멀티플레이 방(영웅 난투전) ----------
  /** 조직 번호: 나는 0, 나머지는 방 순서대로 1.. 입니다. seats[i] 는 그 조직이 시작할 본부 번호(방 순서)입니다. */
  const roomOrder = (r: Room): string[] => [r.s.me.id, ...r.ids.filter(id => id !== r.s.me.id)];
  const roomSeats = (r: Room): number[] => roomOrder(r).map(id => r.ids.indexOf(id));
  const roomNames = (r: Room): string[] => roomOrder(r).map(id => r.names.get(id) ?? '참가자');
  function openRoomLobby(): void {
    if (!PVP_ENABLED) { toast('멀티플레이는 잠시 꺼 두었습니다'); return; }
    void import('../net/lobby').then(({ openLobby }) => openLobby({ game: 'city', maxPlayers: 6, config: () => ({ seed: (Math.random() * 2 ** 31) | 0 }), onMatch: startDuel, onRoom: startRoom, inGameChat: false, onClose: () => undefined }))
      .catch(() => toast('대전 기능을 불러오지 못했습니다'));
  }
  const roomCard = (title: string, body: string, actions: string): void => { modal.innerHTML = `<section class="c-pause"><div class="c-kicker">멀티 방 · 영웅 난투전</div><h2>${title}</h2>${body}<div class="c-actions">${actions}</div></section>`; };
  function startRoom(s: RoomSession): void {
    endDuel(); endRoom(); hud.hidden = true; unlock();
    const raw = s.room.config.seed; let seed = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < 2 ** 31 ? raw : 0;
    if (!seed) for (const ch of s.room.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 1;
    roomCard('참가자를 모으는 중…', `<p class="c-lead">${s.players.length}명 · ${CLASSES[klass].name} · 목숨 ${ROOM_LIVES}개</p>`, '<button data-act="exit">나가기</button>');
    const r = { s, ids: s.players.map(p => p.id), names: new Map(s.players.map(p => [p.id, p.nickname])), fac: new Map(), poses: new Map(), deaths: new Map(), out: new Set(), hqSent: false, myDeaths: 0, done: false, seed, started: false, graceAt: 0 } as unknown as Room;
    room = r;
    r.net = new CityRoom(s, klass, {
      onStart: list => { if (room !== r || closed) return; r.ids = list.map(p => p.id); r.ids.forEach((id, i) => { if (id !== s.me.id) r.fac.set(id, roomOrder(r).indexOf(id)); void i; }); r.started = true; start(klass, false, null, r); },
      onPose: (id, p) => { const e = r.poses.get(id); if (e) e.p = p; else r.poses.set(id, { p, rx: p.x, ry: p.y }); },
      onShot: (id, sh) => { const fi = r.fac.get(id); if (r.started && !r.done && world && fi !== undefined && !r.out.has(id)) world.remoteShot(sh.x, sh.y, sh.a, sh.w, sh.m, fi); },
      onDeaths: (id, n) => { r.deaths.set(id, Math.max(r.deaths.get(id) ?? 0, n)); },
      onHqDown: id => { r.out.add(id); },
      onChat: (id, text) => { if (room === r && r.started && !r.done && chatLim.allow(id, performance.now())) addChat(r.names.get(id) ?? '참가자', text, false); },
      onGone: id => { r.out.add(id); },
      onAbort: () => { if (!r.done) { r.done = true; roomCard('시작하지 못했습니다', '<p class="c-lead">참가자가 모이지 않았거나 방장이 연결을 잃었습니다.</p>', '<button data-act="exit">메뉴로</button>'); } },
    });
  }
  function roomTick(now: number, dt: number): void {
    const r = room, w = world; if (!r || !w || r.done) return; const f = w.factions[0], b = w.boss(0), me = r.s.me.id;
    for (const [id, e] of r.poses) {
      const fi = r.fac.get(id); if (fi === undefined) continue;
      if (r.out.has(id) || (r.deaths.get(id) ?? 0) >= ROOM_LIVES) { const pb = w.boss(fi); if (pb) pb.alive = false; continue; }
      const far = Math.hypot(e.p.x - e.rx, e.p.y - e.ry) > 400, k = far ? 1 : Math.min(1, dt * 12); e.rx += (e.p.x - e.rx) * k; e.ry += (e.p.y - e.ry) * k; w.puppet(e.rx, e.ry, e.p.a, e.p.hp, e.p.mh, e.p.w, fi);
    }
    if (!w.hq(0) && !r.hqSent) { r.hqSent = true; r.out.add(me); r.net.sendHqDown(); }
    if (b) r.net.sendPose({ x: b.x, y: b.y, a: b.ang, hp: b.hp, mh: b.maxHp, w: f.slots[f.cur]?.id ?? 'pistol' }, now);
    if (f.deaths > r.myDeaths) { r.myDeaths = f.deaths; r.deaths.set(me, f.deaths); r.net.sendDeaths(f.deaths); }
    const winner = roomWinner(r.ids, r.deaths, r.out, w.time), myOut = r.out.has(me) || r.myDeaths >= ROOM_LIVES;
    if (!winner && !myOut) { r.graceAt = 0; return; }
    if (!r.graceAt) r.graceAt = now; else if (now - r.graceAt > 1000) concludeRoom(winner, myOut && winner !== me ? (r.hqSent ? '내 본부가 무너졌습니다' : '목숨을 모두 잃었습니다') : winner === me ? '마지막까지 살아남았습니다' : '제한 시간 종료');
  }
  function concludeRoom(winner: string | null, why: string): void {
    const r = room, w = world; if (!r || r.done) return; r.done = true; resultShown = true; if (w) w.over = true; unlock(); hud.hidden = true;
    const rank = roomRanking(r.ids, r.deaths, r.out), me = r.s.me.id, place = rank.indexOf(me) + 1, win = winner === me;
    audio.play(win ? 'win' : 'lose');
    roomCard(win ? '우승' : `${place}위`, `<p class="c-lead">${esc(why)}</p><ol class="c-lead">${rank.map(id => `<li${id === me ? ' style="font-weight:700"' : ''}>${esc(r.names.get(id) ?? '참가자')} · 쓰러진 횟수 ${r.deaths.get(id) ?? 0}${r.out.has(id) ? ' · 탈락' : ''}</li>`).join('')}</ol>`, '<button data-act="rematch" class="c-primary">다시 방 찾기</button><button data-act="exit">메뉴로</button>');
  }
  function endRoom(): void { if (room) { if (!room.done && room.started) room.net.bye(); room.net.dispose(); } room = null; if (world) world.onShot = null; }

  function duelTick(now: number, dt: number): void {
    const d = duel, w = world; if (!d || !w || d.done) return; const f = w.factions[0], b = w.boss(0);
    if (d.pose) { const far = Math.hypot(d.pose.x - d.rx, d.pose.y - d.ry) > 400, k = far ? 1 : Math.min(1, dt * 12); d.rx += (d.pose.x - d.rx) * k; d.ry += (d.pose.y - d.ry) * k; w.puppet(d.rx, d.ry, d.pose.a, d.pose.hp, d.pose.mh, d.pose.w); }
    d.army.step(dt); const army = d.army.snapshot(w, now); if (army) d.net.sendArmy(army);
    if (!w.hq(0) && !d.hqSent) { d.hqSent = true; d.net.sendHqDown(); }
    if (b) d.net.sendPose({ x: b.x, y: b.y, a: b.ang, hp: b.hp, mh: b.maxHp, w: f.slots[f.cur]?.id ?? 'pistol' }, now);
    if (f.deaths > d.myDeaths) { d.myDeaths = f.deaths; d.net.sendDeaths(d.myDeaths); }
    const out = d.hqSent ? 'lose' : d.oppHqDown ? 'win' : duelOutcome(d.myDeaths, d.oppDeaths, w.time);
    if (!out) { d.graceAt = 0; return; }
    const why = d.hqSent ? '내 본부가 무너졌습니다' : d.oppHqDown ? '상대 본부를 무너뜨렸습니다' : out === 'win' ? `${d.oppDeaths}킬로 승리` : `${d.myDeaths}번 쓰러졌습니다`;
    if (!d.graceAt) d.graceAt = now; else if (now - d.graceAt > 1000) void concludeDuel(out === 'win' ? d.s.me.id : d.s.opponent.id, why);
  }
  /** 승자를 서버에 보고하고 확정된 레이팅 변화를 보여 줍니다(보고 규칙은 SPEED RUSH 와 같습니다). */
  async function concludeDuel(winner: string, why: string): Promise<void> {
    const d = duel, w = world; if (!d || d.done) return; d.done = true; resultShown = true; if (w) w.over = true; unlock(); hud.hidden = true;
    const win = winner === d.s.me.id, card = (extra: string, actions: string, won = win, voided = false): void => { if (!closed && duel === d) { audio.play(won && !voided ? 'win' : 'lose'); duelCard(voided ? '무효' : won ? '승리' : '패배', `<p class="c-lead">vs ${esc(d.s.opponent.nickname)} · ${d.oppDeaths} : ${d.myDeaths}</p><p class="c-lead">${esc(why)}</p><p class="c-lead">${esc(extra)}</p>`, actions); } };
    card('결과를 기록하는 중…', '<button data-act="exit">메뉴로</button>');
    try {
      let row = await d.s.backend.report(d.s.match.id, winner);
      for (let i = 0; i < 8 && row.status === 'playing' && duel === d && !closed; i++) { await new Promise(r => window.setTimeout(r, 3000)); row = await d.s.backend.settle(d.s.match.id); }
      if (closed || duel !== d) return;
      const delta = d.s.host ? row.host_delta : row.guest_delta;
      card(row.status === 'finished' && delta !== null ? `레이팅 ${delta >= 0 ? '+' : ''}${delta}` : row.status === 'void' ? '두 쪽의 보고가 달라 이 대전은 기록되지 않았습니다.' : '결과가 아직 확정되지 않았습니다.',
        '<button data-act="rematch" class="c-primary">다시 대전</button><button data-act="exit">메뉴로</button>', row.status === 'finished' ? row.winner_id === d.s.me.id : win, row.status === 'void');
    } catch { card('기록을 저장하지 못했습니다. 네트워크를 확인해 주세요.', '<button data-act="exit">메뉴로</button>'); }
  }
  /** 나가기: 결투 중이면 기권으로 처리합니다. */
  function leaveDuel(): void {
    const d = duel; if (!d) return;
    if (!d.done && d.started) { d.net.bye(); void d.s.backend.report(d.s.match.id, d.s.opponent.id).catch(() => undefined); }
    endDuel();
  }
  function endDuel(): void { duel?.net.dispose(); duel = null; if (world) world.onShot = null; }

  function showResult(): void {
    const w = world!, f = w.factions[0], win = w.winner === 0, place = win ? 1 : f.place || w.aliveCount() + 1; resultShown = true; unlock(); audio.setEngine(-1); audio.play(win ? 'win' : 'lose');
    recordMatch(win, w.time, f.kills);
    try { const c = readCityCareer(); localStorage.setItem(CITY_KEY, JSON.stringify({ matches: c.matches + 1, wins: c.wins + Number(win), best: c.best ? Math.min(c.best, place) : place })); } catch { /* 기록은 선택 사항 */ }
    modal.innerHTML = `<section class="c-result wd-panel ${win ? 'win' : ''}"><div class="c-kicker wd-eyebrow">경기 결과</div><h2 class="wd-title">${win ? '최후의 왕국!' : `#${place} <small>/ 8 왕국</small>`}</h2><p class="c-lead">${win ? '도시의 모든 것이 이제 당신의 것입니다.' : place <= 3 ? '거의 다 왔습니다. 한 판 더!' : '경제를 먼저 굴리고, 병력과 함께 움직여 보세요.'}</p>
      <div class="c-stats"><div><b>${clock(w.time)}</b><span>생존 시간</span></div><div><b>${f.kills}</b><span>처치</span></div><div><b>${w.businesses.filter(z => z.owner === 0).length}</b><span>보유 사업체</span></div><div><b>$${$(f.earned)}</b><span>총 수익</span></div><div><b>${f.level}</b><span>보스 레벨</span></div><div><b>${w.eventsDone}</b><span>부업 완료</span></div></div>
      <div class="c-actions wd-actions"><button data-act="retry" class="c-primary wd-btn primary">다시 시작</button><button data-act="exit" class="wd-btn ghost">게임 목록으로</button></div></section>`;
  }

  // ---------- 입력 ----------
  function onKey(e: KeyboardEvent): void {
    if (closed) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, w = world;
    if (!w) return; const f = w.factions[0];
    if (chatOpen) return; // 입력 칸이 자체 키를 처리합니다
    if (tut && k === 'Enter' && locked && !STEPS[tut.s.i]?.info && !paused && !e.repeat) { e.preventDefault(); act('tutskip'); return; }
    if (k === 'Enter' && chatLive() && !paused && !w.over && f.pending === 0 && !(e.target instanceof Element && e.target.closest('button,a,select,textarea'))) { e.preventDefault(); openChat(); return; }
    if (f.pending > 0) { if (!e.repeat && k >= '1' && k <= '3') act(`perk:${Number(k) - 1}`); return; }
    if (k === 'Escape') { if (ghost) ghost = null; else if (!bigmap.hidden) { bigmap.hidden = true; lock(); } else if (!q('#c-missions').hidden) { q('#c-missions').hidden = true; lock(); } else if (!panel.hidden) { panel.hidden = true; shopOpen = false; lock(); } else if (paused) act('resume'); else pause(); return; }
    if (tut && k === 'Enter' && STEPS[tut.s.i]?.info && !paused) { act('tutnext'); return; }
    // Never preserve movement during pause/results; allow native Tab/Space on focused controls.
    if (paused || w.over) return;
    const focusedControl = e.target instanceof Element && !!e.target.closest('button,a,input,select,textarea,[contenteditable="true"]');
    if (k === 'Tab') {
      if (panel.hidden && bigmap.hidden && q('#c-missions').hidden && !focusedControl) { e.preventDefault(); act('panel'); }
      return;
    }
    if (e.repeat) return;
    if (focusedControl) {
      // Keep Space/Enter on the button, but do not swallow WASD and other game keys.
      if (k === ' ' || k === 'Enter') return;
      if (e.target instanceof HTMLElement) e.target.blur();
    }
    if (e.shiftKey && /^Digit[0-5]$/.test(e.code)) { act('sq:' + e.code.slice(5)); return; }
    keys.add(k);
    if (k === ' ') e.preventDefault();
    if (k === 'e') interact(); else if (k === 'f') w.toggleVehicle(0); else if (k === 'r') reload(w, 0); else if (k === 'q') res(w.useSkill(0)); else if (k === 'h') w.useMedkit(0);
    else if (k === 'z') act('order:follow'); else if (k === 'x') act('order:hold'); else if (k === 'c') { const p = aimPoint(); w.order(0, 'amove', p.x, p.y); } else if (k === 'v') act('view');
    else if (k === 'j') act('missions'); else if (k === 'm') act('map'); else if (k === 'b') { tab = 'build'; shopOpen = false; panel.hidden = false; renderPanel(); unlock(); }
    else if (k === 'Delete' || k === 'Backspace') { const t = w.structAt(aimPoint().x, aimPoint().y); if (t) requestDemolish(t.id); else toast('철거할 아군 건물을 조준하세요'); }
    else if (k >= '1' && k <= '3') switchWeapon(w, 0, Number(k) - 1);
  }
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
  const onResize = (): void => { R?.resize(); R3?.resize(); };
  const aimPoint = (): { x: number; y: number } => view === 'top' || !R3 ? R!.toWorld(mouse.x, mouse.y) : R3.groundPoint(900);
  const onBlur = (): void => {
    keys.clear(); mouse.down = false; touchFire = false; looks.clear();
    if (world) { world.input.fire = false; world.input.mx = world.input.my = 0; world.input.dash = false; world.input.brake = false; }
    for (const stick of [sticks.move, sticks.aim]) { stick.id = -1; stick.x = 0; stick.y = 0; }
    if (world && !world.over && !paused && world.factions[0].pending === 0 && document.hidden) pause();
  };
  chatBox().addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); closeChat(true); } else if (e.key === 'Escape') { e.preventDefault(); closeChat(false); } });
  chatBox().addEventListener('keyup', e => e.stopPropagation());
  chatForm().addEventListener('submit', e => { e.preventDefault(); closeChat(true); });
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp); window.addEventListener('resize', onResize); window.addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onBlur);
  // Click fires for mouse, touch and keyboard activation; pointerdown excluded keyboard users.
  root.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-act]') : null;
    if (t && !(t as HTMLButtonElement).disabled) { e.stopPropagation(); act(t.dataset.act!, e); }
  });
  root.addEventListener('contextmenu', e => e.preventDefault());
  const requestDemolish = (id: number): void => {
    const w = world; if (!w) return;
    const s = w.structures.find(z => z.id === id), err = w.canDemolish(0, id);
    if (err || !s) { toast(err || '철거할 건물이 없습니다'); demolishArmed = null; return; }
    const ref = w.demolishRefundOf(0, s.kind), now = performance.now();
    if (demolishArmed && demolishArmed.id === id && now - demolishArmed.at < 4000) {
      const e = w.demolish(0, id); demolishArmed = null;
      if (e) toast(e); else { audio.play('poof'); toast(`${STRUCTS[s.kind].name} 철거 · ◆${ref.crystal}${ref.cash ? ` $${ref.cash}` : ''} 환급`, false); if (!panel.hidden) renderPanel(); }
      return;
    }
    demolishArmed = { id, at: now };
    toast(`${STRUCTS[s.kind].name} 철거를 한 번 더 눌러 확인 (건설비 50% 환급)`, false);
    if (!panel.hidden) renderPanel();
  };
  /** 보이는 고스트 자리에 짓습니다(보는 대로 지어지도록 고스트 좌표를 씁니다). */
  const place = (): void => { if (!world || !ghost) return; const e = world.build(0, ghost.kind, ghost.x, ghost.y); if (e) toast(e); else { audio.play('build'); if (!keys.has('Shift')) ghost = null; } };
  let placeKey = '';
  const syncPlaceBar = (): void => {
    const el = q('#c-place'); if (!ghost || !world) { if (!el.hidden) { el.hidden = true; placeKey = ''; } return; }
    const err = world.buildError(0, ghost.kind, ghost.x, ghost.y), key = ghost.kind + '|' + err;
    if (el.hidden) el.hidden = false;
    if (key === placeKey) return; placeKey = key;
    q('#c-place-name').textContent = STRUCTS[ghost.kind].name; const m = q('#c-place-msg'); m.textContent = err || (touch ? '설치할 수 있습니다 — 설치를 누르세요' : '설치할 수 있습니다 — 클릭'); m.className = err ? 'bad' : 'ok';
    (el.querySelector('[data-act="placeok"]') as HTMLButtonElement).disabled = !!err;
  };
  const looks = new Map<number, { x: number; y: number }>();
  for (const cv of [canvas, canvas3]) {
    cv.addEventListener('pointerdown', e => {
      audio.unlock(); if (!world || paused || world.over) return; mouse.x = e.clientX; mouse.y = e.clientY; const three = cv === canvas3;
      if (e.pointerType === 'touch') {
        if (ghost && !three) return; // 탑뷰: 누른 곳으로 고스트가 따라옵니다. 설치는 아래 '설치' 버튼
        if (e.clientX < innerWidth * 0.45) { const s = sticks.move; if (s.id < 0) { s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0; } }
        else if (three) looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
        else { const s = sticks.aim; if (s.id < 0) { s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0; } }
        return;
      }
      if (three && !locked && !touch) { lock(); if (!lockFail) return; }
      if (e.button === 2) { if (ghost) ghost = null; else { const p = three ? R3!.groundPoint(900) : R!.toWorld(e.clientX, e.clientY); world.order(0, 'amove', p.x, p.y); } return; }
      if (e.button === 0) { if (ghost) place(); else mouse.down = true; }
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') {
        if (ghost && cv === canvas) { mouse.x = e.clientX; mouse.y = e.clientY; return; }
        for (const s of [sticks.move, sticks.aim]) if (s.id === e.pointerId) { s.x = Math.max(-1, Math.min(1, (e.clientX - s.ox) / 56)); s.y = Math.max(-1, Math.min(1, (e.clientY - s.oy) / 56)); }
        const l = looks.get(e.pointerId); if (l && R3) { const look = applyLook(R3.yaw, R3.pitch, e.clientX - l.x, e.clientY - l.y, 0.005); R3.yaw = look.yaw; R3.pitch = look.pitch; l.x = e.clientX; l.y = e.clientY; lastLook = performance.now(); }
        return;
      }
      mouse.x = e.clientX; mouse.y = e.clientY;
    });
    const up = (e: PointerEvent): void => { looks.delete(e.pointerId); for (const s of [sticks.move, sticks.aim]) if (s.id === e.pointerId) { s.id = -1; s.x = s.y = 0; } if (e.pointerType !== 'touch' && e.button === 0) mouse.down = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); if (cv === canvas) userZoom = Math.max(0.6, Math.min(1.5, userZoom * (e.deltaY > 0 ? 0.92 : 1.08))); else if (world) { const f = world.factions[0]; switchWeapon(world, 0, (f.cur + (e.deltaY > 0 ? 1 : f.slots.length - 1)) % f.slots.length); } }, { passive: false });
  }
  const onWindowPointerEnd = (e: PointerEvent): void => {
    looks.delete(e.pointerId);
    for (const stick of [sticks.move, sticks.aim]) if (stick.id === e.pointerId) { stick.id = -1; stick.x = 0; stick.y = 0; }
    if (e.pointerType !== 'touch') mouse.down = false;
  };
  // Mobile pointers may end over the HUD rather than the canvas.
  window.addEventListener('pointerup', onWindowPointerEnd);
  window.addEventListener('pointercancel', onWindowPointerEnd);
  const fireBtn = q('#c-fire'); fireBtn.addEventListener('pointerdown', e => { touchFire = true; e.preventDefault(); e.stopPropagation(); audio.unlock(); }); for (const n of ['pointerup', 'pointercancel', 'pointerleave']) fireBtn.addEventListener(n, () => { touchFire = false; });
  const mapClick = (c: HTMLCanvasElement) => (e: PointerEvent): void => {
    if (!world || paused || world.over || world.factions[0].pending > 0) return;
    const r = c.getBoundingClientRect(), point = mapPointerToWorld(e.clientX, e.clientY, r.left, r.top, r.width, r.height);
    if (!point) return;
    world.order(0, 'amove', point.x, point.y);
    toast('전 병력 돌격!', false); e.stopPropagation();
  };
  q<HTMLCanvasElement>('#c-mini').addEventListener('pointerdown', mapClick(q<HTMLCanvasElement>('#c-mini'))); q<HTMLCanvasElement>('#c-big').addEventListener('pointerdown', mapClick(q<HTMLCanvasElement>('#c-big')));

  // ---------- 튜토리얼 ----------
  function tutTick(): void {
    if (!tut || !world || !R3 && view !== 'top') return; const w = world, x = { w, c: tut.c, s: tut.s, yaw: R3?.yaw ?? 0 };
    if (w.factions[0].pending > 0) return;
    for (let n = 0; n < 3 && advance(x); n++) { audio.play('quest'); tutSig = ''; }
    if (tut.s.i >= STEPS.length) { finishTutorial(false); return; }
    const st = STEPS[tut.s.i], pr = st.progress?.(x), card = q('#c-tut'), body = touch && st.touch ? st.touch : st.body;
    const sig = `${tut.s.i}|${pr ? pr[0].toFixed(1) : ''}|${touch}`;
    if (st.info && !tutInfoLock) { tutInfoLock = true; unlock(); } else if (!st.info && tutInfoLock) tutInfoLock = false;
    if (sig !== tutSig) {
      tutSig = sig; card.hidden = false;
      card.innerHTML = `<header><span>튜토리얼 ${tut.s.i + 1}/${STEPS.length}</span><button data-act="tutskip">건너뛰기</button></header><b>${st.title}</b><p>${body}</p>${pr ? `<div class="bar"><i style="width:${Math.min(100, pr[0] / pr[1] * 100)}%"></i></div>` : ''}${st.info ? `<button class="go" data-act="tutnext">확인${touch ? '' : ' <kbd>Enter</kbd>'}</button>` : ''}`;
    }
    root.querySelectorAll('.c-pulse').forEach(el => el.classList.remove('c-pulse'));
    for (const sel of st.pulse ?? []) root.querySelectorAll(sel).forEach(el => { if (el instanceof HTMLElement && el.offsetParent !== null) el.classList.add('c-pulse'); });
  }
  function finishTutorial(skipped: boolean): void {
    try { localStorage.setItem(TUT_KEY, '1'); } catch { /* 기록은 선택 사항 */ }
    tutDone = true; q('#c-tut').hidden = true; root.querySelectorAll('.c-pulse').forEach(el => el.classList.remove('c-pulse')); unlock(); audio.setEngine(-1); paused = true; panel.hidden = true; bigmap.hidden = true;
    modal.innerHTML = `<section class="c-result win"><div class="c-kicker">${skipped ? 'TUTORIAL SKIPPED' : 'TUTORIAL COMPLETE'}</div><h2>${skipped ? '연습 종료' : '준비 완료!'}</h2><p class="c-lead">${skipped ? '튜토리얼은 시작 화면에서 언제든 다시 할 수 있습니다.' : '이동·사격·사업체·기지·병력·차량·시장을 모두 익혔습니다. 이제 진짜 전쟁입니다. 경제를 먼저 굴리고, 병력과 함께 움직이세요.'}</p><div class="c-actions"><button data-act="tutdone" class="c-primary">영웅 고르고 시작</button><button data-act="tutorial">튜토리얼 다시</button><button data-act="exit">메뉴로</button></div></section>`;
  }

  // ---------- 3D 화면 표식 ----------
  function overlay(): void {
    const w = world!, r3 = R3!, b = w.boss(0), list: { x: number; y: number; h: number; text: string; color: string; edge: boolean }[] = [];
    if (w.inside) { for (const el of marks) el.style.display = 'none'; return; }
    const hq = w.hq(0); if (hq && b && (Math.hypot(hq.x + 60 - b.x, hq.y + 60 - b.y) > 420 || w.time - hq.hurtT < 5)) list.push({ x: hq.x + 60, y: hq.y + 60, h: 190, text: w.time - hq.hurtT < 5 ? '본부 피격!' : '본부', color: w.time - hq.hurtT < 5 ? '#ff6b6b' : FACTIONS[0].color, edge: true });
    if (w.event) list.push({ x: w.event.x, y: w.event.y, h: 70, text: `${EVENT_INFO[w.event.kind].name}${w.event.kind === 'delivery' ? (w.event.stage ? ' · 목적지' : ' · 수령지') : ''} ${w.event.t}s`, color: EVENT_INFO[w.event.kind].color, edge: true });
    for (const l of w.loot) if (l.alive && l.type === 'crate') list.push({ x: l.x, y: l.y, h: 60, text: '보급 상자', color: '#ffe27a', edge: true });
    const z = w.zone; if (b && Math.hypot(b.x - z.nx, b.y - z.ny) > z.nr && z.nr < 3800) list.push({ x: z.nx, y: z.ny, h: 40, text: '안전지대', color: '#c9a2ff', edge: true });
    if (b && !w.businesses.some(q2 => q2.owner === 0)) { let best: { x: number; y: number } | null = null, bd = 1e9; for (const q2 of w.businesses) if (q2.owner < 0 && q2.kind !== 'gunshop') { const d = Math.hypot(q2.x - b.x, q2.y - b.y); if (d < bd) { bd = d; best = q2; } } if (best) list.push({ x: best.x, y: best.y, h: 60, text: '매입 가능', color: '#ffffff', edge: true }); }
    for (const f of w.factions) { if (f.id === 0) continue; const o = w.boss(f.id); if (!o || !b) continue; const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < 1500 && (!w.opts.duel || w.canSee(b.x, b.y, o.x, o.y))) list.push({ x: o.x, y: o.y, h: 62, text: `${f.name} Lv.${f.level} · ${Math.ceil(o.hp)}`, color: f.color, edge: false }); }
    if (tut) { list.length = 0; const st = STEPS[tut.s.i], mk = st?.marker?.({ w, c: tut.c, s: tut.s, yaw: r3.yaw }); if (mk) list.push({ x: mk.x, y: mk.y, h: mk.h, text: mk.text, color: '#ffe27a', edge: true }); }
    else if (b && !duel && !room) {
      const active = missionLog(w).findIndex(m => !m.done);
      let target: { x: number; y: number } | undefined;
      if (active === 1 || active === 2) target = w.hq(0) ?? undefined;
      else if (active === 0 || active === 3 || active === 4 || active === 5) {
        let nearest = Infinity;
        for (const z of w.businesses) {
          const eligible = active === 3 ? z.kind === 'gunshop' : active === 5 ? z.owner > 0 : z.owner < 0 && z.kind !== 'gunshop';
          if (!eligible) continue;
          const distance = Math.hypot(z.x - b.x, z.y - b.y);
          if (distance < nearest) { nearest = distance; target = z; }
        }
      } else if (active >= 6) {
        let nearest = Infinity;
        for (const f of w.factions) {
          if (f.id === 0 || !f.alive) continue;
          const hq = w.hq(f.id);
          if (!hq) continue;
          const distance = Math.hypot(hq.x - b.x, hq.y - b.y);
          if (distance < nearest) { nearest = distance; target = hq; }
        }
      }
      if (target) list.push({ x: target.x, y: target.y, h: 90, text: '목표', color: '#ffe27a', edge: true });
    }
    while (marks.length < list.length) { const el = document.createElement('div'); el.className = 'c-mark'; layer.append(el); marks.push(el); }
    marks.forEach((el, i) => {
      const m = list[i]; if (!m) { el.style.display = 'none'; return; }
      const p = r3.project(m.x, m.y, m.h); let x = p.x, y = p.y; const off = p.behind || x < 40 || x > r3.w - 40 || y < 40 || y > r3.h - 40;
      if (off && !m.edge) { el.style.display = 'none'; return; }
      if (off) { let dx = x - r3.w / 2, dy = y - r3.h / 2; if (p.behind) { dx = -dx; dy = Math.abs(dy) + r3.h; } const k = Math.min((r3.w / 2 - 50) / Math.abs(dx || 1), (r3.h / 2 - 60) / Math.abs(dy || 1)); x = r3.w / 2 + dx * k; y = r3.h / 2 + dy * k; }
      const dist = b ? Math.round(Math.hypot(m.x - b.x, m.y - b.y) / 30) : 0;
      el.style.display = ''; el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; el.style.setProperty('--direction', `${Math.atan2(y - r3.h / 2, x - r3.w / 2)}rad`); el.style.color = m.color; el.textContent = m.edge ? `${m.text} ${dist}m` : m.text; el.classList.toggle('edge', off);
    });
  }
  function crossTarget(): string {
    const w = world!, b = w.boss(0); if (!b || !R3 || w.inside) return ''; const f = w.factions[0], range = WEAPONS[f.slots[f.cur].id].range, dx = Math.cos(R3.yaw), dy = Math.sin(R3.yaw); let best = range, html = '', hostile = false;
    for (const a of w.actors) { if (!a.alive || a === b || a.inVeh) continue; const rx = a.x - b.x, ry = a.y - b.y, t = rx * dx + ry * dy; if (t < 0 || t > best || Math.abs(rx * dy - ry * dx) > a.r + 7) continue; if (!w.canSee(b.x, b.y, a.x, a.y)) continue; best = t; hostile = w.hostile(0, a.f); html = `<b style="color:${a.f < 8 ? FACTIONS[a.f].color : a.f === 8 ? '#8fb0ff' : '#ccc'}">${a.f < 8 ? FACTIONS[a.f].name + ' ' : ''}${ACTORS[a.kind].name}</b><i><u style="width:${Math.max(0, a.hp / a.maxHp * 100)}%;background:${a.f === 0 ? '#5dfc9b' : '#ff5d5d'}"></u></i>`; }
    for (const s of w.structures) { if (!s.alive) continue; const cx = s.x + s.w / 2 - b.x, cy = s.y + s.h / 2 - b.y, t = cx * dx + cy * dy; if (t < 0 || t > best + 60 || Math.abs(cx * dy - cy * dx) > Math.max(s.w, s.h) / 2) continue; best = t; hostile = s.f !== 0; html = `<b style="color:${FACTIONS[s.f].color}">${FACTIONS[s.f].name} ${STRUCTS[s.kind].name}</b><i><u style="width:${Math.max(0, s.hp / s.maxHp * 100)}%"></u></i>`; }
    cross.classList.toggle('hostile', hostile && !!html); return html;
  }

  // ---------- 루프 ----------
  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame); const w = world!, r = R!; const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const f = w.factions[0], b = w.boss(0), three = view !== 'top' && !!R3;
    const veh = b && b.inVeh ? w.vehicles.find(v => v.id === b.inVeh) : undefined, spd = veh ? Math.hypot(veh.vx, veh.vy) : 0;
    if (f.pending > 0 && !modal.firstChild) { showPerks(); keys.clear(); mouse.down = false; }
    if (!paused && f.pending === 0 && !w.over) {
      const inp = w.input; let mx = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0), my = (keys.has('s') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('w') || keys.has('ArrowUp') ? 1 : 0);
      if (sticks.move.id >= 0) { mx = sticks.move.x; my = sticks.move.y; }
      inp.brake = keys.has(' '); if (!touch || keys.has(' ')) inp.dash = keys.has(' ');
      if (three && R3) {
        if (veh && spd > 70 && now - lastLook > 1100) { let d = veh.ang - R3.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; R3.yaw += d * Math.min(1, dt * 2.2); R3.pitch += (-0.12 - R3.pitch) * Math.min(1, dt * 2); }
        const c = Math.cos(R3.yaw), s = Math.sin(R3.yaw), fwd = -my; inp.mx = fwd * c - mx * s; inp.my = fwd * s + mx * c;
        const ox = b ? b.x : 0, oy = b ? b.y : 0; inp.ax = ox + c * 600; inp.ay = oy + s * 600; inp.fire = ((mouse.down && (locked || lockFail)) || touchFire) && !ghost && !w.inside;
      } else {
        inp.mx = mx; inp.my = my;
        if (sticks.aim.id >= 0 && b) { const m = Math.hypot(sticks.aim.x, sticks.aim.y); if (m > 0.2) { inp.ax = b.x + sticks.aim.x / m * 300; inp.ay = b.y + sticks.aim.y / m * 300; } inp.fire = m > 0.35 && !ghost && !w.inside; }
        else if (touch && b) { inp.fire = touchFire; if (Math.hypot(mx, my) > 0.2) { inp.ax = b.x + mx * 300; inp.ay = b.y + my * 300; } }
        else { const p = r.toWorld(mouse.x, mouse.y); inp.ax = p.x; inp.ay = p.y; inp.fire = mouse.down && !ghost; }
      }
      acc += dt; let n = 0; while (acc >= 1 / 60 && n < 4) { w.step(1 / 60); acc -= 1 / 60; n++; if (w.enteredByDoor) { w.enteredByDoor = false; enterBuilding(); } } if (n === 4) acc = 0;
      // 이벤트 → 화면·소리
      if (three) R3!.consume(w.events); else r.consume(w.events);
      const lx = b ? b.x : r.cam.x, ly = b ? b.y : r.cam.y;
      for (const e of w.events) {
        const d = Math.hypot(e.x - lx, e.y - ly), vol = Math.max(0, 1 - d / 1200);
        if (e.t === 'shot') { audio.play(e.s!, vol * (e.f === 0 ? 1 : 0.6)); if (vol > 0.3) combat = Math.min(1, combat + 0.08); }
        else if (e.t === 'boom') audio.play('boom', vol); else if (e.t === 'hit') { if (e.a === 1) { hitT = 0.14; cross.classList.add('hit'); audio.play('hit', 0.9); } else audio.play('hit', vol * 0.5); } else if (e.t === 'spark') audio.play('hit', vol * 0.4); else if (e.t === 'death') audio.play('death', vol);
        else if (e.t === 'kill') { hitT = 0.3; cross.classList.add('hit', 'kill'); audio.play('pickup', 0.8); killStreak = now - lastKillAt <= 8000 ? killStreak + 1 : 1; lastKillAt = now; w.say(`${killStreak > 1 ? `${killStreak} \uC5F0\uC18D \uCC98\uCE58! \u00B7 ` : ''}처치 · ${e.s ?? '적'}`, '#e9c989'); }
        else if (e.t === 'phurt') { hurt = Math.min(1, hurt + (e.a ?? 10) / 45); audio.play('hurt', 0.7); const el = q('#c-damage'); el.textContent = `−${Math.ceil(e.a ?? 0)}`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
        else if (e.t === 'income') { const el = q('#c-income'); el.textContent = `+$${$(e.a ?? 0)}`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
        else if (e.t === 'cash' && e.f === 0) audio.play('cash'); else if (e.t === 'pickup' && d < 60) audio.play('pickup'); else if (e.t === 'levelup' && e.f === 0) audio.play('levelup');
        else if (e.t === 'order') { if (tut) tut.c.orders++; } else if (e.t === 'quest') { audio.play('quest'); banner(`목표 달성 +$${e.a}`); } else if (e.t === 'siren') audio.play('siren'); else if (e.t === 'announce') { audio.play('announce'); banner(e.s!); }
        else if (e.t === 'crash') audio.play('crash', 0.8); else if (e.t === 'reload') audio.play('reload'); else if (e.t === 'dash') audio.play('dash'); else if (e.t === 'door') audio.play('door'); else if ((e.t === 'built' || e.t === 'capture') && e.f === 0) { audio.play('build'); if (e.t === 'capture') { const z = w.businesses.find(z => Math.hypot(z.x - e.x, z.y - e.y) < 1); toast(`${z ? BIZ[z.kind].name : '사업체'} 점령`, false); } }
        else if (e.t === 'thud') audio.play('boom', vol * 0.5); else if (e.t === 'playerdown') { audio.play('lose'); hurt = 1; }
        else if (e.t === 'crystal') audio.play('crystal', vol); else if (e.t === 'heal' || e.t === 'healbeam') audio.play('heal', vol);
        else if (e.t === 'skid') audio.play('skid', vol); else if (e.t === 'splat') audio.play('splat', vol);
        else if (e.t === 'burn' || e.t === 'wreck') audio.play('burn', vol); else if (e.t === 'spawn' && e.f === 0) audio.play('spawn');
        else if (e.t === 'roar') audio.play('roar', vol); else if (e.t === 'poof') audio.play('poof', vol); else if (e.t === 'crate' && d < 80) audio.play('crate');
      }
      if (duel) duelTick(now, dt); else if (room) roomTick(now, dt);
      w.events.length = 0; combat = Math.max(0, combat - dt * 0.25); audio.intensity = combat;
    }
    audio.setEngine(veh ? Math.min(1, spd / veh.maxSpeed) : -1);
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) cross.classList.remove('hit', 'kill'); }
    hurt = Math.max(0, hurt - dt * 1.3); const low = b && b.hp < b.maxHp * 0.35 ? 0.35 + Math.sin(now / 160) * 0.12 : 0, outside = !!b && Math.hypot(b.x - w.zone.x, b.y - w.zone.y) > w.zone.r;
    if (low && !paused && !w.over && f.pending === 0 && now >= heartbeatT) { audio.play('heartbeat'); heartbeatT = now + 1250; }
    hurtEl.style.opacity = String(Math.max(hurt * 0.85, low)); hurtEl.classList.toggle('storm', outside && hurt < 0.1);if (outside) hurtEl.style.opacity = String(Math.max(0.45, hurt));
    if (three && R3) {
      if (ghost) { const p = R3.buildPoint(ghost.kind); ghost.x = snapBuildCoord(p.x); ghost.y = snapBuildCoord(p.y); ghost.ok = !w.buildError(0, ghost.kind, ghost.x, ghost.y); }
      R3.draw(paused ? 0 : dt, ghost); overlay(); r.cam.x = b ? b.x : r.cam.x; r.cam.y = b ? b.y : r.cam.y;
    } else {
      if (b) { const look = touch ? { x: 0, y: 0 } : { x: (mouse.x - r.w / 2) * 0.22 / r.cam.zoom, y: (mouse.y - r.h / 2) * 0.22 / r.cam.zoom }; const tx = b.x + look.x + (veh ? veh.vx * 0.35 : 0), ty = b.y + look.y + (veh ? veh.vy * 0.35 : 0); r.cam.x += (tx - r.cam.x) * Math.min(1, dt * 7); r.cam.y += (ty - r.cam.y) * Math.min(1, dt * 7); }
      const base = Math.max(0.55, Math.min(1, Math.min(r.w, r.h * 1.5) / 1100)); r.cam.zoom += (base * userZoom * (1 - Math.min(0.3, spd / 1800)) - r.cam.zoom) * Math.min(1, dt * 3);
      if (ghost) { const p = r.toWorld(mouse.x, mouse.y); ghost.x = snapBuildCoord(p.x); ghost.y = snapBuildCoord(p.y); ghost.ok = !w.buildError(0, ghost.kind, ghost.x, ghost.y); }
      r.draw(paused ? 0 : dt, ghost, touch || !b ? null : r.toWorld(mouse.x, mouse.y));
    }
    syncPlaceBar();
    root.classList.toggle('down', !b && !w.over);
    if (b) { // 구역 이름
      const bi = Math.max(0, Math.min(BLOCKS - 1, Math.floor((b.x - ROAD / 2) / PITCH))), bj = Math.max(0, Math.min(BLOCKS - 1, Math.floor((b.y - ROAD / 2) / PITCH))), bl = w.map.blocks[bj * BLOCKS + bi], ring = Math.max(Math.abs(bi - 4), Math.abs(bj - 4));
      const owner = bl.type === 'base' ? w.factions.find(x => { const h = w.hq(x.id); return h && h.x > bl.x && h.x < bl.x + 440 && h.y > bl.y && h.y < bl.y + 440; }) : undefined;
      const name = w.map.arena ? w.map.arena.name : bl.type === 'base' ? (owner ? `${owner.name} 영지` : '폐허가 된 영지') : bl.type === 'plaza' ? '센트럴 플라자' : bl.type === 'park' ? '크리스탈 공원' : bl.type === 'police' ? '경찰청' : bl.type === 'military' ? '군 기지' : bl.type === 'lot' ? '공영 주차장' : ring <= 1 ? '카지노 스트립' : ring === 2 ? '다운타운' : ring === 3 ? '미드타운' : '외곽 항만';
      if (name !== area) { area = name; const el = q('#c-area'); el.textContent = name; el.className = 'c-area show'; areaT = 3; }
    }
    if (areaT > 0) { areaT -= dt; if (areaT <= 0) q('#c-area').className = 'c-area'; }
    if (f.wanted >= 2 && !paused && now - sirenT > 2400 && w.vehicles.some(v => v.ai === 'chase' && b && Math.hypot(v.x - b.x, v.y - b.y) < 900)) { sirenT = now; audio.play('wail'); }
    if (tut && !paused && b) { if (!b.inVeh) tut.c.move += Math.hypot(b.x - lastPos.x, b.y - lastPos.y) * (Math.hypot(b.x - lastPos.x, b.y - lastPos.y) < 80 ? 1 : 0); else if (veh) tut.c.vehicleDist += spd * dt; lastPos = { x: b.x, y: b.y }; if (R3) { let dy = R3.yaw - lastYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; tut.c.look += Math.min(1, Math.abs(dy)); lastYaw = R3.yaw; } }
    hudT -= dt; if (hudT <= 0) { hudT = 0.12; renderHud(); if (tut && !paused) tutTick(); q('#c-target').innerHTML = three ? crossTarget() : ''; }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) q('#c-toast').className = 'c-toast'; }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) q('#c-banner').className = 'c-banner'; }
    if (w.over && !resultShown) showResult();
  }
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tut = () => tut;
  // 모델을 다 받을 때까지 로딩 화면을 보여 줍니다. 네트워크가 느리거나 끊겨도 포기하지 않고 계속 받습니다.
  const loading = options.loading ?? showLoading('LAST CITY');
  loading.progress(0, '도시 자산을 불러오는 중');
  const finishLoading = (): void => { if (closed) return; loading.close(); setup(); };
  void loadModels(import.meta.env.BASE_URL, (f, note) => { if (f >= 0) loading.progress(f); loading.note(note); })
    .then(m => { models = m; }).catch(() => { models = null; }).finally(finishLoading);
}
