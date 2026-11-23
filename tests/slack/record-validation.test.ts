// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('keeps the best score visible if localStorage refuses writes, then persists it on recovery', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage access denied');
    });
    try {
      expect(recordSlackRun('class', 4721, 'A')).toBe(true);
      expect(readSlackRecord().best.class).toEqual({ score: 4721, grade: 'A' });
      expect(recordSlackRun('class', 4000, 'B')).toBe(false);
    } finally {
      blocked.mockRestore();
    }
    expect(recordSlackRun('dorm', 18, 'C')).toBe(true);
    expect(readSlackRecord().best).toEqual({
      class: { score: 4721, grade: 'A' },
      dorm: { score: 18, grade: 'C' },
    });
    expect(JSON.parse(localStorage.getItem('waldo.slack.v1')!).best.class.score).toBe(4721);
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
