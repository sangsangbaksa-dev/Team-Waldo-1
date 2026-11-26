import * as T from 'three';
import type { Ride } from './traffic';

export class CityGarage {
  private readonly groups = new Map<number, T.Group>();
  private readonly paint = new Map<number, T.MeshStandardMaterial>();
  private readonly wheel = new T.MeshStandardMaterial({ color: 0x1b1d1c, roughness: 0.8 });
  private readonly glass = new T.MeshStandardMaterial({ color: 0x9eb4c2, roughness: 0.2 });
  private readonly wheelShape = new T.BoxGeometry(0.22, 0.42, 0.42);

  constructor(private readonly scene: T.Scene) {}

  sync(rides: readonly Ride[]) {
    const live = new Set<number>();
    for (const ride of rides) {
      if (Math.abs(ride.x) + Math.abs(ride.z) > 1e7) continue;
      live.add(ride.id);
      let group = this.groups.get(ride.id);
      if (!group) {
        group = this.build(ride);
        this.groups.set(ride.id, group);
        this.scene.add(group);
      }
      group.position.set(ride.x, 0.35, ride.z);
      group.rotation.y = ride.yaw;
      const door = group.children[1];
      if (door) door.rotation.y = -(ride.door ?? 0) * 0.9;
    }
    for (const [id, group] of this.groups) {
      if (live.has(id)) continue;
      this.scene.remove(group);
      this.release(group);
      this.groups.delete(id);
    }
  }

  dispose() {
    for (const group of this.groups.values()) {
      this.scene.remove(group);
      this.release(group);
    }
    this.groups.clear();
    for (const material of this.paint.values()) material.dispose();
    this.paint.clear();
    this.wheelShape.dispose();
    this.wheel.dispose();
    this.glass.dispose();
  }

  private release(group: T.Group) {
    group.traverse(object => {
      if (object instanceof T.Mesh && object.geometry !== this.wheelShape) object.geometry.dispose();
    });
  }

  private material(color: number) {
    let material = this.paint.get(color);
    if (!material) {
      material = new T.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08 });
      this.paint.set(color, material);
    }
    return material;
  }

  private build(ride: Ride) {
    const group = new T.Group();
    const { length, width, color } = ride.spec;
    const body = new T.Mesh(new T.BoxGeometry(width, 0.72, length), this.material(color));
    body.position.y = 0.55;
    group.add(body);
    const door = new T.Group();
    door.position.set(width * 0.5, 0.7, length * 0.12);
    const panel = new T.Mesh(new T.BoxGeometry(0.08, 0.55, length * 0.34), this.material(color));
    panel.position.set(0, 0, -length * 0.12);
    door.add(panel);
    group.add(door);
    const cabin = new T.Mesh(new T.BoxGeometry(width * 0.72, 0.42, length * 0.42), this.glass);
    cabin.position.set(0, 1.02, -length * 0.06);
    group.add(cabin);
    const wheel = this.wheelShape;
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        const mesh = new T.Mesh(wheel, this.wheel);
        mesh.position.set(side * width * 0.48, 0.22, axle * length * 0.32);
        group.add(mesh);
      }
    }
    return group;
  }
}
