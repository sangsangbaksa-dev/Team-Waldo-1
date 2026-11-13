import type { Unit, War } from './model';
import { MAP_HALF_SIZE } from './rules';

const CELL_SIZE = 22;
const columnOf = (value: number) => Math.floor((value + MAP_HALF_SIZE) / CELL_SIZE);
interface Bucket { units: Unit[]; owners: number; }

/**
 * Reusable broad phase for the strategy battle. Buckets keep insertion order so
 * equal-distance targets resolve exactly as they did before the index was reused.
 * Rebuild once after recruitment/tower attacks; always check current HP on query.
 */
export class UnitSpatialIndex {
  // Separate axes avoid arithmetic-key collisions outside the usual map bounds.
  private readonly columns = new Map<number, Map<number, Bucket>>();
  private readonly activeBuckets: Bucket[] = [];

  rebuild(w: War): void {
    for (const bucket of this.activeBuckets) { bucket.units.length = 0; bucket.owners = 0; }
    this.activeBuckets.length = 0;
    for (const unit of w.units) {
      if (unit.hp <= 0 || !w.factions[unit.owner].alive) continue;
      const cx = columnOf(unit.x);
      const cz = columnOf(unit.z);
      let column = this.columns.get(cx);
      if (!column) this.columns.set(cx, column = new Map());
      let bucket = column.get(cz);
      if (!bucket) column.set(cz, bucket = { units: [], owners: 0 });
      if (bucket.units.length === 0) this.activeBuckets.push(bucket);
      bucket.units.push(unit);
      bucket.owners |= 1 << unit.owner;
    }
  }

  nearestEnemy(w: War, unit: Unit, radius: number): Unit | undefined {
    const cx = columnOf(unit.x);
    const cz = columnOf(unit.z);
    const reach = Math.ceil(radius / CELL_SIZE);
    const opponents = ~(1 << unit.owner);
    let nearest: Unit | undefined;
    let nearestSq = radius * radius;
    for (let ix = -reach; ix <= reach; ix++) {
      const column = this.columns.get(cx + ix);
      if (!column) continue;
      for (let iz = -reach; iz <= reach; iz++) {
        const bucket = column.get(cz + iz);
        // Most early-game cells contain only one army: skip them in constant time.
        if (!bucket || (bucket.owners & opponents) === 0) continue;
        for (const enemy of bucket.units) {
          const faction = w.factions[enemy.owner];
          if (enemy.hp <= 0 || enemy.owner === unit.owner || !faction.alive || faction.hp <= 0) continue;
          const dx = unit.x - enemy.x, dz = unit.z - enemy.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < nearestSq) { nearestSq = d2; nearest = enemy; }
        }
      }
    }
    return nearest;
  }
}
