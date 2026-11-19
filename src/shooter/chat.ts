// ZERO ZONE 방 채팅 — Enter 로 열고 Enter 로 보냅니다. 화면에는 최근 6줄만, 오래된 줄은 흐려지며 사라집니다.
// 받은 글자는 항상 textContent 로만 그립니다(HTML 로 해석하지 않음).
export const CHAT_MAX = 80, CHAT_GAP_MS = 700, CHAT_LINES = 6, CHAT_LIFE_MS = 9000;

/** 제어 문자를 지우고 공백을 줄이고 80자로 자릅니다. 비면 null. */
export function cleanChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  return s ? s : null;
}

/** 보낸 사람마다 연속 메시지를 막는 간단한 속도 제한(받는 쪽에서도 적용) */
export class ChatLimiter {
  private last = new Map<string, number>();
  allow(who: string, now: number): boolean { const t = this.last.get(who); if (t !== undefined && now - t < CHAT_GAP_MS) return false; this.last.set(who, now); return true; }
}

export interface ChatLine { who: string; text: string; mine: boolean; at: number }

export class ChatBox {
  typing = false;
  private lines: ChatLine[] = []; private log: HTMLElement; private form: HTMLFormElement; private input: HTMLInputElement; private limiter = new ChatLimiter();
  constructor(host: HTMLElement, private onSend: (text: string) => void, private onClose: () => void) {
    this.log = document.createElement('div'); this.log.className = 'sz-chatlog'; this.log.setAttribute('aria-live', 'polite');
    this.form = document.createElement('form'); this.form.className = 'sz-chatform'; this.form.hidden = true;
    this.input = document.createElement('input'); this.input.className = 'sz-chatin'; this.input.maxLength = CHAT_MAX; this.input.autocomplete = 'off'; this.input.placeholder = '메시지 입력 · Enter 전송 · Esc 취소'; this.input.setAttribute('aria-label', '채팅 메시지');
    this.form.append(this.input); host.append(this.log, this.form);
    this.form.addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    this.input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); this.close(); } });
    this.input.addEventListener('keyup', e => e.stopPropagation());
  }
  open(): void { if (this.typing) return; this.typing = true; this.form.hidden = false; this.log.classList.add('open'); this.input.value = ''; this.input.focus(); this.paint(performance.now()); }
  close(): void { if (!this.typing) return; this.typing = false; this.form.hidden = true; this.log.classList.remove('open'); this.input.blur(); this.onClose(); }
  private submit(): void { const t = cleanChat(this.input.value); if (t && this.limiter.allow('me', performance.now())) this.onSend(t); this.close(); }
  /** 받은 메시지(또는 내 메시지)를 줄 목록에 더합니다. 너무 빠른 연속 메시지는 버립니다. */
  add(who: string, id: string, text: unknown, mine: boolean, now: number): boolean {
    const t = cleanChat(text); if (!t) return false; if (!mine && !this.limiter.allow(id, now)) return false;
    this.lines.push({ who, text: t, mine, at: now }); if (this.lines.length > 30) this.lines.shift(); this.paint(now); return true;
  }
  system(text: string, now: number): void { this.lines.push({ who: '', text, mine: false, at: now }); this.paint(now); }
  /** 매 프레임 불러도 가볍습니다: 오래된 줄이 사라질 때만 다시 그립니다. */
  tick(now: number): void { const n = this.visible(now).length; if (n !== this.shown) this.paint(now); }
  private shown = -1;
  private visible(now: number): ChatLine[] { const pool = this.typing ? this.lines : this.lines.filter(l => now - l.at < CHAT_LIFE_MS); return pool.slice(-CHAT_LINES); }
  private paint(now: number): void {
    const vis = this.visible(now); this.shown = vis.length; this.log.replaceChildren(...vis.map(l => {
      const row = document.createElement('div'); row.className = 'sz-chatline' + (l.mine ? ' mine' : '') + (l.who ? '' : ' sys');
      if (l.who) { const b = document.createElement('b'); b.textContent = l.who; row.append(b, document.createTextNode(' ' + l.text)); } else row.textContent = l.text; return row;
    }));
  }
  dispose(): void { this.log.remove(); this.form.remove(); }
}
