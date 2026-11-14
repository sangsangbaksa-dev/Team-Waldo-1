// LAST CITY — 사업체 안의 사람들. 거리의 시민 모델(civ…, models.ts)을 그대로 가져다 서거나 앉힙니다.
// 모델은 걷기용 관절(골반·무릎·어깨)로 쪼개져 있어서, 앉을 때는 허벅지를 앞으로 눕히고 정강이를 바닥으로 내립니다.
import * as THREE from 'three';
import { SEAT_Y, type Folk } from './interior';
import { Kit } from './interiorkit';
import type { Baked, CharModel, Models } from './models';
import { CHAR_SCALE, HIP, KNEE, LEG_Z } from './scale';

const CLOTH = [0x8d99ae, 0xb08968, 0x6d8a96, 0xa58fb3, 0x9aa37b, 0xc58f8f, 0xd27d5a, 0x5f9ea0], SKIN = [0xf1c9a5, 0xd9a47a, 0xa8744f, 0x7a5236, 0xf5d6b8];
/** 앉았을 때 엉덩이 아래면이 골반 관절보다 낮은 정도(m) */
const SIT_DROP = 0.1;
/** 정강이 길이(m): 골반 높이 − 허벅지 길이 */
const SHIN = HIP - KNEE;

export interface FolkLook { uniform: number; seat: number; seat2: number }

/** 사람 한 명이 쓰는 재료: 옷(Team)·피부(Skin) 색만 바꾸고 나머지는 모델에 구워진 색을 씁니다. */
class Paint {
  private cache = new Map<string, THREE.Material>();
  constructor(private kit: Kit) {}
  get(kind: 'fixed' | 'team' | 'skin' | 'glow', color: number): THREE.Material {
    const key = `${kind}${kind === 'team' || kind === 'skin' ? color : ''}`; let m = this.cache.get(key);
    if (!m) { m = kind === 'glow' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true, color: kind === 'fixed' ? 0xffffff : color }); this.cache.set(key, m); this.kit.own(m); }
    return m;
  }
}

/** 구워 둔 지오메트리(모델 캐시 소유 — 여기서 dispose 하지 않습니다)를 재질별 메시로 붙입니다. */
function attach(parent: THREE.Object3D, b: Baked, p: Paint, team: number, skin: number): void {
  for (const [k, geo, c] of [['fixed', b.fixed, 0], ['team', b.team, team], ['skin', b.skin, skin], ['glow', b.glow, 0]] as const) if (geo) parent.add(new THREE.Mesh(geo, p.get(k, c)));
}
const pivot = (parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const hash = (i: number): number => { const s = Math.sin(i * 91.7 + 13.3) * 43758.5453; return s - Math.floor(s); };

/** 사람이 앉는 의자·스툴. 소파·벤치는 가구가 직접 그립니다. */
function seat(kit: Kit, f: Folk, look: FolkLook): void {
  if (f.seat !== 'stool' && f.seat !== 'chair') return;
  const y = SEAT_Y(f.seat), g = kit.group(f.x, 0, f.y, -f.ang), metal = kit.mat(0x2b2f36), pad = kit.mat(look.seat);
  if (f.seat === 'stool') {
    kit.tube(0, 0, 0, 3.6, 0.8, metal, g); kit.tube(0, 0, 0, 0.8, y, metal, g); kit.tube(0, y - 1.4, 0, 3.9, 1.6, pad, g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.28, 6, 14), metal); kit.own(ring.geometry); ring.rotation.x = Math.PI / 2; ring.position.y = y * 0.42; g.add(ring);
  } else { // 의자: 좌판 + 등받이(앉는 사람 뒤쪽 = 로컬 -x) + 다리 네 개
    kit.box(-4.6, y - 1.4, -4.6, 4.6, y, 4.6, pad, g); kit.box(-5.4, y, -4.6, -4.2, y + 9.5, 4.6, kit.mat(look.seat2), g);
    for (const [dx, dz] of [[-3.8, -3.8], [3.8, -3.8], [-3.8, 3.8], [3.8, 3.8]]) kit.box(dx - 0.5, 0, dz - 0.5, dx + 0.5, y - 1.4, dz + 0.5, metal, g);
  }
}

/** 빈 의자·스툴(앉은 사람이 없는 자리) */
export function addSeat(kit: Kit, x: number, y: number, ang: number, kind: 'stool' | 'chair', look: FolkLook): void {
  seat(kit, { x, y, ang, pose: 'sit', seat: kind, model: 'civ', role: 'guest', act: 'idle' }, look);
}

/** 모델이 없을 때(로딩 실패)의 간단한 인형: 서 있는 사람만 그립니다. */
function doll(kit: Kit, f: Folk, look: FolkLook, i: number): void {
  if (f.pose !== 'stand') return;
  const g = kit.group(f.x, 0, f.y, -f.ang), team = f.role === 'guest' ? CLOTH[i % CLOTH.length] : look.uniform;
  kit.tube(0, 0, 0, 3, 18, kit.mat(0x2a2d34), g); kit.tube(0, 18, 0, 4, 18, kit.mat(team), g); kit.sphere(0, 40, 0, 3.6, kit.mat(SKIN[i % SKIN.length]), g);
}

/** 사람들을 장면에 세웁니다. 필요한 만큼만 mesh 를 만들고(최대 열두어 명), 움직임은 kit.anim 에 등록합니다. */
export function addFolk(kit: Kit, models: Models | null, folk: Folk[], look: FolkLook): void {
  const paint = new Paint(kit), S = CHAR_SCALE;
  folk.forEach((f, i) => {
    seat(kit, f, look);
    const cm: CharModel | undefined = models?.chars[f.model] ?? models?.chars.civ; if (!cm) { doll(kit, f, look, i); return; }
    const team = f.role === 'guest' ? CLOTH[Math.floor(hash(i + f.x) * CLOTH.length)] : look.uniform, skin = SKIN[Math.floor(hash(i * 3 + f.y) * SKIN.length)];
    const sitting = f.pose !== 'stand', hipY = sitting ? SEAT_Y(f.seat) / S + SIT_DROP : HIP;
    // 발이 바닥에 닿도록 허벅지 각도(수직에서 앞쪽으로 눕힌 정도)를 구합니다.
    const thigh = sitting ? Math.acos(Math.max(0, Math.min(1, (hipY - SHIN) / KNEE))) : 0;
    const root = kit.group(f.x, (hipY - HIP) * S, f.y, -f.ang); root.scale.setScalar(S);
    const lean = f.pose === 'desk' ? 0.16 : sitting ? 0.07 : 0, torso = pivot(root, 0, HIP, 0), frame = pivot(torso, 0, -HIP, 0);
    torso.rotation.z = -lean; attach(frame, cm.body, paint, team, skin);
    const legs: THREE.Group[] = [], shins: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = pivot(root, 0, HIP, side * LEG_Z); leg.rotation.z = thigh; attach(leg, cm.leg, paint, team, skin); legs.push(leg);
      if (cm.shin) { const sh = pivot(leg, 0, -KNEE, 0); sh.rotation.z = -thigh; attach(sh, cm.shin, paint, team, skin); shins.push(sh); }
    }
    const armL = cm.armL && pivot(frame, cm.armL.pivot.x, cm.armL.pivot.y, cm.armL.pivot.z), armR = cm.armR && pivot(frame, cm.armR.pivot.x, cm.armR.pivot.y, cm.armR.pivot.z);
    if (cm.armL && armL) attach(armL, cm.armL.geo, paint, team, skin); if (cm.armR && armR) attach(armR, cm.armR.geo, paint, team, skin);
    // 팔 기본 자세: 서서는 내림, 앉아서는 무릎 위, 책상 앞에서는 앞으로 뻗음. (어깨 관절의 +z 회전 = 팔을 앞으로)
    const rest = f.pose === 'desk' ? 1.15 : sitting ? 0.45 : 0.04, ph = hash(i) * 6.28;
    if (armL) armL.rotation.z = rest; if (armR) armR.rotation.z = rest;
    const y0 = root.position.y, ry0 = root.rotation.y, legSwing = f.act === 'dance' && shins.length === 2;
    kit.anim.push(t => {
      const a = t + ph, breathe = Math.sin(a * 1.7) * 0.025;
      switch (f.act) {
        case 'eat': { const c = Math.max(0, Math.sin(a * 1.1)) ** 3; if (armR) armR.rotation.z = rest + c * 1.5; if (armL) armL.rotation.z = rest + 0.15; torso.rotation.z = -lean - c * 0.06; break; }
        case 'talk': root.rotation.y = ry0 + Math.sin(a * 0.6) * 0.16; if (armR) armR.rotation.z = rest + 0.35 + Math.sin(a * 2.3) * 0.28; if (armL) armL.rotation.z = rest + breathe; break;
        case 'read': if (armL) armL.rotation.z = 0.95; if (armR) armR.rotation.z = 0.95; torso.rotation.z = -lean - 0.06 - Math.sin(a * 0.5) * 0.02; break;
        case 'work': if (armR) armR.rotation.z = rest + (sitting ? 0.1 : 0.55) + Math.sin(a * 3.1) * 0.07; if (armL) armL.rotation.z = rest + (sitting ? 0.1 : 0.35) + Math.sin(a * 2.2) * 0.05; break;
        case 'browse': if (armR) armR.rotation.z = 0.95 + Math.sin(a * 0.9) * 0.2; if (armL) armL.rotation.z = rest; root.rotation.y = ry0 + Math.sin(a * 0.4) * 0.14; break;
        case 'dance': {
          const s = Math.sin(a * 4); root.position.y = y0 + Math.abs(s) * 0.9; root.rotation.y = ry0 + Math.sin(a * 2) * 0.35;
          if (armL) armL.rotation.z = 1.5 + s * 0.9; if (armR) armR.rotation.z = 1.5 - s * 0.9;
          if (legSwing) { legs[0].rotation.z = s * 0.3; legs[1].rotation.z = -s * 0.3; shins[0].rotation.z = Math.max(0, -s) * 0.5; shins[1].rotation.z = Math.max(0, s) * 0.5; }
          break;
        }
        default: if (armL) armL.rotation.z = rest + breathe; if (armR) armR.rotation.z = rest - breathe;
      }
    });
  });
}
