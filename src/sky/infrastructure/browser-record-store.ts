import type { SkyRecordStore } from '../application/records';
export const SKY_KEY = 'waldo.sky.v1';
export const browserSkyRecordStore: SkyRecordStore = {
  read: () => JSON.parse(localStorage.getItem(SKY_KEY) ?? 'null'),
  write: record => localStorage.setItem(SKY_KEY, JSON.stringify(record)),
};
