export interface DecoyState { uses: number; cell: number; remaining: number }
export const DECOY_DURATION: number;
export function createDecoy(): DecoyState;
export function deployDecoy(decoy: DecoyState, cell: number, eligible: boolean): boolean;
export function tickDecoy(decoy: DecoyState, dt: number): void;
export function decoyTarget(decoy: DecoyState, tracking: boolean, inspecting: boolean): number | null;
