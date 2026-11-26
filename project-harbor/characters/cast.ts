/** Graphics: CC0 cast loaded from cast.glb. Pose math stays in domain.ts. */

import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Clip, Pose, Wardrobe } from './domain';

export const CAST_IDS = ['m-player', 'f-knit', 'm-polo', 'f-shirt', 'm-asian', 'f-cream', 'm-heavy', 'm-blazer', 'f-blazer', 'm-officer'] as const;

export type CastClip = 'idle' | 'walk' | 'run' | 'talk' | 'phone' | 'sit';

export interface CastPart {
  geometry: T.BufferGeometry;
  material: T.Material | T.Material[];
}

export interface CastTemplate {
  index: number;
  id: string;
  root: T.Object3D;
  clips: Partial<Record<CastClip, T.AnimationClip>>;
  lod: CastPart[];
}

const CLIPS: readonly CastClip[] = ['idle', 'walk', 'run', 'talk', 'phone', 'sit'];

let pending: Promise<void> | null = null;
let library: CastTemplate[] | null = null;

export function loadPeople(): Promise<void> {
  if (!pending) {
    pending = fetchCast()
      .then(templates => { library = templates; })
      .catch(error => {
        console.error(error);
        library = null;
      });
  }
  return pending;
}

export function peopleReady(): boolean {
  return library !== null;
}

export function templateFor(wardrobe: Wardrobe): CastTemplate | null {
  if (!library) return null;
  return library[castIndex(wardrobe)] ?? null;
}

export function templates(): readonly CastTemplate[] {
  return library ?? [];
}

export function castIndex(wardrobe: Wardrobe): number {
  if (wardrobe.role === 'player') return 0;
  if (wardrobe.role === 'officer' || wardrobe.role === 'soldier' || wardrobe.garment === 'uniform' || wardrobe.garment === 'fatigues') return 9;
  if (wardrobe.garment === 'suit') return wardrobe.hips > 0.34 ? 8 : 7;
  const salt = (wardrobe.skin + Math.round(wardrobe.height * 100)) >>> 0;
  if (wardrobe.garment === 'hoodie' || wardrobe.garment === 'hiker') return salt % 2 === 0 ? 1 : 5;
  if (wardrobe.garment === 'linen') return salt % 2 === 0 ? 3 : 4;
  return [2, 3, 4, 6][salt % 4] ?? 2;
}

/** Clip the application already chose wins. Pose is only a fallback for older callers. */
export function castClip(pose: Pose, clip?: Clip): CastClip {
  if (clip === 'phone' || pose.prop === 'phone') return 'phone';
  if (clip === 'talk') return 'talk';
  if (clip === 'run') return 'run';
  if (clip === 'walk') return 'walk';
  if (clip === 'enter' || pose.crouch > 0.2) return 'sit';
  if (clip) return 'idle';
  if (pose.spineX > 0.22 && (Math.abs(pose.lHipX) > 0.2 || pose.lKnee > 0.8)) return 'run';
  if (Math.abs(pose.lHipX) > 0.35 || Math.abs(pose.rHipX) > 0.35 || pose.lKnee > 0.7 || pose.rKnee > 0.7) return 'walk';
  if (pose.rElbow > 1 && pose.lElbow < 0.7) return 'talk';
  return 'idle';
}

async function fetchCast(): Promise<CastTemplate[]> {
  const url = new URL('./models/cast.glb', import.meta.url).href;
  const gltf = await new GLTFLoader().loadAsync(url);
  const byName = new Map<string, T.AnimationClip>();
  for (const clip of gltf.animations) byName.set(clip.name, clip);
  const templates: CastTemplate[] = [];
  gltf.scene.traverse(obj => {
    const mesh = obj as T.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) solidify(material);
    mesh.frustumCulled = false;
  });
  CAST_IDS.forEach((id, index) => {
    const root = gltf.scene.getObjectByName(id);
    if (!root) return;
    const clips: CastTemplate['clips'] = {};
    for (const name of CLIPS) {
      const clip = byName.get(`${id}--${name}`);
      if (clip) clips[name] = clip;
    }
    const lod = bakeIdle(root, clips.idle ?? null);
    const drop: T.Object3D[] = [];
    root.traverse(obj => { if (obj.name.startsWith('LOD')) drop.push(obj); });
    for (const obj of drop) obj.removeFromParent();
    templates[index] = { index, id, root, clips, lod };
  });
  console.info(`harbor cast ${templates.filter(Boolean).length}`);
  return templates;
}

function solidify(material: T.Material): void {
  const mat = material as T.MeshStandardMaterial;
  if (!mat.transparent && mat.alphaTest === 0) return;
  mat.alphaTest = Math.max(mat.alphaTest, 0.35);
  mat.transparent = false;
  mat.depthWrite = true;
  mat.side = T.DoubleSide;
  mat.needsUpdate = true;
}

function bakeIdle(armature: T.Object3D, idle: T.AnimationClip | null): CastPart[] {
  const posed = cloneRig(armature) as T.Object3D;
  if (idle) {
    const mixer = new T.AnimationMixer(posed);
    const action = mixer.clipAction(idle);
    action.play();
    action.time = Math.min(0.05, idle.duration);
    mixer.update(0);
  }
  posed.updateMatrixWorld(true);
  const parts: CastPart[] = [];
  posed.traverse(obj => {
    const mesh = obj as T.Mesh;
    if (!mesh.isMesh || mesh.name.startsWith('LOD') || !mesh.geometry.getAttribute('position')) return;
    parts.push({ geometry: bakeMesh(mesh, posed), material: mesh.material });
  });
  return parts;
}

function bakeMesh(mesh: T.Mesh, root: T.Object3D): T.BufferGeometry {
  const source = mesh.geometry;
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const uv = source.getAttribute('uv');
  const geo = new T.BufferGeometry();
  const out = new Float32Array(position.count * 3);
  const outN = normal ? new Float32Array(normal.count * 3) : null;
  const skinned = mesh as T.SkinnedMesh;
  const skinning = Boolean(skinned.isSkinnedMesh && source.getAttribute('skinIndex') && source.getAttribute('skinWeight'));
  if (skinning) skinned.skeleton.update();
  const bones = skinning ? skinned.skeleton.boneMatrices : null;
  const skinIndex = skinning ? source.getAttribute('skinIndex') : null;
  const skinWeight = skinning ? source.getAttribute('skinWeight') : null;
  const bind = skinning ? skinned.bindMatrix : null;
  const bindInv = skinning ? skinned.bindMatrixInverse : null;
  const v = new T.Vector3();
  const nrm = new T.Vector3();
  const acc = new T.Vector3();
  const accN = new T.Vector3();
  const tmp = new T.Vector3();
  const tmpN = new T.Vector3();
  const mat = new T.Matrix4();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position as T.BufferAttribute, i);
    if (bind) v.applyMatrix4(bind);
    if (outN && normal) {
      nrm.fromBufferAttribute(normal as T.BufferAttribute, i);
      if (bind) nrm.transformDirection(bind);
    }
    acc.set(0, 0, 0);
    accN.set(0, 0, 0);
    let weight = 0;
    if (bones && skinIndex && skinWeight) {
      for (let j = 0; j < skinWeight.itemSize; j += 1) {
        const w = skinWeight.getComponent(i, j);
        if (w === 0) continue;
        mat.fromArray(bones, skinIndex.getComponent(i, j) * 16);
        acc.add(tmp.copy(v).applyMatrix4(mat).multiplyScalar(w));
        if (outN) accN.add(tmpN.copy(nrm).transformDirection(mat).multiplyScalar(w));
        weight += w;
      }
    }
    if (weight === 0) {
      acc.copy(v);
      if (outN) accN.copy(nrm);
    }
    if (bindInv) {
      acc.applyMatrix4(bindInv);
      if (outN) accN.transformDirection(bindInv);
    }
    out[i * 3] = acc.x;
    out[i * 3 + 1] = acc.y;
    out[i * 3 + 2] = acc.z;
    if (outN) {
      if (accN.lengthSq() > 0) accN.normalize();
      outN[i * 3] = accN.x;
      outN[i * 3 + 1] = accN.y;
      outN[i * 3 + 2] = accN.z;
    }
  }
  geo.setAttribute('position', new T.BufferAttribute(out, 3));
  if (outN) geo.setAttribute('normal', new T.BufferAttribute(outN, 3));
  if (uv) geo.setAttribute('uv', uv.clone());
  const index = source.getIndex();
  if (index) geo.setIndex(index.clone());
  geo.applyMatrix4(root.matrixWorld.clone().invert().multiply(mesh.matrixWorld));
  geo.computeBoundingSphere();
  return geo;
}
