/** Infrastructure: skinned people. Simulation stays in the application layer. */

import * as T from 'three';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Clip, Pose, Wardrobe } from './domain';
import { REST_HIP, buildFigure, createFigureBones, type FigureBones } from './mesh';
import { castClip, templateFor, templates, type CastClip, type CastTemplate } from './cast';

export interface Rig {
  root: T.Group;
  pelvis: T.Object3D;
  spine: T.Object3D;
  head: T.Object3D;
  lShoulder: T.Object3D;
  rShoulder: T.Object3D;
  lElbow: T.Object3D;
  rElbow: T.Object3D;
  lThigh: T.Object3D;
  rThigh: T.Object3D;
  lKnee: T.Object3D;
  rKnee: T.Object3D;
  lFoot: T.Object3D;
  rFoot: T.Object3D;
  lPlant: T.Object3D;
  rPlant: T.Object3D;
  phone: T.Object3D;
  shadow: T.Mesh;
  scale: number;
  geometries: T.BufferGeometry[];
  bones: FigureBones;
  /** Set when this rig is a cast clone or an impostor slot. Procedural rigs omit it. */
  cast?: number;
  near?: boolean;
  mixer?: T.AnimationMixer;
  clips?: Partial<Record<CastClip, T.AnimationClip>>;
  clipName?: CastClip;
  shared?: boolean;
}

const NEAR_CAP = 12;
const NEAR_IN = 20;
const NEAR_OUT = 28;
const FAR_SLOTS = 64;

export class CharacterGfx {
  private readonly geometries: T.BufferGeometry[] = [];
  private readonly materials = new Map<string, T.Material>();
  private readonly circleGeo = new T.CircleGeometry(0.42, 18);
  private readonly phoneGeo = new T.BoxGeometry(0.04, 0.09, 0.012);
  private readonly scratch = new T.Vector3();
  private readonly far: Rig[] = [];
  private readonly wasNear = new Set<string>();
  private impostors: T.InstancedMesh[][] = [];
  private camX = 0;
  private camZ = 0;

  constructor() {
    this.geometries.push(this.circleGeo, this.phoneGeo);
  }

  /** Instanced far people. The player's gfx never calls this. */
  mount(scene: T.Scene): void {
    if (this.impostors.length > 0) return;
    for (const template of templates()) {
      if (!template) continue;
      const parts: T.InstancedMesh[] = [];
      if (template.lod.length > 0) {
        for (const part of template.lod) {
          const mesh = new T.InstancedMesh(part.geometry, part.material, FAR_SLOTS);
          mesh.count = 0;
          mesh.frustumCulled = false;
          mesh.userData.keep = true;
          mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
          scene.add(mesh);
          parts.push(mesh);
        }
      }
      this.impostors[template.index] = parts;
    }
  }

  setCamera(x: number, z: number): void {
    this.camX = x;
    this.camZ = z;
  }

  /** Nearest skinned people. Everyone else stays on the impostor. */
  chooseNear(peds: readonly { id: string; x: number; z: number; hidden: boolean }[]): Set<string> {
    const ranked = peds.filter(ped => !ped.hidden).map(ped => ({
      id: ped.id,
      d: Math.hypot(ped.x - this.camX, ped.z - this.camZ),
    })).sort((a, b) => a.d - b.d);
    const near = new Set<string>();
    for (const row of ranked) {
      if (near.size >= NEAR_CAP) break;
      const limit = this.wasNear.has(row.id) ? NEAR_OUT : NEAR_IN;
      if (row.d <= limit) near.add(row.id);
    }
    this.wasNear.clear();
    for (const id of near) this.wasNear.add(id);
    return near;
  }

  beginFrame(): void {
    this.far.length = 0;
  }

  endFrame(): void {
    if (this.impostors.length === 0) return;
    const used = this.impostors.map(() => 0);
    for (const rig of this.far) {
      if (!rig.root.visible || rig.cast === undefined) continue;
      const slot = used[rig.cast] ?? 0;
      if (slot >= FAR_SLOTS) continue;
      used[rig.cast] = slot + 1;
      rig.root.updateMatrix();
      for (const mesh of this.impostors[rig.cast] ?? []) mesh.setMatrixAt(slot, rig.root.matrix);
    }
    this.impostors.forEach((parts, cast) => {
      if (!parts) return;
      for (const mesh of parts) {
        mesh.count = used[cast] ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
    this.far.length = 0;
  }

  create(wardrobe: Wardrobe, near = true): Rig {
    const template = templateFor(wardrobe);
    if (template) return near ? this.nearRig(template, wardrobe) : this.farRig(template, wardrobe);
    const scale = wardrobe.height / 1.75;
    const root = new T.Group();
    root.name = 'person';
    root.scale.setScalar(scale);
    const shadow = new T.Mesh(this.circleGeo, this.mat(0x000000, 1, 0, { transparent: true, opacity: 0.32, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.035;
    shadow.userData.keep = true;
    shadow.userData.sharedGeo = true;
    root.add(shadow);
    const bones = createFigureBones(wardrobe);
    const figure = buildFigure(wardrobe, bones, (color, rough, metal) => this.mat(color, rough, metal));
    root.add(figure.body);
    for (const geometry of figure.geometries) this.geometries.push(geometry);
    root.updateMatrixWorld(true);
    figure.body.bind(new T.Skeleton(bones.order));
    root.traverse(obj => { obj.frustumCulled = false; });
    return {
      root, pelvis: bones.pelvis, spine: bones.spine, head: bones.head,
      lShoulder: bones.lShoulder, rShoulder: bones.rShoulder,
      lElbow: bones.lElbow, rElbow: bones.rElbow,
      lThigh: bones.lThigh, rThigh: bones.rThigh,
      lKnee: bones.lKnee, rKnee: bones.rKnee,
      lFoot: bones.lFoot, rFoot: bones.rFoot,
      lPlant: figure.lPlant, rPlant: figure.rPlant,
      phone: figure.phone, shadow, scale, geometries: figure.geometries, bones,
    };
  }

  apply(rig: Rig, pose: Pose, options?: { plant?: boolean; lift?: number; phase?: number; clip?: Clip }): void {
    if (rig.shared) {
      this.playCast(rig, pose, options?.phase ?? 0, options?.clip);
      return;
    }
    const extra = pose.crouch;
    rig.pelvis.rotation.set(0, pose.hipsYaw, pose.hipsRoll);
    rig.spine.rotation.set(pose.spineX, pose.spineY, pose.spineZ);
    rig.bones.chest.rotation.set(pose.spineX * 0.12, 0, 0);
    rig.head.rotation.set(pose.headX, pose.headY, pose.headZ);
    rig.lShoulder.rotation.set(pose.lShoulderX, pose.lShoulderY, pose.lShoulderZ);
    rig.rShoulder.rotation.set(pose.rShoulderX, pose.rShoulderY, pose.rShoulderZ);
    rig.lElbow.rotation.set(-pose.lElbow, 0, 0);
    rig.rElbow.rotation.set(-pose.rElbow, 0, 0);
    rig.lThigh.rotation.set(pose.lHipX + extra * 0.32, 0, pose.lHipZ);
    rig.rThigh.rotation.set(pose.rHipX + extra * 0.32, 0, pose.rHipZ);
    rig.lKnee.rotation.set(pose.lKnee + extra * 0.8, 0, 0);
    rig.rKnee.rotation.set(pose.rKnee + extra * 0.8, 0, 0);
    rig.lFoot.rotation.set(pose.lAnkle, 0, 0);
    rig.rFoot.rotation.set(pose.rAnkle, 0, 0);
    rig.phone.visible = pose.prop === 'phone';
    const lift = options?.lift ?? 0;
    if (options?.plant === false) {
      rig.pelvis.position.y = REST_HIP * (1 - extra * 0.28);
    } else {
      rig.pelvis.position.y = REST_HIP;
      rig.root.updateMatrixWorld(true);
      rig.lPlant.getWorldPosition(this.scratch);
      let lowest = this.scratch.y;
      rig.rPlant.getWorldPosition(this.scratch);
      lowest = Math.min(lowest, this.scratch.y);
      rig.pelvis.position.y -= (lowest - rig.root.position.y - 0.02) / rig.scale;
    }
    rig.shadow.position.y = 0.035 - lift / rig.scale;
  }

  drop(rig: Rig): void {
    for (const geometry of rig.geometries) {
      geometry.dispose();
      const index = this.geometries.indexOf(geometry);
      if (index >= 0) this.geometries.splice(index, 1);
    }
    rig.geometries = [];
  }

  dispose(): void {
    for (const parts of this.impostors) for (const mesh of parts) mesh.removeFromParent();
    this.impostors = [];
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.length = 0;
    this.materials.clear();
  }

  private shadowMesh(): T.Mesh {
    const shadow = new T.Mesh(this.circleGeo, this.mat(0x000000, 1, 0, { transparent: true, opacity: 0.32, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.035;
    shadow.userData.keep = true;
    shadow.userData.sharedGeo = true;
    return shadow;
  }

  private nearRig(template: CastTemplate, wardrobe: Wardrobe): Rig {
    const scale = wardrobe.height / 1.75;
    const root = new T.Group();
    root.name = template.id;
    root.scale.setScalar(scale);
    const shadow = this.shadowMesh();
    root.add(shadow);
    const model = cloneRig(template.root) as T.Object3D;
    root.add(model);
    const bones = mapBones(model);
    const phone = new T.Mesh(this.phoneGeo, this.mat(0x1c2430, 0.35, 0.45));
    phone.position.set(0, 0.08, 0.02);
    phone.visible = false;
    phone.userData.keep = true;
    phone.userData.sharedGeo = true;
    bones.rHand.add(phone);
    root.traverse(obj => {
      obj.frustumCulled = false;
      obj.userData.keep = true;
    });
    return {
      ...rigOf(root, bones, phone, shadow, scale),
      cast: template.index, near: true, shared: true,
      mixer: new T.AnimationMixer(model), clips: template.clips,
    };
  }

  private farRig(template: CastTemplate, wardrobe: Wardrobe): Rig {
    const scale = wardrobe.height / 1.75;
    const root = new T.Group();
    root.name = template.id;
    root.scale.setScalar(scale);
    const shadow = this.shadowMesh();
    root.add(shadow);
    const bones = mapBones(root);
    const phone = new T.Object3D();
    return {
      ...rigOf(root, bones, phone, shadow, scale),
      cast: template.index, near: false, shared: true,
    };
  }

  private playCast(rig: Rig, pose: Pose, phase: number, clip?: Clip): void {
    const name = castClip(pose, clip);
    const chosen = rig.clips?.[name] ?? rig.clips?.idle;
    if (rig.mixer && chosen) {
      const action = rig.mixer.clipAction(chosen);
      if (rig.clipName !== name) {
        rig.mixer.stopAllAction();
        action.play();
        rig.clipName = name;
      }
      const span = chosen.duration > 0 ? chosen.duration : 1;
      action.time = ((phase % 1) + 1) % 1 * span;
      rig.mixer.update(0);
    } else if (rig.near === false) this.far.push(rig);
    rig.phone.visible = pose.prop === 'phone';
  }

  private mat(color: number, roughness: number, metalness: number, extra?: { transparent?: boolean; opacity?: number; depthWrite?: boolean }): T.Material {
    const key = `${color}:${roughness}:${metalness}:${extra?.opacity ?? 1}:${extra?.depthWrite ?? 1}`;
    let material = this.materials.get(key);
    if (!material) {
      material = extra
        ? new T.MeshBasicMaterial({ color, transparent: extra.transparent, opacity: extra.opacity, depthWrite: extra.depthWrite })
        : new T.MeshStandardMaterial({ color, roughness, metalness });
      this.materials.set(key, material);
    }
    return material;
  }
}

function mapBones(root: T.Object3D): FigureBones {
  const found = new Map<string, T.Bone>();
  root.traverse(obj => {
    if ((obj as T.Bone).isBone) found.set(obj.name, obj as T.Bone);
  });
  const take = (name: string) => found.get(name) ?? new T.Bone();
  const bones: FigureBones = {
    pelvis: take('pelvis'),
    spine: take('spine_01'),
    chest: take('spine_02'),
    neck: take('neck_01'),
    head: take('head'),
    lShoulder: take('upperarm_l'),
    lElbow: take('lowerarm_l'),
    lHand: take('hand_l'),
    rShoulder: take('upperarm_r'),
    rElbow: take('lowerarm_r'),
    rHand: take('hand_r'),
    lThigh: take('thigh_l'),
    lKnee: take('calf_l'),
    lFoot: take('foot_l'),
    rThigh: take('thigh_r'),
    rKnee: take('calf_r'),
    rFoot: take('foot_r'),
    order: [],
  };
  bones.order = [
    bones.pelvis, bones.spine, bones.chest, bones.neck, bones.head,
    bones.lShoulder, bones.lElbow, bones.lHand,
    bones.rShoulder, bones.rElbow, bones.rHand,
    bones.lThigh, bones.lKnee, bones.lFoot,
    bones.rThigh, bones.rKnee, bones.rFoot,
  ];
  return bones;
}

function rigOf(root: T.Group, bones: FigureBones, phone: T.Object3D, shadow: T.Mesh, scale: number): Rig {
  return {
    root, pelvis: bones.pelvis, spine: bones.spine, head: bones.head,
    lShoulder: bones.lShoulder, rShoulder: bones.rShoulder,
    lElbow: bones.lElbow, rElbow: bones.rElbow,
    lThigh: bones.lThigh, rThigh: bones.rThigh,
    lKnee: bones.lKnee, rKnee: bones.rKnee,
    lFoot: bones.lFoot, rFoot: bones.rFoot,
    lPlant: bones.lFoot, rPlant: bones.rFoot,
    phone, shadow, scale, geometries: [], bones,
  };
}
