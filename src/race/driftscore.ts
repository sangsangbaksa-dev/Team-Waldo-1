// Compatibility entry point for existing callers.
export * from './domain/drift-score';
export { DRIFT_KEY, readDriftBests, writeDriftBests, type DriftBests } from './infrastructure/local-records';
