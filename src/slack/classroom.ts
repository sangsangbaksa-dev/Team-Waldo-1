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

export const createClassroomView: CreateView = (sim, audio) => {
  const el = document.createElement('div');
  el.className = 'sl-class';
  el.innerHTML = `
    <div class="sl-room" aria-label="저녁 자습 교실">
      <div class="sl-ceiling"><div class="sl-light"></div><div class="sl-light"></div></div>
      <div class="sl-wall"><div class="sl-clock">10:24</div><div class="sl-board"><small>오늘의 자습</small><span>조용히, 끝까지.</span><i>수고했어, 오늘도.</i></div><div class="sl-door"><div class="sl-window"><div class="sl-shadow"></div><div class="sl-face"><i></i><i></i></div></div><div class="sl-handle"></div></div></div>
      <div class="sl-students"><div class="sl-student"><i></i></div><div class="sl-student"><i></i></div><div class="sl-student"><i></i></div><div class="sl-student"><i></i></div></div>
      <div class="sl-teacher"><div class="sl-teacher-head"></div><div class="sl-teacher-body"></div></div>
      <button class="sl-friend" type="button" aria-label="짝꿍에게 다가가기"><span class="sl-friend-head"></span><span class="sl-friend-body"></span><span class="sl-friend-arm"></span><span class="sl-bubble">쉿, 선생님!</span></button>
      <div class="sl-desk"><div class="sl-book"><div class="sl-book-page"><b>국어</b><em>생각하며 읽기</em><p>오늘의 배움은 내일의 나를 만든다.</p><p>글을 읽고 물음에 답해 봅시다.</p><p>──────────────────</p><p>────────────────</p></div><div class="sl-book-page"><b>학습 활동</b><p>1. 다음 글의 내용을 정리해 보자.</p><p>──────────────────</p><p>────────────────</p><p>──────────────────</p></div><div class="sl-manga"><strong>두근!</strong><span>✦</span><span>◉ ◡ ◉</span><span>다음 화에 계속…</span></div></div>
      <div class="sl-notebook"><b>자습 노트</b><span class="sl-writing">오늘 배운 내용 정리하기</span><svg class="sl-doodle" viewBox="0 0 160 90" aria-hidden="true"><path d="M12 42 Q25 6 38 42 Q51 78 64 42 M75 30 l8 -12 8 12 14 3 -10 10 2 15 -14 -7 -14 7 3 -15 -10 -10z M112 65 q15 -24 28 0 q-13 18 -28 0 M119 62 h2 m11 0 h2"/></svg></div>
      <div class="sl-pencil"></div><div class="sl-snack">바삭<span>♢</span></div><div class="sl-earbuds">♫<span>〰〰</span></div><div class="sl-paper">쪽지 ♥</div>
      <div class="sl-lap"><div class="sl-phone"><div class="sl-phone-screen"><div class="sl-video"><span>오늘도<br>몰래 보는 중</span><b>♥</b><small>좋아요 1,248</small></div></div></div></div></div>
      <div class="sl-sleep">z <span>Z</span> <b>z</b></div><div class="sl-strike"><span>거기, 지금 뭐 하고 있니?</span></div>
    </div>
    <div class="sl-controls"><div class="sl-activities" aria-label="딴짓 선택">${activities.map((a, i) => `<button type="button" class="sl-action" data-activity="${a.id}" aria-label="${a.name} (${i + 1})"><span>${a.icon}</span><small>${a.name}</small></button>`).join('')}</div><button type="button" class="sl-cover">공부하는 척 <small>길게 누르기 · 스페이스</small></button></div>`;
  const room = el.querySelector<HTMLElement>('.sl-room')!;
  const cover = el.querySelector<HTMLButtonElement>('.sl-cover')!;
  const friend = el.querySelector<HTMLButtonElement>('.sl-friend')!;
  const actions = Array.from(el.querySelectorAll<HTMLButtonElement>('.sl-action'));
  let coverKey = false;
  let coverPointer = false;
  let muffled = false;
  let elapsed = 0;
  let warning = 0;
  let strike = 0;
  let quiet = 0;
  let doodle = 0;
  const syncCover = () => sim.setCover(coverKey || coverPointer);
  const choose = (id: ClassActivity) => {
    audio.resume();
    const next = sim.state.activity === id ? null : id;
    sim.doActivity(next);
    if (next && sim.state.activity === next) audio.play(activities.find(a => a.id === id)!.sound);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) { audio.resume(); coverKey = true; syncCover(); }
    } else if (!event.repeat && /^[1-7]$/.test(event.key)) {
      event.preventDefault(); choose(activities[Number(event.key) - 1].id);
    } else if (!event.repeat && event.key.toLowerCase() === 'f') {
      audio.resume(); sim.bribe();
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
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-activity]');
    if (button) choose(button.dataset.activity as ClassActivity);
  };
  const friendClick = () => { audio.resume(); if (sim.bribe()) audio.play('whisper'); };
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', release);
  cover.addEventListener('pointerdown', pointerDown);
  cover.addEventListener('pointerup', pointerUp);
  cover.addEventListener('pointercancel', pointerUp);
  cover.addEventListener('lostpointercapture', pointerUp);
  el.addEventListener('click', actionClick);
  friend.addEventListener('click', friendClick);
  return {
    el,
    frame(dt) {
      const state = sim.state;
      elapsed += dt;
      warning = Math.max(0, warning - dt); strike = Math.max(0, strike - dt); quiet = Math.max(0, quiet - dt);
      if (state.activity === 'doodle' && !state.cover) doodle = Math.min(1, doodle + dt / 15);
      const active = !state.cover ? state.activity : null;
      room.dataset.activity = active ?? '';
      room.dataset.hint = String(state.watcher.hint);
      room.dataset.scan = String(state.watcher.mode === 'scan');
      room.classList.toggle('is-cover', state.cover);
      room.classList.toggle('is-warning', warning > 0);
      room.classList.toggle('is-strike', strike > 0);
      room.classList.toggle('is-quiet', quiet > 0);
      room.style.setProperty('--near', String(Math.max(0, Math.min(1, state.watcher.near))));
      room.style.setProperty('--doodle', String(doodle));
      room.style.setProperty('--time', String(elapsed));
      actions.forEach(button => { const selected = button.dataset.activity === state.activity; button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected)); });
      cover.classList.toggle('is-active', state.cover);
      const music = active === 'music';
      if (music !== muffled) { muffled = music; audio.muffle(music); }
    },
    onEvent(ev: SlackEvent) {
      switch (ev.t) {
        case 'footstep': audio.play('footstep', ev.vol); break;
        case 'door': audio.play(ev.open ? 'doorOpen' : 'doorClose'); break;
        case 'peek': audio.play('peek'); break;
        case 'friend-warn': warning = 2.5; audio.play('nudge'); audio.play('whisper'); break;
        case 'quiet': quiet = 3; break;
        case 'strike': strike = 2; break;
      }
    },
    dispose() {
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', release);
      cover.removeEventListener('pointerdown', pointerDown); cover.removeEventListener('pointerup', pointerUp); cover.removeEventListener('pointercancel', pointerUp); cover.removeEventListener('lostpointercapture', pointerUp);
      el.removeEventListener('click', actionClick); friend.removeEventListener('click', friendClick);
      if (coverKey || coverPointer) sim.setCover(false);
      if (muffled) audio.muffle(false);
    },
  };
};
