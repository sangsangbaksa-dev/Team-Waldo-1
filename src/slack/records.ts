import type { SlackRecord, StageId } from './types';

const key = 'waldo.slack.v1';
export function readSlackRecord(): SlackRecord {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (value && typeof value === 'object' && 'best' in value && value.best && typeof value.best === 'object') {
      const best = value.best as Record<string, unknown>;
      const record: SlackRecord = { best: { class: undefined, dorm: undefined } };
      for (const stage of ['class', 'dorm'] as const) {
        const entry = best[stage];
        if (entry && typeof entry === 'object' && 'score' in entry && 'grade' in entry &&
            typeof entry.score === 'number' && Number.isFinite(entry.score) && typeof entry.grade === 'string') {
          record.best[stage] = { score: entry.score, grade: entry.grade };
        }
      }
      return record;
    }
  } catch { /* 저장소를 사용할 수 없으면 빈 기록을 반환한다. */ }
  return { best: { class: undefined, dorm: undefined } };
}
export function recordSlackRun(stage: StageId, score: number, grade: string): boolean {
  try {
    if (!Number.isFinite(score)) return false;
    const record = readSlackRecord();
    if (record.best[stage] && record.best[stage]!.score >= score) return false;
    record.best[stage] = { score, grade };
    localStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch { return false; }
}
