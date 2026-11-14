// LAST CITY — 게임 루프, 입력, HUD
import './city.css';
import { BIZ, BUILD_ORDER, CLASSES, DIFFICULTY, DIFFICULTY_ORDER, FACTIONS, PERKS, RESEARCH, STRUCTS, UNITS, WEAPONS, type ClassId, type Difficulty, type ResearchId, type StructKind, type UnitId, type WeaponId } from './defs';
import { World, type Actor } from './world';
import { Renderer, type Ghost } from './render';
import { Renderer3D } from './render3d';
import { loadModels, type Models } from './models';
import { STEPS, TUT_KEY, advance, newCounters, newTutState, type Counters, type TutState } from './tutorial';
import { CityAudio } from './audio';
import { reload, switchWeapon } from './actors';
import { ACTORS, BLOCKS, PITCH, ROAD } from './defs';
import { mapPointerToWorld } from './uiMath';
import { missionLog, missionSummary } from './missions';
import { readPreferences, recordMatch, writePreferences } from '../battle/preferences';

const $ = (n: number): string => Math.floor(n).toLocaleString('en-US');
const clock = (t: number): string => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
const CITY_KEY = 'waldo.city.v1';
export function readCityCareer(): { matches: number; wins: number; best: number } {
  try { const r = JSON.parse(localStorage.getItem(CITY_KEY) ?? '{}') as Record<string, unknown>; const n = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0; return { matches: n(r.matches), wins: n(r.wins), best: n(r.best) }; } catch { return { matches: 0, wins: 0, best: 0 }; }
}

function readTutDone(): boolean { try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return false; } }
export function openCity(onExit: () => void, options: { difficulty?: string } = {}): void {
  let diffSel: Difficulty = 'd4'; try { const sv = localStorage.getItem('waldo-city-diff'); if (sv && sv in DIFFICULTY) diffSel = sv as Difficulty; } catch { /* 저장 불가 환경 */ }
  void options;
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches;
  const root = document.createElement('div'); root.className = 'city-root' + (touch ? ' touch' : '');
  root.innerHTML = `<canvas class="city-canvas3d"></canvas><canvas class="city-canvas" hidden></canvas><div class="c-layer" id="c-layer"></div><div class="c-hurt" id="c-hurt"></div><div class="c-cross" id="c-cross"><i></i><b></b></div>
  <div class="city-hud" hidden>
    <div class="c-tl"><div class="c-res" id="c-res"></div><div class="c-quest" id="c-quest"></div></div>
    <div class="c-tc" id="c-zone"></div>
    <div class="c-tr"><canvas id="c-mini" width="200" height="200" aria-label="미니맵"></canvas><div id="c-wanted"></div><div class="c-topbtns"><button data-act="view" id="c-view" title="시점 전환 (V)">1인칭</button><button data-act="missions" title="작전 지령 (J)">임무</button><button data-act="map" title="전술 지도 (M)">지도</button><button data-act="pause" title="일시정지 (Esc)">Ⅱ</button></div></div>
    <div class="c-target" id="c-target"></div><aside class="c-tut" id="c-tut" hidden></aside><div class="c-area" id="c-area"></div><div class="c-feed" id="c-feed"></div><div class="c-banner" id="c-banner"></div><div class="c-prompt" id="c-prompt"></div><div class="c-toast" id="c-toast"></div>
    <div class="c-bl" id="c-boss"></div>
    <div class="c-bc" id="c-cmd"></div>
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
  let tut: { s: TutState; c: Counters } | null = null, tutSig = '', tutDone = readTutDone(), lastPos = { x: 0, y: 0 }, lastYaw = 0, tutInfoLock = false;
  let models: Models | null = null, R3: Renderer3D | null = null, view: View = 'fp', locked = false, lockFail = false, expectUnlock = false, touchFire = false, hurt = 0, lastLook = 0, hitT = 0;
  const tags: HTMLElement[] = [], marks: HTMLElement[] = []; let area = '', areaT = 0, sirenT = 0;
  let world: World | null = null, R: Renderer | null = null, raf = 0, last = 0, acc = 0, paused = false, closed = false, ghost: Ghost | null = null, tab = 'train', hudT = 0, toastT = 0, bannerT = 0, shopOpen = false, resultShown = false, userZoom = 1, combat = 0, klass: ClassId = 'warlord';
  const keys = new Set<string>(), mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
  const sticks = { move: { id: -1, ox: 0, oy: 0, x: 0, y: 0 }, aim: { id: -1, ox: 0, oy: 0, x: 0, y: 0 } };

  const toast = (text: string, bad = true): void => { if (!text) return; const el = q('#c-toast'); el.textContent = text; el.className = 'c-toast show' + (bad ? ' bad' : ''); toastT = 2.2; audio.play(bad ? 'error' : 'click'); };
  const banner = (text: string): void => { const el = q('#c-banner'); el.textContent = text; el.className = 'c-banner show'; bannerT = 3; };
  const res = (e: string): void => { if (e && e !== 'shop') toast(e); else if (!e) audio.play('click'); };

  function setup(): void {
    modal.innerHTML = `<section class="c-setup"><div class="c-kicker">WALDO · KINGDOMS AT WAR — 도시 전선</div><h2>LAST CITY <small>최후의 왕국</small></h2>
      <p class="c-lead">여덟 왕국이 한 도시에 떨어졌습니다. 직접 총을 들고 뛰고, 차를 빼앗고, 사업체를 사들여 돈을 벌고, 군대를 길러 <b>자기장이 닫히기 전 마지막 왕국</b>이 되세요. <b>J</b>에서 8단계 도시 작전과 보상을 확인할 수 있습니다.</p>
      <button class="c-tutcard${tutDone ? '' : ' rec'}" data-act="tutorial"><span>${tutDone ? '다시 연습' : '처음이라면 추천 · 약 5분'}</span><b>튜토리얼 시작</b><p>이동·사격·사업체·기지 건설·병력 지휘·차량·시장까지 한 단계씩 안전하게 익힙니다. 연습장에서는 자기장과 라이벌이 멈춰 있습니다.</p></button>
      <div class="c-sub">${tutDone ? '바로 시작할 영웅을 고르세요' : '또는 바로 시작할 영웅을 고르세요'}</div>
      <div class="c-classes">${(Object.keys(CLASSES) as ClassId[]).map(k => `<button class="c-class" data-act="class:${k}"><span>${CLASSES[k].tag}</span><b>${CLASSES[k].name}</b><p>${CLASSES[k].desc}</p><em>Q · ${CLASSES[k].skill}</em><small>${CLASSES[k].skillDesc}</small></button>`).join('')}</div>
      <div class="c-keys">${touch ? '<span>왼쪽 드래그 이동</span><span>오른쪽 드래그 시점</span><span>사격 버튼</span><span>버튼으로 상호작용·지휘</span>' : '<span><b>WASD</b> 이동</span><span><b>마우스</b> 시점·사격</span><span><b>V</b> 1인칭/3인칭/전술뷰</span><span><b>E</b> 매입·줍기</span><span><b>F</b> 차량 탑승</span><span><b>Tab</b> 지휘 패널</span><span><b>우클릭</b> 병력 돌격</span><span><b>Z/X</b> 집결·사수</span><span><b>Space</b> 대시</span><span><b>M</b> 지도</span>'}</div>
      <div class="c-sub">난이도</div><div class="c-diffs">${DIFFICULTY_ORDER.map(d => `<button class="c-diff${d === diffSel ? ' on' : ''}" data-act="diff:${d}" title="${DIFFICULTY[d].desc}">${DIFFICULTY[d].label}</button>`).join('')}</div><p class="c-lead c-diffdesc">${DIFFICULTY[diffSel].desc}</p>
      <div class="c-setup-foot"><span>난이도 · ${DIFFICULTY[diffSel].label}</span><button data-act="exit" class="c-ghost">메뉴로</button></div></section>`;
  }
  function start(k: ClassId, tutorial = false): void {
    klass = k; modal.innerHTML = ''; hud.hidden = false; resultShown = false; paused = false; ghost = null; shopOpen = false; panel.hidden = true; bigmap.hidden = true; q('#c-missions').hidden = true;
    // A retry must not inherit held keys, touch gestures, firing or frame debt.
    keys.clear(); mouse.down = false; touchFire = false; acc = 0; looks.clear();
    for (const stick of [sticks.move, sticks.aim]) { stick.id = -1; stick.x = 0; stick.y = 0; }
    world = new World({ seed: (Math.random() * 2 ** 31) | 0, difficulty: diffSel, klass: k, tutorial });
    tut = tutorial ? { s: newTutState(), c: newCounters() } : null;  tutSig = ''; q('#c-tut').hidden = true; tutInfoLock = false;
    R = new Renderer(canvas, world); R.reduced = prefs.reducedMotion; const b = world.boss(0)!; R.cam.x = b.x; R.cam.y = b.y; R.cam.zoom = 0.6;
    R3?.dispose(); R3 = null; layer.innerHTML = ''; tags.length = 0; marks.length = 0;
    try { R3 = new Renderer3D(canvas3, world, prefs.quality, layer, models); R3.reduced = prefs.reducedMotion; const hq = world.hq(0); if (hq) R3.yaw = Math.atan2(hq.y + 60 - b.y, hq.x + 60 - b.x) + Math.PI; R3.camPos.set(b.x, 46, b.y); }
    catch { R3 = null; toast('3D를 사용할 수 없어 전술 뷰로 시작합니다'); }
    lastYaw = R3 ? R3.yaw : 0; lastPos = { x: b.x, y: b.y };
    setView(R3 ? (view === 'top' ? 'fp' : view) : 'top'); lock();
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__city = { world, renderer: R, r3: R3 };
    audio.unlock(); if (!tutorial) banner('작전 지령 01 · 첫 사업체를 확보하세요 · J 전체 임무');
    renderCmd(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  let everLocked = false, lockErrors = 0;
  function onLockErr(): void { if (!everLocked && ++lockErrors >= 2) lockFail = true; }
  function lock(): void { if (touch || view === 'top' || lockFail || locked) return; try { const r = canvas3.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(onLockErr); } catch { onLockErr(); } }
  function unlock(): void { if (document.pointerLockElement) { expectUnlock = true; document.exitPointerLock(); } }
  function setView(v: View): void {
    view = v; canvas.hidden = v !== 'top'; canvas3.hidden = v === 'top'; cross.hidden = v === 'top'; layer.hidden = v === 'top'; if (R3 && v !== 'top') R3.mode = v; if (v === 'top') unlock(); else { R3?.resize(); }
    R?.resize(); q('#c-view').textContent = v === 'fp' ? '1인칭' : v === 'tp' ? '3인칭' : '전술뷰';
  }
  const onLock = (): void => { locked = document.pointerLockElement === canvas3; if (locked) { expectUnlock = false; everLocked = true; return; } const was = expectUnlock; expectUnlock = false; if (!was && view !== 'top' && world && !world.over && !paused && panel.hidden && bigmap.hidden && q('#c-missions').hidden && world.factions[0].pending === 0) pause(); };

  const onMouseMove = (e: MouseEvent): void => { if (!R3 || view === 'top' || paused) return; if (locked || (lockFail && mouse.down)) { R3.yaw += e.movementX * 0.0024; R3.pitch = Math.max(-1.2, Math.min(1.0, R3.pitch - e.movementY * 0.0024)); lastLook = performance.now(); } };
  document.addEventListener('pointerlockchange', onLock); document.addEventListener('pointerlockerror', onLockErr); document.addEventListener('mousemove', onMouseMove);
  function exit(): void {
    if (closed) return; closed = true; cancelAnimationFrame(raf); audio.dispose(); unlock(); R3?.dispose(); root.remove();
    document.removeEventListener('pointerlockchange', onLock); document.removeEventListener('pointerlockerror', onLockErr); document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('resize', onResize); window.removeEventListener('blur', onBlur); window.removeEventListener('pointerup', onWindowPointerEnd); window.removeEventListener('pointercancel', onWindowPointerEnd); document.removeEventListener('visibilitychange', onBlur);
    onExit();
  }

  // ---------- 동작 ----------
  function act(code: string, ev?: Event): void {
    const [a, arg] = code.split(':'), w = world; audio.unlock();
    if (a === 'diff') { diffSel = arg as Difficulty; try { localStorage.setItem('waldo-city-diff', arg); } catch { /* 무시 */ } setup(); audio.play('click'); return; }
    if (a === 'sq') { if (w) { w.selectSquad(Number(arg)); put(q('#c-squads'), squadBar(w)); toast(w.squadSel ? `${w.squadSel}분대 선택 — 명령이 이 분대에만 적용됩니다` : '전체 병력 선택', false); if (!panel.hidden) renderPanel(); } return; }
    if (a === 'squadsplit') { if (w) { w.splitSquads(0, Number(arg)); put(q('#c-squads'), squadBar(w)); toast(Number(arg) > 1 ? `${arg}개 분대로 편성` : '분대 편성 해제', false); renderPanel(); } return; }
    if (a === 'squadall') { if (w) { w.assignAllTo(0, Number(arg)); w.selectSquad(Number(arg)); put(q('#c-squads'), squadBar(w)); renderPanel(); } return; }
    if (a === 'squadpull') { if (w) { w.moveUnassigned(0, Number(arg)); renderPanel(); } return; }
    if (a === 'class') { start(arg as ClassId); return; }
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
    if (a === 'view') { if (tut) tut.c.viewSwitches++; setView(view === 'fp' ? 'tp' : view === 'tp' ? 'top' : R3 ? 'fp' : 'top'); if (!paused) lock(); audio.play('click'); return; }
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
    else if (a === 'build') { ghost = { kind: arg as StructKind, x: 0, y: 0, ok: false }; if (view !== 'top' || innerWidth < 900) { panel.hidden = true; lock(); } toast(view === 'top' ? '배치할 위치를 누르세요 (우클릭·Esc 취소)' : '바닥을 조준하고 클릭해 배치 (우클릭 취소)', false); }
    else if (a === 'research') res(w.research(0, arg as ResearchId));
    else if (a === 'sell') { const e = w.market(0, true, arg === 'all' ? f.crystal : Number(arg)); res(e); if (!e && tut) tut.c.sells++; }
    else if (a === 'buy') res(w.market(0, false, Number(arg)));
    else if (a === 'upg') { const z = w.businesses.find(b => b.id === Number(arg)); if (z) { const e = w.upgradeBiz(0, z); if (e) toast(e); else audio.play('cash'); } }
    else if (a === 'item') { const e = w.buyItem(0, arg as WeaponId | 'armor' | 'medkit'); if (e) toast(e); else audio.play('cash'); }
    else if (a === 'bribe') res(w.bribe(0));
    else if (a === 'mercs') res(w.hireMercs(0));
    else if (a === 'order') { const b = w.boss(0); if (b) { w.order(0, arg as 'follow' | 'hold', b.x, b.y); toast(arg === 'follow' ? '전 병력 집결 — 나를 따르라' : '현 위치 사수', false); } }
    else if (a === 'charge') { const b = w.boss(0); if (b) w.order(0, 'amove', b.x + Math.cos(b.ang) * 480, b.y + Math.sin(b.ang) * 480); }
    else if (a === 'interact') interact();
    else if (a === 'vehicle') { w.toggleVehicle(0); }
    else if (a === 'skill') res(w.useSkill(0));
    else if (a === 'dash') { w.input.dash = true; setTimeout(() => { if (world) world.input.dash = false; }, 80); }
    else if (a === 'weapon') switchWeapon(w, 0, (f.cur + 1) % f.slots.length);
    else if (a === 'slot') switchWeapon(w, 0, Number(arg));
    else if (a === 'medkit') w.useMedkit(0);
    if (!panel.hidden && a !== 'tab') renderPanel();
    ev?.preventDefault();
  }
  function interact(): void {
    const w = world!; const e = w.interact(0);
    if (e === 'shop') { shopOpen = true; panel.hidden = false; renderPanel(); unlock(); audio.play('click'); } else if (e) toast(e, e.includes('부족') || e.includes('없'));
  }
  function pause(): void {
    if (!world || world.over) return; paused = true; keys.clear(); mouse.down = false; unlock();
    modal.innerHTML = `<section class="c-pause"><div class="c-kicker">PAUSED</div><h2>일시정지</h2>
      <div class="c-help"><div><b>보스 조작</b><p>WASD 이동 · 마우스 시점/사격 · V 시점 전환(1인칭·3인칭·전술뷰) · R 재장전 · 1~3 무기 · Space 대시 · H 회복 키트 · Q 고유 스킬</p></div><div><b>도시</b><p>E 사업체 매입·업그레이드·무기 줍기 · F 차량 탑승/하차 · 적 사업체 패드 위에서 6초 버티면 적대적 인수</p></div><div><b>지휘</b><p>Tab 지휘 패널(생산·건설·연구·시장) · 우클릭/지도 클릭 돌격 · Z 집결 · X 사수</p></div><div><b>승리</b><p>자기장은 점점 줄어듭니다. 적 본부를 부수면 그 보스는 부활하지 못합니다. 마지막까지 살아남는 왕국이 승리합니다.</p></div></div>
      <div class="c-actions"><button data-act="resume" class="c-primary">계속하기</button><button data-act="sound">효과음 ${prefs.sound ? '켜짐' : '꺼짐'}</button><button data-act="retry">새 게임</button><button data-act="exit">메뉴로 나가기</button></div></section>`;
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
    const cost = (c: number, m: number): string => `${c ? `<i class="cr">◆${w.cost(f, c)}</i>` : ''}${m ? `<i class="ca">$${w.cost(f, m)}</i>` : ''}`;
    if (shopOpen) {
      const near = w.nearGunshop(0);
      body = `<h3>무기상 ${near ? '' : '<small>(가게 앞에서만 구매 가능)</small>'}</h3>` + (['smg', 'shotgun', 'rifle', 'sniper', 'rocket'] as WeaponId[]).map(id => `<button class="c-row" data-act="item:${id}" ${near && f.cash >= WEAPONS[id].price ? '' : 'disabled'}><b>${WEAPONS[id].name}</b><span>피해 ${WEAPONS[id].dmg}${WEAPONS[id].pellets > 1 ? '×' + WEAPONS[id].pellets : ''} · 연사 ${WEAPONS[id].rate}/s · 사거리 ${WEAPONS[id].range}</span><i class="ca">$${WEAPONS[id].price}</i></button>`).join('')
        + `<button class="c-row" data-act="item:armor" ${near && f.cash >= 300 ? '' : 'disabled'}><b>방탄복</b><span>방어도 100 (피해 60% 흡수)</span><i class="ca">$300</i></button><button class="c-row" data-act="item:medkit" ${near && f.cash >= 150 ? '' : 'disabled'}><b>회복 키트</b><span>체력 +70 (H)</span><i class="ca">$150</i></button>`;
    } else if (tab === 'train') {
      const has = (k: StructKind): boolean => w.structures.some(s => s.alive && s.f === 0 && s.kind === k && s.built >= 1);
      body = `<h3>병력 생산 <small>인구 ${f.supply}/${f.supplyMax}</small></h3>` + (Object.keys(UNITS) as UnitId[]).map(id => { const u = UNITS[id], ok = has(u.from) && (!u.needLab || has('lab')); return `<button class="c-row" data-act="train:${id}" ${ok ? '' : 'disabled'}><b>${ACTORS[id].name}</b><span>${ok ? u.desc : `${STRUCTS[u.from].name}${u.needLab ? '·연구소' : ''} 필요`} · 인구 ${u.supply}</span>${cost(u.crystal, u.cash)}</button>`; }).join('')
        + `<button class="c-row" data-act="mercs" ${f.cash >= 350 ? '' : 'disabled'}><b>용병 3명 즉시 고용</b><span>인구를 차지하지 않는 현금 병력</span><i class="ca">$350</i></button>`
        + `<p class="c-note">대기열: ${w.structures.filter(s => s.f === 0 && s.queue.length).map(s => `${STRUCTS[s.kind].name} ${s.queue.length}`).join(' · ') || '없음'}</p>`;
    } else if (tab === 'build') {
      body = '<h3>건설 <small>본부 반경·보유 사업체 주변</small></h3>' + BUILD_ORDER.map(k => `<button class="c-row" data-act="build:${k}"><b>${STRUCTS[k].name}</b><span>${STRUCTS[k].desc}</span>${cost(STRUCTS[k].crystal, STRUCTS[k].cash)}</button>`).join('');
    } else if (tab === 'research') {
      const lab = w.structures.some(s => s.alive && s.f === 0 && s.kind === 'lab' && s.built >= 1);
      body = `<h3>연구 ${lab ? '' : '<small>연구소 필요</small>'}</h3>` + (Object.keys(RESEARCH) as ResearchId[]).map(id => { const lv = f.up[id]; return `<button class="c-row" data-act="research:${id}" ${lab && lv < 3 ? '' : 'disabled'}><b>${RESEARCH[id].name} ${'●'.repeat(lv)}${'○'.repeat(3 - lv)}</b><span>${RESEARCH[id].desc}</span>${lv < 3 ? `<i class="cr">◆${RESEARCH[id].crystal * (lv + 1)}</i><i class="ca">$${RESEARCH[id].cash * (lv + 1)}</i>` : ''}</button>`; }).join('');
    } else if (tab === 'market') {
      const h = w.priceHistory, max = Math.max(14, ...h), pts = h.map((v, i) => `${(i / Math.max(1, h.length - 1) * 280).toFixed(1)},${(64 - v / max * 60).toFixed(1)}`).join(' ');
      body = `<h3>크리스탈 거래소 <small>시세 $${w.price.toFixed(1)}</small></h3><svg class="c-chart" viewBox="0 0 280 66"><polyline points="${pts}" fill="none" stroke="${w.price >= 10 ? '#7dffb0' : '#ff9d9d'}" stroke-width="2"/></svg>
        <div class="c-grid"><button data-act="sell:50">50 판매<small>+$${$(50 * w.price * 0.92)}</small></button><button data-act="sell:200">200 판매<small>+$${$(200 * w.price * 0.92)}</small></button><button data-act="sell:all">전부 판매</button><button data-act="buy:50">50 구매<small>-$${$(50 * w.price * 1.08)}</small></button><button data-act="buy:200">200 구매<small>-$${$(200 * w.price * 1.08)}</small></button></div>
        <p class="c-note">평균 시세는 $10. 급등 뉴스가 뜨면 팔고, 폭락하면 사 두세요. 대량 거래는 시세를 움직입니다.</p>`;
    } else if (tab === 'assets') {
      const own = w.businesses.filter(b => b.owner === 0);
      body = `<h3>자산 <small>초당 +$${$(f.income)} · 순자산 $${$(w.netWorth(f))}</small></h3>` + (own.length ? own.map(b => `<button class="c-row" data-act="upg:${b.id}" ${b.level < 3 && f.cash >= w.upgradePrice(b) ? '' : 'disabled'}><b>${BIZ[b.kind].name} ${'★'.repeat(b.level)}</b><span>${b.level < 3 ? `업그레이드 → 수입 증가 + 경비원` : '최고 등급'}</span>${b.level < 3 ? `<i class="ca">$${w.upgradePrice(b)}</i>` : ''}</button>`).join('') : '<p class="c-note">아직 보유한 사업체가 없습니다. 흰 점선 원 위에서 E로 매입하세요.</p>')
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
    const tabs: [string, string][] = [['train', '생산'], ['build', '건설'], ['research', '연구'], ['market', '시장'], ['assets', '자산'], ['squad', '분대'], ['rank', '순위']];
    const head = `<header>${shopOpen ? '<b>무기상</b>' : tabs.map(([k, n]) => `<button data-act="tab:${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}<button data-act="closepanel" class="c-x" aria-label="닫기">✕</button></header>`;
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
    }).join(''));
  }

  function renderHud(): void {
    const w = world!, f = w.factions[0], b = w.boss(0), z = w.zone;
    put(q('#c-res'), `<span class="ca" title="자금">$ <b>${$(f.cash)}</b><small>+${$(f.income)}/s</small></span><span class="cr" title="크리스탈">◆ <b>${$(f.crystal)}</b></span><span title="인구">병력 <b>${f.supply}/${f.supplyMax}</b></span>`);
    const entries = tut ? [] : missionLog(w), summary = missionSummary(entries), current = summary.active;
    put(q('#c-quest'), tut ? '' : current ? `<div class="c-quest-head"><span>작전 지령 <b>${summary.completed}/${summary.total}</b></span><button data-act="missions" aria-label="전체 작전 지령 보기"><kbd>J</kbd>전체 보기</button></div><strong>${current.title}</strong><p>${current.objective}</p><div class="c-quest-progress" role="progressbar" aria-label="${current.title} 진행률" aria-valuemin="0" aria-valuemax="${current.target}" aria-valuenow="${current.current}"><i style="width:${current.current / current.target * 100}%"></i></div><small>${current.current}/${current.target}${current.reward ? ' · 완료 보상 $' + $(current.reward) : ' · 최종 작전'}</small>` : '<div class="c-quest-head"><span>작전 지령 완료</span><button data-act="missions">전체 보기</button></div><strong>최후의 왕국!</strong>');
    if (!q('#c-missions').hidden) renderMissions();
    void z; if (tut) put(q('#c-zone'), `<b>튜토리얼</b><span>연습장 · 라이벌 정지</span><span>${Math.min(tut.s.i, STEPS.length - 1) + 1}/${STEPS.length}</span>`); else put(q('#c-zone'), `<b>${clock(w.time)}</b><span>생존 왕국 <b>${w.aliveCount()}</b>/8</span>`);
    put(q('#c-wanted'), f.wanted >= 1 ? `<span class="stars">${'★'.repeat(Math.floor(f.wanted))}${'☆'.repeat(5 - Math.floor(f.wanted))}</span> 수배 중` : '');
    put(q('#c-feed'), w.feed.filter(x => w.time - x.t < 7).slice(-5).map(x => `<div style="border-color:${x.color}">${x.text}</div>`).join(''));
    const army = w.armyOf(0).length; put(q('#c-squads'), squadBar(w));
    if (b) {
      const s = f.slots[f.cur], wd = WEAPONS[s.id];
      put(q('#c-boss'), `<div class="c-bars"><div class="hp"><i style="width:${Math.max(0, b.hp / b.maxHp * 100)}%"></i><span>${Math.ceil(b.hp)} / ${b.maxHp}</span></div><div class="ar"><i style="width:${f.armor}%"></i></div><div class="xp"><i style="width:${f.xp / w.xpNeed(f.level) * 100}%"></i></div></div>
        <div class="c-slots">${f.slots.map((x, i) => `<button data-act="slot:${i}" class="${i === f.cur ? 'on' : ''}"><kbd>${i + 1}</kbd>${WEAPONS[x.id].name}</button>`).join('')}</div>
        <div class="c-ammo"><b>${f.reloadT > 0 ? '재장전…' : s.mag}</b><small>/ ${wd.ammo > 0 ? s.ammo - s.mag : '∞'}</small><span>Lv.${f.level} · 병력 ${army} · 키트 ${f.medkits}</span></div>
        <div class="c-skills"><span class="${f.skillCd > 0 ? 'cd' : ''}"><kbd>Q</kbd>${CLASSES[f.klass].skill}${f.skillCd > 0 ? ' ' + Math.ceil(f.skillCd) : ''}</span><span class="${f.dashCd > 0 ? 'cd' : ''}"><kbd>␣</kbd>대시</span></div>`);
    } else put(q('#c-boss'), `<div class="c-down"><b>쓰러짐</b> ${f.respawnT > 0 ? `${Math.ceil(f.respawnT)}초 후 본부에서 부활` : '…'}</div>`);
    // 상호작용 안내
    let prompt = '';
    if (b && !b.inVeh) {
      const l = w.loot.find(x => x.alive && x.type === 'weapon' && x.fall <= 0 && Math.hypot(x.x - b.x, x.y - b.y) < 46);
      const zb = w.businesses.find(x => Math.hypot(x.x - b.x, x.y - b.y) < 64);
      const v = w.vehicles.find(x => x.alive && x.burn <= 0 && x.ai !== 'chase' && Math.hypot(x.x - b.x, x.y - b.y) - x.r < 78);
      if (l) prompt = `<kbd>E</kbd> ${WEAPONS[l.weapon!].name} 줍기`;
      else if (zb) prompt = zb.kind === 'gunshop' ? '<kbd>E</kbd> 무기상 열기' : zb.owner < 0 ? `<kbd>E</kbd> ${BIZ[zb.kind].name} 매입 <b>$${w.bizPrice(f, zb)}</b> · 초당 +$${BIZ[zb.kind].income}` : zb.owner === 0 ? (zb.level < 3 ? `<kbd>E</kbd> ${BIZ[zb.kind].name} 업그레이드 <b>$${w.upgradePrice(zb)}</b>` : `${BIZ[zb.kind].name} ★★★ 최고 등급`) : `${FACTIONS[zb.owner].name}의 ${BIZ[zb.kind].name} — 적대적 인수 ${Math.max(0, 6 - zb.cap).toFixed(1)}초${zb.cap <= 0.05 ? ' (경비 제거 필요)' : ''}`;
      else if (v) prompt = `<kbd>F</kbd> ${v.kind === 'tank' ? '전차 탈취' : v.kind === 'police' ? '경찰차 탈취 (수배 ★)' : v.driver ? '차량 강탈' : `${v.kind === 'sports' ? '스포츠카' : v.kind === 'truck' ? '트럭' : '세단'} 탑승`}`;
    } else if (b) prompt = '<kbd>F</kbd> 하차 · <kbd>Space</kbd> 핸드브레이크';
    const pe = q('#c-prompt'); put(pe, prompt); pe.className = 'c-prompt' + (prompt ? ' show' : '');
    if (!panel.hidden && (tab === 'market' || tab === 'rank' || tab === 'assets' || tab === 'train' || tab === 'squad' || shopOpen)) renderPanel();
    const head = view !== 'top' && R3 ? R3.yaw : null; R!.minimap(q<HTMLCanvasElement>('#c-mini'), false, head); if (!bigmap.hidden) R!.minimap(q<HTMLCanvasElement>('#c-big'), true, head);
  }
  function showPerks(): void {
    const f = world!.factions[0];
    unlock();
    modal.innerHTML = `<section class="c-perks"><div class="c-kicker">LEVEL ${f.level}</div><h2>특성을 선택하세요</h2><div class="c-classes">${f.choices.map((c, i) => `<button class="c-class" data-act="perk:${i}"><span>${PERKS[c].icon}</span><b>${PERKS[c].name}</b><p>${PERKS[c].desc}</p><small>${i + 1} 키</small></button>`).join('')}</div></section>`;
  }
  function showResult(): void {
    const w = world!, f = w.factions[0], win = w.winner === 0, place = win ? 1 : f.place || w.aliveCount() + 1; resultShown = true; unlock(); audio.setEngine(-1); audio.play(win ? 'win' : 'lose');
    recordMatch(win, w.time, f.kills);
    try { const c = readCityCareer(); localStorage.setItem(CITY_KEY, JSON.stringify({ matches: c.matches + 1, wins: c.wins + Number(win), best: c.best ? Math.min(c.best, place) : place })); } catch { /* 기록은 선택 사항 */ }
    modal.innerHTML = `<section class="c-result ${win ? 'win' : ''}"><div class="c-kicker">${win ? 'LAST KINGDOM STANDING' : 'KINGDOM FALLEN'}</div><h2>${win ? '최후의 왕국!' : `#${place} <small>/ 8 왕국</small>`}</h2><p class="c-lead">${win ? '도시의 모든 것이 이제 당신의 것입니다.' : place <= 3 ? '거의 다 왔습니다. 한 판 더!' : '경제를 먼저 굴리고, 병력과 함께 움직여 보세요.'}</p>
      <div class="c-stats"><div><b>${clock(w.time)}</b><span>생존 시간</span></div><div><b>${f.kills}</b><span>처치</span></div><div><b>${f.bossKills}</b><span>보스 처치</span></div><div><b>$${$(f.earned)}</b><span>총 수익</span></div><div><b>${f.level}</b><span>보스 레벨</span></div></div>
      <div class="c-actions"><button data-act="retry" class="c-primary">다시 도전</button><button data-act="exit">메뉴로</button></div></section>`;
  }

  // ---------- 입력 ----------
  function onKey(e: KeyboardEvent): void {
    if (closed) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, w = world;
    if (!w) return; const f = w.factions[0];
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
    if (focusedControl || e.repeat) return;
    if (e.shiftKey && /^Digit[0-5]$/.test(e.code)) { act('sq:' + e.code.slice(5)); return; }
    keys.add(k);
    if (k === ' ') e.preventDefault();
    if (k === 'e') interact(); else if (k === 'f') w.toggleVehicle(0); else if (k === 'r') reload(w, 0); else if (k === 'q') res(w.useSkill(0)); else if (k === 'h') w.useMedkit(0);
    else if (k === 'z') act('order:follow'); else if (k === 'x') act('order:hold'); else if (k === 'c') { const p = aimPoint(); w.order(0, 'amove', p.x, p.y); } else if (k === 'v') act('view');
    else if (k === 'j') act('missions'); else if (k === 'm') act('map'); else if (k === 'b') { tab = 'build'; shopOpen = false; panel.hidden = false; renderPanel(); unlock(); }
    else if (k >= '1' && k <= '3') switchWeapon(w, 0, Number(k) - 1);
  }
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };
  const onResize = (): void => { R?.resize(); R3?.resize(); };
  const aimPoint = (): { x: number; y: number } => view === 'top' || !R3 ? R!.toWorld(mouse.x, mouse.y) : R3.groundPoint(900);
  const onBlur = (): void => {
    keys.clear(); mouse.down = false; touchFire = false; looks.clear();
    for (const stick of [sticks.move, sticks.aim]) { stick.id = -1; stick.x = 0; stick.y = 0; }
    if (world && !world.over && !paused && world.factions[0].pending === 0 && document.hidden) pause();
  };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp); window.addEventListener('resize', onResize); window.addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onBlur);
  // Click fires for mouse, touch and keyboard activation; pointerdown excluded keyboard users.
  root.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-act]') : null;
    if (t && !(t as HTMLButtonElement).disabled) { e.stopPropagation(); act(t.dataset.act!, e); }
  });
  root.addEventListener('contextmenu', e => e.preventDefault());
  const place = (sx: number, sy: number): void => { const w = world!, p = view === 'top' || !R3 ? R!.toWorld(sx, sy) : { x: ghost!.x, y: ghost!.y }, e = w.build(0, ghost!.kind, p.x, p.y); if (e) toast(e); else { audio.play('build'); if (!keys.has('Shift')) ghost = null; } };
  const looks = new Map<number, { x: number; y: number }>();
  for (const cv of [canvas, canvas3]) {
    cv.addEventListener('pointerdown', e => {
      audio.unlock(); if (!world || paused || world.over) return; mouse.x = e.clientX; mouse.y = e.clientY; const three = cv === canvas3;
      if (e.pointerType === 'touch') {
        if (ghost) { if (three) { const p = R3!.groundPoint(700); ghost.x = p.x; ghost.y = p.y; } place(e.clientX, e.clientY); return; }
        if (e.clientX < innerWidth * 0.45) { const s = sticks.move; if (s.id < 0) { s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0; } }
        else if (three) looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
        else { const s = sticks.aim; if (s.id < 0) { s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0; } }
        return;
      }
      if (three && !locked && !lockFail) { lock(); return; }
      if (e.button === 2) { if (ghost) ghost = null; else { const p = three ? R3!.groundPoint(900) : R!.toWorld(e.clientX, e.clientY); world.order(0, 'amove', p.x, p.y); } return; }
      if (e.button === 0) { if (ghost) place(e.clientX, e.clientY); else mouse.down = true; }
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') {
        for (const s of [sticks.move, sticks.aim]) if (s.id === e.pointerId) { s.x = Math.max(-1, Math.min(1, (e.clientX - s.ox) / 56)); s.y = Math.max(-1, Math.min(1, (e.clientY - s.oy) / 56)); }
        const l = looks.get(e.pointerId); if (l && R3) { R3.yaw += (e.clientX - l.x) * 0.0062; R3.pitch = Math.max(-1.2, Math.min(1, R3.pitch - (e.clientY - l.y) * 0.005)); l.x = e.clientX; l.y = e.clientY; lastLook = performance.now(); }
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
    const hq = w.hq(0); if (hq && b && (Math.hypot(hq.x + 60 - b.x, hq.y + 60 - b.y) > 420 || w.time - hq.hurtT < 5)) list.push({ x: hq.x + 60, y: hq.y + 60, h: 190, text: w.time - hq.hurtT < 5 ? '본부 피격!' : '본부', color: w.time - hq.hurtT < 5 ? '#ff6b6b' : FACTIONS[0].color, edge: true });
    for (const l of w.loot) if (l.alive && l.type === 'crate') list.push({ x: l.x, y: l.y, h: 60, text: '보급 상자', color: '#ffe27a', edge: true });
    const z = w.zone; if (b && Math.hypot(b.x - z.nx, b.y - z.ny) > z.nr && z.nr < 3800) list.push({ x: z.nx, y: z.ny, h: 40, text: '안전지대', color: '#c9a2ff', edge: true });
    if (b && !w.businesses.some(q2 => q2.owner === 0)) { let best: { x: number; y: number } | null = null, bd = 1e9; for (const q2 of w.businesses) if (q2.owner < 0 && q2.kind !== 'gunshop') { const d = Math.hypot(q2.x - b.x, q2.y - b.y); if (d < bd) { bd = d; best = q2; } } if (best) list.push({ x: best.x, y: best.y, h: 60, text: '매입 가능', color: '#ffffff', edge: true }); }
    for (const f of w.factions) { if (f.id === 0) continue; const o = w.boss(f.id); if (!o || !b) continue; const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < 1500) list.push({ x: o.x, y: o.y, h: 62, text: `${f.name} Lv.${f.level} · ${Math.ceil(o.hp)}`, color: f.color, edge: false }); }
    if (tut) { list.length = 0; const st = STEPS[tut.s.i], mk = st?.marker?.({ w, c: tut.c, s: tut.s, yaw: r3.yaw }); if (mk) list.push({ x: mk.x, y: mk.y, h: mk.h, text: mk.text, color: '#ffe27a', edge: true }); }
    while (marks.length < list.length) { const el = document.createElement('div'); el.className = 'c-mark'; layer.append(el); marks.push(el); }
    marks.forEach((el, i) => {
      const m = list[i]; if (!m) { el.style.display = 'none'; return; }
      const p = r3.project(m.x, m.y, m.h); let x = p.x, y = p.y; const off = p.behind || x < 40 || x > r3.w - 40 || y < 40 || y > r3.h - 40;
      if (off && !m.edge) { el.style.display = 'none'; return; }
      if (off) { let dx = x - r3.w / 2, dy = y - r3.h / 2; if (p.behind) { dx = -dx; dy = Math.abs(dy) + r3.h; } const k = Math.min((r3.w / 2 - 50) / Math.abs(dx || 1), (r3.h / 2 - 60) / Math.abs(dy || 1)); x = r3.w / 2 + dx * k; y = r3.h / 2 + dy * k; }
      const dist = b ? Math.round(Math.hypot(m.x - b.x, m.y - b.y) / 30) : 0;
      el.style.display = ''; el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; el.style.color = m.color; el.textContent = m.edge ? `${m.text} ${dist}m` : m.text; el.classList.toggle('edge', off);
    });
  }
  function crossTarget(): string {
    const w = world!, b = w.boss(0); if (!b || !R3) return ''; const f = w.factions[0], range = WEAPONS[f.slots[f.cur].id].range, dx = Math.cos(R3.yaw), dy = Math.sin(R3.yaw); let best = range, html = '', hostile = false;
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
        const ox = b ? b.x : 0, oy = b ? b.y : 0; inp.ax = ox + c * 600; inp.ay = oy + s * 600; inp.fire = ((mouse.down && (locked || lockFail)) || touchFire) && !ghost;
      } else {
        inp.mx = mx; inp.my = my;
        if (sticks.aim.id >= 0 && b) { const m = Math.hypot(sticks.aim.x, sticks.aim.y); if (m > 0.2) { inp.ax = b.x + sticks.aim.x / m * 300; inp.ay = b.y + sticks.aim.y / m * 300; } inp.fire = m > 0.35; }
        else if (touch && b) { inp.fire = touchFire; if (Math.hypot(mx, my) > 0.2) { inp.ax = b.x + mx * 300; inp.ay = b.y + my * 300; } }
        else { const p = r.toWorld(mouse.x, mouse.y); inp.ax = p.x; inp.ay = p.y; inp.fire = mouse.down && !ghost; }
      }
      acc += dt; let n = 0; while (acc >= 1 / 60 && n < 4) { w.step(1 / 60); acc -= 1 / 60; n++; } if (n === 4) acc = 0;
      // 이벤트 → 화면·소리
      if (three) R3!.consume(w.events); else r.consume(w.events);
      const lx = b ? b.x : r.cam.x, ly = b ? b.y : r.cam.y;
      for (const e of w.events) {
        const d = Math.hypot(e.x - lx, e.y - ly), vol = Math.max(0, 1 - d / 1200);
        if (e.t === 'shot') { audio.play(e.s!, vol * (e.f === 0 ? 1 : 0.6)); if (vol > 0.3) combat = Math.min(1, combat + 0.08); }
        else if (e.t === 'boom') audio.play('boom', vol); else if (e.t === 'hit') { if (e.a === 1) { hitT = 0.14; cross.classList.add('hit'); audio.play('hit', 0.9); } else audio.play('hit', vol * 0.5); } else if (e.t === 'spark') audio.play('hit', vol * 0.4); else if (e.t === 'death') audio.play('death', vol);
        else if (e.t === 'kill') { hitT = 0.3; cross.classList.add('hit', 'kill'); audio.play('pickup', 0.8); }
        else if (e.t === 'phurt') hurt = Math.min(1, hurt + (e.a ?? 10) / 45);
        else if (e.t === 'cash' && e.f === 0) audio.play('cash'); else if (e.t === 'pickup' && d < 60) audio.play('pickup'); else if (e.t === 'levelup' && e.f === 0) audio.play('levelup');
        else if (e.t === 'order') { if (tut) tut.c.orders++; } else if (e.t === 'quest') { audio.play('quest'); banner(`목표 달성 +$${e.a}`); } else if (e.t === 'siren') audio.play('siren'); else if (e.t === 'announce') { audio.play('announce'); banner(e.s!); }
        else if (e.t === 'crash') audio.play('crash', 0.8); else if (e.t === 'reload') audio.play('reload'); else if (e.t === 'dash') audio.play('dash'); else if (e.t === 'door') audio.play('door'); else if ((e.t === 'built' || e.t === 'capture') && e.f === 0) audio.play('build');
        else if (e.t === 'thud') audio.play('boom', vol * 0.5); else if (e.t === 'playerdown') { audio.play('lose'); hurt = 1; }
      }
      w.events.length = 0; combat = Math.max(0, combat - dt * 0.25); audio.intensity = combat;
    }
    audio.setEngine(veh ? Math.min(1, spd / veh.maxSpeed) : -1);
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) cross.classList.remove('hit', 'kill'); }
    hurt = Math.max(0, hurt - dt * 1.3); const low = b && b.hp < b.maxHp * 0.35 ? 0.35 + Math.sin(now / 160) * 0.12 : 0, outside = !!b && Math.hypot(b.x - w.zone.x, b.y - w.zone.y) > w.zone.r;
    hurtEl.style.opacity = String(Math.max(hurt * 0.85, low)); hurtEl.classList.toggle('storm', outside && hurt < 0.1);if (outside) hurtEl.style.opacity = String(Math.max(0.45, hurt));
    if (three && R3) {
      if (ghost) { const p = R3.groundPoint(700); ghost.x = Math.round(p.x / 10) * 10; ghost.y = Math.round(p.y / 10) * 10; ghost.ok = w.canBuild(0, ghost.kind, ghost.x, ghost.y); }
      R3.draw(paused ? 0 : dt, ghost); overlay(); r.cam.x = b ? b.x : r.cam.x; r.cam.y = b ? b.y : r.cam.y;
    } else {
      if (b) { const look = touch ? { x: 0, y: 0 } : { x: (mouse.x - r.w / 2) * 0.22 / r.cam.zoom, y: (mouse.y - r.h / 2) * 0.22 / r.cam.zoom }; const tx = b.x + look.x + (veh ? veh.vx * 0.35 : 0), ty = b.y + look.y + (veh ? veh.vy * 0.35 : 0); r.cam.x += (tx - r.cam.x) * Math.min(1, dt * 7); r.cam.y += (ty - r.cam.y) * Math.min(1, dt * 7); }
      const base = Math.max(0.55, Math.min(1, Math.min(r.w, r.h * 1.5) / 1100)); r.cam.zoom += (base * userZoom * (1 - Math.min(0.3, spd / 1800)) - r.cam.zoom) * Math.min(1, dt * 3);
      if (ghost) { const p = r.toWorld(mouse.x, mouse.y); ghost.x = p.x; ghost.y = p.y; ghost.ok = w.canBuild(0, ghost.kind, p.x, p.y); }
      r.draw(paused ? 0 : dt, ghost, touch || !b ? null : r.toWorld(mouse.x, mouse.y));
    }
    root.classList.toggle('down', !b && !w.over);
    if (b) { // 구역 이름
      const bi = Math.max(0, Math.min(BLOCKS - 1, Math.floor((b.x - ROAD / 2) / PITCH))), bj = Math.max(0, Math.min(BLOCKS - 1, Math.floor((b.y - ROAD / 2) / PITCH))), bl = w.map.blocks[bj * BLOCKS + bi], ring = Math.max(Math.abs(bi - 4), Math.abs(bj - 4));
      const owner = bl.type === 'base' ? w.factions.find(x => { const h = w.hq(x.id); return h && h.x > bl.x && h.x < bl.x + 440 && h.y > bl.y && h.y < bl.y + 440; }) : undefined;
      const name = bl.type === 'base' ? (owner ? `${owner.name} 영지` : '폐허가 된 영지') : bl.type === 'plaza' ? '센트럴 플라자' : bl.type === 'park' ? '크리스탈 공원' : bl.type === 'police' ? '경찰청' : bl.type === 'military' ? '군 기지' : bl.type === 'lot' ? '공영 주차장' : ring <= 1 ? '카지노 스트립' : ring === 2 ? '다운타운' : ring === 3 ? '미드타운' : '외곽 항만';
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
  void loadModels(import.meta.env.BASE_URL).then(m => { models = m; }).catch(() => { models = null; });
  setup();
}
