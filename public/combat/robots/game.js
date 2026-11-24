import * as THREE from "../vendor/three.module.js";
const canvas = document.querySelector("#game"),
  overlay = document.querySelector("#overlay"),
  start = document.querySelector("#start");
const ui = {
  health: document.querySelector("#health"),
  zone: document.querySelector("#zone"),
  remaining: document.querySelector("#remaining"),
  objective: document.querySelector("#objective"),
  damage: document.querySelector("#damage"),
};
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x0a151b);
renderer.shadowMap.enabled = false;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b191e, 15, 48);
const camera = new THREE.PerspectiveCamera(
  72,
  innerWidth / innerHeight,
  0.1,
  100,
);
camera.rotation.order = "YXZ";
scene.add(new THREE.HemisphereLight(0xb1fff0, 0x101018, 1.4));
const light = new THREE.DirectionalLight(0xc5f5ff, 1.3);
light.position.set(4, 12, 5);
scene.add(light);
const materials = {
  floor: new THREE.MeshStandardMaterial({ color: 0x22363a, roughness: 0.8 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x30474b, roughness: 0.8 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x101d22 }),
  trim: new THREE.MeshStandardMaterial({
    color: 0x648184,
    metalness: 0.6,
    roughness: 0.45,
  }),
  glow: new THREE.MeshBasicMaterial({ color: 0x57ffce }),
  orange: new THREE.MeshBasicMaterial({ color: 0xff8d51 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff4c63 }),
};
function box(w, h, d, mat, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
box(24, 0.4, 46, materials.floor, 0, -0.2, -10);
box(24, 0.4, 46, materials.dark, 0, 7, -10);
box(0.5, 7, 46, materials.wall, -12, 3.5, -10);
box(0.5, 7, 46, materials.wall, 12, 3.5, -10);
box(24, 7, 0.5, materials.wall, 0, 3.5, -33);
box(24, 7, 0.5, materials.wall, 0, 3.5, 13);
for (let z = -30; z < 13; z += 5) {
  box(23.5, 0.03, 0.06, materials.trim, 0, 0.02, z);
  for (const x of [-11.7, 11.7]) {
    box(0.08, 5, 0.2, materials.trim, x, 3, z);
    box(0.1, 0.16, 3, materials.glow, x, 5.8, z);
  }
}
for (let x = -10; x <= 10; x += 5)
  box(0.06, 0.03, 45, materials.trim, x, 0.02, -10);
// Three sealed sections open in sequence.
let gates = [];
for (let z of [-3, -18]) {
  let g = new THREE.Group();
  scene.add(g);
  box(8, 5.8, 0.5, materials.dark, 0, 2.9, z, g);
  box(8, 0.15, 0.6, materials.glow, 0, 5.8, z, g);
  box(0.12, 5.7, 0.6, materials.orange, -3.9, 2.9, z, g);
  box(0.12, 5.7, 0.6, materials.orange, 3.9, 2.9, z, g);
  box(8, 7, 0.6, materials.wall, -8, 3.5, z);
  box(8, 7, 0.6, materials.wall, 8, 3.5, z);
  gates.push({ mesh: g, z, open: false });
}
for (const z of [7, -9, -24])
  for (const x of [-8, 8]) {
    box(2, 1.5, 2, materials.dark, x, 0.75, z);
    box(2.1, 0.08, 2.1, materials.trim, x, 1.52, z);
    box(0.9, 0.08, 0.05, materials.glow, x, 1, z + 1.03);
  }
const core = new THREE.Group();
scene.add(core);
core.position.set(0, 1, -30);
box(3, 1, 3, materials.dark, 0, 0, 0, core);
let crystal = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.75),
  materials.glow,
);
crystal.position.y = 1.5;
core.add(crystal);
const coreLight = new THREE.PointLight(0x48ffcf, 15, 12);
coreLight.position.set(0, 3, -30);
scene.add(coreLight);
let enemies = [],
  bullets = [],
  zone = 0,
  health = 100,
  yaw = 0,
  pitch = 0,
  playing = false,
  ended = false,
  shotAt = 0,
  flash = 0,
  weapon = 1;
const keys = {};
let player = new THREE.Vector3(0, 1.65, 9);
const clock = new THREE.Clock();
function makeEnemy(x, z, type) {
  let group = new THREE.Group();
  scene.add(group);
  group.position.set(x, 0, z);
  let body =
    type === "heavy"
      ? new THREE.MeshStandardMaterial({
          color: 0x9b5540,
          metalness: 0.6,
          roughness: 0.45,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x728a89,
          metalness: 0.7,
          roughness: 0.4,
        });
  let scale = type === "heavy" ? 1.3 : 1;
  group.scale.setScalar(scale);
  box(1.1, 1.1, 0.7, body, 0, 1.45, 0, group);
  box(0.75, 0.65, 0.65, materials.dark, 0, 2.3, 0, group);
  box(
    0.53,
    0.12,
    0.05,
    type === "heavy" ? materials.orange : materials.red,
    0,
    2.34,
    0.34,
    group,
  );
  for (let x of [-0.4, 0.4]) {
    box(0.25, 0.8, 0.3, body, x, 0.45, 0, group);
    box(0.25, 0.9, 0.3, body, x * 1.8, 1.45, 0, group);
  }
  box(0.65, 0.13, 0.08, materials.glow, 0, 1.6, 0.38, group);
  let e = {
    group,
    type,
    hp: type === "heavy" ? 5 : 3,
    cooldown: 1 + Math.random(),
    speed: type === "heavy" ? 1.1 : 1.9,
    alive: true,
  };
  group.traverse((o) => {
    if (o.isMesh) o.userData.enemy = e;
  });
  enemies.push(e);
}
const waves = [
  [
    [-5, 1, "scout"],
    [5, -0.5, "scout"],
    [0, -1, "heavy"],
  ],
  [
    [-5, -10, "scout"],
    [5, -12, "scout"],
    [0, -14, "heavy"],
    [-7, -16, "scout"],
  ],
  [
    [-6, -24, "heavy"],
    [6, -24, "heavy"],
    [0, -27, "scout"],
    [-4, -29, "scout"],
    [5, -29, "scout"],
  ],
];
function spawnWave() {
  for (const a of waves[zone]) makeEnemy(...a);
  updateHUD();
}
function updateHUD() {
  ui.health.textContent = Math.max(0, Math.ceil(health));
  ui.zone.textContent = `0${zone + 1} / 03`;
  ui.remaining.textContent = enemies.filter((e) => e.alive).length;
}
function reset() {
  for (const e of enemies) scene.remove(e.group);
  for (const b of bullets) scene.remove(b.mesh);
  enemies = [];
  bullets = [];
  for (const g of gates) {
    g.open = false;
    g.mesh.visible = true;
  }
  zone = 0;
  health = 100;
  weapon = 1;
  updateWeapon();
  player.set(0, 1.65, 9);
  yaw = 0;
  pitch = 0;
  ended = false;
  ui.objective.textContent = "구역의 로봇을 모두 제거하세요";
  spawnWave();
}
function show(title, desc, button) {
  ended = true;
  playing = false;
  document.exitPointerLock?.();
  overlay.classList.remove("hidden");
  overlay.querySelector("h1").innerHTML = title;
  overlay.querySelector("p").innerHTML = desc;
  start.innerHTML = button + " <span>↗</span>";
}
start.addEventListener("click", () => {
  if (ended) reset();
  canvas.requestPointerLock();
});
document.addEventListener("pointerlockchange", () => {
  playing = document.pointerLockElement === canvas && !ended;
  if (playing) overlay.classList.add("hidden");
  else if (!ended) {
    overlay.classList.remove("hidden");
    overlay.querySelector("h1").innerHTML = "PAUSE<span>_</span>";
    overlay.querySelector("p").innerHTML = "작전이 일시정지되었습니다.";
    start.innerHTML = "작전 계속 <span>↗</span>";
  }
});
document.addEventListener("mousemove", (e) => {
  if (!playing) return;
  yaw -= e.movementX * 0.002;
  pitch = Math.max(-1.1, Math.min(1.1, pitch - e.movementY * 0.002));
});
function updateWeapon() {
  document.querySelector("#weapon").innerHTML =
    weapon === 1 ? "1 에너지 블래스터 <i>∞</i>" : "2 펄스 캐논 <i>∞</i>";
}
document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (
    playing &&
    (e.code === "Digit1" ||
      e.code === "Numpad1" ||
      e.code === "Digit2" ||
      e.code === "Numpad2")
  ) {
    weapon = e.code.endsWith("1") ? 1 : 2;
    updateWeapon();
  }
});
document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});
window.addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
});
const ray = new THREE.Raycaster();
document.addEventListener("mousedown", (e) => {
  if (
    !playing ||
    e.button !== 0 ||
    performance.now() - shotAt < (weapon === 1 ? 220 : 650)
  )
    return;
  shotAt = performance.now();
  flash = 0.08;
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  let hits = ray.intersectObjects(
    enemies.filter((e) => e.alive).map((e) => e.group),
    true,
  );
  if (hits.length) {
    let enemy = hits[0].object.userData.enemy;
    enemy.hp -= weapon === 1 ? 1 : 3;
    enemy.group.position.z -= 0.1;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      scene.remove(enemy.group);
      updateHUD();
      if (!enemies.some((e) => e.alive)) {
        if (zone === 2) {
          show(
            "MISSION<br><em>CLEAR</em><span>_</span>",
            "시설 코어를 확보했습니다.<br>작전 성공!",
            "다시 시작",
          );
        } else {
          gates[zone].open = true;
          gates[zone].mesh.visible = false;
          zone++;
          spawnWave();
          ui.objective.textContent =
            "문이 열렸습니다. 다음 구역으로 전진하세요";
        }
      }
    }
  }
});
function enemyFire(e) {
  let p = e.group.position.clone().add(new THREE.Vector3(0, 1.7, 0));
  let dir = player.clone().sub(p).normalize();
  let mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 8),
    materials.orange,
  );
  mesh.position.copy(p);
  scene.add(mesh);
  bullets.push({ mesh, velocity: dir.multiplyScalar(7), life: 5 });
}
function blocked(x, z) {
  if (x < -11.4 || x > 11.4 || z < -32.3 || z > 12.3) return true;
  return gates.some((g) => !g.open && Math.abs(z - g.z) < 0.65);
}
function loop() {
  requestAnimationFrame(loop);
  let dt = Math.min(clock.getDelta(), 0.04);
  crystal.rotation.y += dt;
  crystal.rotation.x += dt * 0.4;
  if (playing) {
    let forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0),
      side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    let move = new THREE.Vector3(side, 0, -forward);
    if (move.length() > 0) {
      move
        .normalize()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        .multiplyScalar(dt * 5);
      if (!blocked(player.x + move.x, player.z)) player.x += move.x;
      if (!blocked(player.x, player.z + move.z)) player.z += move.z;
    }
    camera.position.copy(player);
    camera.rotation.set(pitch, yaw, 0);
    for (const e of enemies) {
      if (!e.alive) continue;
      let delta = player.clone().sub(e.group.position);
      delta.y = 0;
      let distance = delta.length();
      e.group.rotation.y = Math.atan2(delta.x, delta.z);
      let separated = gates.some(
        (g) => !g.open && (player.z - g.z) * (e.group.position.z - g.z) < 0,
      );
      if (!separated && distance < 18) {
        if (distance > 5) {
          delta.normalize().multiplyScalar(e.speed * dt);
          if (
            !blocked(e.group.position.x + delta.x, e.group.position.z + delta.z)
          )
            e.group.position.add(delta);
        }
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
          enemyFire(e);
          e.cooldown = e.type === "heavy" ? 1.35 : 2;
        }
      }
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      let b = bullets[i];
      b.mesh.position.addScaledVector(b.velocity, dt);
      b.life -= dt;
      if (b.mesh.position.distanceTo(player) < 0.65) {
        health -= 10;
        ui.damage.style.opacity = ".8";
        setTimeout(() => (ui.damage.style.opacity = "0"), 120);
        b.life = 0;
        updateHUD();
        if (health <= 0)
          show(
            "SYSTEM<br><em>DOWN</em><span>_</span>",
            "기체가 파괴되었습니다.<br>다시 침투해 시설을 돌파하세요.",
            "다시 도전",
          );
      }
      if (b.life <= 0) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
      }
    }
  } else {
    camera.position.copy(player);
    camera.rotation.set(pitch, yaw, 0);
  }
  flash = Math.max(0, flash - dt);
  renderer.setClearColor(flash ? 0x426d68 : 0x0a151b);
  renderer.render(scene, camera);
}
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
reset();
loop();
