import * as THREE from 'three';
import { createBattleWorld } from './graphics';
import { createWar } from './war';
import { readPreferences } from './preferences';

/** A decorative scene: no match progress, saved data, or input handlers. */
export function createLandingPreview(mount: HTMLElement): () => void {
  let preferences = readPreferences();
  let antialias = preferences.quality === 'high';
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias, alpha: false, powerPreference: 'low-power' });
  } catch {
    mount.dataset.preview = 'unavailable';
    return () => undefined;
  }
  const compact = window.matchMedia('(max-width: 700px)').matches;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = preferences.reducedMotion;
  let dead = false;
  let visible = true;
  let frame = 0;
  let elapsed = 0;
  let last = 0;
  const configureRenderer = () => {
    const limit = preferences.quality === 'high' ? 1.5 : preferences.quality === 'low' ? 0.85 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, limit));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = preferences.quality === 'low' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = preferences.quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
  };
  configureRenderer();
  mount.append(renderer.domElement);
  mount.dataset.preview = 'ready';

  const scene = new THREE.Scene();
  const war = createWar();
  war.units = [];
  const world = createBattleWorld(scene, war);
  world.setQuality(preferences.quality === 'high');
  world.setReducedMotion(reducedMotion);
  world.setLabelsVisible(false);
  world.setStrategicOverlaysVisible(false);
  scene.background = new THREE.Color(0x91b4a8);
  scene.fog = new THREE.FogExp2(0x91b4a8, 0.0039);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 620);
  const home = war.factions[0];

  const draw = () => {
    if (dead || document.hidden || !visible) return;
    const angle = 0.65 + (reducedMotion ? 0 : Math.sin(elapsed * 0.055) * 0.12);
    const distance = compact ? 98 : 105;
    camera.position.set(home.x + Math.sin(angle) * distance, 78, home.z + Math.cos(angle) * distance);
    camera.lookAt(home.x, 5, home.z);
    renderer.render(scene, camera);
  };
  const resize = () => {
    if (dead) return;
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  };
  const loop = (now: number) => {
    if (dead) return;
    if (now - last >= 1000 / 15 && !reducedMotion && !document.hidden && visible) {
      const dt = last ? Math.min((now - last) / 1000, 0.15) : 0;
      elapsed += dt;
      last = now;
      world.update(dt);
      draw();
    }
    frame = requestAnimationFrame(loop);
  };
  const preferenceChanged = () => {
    if (dead) return;
    preferences = readPreferences();
    reducedMotion = preferences.reducedMotion;
    const nextAntialias = preferences.quality === 'high';
    // Context antialiasing is immutable: replace only this decorative renderer.
    if (nextAntialias !== antialias || mount.dataset.preview === 'unavailable') {
      let next: THREE.WebGLRenderer;
      try { next = new THREE.WebGLRenderer({ antialias: nextAntialias, alpha: false, powerPreference: 'low-power' }); }
      catch {
        mount.dataset.preview = 'unavailable';
        renderer.domElement.style.visibility = 'hidden';
        visible = false;
        return;
      }
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.replaceWith(next.domElement);
      renderer.dispose(); renderer.forceContextLoss();
      renderer = next; antialias = nextAntialias;
      renderer.domElement.addEventListener('webglcontextlost', contextLost);
      mount.dataset.preview = 'ready';
      const bounds = mount.getBoundingClientRect();
      visible = bounds.bottom > 0 && bounds.top < innerHeight;
    }
    world.setQuality(preferences.quality === 'high');
    world.setReducedMotion(reducedMotion);
    configureRenderer();
    last = 0;
    resize();
  };
  const visibilityChanged = () => { last = 0; draw(); };
  const contextLost = (event: Event) => {
    event.preventDefault();
    mount.dataset.preview = 'unavailable';
    visible = false;
    renderer.domElement.style.visibility = 'hidden';
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? true;
    last = 0;
    if (visible) draw();
  });
  intersection.observe(mount);
  preference.addEventListener('change', preferenceChanged);
  window.addEventListener('waldo:preferences', preferenceChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  resize();
  frame = requestAnimationFrame(loop);

  return () => {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    intersection.disconnect();
    preference.removeEventListener('change', preferenceChanged);
    window.removeEventListener('waldo:preferences', preferenceChanged);
    document.removeEventListener('visibilitychange', visibilityChanged);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    world.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    delete mount.dataset.preview;
  };
}
