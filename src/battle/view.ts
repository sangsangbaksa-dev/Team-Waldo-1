import * as THREE from 'three';
import { createBattleWorld, FACTION_COLORS } from './graphics';
import { createAdventure } from './adventure';
import { SQUAD_NAMES, squadUnits, assignSquad, dismissSquad, commandSquad, squadDestination, squadOrderLabel, type SquadId, type SquadCommand } from './squads';
import { loadWar, saveWar, deleteWarSave } from './save';
import { worldToMinimap, minimapToWorld, pickMapTarget, type StrategicTarget } from './mapCommands';
import { BattleAudio } from './audio';
import { readPreferences, writePreferences, recordMatch } from './preferences';
import { icon } from '../ui/icons';
import { showDialog } from '../ui/dialog';
import {
  createWar, stepWar, upgrade, train, trainSquad, repair, setPolicy, setReserve, order, cost, maxUnitsFor,
  NAMES, OUTPOST_NAMES, OUTPOST_BONUSES, UNIT_STATS, MAP_HALF_SIZE, captureOrder,
  DIFFICULTIES, RESEARCH, research, researchCost, getIncome, stormStartFor, stormDamage,
  type Difficulty, type EconomyPolicy, type UnitKind, type Upgrade, type Research,
} from './war';

const FACTIONS = ['에메랄드 왕국', '붉은 사자', '황금 태양', '보랏빛 달'];
const UNIT_KINDS: UnitKind[] = ['infantry', 'archer', 'guardian', 'cavalry'];
const UNIT_ROLES = ['균형 잡힌 전선의 중심', '후방에서 지원하는 원거리 병력', '높은 체력으로 버티는 중장갑 병력', '빠른 이동으로 거점을 선점하는 기동대'];
const BUILDINGS: { key: Upgrade; label: string; symbol: string; description: string }[] = [
  { key: 'mine', label: '금광', symbol: 'coin', description: '금 생산 +1.5/초 · 정책·연구 적용 전' },
  { key: 'farm', label: '농장', symbol: 'leaf', description: '식량 생산 +1.3/초 · 정책·연구 적용 전' },
  { key: 'barracks', label: '병영', symbol: 'army', description: '병종 해금 · 병사 공격력 증가' },
  { key: 'fort', label: '본부 방어', symbol: 'tower', description: '최대 체력 +100 · 방어탑 공격력 증가' },
];
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const factionColor = (id: number) => '#' + FACTION_COLORS[id].toString(16).padStart(6, '0');
const price = (gold: number, food: number) => `${Math.ceil(gold)} 금 · ${Math.ceil(food)} 식량`;
export interface WarViewOptions { forceNew?: boolean; difficulty?: Difficulty; grandBattle?: boolean; }

export function openWar(onExit: () => void, options: boolean | WarViewOptions = false): void {
  if (document.querySelector('.war-ui')) return;
  const settings = typeof options === 'boolean' ? { forceNew: options } : options;
  const saved = settings.forceNew ? null : loadWar();
  const resumed = Boolean(saved && saved.factions[0].alive && !saved.over);
  const w = resumed && saved ? saved : createWar({ difficulty: settings.difficulty, grandBattle: settings.grandBattle });
  const armyLimit = maxUnitsFor(w);
  const recruitBatch = w.grandBattle ? 25 : 3;
  const reserveAmounts = w.grandBattle ? [0, 10, 25, 50] : [0, 2, 4, 6];
  const prefs = readPreferences();
  const audio = new BattleAudio(); audio.unlock(); audio.setMuted(!prefs.sound);
  const overlay = document.createElement('main'); overlay.className = 'war-ui'; overlay.setAttribute('aria-label', '왕국 전쟁 전장');
  overlay.innerHTML = `
    <div class="war-view" aria-label="3D 전장"></div>
    <header class="war-top">
      <button class="war-brand" id="exit" aria-label="저장하고 왕국 메뉴로">${icon('crown', 24)}<span>WALDO<small>KINGDOMS AT WAR</small></span></button>
      <div class="resource-strip" aria-label="내 왕국 자원">
        <div class="resource gold">${icon('coin')}<span><b id="gold">140</b><small id="gold-income"></small></span></div>
        <div class="resource food">${icon('leaf')}<span><b id="food">100</b><small id="food-income"></small></span></div>
        <div class="resource army">${icon('army')}<span><b id="army-count">${w.grandBattle ? 100 : 4} / ${armyLimit}</b><small>보유 병력</small></span></div>
        <div class="resource territory">${icon('flag')}<span><b id="territory-count">0 / 9</b><small>점령 거점</small></span></div>
      </div>
      <div class="battle-time"><b id="war-clock">00:00</b><span id="difficulty-badge"></span></div>
      <div class="war-tools">
        <button id="speed" class="tool-button" title="게임 속도 변경" aria-label="게임 속도 0.65배">0.65×</button>
        <button id="pause" class="tool-button" title="일시정지 (Esc)" aria-label="일시정지">${icon('pause')}</button>
        <button id="sound" class="tool-button optional-tool" title="효과음 켜기/끄기" aria-label="효과음 끄기">${icon('sound')}</button>
        <button id="help" class="tool-button" title="게임 도움말" aria-label="게임 도움말">${icon('help')}</button>
        <button id="settings" class="tool-button optional-tool" title="화면 설정" aria-label="화면 설정">${icon('settings')}</button>
      </div>
    </header>
    <aside class="war-panel" aria-label="왕국 관리">
      <div class="kingdom-heading"><span class="faction-mark">${icon('shield', 23)}</span><div><span class="kicker">YOUR KINGDOM</span><h1>에메랄드 왕국</h1></div><button class="tool-button" id="home" title="내 영지로 이동 (H)" aria-label="내 영지로 이동">${icon('home', 17)}</button></div>
      ${w.grandBattle ? '<div class="grand-battle-tag">⚔ 대규모 전장 · 아군 100명 VS 적 500명</div>' : ''}
      <div class="hq-line"><span>본부 내구도</span><b id="hq-value"></b></div><div class="hq-meter"><i id="hq-fill"></i></div>
      <nav class="war-tabs" aria-label="왕국 관리 탭" role="tablist">
        <button role="tab" id="tab-economy" aria-selected="true" aria-controls="pane-economy" data-tab="economy">${icon('coin', 16)}경영</button>
        <button role="tab" id="tab-army" aria-selected="false" aria-controls="pane-army" data-tab="army" tabindex="-1">${icon('army', 16)}병력</button>
        <button role="tab" id="tab-orders" aria-selected="false" aria-controls="pane-orders" data-tab="orders" tabindex="-1">${icon('flag', 16)}작전</button>
        <button role="tab" id="tab-research" aria-selected="false" aria-controls="pane-research" data-tab="research" tabindex="-1">${icon('science', 16)}연구</button>
      </nav>
      <div class="war-panel-scroll">
        <section id="pane-economy" class="war-tab-pane" role="tabpanel" aria-labelledby="tab-economy"><div class="section-heading"><h2>생산과 성장</h2><span>최대 Lv.4</span></div><div id="buildings" class="action-list"></div><div class="section-heading"><h2>왕국 정책</h2></div><div id="policy" class="segmented"></div><p id="policy-description" class="panel-note"></p><button id="repair" class="repair-button">${icon('shield', 17)}<span>본부 수리<small>체력 +100 · 금 45 / 식량 25</small></span></button></section>
        <section id="pane-army" class="war-tab-pane" role="tabpanel" aria-labelledby="tab-army" hidden><div class="section-heading"><h2>병종 훈련</h2><span>숫자 1–4</span></div><div id="unit-train"></div><div class="section-heading"><h2>본부 수비대</h2></div><div id="reserve" class="segmented"></div><p class="panel-note">지정한 병력은 본부를 지킵니다. 나머지 병력이 작전 명령을 수행합니다.</p></section>
        <section id="pane-orders" class="war-tab-pane" role="tabpanel" aria-labelledby="tab-orders" hidden>
          <div class="squad-manager" aria-label="부대 그룹 편성">
            <div class="section-heading"><h2>부대 편성 및 직접 이동</h2><span>3개 그룹</span></div>
            <div class="squad-tabs" aria-label="선택할 부대 그룹">
              <button data-squad-select="0" aria-pressed="true">① 주력군 <small>${w.grandBattle ? 100 : 4}명</small></button>
              <button data-squad-select="1" aria-pressed="false">② 기동대 <small>0명</small></button>
              <button data-squad-select="2" aria-pressed="false">③ 수비대 <small>0명</small></button>
            </div>
            <p class="squad-order-status" id="squad-order-status" role="status">주력군 · 기본 작전</p>
            <div class="squad-actions">
              <button id="squad-assign">+${w.grandBattle ? 25 : 3}명 편성</button>
              <button id="squad-release">주력군에 합류</button>
              <button id="squad-home">선택 부대 → 본부</button>
              <button id="squad-move-mode">지도에서 이동 지점 지정</button>
            </div>
            <p class="panel-note">①②③ 부대 선택 → 전장이나 미니맵에서 목적지를 클릭하세요. 아무 땅으로도 이동할 수 있으며, 아군 본부를 찍으면 복귀합니다. <kbd>5</kbd><kbd>6</kbd><kbd>7</kbd> 그룹 전환 · <kbd>G</kbd> 이동 모드 · <kbd>B</kbd> 본부 복귀</p>
          </div>
          <div class="section-heading"><h2>공격 및 방어 명령</h2></div><div id="targets" class="action-list"></div><div class="section-heading"><h2>거점 점령</h2><span>9개 전략 거점</span></div><div id="outposts" class="outpost-list"></div><p class="panel-note">거점마다 생산 자원이 다릅니다. 점령 거점 1개당 본부 폭풍 피해가 12% 감소합니다 (최대 60%).</p></section>
        <section id="pane-research" class="war-tab-pane" role="tabpanel" aria-labelledby="tab-research" hidden><div class="section-heading"><h2>왕국 연구소</h2><span>병영 Lv.2 해금</span></div><p class="panel-note">연구 효과는 모든 아군 병력에 즉시 적용됩니다. 각 연구는 3단계까지 성장합니다.</p><div id="research" class="action-list"></div><div class="research-summary" id="research-summary"></div></section>
      </div>
      <footer class="panel-footer"><span id="save-status" role="status">15초마다 자동 저장</span><span class="render-performance" id="render-fps" title="지난 1초 동안 실제로 그린 화면 수" aria-label="화면 렌더링 프레임 속도">— FPS</span><button id="save" class="text-button">${icon('save', 14)}저장</button></footer>
    </aside>
    <section class="mission-card" aria-label="현재 목표"><div class="mission-icon">${icon('flag', 21)}</div><div><span class="kicker">NEXT OBJECTIVE</span><h2 id="mission-title"></h2><p id="mission-description"></p></div><button id="mission-action" class="tool-button" aria-label="목표로 이동">${icon('arrow', 18)}</button></section>
    <aside class="war-intel" aria-label="전황"><div class="section-heading"><h2>왕국 현황</h2><span id="alive-count">4 세력</span></div><div id="standings"></div><div class="event-heading">전장 소식<span class="live-dot"></span></div><div id="events" class="war-events" aria-live="polite" aria-relevant="additions"></div></aside>
    <div class="storm-warning" id="storm-warning" hidden>${icon('bolt', 17)}<span id="storm-warning-text"></span></div>
    <section class="war-minimap" aria-label="전장 지도"><div class="map-heading"><span>${icon('map', 15)}전략 지도</span><button id="map-mode" class="text-button" aria-pressed="false">시점 이동</button></div><canvas id="war-map" width="220" height="220" aria-label="미니맵: 그룹 선택 후 위치 지정 모드에서는 원하는 좌표를 클릭해 출전합니다. 아군 본부 클릭으로 복귀합니다." tabindex="0"></canvas><div class="map-footer"><span id="storm-clock"></span><span id="zone-size"></span></div></section>
    <div class="camera-controls"><button id="zoom-in" class="tool-button" aria-label="확대">+</button><button id="zoom-out" class="tool-button" aria-label="축소">−</button><button id="overview" class="tool-button" aria-label="전장 전체 보기">${icon('expand', 18)}</button><button id="panel-toggle" class="tool-button mobile-only" aria-label="관리 패널 접기" aria-expanded="true">${icon('chevron', 18)}</button></div>
    <div class="war-help"><span><kbd>WASD</kbd> 시점 이동</span><span>드래그: 회전</span><span><kbd>5–7</kbd> 부대 선택</span><span><kbd>G</kbd> 이동 · <kbd>B</kbd> 본부</span></div>
    <nav class="squad-quickbar" aria-label="빠른 부대 지휘">
      <span>부대 지휘</span>
      <button data-squad-select="0" aria-pressed="true">① 주력군 <small>${w.grandBattle ? 100 : 4}명</small></button>
      <button data-squad-select="1" aria-pressed="false">② 기동대 <small>0명</small></button>
      <button data-squad-select="2" aria-pressed="false">③ 수비대 <small>0명</small></button>
      <button id="quick-move" aria-pressed="false">📍 위치 지정</button>
      <button id="quick-home">⌂ 본부</button>
    </nav>
    <div class="target-card" id="target-card" hidden><button id="target-close" class="target-close tool-button" aria-label="대상 닫기">${icon('close', 16)}</button><span class="kicker" id="target-type"></span><h3 id="target-name"></h3><p id="target-description"></p><button id="target-command" class="button primary">병력 출전 ${icon('arrow', 16)}</button></div>
    <div class="adventure-switch"><button id="adventure-enter" class="button primary">직접 플레이 (V) · 낙하산/탐험</button></div>
    <section id="adventure-hud" class="adventure-hud" aria-label="직접 조작" hidden>
      <div class="adventure-head"><span class="kicker">DIRECT CONTROL</span><h2 id="adventure-title"></h2><p id="adventure-description"></p><div class="adventure-progress"><i id="adventure-progress-fill"></i></div></div>
      <span class="adventure-crosshair" aria-hidden="true">+</span>
      <div class="adventure-actions">
        <button id="adventure-tower" class="button primary" hidden>성벽 올라가기 (E)</button>
        <button id="adventure-down" class="button secondary" hidden>성벽 내려가기 (E)</button>
        <button id="adventure-fire" class="button primary">활 발사 (F)</button>
        <button id="adventure-strategy" class="button secondary">전략 지도 (T)</button>
      </div>
      <div class="adventure-pad" aria-label="터치 이동">
        <button data-move="w" aria-label="앞으로 이동">↑</button>
        <button data-move="a" aria-label="왼쪽 이동">←</button>
        <button data-move="s" aria-label="뒤로 이동">↓</button>
        <button data-move="d" aria-label="오른쪽 이동">→</button>
      </div>
    </section>
    <div class="war-toast" id="toast" role="status" hidden></div>
    <div class="war-end" hidden></div>`;
  document.body.append(overlay);
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => overlay.querySelector<T>(selector)!;
  const text = (selector: string, value: string) => { const node = el(selector); if (node.textContent !== value) node.textContent = value; };
  const mount = el<HTMLDivElement>('.war-view');
  let graphicsLost = false;
  let dead = false, done = false, paused = false, speed = .65, frame = 0, acc = 0, last = performance.now(), lastUI = 0;
  let toastUntil = 0, lastAutosave = w.time, previousEvent = '', lowHpWarned = false, wasThreatened = false, selectedTarget: StrategicTarget | null = null;
  let selectedSquad: SquadId = 0;
  let modalClose: (() => void) | null = null;
  const announce = (message: string) => { text('#toast', message); el('#toast').hidden = false; toastUntil = performance.now() + 3300; };
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: prefs.quality === 'high', alpha: false, powerPreference: 'high-performance' }); }
  catch {
    audio.dispose();
    overlay.innerHTML = `<section class="war-fallback"><span class="fallback-icon">${icon('tower', 40)}</span><span class="kicker">3D GRAPHICS UNAVAILABLE</span><h1>이 브라우저에서는<br>3D 전장을 열 수 없어요.</h1><p>WebGL을 지원하는 Chrome, Edge 또는 Safari에서<br>하드웨어 가속을 켜고 다시 접속해 주세요.<br>저장한 전투는 그대로 보관됩니다.</p><button id="back-to-menu" class="button primary">왕국 메뉴로 돌아가기 ${icon('arrow', 18)}</button></section>`;
    el<HTMLButtonElement>('#back-to-menu').onclick = () => { overlay.remove(); onExit(); };
    el<HTMLButtonElement>('#back-to-menu').focus();
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = prefs.quality === 'low' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = prefs.quality === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, prefs.quality === 'high' ? 1.65 : prefs.quality === 'low' ? .85 : 1));
  renderer.setSize(mount.clientWidth, mount.clientHeight); mount.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D 왕국 전장. 관리 패널에서도 모든 명령을 내릴 수 있습니다.');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, mount.clientWidth / mount.clientHeight, .1, 1300);
  const focus = new THREE.Vector3(-75, 0, -75);
  let angle = Math.PI + .72, zoom = innerWidth < 800 ? 155 : 175;
  let adventure: ReturnType<typeof createAdventure> | null = null;
  const cameraUpdate = () => { if (adventure?.isActionMode) return; camera.position.set(focus.x + Math.sin(angle) * zoom, zoom * .83, focus.z + Math.cos(angle) * zoom); camera.lookAt(focus); };
  const pan = (dx: number, dz: number) => { focus.x = THREE.MathUtils.clamp(focus.x + dx, -MAP_HALF_SIZE + 12, MAP_HALF_SIZE - 12); focus.z = THREE.MathUtils.clamp(focus.z + dz, -MAP_HALF_SIZE + 12, MAP_HALF_SIZE - 12); cameraUpdate(); };
  const setZoom = (value: number) => { zoom = THREE.MathUtils.clamp(value, 14, 680); cameraUpdate(); };
  cameraUpdate();
  const world = createBattleWorld(scene, w); world.setQuality(prefs.quality === 'high'); world.setReducedMotion(prefs.reducedMotion);
  const adventureControl = createAdventure(scene, camera, w, !resumed && import.meta.env.MODE !== 'test'); adventure = adventureControl;
  const controller = new AbortController(); const signal = controller.signal;
  overlay.addEventListener('pointerdown', () => audio.unlock(), { signal, capture: true });
  overlay.addEventListener('keydown', () => audio.unlock(), { signal, capture: true });
  const heldKeys = new Set<string>();
  const resize = () => { renderer.setSize(mount.clientWidth, mount.clientHeight); camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize, { signal });
  const missionObserver = new ResizeObserver(() => {
    overlay.style.setProperty('--mission-bottom', `${Math.ceil(el('.mission-card').getBoundingClientRect().bottom)}px`);
  });
  missionObserver.observe(el('.mission-card'));
  const home = () => { adventureControl.toStrategy(); focus.set(w.factions[0].x + 24, 0, w.factions[0].z + 24); setZoom(125); };
  const showTab = (name: string) => {
    overlay.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => { const active = button.dataset.tab === name; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    overlay.querySelectorAll<HTMLElement>('.war-tab-pane').forEach(pane => { pane.hidden = pane.id !== `pane-${name}`; });
    overlay.classList.remove('panel-collapsed'); el('#panel-toggle').setAttribute('aria-expanded', 'true'); el('#panel-toggle').setAttribute('aria-label', '관리 패널 접기');
  };
  overlay.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button, index, buttons) => {
    button.onclick = () => showTab(button.dataset.tab!);
    button.onkeydown = event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length; showTab(buttons[next].dataset.tab!); buttons[next].focus(); };
  });
  const perform = (action: () => boolean, message: string, cue: 'click' | 'upgrade' = 'click') => {
    if (done) return;
    if (action()) { audio.play(cue); announce(message); ui(); } else announce('자원, 해금 조건 또는 병력 수를 확인해 주세요.');
  };
  const addAction = (parent: string, id: string, label: string, description: string, symbol: string, action: () => void) => {
    const button = document.createElement('button'); button.id = id; button.className = 'war-action';
    button.innerHTML = `<span class="action-icon">${icon(symbol, 20)}</span><span class="action-copy"><b>${label}</b><small>${description}</small></span><span class="action-meta"></span>`;
    button.onclick = action; el(parent).append(button); return button;
  };
  for (const building of BUILDINGS) addAction('#buildings', `build-${building.key}`, building.label, building.description, building.symbol, () => perform(() => upgrade(w, 0, building.key), `${building.label}을 강화했습니다.`, 'upgrade'));
  const policyDescriptions: Record<EconomyPolicy, string> = { balanced: '표준 자원 생산과 전투 능력을 유지합니다.', growth: '금·식량 생산 +25%. 초반 영지 성장에 유리합니다.', war: '병사 공격력 +18%, 자원 생산 −12%. 공세에 유리합니다.' };
  for (const [key, label] of [['balanced', '균형'], ['growth', '성장'], ['war', '전시']] as [EconomyPolicy, string][]) {
    const button = document.createElement('button'); button.id = `policy-${key}`; button.textContent = label;
    button.onclick = () => perform(() => setPolicy(w, 0, key), `${label} 정책을 적용했습니다.`); el('#policy').append(button);
  }
  UNIT_KINDS.forEach((kind, i) => {
    const unit = UNIT_STATS[kind], card = document.createElement('article'); card.className = 'unit-card';
    card.innerHTML = `<div class="unit-heading"><span class="unit-symbol">${icon(i === 1 ? 'target' : i === 2 ? 'shield' : i === 3 ? 'bolt' : 'sword', 22)}</span><div><h3>${unit.label}<kbd>${i + 1}</kbd></h3><p>${UNIT_ROLES[i]}</p></div><b id="count-${kind}">0</b></div><div class="unit-stats">체력 ${unit.hp} <span>기본 공격 ${unit.damage}</span><span id="unlock-${kind}"></span></div><div class="unit-buttons"><button id="train-${kind}">1명 훈련<small>${price(unit.gold, unit.food)}</small></button><button id="squad-${kind}" aria-label="${unit.label} ${recruitBatch}명 일괄 동원">+${recruitBatch}<small>${price(unit.gold * recruitBatch, unit.food * recruitBatch)}</small></button></div>`;
    el('#unit-train').append(card);
    el<HTMLButtonElement>(`#train-${kind}`).onclick = () => perform(() => train(w, 0, kind), `${unit.label} 1명이 합류했습니다.`);
    el<HTMLButtonElement>(`#squad-${kind}`).onclick = () => perform(() => trainSquad(w, 0, kind, recruitBatch), `${unit.label} ${recruitBatch}명이 합류했습니다.`);
  });
  for (const amount of reserveAmounts) {
    const button = document.createElement('button'); button.id = `reserve-${amount}`; button.textContent = amount === 0 ? '전군 출전' : `${amount}명`;
    button.onclick = () => perform(() => setReserve(w, 0, amount), amount === 0 ? '전군이 작전에 참여합니다.' : `${amount}명을 본부 수비대로 지정했습니다.`); el('#reserve').append(button);
  }
  const commandTo = (command: SquadCommand): boolean => commandSquad(w, selectedSquad, command);
  const issueHome = () => {
    const success = selectedSquad === 0 ? order(w, 0, null) : commandTo({ kind: 'home' });
    if (success) { audio.play('click'); announce(SQUAD_NAMES[selectedSquad] + '이(가) 아군 본부로 복귀합니다.'); ui(); drawMap(); }
    else announce('선택한 부대에 병력이 없습니다. 먼저 병력을 편성해 주세요.');
  };
  const issue = (target: StrategicTarget) => {
    const success = selectedSquad === 0 ?
      target.kind === 'outpost' ? captureOrder(w, 0, target.id) : order(w, 0, target.id) :
      commandTo(target.kind === 'outpost' ? { kind: 'outpost', id: target.id } : { kind: 'faction', id: target.id });
    if (success) { audio.play('click'); announce(SQUAD_NAMES[selectedSquad] + ' → ' +
      (target.kind === 'outpost' ? OUTPOST_NAMES[target.id] + ' 점령' : FACTIONS[target.id] + ' 공격') + ' 명령을 내렸습니다.'); ui(); drawMap(); }
    else announce('이 부대에 병력이 없습니다. 작전 탭에서 먼저 편성하세요.');
  };
  const issuePosition = (x: number, z: number) => {
    const clampedX = THREE.MathUtils.clamp(x, -MAP_HALF_SIZE + 5, MAP_HALF_SIZE - 5);
    const clampedZ = THREE.MathUtils.clamp(z, -MAP_HALF_SIZE + 5, MAP_HALF_SIZE - 5);
    if (commandTo({ kind: 'move', x: clampedX, z: clampedZ })) {
      audio.play('click'); announce(SQUAD_NAMES[selectedSquad] + ' 이동! 지정 위치로 출발합니다.'); ui(); drawMap();
    } else announce('선택 부대에 병력이 없습니다. 주력군에서 3명 편성하세요.');
  };
  const issueAt = (x: number, z: number) => {
    const base = w.factions[0];
    if (Math.hypot(base.x - x, base.z - z) < 17) { issueHome(); return; }
    const target = pickMapTarget(w, 0, x, z);
    if (target) issue(target);
    else issuePosition(x, z);
  };
  addAction('#targets', 'defend', '본부 방어 · 부대 복귀', '선택한 그룹을 아군 본부로 이동', 'shield', issueHome);
  for (let id = 1; id < 4; id++) addAction('#targets', `attack-${id}`, FACTIONS[id], '상대 본부를 공격합니다', 'sword', () => issue({ kind: 'faction', id }));
  for (const post of w.outposts) {
    const income = OUTPOST_BONUSES[post.id];
    addAction('#outposts', `outpost-${post.id}`, OUTPOST_NAMES[post.id], `금 +${income.gold}/초 · 식량 +${income.food}/초`, 'flag', () => issue({ kind: 'outpost', id: post.id }));
  }
  for (const key of ['weapons', 'armor', 'logistics'] as Research[]) {
    const def = RESEARCH[key];
    addAction('#research', `research-${key}`, def.label, def.description, key === 'weapons' ? 'sword' : key === 'armor' ? 'shield' : 'leaf', () => perform(() => research(w, 0, key), `${def.label} 연구를 완료했습니다.`, 'upgrade'));
  }
  w.factions.forEach(f => {
    const row = document.createElement('button'); row.className = 'standing-row'; row.id = `faction-${f.id}`; row.style.setProperty('--faction', factionColor(f.id));
    row.innerHTML = `<i></i><span><b>${FACTIONS[f.id]}</b><small id="standing-${f.id}"></small></span><span class="faction-units" id="faction-units-${f.id}"></span>`;
    row.onclick = () => { focus.set(f.x, 0, f.z); setZoom(155); if (f.id !== 0) showTarget({ kind: 'faction', id: f.id }); }; el('#standings').append(row);
  });
  function showTarget(target: StrategicTarget): void {
    selectedTarget = target;
    if (target.kind === 'outpost') { const post = w.outposts[target.id]; const bonus = OUTPOST_BONUSES[target.id]; text('#target-type', post.owner === null ? 'NEUTRAL TERRITORY' : post.owner === 0 ? 'YOUR TERRITORY' : 'ENEMY TERRITORY'); text('#target-name', OUTPOST_NAMES[target.id]); text('#target-description', `점령 보너스 · 금 +${bonus.gold}/초 / 식량 +${bonus.food}/초`); }
    else { const f = w.factions[target.id]; text('#target-type', 'RIVAL KINGDOM'); text('#target-name', FACTIONS[target.id]); text('#target-description', `본부 체력 ${Math.ceil(f.hp)} / ${f.maxHp} · 병력 ${w.units.filter(u => u.owner === f.id).length}명`); }
    el('#target-card').hidden = false;
  }
  el<HTMLButtonElement>('#target-command').onclick = () => { if (selectedTarget) issue(selectedTarget); el('#target-card').hidden = true; };
  el<HTMLButtonElement>('#target-close').onclick = () => { el('#target-card').hidden = true; selectedTarget = null; };
  const writeSave = (manual = false): boolean => {
    if (done || !w.factions[0].alive || w.over) return false;
    const ok = saveWar(w); text('#save-status', ok ? `${clock(w.time)} 저장됨` : '저장 불가 · 브라우저 설정 확인');
    if (manual) announce(ok ? '이 브라우저에 현재 전투를 저장했습니다.' : '저장 공간을 사용할 수 없습니다.');
    lastAutosave = w.time; return ok;
  };
  const close = (returnToMenu = true) => {
    if (dead) return; dead = true; modalClose?.(); modalClose = null;
    cancelAnimationFrame(frame); controller.abort(); missionObserver.disconnect(); adventureControl.dispose(); world.dispose(); renderer.dispose(); renderer.forceContextLoss(); audio.dispose(); overlay.remove();
    if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__war;
    if (returnToMenu) onExit();
  };
  const exitWithSave = () => {
    if (done || writeSave()) { close(); return; }
    paused = true;
    modalClose = showDialog({ title: '전투를 저장할 수 없어요', body: '<p>브라우저 저장 공간을 사용할 수 없습니다. 메뉴로 나가면 현재 진행 상황이 사라집니다.</p>', cancel: '전투로 돌아가기', confirm: '저장 없이 나가기', onConfirm: () => close(), onClose: () => { if (!dead) paused = false; modalClose = null; } });
  };
  const openModal = (title: string, body: string, setup?: () => void) => {
    if (modalClose || done) return; paused = true; heldKeys.clear();
    modalClose = showDialog({ title, body, cancel: '전투로 돌아가기', onClose: () => { paused = graphicsLost; modalClose = null; last = performance.now(); } }); setup?.();
  };
  const togglePause = (reason = '잠시 전략을 정비하세요.') => {
    if (done) return;
    if (modalClose) { modalClose(); return; }
    openModal('전투 일시정지', `<p>${reason}</p><div class="pause-stats"><span>생존 시간<b>${clock(w.time)}</b></span><span>점령 거점<b>${w.outposts.filter(p => p.owner === 0).length} / 9</b></span><span>현재 병력<b>${w.units.filter(u => u.owner === 0).length} / 18</b></span></div><p class="dialog-tip">시간이 멈췄습니다. Esc 키나 아래 버튼으로 계속할 수 있습니다.</p><div class="pause-actions"><button id="pause-guide" class="button secondary">플레이 가이드</button><button id="pause-settings" class="button secondary">화면·소리 설정</button><button id="pause-menu" class="button secondary">저장하고 메뉴로</button></div>`, () => {
      document.querySelector<HTMLButtonElement>('#pause-guide')!.onclick = () => { modalClose?.(); help(); };
      document.querySelector<HTMLButtonElement>('#pause-settings')!.onclick = () => { modalClose?.(); openSettings(); };
      document.querySelector<HTMLButtonElement>('#pause-menu')!.onclick = () => { modalClose?.(); exitWithSave(); };
    });
  };
  const help = () => openModal('왕국을 지배하는 방법', `<div class="guide-steps"><article><b>승리 조건 · 살아남는 마지막 왕국</b><p>적색·황색·보라 왕국의 본부 3곳을 모두 함락시키면 승리합니다. 쉬움에서는 AI가 늦게 공격하므로 먼저 병력과 자원을 확보하세요.</p></article><article><b>01 · 경제를 성장시키세요</b><p>금광과 농장을 강화하면 병력을 꾸준히 생산할 수 있습니다. 성장 정책은 자원 수입을 25% 늘립니다.</p></article><article><b>02 · 거점을 점령하세요</b><p>작전 탭에서 기동대를 선택해 +3명 편성하세요. 부대 선택 후 지도에서 목적지를 클릭하면 그 부대만 이동하며, '본부' 버튼으로 즉시 복귀 명령을 내릴 수 있습니다. 적과 아군이 함께 있으면 점령이 정지합니다.</p></article><article><b>03 · 연구하고 정복하세요</b><p>병영 Lv.2에서 연구와 궁병, Lv.3에서 중장병과 기병이 해금됩니다. 모든 적 본부를 함락하면 승리합니다.</p></article><article><b>04 · 폭풍에 대비하세요</b><p>보통 난이도는 2분 10초, 쉬움은 3분부터 안전지대가 줄어듭니다. 밖에 있는 본부·병력이 피해를 받으며, 거점 1개당 본부 폭풍 피해가 12% 줄어듭니다 (최대 60%).</p></article></div><div class="shortcut-grid"><span><kbd>WASD</kbd> 시점 이동</span><span><kbd>H</kbd> 내 영지</span><span><kbd>V/T</kbd> 직접 플레이/전략</span><span><kbd>E</kbd> 성벽 올라가기·내려가기</span><span><kbd>F</kbd> 활 발사</span><span><kbd>1–4</kbd> 병종 훈련</span><span><kbd>5–7</kbd> 부대 그룹 선택</span><span><kbd>G</kbd> 위치 지정 · <kbd>B</kbd> 본부 복귀</span><span><kbd>Esc</kbd> 일시정지</span><span>드래그: 회전 · Shift+드래그: 이동</span><span>휠: 확대 · Shift+클릭: 명령</span><span>터치: 드래그 이동 · 두 손가락 확대</span><span>미니맵: 이동 모드에서 어디든 클릭해 부대 이동</span></div>`);
  const syncSound = () => { el('#sound').innerHTML = icon(prefs.sound ? 'sound' : 'muted'); el('#sound').setAttribute('aria-label', prefs.sound ? '효과음 끄기' : '효과음 켜기'); audio.setMuted(!prefs.sound); };
  const openSettings = () => openModal('전장 설정', `<div class="settings-grid"><label>그래픽 품질<select id="graphics-setting"><option value="high">높음 · 그림자와 효과</option><option value="standard">보통 · 성능 우선</option><option value="low">낮음 · 저사양 기기</option></select></label><label>효과음<input type="checkbox" id="audio-setting"></label><label>움직임 줄이기<input type="checkbox" id="motion-setting"></label></div><p class="dialog-tip">설정은 이 브라우저에 저장됩니다. 보통은 그림자·효과를 줄이고, 낮음은 해상도와 색 보정도 줄입니다. 관리 패널 아래 FPS로 실제 화면 속도를 확인하세요.</p>`, () => {
    const quality = document.querySelector<HTMLSelectElement>('#graphics-setting')!, sound = document.querySelector<HTMLInputElement>('#audio-setting')!, motion = document.querySelector<HTMLInputElement>('#motion-setting')!;
    quality.value = prefs.quality; sound.checked = prefs.sound; motion.checked = prefs.reducedMotion;
    quality.onchange = () => { prefs.quality = quality.value === 'high' ? 'high' : quality.value === 'low' ? 'low' : 'standard'; renderer.toneMapping = prefs.quality === 'low' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = prefs.quality === 'high'; renderer.setPixelRatio(Math.min(devicePixelRatio, prefs.quality === 'high' ? 1.65 : prefs.quality === 'low' ? .85 : 1)); world.setQuality(prefs.quality === 'high'); resize(); writePreferences(prefs); };
    sound.onchange = () => { prefs.sound = sound.checked; syncSound(); writePreferences(prefs); };
    motion.onchange = () => { prefs.reducedMotion = motion.checked; world.setReducedMotion(prefs.reducedMotion); writePreferences(prefs); };
  });
  el<HTMLButtonElement>('#exit').onclick = exitWithSave; el<HTMLButtonElement>('#home').onclick = home;
  el<HTMLButtonElement>('#save').onclick = () => writeSave(true); el<HTMLButtonElement>('#pause').onclick = () => togglePause();
  el<HTMLButtonElement>('#help').onclick = help; el<HTMLButtonElement>('#settings').onclick = openSettings;
  el<HTMLButtonElement>('#repair').onclick = () => perform(() => repair(w, 0), '본부를 수리했습니다.', 'upgrade');
  el<HTMLButtonElement>('#speed').onclick = () => { const rates = [.5, .65, .85, 1, 1.5]; speed = rates[(rates.findIndex(value => Math.abs(value - speed) < .001) + 1) % rates.length]; text('#speed', speed + '×'); el('#speed').setAttribute('aria-label', '게임 속도 ' + speed + '배'); announce('전투 속도를 ' + speed + '배로 변경했습니다.'); };
  el<HTMLButtonElement>('#sound').onclick = () => { prefs.sound = !prefs.sound; syncSound(); writePreferences(prefs); };
  el<HTMLButtonElement>('#zoom-in').onclick = () => setZoom(zoom - 30); el<HTMLButtonElement>('#zoom-out').onclick = () => setZoom(zoom + 30);
  el<HTMLButtonElement>('#overview').onclick = () => { focus.set(0, 0, 0); setZoom(530); };
  el<HTMLButtonElement>('#panel-toggle').onclick = () => { overlay.classList.toggle('panel-collapsed'); const expanded = !overlay.classList.contains('panel-collapsed'); el('#panel-toggle').setAttribute('aria-expanded', String(expanded)); el('#panel-toggle').setAttribute('aria-label', expanded ? '관리 패널 접기' : '관리 패널 펼치기'); };
  const updateAdventureUI = () => {
    const active = adventureControl.isActionMode;
    const mode = adventureControl.mode;
    overlay.classList.toggle('adventure-active', active);
    overlay.classList.toggle('adventure-dropping', mode === 'drop');
    el('#adventure-hud').hidden = !active;
    el('#adventure-enter').hidden = active;
    el('#adventure-tower').hidden = !adventureControl.canEnterTower;
    el('#adventure-down').hidden = mode !== 'tower';
    el<HTMLButtonElement>('#adventure-fire').disabled = mode === 'drop';
    el<HTMLButtonElement>('#adventure-strategy').disabled = mode === 'drop';
    const detail = adventureControl.hint();
    text('#adventure-title', detail.headline);
    text('#adventure-description', detail.detail);
    el('#adventure-progress-fill').style.width = detail.progress + '%';
  };
  const goStrategy = () => { adventureControl.toStrategy(); cameraUpdate(); updateAdventureUI(); };
  const goField = () => { adventureControl.toField(); updateAdventureUI(); };
  el<HTMLButtonElement>('#adventure-enter').onclick = goField;
  el<HTMLButtonElement>('#adventure-strategy').onclick = goStrategy;
  el<HTMLButtonElement>('#adventure-tower').onclick = () => { adventureControl.enterTower(); updateAdventureUI(); };
  el<HTMLButtonElement>('#adventure-down').onclick = () => { adventureControl.leaveTower(); updateAdventureUI(); };
  el<HTMLButtonElement>('#adventure-fire').onclick = () => { adventureControl.shoot(); };
  overlay.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(button => {
    const key = button.dataset.move!;
    button.addEventListener('pointerdown', event => { event.preventDefault(); heldKeys.add(key); button.setPointerCapture(event.pointerId); }, { signal });
    const stop = () => heldKeys.delete(key);
    button.addEventListener('pointerup', stop, { signal });
    button.addEventListener('pointercancel', stop, { signal });
    button.addEventListener('lostpointercapture', stop, { signal });
  });
  let commandMode = false;
  const syncCommandMode = (enabled: boolean) => {
    commandMode = enabled;
    text('#map-mode', enabled ? '부대 이동' : '시점 이동');
    el('#map-mode').setAttribute('aria-pressed', String(enabled));
    el('#quick-move').setAttribute('aria-pressed', String(enabled));
    el('#squad-move-mode').setAttribute('aria-pressed', String(enabled));
    el('#quick-move').classList.toggle('active', enabled);
    el('#squad-move-mode').classList.toggle('active', enabled);
  };
  const selectSquad = (value: SquadId) => {
    selectedSquad = value;
    showTab('orders');
    syncCommandMode(true);
    ui();
    announce(SQUAD_NAMES[value] + ' 선택 · 미니맵 또는 전장에서 목적지를 클릭하세요.');
  };
  overlay.querySelectorAll<HTMLButtonElement>('[data-squad-select]').forEach(button => {
    button.onclick = () => selectSquad(Number(button.dataset.squadSelect) as SquadId);
  });
  const assignSelectedSquad = () => {
    const moved = assignSquad(w, selectedSquad, recruitBatch);
    announce(moved ? SQUAD_NAMES[selectedSquad] + '에 병력 ' + moved + '명을 편성했습니다.' :
      '기동대 또는 수비대를 선택하고 주력군에 남은 병력을 확인하세요.');
    if (moved) { audio.play('click'); syncCommandMode(true); }
    ui(); drawMap();
  };
  const dismissSelectedSquad = () => {
    const moved = dismissSquad(w, selectedSquad);
    announce(moved ? moved + '명이 주력군으로 복귀했습니다.' : '복귀시킬 독립 부대가 없습니다.');
    ui(); drawMap();
  };
  el<HTMLButtonElement>('#squad-assign').onclick = assignSelectedSquad;
  el<HTMLButtonElement>('#squad-release').onclick = dismissSelectedSquad;
  el<HTMLButtonElement>('#squad-home').onclick = issueHome;
  el<HTMLButtonElement>('#quick-home').onclick = issueHome;
  el<HTMLButtonElement>('#squad-move-mode').onclick = () => {
    syncCommandMode(true); announce(SQUAD_NAMES[selectedSquad] + ' 이동 모드 · 지도 또는 바닥 아무 곳이나 클릭하세요.');
  };
  el<HTMLButtonElement>('#quick-move').onclick = () => {
    syncCommandMode(!commandMode);
    announce(commandMode ? SQUAD_NAMES[selectedSquad] + ' 이동 모드: 목적지를 클릭하세요.' : '시점 이동 모드입니다.');
  };
  el<HTMLButtonElement>('#map-mode').onclick = () => {
    syncCommandMode(!commandMode);
    announce(commandMode ? '선택 부대의 목적지를 미니맵에서 지정하세요. 본부 클릭으로 복귀합니다.' : '미니맵을 클릭해 카메라를 이동하세요.');
  };
  const refreshSquads = (unavailable: boolean) => {
    const counts = ([0, 1, 2] as SquadId[]).map(group => squadUnits(w, group).length);
    overlay.querySelectorAll<HTMLButtonElement>('[data-squad-select]').forEach(button => {
      const group = Number(button.dataset.squadSelect) as SquadId;
      const selected = group === selectedSquad;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('active', selected);
      const count = button.querySelector('small');
      if (count) count.textContent = counts[group] + '명';
    });
    const active = counts[selectedSquad] > 0 && !unavailable;
    el<HTMLButtonElement>('#squad-assign').disabled = selectedSquad === 0 || counts[0] === 0 || unavailable;
    el<HTMLButtonElement>('#squad-release').disabled = selectedSquad === 0 || !active;
    el<HTMLButtonElement>('#squad-home').disabled = !active;
    el<HTMLButtonElement>('#quick-home').disabled = !active;
    el<HTMLButtonElement>('#squad-move-mode').disabled = !active;
    el<HTMLButtonElement>('#quick-move').disabled = !active;
    text('#squad-order-status', SQUAD_NAMES[selectedSquad] + ' · ' + counts[selectedSquad] + '명 · ' + squadOrderLabel(w, selectedSquad));
  };
  const map = el<HTMLCanvasElement>('#war-map'), ctx = map.getContext('2d');
  const point = (x: number, z: number) => worldToMinimap(x, z, 220);
  map.addEventListener('click', event => {
    const rect = map.getBoundingClientRect(); const p = minimapToWorld(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
    if (event.shiftKey || commandMode) issueAt(p.x, p.z);
    else pan(p.x - focus.x, p.z - focus.z);
  }, { signal });
  map.addEventListener('keydown', event => { const move: Record<string, [number, number]> = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, -15], ArrowDown: [0, 15] }; if (move[event.key]) { event.preventDefault(); event.stopPropagation(); pan(...move[event.key]); } }, { signal });
  const raycaster = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const pointers = new Map<number, { x: number; y: number }>();
  let startX = 0, startY = 0, moved = false, pinched = false;
  renderer.domElement.addEventListener('pointerdown', event => { if (paused || done) return; audio.unlock(); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); renderer.domElement.setPointerCapture(event.pointerId); startX = event.clientX; startY = event.clientY; moved = false; if (pointers.size > 1) pinched = true; }, { signal });
  renderer.domElement.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 6) moved = true;
    if (adventureControl.isActionMode) {
      if (pointers.size === 1) adventureControl.onPointerDelta(dx, dy);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      return;
    }
    if (pointers.size === 2) { const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)![1]; const before = Math.hypot(previous.x - other.x, previous.y - other.y), after = Math.hypot(event.clientX - other.x, event.clientY - other.y); setZoom(zoom - (after - before) * .65); }
    else if (event.shiftKey || event.pointerType === 'touch') pan((-Math.cos(angle) * dx + Math.sin(angle) * dy) * zoom / 330, (Math.sin(angle) * dx + Math.cos(angle) * dy) * zoom / 330);
    else { angle += dx * .007; cameraUpdate(); }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }, { signal });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!pointers.has(event.pointerId)) return; pointers.delete(event.pointerId);
    if (!moved && !pinched && !paused && !done && adventureControl.isActionMode) adventureControl.shoot();
    if (!moved && !pinched && !paused && !done && !adventureControl.isActionMode) {
      const rect = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
      if (raycaster.ray.intersectPlane(ground, hit)) { const target = pickMapTarget(w, 0, hit.x, hit.z); if (commandMode || event.shiftKey || event.button === 2) { issueAt(hit.x, hit.z); el('#target-card').hidden = true; } else if (target) showTarget(target); else el('#target-card').hidden = true; }
    }
    if (!pointers.size) pinched = false;
  }, { signal });
  renderer.domElement.addEventListener('pointercancel', () => { pointers.clear(); pinched = false; }, { signal });
  renderer.domElement.addEventListener('contextmenu', event => event.preventDefault(), { signal });
  renderer.domElement.addEventListener('wheel', event => { event.preventDefault(); if (!adventureControl.isActionMode) setZoom(zoom + event.deltaY * .13); }, { signal, passive: false });
  window.addEventListener('keydown', event => {
    if (modalClose || done || event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.target as HTMLElement).matches('input, select, textarea')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && !event.repeat) { event.preventDefault(); togglePause(); return; }
    if (key === 'h' && !event.repeat) home();
    if (!adventureControl.isActionMode && !event.repeat) {
      if (key === '5' || key === '6' || key === '7') { selectSquad((Number(key) - 5) as SquadId); event.preventDefault(); }
      if (key === 'g') { syncCommandMode(true); announce('전장이나 미니맵에서 부대 이동 목적지를 클릭하세요.'); event.preventDefault(); }
      if (key === 'b') { issueHome(); event.preventDefault(); }
    }
    if (key === 'v' && !event.repeat) { event.preventDefault(); goField(); }
    if (key === 't' && !event.repeat) { event.preventDefault(); goStrategy(); }
    if (key === 'e' && !event.repeat) {
      event.preventDefault();
      if (adventureControl.mode === 'tower') adventureControl.leaveTower();
      else adventureControl.enterTower();
      updateAdventureUI();
    }
    if (key === 'f' && !event.repeat && adventureControl.isActionMode) { event.preventDefault(); adventureControl.shoot(); }
    if (!adventureControl.isActionMode && ['1', '2', '3', '4'].includes(key) && !event.repeat) { const kind = UNIT_KINDS[Number(key) - 1]; perform(() => train(w, 0, kind), `${UNIT_STATS[kind].label} 1명이 합류했습니다.`); event.preventDefault(); }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) { heldKeys.add(key); event.preventDefault(); }
  }, { signal });
  window.addEventListener('keyup', event => heldKeys.delete(event.key.toLowerCase()), { signal });
  window.addEventListener('blur', () => { heldKeys.clear(); pointers.clear(); if (!modalClose && !done && !dead) togglePause('다른 창으로 이동해 전투를 잠시 멈췄습니다.'); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !done && !dead) { writeSave(); if (!modalClose) togglePause('화면을 떠나 전투를 저장하고 멈췄습니다.'); } }, { signal });
  window.addEventListener('pagehide', () => { if (!dead) writeSave(); }, { signal });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); if (dead) return;
    graphicsLost = true; paused = true; heldKeys.clear(); pointers.clear();
    const didSave = writeSave(); modalClose?.(); modalClose = null;
    openModal('그래픽 연결이 끊겼어요', `<p>${didSave ? '전투 진행을 저장했습니다. 메뉴로 돌아갔다가 이어하기를 선택해 주세요.' : '저장 공간도 사용할 수 없습니다. 그래픽이 복구되기 전까지 전투는 정지됩니다.'}</p><button id="context-exit" class="button primary">메뉴로 돌아가기</button>`, () => { document.querySelector<HTMLButtonElement>('#context-exit')!.onclick = () => close(); });
  }, { signal });
  renderer.domElement.addEventListener('webglcontextrestored', () => { if (!dead) { graphicsLost = false; if (!modalClose) paused = false; announce('그래픽 연결이 복구되었습니다.'); } }, { signal });

  function updateAction(id: string, disabled: boolean, meta: string, selected = false): void {
    const button = el<HTMLButtonElement>(id); button.disabled = disabled; button.classList.toggle('selected', selected);
    const value = button.querySelector('.action-meta'); if (value && value.textContent !== meta) value.textContent = meta;
  }
  function ui(): void {
    const p = w.factions[0], counts = w.factions.map(f => w.units.filter(u => u.owner === f.id).length), owned = w.outposts.filter(post => post.owner === 0).length;
    const income = getIncome(w, 0), unavailable = !p.alive || done || w.over;
    text('#gold', Math.floor(p.gold).toLocaleString('ko-KR')); text('#food', Math.floor(p.food).toLocaleString('ko-KR'));
    text('#gold-income', `+${income.gold.toFixed(1)}/초`); text('#food-income', `+${income.food.toFixed(1)}/초`);
    text('#army-count', `${counts[0]} / ${armyLimit}`); text('#territory-count', `${owned} / 9`); refreshSquads(unavailable);
    text('#war-clock', clock(w.time)); text('#difficulty-badge', DIFFICULTIES[w.difficulty].label); text('#hq-value', `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`);
    el('#hq-fill').style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`; el('#hq-fill').classList.toggle('danger', p.hp < p.maxHp * .3);
    for (const b of BUILDINGS) { const c = cost(p, b.key); updateAction(`#build-${b.key}`, unavailable || p[b.key] >= 4 || p.gold < c.gold || p.food < c.food, p[b.key] >= 4 ? 'Lv.4 · 최대' : `Lv.${p[b.key]} → ${p[b.key] + 1}\n${price(c.gold, c.food)}`); }
    for (const key of ['balanced', 'growth', 'war'] as EconomyPolicy[]) { const button = el<HTMLButtonElement>(`#policy-${key}`); button.classList.toggle('selected', p.policy === key); button.setAttribute('aria-pressed', String(p.policy === key)); button.disabled = unavailable; }
    text('#policy-description', policyDescriptions[p.policy]); el<HTMLButtonElement>('#repair').disabled = unavailable || p.hp >= p.maxHp - 1 || p.gold < 45 || p.food < 25;
    for (const kind of UNIT_KINDS) {
      const s = UNIT_STATS[kind], locked = p.barracks < s.unlock;
      text(`#count-${kind}`, String(w.units.filter(u => u.owner === 0 && u.kind === kind).length)); text(`#unlock-${kind}`, locked ? `병영 Lv.${s.unlock} 필요` : '훈련 가능');
      el<HTMLButtonElement>(`#train-${kind}`).disabled = unavailable || locked || p.gold < s.gold || p.food < s.food || counts[0] >= armyLimit;
      el<HTMLButtonElement>(`#squad-${kind}`).disabled = unavailable || locked || p.gold < s.gold * recruitBatch || p.food < s.food * recruitBatch || counts[0] + recruitBatch > armyLimit;
    }
    for (const amount of reserveAmounts) { const button = el<HTMLButtonElement>(`#reserve-${amount}`); button.classList.toggle('selected', p.reserve === amount); button.setAttribute('aria-pressed', String(p.reserve === amount)); button.disabled = unavailable; }
    updateAction('#defend', unavailable, p.target === null && p.rally === null ? '현재 명령' : '복귀', p.target === null && p.rally === null);
    for (let id = 1; id < 4; id++) updateAction(`#attack-${id}`, unavailable || !w.factions[id].alive, w.factions[id].alive ? p.target === id ? '공격 중' : '공격' : '함락', p.target === id);
    for (const post of w.outposts) { const status = post.contender !== null ? `${Math.floor(post.progress)}% 점령 중` : post.owner === null ? '중립' : post.owner === 0 ? '아군' : NAMES[post.owner]; updateAction(`#outpost-${post.id}`, unavailable, status, p.rally === post.id); el(`#outpost-${post.id}`).style.setProperty('--owner-color', post.owner === null ? '#a69774' : factionColor(post.owner)); }
    for (const key of ['weapons', 'armor', 'logistics'] as Research[]) { const r = RESEARCH[key], c = researchCost(p, key), level = p.research[key]; updateAction(`#research-${key}`, unavailable || p.barracks < r.requiredBarracks || level >= r.maxLevel || p.gold < c.gold || p.food < c.food, p.barracks < r.requiredBarracks ? '병영 Lv.2 필요' : level >= r.maxLevel ? 'Lv.3 · 완료' : `Lv.${level} → ${level + 1}\n${price(c.gold, c.food)}`); }
    text('#research-summary', `연구 효과 · 공격 +${p.research.weapons * 12}% / 전투 피해 −${p.research.armor * 8}% / 이동 +${p.research.logistics * 8}% / 생산 +${p.research.logistics * 6}%`);
    w.factions.forEach(f => { text(`#standing-${f.id}`, f.alive ? `본부 ${Math.ceil(f.hp)} · 거점 ${w.outposts.filter(post => post.owner === f.id).length}` : '왕국 함락'); text(`#faction-units-${f.id}`, f.alive ? `${counts[f.id]}명` : '—'); el(`#faction-${f.id}`).classList.toggle('fallen', !f.alive); });
    text('#alive-count', `${w.factions.filter(f => f.alive).length} 세력 생존`);
    const eventKey = w.events.map(event => `${event.time}:${event.text}`).join('|');
    if (eventKey !== previousEvent) {
      previousEvent = eventKey; el('#events').replaceChildren();
      for (const event of w.events.slice(0, 4)) { const row = document.createElement('p'), time = document.createElement('time'), detail = document.createElement('span'); time.textContent = clock(event.time); detail.textContent = event.text; row.append(time, detail); el('#events').append(row); }
      if (w.events[0]?.text.startsWith('나 세력') && w.events[0]?.text.includes('점령')) audio.play('capture');
    }
    if (!w.events.length) text('#events', '전령이 새로운 소식을 기다립니다.');
    // Warn on an incoming order, while there is still time to recall troops.
    // Nearby invaders also count when their current objective is a territory.
    const threatened = !unavailable && w.units.some(unit => unit.owner !== 0 && unit.hp > 0 && w.factions[unit.owner].alive &&
      (w.factions[unit.owner].target === 0 || Math.hypot(unit.x - p.x, unit.z - p.z) < 55));
    el('.mission-card').classList.toggle('under-attack', threatened);
    el('#mission-action').setAttribute('aria-label', threatened ? '본부로 이동하고 방어 명령 확인' : '목표로 이동');
    if (threatened && !wasThreatened) { audio.play('warning'); announce('적의 본부 공세가 감지됐습니다. 병력을 복귀시키거나 본부 수비대를 확보하세요.'); }
    wasThreatened = threatened;
    if (threatened) { text('#mission-title', '본부에 적 병력이 접근합니다'); text('#mission-description', '화살표를 눌러 본부와 방어 명령을 확인하세요.'); el<HTMLButtonElement>('#mission-action').onclick = () => { home(); showTab('orders'); el<HTMLButtonElement>('#defend').focus({ preventScroll: true }); }; }
    else if (p.mine < 2 || p.farm < 2) { text('#mission-title', '풍요로운 영지의 시작'); text('#mission-description', '금광과 농장을 Lv.2로 강화하세요.'); el<HTMLButtonElement>('#mission-action').onclick = () => showTab('economy'); }
    else if (counts[0] < 6 && owned === 0) { text('#mission-title', '첫 원정대를 준비하세요'); text('#mission-description', '6명 이상의 병력을 모아 거점으로 출전하세요.'); el<HTMLButtonElement>('#mission-action').onclick = () => showTab('army'); }
    else if (owned === 0) { text('#mission-title', '첫 번째 깃발을 세우세요'); text('#mission-description', '가까운 북서부 관문을 점령해 보세요.'); el<HTMLButtonElement>('#mission-action').onclick = () => { showTab('orders'); showTarget({ kind: 'outpost', id: 5 }); }; }
    else if (p.barracks < 2 || w.stats[0].researches === 0) { text('#mission-title', '왕국의 기술을 발전시키세요'); text('#mission-description', '병영 Lv.2를 달성하고 첫 연구를 완료하세요.'); el<HTMLButtonElement>('#mission-action').onclick = () => showTab(p.barracks < 2 ? 'economy' : 'research'); }
    else { text('#mission-title', '마지막 왕국으로 남으세요'); text('#mission-description', `남은 적 왕국 ${w.factions.filter(f => f.alive && f.id !== 0).length}개 · 거점 ${owned}/9 확보`); el<HTMLButtonElement>('#mission-action').onclick = () => showTab('orders'); }
    const storm = stormDamage(w, 0), stormStart = stormStartFor(w), beforeStorm = w.time < stormStart;
    text('#storm-clock', beforeStorm ? `폭풍까지 ${clock(stormStart - w.time)}` : '폭풍 진행 중'); text('#zone-size', `${Math.round(w.zone)}m`);
    el('#storm-warning').hidden = storm === 0;
    text('#storm-warning-text', `본부가 폭풍에 노출됐습니다 · 체력 −${storm.toFixed(1)}/초`);
    if (p.hp < p.maxHp * .3 && !lowHpWarned) { audio.play('warning'); announce('본부 체력이 낮습니다. 수리하거나 방어 병력을 확보하세요.'); lowHpWarned = true; }
    if (p.hp > p.maxHp * .5) lowHpWarned = false;
  }
  function drawMap(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, 220, 220); ctx.fillStyle = '#182a28'; ctx.fillRect(0, 0, 220, 220);
    ctx.strokeStyle = '#243c36'; ctx.lineWidth = 1;
    for (let i = 22; i < 220; i += 22) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 220); ctx.moveTo(0, i); ctx.lineTo(220, i); ctx.stroke(); }
    ctx.fillStyle = '#254337'; ctx.beginPath(); ctx.arc(110, 110, w.zone / MAP_HALF_SIZE * 110, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#72c7d9'; ctx.stroke();
    for (const post of w.outposts) { const p = point(post.x, post.z); ctx.fillStyle = post.owner === null ? '#c2b68c' : factionColor(post.owner); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
    for (const f of w.factions) { const p = point(f.x, f.z); ctx.fillStyle = f.alive ? factionColor(f.id) : '#4d5954'; ctx.fillRect(p.x - 5, p.y - 5, 10, 10); if (f.id === 0) { ctx.strokeStyle = '#fff4d1'; ctx.strokeRect(p.x - 7, p.y - 7, 14, 14); } }
    for (const unit of w.units) {
      const p = point(unit.x, unit.z);
      ctx.fillStyle = unit.owner === 0 && (unit.squad === 1 || unit.squad === 2) ?
        unit.squad === 1 ? '#f8e09c' : '#e0b5fa' : factionColor(unit.owner);
      const extent = unit.owner === 0 && (unit.squad ?? 0) === selectedSquad ? 2.6 : 1.4;
      ctx.fillRect(p.x - extent / 2, p.y - extent / 2, extent, extent);
    }
    ([0, 1, 2] as SquadId[]).forEach(group => {
      const goal = squadDestination(w, group);
      if (!goal) return;
      const target = point(goal.x, goal.z);
      ctx.strokeStyle = group === 0 ? '#5ee3ca' : group === 1 ? '#f8e09c' : '#e0b5fa';
      ctx.lineWidth = group === selectedSquad ? 2.5 : 1.3;
      ctx.beginPath(); ctx.arc(target.x, target.y, group === selectedSquad ? 7 : 4.5, 0, Math.PI * 2); ctx.stroke();
    });
    const player = w.factions[0], goal = player.target !== null ? w.factions[player.target] : player.rally !== null ? w.outposts[player.rally] : null;
    if (goal) { const a = point(player.x, player.z), b = point(goal.x, goal.z); ctx.strokeStyle = '#efcf8b'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); ctx.strokeRect(b.x - 7, b.y - 7, 14, 14); }
    const f = point(focus.x, focus.z); ctx.strokeStyle = '#f1eee1'; ctx.lineWidth = 1; const size = zoom / 15; ctx.strokeRect(f.x - size, f.y - size * .65, size * 2, size * 1.3);
  }
  function finish(): void {
    done = true; heldKeys.clear(); if (!saveWar(w)) deleteWarSave(); const victory = w.winner === 0, stats = w.stats[0];
    recordMatch(victory, w.time, stats.kills); audio.play(victory ? 'victory' : 'defeat');
    const end = el('.war-end'); end.hidden = false;
    [...overlay.children].forEach(child => { if (child instanceof HTMLElement && child !== end) child.inert = true; });
    end.innerHTML = `<section class="result-panel" role="dialog" aria-modal="true" aria-labelledby="result-title"><span class="result-emblem">${icon(victory ? 'crown' : 'shield', 52)}</span><div class="kicker">${victory ? 'VICTORY' : 'THE KINGDOM WILL RISE AGAIN'}</div><h1 id="result-title" tabindex="-1">${victory ? '마지막 왕국의 주인' : '새로운 원정이 기다립니다'}</h1><p>${victory ? '모든 경쟁자를 물리치고 전장을 통일했습니다.' : '영지가 함락되었습니다. 다음 전투에서 다시 도전하세요.'}</p><div class="result-stats"><div><b>${clock(w.time)}</b><span>생존 시간</span></div><div><b>${stats.kills}</b><span>적 병력 처치</span></div><div><b>${stats.captures}</b><span>거점 점령</span></div><div><b>${stats.trained}</b><span>병력 훈련</span></div><div><b>${stats.researches}</b><span>연구 완료</span></div><div><b>${Math.floor(stats.goldEarned).toLocaleString('ko-KR')}</b><span>획득한 금</span></div></div><p class="result-tip">${victory ? '다른 난이도와 병종 조합으로 새로운 전략을 시도해 보세요.' : stats.captures === 0 ? '다음 전략: 가까운 거점을 먼저 점령해 자원 생산과 폭풍 방어를 확보해 보세요.' : '다음 전략: 연구와 병종 조합으로 전투력을 높이고, 본부 수리 자원을 남겨 두세요.'}</p><div class="result-actions"><button id="back" class="button secondary">왕국 메뉴</button><button id="again" class="button primary">같은 난이도로 재도전 ${icon('arrow', 18)}</button></div></section>`;
    el<HTMLButtonElement>('#again').onclick = () => { const difficulty = w.difficulty, grandBattle = w.grandBattle; close(false); openWar(onExit, { forceNew: true, difficulty, grandBattle }); };
    el<HTMLButtonElement>('#back').onclick = () => close();
    end.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const first = el<HTMLButtonElement>('#back'), last = el<HTMLButtonElement>('#again');
      if (event.shiftKey && (document.activeElement === first || document.activeElement === el('#result-title'))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, { signal });
    el('#result-title').focus({ preventScroll: true });
    el('.result-panel').scrollTop = 0;
  }
  let fpsStart = performance.now(), fpsFrames = 0;
  function loop(now: number): void {
    if (dead) return;
    const elapsed = Math.min((now - last) / 1000, .1); last = now;
    if (!paused && !graphicsLost) {
      const amount = elapsed * 100, h = (key: string) => heldKeys.has(key);
      if (!adventureControl.isActionMode && (h('w') || h('arrowup'))) pan(-Math.sin(angle) * amount, -Math.cos(angle) * amount);
      if (!adventureControl.isActionMode && (h('s') || h('arrowdown'))) pan(Math.sin(angle) * amount, Math.cos(angle) * amount);
      if (!adventureControl.isActionMode && (h('a') || h('arrowleft'))) pan(-Math.cos(angle) * amount, Math.sin(angle) * amount);
      if (!adventureControl.isActionMode && (h('d') || h('arrowright'))) pan(Math.cos(angle) * amount, -Math.sin(angle) * amount);
      if (!done) acc += elapsed * speed;
      while (acc >= .025 && !w.over && w.factions[0].alive && !done) { stepWar(w, .025); acc -= .025; }
    }
    adventureControl.update(paused || done || graphicsLost ? 0 : elapsed, heldKeys);
    const directNotice = adventureControl.takeNotice();
    if (directNotice) announce(directNotice);
    world.update(paused || done || graphicsLost ? 0 : elapsed * speed);
    if (now - lastUI > 250) { ui(); drawMap(); updateAdventureUI(); lastUI = now; }
    if (!done && (w.over || !w.factions[0].alive)) finish();
    if (!done && w.time - lastAutosave >= 15) writeSave();
    if (now > toastUntil) el('#toast').hidden = true;
    if (!graphicsLost) { renderer.render(scene, camera); fpsFrames++; }
    if (now - fpsStart >= 1000) { text('#render-fps', `${Math.round(fpsFrames * 1000 / (now - fpsStart))} FPS`); fpsStart = now; fpsFrames = 0; }
    frame = requestAnimationFrame(loop);
  }
  syncSound(); ui(); drawMap(); updateAdventureUI();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__war = { world: w, renderer, camera, scene, ui, finish, skipDrop: () => { adventureControl.skipDrop(); updateAdventureUI(); }, setPaused: (value: boolean) => { paused = value; } };
  frame = requestAnimationFrame(loop);
  el<HTMLButtonElement>('#home').focus({ preventScroll: true });
  if (!wasThreatened) announce(resumed ? '저장한 전투를 이어갑니다. V 키로 직접 탐험할 수 있습니다.' : '낙하산으로 강하합니다! 착륙 후 거점을 점령하고 성벽 위에서 활을 쏘세요.');
}
