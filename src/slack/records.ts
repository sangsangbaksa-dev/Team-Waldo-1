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
            typeof entry.score === 'number' && Number.isFinite(entry.score) && entry.score >= 0 && (!record.best[stage] || entry.score > record.best[stage]!.score) &&
            typeof entry.grade === 'string' && /^[SABCD]$/.test(entry.grade)) {
          record.best[stage] = { score: entry.score, grade: entry.grade };
        }
      }
    }
  } catch { /* 저장소를 사용할 수 없으면 임시 기록만 사용한다. */ }
  // Private mode, quota errors and blocked storage must not hide a run from this session.
  for (const stage of ['class', 'dorm'] as const) {
    const pending = sessionBest[stage];
    if (pending && (!record.best[stage] || pending.score > record.best[stage]!.score)) {
      record.best[stage] = { ...pending };
    }
  }
  return record;
}
export function recordSlackRun(stage: StageId, score: number, grade: string): boolean {
  if (!Number.isFinite(score) || score < 0 || !/^[SABCD]$/.test(grade)) return false;
  const record = readSlackRecord();
  const had = record.best[stage]; if (had && had.score >= score) return false;
  const entry = { score, grade };
  record.best[stage] = entry;
  try {
    localStorage.setItem(key, JSON.stringify(record));
    sessionBest.class = undefined; sessionBest.dorm = undefined;
  } catch { sessionBest[stage] = entry; }
  return true;
}
