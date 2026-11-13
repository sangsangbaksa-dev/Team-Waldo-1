// Blender 모델 미리보기 (개발 전용): vite dev 서버에서 /tools/model-preview.html 로 엽니다.
import * as THREE from 'three';
import { CHAR_KINDS, WEAPON_KINDS, instantiate, loadModels, type Baked } from '../src/city/models';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2b3a4a);
scene.add(new THREE.HemisphereLight(0xdbe6ff, 0x5a4a40, 1.5)); const sun = new THREE.DirectionalLight(0xffe0b0, 2.4); sun.position.set(6, 10, 4); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x4a4f58 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 500);
const lam = new THREE.MeshLambertMaterial({ vertexColors: true }), basic = new THREE.MeshBasicMaterial({ vertexColors: true });
const bakedGroup = (b: Baked, team = 0x3ddc97, skin = 0xe0b48c): THREE.Group => {
  const g = new THREE.Group();
  if (b.fixed) g.add(new THREE.Mesh(b.fixed, lam)); if (b.glow) g.add(new THREE.Mesh(b.glow, basic));
  if (b.team) g.add(new THREE.Mesh(b.team, new THREE.MeshLambertMaterial({ vertexColors: true, color: team })));
  if (b.skin) g.add(new THREE.Mesh(b.skin, new THREE.MeshLambertMaterial({ vertexColors: true, color: skin })));
  return g;
};
const sections: Record<string, { c: THREE.Vector3; d: number }> = {};
const row = (name: string, items: THREE.Object3D[], gap: number, z0: number, dist: number): void => {
  const total = items.length;
  items.forEach((o, i) => { const col = i - (total - 1) / 2; o.position.x = col * gap; o.position.z = z0; scene.add(o); });
  sections[name] = { c: new THREE.Vector3(0, dist * 0.12, z0), d: Math.max(dist * 0.4, total * gap * 0.6) };
};
loadModels('/').then(m => {
  const yaw = (o: THREE.Object3D, a: number): THREE.Object3D => { const g = new THREE.Group(); o.rotation.y = a; g.add(o); return g; };
  const chars = CHAR_KINDS.map((k, i) => {
    const g = new THREE.Group(), body = bakedGroup(m.chars[k].body, [0x3ddc97, 0xff5d5d, 0x4da3ff, 0xffc93c, 0xb77bff, 0xff8f45, 0x35d9e6, 0xff7dbd][i % 8]);
    g.add(body); for (const s of [-1, 1]) { const l = bakedGroup(m.chars[k].leg); l.position.set(0, 0.9, s * 0.11); g.add(l); }
    return yaw(g, -0.55);
  });
  row('chars', chars, 1.5, -400, 10.5);
  const guns: THREE.Object3D[] = []; for (const k of WEAPON_KINDS) guns.push(yaw(instantiate(m.groundGuns[k]), -0.5));
  row('guns', guns, 1.5, -320, 12);
  const vms: THREE.Object3D[] = []; for (const k of WEAPON_KINDS) vms.push(yaw(instantiate(m.viewGuns[k]), -0.5));
  row('viewmodels', vms, 1.7, -250, 12);
  const colors = [0xd9d9d9, 0xff3b3b, 0x8b6f47, 0xf4f6ff];
  const vs = ['sedan', 'hatch', 'suv', 'taxi', 'van', 'sports', 'police', 'truck', 'tank', 'buggy'].map((k, i) => yaw(instantiate(m.vehicles[k], { paint: colors[i % 4], team: 0x3ddc97 }), -0.6));
  row('vehicles', vs, 6.5, -170, 30);
  const ss = ['hq', 'barracks', 'depot', 'factory', 'lab', 'turret'].map(k => yaw(instantiate(m.structures[k], { team: 0x4da3ff }), -0.6));
  row('structures', ss, 14, -70, 40);
  const ps = ['tree_round', 'tree_pine', 'lamp', 'crystal', 'crate', 'plane', 'hydrant', 'bench', 'bin', 'cone', 'mailbox', 'dumpster', 'barrier', 'tl_red', 'tl_green'].map(k => yaw(instantiate(m.props[k], { team: 0x4da3ff }), -0.6));
  ps.forEach((p, i) => { if (i === 5) p.scale.setScalar(0.35); });
  row('props', ps, 4.2, 40, 26);
  (window as unknown as Record<string, unknown>).__view = (name: string): void => { const s = sections[name]; cam.position.set(s.c.x, s.c.y + s.d * 0.22, s.c.z + s.d); cam.lookAt(s.c); renderer.render(scene, cam); };
  (window as unknown as Record<string, unknown>).__look = (kind: string, ang: number): void => { const i = CHAR_KINDS.indexOf(kind as never), n = CHAR_KINDS.length, x = (i - (n - 1) / 2) * 1.5; cam.position.set(x + Math.sin(ang) * 3.6, 1.5, -400 + Math.cos(ang) * 3.6); cam.lookAt(x, 1.15, -400); renderer.render(scene, cam); };
  (window as unknown as Record<string, unknown>).__ready = true;
}).catch(e => { document.title = 'ERR ' + e; (window as unknown as Record<string, unknown>).__err = String(e?.stack ?? e); });
