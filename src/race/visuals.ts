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
  const dark = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.62, metalness: 0.42 });
  const trim = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0xc4b39a, roughness: 0.38, metalness: 0.55 });
  const glow = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: 0xffb15a, toneMapped: false });
  const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 192;
  const ctx = signCanvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#16191e'; ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = '#e7d3b0'; ctx.fillRect(0, 0, 512, 8);
    ctx.fillStyle = '#c4553a'; ctx.fillRect(18, 28, 8, 136);
    ctx.fillStyle = '#f4efe6'; ctx.font = 'italic 800 64px sans-serif'; ctx.fillText('SPEED', 44, 90);
    ctx.fillStyle = '#e7b56a'; ctx.font = 'italic 800 58px sans-serif'; ctx.fillText('RUSH', 44, 152);
    ctx.strokeStyle = 'rgba(244,239,230,.22)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(360 + i * 28, 36); ctx.lineTo(328 + i * 28, 156); ctx.stroke(); }
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
  const crowdCanvas = document.createElement('canvas'); crowdCanvas.width = 256; crowdCanvas.height = 16;
  const cg = crowdCanvas.getContext('2d');
  if (cg) { // 객석: 줄지어 앉은 관중(머리·상의 색 점)과 좌석 등받이
    cg.fillStyle = '#5c4036'; cg.fillRect(0, 0, 256, 16);
    cg.fillStyle = '#3a2a24'; cg.fillRect(0, 0, 256, 3);
    const tops = ['#e8e6df', '#d9a23a', '#2f6fd0', '#c23b3b', '#58d8ee', '#2a2f3a'], skins = ['#e2b48c', '#c68c64', '#8d5a3b', '#f0c8a0'];
    for (let x = 3; x < 256; x += 8) {
      cg.fillStyle = tops[(x * 7 + (x >> 3)) % tops.length]; cg.fillRect(x, 6, 6, 10);
      cg.fillStyle = skins[(x >> 3) % skins.length]; cg.beginPath(); cg.arc(x + 3, 4, 2.6, 0, 7); cg.fill();
    }
    cg.fillStyle = 'rgba(0,0,0,.3)'; cg.fillRect(0, 13, 256, 3);
  }
  const crowdTex = new THREE.CanvasTexture(crowdCanvas); crowdTex.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.BoxGeometry(11.7, 0.22, 0.72), new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.75 }), seats);
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
