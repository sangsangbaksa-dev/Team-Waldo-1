import type { World } from '../world';

const STEP = 1 / 60;
const MAX_STEPS = 4;

/** Bounded fixed-step driver. The UI handles door effects after each tick. */
export class MatchClock {
  private accumulator = 0;

  reset(): void { this.accumulator = 0; }

  advance(world: Pick<World, 'step'>, dt: number, afterStep: () => void): void {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      world.step(STEP);
      this.accumulator -= STEP;
      steps++;
      afterStep();
    }
    if (steps === MAX_STEPS) this.reset();
  }
}
