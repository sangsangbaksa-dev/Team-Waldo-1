// LAST CITY — Three.js 3D 렌더러 (1인칭 / 3인칭 / 차량 추격 카메라)
import * as THREE from 'three';
import { ACTORS, BIZ, BLOCK, BLOCKS, CIV, FACTIONS, PITCH, POLICE, ROAD, SIZE, STRUCTS, WEAPONS, type StructKind } from './defs';
import { solidAt } from './map';
import type { Business, Fx, Loot, Structure, Vehicle, World } from './world';
import type { Ghost } from './render';
import { ModelLayer } from './modellayer';
import { buildBuildings, buildPerimeter } from './buildings';
import type { Models } from './models';
import { Interior3D } from './interior3d';

export type ViewMode = 'fp' | 'tp';
const EYE = 46, STRUCT_H: Record<StructKind, number> = { hq: 150, barracks: 86, depot: 58, factory: 104, lab: 96, turret: 50 };
const CLOTH = [0x8d99ae, 0xb08968, 0x6d8a96, 0xa58fb3, 0x9aa37b, 0xc58f8f], SKIN = [0xf1c9a5, 0xd9a47a, 0xa8744f, 0x7a5236];
const fcol = (f: number): number => f === POLICE ? 0x3f6fe0 : f === CIV ? 0x9aa3ad : new THREE.Color(FACTIONS[f]?.color ?? '#fff').getHex();
interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; r: number; g: number; b: number; grav: number }

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
class Points {
  parts: P[] = []; geo = new THREE.BufferGeometry(); pos: Float32Array; col: Float32Array; mesh: THREE.Points;
  constructor(public max: number, size: number, additive: boolean, tex: THREE.Texture, public fade: boolean) {
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.mesh = new THREE.Points(this.geo, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true }));
    this.mesh.frustumCulled = false;
  }
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, grav = 0): void {
    if (this.parts.length >= this.max) return; this.parts.push({ x, y, z, vx, vy, vz, life, max: life, r: (color >> 16 & 255) / 255, g: (color >> 8 & 255) / 255, b: (color & 255) / 255, grav });
  }
  update(dt: number): void {
    let n = 0;
    for (const p of this.parts) {
      p.life -= dt; if (p.life <= 0) continue; p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 1) { p.y = 1; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const k = p.life / p.max; this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z; this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = this.fade ? k * 0.7 : Math.min(1, k * 2); n++;
    }
    this.parts = this.parts.filter(p => p.life > 0); this.geo.setDrawRange(0, n); this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

export class Renderer3D {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(74, 1, 3, 5200);
  yaw = 0; pitch = -0.05; mode: ViewMode = 'fp'; w = 0; h = 0; shake = 0; t = 0; reduced = false; recoil = 0; flashT = 0; camPos = new THREE.Vector3(); chaseYaw = 0; private focus = new THREE.Vector2(SIZE / 2, SIZE / 2); private deadT = 0;
  private dummy = new THREE.Object3D(); private color = new THREE.Color();
  private bodies: THREE.InstancedMesh; private heads: THREE.InstancedMesh; private guns: THREE.InstancedMesh; private hulls: THREE.InstancedMesh; private turrets: THREE.InstancedMesh; private barrels: THREE.InstancedMesh;
  private crystals: THREE.InstancedMesh; private tracers: THREE.InstancedMesh; private rings: THREE.InstancedMesh; private ringList: { x: number; y: number; r0: number; r1: number; life: number; max: number; color: number }[] = [];
  private sparks: Points; private fire: Points; private smoke: Points; private ml: ModelLayer | null = null;
  private structs = new Map<number, THREE.Group>(); private vehs = new Map<number, THREE.Group>(); private loots = new Map<number, THREE.Group>(); private biz = new Map<number, { g: THREE.Group; sig: string; label: THREE.Sprite; ring: THREE.Mesh; beam: THREE.Mesh; icon: THREE.Object3D | null }>();
  private booms: { m: THREE.Mesh; life: number; r: number }[] = []; private light: THREE.PointLight; private lightT = 0;
  private zoneWall: THREE.Mesh; private zoneTex: THREE.Texture; private nextRing: THREE.Mesh; private ghost: THREE.Mesh; private sun: THREE.DirectionalLight; private gun = new THREE.Group(); private muzzle: THREE.Mesh; private planes: THREE.Group[] = [];
  private bossRings: THREE.Mesh[] = []; floaters: { el: HTMLElement; x: number; y: number; h: number; life: number }[] = [];
  private ins: Interior3D | null = null; private insKind = '';
  private mats = new Map<number, THREE.MeshLambertMaterial>(); private box = new THREE.BoxGeometry(1, 1, 1); private glow: THREE.Texture;

  constructor(public canvas: HTMLCanvasElement, public world: World, public quality: 'high' | 'standard' | 'low', public layer: HTMLElement, public models: Models | null = null) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(quality === 'high' ? 2 : quality === 'standard' ? 1.5 : 1, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = quality === 'high'; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 필름 톤매핑: 하이라이트가 하얗게 날아가지 않고 노을빛이 부드럽게 번진다.
    if (quality !== 'low') { this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.18; }
    const sc = this.scene, w = world;
    sc.fog = new THREE.Fog(0xd8a488, 700, 4300); sc.add(this.camera);
    // 하늘 돔 (노을)
    const skyGeo = new THREE.SphereGeometry(4800, 24, 12), sp = skyGeo.attributes.position, cols = new Float32Array(sp.count * 3), top = new THREE.Color(0x3d5a9e), mid = new THREE.Color(0xf0a878), low = new THREE.Color(0xd8a488);
    for (let i = 0; i < sp.count; i++) { const k = Math.max(0, sp.getY(i) / 4800), c = k < 0.25 ? low.clone().lerp(mid, k / 0.25) : mid.clone().lerp(top, Math.min(1, (k - 0.25) / 0.6)); cols.set([c.r, c.g, c.b], i * 3); }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -1; sky.name = 'sky'; sc.add(sky);
    sc.add(new THREE.HemisphereLight(0xaebfff, 0x7a5a48, 1.3));
    this.sun = new THREE.DirectionalLight(0xffd2a0, 2.3); this.sun.position.set(-600, 700, -400); sc.add(this.sun); sc.add(this.sun.target);
    if (quality === 'high') { this.sun.castShadow = true; const s = this.sun.shadow; s.mapSize.set(2048, 2048); s.camera.left = s.camera.bottom = -1100; s.camera.right = s.camera.top = 1100; s.camera.near = 10; s.camera.far = 3000; s.bias = -0.0012; }
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(190, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false })); sunDisc.position.set(-3700, 1000, -2400); sky.add(sunDisc);
    // 바다 + 지면
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshLambertMaterial({ color: 0x2b5f7a })); sea.rotation.x = -Math.PI / 2; sea.position.set(SIZE / 2, -6, SIZE / 2); sc.add(sea);
    const T = quality === 'low' ? 2048 : 4096, k = T / SIZE, gt = canvasTex(T, T, g => {
      g.fillStyle = '#3a3d44'; g.fillRect(0, 0, T, T); g.scale(k, k);
      g.strokeStyle = 'rgba(232,205,110,0.75)'; g.lineWidth = 3.5; g.setLineDash([24, 26]); g.beginPath();
      for (let i = 0; i <= BLOCKS; i++) { const c = i * PITCH + ROAD / 2; g.moveTo(c, 0); g.lineTo(c, SIZE); g.moveTo(0, c); g.lineTo(SIZE, c); } g.stroke(); g.setLineDash([]);
      for (let j = 0; j <= BLOCKS; j++) for (let i = 0; i <= BLOCKS; i++) { const x = i * PITCH, y = j * PITCH; g.fillStyle = '#3a3d44'; g.fillRect(x, y, ROAD, ROAD); g.fillStyle = 'rgba(240,240,245,0.5)'; for (let q = 0; q < 6; q++) { g.fillRect(x + 12 + q * 17, y - 18, 9, 14); g.fillRect(x + 12 + q * 17, y + ROAD + 4, 9, 14); g.fillRect(x - 18, y + 12 + q * 17, 14, 9); g.fillRect(x + ROAD + 4, y + 12 + q * 17, 14, 9); } }
      const fill: Record<string, string> = { city: '#6f7178', park: '#4d7a4a', lot: '#4a4d54', police: '#5d6880', military: '#6b7055', plaza: '#8d8a84', base: '#5c6660' };
      for (const b of w.map.blocks) {
        g.fillStyle = '#1f2125'; g.fillRect(b.x - 3, b.y - 3, BLOCK + 6, BLOCK + 6); g.fillStyle = '#c9cacd'; g.fillRect(b.x, b.y, BLOCK, BLOCK); g.fillStyle = '#a9abaf'; g.fillRect(b.x + 3, b.y + 3, BLOCK - 6, BLOCK - 6);
        g.strokeStyle = 'rgba(70,72,78,0.45)'; g.lineWidth = 1; g.beginPath(); for (let q = 6; q < BLOCK - 4; q += 20) { g.moveTo(b.x + q, b.y + 4); g.lineTo(b.x + q, b.y + BLOCK - 4); g.moveTo(b.x + 4, b.y + q); g.lineTo(b.x + BLOCK - 4, b.y + q); } g.stroke(); g.fillStyle = fill[b.type]; g.fillRect(b.x + 14, b.y + 14, BLOCK - 28, BLOCK - 28);
        if (b.type === 'plaza' || b.type === 'city') { g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = 1; g.beginPath(); for (let q = 1; q < 11; q++) { g.moveTo(b.x + q * 40, b.y + 14); g.lineTo(b.x + q * 40, b.y + BLOCK - 14); g.moveTo(b.x + 14, b.y + q * 40); g.lineTo(b.x + BLOCK - 14, b.y + q * 40); } g.stroke(); }
        if (b.type === 'lot') { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2.5; g.beginPath(); for (let q = 0; q < 6; q++) { g.moveTo(b.x + 56 + q * 68, b.y + 290); g.lineTo(b.x + 56 + q * 68, b.y + 372); } g.stroke(); }
        if (b.type === 'park') for (let q = 0; q < 60; q++) { g.fillStyle = q % 2 ? 'rgba(90,140,80,0.5)' : 'rgba(60,100,60,0.5)'; g.beginPath(); g.arc(b.x + 20 + (q * 97) % 400, b.y + 20 + (q * 61) % 400, 10 + q % 9, 0, 6.29); g.fill(); }
      }
      for (let q = 0; q < 9000; q++) { g.fillStyle = q % 3 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.06)'; g.fillRect((q * 7561) % SIZE, (q * 6029) % SIZE, 2 + q % 6, 2 + q % 4); }
      for (let q = 0; q < 2600; q++) { g.fillStyle = q % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)'; g.fillRect((q * 7919) % SIZE, (q * 104729) % SIZE, 14 + q % 30, 3 + q % 5); }
    });
    gt.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); gt.minFilter = THREE.LinearMipmapLinearFilter;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshLambertMaterial({ map: gt })); ground.rotation.x = -Math.PI / 2; ground.position.set(SIZE / 2, 0, SIZE / 2); ground.receiveShadow = true; sc.add(ground);
    this.buildCity();
    this.glow = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    // 태양 주변 후광: 지평선 가까운 노을 하늘에 따뜻한 빛 번짐을 더한다.
    for (const [size, opacity, color] of [[1500, 0.34, 0xffb27a], [3600, 0.2, 0xff9a62]] as const) { const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(size, size, 1); halo.position.set(-3700, 1000, -2400).multiplyScalar(0.98); sky.add(halo); }
    this.sparks = new Points(500, 7, true, this.glow, false); this.fire = new Points(400, 46, true, this.glow, false); this.smoke = new Points(300, 70, false, this.glow, true); sc.add(this.sparks.mesh, this.fire.mesh, this.smoke.mesh);
    if (this.models) { try { this.ml = new ModelLayer(sc, w, this.models, this.glow, quality === 'high'); } catch { this.ml = null; } }
    // 인스턴스 메시
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, shadow = true): THREE.InstancedMesh => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sc.add(m); return m; };
    const lam = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: 0xffffff });
    const bodyGeo = new THREE.CylinderGeometry(0.72, 0.85, 1, 10); bodyGeo.translate(0, 0.5, 0);
    this.bodies = inst(bodyGeo, lam(), 520); this.heads = inst(new THREE.SphereGeometry(1, 10, 8), lam(), 520); this.guns = inst(this.box, new THREE.MeshLambertMaterial({ color: 0x1a1c20 }), 520, false);
    this.hulls = inst(this.box, lam(), 90); this.turrets = inst(new THREE.CylinderGeometry(1, 1, 1, 10), lam(), 90); this.barrels = inst(this.box, new THREE.MeshLambertMaterial({ color: 0x1c1e22 }), 90, false);
    this.crystals = inst(new THREE.OctahedronGeometry(1), new THREE.MeshLambertMaterial({ color: 0x52d9ff, emissive: 0x1a7fa8, emissiveIntensity: 0.9 }), w.crystals.length, false);
    this.tracers = inst(this.box, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 500, false);
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40); ringGeo.rotateX(-Math.PI / 2); this.rings = inst(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }), 60, false);
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: fcol(i), side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })); m.visible = false; sc.add(m); this.bossRings.push(m); }
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.visible = false; sc.add(m); this.booms.push({ m, life: 0, r: 1 }); }
    this.light = new THREE.PointLight(0xffb060, 0, 900, 0); sc.add(this.light);
    // 자기장
    this.zoneTex = canvasTex(64, 64, g => { g.fillStyle = 'rgba(150,90,255,0.55)'; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(225,190,255,0.95)'; g.lineWidth = 7; for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke(); } });
    this.zoneTex.wrapS = this.zoneTex.wrapT = THREE.RepeatWrapping;
    this.zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true), new THREE.MeshBasicMaterial({ map: this.zoneTex, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, fog: false })); this.zoneWall.renderOrder = 5; sc.add(this.zoneWall);
    this.nextRing = new THREE.Mesh(new THREE.RingGeometry(0.992, 1, 128).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false, fog: false })); sc.add(this.nextRing);
    this.ghost = new THREE.Mesh(this.box, new THREE.MeshBasicMaterial({ color: 0x66ff9c, transparent: true, opacity: 0.45, depthWrite: false })); this.ghost.visible = false; sc.add(this.ghost);
    // 1인칭 무기 모델
    const gm = new THREE.MeshLambertMaterial({ color: 0x24272c }), g1 = new THREE.Mesh(this.box, gm), g2 = new THREE.Mesh(this.box, gm), g3 = new THREE.Mesh(this.box, new THREE.MeshLambertMaterial({ color: 0xd9a47a }));
    g1.scale.set(1.5, 2, 13); g1.position.set(0, 0, -6); g2.scale.set(1.4, 4.2, 2.2); g2.position.set(0, -2.6, -0.5); g3.scale.set(2.6, 2.8, 7); g3.position.set(0.3, -4, 3.5);
    this.muzzle = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshBasicMaterial({ map: this.glow, color: 0xffd98a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false })); this.muzzle.position.set(0, 0.3, -14);
    this.gun.add(g1, g2, g3, this.muzzle); this.gun.position.set(6.5, -6.2, -15); this.camera.add(this.gun);
    this.resize();
  }
  private mat(c: number): THREE.MeshLambertMaterial { let m = this.mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); this.mats.set(c, m); } return m; }

  private buildCity(): void {
    const w = this.world; buildBuildings(w, this.scene, import.meta.env.BASE_URL); buildPerimeter(this.scene);
    if (this.models) return;
    // 나무·가로등
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(3, 4, 40, 6), this.mat(0x5b4030), w.map.trees.length), leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.mat(0x3f7d45), w.map.trees.length);
    w.map.trees.forEach((t, i) => { this.dummy.rotation.set(0, i, 0); this.dummy.position.set(t.x, 20, t.y); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); trunk.setMatrixAt(i, this.dummy.matrix); this.dummy.position.set(t.x, 52 + t.r * 0.5, t.y); this.dummy.scale.set(t.r * 1.15, t.r * 1.3, t.r * 1.15); this.dummy.updateMatrix(); leaf.setMatrixAt(i, this.dummy.matrix); });
    leaf.castShadow = trunk.castShadow = true; this.scene.add(trunk, leaf);
    const n = w.map.blocks.length * 4, pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 2, 95, 5), this.mat(0x30333a), n), bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }), n); let q = 0;
    for (const b of w.map.blocks) for (const [dx, dy] of [[8, 8], [BLOCK - 8, 8], [8, BLOCK - 8], [BLOCK - 8, BLOCK - 8]]) { this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(1, 1, 1); this.dummy.position.set(b.x + dx, 47, b.y + dy); this.dummy.updateMatrix(); pole.setMatrixAt(q, this.dummy.matrix); this.dummy.position.y = 97; this.dummy.updateMatrix(); bulb.setMatrixAt(q++, this.dummy.matrix); }
    this.scene.add(pole, bulb);
  }
  resize(): void { this.w = this.canvas.clientWidth || window.innerWidth; this.h = this.canvas.clientHeight || window.innerHeight; this.renderer.setSize(this.w, this.h, false); this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix(); }
  dispose(): void { this.ins?.dispose(); this.ins = null; this.renderer.dispose(); this.scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); for (const f of this.floaters) f.el.remove(); }
  /** 조준선이 닿는 지면 좌표 */
  groundPoint(max = 760): { x: number; y: number } {
    const b = this.world.boss(0), ox = b ? b.x : this.camPos.x, oy = b ? b.y : this.camPos.z; let d = this.pitch < -0.03 ? Math.min(max, (this.mode === 'fp' ? EYE : 120) / Math.tan(-this.pitch)) : max * 0.8; d = Math.max(70, d);
    return { x: ox + Math.cos(this.yaw) * d, y: oy + Math.sin(this.yaw) * d };
  }
  project(x: number, y: number, h: number): { x: number; y: number; behind: boolean } { const v = new THREE.Vector3(x, h, y).project(this.camera); return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, behind: v.z > 1 }; }
  floater(x: number, y: number, h: number, text: string, color: string): void {
    if (this.floaters.length > 24) return; const el = document.createElement('div'); el.className = 'c-float'; el.textContent = text; el.style.color = color; this.layer.append(el); this.floaters.push({ el, x, y, h, life: 1.4 });
  }
  ring(x: number, y: number, r0: number, r1: number, color: number, life = 0.5): void { if (this.ringList.length < 58) this.ringList.push({ x, y, r0, r1, life, max: life, color }); }

  consume(events: Fx[]): void {
    const rnd = Math.random, cx = this.camPos.x, cz = this.camPos.z;
    for (const e of events) {
      const d = Math.hypot(e.x - cx, e.y - cz), near = d < 1500;
      if (e.t === 'shot' && near) { const a = e.a ?? 0; this.fire.add(e.x, 30, e.y, Math.cos(a) * 40, 0, Math.sin(a) * 40, 0.07, 0xffd98a); for (let k = 0; k < 2; k++) this.sparks.add(e.x, 30, e.y, Math.cos(a + (rnd() - 0.5)) * 160, 30 + rnd() * 60, Math.sin(a + (rnd() - 0.5)) * 160, 0.25, 0xffe9a8, 300); }
      else if ((e.t === 'hit' || e.t === 'splat') && near) for (let k = 0; k < (e.t === 'splat' ? 14 : 5); k++) this.sparks.add(e.x, 26, e.y, (rnd() - 0.5) * 180, rnd() * 140, (rnd() - 0.5) * 180, 0.5, 0xc0182b, 420);
      else if (e.t === 'spark' && near) for (let k = 0; k < 4; k++) this.sparks.add(e.x, 28, e.y, (rnd() - 0.5) * 220, rnd() * 160, (rnd() - 0.5) * 220, 0.3, 0xffe9a8, 420);
      else if (e.t === 'death' && near) for (let k = 0; k < 14; k++) this.sparks.add(e.x, 22, e.y, (rnd() - 0.5) * 220, rnd() * 200, (rnd() - 0.5) * 220, 0.7, k % 3 ? 0xb3142a : fcol(e.f ?? CIV), 420);
      else if (e.t === 'boom') {
        const r = Math.max(50, e.a ?? 80);
        if (near) { for (let k = 0; k < 16; k++) { const a = rnd() * 6.28, s = rnd() * r * 1.6; this.fire.add(e.x, 20 + rnd() * 30, e.y, Math.cos(a) * s, rnd() * r * 1.4, Math.sin(a) * s, 0.4 + rnd() * 0.4, k % 2 ? 0xff9a3c : 0xff5a1f); }
          for (let k = 0; k < 9; k++) { const a = rnd() * 6.28; this.smoke.add(e.x, 30, e.y, Math.cos(a) * 40, 50 + rnd() * 70, Math.sin(a) * 40, 1.6 + rnd(), 0x3c3c42); }
          for (let k = 0; k < 14; k++) this.sparks.add(e.x, 20, e.y, (rnd() - 0.5) * 500, rnd() * 420, (rnd() - 0.5) * 500, 0.8, 0xffd28a, 500);
          const bm = this.booms.find(q => q.life <= 0); if (bm) { bm.life = 0.32; bm.r = r; bm.m.position.set(e.x, 24, e.y); bm.m.visible = true; }
          this.light.position.set(e.x, 80, e.y); this.lightT = 0.25; this.ring(e.x, e.y, 10, r * 1.2, 0xffd28a, 0.35); this.ring(e.x, e.y, 6, r * 2.1, 0xfff0d0, 0.55);
          for (let k = 0; k < 8; k++) { const a = rnd() * 6.28, s = 30 + rnd() * r * 0.9; this.smoke.add(e.x + Math.cos(a) * s * 0.4, 14, e.y + Math.sin(a) * s * 0.4, Math.cos(a) * s, 18 + rnd() * 30, Math.sin(a) * s, 1.1 + rnd() * 0.8, 0x8a7c70); } }
        if (d < 1000) this.shake = Math.max(this.shake, (1 - d / 1000) * 9);
      } else if (e.t === 'cash' && near) this.floater(e.x, e.y, 60, `${(e.a ?? 0) >= 0 ? '+' : '-'}$${Math.abs(Math.round(e.a ?? 0))}`, (e.a ?? 0) >= 0 ? '#7dffb0' : '#ffd27a');
      else if (e.t === 'crystal' && d < 500) this.floater(e.x, e.y, 40, `+${e.a}`, '#8fe9ff');
      else if (e.t === 'pickup' && near) this.ring(e.x, e.y, 6, 40, 0xffffff, 0.3);
      else if ((e.t === 'spawn' || e.t === 'levelup' || e.t === 'capture' || e.t === 'built' || e.t === 'roar') && near) { this.ring(e.x, e.y, 8, e.t === 'roar' ? 260 : 70, fcol(e.f ?? 0)); if (e.t === 'levelup' && e.f === 0) this.floater(e.x, e.y, 70, 'LEVEL UP', '#ffe27a'); if (e.t === 'built' && e.f === 0) this.floater(e.x, e.y, 90, `${e.s} 완공`, '#b8ffd9'); if (e.t === 'capture') this.floater(e.x, e.y, 80, '인수 완료', FACTIONS[e.f ?? 0].color); }
      else if (e.t === 'order') this.ring(e.x, e.y, 70, 8, e.s === 'amove' ? 0xff6b6b : 0x7dffb0, 0.6);
      else if (e.t === 'dash' && near) for (let k = 0; k < 5; k++) this.smoke.add(e.x, 14, e.y, (rnd() - 0.5) * 50, 10, (rnd() - 0.5) * 50, 0.4, 0xdddddd);
      else if (e.t === 'crash' && near) { this.shake = Math.max(this.shake, 5); for (let k = 0; k < 7; k++) this.sparks.add(e.x, 16, e.y, (rnd() - 0.5) * 300, rnd() * 200, (rnd() - 0.5) * 300, 0.35, 0xffe9a8, 500); }
      else if (e.t === 'healbeam' && near) for (let k = 0; k < 2; k++) this.sparks.add((e.a ?? e.x) + (rnd() - 0.5) * 12, 10, (e.b ?? e.y) + (rnd() - 0.5) * 12, 0, 70, 0, 0.6, 0x7dffb0);
      else if (e.t === 'heal') for (let k = 0; k < 10; k++) this.sparks.add(e.x + (rnd() - 0.5) * 24, 8, e.y + (rnd() - 0.5) * 24, 0, 80, 0, 0.7, 0x7dffb0);
      else if (e.t === 'thud' && near) { this.ring(e.x, e.y, 10, 80, 0xffe27a, 0.4); this.shake = Math.max(this.shake, 3); }
      else if (e.t === 'playerdown') this.shake = 14;
      else if (e.t === 'recoil') { this.shake = Math.max(this.shake, 4); this.recoil = 1; }
      else if (e.t === 'skid' && rnd() < 0.3) this.smoke.add(e.x, 6, e.y, 0, 14, 0, 0.5, 0xcfcfcf);
      else if (e.t === 'kill' && near) this.floater(e.x, e.y, 56, `처치 · ${e.s}`, '#ffe27a');
      if (e.t === 'shot' && e.f === 0 && d < 60) { this.recoil = Math.min(1, this.recoil + 0.5); this.flashT = 0.05; }
    }
  }

  private syncStruct(s: Structure): void {
    let g = this.structs.get(s.id); const H = STRUCT_H[s.kind], f = FACTIONS[s.f];
    if (!g && this.ml) { const mg = this.ml.makeStruct(s); if (mg) { g = mg as THREE.Group; if (s.kind === 'hq') { const beam = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 900, 6), new THREE.MeshBasicMaterial({ color: fcol(s.f), transparent: true, opacity: 0.35, depthWrite: false, fog: false })); beam.scale.setScalar(0.1); beam.position.y = 60; g.add(beam); } this.scene.add(g); this.structs.set(s.id, g); } }
    if (!g) {
      g = new THREE.Group(); const body = new THREE.Mesh(this.box, this.mat(new THREE.Color(f.dark).lerp(new THREE.Color(0x8a8f96), 0.35).getHex())); body.scale.set(s.w, H, s.h); body.position.y = H / 2; body.castShadow = body.receiveShadow = true; g.add(body);
      const trim = new THREE.Mesh(this.box, this.mat(fcol(s.f))); trim.scale.set(s.w + 4, 8, s.h + 4); trim.position.y = H; g.add(trim);
      if (s.kind === 'turret') { const head = new THREE.Group(), dome = new THREE.Mesh(new THREE.SphereGeometry(13, 10, 8), this.mat(fcol(s.f))), bar = new THREE.Mesh(this.box, this.mat(0x1c1e22)); bar.scale.set(34, 5, 5); bar.position.x = 20; head.add(dome, bar); head.position.y = H + 10; head.name = 'head'; g.add(head); }
      if (s.kind === 'hq') { const beam = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 900, 6), new THREE.MeshBasicMaterial({ color: fcol(s.f), transparent: true, opacity: 0.35, depthWrite: false, fog: false })); beam.position.y = H + 450; const top = new THREE.Mesh(this.box, this.mat(fcol(s.f))); top.scale.set(50, 36, 50); top.position.y = H + 18; g.add(beam, top); }
      if (s.kind === 'factory') for (const dx of [-28, 28]) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 50, 8), this.mat(0x4a4d55)); ch.position.set(dx, H + 25, 0); g.add(ch); }
      if (s.kind === 'lab') { const d = new THREE.Mesh(new THREE.SphereGeometry(24, 12, 8, 0, 6.29, 0, 1.57), new THREE.MeshLambertMaterial({ color: 0x9fe8ff, emissive: 0x2a6a80 })); d.position.y = H; g.add(d); }
      g.position.set(s.x + s.w / 2, 0, s.y + s.h / 2); this.scene.add(g); this.structs.set(s.id, g);
    }
    if (this.ml) { g.scale.set(10, 10 * (0.15 + 0.85 * s.built), 10); const th = g.getObjectByName('turret_Head'); if (th) th.rotation.y = -s.ang; } else { g.scale.y = 0.15 + 0.85 * s.built; const head = g.getObjectByName('head'); if (head) head.rotation.y = -s.ang; }
  }
  private syncVehicle(v: Vehicle): void {
    let g = this.vehs.get(v.id);
    if (!g && this.ml) { const mg = this.ml.makeVehicle(v); if (mg) { g = mg as THREE.Group; this.scene.add(g); this.vehs.set(v.id, g); } }
    if (!g) {
      g = new THREE.Group(); const col = new THREE.Color(v.color).getHex(), m = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c: number): THREE.Mesh => { const o = new THREE.Mesh(this.box, this.mat(c)); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; g!.add(o); return o; };
      if (v.kind === 'tank') { m(v.len, 16, v.wid, 0, 13, 0, col); m(v.len + 4, 12, 8, 0, 7, -v.wid / 2, 0x23261f); m(v.len + 4, 12, 8, 0, 7, v.wid / 2, 0x23261f); const t = new THREE.Group(); t.name = 'turret'; const dome = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 12, 10), this.mat(0x4a5733)), bar = new THREE.Mesh(this.box, this.mat(0x1e2218)); bar.scale.set(44, 5, 5); bar.position.set(28, 2, 0); t.add(dome, bar); t.position.y = 27; g.add(t); }
      else {
        const truck = v.kind === 'truck'; m(v.len, truck ? 13 : 10, v.wid, 0, 10, 0, col); m(v.len * (truck ? 0.3 : 0.48), truck ? 13 : 9, v.wid * 0.88, truck ? v.len * 0.3 : -v.len * 0.04, truck ? 22 : 19, 0, 0x1d2733); if (truck) m(v.len * 0.6, 20, v.wid, -v.len * 0.18, 25, 0, new THREE.Color(col).multiplyScalar(0.8).getHex());
        for (const [dx, dz] of [[-0.32, -0.5], [0.32, -0.5], [-0.32, 0.5], [0.32, 0.5]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 4, 10), this.mat(0x15161a)); wh.rotation.x = Math.PI / 2; wh.position.set(v.len * dx, 5.5, v.wid * dz); g.add(wh); }
        m(1.5, 3, v.wid * 0.8, v.len / 2, 11, 0, 0xfff3bd); m(1.5, 3, v.wid * 0.8, -v.len / 2, 11, 0, 0xe02d2d);
        if (v.kind === 'police') { m(v.len * 0.3, 10.4, v.wid + 0.6, 0, 10, 0, 0x16233f); const a = new THREE.Mesh(this.box, new THREE.MeshBasicMaterial({ color: 0xff2d2d })), b = new THREE.Mesh(this.box, new THREE.MeshBasicMaterial({ color: 0x2d5bff })); a.scale.set(4, 3, 8); b.scale.set(4, 3, 8); a.position.set(0, 25, -5); b.position.set(0, 25, 5); a.name = 'la'; b.name = 'lb'; g.add(a, b); }
      }
      this.scene.add(g); this.vehs.set(v.id, g);
    }
    g.position.set(v.x, 0, v.y); g.rotation.y = -v.ang;
    const t = g.getObjectByName('turret') ?? g.getObjectByName('tank_Turret'); if (t) { const d = this.world.byId.get(v.driver); t.rotation.y = -((d ? d.ang : v.ang) - v.ang); }
    const la = g.getObjectByName('la') ?? g.getObjectByName('police_LightA'), lb = g.getObjectByName('lb') ?? g.getObjectByName('police_LightB'); if (la && lb) { const on = v.ai === 'chase' && Math.floor(this.t * 6) % 2 === 0; la.visible = v.ai !== 'chase' || on; lb.visible = v.ai !== 'chase' || !on; }
    if (v.hp < v.maxHp * 0.5 && Math.random() < 0.25) { if (v.burn > 0) this.fire.add(v.x, 24, v.y, (Math.random() - 0.5) * 30, 60, (Math.random() - 0.5) * 30, 0.6, 0xff7a2a); else this.smoke.add(v.x, 24, v.y, (Math.random() - 0.5) * 16, 50, (Math.random() - 0.5) * 16, 1.2, 0x333338); }
  }
  private syncLoot(l: Loot): void {
    let g = this.loots.get(l.id);
    if (!g) {
      g = new THREE.Group(); const tier = l.type === 'weapon' ? WEAPONS[l.weapon!].tier : 0, c = l.type === 'cash' ? 0x4dff9a : l.type === 'armor' ? 0x5aa8ff : l.type === 'medkit' ? 0xff6b6b : l.type === 'crate' ? 0xffd24a : tier >= 3 ? 0xffa53a : tier === 2 ? 0xc59bff : 0xf2f2f2;
      const item = new THREE.Mesh(this.box, l.type === 'crate' ? this.mat(0xc9a227) : new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 })); item.name = 'item';
      if (l.type === 'crate') { item.scale.set(32, 26, 32); const ch = new THREE.Mesh(new THREE.SphereGeometry(34, 12, 8, 0, 6.29, 0, 1.57), new THREE.MeshLambertMaterial({ color: 0xff5d5d, side: THREE.DoubleSide })); ch.position.y = 50; ch.name = 'chute'; g.add(ch); }
      else if (l.type === 'weapon') item.scale.set(22, 5, 4); else if (l.type === 'cash') item.scale.set(14, 4, 9); else item.scale.set(11, 11, 11);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(l.type === 'crate' ? 6 : 2, l.type === 'crate' ? 6 : 2, l.type === 'crate' ? 1400 : 130, 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: l.type === 'crate' ? 0.5 : 0.35, depthWrite: false, fog: false })); beam.position.y = l.type === 'crate' ? 700 : 65; beam.name = 'beam';
      if (this.ml && l.type === 'weapon') { const gm = this.ml.makeLootGun(l.weapon!); if (gm) { gm.name = 'item'; gm.scale.setScalar(22); item.visible = false; item.name = 'item_old'; g.add(gm); } }
      else if (this.ml && l.type === 'crate') { const cm = this.ml.makeCrate(); if (cm) { const chute = cm.getObjectByName('crate_Chute'); if (chute) { cm.remove(chute); chute.name = 'chute'; chute.scale.setScalar(10); chute.position.set(0, 30, 0); g.add(chute); const old = g.getObjectByName('chute'); if (old && old !== chute) old.visible = false; } cm.name = 'item'; cm.scale.setScalar(10); item.visible = false; item.name = 'item_old'; g.add(cm); } }
      g.add(item, beam); g.position.set(l.x, 0, l.y); this.scene.add(g); this.loots.set(l.id, g);
    }
    const item = g.getObjectByName('item')!, fall = Math.max(0, l.fall) * 150; item.position.y = (l.type === 'crate' ? (this.ml ? 0 : 13) : 16 + Math.sin(this.t * 3 + l.id) * 3) + fall; if (l.type !== 'crate') item.rotation.y = this.t * 1.5 + l.id;
    const ch = g.getObjectByName('chute'); if (ch) { ch.visible = l.fall > 0; ch.position.y = (this.ml ? 30 : 50) + fall; }
  }
  private syncBiz(z: Business): void {
    let o = this.biz.get(z.id); const w = this.world, d = BIZ[z.kind], col = z.kind === 'gunshop' ? 0xff5d5d : z.owner >= 0 ? fcol(z.owner) : 0xf2f2f2;
    if (!o) {
      const g = new THREE.Group(), ring = new THREE.Mesh(new THREE.RingGeometry(24, 31, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); ring.position.y = 1.2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 110, 20, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 55;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); label.scale.set(100, 37.5, 1);
      // 표식과 이름표가 건물 벽에 파묻히지 않도록 건물 바깥쪽(차도 쪽)으로 밀어 둡니다.
      const so = w.map.solids[z.solid]; let nx = 0, nz = 0;
      if (so) { nx = z.x - Math.max(so.x, Math.min(so.x + so.w, z.x)); nz = z.y - Math.max(so.y, Math.min(so.y + so.h, z.y)); const l = Math.hypot(nx, nz); if (l > 0.01) { nx /= l; nz /= l; } else { nx = 0; nz = 0; } }
      g.userData.out = [nx, nz]; label.position.set(nx * 34, 112, nz * 34);
      g.add(ring, beam, label); g.position.set(z.x, 0, z.y); this.scene.add(g); o = { g, sig: '', label, ring, beam, icon: null }; this.biz.set(z.id, o);
    }
    const sig = `${z.owner}:${z.level}`;
    if (sig !== o.sig) {
      o.sig = sig; (o.ring.material as THREE.MeshBasicMaterial).color.setHex(col);
      if (this.ml) { if (o.icon) o.g.remove(o.icon); o.icon = this.ml.makeBiz(z.kind, col); if (o.icon) { const out = o.g.userData.out as [number, number]; o.icon.position.set(out[0] * 8, 50, out[1] * 8); o.g.add(o.icon); } } (o.beam.material as THREE.MeshBasicMaterial).color.setHex(col);
      const css = z.kind === 'gunshop' ? '#ff5d5d' : z.owner >= 0 ? FACTIONS[z.owner].color : '#ffffff', line2 = z.kind === 'gunshop' ? 'E 구매' : z.owner < 0 ? `$${d.price} · +$${d.income}/s` : `${FACTIONS[z.owner].name} ${'★'.repeat(z.level)}`;
      o.label.material.map?.dispose(); o.label.material.map = canvasTex(320, 120, g => { g.fillStyle = 'rgba(10,16,16,0.82)'; g.beginPath(); g.roundRect(4, 4, 312, 112, 18); g.fill(); g.strokeStyle = css; g.lineWidth = 5; g.stroke(); g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = "900 44px 'Noto Sans KR',sans-serif"; g.fillText(d.name, 160, 54); g.fillStyle = css; g.font = "700 28px 'Noto Sans KR',sans-serif"; g.fillText(line2, 160, 96); }); o.label.material.needsUpdate = true;
    }
    if (o.icon) { o.icon.position.y = 50 + Math.sin(this.t * 1.6 + z.id) * 2.5; o.icon.rotation.y = this.t * 0.7 + z.id; }
    (o.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + z.pulse * 0.4 + (z.cap > 0 ? 0.2 + Math.sin(this.t * 10) * 0.1 : 0); o.g.visible = Math.hypot(z.x - this.camPos.x, z.y - this.camPos.z) < 2600; void w;
  }

  /** 보스가 사업체 안에 있을 때: 도시 대신 내부 장면만 그립니다. */
  private drawInside(dt: number, kind: string, lay: NonNullable<ReturnType<World['insideLayout']>>, s: NonNullable<World['inside']>): void {
    if (!this.ins || this.insKind !== kind) { this.ins?.dispose(); this.ins = new Interior3D(lay, this.quality); this.insKind = kind; }
    this.t += dt; this.ins.update(this.t, s.x, s.y, this.yaw, this.pitch, Math.sin(s.walk * 0.09) * 1.4, this.w / Math.max(1, this.h));
    this.renderer.render(this.ins.scene, this.ins.camera);
    for (const f of this.floaters) f.el.remove(); this.floaters = [];
  }
  draw(dt: number, ghost: Ghost | null): void {
    const inside = this.world.inside, ib = inside ? this.world.insideBiz() : null;
    if (inside && ib) { this.drawInside(dt, ib.kind, this.world.insideLayout()!, inside); return; }
    if (this.ins) { this.ins.dispose(); this.ins = null; this.insKind = ''; this.camera.aspect = this.w / Math.max(1, this.h); this.camera.updateProjectionMatrix(); }
    const w = this.world, d = this.dummy, col = this.color, pb = w.boss(0), f0 = w.factions[0]; this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30); this.recoil = Math.max(0, this.recoil - dt * 7); this.flashT -= dt;
    // 카메라
    const veh = pb && pb.inVeh ? w.vehicles.find(v => v.id === pb.inVeh) : undefined, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), spt = Math.sin(this.pitch);
    if (pb) { this.focus.set(pb.x, pb.y); this.deadT = 0; } else { this.deadT += dt; this.yaw += dt * 0.25; }
    const fx = this.focus.x, fz = this.focus.y, third = this.mode === 'tp' || !!veh || !pb;
    if (!third) { const bob = pb ? Math.sin(pb.walk * 0.09) * Math.min(1.6, Math.hypot(pb.vx, pb.vy) / 120) : 0; this.camPos.set(fx, EYE + bob, fz); this.camera.position.copy(this.camPos); this.camera.lookAt(fx + cy * cp * 100, EYE + bob + spt * 100, fz + sy * cp * 100); }
    else {
      const dist = veh ? (veh.kind === 'tank' ? 250 : 200) : 135, hgt = veh ? 95 : 78, pivotY = veh ? 30 : 50; let k = 1;
      for (let s = 0.15; s <= 1; s += 0.085) { if (solidAt(w.map, fx - cy * dist * s, fz - sy * dist * s)) { k = Math.max(0.3, s - 0.12); break; } }
      const tx = fx - cy * dist * k * cp, ty = pivotY + hgt * k + (1 - k) * 130 - spt * dist * k * 0.9, tz = fz - sy * dist * k * cp;
      this.camPos.lerp(new THREE.Vector3(tx, Math.max(12, ty), tz), Math.min(1, dt * 14)); this.camera.position.copy(this.camPos); this.camera.lookAt(fx + cy * 140, pivotY + 12 + spt * 140, fz + sy * 140);
    }
    { const m = 14, cp2 = this.camera.position; cp2.x = Math.max(m, Math.min(SIZE - m, cp2.x)); cp2.z = Math.max(m, Math.min(SIZE - m, cp2.z)); this.camPos.x = cp2.x; this.camPos.z = cp2.z; }
    if (this.shake > 0 && !this.reduced) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake; }
    const spd = veh ? Math.hypot(veh.vx, veh.vy) : 0, fov = 74 + Math.min(14, spd / 45); if (Math.abs(fov - this.camera.fov) > 0.2) { this.camera.fov += (fov - this.camera.fov) * 0.1; this.camera.updateProjectionMatrix(); }
    const sky = this.scene.getObjectByName('sky'); if (sky) sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sun.position.set(fx - 700, 800, fz - 450); this.sun.target.position.set(fx, 0, fz);
    if (this.ml) { this.gun.visible = false; this.ml.viewmodel(!third && !!pb, f0.slots[f0.cur]?.id ?? 'pistol', dt, this.recoil, f0.reloadT > 0, pb ? Math.min(1, Math.hypot(pb.vx, pb.vy) / 160) : 0, this.t, this.flashT > 0); } else { this.gun.visible = !third && !!pb; } if (!this.ml && this.gun.visible) { const tier = WEAPONS[f0.slots[f0.cur]?.id ?? 'pistol'].tier, rl = f0.reloadT > 0 ? 1 : 0; this.gun.scale.setScalar(0.62 + tier * 0.13); this.gun.position.set(5.6, -5.2 - rl * 4, -14 + this.recoil * 2.2); this.gun.rotation.x = this.recoil * 0.12 - rl * 0.7; this.muzzle.visible = this.flashT > 0; this.muzzle.rotation.z = this.t * 40; }
    // 캐릭터
    let nb = 0, nh = 0, ng = 0, nm = 0;
    for (const m of this.bossRings) m.visible = false;
    for (const a of w.actors) {
      if (!a.alive || a.inVeh) continue; const dx = a.x - this.camPos.x, dz = a.y - this.camPos.z; if (dx * dx + dz * dz > 2600 * 2600) continue;
      const def = ACTORS[a.kind], c = a.flash > 0 ? 0xffffff : a.f === CIV ? CLOTH[a.slot % CLOTH.length] : fcol(a.f);
      if (a.kind === 'boss') { const r = this.bossRings[a.f]; r.visible = true; r.position.set(a.x, 1.5, a.y); r.scale.setScalar(a.r + 9); }
      if (a === pb && !third) continue; if (this.ml) continue;
      if (def.mech) {
        if (nm >= 90) continue; const tank = a.kind === 'tank', L = a.r * 2.4, W = a.r * 1.7, H = tank ? 22 : 17;
        d.rotation.set(0, -a.ang, 0); d.position.set(a.x, H / 2 + 4, a.y); d.scale.set(L, H, W); d.updateMatrix(); this.hulls.setMatrixAt(nm, d.matrix); this.hulls.setColorAt(nm, col.set(a.flash > 0 ? 0xffffff : FACTIONS[a.f].dark));
        d.position.y = H + 9; d.scale.set(a.r * 0.6, 10, a.r * 0.6); d.updateMatrix(); this.turrets.setMatrixAt(nm, d.matrix); this.turrets.setColorAt(nm, col.set(c));
        const bl = tank ? a.r * 1.8 : a.r * 1.2; d.position.set(a.x + Math.cos(a.ang) * bl / 2, H + 10, a.y + Math.sin(a.ang) * bl / 2); d.scale.set(bl, 4, 4); d.updateMatrix(); this.barrels.setMatrixAt(nm, d.matrix); nm++; continue;
      }
      if (nb >= 520) continue; const big = a.kind === 'boss' ? 1.18 : 1, bob = Math.abs(Math.sin(a.walk * 0.09)) * Math.min(2.2, Math.hypot(a.vx, a.vy) / 70), bh = 27 * big;
      d.rotation.set(0, -a.ang, 0); d.position.set(a.x, bob, a.y); d.scale.set(a.r * 0.62, bh, a.r * 0.9); d.updateMatrix(); this.bodies.setMatrixAt(nb, d.matrix); this.bodies.setColorAt(nb, col.set(c)); nb++;
      d.position.y = bh + 5.2 * big + bob; d.scale.setScalar(5.6 * big); d.updateMatrix(); this.heads.setMatrixAt(nh, d.matrix); this.heads.setColorAt(nh, col.set(a.kind === 'cop' || a.kind === 'swat' ? 0x1c2a55 : a.kind === 'medic' ? 0xffffff : SKIN[a.id % SKIN.length])); nh++;
      if (a.f !== CIV && a.kind !== 'worker') { const gl = a.kind === 'sniper' || a.kind === 'heavy' ? 22 : 15; d.position.set(a.x + Math.cos(a.ang) * (gl / 2 + 2) - Math.sin(a.ang) * 5, bh * 0.72 + bob, a.y + Math.sin(a.ang) * (gl / 2 + 2) + Math.cos(a.ang) * 5); d.scale.set(gl, a.kind === 'heavy' ? 5 : 2.6, a.kind === 'heavy' ? 5 : 2.6); d.updateMatrix(); this.guns.setMatrixAt(ng++, d.matrix); }
    }
    const upd = (m: THREE.InstancedMesh, n: number): void => { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
    upd(this.bodies, nb); upd(this.heads, nh); upd(this.guns, ng); upd(this.hulls, nm); upd(this.turrets, nm); upd(this.barrels, nm); if (this.ml) this.ml.update(pb, third, this.camPos);
    // 크리스탈
    let nc = 0; for (const c of w.crystals) { if (c.amount <= 0) continue; const s = 9 + 9 * c.amount / c.max; d.rotation.set(0, c.id, 0); d.position.set(c.x, s * 1.1, c.y); d.scale.set(s * 0.75, s * 1.5, s * 0.75); d.updateMatrix(); this.crystals.setMatrixAt(nc++, d.matrix); } upd(this.crystals, 0); void nc;
    // 탄환
    let nt = 0; for (const b of w.bullets) { if (nt >= 500) break; const wd = WEAPONS[b.w], a = Math.atan2(b.vy, b.vx), len = wd.splash ? 12 : wd.pierce ? 150 : 46, th = wd.splash ? 5 : wd.pierce ? 3 : b.boss ? 1.5 : 1.1; d.rotation.set(0, -a, 0); d.position.set(b.x - Math.cos(a) * len / 2, 30, b.y - Math.sin(a) * len / 2); d.scale.set(len, th, th); d.updateMatrix(); this.tracers.setMatrixAt(nt, d.matrix); this.tracers.setColorAt(nt, col.set(wd.color)); nt++; if (wd.splash && Math.random() < 0.6) this.smoke.add(b.x, 30, b.y, 0, 8, 0, 0.5, 0xcfcfcf); } upd(this.tracers, nt);
    // 동적 오브젝트 동기화
    const seenS = new Set<number>(); for (const s of w.structures) if (s.alive) { seenS.add(s.id); this.syncStruct(s); } for (const [id, g] of this.structs) if (!seenS.has(id)) { this.scene.remove(g); this.structs.delete(id); }
    const seenV = new Set<number>(); for (const v of w.vehicles) if (v.alive) { seenV.add(v.id); this.syncVehicle(v); } for (const [id, g] of this.vehs) if (!seenV.has(id)) { this.scene.remove(g); this.vehs.delete(id); }
    const seenL = new Set<number>(); for (const l of w.loot) if (l.alive) { seenL.add(l.id); this.syncLoot(l); } for (const [id, g] of this.loots) if (!seenL.has(id)) { this.scene.remove(g); this.loots.delete(id); }
    for (const z of w.businesses) this.syncBiz(z);
    // 수송기
    while (this.planes.length < w.planes.length) { const pm = this.ml?.makePlane(); if (pm) { const pg = new THREE.Group(); pg.add(pm); this.scene.add(pg); this.planes.push(pg); continue; } const g = new THREE.Group(), m = this.mat(0xcfd6e0), a = new THREE.Mesh(this.box, m), b = new THREE.Mesh(this.box, m), c = new THREE.Mesh(this.box, m); a.scale.set(150, 22, 24); b.scale.set(34, 5, 190); c.scale.set(18, 30, 5); c.position.set(-64, 22, 0); g.add(a, b, c); this.scene.add(g); this.planes.push(g); }
    this.planes.forEach((g, i) => { const p = w.planes[i]; g.visible = !!p; if (p) { g.position.set(p.x, 620, p.y); g.rotation.y = -Math.atan2(p.vy, p.vx); } });
    // 링·폭발·파티클
    let nr = 0; for (const r of this.ringList) { r.life -= dt; const k = 1 - Math.max(0, r.life) / r.max, rad = r.r0 + (r.r1 - r.r0) * k; d.rotation.set(0, 0, 0); d.position.set(r.x, 2, r.y); d.scale.set(rad, 1, rad); d.updateMatrix(); this.rings.setMatrixAt(nr, d.matrix); this.rings.setColorAt(nr, col.set(r.color)); nr++; } this.ringList = this.ringList.filter(r => r.life > 0); upd(this.rings, nr);
    for (const b of this.booms) { if (b.life <= 0) { b.m.visible = false; continue; } b.life -= dt; const k = 1 - b.life / 0.32; b.m.scale.setScalar(b.r * (0.3 + k * 0.8)); (b.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.85; }
    this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT * 22);
    this.sparks.update(dt); this.fire.update(dt); this.smoke.update(dt);
    // 자기장
    const z = w.zone; this.zoneWall.visible = false; this.nextRing.visible = false; this.zoneWall.position.set(z.x, 450, z.y); this.zoneWall.scale.set(Math.max(1, z.r), 900, Math.max(1, z.r)); this.zoneTex.repeat.set(Math.max(8, z.r / 30), 14); this.zoneTex.offset.y = -this.t * 0.25;
    this.nextRing.position.set(z.nx, 3, z.ny); this.nextRing.scale.set(Math.max(2, z.nr), 1, Math.max(2, z.nr));
    // 건설 고스트
    this.ghost.visible = !!ghost; if (ghost) { const sd = STRUCTS[ghost.kind], H = STRUCT_H[ghost.kind]; this.ghost.position.set(ghost.x, H / 2, ghost.y); this.ghost.scale.set(sd.w, H, sd.h); (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(ghost.ok ? 0x66ff9c : 0xff5a5a); }
    this.renderer.render(this.scene, this.camera);
    if (this.ml && !third && pb) { this.ml.syncViewCam(this.camera); this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.ml.vmScene, this.ml.vmCam); this.renderer.autoClear = true; }
    // 떠오르는 글자
    for (const f of this.floaters) { f.life -= dt; f.h += dt * 26; const p = this.project(f.x, f.y, f.h); f.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; f.el.style.opacity = p.behind ? '0' : String(Math.min(1, f.life * 2)); if (f.life <= 0) f.el.remove(); }
    this.floaters = this.floaters.filter(f => f.life > 0);
  }
}
