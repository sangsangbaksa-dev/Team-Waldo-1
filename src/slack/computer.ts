import './computer.css';
import type { CreateView, DormActivity, SlackEvent } from './types';

const apps: { id: DormActivity; icon: string; label: string }[] = [
  { id: 'game', icon: '◆', label: '게임' }, { id: 'video', icon: '▶', label: '영상' },
  { id: 'chat', icon: '●', label: '메신저' }, { id: 'webtoon', icon: '▤', label: '웹툰' },
  { id: 'shop', icon: '▣', label: '쇼핑' }, { id: 'music', icon: '♫', label: '음악' },
];

export const createComputerView: CreateView = (sim, audio) => {
  const el = document.createElement('div');
  el.className = 'slack-computer';
  el.innerHTML = `<div class="sc-room"><div class="sc-wall-light"></div><div class="sc-door"><div class="sc-door-window"><div class="sc-door-person"></div></div><div class="sc-door-handle"></div><div class="sc-door-beam"></div></div><div class="sc-scan-person"><i></i></div><button class="sc-friend" type="button" aria-label="룸메에게 간식 나눠주기"><span class="sc-friend-head"></span><span class="sc-friend-body"></span><span class="sc-friend-bubble">야, 사감 온다!</span></button><div class="sc-friend-monitor"></div><div class="sc-desk"></div><div class="sc-monitor"><div class="sc-screen"><div class="sc-desktop"><div class="sc-wallpaper"><span>오늘도 무사히</span><small>조용한 밤의 컴퓨터실</small></div><div class="sc-window-host"></div><div class="sc-cover"><div class="sc-cover-window"><div class="sc-title"><span>수능 필수 개념 인강</span><span>—　□　×</span></div><div class="sc-lecture"><div class="sc-board"><small>오늘의 개념 정리</small><strong>함수의 극한과 연속</strong><div>lim　f(x) = L</div><p>x가 한없이 가까워질 때<br>함숫값의 변화를 살펴봅시다.</p></div><div class="sc-teacher">●<br>▰</div></div><div class="sc-lecture-controls">❚❚ <span class="sc-progress"><i></i></span> 12:34 / 45:00</div></div><div class="sc-notes"><b>개념 필기</b><p>1. 극한값의 뜻</p><p>함수의 값이 가까워지는 값</p><p>2. 좌극한과 우극한</p><p>두 값이 같아야 극한이 존재!</p></div></div><div class="sc-taskbar"><span class="sc-start">▦</span><div class="sc-apps">${apps.map((a, i) => `<button type="button" data-app="${a.id}" aria-label="${a.label} (${i + 1})" title="${a.label}"><span>${a.icon}</span></button>`).join('')}</div><span class="sc-clock">오전 1:24</span></div></div></div><div class="sc-monitor-edge"><span></span></div><div class="sc-monitor-stand"></div></div><div class="sc-keyboard"></div><div class="sc-face-glow"></div><div class="sc-strike"><strong>거기, 지금 뭐 하고 있니?</strong></div><div class="sc-quiet">순간, 컴퓨터 팬 소리만 남았다.</div></div><div class="sc-controls"><span>숫자 1–6 앱 전환 · F 룸메에게 간식</span><button type="button" class="sc-cover-button">인강 창 <small>누르고 있기 · 스페이스</small></button></div>`;
  const host = el.querySelector<HTMLElement>('.sc-window-host')!;
  const cover = el.querySelector<HTMLElement>('.sc-cover')!;
  const coverButton = el.querySelector<HTMLButtonElement>('.sc-cover-button')!;
  let shown: DormActivity | null = null;
  let elapsed = 0; let score = 0; let health = 100; let messages = 0; let cart = 0;
  let coverKey = false; let coverPointer = false; let coverMiddle = false; let disposed = false;
  let warningUntil = 0; let strikeUntil = 0; let quietUntil = 0;
  const updateCover = () => sim.setCover(coverKey || coverPointer || coverMiddle);
  const select = (id: DormActivity) => { audio.resume(); audio.play('click'); sim.doActivity(sim.state.activity === id ? null : id); };
  const windows: Record<DormActivity, () => string> = {
    game: () => `<div class="sc-game"><div class="sc-game-top"><span>별빛 던전</span><span>점수 <b data-score>${score}</b></span></div><div class="sc-health">체력 <span><i data-health style="width:${health}%"></i></span></div><div class="sc-game-scene"><div class="sc-stars">✦　　·　　 ✧　　　✦</div><button type="button" class="sc-monster" aria-label="괴물 공격">◉<span>▼</span></button><div class="sc-game-ground"></div></div><div class="sc-game-hint">괴물을 눌러 공격하세요!</div></div>`,
    video: () => `<div class="sc-video"><div class="sc-video-picture"><div class="sc-video-sun"></div><div class="sc-video-mountain"></div><div class="sc-video-play">▶</div><span>오늘 밤, 잠시 쉬어가요</span></div><div class="sc-video-bar">❚❚ <span class="sc-progress"><i></i></span> 03:42 / 12:08</div><b>새벽 감성 모음 ☁</b><small>조회수 12만회 · 오늘</small><div class="sc-comment">●　이 시간에 보는 사람 손 ✋<br><br>●　내일의 나야 미안해</div></div>`,
    chat: () => `<div class="sc-chat"><div class="sc-chat-head">●　우리 반 비밀방 <small>3명</small></div><div class="sc-messages"><p>오늘 자습 진짜 길다...</p><p class="mine">그러니까 ㅠㅠ <small>읽음</small></p><p>끝나고 매점 갈 사람?</p><div data-messages></div></div><div class="sc-typing">누군가 입력 중<span>...</span></div><div class="sc-chat-input">메시지를 입력하세요 <span>전송</span></div></div>`,
    webtoon: () => `<div class="sc-webtoon"><div class="sc-webtoon-head">달빛 아래 우리 <small>제 12화 · 비밀</small></div><div class="sc-comic"><div class="sc-comic-sky"><span>그날 밤,</span><i>☾</i><b>우리는 약속했다.</b></div><div class="sc-comic-panel"><div class="sc-comic-person">●<br>▰</div><p>내일도<br>여기서 만나자.</p></div><div class="sc-comic-panel sc-comic-pink"><p>응, 꼭!</p><div class="sc-comic-person">●<br>▰</div></div><div class="sc-comic-end">계속 ↓</div></div></div>`,
    shop: () => `<div class="sc-shop"><div class="sc-shop-head">오늘의 발견 <span>장바구니 <b data-cart>${cart}</b></span></div><div class="sc-sale">심야 특가 <strong data-timer>09:59</strong><small>지금만 이 가격!</small></div><div class="sc-products">${['폭신한 구름 쿠션', '별빛 무드등', '말랑 젤리 세트'].map((name, i) => `<div><div class="sc-product p${i}">${['☁', '✦', '◒'][i]}</div><b>${name}</b><small><em>35%</em> ${['8,900', '12,900', '4,500'][i]}원</small><button type="button" data-add>담기</button></div>`).join('')}</div></div>`,
    music: () => `<div class="sc-music"><div class="sc-album">☾<span>새벽의 온도</span></div><div class="sc-music-info"><small>지금 재생 중</small><strong>잠들지 못한 밤</strong><span>파란 새벽</span><div class="sc-visualizer">${Array.from({ length: 18 }, (_, i) => `<i style="--n:${i}"></i>`).join('')}</div><div class="sc-progress"><i></i></div><div class="sc-music-controls">↻　　 ◀◀　　❚❚　　▶▶　　 ♡</div></div><div class="sc-playlist"><b>재생 목록</b><p>01　잠들지 못한 밤 <span>3:42</span></p><p>02　창가의 불빛 <span>4:08</span></p><p>03　느린 걸음 <span>3:16</span></p></div></div>`,
  };
  function renderApp(id: DormActivity | null) {
    shown = id;
    host.innerHTML = id ? `<div class="sc-app-window sc-app-${id}"><div class="sc-title"><span>${apps.find(a => a.id === id)?.label ?? ''}</span><span>—　□　×</span></div>${windows[id]()}</div>` : '';
    el.querySelectorAll<HTMLButtonElement>('[data-app]').forEach(button => button.classList.toggle('active', button.dataset.app === id));
  }
  const click = (event: MouseEvent) => {
    const target = event.target as Element;
    const app = target.closest<HTMLButtonElement>('[data-app]');
    if (app) { select(app.dataset.app as DormActivity); return; }
    if (target.closest('.sc-friend')) { audio.resume(); audio.play('click'); sim.bribe(); return; }
    if (target.closest('.sc-monster')) { audio.resume(); audio.play('click'); score += 10; health = health <= 10 ? 100 : health - 3; const s = host.querySelector<HTMLElement>('[data-score]'); const h = host.querySelector<HTMLElement>('[data-health]'); if (s) s.textContent = String(score); if (h) h.style.width = `${health}%`; const monster = host.querySelector<HTMLElement>('.sc-monster'); if (monster) { monster.style.left = `${20 + Math.random() * 60}%`; monster.classList.remove('hit'); void monster.offsetWidth; monster.classList.add('hit'); } }
    if (target.closest('[data-add]')) { audio.play('click'); cart++; const count = host.querySelector<HTMLElement>('[data-cart]'); if (count) count.textContent = String(cart); }
  };
  const keydown = (event: KeyboardEvent) => { if (event.repeat) return; if (event.code === 'Space') { event.preventDefault(); audio.resume(); audio.play('key'); coverKey = true; updateCover(); } else if (/^[1-6]$/.test(event.key)) { select(apps[Number(event.key) - 1].id); } else if (event.key.toLowerCase() === 'f') { audio.resume(); audio.play('key'); sim.bribe(); } };
  const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') { event.preventDefault(); coverKey = false; updateCover(); } };
  const pointerdown = (event: PointerEvent) => { if (event.button === 1) { event.preventDefault(); audio.resume(); audio.play('click'); coverMiddle = true; updateCover(); } };
  const pointerup = (event: PointerEvent) => { if (event.button === 1) { coverMiddle = false; updateCover(); } };
  const buttonDown = (event: PointerEvent) => { event.preventDefault(); coverButton.setPointerCapture(event.pointerId); audio.resume(); audio.play('click'); coverPointer = true; updateCover(); };
  const buttonUp = () => { coverPointer = false; updateCover(); };
  const blur = () => { coverKey = false; coverPointer = false; coverMiddle = false; updateCover(); };
  el.addEventListener('click', click); window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('pointerdown', pointerdown); window.addEventListener('pointerup', pointerup); window.addEventListener('blur', blur); coverButton.addEventListener('pointerdown', buttonDown); coverButton.addEventListener('pointerup', buttonUp); coverButton.addEventListener('pointercancel', buttonUp); coverButton.addEventListener('lostpointercapture', buttonUp);
  function onEvent(ev: SlackEvent) {
    if (ev.t === 'footstep') audio.play('footstep', ev.vol);
    else if (ev.t === 'door') audio.play(ev.open ? 'doorOpen' : 'doorClose');
    else if (ev.t === 'peek') audio.play('peek');
    else if (ev.t === 'friend-warn') { audio.play('nudge'); audio.play('whisper'); warningUntil = elapsed + 3; }
    else if (ev.t === 'strike') strikeUntil = elapsed + 2;
    else if (ev.t === 'quiet') quietUntil = elapsed + 3;
  }
  return { el, frame(dt) {
    elapsed += dt;
    const state = sim.state; const id = apps.some(a => a.id === state.activity) ? state.activity as DormActivity : null;
    if (id !== shown) renderApp(id);
    cover.classList.toggle('visible', state.cover); coverButton.classList.toggle('active', state.cover);
    el.classList.toggle('sc-hint-one', state.watcher.hint >= 1); el.classList.toggle('sc-hint-two', state.watcher.hint >= 2); el.classList.toggle('sc-scanning', state.watcher.mode === 'scan');
    el.style.setProperty('--sc-near', String(Math.max(0, Math.min(1, state.watcher.near))));
    el.classList.toggle('sc-warning', elapsed < warningUntil); el.classList.toggle('sc-struck', elapsed < strikeUntil); el.classList.toggle('sc-is-quiet', elapsed < quietUntil);
    const timer = host.querySelector<HTMLElement>('[data-timer]'); if (timer) { const left = Math.max(0, 599 - Math.floor(elapsed)); timer.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; }
    if (id === 'chat' && Math.floor(elapsed / 8) > messages) { messages = Math.floor(elapsed / 8); const list = host.querySelector<HTMLElement>('[data-messages]'); if (list) { const p = document.createElement('p'); p.textContent = ['사감 아직 안 왔지?', '나 오늘 진짜 졸려...', '조용히 하자 ㅋㅋ', '끝나면 같이 가자!'][messages % 4]; list.append(p); audio.play('chime', 0.4); } }
  }, onEvent, dispose() { if (disposed) return; disposed = true; el.removeEventListener('click', click); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('pointerdown', pointerdown); window.removeEventListener('pointerup', pointerup); window.removeEventListener('blur', blur); coverButton.removeEventListener('pointerdown', buttonDown); coverButton.removeEventListener('pointerup', buttonUp); coverButton.removeEventListener('pointercancel', buttonUp); coverButton.removeEventListener('lostpointercapture', buttonUp); } };
};

