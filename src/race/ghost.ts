// Compatibility entry point. Simulation code imports domain/ghost directly.
export * from './domain/ghost';
export { ghostKey, readGhost, writeGhost } from './infrastructure/local-records';
