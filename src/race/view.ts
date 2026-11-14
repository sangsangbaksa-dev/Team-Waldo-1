// SPEED RUSH — Three.js 장면: 석양 사이버 서킷, 스포츠카(Last City 의 vehicles.glb), 속도감 연출(FOV·카메라 흔들림·스트릭·불꽃·연기).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { instantiate } from '../city/models';
import { wrapAngle, boosting, kmh } from './physics';
import { type RaceState, type Racer } from './race';
import { type Track } from './track';

const HORIZON = 0xd8508f;
const CAR_LEN = 4.7;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (g) draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

/** 중심선 기준 [latA..latB] 구간의 띠 지오메트리. y 는 도로 높이에 더하는 오프셋. */
function ribbon(t: Track, latA: number, latB: number, yA: number, yB: number, color?: (i: number, side: 0 | 1) => [number, number, number], vScale = 1 / 24): THREE.BufferGeometry {
  const n = t.n, pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), col = color ? new Float32Array((n + 1) * 6) : null, idx: number[] = [];
  for (let k = 0; k <= n; k++) {
    const i = k % n, rx = -t.tz[i], rz = t.tx[i];
    pos.set([t.x[i] + rx * latA, t.y[i] + yA, t.z[i] + rz * latA, t.x[i] + rx * latB, t.y[i] + yB, t.z[i] + rz * latB], k * 6);
    uv.set([0, k * t.ds * vScale, 1, k * t.ds * vScale], k * 4);
    if (col && color) { const a = color(i, 0), b = color(i, 1); col.set([...a, ...b], k * 6); }
    if (k < n) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); return g;
}

function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number, rotY: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rotY); g.translate(x, y, z);
  const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) c.set([color.r, color.g, color.b], i); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}

let dot: THREE.CanvasTexture | null = null;
/** 부드러운 원형 스프라이트(점이 네모로 보이지 않게). */
function dotTex(): THREE.CanvasTexture { dot ??= canvasTex(32, 32, g => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }, false); return dot; }

class Particles {
  readonly points: THREE.Points; private pos: Float32Array; private col: Float32Array; private vel: Float32Array; private life: Float32Array; private max: Float32Array; private rgb: Float32Array; private head = 0;
  constructor(private cap: number, size: number, blending: THREE.Blending, opacity = 1) {
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.rgb = new Float32Array(cap * 3);
    this.pos.fill(0, 0); for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -999;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map: dotTex(), vertexColors: true, transparent: true, opacity, blending, depthWrite: false, sizeAttenuation: true })); this.points.frustumCulled = false;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number): void {
    const i = this.head; this.head = (this.head + 1) % this.cap; this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = life; this.max[i] = life; this.rgb.set([r, g, b], i * 3);
  }
  update(dt: number, gravity: number): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      this.life[i] -= dt; const f = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= gravity * dt; this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 3] = this.rgb[i * 3] * f; this.col[i * 3 + 1] = this.rgb[i * 3 + 1] * f; this.col[i * 3 + 2] = this.rgb[i * 3 + 2] * f;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

interface CarVis { racer: Racer; group: THREE.Group; flames: THREE.Mesh[]; shadow: THREE.Mesh; lastV: number }

export class RaceView {
  readonly renderer: THREE.WebGLRenderer; readonly scene = new THREE.Scene(); readonly camera = new THREE.PerspectiveCamera(64, 1, 0.4, 3200);
  private cars: CarVis[] = []; private ground!: THREE.Mesh; private pads: Array<{ tex: THREE.CanvasTexture }> = [];
  private sparks = new Particles(260, 0.9, THREE.AdditiveBlending); private smoke = new Particles(220, 2.0, THREE.NormalBlending, 0.4); private streak: THREE.LineSegments; private streakPos: Float32Array; private streakSeed: Float32Array;
  private camH = 0; private camInit = false; private fov = 64; private shake = 0; private punch = 0; private time = 0; private sun = new THREE.DirectionalLight(0xffb27a, 1.5);
  private disposables: Array<{ dispose(): void }> = [];

  constructor(canvas: HTMLCanvasElement, private track: Track, carTemplate: THREE.Object3D | null, quality: 'high' | 'standard' | 'low') {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'standard' ? 1.5 : 1));
    this.scene.fog = new THREE.Fog(HORIZON, 140, 1500);
    this.buildSky(); this.buildGround(); this.buildRoad(); this.buildProps(quality);
    this.scene.add(new THREE.HemisphereLight(0xffd2e8, 0x2a1b52, 1.15)); this.sun.position.set(-40, 60, 90); this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.sparks.points, this.smoke.points);
    const n = 130; this.streakPos = new Float32Array(n * 6); this.streakSeed = new Float32Array(n * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    this.streak = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); this.streak.frustumCulled = false; this.scene.add(this.streak);
    this.carTemplate = carTemplate;
  }
  private carTemplate: THREE.Object3D | null;

  setRacers(racers: Racer[]): void {
    const flameGeo = new THREE.ConeGeometry(0.26, 1, 10, 1, true); flameGeo.rotateZ(Math.PI / 2); flameGeo.translate(-0.5, 0, 0);
    const shGeo = new THREE.PlaneGeometry(CAR_LEN * 1.25, 2.9); shGeo.rotateX(-Math.PI / 2);
    const shTex = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, false);
    const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, fog: false });
    for (const r of racers) {
      const group = new THREE.Group(); group.rotation.order = 'YXZ';
      let body: THREE.Object3D;
      if (this.carTemplate) { body = instantiate(this.carTemplate, { paint: new THREE.Color(r.color).getHex(), team: new THREE.Color(r.color).getHex() }); }
      else { const m = new THREE.Mesh(new THREE.BoxGeometry(CAR_LEN, 1.1, 2), new THREE.MeshLambertMaterial({ color: r.color })); m.position.y = 0.6; body = m; }
      group.add(body);
      const flames: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const f = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0x66b8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        f.position.set(-CAR_LEN / 2 + 0.1, 0.5, s * 0.5); f.scale.set(0.001, 1, 1); group.add(f); flames.push(f);
      }
      const shadow = new THREE.Mesh(shGeo, shMat); this.scene.add(group, shadow); this.cars.push({ racer: r, group, flames, shadow, lastV: 0 });
    }
    this.disposables.push(flameGeo, shGeo, shTex, shMat);
  }

  private buildSky(): void {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: new THREE.Vector3(0.25, 0.1, -1).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 sunDir;
        void main(){ float h = clamp(vD.y, -0.2, 1.0);
          vec3 top = vec3(0.07,0.04,0.25), mid = vec3(0.65,0.14,0.52), low = vec3(1.0,0.55,0.32), hor = vec3(0.85,0.31,0.56);
          vec3 c = mix(hor, low, smoothstep(-0.05, 0.05, h)); c = mix(c, mid, smoothstep(0.02, 0.25, h)); c = mix(c, top, smoothstep(0.2, 0.75, h));
          float s = dot(normalize(vD), sunDir); c += vec3(1.0,0.82,0.5) * smoothstep(0.9965, 0.9985, s) * 1.4 + vec3(1.0,0.5,0.3) * pow(max(s,0.0), 28.0) * 0.55;
          vec2 q = floor(vD.xz / max(vD.y, 0.05) * 18.0); float st = step(0.9965, fract(sin(dot(q, vec2(12.9898,78.233))) * 43758.5453)); c += vec3(st) * smoothstep(0.35, 0.8, h) * 0.9;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), mat); sky.name = 'sky'; this.scene.add(sky); this.disposables.push(sky.geometry, mat);
  }

  private buildGround(): void {
    const tex = canvasTex(128, 128, g => { g.fillStyle = '#1a0c36'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#ff4fd8'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeStyle = 'rgba(80,220,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke(); });
    tex.repeat.set(110, 110);
    const mat = new THREE.MeshBasicMaterial({ map: tex }); this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6600, 6600).rotateX(-Math.PI / 2), mat); this.ground.position.y = -0.4; this.scene.add(this.ground); this.disposables.push(this.ground.geometry, mat, tex);
  }

  private buildRoad(): void {
    const t = this.track, hw = t.halfWidth;
    const asphalt = canvasTex(256, 512, g => {
      g.fillStyle = '#2b2d3d'; g.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 2600; i++) { const v = 36 + Math.random() * 28; g.fillStyle = `rgb(${v},${v + 2},${v + 14})`; g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2); }
      g.fillStyle = '#f2f2ff'; g.fillRect(8, 0, 6, 512); g.fillRect(242, 0, 6, 512);
      g.fillStyle = '#ff5fd2'; for (let y = 0; y < 512; y += 128) g.fillRect(125, y, 6, 64);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(60, 0, 3, 512); g.fillRect(193, 0, 3, 512);
    });
    const road = new THREE.Mesh(ribbon(t, -hw, hw, 0, 0), new THREE.MeshBasicMaterial({ map: asphalt })); road.renderOrder = 0; this.scene.add(road);
    // 연석(빨강/흰색), 방호벽(네온), 도로 아래 스커트
    const curbCol = (i: number): [number, number, number] => (Math.floor(i / 3) % 2 ? [0.95, 0.95, 1] : [0.95, 0.12, 0.2]);
    const curbL = new THREE.Mesh(ribbon(t, -hw - 1.5, -hw, 0.06, 0.06, i => curbCol(i)), new THREE.MeshBasicMaterial({ vertexColors: true })), curbR = new THREE.Mesh(ribbon(t, hw, hw + 1.5, 0.06, 0.06, i => curbCol(i)), new THREE.MeshBasicMaterial({ vertexColors: true }));
    const wallCol = (i: number, side: 0 | 1): [number, number, number] => { const neon = Math.floor(i / 20) % 2; return side === 0 ? [0.12, 0.1, 0.22] : neon ? [0.2, 0.95, 1] : [1, 0.25, 0.8]; };
    const wallMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const wallL = new THREE.Mesh(ribbon(t, -hw - 1.5, -hw - 1.5, 0, 1.15, wallCol), wallMat), wallR = new THREE.Mesh(ribbon(t, hw + 1.5, hw + 1.5, 0, 1.15, wallCol), wallMat);
    const skirtMat = new THREE.MeshBasicMaterial({ color: 0x120a28, side: THREE.DoubleSide });
    const skirt = (a: number, b: number): THREE.Mesh => { const g = ribbon(t, a, b, 0, 0); const p = g.attributes.position as THREE.BufferAttribute; for (let k = 1; k < p.count; k += 2) p.setY(k, -0.4); return new THREE.Mesh(g, skirtMat); };
    this.scene.add(curbL, curbR, wallL, wallR, skirt(-hw - 1.5, -hw - 1.5), skirt(hw + 1.5, hw + 1.5));
    this.disposables.push(road.geometry, asphalt, curbL.geometry, curbR.geometry, wallL.geometry, wallR.geometry, wallMat, skirtMat);
    // 부스트 패드
    const padTexBase = (): THREE.CanvasTexture => canvasTex(256, 128, g => {
      g.fillStyle = 'rgba(20,10,40,.55)'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#7dffe6'; g.lineWidth = 14; g.lineJoin = 'round';
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(30 + k * 78, 14); g.lineTo(78 + k * 78, 64); g.lineTo(30 + k * 78, 114); g.stroke(); }
    });
    for (const i of t.pads) {
      const tex = padTexBase(), m = new THREE.Mesh(new THREE.PlaneGeometry(16, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.order = 'YXZ'; m.rotation.y = -Math.atan2(t.tz[i], t.tx[i]); m.rotation.z = t.pitch[i]; m.position.set(t.x[i], t.y[i] + 0.1, t.z[i]); this.scene.add(m); this.pads.push({ tex }); this.disposables.push(m.geometry, tex);
    }
    // 출발선
    const i0 = 0, check = canvasTex(256, 32, g => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
    check.repeat.set(1, 1); const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, hw * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: check, polygonOffset: true, polygonOffsetFactor: -3 }));
    line.rotation.order = 'YXZ'; line.rotation.y = -Math.atan2(t.tz[i0], t.tx[i0]); line.rotation.z = t.pitch[i0]; line.rotation.y += 0; line.position.set(t.x[i0], t.y[i0] + 0.08, t.z[i0]); line.rotateY(Math.PI / 2); this.scene.add(line); this.disposables.push(line.geometry, check);
  }

  private buildProps(quality: 'high' | 'standard' | 'low'): void {
    const t = this.track, hw = t.halfWidth, parts: THREE.BufferGeometry[] = [];
    // 네온 아치(출발선 + 구간마다)
    const archAt = (i: number, big: boolean): void => {
      const col = new THREE.Color(big ? 0xffffff : (i / 50) % 2 < 1 ? 0x33f0ff : 0xff4fd8), rot = -Math.atan2(t.tz[i], t.tx[i]) + Math.PI / 2, rx = -t.tz[i], rz = t.tx[i], h = big ? 15 : 11, post = hw + 2.6;
      for (const s of [-1, 1]) parts.push(boxGeo(0.9, h, 0.9, t.x[i] + rx * post * s, t.y[i] + h / 2, t.z[i] + rz * post * s, rot, col));
      parts.push(boxGeo(post * 2 + 1.8, big ? 2.4 : 0.8, 0.9, t.x[i], t.y[i] + h, t.z[i], rot, col));
    };
    archAt(0, true); const arches = quality === 'low' ? 7 : 14; for (let k = 1; k < arches; k++) { const i = Math.round((k / arches) * t.n) % t.n; if (!t.pads.some(p => Math.abs(p - i) < 6) && Math.min(i, t.n - i) > 12) archAt(i, false); }
    const archMat = new THREE.MeshBasicMaterial({ vertexColors: true }); this.scene.add(new THREE.Mesh(mergeGeometries(parts), archMat)); parts.forEach(p => p.dispose());
    // START 배너
    const banner = canvasTex(512, 96, g => { g.fillStyle = '#0c0820'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#ffffff'; g.font = '900 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SPEED RUSH', 256, 52); g.fillStyle = '#ff4fd8'; g.fillRect(0, 0, 512, 6); g.fillRect(0, 90, 512, 6); }, false);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3, 2.2), new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide })); bm.position.set(t.x[0], t.y[0] + 15, t.z[0] + 0.01); bm.rotation.y = -Math.atan2(t.tz[0], t.tx[0]) + Math.PI / 2; this.scene.add(bm); this.disposables.push(bm.geometry, banner);
    // 가로등(속도감용 가까운 기준점)
    const spacing = 6, lampN = Math.floor(t.n / spacing) * 2, post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 7.5, 0.28), new THREE.MeshBasicMaterial({ color: 0x241a40 }), lampN), head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }), lampN);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), c = new THREE.Color(); let li = 0;
    for (let i = 0; i < t.n && li < lampN - 1; i += spacing) for (const s of [-1, 1]) {
      const off = (hw + 4.2) * s, x = t.x[i] - t.tz[i] * off, z = t.z[i] + t.tx[i] * off;
      m4.compose(new THREE.Vector3(x, t.y[i] + 3.75, z), q.identity(), sc); post.setMatrixAt(li, m4);
      e.set(0, -Math.atan2(t.tz[i], t.tx[i]) + Math.PI / 2, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x - (-t.tz[i]) * s * 0.5, t.y[i] + 7.5, z - t.tx[i] * s * 0.5), q, sc); head.setMatrixAt(li, m4);
      head.setColorAt(li, c.setHex((i / spacing) % 2 === 0 ? 0x44f6ff : 0xff5ad8)); li++;
    }
    post.count = head.count = li; this.scene.add(post, head); this.disposables.push(post.geometry, head.geometry);
    // 건물(창문 텍스처)
    const win = canvasTex(64, 128, g => { g.fillStyle = '#0d0a1f'; g.fillRect(0, 0, 64, 128); for (let y = 4; y < 124; y += 10) for (let x = 4; x < 60; x += 9) { if (Math.random() < 0.62) { const h = Math.random(); g.fillStyle = h < 0.5 ? '#ffd9a0' : h < 0.8 ? '#7be9ff' : '#ff7ad9'; g.fillRect(x, y, 5, 6); } } });
    const classes = [{ h: 45, n: quality === 'low' ? 60 : 110 }, { h: 90, n: quality === 'low' ? 40 : 80 }, { h: 160, n: quality === 'low' ? 18 : 40 }];
    const placed: Array<[number, number, number]> = [];
    for (const k of classes) {
      const w = 22, g = new THREE.BoxGeometry(w, k.h, w), uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 12), uv.getY(i) * (k.h / 14));
      const mat = new THREE.MeshBasicMaterial({ map: win, color: 0xb8a6ff }), mesh = new THREE.InstancedMesh(g, mat, k.n); let count = 0;
      for (let tries = 0; tries < k.n * 30 && count < k.n; tries++) {
        const i = Math.floor(Math.random() * t.n), side = Math.random() < 0.5 ? -1 : 1, off = side * (hw + rnd(50, 380)), x = t.x[i] - t.tz[i] * off + rnd(-20, 20), z = t.z[i] + t.tx[i] * off + rnd(-20, 20);
        let ok = true; for (let j = 0; j < t.n; j += 2) { if (Math.hypot(t.x[j] - x, t.z[j] - z) < hw + 40) { ok = false; break; } }
        if (!ok || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 34)) continue;
        placed.push([x, z, k.h]); m4.compose(new THREE.Vector3(x, k.h / 2 - 0.4, z), q.setFromEuler(e.set(0, rnd(0, 6.28), 0)), sc.set(1, 1, 1)); mesh.setMatrixAt(count++, m4);
      }
      mesh.count = count; this.scene.add(mesh); this.disposables.push(g, mat);
    }
    this.disposables.push(archMat, win);
  }

  resize(w: number, h: number): void { this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }
  kick(power: number): void { this.shake = Math.min(1, this.shake + power); }
  punchFov(v: number): void { this.punch = Math.min(1.2, this.punch + v); }
  worldOf(r: Racer): THREE.Vector3 { return new THREE.Vector3(r.car.x, r.car.y, r.car.z); }

  update(race: RaceState, dt: number, wallHit: number): { speedFrac: number } {
    this.time += dt; const p = race.player.car, t = this.track, speed = Math.abs(p.vf), sf = Math.min(1, speed / 74), bst = boosting(p);
    for (const pad of this.pads) pad.tex.offset.x -= dt * 1.4;
    // 차량 배치
    for (const v of this.cars) {
      const c = v.racer.car, pitchRoad = t.pitch[c.idx], accel = (c.vf - v.lastV) / Math.max(dt, 1e-4); v.lastV = c.vf;
      const roll = Math.max(-0.09, Math.min(0.09, -c.yawRate * c.vf * 0.0028)) + c.slip * -0.08, pitch = pitchRoad - Math.max(-0.04, Math.min(0.04, accel * 0.0012));
      v.group.position.set(c.x, c.y + 0.02, c.z); v.group.rotation.set(roll, -c.h, pitch, 'YXZ'); v.shadow.position.set(c.x, c.y + 0.05, c.z); v.shadow.rotation.y = -c.h;
      const fl = boosting(c) ? 1 : 0, len = fl ? 1.8 + Math.sin(this.time * 90 + v.racer.id) * 0.5 + Math.min(1.4, speed / 60) : 0.001;
      for (const f of v.flames) { f.scale.x += (len - f.scale.x) * Math.min(1, dt * 20); (f.material as THREE.MeshBasicMaterial).color.setHex(v.racer.player ? 0x6ec6ff : 0xffa14a); }
      if (fl && Math.random() < 0.9) this.sparks.emit(c.x - Math.cos(c.h) * 2.4, c.y + 0.5, c.z - Math.sin(c.h) * 2.4, -Math.cos(c.h) * 8 + rnd(-2, 2), rnd(0, 2), -Math.sin(c.h) * 8 + rnd(-2, 2), 0.35, 0.4, 0.8, 1);
      if (c.drifting || Math.abs(c.slip) > 0.3) for (const s of [-1, 1]) {
        const bx = c.x - Math.cos(c.h) * 1.4 - Math.sin(c.h) * 0.9 * s * -1, bz = c.z - Math.sin(c.h) * 1.4 + Math.cos(c.h) * 0.9 * s * -1;
        this.smoke.emit(bx, c.y + 0.9, bz, rnd(-1.5, 1.5), rnd(0.5, 2), rnd(-1.5, 1.5), 0.9, 0.55, 0.52, 0.62);
        if (c.drifting && Math.random() < 0.5) this.sparks.emit(bx, c.y + 0.2, bz, rnd(-4, 4) - c.vx * 0.1, rnd(1, 4), rnd(-4, 4) - c.vz * 0.1, 0.4, 1, 0.75, 0.3);
      }
      if (v.racer.player && wallHit > 0) for (let k = 0; k < 18; k++) this.sparks.emit(c.x, c.y + 0.5, c.z, rnd(-9, 9), rnd(1, 7), rnd(-9, 9), 0.5, 1, 0.8, 0.35);
    }
    this.sparks.update(dt, 14); this.smoke.update(dt, -1.5);
    // 카메라: 속도에 비례해 FOV 확대·뒤로 물러남·흔들림
    const hd = p.h; if (!this.camInit) { this.camH = hd; this.camInit = true; }
    this.camH += wrapAngle(hd - this.camH) * Math.min(1, dt * (p.drifting ? 3.2 : 7));
    this.punch = Math.max(0, this.punch - dt * 1.8); this.shake = Math.max(0, this.shake - dt * 2.4);
    const dist = 7 + sf * 1.6 + (bst ? 0.9 : 0), height = 2.5 + sf * 0.3, cx = p.x - Math.cos(this.camH) * dist, cz = p.z - Math.sin(this.camH) * dist, cy = p.y + height;
    const sh = sf * sf * 0.035 + (bst ? 0.05 : 0) + this.shake * 0.5, tt = this.time;
    const k = 1 - Math.exp(-dt * (16 + sf * 10));
    if (this.camera.position.lengthSq() === 0) this.camera.position.set(cx, cy, cz);
    this.camera.position.x += (cx - this.camera.position.x) * k; this.camera.position.y += (cy - this.camera.position.y) * k; this.camera.position.z += (cz - this.camera.position.z) * k;
    this.camera.position.x += Math.sin(tt * 53) * sh; this.camera.position.y += Math.sin(tt * 61 + 1) * sh; this.camera.position.z += Math.sin(tt * 47 + 2) * sh;
    this.camera.lookAt(p.x + Math.cos(this.camH) * 9, p.y + 1.2 + t.pitch[p.idx] * 8, p.z + Math.sin(this.camH) * 9);
    this.camera.rotateZ(-p.yawRate * 0.035 - p.slip * 0.1 + Math.sin(tt * 38) * sh * 0.25);
    const targetFov = 60 + sf * sf * 18 + (bst ? 10 : 0) + this.punch * 8; this.fov += (targetFov - this.fov) * Math.min(1, dt * 6); this.camera.fov = this.fov; this.camera.updateProjectionMatrix();
    // 지면·태양광이 카메라를 따라감
    this.ground.position.x = Math.round(this.camera.position.x / 60) * 60; this.ground.position.z = Math.round(this.camera.position.z / 60) * 60;
    this.scene.getObjectByName('sky')?.position.copy(this.camera.position);
    this.sun.target.position.set(p.x, p.y, p.z); this.sun.position.set(p.x - 40, p.y + 60, p.z - 90);
    this.updateStreaks(dt, p.vx, p.vz, speed, bst);
    this.renderer.render(this.scene, this.camera);
    return { speedFrac: sf };
  }

  /** 카메라 주변에 흩어진 선이 속도 방향으로 길게 늘어나며 스쳐 지나갑니다. */
  private updateStreaks(dt: number, vx: number, vz: number, speed: number, bst: boolean): void {
    const n = this.streakSeed.length / 3, cam = this.camera.position, mat = this.streak.material as THREE.LineBasicMaterial;
    const target = Math.max(0, (speed - 30) / 55) * (bst ? 1 : 0.7); mat.opacity += (target * 0.7 - mat.opacity) * Math.min(1, dt * 6);
    const dx = speed > 1 ? vx / speed : 1, dz = speed > 1 ? vz / speed : 0, len = Math.min(26, 2 + speed * 0.22);
    for (let i = 0; i < n; i++) {
      let x = this.streakSeed[i * 3], y = this.streakSeed[i * 3 + 1], z = this.streakSeed[i * 3 + 2];
      const ahead = (x - cam.x) * dx + (z - cam.z) * dz;
      if (ahead < -10 || Math.hypot(x - cam.x, z - cam.z) > 70 || (x === 0 && z === 0)) {
        const a = Math.random() * Math.PI * 2, rr = rnd(3.5, 22), fwd = rnd(20, 70);
        x = cam.x + dx * fwd + Math.cos(a) * rr * -dz + Math.sin(a) * rr * 0; z = cam.z + dz * fwd + Math.cos(a) * rr * dx; y = cam.y + Math.sin(a) * rr * 0.55 - 1.2;
        if (y < 0.4) y = 0.4 + Math.random(); this.streakSeed[i * 3] = x; this.streakSeed[i * 3 + 1] = y; this.streakSeed[i * 3 + 2] = z;
      }
      this.streakPos.set([x, y, z, x + dx * len, y, z + dz * len], i * 6);
    }
    (this.streak.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  /** HUD 용: 화면 속도감 수치(0..1.4) */
  static intensity(race: RaceState): number { return Math.min(1.4, kmh(race.player.car) / 270 + (boosting(race.player.car) ? 0.25 : 0)); }

  dispose(): void {
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
