// ZERO ZONE — 3D 자산 불러오기. LAST CITY 와 같은 Blender 모델(characters·weapons·props GLB)을 그대로 씁니다.
// 필요한 파일 세 개만 받고, 실패하면 게임 쪽에서 단순한 도형으로 대신합니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fetchBuffer, retry } from '../loading';
import { bake } from '../shared/character/bake';
import { CharacterKit, type CharPart } from '../shared/character';

/** Only the five soldiers used in ZERO ZONE are baked; other games may need more. */
export interface ShooterAssets {
  kit: CharacterKit;
  /** 바닥에 놓인 총, 1인칭 총 */ groundGuns: Record<string, THREE.Object3D>; viewGuns: Record<string, THREE.Object3D>;
  /** weapons.glb 의 모든 노드(n_ 맨 총, arms_ 팔, p_ 교체 부품). 조립 화면과 1인칭 총이 부품을 얹는 데 씁니다. */ weaponNodes: Record<string, THREE.Object3D>;
}
export const SOLDIER_KINDS = ['rifle', 'merc', 'swat', 'guard', 'heavy'] as const;

const nodeMap = (root: THREE.Object3D): Record<string, THREE.Object3D> => { const r: Record<string, THREE.Object3D> = {}; root.traverse(o => { if (o.name) r[o.name] = o; }); return r; };
const FILES: Record<string, number> = { characters: 2_870_000, weapons: 1_400_000 };

let cache: Promise<ShooterAssets> | null = null;
export function loadShooterAssets(base: string, onProgress?: (fraction: number) => void, onNote?: (note: string) => void): Promise<ShooterAssets> {
  cache ??= (async () => {
    const loader = new GLTFLoader(), dir = `${base}assets/models/`, prog = new Map<string, number>(), total = Object.values(FILES).reduce((a, b) => a + b, 0);
    const get = async (name: string): Promise<THREE.Object3D> => {
      const buf = await retry(() => fetchBuffer(`${dir}${name}.glb`, loaded => { prog.set(name, loaded); onProgress?.(Math.min(0.95, [...prog.values()].reduce((a, b) => a + b, 0) / total)); }), { maxAttempts: 2, onRetry: n => onNote?.(`연결이 느립니다. 재시도 중입니다 (${n}회)`) });
      return (await loader.parseAsync(buf, dir)).scene;
    };
    const [characters, weapons] = await Promise.all(['characters', 'weapons'].map(get));
    const cn = nodeMap(characters), wn = nodeMap(weapons), parts: Record<string, CharPart> = {};
    const limb = (n?: THREE.Object3D): CharPart['armL'] => (n ? { geo: bake(n), pivot: n.position.clone() } : null);
    for (const kind of SOLDIER_KINDS) {
      const body = cn[`${kind}_Body`], leg = cn[`${kind}_Leg`];
      if (!body || !leg) throw new Error(`missing soldier ${kind}`);
      parts[kind] = { body: bake(body), leg: bake(leg), shin: cn[`${kind}_Shin`] ? bake(cn[`${kind}_Shin`]) : null, armL: limb(cn[`${kind}_ArmL`]), armR: limb(cn[`${kind}_ArmR`]) };
    }
    const groundGuns: Record<string, THREE.Object3D> = {}, viewGuns: Record<string, THREE.Object3D> = {};
    for (const k of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper']) { if (!wn[`g_${k}`] || !wn[`n_${k}`] || !wn[`arms_${k}`]) throw new Error(`missing weapon ${k}`); groundGuns[k] = wn[`g_${k}`]; viewGuns[k] = wn[`n_${k}`]; }
    onProgress?.(1);
    return { kit: new CharacterKit(parts), groundGuns, viewGuns, weaponNodes: wn };
  })();
  cache.catch(() => { cache = null; });
  return cache;
}
