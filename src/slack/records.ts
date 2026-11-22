import type { SlackRecord, StageId } from './types';

const key = 'waldo.slack.v1';
const sessionBest: SlackRecord['best'] = { class: undefined, dorm: undefined };
export function readSlackRecord(): SlackRecord {
  const record: SlackRecord = { best: { ...sessionBest } };
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (value && typeof value === 'object' && 'best' in value && value.best && typeof value.best === 'object') {
      const best = value.best as Record<string, unknown>;
      for (const stage of ['class', 'dorm'] as const) {
        const entry = best[stage];
        if (entry && typeof entry === 'object' && 'score' in entry && 'grade' in entry &&
            typeof entry.score === 'number' && Number.isFinite(entry.score) && entry.score > (record.best[stage]?.score ?? 0) &&
            typeof entry.grade === 'string' && /^[SABCD]$/.test(entry.grade)) {
          record.best[stage] = { score: entry.score, grade: entry.grade };
        }
      }
    }
  } catch { /* 저장소를 사용할 수 없으면 빈 기록을 반환한다. */ }
  return record;
}
export function recordSlackRun(stage: StageId, score: number, grade: string): boolean {
  if (!Number.isFinite(score) || score <= 0 || !/^[SABCD]$/.test(grade)) return false;
  const record = readSlackRecord();
  if ((record.best[stage]?.score ?? 0) >= score) return false;
  const entry = { score, grade };
  record.best[stage] = entry;
  try {
    localStorage.setItem(key, JSON.stringify(record));
    sessionBest.class = undefined; sessionBest.dorm = undefined;
  } catch { sessionBest[stage] = entry; }
  return true;
}
