import { DISTRICTS, type District } from './domain';
import type { Point } from './exploration';

export interface Course { id: District; name: string; start: Point; gates: readonly Point[]; limit: number; reward: number }
const names: Record<District, string> = {
  forest: '노스우드 순환로', city: '캘러웨이 시가지', rich: '크레스트힐 드라이브',
  desert: '레드메사 질주', slum: '사우스야드 순환로', base: '포트 아이언 외곽로',
};
export const COURSES: readonly Course[] = DISTRICTS.map(d => {
  const x = d.x - 192, z = d.z - 192;
  return { id: d.id, name: names[d.id], start: { x, z: z + 32 },
    gates: [{ x, z: z + 256 }, { x: x + 256, z: z + 256 }, { x: x + 256, z }, { x, z }, { x, z: z + 32 }],
    limit: 100, reward: 220 };
});
export interface Trial { course: Course; vehicleId: number; next: number; elapsed: number }
export type TrialEvent = 'none' | 'gate' | 'finish' | 'cancel' | 'timeout';
export interface TrialUpdate { trial: Trial | null; event: TrialEvent; elapsed: number }
export interface TrialDriver extends Point { id: number; speed: number; health: number }
export function nearbyCourse(at: Point, range = 14): Course | null {
  return COURSES.find(course => Math.hypot(at.x - course.start.x, at.z - course.start.z) <= range) ?? null;
}
export function beginTrial(course: Course, driver: TrialDriver | null, wanted: number): Trial | null {
  if (!driver || wanted > 0 || driver.health <= 0 || Math.abs(driver.speed) > 2 ||
      Math.hypot(driver.x - course.start.x, driver.z - course.start.z) > 14) return null;
  return { course, vehicleId: driver.id, next: 0, elapsed: 0 };
}
export function stepTrial(trial: Trial, driver: TrialDriver | null, wanted: number, dt: number): TrialUpdate {
  const elapsed = trial.elapsed + Math.max(0, Math.min(0.05, dt));
  if (!driver || driver.id !== trial.vehicleId || driver.health <= 0 || wanted > 0) return { trial: null, event: 'cancel', elapsed };
  if (elapsed >= trial.course.limit) return { trial: null, event: 'timeout', elapsed };
  const gate = trial.course.gates[trial.next];
  if (!gate || Math.hypot(driver.x - gate.x, driver.z - gate.z) > 11) return { trial: { ...trial, elapsed }, event: 'none', elapsed };
  const next = trial.next + 1;
  if (next >= trial.course.gates.length) return { trial: null, event: 'finish', elapsed };
  return { trial: { ...trial, next, elapsed }, event: 'gate', elapsed };
}
export function recordTrial(records: Map<string, number>, course: Course, elapsed: number): boolean {
  if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed >= course.limit || elapsed >= (records.get(course.id) ?? Infinity)) return false;
  records.set(course.id, elapsed); return true;
}
