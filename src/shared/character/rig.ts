// 공용 캐릭터 — 한 사람 분의 관절 리그. LAST CITY·OUTLAW CITY·ZERO ZONE·FRONTLINE·SPEED RUSH 가 모두 이것을 씁니다.
import * as THREE from 'three';
import type { Baked } from './bake';
import { HIP, KNEE, LEG_Z, blankPose, calmState, computePose, type Pose, type PoseState } from './pose';
import type { Look } from './variants';

export interface CharPart { body: Baked; leg: Baked; shin?: Baked | null; armL?: { geo: Baked; pivot: THREE.Vector3 } | null; armR?: { geo: Baked; pivot: THREE.Vector3 } | null }

const mats = new Map<string, THREE.Material>();
const shared = <T extends THREE.Material>(key: string, make: () => T): T => { let m = mats.get(key) as T | undefined; if (!m) { m = make(); mats.set(key, m); } return m; };

function partGroup(b: Baked, look: Look, fx: { emissive: number }): THREE.Group {
  const g = new THREE.Group(), add = (geo: THREE.BufferGeometry | null, m: THREE.Material): void => { if (!geo) return; const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; g.add(mesh); };
  add(b.fixed, shared(`fixed${fx.emissive}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, emissive: fx.emissive, roughness: 0.78, metalness: 0.08 })));
  add(b.team, shared(`team${look.team}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, color: look.team, roughness: 0.72, metalness: 0.06 })));
  add(b.skin, shared(`skin${look.skin}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, color: look.skin, roughness: 0.55, metalness: 0 })));
  add(b.glow, shared('glow', () => new THREE.MeshBasicMaterial({ vertexColors: true })));
  return g;
}

/** 관절 리그. root 를 장면에 넣고 `update(state, dt)` 로 포즈를 갱신합니다. root 의 위치/방향은 호출 쪽이 정합니다. */
export class CharacterRig {
  readonly root = new THREE.Group();
  /** 몸통 관절: 손에 든 물건·머리 장식 등을 붙일 때 쓰는 그룹(팔과 함께 움직이지 않음). */
  readonly torso = new THREE.Group();
  readonly state: PoseState = calmState();
  private torsoJ = new THREE.Group(); private legs: THREE.Group[] = []; private shins: THREE.Group[] = []; private armL: THREE.Group | null = null; private armR: THREE.Group | null = null;
  private pose: Pose = blankPose(); private lodSkip = 0; private frame = 0; private base = new THREE.Vector3(1, 1, 1);

  constructor(part: CharPart, look: Look, opts: { emissive?: number } = {}) {
    const fx = { emissive: opts.emissive ?? 0x23262b }, { root, torsoJ, torso } = this;
    torsoJ.position.y = HIP; torso.position.y = -HIP; torsoJ.rotation.order = 'ZYX'; torsoJ.add(torso); root.add(torsoJ); torso.add(partGroup(part.body, look, fx));
    for (const side of [-1, 1]) {
      const lg = new THREE.Group(); lg.position.set(0, HIP, side * LEG_Z); lg.add(partGroup(part.leg, look, fx)); this.legs.push(lg);
      if (part.shin) { const sg = new THREE.Group(); sg.position.y = -KNEE; sg.add(partGroup(part.shin, look, fx)); lg.add(sg); this.shins.push(sg); }
      root.add(lg);
    }
    if (part.armL) { this.armL = new THREE.Group(); this.armL.position.copy(part.armL.pivot); this.armL.add(partGroup(part.armL.geo, look, fx)); torso.add(this.armL); }
    if (part.armR) { this.armR = new THREE.Group(); this.armR.position.copy(part.armR.pivot); this.armR.add(partGroup(part.armR.geo, look, fx)); torso.add(this.armR); }
    this.base.set(look.width, look.height, look.width); root.scale.copy(this.base);
  }

  /** 먼 캐릭터는 몇 프레임에 한 번만 포즈를 갱신합니다(0 = 매 프레임). 100명이 한 화면에 있을 때 비용을 줄입니다. */
  setDetail(skipFrames: number): void { this.lodSkip = Math.max(0, skipFrames | 0); }

  update(dt: number): void {
    void dt; this.frame++;
    if (this.lodSkip && this.frame % (this.lodSkip + 1) !== 0) return;
    const p = computePose(this.state, this.pose), { root, torsoJ } = this;
    root.rotation.z = p.rootPitch; root.position.y = p.rootY; root.scale.set(this.base.x, this.base.y * p.scaleY, this.base.z);
    torsoJ.rotation.z = p.torsoLean; torsoJ.rotation.y = p.torsoTwist;
    this.legs[0].rotation.z = p.thighL; this.legs[1].rotation.z = p.thighR;
    if (this.shins[0]) { this.shins[0].rotation.z = p.shinL; this.shins[1].rotation.z = p.shinR; }
    if (this.armL) this.armL.rotation.z = p.armL; if (this.armR) this.armR.rotation.z = p.armR;
  }
  /** 걸음 위상을 속도에 맞춰 진행시키고 시계를 올립니다. */
  step(dt: number): void { const s = this.state; s.walk += dt * Math.min(9, s.speed * 1.6 + 0.0); s.time += dt; s.recoil = Math.max(0, s.recoil - dt * 8); s.hit = Math.max(0, s.hit - dt * 2.5); }
  /** 발사: 반동을 켭니다. */ fire(): void { this.state.recoil = 1; }
  /** 피격: 휘청 반응을 켭니다. */ hurt(): void { this.state.hit = 1; }
  dispose(): void { /* 지오메트리·재질은 공유라 해제하지 않습니다 */ }
}
