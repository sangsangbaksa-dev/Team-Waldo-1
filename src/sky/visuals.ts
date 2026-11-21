import * as THREE from 'three';
import { terrainY, type Kind } from './sim';
import { cloudSprite } from './art';

// Small pieces share geometry within each aircraft; they inherit its transform.
export function detailJet(jet: THREE.Group, kind: Kind, team: 'player' | 'enemy'): void {
  const s = kind === 'boss' ? 2.8 : kind === 'bomber' ? 1.7 : 1;
  const span = kind === 'boss' ? 11 : kind === 'bomber' ? 9.5 : kind === 'ace' ? 8.2 : 7.2;
  const panel = new THREE.MeshStandardMaterial({ color: team === 'player' ? 0xaebed0 : 0x343b45, metalness: 0.65, roughness: 0.38 });
  const seam = new THREE.MeshStandardMaterial({ color: 0x172b39, metalness: 0.5, roughness: 0.5 });
  const bright = new THREE.MeshStandardMaterial({ color: 0xc7d9e2, metalness: 0.8, roughness: 0.25 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x244b69, metalness: 0.55, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.86 });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.94 * s, 20, 12), glass);
  canopy.scale.set(0.78, 0.57, 1.8); canopy.position.set(0, 1.01 * s, -2.25 * s); jet.add(canopy);
  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.72 * s, 0.045 * s, 5, 24, Math.PI), bright);
  canopyFrame.position.set(0, 1.04 * s, -2.2 * s); jet.add(canopyFrame);
  const stripeGeo = new THREE.BoxGeometry(1, 1, 1);
  const box = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, angle = 0): void => {
    const mesh = new THREE.Mesh(stripeGeo, material); mesh.position.set(x * s, y * s, z * s); mesh.scale.set(sx * s, sy * s, sz * s); mesh.rotation.y = angle; jet.add(mesh);
  };
  for (const side of [-1, 1]) {
    // Wing panels, control surfaces, leading-edge trim and navigation lamps.
    box(panel, side * span * 0.54, 0.035, 1.62, span * 0.62, 0.09, 0.55, side * 0.10);
    box(seam, side * span * 0.53, 0.09, 1.28, span * 0.58, 0.025, 0.035, side * 0.10);
    box(bright, side * span * 0.43, 0.07, -0.28, span * 0.74, 0.05, 0.10, side * 0.53);
    for (let i = 0; i < 3; i++) box(seam, side * (1.7 + i * 1.25), 0.1, 0.85 + i * 0.19, 0.035, 0.025, 1.45 - i * 0.15, side * 0.1);
    box(seam, side * 1.18, 0.24, -0.3, 0.06, 0.55, 2.7);
    box(bright, side * 0.88, 1.23, 4.3, 0.08, 1.4, 0.09);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 8, 6), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff4355 : 0x71ffb1 }));
    lamp.position.set(side * span * 0.94 * s, 0.13 * s, 2 * s); jet.add(lamp);
    // Underwing stores make the silhouette read as an armed aircraft.
    const store = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 2.8 * s, 8), bright);
    store.rotation.x = Math.PI / 2; store.position.set(side * 2.8 * s, -0.38 * s, 0.55 * s); jet.add(store);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15 * s, 0.65 * s, 8), bright);
    tip.rotation.x = -Math.PI / 2; tip.position.set(side * 2.8 * s, -0.38 * s, -1.15 * s); jet.add(tip);
  }
  for (let i = 0; i < 5; i++) box(seam, 0, 1.04, -0.3 + i * 0.8, 1.2, 0.025, 0.035);
  const exhaust = new THREE.Mesh(new THREE.TorusGeometry(0.71 * s, 0.075 * s, 6, 20), bright);
  exhaust.position.z = 6.35 * s; jet.add(exhaust);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.4 * s, 3.4 * s, 10), new THREE.MeshBasicMaterial({ color: 0xd9f5ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.rotation.x = -Math.PI / 2; core.position.z = 7.9 * s; core.name = 'flameCore'; jet.add(core);
}

export function addAtmosphere(scene: THREE.Scene, quality: 'high' | 'standard' | 'low'): THREE.Texture[] {
  const cloud = cloudSprite();
  const cloudMat = new THREE.SpriteMaterial({ map: cloud, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const count = quality === 'high' ? 75 : quality === 'standard' ? 35 : 14;
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 7600, z = (Math.random() - 0.5) * 7600, y = 500 + Math.random() * 1300;
    const size = 380 + Math.random() * 650;
    const puff = new THREE.Sprite(cloudMat); puff.position.set(x, y, z); puff.scale.set(size * 1.9, size, 1); scene.add(puff);
    if (quality === 'high') {
      const upper = new THREE.Sprite(cloudMat); upper.position.set(x + size * 0.24, y + size * 0.2, z - size * 0.18); upper.scale.set(size * 1.2, size * 0.72, 1); scene.add(upper);
    }
  }
  // Instanced vegetation adds scale and texture to the existing terrain mesh.
  const n = quality === 'high' ? 1000 : quality === 'standard' ? 420 : 120;
  const trunkGeo = new THREE.CylinderGeometry(2, 4, 24, 5), foliageGeo = new THREE.ConeGeometry(15, 42, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x665442, roughness: 1 }), n);
  const foliage = new THREE.InstancedMesh(foliageGeo, new THREE.MeshStandardMaterial({ color: 0x345d43, roughness: 0.95 }), n);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), scale = new THREE.Vector3(), p = new THREE.Vector3(), color = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < n * 35 && placed < n; i++) {
    const x = (Math.random() - 0.5) * 7000, z = (Math.random() - 0.5) * 7000, y = terrainY(x, z);
    if (y < 32 || y > 145) continue;
    const size = 0.7 + Math.random() * 1.4;
    scale.setScalar(size); p.set(x, y + 12 * size, z); matrix.compose(p, q, scale); trunks.setMatrixAt(placed, matrix);
    p.y = y + 37 * size; matrix.compose(p, q, scale); foliage.setMatrixAt(placed, matrix);
    color.setHSL(0.29 + Math.random() * 0.08, 0.28 + Math.random() * 0.18, 0.21 + Math.random() * 0.12); foliage.setColorAt(placed, color); placed++;
  }
  trunks.count = foliage.count = placed; trunks.castShadow = foliage.castShadow = quality === 'high'; scene.add(trunks, foliage);
  return [cloud];
}
