import { describe, expect, it } from 'vitest';
import { CHAT_GAP_MS, CHAT_MAX, ChatLimiter, cleanChat } from '../../src/shooter/chat';

describe('cleanChat', () => {
  it('trims, collapses whitespace and strips control characters', () => {
    expect(cleanChat('  안녕\t\n 하세요 \u0007 ')).toBe('안녕 하세요');
  });
  it('caps the length and rejects non-strings and empty text', () => {
    expect(cleanChat('가'.repeat(500))).toHaveLength(CHAT_MAX);
    expect(cleanChat(42)).toBeNull();
    expect(cleanChat(undefined)).toBeNull();
    expect(cleanChat('   ​  ')).toBeNull();
  });
  it('keeps markup as plain text (it is rendered with textContent)', () => {
    expect(cleanChat('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('ChatLimiter', () => {
  it('blocks the same sender inside the gap but not others', () => {
    const l = new ChatLimiter();
    expect(l.allow('a', 1000)).toBe(true);
    expect(l.allow('a', 1000 + CHAT_GAP_MS - 1)).toBe(false);
    expect(l.allow('b', 1000 + 10)).toBe(true);
    expect(l.allow('a', 1000 + CHAT_GAP_MS)).toBe(true);
  });
});
