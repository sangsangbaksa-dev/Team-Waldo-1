// 공용 후처리: 블룸(밝은 불빛이 번짐) + 비네팅·살짝 색보정 + 톤매핑. 고화질에서만 켜서 가벼운 기기를 지킵니다.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostOptions { strength?: number; radius?: number; threshold?: number; vignette?: number; /** 채도 배율(1 = 그대로) */ saturation?: number; /** 대비(1 = 그대로) */ contrast?: number }

const Grade = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, vig: { value: 0.28 }, sat: { value: 1.08 }, con: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig, sat, con; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, sat); c.rgb = (c.rgb - 0.18) * con + 0.18;
      vec2 d = vUv - 0.5; float v = (1.0 - smoothstep(0.2, 0.78, length(d * vec2(1.0, 0.92)))); c.rgb *= mix(1.0 - vig, 1.0, v);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a); }`,
};

/** 속도감 방사형 블러: 화면 중심에서 멀수록 바깥으로 번집니다(중심 근처의 차는 선명하게 남음). */
const SpeedBlur = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, amt: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.42) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amt; uniform vec2 center; varying vec2 vUv;
    void main(){ vec2 d = vUv - center; float r = smoothstep(0.12, 0.7, length(d * vec2(1.0, 0.8)));
      vec4 sum = texture2D(tDiffuse, vUv); float w = 1.0;
      for (int i = 1; i <= 7; i++) { float f = float(i) / 7.0; sum += texture2D(tDiffuse, vUv - d * amt * r * f); w += 1.0; }
      gl_FragColor = sum / w; }`,
};

const _v = new THREE.Vector2();
/** 고화질일 때만 후처리를 만듭니다. */
export const makePost = (quality: string, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, o?: PostOptions): PostFx | null => quality === 'high' ? new PostFx(renderer, scene, camera, o) : null;

export class PostFx {
  private composer: EffectComposer; private bloom: UnrealBloomPass; private grade: ShaderPass; private blur: ShaderPass;
  private sw = 0; private sh = 0; private pr = 0;
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, o: PostOptions = {}) {
    const sz = renderer.getSize(new THREE.Vector2()), w = Math.max(1, sz.x), h = Math.max(1, sz.y); this.sw = w; this.sh = h;
    const pr = renderer.getPixelRatio(); this.pr = pr; const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target); this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), o.strength ?? 0.5, o.radius ?? 0.6, o.threshold ?? 0.85); this.composer.addPass(this.bloom);
    this.blur = new ShaderPass(SpeedBlur); this.blur.enabled = false; this.composer.addPass(this.blur);
    this.grade = new ShaderPass(Grade); this.grade.uniforms.vig.value = o.vignette ?? 0.28; this.grade.uniforms.sat.value = o.saturation ?? 1.08; this.grade.uniforms.con.value = o.contrast ?? 1.06; this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number): void { w = Math.max(1, w); h = Math.max(1, h); const pr = this.renderer.getPixelRatio(); if (w === this.sw && h === this.sh && pr === this.pr) return; if (pr !== this.pr) this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.sw = w; this.sh = h; this.pr = pr; }
  /** 속도 블러 세기(0 이면 패스를 끕니다). 0.02~0.06 이 적당합니다. */
  setSpeedBlur(v: number): void { const amount = Number.isFinite(v) ? Math.max(0, Math.min(0.15, v)) : 0; this.blur.enabled = amount > 0.004; this.blur.uniforms.amt.value = amount; }
  setCamera(camera: THREE.Camera): void { (this.composer.passes[0] as RenderPass).camera = camera; }
  setScene(scene: THREE.Scene): void { (this.composer.passes[0] as RenderPass).scene = scene; }
  set(o: PostOptions): void { if (o.strength !== undefined) this.bloom.strength = o.strength; if (o.threshold !== undefined) this.bloom.threshold = o.threshold; if (o.radius !== undefined) this.bloom.radius = o.radius; if (o.vignette !== undefined) this.grade.uniforms.vig.value = o.vignette; if (o.saturation !== undefined) this.grade.uniforms.sat.value = o.saturation; if (o.contrast !== undefined) this.grade.uniforms.con.value = o.contrast; }
  render(dt: number): void { const sz = this.renderer.getSize(_v); if (sz.x !== this.sw || sz.y !== this.sh || this.renderer.getPixelRatio() !== this.pr) this.setSize(sz.x, sz.y); this.composer.render(dt); }
  dispose(): void { for (const pass of this.composer.passes) pass.dispose(); this.composer.dispose(); }
}
