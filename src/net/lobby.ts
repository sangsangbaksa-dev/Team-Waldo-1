// 로그인·가입, 빠른 매칭, 방 코드, 랭킹을 한 곳에서 다루는 오버레이. 게임 화면 위에 올라오고, 매칭이 잡히면 PvpSession 을 넘겨줍니다.
import './net.css';
import { currentAccount, getBackend, setAccount } from './backend';
import { GAME_NAMES, errText, type Account, type Backend, type Channel, type GameKind, type MatchRow, type NetMsg, type RankRow } from './types';

export interface PvpSession {
  backend: Backend; game: GameKind; match: MatchRow; me: Account; host: boolean; opponent: { id: string; nickname: string };
  /** 이 매치 전용 실시간 채널을 엽니다. */
  open(onMessage: (m: NetMsg) => void): Channel;
}
export interface LobbyOptions {
  /** 지정하면 그 게임의 매칭 화면, 없으면 계정·랭킹 화면 */
  game?: GameKind; config?: () => Record<string, unknown>; onMatch?: (s: PvpSession) => void; onClose: () => void;
  /** 처음 보여 줄 안내(예: 인증 링크가 만료됨) */ notice?: string;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function openLobby(opts: LobbyOptions): { close(): void } {
  const root = document.createElement('div'); root.className = 'pvp-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '1대1 대전');
  document.body.append(root);
  let backend: Backend | null = null, me: Account | null = null, screen: 'load' | 'auth' | 'home' | 'wait' | 'ranks' = 'load', authMode: 'in' | 'up' = 'in', closed = false;
  let firstEnter = true, msg = opts.notice ?? '', busy = false, waiting: MatchRow | null = null, poll = 0, rankGame: GameKind = opts.game ?? 'race', ranks: RankRow[] | null = null, rate: { rating: number; wins: number; losses: number } | null = null;
  const form: Record<string, string> = {};

  const set = (patch: () => void): void => { patch(); if (!closed) paint(); };
  function failure(e: unknown): void { msg = errText(e); busy = false; if (!closed) paint(); }

  async function init(): Promise<void> {
    try { backend = await getBackend(); me = await currentAccount(); } catch (e) { failure(e); return; }
    await enter();
  }
  async function enter(): Promise<void> {
    if (!backend) return;
    if (!me) { set(() => { screen = 'auth'; }); return; }
    if (opts.game) { try { rate = await backend.rating(opts.game); } catch { rate = null; } }
    set(() => { screen = 'home'; msg = firstEnter ? (opts.notice ?? '') : ''; firstEnter = false; });
    if (!opts.game) void loadRanks();
  }
  async function loadRanks(): Promise<void> {
    if (!backend) return; ranks = null; paint();
    try { const rows = await backend.leaderboard(rankGame, 20); if (!closed) { ranks = rows; paint(); } } catch (e) { failure(e); }
  }

  async function start(m: MatchRow): Promise<void> {
    if (!backend || !me || closed) return;
    const host = m.host_id === me.id, oppId = host ? m.guest_id : m.host_id; if (!oppId) return;
    const b = backend, account = me, nickname = await b.nickname(oppId).catch(() => '상대');
    if (closed) return; stopPoll(); closed = true; root.remove();
    opts.onMatch?.({ backend: b, game: m.game, match: m, me: account, host, opponent: { id: oppId, nickname }, open: h => b.open(m.id, h) });
  }
  function stopPoll(): void { window.clearInterval(poll); poll = 0; }
  function watch(m: MatchRow): void {
    waiting = m; stopPoll();
    poll = window.setInterval(() => {
      void backend?.getMatch(m.id).then(row => {
        if (closed || waiting?.id !== m.id) return;
        if (row.status === 'playing') void start(row); else if (row.status === 'cancelled') { stopPoll(); waiting = null; set(() => { screen = 'home'; }); }
      }).catch(() => { /* 다음 주기에 다시 확인합니다. */ });
    }, 1200);
  }
  async function find(kind: 'quick' | 'room' | 'join', code = ''): Promise<void> {
    if (!backend || !opts.game || busy) return; busy = true; msg = ''; paint();
    try {
      const cfg = opts.config?.() ?? {};
      const m = kind === 'quick' ? await backend.quickMatch(opts.game, cfg) : kind === 'room' ? await backend.createRoom(opts.game, cfg) : await backend.joinRoom(code);
      busy = false;
      if (m.status === 'playing') { await start(m); return; }
      set(() => { screen = 'wait'; }); watch(m);
    } catch (e) { failure(e); }
  }
  async function cancel(): Promise<void> {
    stopPoll(); const m = waiting; waiting = null; set(() => { screen = 'home'; msg = ''; });
    if (m && backend) await backend.cancelMatch(m.id).catch(() => undefined);
  }
  async function submitAuth(): Promise<void> {
    if (!backend || busy) return; const email = (form.email ?? '').trim(), password = form.password ?? '', nick = (form.nick ?? '').trim();
    if (authMode === 'up' && (nick.length < 2 || nick.length > 16)) { msg = '닉네임은 2~16자로 입력해 주세요.'; paint(); return; }
    if (!email || !password) { msg = '이메일과 비밀번호를 입력해 주세요.'; paint(); return; }
    busy = true; msg = ''; paint();
    try {
      const r = authMode === 'up' ? await backend.signUp(email, password, nick) : await backend.signIn(email, password);
      busy = false;
      if (r === 'confirm') { set(() => { authMode = 'in'; msg = '가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요. 메일이 없거나 링크가 안 되면 아래에서 다시 받을 수 있습니다.'; }); return; }
      me = r; setAccount(r); form.password = ''; await enter();
    } catch (e) { failure(e); }
  }
  async function resend(): Promise<void> {
    if (!backend || busy) return; const email = (form.email ?? '').trim();
    if (!email) { msg = '인증 메일을 받을 이메일을 입력해 주세요.'; paint(); return; }
    busy = true; msg = ''; paint();
    try { await backend.resendConfirmation(email); busy = false; set(() => { msg = '인증 메일을 다시 보냈습니다. 가장 최근에 받은 메일의 링크를 눌러 주세요.'; }); } catch (e) { failure(e); }
  }
  async function rename(): Promise<void> {
    if (!backend || !me || busy) return; const n = (form.rename ?? '').trim(); if (!n) return;
    busy = true; paint();
    try { me = await backend.setNickname(n); setAccount(me); busy = false; set(() => { msg = '닉네임을 바꿨습니다.'; form.rename = ''; }); } catch (e) { failure(e); }
  }
  async function logout(): Promise<void> {
    if (!backend) return; await backend.signOut().catch(() => undefined); me = null; setAccount(null); set(() => { screen = 'auth'; msg = ''; });
  }
  function close(): void { if (closed) return; closed = true; stopPoll(); if (waiting && backend) void backend.cancelMatch(waiting.id).catch(() => undefined); root.remove(); opts.onClose(); }

  const title = opts.game ? `${GAME_NAMES[opts.game]} · 1대1 대전` : '계정 · 랭킹';
  const rankTable = (): string => ranks === null ? '<p class="pvp-dim">불러오는 중…</p>' : ranks.length === 0 ? '<p class="pvp-dim">아직 기록된 대전이 없습니다.</p>'
    : `<table class="pvp-rank"><thead><tr><th>#</th><th>닉네임</th><th>레이팅</th><th>전적</th></tr></thead><tbody>${ranks.map(r => `<tr${r.user_id === me?.id ? ' class="me"' : ''}><td>${r.rank}</td><td>${esc(r.nickname)}</td><td>${r.rating}</td><td>${r.wins}승 ${r.losses}패</td></tr>`).join('')}</tbody></table>`;
  const tabs = (): string => `<div class="pvp-tabs" role="tablist">${(['race', 'city'] as GameKind[]).map(g => `<button type="button" role="tab" aria-selected="${g === rankGame}" data-act="rank:${g}">${GAME_NAMES[g]}</button>`).join('')}</div>`;

  function body(): string {
    if (screen === 'load') return '<p class="pvp-dim">연결하는 중…</p>';
    if (screen === 'auth') return `<form class="pvp-form" data-form="auth">
        <div class="pvp-seg"><button type="button" data-act="mode:in" aria-pressed="${authMode === 'in'}">로그인</button><button type="button" data-act="mode:up" aria-pressed="${authMode === 'up'}">가입</button></div>
        ${authMode === 'up' ? `<label>닉네임<input name="nick" maxlength="16" autocomplete="nickname" value="${esc(form.nick ?? '')}" placeholder="2~16자"></label>` : ''}
        <label>이메일<input name="email" type="email" autocomplete="email" value="${esc(form.email ?? '')}"></label>
        <label>비밀번호<input name="password" type="password" autocomplete="${authMode === 'up' ? 'new-password' : 'current-password'}" minlength="6" value="${esc(form.password ?? '')}"></label>
        <button class="pvp-primary" type="submit"${busy ? ' disabled' : ''}>${authMode === 'up' ? '가입하고 시작' : '로그인'}</button>
        ${authMode === 'in' ? `<button type="button" class="pvp-link" data-act="resend"${busy ? ' disabled' : ''}>인증 메일 다시 받기</button>` : ''}
        <p class="pvp-dim">로그인하면 대전 기록과 레이팅이 저장됩니다. 혼자 하는 모드는 로그인 없이 그대로 즐길 수 있습니다.</p></form>`;
    if (screen === 'wait') return `<div class="pvp-wait"><div class="pvp-spin" aria-hidden="true"></div>${waiting?.code ? `<p>친구에게 이 코드를 알려 주세요</p><b class="pvp-code" id="pvp-code">${esc(waiting.code)}</b><p class="pvp-dim">친구가 대전 화면에서 코드를 입력하면 바로 시작합니다.</p>` : '<p>비슷한 상대를 찾는 중…</p><p class="pvp-dim">다른 플레이어가 같은 게임에서 매칭을 누르면 연결됩니다.</p>'}<button type="button" data-act="cancel">취소</button></div>`;
    if (screen === 'ranks' || (screen === 'home' && !opts.game)) return `${me ? `<div class="pvp-me"><b>${esc(me.nickname)}</b><span>${esc(me.email)}</span></div>` : ''}${tabs()}${rankTable()}
        ${me ? `<form class="pvp-inline" data-form="rename"><input name="rename" maxlength="16" placeholder="새 닉네임" value="${esc(form.rename ?? '')}"><button type="submit"${busy ? ' disabled' : ''}>닉네임 변경</button></form><button type="button" class="pvp-link" data-act="logout">로그아웃</button>` : ''}`;
    const r = rate ?? { rating: 1000, wins: 0, losses: 0 };
    return `<div class="pvp-me"><b>${esc(me?.nickname ?? '')}</b><span>레이팅 ${r.rating} · ${r.wins}승 ${r.losses}패</span></div>
      <div class="pvp-actions"><button type="button" class="pvp-primary" data-act="quick"${busy ? ' disabled' : ''}>빠른 매칭</button><button type="button" data-act="room"${busy ? ' disabled' : ''}>방 만들기</button></div>
      <form class="pvp-inline" data-form="join"><input name="code" maxlength="8" placeholder="방 코드" autocapitalize="characters" autocomplete="off" value="${esc(form.code ?? '')}"><button type="submit"${busy ? ' disabled' : ''}>코드로 입장</button></form>
      ${opts.game === 'race' ? '<p class="pvp-dim">코스와 랩 수는 방을 만든 쪽의 선택을 따르고, 차량은 각자 고른 것을 탑니다.</p>' : ''}
      <div class="pvp-sub"><button type="button" class="pvp-link" data-act="ranks">랭킹 보기</button><button type="button" class="pvp-link" data-act="logout">로그아웃</button></div>`;
  }
  function paint(): void {
    if (closed) return; const keep = document.activeElement instanceof HTMLInputElement ? document.activeElement.name : '';
    root.innerHTML = `<section class="pvp-card"><header><h2>${title}</h2><button type="button" class="pvp-x" data-act="close" aria-label="닫기">✕</button></header>${screen === 'ranks' ? `<button type="button" class="pvp-link" data-act="back">← 대전으로</button>` : ''}${body()}<p class="pvp-msg" role="status" aria-live="polite">${esc(msg)}</p></section>`;
    if (keep) root.querySelector<HTMLInputElement>(`input[name="${keep}"]`)?.focus();
  }
  root.addEventListener('input', e => { const t = e.target as HTMLInputElement; if (t.name) form[t.name] = t.name === 'code' ? t.value.toUpperCase() : t.value; });
  root.addEventListener('submit', e => {
    e.preventDefault(); const f = (e.target as HTMLElement).dataset.form;
    if (f === 'auth') void submitAuth(); else if (f === 'rename') void rename(); else if (f === 'join') void find('join', form.code ?? '');
  });
  root.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return; const [a, arg] = b.dataset.act!.split(':');
    if (a === 'close') close(); else if (a === 'mode') set(() => { authMode = arg as 'in' | 'up'; msg = ''; }); else if (a === 'quick') void find('quick'); else if (a === 'room') void find('room');
    else if (a === 'resend') void resend(); else if (a === 'cancel') void cancel(); else if (a === 'logout') void logout(); else if (a === 'ranks') { set(() => { screen = 'ranks'; }); void loadRanks(); }
    else if (a === 'back') set(() => { screen = 'home'; }); else if (a === 'rank') { rankGame = arg as GameKind; void loadRanks(); }
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  paint(); void init();
  return { close };
}
