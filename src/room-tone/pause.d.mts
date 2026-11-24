export interface PauseLatch { arm(now: number): void; blocks(now: number): boolean }
export function createPauseLatch(holdMs?: number): PauseLatch;
