// OUTLAW CITY 저장 기록을 게임 본체를 불러오지 않고 읽는 도구(허브 메뉴 상태 표시용).
export const OUTLAW_KEY = 'waldo.outlaw.v1';

export function readOutlawSummary(): { has: boolean; cash: number; missions: number; stunts: number } {
  try {
    const r = JSON.parse(localStorage.getItem(OUTLAW_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!r || typeof r !== 'object' || r.v !== 1 || typeof r.cash !== 'number' || !Number.isFinite(r.cash) || !Array.isArray(r.completed) || !Array.isArray(r.guns) || !Array.isArray(r.collected)) return { has: false, cash: 0, missions: 0, stunts: 0 };
    const missions = new Set(r.completed.filter(id => typeof id === 'string' && id.length > 0)).size;
    const stunts = Array.isArray(r.stunts) ? new Set(r.stunts.filter(id => typeof id === 'number' && Number.isInteger(id) && id >= 0)).size : 0;
    return { has: true, cash: Math.max(0, Math.floor(r.cash)), missions: Math.min(7, missions), stunts: Math.min(12, stunts) };
  } catch { return { has: false, cash: 0, missions: 0, stunts: 0 }; }
}
