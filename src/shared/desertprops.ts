// 공용 사막 군사 소품: 감시탑·차량(트럭/험비/유조차)·레이더·발전기·천막·깃발·바람자루·모래주머니·콘크리트 벽·방벽·상자 더미·전차 잔해.
// FRONTLINE 사막 기지에서 옮겨 와 다른 게임도 가져다 쓰도록 했습니다. 소품은 원점에 놓인 THREE.Group 이고 앞쪽 방향은 +x 입니다.
// 깃발·레이더·바람자루처럼 움직이는 소품은 update(t) 가 불러야 움직입니다. 장소 고르기와 배치는 쓰는 게임이 맡습니다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 같은 시드면 같은 수열을 내는 간단한 난수 생성기. */
export const seeded = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, flatShading: true, ...o });

function mesh(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; g.add(o); return o;
}
const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);

export type DesertVehicleKind = 'truck' | 'humvee' | 'tanker';

export class DesertKit {
  private tick: Array<(t: number) => void> = [];
  private lamp = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 1.6, roughness: 0.4 });
  private mats: Record<'concrete' | 'sand' | 'steel' | 'dark' | 'olive' | 'canvas' | 'rust' | 'glass', THREE.MeshStandardMaterial>;

  /** teamColors: 진영(owner) 번호로 고르는 표식 색. shadows: 그림자를 드리울지. */
  constructor(private teamColors: readonly number[], private shadows: boolean) {
    this.mats = {
      concrete: std(0xa29f96, { roughness: 0.9 }), sand: std(0xc7aa74), steel: std(0x6c7279, { metalness: 0.5, roughness: 0.5 }), dark: std(0x2b2e32, { metalness: 0.3 }),
      olive: std(0x65694a), canvas: std(0xd2c29a, { roughness: 0.95 }), rust: std(0x8c4f2e, { roughness: 0.9 }), glass: std(0x2d4a5a, { emissive: 0x16303c, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.4 }),
    };
  }
  private teamColor(owner: number): number { return this.teamColors[owner % this.teamColors.length]; }
  /** 움직이는 소품(깃발·레이더·바람자루·탑 조명·전차 연기)을 한 걸음 진행합니다. t 는 초. */
  update(t: number): void { for (const f of this.tick) f(t); }
  /** 소품을 직접 지우지 않으므로 쓰는 쪽이 장면에서 뺀 뒤 호출하세요. 공용 재질만 정리합니다. */
  dispose(): void { for (const m of Object.values(this.mats)) m.dispose(); this.lamp.dispose(); this.tick = []; }

  tower(owner: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, team = std(this.teamColor(owner), { roughness: 0.5, metalness: 0.3 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { const leg = mesh(g, new THREE.CylinderGeometry(0.07, 0.11, 3.6, 6), m.steel, x * 0.62, 1.8, z * 0.62, this.shadows); leg.rotation.set(z * 0.05, 0, -x * 0.05); }
    for (const y of [1.0, 2.1]) { mesh(g, box(1.34, 0.06, 0.06), m.steel, 0, y, 0.62, false); mesh(g, box(1.34, 0.06, 0.06), m.steel, 0, y, -0.62, false); mesh(g, box(0.06, 0.06, 1.34), m.steel, 0.62, y, 0, false); mesh(g, box(0.06, 0.06, 1.34), m.steel, -0.62, y, 0, false); }
    mesh(g, box(1.8, 0.14, 1.8), m.concrete, 0, 3.6, 0, this.shadows);
    mesh(g, box(1.4, 0.8, 1.4), m.sand, 0, 4.08, 0, this.shadows); mesh(g, box(1.5, 0.22, 0.12), m.glass, 0, 4.22, 0.7, false); mesh(g, box(0.12, 0.22, 1.5), m.glass, 0.7, 4.22, 0, false);
    mesh(g, box(1.52, 0.12, 1.52), team, 0, 4.5, 0, false);
    const roof = mesh(g, new THREE.ConeGeometry(1.25, 0.5, 4), m.concrete, 0, 4.85, 0, this.shadows); roof.rotation.y = Math.PI / 4;
    const lamp = mesh(g, box(0.3, 0.22, 0.3), this.lamp, 0.95, 3.82, 0.95, false);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.5, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.userData.live = true; beam.geometry.translate(0, -2.75, 0); beam.rotation.z = Math.PI / 2 - 0.55; beam.position.set(0.95, 3.82, 0.95); g.add(beam); void lamp;
    const ph = owner * 2 + g.id; this.tick.push(t => { g.rotation.y += 0; beam.rotation.y = t * 0.6 + ph; });
    return g;
  }
  vehicle(kind: 'truck' | 'humvee' | 'tanker', owner: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10), team = std(this.teamColor(owner), { roughness: 0.5 });
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
  radar(owner: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    mesh(g, box(2.0, 0.3, 2.0), m.concrete, 0, 0.15, 0, this.shadows); mesh(g, new THREE.CylinderGeometry(0.3, 0.4, 1.6, 8), m.steel, 0, 1.1, 0, this.shadows);
    const arm = new THREE.Group(); arm.position.y = 2.0; arm.userData.live = true; g.add(arm);
    const dish = mesh(arm, new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), m.concrete, 0, 0, 0, this.shadows); dish.rotation.x = -Math.PI / 2.6; dish.scale.y = 0.55;
    mesh(arm, new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), m.steel, 0, 0.1, 0.48, false).rotation.x = Math.PI / 2.6;
    const blink = mesh(arm, new THREE.SphereGeometry(0.1, 8, 6), std(this.teamColor(owner), { emissive: this.teamColor(owner), emissiveIntensity: 2 }), 0, 0.55, 0.6, false);
    this.tick.push(t => { arm.rotation.y = t * 0.7 + owner; (blink.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 5) > 0 ? 2.6 : 0.3; });
    return g;
  }
  generator(): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    mesh(g, box(1.7, 0.8, 0.9), m.olive, 0, 0.5, 0, this.shadows); mesh(g, box(0.5, 0.4, 0.8), m.dark, 0.5, 1.1, 0, false);
    mesh(g, new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), m.steel, -0.55, 1.2, -0.2, false); mesh(g, box(1.8, 0.1, 1.0), m.concrete, 0, 0.05, 0, false);
    for (const x of [-0.6, 0.6]) mesh(g, new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), m.rust, x, 0.25, 0.75, this.shadows);
    return g;
  }
  tent(): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    const roof = mesh(g, new THREE.ConeGeometry(1.8, 1.1, 4), m.canvas, 0, 0.9, 0, this.shadows); roof.rotation.y = Math.PI / 4; roof.scale.set(1.0, 1, 1.35);
    mesh(g, box(2.2, 0.35, 2.8), m.canvas, 0, 0.18, 0, this.shadows); mesh(g, box(0.7, 0.8, 0.06), m.dark, 0, 0.5, 1.42, false);
    mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), m.steel, 0.9, 1.0, 1.5, false); return g;
  }
  flag(owner: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, c = this.teamColor(owner);
    mesh(g, box(0.5, 0.2, 0.5), m.concrete, 0, 0.1, 0, false); mesh(g, new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6), m.steel, 0, 2.2, 0, false);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8, 6, 1), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.7, emissive: c, emissiveIntensity: 0.25 })); cloth.userData.live = true; cloth.position.set(0.7, 3.7, 0); cloth.castShadow = this.shadows; g.add(cloth);
    const pos = cloth.geometry.attributes.position, base = Float32Array.from(pos.array);
    this.tick.push(t => { for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.setZ(i, Math.sin(t * 4 + x * 3) * 0.12 * (x + 0.65)); } pos.needsUpdate = true; });
    return g;
  }
  windsock(): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    mesh(g, new THREE.CylinderGeometry(0.04, 0.06, 3.2, 6), m.steel, 0, 1.6, 0, false);
    const sock = new THREE.Group(); sock.position.set(0, 3.1, 0); sock.userData.live = true; g.add(sock);
    const cone = mesh(sock, new THREE.ConeGeometry(0.3, 1.5, 8, 1, true), std(0xe9712c, { side: THREE.DoubleSide, flatShading: false }), 0.75, 0, 0, false); cone.rotation.z = -Math.PI / 2 + 0.2;
    this.tick.push(t => { sock.rotation.y = 0.5 + Math.sin(t * 0.5) * 0.25; cone.rotation.z = -Math.PI / 2 + 0.2 + Math.sin(t * 3) * 0.06; });
    return g;
  }
  sandbags(): THREE.Group {
    const g = new THREE.Group(), geo = new THREE.CapsuleGeometry(0.17, 0.5, 3, 6), rnd = seeded(7);
    const bag = new THREE.InstancedMesh(geo, this.mats.sand, 26), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); let i = 0;
    for (let row = 0; row < 2; row++) for (let k = 0; k < 6 - row; k++) {
      const a = (k - (5 - row) / 2) * 0.24, x = Math.sin(a) * 1.9, z = (1 - Math.cos(a)) * 1.9 - 0.5; e.set(0, -a, Math.PI / 2 + (rnd() - 0.5) * 0.1); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.17 + row * 0.27, z), q, new THREE.Vector3(1, 1, 1)); bag.setMatrixAt(i++, m4);
    }
    bag.count = i; bag.castShadow = this.shadows; bag.receiveShadow = true; g.add(bag); return g;
  }
  twall(): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    for (let i = 0; i < 3; i++) { const w = mesh(g, box(1.0, 1.7, 0.4), m.concrete, (i - 1) * 1.06, 0.85, 0, this.shadows); mesh(g, box(0.5, 1.7, 0.34), m.concrete, (i - 1) * 1.06, 0.85, 0, false).position.z = 0; void w; mesh(g, box(1.02, 0.12, 0.42), m.dark, (i - 1) * 1.06, 1.1, 0, false); }
    return g;
  }
  hesco(): THREE.Group {
    const g = new THREE.Group(), m = std(0xb5a37a, { roughness: 1 });
    for (let i = 0; i < 3; i++) for (let r = 0; r < 2 - (i === 1 ? 0 : 0); r++) mesh(g, box(1.05, 0.95, 1.05), m, (i - 1) * 1.1, 0.48 + r * 0.95, 0, this.shadows);
    mesh(g, box(1.06, 0.06, 1.06), this.mats.dark, 0, 0.5, 0, false); return g;
  }
  crates(seed: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, rnd = seeded(seed * 17 + 3);
    for (let i = 0; i < 4; i++) { const s = 0.5 + rnd() * 0.4, c = mesh(g, box(s, s * 0.9, s), i % 2 ? m.olive : m.canvas, (rnd() - 0.5) * 1.5, s * 0.45 + (i > 2 ? 0.55 : 0), (rnd() - 0.5) * 1.2, this.shadows); c.rotation.y = rnd() * 3; }
    for (let i = 0; i < 2; i++) mesh(g, new THREE.CylinderGeometry(0.26, 0.26, 0.8, 8), i ? m.rust : m.olive, 0.9 + i * 0.5, 0.4, 0.6 - i * 0.3, this.shadows);
    return g;
  }

  // ---------- 잔해 ----------
  /** 불탄 전차(짝수 i) 또는 무너진 콘크리트 건물과 드럼통(홀수 i). 전차에서는 연기가 피어오릅니다. */
  wreck(i: number): THREE.Group {
    const g = new THREE.Group(), m = this.mats, burnt = std(0x3e342c, { roughness: 1 });
    if (i % 2 === 0) { // 불탄 전차
      mesh(g, box(2.4, 0.5, 1.4), burnt, 0, 0.5, 0, this.shadows).rotation.z = 0.06; mesh(g, box(2.5, 0.35, 0.34), m.dark, 0, 0.2, 0.7, false); mesh(g, box(2.5, 0.35, 0.34), m.dark, 0, 0.2, -0.7, false);
      const tur = mesh(g, new THREE.CylinderGeometry(0.62, 0.7, 0.4, 8), burnt, -0.1, 0.95, 0.1, this.shadows); tur.rotation.set(0.12, 0.6, 0.18);
      const bar = mesh(g, new THREE.CylinderGeometry(0.07, 0.09, 1.9, 6), m.dark, 0.9, 1.0, 0.5, false); bar.rotation.z = Math.PI / 2 - 0.5; bar.rotation.y = 0.5;
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3a3632, transparent: true, opacity: 0.35, depthWrite: false })); smoke.position.set(-0.1, 1.6, 0.1); smoke.userData.live = true; g.add(smoke);
      this.tick.push(t => { const k = (t * 0.35 + i * 0.37) % 1; smoke.position.y = 1.4 + k * 3.2; smoke.scale.setScalar(0.5 + k * 1.5); (smoke.material as THREE.MeshBasicMaterial).opacity = 0.34 * (1 - k); });
    } else { // 무너진 콘크리트 건물과 드럼통
      for (let k = 0; k < 4; k++) { const h = 1.4 + (k % 3) * 0.7, w = mesh(g, box(0.5, h, 1.8 - (k % 2) * 0.6), m.concrete, (k - 1.5) * 1.1, h / 2, (k % 2) * 0.3, this.shadows); w.rotation.set(0, (k - 1.5) * 0.08, (k % 2 ? 0.07 : -0.05)); }
      mesh(g, box(3.8, 0.12, 0.9), m.concrete, 0, 0.1, 0.9, false); for (let k = 0; k < 3; k++) mesh(g, new THREE.CylinderGeometry(0.26, 0.26, 0.8, 8), k % 2 ? m.rust : m.olive, -0.9 + k * 0.5, 0.4, -0.9, this.shadows);
    }
    return g;
  }
}

/**
 * 움직이지 않는 메시를 재질별로 하나씩 합쳐 그리기 호출을 줄입니다(DesertKit 소품 여러 개를 모은 묶음용).
 * update 로 움직이는 부품(userData.live 가 붙은 것과 그 자식)과 인스턴스 메시는 그대로 둡니다.
 * root 는 부모도 이동·회전도 없는 상태여야 하고(자식의 월드 행렬을 그대로 씁니다), 장면에 넣기 전에 부르세요.
 */
export function bakeStatic(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>(), gone: THREE.Mesh[] = [];
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.live) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
    g.applyMatrix4(m.matrixWorld);
    const b = buckets.get(m.material) ?? { geos: [], cast: false }; b.geos.push(g); b.cast ||= m.castShadow; buckets.set(m.material, b); gone.push(m);
  });
  for (const m of gone) { m.removeFromParent(); m.geometry.dispose(); }
  for (const [mat, b] of buckets) {
    const merged = new THREE.Mesh(mergeGeometries(b.geos, false), mat); merged.castShadow = b.cast; merged.receiveShadow = true; root.add(merged); b.geos.forEach(g => g.dispose());
  }
}
