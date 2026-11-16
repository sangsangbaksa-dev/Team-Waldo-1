import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

/** Screen-space AA also works when a match was launched with AA disabled. */
export function createRenderPipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  camera.layers.enable(1);
  let composer: EffectComposer | undefined, aa: ShaderPass | undefined;
  const size = new THREE.Vector2();
  let enabled = false;
  function resize() {
    if (!composer || !aa) return;
    renderer.getSize(size);
    const ratio = renderer.getPixelRatio();
    composer.setPixelRatio(ratio); composer.setSize(size.x, size.y);
    aa.uniforms.resolution.value.set(1 / Math.max(1, size.x * ratio), 1 / Math.max(1, size.y * ratio));
  }
  function setEnabled(value: boolean) {
    enabled = value;
    if (enabled && !composer) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      // FXAA expects display-space input; run it after tone mapping.
      composer.addPass(new OutputPass());
      aa = new ShaderPass(FXAAShader);
      composer.addPass(aa);
    }
    resize();
  }
  return {
    setEnabled, resize,
    render() {
      // Keep the in-game/debug GPU counts accurate across all postprocess passes.
      const autoReset = renderer.info.autoReset;
      renderer.info.reset(); renderer.info.autoReset = false;
      const mask = camera.layers.mask, autoClear = renderer.autoClear, background = scene.background;
      try {
        if (enabled && composer) {
          camera.layers.disable(1); composer.render();
          // Labels bypass FXAA so Korean glyphs do not smear into scenery edges.
          camera.layers.set(1); scene.background = null; renderer.autoClear = false;
          renderer.clearDepth(); renderer.render(scene, camera);
        } else renderer.render(scene, camera);
      } finally {
        camera.layers.mask = mask; scene.background = background;
        renderer.autoClear = autoClear; renderer.info.autoReset = autoReset;
      }
    },
    dispose() { composer?.passes.forEach(pass => pass.dispose()); composer?.dispose(); },
  };
}
