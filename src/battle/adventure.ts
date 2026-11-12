import * as THREE from 'three';
import { captureHeroPost, OUTPOST_NAMES, type Outpost, type Unit, type War } from './war';

/** A lightweight direct-control layer over the existing deterministic strategy simulation. */
export type AdventureMode = 'drop' | 'field' | 'tower' | 'strategy';
type ArrowFlight = { mesh: THREE.Group; start: THREE.Vector3; end: THREE.Vector3; age: number };
const clamp = THREE.MathUtils.clamp;
const distance = (a: number, b: number, x: number, z: number) => Math.hypot(a - x, b - z);

export function createAdventure(scene: THREE.Scene, camera: THREE.PerspectiveCamera, war: War, newMatch: boolean) {
  const destination = war.outposts[5];
  const player = war.factions[0];
  let mode: AdventureMode = newMatch ? 'drop' : 'strategy';
  let x = newMatch ? destination.x : player.x + 9;
  let z = newMatch ? destination.z : player.z + 9;
  let yaw = -2.36;
  let pitch = -.14;
  let dropTime = 0;
  let fireCooldown = 0;
  let notice = '';
  let castleX = player.x;
  let castleZ = player.z;
  let castleName = '아군 본부';
  const resources: THREE.Object3D[] = [];
  const arrowMaterial = new THREE.MeshStandardMaterial({ color: 0xd9bb78, metalness: .3 });
  const createMaterial = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: .76 });
  const cloth = createMaterial(0x3dbea5);
  const wood = createMaterial(0x68503b);
  const stone = createMaterial(0x958d77);
  const gold = createMaterial(0xd6b677);
  const materialList = [arrowMaterial, cloth, wood, stone, gold];

  function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material,
    px: number, py: number, pz: number, sx = 1, sy = 1, sz = 1) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(px, py, pz);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // The avatar and its canopy are 3D objects, not a video overlay.
  const avatar = new THREE.Group();
  scene.add(avatar); resources.push(avatar);
  add(avatar, new THREE.CapsuleGeometry(.78, 1.2, 4, 8), cloth, 0, 1.7, 0);
  add(avatar, new THREE.SphereGeometry(.54, 10, 8), gold, 0, 3.05, 0);
  add(avatar, new THREE.BoxGeometry(.24, 1.25, .28), wood, -.4, .62, 0);
  add(avatar, new THREE.BoxGeometry(.24, 1.25, .28), wood, .4, .62, 0);
  const canopy = new THREE.Group();
  avatar.add(canopy);
  add(canopy, new THREE.SphereGeometry(7.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cloth, 0, 18, 0);
  for (let i = 0; i < 8; i++) {
    const theta = i * Math.PI / 4;
    const top = new THREE.Vector3(Math.sin(theta) * 6.2, 18, Math.cos(theta) * 6.2);
    const bottom = new THREE.Vector3(Math.sin(theta) * .4, 3, Math.cos(theta) * .4);
    const d = top.clone().sub(bottom);
    const cord = add(canopy, new THREE.CylinderGeometry(.035, .035, d.length(), 4), wood,
      (top.x + bottom.x) / 2, (top.y + bottom.y) / 2, (top.z + bottom.z) / 2);
    cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  // Capturable wooden/stone battlements. Any friendly post can be entered on foot.
  const watchtowers: Array<{ post: Outpost; flag: THREE.Mesh }> = [];
  for (const post of war.outposts) {
    const tower = new THREE.Group();
    tower.position.set(post.x + 11.5, 0, post.z);
    scene.add(tower); resources.push(tower);
    add(tower, new THREE.BoxGeometry(7, 9, 7), stone, 0, 4.5, 0);
    add(tower, new THREE.BoxGeometry(9, 1.2, 9), wood, 0, 9.3, 0);
    for (const side of [-1, 1]) for (const offset of [-3, 0, 3]) {
      add(tower, new THREE.BoxGeometry(1.2, 1.6, 1.4), stone, side * 4, 10.5, offset);
      add(tower, new THREE.BoxGeometry(1.4, 1.6, 1.2), stone, offset, 10.5, side * 4);
    }
    add(tower, new THREE.CylinderGeometry(.1, .1, 4, 6), wood, 0, 12.1, 0);
    const flagMaterial = createMaterial(0xcfb97d); materialList.push(flagMaterial);
    const flag = add(tower, new THREE.BoxGeometry(2.8, 1.4, .15), flagMaterial, 1.3, 13.1, 0);
    watchtowers.push({ post, flag });
  }

  const arrows: ArrowFlight[] = [];
  function tickArrows(dt: number) {
    for (let i = arrows.length - 1; i >= 0; i--) {
      const flight = arrows[i]; flight.age += dt;
      flight.mesh.position.copy(flight.start).lerp(flight.end, clamp(flight.age / .34, 0, 1));
      if (flight.age >= .42) {
        scene.remove(flight.mesh);
        flight.mesh.traverse(object => {
          if (object instanceof THREE.Mesh) object.geometry.dispose();
        });
        arrows.splice(i, 1);
      }
    }
  }

  function nearestFriendlyCastle() {
    const locations: Array<{ x: number; z: number; name: string; range: number }> =
      war.outposts.filter(p => p.owner === 0).map(p => ({
        x: p.x + 11.5, z: p.z, name: OUTPOST_NAMES[p.id], range: distance(x, z, p.x, p.z),
      }));
    locations.push({ x: player.x, z: player.z, name: '아군 본부', range: distance(x, z, player.x, player.z) });
    return locations.sort((a, b) => a.range - b.range)[0];
  }

  function enterTower(): boolean {
    if (mode !== 'field') return false;
    const nearby = nearestFriendlyCastle();
    if (!nearby || nearby.range > 18) return false;
    castleX = nearby.x; castleZ = nearby.z; castleName = nearby.name;
    x = castleX; z = castleZ;
    mode = 'tower'; pitch = -.25;
    notice = castleName + ' 성벽에 올랐습니다. 화면을 드래그해 조준하고 클릭해 활을 쏘세요.';
    return true;
  }
  function leaveTower() {
    if (mode !== 'tower') return;
    mode = 'field'; x = castleX - 10; z = castleZ + 1;
    notice = '성벽에서 내려왔습니다. WASD로 걸어 이동하세요.';
  }
  function toField() {
    if (mode === 'drop') return;
    if (mode === 'tower') leaveTower();
    mode = 'field';
    notice = '직접 이동 모드 · WASD 이동 · 드래그 시점 회전 · 활 발사';
  }
  function toStrategy() {
    if (mode === 'drop') return;
    mode = 'strategy';
    notice = '전략 지도로 돌아왔습니다. 병력 훈련과 출전 명령을 내리세요.';
  }
  function onPointerDelta(dx: number, dy: number) {
    if (mode !== 'field' && mode !== 'tower') return;
    yaw -= dx * .004;
    pitch = clamp(pitch - dy * .0035, -1.25, .7);
  }

  function shoot() {
    if ((mode !== 'field' && mode !== 'tower') || fireCooldown > 0 || war.over) return false;
    fireCooldown = .82;
    const direction = new THREE.Vector3(); camera.getWorldDirection(direction);
    const origin = camera.position.clone();
    let target: Unit | null = null;
    let nearest = 125;
    for (const unit of war.units) {
      if (unit.owner === 0 || unit.hp <= 0) continue;
      const center = new THREE.Vector3(unit.x, 1.8, unit.z);
      const delta = center.sub(origin);
      const along = delta.dot(direction);
      if (along <= 0 || along >= nearest) continue;
      const miss = delta.addScaledVector(direction, -along).length();
      if (miss < 2.6 + along * .012) { target = unit; nearest = along; }
    }
    const endpoint = origin.clone().addScaledVector(direction, target ? nearest : 115);
    if (target) {
      const before = target.hp;
      const damage = mode === 'tower' ? 34 : 23;
      target.hp = Math.max(0, before - damage);
      war.stats[0].damageDealt += before - target.hp;
      if (target.hp <= 0) {
        war.stats[0].kills++;
        war.events.unshift({ time: war.time, text: '직접 조준한 화살로 적 병력을 처치했습니다.' });
        war.events.length = Math.min(war.events.length, 8);
      }
      notice = target.hp <= 0 ? '명중! 적 병력을 처치했습니다.' : '화살 명중! 적 병력에게 피해를 입혔습니다.';
    } else notice = '화살을 발사했습니다. 시점을 낮추고 적 병력을 조준하세요.';
    const flight = new THREE.Group();
    add(flight, new THREE.CylinderGeometry(.045, .045, 2.4, 5), arrowMaterial, 0, 0, 0);
    add(flight, new THREE.ConeGeometry(.2, .55, 6), gold, 0, 1.45, 0);
    flight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    flight.position.copy(origin);
    scene.add(flight);
    arrows.push({ mesh: flight, start: origin, end: endpoint, age: 0 });
    return true;
  }

  function update(dt: number, keys: ReadonlySet<string>) {
    fireCooldown = Math.max(0, fireCooldown - dt);
    tickArrows(dt);
    for (const tower of watchtowers) {
      const color = tower.post.owner === null ? 0xcfb97d :
        [0x50d9d1, 0xf06a77, 0xf5c45d, 0xaa8eed][tower.post.owner];
      (tower.flag.material as THREE.MeshStandardMaterial).color.setHex(color);
    }
    if (mode === 'drop') {
      dropTime += dt;
      const progress = clamp(dropTime / 6.2, 0, 1);
      const altitude = Math.pow(1 - progress, 1.45) * 88;
      avatar.position.set(x - (1 - progress) * 19, altitude, z - (1 - progress) * 19);
      avatar.visible = true; canopy.visible = true;
      canopy.rotation.z = Math.sin(dropTime * 1.8) * .055;
      camera.position.set(avatar.position.x + 23, altitude + 17, avatar.position.z + 28);
      camera.lookAt(avatar.position.x, altitude + 8, avatar.position.z);
      if (progress >= 1) {
        mode = 'field'; avatar.position.set(x, 0, z); canopy.visible = false;
        notice = '착륙 성공! 깃발 근처에 머물러 북서부 관문을 점령하세요.';
      }
      return;
    }
    avatar.position.set(x, 0, z);
    avatar.visible = mode === 'strategy';
    if (mode === 'strategy') return;

    const move = new THREE.Vector2(0, 0);
    const held = (key: string) => keys.has(key);
    if (held('w') || held('arrowup')) move.y++;
    if (held('s') || held('arrowdown')) move.y--;
    if (held('a') || held('arrowleft')) move.x--;
    if (held('d') || held('arrowright')) move.x++;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(dt * (mode === 'tower' ? 6.5 : 12));
      const sine = Math.sin(yaw), cosine = Math.cos(yaw);
      x += -sine * move.y + cosine * move.x;
      z += -cosine * move.y - sine * move.x;
    }
    if (mode === 'tower') {
      x = clamp(x, castleX - 3.1, castleX + 3.1);
      z = clamp(z, castleZ - 3.1, castleZ + 3.1);
    } else {
      x = clamp(x, -177, 177);
      z = clamp(z, -177, 177);
      const post = captureHeroPost(war, x, z, dt);
      if (post && post.owner === 0) notice = OUTPOST_NAMES[post.id] + ' 점령 성공! E로 감시탑에 올라가세요.';
    }
    camera.position.set(x, mode === 'tower' ? 11.9 : 2.85, z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function hint() {
    if (mode === 'drop') return { headline: '낙하산 강하 중', detail: '착륙 후 깃발 옆에 머물면 직접 점령할 수 있습니다.', progress: clamp(dropTime / 6.2 * 100, 0, 100) };
    if (mode === 'strategy') return { headline: '전략 지휘 시점', detail: '직접 플레이 버튼을 눌러 땅 위로 내려가세요.', progress: 0 };
    if (mode === 'tower') return { headline: castleName + ' · 성벽 궁수', detail: '화면 드래그: 조준 · 클릭/F: 화살 · E: 내려가기 · T: 전략 시점', progress: 0 };
    const post = war.outposts.find(p => distance(x, z, p.x, p.z) < 8);
    if (post && post.owner !== 0) {
      const guarded = war.units.some(u => u.owner !== 0 && u.hp > 0 &&
        distance(u.x, u.z, post.x, post.z) < 8.5);
      return { headline: OUTPOST_NAMES[post.id] + ' 점령', detail: guarded ? '적 병력을 먼저 물리쳐야 점령이 진행됩니다.' : '이곳에서 머물면 점령 진행도가 올라갑니다.', progress: post.progress };
    }
    const nearby = nearestFriendlyCastle();
    if (nearby && nearby.range <= 18) return { headline: nearby.name + ' 입구', detail: 'E 또는 성벽 올라가기 버튼으로 망루에 진입하세요.', progress: 0 };
    return { headline: '직접 탐험 모드', detail: 'WASD 이동 · 드래그로 둘러보기 · 클릭/F 활 발사 · T 전략 시점', progress: 0 };
  }

  function dispose() {
    for (const flight of arrows) { scene.remove(flight.mesh); flight.mesh.traverse(object => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    }); }
    for (const resource of resources) {
      scene.remove(resource);
      resource.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    }
    materialList.forEach(mat => mat.dispose());
    arrows.length = 0;
  }
  return {
    get mode() { return mode; },
    get isActionMode() { return mode !== 'strategy'; },
    get inDrop() { return mode === 'drop'; },
    get canEnterTower() { return mode === 'field' && nearestFriendlyCastle().range <= 18; },
    takeNotice() { const message = notice; notice = ''; return message; },
    toField, toStrategy, enterTower, leaveTower, onPointerDelta, shoot, update, hint, dispose,
  };
}
