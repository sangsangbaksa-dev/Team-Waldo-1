// SPEED RUSH — 레이싱 모드 진입점: 입력, HUD, 게임 루프. Last City 의 스포츠카 모델(vehicles.glb)을 그대로 씁니다.
import './race.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readPreferences } from '../battle/preferences';
import { RaceAudio } from './audio';
import { aiInput, boosting, kmh, type CarInput } from './physics';
import { createRace, currentLap, placeOf, updateRace, type RaceEvent, type RaceState } from './race';
import { buildTrack } from './track';
import { RaceView } from './view';

const KEY = 'waldo.race.v1', LAPS = 3, STEP = 1 / 90;
interface Save { best: number; bestRace: number }
export function readRaceSave(): Save {
  try { const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>; const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : Infinity); return { best: n(r.best), bestRace: n(r.bestRace) }; } catch { return { best: Infinity, bestRace: Infinity }; }
}
function writeRaceSave(s: Save): void { try { localStorage.setItem(KEY, JSON.stringify({ best: Number.isFinite(s.best) ? s.best : 0, bestRace: Number.isFinite(s.bestRace) ? s.bestRace : 0 })); } catch { /* 저장 불가 환경 */ } }
export const fmtTime = (s: number): string => { if (!Number.isFinite(s)) return '--:--.---'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(3)}`; };
const ORD = ['', '1ST', '2ND', '3RD', '4TH'];

export function openRace(onExit: () => void): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches;
  const root = document.createElement('div'); root.className = 'rc-root' + (touch ? ' touch' : ''); root.dataset.phase = 'loading';
  root.innerHTML = `<canvas class="rc-canvas"></canvas><canvas class="rc-fx"></canvas><div class="rc-vignette"></div><div class="rc-boostfx"></div>
  <div class="rc-hud">
    <div class="rc-tl"><div class="rc-pos"><b id="rc-pos">4</b><span>/4</span></div><div class="rc-lap">LAP <b id="rc-lap">1</b>/${LAPS}</div></div>
    <div class="rc-tc"><div class="rc-time" id="rc-time">0:00.000</div><div class="rc-best" id="rc-best"></div></div>
    <div class="rc-tr"><canvas id="rc-map" width="220" height="220" aria-label="미니맵"></canvas><div class="rc-btns"><button data-act="mute" title="소리 (M)">🔊</button><button data-act="pause" title="일시정지 (Esc)">Ⅱ</button><button data-act="exit" title="나가기">✕</button></div></div>
    <div class="rc-msg" id="rc-msg"></div><div class="rc-count" id="rc-count"></div><div class="rc-wrong" id="rc-wrong">역주행!</div>
    <div class="rc-bottom"><div class="rc-nitro"><span>NITRO</span><div><i id="rc-nitro"></i></div></div><div class="rc-speed"><b id="rc-kmh">0</b><small>km/h</small><em id="rc-gear">N</em></div><div class="rc-rev"><i id="rc-rev"></i></div></div>
    <div class="rc-keys"><span><kbd>W</kbd><kbd>↑</kbd> 가속</span><span><kbd>A</kbd><kbd>D</kbd> 조향</span><span><kbd>Space</kbd> 드리프트</span><span><kbd>Shift</kbd> 니트로</span><span><kbd>R</kbd> 복귀</span></div>
    <div class="rc-touchpad"><div class="rc-steer"><button data-hold="left" aria-label="왼쪽">◀</button><button data-hold="right" aria-label="오른쪽">▶</button></div><div class="rc-pedals"><button data-hold="nitro">NITRO</button><button data-hold="drift">DRIFT</button><button data-hold="brake">BRAKE</button></div></div>
  </div>
  <div class="rc-modal" id="rc-modal"><div class="rc-card"><span class="rc-eyebrow">SPEED RUSH</span><h2>엔진 예열 중…</h2></div></div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(s: string): T => root.querySelector<T>(s)!;
  const canvas = $<HTMLCanvasElement>('.rc-canvas'), fx = $<HTMLCanvasElement>('.rc-fx'), fg = fx.getContext('2d'), mini = $<HTMLCanvasElement>('#rc-map'), mg = mini.getContext('2d'), modal = $('#rc-modal');
  const track = buildTrack(), audio = new RaceAudio(); audio.enabled = prefs.sound;
  let save = readRaceSave(), race: RaceState = createRace(track, LAPS, save.best), view: RaceView | null = null, raf = 0, last = 0, acc = 0, paused = false, closed = false, finishedShown = false, lastPlace = 4, msgT = 0, wallHit = 0, fxIntensity = 0, wrongT = 0;
  const keys = new Set<string>(), hold = { left: false, right: false, brake: false, drift: false, nitro: false };
  const cache = new Map<string, string>(); const setText = (id: string, v: string): void => { if (cache.get(id) !== v) { cache.set(id, v); $(id).textContent = v; } };

  const msg = (text: string, kind = ''): void => { const el = $('#rc-msg'); el.textContent = text; el.className = `rc-msg show ${kind}`; msgT = 1.6; };
  const bigCount = (text: string, go = false): void => { const el = $('#rc-count'); el.textContent = text; el.className = 'rc-count'; void el.offsetWidth; el.className = `rc-count show${go ? ' go' : ''}`; };

  const dbg = { auto: false };
  if (import.meta.env.DEV) (window as unknown as { __race: unknown }).__race = { get race() { return race; }, dbg };
  function readInput(): CarInput {
    if (dbg.auto) { const c = race.player.car, ai = aiInput(c, track, { lane: 0, top: 72, grip: 38, skill: 1 }); return { ...ai, nitro: c.nitro > 0.5 && Math.abs(track.k[c.idx]) < 0.002 }; }
    const k = (n: string): boolean => keys.has(n), left = k('ArrowLeft') || k('KeyA') || hold.left, right = k('ArrowRight') || k('KeyD') || hold.right;
    const brake = k('ArrowDown') || k('KeyS') || hold.brake, gas = k('ArrowUp') || k('KeyW') || (touch && !brake);
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
      case 'lap': if (e.lap < LAPS) { msg(e.best ? `LAP ${e.lap}  ${fmtTime(e.time)}  ★ BEST` : `LAP ${e.lap}  ${fmtTime(e.time)}`, e.best ? 'gold' : ''); audio.sfx(e.best ? 'best' : 'lap'); } break;
      case 'finish': audio.sfx('finish'); finishRace(e.place, e.time); break;
    }
  }

  function finishRace(place: number, time: number): void {
    if (finishedShown) return; finishedShown = true;
    const bestLap = Math.min(...race.player.lapTimes), newBest = bestLap < save.best || time < save.bestRace;
    save = { best: Math.min(save.best, bestLap), bestRace: Math.min(save.bestRace, time) }; writeRaceSave(save);
    window.setTimeout(() => {
      if (closed) return;
      modal.className = 'rc-modal show'; root.dataset.phase = 'done';
      modal.innerHTML = `<div class="rc-card result p${place}"><span class="rc-eyebrow">RACE FINISHED</span><h2>${ORD[place] ?? place + 'TH'} <small>/ 4</small></h2><p class="rc-total">${fmtTime(time)}</p>
        <ol class="rc-laps">${race.player.lapTimes.map((l, i) => `<li${l === bestLap ? ' class="best"' : ''}><span>LAP ${i + 1}</span><b>${fmtTime(l)}</b></li>`).join('')}</ol>
        <p class="rc-record">${newBest ? '★ 개인 최고 기록 갱신!' : `최고 랩 ${fmtTime(save.best)}`}</p>
        <div class="rc-actions"><button class="primary" data-act="restart">다시 달리기</button><button data-act="exit">메뉴로</button></div></div>`;
    }, 1600);
  }

  function restart(): void {
    race = createRace(track, LAPS, save.best); finishedShown = false; paused = false; acc = 0; lastPlace = 4; cache.clear();
    if (view) { view.dispose(); view = null; } startView(carTemplate); modal.className = 'rc-modal'; modal.innerHTML = ''; root.dataset.phase = 'countdown'; msg('', '');
  }

  function recover(): void {
    const c = race.player.car, i = c.idx; c.x = track.x[i]; c.z = track.z[i]; c.y = track.y[i]; c.h = Math.atan2(track.tz[i], track.tx[i]); c.vx = c.vz = 0; c.vf = c.vl = 0; c.yawRate = 0; c.drifting = false; c.driftT = 0; msg('복귀');
  }

  let carTemplate: THREE.Object3D | null = null;
  function startView(tpl: THREE.Object3D | null): void {
    try { view = new RaceView(canvas, track, tpl, prefs.quality); view.setRacers(race.racers); resize(); }
    catch { modal.className = 'rc-modal show'; modal.innerHTML = '<div class="rc-card"><span class="rc-eyebrow">SPEED RUSH</span><h2>그래픽을 시작하지 못했어요</h2><p>WebGL 을 지원하는 브라우저에서 다시 시도해 주세요.</p><div class="rc-actions"><button data-act="exit">메뉴로</button></div></div>'; }
  }
  function resize(): void {
    const w = innerWidth, h = innerHeight; view?.resize(w, h); fx.width = Math.floor(w / 2); fx.height = Math.floor(h / 2);
  }

  function drawFx(intensity: number): void {
    if (!fg) return; fg.clearRect(0, 0, fx.width, fx.height); if (intensity < 0.28) return;
    const w = fx.width, h = fx.height, cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) / 2, a = Math.min(1, (intensity - 0.28) * 1.1), n = 34 + Math.floor(a * 40);
    fg.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, r1 = R * (0.38 + Math.random() * 0.35), r2 = r1 + R * (0.1 + Math.random() * 0.25) * (0.5 + a);
      fg.strokeStyle = `rgba(${200 + Math.random() * 55 | 0},${225 + Math.random() * 30 | 0},255,${(0.1 + Math.random() * 0.3) * a})`; fg.lineWidth = 0.6 + Math.random() * 1.8;
      fg.beginPath(); fg.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); fg.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2); fg.stroke();
    }
  }

  // 미니맵(한 번 그린 트랙 경로를 재사용)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) { minX = Math.min(minX, track.x[i]); maxX = Math.max(maxX, track.x[i]); minZ = Math.min(minZ, track.z[i]); maxZ = Math.max(maxZ, track.z[i]); }
  const mscale = 190 / Math.max(maxX - minX, maxZ - minZ), mx = (x: number): number => 15 + (x - minX) * mscale, mz = (z: number): number => 15 + (z - minZ) * mscale;
  const mpath = new Path2D(); for (let i = 0; i <= track.n; i++) { const j = i % track.n; if (i === 0) mpath.moveTo(mx(track.x[j]), mz(track.z[j])); else mpath.lineTo(mx(track.x[j]), mz(track.z[j])); }
  function drawMini(): void {
    if (!mg) return; mg.clearRect(0, 0, 220, 220); mg.lineJoin = 'round'; mg.strokeStyle = 'rgba(8,4,24,.8)'; mg.lineWidth = 9; mg.stroke(mpath); mg.strokeStyle = '#8f7dff'; mg.lineWidth = 4; mg.stroke(mpath);
    mg.fillStyle = '#fff'; mg.fillRect(mx(track.x[0]) - 5, mz(track.z[0]) - 2, 10, 4);
    for (const r of [...race.racers].reverse()) { mg.fillStyle = r.color; mg.beginPath(); mg.arc(mx(r.car.x), mz(r.car.z), r.player ? 6 : 4.5, 0, 7); mg.fill(); if (r.player) { mg.strokeStyle = '#fff'; mg.lineWidth = 2; mg.stroke(); } }
  }

  function hud(): void {
    const p = race.player, c = p.car, place = placeOf(race), sp = kmh(c);
    setText('#rc-pos', String(place)); setText('#rc-lap', String(currentLap(race))); setText('#rc-kmh', String(Math.round(sp)));
    setText('#rc-time', fmtTime(Math.max(0, race.clock))); setText('#rc-best', Number.isFinite(race.bestLap) ? `BEST ${fmtTime(race.bestLap)}` : '');
    setText('#rc-gear', race.phase === 'countdown' ? 'N' : c.vf < -0.5 ? 'R' : String(audio.gear));
    $<HTMLElement>('#rc-nitro').style.width = `${(c.nitro * 100).toFixed(0)}%`; $('#rc-nitro').parentElement!.classList.toggle('on', boosting(c));
    const rev = Math.min(1, Math.abs(c.vf) / 74); $<HTMLElement>('#rc-rev').style.width = `${(rev * 100).toFixed(0)}%`;
    root.dataset.kmh = String(Math.round(sp)); root.dataset.place = String(place); root.dataset.lap = String(currentLap(race)); root.dataset.phase = finishedShown ? 'done' : race.phase;
    const tx = track.tx[c.idx], tz = track.tz[c.idx], dir = c.vx * tx + c.vz * tz; $('#rc-wrong').classList.toggle('show', race.phase === 'racing' && dir < -6 && (wrongT += 1) > 20); if (dir >= -6) wrongT = 0;
    const speedy = Math.min(1.4, sp / 270 + (boosting(c) ? 0.25 : 0)); $<HTMLElement>('.rc-boostfx').style.opacity = boosting(c) ? '1' : '0'; $<HTMLElement>('.rc-vignette').style.opacity = String(Math.min(1, 0.15 + speedy * 0.7));
    if (place < lastPlace && race.phase === 'racing') { msg(`추월!  ${ORD[place]}`, 'gold'); view?.punchFov(0.4); }
    lastPlace = place;
  }

  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
    if (!paused && view) {
      acc += dt; let steps = 0; const input = readInput();
      while (acc >= STEP && steps < 6) { handle(updateRace(race, STEP, input)); acc -= STEP; steps++; }
      if (steps === 6) acc = 0;
      const c = race.player.car; audio.drive(c.vf, input.throttle, c.slip, boosting(c), c.drifting, wallHit > 0);
      view.update(race, dt, wallHit); wallHit = 0; fxIntensity += (RaceView.intensity(race) - fxIntensity) * Math.min(1, dt * 5); drawFx(fxIntensity);
      hud(); drawMini();
      if (msgT > 0 && (msgT -= dt) <= 0) $('#rc-msg').className = 'rc-msg';
    }
  }

  const setPaused = (on: boolean): void => {
    if (race.phase === 'done' || finishedShown || closed) return; paused = on; modal.className = on ? 'rc-modal show' : 'rc-modal'; if (on) { audio.drive(0, 0, 0, false, false, false); modal.innerHTML = '<div class="rc-card"><span class="rc-eyebrow">PAUSED</span><h2>일시정지</h2><div class="rc-actions"><button class="primary" data-act="resume">계속하기</button><button data-act="restart">처음부터</button><button data-act="exit">메뉴로</button></div></div>'; } else modal.innerHTML = '';
  };
  const exit = (): void => {
    if (closed) return; closed = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp); removeEventListener('resize', resize); removeEventListener('blur', onBlur);
    audio.dispose(); view?.dispose(); root.remove(); onExit();
  };
  const act = (a: string | undefined): void => {
    audio.unlock();
    if (a === 'pause') setPaused(!paused); else if (a === 'resume') setPaused(false); else if (a === 'restart') restart(); else if (a === 'exit') exit();
    else if (a === 'mute') { audio.setEnabled(!audio.enabled); (root.querySelector('[data-act="mute"]') as HTMLElement).textContent = audio.enabled ? '🔊' : '🔇'; }
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat && e.code !== 'KeyR') { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
    audio.unlock(); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; } if (e.code === 'KeyM') { act('mute'); return; } if (e.code === 'KeyR' && !paused && race.phase === 'racing') { recover(); return; }
    if (e.code === 'Enter' && finishedShown) { restart(); return; } keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.code); };
  const onBlur = (): void => { keys.clear(); for (const k of Object.keys(hold) as Array<keyof typeof hold>) hold[k] = false; if (race.phase === 'racing') setPaused(true); };
  addEventListener('keydown', onKey); addEventListener('keyup', onKeyUp); addEventListener('resize', resize); addEventListener('blur', onBlur);
  root.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (b) act(b.dataset.act); });
  root.querySelectorAll<HTMLElement>('[data-hold]').forEach(b => {
    const k = b.dataset.hold as keyof typeof hold, on = (v: boolean) => (e: Event): void => { e.preventDefault(); audio.unlock(); hold[k] = v; b.classList.toggle('down', v); };
    b.addEventListener('pointerdown', on(true)); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, on(false)); b.addEventListener('contextmenu', e => e.preventDefault());
  });

  // 스포츠카 모델 로드 → 실패해도 단순 차체로 계속
  void (async () => {
    try { const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/vehicles.glb`); gltf.scene.traverse(o => { if (o.name === 'sports') carTemplate = o; }); } catch { carTemplate = null; }
    if (closed) return; startView(carTemplate); modal.className = 'rc-modal'; modal.innerHTML = ''; root.dataset.phase = 'countdown';
    msg('가속 ↑ · 조향 ← → · 드리프트 Space · 니트로 Shift', 'hint'); msgT = 4; last = performance.now(); raf = requestAnimationFrame(frame);
  })();
}
