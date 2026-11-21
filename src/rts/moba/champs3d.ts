// FRONTLINE 롤식 라인전 — 챔피언별 외형 소품. 기본 병사·일꾼 모델 위에 투구·무기·망토·떠다니는 구슬을 얹어 한눈에 구분되게 합니다.
import * as THREE from 'three';
import { matsFor, type UnitRig } from '../models';
import type { ChampId } from './config';

export interface Anim { o: THREE.Object3D; k: 'spin' | 'bob' | 'orbit' | 'flicker'; base: number; r?: number; phase?: number }
const mat = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.3, flatShading: true, ...o });
const glow = (c: number, i = 1.4): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3, flatShading: true });

/** 챔피언 외형을 rig.body 에 덧붙이고, 움직일 부품 목록을 rig.body.userData.anim 에 남깁니다. */
export function decorateChamp(rig: UnitRig, champ: ChampId, team: number): void {
  const m = matsFor(team), g = new THREE.Group(), anim: Anim[] = []; rig.body.add(g);
  const add = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = g): THREE.Mesh => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o; };
  const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d), cone = (r: number, h: number, s = 6): THREE.ConeGeometry => new THREE.ConeGeometry(r, h, s), cyl = (r0: number, r1: number, h: number, s = 8): THREE.CylinderGeometry => new THREE.CylinderGeometry(r0, r1, h, s);
  const steel = mat(0xb8c0ca, { metalness: 0.6, roughness: 0.35 }), dark = mat(0x2a2d33), cloth = mat(team === 0 ? 0x2a5fb8 : 0xb83a2a, { metalness: 0.05, roughness: 0.8 });
  for (const z of [-0.24, 0.24]) {
    const pauldron = add(new THREE.SphereGeometry(0.13, 8, 6), m.team, -0.02, 0.66, z); pauldron.scale.set(1.2, 0.55, 1);
    const trim = add(new THREE.SphereGeometry(0.045, 8, 6), m.glow, 0.04, 0.7, z * 1.1); trim.scale.y = 0.55;
  }
  switch (champ) {
    case 'blade': { // 등에 맨 대검, 어깨 갑옷, 망토
      add(box(0.07, 1, 0.2), steel, -0.26, 0.55, 0.05, 0, 0, 0.35); add(box(0.1, 0.06, 0.4), dark, -0.3, 0.08, 0.05, 0, 0, 0.35);
      for (const z of [-0.27, 0.27]) add(new THREE.SphereGeometry(0.15, 8, 6), m.team, 0.02, 0.62, z).scale.set(1, 0.7, 1);
      add(box(0.04, 0.55, 0.42), cloth, -0.22, 0.3, 0, 0, 0, 0.12); break;
    }
    case 'arcana': { // 마법사 모자와 떠다니는 마력 구슬
      add(cone(0.15, 0.42, 8), mat(0x5a2d9a), 0.0, 1.06, 0, 0, 0, -0.18); add(cyl(0.25, 0.25, 0.035, 14), mat(0x3d1f6e), 0, 0.88, 0);
      const orb = add(new THREE.SphereGeometry(0.13, 10, 8), glow(0xc58bff, 1.8), 0.4, 0.8, 0.22); anim.push({ o: orb, k: 'bob', base: 0.8 });
      add(cyl(0.025, 0.025, 1, 5), mat(0x6a4a2a), 0.18, 0.42, 0.24); break;
    }
    case 'ranger': { // 활과 화살통
      add(new THREE.TorusGeometry(0.34, 0.025, 6, 14, Math.PI), mat(0x7a4f2a), 0.3, 0.6, -0.3, 0, 0, -Math.PI / 2); add(cyl(0.012, 0.012, 0.68, 4), mat(0xdedede), 0.3, 0.6, -0.3, Math.PI / 2, 0, 0).scale.set(1, 1, 1);
      add(cyl(0.07, 0.07, 0.5, 8), mat(0x5a3a22), -0.3, 0.62, -0.1, 0, 0, 0.3); for (let i = 0; i < 3; i++) add(cone(0.035, 0.12, 4), mat(0xe8e0c8), -0.36 - i * 0.02, 0.95, -0.1 + i * 0.04, 0, 0, 0.3);
      add(box(0.06, 0.06, 0.34), m.glow, 0.2, 0.98, 0); break;
    }
    case 'shade': { // 두건, 쌍단검, 휘날리는 목도리
      add(cone(0.22, 0.36, 7), dark, -0.04, 0.9, 0, 0, 0, 0.5); for (const z of [-0.2, 0.2]) add(box(0.34, 0.05, 0.05), steel, 0.2, 0.28, z, 0, 0, -0.5);
      const scarf = add(box(0.55, 0.07, 0.16), mat(0x8a5bff, { emissive: 0x3a1f7a, emissiveIntensity: 0.6 }), -0.38, 0.62, 0, 0, 0, 0.2); anim.push({ o: scarf, k: 'bob', base: 0.62 }); break;
    }
    case 'priest': { // 광륜과 지팡이
      const halo = add(new THREE.TorusGeometry(0.2, 0.02, 6, 20), glow(0xffe27a, 1.6), 0, 1.12, 0, Math.PI / 2, 0, 0); anim.push({ o: halo, k: 'spin', base: 0 });
      add(cyl(0.03, 0.03, 1.25, 6), mat(0xd6c28a), 0.3, 0.6, 0.25); const orb = add(new THREE.SphereGeometry(0.1, 8, 6), glow(0xfff1a0, 1.8), 0.3, 1.25, 0.25); anim.push({ o: orb, k: 'bob', base: 1.25 });
      add(box(0.05, 0.6, 0.4), mat(0xf2e8c8, { metalness: 0.05, roughness: 0.85 }), -0.2, 0.3, 0, 0, 0, 0.1); break;
    }
    case 'titan': { // 탑 실드, 뿔 투구, 큰 어깨
      add(box(0.09, 0.85, 0.55), mat(0x6a4a2a, { metalness: 0.4 }), 0.3, 0.38, -0.34); add(box(0.1, 0.12, 0.6), m.team, 0.31, 0.42, -0.34);
      for (const z of [-0.14, 0.14]) add(cone(0.05, 0.28, 5), mat(0xe8e0c8), 0, 0.98, z, z < 0 ? 0.6 : -0.6, 0, 0);
      for (const z of [-0.3, 0.3]) add(box(0.28, 0.14, 0.2), steel, 0.02, 0.6, z); break;
    }
    case 'ember': { // 불꽃 머리카락과 손바닥 위 불덩이
      for (let i = 0; i < 4; i++) { const f = add(cone(0.07, 0.34 + i * 0.05, 5), glow(i % 2 ? 0xff7a2a : 0xffb03a, 1.5), -0.1 - i * 0.04, 0.95 - i * 0.05, (i - 1.5) * 0.09, 0, 0, 0.9); anim.push({ o: f, k: 'flicker', base: 1, phase: i }); }
      const orb = add(new THREE.SphereGeometry(0.14, 10, 8), glow(0xff6a1a, 2), 0.4, 0.68, 0.22); anim.push({ o: orb, k: 'flicker', base: 1, phase: 2 }); break;
    }
    case 'lancer': { // 긴 창과 투구 깃털
      add(cyl(0.025, 0.025, 1.7, 6), mat(0x8a6a3a), 0.45, 0.58, 0.22, 0, 0, Math.PI / 2); add(cone(0.06, 0.26, 5), steel, 1.35, 0.58, 0.22, 0, 0, -Math.PI / 2);
      add(cone(0.06, 0.4, 5), m.team, -0.12, 0.98, 0, 0, 0, 0.9); add(box(0.04, 0.5, 0.36), cloth, -0.22, 0.3, 0, 0, 0, 0.1); break;
    }
    case 'seer': { // 가슴 앞을 도는 수정과 보주
      for (let i = 0; i < 3; i++) { const c = add(new THREE.OctahedronGeometry(0.09), glow(0x6af0ff, 1.7), 0, 0.62, 0); anim.push({ o: c, k: 'orbit', base: 0.62, r: 0.38, phase: i * 2.09 }); }
      add(new THREE.TorusGeometry(0.17, 0.018, 6, 16), glow(0x6af0ff, 1.2), 0, 0.95, 0, Math.PI / 2, 0, 0); add(box(0.05, 0.6, 0.4), mat(0x1f4a5a, { metalness: 0.1, roughness: 0.8 }), -0.2, 0.3, 0, 0, 0, 0.1); break;
    }
  }
  rig.body.userData.anim = anim;
}

/** 부품 움직임(둥둥, 회전, 공전, 일렁임). */
export function animateChamp(rig: UnitRig, t: number): void {
  const list = rig.body.userData.anim as Anim[] | undefined; if (!list) return;
  for (const a of list) {
    const ph = a.phase ?? 0;
    if (a.k === 'bob') a.o.position.y = a.base + Math.sin(t * 2.4 + ph) * 0.06;
    else if (a.k === 'spin') a.o.rotation.z += 0.04;
    else if (a.k === 'orbit') { const ang = t * 1.8 + ph, r = a.r ?? 0.4; a.o.position.set(Math.cos(ang) * r, a.base + Math.sin(t * 2 + ph) * 0.05, Math.sin(ang) * r); a.o.rotation.y = ang * 2; }
    else a.o.scale.setScalar(a.base * (0.85 + Math.sin(t * 11 + ph * 2) * 0.18));
  }
}
