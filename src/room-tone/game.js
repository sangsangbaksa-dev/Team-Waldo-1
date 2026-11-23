import { renderPixelRatio } from '../shared/render-budget.ts';
import './style-polish.css';
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { modelBytes } from "./assets.js";
import { chapters, makeLevel, route, neighbors, paths, routeFrom, lineOpen, normalizeSave, walkable, puzzleOptions, puzzleCorrect } from "./levels.mjs";
import { buildEnvironment } from "./environment.js";
import { Sound } from "./sound.js";
import { archiveCells, cleanArchive, createDread, recordings } from "./dread.mjs";
import { openViewer } from "./viewer.js";
import { SPEED, chooseHideouts, senseThreat, hidingCheck } from "./stealth.mjs";

const $ = (id) => document.getElementById(id),
  C = 2.7,
  EYE_HEIGHT = 1.58,
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
let enemyRevealed = false, pursuitPose = 0, dangerOpacity = 0, catchTime = 0;
let hideouts=[],hiding=null,hideCompromised=false,hideCheck=0;
let noiseBurst=0,noiseTime=0,searchMode="patrol",litCells=new Set();
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
  lightOn = true,
  muted = false;
let now = 0,
  last = 0,
  frameStarted = false,
  sceneDirty = true,
  contextLost = false,
  nearest = null,
  moveId = -1,
  lookId = -1,
  moveStart = null,
  lookLast = null,
  mobileRun = false;
let noticeUntil = 0,
  saveAt = 0,
  lastCell = -1,
  choices = [],
  response = "",
  opening = false;
let guidance = read("rt-guidance") === true;
let guidePath = [];
let returnFromMap = resume;
const touch =
  matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let lastPointerType = matchMedia("(pointer:coarse)").matches ? "touch" : "mouse";
let draggingLook = false;
let lookTravel = 0;
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
  const raw = read(SAVE), normalized = normalizeSave(raw);
  return normalized ? { ...normalized, archive: cleanArchive(raw.archive) } : null;
}
function save() {
  try {
    localStorage.setItem(
      SAVE,
      JSON.stringify({ v: 1, ch, found, solved, seen: [...seen], elapsed, archive }),
    );
  } catch { /* Browser storage or pointer lock is optional. */ }
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
  for (const key of ["home", "game", "viewer"]) $(key).hidden = key !== id;
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
  $("completion").textContent = Number.isFinite(completion?.elapsed) && completion.elapsed >= 0
    ? "최근 탈출 기록  " + clock(completion.elapsed)
    : "";
}
$("inspect").onclick = () => {
  screens("viewer");
  openViewer();
};
$("back").onclick = homepage;
function clearInputs() {
  keys.clear();
  pointer.x = pointer.y = 0;
  moveId = lookId = -1;
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
  if (lastPointerType === "touch" || !renderer || document.pointerLockElement) return;
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
}
function resume() {
  state = "play";
  setGameModal(false);
  sound.pause(false);
  lockLook();
  last = performance.now();
  $("viewWrap").focus({ preventScroll: true });
}
function guide(fromHome = false) {
  if (fromHome) {
    $("how").showModal();
    return;
  }
  modal(
    "조작 안내",
    "모퉁이를 돌아 시야를 끊고, 추격이 멈출 때까지 기다리세요.",
    (el) => {
      el.innerHTML = $("guideText").innerHTML;
    },
    [["돌아가기", resume]],
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
  modal(
    "녹음 일시정지",
    chapters[ch].location + " · " + clock(elapsed),
    null,
    [
      ["계속하기", resume],
      ["녹음 기록 " + archive.length + " / 8", archivePanel],
      ["조작 안내", () => guide()],
      ["타이틀로", homepage, true],
    ],
    "pause",
  );
}
$("pauseGame").onclick = pauseGame;
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
    $("viewWrap").addEventListener("click", () => {
      if (state === "play" && !draggingLook) lockLook();
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
          offset: offset + (side === "L" ? 0 : Math.PI), knee: name === "Shin",
          reach: name === "UpperArm" ? (side === "L" ? -0.56 : -0.29) : 0});
      }
    }
    mixer = new THREE.AnimationMixer(model);
    if (gltf.animations.length) mixer.clipAction(gltf.animations[0]).play();
  }
  if (!frameStarted) {
    frameStarted = true;
    requestAnimationFrame(frame);
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
  return lineOpen(level.map, a, b, C);
}
function shift(dx, dz) {
  const r = 0.285; // Clearance from shallow wall equipment and corner trim.
  function space(x, z) {
    return (
      pass(x - r, z - r) &&
      pass(x + r, z - r) &&
      pass(x - r, z + r) &&
      pass(x + r, z + r) && !hideouts.some(o=>{const dx=x-o.root.position.x,dz=z-o.root.position.z;return Math.abs(dx*o.dx+dz*o.dz)<.36+r&&Math.abs(dx*o.dz-dz*o.dx)<o.width/2+r;})
    );
  }
  if (space(player.x + dx, player.z)) player.x += dx;
  if (space(player.x, player.z + dz)) player.z += dz;
}
function pointPlayer() {
  dread = createDread();
  hiding=null;hideCompromised=false;hideCheck=0;noiseBurst=noiseTime=0;searchMode="patrol";
  $("viewWrap").removeAttribute("data-hiding");$("stealthReadout").textContent="은신처를 확인하세요";$("torch").disabled=false;$("run").disabled=false;
  enemyStepDistance = 0;
  enemyRevealed = false;
  pursuitPose = dangerOpacity = 0;
  $("viewWrap").removeAttribute("data-incident");
  lamp.intensity = 28;
  lamp.visible = true;
  beam.intensity = 1.4;
  const p = xy(level.start);
  const next = xy(neighbors(level.map, level.start)[0]);
  player.set(p.x + (next.x - p.x) * 0.38, EYE_HEIGHT, p.z + (next.z - p.z) * 0.38);
  yaw = Math.atan2(-(next.x - p.x), -(next.z - p.z));
  pitch = 0;
  camera.rotation.set(0, yaw, 0, "YXZ");
  camera.position.copy(player);
  sceneDirty = true;
  stamina = 1;
  winded = false;
  lightOn = true;
  const far = xy(level.nest);
  entity.position.set(far.x, 0, far.z);
  entity.rotation.set(0, 0, 0);
  model.position.y = 0;
  model.rotation.set(0, 0, 0);
  path = [];
  nextPath = 0;
  lastKnown = -1;
  grace = 9;
  enemyPhase = 0;
  lastCell = -1;
  nearest = null;
  stepAt = moved = stride = gaitWeight = 0;
  noticeUntil = 0;
  $("toast").textContent = "";
  $("danger").style.opacity = "0";
  $("danger").removeAttribute("data-pursuit");
  $("strain").textContent = "안정";
  $("strain").dataset.threat = "safe";
  renderStamina();
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
function hideProp(spec,i){
 const root=new THREE.Group(),pos=xy(spec.cell),{dx,dz,kind}=spec;
 root.position.set(pos.x+dx*.89,0,pos.z+dz*.89);root.rotation.y=Math.atan2(-dx,-dz);props.add(root);
 const shell=paint(0x303336),trim=paint(0x727579),interior=paint(0x111214),tag=paint(0xc8c8c8,0x9a9a9a,.15);
 const box=(w,h,d,x,y,z,mat=shell)=>mesh(new THREE.BoxGeometry(w,h,d),mat,root,x,y,z);
 const desk=kind==="desk",width=desk?1.05:.85,height=desk?1.03:2.05;
 box(width,.05,.72,0,height,0,trim);box(width,height,.055,0,height/2,-.33,interior);
 for(const side of [-1,1])box(.055,height,.70,side*(width/2-.028),height/2,0);
 if(desk){box(width*.69,.48,.055,-width*.15,.26,.32);box(width,.07,.74,0,height+.055,0,trim);}
 else{
  box(width,.99,.055,0,.50,.33);box(width,.40,.055,0,1.84,.33);box(width,.42,.055,0,1.24,.33);
  box(.055,.17,.08,width*.32,1.16,.39,trim);
  for(let j=0;j<4;j++)box(.22,.018,.016,-.18,1.91-j*.055,.366,interior);
  if(kind==="booth")for(const side of [-1,1])box(.07,height,.075,side*(width/2-.04),height/2,.35,trim);
 }
 const name=desk?"책상 아래":kind==="booth"?"방음 부스":"철제 옷장";
 box(.19,.05,.014,0,desk?1.075:2.0,.38,tag);
 const sign=label(name,"#dedede");sign.position.y=height+.21;root.add(sign);
 return {...spec,type:"hide",i,root,name,width,eye:desk ? .68 : 1.57};
}
function noiseAtPlayer(strength,duration=.55){noiseBurst=Math.max(noiseBurst,strength);noiseTime=Math.max(noiseTime,duration);}
function exposedToFixture(){const cell=cellOf(player),p=xy(cell);return litCells.has(cell)&&Math.hypot(player.x-p.x,player.z-p.z)<1.1;}
function perceive(distance,clear,running=false,concealed=!!hiding){
 const e=entity.position,dx=player.x-e.x,dz=player.z-e.z,d=Math.max(distance,.001);
 const facing=(Math.sin(entity.rotation.y)*dx+Math.cos(entity.rotation.y)*dz)/d;
 const flashFacing=(Math.sin(yaw)*dx+Math.cos(yaw)*dz)*Math.cos(pitch)/d;
 return senseThreat({distance,clear,facing,flashFacing,lightOn,lit:exposedToFixture(),moving:moved>.001,running,noise:noiseTime>0?noiseBurst:0,hidden:concealed});
}
function leaveHide(){
 if(!hiding)return;
 const previous=hiding,spot=xy(previous.cell);hiding=null;hideCompromised=false;hideCheck=0;
 player.set(spot.x,EYE_HEIGHT,spot.z);yaw=Math.atan2(previous.dx,previous.dz);pitch=0;
 camera.position.copy(player);camera.rotation.set(pitch,yaw,0,"YXZ");
 lightOn=false;noiseAtPlayer(4.2);sound.pickup();
 $("viewWrap").removeAttribute("data-hiding");$("torch").disabled=false;$("run").disabled=false;
 clearInputs();renderHUD();message("은신처에서 나왔습니다 · 손전등 꺼짐",1.8);
}
function enterHide(o){
 const distance=Math.hypot(player.x-entity.position.x,player.z-entity.position.z),clear=clearLine(player,entity.position);
 hideCompromised=!grace&&(perceive(distance,clear,false,false).visual||(distance<2.4&&clear));
 const pos=xy(o.cell);player.set(pos.x,EYE_HEIGHT,pos.z);
 hiding=o;hideCheck=0;lightOn=false;yaw=Math.atan2(o.dx,o.dz);pitch=0;
 noiseAtPlayer(3.4,.42);sound.pickup();
 if(hideCompromised){lastKnown=o.cell;enemyPhase=7;searchMode="search";nextPath=0;}
 $("viewWrap").dataset.hiding=o.kind;$("torch").disabled=true;$("run").disabled=true;
 clearInputs();renderHUD();nearest=null;
 message(hideCompromised?"들켰을 수 있습니다. 적이 은신처를 확인합니다.":"숨었습니다. 발소리가 멀어질 때까지 기다리세요.",3);
}

function loadScene() {
  model.removeFromParent();
  if (environment?.userData?.dispose) environment.userData.dispose();
  else disposeGroup(environment);
  disposeGroup(props);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(
    [0x101010, 0x121212, 0x151515, 0x0d0d0d][ch],
  );
  scene.fog = new THREE.FogExp2(scene.background, 0.078);
  camera = new THREE.PerspectiveCamera(68, 1, 0.045, 65);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x292929, 0.43));
  const fill = new THREE.DirectionalLight(0xffffff, 0.17);
  fill.position.set(4, 6, 2);
  scene.add(fill);
  lamp = new THREE.SpotLight(0xffffff, 28, 24, 0.49, 0.57, 1.05);
  camera.add(lamp);
  lamp.position.set(0.16, -0.11, -0.12);
  lamp.target.position.set(0, 0, -7.5);
  camera.add(lamp.target);
  beam = new THREE.PointLight(0xffffff, 1.4, 4.1, 1.3);
  camera.add(beam);
  environment = buildEnvironment(THREE, scene, level.map, C, ch);
  litCells=new Set(environment.userData.litCells);
  props = new THREE.Group();
  scene.add(props);
  items = level.items.map((cell, i) => prop(cell, "item", i));
  items.forEach((o) => (o.root.visible = !found[o.i]));
  items.push(prop(level.start, "station"), prop(level.exit, "exit"));
  const records=archiveCells(level);
  records.forEach((cell,i)=>{
    const record=prop(cell,"record",i);
    record.root.visible=!archive.includes(ch*2+i);
    items.push(record);
  });
  hideouts=chooseHideouts(level,records).map(hideProp);items.push(...hideouts);
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
        '</p><p class="hint">도면에서 장비와 출구 방향을 확인하세요. 옷장, 책상 아래, 방음 부스에 숨을 수 있습니다. 손전등과 발소리에 주의하세요. 구역마다 숨은 녹음 기록 2개가 있습니다. 진행 상황은 자동 저장됩니다.</p>';
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
  refreshGuide();
}
function renderStamina() {
  const fill = $("stamina"), meter = fill.parentElement;
  const percent = String(Math.round(stamina * 100));
  fill.style.transform = "scaleX(" + stamina.toFixed(3) + ")";
  fill.classList.toggle("winded", winded);
  if (meter.getAttribute("aria-valuenow") !== percent) {
    meter.setAttribute("aria-valuenow", percent);
    $("staminaText").textContent = percent + "%";
  }
}
function toggleLamp() {
  if (state !== "play" || hiding) return;
  lightOn = !lightOn;
  renderHUD();
  message("손전등 " + (lightOn ? "켜짐" : "꺼짐"), 1);
}
$("torch").onclick = toggleLamp;

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
  const hidden = guidePath.length === 0;
  if (arrow.hidden !== hidden) arrow.hidden = hidden;
  if (!guidePath.length) return;
  const next = xy(guidePath[0]);
  const angle = Math.atan2(next.x - player.x, -(next.z - player.z));
  const transform = "rotate(" + (angle + yaw) + "rad)";
  if (arrow.style.transform !== transform) arrow.style.transform = transform;

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
    else if(shape==="diamond"){ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();}
    else ctx.arc(x, y, 4.6, 0, Math.PI * 2);
    ctx.fill();
  };
  level.items.forEach((id, i) => {
    if (!found[i]) dot(id, "#e4a36d", "square");
  });
  for(const record of items) if(record.type==="record" && record.root.visible && seen.has(record.cell)) dot(record.cell,"#c9a5df","circle");
  for(const o of hideouts)if(seen.has(o.cell))dot(o.cell,"#eeeeee","diamond");
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
      p.innerHTML += "<i>● 발견된 녹음 기록</i><i>◆ 발견한 은신처</i>";
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
  },[["돌아가기",resume]],"archive");
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
  sound.pause(false);
}
function interact() {
  if(state!=="play")return;
  if(hiding){leaveHide();return;}
  if(!nearest)return;
  const o = nearest,
    c = chapters[ch];
  if (!o.root.visible || Math.hypot(o.root.position.x - player.x, o.root.position.z - player.z) >= (o.type==="hide"?1.65:2.16) ||
      !clearLine(player, o.root.position)) return;
  if(o.type==="hide"){enterHide(o);return;}
  noiseAtPlayer(o.type==="item"?14:o.type==="record"?5.5:8,.9);
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
    // Equipment noise is limited by the acoustic range.
    o.root.visible = false;
    sound.pickup();
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
          "</strong><span>회수 기록</span><strong>" + archive.length + " / 8</strong></div>";
      },
      [["타이틀로", homepage]],
      "won",
    );
  }
}
$("act").onclick = interact;
function caught() {
  // Preserve progress at contact, before the brief final encounter begins.
  if(hiding){leaveHide();lamp.visible=true;lamp.intensity=28;}
  save();
  sound.caught();
  clearInputs();
  state = "catching";
  catchTime = 0;
  $("danger").dataset.pursuit = "caught";
  $("danger").style.opacity = "0.94";
  if (reducedMotion.matches) finishCaught();
}
function finishCaught() {
  modal(
    "신호가 끊겼습니다",
    "회수한 장비와 복원 기록은 보존됩니다. 손전등을 끄고 모퉁이를 돌아 시야를 끊은 뒤 은신처에 숨으세요.",
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
  const visible=dist<=16&&clearLine(player,e),sense=perceive(dist,visible,running);
  const inSight=sense.visual,hear=sense.heard,tracking=!grace&&(inSight||hear),playerCell=cellOf(player);
  if(tracking){if(lastKnown!==playerCell||(inSight&&searchMode!=="chase"))nextPath=0;lastKnown=playerCell;enemyPhase=inSight?7:5.5;searchMode=inSight?"chase":"search";}
  else{enemyPhase=Math.max(0,enemyPhase-dt);if(searchMode==="chase")searchMode="search";if(!enemyPhase)searchMode="patrol";}
  if(hiding&&hideCompromised&&!grace){hideCheck=hidingCheck(true,dist,hideCheck,dt);if(hideCheck>=1.35){caught();return;}}else hideCheck=0;

  nextPath -= dt;
  const ec = cellOf(e);
  const directChase = tracking && inSight && ec === playerCell;
  if (directChase) {
    // A direct pursuit changes the actual position; discard stale corridor waypoints.
    path = [];
    nextPath = 0;
  } else if (nextPath <= 0) {
    nextPath = enemyPhase ? 0.35 : 1.7;
    // Replan from the next corridor center. This keeps sharp turns out of walls.
    const anchor = path[0] ?? ec;
    let goal = lastKnown;
    if(enemyPhase&&!tracking&&anchor===lastKnown&&!(hiding&&hideCompromised)){const nearby=neighbors(level.map,anchor).filter(k=>k!==level.start);goal=nearby[Math.floor(Math.random()*nearby.length)]??anchor;lastKnown=goal;}
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
  const destination = directChase ? player
    : path.length ? xy(path[0]) : null;
  if (destination) {
    const x = destination.x - e.x;
    const z = destination.z - e.z;
    const d = Math.hypot(x, z);
    const v = ((searchMode==="chase"?SPEED.chase:searchMode==="search"?SPEED.investigate:SPEED.patrol)+ch*.085)*dt;
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
  }
  const travel = Math.hypot(e.x - startX, e.z - startZ);
  const dx = e.x - player.x, dz = e.z - player.z;
  const proximity = Math.hypot(dx, dz);
  const exposed = proximity < 17 && clearLine(player, e);
  const pan = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(proximity, 0.1);
  const pursuing = enemyPhase > 0;
  if (!pursuing) enemyRevealed = false;
  if (!enemyRevealed && tracking && exposed && proximity < 10.7) {
    enemyRevealed = true;
    sound.enemyReveal(pan, proximity);
  }
  enemyStepDistance += travel;
  const stepLength = pursuing ? 0.68 : 0.82;
  if (enemyStepDistance >= stepLength) {
    enemyStepDistance -= stepLength;
    if (proximity < 17 && !grace) sound.enemyStep(proximity, pan, exposed, pursuing);
  }
  stride += travel * 5.5;
  gaitWeight = THREE.MathUtils.damp(gaitWeight, Math.min(1, travel / Math.max(dt, 0.001)), 9, dt);
  pursuitPose = THREE.MathUtils.damp(pursuitPose, pursuing ? 1 : 0, 7, dt);
  const lurch = reducedMotion.matches ? 0 : Math.sin(stride) * gaitWeight;
  model.position.y = 0.01 - pursuitPose * 0.11 + 0.035 * Math.abs(lurch);
  model.rotation.x = pursuitPose * (0.23 + 0.055 * lurch);
  model.rotation.z = 0.035 + lurch * (0.024 + pursuitPose * 0.055);
  mixer.update(dt * (pursuing ? 1.25 : 0.75));
  for (const joint of gait) {
    const swing = Math.sin(stride + joint.offset);
    joint.bone.quaternion.copy(joint.rest);
    const walk = joint.amplitude * gaitWeight * (joint.knee ? Math.max(0, swing) : swing);
    joint.bone.rotateOnAxis(joint.axis, walk * (1 + pursuitPose * 0.25) + joint.reach * pursuitPose);
  }
  const threat = grace
    ? 0
    : Math.max(0, 1 - proximity / 12) * (exposed ? 0.96 : 0.57);
  sound.threat(threat);
  const closingIn = pursuing && exposed && proximity < 8;
  const danger = $("danger");
  const dangerMode = closingIn ? "chase" : "quiet";
  if (danger.dataset.pursuit !== dangerMode) danger.dataset.pursuit = dangerMode;
  dangerOpacity = THREE.MathUtils.damp(dangerOpacity, threat * (closingIn ? 0.92 : 0.68), 6, dt);
  danger.style.opacity = dangerOpacity.toFixed(3);
  const strain = $("strain");
  const status=hiding?(hideCheck>0?"은신처 확인 중":threat>.28?"숨는 중 · 근처 기척":"은신 중"):searchMode==="chase"?"빛·시야 감지 / 추격":searchMode==="search"?"소리·흔적 수색":threat>.28?"기척 감지":"안정";
  if (strain.textContent !== status) strain.textContent = status;
  strain.dataset.threat = threat > 0.68 || closingIn ? "near" : threat > 0.28 ? "alert" : "safe";
  const readout=hiding?(hideCheck>0?"발각 위험 · E로 탈출":"은신 중 · E로 나오기"):(sense.noise>9?"소음 높음":sense.noise>0?"소음 낮음":"정숙")+"  /  "+(lightOn?"손전등 노출":exposedToFixture()?"조명 아래":"어둠");
  if($("stealthReadout").textContent!==readout)$("stealthReadout").textContent=readout;
  if(!grace&&!hiding&&proximity<.82&&exposed)caught();
}
function pathsDistXZ(a, b) {
  return (
    Math.abs((a % level.w) - (b % level.w)) +
    Math.abs(Math.floor(a / level.w) - Math.floor(b / level.w))
  );
}
function update(dt) {
  elapsed += dt;
  let f =
    (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
    (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
    pointer.y;
  let r = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + pointer.x;
  if (keys.has("ArrowLeft")) yaw += dt * 1.55;
  if (keys.has("ArrowRight")) yaw -= dt * 1.55;
  const length = Math.hypot(f, r);
  if (length > 1) {
    f /= length;
    r /= length;
  }
  const sprintHeld = keys.has("ShiftLeft") || keys.has("ShiftRight") || mobileRun;
  if (stamina <= 0.045) winded = true;
  else if (!sprintHeld || stamina >= 0.3) winded = false;
  const running = !hiding && sprintHeld && !winded && length > 0.1;
  const scale = (hiding ? 0 : running ? SPEED.sprint : SPEED.walk) * dt,
    oldX = player.x,
    oldZ = player.z;
  shift(
    (-Math.sin(yaw) * f + Math.cos(yaw) * r) * scale,
    (-Math.cos(yaw) * f - Math.sin(yaw) * r) * scale,
  );
  moved = Math.hypot(player.x - oldX, player.z - oldZ);
  noiseTime=Math.max(0,noiseTime-dt);if(!noiseTime)noiseBurst=0;
  const exerting = running && moved > dt * 0.15;
  stamina = THREE.MathUtils.clamp(stamina + (exerting ? -0.14 : 0.11) * dt, 0, 1);
  renderStamina();
  stepAt += moved;
  if (stepAt > (running ? 1.02 : 0.86)) {
    sound.step(running);
    stepAt = 0;
  }
  camera.position.set(
    player.x,
    EYE_HEIGHT + (reducedMotion.matches ? 0 :
      Math.sin(elapsed * (running ? 12 : 8.3)) * Math.min(moved, 0.05) * 0.38),
    player.z,
  );
  if(hiding){camera.position.set(hiding.root.position.x,hiding.eye,hiding.root.position.z);const target=Math.atan2(hiding.dx,hiding.dz);const angle=Math.atan2(Math.sin(yaw-target),Math.cos(yaw-target));yaw=target+THREE.MathUtils.clamp(angle,-.14,.14);pitch=THREE.MathUtils.clamp(pitch,-.10,.10);}
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  lamp.visible=lightOn&&!hiding;
  beam.intensity=THREE.MathUtils.damp(beam.intensity,hiding ? .10 : lightOn ? 1.4 : .24,8,dt);
  enemyUpdate(dt, running);
  if (state !== "play") return;
  const event=dread.tick(dt,!hiding && !grace && !enemyPhase && moved>dt*.3 && !solved && now>noticeUntil);
  if(event?.started){
    sound.incident(event.kind,Math.random()<.5?-.83:.83);
    message(event.caption,event.duration);
  }
  const dim=event?.kind==="drop" && !reducedMotion.matches?Math.sin(Math.PI*event.age/event.duration):0;
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
    if (d < reach && (o.type!=="hide"||d<1.65) && clearLine(player, q)) {
      nearest = o;
      reach = d;
    }
  }
  const caption=hiding?"은신처에서 나오기":nearest
    ? nearest.type==="hide"?nearest.name+"에 숨기":nearest.type === "item"
      ? chapters[ch].item + " 회수"
      : nearest.type === "exit"
        ? (solved ? "출구 작동" : "잠긴 출구 확인")
        : nearest.type === "record" ? "녹음 기록 회수" : chapters[ch].station + " 확인"
    : "";
  const prompt = $("prompt"), promptText = $("promptText"), act = $("act");
  if (prompt.hidden !== !caption) prompt.hidden = !caption;
  if (promptText.textContent !== caption) promptText.textContent = caption;
  const canAct=!!hiding||!!nearest;
  if(act.disabled===canAct)act.disabled=!canAct;
  const actLabel=hiding?"나오기":nearest?.type==="hide"?"숨기":"조사";if(act.textContent!==actLabel)act.textContent=actLabel;
  const timer = $("timer"), timeText = clock(elapsed);
  if (timer.textContent !== timeText) timer.textContent = timeText;
  if (now > noticeUntil && $("toast").textContent) $("toast").textContent = "";
  if (now > saveAt) {
    save();
    saveAt = now + 12;
  }
}
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.075, Math.max(0, (ts - last) / 1000));
  last = ts;
  now = ts / 1000;
  if (document.hidden || contextLost || !scene || $("game").hidden) return;
  if (state === "play") {
    update(dt);
    renderer.render(scene, camera);
    sceneDirty = false;
  } else if (state === "catching") {
    // Hold the encounter in the world long enough to see what reached you.
    catchTime += dt;
    const targetYaw = Math.atan2(-(entity.position.x - player.x), -(entity.position.z - player.z));
    const turn = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
    yaw += turn * (1 - Math.exp(-9 * dt));
    camera.rotation.set(THREE.MathUtils.damp(camera.rotation.x, -0.08, 7, dt), yaw, 0, "YXZ");
    model.rotation.x = THREE.MathUtils.damp(model.rotation.x, 0.48, 8, dt);
    mixer.update(dt * 0.55);
    renderer.render(scene, camera);
    if (catchTime >= 0.8) finishCaught();
  } else if (sceneDirty && !["load", "error"].includes(state)) {
    // Static modal backgrounds only need a new frame after a scene/size change.
    renderer.render(scene, camera);
    sceneDirty = false;
  }
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
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement ||
    e.target instanceof HTMLTextAreaElement ||
    (e.target instanceof HTMLElement && e.target.isContentEditable)
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
      else if (e.code === "KeyG") toggleGuide();
      else if (e.code === "KeyM") mapPanel();
      else if (e.code === "Escape" || e.code === "KeyP") pauseGame();
    }
    if (state === "play") keys.add(e.code);
  } else if (
    ["pause", "map", "help", "station", "puzzle"].includes(state) &&
    e.code === "Escape"
  ) {
    e.preventDefault();
    if (state === "map") returnFromMap();
    else resume();
  }
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
// Escape may be consumed by the browser while releasing pointer lock.
let hadPointerLock = false;
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === renderer?.domElement;
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
  if (document.hidden && state === "play") pauseGame();
});
window.addEventListener("blur", () => {
  if (state === "play") pauseGame();
});
window.addEventListener("pagehide", () => {
  if (state === "play") save();
});
function look(dx, dy) {
  yaw -= dx * 0.00245;
  pitch = THREE.MathUtils.clamp(pitch - dy * 0.0022, -1.18, 1.18);
}
document.addEventListener("mousemove", (e) => {
  if (state === "play" && document.pointerLockElement)
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
  wrap.setPointerCapture(e.pointerId);
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
  if (state !== "play" || moveId !== -1) return;
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
  const a = Math.max(1, Math.hypot(x, y));
  pointer.x = x / a;
  pointer.y = y / a;
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
  mobileRun = true;
  $("run").setPointerCapture(e.pointerId);
});
for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
  $("run").addEventListener(n, () => (mobileRun = false));
document.body.classList.toggle("touch", touch);
homepage();
