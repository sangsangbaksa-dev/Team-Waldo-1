// Public compatibility entry point. New application code imports ./application.
export { createCore, type CoreOptions } from './application';
export type * from './types';
export { STAGES, STAGE_NAMES, SPOTS, SHOP_KINDS, DISTRICTS, REGIONS, RIVALS, GAME_MIN_PER_SEC } from './data';
export { TYCOON_SAVE_KEY, loadTycoon, saveTycoon, clearTycoon, readTycoonSummary } from '../infrastructure/local-save';
export { fmt as formatMoney } from './sim';
