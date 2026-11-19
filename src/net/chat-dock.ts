// 화면 구석의 채팅 창. 허브(전체), 온라인 로비(게임·방), 온라인 게임 중(방·상대)에서 같은 창을 씁니다.
//   const chat = openChat({ mode: 'hub' | 'lobby' | 'game', tabs: [{ key: 'lobby', label: '전체' }] });  // 보여 주기
//   chat.set({ ... });  // 대화방 바꾸기        chat.close();  // 치우기
// 여러 곳에서 겹쳐 부르면 마지막에 부른 것이 보이고, 그것을 치우면 그 전 것이 다시 보입니다.
// 게임 중(mode 'game')에는 Enter 로 입력창을 열고, Esc 로 닫습니다. 입력하는 동안의 키는 게임으로 가지 않습니다.
import './chat.css';
import { currentAccount, getBackend, onAccount } from './backend';
import { CHAT_MAX, QUICK_CHAT, mergeChat, readBlocked, setBlocked, type ChatKey, type ChatMessage } from './chat';
import { errText, type Account, type Backend } from './types';

export interface ChatTab { key: ChatKey; label: string }
export interface ChatLayer { mode: 'hub' | 'lobby' | 'game'; tabs: ChatTab[] }

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const hhmm = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const FEED_MS = 9000;

interface Watch { close(): void; failed: boolean }
const stack: Array<{ id: number; layer: ChatLayer }> = [];
let seq = 0;
let dock: Dock | null = null;

export interface ChatHandle { /** 이 층의 대화방을 바꿉니다(창은 그대로). */ set(layer: ChatLayer): void; close(): void }
/** 채팅 창을 띄웁니다. close() 로 이 층을 치웁니다(여러 번 불러도 됩니다). */
export function openChat(layer: ChatLayer): ChatHandle {
  const id = ++seq; stack.push({ id, layer });
  (dock ??= new Dock()).show(layer);
  return {
    set(next) { const s = stack.find(x => x.id === id); if (!s) return; s.layer = next; if (stack[stack.length - 1] === s) dock?.show(next); },
    close() {
      const i = stack.findIndex(s => s.id === id); if (i < 0) return;
      stack.splice(i, 1);
      const top = stack[stack.length - 1];
      if (top) dock?.show(top.layer); else { dock?.destroy(); dock = null; }
    },
  };
}
/** 테스트용: 지금 보이는 층 */
export const chatLayerForTest = (): ChatLayer | null => stack[stack.length - 1]?.layer ?? null;

class Dock {
  private root = document.createElement('div');
  private layer: ChatLayer = { mode: 'hub', tabs: [] };
  private active: ChatKey = 'lobby';
  private expanded = false;
  private backend: Backend | null = null;
  private me: Account | null = null;
  private msgs = new Map<string, ChatMessage[]>();
  private unread = new Map<string, number>();
  private watches = new Map<ChatKey, Watch>();
  private loaded = new Set<string>();
  private failed = new Set<string>();
  private draft = '';
  private note = '';
  private busy = false;
  private menu: number | null = null;
  private showBlocked = false;
  private feedTimer = 0;
  private pollTimer = 0;
  private dead = false;
  private offAccount: (() => void) | null = null;

  constructor() {
    this.root.className = 'chat-dock'; this.root.setAttribute('aria-label', '채팅');
    document.body.append(this.root);
    // 입력하는 동안 누른 키가 게임 조작으로 가지 않게 여기서 멈춥니다.
    for (const t of ['keydown', 'keyup', 'keypress'] as const) this.root.addEventListener(t, e => {
      if (t === 'keydown' && (e as KeyboardEvent).key === 'Escape') { e.preventDefault(); this.collapse(); }
      e.stopPropagation();
    });
    this.root.addEventListener('pointerdown', e => e.stopPropagation());
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('submit', e => { e.preventDefault(); void this.send(this.draft); });
    this.root.addEventListener('input', e => { const t = e.target as HTMLInputElement; if (t.name === 'chat') this.draft = t.value; });
    window.addEventListener('keydown', this.onWindowKey, true);
    void this.connect();
  }

  private async connect(): Promise<void> {
    try { this.backend = await getBackend(); this.me = await currentAccount(); } catch { this.note = '채팅 서버에 연결하지 못했습니다.'; this.paint(); return; }
    if (this.dead) return;
    this.offAccount = onAccount(a => { this.me = a; this.paint(); });
    this.sync(); this.paint();
  }

  show(layer: ChatLayer): void {
    const changed = JSON.stringify(layer) !== JSON.stringify(this.layer); this.layer = layer;
    if (changed) { this.active = layer.tabs[0]?.key ?? 'lobby'; this.menu = null; this.showBlocked = false; if (layer.mode === 'game') this.expanded = false; }
    this.root.dataset.mode = layer.mode;
    this.sync(); this.paint();
  }
  destroy(): void {
    this.dead = true; window.removeEventListener('keydown', this.onWindowKey, true); window.clearTimeout(this.feedTimer); window.clearInterval(this.pollTimer);
    for (const w of this.watches.values()) w.close(); this.watches.clear(); this.offAccount?.(); this.root.remove();
  }

  /** 지금 층의 대화방만 실시간으로 받고, 처음 보는 방은 최근 글을 불러옵니다. */
  private sync(): void {
    const b = this.backend; if (!b || this.dead) return;
    const keys = new Set(this.layer.tabs.map(t => t.key));
    for (const [k, w] of this.watches) if (!keys.has(k)) { w.close(); this.watches.delete(k); }
    for (const k of keys) {
      if (this.watches.has(k)) continue;
      // 채팅이 안 되더라도 로비와 게임은 그대로 돌아가야 하므로 여기서 오류를 막습니다.
      const w: Watch = { close: () => undefined, failed: true };
      try { const handle = b.chatWatch(k, m => this.receive(k, [m], true)); w.close = handle.close; w.failed = false; handle.ready.catch(() => { w.failed = true; }); } catch { /* 기록 불러오기로 대신합니다. */ }
      this.watches.set(k, w);
      if (!this.loaded.has(k)) void this.loadHistory(k);
    }
    // 실시간 연결이 안 되면 열려 있는 동안 12초마다 새 글을 확인합니다.
    window.clearInterval(this.pollTimer);
    this.pollTimer = window.setInterval(() => { const w = this.watches.get(this.active); if (w?.failed && this.expanded) void this.loadHistory(this.active); }, 12000);
  }
  private async loadHistory(k: ChatKey): Promise<void> {
    if (!this.backend) return;
    try { const rows = await this.backend.chatHistory(k, 50); this.loaded.add(k); this.failed.delete(k); this.receive(k, rows, false); } catch { this.failed.add(k); this.paint(); }
  }
  private receive(k: string, rows: ChatMessage[], live: boolean): void {
    if (this.dead) return;
    const before = this.msgs.get(k) ?? [], known = new Set(before.map(m => m.id));
    const fresh = rows.filter(m => !known.has(m.id) && !readBlocked()[m.user_id]);
    this.msgs.set(k, mergeChat(before, rows));
    if (live && fresh.length) {
      const others = fresh.filter(m => m.user_id !== this.me?.id).length;
      if (others && !(this.expanded && this.active === k)) this.unread.set(k, (this.unread.get(k) ?? 0) + others);
      window.clearTimeout(this.feedTimer); this.feedTimer = window.setTimeout(() => this.paint(), FEED_MS + 50);
    }
    this.paint();
  }

  private onWindowKey = (e: KeyboardEvent): void => {
    if (this.layer.mode !== 'game' || e.key !== 'Enter' || e.isComposing || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || this.root.contains(t))) return;
    if (document.querySelector('.pvp-root')) return;
    e.preventDefault(); e.stopPropagation(); this.expand(true);
  };
  private expand(focus: boolean): void {
    this.expanded = true; this.unread.delete(this.active); if (this.failed.has(this.active)) void this.loadHistory(this.active); this.paint();
    if (focus) this.focusInput();
  }
  private focusInput(): void {
    const input = this.root.querySelector<HTMLInputElement>('input[name="chat"]'); if (!input) return;
    // 누르고 있던 이동 키가 눌린 채로 남지 않게 게임에 창이 포커스를 잃었다고 알립니다.
    if (this.layer.mode === 'game') window.dispatchEvent(new Event('blur'));
    input.focus();
  }
  private collapse(): void {
    if (!this.expanded) return; this.expanded = false; this.menu = null;
    (document.activeElement as HTMLElement | null)?.blur?.(); this.paint();
  }

  private async send(text: string): Promise<void> {
    const b = this.backend; if (!b || this.busy) return;
    if (!text.trim()) { if (this.layer.mode === 'game') this.collapse(); return; }
    if (text.length > CHAT_MAX * 2) text = text.slice(0, CHAT_MAX * 2);
    this.busy = true; this.note = ''; this.paint();
    try {
      const m = await b.chatSend(this.active, text);
      this.draft = ''; this.busy = false; this.receive(m.channel, [m], true);
      if (this.layer.mode === 'game') this.collapse(); else this.focusInput();
    } catch (e) { this.busy = false; this.note = errText(e); this.paint(); this.focusInput(); }
  }
  private async report(id: number): Promise<void> {
    const b = this.backend; if (!b) return; this.menu = null;
    try { await b.chatReport(id); this.note = '신고했습니다. 여러 명이 신고하면 그 사람은 잠시 채팅이 막힙니다.'; } catch (e) { this.note = errText(e); }
    this.paint();
  }
  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-chat]'); if (!el) return;
    const [act, arg = ''] = (el.dataset.chat ?? '').split('|');
    if (act === 'toggle') { if (this.expanded) this.collapse(); else this.expand(this.layer.mode !== 'game' || matchMedia('(pointer: fine)').matches); return; }
    if (act === 'close') { this.collapse(); return; }
    if (act === 'tab') { this.active = arg as ChatKey; this.unread.delete(arg); this.menu = null; this.note = ''; this.paint(); return; }
    if (act === 'quick') { void this.send(arg); return; }
    if (act === 'who') { this.menu = this.menu === Number(arg) ? null : Number(arg); this.paint(); return; }
    if (act === 'block') { const m = this.find(Number(arg)); if (m) { setBlocked(m.user_id, m.nickname); this.note = `${m.nickname} 님의 글을 이 기기에서 숨깁니다.`; } this.menu = null; this.paint(); return; }
    if (act === 'report') { void this.report(Number(arg)); return; }
    if (act === 'blocked') { this.showBlocked = !this.showBlocked; this.paint(); return; }
    if (act === 'unblock') { setBlocked(arg, null); this.paint(); return; }
    if (act === 'login') {
      void import('./lobby').then(({ openLobby }) => openLobby({ onClose: () => undefined })).catch(() => undefined);
    }
  }
  private find(id: number): ChatMessage | undefined { for (const list of this.msgs.values()) { const m = list.find(x => x.id === id); if (m) return m; } return undefined; }

  private paint(): void {
    if (this.dead) return;
    const blocked = readBlocked(), keep = document.activeElement instanceof HTMLInputElement && this.root.contains(document.activeElement);
    const list = (this.msgs.get(this.active) ?? []).filter(m => !blocked[m.user_id]);
    const unread = [...this.unread.values()].reduce((a, b) => a + b, 0);
    const game = this.layer.mode === 'game';
    const line = (m: ChatMessage): string => `<span class="chat-nick${m.user_id === this.me?.id ? ' me' : ''}">${esc(m.nickname)}</span><span class="chat-text">${esc(m.body)}</span>`;
    // 접힌 상태에서 잠깐 보이는 최근 글(게임 중에는 상대 글이 오면 바로 보이게)
    const now = Date.now();
    const feed = this.expanded ? [] : this.layer.tabs.flatMap(t => this.msgs.get(t.key) ?? []).filter(m => !blocked[m.user_id] && now - Date.parse(m.created_at) < FEED_MS).sort((a, b) => a.id - b.id).slice(-3);
    const tabs = this.layer.tabs.length > 1 ? `<div class="chat-tabs" role="tablist">${this.layer.tabs.map(t => {
      const n = this.unread.get(t.key) ?? 0;
      return `<button type="button" role="tab" aria-selected="${t.key === this.active}" data-chat="tab|${t.key}">${esc(t.label)}${n ? `<b class="chat-badge">${n > 99 ? '99+' : n}</b>` : ''}</button>`;
    }).join('')}</div>` : `<p class="chat-title">${esc(this.layer.tabs[0]?.label ?? '채팅')}</p>`;
    const items = list.length === 0 ? `<li class="chat-empty">${this.loaded.has(this.active) ? '아직 대화가 없습니다. 먼저 인사해 보세요.' : this.failed.has(this.active) ? '대화를 불러오지 못했습니다. 잠시 뒤에 다시 열어 주세요.' : '불러오는 중…'}</li>`
      : list.map(m => `<li><button type="button" class="chat-who" data-chat="who|${m.id}" aria-expanded="${this.menu === m.id}">${line(m)}</button><time>${hhmm(m.created_at)}</time>${this.menu === m.id && m.user_id !== this.me?.id
        ? `<span class="chat-menu"><button type="button" data-chat="block|${m.id}">차단</button>${this.me ? `<button type="button" data-chat="report|${m.id}">신고</button>` : ''}</span>` : ''}</li>`).join('');
    const blockedIds = Object.keys(blocked);
    const compose = this.me
      ? `<div class="chat-quick" aria-label="빠른 채팅">${QUICK_CHAT.map(q => `<button type="button" data-chat="quick|${esc(q)}"${this.busy ? ' disabled' : ''}>${esc(q)}</button>`).join('')}</div>
         <form class="chat-form"><input name="chat" maxlength="${CHAT_MAX}" autocomplete="off" enterkeyhint="send" placeholder="${game ? 'Enter 로 보내기 · Esc 로 닫기' : '메시지 입력'}" value="${esc(this.draft)}" aria-label="메시지"><button type="submit"${this.busy ? ' disabled' : ''}>보내기</button></form>`
      : `<button type="button" class="chat-login" data-chat="login">로그인하고 대화에 참여하기</button>`;
    this.root.innerHTML = `
      ${feed.length ? `<ol class="chat-feed" aria-hidden="true">${feed.map(m => `<li>${line(m)}</li>`).join('')}</ol>` : ''}
      <button type="button" class="chat-toggle" data-chat="toggle" aria-expanded="${this.expanded}" aria-label="채팅 ${this.expanded ? '닫기' : '열기'}${unread ? `, 새 글 ${unread}개` : ''}">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 16 14H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12.5V6A1.5 1.5 0 0 1 4 4.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        <span class="chat-toggle-label">채팅${game ? ' <kbd>Enter</kbd>' : ''}</span>${unread && !this.expanded ? `<b class="chat-badge">${unread > 99 ? '99+' : unread}</b>` : ''}
      </button>
      ${this.expanded ? `<section class="chat-panel">
        <header>${tabs}<button type="button" class="chat-x" data-chat="close" aria-label="채팅 닫기">✕</button></header>
        <ol class="chat-list" role="log" aria-live="polite">${items}</ol>
        ${compose}
        <p class="chat-note" role="status">${esc(this.note)}</p>
        ${blockedIds.length ? `<div class="chat-blocked"><button type="button" class="chat-link" data-chat="blocked">차단한 사람 ${blockedIds.length}명${this.showBlocked ? ' 접기' : ' 보기'}</button>${this.showBlocked ? `<ul>${blockedIds.map(id => `<li>${esc(blocked[id] ?? '')}<button type="button" data-chat="unblock|${esc(id)}">차단 해제</button></li>`).join('')}</ul>` : ''}</div>` : ''}
      </section>` : ''}`;
    this.root.classList.toggle('open', this.expanded);
    const box = this.root.querySelector('.chat-list'); if (box) box.scrollTop = box.scrollHeight;
    if (keep) this.root.querySelector<HTMLInputElement>('input[name="chat"]')?.focus();
  }
}
