import * as T from 'three';
import { DISTRICTS, WIDTH, DEPTH, roadHalf, districtAt } from './domain';
import { FreeRoam, type RoamInput } from './session';
import { StreetActors } from './actors';
import { ThreeChunks } from './infrastructure';
import { WEAPONS, starCount, starLabel, type GroundItem, type Ped } from './street';
import { CharacterGfx } from '../characters/infrastructure';
import { modelYaw, playerLook, poseAt, type Clip } from '../characters/domain';

function required<E extends HTMLElement>(id: string): E {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing ' + id);
  return el as E;
}
function drawMap(canvas: HTMLCanvasElement, roam: FreeRoam, full: boolean, peds: readonly Ped[], items: readonly GroundItem[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const scale = full ? Math.min(w / WIDTH, h / DEPTH) : w / 360;
  const ox = full ? (w - WIDTH * scale) / 2 : w / 2 - roam.x * scale;
  const oz = full ? (h - DEPTH * scale) / 2 : h / 2 - roam.z * scale;
  ctx.fillStyle = '#192322';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(ox, oz);
  ctx.scale(scale, scale);
  for (const district of DISTRICTS) {
    ctx.fillStyle = '#' + district.color.toString(16).padStart(6, '0');
    ctx.fillRect(district.x - 512, district.z - 512, 1024, 1024);
  }
  ctx.strokeStyle = '#303537';
  for (let x = 64; x < WIDTH; x += 256) { ctx.lineWidth = roadHalf('x', x) * 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, DEPTH); ctx.stroke(); }
  for (let z = 64; z < DEPTH; z += 256) { ctx.lineWidth = roadHalf('z', z) * 2; ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(WIDTH, z); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#d6c27a';
  for (const item of items) if (item.kind === 'weapon') ctx.fillRect(ox + item.x * scale - 2, oz + item.z * scale - 2, 4, 4);
  for (const ped of peds) {
    if (ped.health <= 0) continue;
    ctx.fillStyle = ped.kind === 'police' ? '#ff5d4e' : '#101816';
    ctx.beginPath();
    ctx.arc(ox + ped.x * scale, oz + ped.z * scale, ped.kind === 'police' ? 4 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (full) {
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const district of DISTRICTS) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#202521';
      ctx.fillStyle = '#fff';
      ctx.strokeText(district.name, ox + district.x * scale, oz + district.z * scale);
      ctx.fillText(district.name, ox + district.x * scale, oz + district.z * scale);
    }
  }
  ctx.save();
  ctx.translate(ox + roam.x * scale, oz + roam.z * scale);
  ctx.rotate(roam.yaw);
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 4);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#1b2424';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function tone(context: AudioContext, frequency: number, seconds: number) {
  const now = context.currentTime;
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  amp.gain.setValueAtTime(0.035, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.connect(amp).connect(context.destination);
  osc.start(now);
  osc.stop(now + seconds);
}
function start(): () => void {
  const host = required<HTMLElement>('harbor-world-stage');
  const mini = required<HTMLCanvasElement>('harbor-world-mini');
  const atlas = required<HTMLCanvasElement>('harbor-world-atlas');
  const overlay = required<HTMLElement>('harbor-world-overlay');
  const hud = required<HTMLElement>('harbor-world-status');
  const health = required<HTMLElement>('harbor-world-health');
  const healthBar = health.querySelector('span');
  const money = required<HTMLElement>('harbor-world-money');
  const stars = required<HTMLElement>('harbor-world-stars');
  const weapon = required<HTMLElement>('harbor-world-weapon');
  const prompt = required<HTMLElement>('harbor-world-prompt');
  const notice = required<HTMLElement>('harbor-world-notice');
  const crosshair = required<HTMLElement>('harbor-world-crosshair');
  const keys = new Set<string>();
  const pulses = new Set<string>();
  const actions = new Set<string>();
  const coarse = matchMedia('(pointer:coarse)').matches;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(65, 1, 0.2, 430);
  const renderer = new T.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1 : 1.25));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Project Harbor 3D 탐험 화면');
  host.prepend(renderer.domElement);
  const sky = new T.HemisphereLight(0xc8e5ff, 0x8c8067, 1.9);
  const sun = new T.DirectionalLight(0xffe2bd, 2.2);
  scene.add(sky, sun);
  scene.fog = new T.FogExp2(0x9daebc, 0.004);
  const roam = new FreeRoam(new ThreeChunks(scene));
  const actors = new StreetActors(scene);
  const people = new CharacterGfx();
  const playerRig = people.create(playerLook());
  const held = new T.Mesh(new T.BoxGeometry(0.12, 0.12, 0.55), new T.MeshStandardMaterial({ color: 0xd6c27a }));
  held.position.set(0.02, -0.06, 0.04);
  held.rotation.x = Math.PI / 2;
  held.visible = false;
  playerRig.bones.rHand.add(held);
  scene.add(playerRig.root);
  let gait = 0;
  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const abort = new AbortController();
  const signal = abort.signal;
  let raf = 0;
  let audio: AudioContext | null = null;
  let mapOpen = false, drag = false, pressed = false, lastX = 0, pressX = 0, pressY = 0;
  let previous = performance.now(), hudAt = 0;
  const toggleMap = () => {
    mapOpen = !mapOpen;
    overlay.hidden = !mapOpen;
    crosshair.hidden = mapOpen;
    keys.clear();
    pulses.clear();
    if (mapOpen) drawMap(atlas, roam, true, roam.peds, roam.items);
    else renderer.domElement.focus();
  };
  required('harbor-world-map-button').addEventListener('click', toggleMap, { signal });
  required('harbor-world-close-map').addEventListener('click', toggleMap, { signal });
  required('harbor-world-exit').addEventListener('click', () => host.dispatchEvent(new Event('harbor-world-exit')), { signal });
  const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyM', 'Escape', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'KeyJ', 'ControlLeft', 'ControlRight'];
  window.addEventListener('keydown', event => {
    if (host.hidden) return;
    if (!codes.includes(event.code)) return;
    event.preventDefault();
    if (event.code === 'KeyM' && !event.repeat) { toggleMap(); return; }
    if (event.code === 'Escape') {
      if (mapOpen) toggleMap();
      else host.dispatchEvent(new Event('harbor-world-exit'));
      return;
    }
    if (mapOpen) return;
    keys.add(event.code);
    if (!event.repeat) {
      if (event.code === 'KeyE') pulses.add('use');
      if (event.code === 'KeyF') pulses.add('pickpocket');
      if (event.code === 'KeyG') pulses.add('rob');
      if (event.code === 'KeyR') pulses.add('reload');
    }
  }, { signal });
  window.addEventListener('keyup', event => keys.delete(event.code), { signal });
  window.addEventListener('blur', () => { keys.clear(); pulses.clear(); actions.clear(); drag = false; pressed = false; }, { signal });
  renderer.domElement.addEventListener('pointerdown', event => {
    renderer.domElement.focus();
    if (event.button !== 0) return;
    drag = true;
    pressed = true;
    lastX = pressX = event.clientX;
    pressY = event.clientY;
    try { renderer.domElement.setPointerCapture(event.pointerId); } catch (error) { void error; }
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!drag) return;
    roam.yaw += (event.clientX - lastX) * 0.007;
    lastX = event.clientX;
  });
  const release = (event: PointerEvent) => {
    if (pressed && event.button === 0 && Math.hypot(event.clientX - pressX, event.clientY - pressY) < 8) pulses.add('fireOnce');
    drag = false;
    pressed = false;
  };
  renderer.domElement.addEventListener('pointerup', release);
  renderer.domElement.addEventListener('pointercancel', () => { drag = false; pressed = false; });
  renderer.domElement.addEventListener('lostpointercapture', () => { drag = false; });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    required('harbor-world-error').textContent = '그래픽 연결이 끊어져 탐험을 종료했습니다. 다시 플레이를 누르세요.';
    host.dispatchEvent(new Event('harbor-world-exit'));
  });
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-key]')) {
    const code = button.dataset.key ?? '';
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      keys.add(code);
      try { button.setPointerCapture(event.pointerId); } catch (error) { void error; }
    }, { signal });
    const clear = () => keys.delete(code);
    button.addEventListener('pointerup', clear, { signal });
    button.addEventListener('pointercancel', clear, { signal });
    button.addEventListener('lostpointercapture', clear, { signal });
  }
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-act]')) {
    const act = button.dataset.act ?? '';
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      actions.add(act);
      if (act !== 'fire' && act !== 'run') pulses.add(act);
      try { button.setPointerCapture(event.pointerId); } catch (error) { void error; }
    }, { signal });
    const clear = () => actions.delete(act);
    button.addEventListener('pointerup', clear, { signal });
    button.addEventListener('pointercancel', clear, { signal });
    button.addEventListener('lostpointercapture', clear, { signal });
  }
  const target = new T.Vector3(), desired = new T.Vector3(), day = new T.Color(0xa6c8df), night = new T.Color(0x142039), color = new T.Color();
  const has = (a: string, b: string) => Number(keys.has(a) || keys.has(b));
  camera.position.set(roam.x, roam.world.y + 6, roam.z + 10);
  try { audio = new AudioContext(); } catch (error) { void error; }
  function input(): RoamInput {
    return {
      forward: has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown'),
      side: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || actions.has('run'),
      look: 0,
      use: pulses.has('use'),
      pickpocket: pulses.has('pickpocket'),
      rob: pulses.has('rob'),
      fire: pulses.has('fireOnce') || actions.has('fire') || keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyJ'),
      reload: pulses.has('reload'),
    };
  }
  function paintHud(now: number) {
    const vitals = roam.vitals;
    const ratio = Math.max(0, Math.min(1, vitals.health / 100));
    if (healthBar instanceof HTMLElement) healthBar.style.width = (ratio * 100).toFixed(1) + '%';
    health.setAttribute('aria-valuenow', String(Math.round(vitals.health)));
    health.classList.toggle('is-low', ratio < 0.3);
    const cash = '$' + vitals.money.toLocaleString('ko-KR');
    if (money.textContent !== cash) money.textContent = cash;
    const label = starLabel(vitals.wanted);
    if (stars.textContent !== label) stars.textContent = label;
    stars.setAttribute('aria-label', '수배 ' + starCount(vitals.wanted) + '단계');
    const armed = vitals.reload > 0 && vitals.weapon ? WEAPONS[vitals.weapon].name + ' 재장전'
      : vitals.weapon ? WEAPONS[vitals.weapon].name + '  ' + vitals.magazine + ' / ' + vitals.reserve : '맨손';
    if (weapon.textContent !== armed) weapon.textContent = armed;
    const hint = roam.hint();
    if (prompt.textContent !== hint) prompt.textContent = hint;
    if (notice.textContent !== roam.notice) notice.textContent = roam.notice;
    if (now - hudAt > 100) {
      hudAt = now;
      drawMap(mini, roam, false, roam.peds, roam.items);
      const hours = Math.floor(roam.world.hours);
      const minutes = Math.floor((roam.world.hours - hours) * 60);
      hud.textContent = districtAt(roam.x, roam.z).name + ' · ' + String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
    }
  }
  function frame(now: number) {
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
    previous = now;
    if (document.hidden) { raf = requestAnimationFrame(frame); return; }
    if (!mapOpen) {
      const look = (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * dt * 1.7;
      const command = input();
      command.look = look;
      roam.tick(command, dt);
      pulses.clear();
      const heard = roam.shots.some(shot => Math.hypot(shot.x - roam.x, shot.z - roam.z) < 2 || Math.hypot(shot.tx - roam.x, shot.tz - roam.z) < 2);
      if (heard) {
        if (audio && audio.state === 'running') tone(audio, 210, 0.045);
        else void audio?.resume()?.then(() => { if (audio) tone(audio, 210, 0.045); }).catch(error => { void error; });
      }
    } else roam.world.stream();
    actors.sync(roam.peds, roam.items, roam.shots);
    held.visible = roam.vitals.weapon !== null;
    const moving = has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown') !== 0 || keys.has('KeyA') || keys.has('KeyD');
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || actions.has('run');
    const clip: Clip = moving ? (sprint ? 'run' : 'walk') : 'idle';
    gait = moving ? (gait + dt / (sprint ? 0.44 : 0.78)) % 1 : 0;
    playerRig.root.position.set(roam.x, roam.world.y, roam.z);
    playerRig.root.rotation.y = modelYaw(roam.yaw, 'harbor');
    people.apply(playerRig, poseAt(clip, gait));
    const aimX = Math.sin(roam.yaw);
    const aimZ = -Math.cos(roam.yaw);
    target.set(roam.x + aimX * 14, roam.world.y + 1.25, roam.z + aimZ * 14);
    desired.set(roam.x - aimX * 7.5, roam.world.y + 4.2, roam.z - aimZ * 7.5);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 13));
    camera.lookAt(target);
    const angle = (roam.world.hours - 6) * Math.PI / 12;
    const brightness = Math.max(0.08, Math.min(1, Math.sin(angle) * 1.5 + 0.15));
    sky.intensity = 0.35 + brightness * 1.65;
    sun.intensity = 0.08 + brightness * 2.1;
    sun.position.set(Math.cos(angle) * 150, Math.max(12, Math.sin(angle) * 180), 75);
    color.copy(night).lerp(day, brightness);
    scene.background = color;
    if (scene.fog) scene.fog.color.copy(color);
    paintHud(now);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  renderer.domElement.focus();
  paintHud(performance.now());
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    abort.abort();
    observer.disconnect();
    actors.dispose();
    people.dispose();
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>();
    scene.traverse(obj => {
      if (!(obj instanceof T.Mesh) && !(obj instanceof T.Line)) return;
      if (obj.userData.keep) return;
      const geometry = obj.geometry;
      if (geometry) geometries.add(geometry);
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of list) if (material) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    scene.clear();
    overlay.hidden = true;
    crosshair.hidden = false;
    void audio?.close().catch(error => { void error; });
  };
}
let stop: (() => void) | null = null;
const startButton = document.getElementById('harbor-world-start') as HTMLButtonElement | null;
const stageEl = document.getElementById('harbor-world-stage');
function closeWorld() {
  stop?.();
  stop = null;
  if (stageEl) stageEl.hidden = true;
  document.body.classList.remove('harbor-driving');
  if (startButton) startButton.disabled = false;
}
stageEl?.addEventListener('harbor-world-exit', () => {
  closeWorld();
  startButton?.focus();
});
window.addEventListener('harbor-mode', event => {
  if ((event as CustomEvent<string>).detail === 'world' || !stop) return;
  closeWorld();
});
startButton?.addEventListener('click', () => {
  if (!stageEl || !startButton) return;
  window.dispatchEvent(new CustomEvent('harbor-mode', { detail: 'world' }));
  startButton.disabled = true;
  stageEl.hidden = false;
  const error = document.getElementById('harbor-world-error');
  if (error) error.textContent = '';
  try {
    stop = start();
    document.body.classList.add('harbor-driving');
  } catch (caught) {
    stageEl.hidden = true;
    startButton.disabled = false;
    if (error) error.textContent = '3D 화면을 시작하지 못했습니다. WebGL 지원 브라우저인지 확인하세요.';
    console.error(caught);
  }
});
