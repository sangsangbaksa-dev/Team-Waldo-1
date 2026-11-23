// HUSTLE — restrained in-world arrival marker for the freely selected map waypoint.
import * as THREE from 'three';

export interface Waypoint { x: number; z: number }
const MAX_DRAW_DISTANCE = 115;
const APPROACH_DISTANCE = 6.5;

/**
 * One reusable marker, not a new set of meshes for every waypoint.
 * Keep it subtle: the HUD remains responsible for distant navigation.
 */
export class WayfindingMarker {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private stem: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private disposed = false;
  private time = 0;

  constructor(scene: THREE.Scene) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.28, 1.4, 40),
      new THREE.MeshBasicMaterial({ color: 0xe2bd78, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    this.ring = ring;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 4.5, 6),
      new THREE.MeshBasicMaterial({ color: 0xe2bd78, transparent: true, opacity: 0.14, depthWrite: false }),
    );
    stem.position.y = 2.25;
    this.stem = stem;
    this.group.name = 'HUSTLE wayfinding marker';
    this.group.add(ring, stem);
    this.group.visible = false;
    scene.add(this.group);
  }

  update(dt: number, player: Waypoint, waypoint: Waypoint | null): void {
    if (this.disposed) return;
    const distance = waypoint ? Math.hypot(waypoint.x - player.x, waypoint.z - player.z) : Infinity;
    this.group.visible = distance >= APPROACH_DISTANCE && distance <= MAX_DRAW_DISTANCE;
    if (!this.group.visible || !waypoint) return;
    this.time += Math.min(Math.max(0, dt), 0.1);
    this.group.position.set(waypoint.x, 0.235, waypoint.z);
    // Slow, small change in opacity rather than a glaring arcade pulse.
    this.ring.material.opacity = 0.43 + Math.sin(this.time * 1.9) * 0.065;
    this.stem.material.opacity = 0.1 + Math.min(0.08, distance / MAX_DRAW_DISTANCE * 0.08);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.ring.geometry.dispose(); this.ring.material.dispose();
    this.stem.geometry.dispose(); this.stem.material.dispose();
    this.group.clear();
  }
}
