import './style.css';
import './battle/war.css';
import { loadWar } from './battle/save';
import { DIFFICULTIES, difficultyDescription, stormStartFor, type Difficulty } from './battle/war';
import { readPreferences, writePreferences, readCareer } from './battle/preferences';
import { icon } from './ui/icons';
import { showDialog } from './ui/dialog';

const app = document.querySelector<HTMLDivElement>('#game')!;
let disposePreview: (() => void) | undefined;
let generation = 0;
let selectedDifficulty: Difficulty = 'normal';
const stormTime = (difficulty: Difficulty) => clock(stormStartFor({ difficulty, grandBattle: true }));
const clock = (time: number) => `${Math.floor(time / 60)}분 ${Math.floor(time % 60)}초`;

function renderMenu(): void {
  generation++; const currentGeneration = generation; disposePreview?.(); disposePreview = undefined;
  const saved = loadWar();
  const activeSave = saved && saved.factions[0].alive && !saved.over;
  const resumable = activeSave && saved.grandBattle === true;
  const career = readCareer();
  let launching = false;
  app.hidden = false;
  app.innerHTML = `
    <main class="landing" data-release="kingdoms-1.0">
      <div class="landing-grain" aria-hidden="true"></div>
      <header class="site-header">
        <a class="wordmark" href="#" aria-label="Waldo 왕국 전쟁 홈"><span class="brand-seal">${icon('crown', 24)}</span><span>WALDO<small>KINGDOMS AT WAR</small></span></a>
        <nav class="header-nav" aria-label="메뉴"><span class="offline-status"><i></i>싱글플레이 · AI 대전</span><button id="guide" class="nav-button">플레이 가이드 ${icon('help', 16)}</button><button id="preferences" class="icon-button" aria-label="게임 설정">${icon('settings', 20)}</button></nav>
      </header>
      <div class="command-layout">
        <section class="hero-content" aria-labelledby="hero-title">
          <div class="edition"><span></span>GRAND CAMPAIGN <b>01 / 04</b></div>
          <h1 id="hero-title">백 명의 군단,<br><em>하나의 왕국.</em></h1>
          <p class="hero-description">다섯 배의 적을 넘어, 마지막 왕국으로.<br>부대를 편성하고 아홉 거점을 정복하는 3D 전략 전쟁.</p>
          <div class="campaign-strength" aria-label="시작 병력: 아군 100명, 적군 500명"><div><span>YOUR LEGION</span><b>100<small>명</small></b></div><span class="versus">VS</span><div><span>RIVAL KINGDOMS</span><b>500<small>명</small></b></div><span class="strength-mark" aria-hidden="true">${icon('sword', 32)}</span></div>
          <section class="start-section" aria-label="군단전 시작">
            <div class="section-heading"><h2>작전 난이도</h2><span>당신의 전략에 맞는 도전</span></div>
            <div class="difficulty-picker" role="group" aria-label="작전 난이도">${(['easy', 'normal', 'hard'] as Difficulty[]).map((key, i) => `<button id="difficulty-${key}" data-difficulty="${key}" class="difficulty-option${key === selectedDifficulty ? ' selected' : ''}" aria-pressed="${key === selectedDifficulty}"><span>0${i + 1}</span><b>${DIFFICULTIES[key].label}</b><small>${['차근차근 지휘하기', '균형 잡힌 도전', '한계를 시험하기'][i]}</small></button>`).join('')}</div>
            <p id="difficulty-description" class="difficulty-description" aria-live="polite">${difficultyDescription(selectedDifficulty, true)}</p>
            <div class="launch-actions">${resumable ? `<button id="continue-war" class="button primary continue-button">${icon('play', 20)}<span>전장으로 복귀<small>${DIFFICULTIES[saved.difficulty].label} · ${clock(saved.time)}</small></span>${icon('arrow', 20)}</button>` : ''}<button id="start-grand" class="button ${resumable ? 'secondary' : 'primary'} launch-button" aria-label="대규모 전쟁 시작, 아군 100명 대 적군 500명">${icon('sword', 20)}<span>새 군단전 시작</span>${icon('arrow', 20)}</button></div>
            ${activeSave && !resumable ? '<p class="save-notice">소규모 원정은 종료되었습니다. 새 군단전에서 지휘를 시작하세요.</p>' : ''}
            <p class="play-note">${icon('save', 13)}15초마다 자동 저장<span>·</span>설치 없이 바로 플레이</p>
          </section>
        </section>
        <section class="campaign-visual" aria-label="3D 전장 미리보기">
          <div class="visual-heading"><span><i class="live-dot"></i>THE EMERALD KINGDOM</span><span>SECTOR 01 — NW</span></div>
          <div class="landing-art"><img src="${import.meta.env.BASE_URL}kingdom-art.svg" alt="" class="kingdom-illustration"><div class="landing-preview" id="landing-preview" aria-hidden="true"></div><div class="art-vignette"></div><div class="preview-reticle" aria-hidden="true"></div><div class="art-coordinates"><span>당신의 첫 번째 명령을 기다립니다.</span><small>실제 게임 엔진으로 렌더링한 영지</small></div></div>
          <div class="visual-caption"><span>${icon('flag', 15)}북서부 영지 · 에메랄드 왕국</span><span>3D REAL-TIME STRATEGY</span></div>
          <div class="campaign-features"><article><span>01 / BUILD</span><h2>${icon('tower', 18)}영지를 키우다</h2><p>시설 건설과 연구로<br>전쟁의 기반을 만드세요.</p></article><article><span>02 / COMMAND</span><h2>${icon('army', 18)}군단을 지휘하다</h2><p>네 병종, 세 부대.<br>전선을 직접 설계하세요.</p></article><article><span>03 / CONQUER</span><h2>${icon('flag', 18)}전장을 정복하다</h2><p>아홉 거점을 확보하고<br>세 왕국을 넘어서세요.</p></article></div>
        </section>
      </div>
      <footer class="landing-footer"><span class="footer-credit">TEAM WALDO <i>/</i> GRAND CAMPAIGN</span><div class="career-inline">${career.matches ? `<span>완료한 전투 <b>${career.matches}</b></span><span>승리 <b>${career.wins}</b></span><span>최다 처치 <b>${career.bestKills}</b></span>` : '<span>모든 위대한 왕국은 하나의 명령에서 시작됩니다.</span>'}</div><span class="footer-local">${icon('shield', 13)}진행 기록은 이 브라우저에 보관됩니다</span></footer>
    </main>`;
  document.title = 'WALDO · 군단 전쟁 | 백 명의 군단, 하나의 왕국';
  const start = async (resume: boolean) => {
    if (launching) return; launching = true;
    const navigation = ++generation; disposePreview?.(); disposePreview = undefined;
    const button = app.querySelector<HTMLButtonElement>(resume ? '#continue-war' : '#start-grand')!;
    app.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
    button.textContent = '전장 준비 중…';
    try {
      const { openWar } = await import('./battle/view');
      if (generation !== navigation) return;
      app.hidden = true;
      openWar(renderMenu, { forceNew: !resume, difficulty: resume && saved ? saved.difficulty : selectedDifficulty });
    } catch {
      renderMenu();
      showDialog({ title: '전장을 불러오지 못했어요', body: '<p>네트워크 연결을 확인한 뒤 다시 시작해 주세요. 저장한 전투는 변경되지 않았습니다.</p>' });
    }
  };
  const launchNew = () => {
    if (activeSave) showDialog({ eyebrow: 'NEW CAMPAIGN', title: '새 군단전을 시작할까요?', body: '<p>새 전투가 자동 저장되면 이전 전투의 저장 내용을 덮어씁니다.</p>', confirm: '새 군단전 시작', cancel: '돌아가기', onConfirm: () => { void start(false); } });
    else void start(false);
  };
  app.querySelector<HTMLButtonElement>('#start-grand')!.onclick = launchNew;
  app.querySelector<HTMLButtonElement>('#continue-war')?.addEventListener('click', () => { void start(true); });
  app.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => {
    button.onclick = () => {
      selectedDifficulty = button.dataset.difficulty as Difficulty;
      app.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => { const selected = b === button; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
      app.querySelector('#difficulty-description')!.textContent = difficultyDescription(selectedDifficulty, true);
    };
  });
  app.querySelector<HTMLButtonElement>('#guide')!.onclick = () => showDialog({ eyebrow: 'FIELD GUIDE', title: '첫 군단전을 위한 작전 브리핑', body: `<div class="guide-steps"><article><span>01</span><div><b>먼저, 튼튼한 경제를.</b><p>아군 100명과 Lv.3 시설로 시작합니다. 성장 정책으로 생산을 늘리고 병력과 연구에 투자하세요.</p></div></article><article><span>02</span><div><b>가까운 거점에 깃발을.</b><p>작전 탭에서 북서부 관문을 선택해 출전하세요. 거점마다 자원 보너스가 다르고, 본부 폭풍 피해도 줄어듭니다.</p></div></article><article><span>03</span><div><b>서로 다른 병종을 조합하세요.</b><p>처음부터 네 병종을 훈련할 수 있습니다. 작전 탭에서 기동대에 25명을 편성하고, 주력군과 나누어 지휘하세요.</p></div></article><article><span>04</span><div><b>폭풍보다 빠르게 정복하세요.</b><p>입문은 ${stormTime('easy')}, 보통은 ${stormTime('normal')}, 도전은 ${stormTime('hard')}부터 안전지대가 줄어듭니다. 모든 적 본부를 함락하고 마지막 생존 왕국이 되세요.</p></div></article></div><p class="dialog-tip">온라인 멀티플레이가 아닌 1명 대 AI 3개 세력의 실시간 전략 게임입니다. 저장 내용은 현재 브라우저와 사이트 주소에만 보관됩니다.</p>`, cancel: '이제 시작해 볼게요' });
  app.querySelector<HTMLButtonElement>('#preferences')!.onclick = () => {
    const p = readPreferences();
    showDialog({ eyebrow: 'PREFERENCES', title: '나에게 맞는 전장', body: '<div class="settings-grid"><label>그래픽 품질<select id="menu-quality"><option value="high">높음 · 그림자와 효과</option><option value="standard">보통 · 성능 우선</option><option value="low">낮음 · 저사양 기기</option></select></label><label>효과음<input id="menu-sound" type="checkbox"></label><label>움직임 줄이기<input id="menu-motion" type="checkbox"></label></div><p class="dialog-tip">게임에는 WebGL을 지원하는 브라우저가 필요합니다. 모바일에서는 가로 화면을 권장합니다.</p>', cancel: '설정 완료' });
    const quality = document.querySelector<HTMLSelectElement>('#menu-quality')!, sound = document.querySelector<HTMLInputElement>('#menu-sound')!, motion = document.querySelector<HTMLInputElement>('#menu-motion')!;
    quality.value = p.quality; sound.checked = p.sound; motion.checked = p.reducedMotion;
    const update = () => { p.quality = quality.value === 'high' ? 'high' : quality.value === 'low' ? 'low' : 'standard'; p.sound = sound.checked; p.reducedMotion = motion.checked; writePreferences(p); };
    quality.onchange = update; sound.onchange = update; motion.onchange = update;
  };
  // The menu is fully useful before the optional decorative 3D chunk loads.
  void import('./battle/preview').then(({ createLandingPreview }) => {
    const mount = app.querySelector<HTMLElement>('#landing-preview');
    if (generation === currentGeneration && mount?.isConnected) disposePreview = createLandingPreview(mount);
  }).catch(() => undefined);
}
renderMenu();
