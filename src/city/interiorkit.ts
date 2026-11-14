// LAST CITY — 사업체 내부 3D 를 만들 때 쓰는 공용 도구(재료 캐시·직육면체·간판·진열 상품 인스턴싱).
// Interior3D 와 가구·장식·사람 모듈이 한 Kit 을 공유해, 정리(dispose)도 한곳에서 합니다.
import * as THREE from 'three';

export type Quality = 'high' | 'standard' | 'low';
/** 결정적인 가짜 난수(같은 번호는 늘 같은 값): 진열 상품 색이 매번 바뀌지 않게 합니다. */
export const rnd = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const PALETTE = [0xe94b4b, 0xf5c242, 0x4fa3ff, 0x5ed388, 0xff8fd2, 0xf2f2f2, 0xb77bff, 0xff9a3c];

export class Kit {
  readonly anim: ((t: number) => void)[] = [];
  private disposables: { dispose(): void }[] = []; private mats = new Map<string, THREE.Material>();
  readonly bx = new THREE.BoxGeometry(1, 1, 1); readonly cyl = new THREE.CylinderGeometry(1, 1, 1, 18); readonly sph = new THREE.SphereGeometry(1, 14, 10);
  constructor(readonly scene: THREE.Scene, readonly quality: Quality) { this.own(this.bx, this.cyl, this.sph); }

  /** 정리할 대상으로 등록합니다. */
  own(...o: { dispose(): void }[]): void { this.disposables.push(...o); }
  dispose(): void { for (const d of this.disposables) d.dispose(); this.disposables.length = 0; this.mats.clear(); this.anim.length = 0; }

  /** 캔버스 그림 → 텍스처 */
  tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    this.own(t); return t;
  }
  mat(color: number, emissive = 0, ei = 0, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
    const key = `${color}:${emissive}:${ei}:${opts.opacity ?? 1}`; let m = this.mats.get(key) as THREE.MeshLambertMaterial | undefined;
    if (!m) { m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 }); this.mats.set(key, m); this.own(m); }
    return m;
  }
  /** 조명 영향을 받지 않는 발광 재료(네온·화면·형광등) */
  glow(color: number, k = 1): THREE.MeshBasicMaterial {
    const key = `g${color}:${k}`; let m = this.mats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), fog: false }); this.mats.set(key, m); this.own(m); }
    return m;
  }
  /** 직육면체(좌표는 x0,y0(높이),z0 ~ x1,y1,z1) */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const o = new THREE.Mesh(this.bx, m); o.scale.set(x1 - x0, y1 - y0, z1 - z0); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(o); return o;
  }
  /** 세운 원기둥(바닥 y, 높이 h, 반지름 r) */
  tube(x: number, y: number, z: number, r: number, h: number, m: THREE.Material, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const o = new THREE.Mesh(this.cyl, m); o.scale.set(r, h, r); o.position.set(x, y + h / 2, z); parent.add(o); return o;
  }
  sphere(x: number, y: number, z: number, r: number, m: THREE.Material, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const o = new THREE.Mesh(this.sph, m); o.scale.setScalar(r); o.position.set(x, y, z); parent.add(o); return o;
  }
  /** 위치와 방향(y축 회전)을 가진 묶음. 안쪽 좌표는 그 묶음 기준입니다. */
  group(x: number, y: number, z: number, ry = 0, parent: THREE.Object3D = this.scene): THREE.Group {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g;
  }
  /** 그림 한 장을 붙인 판. emissive 면 조명과 상관없이 밝게 보입니다. */
  plane(w: number, h: number, map: THREE.Texture, x: number, y: number, z: number, ry = 0, emissive = true): THREE.Mesh {
    const g = new THREE.PlaneGeometry(w, h); this.own(g);
    const m = emissive ? new THREE.MeshBasicMaterial({ map, transparent: true, fog: false }) : new THREE.MeshLambertMaterial({ map, transparent: true }); this.own(m);
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; this.scene.add(o); return o;
  }
  light(color: number, intensity: number, x: number, y: number, z: number, dist = 200): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, dist, 1.4); l.position.set(x, y, z); this.scene.add(l); return l;
  }
  /** 네온 간판 그림 */
  neon(text: string, color: string): THREE.CanvasTexture {
    return this.tex(256, 80, g => {
      g.fillStyle = 'rgba(8,8,12,0.9)'; g.beginPath(); g.roundRect(4, 4, 248, 72, 14); g.fill(); g.strokeStyle = color; g.lineWidth = 5; g.shadowColor = color; g.shadowBlur = 14; g.stroke();
      g.fillStyle = color; g.font = "900 46px 'Noto Sans KR',sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 42);
    });
  }
  sign(color: string, text: string, x: number, y: number, z: number, w = 70, ry = 0): THREE.Mesh { return this.plane(w, w * 0.31, this.neon(text, color), x, y, z, ry, true); }

  /** 진열 상품용 인스턴싱 묶음: 상자형과 병/캔형 두 가지를 한 번에 그립니다. 수량은 품질에 따라 줄입니다. */
  stock(capBox: number, capCan: number): Stock { return new Stock(this, this.quality === 'low' ? 0 : capBox, this.quality === 'low' ? 0 : capCan); }
}

export class Stock {
  private boxes: THREE.InstancedMesh | null = null; private cans: THREE.InstancedMesh | null = null; private nb = 0; private nc = 0;
  private d = new THREE.Object3D(); private c = new THREE.Color();
  constructor(kit: Kit, private capBox: number, private capCan: number) {
    if (capBox) { this.boxes = new THREE.InstancedMesh(kit.bx, new THREE.MeshLambertMaterial({ color: 0xffffff }), capBox); kit.scene.add(this.boxes); kit.own(this.boxes.material as THREE.Material, this.boxes); }
    if (capCan) { this.cans = new THREE.InstancedMesh(kit.cyl, new THREE.MeshLambertMaterial({ color: 0xffffff }), capCan); kit.scene.add(this.cans); kit.own(this.cans.material as THREE.Material, this.cans); }
  }
  /** 상자(포장 과자·시리얼 따위): 가운데 x,z · 바닥 y · 크기 sx,sy,sz */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): void {
    if (!this.boxes || this.nb >= this.capBox) return; this.put(this.boxes, this.nb++, x, y + sy / 2, z, sx, sy, sz, color);
  }
  /** 병·캔: 반지름 r 높이 h */
  can(x: number, y: number, z: number, r: number, h: number, color: number): void {
    if (!this.cans || this.nc >= this.capCan) return; this.put(this.cans, this.nc++, x, y + h / 2, z, r, h, r, color);
  }
  private put(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): void {
    this.d.position.set(x, y, z); this.d.scale.set(sx, sy, sz); this.d.rotation.set(0, 0, 0); this.d.updateMatrix(); m.setMatrixAt(i, this.d.matrix); m.setColorAt(i, this.c.setHex(color));
  }
  /** 다 채운 뒤 한 번 호출 */
  done(): void {
    for (const [m, n] of [[this.boxes, this.nb], [this.cans, this.nc]] as const) { if (!m) continue; m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
