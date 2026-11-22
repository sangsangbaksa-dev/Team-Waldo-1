import './classroom.css';
import type { ClassActivity, CreateView, SlackEvent, SfxName } from './types';

const activities: { id: ClassActivity; icon: string; name: string; sound: SfxName }[] = [
  { id: 'phone', icon: '▣', name: '몰래 폰', sound: 'phoneBuzz' },
  { id: 'manga', icon: '▤', name: '만화책', sound: 'page' },
  { id: 'doodle', icon: '✎', name: '낙서', sound: 'pencil' },
  { id: 'snack', icon: '◈', name: '과자', sound: 'wrapper' },
  { id: 'sleep', icon: '☾', name: '잠자기', sound: 'chair' },
  { id: 'note', icon: '✉', name: '쪽지', sound: 'whisper' },
  { id: 'music', icon: '♫', name: '음악', sound: 'click' },
];
const CLIPS = ['#댄스챌린지', '고양이가 놀라는 순간', '1분 요약 레시피', '밈 모음 #웃참', '오늘의 노래 추천', '먹방 ASMR', '급식 순위 TOP5', '쇼츠 레전드'];
const PINGS = ['민지: 야 뭐해', '단톡방 (+23)', '친구 요청이 왔어요', '택배가 도착했어요', '오늘 급식 뭐래?'];
const WARNS = ['쉿, 선생님!', '야 온다!', '공부해, 공부!', '헐, 뒤에…'];
const WAVE = Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
const CRUMBS = Array.from({ length: 14 }, () => '<i class="sl-crumb"></i>').join('');
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const SW = 160, SH = 96; // 낙서 캔버스 논리 크기

export const createClassroomView: CreateView = (sim, audio) => {
  const el = document.createElement('div');
  el.className = 'sl-class';
  el.innerHTML = `
    <div class="sl-room" aria-label="저녁 자습 교실">
      <div class="sl-world">
        <div class="sl-ceiling"><div class="sl-light"></div><div class="sl-light"></div></div>
        <div class="sl-wall"><div class="sl-clock">10:24</div><div class="sl-board"><small>오늘의 자습</small><span>조용히, 끝까지.</span><i>수고했어, 오늘도.</i></div>
          <div class="sl-door"><div class="sl-window"><div class="sl-shadow"></div><div class="sl-face"><i></i><i></i></div></div><div class="sl-handle"></div><div class="sl-gap"><i></i><i></i></div></div></div>
        <div class="sl-students">
          <div class="sl-student s1"><em class="fx z">z<b>Z</b></em></div>
          <div class="sl-student s2"><em class="fx glow"></em></div>
          <div class="sl-student s3"></div>
          <div class="sl-student s4"><em class="fx chips"></em></div>
          <div class="sl-pass"></div>
        </div>
        <div class="sl-teacher"><div class="sl-teacher-head"></div><div class="sl-teacher-body"></div></div>
        <button class="sl-friend" type="button" aria-label="짝꿍에게 다가가기" data-mood="calm"><span class="sl-friend-head"><i></i><i></i><b></b></span><span class="sl-friend-body"></span><span class="sl-friend-arm"></span><span class="sl-friend-hand"></span><span class="sl-bubble">쉿, 선생님!</span></button>
        <div class="sl-desk">
          <div class="sl-book" data-pick="manga"><div class="sl-book-page"><b>국어</b><em>생각하며 읽기</em><p>오늘의 배움은 내일의 나를 만든다.</p><p>글을 읽고 물음에 답해 봅시다.</p><p>──────────────────</p><p>────────────────</p></div><div class="sl-book-page"><b>학습 활동</b><p>1. 다음 글의 내용을 정리해 보자.</p><p>──────────────────</p><p>────────────────</p><p>──────────────────</p></div>
            <div class="sl-manga"><div class="sl-pg"><span><b>두근!</b></span><span>◉ ◡ ◉</span><span>✦</span><span>헉…!</span></div><div class="sl-pg r"><div class="sl-flip"><div class="sl-pg f"><span>꺄악!</span><span>♥ ◡ ♥</span><span>…!?</span><span>쿵</span></div><div class="sl-pg b"><span>그날 밤</span><span>◉ _ ◉</span><span>✦</span><span>?!</span></div></div><span><em>다음 화에</em></span><span>계속…</span><span>✦</span><span>◉ ◡ ◉</span></div></div></div>
          <div class="sl-notebook" data-pick="doodle"><b>자습 노트</b><span class="sl-writing">오늘 배운 내용 정리하기</span><canvas class="sl-doodle" width="${SW}" height="${SH}"></canvas><i class="sl-pen"></i></div>
          <div class="sl-pencil"></div>
          <div class="sl-snack" data-pick="snack"><u></u>바삭<span>♢</span></div><div class="sl-hand"><i></i></div>${CRUMBS}
          <div class="sl-earbuds" data-pick="music">♫<span>〰〰</span><i class="ring"></i><i class="ring"></i></div><div class="sl-wave">${WAVE}</div>
          <div class="sl-paper" data-pick="note"><span>쪽지 ♥</span></div><div class="sl-reply">ㅋㅋ</div>
          <div class="sl-phone" data-pick="phone"><div class="sl-phone-screen"><div class="sl-sbar"><span>10:24</span><span class="sl-bat">100%</span></div>
            <div class="sl-feed"><div class="sl-clip a"><div class="sl-fig"></div><span class="sl-cap"></span><span class="sl-side">♥<small>1.2만</small></span></div><div class="sl-clip b"><div class="sl-fig"></div><span class="sl-cap"></span><span class="sl-side">♥<small>3.4천</small></span></div></div>
            <i class="sl-bar"></i><b class="sl-heart">♥</b><div class="sl-notif"><small>메시지</small><span>민지: 야 뭐해</span></div></div></div>
        </div>
      </div>
      <div class="sl-cast"></div><div class="sl-flick"></div><div class="sl-glow"></div><div class="sl-hush"><span>…</span></div>
      <div class="sl-sleep" data-pick="sleep"><div class="sl-lid t"></div><div class="sl-lid b"></div><div class="sl-arms"><i></i><i></i></div><div class="sl-zzz">z <span>Z</span> <b>z</b></div><div class="sl-heard">저벅… 저벅…</div></div>
      <div class="sl-pop"></div><div class="sl-relief">휴…</div><div class="sl-strike"><span>거기, 지금 뭐 하고 있니?</span></div>
    </div>
    <div class="sl-controls"><div class="sl-activities" aria-label="딴짓 선택">${activities.map((a, i) => `<button type="button" class="sl-action" data-activity="${a.id}" aria-label="${a.name} (${i + 1})"><span>${a.icon}</span><small>${a.name}</small></button>`).join('')}</div><button type="button" class="sl-cover">공부하는 척 <small>길게 누르기 · 스페이스</small></button></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const room = q('.sl-room');
  const cover = q<HTMLButtonElement>('.sl-cover');
  const friend = q<HTMLButtonElement>('.sl-friend');
  const bubble = q('.sl-bubble');
  const actions = Array.from(el.querySelectorAll<HTMLButtonElement>('.sl-action'));
  const canvas = q<HTMLCanvasElement>('.sl-doodle');
  const pen = q('.sl-pen');
  const pop = q('.sl-pop');
  const feed = q('.sl-feed');
  const clipA = q('.sl-clip.a');
  const clipB = q('.sl-clip.b');
  const bar = q('.sl-bar');
  const batEl = q('.sl-bat');
  const notifText = q('.sl-notif span');
  const crumbs = Array.from(el.querySelectorAll<HTMLElement>('.sl-crumb'));
  const ctx = canvas.getContext('2d');
  const cache = new Map<string, string>();
  const put = (target: HTMLElement, key: string, v: string) => { const k = (target === room ? 'r.' : 'f.') + key; if (cache.get(k) !== v) { cache.set(k, v); target.dataset[key] = v; } };
  const css = (k: string, v: string) => { if (cache.get('$' + k) !== v) { cache.set('$' + k, v); room.style.setProperty(k, v); } };
  const restart = (n: HTMLElement, cls: string) => { n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); };
  let coverKey = false, coverPointer = false, muffled = false;
  let warning = 0, strike = 0, quiet = 0, step = 0, stepLv = 0, joy = 0, relief = 0, popT = 0, buzz = 0;
  let notifT = rnd(6, 10), chewT = 0, crumbI = 0, pageT = 0, pencilT = 0, snoreT = 0, swipeT = 0, swipeA = -1, snackOpened = false;
  // 낙서 펜 상태
  let px = 30, py = 40, pa = rnd(0, 6.28), pk = 0, ink = 0, drawing = false, lx = 0, ly = 0;
  if (ctx) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#33415d'; ctx.lineWidth = 1.5; }
  const stroke = (x1: number, y1: number, x2: number, y2: number) => { if (!ctx) return; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ink += Math.hypot(x2 - x1, y2 - y1); };
  const penTo = (x: number, y: number) => { pen.style.left = `${(x / SW) * 95 + 2}%`; pen.style.top = `${(y / SH) * 70 + 25}%`; };
  // 폰 숏폼
  let clipIdx = 0;
  const setClip = (node: HTMLElement, n: number) => { node.style.setProperty('--h', String((n * 67) % 360)); node.querySelector('.sl-cap')!.textContent = CLIPS[n % CLIPS.length]; };
  setClip(clipA, 0); setClip(clipB, 1);
  const swipe = () => { if (swipeA < 0) { swipeA = 0; audio.play('click', 0.25); if (Math.random() < 0.5) restart(q('.sl-heart'), 'on'); } };
  const syncCover = () => sim.setCover(coverKey || coverPointer);
  const choose = (id: ClassActivity) => {
    audio.resume();
    const next = sim.state.activity === id ? null : id;
    sim.doActivity(next);
    if (next && sim.state.cover && !coverKey && !coverPointer) sim.setCover(false); // 시작 직후 cover 가 켜져 있어도 딴짓을 고르면 펼친다
    if (next && sim.state.activity === next) audio.play(activities.find(a => a.id === id)!.sound);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) { audio.resume(); coverKey = true; syncCover(); }
    } else if (!event.repeat && /^[1-7]$/.test(event.key)) {
      event.preventDefault(); choose(activities[Number(event.key) - 1].id);
    } else if (!event.repeat && event.key.toLowerCase() === 'f') {
      audio.resume(); friendClick();
    }
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.code === 'Space') { event.preventDefault(); coverKey = false; syncCover(); }
  };
  const release = () => { coverKey = false; coverPointer = false; syncCover(); };
  const pointerDown = (event: PointerEvent) => {
    event.preventDefault(); audio.resume(); coverPointer = true; cover.setPointerCapture(event.pointerId); syncCover();
  };
  const pointerUp = () => { coverPointer = false; syncCover(); };
  const actionClick = (event: Event) => {
    const t = event.target as HTMLElement;
    const button = t.closest<HTMLButtonElement>('[data-activity]');
    if (button) { choose(button.dataset.activity as ClassActivity); return; }
    const pick = t.closest<HTMLElement>('[data-pick]')?.dataset.pick as ClassActivity | undefined;
    if (!pick) return;
    const cur = sim.state.activity;
    if (pick === 'phone' && cur === 'phone') swipe(); // 폰 화면 탭 = 다음 영상
    else if (pick === 'sleep') choose('sleep'); // 눈꺼풀 탭 = 고개 들기
    else if (cur !== pick) choose(pick);
  };
  const friendClick = () => { audio.resume(); if (sim.bribe()) { audio.play('whisper'); joy = 1.6; bubble.textContent = '고마워 ♥'; } };
  // 낙서: 직접 그리기
  const dpos = (e: PointerEvent) => [(e.offsetX / canvas.offsetWidth) * SW, (e.offsetY / canvas.offsetHeight) * SH] as const;
  const dDown = (e: PointerEvent) => { if (sim.state.activity !== 'doodle' || sim.state.cover) return; drawing = true; [lx, ly] = dpos(e); canvas.setPointerCapture(e.pointerId); };
  const dMove = (e: PointerEvent) => { if (!drawing) return; const [x, y] = dpos(e); stroke(lx, ly, x, y); penTo(x, y); lx = x; ly = y; px = x; py = y; };
  const dUp = () => { drawing = false; };
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', release);
  cover.addEventListener('pointerdown', pointerDown);
  cover.addEventListener('pointerup', pointerUp);
  cover.addEventListener('pointercancel', pointerUp);
  cover.addEventListener('lostpointercapture', pointerUp);
  canvas.addEventListener('pointerdown', dDown);
  canvas.addEventListener('pointermove', dMove);
  canvas.addEventListener('pointerup', dUp);
  canvas.addEventListener('pointercancel', dUp);
  el.addEventListener('click', actionClick);
  friend.addEventListener('click', friendClick);
  return {
    el,
    frame(dt) {
      const state = sim.state;
      warning = Math.max(0, warning - dt); strike = Math.max(0, strike - dt); quiet = Math.max(0, quiet - dt);
      step = Math.max(0, step - dt); joy = Math.max(0, joy - dt); relief = Math.max(0, relief - dt); popT = Math.max(0, popT - dt); buzz = Math.max(0, buzz - dt);
      const active = !state.cover ? state.activity : null;
      const watched = state.watcher.hint === 2 || state.watcher.mode === 'scan';
      put(room, 'activity', active ?? '');
      put(room, 'hint', String(state.watcher.hint));
      put(room, 'scan', String(state.watcher.mode === 'scan'));
      put(room, 'step', String(step > 0 ? stepLv : 0));
      put(room, 'mode', state.watcher.mode);
      room.classList.toggle('is-cover', state.cover);
      room.classList.toggle('is-warning', warning > 0);
      room.classList.toggle('is-strike', strike > 0);
      room.classList.toggle('is-quiet', quiet > 0);
      room.classList.toggle('is-watched', watched);
      room.classList.toggle('is-buzz', buzz > 0);
      room.classList.toggle('is-relief', relief > 0);
      room.classList.toggle('is-lowbat', state.battery < 20);
      const near = Math.max(0, Math.min(1, state.watcher.near));
      css('--near', near.toFixed(2));
      // 졸림 → 시야 흐려짐(0.5px 단위), 엎드리면 눈꺼풀
      const drowsy = Math.max(0, (state.sleepy - 40) / 60);
      css('--blur', `${(Math.round(drowsy * 8) / 2).toFixed(1)}px`);
      room.classList.toggle('is-nod', state.sleepy > 82 && active !== 'sleep');
      css('--lid', active === 'sleep' ? (state.watcher.hint > 0 ? '.34' : '.5') : '0');
      // 짝꿍 표정
      const mood = warning > 0 ? 'alert' : joy > 0 ? 'happy' : state.friend < 28 ? 'wary' : active === 'manga' || active === 'note' ? 'giggle' : state.friend > 65 ? 'happy' : 'calm';
      put(friend, 'mood', mood);
      put(friend, 'say', joy > 0 ? '1' : '0');
      for (let i = 0; i < actions.length; i++) { const b = actions[i]; const selected = b.dataset.activity === state.activity; if (b.classList.contains('is-active') !== selected) { b.classList.toggle('is-active', selected); b.setAttribute('aria-pressed', String(selected)); } }
      cover.classList.toggle('is-active', state.cover);
      const music = active === 'music';
      if (music !== muffled) { muffled = music; audio.muffle(music); }
      // 배터리 표시
      const bat = `${Math.round(state.battery)}%`;
      if (batEl.textContent !== bat) batEl.textContent = bat;
      // 폰 알림 진동 (딴짓 중이 아닐 때도 가끔 울림)
      if (state.battery > 0) { notifT -= dt; if (notifT <= 0) { notifT = rnd(9, 18); buzz = 1.8; notifText.textContent = PINGS[Math.floor(Math.random() * PINGS.length)]; if (active !== 'phone') audio.play('phoneBuzz', 0.3); } }
      // 폰 숏폼 스와이프
      if (active === 'phone') {
        swipeT += dt;
        if (swipeA < 0 && swipeT > 2.6) { swipeT = 0; swipe(); }
        bar.style.transform = `scaleX(${Math.min(1, swipeT / 2.6).toFixed(2)})`;
        if (swipeA >= 0) {
          swipeA += dt / 0.28;
          if (swipeA >= 1) { swipeA = -1; clipIdx++; setClip(clipA, clipIdx); setClip(clipB, clipIdx + 1); feed.style.setProperty('--sw', '0'); swipeT = 0; } else feed.style.setProperty('--sw', swipeA.toFixed(2));
        }
      }
      // 낙서: 펜이 알아서 끄적끄적
      if (active === 'doodle' && !drawing) {
        let n = Math.ceil(dt * 90);
        const sub = dt / n;
        while (n--) {
          pk += sub * 3; pa += Math.sin(pk * 2.3 + Math.cos(pk)) * sub * 11;
          const nx = px + Math.cos(pa) * sub * 38, ny = py + Math.sin(pa) * sub * 38;
          if (nx < 4 || nx > SW - 4 || ny < 4 || ny > SH - 4) { pa += Math.PI * 0.75; continue; }
          stroke(px, py, nx, ny); px = nx; py = ny;
        }
        penTo(px, py);
      }
      if (ink > 1500 && ctx) { ctx.clearRect(0, 0, SW, SH); ink = 0; }
      if (active === 'doodle') { pencilT -= dt; if (pencilT <= 0) { pencilT = 0.55; audio.play('pencil', 0.35); } }
      // 과자: 꺼내기 -> 씹기 -> 부스러기
      if (active === 'snack') {
        if (!snackOpened) { snackOpened = true; q('.sl-snack').classList.add('is-open'); }
        chewT -= dt;
        if (chewT <= 0) {
          chewT = 0.55;
          const c = crumbs[crumbI++ % crumbs.length];
          c.style.left = `${rnd(48, 72)}%`; c.style.top = `${rnd(48, 58)}%`; c.style.setProperty('--dx', `${rnd(-16, 16)}px`);
          restart(c, 'on'); audio.play('chew', 0.4);
        }
      }
      // 만화책 넘김 소리
      if (active === 'manga') { pageT -= dt; if (pageT <= 0) { pageT = 3.2; audio.play('page', 0.4); } } else pageT = 1.2;
      if (active === 'sleep') { snoreT -= dt; if (snoreT <= 0) { snoreT = 4.2; audio.play('snore', 0.3); } } else snoreT = 1.5;
    },
    onEvent(ev: SlackEvent) {
      switch (ev.t) {
        case 'footstep': audio.play('footstep', ev.vol); step = 1.3; stepLv = ev.vol < 0.34 ? 1 : ev.vol < 0.68 ? 2 : 3; if (ev.vol > 0.5) restart(room, 'is-thump'); break;
        case 'door': audio.play(ev.open ? 'doorOpen' : 'doorClose'); room.classList.toggle('is-door', ev.open); break;
        case 'peek': audio.play('peek'); break;
        case 'friend-warn': warning = 2.5; bubble.textContent = WARNS[Math.floor(Math.random() * WARNS.length)]; audio.play('nudge'); audio.play('whisper'); break;
        case 'quiet': quiet = 3; break;
        case 'strike': strike = 2; break;
        case 'leave': relief = 2; room.classList.remove('is-door'); break;
        case 'fun': if (ev.amount >= 1 && popT <= 0) { popT = 0.8; pop.textContent = `+${Math.round(ev.amount)} 재미`; restart(pop, 'on'); } break;
      }
    },
    dispose() {
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', release);
      cover.removeEventListener('pointerdown', pointerDown); cover.removeEventListener('pointerup', pointerUp); cover.removeEventListener('pointercancel', pointerUp); cover.removeEventListener('lostpointercapture', pointerUp);
      canvas.removeEventListener('pointerdown', dDown); canvas.removeEventListener('pointermove', dMove); canvas.removeEventListener('pointerup', dUp); canvas.removeEventListener('pointercancel', dUp);
      el.removeEventListener('click', actionClick); friend.removeEventListener('click', friendClick);
      if (coverKey || coverPointer) sim.setCover(false);
      if (muffled) audio.muffle(false);
    },
  };
};
