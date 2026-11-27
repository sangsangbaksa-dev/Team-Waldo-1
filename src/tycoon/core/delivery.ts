import { DELIVERY_MINUTES, JOBS } from './data';

export const EXPRESS_JOB_ID = 'express_delivery';

export function deliveryTerms(jobId: string) {
  const standard = JOBS.delivery;
  return jobId === EXPRESS_JOB_ID
    ? { minutes: 240, reward: 78, energy: 16, lateMultiplier: 0 }
    : { minutes: DELIVERY_MINUTES, reward: standard.pay, energy: standard.energy, lateMultiplier: 0.5 };
}

export function deliveryPay(jobId: string, reward: number, minutesLeft: number): number {
  const terms = deliveryTerms(jobId);
  return Math.round(reward * (minutesLeft < 0 ? terms.lateMultiplier : minutesLeft > terms.minutes / 2 ? 1.25 : 1));
}
