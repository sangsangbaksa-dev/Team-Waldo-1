// LAST CITY — 사업체 내부 3D 장면. 업종마다 바닥·조명·가구·소품을 다르게 꾸밉니다.
// 도시 장면과 별개의 Scene 이라 도시 렌더러는 건드리지 않고, 보스가 안에 있는 동안 이 장면만 그립니다.
import * as THREE from 'three';
import { BIZ, type BizKind } from './defs';
import type { InteriorLayout, Solid } from './interior';

export const EYE_IN = 44;
type Quality = 'high' | 'standard' | 'low';
const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); } return t;
};
const rnd = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

interface Mood { bg: number; fog: number; fogD: number; amb: number; ambI: number; wall: number; floor: THREE.Texture; ceil: number; trim: number }

export class Interior3D {
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(75, 1, 2, 1400);
  private anim: ((t: number) => void)[] = []; private disposables: { dispose(): void }[] = []; private clerk = new THREE.Group();
  private mats = new Map<string, THREE.Material>(); private bx = new THREE.BoxGeometry(1, 1, 1); private cyl = new THREE.CylinderGeometry(1, 1, 1, 18); private sph = new THREE.SphereGeometry(1, 14, 10);

  constructor(public lay: InteriorLayout, public quality: Quality) {
    this.disposables.push(this.bx, this.cyl, this.sph);
    const m = this.mood(lay.kind); this.scene.background = new THREE.Color(m.bg); this.scene.fog = new THREE.FogExp2(m.fog, m.fogD);
    this.scene.add(new THREE.AmbientLight(m.amb, m.ambI), this.camera);
    this.shell(m); this.furniture(); this.decor(lay.kind); this.person();
  }

  // ---------- 재료·도형 ----------
  private mat(color: number, emissive = 0, ei = 0, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
    const key = `${color}:${emissive}:${ei}:${opts.opacity ?? 1}`; let m = this.mats.get(key) as THREE.MeshLambertMaterial | undefined;
    if (!m) { m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 }); this.mats.set(key, m); this.disposables.push(m); }
    return m;
  }
  private glow(color: number, k = 1): THREE.MeshBasicMaterial {
    const key = `g${color}:${k}`; let m = this.mats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), fog: false }); this.mats.set(key, m); this.disposables.push(m); }
    return m;
  }
  /** 직육면체(좌표는 x0,y0(높이),z0 ~ x1,y1,z1) */
  private box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const o = new THREE.Mesh(this.bx, m); o.scale.set(x1 - x0, y1 - y0, z1 - z0); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(o); return o;
  }
  private tube(x: number, y: number, z: number, r: number, h: number, m: THREE.Material, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const o = new THREE.Mesh(this.cyl, m); o.scale.set(r, h, r); o.position.set(x, y + h / 2, z); parent.add(o); return o;
  }
  private plane(w: number, h: number, map: THREE.Texture, x: number, y: number, z: number, ry = 0, emissive = true): THREE.Mesh {
    const g = new THREE.PlaneGeometry(w, h); this.disposables.push(g, map);
    const m = emissive ? new THREE.MeshBasicMaterial({ map, transparent: true, fog: false }) : new THREE.MeshLambertMaterial({ map, transparent: true }); this.disposables.push(m);
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; this.scene.add(o); return o;
  }
  private light(color: number, intensity: number, x: number, y: number, z: number, dist = 360): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, dist, 1.4); l.position.set(x, y, z); this.scene.add(l); return l;
  }
  private neon(text: string, color: string, w = 150, h = 46): THREE.CanvasTexture {
    return tex(256, 80, g => {
      g.fillStyle = 'rgba(8,8,12,0.9)'; g.beginPath(); g.roundRect(4, 4, 248, 72, 14); g.fill(); g.strokeStyle = color; g.lineWidth = 5; g.shadowColor = color; g.shadowBlur = 14; g.stroke();
      g.fillStyle = color; g.font = "900 46px 'Noto Sans KR',sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 42); void w; void h;
    });
  }

  // ---------- 분위기 ----------
  private mood(k: BizKind): Mood {
    const checker = (a: string, b: string, n = 8): THREE.CanvasTexture => tex(256, 256, g => { const s = 256 / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * s, y * s, s, s); } }, [this.lay.w / 90, this.lay.d / 90]);
    switch (k) {
      case 'store': return { bg: 0xdfe6e4, fog: 0xdfe6e4, fogD: 0.0006, amb: 0xdfe8e6, ambI: 1.15, wall: 0xe8eeea, floor: checker('#e8ece9', '#bcd2c6'), ceil: 0xf2f4f2, trim: 0x3fae6a };
      case 'club': return { bg: 0x08040f, fog: 0x08040f, fogD: 0.0016, amb: 0x3a2060, ambI: 0.55, wall: 0x1a1026, ceil: 0x0e0816, trim: 0xff3fd0,
        floor: tex(256, 256, g => { g.fillStyle = '#0c0814'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(255,70,220,0.55)'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } }, [this.lay.w / 120, this.lay.d / 120]) };
      case 'plant': return { bg: 0x1b2127, fog: 0x1b2127, fogD: 0.0017, amb: 0x7f9bb0, ambI: 0.8, wall: 0x59636b, ceil: 0x2c3238, trim: 0xffc21c,
        floor: tex(256, 256, g => { g.fillStyle = '#6b7178'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(rnd(i) * 256, rnd(i + 9) * 256, 6 + rnd(i + 3) * 22, 2 + rnd(i + 5) * 5); } g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254); }, [this.lay.w / 120, this.lay.d / 120]) };
      case 'casino': return { bg: 0x1c0608, fog: 0x1c0608, fogD: 0.0012, amb: 0xffc7a0, ambI: 0.85, wall: 0x5a0f18, ceil: 0x2a0a0e, trim: 0xffd24a,
        floor: tex(256, 256, g => { g.fillStyle = '#7a1018'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#d9a82c'; g.lineWidth = 3; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const cx = 64 + x * 128, cy = 64 + y * 128; g.beginPath(); g.moveTo(cx, cy - 44); g.lineTo(cx + 44, cy); g.lineTo(cx, cy + 44); g.lineTo(cx - 44, cy); g.closePath(); g.stroke(); g.beginPath(); g.arc(cx, cy, 14, 0, 6.29); g.stroke(); } }, [this.lay.w / 130, this.lay.d / 130]) };
      case 'bank': return { bg: 0xcfc8b8, fog: 0xcfc8b8, fogD: 0.0007, amb: 0xfff1d6, ambI: 1.0, wall: 0xded6c4, ceil: 0xece6d8, trim: 0xc9a227, floor: checker('#efe9dc', '#9a9c9f', 6) };
      case 'gunshop': return { bg: 0x120c0b, fog: 0x120c0b, fogD: 0.0014, amb: 0xc0a090, ambI: 0.7, wall: 0x2c2522, ceil: 0x1a1412, trim: 0xff3b30,
        floor: tex(256, 256, g => { g.fillStyle = '#3a3836'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},0.06)`; g.fillRect(rnd(i + 1) * 256, rnd(i + 7) * 256, 4 + rnd(i + 2) * 18, 2 + rnd(i + 8) * 4); } g.strokeStyle = 'rgba(0,0,0,0.5)'; g.strokeRect(0, 0, 256, 256); }, [this.lay.w / 100, this.lay.d / 100]) };
    }
  }

  /** 바닥·천장·벽·출입문 */
  private shell(m: Mood): void {
    const { w: W, d: D, h: H } = this.lay, wall = this.mat(m.wall), trim = this.mat(m.trim, m.trim, this.lay.kind === 'club' ? 0.9 : 0.15), dk = this.mat(0x15171b);
    this.disposables.push(m.floor);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: m.floor })); floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, D / 2); this.scene.add(floor); this.disposables.push(floor.geometry, floor.material as THREE.Material);
    this.box(0, H, 0, W, H + 4, D, this.mat(m.ceil));
    const gap = 46; // 출입문 반폭
    this.box(-6, 0, -6, W + 6, H, 0, wall); this.box(-6, 0, -6, 0, H, D + 6, wall); this.box(W, 0, -6, W + 6, H, D + 6, wall);
    this.box(-6, 0, D, W / 2 - gap, H, D + 6, wall); this.box(W / 2 + gap, 0, D, W + 6, H, D + 6, wall); this.box(W / 2 - gap, 92, D, W / 2 + gap, H, D + 6, wall);
    // 문틀 + 바깥 거리의 빛(노을)
    this.box(W / 2 - gap - 4, 0, D - 4, W / 2 - gap, 92, D + 8, dk); this.box(W / 2 + gap, 0, D - 4, W / 2 + gap + 4, 92, D + 8, dk); this.box(W / 2 - gap - 4, 88, D - 4, W / 2 + gap + 4, 96, D + 8, dk);
    const out = tex(64, 128, g => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#f6c08a'); gr.addColorStop(0.55, '#ffd9a8'); gr.addColorStop(1, '#7b7f88'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); });
    this.plane(gap * 2, 92, out, W / 2, 46, D + 10, Math.PI, true);
    const exit = tex(128, 48, g => { g.fillStyle = '#0b3d1e'; g.fillRect(0, 0, 128, 48); g.fillStyle = '#7dffb0'; g.font = '900 32px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT ▼', 64, 26); });
    this.plane(52, 20, exit, W / 2, 106, D - 2, Math.PI, true);
    // 걸레받이·몰딩
    this.box(0, 0, 0, W, 9, 3, trim); this.box(0, 0, 0, 3, 9, D, trim); this.box(W - 3, 0, 0, W, 9, D, trim); this.box(0, H - 8, 0, W, H, 3, trim); this.box(0, H - 8, 0, 3, H, D, trim); this.box(W - 3, H - 8, 0, W, H, D, trim);
  }

  // ---------- 가구 ----------
  private furniture(): void {
    const { kind } = this.lay, bm = BIZ[kind], col = new THREE.Color(bm.color).getHex();
    const prod = this.quality === 'low' ? 0 : 900;
    const items = prod ? new THREE.InstancedMesh(this.bx, new THREE.MeshLambertMaterial({ color: 0xffffff }), prod) : null; let ni = 0;
    if (items) { this.scene.add(items); this.disposables.push(items.material as THREE.Material, items); }
    const dummy = new THREE.Object3D(), pal = [0xe94b4b, 0xf5c242, 0x4fa3ff, 0x5ed388, 0xff8fd2, 0xf2f2f2, 0xb77bff, 0xff9a3c];
    const stock = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number): void => { if (!items || ni >= prod) return; dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); items.setMatrixAt(ni, dummy.matrix); items.setColorAt(ni, new THREE.Color(c)); ni++; };
    for (const s of this.lay.solids) {
      const { x0, y0: z0, x1, y1: z1, h } = s, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
      switch (s.style) {
        case 'counter': case 'glass': {
          this.box(x0, 0, z0, x1, h, z1, this.mat(kind === 'bank' ? 0x6b4a2e : kind === 'club' ? 0x1b1424 : kind === 'casino' ? 0x3a0d12 : kind === 'plant' ? 0x4b5560 : kind === 'gunshop' ? 0x3a2a20 : 0xf4f6f4, kind === 'club' ? col : 0, kind === 'club' ? 0.35 : 0));
          this.box(x0 - 2, h, z0 - 2, x1 + 2, h + 3, z1 + 2, this.mat(kind === 'bank' || kind === 'casino' ? 0xd8b24a : kind === 'gunshop' ? 0x16181c : 0xcfd6d4, kind === 'bank' ? 0x3a2b00 : 0, 0.3));
          if (s.style === 'glass') { // 유리 진열장 + 내용물
            const g = this.box(x0, h + 3, z0, x1, h + 22, z1, this.mat(0x9fd6ff, 0x0f2a40, 0.4, { transparent: true, opacity: 0.22 }), this.scene); g.renderOrder = 3;
            if (kind === 'gunshop') for (let i = 0; i < Math.floor(w / 46); i++) this.box(x0 + 10 + i * 46, h + 4, cz - 3, x0 + 10 + i * 46 + 32, h + 9, cz + 3, this.mat(0x1a1c20, 0x330000, 0.4));
            else if (kind === 'bank') for (let i = 0; i < 4; i++) this.box(x0 + w * 0.2 + i * w * 0.2 - 6, 0, z0 - 1, x0 + w * 0.2 + i * w * 0.2 + 6, h + 22, z0 + 1, this.mat(0x2a2a2a));   // 창구 칸막이
          }
          // 계산대 위 단말기 (손님 쪽)
          const sx = Math.max(x0 + 12, Math.min(x1 - 24, this.lay.counterSpot.x - (kind === 'club' ? 22 : 0))), sz = Math.max(z0 + 4, Math.min(z1 - 12, this.lay.counterSpot.y - (kind === 'club' ? 0 : 0)));
          const reg = new THREE.Group(); const standX = this.lay.counterSpot.x > x1; reg.position.set(standX ? x1 - 16 : kind === 'club' ? cx : sx, h + 3, standX ? sz : z1 - 14);
          this.box(-9, 0, -6, 9, 8, 6, this.mat(0x222428), reg); const scr = this.box(-7, 8, -1, 7, 15, 2, this.glow(0x7dffb0), reg); scr.rotation.x = -0.35; this.scene.add(reg);
          break;
        }
        case 'shelf': case 'rack': {
          this.box(x0, 0, z0, x1, 4, z1, this.mat(0x9aa4a0)); this.box(x0, 4, z0 + d * 0.45, x1, h, z1 - d * 0.45, this.mat(0xb8c0bc));
          const lv = s.style === 'rack' ? 3 : 3;
          for (let l = 0; l < lv; l++) {
            const y = 6 + l * (h - 10) / lv; this.box(x0, y, z0, x1, y + 2, z1, this.mat(0x8a928e));
            for (let i = 0; i < Math.floor(w / 9); i++) { const c = pal[Math.floor(rnd(i * 3 + l * 17 + cx) * pal.length)]; stock(x0 + 5 + i * 9, y + 6, z0 + 4, 7, 9 + rnd(i + l) * 5, 5, c); stock(x0 + 5 + i * 9, y + 6, z1 - 4, 7, 9 + rnd(i + l + 5) * 5, 5, c); }
          }
          break;
        }
        case 'fridge': {
          this.box(x0, 0, z0, x1, h, z1, this.mat(0x2b3138));
          const door = tex(64, 128, g => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#dff4ff'); gr.addColorStop(1, '#9fd2f2'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { g.fillStyle = ['#e94b4b', '#f5c242', '#4fa3ff', '#5ed388', '#ff8fd2'][(r * 3 + c * 7) % 5]; g.fillRect(3 + c * 10, 10 + r * 28, 7, 20); } g.strokeStyle = '#26303a'; g.lineWidth = 3; g.strokeRect(1, 1, 62, 126); });
          for (let i = 0; i < Math.floor(w / 40); i++) this.plane(36, h - 12, door, x0 + 20 + i * 40, h / 2, z1 + 0.6, 0, true);
          break;
        }
        case 'dj': {
          this.box(x0, 0, z0, x1, h, z1, this.mat(0x14101c, col, 0.25)); this.box(x0, h, z0, x1, h + 3, z1, this.mat(0x30263f));
          for (const dx of [0.28, 0.72]) { this.tube(x0 + w * dx, h + 3, cz, 14, 3, this.mat(0x0a0a0c)); this.tube(x0 + w * dx, h + 6, cz, 4, 1, this.glow(0xffffff)); }
          const led = tex(128, 64, g => { g.fillStyle = '#10051c'; g.fillRect(0, 0, 128, 64); for (let i = 0; i < 24; i++) { g.fillStyle = ['#ff3fd0', '#35d9e6', '#b77bff', '#ffd84a'][i % 4]; g.fillRect(i * 5.3, 64 - 8 - rnd(i) * 44, 4, 8 + rnd(i) * 44); } });
          const lp = this.plane(w * 0.9, 56, led, cx, 88, 2.5, 0, true); this.anim.push(t => { (lp.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.15) % 1, 0.7, 0.7); });
          break;
        }
        case 'speaker': {
          this.box(x0, 0, z0, x1, h, z1, this.mat(0x0e0e12)); for (const yy of [h * 0.3, h * 0.7]) { const c = this.tube(cx, yy, z1 + 0.5, w * 0.34, 1.5, this.mat(0x25252c)); c.rotation.x = Math.PI / 2; c.position.set(cx, yy, z1 + 0.8); this.tube(cx, yy, z1 + 1.8, 3, 1, this.glow(col)).rotation.x = Math.PI / 2; }
          break;
        }
        case 'sofa': this.box(x0, 0, z0, x1, h, z1, this.mat(0x6b2a8f, 0x2a0a40, 0.4)); this.box(x0, h, z0, x0 + 10, h + 24, z1, this.mat(0x7a3aa0, 0x2a0a40, 0.4)); this.box(x0 + 12, h - 2, z0 + 3, x1 - 3, h + 3, z1 - 3, this.mat(0x8a4ab0)); break;
        case 'tank': {
          const r = Math.min(w, d) / 2 - 3; this.tube(cx, 0, cz, r + 3, 10, this.mat(0x2f353b)); const t = this.tube(cx, 10, cz, r, h - 20, this.mat(0x4fd6ff, 0x1a8fb0, 0.85, { transparent: true, opacity: 0.8 })); this.tube(cx, h - 10, cz, r + 3, 10, this.mat(0x2f353b));
          for (const yy of [30, 60, 86]) this.tube(cx, yy, cz, r + 1.5, 4, this.mat(0x3a4148));
          this.anim.push(tm => { (t.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.7 + Math.sin(tm * 2 + cx) * 0.2; });
          break;
        }
        case 'machine': this.box(x0, 0, z0, x1, h, z1, this.mat(0x5d6b78)); this.box(x0 + 6, h * 0.35, z1, x1 - 6, h * 0.8, z1 + 2, this.mat(0x1c2630, 0x2fd6ff, 0.5)); this.tube(cx, h, cz, 6, 14, this.mat(0x3a4148)); { const b = this.tube(x1 - 8, h, z0 + 8, 4, 5, this.glow(0xff7a2a)); this.anim.push(tm => { b.visible = Math.floor(tm * 3) % 2 === 0; }); } break;
        case 'crate': this.box(x0, 0, z0, x1, h, z1, this.mat(0x9a7646)); this.box(x0 - 1, h * 0.45, z0 - 1, x1 + 1, h * 0.55, z1 + 1, this.mat(0x6d522f)); this.box(x0 + 5, h, z0 + 5, x1 - 5, h + 14, z1 - 5, this.mat(0xa98050)); break;
        case 'slot': {
          const n = Math.floor(d / 34), face = cx < this.lay.w / 2 ? 1 : -1;
          for (let i = 0; i < n; i++) {
            const zz0 = z0 + 2 + i * 34, zz1 = zz0 + 30; this.box(x0, 0, zz0, x1, h, zz1, this.mat(0x2b0d12, 0x4a0a14, 0.4)); this.box(x0 + (face > 0 ? 0 : w * 0.5), h, zz0, x1 - (face > 0 ? w * 0.5 : 0), h + 14, zz1, this.mat(0xd9a82c, 0x6a4a00, 0.6));
            const c = pal[i % pal.length], scr = this.box(face > 0 ? x1 : x0 - 1, h * 0.45, zz0 + 4, face > 0 ? x1 + 1 : x0, h * 0.85, zz1 - 4, this.glow(c, 0.9)); this.anim.push(tm => { scr.visible = Math.sin(tm * (3 + i * 0.7) + i) > -0.6; });
          }
          break;
        }
        case 'table': {
          this.box(x0, 0, z0, x1, h - 4, z1, this.mat(0x1a0f0a)); this.box(x0 - 3, h - 4, z0 - 3, x1 + 3, h, z1 + 3, this.mat(0x0f6b3a, 0x04200f, 0.5)); this.box(x0 - 3, h, z0 - 3, x1 + 3, h + 2, z0 - 1, this.mat(0x5a2d12));
          if (cx < this.lay.w / 2) { this.tube(cx, h, cz, 17, 3, this.mat(0x2a1a0e)); const wh = this.tube(cx, h + 3, cz, 13, 2, this.mat(0xc9a227, 0x6a4a00, 0.7)); this.anim.push(tm => { wh.rotation.y = tm * 1.4; }); }
          else for (let i = 0; i < 5; i++) this.tube(x0 + 14 + i * 12, h, cz - 10, 4.5, 2 + (i % 2), this.mat([0xe94b4b, 0x4fa3ff, 0xf2f2f2, 0x1c1c1c, 0xffd24a][i]));
          break;
        }
        case 'column': this.tube(cx, 0, cz, w * 0.62, 10, this.mat(0xd8b24a)); this.tube(cx, 10, cz, w * 0.42, h - 20, this.mat(0xf1ece0)); this.tube(cx, h - 10, cz, w * 0.62, 10, this.mat(0xd8b24a)); break;
        case 'bench': this.box(x0, 0, z0, x1, h * 0.55, z1, this.mat(0x2a1c12)); this.box(x0 + 2, h * 0.55, z0 + 2, x1 - 2, h, z1 - 2, this.mat(0x6b2a2a)); break;
      }
    }
    if (items) { items.count = ni; items.instanceMatrix.needsUpdate = true; if (items.instanceColor) items.instanceColor.needsUpdate = true; }
    void col;
  }

  // ---------- 업종별 꾸밈 ----------
  private decor(kind: BizKind): void {
    const { w: W, d: D, h: H } = this.lay, bm = BIZ[kind], col = new THREE.Color(bm.color).getHex();
    const sign = (c: string, text: string, x: number, y: number, z: number, wd = 150): void => { this.plane(wd, wd * 0.31, this.neon(text, c), x, y, z, 0, true); };
    const panel = (x: number, z: number, wx: number, wz: number, c: number, k = 1): void => { this.box(x - wx / 2, H - 1.5, z - wz / 2, x + wx / 2, H, z + wz / 2, this.glow(c, k)); };
    if (kind === 'store') {
      for (const x of [90, 220, 350]) for (const z of [70, 170, 270]) panel(x, z, 70, 22, 0xffffff);
      this.light(0xf0f8ff, 1.3, 110, 100, 90); this.light(0xf0f8ff, 1.2, 330, 100, 90); this.light(0xf0f8ff, 1.1, 220, 100, 240);
      sign(bm.color, bm.sign, 110, 100, 2, 130);
      for (let i = 0; i < 3; i++) { this.box(250 + i * 50, H - 22, 100, 290 + i * 50, H - 8, 102, this.mat(0x3fae6a)); this.box(250 + i * 50, H - 22, 168, 290 + i * 50, H - 8, 170, this.mat(0xffb347)); }
      this.box(W / 2 - 40, 0.5, D - 30, W / 2 + 40, 1.5, D - 6, this.mat(0x3a3a3a));      // 출입 매트
      for (let i = 0; i < 6; i++) this.box(10, 40 + (i % 3) * 22, 40 + Math.floor(i / 3) * 60, 12, 56 + (i % 3) * 22, 80 + Math.floor(i / 3) * 60, this.mat([0xe94b4b, 0x4fa3ff, 0xf5c242, 0x5ed388][i % 4]));   // 벽 포스터
      const food = this.box(196, 40, 56, 206, 62, 82, this.mat(0xd9352a, 0x601010, 0.6)); void food;      // 핫푸드 보온기
    } else if (kind === 'club') {
      // 댄스 플로어
      const tiles: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const t = this.box(110 + i * 36, 0.6, 96 + j * 36, 110 + i * 36 + 34, 1.4, 96 + j * 36 + 34, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); tiles.push(t); this.disposables.push(t.material as THREE.Material); }
      this.anim.push(tm => { tiles.forEach((t, k) => { (t.material as THREE.MeshBasicMaterial).color.setHSL(((tm * 0.25 + (k % 5) * 0.08 + Math.floor(k / 5) * 0.12) % 1), 0.85, 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(tm * 4 + k))); }); });
      // 미러볼 + 회전 조명
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 1), new THREE.MeshLambertMaterial({ color: 0xdfe6ff, emissive: 0x8899ff, emissiveIntensity: 0.6, flatShading: true })); ball.position.set(200, H - 28, 150); this.scene.add(ball); this.disposables.push(ball.geometry, ball.material as THREE.Material);
      this.box(199, H - 14, 149, 201, H, 151, this.mat(0x111111));
      const ls = [this.light(0xff3fd0, 2.4, 120, 90, 120, 420), this.light(0x35d9e6, 2.4, 280, 90, 200, 420), this.light(0xb77bff, 2.0, 200, 80, 260, 380)];
      this.anim.push(tm => { ball.rotation.y = tm * 0.8; ls.forEach((l, i) => { l.position.x = 200 + Math.cos(tm * 0.9 + i * 2.1) * 120; l.position.z = 160 + Math.sin(tm * 0.9 + i * 2.1) * 80; }); });
      // 네온 튜브 + 레이저
      this.box(3, 100, 3, W - 3, 103, 5, this.glow(0xff3fd0)); this.box(3, 40, 3, 5, 43, D - 3, this.glow(0x35d9e6)); this.box(W - 5, 40, 3, W - 3, 43, D - 3, this.glow(0xb77bff));
      sign('#ff6ad5', 'CLUB', 220, 98, 6, 150);
      if (this.quality !== 'low') { const lasers = new THREE.Group(); for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(this.cyl, new THREE.MeshBasicMaterial({ color: [0xff3fd0, 0x35d9e6, 0x7dff6a][i % 3], transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); b.scale.set(0.5, 240, 0.5); b.position.set(0, 0, 0); b.rotation.z = Math.PI / 2; const piv = new THREE.Group(); piv.position.set(60 + i * 80, H - 12, 40); piv.add(b); b.position.x = 120; lasers.add(piv); this.disposables.push(b.material as THREE.Material); this.anim.push(tm => { piv.rotation.y = Math.sin(tm * 0.7 + i) * 0.9 + 1.2; piv.rotation.z = Math.sin(tm * 1.1 + i * 2) * 0.25 - 0.25; }); } this.scene.add(lasers); }
      // 바 뒤 술병 선반
      for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) this.box(426, 34 + r * 26, 90 + i * 17, 432, 54 + r * 26, 98 + i * 17, this.glow([0xff3fd0, 0x35d9e6, 0xffd84a, 0x7dff6a][(i + r) % 4], 0.8));
    } else if (kind === 'plant') {
      // 경고 줄무늬, 천장 배관, 발광 파이프
      const hz = tex(64, 16, g => { for (let i = -2; i < 10; i++) { g.fillStyle = i % 2 ? '#ffc21c' : '#1c1c1c'; g.beginPath(); g.moveTo(i * 8, 16); g.lineTo(i * 8 + 8, 0); g.lineTo(i * 8 + 16, 0); g.lineTo(i * 8 + 8, 16); g.fill(); } }, [14, 1]);
      this.disposables.push(hz); for (const [x0, z0, x1, z1] of [[0, 150, W, 158], [214, 0, 222, D]]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ map: hz })); f.rotation.x = -Math.PI / 2; f.position.set((x0 + x1) / 2, 0.8, (z0 + z1) / 2); if (x1 - x0 < z1 - z0) f.material.map!.repeat.set(1, 14); this.scene.add(f); }
      for (let i = 0; i < 4; i++) { const p = this.tube(0, 0, 0, 5, W, this.mat(0x7a858f)); p.rotation.z = Math.PI / 2; p.position.set(W / 2, H - 14 - i * 9, 40 + i * 70); }
      for (let i = 0; i < 3; i++) { const p = this.tube(0, 0, 0, 3.5, D, this.glow(0x35d9e6, 0.9)); p.rotation.x = Math.PI / 2; p.position.set(60 + i * 160, H - 24, D / 2); }
      for (let i = 0; i < 6; i++) { const lamp = this.box(60 + i * 64, H - 10, 90, 84 + i * 64, H - 4, 100, this.glow(0xfff0c0)); void lamp; }
      this.light(0xcfe6ff, 1.2, 110, 110, 100); this.light(0xcfe6ff, 1.1, 330, 110, 200); const wl = this.light(0xff7a2a, 1.4, 400, 90, 290, 260); this.anim.push(tm => { wl.intensity = 0.4 + 1.0 * Math.abs(Math.sin(tm * 2.2)); });
      sign('#7fd8ff', bm.sign, 92, 100, 2, 130);
      for (let i = 0; i < 5; i++) { const c = this.tube(250 + i * 30, 0, 304, 7, 11, this.mat(0x52d9ff, 0x1a7fa8, 1)); c.rotation.y = i; }        // 크리스탈 용기
      this.box(0, 30, 90, 3, 110, 150, this.mat(0x23303c, 0x2fd6ff, 0.5));                                                                  // 벽 계기판
    } else if (kind === 'casino') {
      for (const [x, z] of [[110, 120], [330, 120], [220, 230]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 2, 8, 24), this.mat(0xd9a82c, 0x6a4a00, 0.8)); ring.rotation.x = Math.PI / 2; ring.position.set(x, H - 20, z); this.scene.add(ring); this.disposables.push(ring.geometry); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; this.box(x + Math.cos(a) * 24 - 1.5, H - 26, z + Math.sin(a) * 24 - 1.5, x + Math.cos(a) * 24 + 1.5, H - 20, z + Math.sin(a) * 24 + 1.5, this.glow(0xffe9a8)); } this.tube(x, H - 20, z, 1, 20, this.mat(0xd9a82c)); }
      const l1 = this.light(0xffd9a0, 2.0, 220, 100, 130, 460), l2 = this.light(0xff9a60, 1.2, 100, 90, 250, 300), l3 = this.light(0xff9a60, 1.2, 340, 90, 250, 300); this.anim.push(tm => { l1.intensity = 1.9 + Math.sin(tm * 1.7) * 0.15; void l2; void l3; });
      sign('#ffd84a', '777', 220, 98, 2, 150);
      for (const x of [60, 160, 280, 380]) this.box(x, 0, 1, x + 3, H, 4, this.mat(0xd9a82c, 0x6a4a00, 0.5));     // 벽 금장
      this.box(2, 66, 90, 5, 70, 280, this.glow(0xffd24a)); this.box(W - 5, 66, 90, W - 2, 70, 280, this.glow(0xffd24a));
      const carpet = this.box(W / 2 - 40, 0.6, D - 90, W / 2 + 40, 1.2, D - 4, this.mat(0x2a0a0e)); void carpet;
    } else if (kind === 'bank') {
      // 금고문 + 펜던트 램프
      const vx = W / 2, vz = 3; const vault = new THREE.Group(); vault.position.set(vx, 66, vz + 8); const dsk = new THREE.Mesh(this.cyl, this.mat(0x8c939b)); dsk.scale.set(50, 12, 50); dsk.rotation.x = Math.PI / 2; vault.add(dsk);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(50, 4, 8, 28), this.mat(0xc9a227, 0x3a2b00, 0.5)); vault.add(rim); this.disposables.push(rim.geometry);
      const hub = new THREE.Mesh(this.cyl, this.mat(0xc9a227)); hub.scale.set(9, 16, 9); hub.rotation.x = Math.PI / 2; vault.add(hub); for (let i = 0; i < 3; i++) { const sp = this.box(-3, -34, 8, 3, 34, 12, this.mat(0xc9a227), vault); sp.rotation.z = i * Math.PI / 3; } this.scene.add(vault);
      for (const x of [90, 220, 350]) { this.tube(x, H - 30, 150, 0.6, 30, this.mat(0x222222)); this.tube(x, H - 38, 150, 10, 8, this.mat(0x1f6b45, 0x1f6b45, 0.5)); this.light(0xffe9b8, 1.1, x, H - 40, 150, 360); }
      this.box(0, 90, 0, W, 94, 3, this.mat(0xc9a227)); sign('#e8d28a', 'BANK', 80, 100, 2, 110); sign('#e8d28a', 'BANK', 360, 100, 2, 110);
      this.box(W / 2 - 60, 0.6, 108, W / 2 + 60, 1.2, 330, this.mat(0x7a1c1c));                                                       // 레드 카펫
      for (const x of [118, 322]) { this.tube(x, 0, 120, 8, 12, this.mat(0xb5651d)); const l = this.tube(x, 12, 120, 12, 26, this.mat(0x2f8f4e)); l.scale.y = 26; }   // 화분
    } else {
      // 무기상: 벽 총기 진열 + 붉은 네온
      for (let r = 0; r < 3; r++) { this.box(60, 32 + r * 26, 2, W - 60, 34 + r * 26, 6, this.mat(0x4a3322)); for (let i = 0; i < 9; i++) { const c = [0x1a1c20, 0x2b2d31, 0x3a2a1a][(i + r) % 3]; this.box(70 + i * 38, 36 + r * 26, 2, 70 + i * 38 + 30, 40 + r * 26, 5, this.mat(c)); this.box(70 + i * 38 + 22, 31 + r * 26, 2, 70 + i * 38 + 28, 36 + r * 26, 5, this.mat(c)); } }
      sign('#ff5d5d', 'GUNS', 220, 108, 2, 160);
      const rl = this.light(0xff3b30, 1.6, 220, 90, 70, 340), wl = this.light(0xffd9a0, 1.0, 220, 100, 220, 380); this.anim.push(tm => { rl.intensity = 1.3 + Math.sin(tm * 6) * 0.15 * (Math.sin(tm * 0.7) > 0.8 ? 3 : 0.5); void wl; });
      for (const x of [100, 340]) { this.tube(x, H - 28, 190, 0.6, 28, this.mat(0x222222)); this.tube(x, H - 34, 190, 8, 6, this.glow(0xffc47a)); }
      const tgt = tex(64, 96, g => { g.fillStyle = '#f2ead0'; g.fillRect(0, 0, 64, 96); g.fillStyle = '#c92a2a'; for (const r of [28, 18, 8]) { g.beginPath(); g.arc(32, 48, r, 0, 6.29); g.fillStyle = r === 18 ? '#f2ead0' : '#c92a2a'; g.fill(); } }); this.plane(40, 60, tgt, 3, 70, 230, Math.PI / 2, false); this.plane(40, 60, tgt, W - 3, 70, 120, -Math.PI / 2, false);
      for (let i = 0; i < 5; i++) this.tube(114 + (i % 3) * 8, 0, 296 + Math.floor(i / 3) * 6, 9, 8, this.mat(0x7a6a4a));         // 모래주머니
    }
    void col;
  }

  /** 카운터 안쪽의 점원(단순 인형) */
  private person(): void {
    const k = this.lay.kind, g = this.clerk, shirt = { store: 0x3fae6a, club: 0x1b1b22, plant: 0xff8a1c, casino: 0x8a1c2a, bank: 0x22344f, gunshop: 0x2e3a22 }[k];
    this.tube(0, 0, 0, 7, 28, this.mat(0x2a2d34), g); this.tube(0, 28, 0, 9, 30, this.mat(shirt), g); const head = new THREE.Mesh(this.sph, this.mat(0xe0b08c)); head.scale.setScalar(8); head.position.y = 66; g.add(head);
    const hat = k === 'bank' ? null : this.tube(0, 70, 0, 8.6, 4, this.mat(k === 'store' ? 0x3fae6a : k === 'gunshop' ? 0x3a3f2a : k === 'plant' ? 0xffc21c : 0x111111), g); void hat;
    this.box(-11, 44, -3, -7, 58, 3, this.mat(shirt), g); this.box(7, 44, -3, 11, 58, 3, this.mat(shirt), g);
    g.position.set(this.lay.clerk.x, 0, this.lay.clerk.y); g.rotation.y = 0; this.scene.add(g);
  }

  /** 첫 프레임 전 카메라와 점원 위치 갱신 + 애니메이션 */
  update(t: number, x: number, y: number, yaw: number, pitch: number, bob: number, aspect: number): void {
    for (const a of this.anim) a(t);
    this.clerk.position.y = Math.sin(t * 1.6) * 0.5; this.clerk.rotation.y = Math.sin(t * 0.5) * 0.12;
    if (Math.abs(this.camera.aspect - aspect) > 1e-3) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
    const cp = Math.cos(pitch);
    this.camera.position.set(x, EYE_IN + bob, y); this.camera.lookAt(x + Math.cos(yaw) * cp * 100, EYE_IN + bob + Math.sin(pitch) * 100, y + Math.sin(yaw) * cp * 100);
  }
  dispose(): void { for (const d of this.disposables) d.dispose(); this.disposables.length = 0; this.scene.clear(); }
}
export type { Solid };
