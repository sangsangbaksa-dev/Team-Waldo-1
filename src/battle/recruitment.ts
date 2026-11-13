import { z } from 'zod';
import type { UnitKind } from './war';

export const TRAINING_SECONDS: Record<UnitKind, number> = { infantry: 4, archer: 6, guardian: 8, cavalry: 7 };
export const TRAINING_SLOTS = 6;
export interface RallyPoint { x: number; z: number; }
export interface TrainingOrder { kind: UnitKind; amount: number; remaining: number; }
export interface Recruitment { queue: TrainingOrder[]; rally: RallyPoint | null; }
export const createRecruitment = (): Recruitment => ({ queue: [], rally: null });
export const queuedUnits = (r: Recruitment) => r.queue.reduce((sum, item) => sum + item.amount, 0);
export const queuedSeconds = (r: Recruitment) => r.queue.reduce((sum, item) => sum + item.remaining + (item.amount - 1) * TRAINING_SECONDS[item.kind], 0);
const pointSchema = z.strictObject({ x: z.number().finite().min(-255).max(255), z: z.number().finite().min(-255).max(255) });
const schema = z.strictObject({
  queue: z.array(z.strictObject({ kind: z.enum(['infantry', 'archer', 'guardian', 'cavalry']), amount: z.number().int().min(1).max(5), remaining: z.number().finite().positive().max(8) })).max(TRAINING_SLOTS),
  rally: pointSchema.nullable(),
});
export function validRally(value: unknown): value is RallyPoint { return pointSchema.safeParse(value).success; }
export function validRecruitment(value: unknown): value is Recruitment {
  const parsed = schema.safeParse(value);
  return parsed.success && parsed.data.queue.every(item => item.remaining <= TRAINING_SECONDS[item.kind]);
}
