import { renderPixelRatio } from '../shared/render-budget.ts';
import './style-polish.css';
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { modelBytes } from "./assets.js";
import { chapters, makeLevel, neighbors, paths, routeFrom, lineOpen, normalizeSave, walkable, puzzleOptions, puzzleCorrect } from "./levels.mjs";
import { buildEnvironment } from "./environment.js";
import { Sound } from "./sound.js";
import { archiveCells, cleanArchive, createDread, recordings } from "./dread.mjs";
import { openViewer, closeViewer } from "./viewer.js";
import { enemyPerception, cellDistance, patrolGoal } from "./perception.mjs";
import { createRoomStorage } from "./storage.mjs";

const $ = (id) => document.getElementById(id),
  C = 2.7,
  SAVE = "waldo.rt03.campaign.v1",
  LAST = "waldo.rt03.complete.v1";
const sound = new Sound(),
  keys = new Set(),
  pointer = { x: 0, y: 0 };
let state = "home",
  ch = 0,
  level,
  items = [],
  solved = false,
  found = [false, false, false],
  seen = new Set(),
  elapsed = 0;
let archive = [], dread = createDread(), enemyStepDistance = 0;
let acousticCell = -1, acousticTree = null, patrolTarget = -1;
let renderer,
  scene,
  camera,
  lamp,
  beam,
  model,
  mixer,
  gait = [],
  stride = 0,
  gaitWeight = 0,
  entity,
  environment,
  props,
  player = new THREE.Vector3(),
  yaw = 0,
  pitch = 0;
let moved = 0,
  stepAt = 0,
  path = [],
  nextPath = 0,
  lastKnown = -1,
  grace = 0,
  enemyPhase = 0,
  stamina = 1,
  winded = false,
  crouched = false,
  eyeHeight = 1.58,
  lightOn = true,
  muted = false;
let now = 0,
  last = 0,
  frameStarted = false,
  frameId = null,
  sceneDirty = true,
  contextLost = false,
  nearest = null,
  moveId = -1,
  lookId = -1,
  moveStart = null,
  lookLast = null,
  mobileRun = false,
  runId = -1;
let noticeUntil = 0,
  saveAt = 0,
  lastCell = -1,
  choices = [],
  response = "",
  opening = false;
const roomStorage = createRoomStorage(() => localStorage);
let savePersistent = true;
let guidance = read("rt-guidance") === true;
let guidePath = [];
let returnFromMap = resume;
const touch =
  matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const savedControls = read("rt-controls");
let sensitivity = Number.isFinite(savedControls?.sensitivity)
  ? Math.max(.5, Math.min(2, savedControls.sensitivity)) : 1;
let cameraMotion = savedControls?.cameraMotion !== false;
const motionAllowed = () => cameraMotion && !reducedMotion.matches;
function persistControls() {
  $("viewWrap").dataset.motion = cameraMotion ? "normal" : "reduced";
  try { localStorage.setItem("rt-controls", JSON.stringify({ sensitivity, cameraMotion })); } catch { /* Session settings still apply. */ }
}
$("viewWrap").dataset.motion = cameraMotion ? "normal" : "reduced";
let lastPointerType = matchMedia("(pointer:coarse)").matches ? "touch" : "mouse";
let draggingLook = false;
let lookTravel = 0;
const px = (t) => String(t).padStart(2, "0");
const clock = (t) => px(Math.floor(t / 60)) + ":" + px(Math.floor(t % 60));
const pad = (i) => String(i + 1).padStart(2, "0");
const total = () => found.filter(Boolean).length;
function read(k) {
  return roomStorage.read(k);
}
function saved() {
  const raw = read(SAVE), normalized = normalizeSave(raw);
  return normalized ? { ...normalized, archive: cleanArchive(raw.archive) } : null;
}
function save() {
  savePersistent = roomStorage.write(SAVE, { v: 1, ch, found, solved, seen: [...seen], elapsed, archive });
}
function toggleAudio() {
  muted = !muted;
  sound.setMute(muted);
  try {
    localStorage.setItem("rt-silent", JSON.stringify(muted));
  } catch { /* Browser storage or pointer lock is optional. */ }
  for (const b of [$("sound"), $("gsound")]) {
    b.setAttribute("aria-pressed", String(!muted));
    b.querySelector("span").textContent = muted ? "소리 꺼짐" : "소리 켜짐";
  }
}
muted = read("rt-silent") !== true;
toggleAudio();
$("sound").onclick = $("gsound").onclick = toggleAudio;
function screens(id) {
  if (id !== "viewer") closeViewer();
  for (const key of ["home", "game", "viewer"]) $(key).hidden = key !== id;
  if (id !== "game" && frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
  scheduleFrame();
}
function homepage() {
  state = "home";
  leaveLook();
  sound.pause(true);
  screens("home");
  setGameModal(false);
  const s = saved();
  $("continue").hidden = !s;
  $("new").textContent = s ? "처음부터" : "게임 시작";
  $("continue").textContent = s
    ? "이어하기 · " + pad(s.ch) + "구역"
    : "이어하기";
  const completion = read(LAST);
  const summary = Number.isFinite(completion?.elapsed) && completion.elapsed >= 0
    ? "최근 탈출 기록  " + clock(completion.elapsed) : "";
  const best = Number.isFinite(completion?.best) && completion.best >= 0
    ? " · 최고 기록 " + clock(completion.best) : "";
  $("completion").textContent = (summary ? summary + best : "") +
    (!savePersistent ? (summary ? " · " : "") + "저장소를 사용할 수 없어 이 탭에서만 이어갈 수 있습니다." : "");
}
$("inspect").onclick = () => {
  screens("viewer");
  openViewer();
};
$("back").onclick = homepage;
function clearInputs() {
  // Clear IDs before releasing capture: lostpointercapture can fire during cleanup.
  const captures = [[$("stick"), moveId], [renderer?.domElement ?? $("viewWrap"), lookId], [$("run"), runId]];
  keys.clear();
  pointer.x = pointer.y = 0;
  moveId = lookId = runId = -1;
  for (const [el, id] of captures) {
    if (id !== -1 && el.hasPointerCapture?.(id)) {
      try { el.releasePointerCapture(id); } catch { /* Pointer already ended. */ }
    }
  }
  moveStart = lookLast = null;
  draggingLook = false;
  lookTravel = 0;
  mobileRun = false;
  $("stickknob").style.transform = "";
}
function leaveLook() {
  clearInputs();
  if (document.pointerLockElement === renderer?.domElement) {
    hadPointerLock = false;
    document.exitPointerLock();
  }
}
function lockLook() {
  if (state !== "play" || lastPointerType === "touch" || !renderer || document.pointerLockElement || lookId !== -1) return;
  try {
    const p = renderer.domElement.requestPointerLock?.();
    p?.catch(() => {});
  } catch { /* Browser storage or pointer lock is optional. */ }
}
function message(msg, sec = 3.2) {
  $("toast").textContent = msg;
  noticeUntil = now + sec;
}
function setGameModal(open) {
  $("dialog").hidden = !open;
  for (const child of $("game").children) {
    if (child.id !== "dialog") child.inert = open;
  }
}
function modal(title, description, body, actions, type = "panel") {
  state = type;
  leaveLook();
  sound.pause(true, type === "lost" || type === "won" ? 0.85 : 0);
  setGameModal(true);
  $("panelTitle").textContent = title;
  $("panelText").textContent = description;
  $("panelBody").replaceChildren();
  $("panelActions").replaceChildren();
  if (body) body($("panelBody"));
  for (const [label, fn, secondary] of actions) {
    const b = document.createElement("button");
    b.className = secondary ? "secondary" : "primary";
    b.textContent = label;
    b.onclick = fn;
    $("panelActions").append(b);
  }
  $("panelTitle").focus({ preventScroll: true });
  scheduleFrame();
}
function resume() {
  state = "play";
  setGameModal(false);
  sound.pause(false);
  void sound.start(); // Recover audio suspended by the browser while paused.
  lockLook();
  last = performance.now();
  now = last / 1000;
  scheduleFrame();
  $("viewWrap").focus({ preventScroll: true });
}
function guide(fromHome = false) {
  if (fromHome) {
    $("how").showModal();
    return;
  }
  modal(
    "조작 안내",
    "숙이면 발소리가 줄어듭니다. 모퉁이를 돌아 시야를 끊고, 추격이 멈출 때까지 기다리세요.",
    (el) => {
      el.innerHTML = $("guideText").innerHTML;
    },
    [["돌아가기", pauseMenu]],
    "help",
  );
}
$("help").onclick = () => guide(true);
$("howclose").onclick = () => $("how").close();
$("new").onclick = () => {
  if (saved()) {
    $("restartAsk").showModal();
  } else start(false);
};
$("cancelReset").onclick = () => $("restartAsk").close();
$("confirmReset").onclick = () => {
  $("restartAsk").close();
  start(false);
};
$("continue").onclick = () => start(true);
function pauseGame() {
  if (state !== "play") return;
  save();
  pauseMenu();
}
function pauseMenu() {
  modal(
    "녹음 일시정지",
    chapters[ch].location + " · " + clock(elapsed),
    null,
    [
      ["계속하기", resume],
      ["녹음 기록 " + archive.length + " / 8", archivePanel],
      ["조작 안내", () => guide()],
      ["조작 설정", settingsPanel],
      ["타이틀로", homepage, true],
    ],
    "pause",
  );
}
$("pauseGame").onclick = pauseGame;
function settingsPanel() {
  modal("조작 설정", "시점 감도와 화면 효과를 조절하세요. 설정은 이 기기에 저장됩니다.", el => {
    const settings = document.createElement("div");
    settings.className = "control-settings";
    const row = document.createElement("label");
    const heading = document.createElement("span");
    heading.textContent = "시점 감도";
    const value = document.createElement("output");
    value.textContent = Math.round(sensitivity * 100) + "%";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "50";
    slider.max = "200";
    slider.step = "5";
    slider.value = String(Math.round(sensitivity * 100));
    slider.setAttribute("aria-label", "시점 감도");
    slider.oninput = () => {
      sensitivity = Number(slider.value) / 100;
      value.textContent = slider.value + "%";
      persistControls();
    };
    row.append(heading, value, slider);
    const motionRow = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = cameraMotion;
    check.onchange = () => { cameraMotion = check.checked; persistControls(); };
    motionRow.append(check, document.createTextNode("카메라 흔들림 및 밝기 변화"));
    const hint = document.createElement("p");
    hint.textContent = reducedMotion.matches ? "기기의 동작 줄이기 설정이 우선 적용됩니다." :
      "화면 움직임이 불편하면 이 옵션을 끄세요.";
    settings.append(row, motionRow, hint);
    el.append(settings);
  }, [["돌아가기", pauseMenu], ["기본값 복원", () => {
    sensitivity = 1;
    cameraMotion = true;
    persistControls();
    settingsPanel();
  }, true]], "settings");
}
async function setup() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(renderPixelRatio(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, touch ? 1.35 : 1.65), touch ? 'standard' : 'high'));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    $("viewWrap").prepend(renderer.domElement);
    $("viewWrap").addEventListener("click", (e) => {
      if (state === "play" && e.target === renderer.domElement && !draggingLook) lockLook();
      draggingLook = false;
    });
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      contextLost = true;
      if (state === "home" || state === "won") return;
      if (level && state !== "load") save();
      modal(
        "그래픽 연결이 끊겼습니다",
        "브라우저를 새로고침하면 저장한 구역에서 이어갈 수 있습니다.",
        null,
        [["다시 불러오기", () => location.reload()]],
        "error",
      );
    });
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      contextLost = false;
      sceneDirty = true;
      scheduleFrame();
    });
  }
  if (contextLost) throw new Error("WebGL context is unavailable");
  if (!model) {
    const gltf = await new GLTFLoader().parseAsync(await modelBytes(), "");
    model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
    model.updateMatrixWorld(true);
    // Convert the character's cross-body axis into each joint's rest space.
    // The idle animation still drives the head and the breathing chest.
    for (const side of ["L", "R"]) {
      for (const [name, amplitude, offset] of [
        ["Thigh", 0.30, 0], ["Shin", -0.27, 0.9], ["UpperArm", -0.13, 0],
      ]) {
        const bone = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name + "." + side));
        if (!bone) continue;
        const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(
          bone.getWorldQuaternion(new THREE.Quaternion()).invert()
        );
        gait.push({bone, rest: bone.quaternion.clone(), axis, amplitude,
          offset: offset + (side === "L" ? 0 : Math.PI), knee: name === "Shin"});
      }
    }
    mixer = new THREE.AnimationMixer(model);
    if (gltf.animations.length) mixer.clipAction(gltf.animations[0]).play();
  }
  frameStarted = true;
  scheduleFrame();
}
function xy(cell) {
  return { x: (cell % level.w) * C, z: Math.floor(cell / level.w) * C };
}
function cellOf(v) {
  return Math.round(v.z / C) * level.w + Math.round(v.x / C);
}
function pass(x, z) {
  const col = Math.floor(x / C + 0.5),
    row = Math.floor(z / C + 0.5);
  return level.map[row]?.[col] === ".";
}
function clearLine(a, b) {
  return lineOpen(level.map, a, b, C);
}
function shift(dx, dz) {
  const r = 0.285; // Clearance from shallow wall equipment and corner trim.
  function space(x, z) {
    return (
      pass(x - r, z - r) &&
      pass(x + r, z - r) &&
      pass(x - r, z + r) &&
      pass(x + r, z + r)
    );
  }
  if (space(player.x + dx, player.z)) player.x += dx;
  if (space(player.x, player.z + dz)) player.z += dz;
}
function pointPlayer() {
  dread = createDread(Math.random, ch);
  enemyStepDistance = 0;
  acousticCell = -1;
  acousticTree = null;
  patrolTarget = -1;
  entity.rotation.y = 0;
  $("viewWrap").removeAttribute("data-incident");
  lamp.intensity = 28;
  lamp.visible = true;
  beam.intensity = 2;
  const p = xy(level.start);
  const next = xy(neighbors(level.map, level.start)[0]);
  player.set(p.x + (next.x - p.x) * 0.38, 1.58, p.z + (next.z - p.z) * 0.38);
  yaw = Math.atan2(-(next.x - p.x), -(next.z - p.z));
  pitch = 0;
  camera.rotation.set(0, yaw, 0, "YXZ");
  camera.position.copy(player);
  sceneDirty = true;
  stamina = 1;
  winded = false;
  crouched = false;
  eyeHeight = 1.58;
  lightOn = true;
  const far = xy(level.nest);
  entity.position.set(far.x, 0, far.z);
  path = [];
  nextPath = 0;
  lastKnown = -1;
  grace = 22;
  enemyPhase = 0;
  lastCell = -1;
  nearest = null;
  stepAt = moved = stride = gaitWeight = 0;
  noticeUntil = 0;
  $("toast").textContent = "";
  $("danger").style.opacity = "0";
  $("strain").textContent = "안정";
  $("strain").dataset.threat = "safe";
  $("stamina").style.transform = "scaleX(1)";
  $("stamina").classList.remove("winded");
  $("stamina").parentElement.setAttribute("aria-valuenow", "100");
  $("timer").textContent = clock(elapsed);
  sound.threat(0);
  $("prompt").hidden = true;
  $("act").disabled = true;
  clearInputs();
}
function resize() {
  if (!renderer || !camera) return;
  const w = $("viewWrap").clientWidth,
    h = $("viewWrap").clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const ratio = renderPixelRatio(w, h, Math.min(devicePixelRatio || 1, touch ? 1.35 : 1.65), touch ? 'standard' : 'high');
  if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  sceneDirty = true;
  scheduleFrame();
}
window.addEventListener("resize", resize);
function disposeGroup(root) {
  if (!root) return;
  const geo = new Set(),
    mat = new Set(),
    tex = new Set();
  root.traverse((o) => {
    if (o.geometry) geo.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      if (m) {
        mat.add(m);
        if (m.map) tex.add(m.map);
      }
  });
  geo.forEach((g) => g.dispose());
  mat.forEach((m) => m.dispose());
  tex.forEach((t) => t.dispose());
  root.removeFromParent();
}
function mesh(geo, mat, root, x, y, z) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  root.add(o);
  return o;
}
function paint(color, em = 0, emStrength = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: em,
    emissiveIntensity: emStrength,
    roughness: 0.69,
    metalness: 0.23,
  });
}
function label(text, color = "#f1cb86") {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const c = cv.getContext("2d");
  c.fillStyle = "#161e1c";
  c.fillRect(0, 0, 512, 128);
  c.strokeStyle = color;
  c.lineWidth = 4;
  c.strokeRect(5, 5, 502, 118);
  c.fillStyle = color;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "bold 43px sans-serif";
  c.fillText(text, 256, 67, 480);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tx, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.05, 0.263, 1);
  return sprite;
}
function prop(cell, type, i = 0) {
  const root = new THREE.Group(),
    pos = xy(cell);
  root.position.set(pos.x, 0, pos.z);
  props.add(root);
  const col =
      type === "exit" ? 0x91d6a8 : type === "station" ? 0x9ce1db : type === "record" ? 0xc9a5df : 0xf1ab63,
    bright = paint(col, col, 0.72),
    dark = paint(0x26332f),
    steel = paint(0x718078);
  // The central pedestal is reachable from every side of a tile.
  if (type === "item") {
    mesh(new THREE.BoxGeometry(0.62, 0.58, 0.4), dark, root, 0, 0.29, 0);
    mesh(new THREE.BoxGeometry(0.72, 0.06, 0.49), steel, root, 0, 0.61, 0);
    const unit = new THREE.Group();
    root.add(unit);
    unit.position.y = 0.84;
    root.userData.unit = unit;
    if (ch === 0) {
      const f = mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.36, 12),
        bright,
        unit,
        0,
        0,
        0,
      );
      f.rotation.z = Math.PI / 2;
      for (const x of [-0.17, 0.17]) {
        const cap = mesh(
          new THREE.CylinderGeometry(0.109, 0.109, 0.065, 12),
          steel,
          unit,
          x,
          0,
          0,
        );
        cap.rotation.z = Math.PI / 2;
      }
    } else if (ch === 2) {
      mesh(new THREE.BoxGeometry(0.42, 0.245, 0.055), bright, unit, 0, 0, 0);
      for (const x of [-0.107, 0.107]) {
        mesh(
          new THREE.TorusGeometry(0.05, 0.014, 7, 14),
          dark,
          unit,
          x,
          0,
          0.038,
        );
      }
    } else {
      mesh(new THREE.BoxGeometry(0.35, 0.265, 0.045), bright, unit, 0, 0, 0);
      for (let j = 0; j < 4; j++)
        mesh(
          new THREE.BoxGeometry(0.19 - j * 0.02, 0.01, 0.008),
          dark,
          unit,
          0,
          0.073 - j * 0.04,
          0.026,
        );
    }
  } else if (type === "record") {
    mesh(new THREE.BoxGeometry(.48,.64,.38),dark,root,0,.32,0);
    mesh(new THREE.BoxGeometry(.42,.065,.28),steel,root,0,.66,0);
    mesh(new THREE.BoxGeometry(.31,.12,.21),dark,root,0,.75,0);
    mesh(new THREE.BoxGeometry(.20,.026,.11),bright,root,0,.823,0);
    for(const x of [-.10,.10]) mesh(new THREE.CylinderGeometry(.058,.058,.018,12),steel,root,x,.827,.064);
  } else if (type === "station") {
    mesh(new THREE.BoxGeometry(0.8, 0.94, 0.48), dark, root, 0, 0.47, 0);
    const top = mesh(
      new THREE.BoxGeometry(0.92, 0.13, 0.55),
      steel,
      root,
      0,
      0.99,
      0,
    );
    top.rotation.x = -0.15;
    mesh(new THREE.BoxGeometry(0.58, 0.36, 0.16), dark, root, 0, 1.19, -0.14);
    mesh(new THREE.BoxGeometry(0.46, 0.25, 0.018), bright, root, 0, 1.2, -0.05);
    for (let k = 0; k < 5; k++)
      mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.045, 8),
        k === 3 ? bright : dark,
        root,
        (k - 2) * 0.12,
        1.08,
        0.13,
      );
  } else {
    mesh(new THREE.BoxGeometry(0.7, 0.83, 0.42), dark, root, 0, 0.42, 0);
    mesh(new THREE.BoxGeometry(0.52, 0.31, 0.32), steel, root, 0, 0.97, 0);
    mesh(new THREE.BoxGeometry(0.33, 0.1, 0.34), bright, root, 0, 1.02, 0);
  }
  // Thin floor markings make interactive equipment identifiable in low light.
  const footprint = type === "station" ? 0.58 : 0.48;
  for (const side of [-1, 1]) {
    mesh(new THREE.BoxGeometry(footprint * 2, .012, .025), bright, root, 0, .008, side * footprint);
    mesh(new THREE.BoxGeometry(.025, .012, footprint * 2), bright, root, side * footprint, .008, 0);
  }
  const sign = label(
    type === "item"
      ? chapters[ch].item + " " + pad(i)
      : type === "exit"
        ? "EXIT  /  출구"
        : type === "record" ? "REC / " + pad(ch * 2 + i) : chapters[ch].station,
    type === "exit" ? "#a7dcb7" : type === "station" ? "#a2ddd5" : type === "record" ? "#d5b6ed" : "#edba81",
  );
  sign.position.y = type === "record" ? 1.10 : type === "item" ? 1.39 : 1.64;
  root.add(sign);
  return { cell, type, i, root, bright };
}
function loadScene() {
  model.removeFromParent();
  if (environment?.userData?.dispose) environment.userData.dispose();
  else disposeGroup(environment);
  disposeGroup(props);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(
    [0x0b1311, 0x0b1119, 0x1b1110, 0x090f12][ch],
  );
  scene.fog = new THREE.FogExp2(scene.background, 0.067);
  camera = new THREE.PerspectiveCamera(68, 1, 0.045, 65);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xc0d4cf, 0x44413c, 0.63));
  const fill = new THREE.DirectionalLight(0xc6d2cd, 0.24);
  fill.position.set(4, 6, 2);
  scene.add(fill);
  lamp = new THREE.SpotLight(0xffeccc, 28, 24, 0.49, 0.57, 1.05);
  camera.add(lamp);
  lamp.position.set(0.16, -0.11, -0.12);
  lamp.target.position.set(0, 0, -7.5);
  camera.add(lamp.target);
  beam = new THREE.PointLight(0xc5dbcd, 2.0, 4.1, 1.3);
  camera.add(beam);
  environment = buildEnvironment(THREE, scene, level.map, C, ch);
  props = new THREE.Group();
  scene.add(props);
  items = level.items.map((cell, i) => prop(cell, "item", i));
  items.forEach((o) => (o.root.visible = !found[o.i]));
  items.push(prop(level.start, "station"), prop(level.exit, "exit"));
  archiveCells(level).forEach((cell,i)=>{
    const record=prop(cell,"record",i);
    record.root.visible=!archive.includes(ch*2+i);
    items.push(record);
  });
  entity = new THREE.Group();
  entity.add(model);
  scene.add(entity);
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  pointPlayer();
  resize();
  sound.ambience(ch);
  renderHUD();
}
async function start(cont) {
  if (opening) return;
  opening = true;
  screens("game");
  state = "load";
  setGameModal(true);
  $("panelTitle").textContent = "녹음실 연결 중";
  $("panelText").textContent = "공간과 캐릭터를 불러오고 있습니다.";
  $("panelBody").replaceChildren();
  $("panelActions").replaceChildren();
  try {
    await sound.start();
    sound.setMute(muted);
    await setup();
    const s = cont ? saved() : null;
    ch = s?.ch ?? 0;
    found = s?.found ?? [false, false, false];
    solved = s?.solved ?? false;
    elapsed = s?.elapsed ?? 0;
    archive = s?.archive ?? [];
    level = makeLevel(ch);
    seen = new Set((s?.seen || []).filter(id => walkable(level.map, id)));
    loadScene();
    save();
    brief();
  } catch (e) {
    console.error(e);
    modal(
      "게임을 열 수 없습니다",
      "WebGL 2를 지원하는 브라우저에서 하드웨어 가속을 켜고 다시 열어 주세요.",
      null,
      [["타이틀로", homepage]],
      "error",
    );
  } finally {
    opening = false;
  }
}
function brief() {
  modal(
    chapters[ch].title,
    chapters[ch].story,
    (el) => {
      el.innerHTML =
        '<p class="taskline">' +
        chapters[ch].goal +
        '</p><p class="hint">도면에서 장비와 출구 방향을 확인하세요. 구역마다 숨은 녹음 기록 2개가 있습니다. 진행 상황은 자동 저장됩니다.</p>';
    },
    [
      ["구역 진입", resume],
      ["도면 보기", () => mapPanel(true), true],
    ],
    "brief",
  );
}
function renderHUD() {
  const c = chapters[ch];
  $("zone").textContent = pad(ch) + " / " + c.location;
  $("objective").textContent = solved
    ? "출구 단말기를 작동하세요."
    : total() === 3
      ? c.station + "으로 돌아가세요."
      : c.item + " 회수  " + total() + " / 3";
  $("lightState").textContent = lightOn ? "켜짐" : "꺼짐";
  $("torch").setAttribute("aria-label", lightOn ? "손전등 끄기" : "손전등 켜기");
  for (const item of items) {
    if (item.type !== "exit") continue;
    const color = solved ? 0x91d6a8 : 0xe1a06c;
    item.bright.color.setHex(color);
    item.bright.emissive.setHex(color);
    item.bright.emissiveIntensity = solved ? 1.3 : 0.45;
  }
  $("torch").setAttribute("aria-pressed", String(lightOn));
  $("crouch").setAttribute("aria-pressed", String(crouched));
  refreshGuide();
}
function toggleLamp() {
  if (state !== "play") return;
  lightOn = !lightOn;
  renderHUD();
  message("손전등 " + (lightOn ? "켜짐" : "꺼짐"), 1);
}
$("torch").onclick = toggleLamp;
function toggleCrouch() {
  if (state !== "play") return;
  crouched = !crouched;
  $("crouch").setAttribute("aria-pressed", String(crouched));
}
$("crouch").onclick = toggleCrouch;

function refreshGuide() {
  $("guide").hidden = !guidance;
  if (!guidance) return;
  const cell = cellOf(player);
  const targets = solved
    ? [level.exit]
    : total() === 3
      ? [level.start]
      : level.items.filter((_, i) => !found[i]);
  // Compare distances along the corridors so walls don't make a distant target look close.
  const tree = paths(level.map, cell);
  let best = -1;
  for (const target of targets) {
    if (tree.dist[target] >= 0 && (best < 0 || tree.dist[target] < tree.dist[best])) best = target;
  }
  guidePath = best < 0 ? [] : routeFrom(tree, cell, best);
  const guideLabel = solved ? "출구" : total() === 3 ? chapters[ch].station : chapters[ch].item;
  $("guideTextLabel").textContent = guideLabel + (guidePath.length ? " 방향" : " 주변");
  drawGuide();
}
function drawGuide() {
  if (!guidance) return;
  const arrow = $("guideArrow");
  arrow.hidden = guidePath.length === 0;
  if (!guidePath.length) return;
  const next = xy(guidePath[0]);
  const angle = Math.atan2(next.x - player.x, -(next.z - player.z));
  arrow.style.transform = "rotate(" + (angle + yaw) + "rad)";

}
function toggleGuide() {
  guidance = !guidance;
  try {
    localStorage.setItem("rt-guidance", JSON.stringify(guidance));
  } catch { /* The preference applies for this session when storage is unavailable. */ }
  refreshGuide();
}
function drawMap(canvas) {
  const ctx = canvas.getContext("2d"),
    w = level.w,
    S = 14;
  canvas.width = canvas.height = w * S;
  ctx.fillStyle = "#0e1616";
  ctx.fillRect(0, 0, w * S, w * S);
  for (const id of level.reachable) {
    const x = id % w,
      z = Math.floor(id / w);
    ctx.fillStyle = seen.has(id) ? "#59726a" : "#283b36";
    ctx.fillRect(x * S, z * S, S, S);
  }
  if (guidance && guidePath.length) {
    ctx.beginPath();
    for (const [i, id] of [cellOf(player), ...guidePath].entries()) {
      const x = ((id % w) + 0.5) * S;
      const y = (Math.floor(id / w) + 0.5) * S;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#d8dba1";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  const dot = (id, color, shape) => {
    const x = ((id % w) + 0.5) * S,
      y = (Math.floor(id / w) + 0.5) * S;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (shape === "square") ctx.rect(x - 4, y - 4, 8, 8);
    else ctx.arc(x, y, 4.6, 0, Math.PI * 2);
    ctx.fill();
  };
  level.items.forEach((id, i) => {
    if (!found[i]) dot(id, "#e4a36d", "square");
  });
  for(const record of items) if(record.type==="record" && record.root.visible && seen.has(record.cell)) dot(record.cell,"#c9a5df","circle");
  dot(level.start, "#75c3ce", "square");
  dot(level.exit, solved ? "#9ad991" : "#f38e75", "square");
  const pos = cellOf(player),
    px = ((pos % w) + 0.5) * S,
    pz = (Math.floor(pos / w) + 0.5) * S;
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-yaw);
  ctx.fillStyle = "#fff4d4";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-5, 5);
  ctx.lineTo(5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function mapPanel(fromBrief = false) {
  if (!fromBrief && state !== "play") return;
  returnFromMap = fromBrief ? brief : resume;
  modal(
    "시설 도면",
    chapters[ch].location + " · " + chapters[ch].goal,
    (el) => {
      const can = document.createElement("canvas");
      can.className = "map";
      el.append(can);
      can.setAttribute("aria-label", "현재 위치와 목표를 표시한 시설 도면");
      drawMap(can);
      const p = document.createElement("p");
      p.className = "mapkey";
      p.innerHTML =
        "<i>▲ 현재 위치</i><i>■ 회수 장비</i><i>■ 제어 장치</i><i>" + (solved ? "■ 출구 열림" : "■ 출구 잠김") + "</i>";
      p.innerHTML += "<i>● 발견된 녹음 기록</i>";
      p.dataset.solved = String(solved);
      el.append(p);
      const button = document.createElement("button");
      button.className = "map-guide";
      function label() {
        button.textContent = guidance ? "길 안내 끄기" : "길 안내 켜기";
        button.setAttribute("aria-pressed", String(guidance));
      }
      button.onclick = () => {
        toggleGuide();
        label();
        drawMap(can);
      };
      label();
      el.append(button);
    },
    [["닫기", returnFromMap]],
    "map",
  );
}
$("mapBtn").onclick = () => mapPanel();
function archivePanel() {
  modal("회수한 녹음 기록","보조 기록 "+archive.length+" / 8 · 탈출에 필수는 아닙니다.",el=>{
    const list=document.createElement("div");
    list.className="record-archive";
    recordings.flat().forEach((entry,id)=>{
      const row=document.createElement("section"), heading=document.createElement("strong"), detail=document.createElement("p");
      heading.textContent=archive.includes(id)?entry.title:String(id+1).padStart(2,"0")+" / 미회수";
      detail.textContent=archive.includes(id)?entry.text:"신호 없음";
      row.dataset.found=String(archive.includes(id));
      row.append(heading,detail);list.append(row);
    });
    el.append(list);
  },[["돌아가기",pauseMenu]],"archive");
}
function notes(el) {
  const dl = document.createElement("dl");
  dl.className = "notes";
  for (let i = 0; i < 3; i++) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = chapters[ch].names[i];
    dd.textContent = found[i] ? chapters[ch].labels[i] : "미회수";
    dl.append(dt, dd);
  }
  el.append(dl);
}
function puzzle(reset = true) {
  if (reset) {
    choices = ch === 2 ? [] : [0, 0, 0];
    response = "";
  }
  const c = chapters[ch],
    descs = [
      "회수한 퓨즈의 정격에 맞춰 세 회로를 연결하세요.",
      "주파수표를 읽고 수신기 세 대의 다이얼을 맞추세요.",
      "녹음 시각이 늦은 릴부터 차례로 재생 헤드에 올리세요.",
      "각 마이크의 원래 위상에 180°를 더한 값으로 맞추세요. 360°는 0°입니다.",
    ];
  modal(
    c.station,
    descs[ch],
    (el) => {
      notes(el);
      if (ch === 2) {
        const row = document.createElement("div");
        row.className = "choiceRow";
        for (let i = 0; i < 3; i++) {
          const b = document.createElement("button");
          b.textContent = c.names[i];
          b.disabled = choices.includes(i);
          b.onclick = () => {
            choices.push(i);
            sound.tone(i);
            puzzle(false);
            const next = $("panelBody").querySelector(".choiceRow button:not(:disabled)") ?? $("panelActions").querySelector("button");
            next?.focus({ preventScroll: true });
          };
          row.append(b);
        }
        el.append(row);
        const seq = document.createElement("p");
        seq.className = "readout";
        seq.textContent =
          choices.map((i) => c.names[i]).join("  •  ") ||
          "릴 세 개를 순서대로 선택하세요.";
        el.append(seq);
      } else {
        const box = document.createElement("div");
        box.className = "dials";
        for (let i = 0; i < 3; i++) {
          const b = document.createElement("button");
          const opts = puzzleOptions(ch, i);
          b.innerHTML =
            "<small>" +
            c.names[i] +
            "</small><strong>" +
            opts[choices[i]] +
            "</strong>";
          b.onclick = () => {
            choices[i] = (choices[i] + 1) % opts.length;
            sound.tone(choices[i]);
            puzzle(false);
            $("panelBody").querySelectorAll(".dials button")[i]?.focus({ preventScroll: true });
          };
          box.append(b);
        }
        el.append(box);
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = "다이얼을 누르면 다음 값으로 바뀝니다.";
        el.append(p);
      }
      if (response) {
        const p = document.createElement("p");
        p.className = "bad";
        p.textContent = response;
        el.append(p);
      }
    },
    [
      [
        "신호 확인",
        () => {
          if (puzzleCorrect(ch, choices)) {
            solved = true;
            sound.success();
            save();
            renderHUD();
            resume();
            message("신호 복원 완료 · 출구 잠금이 풀렸습니다.", 5);
          } else {
            response = "신호가 맞지 않습니다. 회수한 기록을 다시 확인하세요.";
            if (ch === 2) choices = [];
            puzzle(false);
          }
        },
      ],
      ["다시 맞추기", () => puzzle()],
      ["닫기", resume, true],
    ],
    "puzzle",
  );
  sound.threat(0);
  sound.puzzleMode();
}
function interact() {
  if (state !== "play" || !nearest) return;
  const o = nearest,
    c = chapters[ch];
  if (!o.root.visible || Math.hypot(o.root.position.x - player.x, o.root.position.z - player.z) >= 2.16 ||
      !clearLine(player, o.root.position)) return;
  if(o.type==="record"){
    const id=ch*2+o.i;
    if(!archive.includes(id)) archive.push(id);
    o.root.visible=false;
    nearest=null;
    sound.recording();
    save();
    message(recordings[ch][o.i].title+" · 녹음함에 저장됨 ("+archive.length+"/8)",5);
  } else if (o.type === "item") {
    found[o.i] = true;
    // The equipment makes a noise at the pickup location. The creature investigates it.
    lastKnown = o.cell;
    enemyPhase = 9 + 2 * ch;
    nextPath = 0;
    o.root.visible = false;
    sound.pickup();
    grace = Math.max(grace, 3);
    nearest = null;
    renderHUD();
    save();
    message(c.names[o.i] + "  /  " + c.labels[o.i] + "   ·   회수 완료", 4);
  } else if (o.type === "station") {
    if (solved) {
      message("복원이 끝났습니다. 출구 단말기를 찾으세요.");
      return;
    }
    if (total() === 3) {
      puzzle();
      return;
    }
    modal(
      c.station,
      "세 개의 " + c.item + "를 회수하면 장치를 복구할 수 있습니다.",
      notes,
      [
        [
          "도면 보기",
          () => {
            state = "play";
            mapPanel();
          },
        ],
        ["닫기", resume, true],
      ],
      "station",
    );
  } else if (!solved) {
    message("문이 잠겼습니다. " + c.station + "에서 신호를 먼저 복원하세요.");
  } else if (ch < 3) {
    ch++;
    found = [false, false, false];
    solved = false;
    seen = new Set();
    level = makeLevel(ch);
    loadScene();
    save();
    sound.success();
    brief();
  } else {
    save();
    sound.success();
    const previous = read(LAST);
    const best = Number.isFinite(previous?.best) && previous.best >= 0 ? Math.min(previous.best, elapsed)
      : Number.isFinite(previous?.elapsed) && previous.elapsed >= 0 ? Math.min(previous.elapsed, elapsed) : elapsed;
    const completionStored = roomStorage.write(LAST, { elapsed, best, recordings: archive.length });
    const saveRemoved = roomStorage.remove(SAVE);
    savePersistent = completionStored && saveRemoved;
    modal(
      "녹음 종료",
      "문이 닫힌 뒤에도 테이프에는 한 사람의 숨소리가 더 남아 있었다.",
      (el) => {
        el.innerHTML =
          '<div class="endstat"><span>복원 구역</span><strong>04 / 04</strong><span>탈출 기록</span><strong>' +
          clock(elapsed) +
          "</strong><span>회수 기록</span><strong>" + archive.length + " / 8</strong></div>";
      },
      [["타이틀로", homepage]],
      "won",
    );
  }
}
$("act").onclick = interact;
function caught() {
  save();
  sound.caught();
  modal(
    "신호가 끊겼습니다",
    "회수한 장비와 복원 기록은 보존됩니다. 모퉁이를 돌고 자세를 낮추면 추격을 피하기 쉽습니다.",
    null,
    [
      [
        "제어실에서 재개",
        () => {
          pointPlayer();
          renderHUD();
          resume();
        },
      ],
      ["타이틀로", homepage, true],
    ],
    "lost",
  );
}
function enemyUpdate(dt, running) {
  const e = entity.position;
  const dist = Math.hypot(player.x - e.x, player.z - e.z);
  grace = Math.max(0, grace - dt);
  const playerCell = cellOf(player), ec = cellOf(e);
  const visible = dist <= 14 && clearLine(player, e);
  // Cache the acoustic distance field until the player enters another tile.
  if (!acousticTree || acousticCell !== playerCell) {
    acousticCell = playerCell;
    acousticTree = paths(level.map, playerCell);
  }
  const facing = ((player.x - e.x) * Math.sin(entity.rotation.y) +
    (player.z - e.z) * Math.cos(entity.rotation.y)) / Math.max(dist, .001);
  const { sight: inSight, heard: hear } = enemyPerception({
    distance: dist, visible, facing, lightOn, running, crouched,
    moving: moved > dt * 0.15,
    corridorDistance: cellDistance(acousticTree.dist[ec], C),
  });
  const tracking = !grace && (inSight || hear);
  if (tracking) {
    lastKnown = playerCell;
    enemyPhase = 5.5;
  } else {
    enemyPhase = Math.max(0, enemyPhase - dt);
  }

  nextPath -= dt;
  const directChase = tracking && inSight && ec === playerCell;
  if (directChase) {
    // A direct pursuit changes the actual position; discard stale corridor waypoints.
    path = [];
    nextPath = 0;
  } else if (nextPath <= 0) {
    nextPath = enemyPhase ? 0.65 : 2.5;
    // Replan from the next corridor center. This keeps sharp turns out of walls.
    const anchor = path[0] ?? ec;
    let goal = lastKnown;
    const tree = paths(level.map, anchor);
    if (!enemyPhase) {
      if (patrolTarget >= 0 && patrolTarget !== anchor && tree.dist[patrolTarget] > 0 &&
          (!grace || acousticTree.dist[patrolTarget] > 6)) {
        goal = patrolTarget;
      } else {
        const viable = grace
          ? level.reachable.filter(k => acousticTree.dist[k] > 6)
          : level.reachable;
        goal = patrolGoal(viable, tree.dist, anchor, level.start, patrolTarget);
        patrolTarget = goal;
      }
    } else {
      patrolTarget = -1;
    }
    const newPath = routeFrom(tree, anchor, goal);
    const center = xy(anchor);
    if (Math.hypot(center.x - e.x, center.z - e.z) > 0.01) {
      newPath.unshift(anchor);
    }
    path = newPath;
  }
  const startX = e.x;
  const startZ = e.z;
  const destination = directChase ? player
    : path.length ? xy(path[0]) : null;
  if (destination) {
    const x = destination.x - e.x;
    const z = destination.z - e.z;
    const d = Math.hypot(x, z);
    const v = (enemyPhase ? 1.8 + ch * 0.09 : 0.92 + ch * 0.05) * dt;
    if (d <= v) {
      e.x = destination.x;
      e.z = destination.z;
      if (destination !== player) path.shift();
    } else {
      e.x += (x / d) * v;
      e.z += (z / d) * v;
    }
    if (d > 0.03) {
      const angle = Math.atan2(x, z) - entity.rotation.y;
      const delta = Math.atan2(Math.sin(angle), Math.cos(angle));
      entity.rotation.y += delta * (1 - Math.exp(-10 * dt));
    }
  } else if (enemyPhase && !tracking) {
    // Briefly scan the last heard location instead of facing a wall motionlessly.
    entity.rotation.y += dt * 1.45;
  }
  const travel = Math.hypot(e.x - startX, e.z - startZ);
  enemyStepDistance+=travel;
  if(enemyStepDistance >= (enemyPhase ? .68 : .82)){
    enemyStepDistance=0;
    const distance=Math.hypot(e.x-player.x,e.z-player.z);
    if(distance<17 && !grace){
      const pan=((e.x-player.x)*Math.cos(yaw)-(e.z-player.z)*Math.sin(yaw))/Math.max(distance,.1);
      sound.enemyStep(distance,pan,clearLine(player,e),Boolean(enemyPhase));
    }
  }
  stride += travel * 5.5;
  gaitWeight = THREE.MathUtils.damp(gaitWeight, Math.min(1, travel / Math.max(dt, .001)), 9, dt);
  model.position.y = 0.009 + 0.009 * gaitWeight * Math.abs(Math.sin(stride));
  model.rotation.z = 0.025 * Math.sin(now * 2.1);
  mixer.update(dt * (enemyPhase ? 1.25 : 0.75));
  for (const joint of gait) {
    const swing = Math.sin(stride + joint.offset);
    joint.bone.quaternion.copy(joint.rest);
    joint.bone.rotateOnAxis(joint.axis, joint.amplitude * gaitWeight * (joint.knee ? Math.max(0, swing) : swing));
  }
  const threat = grace
    ? 0
    : Math.max(0, 1 - dist / 12) * (inSight ? 0.96 : 0.57);
  sound.threat(threat);
  $("danger").style.opacity = String(threat * 0.72);
  const strain = threat > 0.68 ? "바로 근처" : threat > 0.28 ? "접근 중" : "안정";
  if ($("strain").textContent !== strain) $("strain").textContent = strain;
  $("strain").dataset.threat = threat > 0.68 ? "near" : threat > 0.28 ? "alert" : "safe";
  if (!grace && Math.hypot(player.x - e.x, player.z - e.z) < 0.73 && clearLine(player, e)) {
    caught();
  }
}
function update(dt) {
  elapsed += dt;
  let f =
    (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
    (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
    pointer.y;
  let r = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + pointer.x;
  if (keys.has("ArrowLeft")) yaw += dt * 1.55 * sensitivity;
  if (keys.has("ArrowRight")) yaw -= dt * 1.55 * sensitivity;
  const length = Math.hypot(f, r);
  if (length > 1) {
    f /= length;
    r /= length;
  }
  const sprintHeld = keys.has("ShiftLeft") || keys.has("ShiftRight") || mobileRun;
  if (stamina <= 0.045) winded = true;
  else if (!sprintHeld || stamina >= 0.3) winded = false;
  const running = sprintHeld && !crouched && !winded && length > 0.1;
  const scale = (running ? 3.22 : crouched ? 1.05 : 1.88) * dt,
    oldX = player.x,
    oldZ = player.z;
  shift(
    (-Math.sin(yaw) * f + Math.cos(yaw) * r) * scale,
    (-Math.cos(yaw) * f - Math.sin(yaw) * r) * scale,
  );
  moved = Math.hypot(player.x - oldX, player.z - oldZ);
  const exerting = running && moved > dt * 0.15;
  stamina = THREE.MathUtils.clamp(stamina + (exerting ? -0.14 : 0.11) * dt, 0, 1);
  $("stamina").classList.toggle("winded", winded);
  const staminaPercent = String(Math.round(stamina * 100));
  const meter = $("stamina").parentElement;
  if (meter.getAttribute("aria-valuenow") !== staminaPercent) meter.setAttribute("aria-valuenow", staminaPercent);
  stepAt += moved;
  if (stepAt > (running ? 1.02 : 0.86)) {
    sound.step(running, crouched);
    stepAt = 0;
  }
  eyeHeight = THREE.MathUtils.damp(eyeHeight, crouched ? 1.12 : 1.58, 12, dt);
  camera.position.set(
    player.x,
    eyeHeight + (!motionAllowed() ? 0 :
      Math.sin(elapsed * (running ? 12 : 8.3)) * Math.min(moved / Math.max(dt, 0.001), 3) * (0.38 / 60)),
    player.z,
  );
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  lamp.visible = lightOn;
  beam.intensity = THREE.MathUtils.damp(beam.intensity, lightOn ? 2 : 0.45, 8, dt);
  enemyUpdate(dt, running);
  if (state !== "play") return;
  const event=dread.tick(dt,!grace && !enemyPhase && moved>dt*.3 && !solved && now>noticeUntil);
  if(event?.started){
    sound.incident(event.kind,Math.random()<.5?-.83:.83);
    message(event.caption,event.duration);
  }
  const dim=event?.kind==="drop" && motionAllowed()?Math.sin(Math.PI*event.age/event.duration):0;
  lamp.intensity=28*(1-.68*dim);
  const atmosphere=event?.kind??"none";
  if($("viewWrap").dataset.incident!==atmosphere) $("viewWrap").dataset.incident=atmosphere;
  const cell = cellOf(player);
  if (cell !== lastCell) {
    seen.add(cell);
    for (const n of neighbors(level.map, cell)) seen.add(n);
    lastCell = cell;
    refreshGuide();
  } else {
    drawGuide();
  }
  nearest = null;
  let reach = 2.16;
  for (const o of items) {
    if (!o.root.visible) continue;
    const q = o.root.position,
      d = Math.hypot(q.x - player.x, q.z - player.z);
    if (o.root.userData.unit && d < 12) {
      o.root.userData.unit.rotation.y = now * 0.64;
      o.root.userData.unit.position.y = 0.83 + 0.035 * Math.sin(now * 2 + o.i);
    }
    if (d < reach && clearLine(player, q)) {
      nearest = o;
      reach = d;
    }
  }
  const caption = nearest
    ? nearest.type === "item"
      ? chapters[ch].item + " 회수"
      : nearest.type === "exit"
        ? (solved ? "출구 작동" : "잠긴 출구 확인")
        : nearest.type === "record" ? "녹음 기록 회수" : chapters[ch].station + " 확인"
    : "";
  $("prompt").hidden = !caption;
  if ($("promptText").textContent !== caption) $("promptText").textContent = caption;
  if ($("act").disabled !== !nearest) $("act").disabled = !nearest;
  $("stamina").style.transform = "scaleX(" + stamina.toFixed(3) + ")";
  const timeText = clock(elapsed);
  if ($("timer").textContent !== timeText) $("timer").textContent = timeText;
  if (now > noticeUntil && $("toast").textContent) $("toast").textContent = "";
  if (now > saveAt) {
    save();
    saveAt = now + 12;
  }
}
function scheduleFrame() {
  if (!frameStarted || frameId !== null || document.hidden || contextLost ||
      !scene || $("game").hidden) return;
  if (state !== "play" && (!sceneDirty || ["load", "error"].includes(state))) return;
  frameId = requestAnimationFrame(frame);
}
function frame(ts) {
  frameId = null;
  const dt = Math.min(0.075, Math.max(0, (ts - last) / 1000));
  last = ts;
  now = ts / 1000;
  if (document.hidden || contextLost || !scene || $("game").hidden) return;
  if (state === "play") {
    update(dt);
    renderer.render(scene, camera);
    sceneDirty = false;
  } else if (sceneDirty && !["load", "error"].includes(state)) {
    // Static modal backgrounds only need a new frame after a scene/size change.
    renderer.render(scene, camera);
    sceneDirty = false;
  }
  scheduleFrame();
}
document.addEventListener("keydown", (e) => {
  if (e.code === "Tab" && !$("game").hidden && !$("dialog").hidden) {
    const focusable = [...$("dialog").querySelectorAll("button:not(:disabled), input:not(:disabled), a[href]")];
    if (!focusable.length) { e.preventDefault(); return; }
    const index = focusable.indexOf(document.activeElement);
    if (index < 0 || (e.shiftKey ? index === 0 : index === focusable.length - 1)) {
      e.preventDefault();
      focusable[e.shiftKey ? focusable.length - 1 : 0].focus();
    }
    return;
  }
  if (
    e.code !== "Escape" && (e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement)
  )
    return;
  if (state === "play") {
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space",
      ].includes(e.code)
    )
      e.preventDefault();
    if (!e.repeat) {
      if (e.code === "KeyE") interact();
      else if (e.code === "KeyF") toggleLamp();
      else if (e.code === "KeyC") toggleCrouch();
      else if (e.code === "KeyG") toggleGuide();
      else if (e.code === "KeyM") mapPanel();
      else if (e.code === "Escape" || e.code === "KeyP") pauseGame();
    }
    if (state === "play") keys.add(e.code);
  } else if (
    ["pause", "map", "help", "archive", "settings", "station", "puzzle"].includes(state) &&
    e.code === "Escape"
  ) {
    e.preventDefault();
    if (state === "map") returnFromMap();
    else if (["help", "archive", "settings"].includes(state)) pauseMenu();
    else resume();
  }
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
// Escape may be consumed by the browser while releasing pointer lock.
let hadPointerLock = false;
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === renderer?.domElement;
  if (locked && state !== "play") {
    // An asynchronous lock request may complete after a pause or screen change.
    hadPointerLock = false;
    document.exitPointerLock();
    return;
  }
  if (hadPointerLock && !locked && state === "play") pauseGame();
  hadPointerLock = locked;
});
window.addEventListener("pagehide", () => {
  if (state === "play") save();
});
document.addEventListener("pointerdown", (e) => {
  lastPointerType = e.pointerType || "mouse";
}, true);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state === "play") pauseGame();
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  } else scheduleFrame();
});
window.addEventListener("blur", () => {
  if (state === "play") pauseGame();
});
function look(dx, dy) {
  yaw -= dx * 0.00245 * sensitivity;
  pitch = THREE.MathUtils.clamp(pitch - dy * 0.0022 * sensitivity, -1.18, 1.18);
}
document.addEventListener("mousemove", (e) => {
  if (state === "play" && document.pointerLockElement === renderer?.domElement)
    look(e.movementX, e.movementY);
});
const wrap = $("viewWrap");
wrap.addEventListener("pointerdown", (e) => {
  if (
    state !== "play" ||
    e.target.tagName !== "CANVAS" ||
    document.pointerLockElement || lookId !== -1 || (e.pointerType === "mouse" && e.button !== 0)
  )
    return;
  lookId = e.pointerId;
  draggingLook = false;
  lookTravel = 0;
  lookLast = [e.clientX, e.clientY];
  // Capture on the canvas so a stationary tap still targets the canvas click handler.
  e.target.setPointerCapture(e.pointerId);
});
wrap.addEventListener("pointermove", (e) => {
  if (
    state === "play" &&
    e.pointerId === lookId &&
    lookLast &&
    !document.pointerLockElement
  ) {
    const dx = e.clientX - lookLast[0], dy = e.clientY - lookLast[1];
    lookTravel += Math.hypot(dx, dy);
    if (lookTravel > 4) draggingLook = true;
    look(dx, dy);
    lookLast = [e.clientX, e.clientY];
  }
});
for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
  wrap.addEventListener(n, (e) => {
    if (e.pointerId === lookId) {
      lookId = -1;
      lookLast = null;
    }
  });
const stick = $("stick");
stick.addEventListener("pointerdown", (e) => {
  if (state !== "play" || moveId !== -1 || (e.pointerType === "mouse" && e.button !== 0)) return;
  moveId = e.pointerId;
  const b = stick.getBoundingClientRect();
  moveStart = [b.left + b.width / 2, b.top + b.height / 2];
  stick.setPointerCapture(moveId);
  stickMove(e);
});
function stickMove(e) {
  if (e.pointerId !== moveId || !moveStart) return;
  let x = (e.clientX - moveStart[0]) / 36,
    y = (e.clientY - moveStart[1]) / 36;
  const distance = Math.hypot(x, y);
  // Radial dead zone avoids drift while a thumb rests near the center.
  const strength = Math.max(0, Math.min(1, (distance - 0.12) / 0.88));
  pointer.x = distance ? (x / distance) * strength : 0;
  pointer.y = distance ? (y / distance) * strength : 0;
  $("stickknob").style.transform =
    "translate(" + pointer.x * 27 + "px," + pointer.y * 27 + "px)";
}
stick.addEventListener("pointermove", stickMove);
for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
  stick.addEventListener(n, (e) => {
    if (e.pointerId !== moveId) return;
    moveId = -1;
    pointer.x = pointer.y = 0;
    $("stickknob").style.transform = "";
  });
$("run").addEventListener("pointerdown", (e) => {
  if (state !== "play" || runId !== -1 || (e.pointerType === "mouse" && e.button !== 0)) return;
  runId = e.pointerId;
  mobileRun = true;
  $("run").setPointerCapture(runId);
});
for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
  $("run").addEventListener(n, (e) => {
    if (e.pointerId !== runId) return;
    runId = -1;
    mobileRun = false;
  });
document.body.classList.toggle("touch", touch);
homepage();
