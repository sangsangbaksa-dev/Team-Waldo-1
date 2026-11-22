import * as THREE from 'three';

type Quality = 'high' | 'standard' | 'low';

// Reused geometry keeps the extra silhouette detail inexpensive on crowded bases.
const panelGeo = new THREE.BoxGeometry(1, 1, 1);
const boltGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.035, 6);
const ventGeo = new THREE.BoxGeometry(1, 1, 1);
const haloGeo = new THREE.RingGeometry(0.55, 1, 32);
const metal = new THREE.MeshStandardMaterial({ color: 0x343e47, metalness: 0.65, roughness: 0.55 });
const edge = new THREE.MeshStandardMaterial({ color: 0x9daeb6, metalness: 0.7, roughness: 0.38 });
const recess = new THREE.MeshStandardMaterial({ color: 0x1c2930, metalness: 0.4, roughness: 0.78 });
const crystalHalo = new THREE.MeshBasicMaterial({ color: 0x35caff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

function panel(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const mesh = new THREE.Mesh(panelGeo, material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh);
  return mesh;
}

/** Small architectural details are local to the model, so construction scaling still applies. */
export function detailBuilding(root: THREE.Group, size: number, team: number, quality: Quality): void {
  const trim = new THREE.MeshStandardMaterial({ color: team, emissive: team, emissiveIntensity: 0.32, metalness: 0.52, roughness: 0.42 });
  const half = size / 2, wall = half - 0.05;
  for (const side of [-1, 1]) {
    panel(root, metal, 0, 0.19, side * wall, size - 0.25, 0.16, 0.1);
    panel(root, trim, 0, 0.31, side * (wall + 0.055), size - 0.45, 0.035, 0.035);
    panel(root, metal, side * wall, 0.19, 0, 0.1, 0.16, size - 0.25);
    panel(root, trim, side * (wall + 0.055), 0.31, 0, 0.035, 0.035, size - 0.45);
    for (const x of [-1, 1]) {
      const px = x * (half - 0.25), pz = side * (half - 0.25);
      panel(root, edge, px, 0.35, pz, 0.16, 0.52, 0.16);
      panel(root, trim, px, 0.64, pz, 0.2, 0.06, 0.2);
      if (quality !== 'low') {
        const bolt = new THREE.Mesh(boltGeo, edge); bolt.position.set(px, 0.72, pz); root.add(bolt);
      }
    }
  }
  // Recessed ventilation and repeated slats make the large walls read as machinery.
  if (size >= 3) {
    for (const side of [-1, 1]) {
      panel(root, recess, side * (half - 0.38), 0.78, 0, 0.06, 0.56, size * 0.36);
      for (let i = 0; i < 5; i++) {
        const slat = new THREE.Mesh(ventGeo, edge);
        slat.position.set(side * (half - 0.34), 0.58 + i * 0.095, 0);
        slat.scale.set(0.05, 0.035, size * 0.34); root.add(slat);
      }
    }
  }
}

export function detailCrystal(root: THREE.Group, quality: Quality): void {
  const halo = new THREE.Mesh(haloGeo, crystalHalo); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.035; halo.scale.setScalar(1.3); root.add(halo);
  if (quality === 'low') return;
  const shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: 0x9eefff, emissive: 0x1c9ed8, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.25 }), quality === 'high' ? 9 : 5);
  const transform = new THREE.Object3D();
  for (let i = 0; i < shards.count; i++) {
    const a = i * 2.399, r = 0.55 + (i % 3) * 0.13;
    transform.position.set(Math.cos(a) * r, 0.12 + (i % 2) * 0.06, Math.sin(a) * r);
    transform.rotation.set(0.2 * Math.sin(a), a, 0.3 * Math.cos(a)); transform.scale.set(1, 1.7 + (i % 3) * 0.4, 1); transform.updateMatrix(); shards.setMatrixAt(i, transform.matrix);
  }
  root.add(shards);
}

/** Procedural dust, scratches and pebbles are baked once into the terrain texture. */
export function paintTerrainDetail(g: CanvasRenderingContext2D, width: number, quality: Quality): void {
  let seed = 77217; const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const count = quality === 'high' ? 11000 : quality === 'standard' ? 5500 : 2400;
  for (let i = 0; i < count; i++) {
    const x = rnd() * width, y = rnd() * width, r = 0.3 + rnd() * 1.7;
    g.fillStyle = i % 3 === 0 ? 'rgba(255,233,181,.18)' : 'rgba(75,51,34,.13)';
    g.beginPath(); g.ellipse(x, y, r * (1 + rnd()), r * 0.45, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  g.lineWidth = 0.8;
  for (let i = 0; i < count / 35; i++) {
    const x = rnd() * width, y = rnd() * width, length = 5 + rnd() * 23;
    g.strokeStyle = 'rgba(91,64,40,.16)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + length * 0.45, y + length * 0.14); g.lineTo(x + length, y + length * 0.06); g.stroke();
  }
}

/** 손으로 그린 듯한 회색조 암석 질감(인스턴스 색과 곱해져 색조는 인스턴스가 정함). strata=가로 지층 줄무늬. */
export function stoneTexture(strata: boolean, seed = 11): THREE.CanvasTexture {
  const w = 128, h = strata ? 256 : 128, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; let s = seed; const r = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, w, h);
  if (strata) for (let y = 0; y < h;) { const bh = 6 + r() * 18; g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,30,20'},${0.08 + r() * 0.2})`; g.fillRect(0, y, w, bh); g.fillStyle = 'rgba(30,20,10,.28)'; g.fillRect(0, y, w, 1.5); y += bh; }
  for (let i = 0; i < (strata ? 70 : 260); i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.12})`; const x = r() * w, y = r() * h; if (strata) g.fillRect(x, y, 1 + r() * 2, 8 + r() * 40); else { g.beginPath(); g.arc(x, y, 1 + r() * 4, 0, 6.283); g.fill(); } }
  g.strokeStyle = 'rgba(20,14,8,.35)'; g.lineWidth = 1;
  for (let i = 0; i < (strata ? 9 : 7); i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 22; y += strata ? 8 + r() * 14 : (r() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

/** Soft painted sprites for explosions, smoke and scorch marks (white-hot core fading to transparent); built once per kind. */
const softCache = new Map<string, THREE.CanvasTexture>();
export function softTex(kind: 'fire' | 'smoke' | 'scorch' | 'spark'): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const hit = softCache.get(kind); if (hit) return hit;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); if (!g) return null;
  const stops: Record<string, Array<[number, string]>> = {
    fire: [[0, 'rgba(255,250,225,1)'], [0.25, 'rgba(255,196,96,.95)'], [0.55, 'rgba(255,110,30,.55)'], [1, 'rgba(120,30,0,0)']],
    smoke: [[0, 'rgba(70,64,58,.85)'], [0.6, 'rgba(48,44,40,.45)'], [1, 'rgba(30,28,26,0)']],
    scorch: [[0, 'rgba(14,10,7,.8)'], [0.55, 'rgba(24,17,11,.45)'], [1, 'rgba(30,22,14,0)']],
    spark: [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,236,170,.7)'], [1, 'rgba(255,200,100,0)']],
  };
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); for (const [o, col] of stops[kind]) rg.addColorStop(o, col);
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  if (kind === 'smoke' || kind === 'scorch') { let seed = kind === 'smoke' ? 31 : 57; const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = 12 + rnd() * 26, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, q = 14 + rnd() * 14, b = g.createRadialGradient(x, y, 0, x, y, q); b.addColorStop(0, kind === 'smoke' ? 'rgba(80,72,64,.35)' : 'rgba(10,7,4,.4)'); b.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = b; g.fillRect(x - q, y - q, q * 2, q * 2); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; softCache.set(kind, t); return t;
}
