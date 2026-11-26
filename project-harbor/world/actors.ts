import * as T from 'three';
import { terrainHeight } from './domain';
import type { GroundItem, Ped, ShotLine } from './street';

export class StreetActors {
  private readonly peds = new Map<string, T.Group>();
  private readonly items = new Map<string, T.Mesh>();
  private readonly lines: T.Line[] = [];
  private readonly body = new T.MeshLambertMaterial({ color: 0xc4b8a4 });
  private readonly police = new T.MeshLambertMaterial({ color: 0x243c66 });
  private readonly down = new T.MeshLambertMaterial({ color: 0x6d645c });
  private readonly pistol = new T.MeshLambertMaterial({ color: 0xd6c27a });
  private readonly smg = new T.MeshLambertMaterial({ color: 0x8aa0b0 });
  private readonly med = new T.MeshLambertMaterial({ color: 0xd4554a });
  private readonly tracer = new T.LineBasicMaterial({ color: 0xffe2a4 });
  private readonly capsule = new T.CapsuleGeometry(0.32, 0.7, 3, 6);
  private readonly gun = new T.BoxGeometry(0.28, 0.16, 0.7);
  private readonly kit = new T.BoxGeometry(0.35, 0.22, 0.35);

  constructor(private readonly scene: T.Scene) {}

  sync(peds: readonly Ped[], items: readonly GroundItem[], shots: readonly ShotLine[]) {
    const live = new Set<string>();
    for (const ped of peds) {
      live.add(ped.id);
      let group = this.peds.get(ped.id);
      if (!group) {
        group = new T.Group();
        const mesh = new T.Mesh(this.capsule, this.body);
        mesh.position.y = 0.85;
        mesh.name = 'body';
        group.add(mesh);
        this.scene.add(group);
        this.peds.set(ped.id, group);
      }
      group.position.set(ped.x, terrainHeight(ped.x, ped.z), ped.z);
      group.rotation.set(ped.health <= 0 ? Math.PI / 2 : 0, ped.health <= 0 ? 0 : -ped.yaw, 0);
      const mesh = group.children[0];
      if (mesh instanceof T.Mesh) mesh.material = ped.health <= 0 ? this.down : ped.kind === 'police' ? this.police : this.body;
    }
    for (const [id, group] of this.peds) {
      if (live.has(id)) continue;
      this.scene.remove(group);
      this.peds.delete(id);
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
    for (const group of this.peds.values()) this.scene.remove(group);
    for (const mesh of this.items.values()) this.scene.remove(mesh);
    for (const line of this.lines) {
      this.scene.remove(line);
      line.geometry.dispose();
    }
    this.peds.clear();
    this.items.clear();
    this.lines.length = 0;
    this.capsule.dispose();
    this.gun.dispose();
    this.kit.dispose();
    for (const material of [this.body, this.police, this.down, this.pistol, this.smg, this.med, this.tracer]) material.dispose();
  }
}
