import { addRun, emptyRecords, normalizeRecords, type SkyRecords, type SkyRun } from '../domain/records';
export interface SkyRecordStore { read(): unknown; write(record: SkyRecords): void }
export function createSkyRecords(store: SkyRecordStore) {
  const read = (): SkyRecords => { try { return normalizeRecords(store.read()); } catch { return emptyRecords(); } };
  return {
    read,
    record(run: SkyRun): void { try { store.write(addRun(read(), run)); } catch { /* Storage is optional. */ } },
  };
}
