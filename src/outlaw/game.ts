import { renderPixelRatio } from '../shared/render-budget';
import '../shared/game-polish.css';
// OUTLAW CITY — 게임 조립: 타이틀(도시 선회)·입력·HUD·상점/지도/일시정지·고정 간격 루프.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './outlaw.css';
import { readPreferences, writePreferences } from '../prefs';
import type { LoadingScreen } from '../loading';
import { PVP_ENABLED } from '../net/config';
import { Sim } from './sim';
import { CityView } from './cityview';
import { ActorView } from './actorview';
import { ChaseCamera } from './camera';
import { Minimap, districtName } from './minimap';
import { OutlawAudio } from './audio';
import { loadOutlawAssets, type OutlawAssets } from './assets';
import { MISSION_LIST, canStart, startMission } from './missions';
import { OutlawUi } from './ui';
import { pickpocket, pickpocketTarget, startJob } from './jobs';
import { treat, buySnack, nearVending } from './services';
import { OUTLAW_KEY } from './records';
import { Versus, type VsSession, type VsResult } from './versus';
import { WEAPONS, WEAPON_ORDER, PLAYER_ID, VEHICLES, blankPedInput, blankCarInput, clamp, wrapAngle, type PedInput, type SimEvent, type Vehicle } from './types';

interface OpenOptions { loading?: LoadingScreen }
const SEED = 20260101, STEP = 1 / 60, TITLE_CLOCK = 17.2;
const WHEEL_NAMES = ['주먹', '권총', '기관단총', '샷건', '돌격소총', '저격총', '로켓포', '방망이', '수류탄', '미니건', '레일건'];
const NW = WEAPON_ORDER.length;
const esc = (s: string): string => s.replace(/[&<>]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;');
const money = (n: number): string => '$' + Math.floor(n).toLocaleString('en-US');

export function openOutlaw(onExit: () => void, opts: OpenOptions = {}): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches, base = import.meta.env.BASE_URL;
  const root = document.createElement('div'); root.className = 'ol-root' + (touch ? ' touch' : '');
  root.innerHTML = `
    <canvas class="ol-canvas"></canvas>
    <div class="ol-fx"><div class="ol-vig" id="ol-vig"></div><div class="ol-lines" id="ol-lines"></div><div class="ol-gray" id="ol-gray"></div><div class="ol-dir" id="ol-dir"><i></i></div></div>
    <div class="ol-hud" id="ol-hud" hidden>
      <div class="ol-tr"><div class="ol-cash" id="ol-cash">$0</div><div class="ol-clock" id="ol-clock">00:00</div><div class="ol-stars" id="ol-stars"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div></div>
      <div class="ol-bl"><div class="ol-radar"><canvas id="ol-radar" width="260" height="260"></canvas><span id="ol-dname"></span></div>
        <div class="ol-bars"><div class="ol-bar hp"><i id="ol-hp"></i><b id="ol-hpn">100</b></div><div class="ol-bar ar"><i id="ol-ar"></i><b id="ol-arn">0</b></div></div></div>
      <div class="ol-br"><div class="ol-wname" id="ol-wname"></div><div class="ol-ammo"><b id="ol-mag">0</b><span id="ol-res"></span></div><div class="ol-slots" id="ol-slots"></div></div>
      <div class="ol-speedo" id="ol-speedo"><b id="ol-kmh">0</b><span>km/h</span><div class="ol-dmg"><i id="ol-dmg"></i></div><em id="ol-radio"></em></div>
      <div class="ol-mission" id="ol-mission" hidden><span class="tag" id="ol-mtag"></span><b id="ol-mtitle"></b><p id="ol-mtext"></p><em id="ol-mtimer"></em></div>
      <div class="ol-banner" id="ol-banner"></div><div class="ol-vs" id="ol-vs" hidden></div>
      <div class="ol-style" id="ol-style"></div><div class="ol-sgauge" id="ol-sgauge"><i id="ol-sg"></i><b id="ol-sgm"></b></div>
      <div class="ol-cross" id="ol-cross"><i></i><i></i><i></i><i></i></div><div class="ol-hit" id="ol-hit"><i></i><i></i><i></i><i></i></div>
      <div class="ol-prompt" id="ol-prompt"></div>
      <ul class="ol-toasts" id="ol-toasts"></ul><div class="ol-floaters" id="ol-floaters"></div>
      <div class="ol-big" id="ol-big"></div>
      <div class="ol-tbtn"><button id="ol-pause" type="button" aria-label="일시정지">Ⅱ</button><button id="ol-mapbtn" type="button" aria-label="지도">M</button><button id="ol-phonebtn" type="button" aria-label="휴대폰">📱</button></div>
      <div class="ol-touchpad"><div class="ol-stick" id="ol-stick"><i></i></div>
        <div class="ol-tfoot"><button data-act="fire" class="fire" type="button">사격</button><button data-act="aim" type="button">조준</button><button data-act="jump" type="button">점프</button><button data-act="use" type="button">타기</button><button data-act="reload" type="button">장전</button><button data-act="weapon" type="button">무기</button><button data-act="sprint" type="button">달리기</button></div>
        <div class="ol-tcar"><button data-act="left" type="button">◀</button><button data-act="right" type="button">▶</button><button data-act="gas" class="fire" type="button">가속</button><button data-act="brake" type="button">브레이크</button><button data-act="hand" type="button">드리프트</button></div></div>
    </div>
    <div class="ol-wheel" id="ol-wheel" hidden></div>
    <div class="ol-title" id="ol-title"></div>
    <div class="ol-modal" id="ol-modal" hidden></div>`;
  document.body.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const canvas = q<HTMLCanvasElement>('.ol-canvas'), hudEl = q('#ol-hud'), titleEl = q('#ol-title'), modalEl = q('#ol-modal'), wheelEl = q('#ol-wheel');
  const radar = q<HTMLCanvasElement>('#ol-radar');
  const cache = new Map<string, string>();
  const set = (id: string, text: string): void => { if (cache.get(id) !== text) { cache.set(id, text); q(`#ol-${id}`).textContent = text; } };
  const html = (id: string, h: string): void => { if (cache.get(id) !== h) { cache.set(id, h); q(`#ol-${id}`).innerHTML = h; } };
  const style = (id: string, prop: string, v: string): void => { const k = id + prop; if (cache.get(k) !== v) { cache.set(k, v); (q(`#ol-${id}`).style as unknown as Record<string, string>)[prop] = v; } };

  const ui = new OutlawUi(() => sim);
  const audio = new OutlawAudio(); audio.enabled = prefs.sound;
  let closed = false, raf = 0, last = performance.now();
  let phase: 'load' | 'menu' | 'trans' | 'play' = 'load';
  let paused = false, modalKind = '', locked = false, lockFail = false, transT = 0;
  let sim: Sim | null = null, cityView: CityView | null = null, actorView: ActorView | null = null, chase: ChaseCamera | null = null, minimap: Minimap | null = null;
  let assets: OutlawAssets | null = null, versus: Versus | null = null;
  let lobby: { close(): void } | undefined, openingLobby = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
  let renderer: THREE.WebGLRenderer | null = null; let composer: EffectComposer | null = null; let bloom: UnrealBloomPass | null = null;
  let yaw = 0, pitch = 0, acc = 0, saveT = 0, shakeFov = 0, hitT = 0, hurtVig = 0, bannerT = 0, radioToast = 0;
  const keys = new Set<string>(), mouse = { fire: false, aim: false };
  const tc = { fire: false, aim: false, jump: false, sprint: false, gas: false, brake: false, hand: false, left: false, right: false, moveId: -1, mx: 0, my: 0, ox: 0, oy: 0, lookId: -1, lx: 0, ly: 0 };
  let enterReq = false, slotReq = -1, reloadReq = false, station = 0, wheelOpen = false, wheelSel = -1, wheelX = 0, wheelY = 0, aimedAtEnemy = false;
  const orbitPos = new THREE.Vector3(), orbitQuat = new THREE.Quaternion();
  const toastList: Array<{ el: HTMLElement; at: number }> = [];
  const hasSave = (): boolean => { try { return !!localStorage.getItem(OUTLAW_KEY); } catch { return false; } };

  // ---------- 저장 ----------
  function save(): void { if (!sim || versus) return; try { localStorage.setItem(OUTLAW_KEY, JSON.stringify(sim.exportSave())); } catch { /* 저장은 선택 사항입니다. */ } }

  // ---------- 알림 도구 ----------
  function toast(text: string, sec = 3.2): void {
    const li = document.createElement('li'); li.textContent = text; q('#ol-toasts').append(li); toastList.push({ el: li, at: performance.now() + sec * 1000 });
    while (toastList.length > 5) toastList.shift()!.el.remove();
  }
  function big(h: string, cls: string, ms = 2600): void {
    const el = q('#ol-big'); el.className = 'ol-big'; void el.offsetWidth; el.className = 'ol-big on ' + cls; el.innerHTML = h;
    window.setTimeout(() => { if (el.innerHTML === h) el.className = 'ol-big'; }, ms);
  }
  function floater(text: string, cls = ''): void {
    const el = document.createElement('div'); el.className = 'ol-fl ' + cls; el.textContent = text; q('#ol-floaters').append(el); window.setTimeout(() => el.remove(), 1400);
  }
  function countUp(el: HTMLElement, to: number, prefix: string): void {
    const t0 = performance.now(); const tick = (): void => { const k = Math.min(1, (performance.now() - t0) / 900); el.textContent = prefix + money(to * (1 - Math.pow(1 - k, 3))); if (k < 1 && !closed) requestAnimationFrame(tick); }; tick();
  }

  // ---------- 모달 ----------
  function openModal(kind: string, h: string): void {
    resetInput();
    modalKind = kind; paused = true; modalEl.hidden = false; modalEl.innerHTML = `<div class="ol-card ${kind}">${h}</div>`;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function closeModal(): void { modalKind = ''; paused = false; modalEl.hidden = true; modalEl.innerHTML = ''; if (phase === 'play') lock(); }
  function lock(): void { if (touch || locked || lockFail || closed) return; try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => { lockFail = true; }); } catch { lockFail = true; } }
  const onLock = (): void => {
    locked = document.pointerLockElement === canvas;
    if (!locked && phase === 'play' && !modalKind && !closed && !wheelOpen) openPause();
  };
  document.addEventListener('pointerlockchange', onLock);

  function controlsHtml(): string {
    return `<h2>조작법</h2><div class="ol-keys"><div><b>이동</b>WASD · Shift 달리기 · Space 점프 · C 앉기</div><div><b>전투</b>좌클릭 사격 · 우클릭 조준 · R 재장전 · 1~9·0·-/휠 무기 · Q 무기 휠 · 수류탄은 사격 키로 투척</div><div><b>상호작용</b>E / F 차량 · 상점 · 의뢰 · 안전가옥</div><div><b>차량</b>W 가속 · S 브레이크/후진 · A D 조향 · Space 핸드브레이크 · H 경적 · R 라디오 · C 뒤돌아보기</div><div><b>휴대폰</b>P 휴대폰: 일거리·차고·부동산·업적 · 격투장/체육관/카지노/자동차 매장은 E</div><div><b>기타</b>M / Tab 전체 지도 · Esc 일시정지</div></div><p class="hint">아슬아슬한 통과·점프·드리프트·헤드샷은 스타일 보너스가 됩니다. 시민을 해치면 수배 별이 올라갑니다.</p><div class="ol-btns"><button data-k="back" type="button">돌아가기</button></div>`;
  }
  function openPause(): void {
    openModal('pause', `<h2>${versus ? '대전 메뉴' : '일시정지'}</h2><div class="ol-btns v"><button data-k="resume" type="button">계속하기</button><button data-k="phone" type="button">휴대폰</button><button data-k="map" type="button">전체 지도</button><button data-k="help" type="button">조작법</button><button data-k="sound" type="button">소리: ${audio.enabled ? '켜짐' : '꺼짐'}</button><button data-k="quality" type="button">품질: ${prefs.quality === 'high' ? '높음' : prefs.quality === 'standard' ? '보통' : '낮음'} (다음 실행부터)</button><button data-k="quit" type="button" class="danger">${versus ? '대전 나가기' : '저장하고 나가기'}</button></div>`);
  }
  function openMap(): void {
    openModal('map', `<canvas id="ol-bigmap" width="900" height="780"></canvas><div class="ol-btns"><button data-k="resume" type="button">닫기 (M)</button></div>`);
    if (sim && minimap) minimap.drawFull(q<HTMLCanvasElement>('#ol-bigmap'), sim, yaw);
  }
  function openShop(): void {
    if (!sim) return; const p = sim.player;
    const rows = WEAPON_ORDER.slice(1).map((id, i) => { const d = WEAPONS[id], have = !!p.guns[i + 1]; return `<button class="row" data-buy="${id}" type="button"><b>${d.name}</b><span>피해 ${d.dmg}${d.pellets > 1 ? '×' + d.pellets : ''} · 탄창 ${d.mag}</span><em>${have ? '탄약 보충 ' + money(sim!.price(Math.ceil(d.price * 0.2))) : money(sim!.price(d.price))}</em></button>`; }).join('');
    openModal('shop', `<h2>총기점</h2><p class="cash">보유 ${money(sim.cash)}</p><div class="ol-list">${rows}<button class="row" data-armor="1" type="button"><b>방탄복</b><span>방탄 100</span><em>${money(sim.price(300))}</em></button></div><div class="ol-btns"><button data-k="resume" type="button">나가기</button></div>`);
  }
  function openBrief(id: string): void {
    const m = MISSION_LIST.find(x => x.id === id); if (!m) return;
    openModal('brief', `<span class="tag">의뢰</span><h2>${esc(m.title)}</h2><p class="giver">${esc(m.giver)}</p><p class="brief">${esc(m.brief).replace(/\n/g, '<br>')}</p><p class="reward">보상 ${money(m.reward)}</p><div class="ol-btns"><button data-start="${id}" type="button">수락</button><button data-k="resume" type="button">취소</button></div>`);
  }
  function openUi(kind: string): void { if (!sim) return; openModal(kind, ui.render(kind)); }
  function uiClick(ds: DOMStringMap): void {
    if (!sim) return; const r = ui.click(ds);
    if (r.toast) toast(r.toast); if (r.sound) audio.play(r.sound);
    if (r.begin) { closeModal(); begin(false); save(); return; }
    if (r.close) { closeModal(); return; }
    if (r.kind) { const top = modalEl.querySelector('.ol-card'); const sy = top?.scrollTop ?? 0; openUi(r.kind); const nt = modalEl.querySelector('.ol-card'); if (nt) nt.scrollTop = sy; }
  }
  modalEl.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button'); if (!b || !sim) return;
    audio.unlock(); audio.play('menu_click');
    const k = b.dataset.k;
    if (b.dataset.ui) { uiClick(b.dataset); return; }
    if (b.dataset.buy) { toast(sim.buyWeapon(b.dataset.buy as never)); openShop(); }
    else if (b.dataset.armor) { toast(sim.buyArmor()); openShop(); }
    else if (b.dataset.start) { const id = b.dataset.start; closeModal(); if (startMission(sim, id)) { audio.play('mission_start'); } }
    else if (k === 'resume') closeModal();
    else if (k === 'map') openMap();
    else if (k === 'phone') openUi('phone');
    else if (k === 'help') openModal('help', controlsHtml());
    else if (k === 'back') openPause();
    else if (k === 'sound') { audio.enabled = !audio.enabled; prefs.sound = audio.enabled; writePreferences(prefs); openPause(); }
    else if (k === 'quality') { prefs.quality = prefs.quality === 'high' ? 'standard' : prefs.quality === 'standard' ? 'low' : 'high'; writePreferences(prefs); openPause(); }
    else if (k === 'quit' || k === 'vsexit') { save(); exit(); }
  });

  // ---------- 타이틀 ----------
  function showTitle(): void {
    titleEl.hidden = false; const sv = hasSave();
    titleEl.innerHTML = `<div class="ol-logo"><span>OUTLAW</span><span class="b">CITY</span></div><p class="ol-tag">도시는 네 것이다. 대가는 네가 치른다.</p>
      <div class="ol-btns v"><button data-t="new" type="button">새 게임</button>${sv ? '<button data-t="cont" type="button">이어하기</button>' : ''}${PVP_ENABLED ? '<button data-t="duel" type="button">온라인 1대1</button><button data-t="room" type="button">온라인 룸 (2~6인)</button>' : ''}<button data-t="help" type="button">조작법</button><button data-t="exit" type="button" class="ghost">메뉴로</button></div><p class="ol-title-status" role="status"></p>`;
  }
  titleEl.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button'); if (!b || !sim || phase !== 'menu' || lobby || openingLobby) return;
    audio.unlock(); audio.play('menu_click');
    const t = b.dataset.t;
    if (t === 'exit') exit();
    else if (t === 'help') openModal('help', controlsHtml().replace('data-k="back"', 'data-k="resume"'));
    else if (t === 'new') {
      if (hasSave() && !confirmNew) { confirmNew = true; b.textContent = '저장 덮어쓰기? 다시 누르면 시작'; return; }
      confirmNew = false; b.textContent = '새 게임'; ui.heroSel = 'h0'; openUi('hero');
    }
    else if (t === 'cont') begin(true);
    else if (t === 'duel' || t === 'room') openVersusLobby(t === 'duel');
  });
  async function openVersusLobby(duel: boolean): Promise<void> {
    if (!PVP_ENABLED || openingLobby || lobby) return;
    openingLobby = true;
    const status = q('.ol-title-status');
    status.textContent = '';
    try {
      const { openLobby } = await import('../net/lobby');
      if (closed || phase !== 'menu') return;
      lobby = openLobby({
        game: 'outlaw', maxPlayers: duel ? 2 : 6,
        onClose: () => { lobby = undefined; },
        onMatch: s => {
          const players = s.host ? [s.me, s.opponent] : [s.opponent, s.me];
          startVersus({ meId: s.me.id, players, duel: true, open: s.open, report: winner => {
            void s.backend.report(s.match.id, winner).then(async result => {
              if (result.status !== 'playing') return;
              // The backend can settle a claim after 15 seconds without a second report.
              await new Promise<void>(resolve => window.setTimeout(resolve, 16000));
              await s.backend.settle(s.match.id);
            }).catch(() => undefined);
          } });
        },
        onRoom: s => startVersus({ meId: s.me.id, players: s.players, duel: false, open: s.open }),
      });
    } catch {
      status.textContent = '온라인 로비를 열지 못했습니다';
    } finally {
      openingLobby = false;
    }
  }
  function startVersus(vs: VsSession): void {
    lobby = undefined;
    if (!sim || closed || phase !== 'menu') return;
    sim.applyHero(sim.life.hero);
    versus = new Versus(sim, vs, {
      onFeed: text => toast(text, 3),
      onGone: name => toast(`${name} 님이 나갔습니다`, 3.5),
      onEnd: openVsEnd,
    });
    begin(false, false);
    sim.clock = TITLE_CLOCK;
    root.classList.add('ol-online');
    q('#ol-vs').hidden = false;
  }
  function openVsEnd(r: VsResult): void {
    const rows = r.board.map((b, i) => `<div class="row"><b>${i + 1}. ${esc(b.name)}</b><span>처치 ${b.kills} · 쓰러짐 ${b.deaths}</span></div>`).join('');
    const labels = { score: '목표 처치 달성', time: r.winner ? '시간 종료' : '시간 종료 · 무승부', left: '상대가 나갔습니다', connection: '대전에 연결하지 못했습니다' };
    const winner = r.board.find(b => b.id === r.winner);
    openModal('vsend', `<h2>대전 종료</h2><p class="sub">${labels[r.reason]}${winner ? ' · 승자 ' + esc(winner.name) : ''}</p><div class="ol-list">${rows}</div><div class="ol-btns"><button data-k="vsexit" type="button">메뉴로</button></div>`);
    q('[data-k="vsexit"]').focus();
  }
  let confirmNew = false;

  function begin(cont: boolean, acquirePointer = true): void {
    if (!sim) return;
    if (cont) { try { const s = JSON.parse(localStorage.getItem(OUTLAW_KEY) ?? 'null'); if (s) sim.applySave(s); } catch { /* 새 게임으로 진행 */ } }
    else { sim.clock = 16.6; sim.playSec = 0; }
    titleEl.hidden = true; hudEl.hidden = false; phase = 'trans'; transT = 0; yaw = sim.player.yaw; pitch = 0;
    orbitPos.copy(camera.position); orbitQuat.copy(camera.quaternion); chase?.reset({ x: sim.player.x, y: sim.player.y, z: sim.player.z, yaw: sim.player.yaw, speed: 0 }, { yaw, pitch });
    audio.play('mission_start');
    if (acquirePointer) lock();
  }

  // ---------- 입력 ----------
  const onKeyDown = (e: KeyboardEvent): void => {
    if (closed || lobby || openingLobby || modalKind === 'vsend') return; audio.unlock();
    if (e.repeat) { return; }
    if (e.code === 'Escape') {
      if (modalKind) closeModal();
      else if (phase === 'play' && !locked) openPause();
      return;
    }
    if (phase !== 'play') return;
    if ((e.code === 'KeyM' || e.code === 'Tab') && (!modalKind || modalKind === 'map')) { e.preventDefault(); if (modalKind) closeModal(); else openMap(); return; }
    if (e.code === 'KeyP') { if (modalKind === 'phone') closeModal(); else if (!modalKind) openUi('phone'); return; }
    if (modalKind) return;
    keys.add(e.code);
    if (e.code === 'KeyE' || e.code === 'KeyF') useAction();
    else if (e.code === 'KeyR') { if (sim?.player.vehicle) cycleRadio(); else reloadReq = true; }
    else if (e.code === 'KeyQ') openWheel();
    else if (e.code.startsWith('Digit')) { const n = (Number(e.code.slice(5)) + 9) % 10; if (n >= 0 && n < NW) slotReq = n; }
    else if (e.code === 'Minus') slotReq = 10;
  };
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.code); if (e.code === 'KeyQ') closeWheel(); };
  const onMouseMove = (e: MouseEvent): void => {
    if (phase !== 'play' || modalKind || (!locked && !(lockFail && (e.buttons & 2)))) return;
    if (wheelOpen) { wheelX = clamp(wheelX + e.movementX, -140, 140); wheelY = clamp(wheelY + e.movementY, -140, 140); updateWheel(); return; }
    const s = (mouse.aim ? 0.0014 : 0.0023); yaw += e.movementX * s; pitch = clamp(pitch - e.movementY * s, -1.2, 1.2);
  };
  const onMouseDown = (e: MouseEvent): void => {
    audio.unlock(); if (phase !== 'play' || modalKind) return;
    if (!locked && !lockFail && !touch) { lock(); return; }
    if (e.button === 0) mouse.fire = true; else if (e.button === 2) mouse.aim = true;
  };
  const onMouseUp = (e: MouseEvent): void => { if (e.button === 0) mouse.fire = false; else if (e.button === 2) mouse.aim = false; };
  const onWheel = (e: WheelEvent): void => { if (phase !== 'play' || modalKind || !sim || Math.abs(e.deltaY) < 4) return; const dir = e.deltaY > 0 ? 1 : -1; let i = sim.player.cur; for (let n = 0; n < NW; n++) { i = (i + dir + NW) % NW; if (sim.player.guns[i]) { slotReq = i; break; } } };
  const onCtx = (e: Event): void => e.preventDefault();
  function resetInput(): void {
    keys.clear(); mouse.fire = mouse.aim = false; enterReq = reloadReq = false; slotReq = -1;
    tc.fire = tc.aim = tc.jump = tc.sprint = tc.gas = tc.brake = tc.hand = tc.left = tc.right = false;
    tc.moveId = tc.lookId = -1; tc.mx = tc.my = 0;
    stickEl.style.opacity = '0'; (stickEl.firstElementChild as HTMLElement).style.transform = '';
    wheelSel = -1; closeWheel();
  }
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown); window.addEventListener('mouseup', onMouseUp); window.addEventListener('wheel', onWheel, { passive: true }); canvas.addEventListener('contextmenu', onCtx); window.addEventListener('blur', resetInput);

  // 터치
  const stickEl = q('#ol-stick');
  const pad = q('.ol-touchpad');
  pad.addEventListener('pointerdown', e => {
    audio.unlock(); const b = (e.target as HTMLElement).closest('button');
    if (b && b.dataset.act) { const a = b.dataset.act; b.setPointerCapture(e.pointerId); if (a === 'use') useAction(); else if (a === 'reload') reloadReq = true; else if (a === 'weapon') { const p = sim!.player; let i = p.cur; for (let n = 0; n < NW; n++) { i = (i + 1) % NW; if (p.guns[i]) { slotReq = i; break; } } } else (tc as unknown as Record<string, boolean>)[a === 'hand' ? 'hand' : a] = true; e.preventDefault(); }
  });
  const upTouch = (e: PointerEvent): void => { const b = (e.target as HTMLElement).closest('button'); const a = b?.dataset.act; if (a && a in tc) (tc as unknown as Record<string, boolean>)[a] = false; };
  pad.addEventListener('pointerup', upTouch); pad.addEventListener('pointercancel', upTouch); pad.addEventListener('lostpointercapture', upTouch);
  canvas.addEventListener('pointerdown', e => {
    if (!touch || e.pointerType !== 'touch' || phase !== 'play' || modalKind) return; audio.unlock();
    if (e.clientX < innerWidth * 0.4 && tc.moveId < 0) { tc.moveId = e.pointerId; tc.ox = e.clientX; tc.oy = e.clientY; stickEl.style.cssText = `left:${e.clientX - 60}px;top:${e.clientY - 60}px;opacity:1`; }
    else if (e.clientX >= innerWidth * 0.4 && tc.lookId < 0) { tc.lookId = e.pointerId; tc.lx = e.clientX; tc.ly = e.clientY; }
  });
  const movePtr = (e: PointerEvent): void => {
    if (e.pointerId === tc.moveId) { const dx = clamp((e.clientX - tc.ox) / 55, -1, 1), dy = clamp((e.clientY - tc.oy) / 55, -1, 1); tc.mx = dx; tc.my = dy; const k = stickEl.firstElementChild as HTMLElement; k.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; }
    else if (e.pointerId === tc.lookId) { yaw += (e.clientX - tc.lx) * 0.0055; pitch = clamp(pitch - (e.clientY - tc.ly) * 0.0045, -1.2, 1.2); tc.lx = e.clientX; tc.ly = e.clientY; }
  };
  window.addEventListener('pointermove', movePtr);
  document.addEventListener('visibilitychange', resetInput);
  const endPtr = (e: PointerEvent): void => { if (e.pointerId === tc.moveId) { tc.moveId = -1; tc.mx = tc.my = 0; stickEl.style.opacity = '0'; (stickEl.firstElementChild as HTMLElement).style.transform = ''; } if (e.pointerId === tc.lookId) tc.lookId = -1; };
  window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
  q('#ol-pause').onclick = () => { if (phase === 'play' && !modalKind) openPause(); };
  q('#ol-mapbtn').onclick = () => { if (phase === 'play' && !modalKind) openMap(); };
  q('#ol-phonebtn').onclick = () => { if (phase === 'play' && !modalKind) openUi('phone'); };

  // ---------- 상호작용 ----------
  function interaction(): { text: string; run?: () => void } | null {
    if (!sim) return null; const p = sim.player; if (!p.alive || sim.downKind) return null;
    const poi = sim.nearPoi(p.x, p.z);
    if (p.vehicle) { if (poi?.kind === 'paynspray') return { text: `E · 도색 & 수배 해제 (${money(sim.price(150))})`, run: () => { toast(sim!.paynspray()); audio.play('pickup'); } }; return null; }
    if (poi?.kind === 'gunshop') return { text: 'E · 총기점', run: openShop };
    if (poi?.kind === 'dealer') return { text: 'E · 자동차 매장', run: () => openUi('dealer') };
    if (poi?.kind === 'casino') return { text: 'E · 카지노', run: () => openUi('casino') };
    if (poi?.kind === 'hospital') { if (p.hp < p.maxHp || p.armor < 40) return { text: `E · 치료 (${money(sim.price(120))})`, run: () => { toast(treat(sim!)); audio.play('pickup'); } }; }
    if (poi?.kind === 'arena') return sim.job.active ? null : { text: `E · 지하 격투 참가 (${money(sim.price(200))})`, run: () => { const r = startJob(sim!, 'fight'); if (r) toast(r); } };
    if (poi?.kind === 'safehouse') return { text: 'E · 쉬기 · 저장', run: () => { const r = sim!.sleep(); toast(r); save(); audio.play('save'); } };
    if (poi?.kind === 'start') { const m = MISSION_LIST.find(x => x.startPoi === poi.id); if (m && canStart(sim, m.id)) return { text: `E · 의뢰: ${m.title}`, run: () => openBrief(m.id) }; }
    if (sim.nearestVehicle(p)) return { text: 'E · 차량 탑승' };
    if (nearVending(sim)) return { text: `E · 음료 (${money(sim.price(8))})`, run: () => { toast(buySnack(sim!)); audio.play('pickup'); } };
    if (pickpocketTarget(sim)) return { text: 'E · 소매치기', run: () => { toast(pickpocket(sim!)); audio.play('pickup'); } };
    return null;
  }
  function useAction(): void { const it = interaction(); if (it?.run) { it.run(); audio.play('door'); } else { enterReq = true; } }
  function cycleRadio(): void { station = (station + 1) % 4; audio.setRadio(station); radioToast = 2.4; }

  // ---------- 무기 휠 ----------
  function openWheel(): void {
    if (wheelOpen || !sim) return; wheelOpen = true; wheelX = wheelY = 0; wheelSel = -1; wheelEl.hidden = false; if (document.pointerLockElement) { /* 잠금 유지 */ }
    wheelEl.innerHTML = WEAPON_ORDER.map((_id, i) => { const a = (i / NW) * Math.PI * 2 - Math.PI / 2; return `<div class="ws" data-i="${i}" style="left:calc(50% + ${Math.cos(a) * 165}px);top:calc(50% + ${Math.sin(a) * 165}px)"><b>${WHEEL_NAMES[i]}</b><span></span></div>`; }).join('') + '<div class="wc"><b id="ol-wsel"></b></div>';
    updateWheel();
  }
  function updateWheel(): void {
    if (!sim) return; const mag = Math.hypot(wheelX, wheelY);
    wheelSel = mag > 40 ? Math.round(((Math.atan2(wheelY, wheelX) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * NW) % NW : -1;
    wheelEl.querySelectorAll<HTMLElement>('.ws').forEach(el => { const i = Number(el.dataset.i), g = sim!.player.guns[i]; el.classList.toggle('sel', i === wheelSel); el.classList.toggle('none', !g); el.querySelector('span')!.textContent = g ? (WEAPONS[g.id].melee ? '' : `${g.mag}/${g.reserve}`) : '미보유'; });
    const c = wheelEl.querySelector('#ol-wsel'); if (c) c.textContent = wheelSel >= 0 ? WHEEL_NAMES[wheelSel] : '';
  }
  function closeWheel(): void { if (!wheelOpen) return; wheelOpen = false; wheelEl.hidden = true; if (wheelSel >= 0 && sim?.player.guns[wheelSel]) slotReq = wheelSel; }

  // ---------- 사운드 도우미 ----------
  function at(name: string, x: number, z: number): void {
    const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz);
    if (d > 260) return; const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); const pan = d > 1 ? clamp((dx * r.x + dz * r.z) / d, -1, 1) : 0; audio.play(name, d, pan);
  }
  const camDist = (x: number, z: number): number => Math.hypot(x - camera.position.x, z - camera.position.z);

  // ---------- 이벤트 ----------
  function handleEvents(events: SimEvent[]): void {
    if (!sim || !chase) return;
    for (const e of events) {
      switch (e.t) {
        case 'shot': { at(e.weapon === 'fist' ? 'punch' : e.weapon, e.ox, e.oz); if (e.id === PLAYER_ID) { chase.shake(WEAPONS[e.weapon].recoil * 2.2); shakeFov = Math.max(shakeFov, e.weapon === 'rocket' ? 3 : 0.6); } break; }
        case 'hit': {
          if (e.attacker === PLAYER_ID && (e.kind === 'ped' || e.kind === 'vehicle')) { hitT = 0.28; const h = q('#ol-hit'); h.classList.toggle('head', e.head); audio.play(e.head ? 'headshot' : 'hit'); }
          else if (e.victim === PLAYER_ID) { audio.play('hurt'); hurtVig = Math.min(1, hurtVig + 0.45); chase.shake(0.3); }
          else if (e.kind === 'wall') at('bullet_wall', e.x, e.z); else at('hit', e.x, e.z);
          break;
        }
        case 'explosion': { at('explosion', e.x, e.z); const d = camDist(e.x, e.z); chase.shake(clamp(1 - d / 130, 0, 1)); shakeFov = Math.max(shakeFov, clamp(6 - d / 20, 0, 6)); break; }
        case 'crash': { const d = camDist(e.x, e.z); audio.crash(clamp(e.power / 18, 0, 1), d); if (d < 25) chase.shake(clamp(e.power / 40, 0, 0.6)); break; }
        case 'death': { if (e.by === PLAYER_ID && e.id !== PLAYER_ID) { hitT = 0.55; q('#ol-hit').classList.add('kill'); audio.play('hitmark'); } if (e.id !== PLAYER_ID) { const v = sim.ped(e.id); if (v) at('scream', v.x, v.z); } break; }
        case 'enter': { if (e.ped === PLAYER_ID) { const v = sim.vehicle(e.vehicle); if (v) { yaw = v.h; pitch = 0.12; } audio.play('door'); } break; }
        case 'exit': { if (e.ped === PLAYER_ID) { yaw = sim.player.yaw; pitch = 0; audio.setRadio(0); station = 0; audio.play('door'); } break; }
        case 'honk': { const v = sim.vehicle(e.id); if (v) at('honk', v.x, v.z); break; }
        case 'scream': { const v = sim.ped(e.id); if (v) at('scream', v.x, v.z); break; }
        case 'pickup': { if (e.ped === PLAYER_ID) { audio.play(e.kind === 'weapon' ? 'weapon_pickup' : e.kind === 'cash' ? 'cash' : 'pickup'); if (e.kind !== 'cash') toast(e.kind === 'health' ? '체력 회복' : e.kind === 'armor' ? '방탄복 획득' : e.kind === 'weapon' ? '무기 획득' : e.kind === 'ammo' ? '탄약 획득' : '꾸러미 획득', 2); } break; }
        case 'cash': { if (e.amount !== 0) floater((e.amount > 0 ? '+' : '−') + money(Math.abs(e.amount)), e.amount > 0 ? 'up' : 'down'); break; }
        case 'wanted': {
          if (e.stars > e.prev) { audio.play('wanted_up'); big('<span class="w">WANTED</span><span class="s">' + '★'.repeat(e.stars) + '</span>', 'wanted', 2000); }
          else if (e.stars === 0 && e.prev > 0) { audio.play('wanted_down'); big('WANTED LEVEL LOST', 'lost', 2400); }
          break;
        }
        case 'msg': toast(e.text, e.sec); break;
        case 'mission': {
          if (e.what === 'start') { audio.play('mission_start'); }
          else if (e.what === 'pass') { audio.play('mission_pass'); const m = MISSION_LIST.find(x => x.id === e.id); big(`<span class="mp">MISSION PASSED</span><span class="mr" id="ol-reward"></span><span class="mn">${esc(m?.title ?? e.text)}</span>`, 'pass', 4200); if (m) countUp(q('#ol-reward'), m.reward, '+'); save(); }
          else if (e.what === 'fail') { audio.play('mission_fail'); big(`<span class="mf">MISSION FAILED</span><span class="mn">${esc(e.text)}</span>`, 'fail', 3200); }
          else toast(e.text, 3);
          break;
        }
        case 'style': showStyle(e.text, e.amount, e.combo); break;
        case 'activity': { if (e.what === 'pass') { audio.play('mission_pass'); toast('✔ ' + e.text, 3.6); } else if (e.what === 'fail') { audio.play('mission_fail'); toast('✖ ' + e.text, 3.6); } else { toast(e.text, 3.4); if (e.what === 'start') audio.play('mission_start'); } break; }
        case 'busted': audio.play('busted'); break;
        case 'wasted': audio.play('wasted'); break;
        case 'respawn': audio.play('door'); break;
        case 'save': save(); audio.play('save'); toast('저장됨', 1.8); break;
        default: break;
      }
    }
  }
  function showStyle(text: string, amount: number, combo: number): void {
    const el = q('#ol-style'); el.className = 'ol-style'; void el.offsetWidth;
    const mult = sim?.activity.style.mult ?? 1; el.className = `ol-style on m${Math.min(5, mult)}`;
    el.innerHTML = `<b>${esc(text)}</b><i>+${money(amount)}</i>${combo > 1 ? `<u>×${mult}</u>` : ''}`; audio.play('cash');
  }

  // ---------- 입력 수집 ----------
  const pin = blankPedInput(), cin = blankCarInput();
  function gather(): { p: PedInput; c: typeof cin } {
    const p = sim!.player, car = p.vehicle ? sim!.vehicle(p.vehicle) : undefined;
    const kx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + tc.mx, kz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - tc.my;
    const aim = (mouse.aim || tc.aim) && !car, fire = (mouse.fire || tc.fire) && !wheelOpen;
    const out = blankPedInput(); out.fire = fire && !car; out.aim = aim; out.jump = keys.has('Space') || tc.jump; out.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || tc.sprint; out.crouch = keys.has('KeyC'); out.reload = reloadReq;
    out.slot = slotReq; out.enter = false; out.pitch = chase?.aimPitch ?? pitch;
    const fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -Math.sin(yaw), rz = Math.cos(yaw);
    const wx = fx * kz + rx * kx, wz = fz * kz + rz * kx, mag = Math.min(1, Math.hypot(kx, kz));
    if (mag > 0.05 && !car) {
      if (aim || fire) { out.yaw = chase?.aimYaw ?? yaw; out.mz = kz; out.mx = kx; }
      else { out.yaw = Math.atan2(wz, wx); out.mz = mag; out.mx = 0; }
    } else out.yaw = (aim || fire) ? (chase?.aimYaw ?? yaw) : p.yaw;
    if (!car && (aim || fire)) out.yaw = chase?.aimYaw ?? yaw;
    Object.assign(pin, out);
    cin.throttle = (keys.has('KeyW') || tc.gas ? 1 : 0); cin.brake = (keys.has('KeyS') || tc.brake ? 1 : 0);
    cin.steer = clamp((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (tc.right ? 1 : 0) - (tc.left ? 1 : 0) + (touch ? tc.mx : 0), -1, 1);
    cin.handbrake = keys.has('Space') || tc.hand; cin.horn = keys.has('KeyH');
    return { p: pin, c: cin };
  }

  // ---------- 루프 ----------
  function resize(): void {
    if (!renderer) return; const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), ratio = renderPixelRatio(w, h, devicePixelRatio, prefs.quality); if (ratio !== renderer.getPixelRatio()) { renderer.setPixelRatio(ratio); composer?.setPixelRatio(ratio); } renderer.setSize(w, h, false); composer?.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function tick(dt: number): void {
    if (!sim || !chase || !cityView || !actorView || !renderer || !minimap) return;
    const p = sim.player, car: Vehicle | undefined = p.vehicle ? sim.vehicle(p.vehicle) : undefined;
    // 시뮬레이션
    let scale = 1; if (wheelOpen) scale = 0.2; else if (sim.downKind === 'wasted') scale = 0.45;
    const playing = phase === 'play' || phase === 'trans';
    if (!paused || (versus && !versus.ended)) {
      acc += Math.min(dt, 0.1) * scale; let n = 0;
      const inp = playing && !paused && p.alive && !sim.downKind ? gather() : { p: blankPedInput(), c: blankCarInput() };
      while (acc >= STEP && n < 6) { inp.p.enter = n === 0 && enterReq; sim.step(STEP, inp.p, inp.c); acc -= STEP; n++; if (n === 1) { enterReq = false; slotReq = -1; reloadReq = false; inp.p.slot = -1; inp.p.reload = false; } }
      if (n === 6) acc = 0;
      if (phase === 'menu') sim.clock = (sim.clock < TITLE_CLOCK - 0.02 || sim.clock > TITLE_CLOCK + 0.5) ? TITLE_CLOCK : sim.clock;
    }
    const events = sim.drain();
    if (versus) {
      versus.update(dt, events);
      const seconds = Math.ceil(versus.left);
      const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      const scores = versus.board().map(b => `<span>${esc(b.name)} ${b.kills}</span>`).join(' ');
      html('vs', `<b>${time}</b> · 목표 ${versus.killLimit}킬<div class="ol-vs-scores">${scores}</div>`);
    }
    actorView.handle(events); if (playing) handleEvents(events);
    // 카메라
    const target = car ? { x: car.x, y: car.y, z: car.z, yaw: car.h, speed: car.vf } : { x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed };
    if (phase === 'menu') {
      const t = performance.now() / 1000, a = t * 0.045, r = 130, cx = p.x, cz = p.z;
      camera.position.set(cx + Math.cos(a) * r, 62 + Math.sin(t * 0.2) * 6, cz + Math.sin(a) * r); camera.lookAt(cx + Math.cos(a + 1.1) * 30, 8, cz + Math.sin(a + 1.1) * 30); camera.fov = 62; camera.updateProjectionMatrix();
    } else {
      const air = !car && !p.grounded, aim = (mouse.aim || tc.aim) && !car;
      if (!paused) chase.update(Math.min(dt, 0.05), car ? 'car' : 'foot', target, { yaw, pitch }, { aim, lookBack: !!car && keys.has('KeyC'), air });
      if (phase === 'trans') {
        transT += dt / 1.5; const e = transT * transT * (3 - 2 * transT); const cp = camera.position.clone(), cq = camera.quaternion.clone();
        camera.position.lerpVectors(orbitPos, cp, Math.min(1, e)); camera.quaternion.slerpQuaternions(orbitQuat, cq, Math.min(1, e)); if (transT >= 1) phase = 'play';
      }
      if (shakeFov > 0.01) { camera.fov += shakeFov; camera.updateProjectionMatrix(); shakeFov *= 0.86; }
    }
    cityView.update(dt, camera, sim.clock, sim.t, sim.rain); actorView.update(dt, camera, sim.clock);
    if (composer && bloom && prefs.quality !== 'low') { const n = cityView?.night ?? 0, r = sim?.rain ?? 0; bloom.strength = .18 + n * .55 + r * .14; composer.render(dt); } else renderer.render(scene, camera);
    if (playing) hud(dt, car);
    if (phase !== 'menu') { saveT += dt; if (saveT > 30) { saveT = 0; if (p.alive) save(); } }
  }

  function camYawNow(): number { const d = new THREE.Vector3(); camera.getWorldDirection(d); return Math.atan2(d.z, d.x); }

  function hud(dt: number, car: Vehicle | undefined): void {
    const s = sim!, p = s.player, cy = camYawNow();
    set('cash', money(s.cash)); const hh = Math.floor(s.clock), mm = Math.floor((s.clock - hh) * 60); set('clock', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    const w = s.wanted; const stars = q('#ol-stars'); const sk = `${w.stars}|${w.evadeT > 0 ? Math.floor(performance.now() / 350) % 2 : 0}|${w.unseenT < 3 ? 1 : 0}`;
    if (cache.get('stars') !== sk) { cache.set('stars', sk); stars.className = 'ol-stars' + (w.evadeT > 0 && w.stars > 0 ? ' search' : '') + (w.stars > 0 && w.unseenT < 3 ? ' seen' : ''); [...stars.children].forEach((el, i) => el.classList.toggle('on', i < w.stars)); if (w.evadeT > 0 && Math.floor(performance.now() / 350) % 2) stars.classList.add('dim'); }
    set('hpn', String(Math.ceil(Math.max(0, p.hp)))); style('hp', 'width', `${clamp(p.hp / p.maxHp, 0, 1) * 100}%`); set('arn', String(Math.ceil(p.armor))); style('ar', 'width', `${clamp(p.armor, 0, 100)}%`);
    root.classList.toggle('lowhp', p.alive && p.hp < p.maxHp * 0.3);
    const g = s.curGun(p), d = g ? WEAPONS[g.id] : WEAPONS.fist; set('wname', d.name); set('mag', d.melee ? '∞' : String(g?.mag ?? 0)); set('res', d.melee ? '' : `/ ${g?.reserve ?? 0}`);
    html('slots', WEAPON_ORDER.map((_id, i) => `<i class="${p.guns[i] ? 'has' : ''} ${i === p.cur ? 'cur' : ''}">${i + 1}</i>`).join(''));
    set('dname', districtName(p.x, p.z, s.map));
    if (s.frame % 2 === 0) minimap!.draw(radar, s, cy);
    // 속도계
    root.classList.toggle('incar', !!car); if (car) { set('kmh', String(Math.round(Math.abs(car.vf) * 3.6))); style('dmg', 'width', `${clamp(car.hp / car.maxHp, 0, 1) * 100}%`); const spd = Math.abs(car.vf); style('lines', 'opacity', String(clamp((spd - 28) / 30, 0, 0.9))); } else style('lines', 'opacity', '0');
    if (car && !car.alive) style('lines', 'opacity', '0');
    radioToast = Math.max(0, radioToast - dt); set('radio', radioToast > 0 && car ? (station ? '♪ ' + audio.currentStationName() : '라디오 끔') : '');
    // 미션/활동 패널
    const mi = s.mission.active ? MISSION_LIST.find(m => m.id === s.mission.active) : null;
    const act = s.activity;
    if (mi) { q('#ol-mission').hidden = false; set('mtag', '의뢰'); set('mtitle', mi.title); set('mtext', s.mission.text); const t = s.mission.timer; set('mtimer', t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : ''); }
    else if (s.job.active) { q('#ol-mission').hidden = false; set('mtag', '일거리'); set('mtitle', s.job.title); set('mtext', s.job.text); const t = s.job.timer; set('mtimer', t > 0 && s.job.active !== 'fight' ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : ''); }
    else if (act.active && act.text) { q('#ol-mission').hidden = false; set('mtag', '사이드'); set('mtitle', ({ taxi: '택시', armored: '현금수송차', bounty: '현상금', rampage: '렘페이지', vigilante: '소탕', race: '스트리트 레이스', export: '차량 수출' } as Record<string, string>)[act.active] ?? '활동'); set('mtext', act.text); const t = act.timer; set('mtimer', t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : ''); }
    else q('#ol-mission').hidden = true;
    bannerT = s.mission.bannerT; set('banner', s.mission.banner && bannerT > 0 ? s.mission.banner : ''); q('#ol-banner').classList.toggle('on', !!s.mission.banner && bannerT > 0);
    // 스타일 게이지
    const st = act.style; style('sg', 'width', `${clamp(st.timer / 5, 0, 1) * 100}%`); set('sgm', st.combo > 0 ? `COMBO ×${st.mult}` : ''); q('#ol-sgauge').classList.toggle('on', st.combo > 0);
    // 조준·십자선
    if (s.frame % 6 === 0) aimedAtEnemy = isEnemyAhead(cy);
    const cross = q('#ol-cross'); const aiming = (mouse.aim || tc.aim) && !car; cross.className = 'ol-cross' + (car ? ' hide' : '') + (aiming ? ' aim' : '') + (aimedAtEnemy ? ' enemy' : '');
    hitT = Math.max(0, hitT - dt); const h = q('#ol-hit'); h.style.opacity = String(clamp(hitT / 0.28, 0, 1)); if (hitT === 0) h.classList.remove('kill');
    // 프롬프트
    const it = (!modalKind && p.alive) ? interaction() : null; set('prompt', it?.text ?? ''); q('#ol-prompt').classList.toggle('on', !!it);
    // 피격 연출
    hurtVig = Math.max(0, hurtVig - dt * 1.4); const lowPulse = p.alive && p.hp < p.maxHp * 0.3 ? 0.35 + Math.sin(performance.now() / 160) * 0.2 : 0;
    style('vig', 'opacity', String(clamp(Math.max(hurtVig, lowPulse), 0, 1)));
    const dir = q('#ol-dir'); if (p.hurt > 0.05 && p.alive) { dir.style.opacity = String(clamp(p.hurt * 2, 0, 1)); dir.style.transform = `rotate(${(p.hurtYaw - cy) * 180 / Math.PI + 90}deg)`; } else dir.style.opacity = '0';
    // 쓰러짐/체포
    const down = s.downKind; const gray = q('#ol-gray'); gray.className = 'ol-gray' + (down ? ' on ' + down : '');
    if (down && cache.get('down') !== down) { cache.set('down', down); big(down === 'wasted' ? 'WASTED' : 'BUSTED', down, 4200); } else if (!down && cache.get('down')) { cache.set('down', ''); q('#ol-big').className = 'ol-big'; }
    // 토스트 수명
    const now = performance.now(); while (toastList.length && toastList[0].at < now) toastList.shift()!.el.remove();
    // 오디오 갱신
    audioFrame(car);
  }

  function isEnemyAhead(cy: number): boolean {
    const s = sim!, p = s.player; const ey = s.eyeY(p), dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    for (const q2 of s.peds) { if (!q2.alive || q2.id === PLAYER_ID || !s.hostile(p.team, q2.team)) continue; const dx = q2.x - camera.position.x, dz = q2.z - camera.position.z, dy = q2.y + 1.2 - camera.position.y, d = Math.hypot(dx, dz, dy); if (d > 70 || d < 2) continue; if ((dx * dir.x + dy * dir.y + dz * dir.z) / d > 0.9945) return s.canSee(p.x, p.z, q2.x, q2.z, ey - 0.1); }
    void cy; return false;
  }

  function audioFrame(car: Vehicle | undefined): void {
    const s = sim!; if (!audio.enabled) return;
    if (car) { audio.setEngine(true, car.kind, Math.abs(car.vf), car.input.throttle); audio.setSkid(clamp((Math.abs(car.vl) - 3) / 8, 0, 1) * (Math.abs(car.vf) > 4 ? 1 : 0)); audio.setWind(clamp((Math.abs(car.vf) - 15) / 40, 0, 1)); } else { audio.setEngine(false, 'sedan', 0, 0); audio.setSkid(0); audio.setWind(0); }
    let best = Infinity, pan = 0; const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const v of s.vehicles) if (v.siren && v.alive) { const dx = v.x - camera.position.x, dz = v.z - camera.position.z, d = Math.hypot(dx, dz); if (d < best) { best = d; pan = d > 1 ? clamp((dx * r.x + dz * r.z) / d, -1, 1) : 0; } }
    audio.setSiren(best < 160 ? 1 - best / 160 : 0, pan);
    audio.setRain(s.rain); const h = s.clock; audio.setAmbience(clamp(1 - Math.abs(h - 14) / 12, 0.1, 1), h > 20 || h < 5.5);
  }

  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try { tick(dt); } catch (err) { console.error(err); }
  }

  function exit(): void {
    if (closed) return; closed = true; cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', movePtr); window.removeEventListener('pointerup', endPtr); window.removeEventListener('pointercancel', endPtr); document.removeEventListener('visibilitychange', resetInput);
    for (const [t, f] of [['keydown', onKeyDown], ['keyup', onKeyUp], ['mousemove', onMouseMove], ['mouseup', onMouseUp], ['wheel', onWheel], ['blur', resetInput], ['resize', resize]] as Array<[string, EventListener]>) window.removeEventListener(t, f);
    lobby?.close(); versus?.dispose(); document.removeEventListener('pointerlockchange', onLock); if (document.pointerLockElement) document.exitPointerLock();
    try { actorView?.dispose(); cityView?.dispose(); } catch { /* 정리 실패는 무시 */ }
    audio.dispose(); if (composer) { for (const pass of composer.passes) pass.dispose(); composer.dispose(); } renderer?.dispose(); renderer?.forceContextLoss(); root.remove(); onExit();
  }

  // ---------- 부팅 ----------
  q('.ol-title').addEventListener('keydown', () => undefined);
  void (async () => {
    opts.loading?.progress(0, '도시 모델을 불러오는 중');
    assets = await loadOutlawAssets(base, (f, note) => opts.loading?.progress(f * 0.9, note), n => opts.loading?.note(n)).catch(() => null);
    if (closed) { opts.loading?.close(); return; }
    opts.loading?.progress(0.92, '도시를 짓는 중');
    await new Promise(r => setTimeout(r, 30));
    if (closed) { opts.loading?.close(); return; }
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: prefs.quality !== 'low', powerPreference: 'high-performance' });
      renderer.setPixelRatio(renderPixelRatio(innerWidth, innerHeight, devicePixelRatio, prefs.quality));
      if (prefs.quality !== 'low') { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .3, .6, .82); composer.addPass(bloom); composer.addPass(new OutputPass()); }
      sim = new Sim(SEED); sim.clock = TITLE_CLOCK;
      cityView = new CityView(scene, renderer, sim.map, assets, prefs.quality); cityView.onLightning = delay => { const active = sim; setTimeout(() => { if (!closed && sim === active) audio.play('thunder'); }, delay * 1000); }; actorView = new ActorView(scene, sim, assets, prefs.quality);
      chase = new ChaseCamera(camera, sim.map); minimap = new Minimap(sim.map); resize();
      for (let i = 0; i < 90; i++) sim.step(STEP, blankPedInput(), blankCarInput()); sim.drain();
    } catch (err) { console.error(err); opts.loading?.close(); toast('그래픽을 시작하지 못했습니다'); exit(); return; }
    phase = 'menu'; showTitle(); opts.loading?.close(); raf = requestAnimationFrame(frame);
    if (import.meta.env.DEV) {
      const dbg = { sim, cam: camera, get phase() { return phase; }, begin, teleport: (x: number, z: number) => { sim!.player.x = x; sim!.player.z = z; }, give: (id: string) => sim!.giveWeapon(sim!.player, id as never), get hud() { return hudEl; } };
      (window as unknown as { __ol: typeof dbg }).__ol = dbg;
    }
  })();
  void VEHICLES; void wrapAngle;
}
