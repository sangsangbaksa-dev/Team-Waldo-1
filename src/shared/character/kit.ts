// 공용 캐릭터 — characters.glb 한 파일만 받아 모든 종류를 만들 수 있는 키트로 바꿉니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fetchBuffer, retry } from '../../loading';
import { bake } from './bake';
import { CharacterRig, type CharPart } from './rig';
import { lookFor, type Look } from './variants';

export const CHARACTER_KINDS = ['boss', 'worker', 'rifle', 'heavy', 'sniper', 'medic', 'civ', 'civ2', 'civ3', 'civ4', 'civ5', 'civ6', 'civ7', 'civ8', 'cop', 'swat', 'guard', 'merc'] as const;
export type CharacterKind = typeof CHARACTER_KINDS[number];
/** 시민 8종 · 병사 · 경찰/특수부대 · 일반 분류 */
export const CIVILIANS: CharacterKind[] = ['civ', 'civ2', 'civ3', 'civ4', 'civ5', 'civ6', 'civ7', 'civ8'];
export const SOLDIERS: CharacterKind[] = ['rifle', 'merc', 'swat', 'guard', 'heavy', 'sniper'];

export class CharacterKit {
  constructor(readonly parts: Record<string, CharPart>) {}
  has(kind: string): boolean { return !!this.parts[kind]; }
  /** 종류와 겉모습(없으면 시드로 정함)으로 리그를 만듭니다. */
  create(kind: string, look?: Look | number, team?: number): CharacterRig {
    const part = this.parts[kind] ?? this.parts.civ; if (!part) throw new Error(`character kit has no ${kind}`);
    return new CharacterRig(part, typeof look === 'object' ? look : lookFor(look ?? 0, team));
  }
}

const nodeMap = (root: THREE.Object3D): Record<string, THREE.Object3D> => { const r: Record<string, THREE.Object3D> = {}; root.traverse(o => { if (o.name) r[o.name] = o; }); return r; };
/** 이미 읽은 characters 장면에서 키트를 만듭니다(LAST CITY 처럼 다른 GLB 와 함께 받는 경우). */
export function kitFromScene(scene: THREE.Object3D): CharacterKit {
  const cn = nodeMap(scene), parts: Record<string, CharPart> = {}, limb = (n?: THREE.Object3D): CharPart['armL'] => (n ? { geo: bake(n), pivot: n.position.clone() } : null);
  for (const k of CHARACTER_KINDS) { if (!cn[`${k}_Body`] || !cn[`${k}_Leg`]) throw new Error(`missing ${k}`); parts[k] = { body: bake(cn[`${k}_Body`]), leg: bake(cn[`${k}_Leg`]), shin: cn[`${k}_Shin`] ? bake(cn[`${k}_Shin`]) : null, armL: limb(cn[`${k}_ArmL`]), armR: limb(cn[`${k}_ArmR`]) }; }
  return new CharacterKit(parts);
}

let cache: Promise<CharacterKit> | null = null;
/** characters.glb 만 받아 키트를 만듭니다(한 번만 받고 이후는 캐시). */
export function loadCharacterKit(base: string, onProgress?: (fraction: number) => void): Promise<CharacterKit> {
  cache ??= (async () => {
    const dir = `${base}assets/models/`;
    let high = 0;
    const buf = await retry(() => fetchBuffer(`${dir}characters.glb`, (l, t) => { high = Math.max(high, Math.min(0.95, l / Math.max(t, 2_400_000))); onProgress?.(high); }));
    const kit = kitFromScene((await new GLTFLoader().parseAsync(buf, dir)).scene); onProgress?.(1); return kit;
  })();
  cache.catch(() => { cache = null; });
  return cache;
}
