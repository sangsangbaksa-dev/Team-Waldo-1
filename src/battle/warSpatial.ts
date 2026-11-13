import type { Faction, Unit } from './war';

interface SpatialEntry {
  unit: Unit;
  order: number;
  x: number;
  z: number;
}
interface SpatialCell {
  mask: number;
  owners: [SpatialEntry[], SpatialEntry[], SpatialEntry[], SpatialEntry[]];
}

/**
 * A reusable, frame-local index. The snapshot positions stay fixed during a tick,
 * matching the original combat iteration; entries refer to live unit objects so
 * later attackers see earlier damage and movement. Nothing here enters a save.
 */
export class WarSpatialIndex {
  private readonly cells = new Map<number, SpatialCell>();
  private readonly activeCells: SpatialCell[] = [];
  private readonly entries = new WeakMap<Unit, SpatialEntry>();
  private readonly counts: [number, number, number, number] = [0, 0, 0, 0];
  private halfSize = 260;
  private displacementSquared = 0;
  private readonly cellSize = 22;

  private column(value: number): number { return Math.floor((value + this.halfSize) / this.cellSize); }
  private key(x: number, z: number): number { return x * 128 + z; }

  rebuild(units: readonly Unit[], factions: readonly Faction[], halfSize: number): void {
    this.halfSize = halfSize;
    this.displacementSquared = 0;
    for (const cell of this.activeCells) {
      cell.mask = 0;
      for (const owner of cell.owners) owner.length = 0;
    }
    this.activeCells.length = 0;
    for (let order = 0; order < units.length; order++) {
      const unit = units[order];
      if (unit.hp <= 0 || !factions[unit.owner].alive) continue;
      let entry = this.entries.get(unit);
      if (!entry) {
        entry = { unit, order, x: unit.x, z: unit.z };
        this.entries.set(unit, entry);
      } else { entry.order = order; entry.x = unit.x; entry.z = unit.z; }
      const key = this.key(this.column(unit.x), this.column(unit.z));
      let cell = this.cells.get(key);
      if (!cell) {
        cell = { mask: 0, owners: [[], [], [], []] };
        this.cells.set(key, cell);
      }
      if (!cell.mask) this.activeCells.push(cell);
      cell.mask |= 1 << unit.owner;
      cell.owners[unit.owner].push(entry);
    }
  }

  /** Track actual displacement so post-capture queries include units crossing cells. */
  recordMovement(unit: Unit): void {
    const entry = this.entries.get(unit);
    if (!entry) return;
    const dx = unit.x - entry.x, dz = unit.z - entry.z;
    this.displacementSquared = Math.max(this.displacementSquared, dx * dx + dz * dz);
  }

  nearestEnemy(unit: Unit, factions: readonly Faction[], range: number): Unit | undefined {
    let best: Unit | undefined, nearestSquared = range * range;
    const cx = this.column(unit.x), cz = this.column(unit.z), opposition = 15 & ~(1 << unit.owner);
    let x0 = cx - 1, x1 = cx + 1, z0 = cz - 1, z1 = cz + 1;
    const margin = this.cellSize - range;
    // Strong stacked marching buffs can cross more than the old 3x3 query's
    // spare margin in a long simulation tick. Widen only when actual movement
    // requires it; ordinary ticks keep their original traversal and tie order.
    if (margin < 0 || this.displacementSquared > margin * margin) {
      const reach = range + Math.sqrt(this.displacementSquared) + 1e-6;
      x0 = Math.min(x0, this.column(unit.x - reach)); x1 = Math.max(x1, this.column(unit.x + reach));
      z0 = Math.min(z0, this.column(unit.z - reach)); z1 = Math.max(z1, this.column(unit.z + reach));
    }
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const cell = this.cells.get(this.key(ix, iz));
      if (!cell || !(cell.mask & opposition)) continue;
      let cellBest: SpatialEntry | undefined, cellSquared = nearestSquared;
      for (let owner = 0; owner < 4; owner++) {
        if (owner === unit.owner || !factions[owner].alive || factions[owner].hp <= 0) continue;
        for (const entry of cell.owners[owner]) {
          const enemy = entry.unit;
          if (enemy.hp <= 0) continue;
          const dx = unit.x - enemy.x, dz = unit.z - enemy.z, squared = dx * dx + dz * dz;
          if (squared < cellSquared ||
              (cellBest && squared === cellSquared && entry.order < cellBest.order)) {
            cellBest = entry; cellSquared = squared;
          }
        }
      }
      if (cellBest) { best = cellBest.unit; nearestSquared = cellSquared; }
    }
    return best;
  }

  /** HQ targeting formerly used a stable global distance sort, not cell order. */
  nearestInvader(faction: Faction, factions: readonly Faction[], range: number): Unit | undefined {
    let best: SpatialEntry | undefined, nearest = range;
    const opposition = 15 & ~(1 << faction.id);
    const x0 = this.column(faction.x - range), x1 = this.column(faction.x + range);
    const z0 = this.column(faction.z - range), z1 = this.column(faction.z + range);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const cell = this.cells.get(this.key(ix, iz));
      if (!cell || !(cell.mask & opposition)) continue;
      for (let owner = 0; owner < 4; owner++) {
        if (owner === faction.id || !factions[owner].alive || factions[owner].hp <= 0) continue;
        for (const entry of cell.owners[owner]) {
          const unit = entry.unit;
          if (unit.hp <= 0) continue;
          const distance = Math.hypot(unit.x - faction.x, unit.z - faction.z);
          if (distance < nearest || (best && distance === nearest && entry.order < best.order)) {
            best = entry; nearest = distance;
          }
        }
      }
    }
    return best?.unit;
  }

  /** The returned scratch array is consumed immediately, never retained by callers. */
  ownerCountsAt(x: number, z: number, radius: number, factions: readonly Faction[]): readonly number[] {
    this.counts.fill(0);
    const queryRadius = radius + Math.sqrt(this.displacementSquared) + 1e-6;
    const x0 = this.column(x - queryRadius), x1 = this.column(x + queryRadius);
    const z0 = this.column(z - queryRadius), z1 = this.column(z + queryRadius);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const cell = this.cells.get(this.key(ix, iz));
      if (!cell) continue;
      for (let owner = 0; owner < 4; owner++) {
        if (!factions[owner].alive || factions[owner].hp <= 0) continue;
        for (const entry of cell.owners[owner]) {
          const unit = entry.unit;
          if (unit.hp > 0 && Math.hypot(unit.x - x, unit.z - z) < radius) this.counts[owner]++;
        }
      }
    }
    return this.counts;
  }
}
