// SPEED RUSH 차량 모델 미리보기 (개발 전용): vite dev 서버에서 /tools/race-car-preview.html?glb=<경로> 로 엽니다.
// 게임과 같은 재질 규칙(광택 도장·반사 유리·발광 램프)으로 gt·wide·long 을 나란히 놓고 window.__shot(차, 각도, 높이, 거리)로 찍습니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { instantiate } from '../src/city/models';

const q = new URLSearchParams(location.search), glb = q.get('glb') || '/assets/models/race.glb';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1); renderer.toneMapping = THREE.ACESFilmicToneMapping; document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe9a36a);
const pm = new THREE.PMREMGenerator(renderer), env = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environment = env;
scene.add(new THREE.HemisphereLight(0xffd9b0, 0x4a3a30, 0.6)); const sun = new THREE.DirectionalLight(0xffc98a, 2.4); sun.position.set(-6, 5, 7); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3b3d44, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 500);
const mats = new Map<string, THREE.Material>();
const polish = (body: THREE.Object3D): void => body.traverse(o => {
  const mesh = o as THREE.Mesh; if (!mesh.isMesh || Array.isArray(mesh.material)) return;
  const src = mesh.material as THREE.MeshLambertMaterial; if (!src.type.startsWith('MeshLambert')) return;
  const key = `${src.name}:${src.color.getHexString()}`; let m = mats.get(key);
  if (!m) {
    const n = src.name, base = { color: src.color.clone(), envMap: env };
    m = n === 'Paint' ? new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.85 })
      : n === 'Team' ? new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.3, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.9 })
      : n === 'Glass' ? new THREE.MeshStandardMaterial({ ...base, metalness: 0.85, roughness: 0.06, envMapIntensity: 1.5 })
      : n === 'Steel' || n === 'Gunmetal' || n === 'White' || n === 'Red' || n === 'Chrome' ? new THREE.MeshStandardMaterial({ ...base, metalness: 0.85, roughness: n === 'Chrome' ? 0.18 : 0.38, envMapIntensity: 0.9 })
      : new THREE.MeshStandardMaterial({ ...base, metalness: 0.1, roughness: 0.85, envMapIntensity: 0.25 });
    m.name = n; mats.set(key, m);
  }
  mesh.material = m;
});
const colors: Record<string, [number, number]> = { gt: [0xd8323f, 0xf2f2f2], wide: [0xf08a1c, 0x1b1d22], long: [0x2e7dff, 0xf2f2f2] };
new GLTFLoader().loadAsync(glb).then(gltf => {
  const found: Record<string, THREE.Object3D> = {}; gltf.scene.traverse(o => { if (o.name === 'gt' || o.name === 'wide' || o.name === 'long') found[o.name] = o; });
  const names = ['gt', 'wide', 'long'];
  names.forEach((n, i) => { const car = instantiate(found[n], { paint: colors[n][0], team: colors[n][1] }); polish(car); car.position.x = (i - 1) * 7; scene.add(car); });
  (window as unknown as Record<string, unknown>).__shot = (car: string, yaw: number, h: number, dist: number, look = 0.55): void => {
    const cx = (names.indexOf(car) - 1) * 7; cam.position.set(cx + Math.sin(yaw) * dist, h, Math.cos(yaw) * dist); cam.lookAt(cx, look, 0); renderer.render(scene, cam);
  };
  (window as unknown as Record<string, unknown>).__ready = true;
}).catch(e => { (window as unknown as Record<string, unknown>).__err = String(e?.stack ?? e); });
