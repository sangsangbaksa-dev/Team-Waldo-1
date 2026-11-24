import { movePlayer, type Input, type Movement, type Player } from '../domain/combat.js';
import type { Snapshot } from '../domain/match.js';
import { horizontalDistance, lerp } from '../domain/math.js';
import type { World } from '../domain/world.js';

/** Reconcile predicted movement with authoritative snapshots, without altering either input. */
export class PlayerPrediction {
  private movement?: Movement;
  private snapshot?: Snapshot;
  private generation?: number;

  reset(): void {
    this.movement = undefined;
    this.snapshot = undefined;
    this.generation = undefined;
  }

  predict(world: World, player: Player, input: Input, snapshot: Snapshot, dt: number, latency: number): Player {
    if (this.generation !== player.generation) {
      this.reset();
      this.generation = player.generation;
    }
    if (!this.movement || !player.alive) this.movement = player;
    if (snapshot !== this.snapshot && player.alive) {
      const lead = Math.min(0.09, latency / 2000 + 0.021);
      const target = movePlayer(world, player, input, lead);
      const distance = horizontalDistance(this.movement.position, target.position);
      const blend = distance > 3.5 ? 1 : 0.25;
      const x = lerp(this.movement.position.x, target.position.x, blend);
      const z = lerp(this.movement.position.z, target.position.z, blend);
      this.movement = { ...this.movement, position: { x, y: world.heightAt(x, z), z },
        height: lerp(this.movement.height, player.height, blend) };
      this.snapshot = snapshot;
    }
    if (player.alive) this.movement = movePlayer(world, this.movement, input, dt);
    return { ...player, ...this.movement, alive: player.alive, yaw: input.yaw, pitch: input.pitch,
      aiming: input.aim, steady: input.aim && input.breath && !player.breathExhausted };
  }
}
