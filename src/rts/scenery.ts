// FRONTLINE — 맵 장식. 세 갈래 길(위·가운데·아래), 가운데를 가로지르는 얕은 강, 용·바론 둥지, 정글 캠프, 부쉬, 샘과 넥서스 크리스털 같은
// MOBA식 오브젝트를 3D 화면에만 얹습니다. 시뮬레이션·충돌·길찾기에는 아무 영향이 없고, 모두 180도 회전 대칭이라 어느 진영에도 유리하지 않습니다.
import * as THREE from 'three';
import { TEAM_COLORS } from './config';
import { Pather } from './path';
import type { Pt, RtsMap } from './map';
import { riverLine } from './terrain';

type Quality = 'high' | 'standard' | 'low';
const seeded = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const mirror = (n: number, p: Pt): Pt => ({ x: n - p.x, y: n - p.y });

/** 길찾기가 실제로 지나는 경로를 부드럽게 다듬어 길 모양으로 씁니다. */
function smooth(raw: number[], step = 1): Pt[] {
  let pts: Pt[] = []; for (let i = 0; i + 1 < raw.length; i += 2) pts.push({ x: raw[i], y: raw[i + 1] });
  for (let it = 0; it < 3; it++) {
    const out: Pt[] = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }); }
    out.push(pts[pts.length - 1]); pts = out;
  }
  const res: Pt[] = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = step - carry; d <= len; d += step) res.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
    carry = (carry + len) % step;
  }
  res.push(pts[pts.length - 1]);
  return res;
}

export interface Lanes { top: Pt[]; mid: Pt[]; bot: Pt[]; river: Pt[] }
/** 본부 사이 세 갈래 길(확장 기지를 지나는 위·아래 길과 가운데 길)과 가운데를 가로지르는 강의 중심선. */
export function buildLanes(map: RtsMap): Lanes {
  const n = map.size, pather = new Pather(n, map.terrain), a = map.starts[0], b = map.starts[1];
  const ca = { x: a.x + 2, y: a.y + 2 }, cb = { x: b.x + 2, y: b.y + 2 };
  const via = (m: Pt | null): Pt[] => {
    const wp = m ? [ca, m, cb] : [ca, cb], out: number[] = [ca.x, ca.y];
    for (let i = 0; i + 1 < wp.length; i++) { const s = pather.nearestFree(wp[i].x, wp[i].y), e = pather.nearestFree(wp[i + 1].x, wp[i + 1].y), p = s && e ? pather.find(s.x, s.y, e.x, e.y) : null; if (p) out.push(...p); }
    return out.length >= 4 ? smooth(out) : [ca, cb];
  };
  const ex = map.expansions, e0 = { x: ex[0].x + 2, y: ex[0].y + 2 }, e1 = ex[1] ? { x: ex[1].x + 2, y: ex[1].y + 2 } : mirror(n - 1, e0);
  // 강: 가운데 대각선을 살짝 휘게 그립니다. 끝은 두 확장 기지에서 떨어져 있고 180도 대칭입니다.
  const river: Pt[] = riverLine();
  return { top: via(e0), mid: via(null), bot: via(e1), river };
}

/** 지형 텍스처에 길·강둑·부쉬 자리·샘 바닥을 그립니다(k = 텍스처 픽셀/칸). */
export function paintGround(g: CanvasRenderingContext2D, k: number, map: RtsMap, lanes: Lanes, bushes: Pt[]): void {
  const stroke = (pts: Pt[], w: number, color: string, alpha: number): void => {
    g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = w * k; g.lineJoin = g.lineCap = 'round';
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k))); g.stroke(); g.restore();
  };
  const rnd = seeded(99);
  for (const l of [lanes.top, lanes.bot, lanes.mid]) {
    stroke(l, 5.0, '#6a5636', 0.3); stroke(l, 3.7, '#6b665e', 0.92); stroke(l, 3.1, '#7a746a', 0.55);
    for (let i = 0; i < l.length; i += 1) { const p = l[i]; for (let j = 0; j < 3; j++) { g.globalAlpha = 0.45; g.fillStyle = rnd() < 0.5 ? '#4f4c47' : '#948c7c'; g.beginPath(); g.arc((p.x + (rnd() - 0.5) * 3.4) * k, (p.y + (rnd() - 0.5) * 3.4) * k, (0.08 + rnd() * 0.14) * k, 0, Math.PI * 2); g.fill(); } }
  }
  g.globalAlpha = 1;
  for (const l of [lanes.top, lanes.bot, lanes.mid]) { g.save(); g.setLineDash([1.6 * k, 2.2 * k]); stroke(l, 0.16, '#e5c14a', 0.55); g.restore(); }
  // 강둑: 젖은 흙색 띠. 물 자체는 3D 리본이 그립니다.
  stroke(lanes.river, 9.0, '#9a7d4e', 0.55); stroke(lanes.river, 6.6, '#7e6a45', 0.5);
  // 부쉬 자리는 짙은 풀색 바닥.
  for (const b of bushes) { const gr = g.createRadialGradient(b.x * k, b.y * k, 0.4 * k, b.x * k, b.y * k, 3.3 * k); gr.addColorStop(0, 'rgba(104,92,50,.7)'); gr.addColorStop(1, 'rgba(104,92,50,0)'); g.fillStyle = gr; g.beginPath(); g.arc(b.x * k, b.y * k, 3.3 * k, 0, Math.PI * 2); g.fill(); }
  // 샘(본부 뒤 광장): 돌바닥 원 두 겹.
  for (const f of fountains(map)) { const gr = g.createRadialGradient(f.x * k, f.y * k, 1 * k, f.x * k, f.y * k, 6 * k); gr.addColorStop(0, 'rgba(176,182,190,.95)'); gr.addColorStop(0.7, 'rgba(140,146,152,.8)'); gr.addColorStop(1, 'rgba(140,146,152,0)'); g.fillStyle = gr; g.beginPath(); g.arc(f.x * k, f.y * k, 6 * k, 0, Math.PI * 2); g.fill(); }
}

const blockedNear = (map: RtsMap, x: number, y: number, r: number): boolean => {
  const n = map.size; for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) if (i < 0 || j < 0 || i >= n || j >= n || (map.terrain[j * n + i] && (i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= (r + 0.7) ** 2)) return true;
  return false;
};
const nearNode = (map: RtsMap, x: number, y: number, r: number): boolean => map.nodes.some(p => Math.hypot(p.x + 0.5 - x, p.y + 0.5 - y) < r);

/** 본부 뒤쪽 구석에서 광물·바위와 떨어진 자리를 찾아 샘 위치로 씁니다(두 진영이 대칭). */
export function fountains(map: RtsMap): [Pt, Pt] {
  const n = map.size; let best: Pt = { x: 8, y: n - 9 }, score = -1;
  for (let y = n / 2; y < n - 3; y += 1) for (let x = 3; x < n / 2; x += 1) {
    if (blockedNear(map, x, y, 3.4) || nearNode(map, x, y, 7.5)) continue;
    const s = -Math.hypot(x - 4, y - (n - 5)) * 1.0 + Math.min(...map.nodes.map(p => Math.hypot(p.x - x, p.y - y))) * 0.3; if (score < 0 || s > score) { score = s; best = { x, y }; }
  }
  return [best, mirror(n - 1, best)];
}

/** 부쉬 자리: 길과 강 가장자리에서 한 겹 떨어진 곳(한쪽 절반을 고르고 반대편은 회전). */
export function bushSpots(map: RtsMap, lanes: Lanes): Pt[] {
  const n = map.size, rnd = seeded(31), half: Pt[] = [], all = [...lanes.top, ...lanes.mid, ...lanes.bot];
  const sample = (pts: Pt[], every: number, off: number): void => {
    for (let i = every; i + 1 < pts.length; i += every) {
      const a = pts[i - 1], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l, side = rnd() < 0.5 ? 1 : -1;
      const p = { x: pts[i].x + nx * off * side, y: pts[i].y + ny * off * side };
      if (p.x + p.y > n - 1 || blockedNear(map, p.x, p.y, 1.2) || nearNode(map, p.x, p.y, 4) || map.starts.some(s => Math.hypot(s.x + 2 - p.x, s.y + 2 - p.y) < 11)) continue;
      if (half.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 6)) continue;
      half.push(p);
    }
  };
  sample(lanes.top, 11, 3.6); sample(lanes.mid, 13, 3.8); sample(lanes.bot, 11, 3.6);
  const riverHalf = lanes.river.filter(p => p.x + p.y <= n - 1);
  sample(riverHalf, 8, 5.2);
  void all; return [...half, ...half.map(p => mirror(n - 1, p))];
}

export class Scenery {
  private tick: Array<(t: number) => void> = []; private flameMat: THREE.MeshStandardMaterial;
  constructor(private scene: THREE.Scene, private map: RtsMap, private lanes: Lanes, private bushes: Pt[], private quality: Quality, private shadows: boolean) {
    this.flameMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a1c, emissiveIntensity: 2.2, roughness: 0.4, flatShading: true });
    this.river(); this.pits(); this.brush(); this.torches(); this.bases();
  }
  update(t: number): void { for (const f of this.tick) f(t); }

  // ---------- 강 ----------
  private river(): void {
    const pts = this.lanes.river, w = 4.6, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
      const t = i / (pts.length - 1), wid = w * (0.55 + 0.45 * Math.sin(t * Math.PI)); // 양끝은 좁아집니다
      pos.push(p.x + nx * wid, 0.07, p.y + ny * wid, p.x - nx * wid, 0.07, p.y - ny * wid); uv.push(0, i * 0.35, 1, i * 0.35);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d')!, rnd = seeded(8);
    const grd = g.createLinearGradient(0, 0, 128, 0); grd.addColorStop(0, 'rgba(96,140,120,0)'); grd.addColorStop(0.18, 'rgba(104,152,128,.8)'); grd.addColorStop(0.5, 'rgba(72,118,112,.92)'); grd.addColorStop(0.82, 'rgba(104,152,128,.8)'); grd.addColorStop(1, 'rgba(96,140,120,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(220,245,255,.55)'; g.lineWidth = 2; for (let i = 0; i < 26; i++) { const x = 24 + rnd() * 80, y = rnd() * 256, l = 10 + rnd() * 22; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y + l / 2, x - 2, y + l); g.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.15, metalness: 0.1, emissive: 0x153c36, emissiveIntensity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1; this.scene.add(mesh); this.tick.push(t => { tex.offset.y = -t * 0.06; mat.emissiveIntensity = 0.5 + 0.08 * Math.sin(t * 1.3); });
    // 강가 돌멩이와 갈대
    const rnd2 = seeded(21), stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0x8d8d86, roughness: 0.9, flatShading: true }), 90); const m4 = new THREE.Matrix4(); let n = 0;
    for (let i = 0; i < 45; i++) {
      const p = pts[Math.floor(rnd2() * pts.length)], a = rnd2() * 6.28, d = 2.6 + rnd2() * 2.2, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      for (const q of [{ x, y }, mirror(this.map.size - 1, { x, y })]) { if (blockedNear(this.map, q.x, q.y, 0.4)) continue; const s = 0.5 + rnd2() * 0.9; m4.compose(new THREE.Vector3(q.x, 0.12 * s, q.y), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd2() * 3, rnd2() * 6, 0)), new THREE.Vector3(s * 1.2, s * 0.6, s)); stones.setMatrixAt(n++, m4); }
    }
    stones.count = n; stones.castShadow = false; stones.receiveShadow = true; this.scene.add(stones);
  }

  // ---------- 용·바론 둥지 ----------
  private pits(): void {
    const r = this.lanes.river, mid = r[Math.floor(r.length / 2)], n = this.map.size - 1;
    const dir = { x: r[r.length - 1].x - r[0].x, y: r[r.length - 1].y - r[0].y }, l = Math.hypot(dir.x, dir.y), ux = dir.x / l, uy = dir.y / l;
    const spots = [{ x: mid.x - ux * 15, y: mid.y - uy * 15, color: 0xff7a3a, name: 'drake' }, { x: mid.x + ux * 15, y: mid.y + uy * 15, color: 0xb36bff, name: 'baron' }];
    void n;
    for (const s of spots) {
      const g = new THREE.Group(), stone = new THREE.MeshStandardMaterial({ color: 0xa08c6a, roughness: 0.95, flatShading: true }), dark = new THREE.MeshStandardMaterial({ color: 0x1b1814, roughness: 1 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.55, 6, 18), stone); ring.rotation.x = Math.PI / 2; ring.position.y = 0.45; ring.castShadow = this.shadows; ring.receiveShadow = true; g.add(ring);
      const pit = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), dark); pit.rotation.x = -Math.PI / 2; pit.position.y = 0.09; g.add(pit);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, st = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6 + (i % 2) * 0.9, 0.7), stone); st.position.set(Math.cos(a) * 3.6, 1.3 + (i % 2) * 0.45, Math.sin(a) * 3.6); st.rotation.set(0, a, (i % 3 - 1) * 0.12); st.castShadow = this.shadows; g.add(st); }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 1.8, roughness: 0.25, flatShading: true })); gem.position.y = 1.7; gem.scale.y = 1.5; g.add(gem);
      const haze = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.04, 20), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.35, depthWrite: false })); haze.position.y = 0.12; g.add(haze);
      if (s.name === 'baron') for (let i = 0; i < 3; i++) { const a = i * 2.09, sp = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.5, 5), stone); sp.position.set(Math.cos(a) * 1.3, 0.75, Math.sin(a) * 1.3); sp.rotation.z = Math.cos(a) * 0.35; sp.rotation.x = Math.sin(a) * 0.35; g.add(sp); }
      g.position.set(s.x, 0, s.y); this.scene.add(g); const mat = gem.material as THREE.MeshStandardMaterial, hm = haze.material as THREE.MeshBasicMaterial;
      this.tick.push(t => { gem.rotation.y = t * 0.9; gem.position.y = 1.7 + Math.sin(t * 1.6) * 0.18; mat.emissiveIntensity = 1.5 + Math.sin(t * 2.2) * 0.5; hm.opacity = 0.3 + Math.sin(t * 2.2) * 0.08; });
    }
  }

  // ---------- 부쉬 ----------
  private brush(): void {
    const per = this.quality === 'low' ? 5 : 9, leaf = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 0), leaf, this.bushes.length * per);
    const rnd = seeded(77), m4 = new THREE.Matrix4(), col = new THREE.Color(); let n = 0;
    for (const b of this.bushes) for (let i = 0; i < per; i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 2.1, x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d; if (blockedNear(this.map, x, y, 0.2)) continue;
      const s = 0.7 + rnd() * 0.5; m4.compose(new THREE.Vector3(x, 0.38 * s, y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(s * 1.15, s * 0.8, s * 1.15));
      inst.setMatrixAt(n, m4); col.setHSL(0.13 + rnd() * 0.05, 0.34, 0.2 + rnd() * 0.1); inst.setColorAt(n++, col);
    }
    inst.count = n; inst.castShadow = false; inst.receiveShadow = true; this.scene.add(inst);
  }

  // ---------- 길가 횃불 기둥 ----------
  private torches(): void {
    const n = this.map.size - 1, spots: Pt[] = [];
    for (const [pts, every, off] of [[this.lanes.top, 12, 2.9], [this.lanes.mid, 12, 3.1], [this.lanes.bot, 12, 2.9]] as const) {
      for (let i = every; i + 1 < pts.length; i += every) {
        const a = pts[i - 1], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l, side = (i / every) % 2 ? 1 : -1;
        const p = { x: pts[i].x + nx * off * side, y: pts[i].y + ny * off * side };
        if (p.x + p.y > n || blockedNear(this.map, p.x, p.y, 0.9) || nearNode(this.map, p.x, p.y, 3) || this.map.starts.some(s => Math.hypot(s.x + 2 - p.x, s.y + 2 - p.y) < 8)) continue;
        if (spots.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 7)) continue; spots.push(p);
      }
    }
    const all = [...spots, ...spots.map(p => mirror(n, p))], pillar = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.9, flatShading: true }), all.length);
    const bowl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.26, 0.28, 7), new THREE.MeshStandardMaterial({ color: 0x2c2a27, roughness: 0.7, metalness: 0.3 }), all.length), flame = new THREE.InstancedMesh(new THREE.ConeGeometry(0.3, 0.8, 6), this.flameMat, all.length);
    const m4 = new THREE.Matrix4(); all.forEach((p, i) => { m4.makeTranslation(p.x, 0.8, p.y); pillar.setMatrixAt(i, m4); m4.makeTranslation(p.x, 1.74, p.y); bowl.setMatrixAt(i, m4); m4.makeTranslation(p.x, 2.2, p.y); flame.setMatrixAt(i, m4); });
    pillar.castShadow = this.shadows; this.scene.add(pillar, bowl, flame); this.tick.push(t => { this.flameMat.emissiveIntensity = 2 + Math.sin(t * 9) * 0.35 + Math.sin(t * 23) * 0.2; });
  }

  // ---------- 샘과 넥서스 크리스털 ----------
  private bases(): void {
    fountains(this.map).forEach((f, owner) => {
      const c = TEAM_COLORS[owner], col = new THREE.Color(c), g = new THREE.Group(), stone = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.8, flatShading: true });
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.4, 0.55, 18), stone); basin.position.y = 0.27; basin.castShadow = this.shadows; basin.receiveShadow = true; g.add(basin);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.06, 18), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0x7fd8ff), 0.6), emissive: col, emissiveIntensity: 0.55, roughness: 0.1, transparent: true, opacity: 0.85 })); water.position.y = 0.56; g.add(water);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.62, 2.0, 6), stone); spire.position.y = 1.55; spire.castShadow = this.shadows; g.add(spire);
      const crystalMat = new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.3), emissive: col, emissiveIntensity: 1.8, roughness: 0.2, flatShading: true });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), crystalMat); crystal.scale.y = 1.7; crystal.position.y = 3.6; g.add(crystal);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4, pl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.6), stone); pl.position.set(Math.cos(a) * 3.9, 0.95, Math.sin(a) * 3.9); pl.castShadow = this.shadows; g.add(pl); const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), crystalMat); cap.position.set(pl.position.x, 2.2, pl.position.z); g.add(cap); }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.35, 5.5, 8, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 3.2; g.add(beam);
      g.position.set(f.x, 0, f.y); this.scene.add(g);
      this.tick.push(t => { crystal.rotation.y = t * 0.8 + owner; crystal.position.y = 3.6 + Math.sin(t * 1.4 + owner) * 0.15; crystalMat.emissiveIntensity = 1.5 + Math.sin(t * 2) * 0.4; });
    });
  }
}
