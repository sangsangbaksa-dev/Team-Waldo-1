/** Infrastructure: one skinned body plus rigid face, hair, and clothes. No box limbs. */

import * as T from 'three';
import { mulberry, type Wardrobe } from './domain';

export const REST_HIP = 0.88;

const B = {
  pelvis: 0, spine: 1, chest: 2, neck: 3, head: 4,
  lShoulder: 5, lElbow: 6, lHand: 7,
  rShoulder: 8, rElbow: 9, rHand: 10,
  lThigh: 11, lKnee: 12, lFoot: 13,
  rThigh: 14, rKnee: 15, rFoot: 16,
} as const;

const SKIN = 0;
const TOP = 1;
const CLOTH = 2;
const BOTTOM = 3;

export interface FigureBones {
  pelvis: T.Bone;
  spine: T.Bone;
  chest: T.Bone;
  neck: T.Bone;
  head: T.Bone;
  lShoulder: T.Bone;
  lElbow: T.Bone;
  lHand: T.Bone;
  rShoulder: T.Bone;
  rElbow: T.Bone;
  rHand: T.Bone;
  lThigh: T.Bone;
  lKnee: T.Bone;
  lFoot: T.Bone;
  rThigh: T.Bone;
  rKnee: T.Bone;
  rFoot: T.Bone;
  order: T.Bone[];
}

export interface Figure {
  body: T.SkinnedMesh;
  phone: T.Object3D;
  lPlant: T.Object3D;
  rPlant: T.Object3D;
  geometries: T.BufferGeometry[];
}

interface V { x: number; y: number; z: number }
interface W { a: number; b: number; w: number }

function bone(name: string): T.Bone {
  const joint = new T.Bone();
  joint.name = name;
  return joint;
}

export function createFigureBones(wardrobe: Wardrobe): FigureBones {
  const sx = wardrobe.shoulders * 0.3;
  const hx = wardrobe.hips * 0.36;
  const pelvis = bone('pelvis');
  pelvis.position.y = REST_HIP;
  const spine = bone('spine');
  spine.position.y = 0.14;
  pelvis.add(spine);
  const chest = bone('chest');
  chest.position.set(0, 0.22, 0.006);
  spine.add(chest);
  const neck = bone('neck');
  neck.position.y = 0.22;
  chest.add(neck);
  const head = bone('head');
  head.position.set(0, 0.08, 0.004);
  neck.add(head);
  const lShoulder = bone('lShoulder');
  lShoulder.position.set(-sx, 0.18, 0.02);
  chest.add(lShoulder);
  const lElbow = bone('lElbow');
  lElbow.position.set(-0.03, -0.3, 0);
  lShoulder.add(lElbow);
  const lHand = bone('lHand');
  lHand.position.set(0, -0.26, 0.012);
  lElbow.add(lHand);
  const rShoulder = bone('rShoulder');
  rShoulder.position.set(sx, 0.18, 0.02);
  chest.add(rShoulder);
  const rElbow = bone('rElbow');
  rElbow.position.set(0.03, -0.3, 0);
  rShoulder.add(rElbow);
  const rHand = bone('rHand');
  rHand.position.set(0, -0.26, 0.012);
  rElbow.add(rHand);
  const lThigh = bone('lThigh');
  lThigh.position.set(-hx, 0, 0);
  pelvis.add(lThigh);
  const lKnee = bone('lKnee');
  lKnee.position.y = -0.44;
  lThigh.add(lKnee);
  const lFoot = bone('lFoot');
  lFoot.position.set(0, -0.36, 0.012);
  lKnee.add(lFoot);
  const rThigh = bone('rThigh');
  rThigh.position.set(hx, 0, 0);
  pelvis.add(rThigh);
  const rKnee = bone('rKnee');
  rKnee.position.y = -0.44;
  rThigh.add(rKnee);
  const rFoot = bone('rFoot');
  rFoot.position.set(0, -0.36, 0.012);
  rKnee.add(rFoot);
  return {
    pelvis, spine, chest, neck, head,
    lShoulder, lElbow, lHand, rShoulder, rElbow, rHand,
    lThigh, lKnee, lFoot, rThigh, rKnee, rFoot,
    order: [pelvis, spine, chest, neck, head, lShoulder, lElbow, lHand, rShoulder, rElbow, rHand, lThigh, lKnee, lFoot, rThigh, rKnee, rFoot],
  };
}

class Builder {
  private readonly pos: number[] = [];
  private readonly idx: number[] = [];
  private readonly skinI: number[] = [];
  private readonly skinW: number[] = [];
  private readonly groups: { start: number; count: number; mat: number }[] = [];
  private mark = 0;

  begin(): void {
    this.mark = this.idx.length;
  }

  vertex(x: number, y: number, z: number, weight: W): number {
    this.pos.push(x, y, z);
    const w = Math.max(0, Math.min(1, weight.w));
    this.skinI.push(weight.a, weight.b, 0, 0);
    this.skinW.push(1 - w, w, 0, 0);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  end(mat: number, outwardFrom?: V): void {
    if (outwardFrom && this.idx.length >= this.mark + 3) this.faceOut(outwardFrom);
    const count = this.idx.length - this.mark;
    if (count > 0) this.groups.push({ start: this.mark, count, mat });
  }

  finish(): T.BufferGeometry {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.skinI, 4));
    geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(this.skinW, 4));
    geometry.setIndex(this.idx);
    for (const group of this.groups) geometry.addGroup(group.start, group.count, group.mat);
    geometry.computeVertexNormals();
    return geometry;
  }

  private at(index: number): V {
    return { x: this.pos[index * 3]!, y: this.pos[index * 3 + 1]!, z: this.pos[index * 3 + 2]! };
  }

  private faceOut(origin: V): void {
    const triangles = (this.idx.length - this.mark) / 3;
    const stride = Math.max(1, Math.floor(triangles / 8));
    let score = 0;
    for (let t = 0; t < triangles; t += stride) {
      const i = this.mark + t * 3;
      const a = this.at(this.idx[i]!);
      const b = this.at(this.idx[i + 1]!);
      const c = this.at(this.idx[i + 2]!);
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const n = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
      const mid = { x: (a.x + b.x + c.x) / 3 - origin.x, y: (a.y + b.y + c.y) / 3 - origin.y, z: (a.z + b.z + c.z) / 3 - origin.z };
      score += Math.sign(n.x * mid.x + n.y * mid.y + n.z * mid.z);
    }
    if (score >= 0) return;
    for (let i = this.mark; i < this.idx.length; i += 3) {
      const swap = this.idx[i + 1]!;
      this.idx[i + 1] = this.idx[i + 2]!;
      this.idx[i + 2] = swap;
    }
  }
}

function wp(joint: T.Object3D): V {
  const v = new T.Vector3();
  joint.getWorldPosition(v);
  return { x: v.x, y: v.y, z: v.z };
}

function mid(a: V, b: V): V {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function addLimb(builder: Builder, from: V, to: V, r0: number, r1: number, weightAt: (t: number) => W, mat: number, knit = false): void {
  const segs = 12;
  const slices = 8;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const yx = dx / len;
  const yy = dy / len;
  const yz = dz / len;
  const hx = Math.abs(yy) > 0.85 ? 1 : 0;
  const hy = Math.abs(yy) > 0.85 ? 0 : 1;
  let xx = hy * yz;
  let xy = -hx * yz;
  let xz = hx * yy - hy * yx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const zx = xy * yz - xz * yy;
  const zy = xz * yx - xx * yz;
  const zz = xx * yy - xy * yx;
  builder.begin();
  const rows: number[][] = [];
  for (let s = 0; s <= slices; s += 1) {
    const t = s / slices;
    const rib = knit ? 1 + Math.sin(t * 28) * 0.04 : 1;
    const r = (r0 + (r1 - r0) * t) * rib;
    const weight = weightAt(t);
    const row: number[] = [];
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const sng = Math.sin(a) * r;
      row.push(builder.vertex(
        from.x + dx * t + xx * c + zx * sng,
        from.y + dy * t + xy * c + zy * sng,
        from.z + dz * t + xz * c + zz * sng,
        weight,
      ));
    }
    rows.push(row);
  }
  for (let s = 0; s < slices; s += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = rows[s]![i]!;
      const c = rows[s]![i + 1]!;
      const d = rows[s + 1]![i]!;
      const e = rows[s + 1]![i + 1]!;
      builder.tri(a, d, c);
      builder.tri(c, d, e);
    }
  }
  builder.end(mat, mid(from, to));
}

function addLoft(builder: Builder, rings: { y: number; rx: number; rz: number; z: number; bone: number; next: number; blend: number }[], mat: number, gap: number, knit: boolean): void {
  const segs = 20;
  const start = gap;
  const sweep = Math.PI * 2 - gap * 2;
  builder.begin();
  const rows: number[][] = [];
  for (const ring of rings) {
    const row: number[] = [];
    const weight = { a: ring.bone, b: ring.next, w: ring.blend };
    for (let i = 0; i <= segs; i += 1) {
      const theta = start + sweep * (i / segs);
      const front = Math.max(0, Math.cos(theta));
      const rib = knit ? 1 + Math.sin(ring.y * 46 + theta * 2) * 0.025 : 1;
      const rx = ring.rx * rib;
      const rz = ring.rz * rib * (1 + front * 0.08);
      row.push(builder.vertex(Math.sin(theta) * rx, ring.y, Math.cos(theta) * rz + ring.z, weight));
    }
    rows.push(row);
  }
  for (let r = 0; r < rows.length - 1; r += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = rows[r]![i]!;
      const c = rows[r]![i + 1]!;
      const d = rows[r + 1]![i]!;
      const e = rows[r + 1]![i + 1]!;
      builder.tri(a, d, c);
      builder.tri(c, d, e);
    }
  }
  builder.end(mat, { x: 0, y: rings[0]?.y ?? 1, z: 0 });
}

type Cut = 'blazer' | 'jacket' | 'zip' | 'cardigan' | 'hoodie' | 'knit' | 'shirt' | 'linen' | 'coverall' | 'uniform';

function cutOf(wardrobe: Wardrobe): Cut {
  if (wardrobe.garment === 'suit') return 'blazer';
  if (wardrobe.garment === 'leather') return 'zip';
  if (wardrobe.garment === 'hiker') return 'jacket';
  if (wardrobe.garment === 'hoodie') return 'hoodie';
  if (wardrobe.garment === 'fatigues') return 'coverall';
  if (wardrobe.garment === 'uniform') return 'uniform';
  if (wardrobe.garment === 'linen') return 'linen';
  if (wardrobe.sleeves === 'short') return 'shirt';
  const bright = (wardrobe.top & 255) + ((wardrobe.top >> 8) & 255) + ((wardrobe.top >> 16) & 255);
  if (bright > 400) return 'cardigan';
  return (wardrobe.top & 1) === 0 ? 'knit' : 'shirt';
}

function armWeight(t: number): W {
  if (t < 0.14) return { a: B.chest, b: B.lShoulder, w: t / 0.14 };
  if (t < 0.46) return { a: B.lShoulder, b: B.lShoulder, w: 0 };
  if (t < 0.74) return { a: B.lShoulder, b: B.lElbow, w: (t - 0.46) / 0.28 };
  return { a: B.lElbow, b: B.lElbow, w: 0 };
}

function armWeightR(t: number): W {
  const w = armWeight(t);
  return { a: w.a === B.lShoulder ? B.rShoulder : w.a === B.lElbow ? B.rElbow : w.a, b: w.b === B.lShoulder ? B.rShoulder : w.b === B.lElbow ? B.rElbow : w.b, w: w.w };
}

function legWeight(t: number, left: boolean): W {
  const thigh = left ? B.lThigh : B.rThigh;
  const knee = left ? B.lKnee : B.rKnee;
  const foot = left ? B.lFoot : B.rFoot;
  if (t < 0.1) return { a: B.pelvis, b: thigh, w: 0.35 + t };
  if (t < 0.42) return { a: thigh, b: thigh, w: 0 };
  if (t < 0.68) return { a: thigh, b: knee, w: (t - 0.42) / 0.26 };
  if (t < 0.9) return { a: knee, b: knee, w: 0 };
  return { a: knee, b: foot, w: (t - 0.9) / 0.1 };
}

function keep(mesh: T.Mesh): T.Mesh {
  mesh.userData.keep = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

function ball(parent: T.Object3D, geos: T.BufferGeometry[], material: T.Material, radius: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, segs = 16): T.Mesh {
  const geo = new T.SphereGeometry(radius, segs, Math.max(8, segs - 4));
  geos.push(geo);
  const mesh = keep(new T.Mesh(geo, material));
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function rod(parent: T.Object3D, geos: T.BufferGeometry[], material: T.Material, from: V, to: V, radius: number): T.Mesh {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 0.001;
  const geo = new T.CapsuleGeometry(radius, Math.max(0.004, len - radius * 1.4), 2, 8);
  geos.push(geo);
  const mesh = keep(new T.Mesh(geo, material));
  mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx / len, dy / len, dz / len));
  parent.add(mesh);
  return mesh;
}

function shade(hex: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((hex & 255) * factor)));
  return (r << 16) | (g << 8) | b;
}

function lipColor(skin: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((skin >> 16) & 255) * 0.62 + 90)));
  const g = Math.max(0, Math.min(255, Math.round(((skin >> 8) & 255) * 0.38 + 28)));
  const b = Math.max(0, Math.min(255, Math.round((skin & 255) * 0.36 + 28)));
  return (r << 16) | (g << 8) | b;
}

function sculptHead(wardrobe: Wardrobe, geos: T.BufferGeometry[], material: T.Material): T.Mesh {
  const geo = new T.SphereGeometry(1, 22, 18);
  geos.push(geo);
  const pos = geo.attributes.position!;
  const jaw = ((wardrobe.hair % 5) - 2) * 0.004;
  const nose = 0.9 + (wardrobe.skin % 5) * 0.035;
  for (let i = 0; i < pos.count; i += 1) {
    let nx = pos.getX(i);
    let ny = pos.getY(i);
    let nz = pos.getZ(i);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    let rx = 0.078 + jaw;
    let ry = 0.10;
    let rz = 0.084;
    if (ny < -0.12) {
      const t = Math.min(1, (-ny - 0.12) / 0.75);
      ry *= 1 + t * 0.06;
      rz *= 1 + t * 0.16 * Math.max(0, nz);
      rx *= 1 - t * 0.12;
    }
    if (nz > 0 && Math.abs(nx) > 0.28 && ny < 0.05 && ny > -0.4) {
      rx *= 1.05;
      rz *= 1.03;
    }
    const eye = Math.abs(Math.abs(nx) - 0.33);
    if (nz > 0.15 && eye < 0.2 && Math.abs(ny - 0.06) < 0.16) {
      const k = (1 - eye / 0.2) * (1 - Math.abs(ny - 0.06) / 0.16) * Math.max(0, nz);
      rz *= 1 - 0.18 * k;
    }
    if (nz > 0.1 && ny > 0.14 && ny < 0.34 && Math.abs(nx) < 0.5) rz *= 1.045;
    if (nz > 0.4 && Math.abs(nx) < 0.14 && ny > -0.25 && ny < 0.18) {
      const k = (1 - Math.abs(nx) / 0.14) * (1 - Math.abs(ny + 0.02) / 0.28);
      rz *= 1 + 0.2 * nose * Math.max(0, k);
    }
    if (ny > 0.55) rx *= 0.95;
    pos.setXYZ(i, nx * rx, ny * ry + 0.085, nz * rz + 0.008);
  }
  geo.computeVertexNormals();
  const mesh = keep(new T.Mesh(geo, material));
  return mesh;
}

function addFace(head: T.Object3D, wardrobe: Wardrobe, geos: T.BufferGeometry[], mat: (color: number, rough: number, metal: number) => T.Material): void {
  const skin = mat(wardrobe.skin, 0.5, 0.02);
  const skull = sculptHead(wardrobe, geos, skin);
  head.add(skull);
  const white = mat(0xf4f1ee, 0.22, 0.04);
  const iris = mat(wardrobe.eyes, 0.18, 0.05);
  const pupil = mat(0x121212, 0.2, 0.08);
  const lip = mat(lipColor(wardrobe.skin), 0.42, 0.04);
  const hair = mat(wardrobe.hair, 0.72, 0.02);
  for (const side of [-1, 1]) {
    ball(head, geos, white, 0.011, side * 0.03, 0.088, 0.084, 1.05, 0.72, 0.55, 12);
    ball(head, geos, iris, 0.0062, side * 0.03, 0.088, 0.092, 1, 1, 0.55, 10);
    ball(head, geos, pupil, 0.003, side * 0.03, 0.088, 0.097, 1, 1, 0.45, 8);
    ball(head, geos, skin, 0.014, side * 0.03, 0.098, 0.08, 1.2, 0.42, 0.7, 10);
    ball(head, geos, hair, 0.016, side * 0.03, 0.112, 0.072, 1.2, 0.32, 0.5, 8);
    ball(head, geos, skin, 0.02, side * 0.078, 0.082, 0.0, 0.42, 1.15, 0.72, 10);
    ball(head, geos, mat(shade(wardrobe.skin, 0.9), 0.55, 0), 0.008, side * 0.08, 0.078, 0.012, 0.7, 0.9, 0.45, 8);
  }
  ball(head, geos, mat(shade(wardrobe.skin, 0.94), 0.48, 0.02), 0.02, 0, 0.072, 0.09, 0.55, 1.85, 1.05, 12);
  ball(head, geos, mat(shade(wardrobe.skin, 0.72), 0.4, 0), 0.006, -0.008, 0.062, 0.086, 0.7, 0.45, 0.45, 8);
  ball(head, geos, mat(shade(wardrobe.skin, 0.72), 0.4, 0), 0.006, 0.008, 0.062, 0.086, 0.7, 0.45, 0.45, 8);
  ball(head, geos, lip, 0.012, 0, 0.05, 0.074, 1.7, 0.42, 0.7, 10);
  ball(head, geos, lip, 0.013, 0, 0.038, 0.07, 1.85, 0.55, 0.85, 10);
  if (wardrobe.beard && wardrobe.headwear !== 'hijab' && wardrobe.headwear !== 'helmet') {
    ball(head, geos, hair, 0.03, 0, 0.02, 0.05, 1.5, 0.7, 0.8, 10);
    ball(head, geos, hair, 0.02, -0.03, 0.012, 0.04, 0.8, 0.9, 0.7, 8);
    ball(head, geos, hair, 0.02, 0.03, 0.012, 0.04, 0.8, 0.9, 0.7, 8);
    ball(head, geos, hair, 0.012, 0, 0.055, 0.078, 1.4, 0.35, 0.45, 8);
  }
}

function addScalp(head: T.Object3D, geos: T.BufferGeometry[], material: T.Material): void {
  ball(head, geos, material, 0.102, 0, 0.15, -0.008, 1.12, 0.5, 0.96, 16);
  ball(head, geos, material, 0.096, 0, 0.09, -0.028, 1.08, 0.72, 0.78, 14);
  ball(head, geos, material, 0.038, -0.072, 0.045, -0.008, 0.5, 1.15, 0.65, 8);
  ball(head, geos, material, 0.038, 0.072, 0.045, -0.008, 0.5, 1.15, 0.65, 8);
}

function addHair(head: T.Object3D, wardrobe: Wardrobe, geos: T.BufferGeometry[], material: T.Material, rand: () => number): void {
  if (wardrobe.headwear === 'hijab' || wardrobe.headwear === 'helmet') return;
  addScalp(head, geos, material);
  const style = wardrobe.hairStyle;
  if (style === 'buzz') {
    ball(head, geos, material, 0.09, 0, 0.12, -0.006, 0.92, 0.55, 0.9, 14);
    return;
  }
  if (style === 'curl') {
    ball(head, geos, material, 0.084, 0, 0.13, -0.01, 1, 0.72, 0.95, 12);
    for (let i = 0; i < 26; i += 1) {
      const a = rand() * Math.PI * 2;
      const lift = 0.35 + rand() * 0.65;
      const y = 0.08 + Math.cos(lift) * 0.08;
      const r = 0.07 + Math.sin(lift) * 0.025;
      ball(head, geos, material, 0.02 + rand() * 0.012, Math.cos(a) * r, y + 0.05, Math.sin(a) * r * 0.85 - 0.01, 1, 1, 1, 7);
    }
    return;
  }
  if (style === 'dread') {
    ball(head, geos, material, 0.086, 0, 0.125, -0.008, 0.95, 0.62, 0.92, 12);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      if (Math.sin(a) > 0.45) continue;
      const root = { x: Math.cos(a) * 0.06, y: 0.11, z: Math.sin(a) * 0.05 - 0.01 };
      const len = 0.16 + rand() * 0.18;
      rod(head, geos, material, root, { x: root.x * 1.15, y: root.y - len, z: root.z - 0.03 }, 0.012);
    }
    return;
  }
  if (style === 'long') {
    ball(head, geos, material, 0.092, 0, 0.12, -0.012, 1.02, 0.7, 1, 14);
    rod(head, geos, material, { x: 0, y: 0.08, z: -0.06 }, { x: 0, y: -0.42, z: -0.05 }, 0.05);
    rod(head, geos, material, { x: -0.05, y: 0.08, z: -0.02 }, { x: -0.06, y: -0.28, z: -0.02 }, 0.026);
    rod(head, geos, material, { x: 0.05, y: 0.08, z: -0.02 }, { x: 0.06, y: -0.28, z: -0.02 }, 0.026);
    return;
  }
  if (style === 'bun') {
    ball(head, geos, material, 0.088, 0, 0.125, -0.01, 1, 0.62, 0.95, 12);
    ball(head, geos, material, 0.04, 0, 0.1, -0.07, 1, 1, 1, 10);
    return;
  }
  if (style === 'side') {
    ball(head, geos, material, 0.09, 0.01, 0.125, -0.008, 1.05, 0.62, 0.95, 12);
    ball(head, geos, material, 0.035, 0.045, 0.15, 0.02, 1.3, 0.45, 0.8, 8);
    return;
  }
  ball(head, geos, material, 0.055, 0, 0.155, -0.012, 1.15, 0.42, 0.9, 10);
}

function addHeadwear(head: T.Object3D, wardrobe: Wardrobe, geos: T.BufferGeometry[], mat: (color: number, rough: number, metal: number) => T.Material): void {
  if (wardrobe.headwear === 'none') return;
  if (wardrobe.headwear === 'hijab') {
    const cloth = mat(wardrobe.cloth, 0.86, 0);
    ball(head, geos, cloth, 0.1, 0, 0.115, -0.035, 1.16, 1.02, 0.78, 16);
    ball(head, geos, cloth, 0.055, 0, 0.01, 0.02, 1.3, 0.7, 1, 10);
    rod(head, geos, cloth, { x: 0, y: 0.02, z: -0.02 }, { x: 0, y: -0.32, z: -0.03 }, 0.05);
    return;
  }
  if (wardrobe.headwear === 'hood') {
    const cloth = mat(wardrobe.top, 0.9, 0);
    ball(head, geos, cloth, 0.108, 0, 0.11, -0.04, 1.12, 1.02, 0.72, 16);
    rod(head, geos, cloth, { x: -0.02, y: 0.04, z: 0.07 }, { x: -0.012, y: -0.08, z: 0.08 }, 0.006);
    rod(head, geos, cloth, { x: 0.02, y: 0.04, z: 0.07 }, { x: 0.012, y: -0.08, z: 0.08 }, 0.006);
    return;
  }
  if (wardrobe.headwear === 'helmet') {
    ball(head, geos, mat(shade(wardrobe.top, 0.75), 0.5, 0.18), 0.112, 0, 0.1, 0, 1, 0.95, 1, 16);
    ball(head, geos, mat(0x1a2420, 0.3, 0.2), 0.05, 0, 0.09, 0.08, 1.8, 0.28, 0.35, 8);
    return;
  }
  if (wardrobe.headwear === 'beret') {
    const beret = ball(head, geos, mat(wardrobe.cloth, 0.8, 0), 0.09, 0, 0.16, 0, 1.15, 0.28, 1.15, 12);
    beret.rotation.z = 0.4;
    beret.rotation.x = 0.15;
    return;
  }
  if (wardrobe.headwear === 'brim' || wardrobe.headwear === 'cap') {
    const color = wardrobe.headwear === 'brim' ? wardrobe.cloth : wardrobe.top;
    const crown = new T.CylinderGeometry(0.07, 0.075, 0.07, 16);
    geos.push(crown);
    const mesh = keep(new T.Mesh(crown, mat(color, 0.75, 0)));
    mesh.position.set(0, 0.175, 0);
    head.add(mesh);
    if (wardrobe.headwear === 'brim') {
      const disc = new T.CylinderGeometry(0.14, 0.14, 0.012, 20);
      geos.push(disc);
      const brim = keep(new T.Mesh(disc, mat(color, 0.75, 0)));
      brim.position.set(0, 0.145, 0);
      head.add(brim);
    } else {
      ball(head, geos, mat(color, 0.75, 0), 0.045, 0, 0.145, 0.07, 1.3, 0.18, 0.85, 10);
    }
  }
}

function addHand(parent: T.Bone, geos: T.BufferGeometry[], material: T.Material, side: -1 | 1): T.Group {
  const hand = new T.Group();
  hand.rotation.z = side * -0.28;
  parent.add(hand);
  ball(hand, geos, material, 0.026, 0, -0.032, 0.008, 0.9, 0.95, 0.48, 12);
  const lengths = [0.04, 0.046, 0.043, 0.034];
  lengths.forEach((len, i) => {
    const x = (i - 1.5) * 0.012;
    rod(hand, geos, material, { x, y: -0.05, z: 0.01 }, { x, y: -0.05 - len, z: 0.002 }, 0.0055);
  });
  rod(hand, geos, material, { x: side * -0.016, y: -0.028, z: 0.014 }, { x: side * -0.028, y: -0.05, z: 0.02 }, 0.009);
  return hand;
}

function addShoe(foot: T.Bone, geos: T.BufferGeometry[], upper: T.Material, soleMat: T.Material): T.Object3D {
  ball(foot, geos, upper, 0.05, 0, -0.04, 0.045, 0.85, 0.55, 1.7, 12);
  ball(foot, geos, soleMat, 0.048, 0, -0.062, 0.05, 0.9, 0.28, 1.75, 10);
  const plant = new T.Object3D();
  plant.position.set(0, -0.082, 0.05);
  plant.name = 'plant';
  foot.add(plant);
  return plant;
}

function torsoRings(wardrobe: Wardrobe, pad: number): { y: number; rx: number; rz: number; z: number; bone: number; next: number; blend: number }[] {
  const feminine = wardrobe.shoulders < 0.41;
  const hip = wardrobe.hips * 0.55 + pad;
  const waist = wardrobe.hips * 0.42 + pad;
  const chest = wardrobe.shoulders * 0.4 + pad;
  const bust = (feminine ? 0.02 : 0.008) + pad * 0.2;
  return [
    { y: 0.72, rx: hip * 1.08, rz: hip * 0.74, z: 0, bone: B.pelvis, next: B.spine, blend: 0.12 },
    { y: 0.94, rx: hip * 0.95, rz: hip * 0.66, z: 0, bone: B.pelvis, next: B.spine, blend: 0.45 },
    { y: 1.03, rx: waist, rz: waist * 0.72, z: 0.004, bone: B.spine, next: B.pelvis, blend: 0.15 },
    { y: 1.14, rx: waist * 1.08, rz: waist * 0.78, z: bust * 0.4, bone: B.spine, next: B.chest, blend: 0.4 },
    { y: 1.24, rx: chest, rz: chest * 0.74, z: bust, bone: B.chest, next: B.spine, blend: 0.2 },
    { y: 1.32, rx: chest, rz: chest * 0.72, z: bust * 0.6, bone: B.chest, next: B.spine, blend: 0.05 },
    { y: 1.39, rx: chest * 0.78, rz: chest * 0.6, z: 0.006, bone: B.chest, next: B.neck, blend: 0.18 },
    { y: 1.45, rx: 0.09 + pad, rz: 0.078 + pad, z: 0.004, bone: B.neck, next: B.chest, blend: 0.35 },
    { y: 1.49, rx: 0.068 + pad, rz: 0.06 + pad, z: 0.002, bone: B.neck, next: B.chest, blend: 0.2 },
  ];
}

export function buildFigure(wardrobe: Wardrobe, bones: FigureBones, mat: (color: number, rough: number, metal: number) => T.Material): Figure {
  const holder = new T.Group();
  holder.add(bones.pelvis);
  holder.updateMatrixWorld(true);
  const geos: T.BufferGeometry[] = [];
  const builder = new Builder();
  const cut = cutOf(wardrobe);
  const knit = cut === 'knit' || cut === 'hoodie';
  const bulk = wardrobe.bulk;
  const feminine = wardrobe.shoulders < 0.41;
  const neckA = wp(bones.neck);
  const headA = wp(bones.head);
  addLimb(builder, neckA, { x: headA.x, y: headA.y + 0.02, z: headA.z }, 0.055, 0.05, t => ({ a: B.neck, b: B.head, w: t }), SKIN);
  const gap = cut === 'blazer' ? 0.22 : cut === 'cardigan' ? 0.55 : cut === 'jacket' ? 0.12 : cut === 'linen' ? 0.1 : 0;
  if (gap > 0) addLoft(builder, torsoRings(wardrobe, 0.004), CLOTH, 0, false);
  addLoft(builder, torsoRings(wardrobe, gap > 0 ? 0.016 : 0.01), TOP, gap, knit);
  const short = wardrobe.sleeves === 'short' && cut !== 'blazer' && cut !== 'zip' && cut !== 'coverall' && cut !== 'uniform';
  const dressArm = (side: -1 | 1) => {
    const shoulder = side < 0 ? bones.lShoulder : bones.rShoulder;
    const elbow = side < 0 ? bones.lElbow : bones.rElbow;
    const hand = side < 0 ? bones.lHand : bones.rHand;
    const weight = side < 0 ? armWeight : armWeightR;
    const a = wp(shoulder);
    const b = wp(elbow);
    const c = wp(hand);
    const root = { x: a.x * 0.88, y: a.y - 0.08, z: a.z };
    const upperR = 0.055 * bulk;
    const foreR = 0.046 * bulk;
    const upper = (t: number) => weight(0.22 + t * 0.5);
    if (short) {
      const stop = { x: root.x + (b.x - root.x) * 0.58, y: root.y + (b.y - root.y) * 0.58, z: root.z + (b.z - root.z) * 0.58 };
      addLimb(builder, root, stop, upperR, upperR * 0.82, upper, TOP, knit);
      addLimb(builder, stop, c, foreR, 0.036 * bulk, t => weight(0.55 + t * 0.45), SKIN);
    } else {
      addLimb(builder, root, b, upperR, upperR * 0.72, upper, TOP, knit);
      addLimb(builder, b, c, foreR, 0.036 * bulk, t => weight(0.62 + t * 0.38), TOP, knit);
    }
    ball(elbow, geos, mat(short ? wardrobe.skin : wardrobe.top, 0.7, 0), 0.032 * bulk, 0, 0, 0, 1, 1, 1, 8);
  };
  dressArm(-1);
  dressArm(1);
  const pants = wardrobe.garment === 'fatigues' ? TOP : BOTTOM;
  const thighR = (0.085 + (feminine ? 0.004 : 0)) * bulk;
  const dressLeg = (side: -1 | 1) => {
    const thigh = side < 0 ? bones.lThigh : bones.rThigh;
    const knee = side < 0 ? bones.lKnee : bones.rKnee;
    const foot = side < 0 ? bones.lFoot : bones.rFoot;
    addLimb(builder, wp(thigh), wp(knee), thighR, 0.055 * bulk, t => legWeight(t * 0.62, side < 0), pants);
    addLimb(builder, wp(knee), wp(foot), 0.058 * bulk, 0.04 * bulk, t => legWeight(0.58 + t * 0.42, side < 0), pants);
    ball(knee, geos, mat(pants === TOP ? wardrobe.top : wardrobe.bottom, 0.8, 0), 0.04 * bulk, 0, 0.01, 0.012, 1, 1, 1, 10);
  };
  dressLeg(-1);
  dressLeg(1);
  const geometry = builder.finish();
  geos.push(geometry);
  const rough = wardrobe.garment === 'leather' ? 0.4 : wardrobe.garment === 'suit' ? 0.6 : 0.86;
  const metal = wardrobe.garment === 'leather' ? 0.14 : 0;
  const shirt = wardrobe.garment === 'suit' ? 0xf3f0ea : wardrobe.cloth;
  const materials = [
    mat(wardrobe.skin, 0.5, 0.02),
    mat(wardrobe.top, rough, metal),
    mat(shirt, 0.72, 0),
    mat(wardrobe.bottom, 0.84, 0),
  ];
  const body = new T.SkinnedMesh(geometry, materials);
  body.name = 'body';
  body.userData.keep = true;
  body.frustumCulled = false;
  body.castShadow = false;
  bones.pelvis.removeFromParent();
  body.add(bones.pelvis);

  const skinMat = mat(wardrobe.skin, 0.5, 0.02);
  const rand = mulberry((wardrobe.skin ^ Math.imul(wardrobe.hair, 13) ^ Math.round(wardrobe.height * 100)) >>> 0);
  addFace(bones.head, wardrobe, geos, mat);
  addHair(bones.head, wardrobe, geos, mat(wardrobe.hair, 0.7, 0.02), rand);
  addHeadwear(bones.head, wardrobe, geos, mat);
  const lHand = addHand(bones.lHand, geos, skinMat, -1);
  const rHand = addHand(bones.rHand, geos, skinMat, 1);
  const shoe = mat(wardrobe.shoes, 0.55, wardrobe.garment === 'leather' ? 0.08 : 0);
  const sole = mat(wardrobe.sole, 0.74, 0);
  const lPlant = addShoe(bones.lFoot, geos, shoe, sole);
  const rPlant = addShoe(bones.rFoot, geos, shoe, sole);

  const collarColor = wardrobe.garment === 'leather' ? shade(wardrobe.top, 0.8) : wardrobe.garment === 'suit' ? 0xf3f0ea : wardrobe.top;
  const collarGeo = new T.TorusGeometry(0.064, 0.012, 8, 18);
  geos.push(collarGeo);
  const collar = keep(new T.Mesh(collarGeo, mat(collarColor, 0.7, metal)));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.02;
  bones.neck.add(collar);
  if (cut === 'blazer') {
    for (const side of [-1, 1]) {
      const lapel = ball(bones.chest, geos, mat(shade(wardrobe.top, 1.15), rough, metal), 0.05, side * 0.055, 0.12, 0.09, 0.55, 1.3, 0.28, 8);
      lapel.rotation.z = side * -0.55;
    }
    const tieGeo = new T.CylinderGeometry(0.01, 0.026, 0.24, 8);
    geos.push(tieGeo);
    const tie = keep(new T.Mesh(tieGeo, mat(wardrobe.cloth, 0.5, 0.05)));
    tie.position.set(0, 0.02, 0.1);
    bones.chest.add(tie);
  }
  if (cut === 'zip') {
    rod(bones.chest, geos, mat(shade(wardrobe.top, 0.45), 0.35, 0.4), { x: 0, y: 0.16, z: 0.1 }, { x: 0, y: -0.02, z: 0.09 }, 0.006);
  }
  if (cut === 'hoodie') {
    ball(bones.spine, geos, mat(shade(wardrobe.top, 0.9), 0.9, 0), 0.07, 0, 0.12, 0.09, 1.3, 0.7, 0.45, 10);
  }
  if (wardrobe.garment === 'uniform') {
    ball(bones.chest, geos, mat(wardrobe.metal, 0.35, 0.55), 0.018, 0.07, 0.1, 0.1, 1, 1.2, 0.4, 8);
  }
  const beltGeo = new T.TorusGeometry(Math.max(0.1, wardrobe.hips * 0.34), 0.006, 6, 24);
  geos.push(beltGeo);
  const belt = keep(new T.Mesh(beltGeo, mat(shade(wardrobe.bottom, 0.4), 0.55, 0.04)));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.16;
  bones.pelvis.add(belt);
  ball(bones.pelvis, geos, mat(wardrobe.metal, 0.4, 0.45), 0.014, 0, 0.16, wardrobe.hips * 0.36, 1, 0.7, 0.35, 8);

  const phone = new T.Group();
  phone.name = 'phone';
  phone.visible = false;
  const shellGeo = new T.BoxGeometry(0.034, 0.062, 0.008);
  const screenGeo = new T.BoxGeometry(0.026, 0.046, 0.004);
  geos.push(shellGeo, screenGeo);
  const shell = keep(new T.Mesh(shellGeo, mat(0x16181c, 0.35, 0.4)));
  const screen = keep(new T.Mesh(screenGeo, mat(0x9fd0dc, 0.2, 0.1)));
  screen.position.z = 0.005;
  shell.add(screen);
  phone.add(shell);
  phone.position.set(0.01, -0.07, 0.03);
  phone.rotation.x = -0.4;
  rHand.add(phone);
  void lHand;
  return { body, phone, lPlant, rPlant, geometries: geos };
}
