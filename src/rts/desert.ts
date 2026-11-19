// FRONTLINE — 사막 군사 기지 장식. 모래 위 두 진영의 본부 둘레에 감시탑·모래주머니·방벽·차량·레이더·천막·깃발을 세우고,
// 협곡 암벽과 떠다니는 흙먼지를 얹습니다. 3D 화면에만 있는 장식이라 시뮬레이션·충돌·길찾기에는 영향이 없고,
// 모든 배치는 한쪽 진영에서 고른 뒤 180도 돌려 반대편에 똑같이 놓으므로 어느 쪽에도 유리하지 않습니다.
import * as THREE from 'three';
import { TEAM_COLORS } from './config';
import type { Pt, RtsMap } from './map';
import type { Lanes } from './scenery';

type Quality = 'high' | 'standard' | 'low';
const seeded = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, flatShading: true, ...o });

const blockedNear = (map: RtsMap, x: number, y: number, r: number): boolean => {
  const n = map.size;
  for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
    if (i < 0 || j < 0 || i >= n || j >= n || (map.terrain[j * n + i] && (i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= (r + 0.7) ** 2)) return true;
  }
  return false;
};
const near = (pts: ReadonlyArray<Pt>, x: number, y: number, r: number): boolean => pts.some(p => Math.hypot(p.x - x, p.y - y) < r);

export interface Prop { build(): THREE.Group; r: number }

function mesh(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; g.add(o); return o;
}
const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);

export class DesertProps {
  private tick: Array<(t: number) => void> = [];
  private lamp = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 1.6, roughness: 0.4 });
  private mats: Record<'concrete' | 'sand' | 'steel' | 'dark' | 'olive' | 'canvas' | 'rust' | 'glass', THREE.MeshStandardMaterial>;
  private dust: THREE.Points | null = null;

  constructor(private scene: THREE.Scene, private map: RtsMap, private lanes: Lanes, private quality: Quality, private shadows: boolean) {
    this.mats = {
      concrete: std(0xa29f96, { roughness: 0.9 }), sand: std(0xc7aa74), steel: std(0x6c7279, { metalness: 0.5, roughness: 0.5 }), dark: std(0x2b2e32, { metalness: 0.3 }),
      olive: std(0x65694a), canvas: std(0xd2c29a, { roughness: 0.95 }), rust: std(0x8c4f2e, { roughness: 0.9 }), glass: std(0x2d4a5a, { emissive: 0x16303c, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.4 }),
    };
    this.bases(); this.wrecks(); this.dustField();
  }
  update(t: number): void { for (const f of this.tick) f(t); }

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
        picked.push(p); used.push(p); this.both(o => this.tower(o), p, face(a * deg)); break;
      }
    }
    // 본부 뒤쪽(적에게서 먼 쪽)과 옆: 레이더, 발전기, 천막
    const radar = take(2, 120 * deg, 200 * deg, 11, 14.5) ?? take(2, 100 * deg, 230 * deg, 10, 16);
    if (radar) this.both(o => this.radar(o), radar.p, rnd() * 6);
    for (let i = 0; i < 2; i++) { const t = take(1.9, 95 * deg, 250 * deg, 10.5, 15, 50, 3.6); if (t) this.both(() => this.tent(), t.p, face(t.a) + (rnd() - 0.5) * 0.5); }
    const gen = take(1.3, 90 * deg, 250 * deg, 10.5, 15); if (gen) this.both(() => this.generator(), gen.p, rnd() * 6);
    // 차량 주차장: 패드 가장자리를 따라
    for (const kind of ['truck', 'humvee', 'tanker', 'humvee'] as const) { const v = take(1.7, -170 * deg, 20 * deg, 10.2, 13.4, 70, 3.6); if (v) this.both(o => this.vehicle(kind, o), v.p, face(v.a) + Math.PI / 2 + (rnd() - 0.5) * 0.4); }
    // 깃발과 바람자루
    const flag = take(0.6, -75 * deg, -5 * deg, 9.8, 11.2, 60, 2); if (flag) this.both(o => this.flag(o), flag.p, 0);
    const sock = take(0.5, 150 * deg, 215 * deg, 9.8, 12, 40, 2); if (sock) this.both(() => this.windsock(), sock.p, 0.6);
    // 모래주머니·방벽·콘크리트 T벽·상자 더미
    const n = this.quality === 'low' ? 3 : 6;
    for (let i = 0; i < n; i++) { const s = take(1.4, -165 * deg, 15 * deg, 10, 14.5, 60, 2.6); if (s) this.both(() => this.sandbags(), s.p, face(s.a) + Math.PI / 2); }
    for (let i = 0; i < 4; i++) { const s = take(1.5, -170 * deg, 20 * deg, 10.5, 15, 60, 3); if (s) this.both(() => this.twall(), s.p, face(s.a) + Math.PI / 2 + (rnd() - 0.5) * 0.3); }
    for (let i = 0; i < 3; i++) { const s = take(1.2, -170 * deg, 250 * deg, 10, 15, 60, 3); if (s) this.both(() => this.hesco(), s.p, face(s.a) + Math.PI / 2); }
    for (let i = 0; i < 5; i++) { const s = take(0.8, -170 * deg, 250 * deg, 9.6, 15.5, 60, 2.4); if (s) this.both(() => this.crates(i), s.p, rnd() * 6); }
  }

  // ---------- 건조물 ----------
  private tower(owner: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, team = std(TEAM_COLORS[owner], { roughness: 0.5, metalness: 0.3 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { const leg = mesh(g, new THREE.CylinderGeometry(0.07, 0.11, 3.6, 6), m.steel, x * 0.62, 1.8, z * 0.62, this.shadows); leg.rotation.set(z * 0.05, 0, -x * 0.05); }
    for (const y of [1.0, 2.1]) { mesh(g, box(1.34, 0.06, 0.06), m.steel, 0, y, 0.62, false); mesh(g, box(1.34, 0.06, 0.06), m.steel, 0, y, -0.62, false); mesh(g, box(0.06, 0.06, 1.34), m.steel, 0.62, y, 0, false); mesh(g, box(0.06, 0.06, 1.34), m.steel, -0.62, y, 0, false); }
    mesh(g, box(1.8, 0.14, 1.8), m.concrete, 0, 3.6, 0, this.shadows);
    mesh(g, box(1.4, 0.8, 1.4), m.sand, 0, 4.08, 0, this.shadows); mesh(g, box(1.5, 0.22, 0.12), m.glass, 0, 4.22, 0.7, false); mesh(g, box(0.12, 0.22, 1.5), m.glass, 0.7, 4.22, 0, false);
    mesh(g, box(1.52, 0.12, 1.52), team, 0, 4.5, 0, false);
    const roof = mesh(g, new THREE.ConeGeometry(1.25, 0.5, 4), m.concrete, 0, 4.85, 0, this.shadows); roof.rotation.y = Math.PI / 4;
    const lamp = mesh(g, box(0.3, 0.22, 0.3), this.lamp, 0.95, 3.82, 0.95, false);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.5, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.geometry.translate(0, -2.75, 0); beam.rotation.z = Math.PI / 2 - 0.55; beam.position.set(0.95, 3.82, 0.95); g.add(beam); void lamp;
    const ph = owner * 2 + g.id; this.tick.push(t => { g.rotation.y += 0; beam.rotation.y = t * 0.6 + ph; });
    return g;
  }
  private vehicle(kind: 'truck' | 'humvee' | 'tanker', owner: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10), team = std(TEAM_COLORS[owner], { roughness: 0.5 });
    const wheels = (xs: number[], z: number): void => { for (const x of xs) for (const s of [-1, 1]) { const w = mesh(g, wheel, m.dark, x, 0.34, s * z, this.shadows); w.rotation.x = Math.PI / 2; } };
    if (kind === 'humvee') {
      mesh(g, box(2.1, 0.5, 1.15), m.sand, 0, 0.62, 0, this.shadows); mesh(g, box(1.0, 0.45, 1.05), m.sand, -0.1, 1.08, 0, this.shadows); mesh(g, box(0.9, 0.2, 1.05), m.glass, 0.4, 1.1, 0, false);
      mesh(g, box(0.5, 0.06, 1.2), team, 0.75, 0.9, 0, false); wheels([-0.7, 0.7], 0.62);
      mesh(g, new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6), m.steel, -0.55, 1.55, 0, false); mesh(g, box(0.8, 0.1, 0.1), m.dark, -0.2, 1.8, 0, false);
    } else if (kind === 'truck') {
      mesh(g, box(0.95, 0.9, 1.35), m.olive, 1.2, 1.0, 0, this.shadows); mesh(g, box(0.1, 0.4, 1.2), m.glass, 1.7, 1.25, 0, false);
      mesh(g, box(2.6, 0.22, 1.3), m.dark, -0.4, 0.58, 0, this.shadows);
      const cover = mesh(g, new THREE.CylinderGeometry(0.72, 0.72, 2.4, 10, 1, false, 0, Math.PI), m.canvas, -0.4, 0.7, 0, this.shadows); cover.rotation.set(0, 0, Math.PI / 2); cover.rotation.order = 'XYZ'; cover.rotation.x = Math.PI / 2; cover.rotation.z = Math.PI / 2; cover.rotation.y = 0;
      mesh(g, box(0.1, 0.18, 1.4), team, 0.9, 0.62, 0, false); wheels([-1.15, -0.1, 1.2], 0.68);
    } else {
      mesh(g, box(0.95, 0.9, 1.25), m.olive, 1.25, 1.0, 0, this.shadows); mesh(g, box(0.1, 0.36, 1.1), m.glass, 1.75, 1.25, 0, false); mesh(g, box(3.0, 0.2, 1.1), m.dark, -0.3, 0.58, 0, this.shadows);
      const tank = mesh(g, new THREE.CylinderGeometry(0.62, 0.62, 2.6, 12), m.steel, -0.3, 1.25, 0, this.shadows); tank.rotation.z = Math.PI / 2;
      mesh(g, new THREE.CylinderGeometry(0.64, 0.64, 0.14, 12), team, -0.3, 1.25, 0, false).rotation.z = Math.PI / 2; wheels([-1.3, -0.3, 1.25], 0.6);
    }
    return g;
  }
  private radar(owner: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    mesh(g, box(2.0, 0.3, 2.0), m.concrete, 0, 0.15, 0, this.shadows); mesh(g, new THREE.CylinderGeometry(0.3, 0.4, 1.6, 8), m.steel, 0, 1.1, 0, this.shadows);
    const arm = new THREE.Group(); arm.position.y = 2.0; g.add(arm);
    const dish = mesh(arm, new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), m.concrete, 0, 0, 0, this.shadows); dish.rotation.x = -Math.PI / 2.6; dish.scale.y = 0.55;
    mesh(arm, new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), m.steel, 0, 0.1, 0.48, false).rotation.x = Math.PI / 2.6;
    const blink = mesh(arm, new THREE.SphereGeometry(0.1, 8, 6), std(TEAM_COLORS[owner], { emissive: TEAM_COLORS[owner], emissiveIntensity: 2 }), 0, 0.55, 0.6, false);
    this.tick.push(t => { arm.rotation.y = t * 0.7 + owner; (blink.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 5) > 0 ? 2.6 : 0.3; });
    return g;
  }
  private generator(): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    mesh(g, box(1.7, 0.8, 0.9), m.olive, 0, 0.5, 0, this.shadows); mesh(g, box(0.5, 0.4, 0.8), m.dark, 0.5, 1.1, 0, false);
    mesh(g, new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), m.steel, -0.55, 1.2, -0.2, false); mesh(g, box(1.8, 0.1, 1.0), m.concrete, 0, 0.05, 0, false);
    for (const x of [-0.6, 0.6]) mesh(g, new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), m.rust, x, 0.25, 0.75, this.shadows);
    return g;
  }
  private tent(): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    const roof = mesh(g, new THREE.ConeGeometry(1.8, 1.1, 4), m.canvas, 0, 0.9, 0, this.shadows); roof.rotation.y = Math.PI / 4; roof.scale.set(1.0, 1, 1.35);
    mesh(g, box(2.2, 0.35, 2.8), m.canvas, 0, 0.18, 0, this.shadows); mesh(g, box(0.7, 0.8, 0.06), m.dark, 0, 0.5, 1.42, false);
    mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), m.steel, 0.9, 1.0, 1.5, false); return g;
  }
  private flag(owner: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, c = TEAM_COLORS[owner];
    mesh(g, box(0.5, 0.2, 0.5), m.concrete, 0, 0.1, 0, false); mesh(g, new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6), m.steel, 0, 2.2, 0, false);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8, 6, 1), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.7, emissive: c, emissiveIntensity: 0.25 })); cloth.position.set(0.7, 3.7, 0); cloth.castShadow = this.shadows; g.add(cloth);
    const pos = cloth.geometry.attributes.position, base = Float32Array.from(pos.array);
    this.tick.push(t => { for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.setZ(i, Math.sin(t * 4 + x * 3) * 0.12 * (x + 0.65)); } pos.needsUpdate = true; });
    return g;
  }
  private windsock(): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    mesh(g, new THREE.CylinderGeometry(0.04, 0.06, 3.2, 6), m.steel, 0, 1.6, 0, false);
    const sock = new THREE.Group(); sock.position.set(0, 3.1, 0); g.add(sock);
    const cone = mesh(sock, new THREE.ConeGeometry(0.3, 1.5, 8, 1, true), std(0xe9712c, { side: THREE.DoubleSide, flatShading: false }), 0.75, 0, 0, false); cone.rotation.z = -Math.PI / 2 + 0.2;
    this.tick.push(t => { sock.rotation.y = 0.5 + Math.sin(t * 0.5) * 0.25; cone.rotation.z = -Math.PI / 2 + 0.2 + Math.sin(t * 3) * 0.06; });
    return g;
  }
  private sandbags(): THREE.Group {
    const g = new THREE.Group(), geo = new THREE.CapsuleGeometry(0.17, 0.5, 3, 6), rnd = seeded(7);
    const bag = new THREE.InstancedMesh(geo, this.mats.sand, 26), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); let i = 0;
    for (let row = 0; row < 2; row++) for (let k = 0; k < 6 - row; k++) {
      const a = (k - (5 - row) / 2) * 0.24, x = Math.sin(a) * 1.9, z = (1 - Math.cos(a)) * 1.9 - 0.5; e.set(0, -a, Math.PI / 2 + (rnd() - 0.5) * 0.1); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.17 + row * 0.27, z), q, new THREE.Vector3(1, 1, 1)); bag.setMatrixAt(i++, m4);
    }
    bag.count = i; bag.castShadow = this.shadows; bag.receiveShadow = true; g.add(bag); return g;
  }
  private twall(): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    for (let i = 0; i < 3; i++) { const w = mesh(g, box(1.0, 1.7, 0.4), m.concrete, (i - 1) * 1.06, 0.85, 0, this.shadows); mesh(g, box(0.5, 1.7, 0.34), m.concrete, (i - 1) * 1.06, 0.85, 0, false).position.z = 0; void w; mesh(g, box(1.02, 0.12, 0.42), m.dark, (i - 1) * 1.06, 1.1, 0, false); }
    return g;
  }
  private hesco(): THREE.Group {
    const g = new THREE.Group(), m = std(0xb5a37a, { roughness: 1 });
    for (let i = 0; i < 3; i++) for (let r = 0; r < 2 - (i === 1 ? 0 : 0); r++) mesh(g, box(1.05, 0.95, 1.05), m, (i - 1) * 1.1, 0.48 + r * 0.95, 0, this.shadows);
    mesh(g, box(1.06, 0.06, 1.06), this.mats.dark, 0, 0.5, 0, false); return g;
  }
  private crates(seed: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, rnd = seeded(seed * 17 + 3);
    for (let i = 0; i < 4; i++) { const s = 0.5 + rnd() * 0.4, c = mesh(g, box(s, s * 0.9, s), i % 2 ? m.olive : m.canvas, (rnd() - 0.5) * 1.5, s * 0.45 + (i > 2 ? 0.55 : 0), (rnd() - 0.5) * 1.2, this.shadows); c.rotation.y = rnd() * 3; }
    for (let i = 0; i < 2; i++) mesh(g, new THREE.CylinderGeometry(0.26, 0.26, 0.8, 8), i ? m.rust : m.olive, 0.9 + i * 0.5, 0.4, 0.6 - i * 0.3, this.shadows);
    return g;
  }

  // ---------- 중립 지대: 전차 잔해와 폐허 ----------
  private wrecks(): void {
    const roads = this.roads(), rnd = seeded(515), n = this.map.size, spots: Pt[] = [], want = this.quality === 'low' ? 3 : 6;
    for (let tries = 0; tries < 600 && spots.length < want; tries++) {
      const x = 8 + rnd() * (n - 16), y = 8 + rnd() * (n - 16);
      if (x + y > n || !this.free(x, y, 2.4, roads, 8) || spots.some(p => Math.hypot(p.x - x, p.y - y) < 14) || near(this.map.starts.map(s => ({ x: s.x + 2, y: s.y + 2 })), x, y, 18)) continue;
      spots.push({ x, y });
    }
    spots.forEach((p, i) => this.both(() => this.wreck(i), p, rnd() * 6));
  }
  private wreck(i: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, burnt = std(0x3e342c, { roughness: 1 });
    if (i % 2 === 0) { // 불탄 전차
      mesh(g, box(2.4, 0.5, 1.4), burnt, 0, 0.5, 0, this.shadows).rotation.z = 0.06; mesh(g, box(2.5, 0.35, 0.34), m.dark, 0, 0.2, 0.7, false); mesh(g, box(2.5, 0.35, 0.34), m.dark, 0, 0.2, -0.7, false);
      const tur = mesh(g, new THREE.CylinderGeometry(0.62, 0.7, 0.4, 8), burnt, -0.1, 0.95, 0.1, this.shadows); tur.rotation.set(0.12, 0.6, 0.18);
      const bar = mesh(g, new THREE.CylinderGeometry(0.07, 0.09, 1.9, 6), m.dark, 0.9, 1.0, 0.5, false); bar.rotation.z = Math.PI / 2 - 0.5; bar.rotation.y = 0.5;
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3a3632, transparent: true, opacity: 0.35, depthWrite: false })); smoke.position.set(-0.1, 1.6, 0.1); g.add(smoke);
      this.tick.push(t => { const k = (t * 0.35 + i * 0.37) % 1; smoke.position.y = 1.4 + k * 3.2; smoke.scale.setScalar(0.5 + k * 1.5); (smoke.material as THREE.MeshBasicMaterial).opacity = 0.34 * (1 - k); });
    } else { // 무너진 콘크리트 건물과 드럼통
      for (let k = 0; k < 4; k++) { const h = 1.4 + (k % 3) * 0.7, w = mesh(g, box(0.5, h, 1.8 - (k % 2) * 0.6), m.concrete, (k - 1.5) * 1.1, h / 2, (k % 2) * 0.3, this.shadows); w.rotation.set(0, (k - 1.5) * 0.08, (k % 2 ? 0.07 : -0.05)); }
      mesh(g, box(3.8, 0.12, 0.9), m.concrete, 0, 0.1, 0.9, false); for (let k = 0; k < 3; k++) mesh(g, new THREE.CylinderGeometry(0.26, 0.26, 0.8, 8), k % 2 ? m.rust : m.olive, -0.9 + k * 0.5, 0.4, -0.9, this.shadows);
    }
    return g;
  }

  // ---------- 흙먼지 ----------
  private dustField(): void {
    const count = this.quality === 'low' ? 80 : this.quality === 'standard' ? 160 : 260, n = this.map.size, rnd = seeded(808), pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = rnd() * n; pos[i * 3 + 1] = 0.4 + rnd() * 3.2; pos[i * 3 + 2] = rnd() * n; seed[i] = rnd() * 6.28; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!, gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(255,236,200,.8)'); gr.addColorStop(1, 'rgba(255,236,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 2.2, transparent: true, opacity: 0.22, depthWrite: false, sizeAttenuation: true, color: 0xf0d9aa })); pts.frustumCulled = false; this.dust = pts; this.scene.add(pts);
    this.tick.push(t => {
      const a = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) { const x = (pos[i * 3] + t * (1.6 + (seed[i] % 1))) % n, z = pos[i * 3 + 2] + Math.sin(t * 0.4 + seed[i]) * 0.01; a.setXYZ(i, x, pos[i * 3 + 1] + Math.sin(t * 0.8 + seed[i]) * 0.35, z); }
      a.needsUpdate = true;
    });
  }
  dispose(): void { this.dust?.geometry.dispose(); }
}
