import { GARAGE_KEY, sanitizeGarage } from '../race/garage';

const REMOVED = ['waldo.rts.armory.v1', 'waldo.city.career.v1', 'waldo.shooter.perks.v1'] as const;

/** Retire old permanent upgrade saves without touching records, preferences, or cosmetic ownership. */
export function retireUpgradeSaves(): void {
  try {
    for (const key of REMOVED) localStorage.removeItem(key);
    const raw = localStorage.getItem(GARAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const clean = JSON.stringify(sanitizeGarage(parsed));
      if (raw !== clean) localStorage.setItem(GARAGE_KEY, clean);
    }
  } catch { /* Storage can be unavailable; simulations never read retired upgrades. */ }
}
