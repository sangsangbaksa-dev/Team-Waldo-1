import type { SlackRecord } from '../types';
import type { SlackRecordStore } from '../application/records';
const key = 'waldo.slack.v1';
export const browserSlackRecordStore: SlackRecordStore = {
  read: () => JSON.parse(localStorage.getItem(key) ?? 'null'),
  write: (record: SlackRecord) => localStorage.setItem(key, JSON.stringify(record)),
};
const tutorialKey = 'waldo.slack.tutorial.v1';
export function tutorialSeen(): boolean { try { return localStorage.getItem(tutorialKey) === '1'; } catch { return false; } }
export function markTutorialSeen(): void { try { localStorage.setItem(tutorialKey, '1'); } catch { /* Storage is optional. */ } }
