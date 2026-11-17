// FRONTLINE 롤식 라인전 — 맵 장식: 하늘, 기지 단상, 길 가장자리 돌, 수풀, 드래곤·군주 구덩이, 정글 둥지 표식, 흐르는 강, 떠다니는 빛 알갱이.
import * as THREE from 'three';
import { LANE_PTS, LANES, NEXUS, RIVER, RIVER_CAMPS, SIZE, type Pt } from './config';
import type { MobaMap } from './map';

const rng = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const std = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true, ...o });

/** 길 위에서 일정 간격으로 점과 진행 방향을 뽑습니다. */
function sample(pts: Pt[], step: number): Array<{ x: number; y: number; nx: number; ny: number }> {
  const out: Array<{ x: number; y: number; nx: number; ny: number }> = []; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1; let d = carry;
    for (; d < len; d += step) out.push({ x: a.x + dx / len * d, y: a.y + dy / len * d, nx: -dy / len, ny: dx / len }); carry = d - len;
  }
  return out;
}

export interface Scenery { update(dt: number, t: number): void; group: THREE.Group }

export function buildScenery(scene: THREE.Scene, map: MobaMap, shadows: boolean, low: boolean): Scenery {
  const group = new THREE.Group(), r = rng(77); scene.add(group);
  // 하늘: 위는 짙은 파랑, 지평선은 따뜻한 빛
  const sk = document.createElement('canvas'); sk.width = 4; sk.height = 256; const sg = sk.getContext('2d')!, gr = sg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#3f6aa8'); gr.addColorStop(0.45, '#8fb6d8'); gr.addColorStop(0.62, '#e8d6b0'); gr.addColorStop(1, '#b7c7a8'); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 256);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sk), side: THREE.BackSide, fog: false, depthWrite: false })); sky.position.set(SIZE / 2, 0, SIZE / 2); sky.renderOrder = -10; group.add(sky);

  // 기지 단상: 팔각 돌판, 진영 색 안쪽 고리, 모서리 수정 기둥
  NEXUS.forEach((b, t) => {
    const c = t === 0 ? 0x4aa8ff : 0xff6a4a, plat = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 12.2, 0.34, 8), std(t === 0 ? 0x7d8794 : 0x8c807b, { roughness: 0.85 })); plat.position.set(b.x, 0.17, b.y); plat.receiveShadow = true; group.add(plat);
    const inlay = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.8, 40), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); inlay.rotation.x = -Math.PI / 2; inlay.position.set(b.x, 0.36, b.y); group.add(inlay);
    const inner = new THREE.Mesh(new THREE.RingGeometry(8.6, 8.9, 40), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); inner.rotation.x = -Math.PI / 2; inner.position.set(b.x, 0.36, b.y); group.add(inner);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = b.x + Math.cos(a) * 10.3, y = b.y + Math.sin(a) * 10.3, p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), std(0x59595f)); p.position.set(x, 1.3, y); p.castShadow = shadows; const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3, flatShading: true })); g.position.set(x, 2.85, y); g.scale.y = 1.4; group.add(p, g); }
  });

  // 길 가장자리 돌: 길 양옆에 낮은 돌을 흩뿌려 길을 또렷하게
  const edgeCount = low ? 260 : 620, stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), std(0x8a8678), edgeCount), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(); let si = 0;
  const nearBase = (x: number, y: number): boolean => NEXUS.some(b => Math.hypot(b.x - x, b.y - y) < 13);
  for (const l of LANES) for (const s of sample(LANE_PTS[l], 2.1)) for (const side of [-1, 1]) {
    if (si >= edgeCount) break; const off = 4.45 + r() * 0.5, x = s.x + s.nx * off * side + (r() - 0.5) * 0.6, y = s.y + s.ny * off * side + (r() - 0.5) * 0.6; if (nearBase(x, y) || r() < 0.3) continue;
    const k = 0.22 + r() * 0.3; e.set(r() * 3, r() * 6, r() * 3); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, k * 0.45, y), q, new THREE.Vector3(k * 1.3, k * 0.8, k)); stones.setMatrixAt(si, m4); col.setHSL(0.1, 0.06, 0.38 + r() * 0.16); stones.setColorAt(si++, col);
  }
  stones.count = si; stones.castShadow = shadows; stones.instanceMatrix.needsUpdate = true; if (stones.instanceColor) stones.instanceColor.needsUpdate = true; group.add(stones);

  // 수풀: 길 옆 곳곳의 풀 무더기
  const bushCount = low ? 90 : 220, bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std(0x3f7a38, { roughness: 1 }), bushCount); let bi = 0;
  for (const l of LANES) for (const s of sample(LANE_PTS[l], 6.5)) for (const side of [-1, 1]) {
    if (r() < 0.5) continue; const bx = s.x + s.nx * (6.2 + r() * 1.6) * side, by = s.y + s.ny * (6.2 + r() * 1.6) * side; if (nearBase(bx, by)) continue;
    for (let n = 0; n < 3 && bi < bushCount; n++) { const k = 0.5 + r() * 0.45; m4.compose(new THREE.Vector3(bx + (r() - 0.5) * 2, k * 0.5, by + (r() - 0.5) * 2), new THREE.Quaternion(), new THREE.Vector3(k * 1.2, k * 0.8, k * 1.2)); bush.setMatrixAt(bi, m4); col.setHSL(0.27 + r() * 0.07, 0.5, 0.26 + r() * 0.1); bush.setColorAt(bi++, col); }
  }
  bush.count = bi; bush.instanceMatrix.needsUpdate = true; if (bush.instanceColor) bush.instanceColor.needsUpdate = true; group.add(bush);

  // 드래곤·군주 구덩이: 돌 고리, 기둥, 불꽃
  const flames: THREE.Mesh[] = [];
  for (const c of RIVER_CAMPS) {
    const tint = c.id === 'drake' ? 0xff7a2a : 0xb06aff, pit = new THREE.Mesh(new THREE.CircleGeometry(5.2, 28), new THREE.MeshStandardMaterial({ color: c.id === 'drake' ? 0x3a2a24 : 0x2a2038, roughness: 1 })); pit.rotation.x = -Math.PI / 2; pit.position.set(c.at.x, 0.07, c.at.y); group.add(pit);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.45, 5, 18), std(0x6a665e)); ring.rotation.x = Math.PI / 2; ring.position.set(c.at.x, 0.3, c.at.y); ring.castShadow = shadows; group.add(ring);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = c.at.x + Math.cos(a) * 5.3, y = c.at.y + Math.sin(a) * 5.3, p = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.45, 2.2, 6), std(0x58544d)); p.position.set(x, 1.1, y); p.castShadow = shadows; const f = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 6), new THREE.MeshBasicMaterial({ color: tint })); f.position.set(x, 2.65, y); flames.push(f); group.add(p, f); }
  }
  // 정글 둥지 표식: 돌 고리와 희미한 빛
  for (const c of map.camps) { if (c.id === 'drake' || c.id === 'baron') continue; const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 24), new THREE.MeshBasicMaterial({ color: 0xe8d9a0, transparent: true, opacity: 0.4, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(c.at.x, 0.09, c.at.y); group.add(ring); }

  // 흐르는 강: 강 위에 물결 무늬가 흐르는 띠
  const rc = document.createElement('canvas'); rc.width = 128; rc.height = 64; const rg = rc.getContext('2d')!; rg.fillStyle = '#4fa8c8'; rg.fillRect(0, 0, 128, 64); rg.strokeStyle = 'rgba(255,255,255,.55)'; rg.lineWidth = 2; const rr = rng(5);
  for (let i = 0; i < 14; i++) { const x = rr() * 128, y = rr() * 64; rg.beginPath(); rg.moveTo(x, y); rg.quadraticCurveTo(x + 14, y - 5, x + 30, y); rg.stroke(); }
  const rt = new THREE.CanvasTexture(rc); rt.wrapS = rt.wrapT = THREE.RepeatWrapping; rt.colorSpace = THREE.SRGBColorSpace;
  const pos: number[] = [], uv: number[] = [], idx: number[] = []; let acc = 0; const half = 2.7;
  RIVER.forEach((p, i) => { const a = RIVER[Math.max(0, i - 1)], b = RIVER[Math.min(RIVER.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; if (i) acc += Math.hypot(p.x - RIVER[i - 1].x, p.y - RIVER[i - 1].y); pos.push(p.x + nx * half, 0.06, p.y + ny * half, p.x - nx * half, 0.06, p.y - ny * half); uv.push(acc / 10, 0, acc / 10, 1); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
  const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rgeo.setIndex(idx); rgeo.computeVertexNormals();
  const water = new THREE.Mesh(rgeo, new THREE.MeshStandardMaterial({ map: rt, transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide })); water.receiveShadow = true; group.add(water);

  // 떠다니는 빛 알갱이
  const moteN = low ? 40 : 110, mp = new Float32Array(moteN * 3); for (let i = 0; i < moteN; i++) { mp[i * 3] = r() * SIZE; mp[i * 3 + 1] = 0.6 + r() * 5; mp[i * 3 + 2] = r() * SIZE; }
  const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(mp, 3)), new THREE.PointsMaterial({ color: 0xfff0c0, size: 0.18, transparent: true, opacity: 0.7, depthWrite: false })); group.add(motes);

  return {
    group,
    update(dt: number, t: number): void {
      rt.offset.x -= dt * 0.08; flames.forEach((f, i) => { f.scale.setScalar(0.85 + Math.sin(t * 9 + i * 1.7) * 0.2); f.position.y = 2.65 + Math.sin(t * 7 + i) * 0.06; });
      const a = motes.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < moteN; i++) { a.setY(i, 0.6 + ((mp[i * 3 + 1] - 0.6 + dt * (0.15 + (i % 5) * 0.05)) % 5)); mp[i * 3 + 1] = a.getY(i); a.setX(i, mp[i * 3] + Math.sin(t * 0.6 + i) * 0.4); } a.needsUpdate = true;
    },
  };
}
