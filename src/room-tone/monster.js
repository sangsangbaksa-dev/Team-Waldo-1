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
