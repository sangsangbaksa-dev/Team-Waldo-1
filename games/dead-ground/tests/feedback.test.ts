import { describe, expect, it } from 'vitest';
import { healthLoss, hitPresentation, hitRead, impactLook } from '../src/domain/feedback.js';

describe('hit feedback', () => {
  it('separates a body hit, a headshot, and a body elimination', () => {
    expect(hitRead(false, false)).toBe('body');
    expect(hitRead(true, true)).toBe('head');
    expect(hitPresentation(hitRead(false, true)).label).toBe('DOWN');
    expect(hitPresentation('head').holdMs).toBeGreaterThan(hitPresentation('body').holdMs);
  });
  it('keeps the shooter impact larger than a world splash', () => {
    const mine = impactLook('body', true);
    const world = impactLook('world', false);
    expect(mine.scale).toBeGreaterThan(world.scale);
    expect(mine.life).toBeGreaterThan(world.life);
    expect(impactLook('head', true).scale).toBeGreaterThan(mine.scale);
  });
  it('reports only health that was actually lost', () => {
    expect(healthLoss(100, 35)).toBe(65);
    expect(healthLoss(20, 100)).toBe(0);
  });
});
