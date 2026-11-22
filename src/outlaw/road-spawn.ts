// OUTLAW CITY: collision-safe mission, job and garage road spawn positions.
import type { Sim } from './sim';
import { VEHICLES, type LaneNode, type VehicleKind } from './types';
import { groundHeight, isOpen } from './world';

/** Keep newly assigned mission vehicles off existing cars and static props.
 * A single nearest lane can be occupied by streaming traffic or the player.
 * Search progressively farther away without sorting the entire lane graph. */
export function openVehicleLane(sim: Sim, x: number, z: number, kind: VehicleKind): LaneNode | undefined {
  const def = VEHICLES[kind], radius = Math.hypot(def.halfL, def.halfW);
  let chosen: LaneNode | undefined, nearest = 120 ** 2;
  for (const lane of sim.map.lanes) {
    if (lane.light >= 0 || !lane.next.length) continue;
    const dx = lane.x - x, dz = lane.z - z, d2 = dx * dx + dz * dz;
    if (d2 >= nearest || groundHeight(sim.map, lane.x, lane.z) > .08) continue;
    if (!isOpen(sim.map, lane.x, lane.z, radius + .2)) continue;
    if (sim.vehicles.some(v => v.alive && Math.abs(v.y) < 2 &&
        (v.x - lane.x) ** 2 + (v.z - lane.z) ** 2 <
        (radius + Math.hypot(VEHICLES[v.kind].halfL, VEHICLES[v.kind].halfW) + 1) ** 2)) continue;
    if (sim.peds.some(p => p.alive && !p.vehicle && (p.x-lane.x)**2 + (p.z-lane.z)**2 < (radius+1)**2)) continue;
    chosen = lane; nearest = d2;
  }
  return chosen;
}

