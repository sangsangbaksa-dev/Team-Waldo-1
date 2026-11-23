// LAST CITY 멀티플레이 채팅 — 순수 규칙(문구 정리·도배 제한·기록). 네트워크는 duel.ts / room.ts, 화면은 game.ts 가 맡습니다.
export const CHAT_MAX = 80, CHAT_COOLDOWN_MS = 1200, CHAT_LOG_MAX = 30, CHAT_SHOW_SEC = 14;

/** 받은 값을 채팅 문구로 정리합니다. 제어 문자 제거, 공백 정리, 길이 제한. 쓸 수 없으면 빈 문자열. */
export function cleanChat(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.slice(0, CHAT_MAX * 8)
    .replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ').trim();
  // Slice Unicode characters, not UTF-16 code units: never split an emoji.
  return Array.from(cleaned).slice(0, CHAT_MAX).join('').trim();
}

/** 보낸 사람별 도배 제한. key 마다 마지막 허용 시각을 기억합니다. */
export class ChatLimiter {
  private last = new Map<string, number>();
  constructor(private cooldownMs = CHAT_COOLDOWN_MS) {}
  allow(key: string, now: number): boolean {
    const at = this.last.get(key);
    if (at !== undefined && now - at >= 0 && now - at < this.cooldownMs) return false;
    this.last.set(key, now); return true;
  }
}

export interface ChatLine { name: string; text: string; t: number; mine: boolean }

/** 기록 맨 뒤에 한 줄 더하고 오래된 줄을 잘라 냅니다. */
export function pushChat(log: ChatLine[], line: ChatLine, max = CHAT_LOG_MAX): void {
  log.push(line); if (log.length > max) log.splice(0, log.length - max);
}

/** 화면에 보일 줄: 최근 CHAT_SHOW_SEC 초 안의 것 중 마지막 n 개. open 이면 시간과 상관없이 마지막 n 개. */
export function visibleChat(log: ChatLine[], now: number, open: boolean, n = 6): ChatLine[] {
  return (open ? log : log.filter(l => now >= l.t && now - l.t < CHAT_SHOW_SEC)).slice(-n);
}
