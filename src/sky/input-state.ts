export interface FlightControls {
  assist: 0 | 1 | 2;
  sens: number;
  inv: boolean;
}

export function normalizeFlightControls(value: unknown): FlightControls {
  const defaults: FlightControls = { assist: 2, sens: 1, inv: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const data = value as Record<string, unknown>;
  const assist = data.assist === 0 || data.assist === 1 || data.assist === 2 ? data.assist : defaults.assist;
  const sens = typeof data.sens === 'number' && Number.isFinite(data.sens) && data.sens >= 0.6 && data.sens <= 1.6
    ? Math.round(data.sens * 10) / 10 : defaults.sens;
  return { assist, sens, inv: typeof data.inv === 'boolean' ? data.inv : defaults.inv };
}

export class PointerHold {
  private owner: number | null = null;
  get active(): boolean { return this.owner !== null; }

  claim(id: number): boolean {
    if (this.active || !Number.isInteger(id) || id < 0) return false;
    this.owner = id;
    return true;
  }

  release(id: number): boolean {
    if (this.owner !== id) return false;
    this.owner = null;
    return true;
  }

  clear(): void { this.owner = null; }
}

export function pressKey(keys: Set<string>, key: string, repeat: boolean): boolean {
  if (repeat || keys.has(key)) return false;
  keys.add(key);
  return true;
}
