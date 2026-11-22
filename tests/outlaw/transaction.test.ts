import { describe, expect, it } from 'vitest';
import { transactionChanged } from '../../src/outlaw/transaction';

describe('OUTLAW durable transaction changes', () => {
  it('does not request a save after an unaffordable or redundant purchase', () => {
    expect(transactionChanged(500, 500, 10, 10)).toBe(false);
  });
  it('requires a save after purchases, rewards and casino wagers', () => {
    expect(transactionChanged(500, 450, 10, 10)).toBe(true);
    expect(transactionChanged(500, 600, 10, 10)).toBe(true);
    expect(transactionChanged(500, 500, 10, 15)).toBe(true);
  });
});
