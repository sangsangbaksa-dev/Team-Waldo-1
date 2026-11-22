// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readSlackRecord, recordSlackRun } from '../../src/slack/records';

afterEach(() => localStorage.clear());

describe('SLACK OFF best-score validation', () => {
  it('ignores negative and malformed saved scores without hiding good runs', () => {
    localStorage.setItem('waldo.slack.v1', JSON.stringify({
      best: {
        class: { score: -40, grade: 'S' },
        dorm: { score: 81, grade: 'A' },
      },
    }));
    expect(readSlackRecord().best).toEqual({ class: undefined, dorm: { score: 81, grade: 'A' } });
    expect(recordSlackRun('class', 22, 'C')).toBe(true);
    expect(readSlackRecord().best.class).toEqual({ score: 22, grade: 'C' });
  });

  it('handles corrupted scores, grades and JSON without throwing', () => {
    for (const value of [
      '{ broken JSON',
      JSON.stringify({ best: { class: { score: '999', grade: 'S' } } }),
      JSON.stringify({ best: { class: { score: 12, grade: 'X' } } }),
      JSON.stringify({ best: { class: { score: Number.POSITIVE_INFINITY, grade: 'S' } } }),
    ]) {
      localStorage.setItem('waldo.slack.v1', value);
      expect(readSlackRecord().best.class).toBeUndefined();
    }
    expect(recordSlackRun('class', -1, 'S')).toBe(false);
    expect(recordSlackRun('dorm', Infinity, 'S')).toBe(false);
  });
});
