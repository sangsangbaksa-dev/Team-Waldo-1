import * as T from "../vendor/three.module.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const scene = new T.Scene();
scene.background = new T.Color(0x18252a);
scene.fog = new T.FogExp2(0x18252a, 0.023);
const camera = new T.PerspectiveCamera(67, 1, 0.04, 100);
camera.rotation.order = "YXZ";
scene.add(camera);
const solids = [];
const walls = [];
const effects = [];
const guards = [];
const keys = new Set();
const pointer = { held: false, fallback: false };
const spawn = new T.Vector3(0, 1.65, 14);
const terminalPos = new T.Vector3(0, 0, -15.5);
const samples = [
  [0, 7],
  [-8, 2],
  [7, 1],
  [-8, -8],
  [8, -8],
  [0, -8],
  [4, -14],
];
const clip = 24;
const limit = 7;
const state = {};
const ray = new T.Raycaster();
const direction = new T.Vector3();
const shade = new Map();
const health = $("health-bar");
let phase = "menu";
let title = $("title");
let time = 0;
let last = 0;
let noticeUntil = 0;
let sound = true;
let audio;
let noise;
let renderer;

function material(hex, glowing = false) {
  const key = hex + (glowing ? 0x1000000 : 0);
  if (!shade.has(key))
    shade.set(
      key,
      new T.MeshStandardMaterial({
        color: hex,
        roughness: 0.83,
        metalness: 0.22,
        emissive: glowing ? hex : 0,
        emissiveIntensity: glowing ? 0.7 : 0,
      }),
    );
  return shade.get(key);
}

function box(parent, x, y, z, w, h, d, color, glow = false) {
  const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material(color, glow));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function barrier(x, z, w, h, d, color, y = h / 2) {
  const mesh = box(scene, x, y, z, w, h, d, color);
  solids.push(mesh);
  walls.push({ x, z, w, d });
  return mesh;
}

function sign(message, color, x, y, z, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = "#19282b";
  c.fillRect(0, 0, 512, 128);
  c.fillStyle = color;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "bold 60px system-ui";
  c.fillText(message, 256, 67, 478);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const plate = new T.Mesh(
    new T.PlaneGeometry(width, height),
    new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }),
  );
  plate.position.set(x, y, z);
  scene.add(plate);
}

function crate(x, z, w, d, h, color) {
  barrier(x, z, w, h, d, color);
  for (const side of [-1, 1]) {
    const edge = x + side * (w / 2 - 0.14);
    box(scene, edge, h / 2, z, 0.12, h + 0.015, d + 0.025, 0x273235);
    box(
      scene,
      x,
      h * 0.78,
      z + side * (d / 2 + 0.015),
      w,
      0.12,
      0.06,
      0x1e2b2f,
    );
  }
  box(scene, x, h + 0.02, z, w * 0.86, 0.04, d * 0.81, 0x566162);
}

function container(x, z, color) {
  barrier(x, z, 3.7, 3, 7, color);
  for (const side of [-1, 1]) {
    for (let i = -3; i <= 3; i += 0.55)
      box(scene, x + side * 1.86, 1.5, z + i, 0.075, 2.74, 0.11, 0x293c40);
    for (const offset of [-1.7, 1.7])
      box(scene, x + offset, 1.5, z + side * 3.52, 0.12, 2.9, 0.1, 0x172124);
    box(scene, x, 2.87, z + side * 3.53, 3.7, 0.11, 0.12, 0x273236);
  }
}

function buildHangar() {
  scene.add(new T.HemisphereLight(0xbddeeb, 0x68645b, 1.65));
  const ambient = new T.DirectionalLight(0xe5f4ff, 2.05);
  ambient.position.set(3, 10, 8);
  scene.add(ambient);
  box(scene, 0, -0.16, 0, 25, 0.3, 37, 0x384243);
  const grid = new T.GridHelper(37, 37, 0x455251, 0x3d4a4b);
  grid.scale.x = 25 / 37;
  grid.position.y = 0.002;
  scene.add(grid);
  for (const x of [-3.05, 3.05]) {
    for (let z = -16; z < 18; z += 2)
      box(scene, x, 0.007, z, 0.07, 0.008, 1.25, 0xb8a162);
  }
  for (const x of [-12.1, 12.1]) barrier(x, 0, 0.4, 7, 36, 0x3a484b);
  for (const z of [-18, 18]) barrier(0, z, 24, 7, 0.4, 0x465154);
  box(scene, 0, 7, 0, 24, 0.15, 36, 0x233136);
  for (let z = -16; z <= 16; z += 8) {
    box(scene, 0, 5.95, z, 24, 0.26, 0.28, 0x162526);
    box(scene, 0, 5.76, z, 3.8, 0.1, 0.21, 0xc4eaff, true);
    for (const x of [-11.78, 11.78])
      box(scene, x, 3.4, z, 0.32, 6.8, 0.45, 0x18272a);
    const lamp = new T.PointLight(z < 0 ? 0x92d5fc : 0xffc789, 42, 15, 2);
    lamp.position.set(z < 0 ? -4 : 4, 4.8, z);
    scene.add(lamp);
  }
  container(-5.1, 5.5, 0x254b56);
  container(5.1, -3.9, 0x78452f);
  container(-5.5, -8.4, 0x425b52);
  crate(5, 7.8, 3.15, 2.3, 1.55, 0x727e73);
  crate(-8.1, 10.8, 2.3, 2, 1.23, 0x6e614d);
  crate(8.9, 11, 2.6, 2.4, 1.7, 0x505f55);
  crate(8, -12.4, 3.8, 2.5, 1.7, 0x5b655b);
  crate(-8.9, -13.1, 1.7, 2, 1.25, 0x625842);
  crate(1.7, -2.1, 1.7, 1.55, 1.16, 0x7a6a4e);
  crate(-1.65, 6.8, 1.55, 1.6, 1.2, 0x6b6454);
  for (let i = 0; i < 9; i++) {
    box(scene, -3.18 + i * 0.78, 0.014, 16.6, 0.46, 0.012, 0.2, 0xd6a15d);
  }
  sign("WALDO / HANGAR 17", "#ffe0a8", 0, 4.1, -17.74, 7, 1.66);
  sign("출구 · EXIT", "#aef4d2", 0, 3.1, 17.72, 3.3, 0.8);
  box(scene, 0, 1.1, 17.63, 3, 2.3, 0.2, 0x263b36);
  box(scene, 0, 2.45, 17.32, 3.4, 0.1, 0.17, 0x78e4aa, true);
  box(scene, 0, 0.45, -15.85, 1.15, 0.9, 0.96, 0x233237);
  box(scene, 0, 1.14, -15.84, 1.05, 0.52, 0.18, 0xffb65d, true);
  box(scene, 0, 1.15, -15.72, 0.72, 0.23, 0.035, 0x152621);
  box(scene, 0, 1.16, -15.693, 0.53, 0.055, 0.018, 0xa8ffe7, true);
  const ring = new T.Mesh(
    new T.RingGeometry(0.75, 0.82, 44),
    new T.MeshBasicMaterial({ color: 0xffc77f, side: T.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.018, -15.45);
  scene.add(ring);
}

const gun = new T.Group();
camera.add(gun);
box(gun, 0, 0, -0.25, 0.15, 0.16, 0.52, 0x1b272c);
box(gun, 0, -0.045, -0.22, 0.155, 0.065, 0.37, 0x596469);
box(gun, 0, 0.045, -0.52, 0.072, 0.072, 0.35, 0x223134);
box(gun, 0, 0.091, -0.52, 0.05, 0.038, 0.05, 0xd7a46e);
box(gun, 0, 0.112, -0.18, 0.11, 0.06, 0.12, 0x101a1e);
box(gun, 0.035, -0.135, -0.22, 0.125, 0.22, 0.13, 0x3a4549);
box(gun, -0.11, -0.15, -0.015, 0.21, 0.22, 0.35, 0x586357);
box(gun, -0.065, -0.09, -0.35, 0.15, 0.13, 0.17, 0x69685b);
const muzzle = new T.Mesh(
  new T.OctahedronGeometry(0.105),
  new T.MeshBasicMaterial({ color: 0xffd79b }),
);
muzzle.position.set(0, 0.04, -0.73);
muzzle.visible = false;
gun.add(muzzle);

function newGuard(x, z) {
  const body = new T.Group();
  const core = box(body, 0, 1.17, 0, 0.68, 0.7, 0.43, 0x4a4845);
  const head = box(body, 0, 1.71, 0, 0.43, 0.4, 0.43, 0x313b3e);
  box(body, 0, 1.73, 0.224, 0.34, 0.082, 0.034, 0xf98761, true);
  box(body, 0, 1.31, 0.225, 0.13, 0.082, 0.028, 0xfab161, true);
  for (const side of [-1, 1]) {
    box(body, side * 0.22, 0.46, 0, 0.24, 0.71, 0.26, 0x384447);
    box(body, side * 0.22, 0.115, 0.091, 0.26, 0.21, 0.42, 0x263236);
    box(body, side * 0.44, 1.19, 0.13, 0.23, 0.48, 0.25, 0x535a58);
    box(body, side * 0.42, 1.09, 0.27, 0.13, 0.19, 0.12, 0x71837b);
  }
  body.position.set(x, 0, z);
  scene.add(body);
  const guard = { body, hp: 3, next: 1.1 + Math.random(), flash: 0 };
  body.traverse((obj) => {
    if (obj.isMesh) obj.userData.guard = guard;
  });
  head.userData.critical = true;
  core.userData.critical = false;
  return guard;
}

function clearRound() {
  for (const guard of guards) scene.remove(guard.body);
  for (const item of effects) removeEffect(item);
  guards.length = 0;
  effects.length = 0;
}

function reset() {
  clearRound();
  Object.assign(state, {
    hp: 100,
    mag: clip,
    reserve: 144,
    kills: 0,
    data: false,
    reload: 0,
    nextShot: 0,
    recoil: 0,
    hurt: 0,
    hit: 0,
    elapsed: 0,
    shots: 0,
    hits: 0,
  });
  time = 0;
  noticeUntil = 0;
  camera.position.copy(spawn);
  camera.rotation.set(0, 0, 0, "YXZ");
  gun.position.set(0.29, -0.245, -0.33);
  samples.forEach(([x, z]) => guards.push(newGuard(x, z)));
  $("notice").textContent = "";
  updateHud();
}

function canStand(x, z, r = 0.32) {
  return !walls.some(
    (w) => Math.abs(x - w.x) < w.w / 2 + r && Math.abs(z - w.z) < w.d / 2 + r,
  );
}

function move(position, x, z, r = 0.32) {
  if (canStand(position.x + x, position.z, r)) position.x += x;
  if (canStand(position.x, position.z + z, r)) position.z += z;
}

function blocked(from, to) {
  direction.subVectors(to, from);
  const length = direction.length();
  ray.set(from, direction.normalize());
  ray.far = length - 0.05;
  return ray.intersectObjects(solids, false).length > 0;
}

function beep(frequency, duration, volume, kind = "triangle") {
  if (!sound || !audio) return;
  const source = audio.createOscillator();
  const gain = audio.createGain();
  source.type = kind;
  source.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  source.connect(gain).connect(audio.destination);
  source.start();
  source.stop(audio.currentTime + duration);
}

function shotSound() {
  if (!sound || !audio) return;
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();
  source.buffer = noise;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2750, audio.currentTime);
  filter.frequency.exponentialRampToValueAtTime(180, audio.currentTime + 0.11);
  gain.gain.setValueAtTime(0.23, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.13);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start();
}

function enableAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio || !sound) return;
  if (!audio) {
    audio = new Audio();
    noise = audio.createBuffer(1, 0.15 * audio.sampleRate, audio.sampleRate);
    const wave = noise.getChannelData(0);
    for (let i = 0; i < wave.length; i++) wave[i] = Math.random() * 2 - 1;
  }
  audio.resume().catch(() => {});
}

function flashLine(from, to, color) {
  const mesh = new T.Line(
    new T.BufferGeometry().setFromPoints([from, to]),
    new T.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
  );
  scene.add(mesh);
  effects.push({ mesh, ttl: 0.11 });
}

function removeEffect({ mesh }) {
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
}

function tell(message, duration = 2) {
  $("notice").textContent = message;
  noticeUntil = time + duration;
}

function reload() {
  if (state.reload || state.mag === clip || !state.reserve) return;
  state.reload = 1.08;
  beep(153, 0.12, 0.12, "square");
}

function shoot() {
  if (time < state.nextShot || state.reload) return;
  if (!state.mag) {
    reload();
    return;
  }
  state.nextShot = time + 0.14;
  state.mag--;
  state.shots++;
  state.recoil = 1;
  muzzle.visible = true;
  shotSound();
  camera.updateMatrixWorld(true);
  camera.getWorldDirection(direction);
  ray.set(camera.position, direction);
  ray.far = 48;
  const suspects = guards.filter((g) => g.hp > 0).map((g) => g.body);
  const hit = ray.intersectObjects([...solids, ...suspects], true)[0];
  const to = hit
    ? hit.point
    : camera.position.clone().addScaledVector(direction, 43);
  flashLine(muzzle.getWorldPosition(new T.Vector3()), to, 0xffdda5);
  const guard = hit?.object.userData.guard;
  if (!guard || guard.hp <= 0) return;
  state.hits++;
  state.hit = 0.13;
  guard.hp -= hit.object.userData.critical ? 3 : 1;
  guard.flash = 0.12;
  beep(guard.hp <= 0 ? 720 : 450, 0.12, 0.095);
  if (guard.hp <= 0) {
    guard.body.visible = false;
    state.kills++;
    if (state.kills === limit) tell("격납고 확보 · 데이터 단말로 이동하세요");
  }
}

function player(dt) {
  const horizontal = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  const vertical = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const moving = Boolean(horizontal || vertical);
  const running = moving && (keys.has("ShiftLeft") || keys.has("ShiftRight"));
  if (moving) {
    const pace =
      ((running ? 6.5 : 4.45) * dt) / Math.hypot(horizontal, vertical);
    const angle = camera.rotation.y;
    move(
      camera.position,
      (horizontal * Math.cos(angle) - vertical * Math.sin(angle)) * pace,
      (-horizontal * Math.sin(angle) - vertical * Math.cos(angle)) * pace,
    );
  }
  camera.position.y =
    1.65 + (moving ? Math.sin(time * (running ? 13 : 9)) * 0.035 : 0);
  gun.position.set(
    0.29 + (moving ? Math.sin(time * 8) * 0.018 : 0),
    -0.245 + (moving ? Math.sin(time * 16) * 0.011 : 0) - state.reload * 0.075,
    -0.33 + state.recoil * 0.12,
  );
  gun.rotation.x = state.recoil * 0.12 - state.reload * 0.25;
  if (pointer.held) shoot();
  if (state.reload) {
    state.reload = Math.max(0, state.reload - dt);
    if (!state.reload) {
      const amount = Math.min(clip - state.mag, state.reserve);
      state.mag += amount;
      state.reserve -= amount;
      beep(263, 0.1, 0.1, "square");
    }
  }
  state.recoil = Math.max(0, state.recoil - dt * 7);
  state.hurt = Math.max(0, state.hurt - dt * 2.2);
  state.hit = Math.max(0, state.hit - dt);
  muzzle.visible = state.recoil > 0.7;
  $("damage").style.opacity = String(state.hurt * 0.69);
  $("crosshair").classList.toggle("hit", Boolean(state.hit));
}

const guardEye = new T.Vector3();
function updateGuards(dt) {
  for (const guard of guards) {
    if (guard.hp <= 0) continue;
    const { body } = guard;
    const dx = camera.position.x - body.position.x;
    const dz = camera.position.z - body.position.z;
    const distance = Math.hypot(dx, dz);
    body.rotation.y = Math.atan2(dx, dz);
    guard.flash = Math.max(0, guard.flash - dt);
    body.position.y = guard.flash > 0 ? 0.055 : 0;
    guardEye.copy(body.position).y = 1.39;
    const sees = distance < 15 && !blocked(guardEye, camera.position);
    if (!sees) {
      guard.next = Math.max(guard.next, time + 0.35);
      continue;
    }
    if (distance > 5.5)
      move(
        body.position,
        (dx / distance) * dt * 0.76,
        (dz / distance) * dt * 0.76,
        0.45,
      );
    if (time < guard.next) continue;
    guard.next = time + 1.25 + Math.random() * 0.8;
    const offset = new T.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 1.8,
      (Math.random() - 0.5) * 1.8,
    );
    const target = camera.position.clone().add(offset);
    flashLine(guardEye, target, 0xff8169);
    beep(99, 0.09, 0.055, "sawtooth");
    if (Math.random() > Math.min(0.71, 0.2 + distance * 0.024)) {
      state.hp = Math.max(0, state.hp - 6);
      state.hurt = 1;
      if (!state.hp) {
        finish(false);
        return;
      }
    }
  }
}

function isNear(point, distance) {
  return (
    Math.hypot(point.x - camera.position.x, point.z - camera.position.z) <
    distance
  );
}

function interaction() {
  if (state.data) return isNear(spawn, 2.5) ? "E · 출구로 나가기" : "";
  if (!isNear(terminalPos, 2)) return "";
  return state.kills === limit
    ? "E · 데이터 확보"
    : "남은 경비 유닛을 제압하세요";
}

function interact() {
  if (phase !== "game") return;
  if (state.data && isNear(spawn, 2.5)) {
    finish(true);
    return;
  }
  if (!state.data && state.kills === limit && isNear(terminalPos, 2)) {
    state.data = true;
    tell("데이터 확보 · 출구가 열렸습니다");
    beep(620, 0.26, 0.15);
  }
}

const radar = $("radar").getContext("2d");
function drawRadar() {
  radar.clearRect(0, 0, 150, 144);
  radar.fillStyle = "#1b292d";
  radar.fillRect(11, 9, 128, 126);
  const x = (v) => 75 + v * 5.25;
  const z = (v) => 72 + v * 3.45;
  radar.fillStyle = "#465956";
  for (const w of walls)
    radar.fillRect(x(w.x - w.w / 2), z(w.z - w.d / 2), w.w * 5.25, w.d * 3.45);
  const goal = state.data ? spawn : terminalPos;
  radar.fillStyle = "#ffc675";
  radar.fillRect(x(goal.x) - 3, z(goal.z) - 3, 6, 6);
  radar.save();
  radar.translate(x(camera.position.x), z(camera.position.z));
  radar.rotate(-camera.rotation.y);
  radar.beginPath();
  radar.moveTo(0, -6);
  radar.lineTo(4, 4);
  radar.lineTo(0, 2);
  radar.lineTo(-4, 4);
  radar.closePath();
  radar.fillStyle = "#b7ffe1";
  radar.fill();
  radar.restore();
}

function updateHud() {
  $("hp").textContent = state.hp;
  health.style.width = state.hp + "%";
  $("mag").textContent = state.mag;
  $("reserve").textContent = state.reserve;
  $("objective").textContent = state.data
    ? "출구로 돌아오세요"
    : "데이터 단말을 확보하세요";
  $("detail").textContent = state.data
    ? "지도에 표시된 출구에서 E"
    : "경비 유닛 " + state.kills + " / " + limit;
  $("reload-state").innerHTML = state.reload
    ? "재장전 중…"
    : state.mag || state.reserve
      ? "재장전 <kbd>R</kbd>"
      : "탄약 소진";
  const prompt = interaction();
  $("prompt").hidden = !prompt;
  $("prompt").textContent = prompt;
  drawRadar();
}

function showOverlay(heading, description, label, mode) {
  $("hud").hidden = true;
  $("overlay").hidden = false;
  title.textContent = heading;
  $("description").textContent = description;
  $("start").textContent = label;
  $("mode").textContent = mode;
  $("availability").textContent = "";
  $("start").focus();
}

function leavePlay(next) {
  phase = next;
  pointer.held = false;
  keys.clear();
  if (document.pointerLockElement === view) document.exitPointerLock?.();
  $("damage").style.opacity = "0";
}

function pause() {
  if (phase !== "game") return;
  leavePlay("pause");
  showOverlay(
    "일시정지",
    "임무를 계속할 준비가 되면 돌아오세요.",
    "계속하기",
    "창고 17",
  );
}

function finish(win) {
  leavePlay("end");
  const total = Math.floor(state.elapsed);
  const accuracy = state.shots
    ? Math.round((state.hits / state.shots) * 100)
    : 0;
  showOverlay(
    win ? "임무 완료" : "임무 실패",
    (win
      ? "데이터를 확보하고 격납고를 빠져나왔습니다."
      : "경비 유닛이 격납고를 지켰습니다.") +
      "\n경비 유닛 " +
      state.kills +
      " / " +
      limit +
      " · " +
      total +
      "초 · 명중률 " +
      accuracy +
      "%",
    "다시 시작",
    "창고 17 / 작전 결과",
  );
  beep(win ? 685 : 83, 0.44, 0.18);
}

function fallback() {
  if (phase !== "game") return;
  pointer.fallback = true;
  tell("마우스를 움직여 조준하세요 · Esc로 일시정지", 3);
}

function start() {
  if (phase === "game") return;
  enableAudio();
  if (phase !== "pause") reset();
  phase = "game";
  pointer.fallback = false;
  $("overlay").hidden = true;
  $("hud").hidden = false;
  $("start").blur();
  try {
    const lock = view.requestPointerLock?.();
    if (!view.requestPointerLock) fallback();
    lock?.catch(fallback);
  } catch {
    fallback();
  }
}

$("start").addEventListener("click", start);
$("pause").addEventListener("click", pause);
$("sound").addEventListener("click", () => {
  sound = !sound;
  $("sound").textContent = sound ? "소리 켜짐" : "소리 꺼짐";
  $("sound").setAttribute("aria-pressed", String(sound));
  enableAudio();
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === view) {
    pointer.fallback = false;
    return;
  }
  if (!pointer.fallback) pause();
});
document.addEventListener("pointerlockerror", fallback);
window.addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("keydown", (event) => {
  if (phase !== "game") return;
  if (event.code === "Escape") {
    pause();
    return;
  }
  if (
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyR",
      "KeyE",
      "ShiftLeft",
      "ShiftRight",
    ].includes(event.code)
  )
    event.preventDefault();
  keys.add(event.code);
  if (!event.repeat && event.code === "KeyR") reload();
  if (!event.repeat && event.code === "KeyE") interact();
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
document.addEventListener("mousemove", (event) => {
  if (
    phase !== "game" ||
    (document.pointerLockElement !== view && !pointer.fallback)
  )
    return;
  camera.rotation.y -= event.movementX * 0.0022;
  camera.rotation.x = T.MathUtils.clamp(
    camera.rotation.x - event.movementY * 0.0022,
    -1.36,
    1.36,
  );
});
view.addEventListener("mousedown", (event) => {
  if (phase === "game" && event.button === 0) {
    pointer.held = true;
    shoot();
  }
});
window.addEventListener("mouseup", () => {
  pointer.held = false;
});
view.addEventListener("contextmenu", (event) => event.preventDefault());

function resize() {
  renderer.setSize(view.clientWidth, view.clientHeight, false);
  camera.aspect = view.clientWidth / Math.max(1, view.clientHeight);
  camera.updateProjectionMatrix();
}

function animate(now) {
  const dt = Math.min(0.04, (now - last) / 1000);
  last = now;
  if (phase === "game") {
    time += dt;
    state.elapsed += dt;
    player(dt);
    updateGuards(dt);
    for (let i = effects.length - 1; i >= 0; i--) {
      const item = effects[i];
      item.ttl -= dt;
      if (item.ttl <= 0) {
        removeEffect(item);
        effects.splice(i, 1);
      } else item.mesh.material.opacity = item.ttl * 7;
    }
    if (time > noticeUntil) $("notice").textContent = "";
    updateHud();
  } else if (phase === "menu") {
    camera.position.set(1.1, 2.15, 14.55 + Math.sin(now * 0.0004) * 0.45);
    camera.lookAt(-1, 1.35, -13);
    gun.visible = false;
  }
  if (phase === "game") gun.visible = true;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

try {
  renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  view.append(renderer.domElement);
  buildHangar();
  reset();
  window.addEventListener("resize", resize);
  resize();
  if (
    matchMedia("(pointer: coarse)").matches &&
    !matchMedia("(any-pointer: fine)").matches
  ) {
    $("availability").textContent =
      "키보드와 마우스가 연결된 기기에서 플레이할 수 있어요.";
  } else {
    $("start").disabled = false;
    $("availability").textContent = "";
  }
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    pause();
    $("availability").textContent =
      "3D 연결이 끊겼어요. 페이지를 새로고침해 주세요.";
    $("start").disabled = true;
  });
  requestAnimationFrame(animate);
} catch (error) {
  $("availability").textContent =
    "3D 화면을 시작할 수 없어요. WebGL을 지원하는 브라우저에서 다시 열어 주세요.";
  console.error(error);
}
