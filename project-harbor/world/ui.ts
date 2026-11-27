import * as T from 'three';
import { terrainHeight } from './domain';
import { makeSave, parseSave, restoreSave, SAVE_KEY } from './save';
import { mapPoint, roadGuide, PACKAGES, type Point } from './exploration';
import { SERVICE_INFO, SITES } from './services';
import { DISTRICTS, WIDTH, DEPTH, roadHalf, districtAt } from './domain';
import { FreeRoam, type RoamInput } from './session';
import { StreetActors } from './actors';
import { CityGarage } from './garage';
import { reflectionSky } from './reflections';
import { ThreeChunks } from './infrastructure';
import { WEAPONS, starCount, starLabel, type GroundItem, type Ped } from './street';
import { CharacterGfx } from '../characters/infrastructure';
import { loadPeople } from '../characters/cast';
import { modelYaw, playerLook, poseAt, type Clip } from '../characters/domain';
import { clampSettings, createMixer, DEFAULT_AUDIO, renderMix, type AudioSettings } from './civic/audio';
import { climateAt } from './civic/regions';
import { HarborAudio } from './civic/webaudio';

function required<E extends HTMLElement>(id: string): E {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing ' + id);
  return el as E;
}
function drawMap(canvas: HTMLCanvasElement, roam: FreeRoam, full: boolean, peds: readonly Ped[], items: readonly GroundItem[], waypoint: Point | null = null) {
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
  if (waypoint) {
    const route = roadGuide(roam, waypoint);
    ctx.strokeStyle = '#e9c76b'; ctx.lineWidth = full ? 3 : 2.5;
    ctx.beginPath();
    route.forEach((point, i) => { const x = ox + point.x * scale, z = oz + point.z * scale; if (i === 0) ctx.moveTo(x, z); else ctx.lineTo(x, z); });
    ctx.stroke();
    ctx.fillStyle = '#e9c76b'; ctx.beginPath(); ctx.arc(ox + waypoint.x * scale, oz + waypoint.z * scale, 5, 0, Math.PI * 2); ctx.fill();
  }
  for (const site of SITES) {
    const x = ox + site.x * scale, y = oz + site.z * scale;
    if (x < 0 || y < 0 || x > w || y > h) continue;
    const info = SERVICE_INFO[site.kind];
    ctx.fillStyle = '#' + info.color.toString(16).padStart(6, '0');
    ctx.fillRect(x - 6, y - 6, 12, 12);
    ctx.fillStyle = '#17201d'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(info.symbol, x, y);
  }
  ctx.fillStyle = '#d6c27a';
  for (const item of items) if (item.kind === 'weapon') ctx.fillRect(ox + item.x * scale - 2, oz + item.z * scale - 2, 4, 4);
  ctx.fillStyle = '#7eb6ff';
  for (const ride of roam.rides) ctx.fillRect(ox + ride.x * scale - 2, oz + ride.z * scale - 1.5, 4, 3);
  for (const ped of peds) {
    if (ped.health <= 0 || ped.hidden) continue;
    ctx.fillStyle = ped.kind === 'police' ? '#ff5d4e' : ped.mood === 'panic' ? '#e7c3ad' : '#101816';
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
const AUDIO_KEY = 'harbor-audio-v1';
function loadAudio(): AudioSettings {
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    return clampSettings(raw ? JSON.parse(raw) as Partial<AudioSettings> : DEFAULT_AUDIO);
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}
function mountAudio(host: HTMLElement, settings: AudioSettings) {
  const panel = document.createElement('fieldset');
  panel.className = 'harbor-audio';
  const legend = document.createElement('legend');
  legend.textContent = '소리';
  const note = document.createElement('p');
  note.textContent = '모든 소리는 재생 중에 합성됩니다. 외부 녹음은 쓰지 않으며 CC0입니다.';
  panel.append(legend, note);
  const rows: [Exclude<keyof AudioSettings, 'muted'>, string][] = [
    ['master', '전체'], ['ambient', '환경'], ['vehicles', '차량'], ['weapons', '무기'],
    ['voices', '목소리'], ['footsteps', '발소리'], ['ui', '조작'],
  ];
  for (const [key, label] of rows) {
    const wrap = document.createElement('label');
    wrap.append(label);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.value = String(settings[key]);
    slider.addEventListener('input', () => {
      settings[key] = Number(slider.value);
      localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
    });
    wrap.append(slider);
    panel.append(wrap);
  }
  const mute = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = settings.muted;
  box.addEventListener('change', () => {
    settings.muted = box.checked;
    localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
  });
  mute.append('음소거', box);
  panel.append(mute);
  host.append(panel);
}
function frameShot(camera: T.PerspectiveCamera, roam: FreeRoam): void {
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot === 'close') {
    camera.position.set(roam.x, roam.world.y + 1.55, roam.z - 0.95);
    camera.lookAt(roam.x, roam.world.y + 1.55, roam.z);
  } else if (shot === 'body') {
    camera.position.set(roam.x, roam.world.y + 1.05, roam.z - 3.2);
    camera.lookAt(roam.x, roam.world.y + 0.95, roam.z);
  } else if (shot === 'crowd') {
    camera.position.set(roam.x + 6, roam.world.y + 8, roam.z - 18);
    camera.lookAt(roam.x, roam.world.y + 1.1, roam.z);
  }
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
  const reflections=coarse?null:reflectionSky();
  if(reflections)scene.environment=reflections;
  scene.fog = new T.FogExp2(0x9daebc, 0.004);
  const chunks = new ThreeChunks(scene);
  const roam = new FreeRoam(chunks);
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const saved = raw ? parseSave(raw) : null;
    if (saved && restoreSave(roam, saved)) roam.notify('저장된 게임을 불러왔습니다.');
    else if (raw) roam.notify('저장 데이터를 불러올 수 없어 새 게임을 시작했습니다.');
  } catch { roam.notify('이 환경에서는 로컬 저장을 사용할 수 없습니다.'); }
  const ringGeometry = new T.RingGeometry(3.4, 3.7, 32);
  const beaconGeometry = new T.CylinderGeometry(0.13, 0.13, 2.8, 8);
  const markers = SITES.map(site => {
    const group = new T.Group();
    const material = new T.MeshBasicMaterial({ color: SERVICE_INFO[site.kind].color, transparent: true, opacity: 0.85, side: T.DoubleSide });
    const ring = new T.Mesh(ringGeometry, material); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
    const beacon = new T.Mesh(beaconGeometry, material); beacon.position.y = 1.4;
    group.add(ring, beacon); group.position.set(site.x, terrainHeight(site.x, site.z), site.z);
    scene.add(group); return group;
  });
  const packageGeometry = new T.BoxGeometry(0.65, 0.4, 0.4);
  const packageMaterial = new T.MeshStandardMaterial({ color: 0xb9a36e, roughness: 0.8 });
  const packages = PACKAGES.map(item => {
    const mesh = new T.Mesh(packageGeometry, packageMaterial);
    mesh.position.set(item.x, terrainHeight(item.x, item.z) + 0.32, item.z);
    mesh.visible = false; scene.add(mesh); return { item, mesh };
  });
  const actors = new StreetActors(scene);
  const garage = new CityGarage(scene);
  let orbit = 0;
  const people = new CharacterGfx();
  const playerRig = people.create(playerLook());
  camera.position.set(roam.x, roam.world.y + 4.2, roam.z + 7.5);
  camera.lookAt(roam.x, roam.world.y + 1.25, roam.z);
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
  const audioSettings = loadAudio();
  mountAudio(host, audioSettings);
  let speaker: HarborAudio | null = null;
  try { speaker = new HarborAudio(new AudioContext()); } catch { speaker = null; }
  const mixer = createMixer(districtAt(roam.x, roam.z).id);
  let waypoint: Point | null = null;
  let mapOpen = false, drag = false, pressed = false, lastX = 0, pressX = 0, pressY = 0;
  let previous = performance.now(), hudAt = 0;
  const toggleMap = () => {
    mapOpen = !mapOpen;
    overlay.hidden = !mapOpen;
    crosshair.hidden = mapOpen;
    keys.clear();
    pulses.clear();
    if (mapOpen) drawMap(atlas, roam, true, roam.peds, roam.items, waypoint);
    else renderer.domElement.focus();
  };
  atlas.addEventListener('click', event => {
    if (!mapOpen) return;
    const rect = atlas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = mapPoint((event.clientX - rect.left) * atlas.width / rect.width, (event.clientY - rect.top) * atlas.height / rect.height, atlas.width, atlas.height);
    if (!point) return;
    waypoint = waypoint && Math.hypot(waypoint.x - point.x, waypoint.z - point.z) < 35 ? null : point;
    drawMap(atlas, roam, true, roam.peds, roam.items, waypoint);
  }, { signal });
  const saveNow = () => {
    const data = makeSave(roam);
    if (!data) { roam.notify('수배 없이 안전한 곳에서 차량을 내려 저장하세요.'); return; }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); roam.notify('게임을 이 기기에 저장했습니다.'); }
    catch { roam.notify('저장할 수 없습니다. 브라우저 저장 공간을 확인하세요.'); }
  };
  required('harbor-world-save').addEventListener('click', saveNow, { signal });
  required('harbor-world-reset').addEventListener('click', () => {
    if (!window.confirm('저장 기록을 삭제하고 새 게임을 시작할까요?')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch { roam.notify('저장 기록을 지울 수 없습니다.'); return; }
    window.location.reload();
  }, { signal });
  required('harbor-world-map-button').addEventListener('click', toggleMap, { signal });
  required('harbor-world-close-map').addEventListener('click', toggleMap, { signal });
  required('harbor-world-exit').addEventListener('click', () => host.dispatchEvent(new Event('harbor-world-exit')), { signal });
  const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyM', 'Escape', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'KeyB', 'KeyK', 'KeyJ', 'ControlLeft', 'ControlRight', 'Space'];
  const focusGame = () => {
    if (host.hidden) return;
    host.tabIndex = -1;
    renderer.domElement.focus({ preventScroll: true });
  };
  host.addEventListener('pointerenter', focusGame, { signal });
  window.addEventListener('keydown', event => {
    if (host.hidden) return;
    const mapKey = event.code === 'KeyM' || event.key === 'm' || event.key === 'M' || event.key === 'ㅡ';
    if (!mapKey && !codes.includes(event.code)) return;
    event.preventDefault();
    if (mapKey && !event.repeat) { toggleMap(); return; }
    if (event.code === 'Escape') {
      if (mapOpen) toggleMap();
      else host.dispatchEvent(new Event('harbor-world-exit'));
      return;
    }
    if (mapOpen) return;
    if (event.code === 'KeyK' && !event.repeat) { saveNow(); return; }
    keys.add(event.code);
    if (!event.repeat) {
      if (event.code === 'KeyE') pulses.add('use');
      if (event.code === 'KeyF') pulses.add('pickpocket');
      if (event.code === 'KeyG') pulses.add('rob');
      if (event.code === 'KeyR') pulses.add('reload');
      if (event.code === 'KeyB') pulses.add('service');
      if (event.code === 'Space' && !roam.driving) pulses.add('jump');
    }
  }, { signal, capture: true });
  window.addEventListener('keyup', event => keys.delete(event.code), { signal, capture: true });
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
    const delta = (event.clientX - lastX) * 0.007;
    lastX = event.clientX;
    if (roam.vehicle) orbit += delta;
    else roam.yaw += delta;
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
  const target = new T.Vector3(), desired = new T.Vector3(), color = new T.Color();
  const has = (a: string, b: string) => Number(keys.has(a) || keys.has(b));
  camera.position.set(roam.x, roam.world.y + 6, roam.z + 10);
  const wake = () => { void speaker?.resume(); };
  renderer.domElement.addEventListener('pointerdown', wake, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void speaker?.suspend();
    else void speaker?.resume();
  }, { signal });
  function input(): RoamInput {
    const driving = roam.vehicle !== null;
    const forward = has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown');
    const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    return {
      forward: driving ? 0 : forward,
      side: driving ? 0 : side,
      sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || actions.has('run'),
      look: 0,
      use: pulses.has('use') || pulses.has('board'),
      pickpocket: pulses.has('pickpocket'),
      rob: pulses.has('rob'),
      fire: driving ? false : pulses.has('fireOnce') || actions.has('fire') || keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyJ'),
      reload: pulses.has('reload'),
      service: pulses.has('service'),
      jump: !driving && pulses.has('jump'),
      throttle: driving ? forward : 0,
      steer: driving ? (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) : 0,
      handbrake: keys.has('Space') || actions.has('brake'),
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
    const drivingNow = roam.vehicle;
    const armed = drivingNow
      ? drivingNow.spec.name + ' · 상태 ' + Math.round(drivingNow.health) + '%'
      : vitals.reload > 0 && vitals.weapon ? WEAPONS[vitals.weapon].name + ' 재장전'
      : vitals.weapon ? WEAPONS[vitals.weapon].name + '  ' + vitals.magazine + ' / ' + vitals.reserve : '맨손';
    if (weapon.textContent !== armed) weapon.textContent = armed;
    const hint = roam.hint();
    if (prompt.textContent !== hint) prompt.textContent = hint;
    if (notice.textContent !== roam.notice) notice.textContent = roam.notice;
    if (now - hudAt > 100) {
      hudAt = now;
      drawMap(mini, roam, false, roam.peds, roam.items, waypoint);
      const hours = Math.floor(roam.world.hours);
      const minutes = Math.floor((roam.world.hours - hours) * 60);
      hud.textContent = districtAt(roam.x, roam.z).name + ' · ' + String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ' · 가방 ' + roam.collectedPackages.size + '/' + PACKAGES.length + (waypoint ? ' · 목적지 ' + Math.round(Math.hypot(waypoint.x - roam.x, waypoint.z - roam.z)) + 'm' : '');
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
      if (waypoint && Math.hypot(waypoint.x - roam.x, waypoint.z - roam.z) < 9) waypoint = null;
      pulses.clear();
      if (speaker) {
        speaker.apply(renderMix(mixer, {
          ears: roam.ears,
          listen: { x: roam.x, z: roam.z, yaw: roam.yaw, hours: roam.world.hours },
          district: districtAt(roam.x, roam.z).id,
          siren: roam.siren,
          engines: roam.engines(),
        }, audioSettings, dt), dt);
      }
    } else roam.world.stream();
    actors.view(camera.position.x, camera.position.z);
    actors.sync(roam.peds, roam.items, roam.shots);
    garage.sync(roam.rides, dt);
    for (const marker of markers) marker.visible = Math.hypot(marker.position.x - roam.x, marker.position.z - roam.z) < 180;
    for (const { item, mesh } of packages) {
      mesh.visible = !roam.collectedPackages.has(item.id) && Math.hypot(item.x - roam.x, item.z - roam.z) < 65;
    }
    held.visible = roam.vitals.weapon !== null && !roam.vehicle;
    playerRig.root.visible = !roam.vehicle;
    crosshair.hidden = mapOpen || roam.vehicle !== null;
    const moving = !roam.vehicle && (has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown') !== 0 || keys.has('KeyA') || keys.has('KeyD'));
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || actions.has('run');
    const clip: Clip = roam.airborne ? 'jump' : moving ? (sprint ? 'run' : 'walk') : 'idle';
    gait = moving ? (gait + dt / (sprint ? 0.44 : 0.78)) % 1 : 0;
    playerRig.root.position.set(roam.x, roam.world.y + roam.jumpHeight, roam.z);
    playerRig.root.rotation.y = modelYaw(roam.yaw, 'harbor');
    if (!roam.vehicle) {
      const phase = roam.airborne ? roam.jumpPhase : gait;
      people.apply(playerRig, poseAt(clip, phase), { phase, clip });
    }
    const facing = roam.yaw + (roam.vehicle ? orbit : 0);
    const aimX = Math.sin(facing);
    const aimZ = -Math.cos(facing);
    const distance = roam.vehicle ? 12 : 7.5;
    const height = roam.vehicle ? 5.4 : 4.2;
    target.set(roam.x + aimX * 14, roam.world.y + 1.25 + roam.jumpHeight * 0.6, roam.z + aimZ * 14);
    desired.set(roam.x - aimX * distance, roam.world.y + height + roam.jumpHeight * 0.6, roam.z - aimZ * distance);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 13));
    camera.lookAt(target);
    frameShot(camera, roam);
    const climate = climateAt(roam.x, roam.z, roam.world.hours);
    const angle = (roam.world.hours - 6) * Math.PI / 12;
    const brightness = Math.max(0.08, Math.min(1, Math.sin(angle) * 1.5 + 0.15));
    sky.color.setHex(climate.hemi);
    sky.groundColor.setHex(climate.ground);
    sky.intensity = (0.35 + brightness * 1.55) * (1 - climate.night * 0.25);
    sun.color.setHex(climate.sun);
    sun.intensity = (0.08 + brightness * 2.1) * (1 - climate.night * 0.35);
    sun.position.set(Math.cos(angle) * 150, Math.max(12, Math.sin(angle) * 180), 75);
    scene.background = color.setHex(climate.sky);
    scene.environmentIntensity=.12+brightness*.43*(1-climate.night*.6);
    if (scene.fog instanceof T.FogExp2) {
      scene.fog.color.setHex(climate.fog);
      scene.fog.density = climate.fogDensity;
    }
    chunks.setNight(climate.night);
    paintHud(now);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  focusGame();
  requestAnimationFrame(focusGame);
  paintHud(performance.now());
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    abort.abort();
    observer.disconnect();
    actors.dispose();
    people.dispose();
    garage.dispose();
    chunks.dispose();
    scene.environment=null;reflections?.dispose();
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>();
    scene.traverse(obj => {
      if (!(obj instanceof T.Mesh) && !(obj instanceof T.InstancedMesh) && !(obj instanceof T.Line)) return;
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
    host.querySelector('.harbor-audio')?.remove();
    void speaker?.dispose();
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
  if (startButton) {
    startButton.disabled = false;
    startButton.textContent = '브라우저에서 바로 플레이';
    startButton.removeAttribute('aria-busy');
  }
  const loading = document.getElementById('harbor-world-loading');
  if (loading) loading.hidden = true;
}
stageEl?.addEventListener('harbor-world-exit', () => {
  if (document.documentElement.dataset.harbor === 'desktop') {
    window.close();
    return;
  }
  closeWorld();
  startButton?.focus();
});
window.addEventListener('harbor-mode', event => {
  if ((event as CustomEvent<string>).detail === 'world' || !stop) return;
  closeWorld();
});
startButton?.addEventListener('click', () => {
  if (!stageEl || !startButton || startButton.disabled) return;
  window.dispatchEvent(new CustomEvent('harbor-mode', { detail: 'world' }));
  startButton.disabled = true;
  startButton.textContent = '월드를 불러오는 중…';
  startButton.setAttribute('aria-busy', 'true');
  stageEl.hidden = false;
  const loading = document.getElementById('harbor-world-loading');
  if (loading) loading.hidden = false;
  const error = document.getElementById('harbor-world-error');
  if (error) error.textContent = '';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    void (async () => {
      try {
        await loadPeople();
        stop = start();
        document.body.classList.add('harbor-driving');
        if (loading) loading.hidden = true;
        startButton.textContent = '플레이 중';
      } catch (caught) {
        stageEl.hidden = true;
        if (loading) loading.hidden = true;
        startButton.disabled = false;
        startButton.textContent = '브라우저에서 바로 플레이';
        startButton.removeAttribute('aria-busy');
        if (error) error.textContent = '3D 화면을 시작하지 못했습니다. WebGL 지원 브라우저인지 확인하세요.';
        console.error(caught);
      }
    })();
  }));
});
if (document.documentElement.dataset.harbor === 'desktop') {
  queueMicrotask(() => startButton?.click());
}
