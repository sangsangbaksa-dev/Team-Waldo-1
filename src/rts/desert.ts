// FRONTLINE — 사막 군사 기지 장식. 모래 위 두 진영의 본부 둘레에 감시탑·모래주머니·방벽·차량·레이더·천막·깃발을 세우고,
// 협곡 암벽과 떠다니는 흙먼지를 얹습니다. 3D 화면에만 있는 장식이라 시뮬레이션·충돌·길찾기에는 영향이 없고,
// 모든 배치는 한쪽 진영에서 고른 뒤 180도 돌려 반대편에 똑같이 놓으므로 어느 쪽에도 유리하지 않습니다.
import * as THREE from 'three';
import { DesertKit, seeded } from '../shared/desertprops';
import { TEAM_COLORS } from './config';
import type { Pt, RtsMap } from './map';
import type { Lanes } from './scenery';

type Quality = 'high' | 'standard' | 'low';

const blockedNear = (map: RtsMap, x: number, y: number, r: number): boolean => {
  const n = map.size;
  for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
    if (i < 0 || j < 0 || i >= n || j >= n || (map.terrain[j * n + i] && (i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= (r + 0.7) ** 2)) return true;
  }
  return false;
};
const near = (pts: ReadonlyArray<Pt>, x: number, y: number, r: number): boolean => pts.some(p => Math.hypot(p.x - x, p.y - y) < r);

export interface Prop { build(): THREE.Group; r: number }

export class DesertProps {
  private kit: DesertKit;
  private dustTick: ((t: number) => void) | null = null;
  private dust: THREE.Points | null = null;

  constructor(private scene: THREE.Scene, private map: RtsMap, private lanes: Lanes, private quality: Quality, shadows: boolean) {
    this.kit = new DesertKit(TEAM_COLORS, shadows);
    this.bases(); this.wrecks(); this.dustField();
  }
  update(t: number): void { this.kit.update(t); this.dustTick?.(t); }

  // ---------- 장소 고르기 ----------
  private roads(): Pt[] { return [...this.lanes.top, ...this.lanes.mid, ...this.lanes.bot]; }
  private free(x: number, y: number, r: number, roads: Pt[], clearOfNodes = 5.5): boolean {
    const n = this.map.size;
    if (x < 4 || y < 4 || x > n - 4 || y > n - 4) return false;
    if (blockedNear(this.map, x, y, r + 0.4) || near(this.map.nodes, x + 0.0, y + 0.0, clearOfNodes) || near(roads, x, y, r + 2.1)) return false;
    return !this.map.starts.some(s => x > s.x - 0.8 && x < s.x + 4.8 && y > s.y - 0.8 && y < s.y + 4.8);
  }
  /** 한쪽 진영 기준으로 놓고 반대편은 180도 돌려 같은 모양으로 놓습니다. */
  private both(g: (owner: number) => THREE.Group, p: Pt, rot: number): void {
    const n = this.map.size;
    [0, 1].forEach(o => {
      const obj = g(o), q = o ? { x: n - p.x, y: n - p.y } : p;
      obj.position.set(q.x, 0, q.y); obj.rotation.y = rot + (o ? Math.PI : 0); this.scene.add(obj);
    });
  }

  private bases(): void {
    const roads = this.roads(), start = this.map.starts[0], cx = start.x + 2, cy = start.y + 2, rnd = seeded(404);
    const used: Pt[] = [];
    const take = (r: number, aMin: number, aMax: number, rMin: number, rMax: number, tries = 40, gap = 3.4): { p: Pt; a: number } | null => {
      for (let i = 0; i < tries; i++) {
        const a = aMin + rnd() * (aMax - aMin), d = rMin + rnd() * (rMax - rMin), p = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
        if (!this.free(p.x, p.y, r, roads) || used.some(q => Math.hypot(q.x - p.x, q.y - p.y) < gap + r)) continue;
        used.push({ x: p.x, y: p.y }); return { p, a };
      }
      return null;
    };
    const deg = Math.PI / 180, face = (a: number): number => -a + Math.PI; // 중심에서 바깥(a) 방향을 등지고 안쪽을 바라보게
    // 감시탑: 육각 패드 꼭짓점 근처에 최대 세 곳
    const picked: Pt[] = [];
    for (const a of [-40, -100, -150, -10, 160, 20, 120, -70, 200]) {
      if (picked.length >= 3) break;
      for (const d of [9.6, 10.6, 11.6]) {
        const p = { x: cx + Math.cos(a * deg) * d, y: cy + Math.sin(a * deg) * d };
        if (picked.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 9) || !this.free(p.x, p.y, 1.0, roads, 3.4)) continue;
        picked.push(p); used.push(p); this.both(o => this.kit.tower(o), p, face(a * deg)); break;
      }
    }
    // 본부 뒤쪽(적에게서 먼 쪽)과 옆: 레이더, 발전기, 천막
    const radar = take(2, 120 * deg, 200 * deg, 11, 14.5) ?? take(2, 100 * deg, 230 * deg, 10, 16);
    if (radar) this.both(o => this.kit.radar(o), radar.p, rnd() * 6);
    for (let i = 0; i < 2; i++) { const t = take(1.9, 95 * deg, 250 * deg, 10.5, 15, 50, 3.6); if (t) this.both(() => this.kit.tent(), t.p, face(t.a) + (rnd() - 0.5) * 0.5); }
    const gen = take(1.3, 90 * deg, 250 * deg, 10.5, 15); if (gen) this.both(() => this.kit.generator(), gen.p, rnd() * 6);
    // 차량 주차장: 패드 가장자리를 따라
    for (const kind of ['truck', 'humvee', 'tanker', 'humvee'] as const) { const v = take(1.7, -170 * deg, 20 * deg, 10.2, 13.4, 70, 3.6); if (v) this.both(o => this.kit.vehicle(kind, o), v.p, face(v.a) + Math.PI / 2 + (rnd() - 0.5) * 0.4); }
    // 깃발과 바람자루
    const flag = take(0.6, -75 * deg, -5 * deg, 9.8, 11.2, 60, 2); if (flag) this.both(o => this.kit.flag(o), flag.p, 0);
    const sock = take(0.5, 150 * deg, 215 * deg, 9.8, 12, 40, 2); if (sock) this.both(() => this.kit.windsock(), sock.p, 0.6);
    // 모래주머니·방벽·콘크리트 T벽·상자 더미
    const n = this.quality === 'low' ? 3 : 6;
    for (let i = 0; i < n; i++) { const s = take(1.4, -165 * deg, 15 * deg, 10, 14.5, 60, 2.6); if (s) this.both(() => this.kit.sandbags(), s.p, face(s.a) + Math.PI / 2); }
    for (let i = 0; i < 4; i++) { const s = take(1.5, -170 * deg, 20 * deg, 10.5, 15, 60, 3); if (s) this.both(() => this.kit.twall(), s.p, face(s.a) + Math.PI / 2 + (rnd() - 0.5) * 0.3); }
    for (let i = 0; i < 3; i++) { const s = take(1.2, -170 * deg, 250 * deg, 10, 15, 60, 3); if (s) this.both(() => this.kit.hesco(), s.p, face(s.a) + Math.PI / 2); }
    for (let i = 0; i < 5; i++) { const s = take(0.8, -170 * deg, 250 * deg, 9.6, 15.5, 60, 2.4); if (s) this.both(() => this.kit.crates(i), s.p, rnd() * 6); }
  }

  // ---------- 중립 지대: 전차 잔해와 폐허 ----------
  private wrecks(): void {
    const roads = this.roads(), rnd = seeded(515), n = this.map.size, spots: Pt[] = [], want = this.quality === 'low' ? 3 : 6;
    for (let tries = 0; tries < 600 && spots.length < want; tries++) {
      const x = 8 + rnd() * (n - 16), y = 8 + rnd() * (n - 16);
      if (x + y > n || !this.free(x, y, 2.4, roads, 8) || spots.some(p => Math.hypot(p.x - x, p.y - y) < 14) || near(this.map.starts.map(s => ({ x: s.x + 2, y: s.y + 2 })), x, y, 18)) continue;
      spots.push({ x, y });
    }
    spots.forEach((p, i) => this.both(() => this.kit.wreck(i), p, rnd() * 6));
  }

  // ---------- 흙먼지 ----------
  private dustField(): void {
    const count = this.quality === 'low' ? 80 : this.quality === 'standard' ? 160 : 260, n = this.map.size, rnd = seeded(808), pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = rnd() * n; pos[i * 3 + 1] = 0.4 + rnd() * 3.2; pos[i * 3 + 2] = rnd() * n; seed[i] = rnd() * 6.28; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!, gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(255,236,200,.8)'); gr.addColorStop(1, 'rgba(255,236,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 2.2, transparent: true, opacity: 0.22, depthWrite: false, sizeAttenuation: true, color: 0xf0d9aa })); pts.frustumCulled = false; this.dust = pts; this.scene.add(pts);
    this.dustTick = (t: number): void => {
      const a = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) { const x = (pos[i * 3] + t * (1.6 + (seed[i] % 1))) % n, z = pos[i * 3 + 2] + Math.sin(t * 0.4 + seed[i]) * 0.01; a.setXYZ(i, x, pos[i * 3 + 1] + Math.sin(t * 0.8 + seed[i]) * 0.35, z); }
      a.needsUpdate = true;
    };
  }
  dispose(): void { this.dust?.geometry.dispose(); }
}
