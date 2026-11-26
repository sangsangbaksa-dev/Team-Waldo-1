import type { CarInput } from './physics';

export type HoldName = 'left' | 'right' | 'brake' | 'drift' | 'nitro' | 'gas';

export interface HoldBook {
  down: Record<HoldName, boolean>;
  owner: Map<number, HoldName>;
}

const NAMES: readonly HoldName[] = ['left', 'right', 'brake', 'drift', 'nitro', 'gas'];

export function createHolds(): HoldBook {
  return {
    down: { left: false, right: false, brake: false, drift: false, nitro: false, gas: false },
    owner: new Map(),
  };
}

function ownedByOther(book: HoldBook, name: HoldName, except: number): boolean {
  for (const [id, held] of book.owner) if (id !== except && held === name) return true;
  return false;
}

/** One pointer owns one control. A second finger cannot release a button the first finger still holds. */
export function pressHold(book: HoldBook, id: number, name: HoldName): void {
  const prev = book.owner.get(id);
  if (prev && prev !== name) book.down[prev] = ownedByOther(book, prev, id);
  book.owner.set(id, name);
  book.down[name] = true;
}

/** Returns true when another finger still holds it, false when it is released, null when this pointer was not holding. */
export function releaseHold(book: HoldBook, id: number): boolean | null {
  const name = book.owner.get(id);
  if (!name) return null;
  book.owner.delete(id);
  const still = ownedByOther(book, name, id);
  book.down[name] = still;
  return still;
}

export function clearHolds(book: HoldBook): void {
  book.owner.clear();
  for (const name of NAMES) book.down[name] = false;
}

export interface DriveKeys {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  nitro: boolean;
}

/** Brake wins over throttle so a held pedal and the touch auto-gas cannot fight. */
export function driveInput(keys: DriveKeys): CarInput {
  return {
    throttle: keys.throttle && !keys.brake ? 1 : 0,
    brake: keys.brake ? 1 : 0,
    steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    drift: keys.drift,
    nitro: keys.nitro,
  };
}
