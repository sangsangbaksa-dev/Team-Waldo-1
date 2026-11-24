export function damp(current: number, target: number, rate: number, dt: number): number;
export function dampAngle(current: number, target: number, rate: number, dt: number): number;
export function walkingMotion(phase: number, amplitude: number, distance: number, dt: number, running: boolean, crouched: boolean, reducedMotion: boolean): { phase: number; amplitude: number; height: number };
export function lampDip(elapsed: number, duration: number, reducedMotion: boolean): number;
export function portraitDistance(width: number, height: number, aspect: number, fov: number, coverage: number): number;
