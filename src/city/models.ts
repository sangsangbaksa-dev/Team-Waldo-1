// LAST CITY — Blender(tools/blender)로 만든 GLB 모델 로더. 실패해도 게임은 도형 모델로 계속됩니다.
import * as THREE from 'three';
import { retry, fetchBuffer, retryNote } from '../loading';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Baked { fixed: THREE.BufferGeometry | null; team: THREE.BufferGeometry | null; skin: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }
/** 어깨에서 흔드는 팔: 지오메트리는 어깨 관절 기준이고 pivot 은 몸통 안에서의 어깨 위치입니다. */
export interface Limb { geo: Baked; pivot: THREE.Vector3 }
/** leg 는 허벅지(골반 관절 기준), shin 은 정강이와 발(무릎 관절 기준)입니다. shin 이 없으면 leg 가 다리 전체입니다. */
export interface CharModel { body: Baked; leg: Baked; shin?: Baked; armL?: Limb; armR?: Limb }
export const CHAR_KINDS = ['boss', 'worker', 'rifle', 'heavy', 'sniper', 'medic', 'civ', 'civ2', 'civ3', 'civ4', 'civ5', 'civ6', 'civ7', 'civ8', 'cop', 'swat', 'guard', 'merc'] as const;
export type CharKind = typeof CHAR_KINDS[number];
/** 보도에 흩뿌리는 2차 거리 소품(tools/blender/street.py). */
export const STREET_PROPS = ['bus_stop', 'vending', 'billboard', 'kiosk', 'planter', 'bollards', 'phone_booth', 'street_sign', 'parasol'] as const;
export const BIZ_KINDS = ['store', 'gas', 'club', 'plant', 'casino', 'bank', 'gunshop'] as const;
export const WEAPON_KINDS = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rocket', 'minigun', 'railgun'] as const;

export interface Models {
  chars: Record<string, CharModel>;
  groundGuns: Record<string, THREE.Object3D>; viewGuns: Record<string, THREE.Object3D>;
  vehicles: Record<string, THREE.Object3D>; structures: Record<string, THREE.Object3D>; props: Record<string, THREE.Object3D>;
  baked: Record<string, Baked>;
  /** 사업체 표식(biz_<종류>). business.glb 가 없으면 비어 있고 게임은 빛기둥만 표시합니다. */
  biz: Record<string, THREE.Object3D>;
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

/** 파일마다 대략의 크기(바이트). 서버가 content-length 를 주지 않을 때 진행률 계산에 씁니다. */
const MODEL_FILES: Record<string, number> = { characters: 2_400_000, weapons: 660_000, vehicles: 1_720_000, structures: 1_190_000, props: 860_000, business: 830_000 };
const TEXTURES = ['brick', 'glass', 'deco', 'industrial', 'ribbon'].flatMap(n => [`facade_${n}`, `facade_${n}_e`]);
const TEXTURE_EST = 200_000;
const OPTIONAL = new Set(['business']);

const buffers = new Map<string, Promise<ArrayBuffer>>();
let report: ((fraction: number, note: string) => void) | null = null;
const prog = new Map<string, { loaded: number; total: number }>();

function emit(): void {
  if (!report) return;
  let l = 0, t = 0; for (const v of prog.values()) { l += v.loaded; t += v.total; }
  report(t > 0 ? Math.min(0.95, l / t) * 0.95 : 0, '');
}

/** 한 파일을 끝까지 받습니다. 네트워크 오류는 성공할 때까지 다시 시도하고, 선택 파일은 몇 번 안 되면 포기합니다. */
function getBuffer(url: string, est: number, optional: boolean): Promise<ArrayBuffer> {
  let p = buffers.get(url);
  if (!p) {
    prog.set(url, { loaded: 0, total: est });
    p = retry(() => fetchBuffer(url, (loaded, total) => { prog.set(url, { loaded, total: Math.max(total, est * 0.5, loaded) }); emit(); }), {
      maxAttempts: optional ? 3 : undefined,
      onRetry: n => { prog.set(url, { loaded: 0, total: est }); report?.(-1, retryNote(n)); },
    });
    buffers.set(url, p);
    p.catch(() => buffers.delete(url));
  }
  return p;
}

let cache: Promise<Models> | null = null;
/**
 * 모델(GLB)과 건물 텍스처를 모두 받아 장면에 쓸 형태로 만듭니다.
 * 받는 중 오류는 계속 재시도하고, 받은 파일이 깨져 해석에 실패하면 한 번 새로 받아 다시 시도합니다.
 * `onProgress(fraction, note)`: fraction 은 0~1, 재시도 안내 문구가 있으면 note 에 담깁니다(fraction -1 은 안내만).
 */
export function loadModels(base: string, onProgress?: (fraction: number, note: string) => void): Promise<Models> {
  if (onProgress) report = onProgress;
  cache ??= (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const loader = new GLTFLoader(), dir = `${base}assets/models/`;
        const get = async (n: string): Promise<THREE.Object3D> => (await loader.parseAsync(await getBuffer(`${dir}${n}.glb`, MODEL_FILES[n]!, OPTIONAL.has(n)), dir)).scene;
        for (const n of TEXTURES) void getBuffer(`${base}assets/tex/${n}.png`, TEXTURE_EST, true).catch(() => undefined);
        const [c, w, v, s, p] = await Promise.all(['characters', 'weapons', 'vehicles', 'structures', 'props'].map(get));
        report?.(0.97, '');
        return await build(c, w, v, s, p, get);
      } catch (e) {
        if (attempt >= 2) throw e;
        for (const k of [...buffers.keys()]) if (k.endsWith('.glb')) buffers.delete(k); // 깨진 파일일 수 있어 새로 받습니다
      }
    }
  })();
  cache.catch(() => { cache = null; });
  return cache;
}

async function build(c: THREE.Object3D, w: THREE.Object3D, v: THREE.Object3D, s: THREE.Object3D, p: THREE.Object3D, get: (n: string) => Promise<THREE.Object3D>): Promise<Models> {
  {
    const biz: Record<string, THREE.Object3D> = {};
    try { const bn = nodeMap(await get('business')); for (const k of BIZ_KINDS) if (bn[`biz_${k}`]) biz[k] = bn[`biz_${k}`]; } catch { /* 표식 모델은 선택 사항 */ }
    const cn = nodeMap(c), wn = nodeMap(w), vn = nodeMap(v), sn = nodeMap(s), pn = nodeMap(p);
    const chars: Record<string, CharModel> = {}, limb = (n?: THREE.Object3D): Limb | undefined => (n ? { geo: bake(n), pivot: n.position.clone() } : undefined);
    for (const k of CHAR_KINDS) { if (!cn[`${k}_Body`] || !cn[`${k}_Leg`]) throw new Error(`missing ${k}`); const shin = cn[`${k}_Shin`]; chars[k] = { body: bake(cn[`${k}_Body`]), leg: bake(cn[`${k}_Leg`]), shin: shin ? bake(shin) : undefined, armL: limb(cn[`${k}_ArmL`]), armR: limb(cn[`${k}_ArmR`]) }; }
    const groundGuns: Record<string, THREE.Object3D> = {}, viewGuns: Record<string, THREE.Object3D> = {};
    for (const k of WEAPON_KINDS) { if (!wn[`g_${k}`] || !wn[`vm_${k}`]) throw new Error(`missing weapon ${k}`); groundGuns[k] = wn[`g_${k}`]; viewGuns[k] = wn[`vm_${k}`]; }
    const need = (m: Record<string, THREE.Object3D>, names: string[]): Record<string, THREE.Object3D> => { for (const n of names) if (!m[n]) throw new Error(`missing ${n}`); return m; };
    need(vn, ['sedan', 'hatch', 'suv', 'taxi', 'van', 'sports', 'police', 'truck', 'tank', 'buggy']); need(sn, ['hq', 'barracks', 'depot', 'factory', 'lab', 'turret']);
    need(pn, ['tree_round', 'tree_pine', 'lamp', 'crystal', 'crate', 'plane', 'hydrant', 'bench', 'bin', 'cone', 'mailbox', 'dumpster', 'barrier', 'tl_red', 'tl_green']);
    const baked: Record<string, Baked> = {};
    for (const k of ['tree_round', 'tree_pine', 'lamp', 'crystal', 'hydrant', 'bench', 'bin', 'cone', 'mailbox', 'dumpster', 'barrier', 'tl_red', 'tl_green']) baked[k] = bake(pn[k]);
    for (const k of STREET_PROPS) if (pn[k]) baked[k] = bake(pn[k]);
    return { chars, groundGuns, viewGuns, vehicles: vn, structures: sn, props: pn, baked, biz };
  }
}
