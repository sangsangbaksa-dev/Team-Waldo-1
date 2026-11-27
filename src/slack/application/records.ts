import type { SlackRecord, StageId } from '../domain/contracts';
export interface SlackRecordStore { read(): unknown; write(record: SlackRecord): void }
export function createSlackRecords(store: SlackRecordStore) {
  const sessionBest: SlackRecord['best'] = { class: undefined, dorm: undefined };
  function read(): SlackRecord {
    const record: SlackRecord = { best: { ...sessionBest } };
    try {
      const value = store.read();
      if (value && typeof value === 'object' && 'best' in value && value.best && typeof value.best === 'object') {
        const best = value.best as Record<string, unknown>;
        for (const stage of ['class', 'dorm'] as const) {
          const entry = best[stage];
          if (entry && typeof entry === 'object' && 'score' in entry && 'grade' in entry &&
              typeof entry.score === 'number' && Number.isFinite(entry.score) && (!record.best[stage] || entry.score > record.best[stage]!.score) &&
              typeof entry.grade === 'string' && /^[SABCD]$/.test(entry.grade)) record.best[stage] = { score: entry.score, grade: entry.grade };
        }
      }
    } catch { /* Keep session records when persistence is unavailable. */ }
    return record;
  }
  function record(stage: StageId, score: number, grade: string): boolean {
    if (!Number.isFinite(score) || score < 0 || !/^[SABCD]$/.test(grade)) return false;
    const current = read(), had = current.best[stage];
    if (had && had.score >= score) return false;
    const entry = { score, grade }; current.best[stage] = entry;
    try { store.write(current); sessionBest.class = undefined; sessionBest.dorm = undefined; }
    catch { sessionBest[stage] = entry; }
    return true;
  }
  return { read, record };
}
