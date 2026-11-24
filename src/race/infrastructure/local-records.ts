import { sanitizeGhost, type Ghost } from '../domain/ghost';
import { emptyGarage, sanitizeGarage, type Garage } from '../domain/garage';

export const GARAGE_KEY = 'waldo.race.garage.v1';
export const DRIFT_KEY = 'waldo.race.drift.v1';
export const ghostKey = (map: string, laps: number, car: string): string => `waldo.race.ghost.v1:${map}:${laps}:${car}`;
export type DriftBests = Record<string, number>;
type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'setItem'>;

function browserStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function readJson(key: string, storage: ReadStore | null): unknown {
  try { return JSON.parse(storage?.getItem(key) ?? 'null') as unknown; } catch { return null; }
}

function writeJson(key: string, value: unknown, storage: WriteStore | null): void {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Records are optional when storage is unavailable. */ }
}

export function readGhost(map: string, laps: number, car: string, storage: ReadStore | null = browserStorage()): Ghost | null {
  const ghost = sanitizeGhost(readJson(ghostKey(map, laps, car), storage));
  return ghost?.laps === laps ? ghost : null;
}
export function writeGhost(map: string, laps: number, car: string, ghost: Ghost, storage: WriteStore | null = browserStorage()): void {
  writeJson(ghostKey(map, laps, car), ghost, storage);
}
export function readGarage(storage: ReadStore | null = browserStorage()): Garage {
  return storage ? sanitizeGarage(readJson(GARAGE_KEY, storage)) : emptyGarage();
}
export function writeGarage(garage: Garage, storage: WriteStore | null = browserStorage()): void {
  writeJson(GARAGE_KEY, garage, storage);
}
export function readDriftBests(storage: ReadStore | null = browserStorage()): DriftBests {
  const raw = readJson(DRIFT_KEY, storage);
  const out: DriftBests = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1e9) out[key] = Math.round(value);
    }
  }
  return out;
}
export function writeDriftBests(bests: DriftBests, storage: WriteStore | null = browserStorage()): void {
  writeJson(DRIFT_KEY, bests, storage);
}
