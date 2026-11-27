import { createSlackRecords } from './application/records';
import { browserSlackRecordStore } from './infrastructure/browser-record-store';
const service = createSlackRecords(browserSlackRecordStore);
export const readSlackRecord = service.read;
export const recordSlackRun = service.record;
