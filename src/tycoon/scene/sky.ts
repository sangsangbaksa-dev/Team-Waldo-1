// TYCOON — 하늘·조명·안개·비. 게임 시계(분)와 날짜로 낮밤과 날씨가 정해집니다.
import * as THREE from 'three';
import { hash01 } from './layout';
import type { Quality } from './city';

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const C = (hex: number): THREE.Color => new THREE.Color(hex);
// Static palette is shared, while each Atmosphere owns the mutable frame colors.
const SKY_PALETTE = {
  dayTop: C(0x2a62b5), nightTop: C(0x020611), rainTop: C(0x4b6b92), duskTop: C(0x6a4a78),
  dayHor: C(0xbfd6ea), nightHor: C(0x0a1220), rainHor: C(0x7e8c9c), duskHor: C(0xffa560),
  glowDay: C(0xffa050), glowNight: C(0xcfe0ff), sunDay: C(0xfff2d8), sunDusk: C(0xff9a50), sunRain: C(0xb8c4d6),
  hemiDay: C(0xbfd8ff), hemiNight: C(0x4b5f95), groundDay: C(0x3a3228), groundNight: C(0x101420),
  lightning: C(0xcfd8ff), fogNight: C(0x141a26),
};

const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }';
const SKY_FRAG = `varying vec3 vDir; uniform vec3 uTop, uHor, uGlow, uSunDir; uniform float uNight, uCloud, uTime, uGlowAmt;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  float sunAmt = pow(max(dot(d, uSunDir), 0.0), 6.0) * uGlowAmt; col += uGlow * sunAmt * 0.6 + uGlow * pow(max(dot(d, uSunDir), 0.0), 120.0) * uGlowAmt * 1.8;
  col = mix(col, uHor * 0.9, (1.0 - smoothstep(-0.2, 0.0, d.y)));
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.25) * 1.6 + uTime * 0.01; float c = fbm(uv * 1.3); c = smoothstep(0.42 - uCloud * 0.2, 0.9, c) * (0.35 + uCloud * 0.65);
    vec3 cc = mix(vec3(1.0), uHor * 1.2 + 0.1, 0.4) * mix(1.0, 0.35, uNight); cc = mix(cc, vec3(0.34, 0.37, 0.42) * mix(1.0, 0.4, uNight), uCloud);
    col = mix(col, cc, c * smoothstep(0.0, 0.25, d.y));
    float st = step(0.9965, hash(floor(d.xz / (d.y + 0.2) * 220.0))) * uNight * (1.0 - uCloud) * smoothstep(0.05, 0.4, d.y); col += vec3(st);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const RAIN_VERT = `uniform float uTime; uniform vec3 uCenter; attribute float aEnd; attribute vec3 aBase; varying float vA;
void main(){ vec3 b = aBase; float y = mod(b.y - uTime * 26.0, 46.0); vec3 w = vec3(mod(b.x - uCenter.x + 32.0, 64.0) - 32.0, y, mod(b.z - uCenter.z + 32.0, 64.0) - 32.0) + uCenter;
  w.y += -2.0 - aEnd * 1.6; w.x += aEnd * 0.35; vA = 1.0 - aEnd * 0.6; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`;
const RAIN_FRAG = 'uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(0.72, 0.8, 0.9, uOpacity * vA); }';

export interface SkyState { daylight: number; wet: number; night: number; hour: number }

export class Atmosphere {
  readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  readonly moon = new THREE.DirectionalLight(0x8aa6ff, 0);
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3228, 0.6);
  private dome: THREE.Mesh; private skyU: Record<string, THREE.IUniform>;
  private rain: THREE.LineSegments | null = null; private rainU: Record<string, THREE.IUniform> | null = null;
  private fog = new THREE.FogExp2(0x9fb6cc, 0.003);
  private env: THREE.WebGLRenderTarget | null = null; private pmrem: THREE.PMREMGenerator;
  private time = 0; private rainLevel = 0; private flash = 0; private nextFlash = 8;
  private frameTop = new THREE.Color(); private frameHor = new THREE.Color(); private frameGlow = new THREE.Color();
  private frameSun = new THREE.Color(); private frameFog = new THREE.Color();
  private frameSunDir = new THREE.Vector3(); private frameLightDir = new THREE.Vector3();
  state: SkyState = { daylight: 1, wet: 0, night: 0, hour: 12 };
  /** 이번 날에 비가 오는가(날짜로 결정). */
  static rainyDay(day: number): boolean { return hash01(day, 4242) < 0.3; }

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, private quality: Quality) {
    scene.fog = this.fog;
    const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: C(0x3a78c8) }, uHor: { value: C(0xbcd4ea) }, uGlow: { value: C(0xffb066) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uCloud: { value: 0.2 }, uTime: { value: 0 }, uGlowAmt: { value: 1 } } });
    this.skyU = mat.uniforms; this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat); this.dome.renderOrder = -10; this.dome.frustumCulled = false; scene.add(this.dome);
    this.sun.castShadow = quality !== 'low';
    const sz = quality === 'high' ? 2048 : 1024, sc = this.sun.shadow.camera; this.sun.shadow.mapSize.set(sz, sz); sc.near = 10; sc.far = 260; sc.left = sc.bottom = -70; sc.right = sc.top = 70; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target, this.moon, this.hemi);
    // Rain remains unallocated until this particular world actually needs it.
    this.pmrem = new THREE.PMREMGenerator(renderer); this.buildEnv();
  }
  private createRain(): void {
    if (this.rain) return;
    const N = this.quality === 'low' ? 900 : 2600;
    const base = new Float32Array(N * 6), end = new Float32Array(N * 2);
    for (let k = 0; k < N; k++) {
      const x = Math.random() * 64, y = Math.random() * 46, z = Math.random() * 64;
      for (let e = 0; e < 2; e++) { base.set([x, y, z], (k * 2 + e) * 3); end[k * 2 + e] = e; }
    }
    const geometry = new THREE.BufferGeometry();
    // The shader displaces aBase directly. Sharing its BufferAttribute with
    // the required position binding avoids an otherwise unused second buffer
    // of N × 2 × 3 float coordinates.
    const positions = new THREE.BufferAttribute(base, 3);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('aBase', positions);
    geometry.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: this.time }, uCenter: { value: new THREE.Vector3() }, uOpacity: { value: 0 } },
    });
    this.rainU = material.uniforms;
    this.rain = new THREE.LineSegments(geometry, material);
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }
  private buildEnv(): void {
    const s = new THREE.Scene(), g = new THREE.SphereGeometry(50, 32, 16);
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 v; void main(){ v = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'varying vec3 v; void main(){ float h = normalize(v).y; vec3 c = mix(vec3(0.28,0.3,0.34), vec3(0.62,0.74,0.9), smoothstep(-0.1, 0.9, h)); c += vec3(1.0,0.7,0.4) * (1.0 - smoothstep(0.0, 0.55, abs(h - 0.08))) * 0.5; gl_FragColor = vec4(c, 1.); }' });
    s.add(new THREE.Mesh(g, m)); this.env = this.pmrem.fromScene(s, 0.04); this.scene.environment = this.env.texture; g.dispose(); m.dispose();
  }
  /** 매 프레임: 시계·날짜·플레이어 위치로 하늘/조명/날씨를 갱신하고 돌려줍니다. */
  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, minutes: number, day: number): SkyState {
    this.time += dt;
    const h = minutes / 60, el = Math.sin(((h - 6) / 12) * Math.PI), dayK = smooth(-0.08, 0.22, el), night = 1 - smooth(-0.22, 0.05, el), dusk = Math.exp(-Math.pow(el / 0.2, 2)) * (1 - 0.7 * night);
    const rainTarget = Atmosphere.rainyDay(day) ? 1 : 0; this.rainLevel += (rainTarget - this.rainLevel) * Math.min(1, dt * 0.25);
    const wet = this.rainLevel, cloud = 0.18 + wet * 0.75;
    const top = this.frameTop.copy(SKY_PALETTE.dayTop).lerp(SKY_PALETTE.nightTop, night).lerp(SKY_PALETTE.rainTop, wet * 0.6 * (1 - night) + wet * 0.25).lerp(SKY_PALETTE.duskTop, dusk * 0.35);
    const hor = this.frameHor.copy(SKY_PALETTE.dayHor).lerp(SKY_PALETTE.nightHor, night).lerp(SKY_PALETTE.rainHor, wet * 0.55).lerp(SKY_PALETTE.duskHor, dusk * 0.7 * (1 - wet * 0.6));
    const glowAmt = (1 - wet * 0.85) * (0.25 + dusk * 1.6);
    const azim = (h / 24) * Math.PI * 2, sx = Math.cos(azim) * 0.35, sz = Math.sin(azim) * 0.9;
    const sunDir = this.frameSunDir.set(sx, Math.max(0.02, Math.abs(el)) * Math.sign(el || 1), sz).normalize(); if (el < 0) sunDir.y = Math.max(0.12, -el) * 1.0;
    const light = this.frameLightDir.set(sx, Math.abs(el) * 0.92 + 0.1, sz).normalize();
    // 하늘 지오메트리는 카메라를 따라다닙니다.
    this.dome.position.copy(camera.position); this.skyU.uTop.value = top; this.skyU.uHor.value = hor; this.skyU.uGlow.value = this.frameGlow.copy(SKY_PALETTE.glowDay).lerp(SKY_PALETTE.glowNight, night); this.skyU.uSunDir.value.copy(el > 0 ? sunDir : light);
    this.skyU.uNight.value = night; this.skyU.uCloud.value = cloud; this.skyU.uTime.value = this.time; this.skyU.uGlowAmt.value = el > -0.05 ? glowAmt : 0.0;
    // 조명
    const sunCol = this.frameSun.copy(SKY_PALETTE.sunDay).lerp(SKY_PALETTE.sunDusk, dusk * 0.8).lerp(SKY_PALETTE.sunRain, wet * 0.6);
    this.sun.color.copy(sunCol); this.sun.intensity = (0.15 + 2.4 * dayK) * (1 - wet * 0.65);
    this.moon.intensity = night * (0.55 - wet * 0.25); this.moon.position.copy(focus).addScaledVector(light, 90).setY(70); this.moon.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(light, 120); this.sun.target.position.copy(focus);
    this.hemi.intensity = lerp(0.28, 0.75, dayK) * (1 - wet * 0.15) + night * 0.05; this.hemi.color.copy(SKY_PALETTE.hemiDay).lerp(SKY_PALETTE.hemiNight, night); this.hemi.groundColor.copy(SKY_PALETTE.groundDay).lerp(SKY_PALETTE.groundNight, night);
    // 번개(비 오는 밤·낮)
    if (wet > 0.8) { this.nextFlash -= dt; if (this.nextFlash <= 0) { this.flash = 1; this.nextFlash = 6 + Math.random() * 14; } }
    this.flash = Math.max(0, this.flash - dt * 3.5); const fl = this.flash > 0 ? (Math.sin(this.flash * 18) > 0 ? this.flash : 0.2 * this.flash) : 0;
    this.hemi.intensity += fl * 1.4; this.skyU.uTop.value = top.lerp(SKY_PALETTE.lightning, fl * 0.6);
    // 안개
    const fogCol = this.frameFog.copy(hor).lerp(SKY_PALETTE.fogNight, night * 0.5); this.fog.color.copy(fogCol); this.fog.density = lerp(0.0032, 0.0075, wet) + night * 0.0012; (this.scene.background as unknown) = null;
    (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = lerp(0.18, 0.95, dayK) * (1 - wet * 0.2) + night * 0.22 + wet * 0.15;
    // 비
    if (wet > 0.04 && !this.rain) this.createRain();
    if (this.rain && this.rainU) {
      this.rain.visible = wet > 0.04;
      if (this.rain.visible) {
        this.rainU.uTime.value = this.time;
        this.rainU.uOpacity.value = wet * 0.4;
        (this.rainU.uCenter.value as THREE.Vector3).copy(camera.position);
      }
    }
    this.state.daylight = dayK; this.state.wet = wet; this.state.night = night; this.state.hour = h;
    return this.state;
  }
  /** 렌더러 노출(밤엔 살짝 올려 어둠이 답답하지 않게). */
  exposure(): number { return lerp(0.95, 1.15, this.state.night); }
  dispose(): void {
    this.scene.remove(this.dome, this.sun, this.sun.target, this.moon, this.hemi);
    if (this.rain) {
      this.rain.removeFromParent();
      this.rain.geometry.dispose();
      (this.rain.material as THREE.Material).dispose();
      this.rain = null; this.rainU = null;
    }
    this.sun.shadow.dispose();
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.env?.dispose(); this.pmrem.dispose(); this.scene.environment = null;
  }
}
