// 모든 게임이 함께 쓰는 채팅의 규칙(정리·욕설 가리기·도배 제한·차단 목록). 화면은 chat-dock.ts, 저장·전송은 Backend 가 맡습니다.
// 서버(supabase/migrations/20261119000000_pvp_chat.sql 의 pvp_chat_send)도 같은 규칙과 같은 단어 목록을 씁니다.
// 단어 목록이나 숫자를 바꾸면 마이그레이션도 함께 바꾸세요(tests/net/chat.test.ts 가 둘이 같은지 확인합니다).
import type { GameKind } from './types';

/** 대화방 이름. lobby = 전체(허브), g:<게임> = 게임 로비, r:<방 id> = 멀티플레이 방, m:<매치 id> = 무작위 1대1 */
// 배포된 서버가 기존 게임의 채널도 인식하므로 검증 규칙에 남깁니다.
export type ChatKey = 'lobby' | `g:${GameKind | 'rts' | 'outlaw'}` | `r:${string}` | `m:${string}`;
export interface ChatMessage { id: number; channel: string; user_id: string; nickname: string; body: string; created_at: string }

export const CHAT_MAX = 140;
/** 서버와 같은 도배 기준: 연속 전송 간격, 15초에 6개 넘으면 60초 제한, 30초 안에 같은 말 반복 금지 */
export const CHAT_RULES = { gapMs: 700, windowMs: 15000, windowMax: 6, muteMs: 60000, repeatMs: 30000 } as const;
/** 신고: 30분 안에 서로 다른 3명이 신고하면 10분 동안 채팅 제한 */
export const CHAT_REPORT = { reporters: 3, windowMin: 30, muteMin: 10 } as const;

export const CHAT_KEY_RE = /^(lobby|g:(city|race|rts|shooter|outlaw)|[rm]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const isChatKey = (k: string): k is ChatKey => CHAT_KEY_RE.test(k);

/** 가릴 말. 흔한 낱말 안에 들어가는 것(예: 시발점, 새끼 고양이)은 넣지 않습니다. */
export const CHAT_BANNED = [
  '씨발', '씨바', '씨팔', 'ㅆㅂ', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '존나', 'ㅈㄴ', '개새끼', '개새', '지랄', 'ㅈㄹ', '미친놈', '미친년', '엠창', '느금마', '니애미', '니미럴',
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'nigga', 'faggot',
] as const;

/** 글자 사이에 끼워 넣어 필터를 피하는 기호·숫자·공백(씨 발, 씨1발, f.u.c.k) */
const GAP = '[\\s0-9._*~!@#$%^&+=/|\\\\-]*';
const esc = (c: string): string => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BANNED_RE = new RegExp(CHAT_BANNED.map(w => [...w].map(esc).join(GAP)).join('|'), 'gi');

/** 앞뒤 공백·제어 문자·겹친 공백을 정리하고, 같은 글자가 8번 넘게 이어지면 8번으로 줄입니다. 빈 문자열이면 보낼 수 없습니다. */
export function normalizeChat(raw: string): string {
  const s = raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().replace(/(.)\1{8,}/gu, (_m, c: string) => c.repeat(8));
  return [...s].slice(0, CHAT_MAX).join('');
}
export const maskChat = (s: string): string => s.replace(BANNED_RE, '***');
/** 보낼 글을 서버와 같은 방법으로 정리합니다. */
export const cleanChat = (raw: string): string => maskChat(normalizeChat(raw));

export type ChatRefusal = 'chat_empty' | 'chat_slow' | 'chat_repeat' | 'chat_muted';
/**
 * 도배 판정. recent = 내가 보낸 최근 글(오래된 것부터), mutedUntil = 제한이 풀리는 시각.
 * 'mute' 는 이번 글로 15초 한도를 넘었다는 뜻이고, 부른 쪽이 mutedUntil 을 now+muteMs 로 정합니다.
 */
export function judgeChat(body: string, recent: ReadonlyArray<{ body: string; at: number }>, now: number, mutedUntil = 0): ChatRefusal | 'mute' | null {
  if (!body) return 'chat_empty';
  if (mutedUntil > now) return 'chat_muted';
  const last = recent[recent.length - 1];
  if (last && now - last.at < CHAT_RULES.gapMs) return 'chat_slow';
  if (recent.slice(-3).some(m => m.body === body && now - m.at < CHAT_RULES.repeatMs)) return 'chat_repeat';
  if (recent.filter(m => now - m.at < CHAT_RULES.windowMs).length >= CHAT_RULES.windowMax) return 'mute';
  return null;
}

/** 버튼 하나로 보내는 짧은 말(모바일·게임 중) */
export const QUICK_CHAT = ['안녕하세요!', 'GG', '좋은 게임이었어요', '한 판 더?', '잠깐만요', '도와주세요!', 'ㅋㅋㅋ', '수고하셨습니다'] as const;

// ---- 차단(내 화면에서만 숨기기). 이 브라우저에만 저장됩니다. ----
const BLOCK_KEY = 'waldo.chat.blocked';
export function readBlocked(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(BLOCK_KEY) ?? '{}') as unknown; return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {}; } catch { return {}; }
}
export function setBlocked(userId: string, nickname: string | null): void {
  const all = readBlocked(); if (nickname === null) delete all[userId]; else all[userId] = nickname;
  try { localStorage.setItem(BLOCK_KEY, JSON.stringify(all)); } catch { /* 저장이 안 되면 이번 화면에서만 적용됩니다 */ }
}

/** 받은 글 목록을 id 순으로 합치고(중복 제거) 마지막 limit 개만 남깁니다. */
export function mergeChat(list: ChatMessage[], add: ChatMessage[], limit = 80): ChatMessage[] {
  const byId = new Map(list.map(m => [m.id, m])); for (const m of add) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-limit);
}
