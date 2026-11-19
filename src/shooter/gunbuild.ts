// ZERO ZONE — 총기 조립: weapons.glb 의 맨 총(n_)에 교체 부품(p_)을 정해진 자리에 얹어 한 자루로 만듭니다.
// 자리(mount)는 tools/blender/guns.py 가 gunmounts.json 으로 내보낸 값을 그대로 씁니다. 모델 좌표: 총구가 +X, 위가 +Y, 손잡이가 원점.
import * as THREE from 'three';
import { instantiate } from '../city/models';
import type { Attachments, PartId, PartSlot, WeaponId } from './config';
import mounts from './gunmounts.json';

type XZ = [number, number];
export interface Mount { sight: XZ; muzzle: XZ; mag: XZ; stock: XZ | null; grip: XZ | null }
export const MOUNTS = mounts as unknown as Record<WeaponId, Mount>;

/** 부품 이름 → GLB 노드 이름 */
export function partNodeName(weapon: WeaponId, part: PartId | 'std', slot: PartSlot): string {
  switch (slot) {
    case 'sight': return `p_sight_${part}`;
    case 'muzzle': return `p_muzzle_${part}`;
    case 'grip': return `p_grip_${part === 'grip' ? 'vertical' : part}`;
    case 'mag': return `p_mag_${weapon}_${part === 'extmag' ? 'ext' : part === 'quickmag' ? 'quick' : part === 'extquick' ? 'extquick' : 'std'}`;
    case 'stock': return `p_stock_${weapon}_${part === 'tactical' ? 'tactical' : part === 'cheek' ? 'cheek' : 'std'}`;
  }
}
/** 저격총은 조준경이 기본으로 붙어 있습니다(조립 화면에서 파츠를 달면 그 파츠로 바뀝니다). */
export const DEFAULT_SIGHT: Partial<Record<WeaponId, PartId>> = { sniper: 'scope4' };
/** 소음기 등이 총구 앞으로 더하는 길이(총구 불꽃 위치용) */
const MUZZLE_LEN: Partial<Record<PartId, number>> = { suppressor: 0.27, comp: 0.09, flash: 0.09 };
export function muzzleTip(weapon: WeaponId, att: Attachments | undefined): { x: number; y: number } {
  const m = MOUNTS[weapon].muzzle; return { x: m[0] + (att?.muzzle ? MUZZLE_LEN[att.muzzle] ?? 0 : 0), y: m[1] };
}
/** 조립 화면의 3D 위치: 슬롯이 붙는 점 */
export function slotPoint(weapon: WeaponId, slot: PartSlot): THREE.Vector3 {
  const m = MOUNTS[weapon];
  switch (slot) {
    case 'sight': return new THREE.Vector3(m.sight[0], m.sight[1] + 0.05, 0);
    case 'muzzle': return new THREE.Vector3(m.muzzle[0] + 0.05, m.muzzle[1], 0);
    case 'grip': { const g = m.grip ?? [0.3, 0]; return new THREE.Vector3(g[0], g[1] - 0.06, 0); }
    case 'mag': return weapon === 'shotgun' ? new THREE.Vector3(m.mag[0] + 0.1, m.mag[1] - 0.03, 0) : new THREE.Vector3(m.mag[0], m.mag[1] - 0.09, 0);
    case 'stock': { const s = m.stock ?? [-0.2, 0.03]; return new THREE.Vector3(s[0] - 0.12, s[1] - 0.01, 0); }
  }
}

type Nodes = Record<string, THREE.Object3D>;
const put = (host: THREE.Object3D, nodes: Nodes, name: string, x: number, y: number): void => {
  const n = nodes[name]; if (!n) return; const o = instantiate(n); o.position.set(x, y, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); host.add(o);
};

/** 맨 총 + 기본 탄창·개머리판 + 달린 파츠. arms 를 켜면 1인칭 팔도 붙입니다. */
export function buildGun(nodes: Nodes, id: WeaponId, att: Attachments | undefined, arms = false): THREE.Group {
  const g = new THREE.Group(), m = MOUNTS[id], a = att ?? {};
  const nude = nodes[`n_${id}`]; if (nude) { const o = instantiate(nude); o.position.set(0, 0, 0); g.add(o); }
  if (arms && nodes[`arms_${id}`]) { const o = instantiate(nodes[`arms_${id}`]); o.position.set(0, 0, 0); g.add(o); }
  const mag = a.mag ?? 'std'; put(g, nodes, partNodeName(id, mag as PartId, 'mag'), id === 'shotgun' ? m.mag[0] + 0.08 : m.mag[0], id === 'shotgun' ? m.mag[1] + 0.012 : m.mag[1]);
  if (m.stock) put(g, nodes, partNodeName(id, (a.stock ?? 'std') as PartId, 'stock'), m.stock[0], m.stock[1]);
  const sight = a.sight ?? DEFAULT_SIGHT[id]; if (sight) put(g, nodes, partNodeName(id, sight, 'sight'), m.sight[0], m.sight[1]);
  if (a.muzzle) put(g, nodes, partNodeName(id, a.muzzle, 'muzzle'), m.muzzle[0], m.muzzle[1]);
  if (a.grip && m.grip) put(g, nodes, partNodeName(id, a.grip, 'grip'), m.grip[0], m.grip[1]);
  return g;
}

/** 바닥에 놓인 파츠 하나(전리품 표시용): 크기를 키우고 중심을 맞춥니다. */
export function lootPart(nodes: Nodes, part: PartId, slot: PartSlot): THREE.Object3D | null {
  const weapon: WeaponId = part === 'cheek' ? 'sniper' : 'rifle', n = nodes[partNodeName(weapon, part, slot)]; if (!n) return null;
  const inner = instantiate(n), box = new THREE.Box3().setFromObject(inner), c = box.getCenter(new THREE.Vector3()); inner.position.sub(c);
  const out = new THREE.Group(); out.add(inner); return out;
}
