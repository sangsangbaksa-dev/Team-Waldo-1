import '../shared/ui.css';
import './slack.css';
import { readPreferences, writeSound } from '../prefs';
import type { LoadingScreen } from '../loading';
import { createSim, GOALS } from './sim';
import { createSlackAudio } from './audio';
import { readSlackRecord, recordSlackRun } from './records';
import type { ActivityId, Level, Sim, SlackState, StageId, StageView } from './types';

const stageInfo: Record<StageId, { name: string; blurb: string }> = {
  class: { name: '교실 저녁 자습', blurb: '학교 노트북으로 몰래 게임 영상·게임. 수업 자료 창으로 얼른 전환!' },
  dorm: { name: '기숙사 컴퓨터실', blurb: '사감 몰래 게임·영상·웹툰. 게임·영상·음악을 하면 배터리가 줄고, 바닥나면 못 해요.' },
};
const levelInfo: Record<Level, string> = {
  1: `재미 목표 ${GOALS[0]} · 감독이 드물게, 천천히 와요.`,
  2: `재미 목표 ${GOALS[1]} · 균형 잡힌 순찰. 처음이라면 추천!`,
  3: `재미 목표 ${GOALS[2]} · 순찰이 잦고 빨라요. 방심은 금물.`,
};
const activityName: Record<ActivityId, string> = {
  game: '게임', video: '영상', chat: '메신저', webtoon: '웹툰', shop: '쇼핑', music: '음악',
};
const tutorialKey = 'waldo.slack.tutorial.v1';
const isTouch = (): boolean => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
const tutorialSeen = (): boolean => { try { return localStorage.getItem(tutorialKey) === '1'; } catch { return false; } };
const markTutorialSeen = (): void => { try { localStorage.setItem(tutorialKey, '1'); } catch { /* 저장소를 못 써도 게임은 계속 */ } };
/** 첫 판 안내: 각 단계는 done 이 참이 되면 다음으로. 마지막 단계는 몇 초 뒤 자동 종료. */
const tutorialSteps: { text: string; classText?: string; done: (s: SlackState, t: number) => boolean }[] = [
  { text: '먼저 딴짓을 골라 보세요. 숫자 키 또는 화면의 활동 버튼을 누르면 돼요.', classText: '먼저 딴짓을 골라 보세요. 1 게임 영상 시청 · 2 게임 플레이 (키 또는 노트북 화면의 버튼).', done: s => s.activity !== null },
  { text: '딴짓하는 동안 재미 게이지가 차올라요. 발소리와 문 소리에 귀를 기울이세요.', classText: '재미 게이지가 차올라요. 발소리와 유리창 너머 그림자를 살피세요. 게임은 재미가 크지만 소리가 커서 더 위험해요.', done: (s, t) => s.watcher.mode !== 'away' || t > 25 },
  { text: '감독이 다가와요! 스페이스바를 꾹 누르거나(모바일은 공부하는 척 버튼) 공부하는 척하세요.', classText: '감독이 다가와요! 스페이스바를 꾹 눌러(모바일은 버튼) 수업 자료 창으로 전환하세요.', done: (s, t) => (s.cover && s.watcher.mode !== 'away') || s.watcher.mode === 'leave' || t > 20 },
  { text: '좋아요! 감독이 떠나면 다시 딴짓하세요. 재미가 목표선(흰 막대)에 닿으면 클리어예요.', done: (_s, t) => t > 7 },
];

export function openSlack(onExit: () => void, opts: { loading?: LoadingScreen } = {}): void {
  const root = document.createElement('div'); root.className = 'sl-root';
  root.innerHTML = `<div class="sl-view"></div><div class="sl-vignette"></div>
  <div class="sl-hud" hidden><div class="sl-hudclock"><span>남은 시간</span><b data-time>02:30</b></div><div class="sl-fun"><div><b>재미</b><span data-fun></span></div><div class="sl-track"><i data-fun-bar></i><em data-goal></em></div></div><div class="sl-numbers"><span class="sl-chip">들킴 <span class="sl-pips" data-pips><i></i><i></i><i></i></span><b hidden data-strikes>0</b></span><span class="sl-chip" data-battery-chip>배터리 <b data-battery>100</b>%</span><span class="sl-chip">연속 <b data-combo>1</b>배</span><span class="sl-chip" data-risk-chip>긴장 <span class="sl-risk"><i><em data-risk></em></i></span></span></div><div class="sl-tools"><button data-sound>소리 켜짐</button><button data-pause>일시정지</button></div></div>
  <div class="sl-tip" data-tip hidden role="note"><b data-tip-step>안내</b><span data-tip-text></span><button type="button" data-tip-skip>건너뛰기</button></div><div class="sl-toast" role="status"></div>
  <div class="sl-modal wd-screen" data-title><div class="sl-card sl-titlecard wd-panel"><div class="sl-kicker">오늘도 무사히</div><h1>SLACK OFF <small>딴짓</small></h1><p class="sl-lead">조용한 밤, 눈치를 살피며 나만의 시간을 즐겨 보세요. 재미 게이지를 목표까지 채우되 세 번 들키면 끝!</p><div class="sl-field"><b>장소</b><div class="sl-stages" data-stages><button type="button" class="sl-stage" data-stage="class"><span class="sl-art class"><i class="a1"></i><i class="a2"></i><i class="a3"></i></span><b>${stageInfo.class.name}</b><small>${stageInfo.class.blurb}</small><em data-rec="class"></em></button><button type="button" class="sl-stage" data-stage="dorm"><span class="sl-art dorm"><i class="a1"></i><i class="a2"></i><i class="a3"></i></span><b>${stageInfo.dorm.name}</b><small>${stageInfo.dorm.blurb}</small><em data-rec="dorm"></em></button></div></div><div class="sl-field"><b>난이도</b><div class="sl-options" data-levels><button type="button" data-level="1">느긋하게<small>목표 ${GOALS[0]}</small></button><button type="button" data-level="2">보통<small>목표 ${GOALS[1]}</small></button><button type="button" data-level="3">아슬아슬<small>목표 ${GOALS[2]}</small></button></div><p class="sl-leveldesc" data-leveldesc></p></div><div class="sl-keyhints"><span data-key-cover><kbd>Space</kbd> 누르는 동안 공부하는 척</span><span data-key-pick><kbd>1</kbd>~<kbd>6</kbd> 딴짓 고르기</span><span><kbd>P</kbd> 일시정지</span></div><p class="sl-help">발소리와 문 소리가 가까워지면 얼른 공부하는 척! 터치는 화면의 버튼으로 같은 조작을 할 수 있어요.</p><div class="sl-actions"><button class="wd-btn primary" data-start>시작하기</button><button class="wd-btn ghost" data-exit>게임 목록으로</button><button type="button" class="sl-soundbtn" data-sound>소리 켜짐</button></div></div></div>
  <div class="sl-modal wd-screen" data-paused hidden><div class="sl-card narrow wd-panel"><div class="sl-kicker">잠깐 쉬어 가요</div><h2>일시정지</h2><ul class="sl-hl sl-pause-stats" data-pause-stats></ul><div class="sl-keyhints"><span><kbd>Space</kbd> 공부하는 척</span><span><kbd>P</kbd> / <kbd>Esc</kbd> 계속하기</span></div><p class="sl-touchhint">공부하는 척은 화면의 버튼을, 일시정지는 위쪽 버튼을 눌러요.</p><div class="sl-actions"><button class="wd-btn primary" data-resume>계속하기</button><button class="wd-btn" data-restart>처음부터</button><button class="wd-btn ghost" data-exit>게임 목록으로</button><button type="button" class="sl-soundbtn" data-sound>소리 켜짐</button></div></div></div>
  <div class="sl-modal wd-screen" data-result hidden><div class="sl-card wd-panel"><div class="sl-kicker" data-result-kicker>오늘의 기록</div><div class="sl-result-head"><div class="sl-grade" data-grade></div><div><h2 data-result-title></h2><p class="sl-reason" data-reason></p></div></div><div class="sl-result-stats" data-stats></div><ul class="sl-hl" data-highlights></ul><div class="sl-record" data-record></div><div class="sl-actions"><button class="wd-btn primary" data-retry>다시 도전</button><button class="wd-btn" data-next>다음 장소</button><button class="wd-btn ghost" data-exit>게임 목록으로</button></div></div></div>`;
  document.body.append(root);
  // The HUD and modal shell are static for the lifetime of this game instance.
  // Cache their nodes instead of re-running selectors every animation frame.
  const nodes = new Map<string, HTMLElement>();
  const $ = <T extends HTMLElement>(selector: string): T => {
    let node = nodes.get(selector);
    if (!node) { node = root.querySelector<T>(selector)!; nodes.set(selector, node); }
    return node as T;
  };
  const strikePips = Array.from(root.querySelectorAll<HTMLElement>('[data-pips] i'));
  let audio = createSlackAudio(); let muted = !readPreferences().sound; audio.setMuted(muted);
  let stage: StageId = 'class', level: Level = 2, sim: Sim | null = null, view: StageView | null = null;
  let state: 'title' | 'loading' | 'play' | 'paused' | 'result' = 'title', closed = false, raf = 0, last = performance.now(), toastTime = 0, beat = 0;
  let tutorial = !tutorialSeen(), tutStep = 0, tutTime = 0, tutWall = 0;
  let tally = { act: {} as Partial<Record<ActivityId, number>>, maxCombo: 1, maxSus: 0, warns: 0, reasons: [] as string[] };
  const toast = (message: string, duration = 3): void => {
    if (state !== 'play' && !raf) last = performance.now();
    $('.sl-toast').textContent = message; toastTime = duration; scheduleFrame();
  };
  const endTutorial = (): void => {
    tutorial = false; markTutorialSeen();
    const tip = $('[data-tip]');
    if (state === 'play' && tip.contains(document.activeElement)) view?.el.focus({ preventScroll: true });
    tip.hidden = true; root.classList.remove('tipping');
  };
  const tipText = (step: (typeof tutorialSteps)[number]): string => {
    const t = stage === 'class' ? step.classText ?? step.text : step.text;
    return isTouch() ? t.replace('숫자 키 또는 화면의 활동 버튼을 누르면 돼요.', '화면의 활동 버튼을 누르면 돼요.').replace('1 게임 영상 시청 · 2 게임 플레이 (키 또는 노트북 화면의 버튼).', '노트북 화면의 활동 버튼을 눌러 영상·게임을 고르세요.').replace('스페이스바를 꾹 누르거나(모바일은 공부하는 척 버튼) 공부하는 척하세요.', '공부하는 척 버튼을 꾹 눌러 공부하는 척하세요.').replace('스페이스바를 꾹 눌러(모바일은 버튼) 수업 자료 창으로 전환하세요.', '공부하는 척 버튼을 꾹 눌러 수업 자료 창으로 전환하세요.') : t;
  };
  const showTutorialStep = (): void => {
    const tip = $('[data-tip]'); tip.hidden = false; root.classList.add('tipping'); $('[data-tip-step]').textContent = `안내 ${tutStep + 1}/${tutorialSteps.length}`; const step = tutorialSteps[tutStep]; $('[data-tip-text]').textContent = tipText(step); tutTime = 0; tutWall = 0;
  };
  const refreshTitle = (): void => {
    root.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(b => { const on = b.dataset.stage === stage; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b => { const on = Number(b.dataset.level) === level; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const best = readSlackRecord().best;
    root.querySelectorAll<HTMLElement>('[data-rec]').forEach(e => { const r = best[e.dataset.rec as StageId]; e.textContent = r ? `최고 ${r.grade}등급 · ${r.score}점` : '아직 기록 없음'; });
    $('[data-leveldesc]').textContent = levelInfo[level];
    $('[data-key-cover]').innerHTML = stage === 'class' ? '<kbd>Space</kbd> 누르는 동안 수업 자료 창으로 전환' : '<kbd>Space</kbd> 누르는 동안 공부하는 척';
    $('[data-key-pick]').innerHTML = stage === 'class' ? '<kbd>1</kbd> 영상 · <kbd>2</kbd> 게임' : '<kbd>1</kbd>~<kbd>6</kbd> 딴짓 고르기';
    root.querySelectorAll<HTMLElement>('[data-sound]').forEach(b => { b.textContent = muted ? '소리 꺼짐' : '소리 켜짐'; b.setAttribute('aria-pressed', String(!muted)); });
  };
  const clearView = (): void => { view?.dispose(); view?.el.remove(); view = null; sim = null; };
  const exit = (): void => { if (closed) return; closed = true; cancelAnimationFrame(raf); root.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); clearView(); audio.dispose(); root.remove(); onExit(); };
  const pause = (): void => { if (state === 'play') {
      state = 'paused'; root.classList.remove('sl-danger'); $('[data-paused]').hidden = false; audio.ambience(null); audio.hold(true);
      $('[data-resume]').focus();
      $('.sl-view').inert = true; $('.sl-hud').inert = true; $('[data-tip]').inert = true;
      root.classList.add('sl-paused');
      if (sim) { const s = sim.state; $('[data-pause-stats]').innerHTML = `<li>${stageInfo[stage].name}</li><li>재미 <b>${Math.round(s.fun)}</b> / ${Math.round(s.goal)}</li><li>들킴 <b>${s.strikes}</b> / 3</li>`; }
    } else if (state === 'paused' && !document.hidden) { state = 'play'; $('[data-paused]').hidden = true; enablePlay(); audio.hold(false); audio.resume(); audio.ambience(stage); } };
  const keydown = (e: KeyboardEvent): void => { if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Escape' || e.key.toLowerCase() === 'p')) { if (state === 'play' || state === 'paused') { e.preventDefault(); pause(); } } };
  const visibility = (): void => { if (document.hidden && state === 'play') pause(); };
  const enablePlay = (): void => {
    $('.sl-view').inert = false; $('.sl-hud').inert = false; $('[data-tip]').inert = false;
    root.classList.remove('sl-paused');
    view?.el.focus({ preventScroll: true });
    last = performance.now(); scheduleFrame();
  };
  const start = async (): Promise<void> => {
    if (closed || state === 'loading' || state === 'play') return;
    const restarting = state !== 'title';
    state = 'loading'; root.classList.remove('sl-danger'); clearView();
    if (restarting) { audio.dispose(); audio = createSlackAudio(); audio.setMuted(muted); }
    audio.hold(false); audio.resume();
    $('.sl-hud').hidden = true; $('.sl-toast').textContent = ''; toastTime = 0;
    $('[data-title]').hidden = true; $('[data-result]').hidden = true; $('[data-paused]').hidden = true; $('[data-tip]').hidden = true; root.classList.remove('tipping');
    try {
      const createView = stage === 'class' ? (await import('./classroom')).createClassroomView : (await import('./computer')).createComputerView;
      if (closed) return; sim = createSim(stage, Math.floor(Math.random() * 2147483647), level); view = createView(sim, audio); $('.sl-view').append(view.el); sim.start(); view.frame(0); state = 'play'; $('.sl-hud').hidden = false; $('[data-battery-chip]').style.display = stage === 'class' ? 'none' : ''; audio.ambience(stage);
      audio.muffle(false); tally = { act: {}, maxCombo: 1, maxSus: 0, warns: 0, reasons: [] }; beat = 0;
      if (tutorial) { tutStep = 0; showTutorialStep(); } else { $('[data-tip]').hidden = true; root.classList.remove('tipping'); }
      enablePlay();
      if (document.hidden) pause();
    } catch (err) {
      console.error(err); clearView(); audio.dispose(); audio = createSlackAudio(); audio.setMuted(muted); $('.sl-hud').hidden = true;
      state = 'title'; $('[data-title]').hidden = false; $('[data-start]').focus(); toast('화면을 불러오지 못했어요. 다시 시도해 주세요.');
    }
  };
  const finish = (): void => {
    if (!sim) return; const s = sim.state, caught = s.phase === 'caught'; state = 'result'; root.classList.remove('sl-danger'); audio.ambience(null); audio.muffle(false); const grade = s.grade ?? 'D';
    const prev = readSlackRecord().best[stage], isNew = recordSlackRun(stage, s.score, grade);
    if (tutorial) endTutorial(); $('[data-tip]').hidden = true; root.classList.remove('tipping');
    const gradeEl = $('[data-grade]'); gradeEl.textContent = grade; gradeEl.className = `sl-grade g-${grade}`;
    $('[data-result-kicker]').textContent = `${stageInfo[stage].name} · ${['느긋하게', '보통', '아슬아슬'][level - 1]}`;
    $('[data-result-title]').textContent = caught ? '들켰어요!' : grade === 'S' ? '완벽한 딴짓!' : s.fun >= s.goal ? '자습 끝, 무사히 넘겼어요' : '자습 끝, 조금 아쉬워요';
    const reason = $('[data-reason]'); reason.className = 'sl-reason';
    if (caught) { reason.classList.add('bad'); reason.textContent = `적발 사유: ${s.caughtBy ?? '들킴'}`; }
    else if (s.strikes > 0) reason.textContent = `${s.strikes}번 들켰지만 끝까지 버텼어요. (${tally.reasons.join(', ')})`;
    else reason.textContent = s.fun >= s.goal ? '한 번도 들키지 않았어요!' : `재미 목표까지 ${Math.ceil(s.goal - s.fun)} 모자랐어요.`;
    if (caught && tally.reasons.length > 1) reason.textContent += ` · 앞선 적발: ${tally.reasons.slice(0, -1).join(', ')}`;
    $('[data-stats]').innerHTML = `<div><b>${Math.round(s.score)}</b><span>점수</span></div><div><b>${Math.round(s.fun)} / ${Math.round(s.goal)}</b><span>재미 / 목표</span></div><div><b>${Math.round(s.study)}</b><span>공부 진도</span></div><div><b>${s.strikes}회</b><span>적발</span></div>`;
    const top = (Object.entries(tally.act) as [ActivityId, number][]).sort((a, b) => b[1] - a[1])[0];
    const hl: string[] = [];
    if (top) hl.push(`가장 즐긴 딴짓 <b>${activityName[top[0]]}</b> ${Math.round(top[1])}초`);
    hl.push(`최고 연속 <b>${tally.maxCombo}배</b>`, `가장 아슬아슬했던 긴장 <b>${Math.round(tally.maxSus)}%</b>`);
    if (tally.warns > 0) hl.push(`친구의 경고 <b>${tally.warns}번</b>`);
    $('[data-highlights]').innerHTML = hl.map(t => `<li>${t}</li>`).join('');
    const best = isNew ? { grade, score: Math.round(s.score) } : prev;
    const record = $('[data-record]');
    record.textContent = best ? `이 장소 최고 기록 · ${best.grade}등급 ${best.score}점` : '이번 판은 기록되지 않았어요.';
    if (isNew) {
      const badge = document.createElement('span'); badge.className = 'sl-new';
      badge.textContent = prev ? '신기록!' : '첫 기록!'; record.append(badge);
    }
    $('[data-next]').textContent = `다음 장소 · ${stageInfo[stage === 'class' ? 'dorm' : 'class'].name}`;
    $('.sl-hud').hidden = true; $('[data-result]').hidden = false; $('[data-retry]').focus();
    view?.dispose(); $('.sl-view').inert = true; root.classList.add('sl-paused');
    $('.sl-toast').textContent = ''; toastTime = 0;
    if (caught) audio.play('caught'); else if (s.fun >= s.goal) audio.play('win');
    refreshTitle();
  };
  function scheduleFrame(): void {
    if (!closed && !raf && (state === 'play' || toastTime > 0)) raf = requestAnimationFrame(frame);
  }
  const frame = (now: number): void => {
    raf = 0;
    if (closed) return;
    // Avoid simulating a large backlog after a stalled frame or tab throttling.
    // The simulation still advances in small deterministic steps internally.
    const dt = Math.max(0, Math.min(1, (now - last) / 1000)); last = Math.max(now, last);
    if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) $('.sl-toast').textContent = ''; }
    if (state !== 'play' || !sim || !view) { scheduleFrame(); return; }
    const before = sim.state.time;
    const activity = sim.state.cover ? null : sim.state.activity;
    sim.update(dt);
    const elapsed = sim.state.time - before;
    // 모르는 이벤트(다른 담당이 추가)는 view 에만 넘기고 여기선 무시한다.
    for (const ev of sim.drain()) {
      view.onEvent(ev);
      if (ev.t === 'strike') { audio.play('alert'); toast(`들켰어요! ${ev.reason}`); tally.reasons.push(ev.reason); tally.maxSus = 100; }
      else if (ev.t === 'toast') toast(ev.text);
      else if (ev.t === 'friend-warn') tally.warns++;
    }
    view.frame(elapsed);
    { const a = sim.state; if (activity) tally.act[activity] = (tally.act[activity] ?? 0) + elapsed; tally.maxCombo = Math.max(tally.maxCombo, a.combo); tally.maxSus = Math.max(tally.maxSus, a.sus); }
    if (tutorial) { tutTime += elapsed; tutWall += dt; const isLast = tutStep === tutorialSteps.length - 1; if (tutorialSteps[tutStep].done(sim.state, tutTime) || tutWall > (isLast ? 9 : 40)) { if (++tutStep >= tutorialSteps.length) endTutorial(); else showTutorialStep(); } }
    const s = sim.state, left = Math.max(0, Math.ceil(s.limit - s.time)); $('[data-time]').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    $('[data-fun]').textContent = `${Math.round(s.fun)} / ${Math.round(s.goal)}`; $('[data-fun-bar]').style.width = `${Math.min(100, s.fun)}%`; $('[data-goal]').style.left = `${Math.min(100, s.goal)}%`;
    $('[data-strikes]').textContent = String(s.strikes); strikePips.forEach((p, i) => p.classList.toggle('on', i < s.strikes));
    $('[data-battery]').textContent = String(Math.round(s.battery)); $('[data-battery-chip]').classList.toggle('low', s.battery < 25); $('[data-combo]').textContent = String(s.combo);
    $('[data-risk]').style.width = `${Math.max(0, Math.min(100, s.sus))}%`; $('[data-risk-chip]').classList.toggle('hot', s.sus > 70);
    // 긴장도 → 비네팅·심장 박동 연동: 45 부터 박동이 시작해 100 에서 0.5초 간격·큰 소리. 박동 간격과 붉은 화면 맥박 속도를 같이 맞춘다.
    const tension = Math.max(0, Math.min(1, (s.sus - 45) / 55)), interval = 1.15 - tension * 0.65;
    root.classList.toggle('sl-danger', s.sus > 45);
    root.style.setProperty('--danger', String(Math.max(0, (s.sus - 25) / 75))); root.style.setProperty('--pulse-speed', `${s.sus > 45 ? interval : 1.4}s`);
    beat -= dt; if (s.sus > 45 && beat <= 0) { audio.play('hum', 0.3 + tension * 0.7); beat = interval; }
    if (s.phase === 'caught' || s.phase === 'done') finish();
    scheduleFrame();
  };
  root.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(b => b.onclick = () => { stage = b.dataset.stage as StageId; refreshTitle(); });
  root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b => b.onclick = () => { level = Number(b.dataset.level) as Level; refreshTitle(); });
  $('[data-start]').onclick = () => { if (state === 'title') void start(); }; $('[data-retry]').onclick = () => { if (state === 'result') void start(); }; $('[data-next]').onclick = () => { if (state !== 'result') return; stage = stage === 'class' ? 'dorm' : 'class'; void start(); };
  $('[data-pause]').onclick = pause; $('[data-resume]').onclick = pause; $('[data-restart]').onclick = () => { void start(); }; $('[data-tip-skip]').onclick = endTutorial;
  root.querySelectorAll<HTMLElement>('[data-sound]').forEach(b => b.onclick = () => { muted = !muted; writeSound(!muted); audio.setMuted(muted); audio.resume(); refreshTitle(); });
  root.addEventListener('contextmenu', event => {
    if ((event.target as Element).closest('.sl-cover,.sc-cover-button,.gm canvas')) event.preventDefault();
  });
  root.querySelectorAll<HTMLElement>('[data-exit]').forEach(b => b.onclick = exit); root.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility);
  refreshTitle(); opts.loading?.close(); $('[data-start]').focus({ preventScroll: true });
}
