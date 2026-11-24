import * as THREE from "../vendor/three.module.js";
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101c17);
scene.fog = new THREE.Fog(0x101c17, 18, 65);
const camera = new THREE.PerspectiveCamera(
  70,
  innerWidth / innerHeight,
  0.1,
  120,
);
camera.position.set(0, 1.7, 0);
camera.rotation.order = "YXZ";
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.querySelector("#game").appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0x94c8ad, 0x202014, 1.5));
const moon = new THREE.DirectionalLight(0xd8f6d1, 1.1);
moon.position.set(5, 12, 4);
scene.add(moon);
const mat = (c) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat(0x27332b));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 120), mat(0x19231f));
road.rotation.x = -Math.PI / 2;
road.position.y = 0.01;
scene.add(road);
for (let z = -60; z < 60; z += 6) {
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.02, 2.5),
    mat(0x84966c),
  );
  stripe.position.set(0, 0.03, z);
  scene.add(stripe);
}
const buildingMats = [mat(0x273d30), mat(0x344337), mat(0x25392f)];
for (let side of [-1, 1])
  for (let z = -55; z < 55; z += 9) {
    const h = 5 + Math.random() * 9,
      w = 5 + Math.random() * 4;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 7),
      buildingMats[Math.floor(Math.random() * 3)],
    );
    b.position.set(side * (12 + w / 2), h / 2, z);
    scene.add(b);
    for (let y = 2; y < h - 1; y += 2.5)
      for (let dz = -2; dz <= 2; dz += 2) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(0.7, 1),
          new THREE.MeshBasicMaterial({
            color: Math.random() > 0.6 ? 0xafd674 : 0x16271f,
          }),
        );
        win.position.set(side * 11.98, y, z + dz);
        win.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(win);
      }
  }
for (let z = -48; z <= 48; z += 16)
  for (let x of [-7, 7]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 5),
      mat(0x27372b),
    );
    pole.position.set(x, 2.5, z);
    scene.add(pole);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xc7ff83 }),
    );
    lamp.position.set(x, 5, z);
    scene.add(lamp);
    const light = new THREE.PointLight(0xaaff78, 14, 13);
    light.position.copy(lamp.position);
    scene.add(light);
  }
const gun = new THREE.Group();
const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.3, 0.85),
  mat(0x334c3e),
);
gunBody.position.set(0.42, -0.38, -0.65);
gun.add(gunBody);
const barrel = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.14, 0.5),
  new THREE.MeshStandardMaterial({ color: 0xaaff66, emissive: 0x35621a }),
);
barrel.position.set(0.42, -0.31, -1.1);
gun.add(barrel);
camera.add(gun);
scene.add(camera);
const $ = (s) => document.querySelector(s),
  overlay = $("#overlay"),
  button = $("#start"),
  message = $("#message");
let enemies = [],
  health = 100,
  wave = 0,
  active = false,
  ended = false,
  keys = {},
  yaw = 0,
  pitch = 0,
  lastShot = 0,
  intermission = 0,
  ammo = 12,
  reloading = 0,
  audioCtx = null,
  started = false;
const ray = new THREE.Raycaster(),
  clock = new THREE.Clock();
function zombie() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1, 0.42),
    mat(0x577458),
  );
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.55, 0.52),
    mat(0x91aa76),
  );
  head.position.y = 1.85;
  group.add(head);
  for (let x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.07, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xe0ff85 }),
    );
    eye.position.set(x, 1.9, 0.27);
    group.add(eye);
  }
  for (let x of [-0.5, 0.5]) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.8, 0.22),
      mat(0x678361),
    );
    arm.position.set(x, 1.14, 0.18);
    arm.rotation.x = -0.8;
    group.add(arm);
  }
  for (let x of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.65, 0.3),
      mat(0x283e32),
    );
    leg.position.set(x, 0.32, 0);
    group.add(leg);
  }
  const angle = Math.random() * Math.PI * 2,
    dist = 18 + Math.random() * 10;
  group.position.set(
    camera.position.x + Math.sin(angle) * dist,
    0,
    camera.position.z + Math.cos(angle) * dist,
  );
  group.userData = {
    hp: 2,
    speed: 1.2 + wave * 0.22,
    attack: 0,
    phase: Math.random() * 6,
  };
  scene.add(group);
  enemies.push(group);
}
function updateHUD() {
  $("#ammo").textContent = reloading > 0 ? "재장전 중" : ammo + " / 12";
  $("#health").textContent = Math.max(0, health);
  $("#healthbar").style.width = Math.max(0, health) + "%";
  $("#wave").innerHTML = String(wave).padStart(2, "0") + " <i>/</i> 03";
  $("#remaining").textContent = enemies.length;
}
function nextWave() {
  ammo = 12;
  reloading = 0;
  wave++;
  for (let i = 0; i < 3 + wave * 2; i++) zombie();
  message.textContent = "WAVE " + String(wave).padStart(2, "0");
  setTimeout(() => {
    if (active) message.textContent = "";
  }, 1800);
  updateHUD();
}
function start() {
  for (const e of enemies) scene.remove(e);
  enemies = [];
  health = 100;
  wave = 0;
  ended = false;
  active = true;
  started = true;
  intermission = 0;
  ammo = 12;
  reloading = 0;
  message.textContent = "";
  camera.position.set(0, 1.7, 0);
  yaw = 0;
  pitch = 0;
  keys = {};
  overlay.classList.add("hidden");
  nextWave();
  renderer.domElement.requestPointerLock();
}
function end(win) {
  active = false;
  ended = true;
  document.exitPointerLock();
  overlay.classList.remove("hidden");
  $(".kicker").textContent = win ? "MISSION COMPLETE" : "GAME OVER";
  $("h1").innerHTML = win
    ? "밤을 <em>이겨냈다</em>"
    : "다시 <em>도전하세요</em>";
  $(".description").innerHTML = win
    ? "세 번의 웨이브를 모두 막아냈어요.<br>오늘 밤의 생존자는 바로 당신입니다."
    : "좀비들에게 둘러싸였어요.<br>다시 일어나 밤을 지켜내세요.";
  button.innerHTML = "다시 시작하기 <span>↗</span>";
}
button.addEventListener("click", () => {
  if (active && started) {
    overlay.classList.add("hidden");
    renderer.domElement.requestPointerLock();
  } else start();
});
document.addEventListener("pointerlockchange", () => {
  if (active && document.pointerLockElement !== renderer.domElement) {
    keys = {};
    overlay.classList.remove("hidden");
    $(".kicker").textContent = "PAUSED";
    $("h1").innerHTML = "잠시 <em>쉬어가기</em>";
    $(".description").innerHTML =
      "게임이 일시정지되었어요.<br>준비되면 다시 시작하세요.";
    button.innerHTML = "계속하기 <span>↗</span>";
  }
});
document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (
    e.code === "KeyR" &&
    active &&
    document.pointerLockElement === renderer.domElement &&
    ammo < 12 &&
    reloading <= 0
  ) {
    reloading = 1.15;
    updateHUD();
  }
});
document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});
document.addEventListener("mousemove", (e) => {
  if (active && document.pointerLockElement === renderer.domElement) {
    yaw -= e.movementX * 0.002;
    pitch = Math.max(-1, Math.min(1, pitch - e.movementY * 0.002));
    camera.rotation.set(pitch, yaw, 0);
  }
});
renderer.domElement.addEventListener("click", () => {
  if (!active) return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
    return;
  }
  const now = performance.now();
  if (now - lastShot < 220) return;
  if (reloading > 0 || ammo <= 0) {
    if (ammo <= 0 && reloading <= 0) {
      reloading = 1.15;
      updateHUD();
    }
    return;
  }
  lastShot = now;
  ammo--;
  updateHUD();
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator(),
      g = audioCtx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(260, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(70, audioCtx.currentTime + 0.09);
    g.gain.setValueAtTime(0.08, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.1);
  } catch (e) {}
  $("#crosshair").classList.add("firing");
  setTimeout(() => $("#crosshair").classList.remove("firing"), 100);
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = ray.intersectObjects(enemies, true);
  if (hits.length) {
    let target = hits[0].object;
    while (target.parent && !enemies.includes(target)) target = target.parent;
    if (enemies.includes(target)) {
      target.userData.hp--;
      target.position.add(
        new THREE.Vector3(Math.sin(yaw) * -0.5, 0, Math.cos(yaw) * -0.5),
      );
      if (target.userData.hp <= 0) {
        scene.remove(target);
        enemies.splice(enemies.indexOf(target), 1);
        updateHUD();
      }
    }
  }
  gun.position.z = 0.16;
  setTimeout(() => (gun.position.z = 0), 90);
});
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (active && document.pointerLockElement === renderer.domElement) {
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) {
        reloading = 0;
        ammo = 12;
        updateHUD();
      }
    }
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
      right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let move = new THREE.Vector3();
    if (keys.KeyW) move.add(forward);
    if (keys.KeyS) move.sub(forward);
    if (keys.KeyD) move.add(right);
    if (keys.KeyA) move.sub(right);
    if (move.length())
      camera.position.add(move.normalize().multiplyScalar(dt * 6));
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -10, 10);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -53, 53);
    for (const e of enemies) {
      const d = new THREE.Vector3(
          camera.position.x - e.position.x,
          0,
          camera.position.z - e.position.z,
        ),
        dist = d.length();
      e.lookAt(camera.position.x, 0, camera.position.z);
      if (dist > 1.25)
        e.position.add(d.normalize().multiplyScalar(e.userData.speed * dt));
      e.userData.attack -= dt;
      if (dist < 1.5 && e.userData.attack <= 0) {
        health -= 10;
        e.userData.attack = 1;
        updateHUD();
        $("#hit").classList.add("active");
        setTimeout(() => $("#hit").classList.remove("active"), 200);
        if (health <= 0) {
          end(false);
          break;
        }
      }
    }
    if (!enemies.length && !intermission) {
      intermission = 2;
      message.textContent = wave === 3 ? "생존 성공!" : "웨이브 클리어";
    }
    if (intermission) {
      intermission -= dt;
      if (intermission <= 0) {
        intermission = 0;
        if (wave === 3) end(true);
        else nextWave();
      }
    }
  }
  renderer.render(scene, camera);
}
animate();
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
