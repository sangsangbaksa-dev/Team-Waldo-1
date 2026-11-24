// 괴물 뒷모습 보정: 머리카락 재질이 번들거려 뒤통수가 헬멧처럼 보이던 문제를 무광 + 가닥 질감으로 바꿉니다.
function strandTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 256, y = rnd() * 256, l = 30 + rnd() * 90, v = 80 + (rnd() * 90) | 0;
    g.strokeStyle = `rgba(${v},${v},${v},.55)`;
    g.lineWidth = 0.6 + rnd() * 1.1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 8, y + l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}
// 뒤통수: 머리카락이 후두부를 덮지 못해 맨살이 보이므로, 머리 뒤쪽 피부를 머리카락색으로 칠합니다.
function darkenNape(m) {
  m.onBeforeCompile = (sh) => {
    const head = `#include <common>
varying vec3 vRest;
const float NAPE_Z = 0.035;
const float NAPE_Y = 1.655;`;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRest;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", head)
      .replace("#include <color_fragment>", `#include <color_fragment>
float back = smoothstep(NAPE_Z + 0.025, NAPE_Z - 0.01, vRest.z) * smoothstep(NAPE_Y - 0.015, NAPE_Y + 0.02, vRest.y);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.035, 0.04), back);`);
  };
  m.customProgramCacheKey = () => "nape";
}
export function fixMonster(THREE, model) {
  const bump = strandTexture(THREE);
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (/skin/i.test(m.name || "")) { darkenNape(m); m.needsUpdate = true; continue; }
      if (!/crown/i.test(m.name || "")) continue;
      m.roughness = 0.94;
      m.bumpMap = bump;
      m.bumpScale = 2.2;
      m.envMapIntensity = 0.25;
      m.needsUpdate = true;
    }
  });
}
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { portraitDistance } from "./visual-motion.mjs";


export function createCaptureShot(THREE, model) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x100a0b);
  const portrait = clone(model);
  scene.add(portrait);
  scene.updateMatrixWorld(true);
  const head = portrait.getObjectByName(
    THREE.PropertyBinding.sanitizeNodeName("01 • Portrait | gasp at 3.48 s"),
  );
  const bounds = new THREE.Box3().setFromObject(head, true);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  // The forehead and chin sit behind the forwardmost part of the face.
  const faceDepth = (center.z + bounds.max.z) / 2;
  const faceHeight = center.y - size.y * 0.04;

  scene.add(new THREE.HemisphereLight(0xdad9dc, 0x674044, 0.9));
  const key = new THREE.DirectionalLight(0xffe3cf, 2.1);
  key.position.set(-1, 2, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xca343f, 2);
  rim.position.set(1, 1, -1);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.015, 5);
  return (renderer, aspect, time, reducedMotion) => {
    const progress = reducedMotion ? 1 : Math.min(1, time / 0.25);
    const punch = 1 - (1 - progress) ** 3;
    const shake = reducedMotion ? 0 : (1 - progress) ** 2 * size.y * 0.012;
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.lerp(68, 74, punch);
    const heightDistance = portraitDistance(size.x, size.y, aspect, camera.fov, THREE.MathUtils.lerp(0.58, 0.84, punch));
    camera.position.set(center.x, faceHeight, faceDepth + heightDistance);
    camera.lookAt(center.x, faceHeight, faceDepth);
    camera.position.x += Math.sin(time * 24) * shake;
    camera.position.y += Math.cos(time * 19) * shake;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
}
