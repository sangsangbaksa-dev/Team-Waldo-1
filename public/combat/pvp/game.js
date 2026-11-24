import * as T from "../vendor/three.module.js";
import { hostRoom, joinRoom } from "./network.js";
import military from "../military/pvp-map.js";
import zombie from "../zombie/pvp-map.js";
import robots from "../robots/pvp-map.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const maps = { military, zombie, robots };
const requestedMap = params.get("map");
const mapId = Object.hasOwn(maps, requestedMap) ? requestedMap : "military";
const map = maps[mapId];
const maxPoints = 5;
const maxTime = 180;
const eyeHeight = 1.58;
const capacity = 12;
const controls = new Set();
const view = $("view");
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(67, 1, 0.045, 95);
camera.rotation.order = "YXZ";
scene.add(camera);
scene.background = new T.Color(map.fog);
scene.fog = new T.FogExp2(map.fog, 0.021);
const color = "#" + map.accent.toString(16).padStart(6, "0");
document.documentElement.style.setProperty("--accent", color);
$("title").textContent = map.title;
$("subtitle").textContent = map.subtitle;
$("back").href = "../" + mapId + "/";
if (/^[A-Z2-9]{6}$/i.test(params.get("room") || ""))
  $("code").value = params.get("room").toUpperCase();

let phase = "lobby";
let renderer;
let handle;
let isHost = false;
let session = 0;
let verified = false;
let transportOpen = false;
let localReady = false;
let remoteReady = false;
let aiming = false;
let fallback = false;
let held = false;
let previous = 0;
let packetAt = 0;
let statusAt = 0;
let sentPose;
let ammo = capacity;
let reloadAt = 0;
let nextShot = 0;
let recoil = 0;
let hurt = 0;
let hitUntil = 0;
let displaySeconds = maxTime;
let matchStart = 0;
let audio;
let soundBuffer;
let shotNumber = 0;
let lastReceivedShot = 0;
const hp = [100, 100];
const scores = [0, 0];
const generations = [0, 0];
const safeUntil = [0, 0];
const position = new T.Vector3();
const remotePosition = new T.Vector3();
const direction = new T.Vector3();
const opponentTarget = new T.Vector3();
const ray = new T.Raycaster();
const cover = [];
const traces = [];
const gun = new T.Group();
const materials = new Map();
camera.add(gun);

function surface(hex, lit = false) {
  const key = hex + (lit ? 0x1000000 : 0);
  if (!materials.has(key))
    materials.set(
      key,
      new T.MeshStandardMaterial({
        color: hex,
        roughness: 0.81,
        metalness: 0.18,
        emissive: lit ? hex : 0,
        emissiveIntensity: lit ? 0.83 : 0,
      }),
    );
  return materials.get(key);
}

function box(parent, x, y, z, w, h, d, color, lit = false) {
  const item = new T.Mesh(new T.BoxGeometry(w, h, d), surface(color, lit));
  item.position.set(x, y, z);
  parent.add(item);
  return item;
}

function buildWorld() {
  const { width: w, depth: d } = map;
  box(scene, 0, -0.14, 0, w + 0.6, 0.28, d + 0.6, map.ground);
  const grid = new T.GridHelper(d, d, 0x50716d, 0x4b5c5b);
  grid.scale.x = w / d;
  grid.position.y = 0.003;
  scene.add(grid);
  const rim = new T.Color(map.ground).multiplyScalar(0.75).getHex();
  for (const x of [-w / 2, w / 2])
    cover.push(box(scene, x, 1.85, 0, 0.34, 3.7, d, rim));
  for (const z of [-d / 2, d / 2])
    cover.push(box(scene, 0, 1.85, z, w, 3.7, 0.34, rim));
  const beams = [];
  if (mapId === "military" || mapId === "robots") {
    if (mapId === "military") box(scene, 0, 6.4, 0, w, 0.2, d, 0x23373c);
    for (let z = -d / 2 + 2; z < d / 2; z += 7) {
      box(scene, 0, 5.72, z, w, 0.24, 0.2, rim);
      box(scene, 0, 5.53, z, 4.25, 0.09, 0.17, map.accent, true);
      beams.push([0, z, 5.25]);
    }
  } else {
    for (let z = -d / 2 + 3; z < d / 2; z += 9) {
      const x = z < 0 ? -w / 2 + 0.55 : w / 2 - 0.55;
      box(scene, x, 2, z, 0.17, 4, 0.17, rim);
      box(scene, x, 4.05, z, 0.68, 0.14, 0.34, map.accent, true);
      beams.push([x, z, 3.9]);
    }
  }
  for (const [x, z, y] of beams) {
    const light = new T.PointLight(map.accent, 24, 12);
    light.position.set(x, y, z);
    scene.add(light);
  }
  for (const [x, z, w, h, d, hex] of map.blocks) {
    cover.push(box(scene, x, h / 2, z, w, h, d, hex));
    box(scene, x, h * 0.9, z, w + 0.035, 0.085, d + 0.035, rim);
    for (const edge of [-1, 1])
      box(
        scene,
        x + edge * w * 0.42,
        h / 2,
        z,
        0.082,
        h * 0.92,
        d + 0.043,
        0x283e43,
      );
    if (mapId === "robots" || h > 2.35)
      box(
        scene,
        x,
        h * 0.69,
        z + d / 2 + 0.012,
        w * 0.48,
        0.055,
        0.035,
        map.accent,
        true,
      );
  }
  const ambient = new T.HemisphereLight(0xd8eafa, 0x658076, 1.75);
  const light = new T.DirectionalLight(0xd8edff, 2.35);
  light.position.set(-4, 14, 7);
  scene.add(ambient, light);
  box(gun, 0, 0, -0.22, 0.16, 0.14, 0.58, 0x233338);
  box(gun, 0, 0.013, -0.55, 0.075, 0.075, 0.3, 0x162a31);
  box(gun, 0, 0.086, -0.32, 0.09, 0.065, 0.18, map.accent);
  box(gun, -0.058, -0.105, -0.27, 0.28, 0.18, 0.17, 0x5d7270);
  gun.position.set(0.25, -0.23, -0.36);
}

const opponent = new T.Group();
function buildOpponent() {
  const avatar =
    mapId === "robots" ? 0x2b5a63 : mapId === "zombie" ? 0x53664a : 0x4a5655;
  const body = box(opponent, 0, 1.14, 0, 0.58, 0.73, 0.4, avatar);
  box(opponent, 0, 1.68, 0, 0.42, 0.38, 0.41, 0x253a3f);
  box(opponent, 0, 1.69, 0.219, 0.31, 0.075, 0.028, 0xf78067, true);
  box(opponent, 0, 1.22, 0.213, 0.11, 0.075, 0.025, 0xf78067, true);
  for (const side of [-1, 1]) {
    box(opponent, side * 0.18, 0.44, 0, 0.23, 0.75, 0.25, avatar);
    box(opponent, side * 0.4, 1.12, 0.19, 0.21, 0.45, 0.24, avatar);
  }
  body.userData.core = true;
  opponent.visible = false;
  scene.add(opponent);
}

function free(x, z, radius = 0.3) {
  if (Math.abs(x) > map.width / 2 - 0.51 || Math.abs(z) > map.depth / 2 - 0.51)
    return false;
  return !map.blocks.some(
    ([bx, bz, w, , d]) =>
      Math.abs(x - bx) < w / 2 + radius && Math.abs(z - bz) < d / 2 + radius,
  );
}

function spawnPoint(player, generation = generations[player]) {
  const index = (player + 2 * generation) % map.spawns.length;
  const [x, z] = map.spawns[index];
  return new T.Vector3(x, eyeHeight, z);
}

function spawnLocal(player) {
  const point = spawnPoint(player);
  position.copy(point);
  camera.position.copy(point);
  camera.rotation.set(0, Math.atan2(point.x, point.z), 0, "YXZ");
  ammo = capacity;
  reloadAt = 0;
  nextShot = 0;
  hurt = 0;
}

function audioStart() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    if (!audio) {
      audio = new Audio();
      soundBuffer = audio.createBuffer(
        1,
        Math.round(audio.sampleRate * 0.12),
        audio.sampleRate,
      );
      const samples = soundBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 2.8);
    }
    audio.resume().catch(() => {});
  } catch {}
}

function sound(shot) {
  if (!audio) return;
  const gain = audio.createGain();
  gain.connect(audio.destination);
  if (shot) {
    gain.gain.value = 0.18;
    const source = audio.createBufferSource();
    source.buffer = soundBuffer;
    source.connect(gain);
    source.start();
  } else {
    const source = audio.createOscillator();
    source.frequency.value = 530;
    gain.gain.setValueAtTime(0.065, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.14);
    source.connect(gain);
    source.start();
    source.stop(audio.currentTime + 0.14);
  }
}

function tracer(origin, dir, shade = map.accent) {
  ray.set(origin, dir);
  ray.near = 0.03;
  ray.far = 46;
  const obstruction = ray.intersectObjects(cover)[0];
  const end = origin
    .clone()
    .addScaledVector(dir, Math.min(43, obstruction?.distance ?? 43));
  const start = origin.clone().addScaledVector(dir, 0.5);
  start.y -= 0.13;
  const line = new T.Line(
    new T.BufferGeometry().setFromPoints([start, end]),
    new T.LineBasicMaterial({ color: shade, transparent: true, opacity: 0.76 }),
  );
  scene.add(line);
  traces.push({ line, expires: performance.now() + 95 });
}

function send(data) {
  handle?.send(data);
}

const me = () => (isHost ? 0 : 1);
const opponentIndex = () => 1 - me();

function updateHud() {
  $("mine").textContent = scores[me()];
  $("theirs").textContent = scores[opponentIndex()];
  $("hp").textContent = hp[me()];
  $("ammo").textContent = ammo;
  $("clock").textContent =
    String(Math.floor(displaySeconds / 60)).padStart(2, "0") +
    ":" +
    String(displaySeconds % 60).padStart(2, "0");
  $("alert").textContent = reloadAt ? "재장전 중…" : "";
}

function roomStatus(message) {
  $("status").textContent = message;
}

function renderLobby() {
  const inRoom = Boolean(handle);
  const pending = phase === "connecting";
  const game = phase === "game";
  $("title").textContent =
    phase === "result"
      ? scores[me()] === scores[opponentIndex()]
        ? "무승부"
        : scores[me()] > scores[opponentIndex()]
          ? "승리"
          : "패배"
      : map.title;
  $("subtitle").textContent =
    phase === "result"
      ? scores[me()] + " : " + scores[opponentIndex()] + " · 대전 종료"
      : map.subtitle;
  $("setup").hidden = inRoom || pending || game || phase === "result";
  $("share").hidden =
    !inRoom || !isHost || verified || pending || phase !== "lobby";
  $("leave").hidden = !inRoom && !pending;
  $("ready").hidden = !verified || localReady || phase !== "lobby";
  $("resume").hidden = !game || aiming;
  $("overlay").hidden = game && aiming;
  $("hud").hidden = !game;
}

function releaseMouse() {
  aiming = false;
  held = false;
  controls.clear();
  if (document.pointerLockElement === view) document.exitPointerLock?.();
}

function leaveRoom(message = "친구와 최대 3분간 대전 · 5점 선승") {
  ++session;
  handle?.close();
  handle = undefined;
  localReady = remoteReady = verified = transportOpen = false;
  fallback = false;
  phase = "lobby";
  releaseMouse();
  opponent.visible = false;
  roomStatus(message);
  renderLobby();
}

function acquireMouse() {
  fallback = false;
  aiming = true;
  audioStart();
  renderLobby();
  try {
    const request = view.requestPointerLock?.();
    if (!view.requestPointerLock) fallback = true;
    request?.catch(() => {
      fallback = true;
    });
  } catch {
    fallback = true;
  }
}

function startMatch() {
  if (phase !== "lobby" || !verified || !localReady) return;
  phase = "game";
  hp.fill(100);
  scores.fill(0);
  generations.fill(0);
  displaySeconds = maxTime;
  lastReceivedShot = shotNumber = lastGuestShotAt = 0;
  packetAt = statusAt = 0;
  sentPose = undefined;
  matchStart = performance.now();
  safeUntil.fill(matchStart + 250);
  spawnLocal(me());
  remotePosition.copy(spawnPoint(opponentIndex()));
  opponentTarget.copy(remotePosition);
  opponent.position.set(remotePosition.x, 0, remotePosition.z);
  opponent.visible = true;
  roomStatus("대전은 계속 진행 중입니다.");
  renderLobby();
}

function finishMatch() {
  if (phase !== "game") return;
  phase = "result";
  releaseMouse();
  opponent.visible = false;
  roomStatus("다시 대전하려면 새 방을 만들거나 참가하세요.");
  updateHud();
  renderLobby();
}

function sendStatus(over = false) {
  send({
    kind: "status",
    hp: [...hp],
    scores: [...scores],
    gen: [...generations],
    seconds: displaySeconds,
    over,
  });
}

function attemptStart() {
  if (!isHost || !localReady || !remoteReady || !verified || phase !== "lobby")
    return;
  send({ kind: "start" });
  startMatch();
}

function markReady() {
  if (!verified || localReady || phase !== "lobby") return;
  localReady = true;
  send({ kind: "ready" });
  roomStatus("준비 완료 · 친구를 기다리는 중…");
  acquireMouse();
  attemptStart();
}

function signalReady() {
  if (!transportOpen) return;
  send({ kind: "hello", map: mapId });
}

function receive(data) {
  if (!data || typeof data !== "object") return;
  if (data.kind === "hello") {
    if (data.map !== mapId) {
      leaveRoom("다른 게임의 방입니다. 받은 초대 링크로 다시 열어 주세요.");
      return;
    }
    if (!verified) {
      verified = true;
      signalReady();
      if (phase === "connecting") phase = "lobby";
      roomStatus("친구가 연결됐습니다. 두 사람 모두 대전 준비를 눌러 주세요.");
      renderLobby();
    }
    return;
  }
  if (!verified) return;
  if (data.kind === "ready") {
    remoteReady = true;
    attemptStart();
    return;
  }
  if (data.kind === "start" && !isHost) {
    startMatch();
    return;
  }
  if (phase !== "game") return;
  if (
    data.kind === "position" &&
    data.gen === generations[opponentIndex()] &&
    Number.isFinite(data.x) &&
    Number.isFinite(data.z) &&
    Number.isFinite(data.yaw) &&
    free(data.x, data.z, 0.22)
  ) {
    remotePosition.set(data.x, eyeHeight, data.z);
    opponentTarget.copy(remotePosition);
    opponent.rotation.y = data.yaw + Math.PI;
    return;
  }
  if (
    data.kind === "shot" &&
    Number.isInteger(data.seq) &&
    data.seq > lastReceivedShot &&
    data.gen === generations[opponentIndex()] &&
    Number.isFinite(data.dx) &&
    Number.isFinite(data.dy) &&
    Number.isFinite(data.dz)
  ) {
    lastReceivedShot = data.seq;
    const dir = new T.Vector3(data.dx, data.dy, data.dz);
    if (dir.lengthSq() < 0.8 || dir.lengthSq() > 1.2) return;
    dir.normalize();
    tracer(remotePosition, dir, 0xf78769);
    if (isHost) adjudicate(1, remotePosition, dir);
    return;
  }
  if (data.kind === "hit" && !isHost) {
    hitUntil = performance.now() + 140;
    sound(false);
    return;
  }
  if (
    data.kind === "status" &&
    !isHost &&
    [data.hp, data.scores, data.gen].every(
      (values) =>
        Array.isArray(values) &&
        values.length === 2 &&
        values.every(Number.isFinite),
    ) &&
    Number.isFinite(data.seconds)
  ) {
    if (data.hp[me()] < hp[me()] || data.gen[me()] > generations[me()])
      hurt = 1;
    for (let i = 0; i < 2; i++) {
      const respawn = data.gen[i] > generations[i];
      generations[i] = data.gen[i];
      scores[i] = data.scores[i];
      hp[i] = data.hp[i];
      if (!respawn) continue;
      if (i === me()) spawnLocal(me());
      else resetOpponent();
    }
    displaySeconds = data.seconds;
    if (data.over) finishMatch();
  }
}

let lastGuestShotAt = 0;
function resetOpponent() {
  remotePosition.copy(spawnPoint(opponentIndex()));
  opponentTarget.copy(remotePosition);
  opponent.position.set(remotePosition.x, 0, remotePosition.z);
}

function adjudicate(shooter, origin, dir) {
  const target = 1 - shooter;
  const now = performance.now();
  if (shooter === 1) {
    if (now - lastGuestShotAt < 85) return;
    lastGuestShotAt = now;
  }
  if (now < safeUntil[target]) return;
  const point = target === 0 ? position : remotePosition;
  const body = new T.Box3(
    new T.Vector3(point.x - 0.34, 0.4, point.z - 0.34),
    new T.Vector3(point.x + 0.34, 1.91, point.z + 0.34),
  );
  ray.set(origin, dir);
  ray.near = 0.04;
  ray.far = 44;
  const hitPoint = ray.ray.intersectBox(body, new T.Vector3());
  if (!hitPoint) return;
  const distance = hitPoint.distanceTo(origin);
  if (distance > 44 || ray.intersectObjects(cover)[0]?.distance < distance)
    return;
  if (shooter === 0) {
    hitUntil = now + 140;
    sound(false);
  } else send({ kind: "hit" });
  hp[target] = Math.max(0, hp[target] - 34);
  if (target === 0) hurt = 1;
  if (!hp[target]) {
    scores[shooter]++;
    if (scores[shooter] >= maxPoints) {
      sendStatus(true);
      finishMatch();
      return;
    }
    generations[target]++;
    hp[target] = 100;
    safeUntil[target] = now + 1200;
    if (target === 0) spawnLocal(0);
    else resetOpponent();
  }
  sendStatus();
}

function shoot(now) {
  if (phase !== "game" || !aiming || reloadAt || now < nextShot) return;
  if (!ammo) {
    reload();
    return;
  }
  ammo--;
  recoil = 1;
  nextShot = now + 205;
  camera.getWorldDirection(direction);
  tracer(position, direction);
  sound(true);
  send({
    kind: "shot",
    seq: ++shotNumber,
    gen: generations[me()],
    dx: direction.x,
    dy: direction.y,
    dz: direction.z,
  });
  if (isHost) adjudicate(0, position, direction);
}

function reload() {
  if (phase === "game" && aiming && ammo < capacity && !reloadAt)
    reloadAt = performance.now() + 840;
}

async function connect(hosting, code) {
  if (!renderer || phase !== "lobby" || handle) return;
  const attempt = ++session;
  phase = "connecting";
  isHost = hosting;
  roomStatus(hosting ? "방을 만드는 중…" : "친구 방을 찾는 중…");
  renderLobby();
  const callbacks = {
    onReady() {
      if (session !== attempt) return;
      transportOpen = true;
      signalReady();
    },
    onMessage(data) {
      if (session === attempt) receive(data);
    },
    onDisconnect() {
      if (session === attempt) leaveRoom("친구와의 연결이 종료됐습니다.");
    },
    onError(error) {
      if (session === attempt && phase !== "game")
        leaveRoom(error?.message || "연결에 문제가 생겼습니다.");
    },
  };
  try {
    const room = hosting
      ? await hostRoom(callbacks)
      : await joinRoom(code, callbacks);
    if (session !== attempt) {
      room.close();
      return;
    }
    handle = room;
    $("room-code").textContent = room.code;
    if (hosting) {
      phase = "lobby";
      if (!verified) roomStatus("초대 링크나 방 코드를 친구에게 보내세요.");
    } else if (!verified) {
      setTimeout(() => {
        if (session === attempt && !verified)
          leaveRoom(
            "친구와 연결하지 못했습니다. 방 코드와 인터넷 연결을 확인하세요.",
          );
      }, 22000);
    }
    signalReady();
    renderLobby();
  } catch (error) {
    if (session === attempt)
      leaveRoom(error?.message || "방에 연결하지 못했습니다.");
  }
}

$("create").addEventListener("click", () => connect(true));
$("join").addEventListener("submit", (event) => {
  event.preventDefault();
  connect(false, $("code").value);
});
$("ready").addEventListener("click", markReady);
$("resume").addEventListener("click", acquireMouse);
$("leave").addEventListener("click", () => leaveRoom());
$("copy").addEventListener("click", async () => {
  if (!handle) return;
  const url = new URL(location.href);
  url.search = new URLSearchParams({ map: mapId, room: handle.code });
  try {
    await navigator.clipboard.writeText(url.href);
    roomStatus("초대 링크를 복사했습니다.");
  } catch {
    roomStatus("방 코드 " + handle.code + "를 친구에게 보내세요.");
  }
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === view) {
    aiming = true;
    fallback = false;
  } else if (!fallback) {
    aiming = false;
    held = false;
    controls.clear();
  }
  renderLobby();
});
document.addEventListener("pointerlockerror", () => {
  if (aiming) fallback = true;
});
window.addEventListener("blur", () => {
  held = false;
  controls.clear();
});
window.addEventListener("keydown", (event) => {
  if (!aiming || phase !== "game") return;
  if (event.code === "Escape") {
    fallback = false;
    releaseMouse();
    renderLobby();
    return;
  }
  controls.add(event.code);
  if (event.code === "KeyR" && !event.repeat) reload();
});
window.addEventListener("keyup", (event) => controls.delete(event.code));
document.addEventListener("mousemove", (event) => {
  if (
    phase !== "game" ||
    !aiming ||
    (document.pointerLockElement !== view && !fallback)
  )
    return;
  camera.rotation.y -= event.movementX * 0.00225;
  camera.rotation.x = T.MathUtils.clamp(
    camera.rotation.x - event.movementY * 0.00225,
    -1.36,
    1.36,
  );
});
view.addEventListener("mousedown", (event) => {
  if (phase === "game" && aiming && event.button === 0) {
    held = true;
    shoot(performance.now());
  }
});
window.addEventListener("mouseup", () => {
  held = false;
});
window.addEventListener("pagehide", () => handle?.close());

function resize() {
  renderer.setSize(view.clientWidth, view.clientHeight, false);
  camera.aspect = view.clientWidth / Math.max(1, view.clientHeight);
  camera.updateProjectionMatrix();
}

function updateGame(now, dt) {
  const x = Number(controls.has("KeyD")) - Number(controls.has("KeyA"));
  const z = Number(controls.has("KeyW")) - Number(controls.has("KeyS"));
  if (aiming && (x || z)) {
    const angle = camera.rotation.y;
    const speed = (5.2 * dt) / Math.hypot(x, z);
    const dx = (x * Math.cos(angle) - z * Math.sin(angle)) * speed;
    const dz = (-x * Math.sin(angle) - z * Math.cos(angle)) * speed;
    if (free(position.x + dx, position.z)) position.x += dx;
    if (free(position.x, position.z + dz)) position.z += dz;
  }
  camera.position.copy(position);
  opponent.position.x = T.MathUtils.lerp(
    opponent.position.x,
    opponentTarget.x,
    Math.min(1, dt * 16),
  );
  opponent.position.z = T.MathUtils.lerp(
    opponent.position.z,
    opponentTarget.z,
    Math.min(1, dt * 16),
  );
  if (isHost) {
    displaySeconds = Math.max(
      0,
      Math.ceil(maxTime - (now - matchStart) / 1000),
    );
    if (!displaySeconds) {
      sendStatus(true);
      finishMatch();
      return;
    }
  }
  if (now >= packetAt) {
    const pose = {
      kind: "position",
      x: position.x,
      z: position.z,
      yaw: camera.rotation.y,
      gen: generations[me()],
    };
    if (
      !sentPose ||
      sentPose.x !== pose.x ||
      sentPose.z !== pose.z ||
      sentPose.yaw !== pose.yaw ||
      sentPose.gen !== pose.gen
    ) {
      send(pose);
      sentPose = pose;
    }
    packetAt = now + 95;
  }
  if (isHost && now >= statusAt) {
    sendStatus();
    statusAt = now + 480;
  }
  if (held) shoot(now);
  if (reloadAt && now >= reloadAt) {
    ammo = capacity;
    reloadAt = 0;
  }
  recoil = Math.max(0, recoil - dt * 5.8);
  hurt = Math.max(0, hurt - dt * 2.4);
  gun.position.z = -0.36 + recoil * 0.13;
  gun.rotation.x = recoil * 0.13 + (reloadAt ? -0.34 : 0);
  $("damage").style.opacity = String(hurt * 0.65);
  $("crosshair").classList.toggle("hit", now < hitUntil);
  updateHud();
}

function render(now) {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  if (phase === "game") updateGame(now, dt);
  else {
    camera.position.set(1.18, 2.48, 10.8 + Math.sin(now * 0.00043) * 0.48);
    camera.lookAt(-0.65, 1.27, -8);
    $("damage").style.opacity = "0";
  }
  gun.visible = phase === "game";
  while (traces.length && traces[0].expires < now) {
    const { line } = traces.shift();
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

try {
  renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  view.append(renderer.domElement);
  buildWorld();
  buildOpponent();
  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(render);
  if (
    matchMedia("(pointer: coarse)").matches &&
    !matchMedia("(any-pointer: fine)").matches
  ) {
    $("create").disabled = true;
    $("join").querySelector("button").disabled = true;
    roomStatus("키보드와 마우스가 연결된 기기에서 플레이하세요.");
  }
} catch (error) {
  renderer = undefined;
  $("create").disabled = true;
  $("join").querySelector("button").disabled = true;
  roomStatus("WebGL을 지원하는 브라우저에서 다시 열어 주세요.");
  console.error(error);
}
