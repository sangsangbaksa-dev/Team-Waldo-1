import * as T from 'three';
import { CharacterGfx, type Rig } from '../characters/infrastructure';
import { modelYaw, poseAt, wardrobeFor, type Clip, type Locale } from '../characters/domain';
import { districtAt, terrainHeight } from './domain';
import type { GroundItem, Ped, ShotLine } from './street';

function saltOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export class StreetActors {
  private readonly rigs = new Map<string, Rig>();
  private readonly phase = new Map<string, number>();
  private readonly items = new Map<string, T.Mesh>();
  private readonly lines: T.Line[] = [];
  private readonly gfx = new CharacterGfx();
  private readonly pistol = new T.MeshLambertMaterial({ color: 0xd6c27a });
  private readonly smg = new T.MeshLambertMaterial({ color: 0x8aa0b0 });
  private readonly med = new T.MeshLambertMaterial({ color: 0xd4554a });
  private readonly tracer = new T.LineBasicMaterial({ color: 0xffe2a4 });
  private readonly gun = new T.BoxGeometry(0.28, 0.16, 0.7);
  private readonly kit = new T.BoxGeometry(0.35, 0.22, 0.35);

  constructor(private readonly scene: T.Scene) {}

  sync(peds: readonly Ped[], items: readonly GroundItem[], shots: readonly ShotLine[]) {
    const live = new Set<string>();
    for (const ped of peds) {
      live.add(ped.id);
      let rig = this.rigs.get(ped.id);
      if (!rig) {
        const locale = districtAt(ped.x, ped.z).id as Locale;
        const role = ped.kind === 'police' ? 'officer' : 'local';
        rig = this.gfx.create(wardrobeFor(locale, saltOf(ped.id), role));
        this.scene.add(rig.root);
        this.rigs.set(ped.id, rig);
        this.phase.set(ped.id, (saltOf(ped.id) % 100) / 100);
      }
      const down = ped.health <= 0;
      const clip: Clip = down ? 'idle' : ped.state === 'flee' || ped.state === 'chase' ? 'run' : 'walk';
      const step = clip === 'run' ? 0.04 : clip === 'walk' ? 0.02 : 0.008;
      const next = ((this.phase.get(ped.id) ?? 0) + step) % 1;
      this.phase.set(ped.id, next);
      rig.root.position.set(ped.x, terrainHeight(ped.x, ped.z) + (down ? 0.35 : 0), ped.z);
      rig.root.rotation.set(down ? Math.PI / 2 : 0, down ? 0 : modelYaw(ped.yaw, 'harbor'), 0);
      this.gfx.apply(rig, poseAt(clip, down ? 0 : next, ped.kind === 'police' ? 0.7 : 0));
    }
    for (const [id, rig] of this.rigs) {
      if (live.has(id)) continue;
      rig.root.removeFromParent();
      this.gfx.drop(rig);
      this.rigs.delete(id);
      this.phase.delete(id);
    }
    const shown = new Set<string>();
    for (const item of items) {
      shown.add(item.id);
      let mesh = this.items.get(item.id);
      if (!mesh) {
        const material = item.kind === 'med' ? this.med : item.weapon === 'smg' ? this.smg : this.pistol;
        mesh = new T.Mesh(item.kind === 'med' ? this.kit : this.gun, material);
        this.scene.add(mesh);
        this.items.set(item.id, mesh);
      }
      mesh.position.set(item.x, terrainHeight(item.x, item.z) + 0.35, item.z);
      mesh.rotation.y += 0.02;
    }
    for (const [id, mesh] of this.items) {
      if (shown.has(id)) continue;
      this.scene.remove(mesh);
      this.items.delete(id);
    }
    for (const line of this.lines) {
      this.scene.remove(line);
      line.geometry.dispose();
    }
    this.lines.length = 0;
    for (const shot of shots) {
      const geometry = new T.BufferGeometry().setFromPoints([
        new T.Vector3(shot.x, 1.3, shot.z),
        new T.Vector3(shot.tx, 1.25, shot.tz),
      ]);
      const line = new T.Line(geometry, this.tracer);
      this.scene.add(line);
      this.lines.push(line);
    }
  }

  dispose() {
    for (const rig of this.rigs.values()) rig.root.removeFromParent();
    this.rigs.clear();
    this.phase.clear();
    this.gfx.dispose();
    for (const mesh of this.items.values()) this.scene.remove(mesh);
    for (const line of this.lines) {
      this.scene.remove(line);
      line.geometry.dispose();
    }
    this.items.clear();
    this.lines.length = 0;
    this.gun.dispose();
    this.kit.dispose();
    for (const material of [this.pistol, this.smg, this.med, this.tracer]) material.dispose();
  }
}
