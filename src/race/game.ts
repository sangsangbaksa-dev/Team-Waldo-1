import '../shared/game-polish.css';
// SPEED RUSH — 레이싱 모드 진입점: 입력, HUD, 게임 루프. 레이싱카 모델은 race.glb(tools/blender/race.py)입니다.
import './race.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readPreferences, writePreferences } from '../prefs';
import { fmtTime, raceRaceKey, readRaceRecords, readRaceSetupRaw, writeRaceRecords, writeRaceSetupRaw } from '../records';
import type { PvpSession, RoomSession } from '../net/lobby';
import { RaceMulti } from './multi';
import { RaceAudio, gearFor } from './audio';
import { carById, levelById, mapOf, sanitizeSetup, type RaceSetup } from './config';
import { aiInput, boosting, kmh, type CarInput } from './physics';
import { RacePvp } from './pvp';
import { decideWinner } from './netcar';
import { createRace, currentLap, placeOf, updateRace, type RaceEvent, type RaceState } from './race';
import { ghostAt, ghostDelta, readGhost, writeGhost } from './ghost';
import { minimapTransform } from './minimap';
import { ownsSkin, readGarage, rewardFor, writeGarage } from './garage';
import { mountSetup, type SetupHandle } from './setup-ui';
import { buildMapTrack, type Track } from './track';
import { RaceView, setDriverKit } from './view';
import { loadCharacterKit } from '../shared/character';
import { driftLive, readDriftBests, writeDriftBests } from './driftscore';
import { PVP_ENABLED } from '../net/config';
import { advanceWrongWay, WRONG_WAY_DELAY } from './hud-timing';
import { framePlan, STEP, escapeRaceText } from './frame-plan';
const ORD = ['', '1ST', '2ND', '3RD', '4TH', '5TH', '6TH'];

export function openRace(onExit: () => void): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches;
  const root = document.createElement('div'); root.className = 'rc-root' + (touch ? ' touch' : ''); root.dataset.phase = 'loading';
  root.innerHTML = `<canvas class="rc-canvas"></canvas><canvas class="rc-fx"></canvas><div class="rc-vignette"></div><div class="rc-boostfx"></div>
  <div class="rc-hud">
    <div class="rc-tl"><div class="rc-pos"><b id="rc-pos">4</b><span id="rc-of">/ 4</span></div><div class="rc-lap">LAP <b id="rc-lap">1</b>/<span id="rc-laps">3</span></div></div>
    <div class="rc-tc"><div class="rc-time" id="rc-time">0:00.000</div><div class="rc-best" id="rc-best"></div></div>
    <div class="rc-tr"><canvas id="rc-map" width="220" height="220" aria-label="미니맵"></canvas><div class="rc-btns"><button data-act="mute" title="소리 (M)" aria-pressed="${prefs.sound}">${prefs.sound ? '🔊' : '🔇'}</button><button data-act="pause" title="일시정지 (Esc)">Ⅱ</button><button data-act="exit" title="나가기">✕</button></div></div>
    <div class="rc-msg" id="rc-msg"></div><div class="rc-count" id="rc-count"></div><div class="rc-wrong" id="rc-wrong">역주행!</div><div class="rc-draft" id="rc-draft">SLIPSTREAM</div><div class="rc-drift" id="rc-drift"></div>
    <div class="rc-bottom"><div class="rc-nitro"><span>NITRO</span><div><i id="rc-nitro"></i></div></div><div class="rc-speed"><b id="rc-kmh">0</b><small>km/h</small><em id="rc-gear">N</em></div><div class="rc-rev"><i id="rc-rev"></i></div></div>
    <div class="rc-keys"><span><kbd>W</kbd><kbd>↑</kbd> 가속</span><span><kbd>A</kbd><kbd>D</kbd> 조향</span><span><kbd>Space</kbd> 드리프트</span><span><kbd>Shift</kbd> 니트로</span><span><kbd>R</kbd> 복귀</span></div>
    <div class="rc-touchpad"><div class="rc-steer"><button data-hold="left" aria-label="왼쪽">◀</button><button data-hold="right" aria-label="오른쪽">▶</button></div><div class="rc-pedals"><button data-hold="gas" class="gas" aria-label="가속">가속</button><div class="rc-pedal-row"><button data-hold="nitro">NITRO</button><button data-hold="drift">DRIFT</button><button data-hold="brake">BRAKE</button></div></div></div>
  </div>
  <div class="rc-modal" id="rc-modal"><div class="rc-card"><span class="rc-eyebrow">SPEED RUSH</span><h2>엔진 예열 중…</h2></div></div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(s: string): T => root.querySelector<T>(s)!;
  let canvas = $<HTMLCanvasElement>('.rc-canvas'); const fx = $<HTMLCanvasElement>('.rc-fx'), fg = fx.getContext('2d'), mini = $<HTMLCanvasElement>('#rc-map'), mg = mini.getContext('2d'), modal = $('#rc-modal');
  const audio = new RaceAudio(); audio.enabled = prefs.sound;
  const garage = { value: readGarage() };
  let setup: RaceSetup = sanitizeSetup(readRaceSetupRaw()), records = readRaceRecords(), track: Track = buildMapTrack(mapOf(setup)), setupUi: SetupHandle | null = null;
  let race: RaceState = createRace(track, setup.laps, Infinity, setup), view: RaceView | null = null, raf = 0, last = 0, acc = 0, paused = false, closed = false, finishedShown = false, lastPlace = 4, msgT = 0, wallHit = 0, fxIntensity = 0, wrongT = 0, raceGen = 0;
  /** 1대1 대전 진행 상태. null 이면 혼자 달리는 모드입니다. */
  let multi: { s: RoomSession; net: RaceMulti; myFin: number | null; gone: Set<string>; done: boolean } | null = null;
  let pvp: { s: PvpSession; net: RacePvp; myFin: number | null; oppFin: number | null; done: boolean } | null = null;
  const keys = new Set<string>(), hold = { left: false, right: false, brake: false, drift: false, nitro: false, gas: false };
  const clearInput = (): void => { keys.clear(); for (const k of Object.keys(hold) as Array<keyof typeof hold>) hold[k] = false; root.querySelectorAll('[data-hold].down').forEach(b => b.classList.remove('down')); };
  let driftBests = readDriftBests(), nitroWas = false, driftWas = false;
  const cache = new Map<string, string>(); const setText = (id: string, v: string): void => { if (cache.get(id) !== v) { cache.set(id, v); $(id).textContent = v; } };

  const msg = (text: string, kind = ''): void => { const el = $('#rc-msg'); el.textContent = text; el.className = `rc-msg show ${kind}`; msgT = 1.6; };
  const bigCount = (text: string, go = false): void => { const el = $('#rc-count'); el.textContent = text; el.className = 'rc-count'; void el.offsetWidth; el.className = `rc-count show${go ? ' go' : ''}`; };

  const dbg = { auto: false };
  if (import.meta.env.DEV) (window as unknown as { __race: unknown }).__race = { get race() { return race; }, dbg, skip(sec: number) { for (let t = 0; t < sec; t += STEP) handle(updateRace(race, STEP, readInput())); } }; // 개발 중 화면 캡처용: 시뮬레이션을 앞으로 감습니다.
  function readInput(): CarInput {
    if (dbg.auto) { const c = race.player.car, ai = aiInput(c, track, { lane: 0, top: race.player.params.top * 0.97, grip: 38, skill: 1, line: 1 }); return { ...ai, nitro: c.nitro > 0.5 && Math.abs(track.k[c.idx]) < 0.002, }; }
    const k = (n: string): boolean => keys.has(n), left = k('ArrowLeft') || k('KeyA') || hold.left, right = k('ArrowRight') || k('KeyD') || hold.right;
    const brake = k('ArrowDown') || k('KeyS') || hold.brake;
    // 터치 자동 가속은 출발 후에만. 카운트다운 중에는 가속 버튼을 눌러야 출발 부스트가 납니다.
    const gas = k('ArrowUp') || k('KeyW') || hold.gas || (touch && race.phase === 'racing' && !brake);
    return { throttle: gas ? 1 : 0, brake: brake ? 1 : 0, steer: (right ? 1 : 0) - (left ? 1 : 0), drift: k('Space') || hold.drift, nitro: k('ShiftLeft') || k('ShiftRight') || hold.nitro };
  }

  function handle(ev: RaceEvent[]): void {
    for (const e of ev) switch (e.type) {
      case 'count': bigCount(String(e.n)); audio.sfx('count'); break;
      case 'go': bigCount('GO!', true); audio.sfx('go'); view?.punchFov(0.5); break;
      case 'launch': msg('PERFECT START!', 'gold'); view?.punchFov(1); audio.sfx('pad'); break;
      case 'pad': msg('BOOST PAD!', 'cyan'); view?.punchFov(0.8); audio.sfx('pad'); break;
      case 'driftBoost': msg(`DRIFT BOOST  +${e.secs.toFixed(1)}s`, 'cyan'); view?.punchFov(0.7); audio.sfx('drift'); break;
      case 'hit': wallHit = e.power; view?.kick(Math.min(1, e.power * 0.05)); audio.sfx('hit', e.power); break;
      case 'bump': view?.kick(Math.min(0.5, e.power * 0.03)); audio.sfx('bump'); break;
      case 'lap': if (e.lap < race.laps) { msg(e.best ? `LAP ${e.lap}  ${fmtTime(e.time)}  ★ BEST` : `LAP ${e.lap}  ${fmtTime(e.time)}`, e.best ? 'gold' : ''); audio.sfx(e.best ? 'best' : 'lap'); } break;
      case 'driftBank': msg(`DRIFT +${e.points.toLocaleString('ko-KR')}${e.mult > 1 ? `  ×${e.mult}` : ''}`, 'gold'); audio.sfx('drift'); break;
      case 'driftLost': if (e.points >= 200) { msg('DRIFT 체인 끊김', 'hint'); msgT = 1.2; } break;
      case 'finish': audio.sfx('finish'); if (pvp) pvpFinish(e.time); else if (multi) multiFinish(e.time); else finishRace(e.place, e.time); break;
    }
  }

  function finishRace(place: number, time: number): void {
    if (finishedShown) return; finishedShown = true;
    const gen = raceGen;
    const map = mapOf(setup), car = carById(setup.car), level = levelById(setup.level), key = raceRaceKey(map.id, setup.laps);
    const bestLap = Math.min(...race.player.lapTimes), prevLap = records.bestLap[map.id] ?? Infinity, prevRace = records.bestRace[key] ?? Infinity, newBest = bestLap < prevLap || time < prevRace;
    records = { bestLap: { ...records.bestLap, [map.id]: Math.min(prevLap, bestLap) }, bestRace: { ...records.bestRace, [key]: Math.min(prevRace, time) }, last: { map: map.id, label: map.name } }; writeRaceRecords(records);
    const trial = !!race.trial, ghostCandidate = trial && race.rec !== undefined && time < (race.ghost?.time ?? Infinity);
    const ghostNew = ghostCandidate && !!race.rec && writeGhost(map.id, setup.laps, setup.car, race.rec.finish(time, setup.laps, race.player.car));
    const drift = race.drift.total, prevDrift = driftBests[map.id] ?? 0, driftNew = drift > prevDrift; if (driftNew) { driftBests = { ...driftBests, [map.id]: drift }; writeDriftBests(driftBests); }
    const coins = trial ? Math.round(rewardFor(4, 1, setup.laps, newBest) / 10) * 5 : rewardFor(place, level.id, setup.laps, newBest); garage.value = { ...garage.value, coins: garage.value.coins + coins }; writeGarage(garage.value);
    window.setTimeout(() => {
      if (closed || gen !== raceGen) return;
      modal.className = 'rc-modal show'; root.dataset.phase = 'done';
      modal.innerHTML = `<div class="rc-card result p${place}"><span class="rc-eyebrow">${map.name} · ${setup.laps}랩 · ${trial ? '타임어택' : level.name} · ${car.name}</span><h2>${trial ? (ghostNew ? 'NEW GHOST' : 'FINISH') : `${ORD[place] ?? place + 'TH'} <small>/ 4</small>`}</h2><p class="rc-total">${fmtTime(time)}</p>
        <ol class="rc-laps">${race.player.lapTimes.map((l, i) => `<li${l === bestLap ? ' class="best"' : ''}><span>LAP ${i + 1}</span><b>${fmtTime(l)}</b></li>`).join('')}</ol>
        <p class="rc-record">${trial ? (ghostNew ? '고스트를 갱신했습니다 — 다음 도전에서 이 주행과 겨룹니다' : ghostCandidate ? '고스트를 저장하지 못했습니다 (저장 공간 또는 브라우저 설정 확인)' : race.ghost ? `고스트 ${fmtTime(race.ghost.time)} · ${time - race.ghost.time >= 0 ? '+' : '-'}${Math.abs(time - race.ghost.time).toFixed(2)}초` : '') : ''}${trial ? '' : newBest ? '개인 최고 기록 갱신' : `${map.name} 최고 랩 ${fmtTime(records.bestLap[map.id] ?? Infinity)}`}</p>
        <p class="rc-record">드리프트 ${drift.toLocaleString('ko-KR')}점${driftNew && drift > 0 ? ' ★ 코스 최고 기록' : prevDrift > 0 ? ` · 코스 최고 ${prevDrift.toLocaleString('ko-KR')}점` : ''}</p>
        <p class="rc-reward">+${coins} 코인 <small>(보유 ${garage.value.coins.toLocaleString('ko-KR')})</small></p>
        <div class="rc-actions"><button class="primary" data-act="restart">다시 달리기</button><button data-act="setup">설정 변경</button><button data-act="exit">메뉴로</button></div></div>`;
    }, 1600);
  }

  /** 선택한 설정으로 코스·레이스·화면을 새로 만듭니다. */
  function begin(): void {
    raceGen++; wrongT = 0; clearInput(); nitroWas = driftWas = false; wallHit = fxIntensity = 0;
    if (view) { view.dispose(); view = null; }
    track = buildMapTrack(mapOf(setup)); prepareMinimap(); audio.setCar(setup.car);
    const trial = setup.mode === 'trial', ghost = trial ? readGhost(setup.map, setup.laps, setup.car) : null;
    race = createRace(track, setup.laps, records.bestLap[setup.map] ?? Infinity, { ...setup, skin: ownsSkin(garage.value, setup.skin) ? setup.skin : 'stock', trial, ghost });
    finishedShown = false; paused = false; acc = 0; lastPlace = trial ? 1 : 4; cache.clear(); setText('#rc-laps', String(setup.laps)); setText('#rc-of', trial ? 'TIME ATTACK' : '/ 4');
    if (!startView(carTemplate)) return;
    modal.className = 'rc-modal'; modal.innerHTML = ''; root.dataset.phase = 'countdown'; msg('', '');
    msg(touch ? '가속 버튼으로 출발 부스트 · 좌우 조향 · 드리프트 · 니트로' : '가속 ↑ · 조향 ← → · 드리프트 Space · 니트로 Shift', 'hint'); msgT = 4; last = performance.now();
  }
  function restart(): void { begin(); }
  function showSetup(): void {
    raceGen++; wrongT = 0; clearInput(); nitroWas = driftWas = false; wallHit = fxIntensity = 0;
    if (view) { view.dispose(); view = null; }
    setupUi?.destroy(); paused = false; modal.className = 'rc-modal'; modal.innerHTML = ''; root.dataset.phase = 'setup';
    setupUi = mountSetup(root, setup, records, garage, {
      onStart: s => { setup = s; writeRaceSetupRaw(s); setupUi?.destroy(); setupUi = null; begin(); },
      onExit: () => exit(),
      onPvp: PVP_ENABLED ? (s => { setup = s; writeRaceSetupRaw(s); openPvpLobby(); }) : undefined,
    });
  }


  // ---------- 1대1 대전 ----------
  function openPvpLobby(): void {
    if (!PVP_ENABLED) return;
    void import('../net/lobby').then(({ openLobby }) => openLobby({ game: 'race', maxPlayers: 6, config: () => ({ map: setup.map, laps: setup.laps }), onMatch: startPvp, onRoom: startMulti, onClose: () => undefined }))
      .catch(() => { modal.className = 'rc-modal show'; modal.innerHTML = '<div class="rc-card"><span class="rc-eyebrow">1대1 대전</span><h2>대전 기능을 불러오지 못했어요</h2><div class="rc-actions"><button data-act="setup">설정으로</button></div></div>'; });
  }
  function pvpCard(eyebrow: string, title: string, body = '', actions = '<button data-act="exit">메뉴로</button>'): void {
    modal.className = 'rc-modal show'; modal.innerHTML = `<div class="rc-card"><span class="rc-eyebrow">${escapeRaceText(eyebrow)}</span><h2>${title}</h2>${body}<div class="rc-actions">${actions}</div></div>`;
  }
  function startPvp(s: PvpSession): void {
    endPvp(); setupUi?.destroy(); setupUi = null; if (view) { view.dispose(); view = null; }
    const cfg = s.match.config; setup = sanitizeSetup({ ...setup, map: cfg.map, laps: cfg.laps }); paused = false; finishedShown = false; root.dataset.phase = 'setup';
    pvpCard('1대1 대전', `${escapeRaceText(s.opponent.nickname)} 님과 연결하는 중…`, `<p class="rc-record">${mapOf(setup).name} · ${setup.laps}랩 · ${carById(setup.car).name}</p>`, '<button data-act="exit">나가기</button>');
    const net: RacePvp = new RacePvp(s, setup.car, {
      onStart: car => beginPvp(car),
      onSnap: snap => { const rival = race.racers[1]; if (pvp && rival?.link) rival.link = { snap, at: performance.now() }; },
      onFinish: time => { if (!pvp || pvp.done) return; pvp.oppFin = time; const r = race.racers[1]; if (r) r.finishTime = time; if (pvp.myFin !== null) decide(); else void conclude(s.opponent.id, '상대가 먼저 결승선을 통과했습니다'); },
      onGone: reason => { if (pvp && !pvp.done) void conclude(s.me.id, reason === 'never' ? '상대가 접속하지 않았습니다' : '상대와의 연결이 끊어졌습니다'); },
    });
    pvp = { s, net, myFin: null, oppFin: null, done: false };
  }
  function beginPvp(oppCar: string): void {
    if (!pvp || closed) return; const s = pvp.s;
    track = buildMapTrack(mapOf(setup)); prepareMinimap();
    wrongT = 0; clearInput(); nitroWas = driftWas = false; wallHit = fxIntensity = 0;
    race = createRace(track, setup.laps, Infinity, { ...setup, pvp: { host: s.host, opponent: s.opponent.nickname, opponentCar: oppCar } });
    acc = 0; cache.clear(); lastPlace = 2; setText('#rc-laps', String(setup.laps)); setText('#rc-of', '/ 2'); setText('#rc-best', `VS ${s.opponent.nickname}`);
    if (!startView(carTemplate)) return;
    modal.className = 'rc-modal'; modal.innerHTML = ''; root.dataset.phase = 'countdown'; msg(`${s.opponent.nickname} 님과 대전 · 먼저 결승선을 통과하면 승리`, 'hint'); msgT = 4; last = performance.now();
  }
  function pvpFinish(time: number): void {
    if (!pvp || pvp.done) return; pvp.myFin = time; pvp.net.sendFinish(time);
    const p = pvp;
    if (p.oppFin !== null) decide(); else window.setTimeout(() => { if (!closed && pvp === p && !p.done) void conclude(p.s.me.id, '먼저 결승선을 통과했습니다'); }, 4000);
  }
  function decide(): void {
    if (!pvp || pvp.myFin === null || pvp.oppFin === null) return;
    const w = decideWinner(pvp.myFin, pvp.oppFin, pvp.s.host); void conclude(w === 'me' ? pvp.s.me.id : pvp.s.opponent.id, '두 선수 모두 결승선을 통과했습니다');
  }
  /** 승자를 서버에 보고하고, 확정된 레이팅 변화를 보여 줍니다. 스스로 패배를 보고하면 즉시 확정되고, 승리 보고는 상대의 보고나 15초 대기 뒤에 확정됩니다. */
  async function conclude(winner: string, why: string): Promise<void> {
    if (!pvp || pvp.done) return; pvp.done = true; finishedShown = true; const p = pvp, win = winner === p.s.me.id, eyebrow = `${mapOf(setup).name} · ${setup.laps}랩 · vs ${p.s.opponent.nickname}`;
    const mine = p.myFin !== null ? `<p class="rc-total">${fmtTime(p.myFin)}</p>` : '';
    const card = (extra: string, actions = '', voided = false, won = win): void => { window.setTimeout(() => { if (!closed && pvp === p) pvpCard(eyebrow, voided ? '무효' : won ? '승리' : '패배', `${mine}<p class="rc-record">${why}</p><p class="rc-record">${extra}</p>`, actions || '<button data-act="exit">메뉴로</button>'); }, p.myFin !== null ? 900 : 0); };
    card('결과를 기록하는 중…');
    try {
      let row = await p.s.backend.report(p.s.match.id, winner);
      for (let i = 0; i < 8 && row.status === 'playing' && pvp === p && !closed; i++) { await new Promise(r => window.setTimeout(r, 3000)); row = await p.s.backend.settle(p.s.match.id); }
      if (closed || pvp !== p) return;
      const d = p.s.host ? row.host_delta : row.guest_delta, after = row.status === 'finished' && d !== null ? `레이팅 ${d >= 0 ? '+' : ''}${d}` : row.status === 'void' ? '두 쪽의 보고가 달라 이 대전은 기록되지 않았습니다.' : '결과가 아직 확정되지 않았습니다.';
      card(after, '<button class="primary" data-act="rematch">다시 대전</button><button data-act="exit">메뉴로</button>', row.status === 'void', row.status === 'finished' ? row.winner_id === p.s.me.id : win);
    } catch { card('기록을 저장하지 못했습니다. 네트워크를 확인해 주세요.'); }
  }
  /** 나가기: 대전 중이면 기권으로 처리합니다. */
  function leavePvp(): void {
    const p = pvp; if (!p) return;
    if (!p.done && p.net.started) { p.net.bye(); void p.s.backend.report(p.s.match.id, p.s.opponent.id).catch(() => undefined); }
    else if (!p.done) void p.s.backend.cancelMatch(p.s.match.id).catch(() => undefined);
    endPvp();
  }
  function endPvp(): void { pvp?.net.dispose(); pvp = null; endMulti(); }

  // ---------- 멀티플레이 방(3~6인) ----------
  function endMulti(): void { multi?.net.dispose(); multi = null; }
  function racerOf(id: string): ReturnType<typeof createRace>['racers'][number] | undefined { return race.racers.find(r => r.peer === id); }
  function startMulti(s: RoomSession): void {
    endPvp(); setupUi?.destroy(); setupUi = null; if (view) { view.dispose(); view = null; }
    const cfg = s.room.config; setup = sanitizeSetup({ ...setup, map: cfg.map, laps: cfg.laps }); paused = false; finishedShown = false; root.dataset.phase = 'setup';
    pvpCard('멀티플레이', `${s.players.length}명과 연결하는 중…`, `<p class="rc-record">${mapOf(setup).name} · ${setup.laps}랩 · ${carById(setup.car).name}</p>`, '<button data-act="exit">나가기</button>');
    const net: RaceMulti = new RaceMulti(s, setup.car, {
      onStart: list => beginMulti(list),
      onSnap: (id, snap) => { const r = racerOf(id); if (multi && r?.link) r.link = { snap, at: performance.now() }; },
      onFinish: (id, time) => { const r = racerOf(id); if (!multi || multi.done || !r) return; r.finishTime = time; multiCheck(); },
      onGone: id => { if (!multi || multi.done) return; multi.gone.add(id); const r = racerOf(id); if (r) { msg(`${r.name} 님이 나갔습니다`, 'hint'); msgT = 3; } multiCheck(); },
      onAbort: () => { if (multi && !multi.done) pvpCard('멀티플레이', '연결하지 못했어요', '<p class="rc-record">방 사람들과 연결되지 않았습니다. 네트워크를 확인해 다시 시도해 주세요.</p>', '<button data-act="rematch">다시 시도</button><button data-act="exit">메뉴로</button>'); },
    });
    multi = { s, net, myFin: null, gone: new Set(), done: false };
  }
  function beginMulti(list: Array<{ id: string; car: string }>): void {
    if (!multi || closed) return; const s = multi.s, meIdx = Math.max(0, list.findIndex(p => p.id === s.me.id));
    const players = list.filter(p => p.id !== s.me.id).map(p => ({ id: p.id, car: p.car, nickname: s.players.find(x => x.id === p.id)?.nickname ?? '플레이어' }));
    track = buildMapTrack(mapOf(setup)); prepareMinimap();
    wrongT = 0; clearInput(); nitroWas = driftWas = false; wallHit = fxIntensity = 0;
    race = createRace(track, setup.laps, Infinity, { ...setup, multi: { slot: meIdx, players } });
    acc = 0; cache.clear(); lastPlace = list.length; setText('#rc-laps', String(setup.laps)); setText('#rc-of', `/ ${list.length}`); setText('#rc-best', `${list.length}인 레이스`);
    if (!startView(carTemplate)) return;
    modal.className = 'rc-modal'; modal.innerHTML = ''; root.dataset.phase = 'countdown'; msg(`${list.length}명 레이스 · 먼저 결승선을 통과하세요`, 'hint'); msgT = 4; last = performance.now();
  }
  function multiFinish(time: number): void {
    if (!multi || multi.done) return; multi.myFin = time; multi.net.sendFinish(time); const m = multi;
    window.setTimeout(() => { if (multi === m && !m.done) showMulti(); }, 30000); multiCheck();
  }
  function multiCheck(): void {
    if (!multi || multi.done || multi.myFin === null) return;
    const m = multi;
    if (race.racers.every(r => r.player || r.finishTime !== null || (r.peer && m.gone.has(r.peer)))) window.setTimeout(() => { if (!closed && multi === m && !m.done) showMulti(); }, 600);
  }
  function showMulti(): void {
    const m = multi; if (!m || m.done) return; m.done = true; finishedShown = true;
    const rows = [...race.racers].map(r => ({ r, t: r.player ? m.myFin : r.finishTime })).sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
    const place = rows.findIndex(x => x.r.player) + 1, body = `<ol class="rc-board">${rows.map((x, i) => `<li class="${x.r.player ? 'me' : ''}"><b>${ORD[i + 1] ?? (i + 1) + 'TH'}</b><span>${x.r.player ? '나' : escapeRaceText(x.r.name)}</span><em>${x.t === null ? (x.r.peer && m.gone.has(x.r.peer) ? '나감' : '기록 없음') : fmtTime(x.t)}</em></li>`).join('')}</ol><p class="rc-record">3명 이상의 방은 순위만 표시하고 레이팅에는 반영되지 않습니다.</p>`;
    window.setTimeout(() => { if (!closed && multi === m) pvpCard(`${mapOf(setup).name} · ${setup.laps}랩 · ${rows.length}명`, `${ORD[place] ?? place + 'TH'} <small>/ ${rows.length}</small>`, body, '<button class="primary" data-act="rematch">다시 대전</button><button data-act="exit">메뉴로</button>'); }, 700);
  }

  function recover(): void {
    const c = race.player.car, i = c.idx; c.x = track.x[i]; c.z = track.z[i]; c.y = track.y[i]; c.h = Math.atan2(track.tz[i], track.tx[i]); c.vx = c.vz = 0; c.vf = c.vl = 0; c.yawRate = c.steer = c.slip = c.lat = 0; c.drifting = false; c.driftT = 0; wrongT = 0; view?.resetChase(); msg('복귀');
  }

  let carTemplate: Record<string, THREE.Object3D> | null = null;
  function startView(tpl: Record<string, THREE.Object3D> | null): boolean {
    // 해제된 WebGL 컨텍스트는 같은 캔버스에서 다시 열 수 없으므로 캔버스를 새로 만듭니다.
    const fresh = document.createElement('canvas'); fresh.className = 'rc-canvas'; canvas.replaceWith(fresh); canvas = fresh;
    try {
      view = new RaceView(canvas, track, tpl, prefs.quality, mapOf(setup).theme, prefs.reducedMotion);
      view.setChaseLift(touch); view.setRacers(race.racers); view.setGhost(carById(setup.car).model, !!race.ghost); resize();
      return true;
    } catch {
      view?.dispose(); view = null;
      root.dataset.phase = 'error';
      modal.className = 'rc-modal show';
      modal.innerHTML = '<div class="rc-card"><span class="rc-eyebrow">SPEED RUSH</span><h2>그래픽을 시작하지 못했어요</h2><p>WebGL 을 지원하는 브라우저에서 다시 시도해 주세요.</p><div class="rc-actions"><button data-act="exit">메뉴로</button></div></div>';
      return false;
    }
  }
  function resize(): void {
    const w = innerWidth, h = innerHeight; view?.resize(w, h); fx.width = Math.floor(w / 2); fx.height = Math.floor(h / 2);
  }

  function drawFx(intensity: number): void {
    if (!fg) return; fg.clearRect(0, 0, fx.width, fx.height); if (prefs.reducedMotion || intensity < 0.22) return;
    const w = fx.width, h = fx.height, cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) / 2, a = Math.min(1, (intensity - 0.22) * 1.2), n = 36 + Math.floor(a * 50);
    fg.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, r1 = R * (0.38 + Math.random() * 0.35), r2 = r1 + R * (0.1 + Math.random() * 0.25) * (0.5 + a);
      fg.strokeStyle = `rgba(${200 + Math.random() * 55 | 0},${225 + Math.random() * 30 | 0},255,${(0.1 + Math.random() * 0.3) * a})`; fg.lineWidth = 0.6 + Math.random() * 1.8;
      fg.beginPath(); fg.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); fg.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2); fg.stroke();
    }
  }

  // 미니맵(코스마다 한 번 그린 경로를 재사용)
  let mpath = new Path2D(), mapTransform = minimapTransform(track.x, track.z);
  const mx = (x: number): number => mapTransform.x + (x - mapTransform.minX) * mapTransform.scale, mz = (z: number): number => mapTransform.z + (z - mapTransform.minZ) * mapTransform.scale;
  const mapBackground = document.createElement('canvas'); mapBackground.width = mini.width; mapBackground.height = mini.height;
  function prepareMinimap(): void {
    mapTransform = minimapTransform(track.x, track.z); mpath = new Path2D();
    for (let i = 0; i <= track.n; i++) { const j = i % track.n; if (i === 0) mpath.moveTo(mx(track.x[j]), mz(track.z[j])); else mpath.lineTo(mx(track.x[j]), mz(track.z[j])); }
    const bg = mapBackground.getContext('2d');
    if (bg) { bg.clearRect(0, 0, 220, 220); bg.lineJoin = 'round'; bg.strokeStyle = 'rgba(8,4,24,.8)'; bg.lineWidth = 9; bg.stroke(mpath); bg.strokeStyle = '#8f7dff'; bg.lineWidth = 4; bg.stroke(mpath); bg.fillStyle = '#fff'; bg.fillRect(mx(track.x[0]) - 5, mz(track.z[0]) - 2, 10, 4); }
  }
  prepareMinimap();
  function drawMini(): void {
    if (!mg) return; mg.clearRect(0, 0, 220, 220); mg.drawImage(mapBackground, 0, 0);
    const ghost = race.ghost && race.phase === 'racing' ? ghostAt(race.ghost, race.clock) : null;
    if (ghost) { mg.beginPath(); mg.arc(mx(ghost.x), mz(ghost.z), 5, 0, Math.PI * 2); mg.strokeStyle = '#75e9ff'; mg.lineWidth = 1.5; mg.stroke(); }
    for (let i = race.racers.length - 1; i >= 0; i--) { const r = race.racers[i]; mg.fillStyle = r.color; mg.beginPath(); mg.arc(mx(r.car.x), mz(r.car.z), r.player ? 6 : 4.5, 0, 7); mg.fill(); if (r.player) { mg.strokeStyle = '#fff'; mg.lineWidth = 2; mg.stroke(); } }
  }

  function hud(simulatedSeconds: number): void {
    const p = race.player, c = p.car, place = placeOf(race), sp = kmh(c);
    setText('#rc-pos', race.trial ? '' : String(place)); setText('#rc-lap', String(currentLap(race))); setText('#rc-kmh', String(Math.round(sp)));
    setText('#rc-time', fmtTime(Math.max(0, race.clock))); const gd = race.ghost && race.phase === 'racing' ? ghostDelta(race.ghost, c.total, race.clock) : null;
    setText('#rc-best', race.trial ? (race.ghost ? (gd === null ? `GHOST ${fmtTime(race.ghost.time)}` : `GHOST ${gd >= 0 ? '+' : '-'}${Math.abs(gd).toFixed(2)}`) : '첫 기록 — 이 주행이 고스트가 됩니다') : Number.isFinite(race.bestLap) ? `BEST ${fmtTime(race.bestLap)}` : '');
    $('#rc-best').classList.toggle('ahead', gd !== null && gd < 0);
    setText('#rc-gear', race.phase === 'countdown' || Math.abs(c.vf) < 1 ? 'N' : c.vf < -0.5 ? 'R' : String(gearFor(c.vf)));
    $<HTMLElement>('#rc-nitro').style.width = `${(c.nitro * 100).toFixed(0)}%`; $('#rc-nitro').parentElement!.classList.toggle('on', boosting(c));
    $<HTMLElement>('#rc-draft').style.opacity = String(c.draft > 0.15 ? Math.min(1, c.draft * 1.3) : 0);
    const dr = race.drift;
    setText('#rc-drift', driftLive(dr) && dr.chain >= 30 ? `DRIFT ${Math.round(dr.chain).toLocaleString('ko-KR')}${dr.mult > 1 ? `  ×${dr.mult}` : ''}` : ''); $('#rc-drift').classList.toggle('live', c.drifting);
    const rev = Math.min(1, Math.abs(c.vf) / p.params.top); $<HTMLElement>('#rc-rev').style.width = `${(rev * 100).toFixed(0)}%`;
    root.dataset.kmh = String(Math.round(sp)); root.dataset.place = String(place); root.dataset.lap = String(currentLap(race)); root.dataset.phase = finishedShown ? 'done' : race.phase;
    const tx = track.tx[c.idx], tz = track.tz[c.idx], dir = c.vx * tx + c.vz * tz;
    wrongT = advanceWrongWay(wrongT, race.phase === 'racing', dir, simulatedSeconds);
    $('#rc-wrong').classList.toggle('show', wrongT >= WRONG_WAY_DELAY);
    const speedy = Math.min(1.4, sp / 270 + (boosting(c) ? 0.25 : 0)); $<HTMLElement>('.rc-boostfx').style.opacity = boosting(c) ? '1' : '0'; $<HTMLElement>('.rc-vignette').style.opacity = String(Math.min(1, 0.15 + speedy * 0.7));
    if (!race.trial && place < lastPlace && race.phase === 'racing') { msg(`추월!  ${ORD[place]}`, 'gold'); view?.punchFov(0.4); }
    lastPlace = place;
  }

  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame);
    const elapsed = Math.max(0, (now - last) / 1000); last = now;
    const dt = Math.min(0.1, elapsed);
    if (!paused && view) {
      const plan = framePlan(acc, elapsed); acc = plan.remainder;
      const steps = plan.steps, input = readInput();
      for (let i = 0; i < steps; i++) handle(updateRace(race, STEP, input, now));
      const c = race.player.car; audio.drive(c.vf, input.throttle, c.slip, boosting(c), c.drifting, wallHit > 0);
      // 니트로를 누르는 순간 쾅 터지고, 드리프트에 들어가는 순간 타이어가 찢어지는 소리가 납니다.
      const nitroNow = race.phase === 'racing' && input.nitro && c.nitro > 0 && c.boostT > 0, driftNow = c.drifting && race.phase === 'racing';
      if (nitroNow && !nitroWas) { audio.sfx('nitro'); view.punchFov(0.9); }
      if (driftNow && !driftWas) { audio.sfx('chirp'); view.punchFov(0.25); }
      nitroWas = nitroNow; driftWas = driftNow;
      view.update(race, dt, wallHit); wallHit = 0; fxIntensity += (RaceView.intensity(race) - fxIntensity) * Math.min(1, dt * 5); drawFx(fxIntensity);
      pvp?.net.sendSnap(race.player.car, now); multi?.net.sendSnap(race.player.car, now); hud(steps * STEP); drawMini();
      if (msgT > 0 && (msgT -= dt) <= 0) $('#rc-msg').className = 'rc-msg';
    }
  }

  const setPaused = (on: boolean): void => {
    if (!view || setupUi || pvp || multi || race.phase === 'done' || finishedShown || closed) return; clearInput(); paused = on; modal.className = on ? 'rc-modal show' : 'rc-modal'; if (on) { audio.drive(0, 0, 0, false, false, false); modal.innerHTML = '<div class="rc-card"><span class="rc-eyebrow">PAUSED</span><h2>일시정지</h2><div class="rc-actions"><button class="primary" data-act="resume">계속하기</button><button data-act="restart">처음부터</button><button data-act="setup">설정 변경</button><button data-act="exit">메뉴로</button></div></div>'; } else modal.innerHTML = '';
  };
  const exit = (): void => {
    if (closed) return; closed = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp); removeEventListener('resize', resize); removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility);
    leavePvp(); if (multi) { if (!multi.done) multi.net.bye(); endMulti(); } audio.dispose(); view?.dispose(); setupUi?.destroy(); root.remove(); onExit();
  };
  const act = (a: string | undefined): void => {
    audio.unlock();
    if (a === 'rematch') { endPvp(); showSetup(); openPvpLobby(); return; }
    if (a === 'pause') setPaused(!paused); else if (a === 'resume') setPaused(false); else if (a === 'restart') restart(); else if (a === 'setup') showSetup(); else if (a === 'exit') exit();
    else if (a === 'mute') {
      audio.setEnabled(!audio.enabled);
      const next = { ...readPreferences(), sound: audio.enabled }; prefs.sound = next.sound; writePreferences(next);
      const mute = root.querySelector<HTMLElement>('[data-act="mute"]'); if (mute) { mute.textContent = audio.enabled ? '🔊' : '🔇'; mute.setAttribute('aria-pressed', String(audio.enabled)); }
    }
  };
  const onKey = (e: KeyboardEvent): void => {
    if (setupUi && e.code !== 'KeyM') return;
    if (e.target instanceof HTMLElement && e.target.closest('.rc-modal.show button') && (e.code === 'Enter' || e.code === 'Space')) return;
    if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
    audio.unlock(); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; } if (e.code === 'KeyM') { act('mute'); return; } if (e.code === 'KeyR' && !paused && race.phase === 'racing') { recover(); return; }
    if (e.code === 'Enter' && finishedShown && !pvp && !multi) { restart(); return; } if (!paused && view && race.phase !== 'done') keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.code); };
  const onBlur = (): void => { clearInput(); if (race.phase !== 'done' && !setupUi) setPaused(true); };
  const onVisibility = (): void => { if (document.hidden) onBlur(); };
  addEventListener('keydown', onKey); addEventListener('keyup', onKeyUp); addEventListener('resize', resize); addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onVisibility);
  root.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (b) act(b.dataset.act); });
  root.querySelectorAll<HTMLElement>('[data-hold]').forEach(b => {
    const k = b.dataset.hold as keyof typeof hold;
    const release = (): void => { hold[k] = false; b.classList.remove('down'); };
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0 || paused || !view || race.phase === 'done') return;
      e.preventDefault(); audio.unlock();
      try { b.setPointerCapture(e.pointerId); } catch { /* 캡처를 거절해도 누르고 있는 동안은 조향이 유지됩니다. */ }
      hold[k] = true; b.classList.add('down');
    });
    b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('lostpointercapture', release);
    b.addEventListener('pointerleave', e => { if (!b.hasPointerCapture(e.pointerId)) release(); });
    b.addEventListener('contextmenu', e => e.preventDefault());
  });

  // 레이싱카 모델(race.glb) 로드 → 실패해도 단순 차체로 계속
  void (async () => {
    try { const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/race.glb`), found: Record<string, THREE.Object3D> = {}; gltf.scene.traverse(o => { if (o.name === 'gt' || o.name === 'wide' || o.name === 'long') found[o.name] = o; }); carTemplate = found; } catch { carTemplate = null; }
    try { setDriverKit(await loadCharacterKit(import.meta.env.BASE_URL)); } catch { setDriverKit(null); }
    if (closed) return; last = performance.now(); raf = requestAnimationFrame(frame); showSetup();
  })();
}
