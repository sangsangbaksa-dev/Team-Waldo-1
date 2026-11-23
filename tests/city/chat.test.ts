import { describe, expect, it } from 'vitest';
import { CHAT_COOLDOWN_MS, CHAT_MAX, CHAT_SHOW_SEC, ChatLimiter, cleanChat, pushChat, visibleChat, type ChatLine } from '../../src/city/chat';

describe('cleanChat', () => {
  it('rejects non-strings and blank text', () => {
    expect(cleanChat(undefined)).toBe('');
    expect(cleanChat(42)).toBe('');
    expect(cleanChat('   \n\t ')).toBe('');
  });
  it('strips control characters, collapses spaces and limits length', () => {
    expect(cleanChat('  안녕\u0000 하세요\n\n반가워  ')).toBe('안녕 하세요 반가워');
    expect(cleanChat('가'.repeat(500)).length).toBe(CHAT_MAX);
  });
  it('does not split emoji and strips bidi text-direction controls', () => {
    expect(cleanChat('가'.repeat(79) + '😀')).toBe('가'.repeat(79) + '😀');
    expect(cleanChat('안녕\u202e 세계\u2066\u200b!')).toBe('안녕 세계 !');
  });
  it('keeps markup as plain text (escaping is the renderer\'s job)', () => {
    expect(cleanChat('<b>hi</b>')).toBe('<b>hi</b>');
  });
});

describe('ChatLimiter', () => {
  it('allows one message per cooldown per sender', () => {
    const l = new ChatLimiter();
    expect(l.allow('a', 1000)).toBe(true);
    expect(l.allow('a', 1000 + CHAT_COOLDOWN_MS - 1)).toBe(false);
    expect(l.allow('b', 1100)).toBe(true);
    expect(l.allow('a', 1000 + CHAT_COOLDOWN_MS)).toBe(true);
  });
});

describe('chat log', () => {
  const line = (t: number, text = 'x'): ChatLine => ({ name: 'n', text, t, mine: false });
  it('keeps only the newest lines', () => {
    const log: ChatLine[] = [];
    for (let i = 0; i < 10; i++) pushChat(log, line(i, String(i)), 4);
    expect(log.map(l => l.text)).toEqual(['6', '7', '8', '9']);
  });
  it('fades old lines unless the input is open', () => {
    const log = [line(0, 'old'), line(100, 'new')];
    expect(visibleChat(log, 100 + 1, false).map(l => l.text)).toEqual(['new']);
    expect(visibleChat(log, 100 + CHAT_SHOW_SEC + 1, false)).toEqual([]);
    expect(visibleChat(log, 100 + CHAT_SHOW_SEC + 1, true).map(l => l.text)).toEqual(['old', 'new']);
    expect(visibleChat(log, 50, false).map(l => l.text)).toEqual([]); // future messages stay hidden after a clock reset
  });
});
