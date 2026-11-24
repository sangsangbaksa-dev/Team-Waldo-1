export interface DamageStack { total: number; until: number }

export function playerHitCue(fromPlayer: boolean, kill: boolean): { seconds: number; kill: boolean } {
  if (kill) return { seconds: 0.36, kill: true };
  if (fromPlayer) return { seconds: 0.22, kill: false };
  return { seconds: 0, kill: false };
}

export function stackDamage(prev: DamageStack | null, amount: number, now: number, windowSec = 0.45): DamageStack & { label: string } {
  const live = prev && now <= prev.until ? prev.total : 0;
  const total = live + Math.max(0, amount);
  return { total, until: now + windowSec, label: `−${Math.max(1, Math.ceil(total))}` };
}

export function threatWash(hurt: number, lowPulse: number, outside: boolean): { opacity: number; storm: boolean } {
  const pain = Math.max(0, hurt) * 0.85;
  const low = Math.max(0, lowPulse);
  const edge = outside ? 0.22 : 0;
  return { opacity: Math.min(0.72, Math.max(pain, low, edge)), storm: outside && hurt < 0.18 };
}
