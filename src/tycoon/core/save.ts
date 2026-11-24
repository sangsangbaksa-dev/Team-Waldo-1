// Compatibility entry point: pure codec and browser adapter are separate.
export { restoreGame, serializeGame } from './save-codec';
export { TYCOON_SAVE_KEY, loadTycoon, saveTycoon, clearTycoon, readTycoonSummary } from '../infrastructure/local-save';
