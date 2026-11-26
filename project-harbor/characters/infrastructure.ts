/** Infrastructure: skinned people. Simulation stays in the application layer. */

import * as T from 'three';
import type { Pose, Wardrobe } from './domain';
import { REST_HIP, buildFigure, createFigureBones, type FigureBones } from './mesh';

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
}

export class CharacterGfx {
  private readonly geometries: T.BufferGeometry[] = [];
  private readonly materials = new Map<string, T.Material>();
  private readonly circleGeo = new T.CircleGeometry(0.42, 18);
  private readonly scratch = new T.Vector3();

  constructor() {
    this.geometries.push(this.circleGeo);
  }

  create(wardrobe: Wardrobe): Rig {
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

  apply(rig: Rig, pose: Pose, options?: { plant?: boolean; lift?: number }): void {
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
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.length = 0;
    this.materials.clear();
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
