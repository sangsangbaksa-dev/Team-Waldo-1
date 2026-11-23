import type { CarInput } from './physics';

export interface RaceHeldControls {
  left: boolean;
  right: boolean;
  brake: boolean;
  drift: boolean;
  nitro: boolean;
  gas: boolean;
}

/** Keyboard and touch controls share one mapping; countdown never auto-accelerates. */
export function driverInput(
  keys: ReadonlySet<string>,
  hold: Readonly<RaceHeldControls>,
  touch: boolean,
  phase: 'countdown' | 'racing' | 'done',
): CarInput {
  const left = keys.has('ArrowLeft') || keys.has('KeyA') || hold.left;
  const right = keys.has('ArrowRight') || keys.has('KeyD') || hold.right;
  const brake = keys.has('ArrowDown') || keys.has('KeyS') || hold.brake;
  const gas = keys.has('ArrowUp') || keys.has('KeyW') || hold.gas
    || (touch && phase === 'racing' && !brake);

  return {
    throttle: gas ? 1 : 0,
    brake: brake ? 1 : 0,
    steer: Number(right) - Number(left),
    drift: keys.has('Space') || hold.drift,
    nitro: keys.has('ShiftLeft') || keys.has('ShiftRight') || hold.nitro,
  };
}
