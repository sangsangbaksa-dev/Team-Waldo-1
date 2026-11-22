import '../shared/ui.css';
import './slack.css';
import { readPreferences } from '../prefs';
import type { LoadingScreen } from '../loading';
import { createSim } from './sim';
import { createSlackAudio } from './audio';
import { readSlackRecord, recordSlackRun } from './records';
import type { Level, Sim, StageId, StageView } from './types';

export function openSlack(onExit: () => void, opts: { loading?: LoadingScreen } = {}): void {
  const root = document.createElement('div'); root.className = 'sl-root';
  root.innerHTML = `<div class="sl-view"></div><div class="sl-vignette"></div>
  <div class="sl-hud" hidden><div class="sl-hudclock"><span>끝날 때까지</span><b data-time>02:30</b></div><div class="sl-fun"><div><b>재미</b><span data-fun></span></div><div class="sl-track"><i data-fun-bar></i><em data-goal></em></div></div><div class="sl-numbers"><span>들킴 <b data-strikes>0</b>/3</span><span>배터리 <b data-battery>100</b>%</span><span>연속 <b data-combo>1</b>배</span><span class="sl-risk">긴장 <i><em data-risk></em></i></span></div><div class="sl-tools"><button data-sound>소리 켜짐</button><button data-pause>일시정지</button></div></div><div class="sl-toast" role="status"></div>
  <div class="sl-modal wd-screen" data-title><div class="sl-card wd-panel"><div class="sl-kicker">오늘도 무사히</div><h1>SLACK OFF <small>딴짓</small></h1><p class="sl-lead">조용한 밤, 눈치를 살피며 나만의 시간을 즐겨 보세요.</p><div class="sl-field"><b>장소</b><div class="sl-options" data-stages><button data-stage="class">교실 저녁 자습</button><button data-stage="dorm">기숙사 컴퓨터실</button></div></div><div class="sl-field"><b>난이도</b><div class="sl-options" data-levels><button data-level="1">느긋하게</button><button data-level="2">보통</button><button data-level="3">아슬아슬</button></div></div><div class="sl-record" data-record></div><p class="sl-help">딴짓을 골라 재미를 채우세요. 발소리와 문을 살피고 스페이스바 또는 화면의 버튼을 누르는 동안 공부하는 척하세요. 숫자 키로 활동을 고르고 P 또는 Esc로 일시정지합니다.</p><div class="sl-actions"><button class="wd-btn primary" data-start>시작하기</button><button class="wd-btn ghost" data-exit>게임 목록으로</button></div></div></div>
  <div class="sl-modal wd-screen" data-paused hidden><div class="sl-card wd-panel"><div class="sl-kicker">잠깐 쉬어 가요</div><h2>일시정지</h2><div class="sl-actions"><button class="wd-btn primary" data-resume>계속하기</button><button class="wd-btn ghost" data-exit>게임 목록으로</button></div></div></div>
  <div class="sl-modal wd-screen" data-result hidden><div class="sl-card wd-panel"><div class="sl-kicker">오늘의 기록</div><h2 data-result-title></h2><div class="sl-result-stats" data-stats></div><div class="sl-actions"><button class="wd-btn primary" data-retry>다시 하기</button><button class="wd-btn" data-next>다음 장소</button><button class="wd-btn ghost" data-exit>게임 목록으로</button></div></div></div>`;
  document.body.append(root); const $ = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const audio = createSlackAudio(); let muted = !readPreferences().sound; audio.setMuted(muted);
  let stage: StageId = 'class', level: Level = 2, sim: Sim | null = null, view: StageView | null = null;
  let state: 'title' | 'loading' | 'play' | 'paused' | 'result' = 'title', closed = false, raf = 0, last = performance.now(), toastTime = 0, beat = 0, first = true;
  const toast = (message: string, duration = 3): void => { $('[role="status"]').textContent = message; toastTime = duration; };
  const refreshTitle = (): void => {
    root.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(b => { const on = b.dataset.stage === stage; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b => { const on = Number(b.dataset.level) === level; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const rec = readSlackRecord().best[stage]; $('[data-record]').textContent = rec ? `이 장소 최고 기록 · ${rec.grade}등급 ${rec.score}점` : '아직 이 장소의 기록이 없어요.';
    $('[data-sound]').textContent = muted ? '소리 꺼짐' : '소리 켜짐';
  };
  const exit = (): void => { if (closed) return; closed = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); view?.dispose(); audio.dispose(); root.remove(); onExit(); };
  const pause = (): void => { if (state === 'play') { state = 'paused'; $('[data-paused]').hidden = false; audio.ambience(null); } else if (state === 'paused') { state = 'play'; $('[data-paused]').hidden = true; last = performance.now(); audio.resume(); audio.ambience(stage); } };
  const keydown = (e: KeyboardEvent): void => { if (state === 'paused' && e.key !== 'Escape' && e.key.toLowerCase() !== 'p') { e.stopImmediatePropagation(); return; } if (!e.repeat && (e.key === 'Escape' || e.key.toLowerCase() === 'p')) { if (state === 'play' || state === 'paused') { e.preventDefault(); pause(); } } };
  const visibility = (): void => { if (document.hidden && state === 'play') pause(); };
  const start = async (): Promise<void> => {
    if (state === 'loading') return; state = 'loading'; audio.resume(); view?.dispose(); view?.el.remove(); view = null;
    $('[data-title]').hidden = true; $('[data-result]').hidden = true; $('[data-paused]').hidden = true;
    try {
      const createView = stage === 'class' ? (await import('./classroom')).createClassroomView : (await import('./computer')).createComputerView;
      if (closed) return; sim = createSim(stage, Math.floor(Math.random() * 2147483647), level); view = createView(sim, audio); $('.sl-view').append(view.el); sim.start(); view.frame(0); state = 'play'; last = performance.now(); beat = 0; $('.sl-hud').hidden = false; audio.ambience(stage);
      if (first) { toast('발소리가 가까워지면 공부하는 척하세요!', 6); first = false; }
    } catch (err) { console.error(err); state = 'title'; $('[data-title]').hidden = false; toast('화면을 불러오지 못했어요. 다시 시도해 주세요.'); }
  };
  const finish = (): void => {
    if (!sim) return; const s = sim.state; state = 'result'; audio.ambience(null); audio.muffle(false); const grade = s.grade ?? 'D'; recordSlackRun(stage, s.score, grade);
    $('[data-result-title]').textContent = s.phase === 'caught' ? `들켰어요 · ${grade}등급` : `자습 끝! · ${grade}등급`;
    $('[data-stats]').innerHTML = `<div><b>${Math.round(s.score)}</b><span>점수</span></div><div><b>${Math.round(s.fun)} / ${Math.round(s.goal)}</b><span>재미 / 목표</span></div><div><b>${Math.round(s.study)}</b><span>공부</span></div><div><b>${s.strikes}회</b><span>적발</span></div>`;
    $('.sl-hud').hidden = true; $('[data-result]').hidden = false; audio.play(s.phase === 'caught' ? 'caught' : 'win'); refreshTitle();
  };
  const frame = (now: number): void => {
    if (closed) return; raf = requestAnimationFrame(frame); const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) $('[role="status"]').textContent = ''; }
    if (state !== 'play' || !sim || !view) return;
    sim.update(dt); view.frame(dt); for (const ev of sim.drain()) { view.onEvent(ev); if (ev.t === 'strike') { audio.play('alert'); toast(`들켰어요! ${ev.reason}`); } else if (ev.t === 'toast') toast(ev.text); }
    const s = sim.state, left = Math.max(0, Math.ceil(s.limit - s.time)); $('[data-time]').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    $('[data-fun]').textContent = `${Math.round(s.fun)} / ${Math.round(s.goal)}`; $('[data-fun-bar]').style.width = `${Math.min(100, s.fun)}%`; $('[data-goal]').style.left = `${Math.min(100, s.goal)}%`;
    $('[data-strikes]').textContent = String(s.strikes); $('[data-battery]').textContent = String(Math.round(s.battery)); $('[data-combo]').textContent = String(s.combo); $('[data-risk]').style.width = `${Math.max(0, Math.min(100, s.sus))}%`;
    root.style.setProperty('--danger', String(Math.max(0, (s.sus - 25) / 75))); root.style.setProperty('--pulse-speed', `${1.4 - s.sus / 110}s`);
    beat -= dt; if (s.sus > 45 && beat <= 0) { audio.play('hum', .15 + s.sus / 180); beat = 1.4 - s.sus / 110; }
    if (s.phase === 'caught' || s.phase === 'done') finish();
  };
  root.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(b => b.onclick = () => { stage = b.dataset.stage as StageId; refreshTitle(); });
  root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b => b.onclick = () => { level = Number(b.dataset.level) as Level; refreshTitle(); });
  $('[data-start]').onclick = () => { void start(); }; $('[data-retry]').onclick = () => { void start(); }; $('[data-next]').onclick = () => { stage = stage === 'class' ? 'dorm' : 'class'; void start(); };
  $('[data-pause]').onclick = pause; $('[data-resume]').onclick = pause; $('[data-sound]').onclick = () => { muted = !muted; audio.setMuted(muted); audio.resume(); refreshTitle(); };
  root.querySelectorAll<HTMLElement>('[data-exit]').forEach(b => b.onclick = exit); window.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility);
  refreshTitle(); opts.loading?.close(); raf = requestAnimationFrame(frame);
}
