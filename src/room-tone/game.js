// Keep the title screen independent of the heavy 3D engine. The code and
// monster binary are requested together only when a play session begins.
let THREE, GLTFLoader, createCaptureShot, fixMonster;
let enginePromise;
function loadEngine() {
  if (!enginePromise) enginePromise = Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("./monster.js"),
  ]).then(([three, loader, monster]) => {
    THREE = three;
    GLTFLoader = loader.GLTFLoader;
    createCaptureShot = monster.createCaptureShot;
    fixMonster = monster.fixMonster;
  }).catch((error) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}
import { modelBytes, releaseModelBytes } from "./assets.js";
import { chapters, makeLevel, paths, route, routeFrom, neighbors } from "./levels.mjs";
import { buildEnvironment, buildHidingSpot, createHidingSpotKit } from "./environment.js";
import { Sound } from "./sound.js";
import { normalizeCampaign } from "./campaign.mjs";
import { createPointerOwner, tryCapture } from "./input.mjs";
import { lineClear, soundTravelDistance } from "./visibility.mjs";
import { renderingScale, selectQuality } from "./render-quality.mjs";
import { propClearance } from "./obstacles.mjs";
import { loadFailureText } from "./loading-error.mjs";
import { reducedMotionOn } from "./motion-preferences.mjs";
import { facingDot, canSeeTarget, stereoPan } from "./awareness.mjs";
import { initialMute } from "./preferences.mjs";
import { createIdLookup } from "./dom.mjs";

const $ = createIdLookup(document),
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
  hidingSpots = [],
  interactables = [],
  blockingProps = [],
  hiddenSpot = null,
  hideBreath = 1,
  hideReadyAt = 0,
  solved = false,
  found = [false, false, false],
  seen = new Set(),
  elapsed = 0;
let renderer,
  scene,
  camera,
  lamp,
  beam,
  model,
  mixer,
  gait = [],
  stride = 0,
  entity,
  environment,
  props,
  player = null,
  yaw = 0,
  pitch = 0;
let moved = 0,
  stepAt = 0,
  path = [],
  nextPath = 0,
  lastKnown = -1,
  grace = 0,
  exitGrace = 0,
  wasTracking = false,
  wasSeeing = false,
  searchRemaining = 0,
  searching = false,
  enemySteps = 0,
  alertUntil = 0,
  enemyPhase = 0,
  stamina = 1,
  winded = false,
  crouched = false,
  eyeHeight = 1.58,
  lightOn = true,
  muted = false;
let now = 0,
  last = 0,
  frameId = null,
  sceneDirty = false,
  nearest = null,
  moveStart = null,
  lookLast = null,
  mobileRun = false;
let wasPointerLocked = false;
const movePointer = createPointerOwner(),
  lookPointer = createPointerOwner(),
  runPointer = createPointerOwner();
let lastPointerType = "mouse";
let noticeUntil = 0,
  saveAt = 0,
  lastCell = -1,
  choices = [],
  response = "",
  opening = false;
let guidance = read("rt-guidance") === true;
let guidePath = [];
let returnFromMap = resume;
let returnFromHelp = resume;
let renderCaptureShot;
let captureTime = 0;
let investigation = null, nextFlicker = 0, flickerUntil = 0;
let hearingCell = -1, hearingTree = null;
let previousMeterValue = -1, previousMeterLabel = "";
let previousMeterScale = "", previousDangerOpacity = "";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const touch =
  matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
lastPointerType = touch ? "touch" : "mouse";
const px = (t) => String(t).padStart(2, "0");
const clock = (t) => px(Math.floor(t / 60)) + ":" + px(Math.floor(t % 60));
const pad = (i) => String(i + 1).padStart(2, "0");
const total = () => found.filter(Boolean).length;
function read(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch {
    return null;
  }
}
function saved() {
  const s = read(SAVE);
  return normalizeCampaign(s);
}
function save() {
  if (!level) return;
  try {
    localStorage.setItem(
      SAVE,
      JSON.stringify({ v: 1, ch, found, solved, seen: [...seen], elapsed }),
    );
  } catch { /* Browser storage or pointer lock is optional. */ }
}
const PREFS = "waldo.preferences.v1";
function selectedQuality() {
  return selectQuality(read(PREFS), matchMedia("(max-width: 850px)").matches);
}
let reducedEffects = false;
function syncMotionPreference() {
  reducedEffects = reducedMotionOn(reducedMotion.matches, read(PREFS));
  document.body.classList.toggle("rt-reduced-motion", reducedEffects);
}
syncMotionPreference();
reducedMotion.addEventListener?.("change", syncMotionPreference);
function syncAudioButtons() {
  for (const b of [$("sound"), $("gsound")]) {
    b.setAttribute("aria-pressed", String(!muted));
    b.querySelector("span").textContent = muted ? "소리 꺼짐" : "소리 켜짐";
  }
}
function applyMute(next) {
  muted = Boolean(next);
  sound.setMute(muted);
  if (!muted && !["home", "load"].includes(state)) void sound.start();
  syncAudioButtons();
}
function toggleAudio() {
  applyMute(!muted);
  try {
    // Share audio with the hub and retain the legacy game key for migration.
    const stored = read(PREFS);
    const preferences = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    localStorage.setItem(PREFS, JSON.stringify({ ...preferences, sound: !muted }));
    localStorage.setItem("rt-silent", JSON.stringify(muted));
  } catch { /* Browser storage is optional. */ }
}
applyMute(initialMute(read("rt-silent"), read(PREFS)));
$("sound").onclick = $("gsound").onclick = toggleAudio;
function syncSharedPreferences() {
  applyMute(initialMute(read("rt-silent"), read(PREFS)));
  syncMotionPreference();
  resize();
}
window.addEventListener("storage", (e) => {
  if (e.key === PREFS) syncSharedPreferences();
  else if (e.key === "rt-silent" && read(PREFS)?.sound === undefined)
    applyMute(initialMute(read("rt-silent"), read(PREFS)));
});
// The arcade dispatcher also supports settings panels in the current tab.
window.addEventListener("waldo:preferences", syncSharedPreferences);
function screens(id) {
  for (const key of ["home", "game"]) $(key).hidden = key !== id;
  if (id === "game") showSceneOnce();
}
function homepage() {
  state = "home";
  leaveLook();
  sound.pause(true);
  screens("home");
  $("dialog").hidden = true;
  const s = saved();
  $("continue").hidden = !s;
  $("new").textContent = s ? "처음부터" : "게임 시작";
  $("continue").textContent = s
    ? "이어하기 · " + pad(s.ch) + "구역"
    : "이어하기";
  const completed = read(LAST);
  $("completion").textContent = Number.isFinite(completed?.elapsed) && completed.elapsed >= 0
    ? "최근 탈출 기록  " + clock(completed.elapsed)
    : "";
}
function clearInputs() {
  keys.clear();
  pointer.x = pointer.y = 0;
  movePointer.clear();
  lookPointer.clear();
  runPointer.clear();
  moveStart = lookLast = null;
  mobileRun = false;
  $("stickknob").style.transform = "";
}
function leaveLook() {
  clearInputs();
  if (document.pointerLockElement) document.exitPointerLock();
}
function lockLook() {
  if (state !== "play" || lastPointerType !== "mouse" || !renderer || document.pointerLockElement) return;
  try {
    const p = renderer.domElement.requestPointerLock?.();
    p?.catch(() => {});
  } catch { /* Browser storage or pointer lock is optional. */ }
}
function message(msg, sec = 3.2) {
  $("toast").textContent = msg;
  noticeUntil = now + sec;
}
function modal(title, description, body, actions, type = "panel") {
  if (state === "capture") $("viewWrap").classList.remove("caught-shot");
  state = type;
  leaveLook();
  // Puzzles intentionally keep WebAudio running for dial feedback. Rebuilding
  // puzzle controls must never suspend the graph between consecutive clicks.
  if (type !== "puzzle") sound.pause(true);
  $("dialog").hidden = false;
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
  showSceneOnce();
}
function resume() {
  state = "play";
  $("dialog").hidden = true;
  sound.pause(false);
  last = performance.now();
  scheduleFrame();
  $("viewWrap").focus({ preventScroll: true });
}
function guide(fromHome = false, returnAction = resume) {
  if (fromHome) {
    $("how").showModal();
    return;
  }
  returnFromHelp = returnAction;
  modal(
    "조작 안내",
    "숙이면 발소리가 줄어듭니다. 침대 밑이나 커튼 뒤에 숨을 수 있지만, 괴물이 보면 조사할 수 있습니다.",
    (el) => {
      el.innerHTML = $("guideText").innerHTML;
    },
    [["돌아가기", returnFromHelp]],
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
const hubUrl = () => new URL("../", location.href).href;
function showPauseMenu() {
  modal(
    "녹음 일시정지",
    chapters[ch].location + " · " + clock(elapsed),
    null,
    [
      ["계속하기", resume],
      ["조작 안내", () => guide(false, showPauseMenu)],
      ["타이틀로", homepage, true],
      ["게임 목록으로", () => location.assign(hubUrl()), true],
    ],
    "pause",
  );
}
function pauseGame() {
  if (state !== "play") return;
  save();
  showPauseMenu();
}
$("pauseGame").onclick = pauseGame;
async function setup() {
  // Start the 4.5 MB binary request before dynamic imports and WebGL setup.
  // Both requests remain optional until a player chooses to start.
  const monsterBinary = !model ? modelBytes() : null;
  // Attach the rejection handler immediately: imports can outlast a failed
  // fetch, and a rejected download should not become an unhandled rejection.
  if (monsterBinary) void monsterBinary.catch(() => {});
  try {
    await loadEngine();
  } catch (error) {
    releaseModelBytes();
    throw error;
  }
  if (!player) player = new THREE.Vector3();
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      // Avoid expensive multisampling on touch GPUs; viewport DPR is budgeted separately.
      antialias: !touch && selectedQuality() === "high",
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    $("viewWrap").prepend(renderer.domElement);
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      save();
      modal(
        "그래픽 연결이 끊겼습니다",
        "브라우저를 새로고침하면 저장한 구역에서 이어갈 수 있습니다.",
        null,
        [["다시 불러오기", () => location.reload()]],
        "error",
      );
    });
  }
  if (!model) {
    let gltf;
    try {
      gltf = await new GLTFLoader().parseAsync(await monsterBinary, "");
    } finally {
      // Free the binary after decoding, including on parse failure.
      releaseModelBytes();
    }
    model = gltf.scene;
    fixMonster(THREE, model);
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
  return lineClear(level.map, C, a, b);
}
function shift(dx, dz) {
  const r = 0.225;
  function space(x, z) {
    return (
      pass(x - r, z - r) &&
      pass(x + r, z - r) &&
      pass(x - r, z + r) &&
      pass(x + r, z + r) &&
      propClearance(x, z, player.x, player.z, r, blockingProps)
    );
  }
  if (space(player.x + dx, player.z)) player.x += dx;
  if (space(player.x, player.z + dz)) player.z += dz;
}
function pointPlayer() {
  const p = xy(level.start);
  const next = xy(neighbors(level.map, level.start)[0]);
  player.set(p.x + (next.x - p.x) * 0.38, 1.58, p.z + (next.z - p.z) * 0.38);
  camera.position.copy(player);
  yaw = Math.atan2(-(next.x - p.x), -(next.z - p.z));
  pitch = 0;
  camera.rotation.set(0, yaw, 0, "YXZ");
  hiddenSpot = null;
  hideBreath = 1;
  hideReadyAt = 0;
  $("viewWrap").classList.remove("hiding");
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
  exitGrace = 0;
  wasTracking = false;
  wasSeeing = false;
  investigation = null;
  searchRemaining = 0;
  searching = false;
  enemySteps = 0;
  alertUntil = 0;
  hearingCell = -1;
  hearingTree = null;
  $("viewWrap").classList.remove("noticed");
  enemyPhase = 0;
  lastCell = -1;
  nearest = null;
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
  const pixelRatio = renderingScale(w, h, devicePixelRatio, touch, selectedQuality());
  if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  showSceneOnce();
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
      type === "exit" ? 0x91d6a8 : type === "station" ? 0x9ce1db : 0xf1ab63,
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
  const sign = label(
    type === "item"
      ? chapters[ch].item + " " + pad(i)
      : type === "exit"
        ? "EXIT  /  출구"
        : chapters[ch].station,
    type === "exit" ? "#a7dcb7" : type === "station" ? "#a2ddd5" : "#edba81",
  );
  sign.position.y = type === "item" ? 1.39 : 1.64;
  root.add(sign);
  return { cell, type, i, root };
}
function makeHidingSpots() {
  const reserved = [level.start, level.exit, level.nest, ...level.items];
  const candidates = level.reachable.filter((cell) =>
    neighbors(level.map, cell).length >= 3 &&
    reserved.every((other) => pathsDistXZ(cell, other) > 2),
  );
  const selected = [];
  let spotKit;
  for (const cell of candidates) {
    if (selected.some((other) => pathsDistXZ(cell, other) < 5)) continue;
    const x = cell % level.w, z = Math.floor(cell / level.w);
    const wall = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(
      ([dx, dz]) => level.map[z + dz]?.[x + dx] === "#",
    );
    if (!wall) continue;
    selected.push(cell);
    const center = xy(cell), [dx, dz] = wall;
    const root = new THREE.Group();
    root.position.set(center.x + dx * 0.82, 0, center.z + dz * 0.82);
    // Local back points toward the wall; the open front faces the room.
    root.rotation.y = Math.atan2(dx, dz);
    props.add(root);
    const kind = (selected.length - 1) % 4;
    if (!spotKit) spotKit = createHidingSpotKit(THREE);
    buildHidingSpot(THREE, root, kind, spotKit);
    const caption = ["옷장에 숨기", "침대 밑에 숨기", "커튼 뒤에 숨기", "책상 밑에 숨기"][kind];
    hidingSpots.push({ type: "hide", cell, root, dx, dz, kind, caption });
  }
}
function leaveHiding(exhausted = false) {
  if (!hiddenSpot) return;
  const spot = hiddenSpot;
  hiddenSpot = null;
  investigation = null;
  hideReadyAt = now + 8;
  exitGrace = 1.5;
  $("lightState").textContent = lightOn ? "켜짐" : "꺼짐";
  player.x = spot.root.position.x - spot.dx * 0.9;
  player.z = spot.root.position.z - spot.dz * 0.9;
  $("viewWrap").classList.remove("hiding");
  message(exhausted ? "숨이 차서 나왔습니다." : "숨을 곳에서 나왔습니다.", 2);
}
function enterHiding(spot) {
  if (now < hideReadyAt) {
    message("숨을 고르는 중입니다. 잠시 후 다시 숨으세요.", 2);
    return;
  }
  const distance = Math.hypot(player.x - entity.position.x, player.z - entity.position.z);
  const facing = facingDot(entity.rotation.y, entity.position, player);
  const witnessed = !grace && canSeeTarget(distance, clearLine(player, entity.position), lightOn, facing);
  investigation = witnessed ? { spot, remaining: 3.5, check: Math.random() < (0.12 + 0.23 * (1 - distance / 10.7)) } : null;
  if (investigation) {
    lastKnown = spot.cell;
    enemyPhase = 5.5;
    searchRemaining = 0;
    searching = false;
    nextPath = 0;
  }
  hiddenSpot = spot;
  $("lightState").textContent = "꺼짐";
  hideBreath = 1;
  player.x = spot.root.position.x;
  player.z = spot.root.position.z;
  yaw = Math.atan2(spot.dx, spot.dz);
  pitch = 0;
  $("viewWrap").classList.add("hiding");
  message("숨을 참는 중 · E / 조사로 나오기", 3);
}
function loadScene() {
  model.removeFromParent();
  if (environment?.userData?.dispose) environment.userData.dispose();
  else disposeGroup(environment);
  disposeGroup(props);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(
    [0x111b1b, 0x141d23, 0x211b19, 0x101b18][ch],
  );
  scene.fog = new THREE.FogExp2(scene.background, 0.05);
  camera = new THREE.PerspectiveCamera(68, 1, 0.045, 65);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xc0d4cf, 0x44413c, 0.86));
  const fill = new THREE.DirectionalLight(0xc6d2cd, 0.36);
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
  hidingSpots = [];
  investigation = null;
  nextFlicker = now + 18 + Math.random() * 25;
  makeHidingSpots();
  // Static interaction and collision indexes, rebuilt only per chapter.
  interactables = items.concat(hidingSpots);
  blockingProps = interactables.map((o) => ({
    root: o.root,
    x: o.root.position.x,
    z: o.root.position.z,
    rotation: o.root.rotation.y,
    cos: Math.cos(o.root.rotation.y),
    sin: Math.sin(o.root.rotation.y),
    halfWidth: o.type === "hide" ? 0.57 : o.type === "station" ? 0.46
      : o.type === "item" ? 0.36 : 0.35,
    halfDepth: o.type === "hide" ? (o.kind === 2 ? 0.13 : 0.44)
      : o.type === "station" ? 0.30 : o.type === "item" ? 0.25 : 0.22,
  }));
  entity = new THREE.Group();
  entity.add(model);
  scene.add(entity);
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  pointPlayer();
  resize();
  sound.ambience(ch);
  renderHUD();
  showSceneOnce();
}
async function start(cont) {
  if (opening) return;
  opening = true;
  screens("game");
  state = "load";
  $("dialog").hidden = false;
  $("panelTitle").textContent = "녹음실 연결 중";
  $("panelText").textContent = "공간과 캐릭터를 불러오고 있습니다.";
  $("panelBody").replaceChildren();
  $("panelActions").replaceChildren();
  try {
    // Queue the model fetch and engine imports before the synchronous audio
    // graph construction; otherwise Sound.build() delays the first network request.
    const setupPromise = setup();
    void sound.start();
    await setupPromise;
    const s = cont ? saved() : null;
    ch = s?.ch ?? 0;
    found = s?.found ?? [false, false, false];
    solved = s?.solved ?? false;
    elapsed = s?.elapsed ?? 0;
    seen = new Set(s?.seen || []);
    level = makeLevel(ch);
    loadScene();
    save();
    brief();
  } catch (e) {
    console.error(e);
    modal(
      "게임을 열 수 없습니다",
      loadFailureText(e),
      null,
      [
        ["다시 시도", () => start(cont)],
        ["타이틀로", homepage, true],
      ],
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
        '</p><p class="hint">도면에서 장비와 출구 방향을 확인하세요. 진행 상황은 자동으로 저장됩니다.</p>';
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
  $("crouch").setAttribute("aria-pressed", String(crouched));
  refreshGuide();
}
function toggleLamp() {
  if (state !== "play" || hiddenSpot) return;
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
  // One shortest-path tree per cell instead of three BFS traversals.
  const tree = paths(level.map, cell);
  let nearestGoal = -1;
  for (const target of targets) {
    if (tree.dist[target] >= 0 &&
      (nearestGoal < 0 || tree.dist[target] < tree.dist[nearestGoal])) nearestGoal = target;
  }
  guidePath = nearestGoal < 0 ? [] : routeFrom(tree, cell, nearestGoal);
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
  ctx.fillStyle = "#101010";
  ctx.fillRect(0, 0, w * S, w * S);
  for (const id of level.reachable) {
    const x = id % w,
      z = Math.floor(id / w);
    ctx.fillStyle = seen.has(id) ? "#777777" : "#303030";
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
    ctx.strokeStyle = "#dddddd";
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
    else if (shape === "diamond") {
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath();
    } else ctx.arc(x, y, 4.6, 0, Math.PI * 2);
    ctx.fill();
  };
  level.items.forEach((id, i) => {
    if (!found[i]) dot(id, "#f0f0f0", "square");
  });
  dot(level.start, "#dddddd", "circle");
  dot(level.exit, "#dddddd", "diamond");
  const pos = cellOf(player),
    px = ((pos % w) + 0.5) * S,
    pz = (Math.floor(pos / w) + 0.5) * S;
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-yaw);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-5, 5);
  ctx.lineTo(5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function mapPanel(fromBrief = false, returnAction = null) {
  if (!fromBrief && !returnAction && state !== "play") return;
  returnFromMap = returnAction ?? (fromBrief ? brief : resume);
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
        "<i>▲ 현재 위치</i><i>■ 회수 장비</i><i>● 제어 장치</i><i>◆ 출구</i>";
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
const circuitOptions = ["5 A", "10 A", "15 A"],
  tuneOptions = [
    ["71.2", "72.4", "73.6", "74.8"],
    ["80.0", "81.2", "82.4", "83.6"],
    ["90.6", "91.8", "93.0", "94.2"],
  ];
function expected() {
  return [
    [0, 1, 2],
    [1, 3, 1],
    [1, 2, 0],
    [2, 1, 0],
  ][ch];
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
            // Keep keyboard control near the newly filled reel slot.
            ($("panelBody").querySelector(".choiceRow button:not([disabled])") ??
              $("panelActions").querySelector("button"))?.focus();
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
          const opts =
            ch === 0
              ? circuitOptions
              : ch === 1
                ? tuneOptions[i]
                : ["0°", "90°", "180°", "270°"];
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
            $("panelBody").querySelectorAll(".dials button")[i]?.focus();
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
        p.setAttribute("role", "alert");
        p.textContent = response;
        el.append(p);
      }
    },
    [
      [
        "신호 확인",
        () => {
          if (expected().every((v, i) => choices[i] === v)) {
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
  if (sound.paused) sound.pause(false);
}
function interact() {
  if (state !== "play") return;
  if (hiddenSpot) { leaveHiding(); return; }
  if (!nearest) return;
  if (nearest.type === "hide") { enterHiding(nearest); return; }
  const o = nearest,
    c = chapters[ch];
  if (o.type === "item") {
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
    showStation();
  } else if (!solved) {
    message("문이 잠겼습니다. " + c.station + "에서 신호를 먼저 복원하세요.");
  } else if (ch < chapters.length - 1) {
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
    try {
      localStorage.setItem(LAST, JSON.stringify({ elapsed }));
      localStorage.removeItem(SAVE);
    } catch { /* Browser storage or pointer lock is optional. */ }
    modal(
      "녹음 종료",
      "문이 닫힌 뒤에도 테이프에는 한 사람의 숨소리가 더 남아 있었다.",
      (el) => {
        el.innerHTML =
          '<div class="endstat"><span>복원 구역</span><strong>04 / 04</strong><span>탈출 기록</span><strong>' +
          clock(elapsed) +
          "</strong></div>";
      },
      [["타이틀로", homepage]],
      "won",
    );
  }
}
function showStation() {
  const c = chapters[ch];
  modal(
    c.station,
    "세 개의 " + c.item + "를 회수하면 장치를 복구할 수 있습니다.",
    notes,
    [
      ["도면 보기", () => mapPanel(false, showStation)],
      ["닫기", resume, true],
    ],
    "station",
  );
}
$("act").onclick = interact;
function caught() {
  // Cloning the complete skinned monster is expensive and unnecessary until caught.
  if (!renderCaptureShot) {
    try {
      renderCaptureShot = createCaptureShot(THREE, model);
    } catch (error) {
      console.warn("Optional capture portrait unavailable", error);
      save();
      caughtModal();
      return;
    }
  }
  state = "capture";
  leaveLook();
  captureTime = 0;
  $("viewWrap").classList.add("caught-shot");
  save();
  sound.caught();
  scheduleFrame();
}
function caughtModal() {
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
  exitGrace = Math.max(0, exitGrace - dt);
  // Stereo footsteps remain audible out to 18 units in a clear corridor.
  const visible = dist <= 18 && clearLine(player, e);
  const inSight = !hiddenSpot && canSeeTarget(dist, visible, lightOn,
    facingDot(entity.rotation.y, e, player));
  const playerCell = cellOf(player);
  const enemyCell = cellOf(e);
  // One BFS per monster grid-cell transition. Wall-separated rooms no longer
  // act as if footsteps can travel straight through solid partitions.
  if (enemyCell !== hearingCell) {
    hearingCell = enemyCell;
    hearingTree = paths(level.map, enemyCell).dist;
  }
  const hearRange = running ? 14 : crouched ? 1.6 : 4.7;
  const acousticDistance = soundTravelDistance(visible, dist, hearingTree?.[playerCell] ?? -1, C);
  const hear = !hiddenSpot && moved > dt * 0.15 && acousticDistance < hearRange;
  const tracking = !grace && (inSight || hear);
  if (tracking) {
    if (!wasTracking) {
      sound.notice();
    }
    lastKnown = playerCell;
    enemyPhase = 5.5;
    searchRemaining = 0;
    searching = false;
  } else {
    if (wasTracking && lastKnown !== -1) searchRemaining = 6;
    if (searchRemaining > 0) {
      const nearLastSeen = pathsDistXZ(cellOf(e), lastKnown) <= 1;
      if (nearLastSeen) searching = true;
      if (searching) searchRemaining = Math.max(0, searchRemaining - dt);
      enemyPhase = Math.max(enemyPhase, 0.01);
    } else {
      searching = false;
      enemyPhase = Math.max(0, enemyPhase - dt);
    }
  }
  if (!grace && inSight && !wasSeeing) alertUntil = now + 1.4;
  wasSeeing = !grace && inSight;
  wasTracking = tracking;
  if (investigation && hiddenSpot === investigation.spot) {
    lastKnown = investigation.spot.cell;
    enemyPhase = Math.max(enemyPhase, 0.1);
    searching = false;
    if (pathsDistXZ(cellOf(e), investigation.spot.cell) === 0) {
      investigation.remaining -= dt;
      if (investigation.remaining <= 0) {
        const check = investigation.check;
        investigation = null;
        if (check) { caught(); return; }
        enemyPhase = 0;
        searchRemaining = 0;
        path = [];
        nextPath = 0;
      }
    }
  }
  $("viewWrap").classList.toggle("noticed", now < alertUntil);

  nextPath -= dt;
  const ec = enemyCell;
  if (nextPath <= 0) {
    nextPath = enemyPhase ? 0.65 : 2.5;
    // Replan from the next corridor center. This keeps sharp turns out of walls.
    const anchor = path[0] ?? ec;
    let goal = lastKnown;
    if (!tracking && !investigation && searching && searchRemaining > 0) {
      const nearby = [lastKnown, ...neighbors(level.map, lastKnown)];
      goal = nearby[Math.floor(Math.random() * nearby.length)];
    }
    if (!enemyPhase) {
      const previousGoal = path.at(-1);
      if (previousGoal !== undefined && previousGoal !== anchor) {
        goal = previousGoal;
      } else {
        const viable = level.reachable.filter(
          (k) => k !== level.start && k !== anchor &&
            pathsDistXZ(k, playerCell) > (grace ? 6 : 0),
        );
        goal = viable[Math.floor(Math.random() * viable.length)] ?? level.nest;
      }
    }
    const newPath = route(level.map, anchor, goal);
    const center = xy(anchor);
    if (Math.hypot(center.x - e.x, center.z - e.z) > 0.01) {
      newPath.unshift(anchor);
    }
    path = newPath;
  }
  const startX = e.x;
  const startZ = e.z;
  const destination = investigation && ec === investigation.spot.cell ? null
    : tracking && inSight && ec === playerCell ? player
    : path.length ? xy(path[0]) : null;
  if (destination) {
    const x = destination.x - e.x;
    const z = destination.z - e.z;
    const d = Math.hypot(x, z);
    const v = (enemyPhase ? Math.min(3.1, 2.7 + ch * 0.135) : 1.06 + ch * 0.0575) * dt;
    if (d <= v) {
      e.x = destination.x;
      e.z = destination.z;
      if (destination !== player) path.shift();
    } else {
      e.x += (x / d) * v;
      e.z += (z / d) * v;
    }
    if (d > 0.03) entity.rotation.y = Math.atan2(x, z);
  }
  const travel = Math.hypot(e.x - startX, e.z - startZ);
  enemySteps += travel;
  if (enemySteps >= 0.95) {
    sound.monsterStep(acousticDistance, stereoPan(player, yaw, e));
    enemySteps = 0;
  }
  stride += travel * 5.5;
  model.position.y = 0.009 + 0.009 * Math.abs(Math.sin(stride));
  model.rotation.z = 0.025 * Math.sin(now * 2.1);
  mixer.update(dt * (enemyPhase ? 1.25 : 0.75));
  for (const joint of gait) {
    const swing = Math.sin(stride + joint.offset);
    joint.bone.quaternion.copy(joint.rest);
    joint.bone.rotateOnAxis(joint.axis, joint.amplitude * (joint.knee ? Math.max(0, swing) : swing));
  }
  const threat = grace
    ? 0
    : Math.max(0, 1 - acousticDistance / 12) * (inSight ? 0.96 : 0.57);
  sound.threat(threat);
  const opacity = (threat * 0.53).toFixed(3);
  if (opacity !== previousDangerOpacity) {
    $("danger").style.opacity = opacity;
    previousDangerOpacity = opacity;
  }
  const strain = threat > 0.68 ? "바로 근처"
    : tracking ? "추적 중"
      : searching ? "탐색 중"
        : threat > 0.28 ? "접근 중" : "안정";
  if ($("strain").textContent !== strain) $("strain").textContent = strain;
  if (!hiddenSpot && !grace && !exitGrace && Math.hypot(player.x - e.x, player.z - e.z) < 0.73 && clearLine(player, e)) {
    caught();
  }
}
function pathsDistXZ(a, b) {
  return (
    Math.abs((a % level.w) - (b % level.w)) +
    Math.abs(Math.floor(a / level.w) - Math.floor(b / level.w))
  );
}
function update(dt, wallDt) {
  // The timer measures real active play, even if WebGL is running below 13 FPS.
  elapsed += wallDt;
  let f =
    (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
    (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
    pointer.y;
  let r = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + pointer.x;
  if (!hiddenSpot && keys.has("ArrowLeft")) yaw += dt * 1.55;
  if (!hiddenSpot && keys.has("ArrowRight")) yaw -= dt * 1.55;
  const length = Math.hypot(f, r);
  if (length > 1) {
    f /= length;
    r /= length;
  }
  const sprintHeld = keys.has("ShiftLeft") || keys.has("ShiftRight") || mobileRun;
  if (stamina <= 0.045) winded = true;
  else if (!sprintHeld || stamina >= 0.3) winded = false;
  const running = !hiddenSpot && sprintHeld && !crouched && !winded && length > 0.1;
  stamina = THREE.MathUtils.clamp(
    stamina + (running ? -0.14 : 0.11) * dt,
    0,
    1,
  );
  const scale = (running ? 3.22 : crouched ? 1.05 : 1.88) * dt,
    oldX = player.x,
    oldZ = player.z;
  if (!hiddenSpot) shift(
    (-Math.sin(yaw) * f + Math.cos(yaw) * r) * scale,
    (-Math.cos(yaw) * f - Math.sin(yaw) * r) * scale,
  );
  moved = Math.hypot(player.x - oldX, player.z - oldZ);
  stepAt += moved;
  if (stepAt >= (running ? 1.02 : 0.86)) {
    sound.step(running, crouched);
    stepAt %= running ? 1.02 : 0.86;
  }
  if (hiddenSpot) {
    hideBreath = Math.max(0, hideBreath - dt / 18);
    if (hideBreath === 0) leaveHiding(true);
  }
  eyeHeight = THREE.MathUtils.damp(eyeHeight, crouched ? 1.12 : 1.58, 12, dt);
  // OS reduced-motion setting also disables movement head bob, not only sway.
  const headBob = reducedEffects ? 0
    : Math.sin(elapsed * (running ? 12 : 8.3)) * Math.min(moved, 0.05) * 0.38;
  camera.position.set(player.x, eyeHeight + headBob, player.z);
  const proximity = Math.max(0, 1 - Math.hypot(player.x - entity.position.x, player.z - entity.position.z) / 12);
  const sway = reducedEffects ? 0 : proximity * 0.006 * Math.sin(now * 2.4);
  camera.rotation.set(pitch + sway * 0.4, yaw, sway, "YXZ");
  if (!reducedEffects && now >= nextFlicker) {
    flickerUntil = now + 0.18;
    nextFlicker = now + 24 + Math.random() * 35;
  }
  const flickering = !reducedEffects && now < flickerUntil && Math.sin(now * 55) > 0;
  lamp.visible = beam.visible = lightOn && !hiddenSpot && !flickering;
  enemyUpdate(dt, running);
  if (state !== "play") return;
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
  for (const o of interactables) {
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
  const caption = hiddenSpot ? "숨을 곳에서 나오기" : nearest
    ? nearest.type === "hide" ? "숨기" : nearest.type === "item"
      ? chapters[ch].item + " 회수"
      : nearest.type === "exit"
        ? "출구 작동"
        : chapters[ch].station + " 확인"
    : "";
  if ($("prompt").hidden !== !caption) $("prompt").hidden = !caption;
  if ($("promptText").textContent !== caption) $("promptText").textContent = caption;
  if ($("act").disabled !== (!nearest && !hiddenSpot)) $("act").disabled = !nearest && !hiddenSpot;
  const meterFraction = hiddenSpot ? hideBreath : stamina;
  const meterScale = meterFraction.toFixed(3);
  if (meterScale !== previousMeterScale) {
    $("stamina").style.transform = "scaleX(" + meterScale + ")";
    previousMeterScale = meterScale;
  }
  const meterValue = Math.round(meterFraction * 100);
  if (meterValue !== previousMeterValue) {
    $("staminaMeter").setAttribute("aria-valuenow", String(meterValue));
    previousMeterValue = meterValue;
  }
  const meterLabel = hiddenSpot ? "숨 참기 잔량" : "달리기 체력";
  if (meterLabel !== previousMeterLabel) {
    $("staminaMeter").setAttribute("aria-label", meterLabel);
    previousMeterLabel = meterLabel;
  }
  const timeLabel = clock(elapsed);
  if ($("timer").textContent !== timeLabel) $("timer").textContent = timeLabel;
  if (now > noticeUntil && $("toast").textContent) $("toast").textContent = "";
  if (now > saveAt) {
    save();
    saveAt = now + 12;
  }
}
function scheduleFrame() {
  if (frameId !== null || !scene || !renderer || document.hidden || $("game").hidden) return;
  if (state !== "play" && state !== "capture" && !sceneDirty) return;
  frameId = requestAnimationFrame(frame);
}
function showSceneOnce() {
  sceneDirty = true;
  scheduleFrame();
}
function frame(ts) {
  frameId = null;
  const wallDt = Math.max(0, (ts - last) / 1000);
  const dt = Math.min(0.075, wallDt);
  last = ts;
  now = ts / 1000;
  if (document.hidden || !scene || $("game").hidden) return;
  const wasPlaying = state === "play";
  if (wasPlaying) update(dt, wallDt);
  if (state === "capture") {
    const duration = reducedEffects ? 1.2 : 1.45;
    if (captureTime < duration) {
      try {
        renderCaptureShot(renderer, camera.aspect, captureTime, reducedEffects);
        if (!wasPlaying) captureTime += dt;
      } catch (error) {
        // Failure of the optional capture effect must not soft-lock recovery.
        console.warn("Capture effect unavailable", error);
        save();
        caughtModal();
      }
    } else {
      renderer.render(scene, camera);
      caughtModal();
    }
  } else if (wasPlaying) {
    renderer.render(scene, camera);
  } else if (sceneDirty && !["error", "load"].includes(state)) {
    renderer.render(scene, camera);
  }
  sceneDirty = false;
  scheduleFrame();
}
// The custom pause/puzzle overlay claims aria-modal, so Tab focus must stay
// inside its visible controls instead of reaching the underlying gameplay HUD.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || $("dialog").hidden) return;
  const focusables = [...$("dialog").querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])',
  )].filter((element) => element.getClientRects().length > 0);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === $("panelTitle"))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (e.target instanceof HTMLButtonElement && ["Space", "Enter"].includes(e.code)) return;
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement
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
    keys.add(e.code);
  } else if (
    ["pause", "map", "help", "station", "puzzle"].includes(state) &&
    e.code === "Escape"
  ) {
    e.preventDefault();
    if (state === "map") returnFromMap();
    else if (state === "help") returnFromHelp();
    else resume();
  }
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
function backgroundSession() {
  if (state === "play") pauseGame();
  else if (state === "puzzle" || state === "capture") sound.pause(true);
  if (level && !["home", "won", "load", "error"].includes(state)) save();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    backgroundSession();
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  } else {
    last = performance.now();
    if (state === "puzzle" && document.hasFocus()) sound.pause(false);
    showSceneOnce();
  }
});
window.addEventListener("blur", backgroundSession);
window.addEventListener("focus", () => {
  if (!document.hidden && state === "puzzle") sound.pause(false);
});
window.addEventListener("pagehide", (e) => {
  if (e.persisted) {
    backgroundSession();
    return;
  }
  if (level && !["home", "won", "load", "error"].includes(state)) save();
  sound.pause(true);
  sound.dispose();
  releaseModelBytes();
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  renderer?.setAnimationLoop?.(null);
  renderer?.dispose();
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted && renderer) {
    last = performance.now();
    resize();
    if (state === "puzzle" && document.hasFocus()) sound.pause(false);
    showSceneOnce();
  }
});
function look(dx, dy) {
  if (hiddenSpot) return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  yaw = Math.atan2(Math.sin(yaw - dx * 0.00245), Math.cos(yaw - dx * 0.00245));
  pitch = THREE.MathUtils.clamp(pitch - dy * 0.0022, -1.18, 1.18);
}
document.addEventListener("mousemove", (e) => {
  if (state === "play" && renderer && document.pointerLockElement === renderer.domElement)
    look(e.movementX, e.movementY);
});
const wrap = $("viewWrap");
wrap.addEventListener("pointerdown", (e) => {
  if (state !== "play" || !renderer || e.target !== renderer.domElement ||
      document.pointerLockElement) return;
  lastPointerType = e.pointerType || "mouse";
  if (lastPointerType === "mouse") lockLook();
  if (!lookPointer.claim(e.pointerId)) return;
  lookLast = [e.clientX, e.clientY];
  if (!tryCapture(wrap, e.pointerId)) {
    lookPointer.release(e.pointerId);
    lookLast = null;
  }
});
wrap.addEventListener("pointermove", (e) => {
  if (
    state === "play" &&
    lookPointer.owns(e.pointerId) &&
    lookLast &&
    !document.pointerLockElement
  ) {
    look(e.clientX - lookLast[0], e.clientY - lookLast[1]);
    lookLast = [e.clientX, e.clientY];
  }
});
for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
  wrap.addEventListener(n, (e) => {
    if (lookPointer.release(e.pointerId)) lookLast = null;
  });
const stick = $("stick");
stick.addEventListener("pointerdown", (e) => {
  if (state !== "play" || !movePointer.claim(e.pointerId)) return;
  const b = stick.getBoundingClientRect();
  moveStart = [b.left + b.width / 2, b.top + b.height / 2];
  if (!tryCapture(stick, e.pointerId)) {
    movePointer.release(e.pointerId);
    moveStart = null;
    return;
  }
  stickMove(e);
});
function stickMove(e) {
  if (!movePointer.owns(e.pointerId) || !moveStart) return;
  let x = (e.clientX - moveStart[0]) / 36,
    y = (e.clientY - moveStart[1]) / 36;
  const a = Math.max(1, Math.hypot(x, y));
  pointer.x = x / a;
  pointer.y = y / a;
  $("stickknob").style.transform =
    "translate(" + pointer.x * 27 + "px," + pointer.y * 27 + "px)";
}
stick.addEventListener("pointermove", stickMove);
for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
  stick.addEventListener(n, (e) => {
    if (!movePointer.release(e.pointerId)) return;
    moveStart = null;
    pointer.x = pointer.y = 0;
    $("stickknob").style.transform = "";
  });
$("run").addEventListener("pointerdown", (e) => {
  if (state !== "play" || !runPointer.claim(e.pointerId)) return;
  if (!tryCapture($("run"), e.pointerId)) {
    runPointer.release(e.pointerId);
    return;
  }
  mobileRun = true;
});
for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
  $("run").addEventListener(n, (e) => {
    if (runPointer.release(e.pointerId)) mobileRun = false;
  });
document.addEventListener("pointerlockchange", () => {
  const locked = Boolean(renderer && document.pointerLockElement === renderer.domElement);
  if (wasPointerLocked && !locked && state === "play") pauseGame();
  wasPointerLocked = locked;
});
document.body.classList.toggle("touch", touch);
homepage();
