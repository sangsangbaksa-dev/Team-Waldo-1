import './computer.css';
import type { CreateView, DormActivity, SlackEvent } from './types';

const apps: { id: DormActivity; icon: string; label: string }[] = [
  { id: 'game', icon: '◆', label: '게임' }, { id: 'video', icon: '▶', label: '영상' },
  { id: 'chat', icon: '●', label: '메신저' }, { id: 'webtoon', icon: '▤', label: '웹툰' },
  { id: 'shop', icon: '▣', label: '쇼핑' }, { id: 'music', icon: '♫', label: '음악' },
];
const GLOW: Record<DormActivity, string> = { game: '#a98bff', video: '#7fb4ff', chat: '#ffe27a', webtoon: '#ff9fc0', shop: '#ff9a7a', music: '#8fe0c8' };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

const videos = [
  { t: '새벽 감성 모음 ☁', ch: '달빛 라디오', views: '12만회', len: 728, h: 230, subs: ['오늘도 수고 많았어요', '잠시 눈을 감고 숨을 쉬어 봐요', '창밖에는 푸른 새벽이 오고 있어요', '내일의 나에게 맡겨요'] },
  { t: '고양이가 키보드를 밟았을 때', ch: '냥냥TV', views: '88만회', len: 215, h: 20, subs: ['어 저거 내 숙제인데', '엔터를 눌러 버렸다', '전송 완료... 였다', '집사는 말이 없었다'] },
  { t: '급식 랭킹 TOP 10 (진짜 맛집)', ch: '급식왕', views: '41만회', len: 504, h: 110, subs: ['10위 멸치 볶음', '7위 돈가스는 못 참지', '3위 치킨 나오는 날', '1위는 역시 떡볶이'] },
  { t: '공부 브이로그 (공부는 안 함)', ch: '열공러', views: '6.2만회', len: 391, h: 300, subs: ['오늘의 계획은 완벽합니다', '일단 책상 정리부터', '그리고 간식 타임', '내일부터 진짜 시작'] },
];
const commentPool = ['이 시간에 보는 사람 손 ✋', '내일의 나야 미안해', '사감 오면 바로 끌 준비 완료', '첫 댓글!', '자막 센스 미쳤다', '오늘 자습 진짜 길다', '추천 알고리즘 고마워요', '새벽 2시 출석체크'];

const initialRooms = [
  { name: '우리 반 비밀방', sub: '3명', msgs: [{ m: false, who: '지후', t: '오늘 자습 진짜 길다...' }, { m: true, who: '', t: '그러니까 ㅠㅠ' }, { m: false, who: '서연', t: '끝나고 매점 갈 사람?' }], pool: ['사감 아직 안 왔지?', '나 오늘 진짜 졸려...', '조용히 하자 ㅋㅋ', '끝나면 같이 가자!', '매점 문 닫기 전에 가야 해'], reply: ['ㅋㅋㅋㅋ 인정', '나도 갈래!', '쉿 조용히 해'], unread: 0 },
  { name: '룸메 민수', sub: '1:1', msgs: [{ m: false, who: '민수', t: '지금 뭐 해?' }], pool: ['야 복도 소리 안 났냐', '나 방금 발소리 들은 듯', '창문 열어 놓을까?'], reply: ['오 그래? 조심해', '알았어 망보는 중', 'ㅋㅋㅋ 들키지 마'], unread: 0 },
  { name: '엄마', sub: '1:1', msgs: [{ m: false, who: '엄마', t: '밥은 먹었니?' }], pool: ['공부는 잘 되고 있니?', '너무 늦게 자지 마', '사랑한다 우리 아들딸'], reply: ['오 착하네', '건강이 최고야', '내일 면회 갈게'], unread: 0 },
];
const chips = ['ㅋㅋㅋ', '나 지금 몰래 하는 중', '사감 어디쯤?'];

const products = [
  { name: '폭신한 구름 쿠션', icon: '☁', price: 8900 }, { name: '별빛 무드등', icon: '✦', price: 12900 },
  { name: '말랑 젤리 세트', icon: '◒', price: 4500 }, { name: '야식 라면 박스', icon: '◍', price: 6900 },
  { name: '무선 이어폰', icon: '♪', price: 15900 }, { name: '곰돌이 담요', icon: '❤', price: 19900 },
];
const episodes = [
  { n: 10, title: '첫눈', lines: ['첫눈이 내리던 날,', '네가 먼저 말을 걸었다.', '"같이 걸을래?"', '조용한 골목길.', '발자국이 나란히 남았다.', '다음 화에 계속'] },
  { n: 11, title: '오해', lines: ['그날 이후 우린 어색했다.', '"왜 말 안 했어?"', '"...몰랐어, 정말로."', '창밖엔 비가 내렸다.', '우산 하나, 사람은 둘.', '다음 화에 계속'] },
  { n: 12, title: '비밀', lines: ['그날 밤,', '우리는 약속했다.', '"내일도 여기서 만나자."', '"응, 꼭!"', '달빛이 두 사람을 비췄다.', '다음 화에 계속'] },
  { n: 13, title: '고백', lines: ['떨리는 목소리로,', '"사실은 말이야..."', '"...나도 그래."', '심장 소리가 너무 컸다.', '별이 하나 떨어졌다.', '다음 화에 계속'] },
];
const tracks = [
  { t: '잠들지 못한 밤', a: '파란 새벽', len: 222 }, { t: '창가의 불빛', a: '파란 새벽', len: 248 },
  { t: '느린 걸음', a: '해변의 밤', len: 196 }, { t: '자정의 편의점', a: '네온 라디오', len: 231 },
];

const title = (label: string) => `<div class="sc-title"><span>${label}</span><span class="sc-title-btns">—　□　<button type="button" data-close aria-label="닫기">×</button></span></div>`;

export const createComputerView: CreateView = (sim, audio) => {
  const rooms = initialRooms.map(room => ({ ...room, msgs: [...room.msgs] }));
  const el = document.createElement('div');
  el.className = 'slack-computer';
  el.tabIndex = -1;
  el.innerHTML = `<div class="sc-room"><div class="sc-wall-light"></div><div class="sc-door"><div class="sc-door-window"><div class="sc-door-flash"></div><div class="sc-door-person"></div></div><div class="sc-door-handle"></div><div class="sc-door-gap"></div></div><div class="sc-door-floor"></div><div class="sc-steps" aria-hidden="true"><i></i><i></i><i></i></div><div class="sc-scan-person"><i></i><u></u></div><button class="sc-friend" type="button" aria-label="룸메에게 간식 나눠주기"><span class="sc-friend-head"></span><span class="sc-friend-body"></span><span class="sc-friend-bubble"></span></button><div class="sc-friend-monitor"></div><div class="sc-desk"></div><div class="sc-monitor"><div class="sc-screen"><div class="sc-desktop"><div class="sc-wallpaper"><span>오늘도 무사히</span><small>조용한 밤의 컴퓨터실</small></div><div class="sc-window-host"></div><div class="sc-toast" role="status"></div><div class="sc-cover"><div class="sc-cover-window"><div class="sc-title"><span>수능 필수 개념 인강</span><span>—　□　×</span></div><div class="sc-lecture"><div class="sc-board"><small>오늘의 개념 정리</small><strong>함수의 극한과 연속</strong><div>lim　f(x) = L</div><p>x가 한없이 가까워질 때<br>함숫값의 변화를 살펴봅시다.</p></div><div class="sc-teacher">●<br>▰</div></div><div class="sc-lecture-controls">❚❚ <span class="sc-progress"><i></i></span> 12:34 / 45:00</div></div><div class="sc-notes"><b>개념 필기</b><p>1. 극한값의 뜻</p><p>함수의 값이 가까워지는 값</p><p>2. 좌극한과 우극한</p><p>두 값이 같아야 극한이 존재!</p></div></div><div class="sc-taskbar"><span class="sc-start">▦</span><div class="sc-apps">${apps.map((a, i) => `<button type="button" data-app="${a.id}" aria-label="${a.label} (${i + 1})" title="${a.label}"><span>${a.icon}</span></button>`).join('')}</div><span class="sc-clock">오전 1:24</span></div></div></div><div class="sc-monitor-edge"><span></span></div><div class="sc-monitor-stand"></div></div><div class="sc-keyboard"></div><div class="sc-face-glow"></div><div class="sc-vignette"></div><div class="sc-strike"><strong>거기, 지금 뭐 하고 있니?</strong></div><div class="sc-quiet">순간, 컴퓨터 팬 소리만 남았다.</div></div><div class="sc-controls"><span>숫자 1–6 앱 전환 · F 룸메에게 간식</span><button type="button" class="sc-cover-button">인강 창 <small>누르고 있기 · 스페이스</small></button></div>`;
  const $ = <T extends HTMLElement>(s: string, r: ParentNode = el) => r.querySelector<T>(s)!;
  const host = $('.sc-window-host'); const cover = $('.sc-cover'); const coverButton = $<HTMLButtonElement>('.sc-cover-button');
  const toastEl = $('.sc-toast'); const bubble = $('.sc-friend-bubble'); const clockEl = $('.sc-clock');
  const stepEls = el.querySelectorAll<HTMLElement>('.sc-steps i');
  const taskBtn = (id: DormActivity) => $<HTMLButtonElement>(`[data-app="${id}"]`);

  let shown: DormActivity | null = null;
  let elapsed = 0; let coverKey = false; let coverPointer: number | null = null; let coverMiddle: number | null = null; let disposed = false;
  let warningUntil = 0; let strikeUntil = 0; let quietUntil = 0; let toastUntil = 0; let bubbleUntil = 0; let stepUntil = 0; let tickAcc = 0;
  const cache: Record<string, unknown> = {};
  const setCls = (k: string, on: boolean, t: HTMLElement = el) => { if (cache[k] !== on) { cache[k] = on; t.classList.toggle(k, on); } };
  const setTxt = (t: HTMLElement | null, v: string) => { if (t && t.textContent !== v) t.textContent = v; };
  const queue: { at: number; fn: () => void }[] = [];
  const later = (s: number, fn: () => void) => queue.push({ at: elapsed + s, fn });
  const toast = (text: string, s = 3) => { setTxt(toastEl, text); toastEl.classList.add('on'); toastUntil = elapsed + s; };
  const say = (text: string, s = 2) => { setTxt(bubble, text); bubbleUntil = elapsed + s; };
  const setBadge = (id: DormActivity, n: number) => { const b = taskBtn(id); const v = n > 0 ? String(n) : ''; if (b.dataset.badge !== v) b.dataset.badge = v; };

  const applyCover = () => {
    const on = sim.state.cover;
    cover.classList.toggle('visible', on); coverButton.classList.toggle('active', on);
    if (coverButton.getAttribute('aria-pressed') !== String(on)) coverButton.setAttribute('aria-pressed', String(on));
    if (host.inert !== on) {
      if (on && host.contains(document.activeElement)) el.focus({ preventScroll: true });
      host.inert = on;
    }
    syncMusicAudio();
  };
  const updateCover = () => { sim.setCover(coverKey || coverPointer !== null || coverMiddle !== null); applyCover(); };
  const select = (id: DormActivity | null) => { audio.resume(); audio.play('click'); if (id && sim.state.cover) updateCover(); sim.doActivity(id && sim.state.activity === id ? null : id); };

  /* ---------- 게임: 별빛 던전(반응속도) ---------- */
  const G = { score: 0, best: 0, combo: 1, streak: 0, hp: 100, over: false, clock: 0, deadline: 0, nextAt: 0.5, on: false, life: 1.5 };
  const gameHtml = () => `<div class="sc-game"><div class="sc-game-top"><span>별빛 던전</span><span>최고 <b data-g-best>0</b>　점수 <b data-score>0</b></span></div><div class="sc-health">체력 <span><i data-health style="width:100%"></i></span><em data-g-combo>x1</em></div><div class="sc-game-scene"><div class="sc-stars">✦　　·　　 ✧　　　✦</div><button type="button" class="sc-target" aria-label="별 터뜨리기"><b>★</b><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/></svg></button><span class="sc-pop"></span><div class="sc-game-ground"></div><div class="sc-game-over"><strong>게임 오버</strong><span data-g-final></span><button type="button" data-g-retry>다시 하기</button></div></div><div class="sc-game-hint">나타나는 별을 사라지기 전에 눌러요 · 연속 성공 = 콤보!</div></div>`;
  const gameEls = () => ({ score: $('[data-score]', wins.game), best: $('[data-g-best]', wins.game), hp: $('[data-health]', wins.game), combo: $('[data-g-combo]', wins.game), target: $('.sc-target', wins.game), pop: $('.sc-pop', wins.game), scene: $('.sc-game-scene', wins.game), over: $('.sc-game-over', wins.game), final: $('[data-g-final]', wins.game) });
  const gameHud = () => { const g = gameEls(); setTxt(g.score, String(G.score)); setTxt(g.best, String(G.best)); setTxt(g.combo, `x${G.combo}`); g.hp.style.width = `${Math.max(0, G.hp)}%`; };
  const gameReset = () => { Object.assign(G, { score: 0, combo: 1, streak: 0, hp: 100, over: false, on: false, nextAt: G.clock + 0.5, life: 1.5 }); const g = gameEls(); g.over.classList.remove('on'); g.target.classList.remove('on'); gameHud(); };
  const gameSpawn = () => {
    const t = gameEls().target; G.life = Math.max(0.65, 1.6 - G.score / 450);
    t.style.left = `${8 + Math.random() * 74}%`; t.style.top = `${16 + Math.random() * 42}%`; t.style.setProperty('--life', `${G.life}s`);
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on'); G.on = true; G.deadline = G.clock + G.life;
  };
  const gamePop = (text: string, good: boolean) => { const p = gameEls().pop; const t = gameEls().target; p.style.left = t.style.left; p.style.top = t.style.top; p.textContent = text; p.classList.toggle('bad', !good); p.classList.remove('go'); void p.offsetWidth; p.classList.add('go'); };
  const gameHit = () => {
    if (G.over || !G.on) return;
    const gain = 10 * G.combo; G.score += gain; G.streak++; G.combo = Math.min(5, 1 + Math.floor(G.streak / 4)); G.hp = Math.min(100, G.hp + 2);
    audio.play('fun', 0.35 + G.combo * 0.08); gamePop(`+${gain}`, true);
    if (G.score > G.best) { if (G.best > 0 && G.score - gain <= G.best) audio.play('chime', 0.35); G.best = G.score; }
    gameEls().target.classList.remove('on'); G.on = false; G.nextAt = G.clock + 0.25 + Math.random() * 0.45; gameHud();
  };
  const gameMiss = () => {
    G.on = false; G.hp -= 14; G.streak = 0; G.combo = 1; audio.play('key', 0.7); gamePop('놓침', false);
    const g = gameEls(); g.target.classList.remove('on'); g.scene.classList.remove('shake'); void g.scene.offsetWidth; g.scene.classList.add('shake');
    if (G.hp <= 0) { G.over = true; G.hp = 0; audio.play('lock', 0.4); setTxt(g.final, `점수 ${G.score} · 최고 ${G.best}`); g.over.classList.add('on'); }
    G.nextAt = G.clock + 0.7; gameHud();
  };
  const gameTick = (dt: number) => {
    if (shown !== 'game' || sim.state.cover || G.over) return;
    G.clock += dt;
    if (G.on && G.clock > G.deadline) gameMiss(); else if (!G.on && G.clock >= G.nextAt) gameSpawn();
  };

  /* ---------- 영상 ---------- */
  const V = { cur: 0, pos: 0, playing: true, sub: -1, sec: -1, nextComment: 5 };
  const vidHtml = () => `<div class="sc-video"><div class="sc-video-main"><div class="sc-video-picture" data-vpic><div class="sc-video-sun"></div><div class="sc-video-cloud"></div><div class="sc-video-mountain"></div><div class="sc-video-play">❚❚</div><div class="sc-sub" data-sub></div></div><div class="sc-video-bar"><button type="button" data-vplay aria-label="일시정지">❚❚</button><span class="sc-progress"><i data-vprog></i></span><span data-vtime>0:00</span></div><b data-vtitle></b><small data-vmeta></small><div class="sc-comment" data-comments></div></div><div class="sc-video-list"><b>추천 영상</b>${videos.map((v, i) => `<button type="button" data-vid="${i}" style="--h:${v.h}"><span class="sc-thumb"><i></i></span><span><strong>${v.t}</strong><small>${v.ch} · ${v.views}</small></span></button>`).join('')}</div></div>`;
  const vidSelect = (i: number) => {
    V.cur = i; V.pos = 0; V.sub = -1; V.sec = -1; V.nextComment = 3; V.playing = true;
    const w = wins.video; const v = videos[i];
    $('[data-vpic]', w).style.setProperty('--h', String(v.h)); setTxt($('[data-vtitle]', w), v.t); setTxt($('[data-vmeta]', w), `${v.ch} · 조회수 ${v.views}`);
    $('[data-comments]', w).replaceChildren(); w.querySelectorAll('[data-vid]').forEach((b, k) => b.classList.toggle('cur', k === i));
    $('[data-vpic]', w).classList.remove('paused'); const playButton = $('[data-vplay]', w); setTxt(playButton, '❚❚'); playButton.setAttribute('aria-label', '일시정지'); setTxt($('.sc-video-play', w), '❚❚');
  };
  const vidTick = (dt: number) => {
    if (shown !== 'video' || sim.state.cover || !V.playing) return;
    const w = wins.video; const v = videos[V.cur]; V.pos += dt;
    if (V.pos >= v.len) { vidSelect((V.cur + 1) % videos.length); return; }
    const sub = Math.floor(V.pos / 3.5) % v.subs.length; if (sub !== V.sub) { V.sub = sub; setTxt($('[data-sub]', w), v.subs[sub]); }
    const sec = Math.floor(V.pos); if (sec !== V.sec) { V.sec = sec; setTxt($('[data-vtime]', w), `${mmss(V.pos)} / ${mmss(v.len)}`); $('[data-vprog]', w).style.transform = `scaleX(${V.pos / v.len})`; }
    if (V.pos > V.nextComment) {
      V.nextComment = V.pos + 5 + Math.random() * 4; const list = $('[data-comments]', w); const p = document.createElement('p'); p.textContent = `●　${pick(commentPool)}`; list.append(p);
      while (list.childElementCount > 4) list.firstElementChild?.remove();
    }
  };

  /* ---------- 메신저 ---------- */
  const C = { room: 0, typing: -1 };
  const chatHtml = () => `<div class="sc-chat"><div class="sc-rooms">${rooms.map((r, i) => `<button type="button" data-room="${i}"><strong>${r.name}</strong><small data-last>${r.msgs[r.msgs.length - 1].t}</small><i data-unread></i></button>`).join('')}</div><div class="sc-chat-pane"><div class="sc-chat-head"><span data-chat-name></span> <small data-chat-sub></small></div><div class="sc-messages" data-messages></div><div class="sc-typing" data-typing>입력 중<span>...</span></div><div class="sc-chips">${chips.map(c => `<button type="button" data-chip="${c}">${c}</button>`).join('')}</div></div></div>`;
  const chatRow = (m: { m: boolean; who: string; t: string }) => {
    const p = document.createElement('p'); if (m.m) p.className = 'mine'; else { const b = document.createElement('b'); b.textContent = m.who; p.append(b); }
    p.append(m.t); if (m.m) { const s = document.createElement('small'); s.textContent = '1'; p.append(s); }
    return p;
  };
  const chatBadgeTotal = () => rooms.reduce((n, r) => n + r.unread, 0);
  const chatRefresh = () => {
    const w = built.chat;
    if (w) w.querySelectorAll<HTMLElement>('[data-room]').forEach((b, i) => {
      b.classList.toggle('cur', i === C.room); const r = rooms[i];
      setTxt($('[data-last]', b), C.typing === i ? '입력 중...' : r.msgs[r.msgs.length - 1].t); setTxt($('[data-unread]', b), r.unread ? String(r.unread) : '');
    });
    setBadge('chat', chatBadgeTotal());
  };
  const chatOpen = (i: number) => {
    C.room = i; rooms[i].unread = 0; const w = wins.chat; const r = rooms[i];
    setTxt($('[data-chat-name]', w), r.name); setTxt($('[data-chat-sub]', w), r.sub);
    $('[data-messages]', w).replaceChildren(...r.msgs.slice(-30).map(chatRow)); const m = $('[data-messages]', w); m.scrollTop = m.scrollHeight;
    $('[data-typing]', w).classList.toggle('on', C.typing === i); chatRefresh();
  };
  const chatPush = (i: number, msg: { m: boolean; who: string; t: string }) => {
    const r = rooms[i]; r.msgs.push(msg);
    // Chat panes render the latest 30 messages. Keep a little extra history,
    // not an unbounded array, when users repeatedly tap quick replies.
    if (r.msgs.length > 60) r.msgs.splice(0, r.msgs.length - 60);
    if (!msg.m) {
      if (shown === 'chat' && C.room === i) audio.play('chime', 0.4); else { r.unread++; audio.play('chime', 0.55); if (shown !== 'chat') toast(`${msg.who}: ${msg.t}`); }
    }
    if (C.room === i && built.chat) {
      const list = $('[data-messages]', built.chat); const row = chatRow(msg); list.append(row);
      while (list.childElementCount > 30) list.firstElementChild?.remove(); list.scrollTop = list.scrollHeight;
      if (msg.m) later(1.2, () => { const s = row.querySelector('small'); if (s) s.textContent = '읽음'; });
    }
    chatRefresh();
  };
  const chatIncoming = (i: number, text: string, delay: number) => {
    later(delay, () => { C.typing = i; if (C.room === i && built.chat) $('[data-typing]', built.chat).classList.add('on'); chatRefresh(); });
    later(delay + 1.3, () => { C.typing = -1; if (built.chat) $('[data-typing]', built.chat).classList.remove('on'); chatPush(i, { m: false, who: i === 0 ? pick(['지후', '서연', '태오']) : rooms[i].name.replace('룸메 ', ''), t: text }); });
  };
  let nextIncoming = 8;

  /* ---------- 웹툰 ---------- */
  const W = { ep: 2, likes: 12 };
  const toonHtml = () => `<div class="sc-webtoon"><div class="sc-webtoon-head"><b>달빛 아래 우리</b><span class="sc-eps">${episodes.map((e, i) => `<button type="button" data-ep="${i}" ${e.n === 13 ? 'hidden' : ''}>${e.n}화</button>`).join('')}</span><small data-read>0% 읽음</small></div>${episodes.map((e, i) => `<div class="sc-wt-scroll" data-eppane="${i}"><div class="sc-comic-sky"><span>제 ${e.n}화</span><i>☾</i><b>${e.title}</b></div>${e.lines.map((l, k) => `<div class="sc-comic-panel c${(k + i) % 3}"><div class="sc-comic-person">●<br>▰</div><p>${l}</p></div>`).join('')}<button type="button" class="sc-like" data-like>♡ 좋아요 <b>${W.likes}</b></button></div>`).join('')}</div>`;
  const toonShow = (i: number) => {
    W.ep = i; const w = wins.webtoon;
    w.querySelectorAll('[data-ep]').forEach((b, k) => b.classList.toggle('cur', k === i)); w.querySelectorAll('[data-eppane]').forEach((p, k) => p.classList.toggle('cur', k === i));
    toonProgress();
  };
  const toonProgress = () => { const p = $(`[data-eppane="${W.ep}"]`, wins.webtoon); const max = p.scrollHeight - p.clientHeight; setTxt($('[data-read]', wins.webtoon), `${max > 0 ? Math.round((p.scrollTop / max) * 100) : 0}% 읽음`); };

  /* ---------- 쇼핑 ---------- */
  const S = { cart: products.map(() => 0), deal: 1, left: 120, lastSec: -1 };
  const price = (i: number, deal = false) => Math.round(products[i].price * (deal ? 0.5 : 0.65));
  const shopHtml = () => `<div class="sc-shop"><div class="sc-shop-head">오늘의 발견 <span>장바구니 <b data-cart>0</b></span></div><div class="sc-sale"><span class="sc-deal-ico" data-deal-ico></span><span class="sc-deal-txt"><small>심야 특가 · 50%</small><b data-deal-name></b><em data-deal-price></em></span><strong data-timer>02:00</strong><button type="button" data-add="deal">특가 담기</button></div><div class="sc-products">${products.map((p, i) => `<div><div class="sc-product p${i % 3}">${p.icon}</div><b>${p.name}</b><small><em>35%</em> ${price(i).toLocaleString('ko-KR')}원</small><button type="button" data-add="${i}">담기</button></div>`).join('')}</div><div class="sc-cartbar"><span data-total>합계 0원</span><button type="button" data-pay>결제하기</button></div></div>`;
  const shopDeal = () => { const w = wins.shop; setTxt($('[data-deal-ico]', w), products[S.deal].icon); setTxt($('[data-deal-name]', w), products[S.deal].name); setTxt($('[data-deal-price]', w), `${price(S.deal, true).toLocaleString('ko-KR')}원`); };
  const shopTotals = () => {
    const n = S.cart.reduce((a, b) => a + b, 0); const sum = S.cart.reduce((a, c, i) => a + c * price(i, i === S.deal), 0);
    setTxt($('[data-cart]', wins.shop), String(n)); setTxt($('[data-total]', wins.shop), `합계 ${sum.toLocaleString('ko-KR')}원`);
  };
  const shopTick = (dt: number) => {
    S.left -= dt;
    if (S.left <= 0) { S.left = 120; S.deal = (S.deal + 1) % products.length; if (built.shop) shopDeal(); if (shown !== 'shop') { setBadge('shop', 1); audio.play('chime', 0.3); toast('새 심야 특가가 열렸어요!'); } }
    const sec = Math.ceil(S.left); if (sec !== S.lastSec) { S.lastSec = sec; if (built.shop) setTxt($('[data-timer]', built.shop), `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`); }
  };

  /* ---------- 음악 ---------- */
  const M = { cur: 0, p: 0, playing: true, sec: -1 };
  const musicHtml = () => `<div class="sc-music"><div class="sc-album"><div class="sc-disc">☾</div><span data-m-cap>새벽의 온도</span></div><div class="sc-music-info"><small>지금 재생 중</small><strong data-m-title aria-live="polite"></strong><span data-m-art></span><div class="sc-visualizer">${Array.from({ length: 20 }, (_, i) => `<i style="--n:${i}"></i>`).join('')}</div><div class="sc-progress"><i data-m-prog></i></div><div class="sc-music-controls"><button type="button" data-m="prev" aria-label="이전 곡">◀◀</button><button type="button" data-m="play" aria-label="일시정지">❚❚</button><button type="button" data-m="next" aria-label="다음 곡">▶▶</button><span data-m-time>0:00</span></div></div><div class="sc-playlist"><b>재생 목록</b>${tracks.map((t, i) => `<p data-track="${i}">${String(i + 1).padStart(2, '0')}　${t.t} <span>${mmss(t.len)}</span></p>`).join('')}</div></div>`;
  const musicSet = (i: number) => {
    M.cur = (i + tracks.length) % tracks.length; M.p = 0; M.sec = -1; const w = wins.music; const t = tracks[M.cur];
    setTxt($('[data-m-title]', w), t.t); setTxt($('[data-m-art]', w), t.a); w.querySelectorAll('[data-track]').forEach((p, k) => p.classList.toggle('cur', k === M.cur));
  };
  let earbudsActive = false;
  /** The lecture cover pauses the mini-player and its procedural headphone bed. */
  const syncMusicAudio = () => {
    const on = shown === 'music' && M.playing && !sim.state.cover;
    if (on === earbudsActive) return;
    earbudsActive = on; audio.muffle(on);
  };
  const musicPlay = (on: boolean) => { M.playing = on; wins.music.classList.toggle('paused', !on); const button = $('[data-m="play"]', wins.music); setTxt(button, on ? '❚❚' : '▶'); button.setAttribute('aria-label', on ? '일시정지' : '재생'); syncMusicAudio(); };
  const musicTick = (dt: number) => {
    if (shown !== 'music' || sim.state.cover || !M.playing) return;
    M.p += dt / tracks[M.cur].len; if (M.p >= 1) { musicSet(M.cur + 1); return; }
    const sec = Math.floor(M.p * tracks[M.cur].len); if (sec !== M.sec) { M.sec = sec; setTxt($('[data-m-time]', wins.music), mmss(sec)); $('[data-m-prog]', wins.music).style.transform = `scaleX(${M.p})`; }
  };

  /* ---------- 창 생성/전환 (한 번만 만들고 켜고 끔) ---------- */
  // Construct app windows only when first opened. The desktop, taskbar,
  // notifications and clock remain live without eagerly building every app DOM.
  const built: Partial<Record<DormActivity, HTMLElement>> = {};
  const wins = new Proxy({} as Record<DormActivity, HTMLElement>, {
    get(_target, property: string | symbol): HTMLElement | undefined {
      if (typeof property !== 'string' || !apps.some(a => a.id === property)) return undefined;
      const id = property as DormActivity;
      if (built[id]) return built[id];
      const app = apps.find(a => a.id === id)!;
      const w = document.createElement('div');
      w.className = `sc-app-window sc-app-${id}`;
      w.innerHTML = title(app.label) + builders[id].html();
      host.append(w);
      built[id] = w; // Publish before init: its setup helpers read wins[id].
      builders[id].init?.();
      return w;
    },
  });
  const builders: Record<DormActivity, { html: () => string; init?: () => void }> = {
    game: { html: gameHtml, init: gameReset },
    video: { html: vidHtml, init: () => vidSelect(0) },
    chat: { html: chatHtml, init: () => chatOpen(0) },
    webtoon: { html: toonHtml, init: () => { toonShow(2); if (cache.newEp) wins.webtoon.querySelector<HTMLElement>('[data-ep="3"]')!.hidden = false; } },
    shop: { html: shopHtml, init: () => { shopDeal(); shopTotals(); S.lastSec = -1; shopTick(0); } },
    music: { html: musicHtml, init: () => { musicSet(0); musicPlay(true); } },
  };
  function renderApp(id: DormActivity | null) {
    const prev = shown; shown = id;
    if (prev !== id) syncMusicAudio();
    if (prev && prev !== id && wins[prev].contains(document.activeElement)) taskBtn(id ?? prev).focus({ preventScroll: true });
    for (const a of apps) {
      const on = a.id === id;
      const w = on ? wins[a.id] : built[a.id];
      if (w) { w.classList.toggle('on', on); w.inert = !on; }
      taskBtn(a.id).classList.toggle('active', on); taskBtn(a.id).setAttribute('aria-pressed', String(on));
    }
    if (id) el.style.setProperty('--sc-glow', GLOW[id]);
    if (id === 'chat') chatOpen(C.room); else if (id === 'shop') setBadge('shop', 0); else if (id === 'webtoon') { setBadge('webtoon', 0); toonProgress(); }
    if (id === 'game' && !G.over && !G.on) G.nextAt = G.clock + 0.4;
  }

  /* ---------- 입력 ---------- */
  const click = (event: MouseEvent) => {
    audio.resume();
    const target = event.target as Element;
    if (event.detail > 0 && target.closest('button') !== coverButton) el.focus({ preventScroll: true });
    const app = target.closest<HTMLElement>('[data-app]');
    if (app) { select(app.dataset.app as DormActivity); return; }
    if (target.closest('.sc-friend')) { audio.resume(); audio.play('click'); say(sim.bribe() ? '냠냠… 고마워!' : '지금은 배불러…', 1.6); return; }
    if (sim.state.cover) return;
    if (target.closest('[data-close]')) { select(null); return; }
    if (target.closest('.sc-target')) { audio.resume(); gameHit(); return; }
    if (target.closest('[data-g-retry]')) { audio.play('click'); gameReset(); return; }
    const vid = target.closest<HTMLElement>('[data-vid]'); if (vid) { audio.play('click'); vidSelect(Number(vid.dataset.vid)); return; }
    if (target.closest('[data-vplay]') || target.closest('[data-vpic]')) { audio.play('click'); V.playing = !V.playing; const t = V.playing ? '❚❚' : '▶'; const playButton = $('[data-vplay]', wins.video); setTxt(playButton, t); playButton.setAttribute('aria-label', V.playing ? '일시정지' : '재생'); setTxt($('.sc-video-play', wins.video), t); $('[data-vpic]', wins.video).classList.toggle('paused', !V.playing); return; }
    const room = target.closest<HTMLElement>('[data-room]'); if (room) { audio.play('click'); chatOpen(Number(room.dataset.room)); return; }
    const chip = target.closest<HTMLElement>('[data-chip]');
    if (chip) { audio.play('key', 0.6); chatPush(C.room, { m: true, who: '', t: chip.dataset.chip ?? '' }); chatIncoming(C.room, pick(rooms[C.room].reply), 1.8 + Math.random() * 1.5); return; }
    const ep = target.closest<HTMLElement>('[data-ep]'); if (ep) { audio.play('click'); toonShow(Number(ep.dataset.ep)); return; }
    const like = target.closest('[data-like]'); if (like) { audio.play('chime', 0.3); W.likes++; const b = like.querySelector('b'); setTxt(b as HTMLElement, String(W.likes)); like.classList.add('liked'); return; }
    const add = target.closest<HTMLElement>('[data-add]');
    if (add) {
      audio.play('click'); const i = add.dataset.add === 'deal' ? S.deal : Number(add.dataset.add); S.cart[i]++; shopTotals();
      add.classList.remove('bump'); void add.offsetWidth; add.classList.add('bump'); if (add.dataset.add !== 'deal') add.textContent = `담김 ×${S.cart[i]}`; return;
    }
    if (target.closest('[data-pay]')) { audio.play('key', 0.6); toast(S.cart.some(Boolean) ? '잔액이 부족합니다. (용돈은 이미 야식으로…)' : '장바구니가 비어 있어요.', 2.5); return; }
    const mb = target.closest<HTMLElement>('[data-m]');
    if (mb) { audio.play('click'); const k = mb.dataset.m; if (k === 'play') musicPlay(!M.playing); else musicSet(M.cur + (k === 'next' ? 1 : -1)); return; }
    const tr = target.closest<HTMLElement>('[data-track]'); if (tr) { audio.play('click'); musicSet(Number(tr.dataset.track)); musicPlay(true); }
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Space') {
      if (event.target instanceof HTMLButtonElement && event.target !== coverButton) return;
      event.preventDefault();
      if (!event.repeat) { audio.resume(); audio.play('key'); coverKey = true; updateCover(); }
    } else if (!event.repeat && /^[1-6]$/.test(event.key)) {
      event.preventDefault(); select(apps[Number(event.key) - 1].id);
    } else if (!event.repeat && event.key.toLowerCase() === 'f') {
      audio.resume(); audio.play('key'); say(sim.bribe() ? '냠냠… 고마워!' : '지금은 배불러…', 1.6);
    }
  };
  const keyup = (event: KeyboardEvent) => { if (coverKey && event.code === 'Space') { event.preventDefault(); coverKey = false; updateCover(); } };
  const pointerdown = (event: PointerEvent) => {
    if (event.button !== 1 || coverMiddle !== null) return;
    event.preventDefault(); el.focus({ preventScroll: true }); audio.resume(); audio.play('click'); coverMiddle = event.pointerId; updateCover();
  };
  const pointerup = (event: PointerEvent) => {
    if (coverMiddle === event.pointerId && (event.button === 1 || event.type === 'pointercancel')) { coverMiddle = null; updateCover(); }
  };
  const buttonDown = (event: PointerEvent) => {
    if (event.button !== 0 || coverPointer !== null) return;
    event.preventDefault(); coverButton.focus({ preventScroll: true }); coverButton.setPointerCapture(event.pointerId);
    audio.resume(); audio.play('click'); coverPointer = event.pointerId; updateCover();
  };
  const buttonUp = (event: PointerEvent) => { if (coverPointer === event.pointerId) { coverPointer = null; updateCover(); } };
  const blur = () => {
    if (!coverKey && coverPointer === null && coverMiddle === null) return;
    const pointer = coverPointer; coverKey = false; coverPointer = null; coverMiddle = null; updateCover();
    if (pointer !== null && coverButton.hasPointerCapture(pointer)) coverButton.releasePointerCapture(pointer);
  };
  const focusout = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node) || !el.contains(event.relatedTarget)) blur(); };
  const scroll = (event: Event) => { if ((event.target as Element).classList?.contains('sc-wt-scroll')) toonProgress(); };
  const inputs = new AbortController();
  const options = { signal: inputs.signal };
  el.addEventListener('click', click, options);
  el.addEventListener('keydown', keydown, options); el.addEventListener('keyup', keyup, options);
  el.addEventListener('focusout', focusout, options); el.addEventListener('pointerdown', pointerdown, options);
  host.addEventListener('scroll', scroll, { ...options, capture: true });
  window.addEventListener('pointerup', pointerup, options); window.addEventListener('pointercancel', pointerup, options); window.addEventListener('blur', blur, options);
  coverButton.addEventListener('pointerdown', buttonDown, options); coverButton.addEventListener('pointerup', buttonUp, options);
  coverButton.addEventListener('pointercancel', buttonUp, options); coverButton.addEventListener('lostpointercapture', buttonUp, options);
  renderApp(null);

  function onEvent(ev: SlackEvent) {
    if (ev.t === 'footstep') { audio.play('footstep', ev.vol); const lv = ev.vol < 0.4 ? 1 : ev.vol < 0.75 ? 2 : 3; stepEls.forEach((s, i) => s.classList.toggle('on', i < lv)); el.style.setProperty('--sc-step', String(ev.vol)); stepUntil = elapsed + 0.9; if (ev.vol > 0.6) say('복도에서 발소리가…', 1.4); }
    else if (ev.t === 'door') audio.play(ev.open ? 'doorOpen' : 'doorClose');
    else if (ev.t === 'peek') { audio.play('peek'); say('쉿! 문 앞이야', 1.6); }
    else if (ev.t === 'friend-warn') { audio.play('nudge'); audio.play('whisper'); warningUntil = elapsed + 3; say('야, 사감 온다!', 3); }
    else if (ev.t === 'leave') say('갔다… 휴', 1.6);
    else if (ev.t === 'strike') strikeUntil = elapsed + 2;
    else if (ev.t === 'quiet') quietUntil = elapsed + 3;
  }
  const modes = ['away', 'approach', 'peek', 'scan', 'leave'];
  return { el, frame(dt) {
    elapsed += dt;
    const state = sim.state; const id = apps.some(a => a.id === state.activity) ? state.activity as DormActivity : null;
    if (id !== shown) renderApp(id);
    applyCover();
    const covered = state.cover;
    setCls('sc-covered', covered); setCls('sc-slacking', !!id && !covered);
    setCls('sc-hint-one', state.watcher.hint >= 1); setCls('sc-hint-two', state.watcher.hint >= 2); setCls('sc-scanning', state.watcher.mode === 'scan');
    setCls('sc-warning', elapsed < warningUntil); setCls('sc-struck', elapsed < strikeUntil); setCls('sc-is-quiet', elapsed < quietUntil);
    const near = String(Math.round(Math.max(0, Math.min(1, state.watcher.near)) * 100) / 100); if (cache.near !== near) { cache.near = near; el.style.setProperty('--sc-near', near); }
    const mode = modes.includes(state.watcher.mode) ? state.watcher.mode : 'away'; if (cache.mode !== mode) { cache.mode = mode; el.dataset.mode = mode; }
    if (stepUntil && elapsed > stepUntil) { stepUntil = 0; stepEls.forEach(s => s.classList.remove('on')); el.style.setProperty('--sc-step', '0'); }
    if (toastUntil && elapsed > toastUntil) { toastUntil = 0; toastEl.classList.remove('on'); }
    if (bubbleUntil && elapsed > bubbleUntil) bubbleUntil = 0;
    setCls('sc-talk', elapsed < bubbleUntil || elapsed < warningUntil);
    gameTick(dt);
    tickAcc += dt;
    if (tickAcc < 0.1) return;
    const step = tickAcc; tickAcc = 0;
    vidTick(step); musicTick(step); shopTick(step);
    if (queue.length) for (let i = queue.length - 1; i >= 0; i--) if (queue[i].at <= elapsed) { const { fn } = queue[i]; queue.splice(i, 1); fn(); }
    if (elapsed > nextIncoming && state.phase === 'play') {
      nextIncoming = elapsed + 9 + Math.random() * 7; const r = Math.random() < 0.6 ? 0 : Math.random() < 0.6 ? 1 : 2; chatIncoming(r, pick(rooms[r].pool), 0);
    }
    if (elapsed > 45 && !cache.newEp) { cache.newEp = true; if (built.webtoon) built.webtoon.querySelector<HTMLElement>('[data-ep="3"]')!.hidden = false; if (shown !== 'webtoon') { setBadge('webtoon', 1); toast('웹툰 「달빛 아래 우리」 13화 업데이트!'); audio.play('chime', 0.4); } }
    const min = 24 + Math.floor(elapsed / 20); setTxt(clockEl, `오전 ${1 + Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`);
  }, onEvent, dispose() { if (disposed) return; disposed = true; inputs.abort(); blur(); if (earbudsActive) { earbudsActive = false; audio.muffle(false); } queue.length = 0; } };
};
