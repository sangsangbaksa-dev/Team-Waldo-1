// 모든 게임이 공유하는 Supabase 로비(1대1 + 멀티플레이 방). 게임 쪽에서 쓰는 방법:
//   import('../net/lobby').then(({ openLobby }) => openLobby({
//     game: 'city' | 'race' | 'rts' | 'shooter',   // GameKind. 새 게임은 types.ts·마이그레이션의 허용 목록에 추가
//     maxPlayers: 6,                               // 생략하면 2(1대1 전용). 2보다 크면 onRoom 필수
//     config: () => ({ ...방 설정(시드·코스 등) }), // 방장/먼저 기다린 쪽의 값이 상대에게 전달됨(match.config / room.config)
//     onMatch: (s: PvpSession) => ...,              // 1대1 시작(무작위 매칭 또는 2인 방): 레이팅 반영, s.backend.report(s.match.id, winnerId)
//     onRoom: (s: RoomSession) => ...,              // 3인 이상 방 시작: s.players(입장 순서, 첫 번째가 방장), s.open(handler) 로 방 채널 송수신
//     onClose: () => ...,
//   }));
// 흐름: 로그인/가입 → [무작위 매칭 | 방 만들기(인원·공개) | 코드로 입장 | 열린 방 목록] → 방 화면(준비·시작) → 콜백.
// 2인 방은 시작할 때 pvp_matches 가 함께 만들어져 onMatch 로 가고, 3인 이상은 onRoom(레이팅 없음)입니다.
// 실시간 메시지는 s.open() 이 돌려주는 Channel(send/close/ready) 로 주고받습니다. 3인 이상 방은 메시지에 보낸 사람 id(f)를 붙이세요(참고: src/race/multi.ts).
// 개발 중에는 ?pvp=local 로 같은 브라우저 탭끼리 확인할 수 있습니다(참고: tools/room-browser-smoke.mjs).
// 로그인·가입, 무작위 매칭, 방 코드, 랭킹을 한 곳에서 다루는 오버레이. 게임 화면 위에 올라오고, 매칭이 잡히면 PvpSession 을 넘겨줍니다.
import './net.css';
import { currentAccount, getBackend, setAccount } from './backend';
import { GAME_NAMES, errText, type Account, type Backend, type Channel, type GameKind, type MatchRow, type NetMsg, type RankRow, type RoomInfo, type RoomListItem, type RoomRow } from './types';

export interface PvpSession {
  backend: Backend; game: GameKind; match: MatchRow; me: Account; host: boolean; opponent: { id: string; nickname: string };
  /** 이 매치 전용 실시간 채널을 엽니다. */
  open(onMessage: (m: NetMsg) => void): Channel;
}
/** 3인 이상 방(1대1 매치가 없는 방)이 시작될 때 게임에 넘겨주는 세션. players 는 입장 순서이고 첫 번째가 방장입니다. */
export interface RoomSession {
  backend: Backend; game: GameKind; room: RoomRow; me: Account; host: boolean; players: Array<{ id: string; nickname: string }>;
  open(onMessage: (m: NetMsg) => void): Channel;
}
export interface LobbyOptions {
  /** 한 방에 들어갈 수 있는 최대 인원(기본 2). 2보다 크게 주면 onRoom 도 구현해야 합니다. */
  maxPlayers?: number; onRoom?: (s: RoomSession) => void;
  /** 지정하면 그 게임의 매칭 화면, 없으면 계정·랭킹 화면 */
  game?: GameKind; config?: () => Record<string, unknown>; onMatch?: (s: PvpSession) => void; onClose: () => void;
  /** 처음 보여 줄 안내(예: 인증 링크가 만료됨) */ notice?: string;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function openLobby(opts: LobbyOptions): { close(): void } {
  const root = document.createElement('div'); root.className = 'pvp-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '1대1 대전');
  document.body.append(root);
  let backend: Backend | null = null, me: Account | null = null, screen: 'load' | 'auth' | 'home' | 'wait' | 'ranks' | 'create' | 'room' = 'load', authMode: 'in' | 'up' = 'in', closed = false;
  let firstEnter = true, msg = opts.notice ?? '', busy = false, waiting: MatchRow | null = null, poll = 0, waitSince = 0, tick = 0, rankGame: GameKind = opts.game ?? 'race', ranks: RankRow[] | null = null, rate: { rating: number; wins: number; losses: number } | null = null;
  const form: Record<string, string> = {};
  let rooms: RoomListItem[] | null = null, roomInfo: RoomInfo | null = null, roomId = '', roomPoll = 0, listPoll = 0, lastJson = '', launching = false, createMax = 2, createPublic = true;
  const maxP = opts.maxPlayers ?? 2;

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
    if (!opts.game) void loadRanks(); else watchList();
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
  // 서버가 대기방을 정리하는 시간(무작위 매칭 2분, 방 10분)에 맞춰 화면도 끝냅니다.
  const waitLimit = (m: MatchRow): number => (m.code ? 600 : 120);
  const waitLeft = (): number => waiting ? Math.max(0, waitLimit(waiting) - Math.floor((Date.now() - waitSince) / 1000)) : 0;
  const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  function stopPoll(): void { window.clearInterval(poll); window.clearInterval(tick); poll = 0; tick = 0; stopRoomTimers(); }
  function watch(m: MatchRow): void {
    waiting = m; stopPoll(); waitSince = Date.now();
    tick = window.setInterval(() => {
      if (closed || waiting?.id !== m.id) return;
      if (waitLeft() <= 0) { void cancel('상대가 나타나지 않아 대기를 끝냈습니다. 다시 시도해 주세요.'); return; }
      const el = root.querySelector('#pvp-left'); if (el) el.textContent = clock(waitLeft());
    }, 1000);
    poll = window.setInterval(() => {
      void backend?.getMatch(m.id).then(row => {
        if (closed || waiting?.id !== m.id) return;
        if (row.status === 'playing') void start(row); else if (row.status === 'cancelled') { stopPoll(); waiting = null; set(() => { screen = 'home'; }); watchList(); }
      }).catch(() => { /* 다음 주기에 다시 확인합니다. */ });
    }, 1200);
  }
  async function find(): Promise<void> {
    if (!backend || !opts.game || busy) return; busy = true; msg = ''; paint();
    try {
      const m = await backend.quickMatch(opts.game, opts.config?.() ?? {});
      busy = false;
      if (m.status === 'playing') { await start(m); return; }
      watch(m); set(() => { screen = 'wait'; });
    } catch (e) { failure(e); }
  }
  // ---- 방: 목록, 만들기, 코드 입장, 준비, 시작 ----
  function stopRoomTimers(): void { window.clearInterval(roomPoll); window.clearInterval(listPoll); roomPoll = 0; listPoll = 0; }
  async function loadRooms(): Promise<void> {
    if (!backend || !opts.game || closed || screen !== 'home') return;
    try { const r = await backend.roomList(opts.game); const j = JSON.stringify(r); if (!closed && screen === 'home' && j !== lastJson) { lastJson = j; rooms = r; paint(); } } catch { /* 다음 주기에 다시 봅니다. */ }
  }
  function watchList(): void { stopRoomTimers(); lastJson = ''; rooms = null; void loadRooms(); listPoll = window.setInterval(() => void loadRooms(), 3000); }
  function enterRoom(room: RoomRow): void {
    stopRoomTimers(); roomId = room.id; roomInfo = null; lastJson = ''; launching = false; set(() => { screen = 'room'; msg = ''; });
    roomPoll = window.setInterval(() => void refreshRoom(), 1000); void refreshRoom();
  }
  function leftRoom(note: string): void { stopRoomTimers(); roomId = ''; roomInfo = null; set(() => { screen = 'home'; msg = note; }); watchList(); }
  async function refreshRoom(): Promise<void> {
    const id = roomId; if (!id || !backend || closed || launching) return;
    try {
      const info = await backend.roomState(id); if (closed || roomId !== id || launching) return;
      if (info.room.status === 'closed' || !info.members.some(m => m.user_id === me?.id)) { leftRoom(info.room.status === 'closed' ? '방이 닫혔습니다.' : '방에서 나갔습니다.'); return; }
      if (info.room.status === 'playing') { await launchRoom(info); return; }
      const j = JSON.stringify(info); if (j !== lastJson) { lastJson = j; roomInfo = info; paint(); }
    } catch { /* 다음 주기에 다시 확인합니다. */ }
  }
  async function launchRoom(info: RoomInfo): Promise<void> {
    if (launching || !backend || !me) return; launching = true; stopRoomTimers(); roomId = '';
    const b = backend, account = me;
    try {
      if (info.room.match_id) { await start(await b.getMatch(info.room.match_id)); return; }
      if (!opts.onRoom) throw new Error('unsupported');
      closed = true; root.remove();
      opts.onRoom({ backend: b, game: info.room.game, room: info.room, me: account, host: info.room.host_id === account.id, players: info.members.map(m => ({ id: m.user_id, nickname: m.nickname })), open: h => b.open(info.room.id, h) });
    } catch (e) { launching = false; failure(e); }
  }
  async function makeRoom(): Promise<void> {
    if (!backend || !opts.game || busy) return; busy = true; msg = ''; paint();
    try { const r = await backend.roomCreate(opts.game, createMax, createPublic, opts.config?.() ?? {}); busy = false; enterRoom(r); } catch (e) { failure(e); }
  }
  async function joinCode(code: string): Promise<void> {
    if (!backend || busy) return; busy = true; msg = ''; paint();
    try { const r = await backend.roomJoin(code); busy = false; enterRoom(r); } catch (e) { failure(e); }
  }
  async function roomAct(kind: 'start' | 'ready' | 'leave'): Promise<void> {
    if (!backend || !roomInfo || busy) return; const id = roomInfo.room.id, mine = roomInfo.members.find(m => m.user_id === me?.id);
    try {
      if (kind === 'leave') { stopRoomTimers(); roomId = ''; await backend.roomLeave(id).catch(() => undefined); leftRoom(''); return; }
      busy = true; paint();
      if (kind === 'ready') await backend.roomReady(id, !mine?.ready); else await backend.roomStart(id);
      busy = false; await refreshRoom(); paint();
    } catch (e) { failure(e); }
  }
  async function cancel(note = ''): Promise<void> {
    stopPoll(); const m = waiting; waiting = null; set(() => { screen = 'home'; msg = note; }); watchList();
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
  function close(): void { if (closed) return; closed = true; const rid = launching ? '' : roomId; stopPoll(); if (rid && backend) void backend.roomLeave(rid).catch(() => undefined); if (waiting && backend) void backend.cancelMatch(waiting.id).catch(() => undefined); root.remove(); opts.onClose(); }

  const title = opts.game ? `${GAME_NAMES[opts.game]} · 온라인 대전` : '계정 · 랭킹';
  const rankTable = (): string => ranks === null ? '<p class="pvp-dim">불러오는 중…</p>' : ranks.length === 0 ? '<p class="pvp-dim">아직 기록된 대전이 없습니다.</p>'
    : `<table class="pvp-rank"><thead><tr><th>#</th><th>닉네임</th><th>레이팅</th><th>전적</th></tr></thead><tbody>${ranks.map(r => `<tr${r.user_id === me?.id ? ' class="me"' : ''}><td>${r.rank}</td><td>${esc(r.nickname)}</td><td>${r.rating}</td><td>${r.wins}승 ${r.losses}패</td></tr>`).join('')}</tbody></table>`;
  const tabs = (): string => `<div class="pvp-tabs" role="tablist">${(['race', 'city', 'rts', 'shooter', 'outlaw'] as GameKind[]).map(g => `<button type="button" role="tab" aria-selected="${g === rankGame}" data-act="rank:${g}">${GAME_NAMES[g]}</button>`).join('')}</div>`;

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
    if (screen === 'wait') {
      return `<div class="pvp-wait"><div class="pvp-spin" aria-hidden="true"></div><p><b>비슷한 상대를 찾는 중…</b></p><p class="pvp-dim">다른 플레이어가 같은 게임에서 무작위 매칭을 누르면 연결됩니다. 친구와 하려면 방을 만들어 코드를 알려 주세요.</p>
        <p class="pvp-dim">남은 시간 <span id="pvp-left">${clock(waitLeft())}</span></p><div class="pvp-actions"><button type="button" data-act="cancel">취소</button></div></div>`;
    }
    if (screen === 'create') return `<form class="pvp-form" data-form="create"><p><b>방 만들기</b></p>
        ${maxP > 2 ? `<label>최대 인원<select name="max">${Array.from({ length: maxP - 1 }, (_, i) => i + 2).map(n => `<option value="${n}"${n === createMax ? ' selected' : ''}>${n}명${n === 2 ? ' (1대1 · 레이팅 반영)' : ''}</option>`).join('')}</select></label><p class="pvp-dim">3명 이상이면 순위만 표시하고 레이팅은 바뀌지 않습니다.</p>` : '<p class="pvp-dim">1대1 방입니다. 친구가 들어와 준비하면 시작할 수 있고, 결과는 레이팅에 반영됩니다.</p>'}
        <label class="pvp-check"><input type="checkbox" name="public"${createPublic ? ' checked' : ''}> 방 목록에 공개 <span class="pvp-dim">(끄면 코드를 아는 사람만 입장)</span></label>
        <div class="pvp-actions"><button type="submit" class="pvp-primary"${busy ? ' disabled' : ''}>방 만들기</button><button type="button" data-act="back">취소</button></div></form>`;
    if (screen === 'room') {
      const info = roomInfo; if (!info) return '<p class="pvp-dim">방에 들어가는 중…</p>';
      const isHost = info.room.host_id === me?.id, mine = info.members.find(m => m.user_id === me?.id), all = info.members.length >= 2 && info.members.every(m => m.ready);
      return `<div class="pvp-room"><p class="pvp-dim">방 코드 (친구에게 알려 주세요)</p><b class="pvp-code" id="pvp-code">${esc(info.room.code)}</b>
        <p class="pvp-dim">${info.members.length}/${info.room.max_players}명 · ${info.room.is_public ? '공개' : '비공개'}${info.room.max_players === 2 ? ' · 1대1(레이팅 반영)' : ''}</p>
        <ul class="pvp-members">${info.members.map(m => `<li class="${m.user_id === info.room.host_id ? 'host' : ''}${m.user_id === me?.id ? ' me' : ''}"><span>${esc(m.nickname)}${m.user_id === me?.id ? ' (나)' : ''}</span><em>${m.user_id === info.room.host_id ? '방장' : m.ready ? '준비 완료' : '대기 중'}</em></li>`).join('')}${Array.from({ length: Math.max(0, info.room.max_players - info.members.length) }, () => '<li class="empty"><span>빈 자리</span></li>').join('')}</ul>
        <div class="pvp-actions">${isHost ? `<button type="button" class="pvp-primary" data-act="start"${all && !busy ? '' : ' disabled'}>${all ? `시작 (${info.members.length}명)` : '모두 준비하면 시작'}</button>` : `<button type="button" class="pvp-primary" data-act="ready"${busy ? ' disabled' : ''}>${mine?.ready ? '준비 취소' : '준비'}</button>`}<button type="button" data-act="leave">나가기</button></div>
        ${isHost ? '' : '<p class="pvp-dim">방장이 시작하면 바로 게임이 열립니다.</p>'}</div>`;
    }
    if (screen === 'ranks' || (screen === 'home' && !opts.game)) return `${me ? `<div class="pvp-me"><b>${esc(me.nickname)}</b><span>${esc(me.email)}</span></div>` : ''}${tabs()}${rankTable()}
        ${me ? `<form class="pvp-inline" data-form="rename"><input name="rename" maxlength="16" placeholder="새 닉네임" value="${esc(form.rename ?? '')}"><button type="submit"${busy ? ' disabled' : ''}>닉네임 변경</button></form><button type="button" class="pvp-link" data-act="logout">로그아웃</button>` : ''}`;
    const r = rate ?? { rating: 1000, wins: 0, losses: 0 };
    return `<div class="pvp-me"><b>${esc(me?.nickname ?? '')}</b><span>레이팅 ${r.rating} · ${r.wins}승 ${r.losses}패</span></div>
      <div class="pvp-actions"><button type="button" class="pvp-primary" data-act="quick"${busy ? ' disabled' : ''}>무작위 매칭</button><button type="button" data-act="newroom"${busy ? ' disabled' : ''}>방 만들기</button></div>
      <form class="pvp-inline" data-form="join"><input name="code" maxlength="8" placeholder="방 코드" autocapitalize="characters" autocomplete="off" value="${esc(form.code ?? '')}"><button type="submit"${busy ? ' disabled' : ''}>코드로 입장</button></form>
      <div class="pvp-list"><p class="pvp-dim">열린 방</p>${rooms === null ? '<p class="pvp-dim">불러오는 중…</p>' : rooms.length === 0 ? '<p class="pvp-dim">열린 방이 없습니다. 방을 만들어 보세요.</p>'
        : `<ul class="pvp-members">${rooms.map(r => `<li><span>${esc(r.host)}의 방 · ${r.count}/${r.room.max_players}명</span><button type="button" data-act="enter:${esc(r.room.code)}"${busy || r.count >= r.room.max_players ? ' disabled' : ''}>입장</button></li>`).join('')}</ul>`}</div>
      ${opts.game === 'race' ? '<p class="pvp-dim">코스와 랩 수는 방을 만든 쪽의 선택을 따르고, 차량은 각자 고른 것을 탑니다.</p>' : ''}
      <div class="pvp-sub"><button type="button" class="pvp-link" data-act="ranks">랭킹 보기</button><button type="button" class="pvp-link" data-act="logout">로그아웃</button></div>`;
  }
  function paint(): void {
    if (closed) return; const keep = document.activeElement instanceof HTMLInputElement ? document.activeElement.name : '';
    root.innerHTML = `<section class="pvp-card"><header><h2>${title}</h2><button type="button" class="pvp-x" data-act="close" aria-label="닫기">✕</button></header>${screen === 'ranks' ? `<button type="button" class="pvp-link" data-act="back">← 대전으로</button>` : ''}${body()}<p class="pvp-msg" role="status" aria-live="polite">${esc(msg)}</p></section>`;
    if (keep) root.querySelector<HTMLInputElement>(`input[name="${keep}"]`)?.focus();
  }
  root.addEventListener('input', e => { const t = e.target as HTMLInputElement; if (t.name === 'max') { createMax = Number(t.value) || 2; return; } if (t.name === 'public') { createPublic = t.checked; return; } if (t.name) form[t.name] = t.name === 'code' ? t.value.toUpperCase() : t.value; });
  root.addEventListener('submit', e => {
    e.preventDefault(); const f = (e.target as HTMLElement).dataset.form;
    if (f === 'auth') void submitAuth(); else if (f === 'rename') void rename(); else if (f === 'join') void joinCode(form.code ?? ''); else if (f === 'create') void makeRoom();
  });
  root.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return; const [a, arg] = b.dataset.act!.split(':');
    if (a === 'close') close(); else if (a === 'mode') set(() => { authMode = arg as 'in' | 'up'; msg = ''; }); else if (a === 'quick') void find(); else if (a === 'newroom') { stopRoomTimers(); set(() => { screen = 'create'; msg = ''; }); } else if (a === 'enter') void joinCode(arg ?? '');
    else if (a === 'start' || a === 'ready' || a === 'leave') void roomAct(a);
    else if (a === 'resend') void resend(); else if (a === 'cancel') void cancel(); else if (a === 'logout') void logout(); else if (a === 'ranks') { set(() => { screen = 'ranks'; }); void loadRanks(); }
    else if (a === 'back') { set(() => { screen = 'home'; }); if (opts.game) watchList(); } else if (a === 'rank') { rankGame = arg as GameKind; void loadRanks(); }
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  paint(); void init();
  return { close };
}
