import { modelBytes } from "./assets.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage"),
  image = $("still"),
  note = $("notice"),
  play = $("play"),
  orbit = $("orbit");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let mode = "face",
  renderer,
  camera,
  controls,
  mixer,
  action,
  duration = 4,
  playing = !reduce;
let fallback = false,
  transition = null,
  rotation = false,
  last = 0;
let dirty = true;
let frameId = null;
let wakeViewer = () => {};
const presets = { face: { y: 1.774, d: 0.86 }, body: { y: 1.0, d: 3.55 } };
const up = new THREE.Vector3(0, 1, 0);
function updateButtons() {
  $("face").setAttribute("aria-pressed", String(mode === "face"));
  $("body").setAttribute("aria-pressed", String(mode === "body"));
  orbit.setAttribute("aria-pressed", String(rotation));
  play.setAttribute("aria-pressed", String(playing));
  $("playlabel").textContent = playing ? "동작 정지" : "동작 재생";
  $("playicon").textContent = playing ? "Ⅱ" : "▷";
}
function showFallback() {
  fallback = true;
  stage.classList.remove("ready");
  stage.classList.add("fallback");
  image.src = $(
    mode === "face" ? "closeimage" : "bodyimage",
  ).textContent.trim();
  note.textContent = "이 브라우저에서는 렌더 이미지로 표시됩니다.";
  for (const b of [orbit, play]) b.disabled = true;
  $("scrub").disabled = true;
  updateButtons();
}
function selectMode(next, instant = false) {
  dirty = true;
  mode = next;
  updateButtons();
  image.src = $(
    mode === "face" ? "closeimage" : "bodyimage",
  ).textContent.trim();
  if (!camera || !controls || fallback) return;
  const p = presets[mode],
    narrow = Math.max(1, 0.68 / camera.aspect);
  const end = new THREE.Vector3(0.012, p.y, 0),
    pos = end
      .clone()
      .add(
        new THREE.Vector3(mode === "face" ? -0.045 : 0.26, 0.014, p.d * narrow),
      );
  if (instant || reduce) {
    controls.target.copy(end);
    camera.position.copy(pos);
    transition = null;
    controls.update();
  } else
    transition = {
      t: 0,
      begin: camera.position.clone(),
      target: controls.target.clone(),
      pos,
      end,
    };
}
$("face").onclick = () => selectMode("face");
$("body").onclick = () => selectMode("body");
orbit.onclick = () => {
  if (!controls) return;
  rotation = !rotation;
  controls.autoRotate = rotation;
  updateButtons();
};
play.onclick = () => {
  playing = !playing;
  updateButtons();
};
const fmt = (t) => t.toFixed(2).padStart(5, "0");
function seek(t) {
  dirty = true;
  if (mixer && action) {
    action.time = t === duration ? t - 0.0001 : t;
    mixer.update(0);
  }
  $("time").value = fmt(t);
}
$("scrub").oninput = (e) => {
  playing = false;
  updateButtons();
  seek((Number(e.target.value) / 1000) * duration);
};
function responsive() {
  if (!renderer) return;
  const w = stage.clientWidth,
    h = stage.clientHeight;
  if (!camera || w <= 0 || h <= 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  dirty = true;
}
async function run() {
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    stage.insertBefore(renderer.domElement, image);
    renderer.domElement.setAttribute(
      "aria-label",
      "드래그로 회전하고 스크롤 또는 두 손가락으로 확대하는 3D 캐릭터",
    );
    renderer.domElement.tabIndex = 0;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    camera = new THREE.PerspectiveCamera(34, 1, 0.012, 26);
    const scene = new THREE.Scene();
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.13;
    controls.enablePan = false;
    controls.minDistance = 0.25;
    controls.maxDistance = 6.2;
    controls.maxPolarAngle = Math.PI * 0.86;
    controls.autoRotateSpeed = 0.7;
    controls.addEventListener("change", () => { dirty = true; });
    controls.addEventListener("start", () => {
      transition = null;
    });
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      showFallback();
    });
    scene.add(new THREE.HemisphereLight(0xe1e7e2, 0x57574f, 1.27));
    function light(c, n, x, y, z) {
      const l = new THREE.DirectionalLight(c, n);
      l.position.set(x, y, z);
      scene.add(l);
    }
    light(0xffe1bd, 2.15, -2, 3, 3);
    light(0x7a9cad, 0.72, 2, 1, 2);
    light(0xf29c63, 2.9, 1.5, 2, -1.5);
    light(0x9ac8c7, 1.2, -2, 1, -1);
    const g = await new GLTFLoader().parseAsync(await modelBytes(), "");
    scene.add(g.scene);
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
      }
    });
    mixer = new THREE.AnimationMixer(g.scene);
    if (g.animations.length) {
      action = mixer.clipAction(g.animations[0]);
      action.play();
      duration = g.animations[0].duration;
    }
    // A soft grounding shadow follows the model at the floor.
    const pad = document.createElement("canvas");
    pad.width = pad.height = 96;
    const ctx = pad.getContext("2d");
    const grad = ctx.createRadialGradient(48, 48, 0, 48, 48, 46);
    grad.addColorStop(0, "rgba(0,0,0,.78)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 96, 96);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.04, 0.64),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(pad),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.003;
    scene.add(shadow);
    new ResizeObserver(responsive).observe(stage);
    responsive();
    selectMode(mode, true);
    updateButtons();
    renderer.domElement.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "+", "=", "-", "Home"].includes(e.key))
        return;
      e.preventDefault();
      transition = null;
      const diff = camera.position.clone().sub(controls.target);
      if (e.key === "Home") {
        selectMode(mode, true);
        return;
      }
      if (e.key.startsWith("Arrow"))
        diff.applyAxisAngle(up, e.key === "ArrowLeft" ? -0.15 : 0.15);
      else
        diff.setLength(
          THREE.MathUtils.clamp(
            diff.length() * (e.key === "-" ? 1.12 : 0.88),
            controls.minDistance,
            controls.maxDistance,
          ),
        );
      camera.position.copy(controls.target).add(diff);
      controls.update();
    });
    stage.classList.add("ready");
    note.textContent = "드래그로 회전 · 스크롤로 확대";
    function frame(ts) {
      frameId = null;
      if (fallback || document.hidden || $("viewer").hidden) return;
      const dt = Math.max(0, Math.min((ts - last) / 1000 || 0, 0.1));
      last = ts;
      if (playing && action) {
        mixer.update(dt);
        dirty = true;
        $("scrub").value = Math.round((action.time / duration) * 1000);
        $("time").value = fmt(action.time);
      }
      if (transition) {
        dirty = true;
        transition.t = Math.min(1, transition.t + dt * 2.65);
        const t = transition.t,
          e = t * t * (3 - 2 * t);
        controls.target.lerpVectors(transition.target, transition.end, e);
        camera.position.lerpVectors(transition.begin, transition.pos, e);
        if (t === 1) transition = null;
      }
      controls.update(dt);
      if (dirty || rotation) {
        renderer.render(scene, camera);
        dirty = false;
      }
      if (!fallback && !document.hidden && !$("viewer").hidden)
        frameId = requestAnimationFrame(frame);
    }
    wakeViewer = () => {
      if (frameId !== null || fallback || document.hidden || $("viewer").hidden) return;
      last = performance.now();
      dirty = true;
      frameId = requestAnimationFrame(frame);
    };
    wakeViewer();
  } catch (err) {
    console.error("3D viewer", err);
    showFallback();
  }
}
let opened = false;
export function openViewer() {
  if (!opened) {
    opened = true;
    updateButtons();
    run();
  } else {
    responsive();
    wakeViewer();
  }
}
export function closeViewer() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) closeViewer();
  else wakeViewer();
});
