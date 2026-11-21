// SKY WAR — 3D 장면: 하늘·바다·군도 지형·구름·절차적 전투기·탄·폭발. 외부 모델 없음.
import * as THREE from 'three';
import { terrainY, forward, WORLD_R, type SkySim, type Jet, type Kind } from './sim';

function glowTex(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 절차적 전투기. 기수는 -Z. */
export function buildJet(kind: Kind, team: 'player' | 'enemy'): THREE.Group {
  const g = new THREE.Group();
  const body = team === 'player' ? 0xdfe8f5 : kind === 'ace' ? 0x1b1d24 : kind === 'boss' ? 0x3a2540 : kind === 'bomber' ? 0x59606b : 0x8a2b2b;
  const accent = team === 'player' ? 0x2f7bff : kind === 'boss' ? 0xff3b6b : kind === 'ace' ? 0xffc83d : 0x2a2a2a;
  const mBody = new THREE.MeshStandardMaterial({ color: body, metalness: 0.45, roughness: 0.42 }), mAcc = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.3, roughness: 0.5 });
  const s = kind === 'boss' ? 2.8 : kind === 'bomber' ? 1.7 : 1;
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * s, 1.3 * s, 11 * s, 10), mBody); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 4.5 * s, 10), mBody); nose.rotation.x = -Math.PI / 2; nose.position.z = -7.8 * s; g.add(nose);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.9 * s, 10, 8), new THREE.MeshStandardMaterial({ color: 0x142a44, metalness: 0.9, roughness: 0.1 })); cockpit.scale.set(0.8, 0.7, 2); cockpit.position.set(0, 0.9 * s, -2.2 * s); g.add(cockpit);
  // 델타 날개
  const w = kind === 'boss' ? 11 : kind === 'bomber' ? 9.5 : kind === 'ace' ? 8.2 : 7.2, wl = kind === 'bomber' ? 5.5 : 6;
  const wing = new THREE.BufferGeometry(); const sg = new Float32Array([0, 0, -2.5 * s, w * s, 0, 2.2 * s, 0, 0, 3 * s, 0, 0, -2.5 * s, 0, 0, 3 * s, -w * s, 0, 2.2 * s]);
  wing.setAttribute('position', new THREE.BufferAttribute(sg, 3)); wing.computeVertexNormals(); void wl;
  const wm = new THREE.Mesh(wing, new THREE.MeshStandardMaterial({ color: body, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide })); g.add(wm);
  for (const sx of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 2.2 * s), mAcc); tip.position.set(sx * w * s * 0.92, 0, 2 * s); g.add(tip); }
  // 꼬리날개
  for (const sx of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6 * s, 2.4 * s), mAcc); fin.position.set(sx * 0.9 * s, 1.4 * s, 4.3 * s); fin.rotation.z = sx * 0.2; g.add(fin); const hs = new THREE.Mesh(new THREE.BoxGeometry(3.4 * s, 0.15, 1.8 * s), mBody); hs.position.set(sx * 1.8 * s, 0, 4.7 * s); g.add(hs); }
  // 엔진 불꽃
  if (kind === 'bomber' || kind === 'boss') {
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.65 * s, 0.85 * s, 5 * s, 8), mBody);
      pod.rotation.x = Math.PI / 2; pod.position.set(side * 3.2 * s, -0.35 * s, 1.2 * s); g.add(pod);
    }
  }
  if (kind === 'ace' || kind === 'boss') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.12 * s, 7 * s), mAcc); stripe.position.set(0, 1.12 * s, 0); g.add(stripe);
  }
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.75 * s, 5 * s, 8), new THREE.MeshBasicMaterial({ color: team === 'player' ? 0x6ab8ff : 0xff8a30, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); fl.rotation.x = -Math.PI / 2; fl.position.z = 8.5 * s; fl.name = 'flame'; g.add(fl);
  return g;
}

interface Particle { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number; alive: boolean; }

export class SkyView {
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(65, 1, 1, 9000);
  cockpit = false;
  setCockpit(on: boolean): void {
    this.cockpit = on;
    for (const mesh of this.meshes.values()) if (mesh.userData.team === 'player') mesh.visible = !on;
  }
  private pickMeshes = new Map<number, THREE.Mesh>(); private meshes = new Map<number, THREE.Group>(); private missileMeshes = new Map<number, THREE.Mesh>();
  private particles: Particle[] = []; private pIdx = 0;
  private tracers: THREE.LineSegments; private tracerPos = new Float32Array(400 * 6);
  private fire = glowTex('rgba(255,230,160,1)', 'rgba(255,90,0,0)'); private smoke = glowTex('rgba(70,70,70,.8)', 'rgba(70,70,70,0)');
  private clouds: THREE.Sprite[] = []; private sun: THREE.DirectionalLight; private sunGlow: THREE.Sprite;
  private shake = 0;
  private rings: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private cloudTex: THREE.CanvasTexture; private sunTex: THREE.CanvasTexture;
  private seaTime = { value: 0 };
  constructor() {
    const sc = this.scene; sc.fog = new THREE.Fog(0xb9b8b2, 1800, 7400); sc.background = new THREE.Color(0xd8b6a2);
    sc.add(new THREE.HemisphereLight(0xdbe7f2, 0x36515b, 1.2));
    this.sun = new THREE.DirectionalLight(0xffd8a1, 2.2); this.sun.position.set(2000, 3000, 1200); sc.add(this.sun);
    this.sunTex = glowTex('rgba(255,248,220,.95)', 'rgba(255,180,100,0)');
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sunTex, color: 0xfff0d0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sunGlow.scale.setScalar(900); sc.add(this.sunGlow);
    // 하늘 돔
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8000, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {}, vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 p;void main(){float h=clamp(p.y,-.2,1.);vec3 hor=vec3(.91,.69,.57),top=vec3(.16,.30,.50);vec3 c=mix(hor,top,pow(max(h,0.),.55));if(p.y<0.)c=mix(hor,vec3(.35,.48,.53),min(1.,-p.y*4.));gl_FragColor=vec4(c,1.);}' }));
    sc.add(dome); this.dome = dome;
    // 바다
    const seaMat = new THREE.MeshStandardMaterial({ color: 0x28687a, metalness: 0.42, roughness: 0.3 });
    seaMat.onBeforeCompile = shader => {
      shader.uniforms.skyTime = this.seaTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float skyTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(position.x * 0.008 + skyTime * 0.7) * 1.2 + cos(position.y * 0.011 - skyTime * 0.5) * 0.8;');
    };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000, 80, 80), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.y = -1; sc.add(sea); this.sea = sea;
    // 섬 지형
    const N = 200, size = 7600, geo = new THREE.PlaneGeometry(size, size, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = terrainY(x, z); pos.setY(i, h - (h < 1 ? 6 : 0));
      if (h < 6) c.set(0x2a6f9c); else if (h < 22) c.set(0xe2cf94); else if (h < 160) c.setHex(0x3f8a3a).lerp(new THREE.Color(0x2c6a2c), h / 160); else if (h < 280) c.set(0x7a6f62); else c.set(0xf2f4f8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    sc.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
    // 경계 링(월드 끝 표시)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(WORLD_R, 4, 6, 120), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.35 })); ring.rotation.x = Math.PI / 2; ring.position.y = 40; sc.add(ring);
    // 구름
    const ct = this.cloudTex = glowTex('rgba(255,239,220,.8)', 'rgba(255,220,196,0)');
    for (let i = 0; i < 60; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.55 + Math.random() * 0.35, depthWrite: false, fog: false })); const k = 260 + Math.random() * 520; s.scale.set(k * 1.8, k * 0.8, 1); s.position.set((Math.random() - 0.5) * 7000, 500 + Math.random() * 1100, (Math.random() - 0.5) * 7000); sc.add(s); this.clouds.push(s); }
    // 파티클 풀
    for (let i = 0; i < 260; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fire, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; sc.add(s); this.particles.push({ s, v: new THREE.Vector3(), life: 0, max: 1, grow: 1, alive: false }); }
    // 예광탄
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3)); tg.setDrawRange(0, 0);
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffe27a })); this.tracers.frustumCulled = false; sc.add(this.tracers);
  }
  private dome: THREE.Mesh; private sea: THREE.Mesh;

  resize(w: number, h: number): void { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  private emit(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, grow: number, kind: 'fire' | 'smoke', color = 0xffffff): void {
    const p = this.particles[this.pIdx++ % this.particles.length]; const m = p.s.material as THREE.SpriteMaterial;
    m.map = kind === 'fire' ? this.fire : this.smoke; m.blending = kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending; m.color.setHex(color); m.opacity = 1;
    p.s.position.copy(pos); p.s.scale.setScalar(size); p.v.copy(vel); p.life = p.max = life; p.grow = grow; p.alive = true; p.s.visible = true;
  }
  boom(pos: THREE.Vector3, big: boolean): void {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.copy(pos); ring.quaternion.copy(this.camera.quaternion); this.scene.add(ring); this.rings.push({ mesh: ring, life: 0.45, max: big ? 160 : 75 });
    const n = big ? 18 : 8, sz = big ? 60 : 28;
    for (let i = 0; i < n; i++) this.emit(pos, new THREE.Vector3((Math.random() - 0.5) * 90, (Math.random() - 0.3) * 80, (Math.random() - 0.5) * 90), 0.6 + Math.random() * 0.6, sz * (0.6 + Math.random() * 0.8), 2.2, 'fire', i % 3 ? 0xffb040 : 0xff5a20);
    for (let i = 0; i < n / 2; i++) this.emit(pos, new THREE.Vector3((Math.random() - 0.5) * 40, 10 + Math.random() * 30, (Math.random() - 0.5) * 40), 2 + Math.random(), sz, 1.6, 'smoke');
    for (let i = 0; i < (big ? 10 : 5); i++) this.emit(pos, new THREE.Vector3((Math.random() - 0.5) * 180, Math.random() * 120, (Math.random() - 0.5) * 180), 0.45 + Math.random() * 0.4, 3, -0.3, 'fire', 0xffd07a);
    const d = pos.distanceTo(this.camera.position); if (d < 700) this.shake = Math.max(this.shake, (big ? 1 : 0.5) * (1 - d / 700));
  }
  spark(pos: THREE.Vector3): void { for (let i = 0; i < 3; i++) this.emit(pos, new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60), 0.25, 8, 0.2, 'fire', 0xffe08a); }
  kick(a: number): void { this.shake = Math.max(this.shake, a); }

  sync(sim: SkySim, dt: number, time: number): void {
    // 제트 메시
    for (const j of sim.jets) {
      let m = this.meshes.get(j.id);
      if (!j.alive) { if (m) { this.scene.remove(m); this.disposeObject(m); this.meshes.delete(j.id); } continue; }
      if (!m) { m = buildJet(j.kind, j.team); m.userData.team = j.team; this.scene.add(m); this.meshes.set(j.id, m); }
      m.visible = !(this.cockpit && j.team === 'player');
      m.position.copy(j.pos); m.quaternion.copy(j.q);
      const throttle = THREE.MathUtils.clamp(j.throttle + (j.boosting ? 0.6 : 0), 0, 1.6);
      const fl = m.getObjectByName('flame') as THREE.Mesh | undefined; if (fl) {
        fl.scale.set(0.65 + throttle * 0.55, 0.45 + throttle * 1.4 + Math.sin(time * 40 + j.id) * 0.1, 0.65 + throttle * 0.55);
        (fl.material as THREE.MeshBasicMaterial).opacity = 0.4 + throttle * 0.55;
      }
      if ((j.speed > 170 || (j.speed > 120 && Math.abs(j.roll) > 0.8)) && Math.random() < Math.min(1, dt * 24)) {
        const tip = new THREE.Vector3();
        for (const side of [-1, 1]) {
          tip.set(side * (j.kind === 'boss' ? 11 : j.kind === 'bomber' ? 9.5 : j.kind === 'ace' ? 8.2 : 7.2), 0, 2.2).multiplyScalar(j.kind === 'boss' ? 2.8 : j.kind === 'bomber' ? 1.7 : 1).applyQuaternion(j.q).add(j.pos);
          this.emit(tip, new THREE.Vector3(), 0.8, 5, 0.9, 'smoke', 0xe0eaf0);
        }
      }
      if (j.hp < j.maxHp * 0.45 && Math.random() < dt * 14) this.emit(j.pos, new THREE.Vector3(0, 6, 0), 1.2, 16, 2, 'smoke'); // 피격 연기
      if (j.hp < j.maxHp * 0.2 && Math.random() < dt * 20) this.emit(j.pos, new THREE.Vector3(0, 4, 0), 0.4, 14, 1, 'fire', 0xff6a20);
    }
    for (const [id, m] of this.meshes) if (!sim.jets.some(j => j.id === id && j.alive)) { this.scene.remove(m); this.disposeObject(m); this.meshes.delete(id); }
    // 픽업(수리/탄약 링)
    const pk = new Set<number>();
    for (const k of sim.pickups) {
      pk.add(k.id); let m = this.pickMeshes.get(k.id);
      if (!m) { m = new THREE.Mesh(new THREE.TorusGeometry(9, 1.6, 8, 24), new THREE.MeshBasicMaterial({ color: k.kind === 'repair' ? 0x5dff8f : k.kind === 'shield' ? 0xffe27a : 0x6ab8ff })); this.scene.add(m); this.pickMeshes.set(k.id, m); }
      m.position.copy(k.pos); m.rotation.y = time * 3; m.rotation.x = Math.PI / 2 * 0.5; m.scale.setScalar(1 + 0.15 * Math.sin(time * 6));
    }
    for (const [id, m] of this.pickMeshes) if (!pk.has(id)) { this.scene.remove(m); this.disposeObject(m); this.pickMeshes.delete(id); }
    // 미사일
    const seen = new Set<number>();
    for (const ms of sim.missiles) {
      seen.add(ms.id); let m = this.missileMeshes.get(ms.id);
      if (!m) { m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 5, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.rotation.order = 'YXZ'; this.scene.add(m); this.missileMeshes.set(ms.id, m); }
      m.position.copy(ms.pos); m.lookAt(ms.pos.clone().add(ms.vel)); m.rotateX(Math.PI / 2);
      if (Math.random() < Math.min(1, dt * 30)) this.emit(ms.pos, new THREE.Vector3(0, 3, 0), 1.1, 9, 1.8, 'smoke', 0xc8ccd0);
      if (Math.random() < Math.min(1, dt * 24)) this.emit(ms.pos, new THREE.Vector3(), 0.18, 10, 0.5, 'fire', 0xffa040);
    }
    for (const [id, m] of this.missileMeshes) if (!seen.has(id)) { this.scene.remove(m); this.disposeObject(m); this.missileMeshes.delete(id); }
    // 예광탄
    let n = 0; const tp = this.tracerPos;
    for (const b of sim.bullets) { if (n >= 400) break; const o = n * 6; tp[o] = b.pos.x; tp[o + 1] = b.pos.y; tp[o + 2] = b.pos.z; tp[o + 3] = b.pos.x - b.vel.x * 0.035; tp[o + 4] = b.pos.y - b.vel.y * 0.035; tp[o + 5] = b.pos.z - b.vel.z * 0.035; n++; }
    (this.tracers.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; this.tracers.geometry.setDrawRange(0, n * 2);
    // 파티클
    for (const p of this.particles) {
      if (!p.alive) continue; p.life -= dt; if (p.life <= 0) { p.alive = false; p.s.visible = false; continue; }
      p.s.position.addScaledVector(p.v, dt); const k = p.life / p.max; (p.s.material as THREE.SpriteMaterial).opacity = k; p.s.scale.multiplyScalar(1 + p.grow * dt * 0.8);
    }
    // 하늘·바다가 카메라를 따라감(무한한 느낌)
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life -= dt; const k = Math.max(0, r.life / 0.45); r.mesh.scale.setScalar(r.max * (1 - k) + 1); (r.mesh.material as THREE.MeshBasicMaterial).opacity = k * 0.7; if (r.life <= 0) { this.scene.remove(r.mesh); this.disposeObject(r.mesh); this.rings.splice(i, 1); } }
    this.seaTime.value = time;
    for (const cloud of this.clouds) { cloud.position.x += 6 * dt; if (cloud.position.x > 3600) cloud.position.x -= 7200; }
    this.dome.position.copy(this.camera.position); this.sunGlow.position.copy(this.camera.position).addScaledVector(this.sun.position.clone().normalize(), 7000); this.sea.position.x = this.camera.position.x; this.sea.position.z = this.camera.position.z;
  }

  /** 추적 카메라(부드러운 지연 + 속도감 FOV + 폭발 흔들림). boost: 0~1 */
  follow(p: Jet, dt: number, look: THREE.Vector2, boost: number): void {
    if (this.cockpit) {
      const offset = new THREE.Vector3(0, 1.2, -2.5).applyQuaternion(p.q);
      this.camera.position.copy(p.pos).add(offset);
      this.camera.quaternion.copy(p.q);
      const vibration = 0.025 + Math.max(0, p.speed - 120) * 0.0008 + boost * 0.12 + this.shake * 0.5;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * vibration, (Math.random() - 0.5) * vibration, 0).applyQuaternion(p.q));
    } else {
      const fwd = forward(p), up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.q);
      const want = p.pos.clone().addScaledVector(fwd, -34 - boost * 10).addScaledVector(up, 9 + p.pitch * -4);
      this.camera.position.lerp(want, Math.min(1, dt * 7));
      const target = p.pos.clone().addScaledVector(fwd, 120);
      const q = new THREE.Matrix4().lookAt(this.camera.position, target, up.lerp(new THREE.Vector3(0, 1, 0), 0.5)); const tq = new THREE.Quaternion().setFromRotationMatrix(q);
      this.camera.quaternion.slerp(tq, Math.min(1, dt * 6));
      if (this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * this.shake * 5; this.camera.position.y += (Math.random() - 0.5) * this.shake * 5; }
    }
    this.shake = Math.max(0, this.shake - dt * 2);
    const fov = this.cockpit ? 70 + boost * 5 : 62 + boost * 14 + (p.speed - 140) * 0.06;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); void look;
  }

  /** 월드 좌표→화면(0~1). 화면 밖/뒤면 null */
  project(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const p = v.clone().project(this.camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, behind: p.z > 1 };
  }
  private disposeObject(object: THREE.Object3D): void { object.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.(); }); }
  dispose(): void { this.disposeObject(this.scene); this.fire.dispose(); this.smoke.dispose(); this.cloudTex.dispose(); this.sunTex.dispose(); }
}
