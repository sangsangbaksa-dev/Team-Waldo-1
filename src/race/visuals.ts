import * as THREE from 'three';
import type { Track } from './track';

type Placement = { x: number; y: number; z: number; angle: number; scale?: number };

/** Shared geometry keeps the extra track furniture inexpensive on long courses. */
export function addRaceScenery(scene: THREE.Scene, track: Track, quality: 'high' | 'standard' | 'low'): void {
  const panels: Placement[] = [], posts: Placement[] = [], lamps: Placement[] = [];
  const stands: Placement[] = [], seats: Placement[] = [], rails: Placement[] = [];
  const gatePosts: Placement[] = [], gateCaps: Placement[] = [], gateLights: Placement[] = [];
  const spacing = quality === 'low' ? 32 : 20;
  const at = (i: number, lateral: number, height: number): Placement => ({
    x: track.x[i] - track.tz[i] * lateral, y: track.y[i] + height,
    z: track.z[i] + track.tx[i] * lateral, angle: -Math.atan2(track.tz[i], track.tx[i]),
  });
  for (let i = 12; i < track.n; i += spacing) {
    for (const side of [-1, 1]) {
      const off = side * (track.halfWidth + 3.5);
      posts.push(at(i, off, 1.05));
      panels.push(at(i, off, 2.05));
      lamps.push(at(i, off, 2.85));
    }
  }
  if (quality !== 'low') {
    for (let i = 38; i < track.n; i += 100) {
      for (const side of [-1, 1]) {
        const off = side * (track.halfWidth + 12);
        const p = at(i, off, 1.6); stands.push(p);
        for (let row = 0; row < 4; row++) {
          seats.push(at(i, off + side * (row * 1.15 - 1.7), 2.25 + row * 0.55));
        }
        rails.push(at(i, off - side * 3, 2.5));
      }
    }
    for (let i = 70; i < track.n; i += 145) {
      for (const side of [-1, 1]) {
        gatePosts.push(at(i, side * (track.halfWidth + 3), 4.5));
        gateLights.push(at(i, side * (track.halfWidth + 2.85), 4.5));
      }
      gateCaps.push(at(i, 0, 9));
    }
  }
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, list: Placement[]): void => {
    if (!list.length) { geometry.dispose(); material.dispose(); return; }
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    const transform = new THREE.Object3D();
    list.forEach((p, i) => {
      transform.position.set(p.x, p.y, p.z); transform.rotation.set(0, p.angle, 0);
      transform.scale.setScalar(p.scale ?? 1); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.computeBoundingSphere(); scene.add(mesh);
  };
  const dark = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0x202c39, roughness: 0.7, metalness: 0.35 });
  const trim = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0x8b9da5, roughness: 0.45, metalness: 0.65 });
  const glow = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: 0x69e7ff, toneMapped: false });
  const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 192;
  const ctx = signCanvas.getContext('2d');
  if (ctx) {
    const bg = ctx.createLinearGradient(0, 0, 512, 192);
    bg.addColorStop(0, '#101d30'); bg.addColorStop(0.58, '#183b51'); bg.addColorStop(1, '#121927');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = '#58d8ee'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 496, 176);
    ctx.fillStyle = '#ef694e'; ctx.fillRect(22, 25, 9, 142);
    ctx.fillStyle = '#f2f7f7'; ctx.font = 'italic 900 62px sans-serif'; ctx.fillText('SPEED', 48, 88);
    ctx.fillStyle = '#78e7f5'; ctx.font = 'italic 900 62px sans-serif'; ctx.fillText('RUSH', 48, 151);
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(350 + i * 26, 30); ctx.lineTo(310 + i * 26, 160); ctx.stroke(); }
  }
  const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
  const signFaces: Placement[] = [];
  for (let i = 12; i < track.n; i += spacing) for (const side of [-1, 1]) {
    const p = at(i, side * (track.halfWidth + 3.32), 2.05);
    p.angle += Math.PI / 2; signFaces.push(p);
  }
  add(new THREE.BoxGeometry(0.18, 2.1, 0.18), dark(), posts);
  add(new THREE.BoxGeometry(0.3, 1.35, 3.8), new THREE.MeshStandardMaterial({ color: 0x142b3a, roughness: 0.45, metalness: 0.35 }), panels);
  add(new THREE.PlaneGeometry(3.6, 1.2), signMaterial, signFaces);
  add(new THREE.BoxGeometry(0.34, 0.09, 3.8), glow(), lamps);
  add(new THREE.BoxGeometry(12, 2.7, 6), dark(), stands);
  add(new THREE.BoxGeometry(11.7, 0.22, 0.72), new THREE.MeshStandardMaterial({ color: 0xc95343, roughness: 0.7 }), seats);
  add(new THREE.BoxGeometry(12, 0.12, 0.12), trim(), rails);
  add(new THREE.BoxGeometry(0.8, 9, 0.8), dark(), gatePosts);
  add(new THREE.BoxGeometry(1.1, 0.8, track.halfWidth * 2 + 6.8), dark(), gateCaps);
  add(new THREE.BoxGeometry(0.9, 8.1, 0.12), glow(), gateLights);
}

/** Decorative spinning wheel faces sit outside the baked model's tire sidewalls. */
export function makeWheelDetails(): { group: THREE.Group; wheels: THREE.Group[] } {
  const group = new THREE.Group(), wheels: THREE.Group[] = [];
  const rim = new THREE.MeshStandardMaterial({ color: 0xa5b3bd, metalness: 0.9, roughness: 0.25 });
  const inset = new THREE.MeshStandardMaterial({ color: 0x18232d, metalness: 0.65, roughness: 0.38 });
  const disc = new THREE.CylinderGeometry(0.25, 0.25, 0.035, 20);
  const hub = new THREE.CylinderGeometry(0.055, 0.055, 0.06, 12);
  const spoke = new THREE.BoxGeometry(0.055, 0.32, 0.035);
  for (const x of [-1.45, 1.45]) for (const side of [-1, 1]) {
    const wheel = new THREE.Group(); wheel.position.set(x, 0.42, side * 1.03);
    const face = new THREE.Mesh(disc, inset); face.rotation.x = Math.PI / 2; wheel.add(face);
    const center = new THREE.Mesh(hub, rim); center.rotation.x = Math.PI / 2; center.position.z = side * 0.03; wheel.add(center);
    for (let n = 0; n < 5; n++) {
      const blade = new THREE.Mesh(spoke, rim); blade.rotation.z = n * Math.PI * 2 / 5;
      blade.position.z = side * 0.025; wheel.add(blade);
    }
    group.add(wheel); wheels.push(wheel);
  }
  return { group, wheels };
}
