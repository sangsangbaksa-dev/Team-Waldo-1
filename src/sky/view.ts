// SKY WAR — 3D 장면: 하늘·바다·군도 지형·구름·절차적 전투기·탄·폭발. 외부 모델 없음.
import * as THREE from 'three';
import { readPreferences } from '../prefs';
import { terrainY, forward, WORLD_R, type SkySim, type Jet, type Kind } from './sim';
import { makeEnvironment } from '../shared/gfx';
import { addAtmosphere, detailJet } from './visuals';
import { cloudSprite, disposeArt, fireSprite, glowSprite, jetSkin, missileSkin, pickupIcon, seaNormal, smokeSprite, terrainDetail } from './art';

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
  const skin = jetSkin(kind, team, body, accent); // 패널 라인·줄무늬·국적 마크를 그린 도장
  const mBody = new THREE.MeshStandardMaterial({ map: skin, metalness: 0.45, roughness: 0.42 }), mAcc = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.3, roughness: 0.5 });
  const s = kind === 'boss' ? 2.8 : kind === 'bomber' ? 1.7 : 1;
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * s, 1.3 * s, 11 * s, 10), mBody); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 4.5 * s, 10), mBody); nose.rotation.x = -Math.PI / 2; nose.position.z = -7.8 * s; g.add(nose);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.9 * s, 10, 8), new THREE.MeshStandardMaterial({ color: 0x142a44, metalness: 0.9, roughness: 0.1 })); cockpit.scale.set(0.8, 0.7, 2); cockpit.position.set(0, 0.9 * s, -2.2 * s); g.add(cockpit);
  const dark = new THREE.MeshStandardMaterial({ color: 0x273340, metalness: 0.7, roughness: 0.38 });
  const nozzleGeo = new THREE.CylinderGeometry(0.72 * s, 0.9 * s, 1.5 * s, 12, 1, true);
  const nozzle = new THREE.Mesh(nozzleGeo, dark); nozzle.rotation.x = Math.PI / 2; nozzle.position.z = 5.6 * s; g.add(nozzle);
  const intakeGeo = new THREE.BoxGeometry(0.55 * s, 0.7 * s, 3.2 * s);
  for (const side of [-1, 1]) { const intake = new THREE.Mesh(intakeGeo, dark); intake.position.set(side * 1.1 * s, -0.25 * s, -0.2 * s); g.add(intake); }
  // 델타 날개
  const w = kind === 'boss' ? 11 : kind === 'bomber' ? 9.5 : kind === 'ace' ? 8.2 : 7.2, wl = kind === 'bomber' ? 5.5 : 6;
  const wing = new THREE.BufferGeometry(); const sg = new Float32Array([0, 0, -2.5 * s, w * s, 0, 2.2 * s, 0, 0, 3 * s, 0, 0, -2.5 * s, 0, 0, 3 * s, -w * s, 0, 2.2 * s]);
  wing.setAttribute('position', new THREE.BufferAttribute(sg, 3)); wing.computeVertexNormals(); void wl;
  const wuv = new Float32Array(18); for (let i = 0; i < 6; i++) { wuv[i * 2] = sg[i * 3]! / (w * s) * 0.5 + 0.5; wuv[i * 2 + 1] = (sg[i * 3 + 2]! / s + 2.5) / 5.5; }
  wing.setAttribute('uv', new THREE.BufferAttribute(wuv, 2));
  const wm = new THREE.Mesh(wing, new THREE.MeshStandardMaterial({ map: skin, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide })); g.add(wm);
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
  g.userData.detailGroup = detailJet(g, kind, team);
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && (m.material instanceof THREE.MeshStandardMaterial)) { m.castShadow = true; m.receiveShadow = true; } }); // 불꽃·램프(Basic)는 그림자 없음
  return g;
}

interface Particle { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; grow: number; size: number; r: number; g: number; b: number; alive: boolean; }

/** 파티클 한 종류를 InstancedBufferGeometry 한 장(드로우콜 1)으로 그리는 빌보드 풀. 예전엔 입자마다 Sprite(드로우콜 최대 260)였습니다. */
class BillboardPool {
  readonly mesh: THREE.Mesh; readonly parts: Particle[] = []; private idx = 0;
  private activeCount = 0; private dirty = false;
  private readonly off: THREE.InstancedBufferAttribute; private readonly sz: THREE.InstancedBufferAttribute; private readonly col: THREE.InstancedBufferAttribute;
  constructor(tex: THREE.Texture, additive: boolean, readonly n: number) {
    const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry(); g.index = q.index; g.setAttribute('position', q.attributes.position!); g.setAttribute('uv', q.attributes.uv!); g.instanceCount = n;
    this.off = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage); this.sz = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage); this.col = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOff', this.off); g.setAttribute('aSize', this.sz); g.setAttribute('aCol', this.col);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false, uniforms: { map: { value: tex } },
      vertexShader: 'attribute vec3 aOff;attribute float aSize;attribute vec4 aCol;varying vec2 vUv;varying vec4 vC;void main(){vUv=uv;vC=aCol;vec4 mv=modelViewMatrix*vec4(aOff,1.);mv.xy+=position.xy*aSize;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform sampler2D map;varying vec2 vUv;varying vec4 vC;void main(){vec4 t=texture2D(map,vUv);gl_FragColor=vec4(t.rgb*vC.rgb,t.a*vC.a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.visible = false;
    for (let i = 0; i < n; i++) this.parts.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, grow: 1, size: 0, r: 1, g: 1, b: 1, alive: false });
  }
  emit(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, grow: number, color: number, tmp: THREE.Color): void {
    const q = this.parts[this.idx++ % this.n]!;
    if (!q.alive) this.activeCount++;
    this.dirty = true; this.mesh.visible = true;
    tmp.setHex(color); q.r = tmp.r; q.g = tmp.g; q.b = tmp.b; q.p.copy(pos); q.v.copy(vel); q.life = q.max = life; q.size = size; q.grow = grow; q.alive = true;
  }
  reset(): void {
    this.idx = 0; this.activeCount = 0; this.dirty = true;
    for (const part of this.parts) { part.alive = false; part.life = 0; }
    this.update(0);
  }
  update(dt: number): void {
    if (this.activeCount === 0 && !this.dirty) return;
    const o = this.off.array as Float32Array, s = this.sz.array as Float32Array, c = this.col.array as Float32Array;
    let active = 0;
    for (let i = 0; i < this.n; i++) {
      const q = this.parts[i]!;
      if (q.alive) { q.life -= dt; if (q.life <= 0) q.alive = false; else { q.p.addScaledVector(q.v, dt); q.size *= 1 + q.grow * dt * 0.8; } }
      if (q.alive) { active++; o[i * 3] = q.p.x; o[i * 3 + 1] = q.p.y; o[i * 3 + 2] = q.p.z; s[i] = q.size; c[i * 4] = q.r; c[i * 4 + 1] = q.g; c[i * 4 + 2] = q.b; c[i * 4 + 3] = q.life / q.max; } else s[i] = 0;
    }
    this.activeCount = active; this.dirty = false; this.mesh.visible = active > 0;
    this.off.needsUpdate = this.sz.needsUpdate = this.col.needsUpdate = true;
  }
}

export class SkyView {
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(65, 1, 1, 9000);
  cockpit = false;
  setCockpit(on: boolean): void {
    this.cockpit = on;
    for (const mesh of this.meshes.values()) if (mesh.userData.team === 'player') mesh.visible = !on;
  }
  /** 새 출격에서 지난 전투의 연기·폭발·카메라 진동을 남기지 않습니다. */
  resetEffects(): void {
    this.firePool.reset(); this.smokePool.reset(); this.shake = 0;
    for (const ring of this.rings) { this.scene.remove(ring.mesh); this.disposeObject(ring.mesh); }
    this.rings.length = 0;
  }
  /**
   * Aircraft and projectiles reuse numeric IDs between sorties. Remove all
   * session-owned models before a restart so an old boss/ace cannot be reused
   * as the new fighter with the same ID (including its old material).
   */
  resetSession(): void {
    this.resetEffects();
    for (const collection of [this.meshes, this.missileMeshes, this.pickMeshes]) {
      for (const mesh of collection.values()) {
        this.scene.remove(mesh);
        this.disposeObject(mesh);
      }
      collection.clear();
    }
    for (const mesh of this.missilePool) this.disposeObject(mesh);
    this.missilePool.length = 0;
    this.jetIds.clear(); this.missileIds.clear(); this.pickupIds.clear();
    this.tracers.geometry.setDrawRange(0, 0);
    this.tracerHeads.geometry.setDrawRange(0, 0);
  }
  private pickMeshes = new Map<number, THREE.Mesh>(); private meshes = new Map<number, THREE.Group>(); private missileMeshes = new Map<number, THREE.Mesh>();
  private missilePool: THREE.Mesh[] = [];
  private firePool!: BillboardPool; private smokePool!: BillboardPool; private level = 0; private readonly tmpColor = new THREE.Color();
  private tracers: THREE.LineSegments; private tracerPos = new Float32Array(400 * 6);
  private fire = fireSprite(); private smoke = smokeSprite();
  private tracerHeads: THREE.Points; private tracerHeadPos = new Float32Array(400 * 3); private shadowSun = new THREE.Vector3(2000, 3000, 1200).normalize(); private seaNormalMap = seaNormal();
  private clouds: THREE.Sprite[] = []; private sun: THREE.DirectionalLight; private sunGlow: THREE.Sprite;
  private shake = 0;
  private rings: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private cloudTex: THREE.CanvasTexture; private sunTex: THREE.CanvasTexture;
  private readonly quality = readPreferences().quality; private readonly reducedMotion = readPreferences().reducedMotion;
  private seaTime = { value: 0 }; private seaOrigin = { value: new THREE.Vector2() };
  private atmosphereTextures: THREE.Texture[] = [];
  private environment?: THREE.Texture;
  private readonly v1 = new THREE.Vector3(); private readonly v2 = new THREE.Vector3(); private readonly v3 = new THREE.Vector3(); private readonly v4 = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0); private readonly matrix = new THREE.Matrix4(); private readonly rotation = new THREE.Quaternion();
  private readonly jetIds = new Set<number>(); private readonly pickupIds = new Set<number>(); private readonly missileIds = new Set<number>();
  constructor(renderer?: THREE.WebGLRenderer) {
    const sc = this.scene; sc.fog = new THREE.Fog(0xb9b8b2, 1800, 7400); sc.background = new THREE.Color(0xd8b6a2);
    if (renderer && this.quality !== 'low') {
      this.environment = makeEnvironment(renderer, { top: 0x537ea9, horizon: 0xf2c7a4, ground: 0x234854, sun: 0xffe1b4, sunDir: [0.5, 0.75, 0.3] });
      sc.environment = this.environment;
    }
    const atmosphereStart = sc.children.length;
    this.atmosphereTextures = addAtmosphere(sc, this.quality);
    // The original adaptive governor only hid the second cloud layer, leaving
    // the larger atmosphere cloud set rendering at full cost on slow devices.
    for (const object of sc.children.slice(atmosphereStart)) if (object instanceof THREE.Sprite) this.clouds.push(object);
    sc.add(new THREE.HemisphereLight(0xdbe7f2, 0x36515b, 1.2));
    this.sun = new THREE.DirectionalLight(0xffd8a1, 2.2); this.sun.position.set(2000, 3000, 1200); sc.add(this.sun, this.sun.target);
    if (renderer && this.quality !== 'low') { // 태양 그림자: 플레이어 주변만 덮고 따라다닙니다
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const sh = this.sun.shadow, cam = sh.camera; this.sun.castShadow = true; sh.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
      cam.left = cam.bottom = -420; cam.right = cam.top = 420; cam.near = 100; cam.far = 3800; sh.bias = -0.0004; sh.normalBias = 1.2;
    }
    const rim = new THREE.DirectionalLight(0x82b9ed, 0.7); rim.position.set(-1800, 800, -2000); sc.add(rim);
    this.sunTex = glowTex('rgba(255,248,220,.95)', 'rgba(255,180,100,0)');
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sunTex, color: 0xfff0d0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sunGlow.scale.setScalar(900); sc.add(this.sunGlow);
    // 하늘 돔
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8000, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sd: { value: this.shadowSun } }, vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      // 태양 쪽 노을 후광 + 지평선 안개띠
      fragmentShader: 'uniform vec3 sd;varying vec3 p;void main(){float h=clamp(p.y,-.2,1.);vec3 hor=vec3(.91,.69,.57),top=vec3(.16,.30,.50);vec3 c=mix(hor,top,pow(max(h,0.),.55));if(p.y<0.)c=mix(hor,vec3(.35,.48,.53),min(1.,-p.y*4.));float s=max(0.,dot(normalize(p),sd));c+=vec3(1.,.62,.32)*pow(s,6.)*.28+vec3(1.,.8,.5)*pow(s,40.)*.5+vec3(1.,.95,.8)*pow(s,900.)*3.;c=mix(c,vec3(.97,.82,.72),exp(-abs(p.y)*14.)*.35);gl_FragColor=vec4(c,1.);}' }));
    sc.add(dome); this.dome = dome;
    // 바다
    // 저사양/모바일에서 높은 주파수의 잔물결과 광택이 반짝임·모아레를 만들지 않도록 부드럽게 조절합니다.
    const lowSea = this.quality === 'low';
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x28687a, metalness: lowSea ? 0.12 : 0.42, roughness: lowSea ? 0.72 : 0.3,
      normalMap: this.seaNormalMap, normalScale: new THREE.Vector2(lowSea ? 0.18 : 0.52, lowSea ? 0.18 : 0.52),
    });
    // The previous 160 repeats across the ocean caused dense, shimmering
    // interference at the horizon. Keep broad-scale waves with softer detail.
    this.seaNormalMap.repeat.set(lowSea ? 32 : 72, lowSea ? 32 : 72);
    seaMat.onBeforeCompile = shader => {
      shader.uniforms.skyTime = this.seaTime; shader.uniforms.seaOrigin = this.seaOrigin;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float skyTime; uniform vec2 seaOrigin; varying vec2 vSeaW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaW = vec2(position.x + seaOrigin.x, position.y - seaOrigin.y); transformed.z += sin(vSeaW.x * 0.008 + skyTime * 0.7) * 1.2 + cos(vSeaW.y * 0.011 - skyTime * 0.5) * 0.8;');
      // Avoid the repeated oval whitecaps created by a single low-frequency
      // sine/cosine threshold. Layer broad and small nonaligned swells instead.
      const roughnessRipple = lowSea ? 0.018 : 0.055;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float skyTime; varying vec2 vSeaW;')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nfloat ripple = sin(vSeaW.x * 0.028 + vSeaW.y * 0.015 + skyTime * 0.32) * cos(vSeaW.y * 0.021 - skyTime * 0.25); roughnessFactor = clamp(roughnessFactor + ripple * ${roughnessRipple.toFixed(3)}, 0.08, 1.0);`)
        .replace('#include <color_fragment>', `#include <color_fragment>\nfloat swellA = sin(vSeaW.x * 0.008 + vSeaW.y * 0.004 + skyTime * 0.23); float swellB = sin(vSeaW.x * 0.004 - vSeaW.y * 0.013 - skyTime * 0.19); float fine = sin(vSeaW.x * 0.035 + skyTime * 0.46) * cos(vSeaW.y * 0.029 - skyTime * 0.41); diffuseColor.rgb *= 0.96 + swellA * 0.025 + swellB * 0.025 + fine * 0.012;`);
    };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000, 80, 80), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.y = -1; sea.receiveShadow = true; sc.add(sea); this.sea = sea;
    // 섬 지형
    const N = 200, size = 7600, geo = new THREE.PlaneGeometry(size, size, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3), c = new THREE.Color(), grass = new THREE.Color(0x2c6a2c), rock = new THREE.Color(0x77695a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = terrainY(x, z); pos.setY(i, h - (h < 1 ? 6 : 0));
      if (h < 6) c.set(0x2a6f9c); else if (h < 22) c.set(0xe2cf94); else if (h < 160) c.setHex(0x3f8a3a).lerp(grass, h / 160); else if (h < 280) c.set(0x7a6f62); else c.set(0xf2f4f8);
      if (h >= 22 && h < 280) { // 완만한 곳은 풀빛이 번갈아 변하고, 가파른 곳은 바위가 드러남
        const slope = (Math.abs(terrainY(x + 20, z) - h) + Math.abs(terrainY(x, z + 20) - h)) / 20, patch = Math.sin(x * 0.011 + Math.cos(z * 0.007) * 2) * Math.cos(z * 0.013 - x * 0.004);
        if (h < 160) c.offsetHSL(patch * 0.025, patch * 0.05, patch * 0.045); c.lerp(rock, Math.min(0.75, Math.max(0, (slope - 0.55) * 1.2)));
      }
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const detail = terrainDetail(); detail.repeat.set(110, 110); const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, flatShading: true })); land.receiveShadow = true; sc.add(land);
    // 경계 링(월드 끝 표시)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(WORLD_R, 4, 6, 120), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.35 })); ring.rotation.x = Math.PI / 2; ring.position.y = 40; sc.add(ring);
    // 구름
    const ct = this.cloudTex = cloudSprite();
    for (let i = 0; i < (this.quality === 'high' ? 60 : this.quality === 'standard' ? 40 : 24); i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.55 + Math.random() * 0.35, depthWrite: false, fog: false })); const k = 260 + Math.random() * 520; s.scale.set(k * 1.8, k * 0.8, 1); s.position.set((Math.random() - 0.5) * 7000, 500 + Math.random() * 1100, (Math.random() - 0.5) * 7000); sc.add(s); this.clouds.push(s); }
    // 파티클 풀
    this.firePool = new BillboardPool(this.fire, true, 160); this.smokePool = new BillboardPool(this.smoke, false, 120); sc.add(this.firePool.mesh, this.smokePool.mesh);
    // 예광탄
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3)); tg.setDrawRange(0, 0);
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); this.tracers.frustumCulled = false; sc.add(this.tracers);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(this.tracerHeadPos, 3)); hg.setDrawRange(0, 0); // 탄두 빛망울
    this.tracerHeads = new THREE.Points(hg, new THREE.PointsMaterial({ map: glowSprite('rgba(255,250,210,1)', 'rgba(255,170,60,0)'), size: 26, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); this.tracerHeads.frustumCulled = false; sc.add(this.tracerHeads);
  }
  private dome: THREE.Mesh; private sea: THREE.Mesh;

  /** 적응형 화질: 1 그림자 끔 · 2 구름 절반 · 3 구름 전부 숨김 + 파티클 절반 */
  setLevel(l: number): void {
    this.level = l;
    // 적응형 품질이 회복되면 그림자도 다시 켭니다 (저사양 설정은 계속 비활성).
    this.sun.castShadow = l < 1 && this.quality !== 'low';
    this.clouds.forEach((c, i) => { c.visible = l < 3 && (l < 2 || i % 2 === 0); });
    const sea = this.sea.material as THREE.MeshStandardMaterial;
    const smoothWater = this.quality === 'low' || l >= 2;
    sea.roughness = smoothWater ? 0.72 : 0.3;
    sea.metalness = smoothWater ? 0.12 : 0.42;
    sea.normalScale.setScalar(smoothWater ? 0.18 : 0.52);
  }
  resize(w: number, h: number): void { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  private emit(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, grow: number, kind: 'fire' | 'smoke', color = 0xffffff): void {
    if (this.level >= 3 && Math.random() < 0.5) return; // 최저 단계: 파티클 절반만
    (kind === 'fire' ? this.firePool : this.smokePool).emit(pos, vel, life, size, grow, color, this.tmpColor);
  }
  boom(pos: THREE.Vector3, big: boolean): void {
    if (this.rings.length >= 32) { const old = this.rings.shift()!; this.scene.remove(old.mesh); this.disposeObject(old.mesh); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.copy(pos); ring.quaternion.copy(this.camera.quaternion); this.scene.add(ring); this.rings.push({ mesh: ring, life: 0.45, max: big ? 160 : 75 });
    const n = big ? 18 : 8, sz = big ? 60 : 28;
    this.emit(pos, this.v1.set(0, 0, 0), 0.22, big ? 150 : 70, 0.6, 'fire', 0xfff2d0); // 순간 섬광
    for (let i = 0; i < n; i++) this.emit(pos, this.v1.set((Math.random() - 0.5) * 90, (Math.random() - 0.3) * 80, (Math.random() - 0.5) * 90), 0.6 + Math.random() * 0.6, sz * (0.6 + Math.random() * 0.8), 2.2, 'fire', i % 3 ? 0xffb040 : 0xff5a20);
    for (let i = 0; i < n / 2; i++) this.emit(pos, this.v1.set((Math.random() - 0.5) * 40, 10 + Math.random() * 30, (Math.random() - 0.5) * 40), 2 + Math.random(), sz, 1.6, 'smoke');
    for (let i = 0; i < (big ? 10 : 5); i++) this.emit(pos, this.v1.set((Math.random() - 0.5) * 180, Math.random() * 120, (Math.random() - 0.5) * 180), 0.45 + Math.random() * 0.4, 3, -0.3, 'fire', 0xffd07a);
    const d = pos.distanceTo(this.camera.position); if (!this.reducedMotion && d < 700) this.shake = Math.max(this.shake, (big ? 1 : 0.5) * (1 - d / 700));
  }
  /** Bright countermeasure flares deploy in diverging streaks behind both wings.
   * Uses the pooled billboards; no new Three.js mesh or texture per activation. */
  deployFlares(pos: THREE.Vector3, orientation: THREE.Quaternion): void {
    for (const side of [-1, 1]) {
      const origin = this.v3.set(side * 5, -1.8, 5).applyQuaternion(orientation).add(pos);
      for (let i = 0; i < 10; i++) {
        const velocity = this.v2.set(side * (35 + Math.random() * 25),
          -12 + Math.random() * 18, 35 + Math.random() * 35).applyQuaternion(orientation);
        this.emit(origin, velocity, 0.6 + Math.random() * 0.6,
          10 + Math.random() * 8, -0.6, 'fire', i % 3 === 0 ? 0xfffae1 : 0xffbb66);
      }
      for (let i = 0; i < 5; i++) {
        const velocity = this.v2.set(side * (20 + Math.random() * 14),
          -5 + Math.random() * 12, 25 + Math.random() * 20).applyQuaternion(orientation);
        this.emit(origin, velocity, 1.1 + Math.random() * 0.5,
          12 + Math.random() * 7, 1.1, 'smoke', 0xb0bbc4);
      }
    }
  }
  spark(pos: THREE.Vector3): void { for (let i = 0; i < 3; i++) this.emit(pos, this.v1.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60), 0.25, 8, 0.2, 'fire', 0xffe08a); }
  kick(a: number): void { if (!this.reducedMotion) this.shake = Math.max(this.shake, a); }

  sync(sim: SkySim, dt: number, time: number): void {
    this.jetIds.clear();
    // 제트 메시
    for (const j of sim.jets) {
      let m = this.meshes.get(j.id);
      if (!j.alive) { if (m) { this.scene.remove(m); this.disposeObject(m); this.meshes.delete(j.id); } continue; }
      this.jetIds.add(j.id);
      if (!m) { m = buildJet(j.kind, j.team); m.userData.team = j.team; this.scene.add(m); this.meshes.set(j.id, m); }
      m.visible = !(this.cockpit && j.team === 'player');
      m.position.copy(j.pos); m.quaternion.copy(j.q);
      if (j.team === 'enemy') {
        const detail = m.userData.detailGroup as THREE.Group | undefined;
        if (detail) {
          const maxDistance = this.level >= 2 ? 850 : this.level === 1 ? 1250 : this.quality === 'high' ? 2400 : this.quality === 'standard' ? 1700 : 1100;
          detail.visible = j.pos.distanceToSquared(sim.player.pos) <= maxDistance * maxDistance;
        }
      }
      const throttle = THREE.MathUtils.clamp(j.throttle + (j.boosting ? 0.6 : 0), 0, 1.6);
      const fl = m.getObjectByName('flame') as THREE.Mesh | undefined; if (fl) {
        fl.scale.set(0.65 + throttle * 0.55, 0.45 + throttle * 1.4 + Math.sin(time * 40 + j.id) * 0.1, 0.65 + throttle * 0.55);
        (fl.material as THREE.MeshBasicMaterial).opacity = 0.4 + throttle * 0.55;
      }
      const core = m.getObjectByName('flameCore') as THREE.Mesh | undefined;
      if (core) { core.scale.set(0.7 + throttle * 0.3, 0.55 + throttle * 0.8, 0.7 + throttle * 0.3); (core.material as THREE.MeshBasicMaterial).opacity = 0.35 + throttle * 0.32; }
      if ((j.speed > 170 || (j.speed > 120 && Math.abs(j.roll) > 0.8)) && Math.random() < Math.min(1, dt * 24)) {
        const tip = this.v1;
        for (const side of [-1, 1]) {
          tip.set(side * (j.kind === 'boss' ? 11 : j.kind === 'bomber' ? 9.5 : j.kind === 'ace' ? 8.2 : 7.2), 0, 2.2).multiplyScalar(j.kind === 'boss' ? 2.8 : j.kind === 'bomber' ? 1.7 : 1).applyQuaternion(j.q).add(j.pos);
          this.emit(tip, this.v2.set(0, 0, 0), 0.8, 5, 0.9, 'smoke', 0xe0eaf0);
        }
      }
      if (j.hp < j.maxHp * 0.45 && Math.random() < dt * 14) this.emit(j.pos, this.v2.set(0, 6, 0), 1.2, 16, 2, 'smoke'); // 피격 연기
      if (j.hp < j.maxHp * 0.2 && Math.random() < dt * 20) this.emit(j.pos, this.v2.set(0, 4, 0), 0.4, 14, 1, 'fire', 0xff6a20);
    }
    for (const [id, m] of this.meshes) if (!this.jetIds.has(id)) { this.scene.remove(m); this.disposeObject(m); this.meshes.delete(id); }
    // 픽업(수리/탄약 링)
    const pk = this.pickupIds; pk.clear();
    for (const k of sim.pickups) {
      pk.add(k.id); let m = this.pickMeshes.get(k.id);
      if (!m) {
        const tint = k.kind === 'repair' ? 0x5dff8f : k.kind === 'shield' ? 0xffe27a : 0x6ab8ff;
        m = new THREE.Mesh(new THREE.TorusGeometry(9, 1.6, 8, 24), new THREE.MeshBasicMaterial({ color: tint }));
        const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupIcon(k.kind), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); icon.scale.setScalar(20); m.add(icon); // 링 안에 그린 아이콘
        this.scene.add(m); this.pickMeshes.set(k.id, m); }
      m.position.copy(k.pos); m.rotation.y = time * 3; m.rotation.x = Math.PI / 2 * 0.5; m.scale.setScalar(1 + 0.15 * Math.sin(time * 6));
    }
    for (const [id, m] of this.pickMeshes) if (!pk.has(id)) { this.scene.remove(m); this.disposeObject(m); this.pickMeshes.delete(id); }
    // 미사일
    const seen = this.missileIds; seen.clear();
    for (const ms of sim.missiles) {
      seen.add(ms.id); let m = this.missileMeshes.get(ms.id);
      if (!m) {
        m = this.missilePool.pop();
        if (!m) {
          const steel = new THREE.MeshStandardMaterial({ color: 0x59616c, metalness: 0.6, roughness: 0.4 });
          m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 5, 8), new THREE.MeshStandardMaterial({ map: missileSkin(), metalness: 0.35, roughness: 0.45 })); m.rotation.order = 'YXZ';
          const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xd63a3a, metalness: 0.3, roughness: 0.4 })); nose.position.y = 3.3; m.add(nose);
          for (let f = 0; f < 4; f++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 1.2), steel); fin.position.y = -1.9; fin.rotation.y = f * Math.PI / 2; fin.translateZ(0.8); m.add(fin); }
        }
        this.scene.add(m); this.missileMeshes.set(ms.id, m);
      }
      m.position.copy(ms.pos); m.lookAt(this.v1.copy(ms.pos).add(ms.vel)); m.rotateX(Math.PI / 2);
      if (Math.random() < Math.min(1, dt * 30)) this.emit(ms.pos, this.v1.set(0, 3, 0), 1.1, 9, 1.8, 'smoke', 0xc8ccd0);
      if (Math.random() < Math.min(1, dt * 24)) this.emit(ms.pos, this.v1.set(0, 0, 0), 0.18, 10, 0.5, 'fire', 0xffa040);
    }
    for (const [id, m] of this.missileMeshes) if (!seen.has(id)) {
      this.scene.remove(m);
      if (this.missilePool.length < 24) this.missilePool.push(m);
      else this.disposeObject(m);
      this.missileMeshes.delete(id);
    }
    // 예광탄
    let n = 0; const tp = this.tracerPos;
    const hp = this.tracerHeadPos;
    for (const b of sim.bullets) { if (n >= 400) break; hp[n * 3] = b.pos.x; hp[n * 3 + 1] = b.pos.y; hp[n * 3 + 2] = b.pos.z; const o = n * 6; tp[o] = b.pos.x; tp[o + 1] = b.pos.y; tp[o + 2] = b.pos.z; tp[o + 3] = b.pos.x - b.vel.x * 0.035; tp[o + 4] = b.pos.y - b.vel.y * 0.035; tp[o + 5] = b.pos.z - b.vel.z * 0.035; n++; }
    (this.tracers.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; this.tracers.geometry.setDrawRange(0, n * 2); (this.tracerHeads.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; this.tracerHeads.geometry.setDrawRange(0, n);
    // 파티클
    this.firePool.update(dt); this.smokePool.update(dt);
    // 하늘·바다가 카메라를 따라감(무한한 느낌)
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life -= dt; const k = Math.max(0, r.life / 0.45); r.mesh.scale.setScalar(r.max * (1 - k) + 1); (r.mesh.material as THREE.MeshBasicMaterial).opacity = k * 0.7; if (r.life <= 0) { this.scene.remove(r.mesh); this.disposeObject(r.mesh); this.rings.splice(i, 1); } }
    this.seaTime.value = this.reducedMotion ? 0 : time;
    if (this.sun.castShadow) { const pp = sim.player.pos; this.sun.target.position.set(pp.x, 0, pp.z); this.sun.position.copy(this.sun.target.position).addScaledVector(this.shadowSun, 2200); }
    if (!this.reducedMotion) for (const cloud of this.clouds) { cloud.position.x += 6 * dt; if (cloud.position.x > 3600) cloud.position.x -= 7200; }
    this.dome.position.copy(this.camera.position); this.sunGlow.position.copy(this.camera.position).addScaledVector(this.shadowSun, 7000); this.sea.position.x = this.camera.position.x; this.sea.position.z = this.camera.position.z; this.seaOrigin.value.set(this.camera.position.x, this.camera.position.z); // 바다 무늬를 월드에 고정(카메라를 따라다니면 정지한 듯 보임)
    // The low-quality sea uses fewer repeated normal-map tiles. Keep texture
    // motion world-anchored using the actual repeat count instead of the
    // high-quality 125m tile width, or low-end devices see sliding ripples.
    const normalTileX = this.seaNormalMap.repeat.x / 20000;
    const normalTileZ = this.seaNormalMap.repeat.y / 20000;
    this.seaNormalMap.offset.set((this.reducedMotion ? 0 : time * 0.004) + this.camera.position.x * normalTileX,
      (this.reducedMotion ? 0 : time * 0.0027) - this.camera.position.z * normalTileZ);
  }

  /** 추적 카메라(부드러운 지연 + 속도감 FOV + 폭발 흔들림). boost: 0~1 */
  follow(p: Jet, dt: number, look: THREE.Vector2, boost: number): void {
    if (this.cockpit) {
      const offset = this.v1.set(0, 1.2, -2.5).applyQuaternion(p.q);
      this.camera.position.copy(p.pos).add(offset);
      this.camera.quaternion.copy(p.q);
      const vibration = this.reducedMotion ? 0 : 0.025 + Math.max(0, p.speed - 120) * 0.0008 + boost * 0.12 + this.shake * 0.5;
      this.camera.position.add(this.v1.set((Math.random() - 0.5) * vibration, (Math.random() - 0.5) * vibration, 0).applyQuaternion(p.q));
    } else {
      const fwd = forward(p, this.v1), up = this.v2.copy(this.up).applyQuaternion(p.q);
      const want = this.v3.copy(p.pos).addScaledVector(fwd, -34 - boost * 10).addScaledVector(up, 9 + p.pitch * -4);
      this.camera.position.lerp(want, Math.min(1, dt * 7));
      const target = this.v4.copy(p.pos).addScaledVector(fwd, 120);
      const q = this.matrix.lookAt(this.camera.position, target, up.lerp(this.up, 0.5)); const tq = this.rotation.setFromRotationMatrix(q);
      this.camera.quaternion.slerp(tq, Math.min(1, dt * 6));
      if (!this.reducedMotion && this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * this.shake * 5; this.camera.position.y += (Math.random() - 0.5) * this.shake * 5; }
    }
    this.shake = Math.max(0, this.shake - dt * 2);
    const fov = this.cockpit ? 70 + boost * 5 : 62 + boost * 14 + (p.speed - 140) * 0.06;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); void look;
  }

  /** 월드 좌표→화면(0~1). 화면 밖/뒤면 null */
  project(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const p = this.v1.copy(v).project(this.camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, behind: p.z > 1 };
  }
  private disposeObject(object: THREE.Object3D): void {
    // Models, instanced panel batches, and atmosphere sprites share resources.
    // Disposing each shared geometry/material only once avoids redundant GPU
    // resource invalidation when a sortie is restarted or the game is closed.
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && !geometries.has(mesh.geometry)) geometries.add(mesh.geometry);
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(m => materials.add(m));
      else if (mat) materials.add(mat);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }
  dispose(): void { this.disposeObject(this.scene); for (const mesh of this.missilePool) this.disposeObject(mesh); this.missilePool.length = 0; this.fire.dispose(); this.smoke.dispose(); this.cloudTex.dispose(); this.sunTex.dispose(); this.environment?.dispose(); this.atmosphereTextures.forEach(t => t.dispose()); disposeArt(); }
}
