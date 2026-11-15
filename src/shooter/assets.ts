// ZERO ZONE — 3D 자산 불러오기. LAST CITY 와 같은 Blender 모델(characters·weapons·props GLB)을 그대로 씁니다.
// 필요한 파일 세 개만 받고, 실패하면 게임 쪽에서 단순한 도형으로 대신합니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fetchBuffer, retry } from '../loading';
import { bake, type Baked } from '../city/models';

/** 병사 한 종류: 몸통 + 다리(허벅지·정강이) + 선택적 팔. 모두 모델 원점(발바닥) 기준입니다. */
export interface Soldier { body: Baked; leg: Baked; shin: Baked | null; armL: { geo: Baked; pivot: THREE.Vector3 } | null; armR: { geo: Baked; pivot: THREE.Vector3 } | null }
export interface ShooterAssets {
  soldiers: Record<string, Soldier>;
  /** 바닥에 놓인 총, 1인칭 총 */ groundGuns: Record<string, THREE.Object3D>; viewGuns: Record<string, THREE.Object3D>;
  props: Record<string, THREE.Object3D>;
}
export const SOLDIER_KINDS = ['rifle', 'merc', 'swat', 'guard', 'heavy'] as const;

const nodeMap = (root: THREE.Object3D): Record<string, THREE.Object3D> => { const r: Record<string, THREE.Object3D> = {}; root.traverse(o => { if (o.name) r[o.name] = o; }); return r; };
const FILES: Record<string, number> = { characters: 2_400_000, weapons: 660_000, props: 860_000 };

let cache: Promise<ShooterAssets> | null = null;
export function loadShooterAssets(base: string, onProgress?: (fraction: number) => void, onNote?: (note: string) => void): Promise<ShooterAssets> {
  cache ??= (async () => {
    const loader = new GLTFLoader(), dir = `${base}assets/models/`, prog = new Map<string, number>(), total = Object.values(FILES).reduce((a, b) => a + b, 0);
    const get = async (name: string): Promise<THREE.Object3D> => {
      const buf = await retry(() => fetchBuffer(`${dir}${name}.glb`, loaded => { prog.set(name, loaded); onProgress?.(Math.min(0.95, [...prog.values()].reduce((a, b) => a + b, 0) / total)); }), { onRetry: n => onNote?.(n < 2 ? '' : `연결이 느립니다. 계속 시도하는 중입니다 (${n}회)`) });
      return (await loader.parseAsync(buf, dir)).scene;
    };
    const [c, w, p] = await Promise.all(['characters', 'weapons', 'props'].map(get));
    const cn = nodeMap(c), wn = nodeMap(w), pn = nodeMap(p), soldiers: Record<string, Soldier> = {};
    const limb = (n?: THREE.Object3D): { geo: Baked; pivot: THREE.Vector3 } | null => (n ? { geo: bake(n), pivot: n.position.clone() } : null);
    for (const k of SOLDIER_KINDS) { if (!cn[`${k}_Body`] || !cn[`${k}_Leg`]) throw new Error(`missing ${k}`); soldiers[k] = { body: bake(cn[`${k}_Body`]), leg: bake(cn[`${k}_Leg`]), shin: cn[`${k}_Shin`] ? bake(cn[`${k}_Shin`]) : null, armL: limb(cn[`${k}_ArmL`]), armR: limb(cn[`${k}_ArmR`]) }; }
    const groundGuns: Record<string, THREE.Object3D> = {}, viewGuns: Record<string, THREE.Object3D> = {};
    for (const k of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper']) { if (!wn[`g_${k}`] || !wn[`vm_${k}`]) throw new Error(`missing weapon ${k}`); groundGuns[k] = wn[`g_${k}`]; viewGuns[k] = wn[`vm_${k}`]; }
    const props: Record<string, THREE.Object3D> = {}; for (const k of ['tree_round', 'tree_pine', 'crate', 'barrier', 'dumpster', 'lamp']) if (pn[k]) props[k] = pn[k];
    onProgress?.(1);
    return { soldiers, groundGuns, viewGuns, props };
  })();
  cache.catch(() => { cache = null; });
  return cache;
}
