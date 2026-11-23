import { describe, expect, it } from 'vitest';
import { createDrawBudget } from '../../src/slack/render-budget';

describe('SLACK OFF embedded RTS drawing budget', () => {
  it('limits a 120Hz animation loop to around 30 canvas redraws', () => {
    const shouldDraw = createDrawBudget(30);
    let draws = 0;
    for (let i = 0; i < 120; i++) {
      if (shouldDraw('game', 1 / 120)) draws++;
    }
    expect(draws).toBeGreaterThanOrEqual(30);
    expect(draws).toBeLessThanOrEqual(31);
  });

  it('draws the first frame of every screen immediately even with no elapsed time', () => {
    const shouldDraw = createDrawBudget(30);
    expect(shouldDraw('doc', 0)).toBe(true);
    expect(shouldDraw('doc', 0)).toBe(false);
    expect(shouldDraw('video', 0)).toBe(true);
    expect(shouldDraw('video', 0)).toBe(false);
    expect(shouldDraw('game', 0)).toBe(true);
  });

  it('never builds up a backlog of frames after one long frame', () => {
    const shouldDraw = createDrawBudget(30);
    expect(shouldDraw('video', 0)).toBe(true);
    expect(shouldDraw('video', 1)).toBe(true);
    expect(shouldDraw('video', 0)).toBe(false);
    expect(shouldDraw('video', 1 / 30)).toBe(true);
    expect(shouldDraw('video', Number.NaN)).toBe(false);
  });
});
