// 공용 그래픽 도구: 환경 반사(PMREM)와 재질 업그레이드. 장면마다 한 번만 만들고 재사용하세요.
import * as THREE from 'three';

export interface EnvOptions { top?: number; horizon?: number; ground?: number; sun?: number; sunDir?: [number, number, number]; sunPower?: number }

/** 하늘 그라데이션 + 태양 점으로 작은 장면을 만들어 PMREM 환경맵으로 굽습니다. scene.environment 에 넣으면 금속·유리·도장이 하늘을 비춥니다. */
export function makeEnvironment(renderer: THREE.WebGLRenderer, o: EnvOptions = {}): THREE.Texture {
  const top = new THREE.Color(o.top ?? 0x6f9fe0), horizon = new THREE.Color(o.horizon ?? 0xf0d8b8), ground = new THREE.Color(o.ground ?? 0x3a362f), sunCol = new THREE.Color(o.sun ?? 0xfff0d0);
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: top }, horizon: { value: horizon }, ground: { value: ground } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top, horizon, ground; varying vec3 vp; void main(){ float h = vp.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.4)); gl_FragColor = vec4(c, 1.0); }',
  }));
  env.add(sky);
  const dir = new THREE.Vector3(...(o.sunDir ?? [0.5, 0.7, 0.4])).normalize().multiplyScalar(40);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: sunCol.multiplyScalar(o.sunPower ?? 6) })); sun.position.copy(dir); env.add(sun);
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(env, 0.03).texture;
  pm.dispose(); sky.geometry.dispose(); (sky.material as THREE.Material).dispose(); sun.geometry.dispose(); (sun.material as THREE.Material).dispose();
  return tex;
}

export interface StandardizeOptions { roughness?: number; metalness?: number; envMapIntensity?: number }

const cache = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
/** Lambert·Phong 재질을 MeshStandardMaterial 로 바꿉니다(색·텍스처·정점색·발광·투명도 유지). 같은 원본은 같은 새 재질을 공유합니다. */
export function standardize(root: THREE.Object3D, o: StandardizeOptions = {}): void {
  const convert = (m: THREE.Material): THREE.Material => {
    if (!(m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial)) return m;
    let s = cache.get(m); if (s) return s;
    s = new THREE.MeshStandardMaterial({
      name: m.name, color: m.color, map: m.map, vertexColors: m.vertexColors, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
      transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, flatShading: m.flatShading,
      roughness: m.transparent && m.opacity < 0.9 ? 0.08 : o.roughness ?? 0.72, metalness: o.metalness ?? 0.05, envMapIntensity: o.envMapIntensity ?? 0.8,
    });
    cache.set(m, s); return s;
  };
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh; if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
}
