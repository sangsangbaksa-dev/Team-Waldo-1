const KEY = 'team-waldo-squad-records-v1';
export function readRecords(): { matches: number; wins: number } { try { const r = JSON.parse(localStorage.getItem(KEY) || '{}'); return { matches: Number(r.matches) || 0, wins: Number(r.wins) || 0 }; } catch { return { matches: 0, wins: 0 }; } }
export function saveResult(win: boolean): void { try { const r = readRecords(); localStorage.setItem(KEY, JSON.stringify({ matches: r.matches + 1, wins: r.wins + (win ? 1 : 0) })); } catch { /* storage may be disabled */ } }
