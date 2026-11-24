import { describe, expect, it } from 'vitest';
import { deliveryPay, deliveryTerms, EXPRESS_JOB_ID } from '../../src/tycoon/core/delivery';

describe('delivery contracts', () => {
  it('preserves existing delivery payment thresholds', () => {
    expect(deliveryTerms('delivery').minutes).toBe(120);
    expect(deliveryPay('delivery', 40, 61)).toBe(50);
    expect(deliveryPay('delivery', 40, 0)).toBe(40);
    expect(deliveryPay('delivery', 40, -1)).toBe(20);
  });
  it('makes express deadlines strict, with a higher on-time reward', () => {
    const terms = deliveryTerms(EXPRESS_JOB_ID);
    expect(terms.reward).toBeGreaterThan(40);
    expect(deliveryPay(EXPRESS_JOB_ID, terms.reward, terms.minutes / 2 + 1)).toBe(98);
    expect(deliveryPay(EXPRESS_JOB_ID, terms.reward, 0)).toBe(78);
    expect(deliveryPay(EXPRESS_JOB_ID, terms.reward, -1)).toBe(0);
  });
});
