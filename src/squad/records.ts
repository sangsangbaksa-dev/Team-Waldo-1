const KEY = 'team-waldo-squad-records-v1';
export interface SquadRecord { matches: number; wins: number }

/** Ignore corrupt, negative and fractional counts from older or edited saves. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function readRecords(): SquadRecord {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!raw || typeof raw !== 'object') return { matches: 0, wins: 0 };
    const record = raw as Record<string, unknown>;
    const matches = count(record.matches);
    return { matches, wins: Math.min(matches, count(record.wins)) };
  } catch {
    return { matches: 0, wins: 0 };
  }
}

export function saveResult(win: boolean): void {
  try {
    const r = readRecords();
    localStorage.setItem(KEY, JSON.stringify({
      matches: r.matches + 1,
      wins: r.wins + (win ? 1 : 0),
    }));
  } catch { /* storage may be disabled */ }
}

export function readSquadSummary(): { has: boolean; matches: number; wins: number } {
  const r = readRecords();
  return { has: r.matches > 0, matches: r.matches, wins: r.wins };
}
