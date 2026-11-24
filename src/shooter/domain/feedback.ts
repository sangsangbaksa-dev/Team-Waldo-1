export interface HitSample { victim: number; dmg: number; head: boolean }
export interface HitRollup { victim: number; dmg: number; head: boolean }

export function rollupHits(hits: readonly HitSample[]): HitRollup[] {
  const byVictim = new Map<number, HitRollup>();
  for (const hit of hits) {
    if (hit.victim < 0 || hit.dmg <= 0) continue;
    const current = byVictim.get(hit.victim);
    if (!current) byVictim.set(hit.victim, { victim: hit.victim, dmg: hit.dmg, head: hit.head });
    else { current.dmg += hit.dmg; current.head = current.head || hit.head; }
  }
  return [...byVictim.values()];
}

export function nextCombo(prev: number, bursts: number): number {
  if (bursts <= 0) return Math.max(0, prev);
  return Math.min(6, Math.max(0, prev) + bursts);
}

export function damageLabel(dmg: number, combo: number): string {
  const amount = Math.max(0, Math.round(dmg));
  return combo > 1 ? `${amount} ×${combo}` : String(amount);
}

export function markerHold(head: boolean, kill: boolean): number {
  if (kill) return 0.62;
  if (head) return 0.46;
  return 0.34;
}
