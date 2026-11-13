// LAST CITY — Blender(tools/blender)로 만든 GLB 모델 로더. 실패해도 게임은 도형 모델로 계속됩니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Baked { fixed: THREE.BufferGeometry | null; team: THREE.BufferGeometry | null; skin: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }
export interface CharModel { body: Baked; leg: Baked }
export const CHAR_KINDS = ['boss', 'worker', 'rifle', 'heavy', 'sniper', 'medic', 'civ', 'cop', 'swat', 'guard', 'merc'] as const;
export type CharKind = typeof CHAR_KINDS[number];
export const WEAPON_KINDS = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rocket', 'minigun', 'railgun'] as const;

export interface Models {
  chars: Record<string, CharModel>;
  groundGuns: Record<string, THREE.Object3D>; viewGuns: Record<string, THREE.Object3D>;
  vehicles: Record<string, THREE.Object3D>; structures: Record<string, THREE.Object3D>; props: Record<string, THREE.Object3D>;
  baked: Record<string, Baked>;
}

const white = new THREE.Color(1, 1, 1);
const isGlow = (n: string): boolean => n.startsWith('Glow');

/** 노드 안의 모든 메시를 노드 로컬 좌표로 합쳐 재질 이름별(고정색/팀/피부/발광) 지오메트리로 굽습니다. */
export function bake(root: THREE.Object3D): Baked {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const lists: Record<keyof Baked, THREE.BufferGeometry[]> = { fixed: [], team: [], skin: [], glow: [] };
  root.traverse(o => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material], src = mesh.geometry;
    const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.index ? src.index.count : src.attributes.position.count, materialIndex: 0 }];
    const flat = src.index ? src.toNonIndexed() : src.clone(); const nonIndexedGroups = src.index ? groups.map(g => ({ ...g })) : groups;
    // toNonIndexed 는 그룹 범위를 유지(인덱스 순서가 그대로 펼쳐짐)
    for (const g of nonIndexedGroups) {
      const mat = mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial, name = mat.name;
      const part = new THREE.BufferGeometry(), pos = flat.attributes.position, nor = flat.attributes.normal;
      const n = g.count, p = new Float32Array(n * 3), nn = new Float32Array(n * 3), c = new Float32Array(n * 3);
      const col = name === 'Team' || name === 'Skin' ? white : (isGlow(name) && mat.emissive ? mat.emissive : mat.color);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, g.start + i).applyMatrix4(m), nv = new THREE.Vector3().fromBufferAttribute(nor, g.start + i).transformDirection(m);
        p.set([v.x, v.y, v.z], i * 3); nn.set([nv.x, nv.y, nv.z], i * 3); c.set([col.r, col.g, col.b], i * 3);
      }
      part.setAttribute('position', new THREE.BufferAttribute(p, 3)); part.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); part.setAttribute('color', new THREE.BufferAttribute(c, 3));
      lists[name === 'Team' ? 'team' : name === 'Skin' ? 'skin' : isGlow(name) ? 'glow' : 'fixed'].push(part);
    }
    flat.dispose();
  });
  const join = (l: THREE.BufferGeometry[]): THREE.BufferGeometry | null => (l.length ? mergeGeometries(l, false) : null);
  return { fixed: join(lists.fixed), team: join(lists.team), skin: join(lists.skin), glow: join(lists.glow) };
}

const matCache = new Map<string, THREE.Material>();
/** 모델 복제: Team/Paint 재질은 색으로 치환하고 나머지는 가벼운 Lambert로 통일합니다. */
export function instantiate(template: THREE.Object3D, opts: { team?: number; paint?: number } = {}): THREE.Object3D {
  const out = template.clone(true);
  out.traverse(o => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      const s = m as THREE.MeshStandardMaterial, n = s.name;
      let hex = s.color.getHex(); if (n === 'Team' && opts.team !== undefined) hex = opts.team; else if (n === 'Paint' && opts.paint !== undefined) hex = opts.paint;
      const key = `${isGlow(n) ? 'g' : 'l'}${n}:${hex}`; let r = matCache.get(key);
      if (!r) { r = isGlow(n) ? new THREE.MeshBasicMaterial({ color: s.emissive && s.emissive.getHex() ? s.emissive : s.color, fog: true }) : new THREE.MeshLambertMaterial({ color: hex }); (r as THREE.Material).name = n; matCache.set(key, r); }
      return r;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    mesh.castShadow = true; mesh.receiveShadow = false;
  });
  return out;
}

function nodeMap(root: THREE.Object3D): Record<string, THREE.Object3D> {
  const r: Record<string, THREE.Object3D> = {};
  root.traverse(o => { if (o.name) r[o.name] = o; });
  return r;
}

let cache: Promise<Models> | null = null;
export function loadModels(base: string): Promise<Models> {
  cache ??= (async () => {
    const loader = new GLTFLoader(), get = async (n: string): Promise<THREE.Object3D> => (await loader.loadAsync(`${base}assets/models/${n}.glb`)).scene;
    const [c, w, v, s, p] = await Promise.all(['characters', 'weapons', 'vehicles', 'structures', 'props'].map(get));
    const cn = nodeMap(c), wn = nodeMap(w), vn = nodeMap(v), sn = nodeMap(s), pn = nodeMap(p);
    const chars: Record<string, CharModel> = {};
    for (const k of CHAR_KINDS) { if (!cn[`${k}_Body`] || !cn[`${k}_Leg`]) throw new Error(`missing ${k}`); chars[k] = { body: bake(cn[`${k}_Body`]), leg: bake(cn[`${k}_Leg`]) }; }
    const groundGuns: Record<string, THREE.Object3D> = {}, viewGuns: Record<string, THREE.Object3D> = {};
    for (const k of WEAPON_KINDS) { if (!wn[`g_${k}`] || !wn[`vm_${k}`]) throw new Error(`missing weapon ${k}`); groundGuns[k] = wn[`g_${k}`]; viewGuns[k] = wn[`vm_${k}`]; }
    const need = (m: Record<string, THREE.Object3D>, names: string[]): Record<string, THREE.Object3D> => { for (const n of names) if (!m[n]) throw new Error(`missing ${n}`); return m; };
    need(vn, ['sedan', 'sports', 'police', 'truck', 'tank', 'buggy']); need(sn, ['hq', 'barracks', 'depot', 'factory', 'lab', 'turret']);
    need(pn, ['tree_round', 'tree_pine', 'lamp', 'crystal', 'crate', 'plane', 'hydrant', 'bench', 'bin', 'cone', 'mailbox', 'dumpster', 'barrier', 'tl_red', 'tl_green']);
    const baked: Record<string, Baked> = {};
    for (const k of ['tree_round', 'tree_pine', 'lamp', 'crystal', 'hydrant', 'bench', 'bin', 'cone', 'mailbox', 'dumpster', 'barrier', 'tl_red', 'tl_green']) baked[k] = bake(pn[k]);
    return { chars, groundGuns, viewGuns, vehicles: vn, structures: sn, props: pn, baked };
  })();
  cache.catch(() => { cache = null; });
  return cache;
}
