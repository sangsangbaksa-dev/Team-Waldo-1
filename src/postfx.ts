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
      vec2 d = vUv - 0.5; float v = smoothstep(0.78, 0.2, length(d * vec2(1.0, 0.92))); c.rgb *= mix(1.0 - vig, 1.0, v);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a); }`,
};

const _v = new THREE.Vector2();
/** 고화질일 때만 후처리를 만듭니다. */
export const makePost = (quality: string, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, o?: PostOptions): PostFx | null => quality === 'high' ? new PostFx(renderer, scene, camera, o) : null;

export class PostFx {
  private composer: EffectComposer; private bloom: UnrealBloomPass; private grade: ShaderPass;
  private sw = 0; private sh = 0;
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, o: PostOptions = {}) {
    const sz = renderer.getSize(new THREE.Vector2()), w = Math.max(1, sz.x), h = Math.max(1, sz.y); this.sw = w; this.sh = h;
    const pr = renderer.getPixelRatio(), target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target); this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), o.strength ?? 0.5, o.radius ?? 0.6, o.threshold ?? 0.85); this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(Grade); this.grade.uniforms.vig.value = o.vignette ?? 0.28; this.grade.uniforms.sat.value = o.saturation ?? 1.08; this.grade.uniforms.con.value = o.contrast ?? 1.06; this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number): void { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  setCamera(camera: THREE.Camera): void { (this.composer.passes[0] as RenderPass).camera = camera; }
  setScene(scene: THREE.Scene): void { (this.composer.passes[0] as RenderPass).scene = scene; }
  set(o: PostOptions): void { if (o.strength !== undefined) this.bloom.strength = o.strength; if (o.threshold !== undefined) this.bloom.threshold = o.threshold; if (o.vignette !== undefined) this.grade.uniforms.vig.value = o.vignette; }
  render(dt: number): void { const sz = this.renderer.getSize(_v); if (sz.x !== this.sw || sz.y !== this.sh) { this.sw = sz.x; this.sh = sz.y; this.setSize(sz.x, sz.y); } this.composer.render(dt); }
  dispose(): void { this.composer.dispose(); }
}
