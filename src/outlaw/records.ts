// OUTLAW CITY 저장 기록을 게임 본체를 불러오지 않고 읽는 도구(허브 메뉴 상태 표시용).
export const OUTLAW_KEY = 'waldo.outlaw.v1';

export function readOutlawSummary(): { has: boolean; cash: number; missions: number; stunts: number } {
  try {
    const r = JSON.parse(localStorage.getItem(OUTLAW_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!r || typeof r !== 'object' || Array.isArray(r) || r.v !== 1) return { has: false, cash: 0, missions: 0, stunts: 0 };
    return { has: true, cash: typeof r.cash === 'number' && Number.isFinite(r.cash) ? Math.max(0, r.cash) : 0, missions: Array.isArray(r.completed) ? r.completed.length : 0, stunts: Array.isArray(r.stunts) ? r.stunts.length : 0 };
  } catch { return { has: false, cash: 0, missions: 0, stunts: 0 }; }
}
